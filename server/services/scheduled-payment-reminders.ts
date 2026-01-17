/**
 * Scheduled Payment Reminder Service
 * 
 * Sends automatic email reminders when scheduled payments are upcoming or overdue.
 * 
 * Reminder Schedule:
 * - 7 days before due date
 * - 3 days before due date
 * - 1 day before due date
 * - On due date (morning)
 * - 1 day overdue
 * - 7 days overdue (final notice)
 */

import { storage } from '../storage';
import { sendScheduledPaymentReminder, sendOverduePaymentNotice } from '../lib/email-service';

export interface ReminderResult {
  scheduledPaymentId: number;
  parentEmail: string;
  reminderType: 'upcoming' | 'due_today' | 'overdue';
  daysUntilDue: number;
  sent: boolean;
  error?: string;
}

// Days before/after due date to send reminders
const REMINDER_DAYS = {
  SEVEN_DAYS_BEFORE: 7,
  THREE_DAYS_BEFORE: 3,
  ONE_DAY_BEFORE: 1,
  DUE_TODAY: 0,
  ONE_DAY_OVERDUE: -1,
  SEVEN_DAYS_OVERDUE: -7
};

/**
 * Calculate days until a payment is due (negative if overdue)
 */
function daysUntilDue(dueDate: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffTime = due.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Determine if a reminder should be sent based on days until due and reminder count
 */
function shouldSendReminder(daysUntil: number, reminderCount: number): boolean {
  // Map days to expected reminder count to prevent duplicate sends
  const reminderSchedule: Record<number, number> = {
    7: 0,  // 7 days before = first reminder (count 0)
    3: 1,  // 3 days before = second reminder (count 1)
    1: 2,  // 1 day before = third reminder (count 2)
    0: 3,  // Due today = fourth reminder (count 3)
    [-1]: 4,  // 1 day overdue = fifth reminder (count 4)
    [-7]: 5   // 7 days overdue = final notice (count 5)
  };
  
  const expectedReminders = reminderSchedule[daysUntil];
  return expectedReminders !== undefined && reminderCount === expectedReminders;
}

/**
 * Get reminder message based on days until due
 */
function getReminderMessage(daysUntil: number, amount: number, childName: string, className: string): {
  subject: string;
  message: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
} {
  const formattedAmount = `$${(amount / 100).toFixed(2)}`;
  
  if (daysUntil >= 7) {
    return {
      subject: `Upcoming Payment Reminder - ${className}`,
      message: `Your payment of ${formattedAmount} for ${childName}'s enrollment in ${className} is due in 7 days.`,
      urgency: 'low'
    };
  } else if (daysUntil >= 3) {
    return {
      subject: `Payment Due Soon - ${className}`,
      message: `Your payment of ${formattedAmount} for ${childName}'s enrollment in ${className} is due in 3 days.`,
      urgency: 'medium'
    };
  } else if (daysUntil === 1) {
    return {
      subject: `Payment Due Tomorrow - ${className}`,
      message: `Your payment of ${formattedAmount} for ${childName}'s enrollment in ${className} is due tomorrow.`,
      urgency: 'medium'
    };
  } else if (daysUntil === 0) {
    return {
      subject: `Payment Due Today - ${className}`,
      message: `Your payment of ${formattedAmount} for ${childName}'s enrollment in ${className} is due today.`,
      urgency: 'high'
    };
  } else if (daysUntil === -1) {
    return {
      subject: `Payment Overdue - ${className}`,
      message: `Your payment of ${formattedAmount} for ${childName}'s enrollment in ${className} was due yesterday. Please make your payment as soon as possible.`,
      urgency: 'high'
    };
  } else {
    return {
      subject: `FINAL NOTICE: Payment Overdue - ${className}`,
      message: `Your payment of ${formattedAmount} for ${childName}'s enrollment in ${className} is ${Math.abs(daysUntil)} days overdue. Please make your payment immediately to avoid enrollment suspension.`,
      urgency: 'critical'
    };
  }
}

/**
 * Process and send reminders for all pending scheduled payments
 */
export async function processScheduledPaymentReminders(): Promise<ReminderResult[]> {
  console.log('📧 Processing scheduled payment reminders...');
  const results: ReminderResult[] = [];
  
  try {
    // Get all scheduled payments
    const allScheduledPayments = await storage.getAllScheduledPayments();
    
    // Filter to only pending payments
    const pendingPayments = allScheduledPayments.filter(p => 
      p.status === 'pending' || p.status === 'overdue'
    );
    
    console.log(`📋 Found ${pendingPayments.length} pending scheduled payments to check`);
    
    for (const payment of pendingPayments) {
      const daysUntil = daysUntilDue(new Date(payment.scheduledDate));
      const reminderCount = payment.reminderCount || 0;
      
      // Check if we should send a reminder
      if (!shouldSendReminder(daysUntil, reminderCount)) {
        continue;
      }
      
      // Get enrollment details for the reminder
      let childName = 'Student';
      let className = 'Class';
      let schoolName = 'School';
      
      if (payment.enrollmentId) {
        const enrollment = await storage.getEnrollmentById(payment.enrollmentId);
        if (enrollment) {
          childName = enrollment.childName || 'Student';
          className = enrollment.className || 'Class';
          
          // Get school name
          if (enrollment.schoolId) {
            const school = await storage.getSchool(enrollment.schoolId);
            if (school) {
              schoolName = school.name;
            }
          }
        }
      }
      
      const reminderInfo = getReminderMessage(daysUntil, payment.amount, childName, className);
      
      const result: ReminderResult = {
        scheduledPaymentId: payment.id,
        parentEmail: payment.parentEmail,
        reminderType: daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'due_today' : 'upcoming',
        daysUntilDue: daysUntil,
        sent: false
      };
      
      try {
        // Send the appropriate email
        if (daysUntil < 0) {
          await sendOverduePaymentNotice({
            parentEmail: payment.parentEmail,
            childName,
            className,
            schoolName,
            amount: payment.amount,
            daysOverdue: Math.abs(daysUntil),
            paymentId: payment.id,
            dueDate: new Date(payment.scheduledDate),
            installmentNumber: payment.installmentNumber,
            totalInstallments: payment.totalInstallments
          });
        } else {
          await sendScheduledPaymentReminder({
            parentEmail: payment.parentEmail,
            childName,
            className,
            schoolName,
            amount: payment.amount,
            dueDate: new Date(payment.scheduledDate),
            daysUntilDue: daysUntil,
            paymentId: payment.id,
            installmentNumber: payment.installmentNumber,
            totalInstallments: payment.totalInstallments,
            urgency: reminderInfo.urgency
          });
        }
        
        // Update reminder count
        await storage.updateScheduledPaymentReminderCount(payment.id, reminderCount + 1);
        
        // Mark as overdue if past due date
        if (daysUntil < 0 && payment.status !== 'overdue') {
          await storage.updateScheduledPaymentStatus(payment.id, 'overdue');
        }
        
        result.sent = true;
        console.log(`✅ Sent ${result.reminderType} reminder for payment ${payment.id} to ${payment.parentEmail}`);
        
        // Log the reminder to the database
        try {
          const enrollment = payment.enrollmentId ? await storage.getEnrollmentById(payment.enrollmentId) : null;
          const reminderTypeMap: Record<number, string> = {
            7: '7_days_before',
            3: '3_days_before',
            1: '1_day_before',
            0: 'due_today',
            [-1]: '1_day_overdue',
            [-7]: '7_days_overdue'
          };
          const reminderLogType = reminderTypeMap[daysUntil] || (daysUntil < 0 ? '7_days_overdue' : '7_days_before');
          
          await storage.createPaymentReminderLog({
            schoolId: enrollment?.schoolId || 1,
            scheduledPaymentId: payment.id,
            parentEmail: payment.parentEmail,
            parentName: null,
            childName,
            className,
            amountCents: payment.amount,
            reminderType: reminderLogType as any,
            status: 'sent',
            isManual: false,
            sentBy: null,
            errorMessage: null
          });
        } catch (logError) {
          console.error(`⚠️ Failed to log reminder for payment ${payment.id}:`, logError);
        }
        
      } catch (emailError) {
        result.error = emailError instanceof Error ? emailError.message : String(emailError);
        console.error(`❌ Failed to send reminder for payment ${payment.id}:`, result.error);
        
        // Log the failed reminder attempt
        try {
          const enrollment = payment.enrollmentId ? await storage.getEnrollmentById(payment.enrollmentId) : null;
          await storage.createPaymentReminderLog({
            schoolId: enrollment?.schoolId || 1,
            scheduledPaymentId: payment.id,
            parentEmail: payment.parentEmail,
            parentName: null,
            childName,
            className,
            amountCents: payment.amount,
            reminderType: daysUntil < 0 ? '1_day_overdue' : 'due_today',
            status: 'failed',
            isManual: false,
            sentBy: null,
            errorMessage: result.error || null
          });
        } catch (logError) {
          console.error(`⚠️ Failed to log failed reminder:`, logError);
        }
      }
      
      results.push(result);
    }
    
    console.log(`📧 Reminder processing complete: ${results.filter(r => r.sent).length} sent, ${results.filter(r => !r.sent).length} failed`);
    
  } catch (error) {
    console.error('❌ Error processing payment reminders:', error);
  }
  
  return results;
}

/**
 * Start the scheduled payment reminder job
 * Runs every 6 hours to check for payments needing reminders
 */
export function startScheduledPaymentReminderJob(): void {
  console.log('🔔 Starting scheduled payment reminder job...');
  
  // Run immediately on startup
  processScheduledPaymentReminders().then(results => {
    if (results.length > 0) {
      console.log(`📧 Initial reminder check: ${results.filter(r => r.sent).length} reminders sent`);
    }
  });
  
  // Then run every 6 hours
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  setInterval(() => {
    processScheduledPaymentReminders().then(results => {
      if (results.length > 0) {
        console.log(`📧 Scheduled reminder check: ${results.filter(r => r.sent).length} reminders sent`);
      }
    });
  }, SIX_HOURS_MS);
  
  console.log('✅ Scheduled payment reminder job initialized - runs every 6 hours');
}
