import { getDb } from '../db';
import { schoolClassEnrollments, schoolClasses, schoolStudents, children, users, schools, type ClassSchedule } from '@shared/schema';
import { eq, and, sql, lt, isNull, or } from 'drizzle-orm';
import { sendBulkEnrollmentReminderEmail } from './emailService';

interface PendingEnrollmentWithDetails {
  enrollmentId: number;
  childId: number;
  childName: string;
  className: string;
  classSchedule: string | null;
  amount: number;
  parentId: number;
  parentName: string;
  parentEmail: string;
  schoolId: number;
  schoolName: string;
  schoolLogo: string | null;
  lastReminderSentAt: Date | null;
  reminderCount: number;
}

const REMINDER_INTERVAL_HOURS = 72; // Send reminder every 3 days
const MAX_REMINDERS = 5; // Maximum reminders per enrollment

function extractPriceFromSchedule(schedule: unknown): number {
  if (!schedule) return 0;
  
  try {
    const scheduleData = typeof schedule === 'string' 
      ? JSON.parse(schedule) as ClassSchedule
      : schedule as ClassSchedule;
    
    if (scheduleData.variants && scheduleData.variants.length > 0) {
      return scheduleData.variants[0].price || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function getPendingPaymentEnrollments(): Promise<PendingEnrollmentWithDetails[]> {
  try {
    const db = await getDb();
    
    const results = await db
      .select({
        enrollmentId: schoolClassEnrollments.id,
        studentId: schoolStudents.id,
        childId: children.id,
        childFirstName: children.firstName,
        childLastName: children.lastName,
        className: schoolClasses.title,
        classSchedule: schoolClasses.schedule,
        parentId: users.id,
        parentFirstName: users.firstName,
        parentLastName: users.lastName,
        parentEmail: users.email,
        schoolId: schools.id,
        schoolName: schools.name,
        schoolLogo: schools.logo,
        lastReminderSentAt: schoolClassEnrollments.lastReminderSentAt,
        reminderCount: schoolClassEnrollments.reminderCount,
      })
      .from(schoolClassEnrollments)
      .innerJoin(schoolClasses, eq(schoolClassEnrollments.classId, schoolClasses.id))
      .innerJoin(schoolStudents, eq(schoolClassEnrollments.studentId, schoolStudents.id))
      .innerJoin(children, eq(schoolStudents.childId, children.id))
      .innerJoin(users, eq(children.parentId, users.id))
      .innerJoin(schools, eq(schoolClasses.schoolId, schools.id))
      .where(eq(schoolClassEnrollments.status, 'pending_payment'));

    return results.map((r: Record<string, any>) => ({
      enrollmentId: r.enrollmentId as number,
      childId: r.childId as number,
      childName: `${r.childFirstName} ${r.childLastName}`,
      className: r.className as string,
      classSchedule: typeof r.classSchedule === 'object' ? JSON.stringify(r.classSchedule) : null,
      amount: extractPriceFromSchedule(r.classSchedule),
      parentId: r.parentId as number,
      parentName: `${r.parentFirstName || ''} ${r.parentLastName || ''}`.trim() || 'Parent',
      parentEmail: (r.parentEmail as string) || '',
      schoolId: r.schoolId as number,
      schoolName: (r.schoolName as string) || 'American Seekers Academy',
      schoolLogo: (r.schoolLogo as string) || null,
      lastReminderSentAt: r.lastReminderSentAt as Date | null,
      reminderCount: (r.reminderCount as number) || 0,
    }));
  } catch (error) {
    console.error('Error fetching pending payment enrollments:', error);
    return [];
  }
}

export function shouldSendReminder(enrollment: PendingEnrollmentWithDetails): boolean {
  // Don't send if max reminders reached
  if (enrollment.reminderCount >= MAX_REMINDERS) {
    return false;
  }

  // Send immediately if never sent before
  if (!enrollment.lastReminderSentAt) {
    return true;
  }

  // Check if enough time has passed since last reminder
  const hoursSinceLastReminder = (Date.now() - new Date(enrollment.lastReminderSentAt).getTime()) / (1000 * 60 * 60);
  return hoursSinceLastReminder >= REMINDER_INTERVAL_HOURS;
}

export async function updateReminderStatus(enrollmentIds: number[]): Promise<void> {
  try {
    const db = await getDb();
    
    for (const enrollmentId of enrollmentIds) {
      await db
        .update(schoolClassEnrollments)
        .set({
          lastReminderSentAt: new Date(),
          reminderCount: sql`COALESCE(${schoolClassEnrollments.reminderCount}, 0) + 1`,
        })
        .where(eq(schoolClassEnrollments.id, enrollmentId));
    }
    console.log(`✅ Updated reminder status for ${enrollmentIds.length} enrollments`);
  } catch (error) {
    console.error('Error updating reminder status:', error);
    throw error;
  }
}

export async function processEnrollmentReminders(): Promise<{ sent: number; skipped: number; errors: number }> {
  console.log('🔔 Starting enrollment reminder processing...');
  
  const stats = { sent: 0, skipped: 0, errors: 0 };
  
  try {
    const pendingEnrollments = await getPendingPaymentEnrollments();
    console.log(`📋 Found ${pendingEnrollments.length} pending payment enrollments`);

    if (pendingEnrollments.length === 0) {
      console.log('✅ No pending enrollments to remind about');
      return stats;
    }

    // Group enrollments by parent
    const enrollmentsByParent = new Map<number, PendingEnrollmentWithDetails[]>();
    for (const enrollment of pendingEnrollments) {
      if (!enrollment.parentEmail) {
        console.log(`⚠️ Skipping enrollment ${enrollment.enrollmentId}: No parent email`);
        stats.skipped++;
        continue;
      }

      if (!shouldSendReminder(enrollment)) {
        console.log(`⏭️ Skipping enrollment ${enrollment.enrollmentId}: Reminder already sent recently or max reached`);
        stats.skipped++;
        continue;
      }

      const existing = enrollmentsByParent.get(enrollment.parentId) || [];
      existing.push(enrollment);
      enrollmentsByParent.set(enrollment.parentId, existing);
    }

    // Send grouped emails to each parent
    for (const [parentId, enrollments] of enrollmentsByParent) {
      const parent = enrollments[0];
      
      try {
        const totalAmount = enrollments.reduce((sum, e) => sum + e.amount, 0);
        
        const success = await sendBulkEnrollmentReminderEmail({
          parentName: parent.parentName,
          parentEmail: parent.parentEmail,
          enrollments: enrollments.map(e => ({
            childName: e.childName,
            className: e.className,
            amount: e.amount,
            classSchedule: e.classSchedule || undefined,
          })),
          totalAmount,
          schoolName: parent.schoolName,
          schoolLogo: parent.schoolLogo || undefined,
        });

        if (success) {
          // Update reminder status for all enrollments we just reminded about
          await updateReminderStatus(enrollments.map(e => e.enrollmentId));
          stats.sent += enrollments.length;
          console.log(`✅ Sent reminder to ${parent.parentEmail} for ${enrollments.length} enrollment(s)`);
        } else {
          stats.errors += enrollments.length;
          console.error(`❌ Failed to send reminder to ${parent.parentEmail}`);
        }
      } catch (error) {
        stats.errors += enrollments.length;
        console.error(`❌ Error sending reminder to parent ${parentId}:`, error);
      }
    }

    console.log(`🔔 Reminder processing complete: ${stats.sent} sent, ${stats.skipped} skipped, ${stats.errors} errors`);
    return stats;
  } catch (error) {
    console.error('❌ Error in enrollment reminder processing:', error);
    throw error;
  }
}

// Scheduler to run daily
let reminderInterval: ReturnType<typeof setInterval> | null = null;

export function startEnrollmentReminderScheduler(): void {
  // Run immediately on startup (after a short delay to let the server initialize)
  setTimeout(() => {
    console.log('🚀 Running initial enrollment reminder check...');
    processEnrollmentReminders().catch(err => {
      console.error('Error in initial reminder processing:', err);
    });
  }, 30000); // 30 second delay

  // Then run every 6 hours
  const intervalHours = 6;
  reminderInterval = setInterval(() => {
    console.log('⏰ Running scheduled enrollment reminder check...');
    processEnrollmentReminders().catch(err => {
      console.error('Error in scheduled reminder processing:', err);
    });
  }, intervalHours * 60 * 60 * 1000);

  console.log(`✅ Enrollment reminder scheduler started (runs every ${intervalHours} hours)`);
}

export function stopEnrollmentReminderScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log('🛑 Enrollment reminder scheduler stopped');
  }
}
