/**
 * Diagnostic Script: Trace a parent's payment data through the system
 * Run with: npx tsx server/scripts/diagnose-parent-payments.ts peachy8001@gmail.com
 * 
 * This script identifies:
 * 1. Parent's user record
 * 2. All enrollments and their payment plans
 * 3. All scheduled payments and their statuses
 * 4. Any discrepancies between enrollment settings and scheduled payment records
 */

import { getDb } from '../db';
import { 
  users,
  programEnrollments,
  scheduledPayments,
  stripePaymentHistory,
  membershipEnrollments,
  userCredits
} from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';

async function diagnoseParentPayments(parentEmail: string) {
  const db = await getDb();
  
  console.log('='.repeat(80));
  console.log(`🔍 PAYMENT DIAGNOSTIC REPORT FOR: ${parentEmail}`);
  console.log('='.repeat(80));
  console.log(`Generated: ${new Date().toISOString()}\n`);
  
  // 1. Find parent user
  const [parent] = await db.select().from(users).where(eq(users.email, parentEmail));
  
  if (!parent) {
    console.error(`❌ ERROR: No user found with email: ${parentEmail}`);
    process.exit(1);
  }
  
  console.log('📋 PARENT INFO:');
  console.log(`   ID: ${parent.id}`);
  console.log(`   Name: ${parent.firstName} ${parent.lastName}`);
  console.log(`   Email: ${parent.email}`);
  console.log(`   School ID: ${parent.schoolId}`);
  console.log(`   Role: ${parent.role}`);
  console.log('');
  
  // 2. Get all enrollments
  const enrollments = await db.select().from(programEnrollments)
    .where(eq(programEnrollments.parentEmail, parentEmail))
    .orderBy(desc(programEnrollments.createdAt));
  
  console.log(`📚 ENROLLMENTS (${enrollments.length} total):`);
  console.log('-'.repeat(80));
  
  for (const enrollment of enrollments) {
    console.log(`\n   Enrollment ID: ${enrollment.id}`);
    console.log(`   Child: ${enrollment.childName}`);
    console.log(`   Class: ${enrollment.className}`);
    console.log(`   Status: ${enrollment.status}`);
    console.log(`   Payment Status: ${enrollment.paymentStatus}`);
    console.log(`   Payment Plan: ${enrollment.paymentPlan || 'NOT SET'}`);
    console.log(`   Payment Frequency: ${enrollment.paymentFrequency || 'NOT SET'}`);
    console.log(`   Total Cost: $${((enrollment.totalCost || 0) / 100).toFixed(2)}`);
    console.log(`   Total Paid: $${((enrollment.totalPaid || 0) / 100).toFixed(2)}`);
    console.log(`   Remaining Balance: $${((enrollment.remainingBalance || 0) / 100).toFixed(2)}`);
    console.log(`   Program Dates: ${enrollment.programStartDate} to ${enrollment.programEndDate}`);
    
    // Get scheduled payments for this enrollment
    const payments = await db.select().from(scheduledPayments)
      .where(eq(scheduledPayments.enrollmentId, enrollment.id))
      .orderBy(scheduledPayments.scheduledDate);
    
    console.log(`\n   📅 SCHEDULED PAYMENTS (${payments.length} records):`);
    if (payments.length === 0) {
      console.log(`      ⚠️ NO SCHEDULED PAYMENTS FOUND`);
    } else {
      for (const payment of payments) {
        const dueDate = payment.scheduledDate instanceof Date 
          ? payment.scheduledDate.toISOString().split('T')[0]
          : payment.scheduledDate;
        console.log(`      - ID: ${payment.id} | $${(payment.amount / 100).toFixed(2)} | Due: ${dueDate} | Status: ${payment.status}`);
      }
      
      // Check for issues
      const pendingPayments = payments.filter(p => p.status === 'pending');
      const completedPayments = payments.filter(p => p.status === 'completed');
      console.log(`\n      Summary: ${completedPayments.length} completed, ${pendingPayments.length} pending`);
      
      // Check if payment plan matches scheduled payments
      if (enrollment.paymentFrequency === 'biweekly' && payments.length > 0) {
        // Check for proper 14-day spacing
        const sortedPayments = [...pendingPayments].sort((a, b) => 
          new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
        );
        
        let spacingIssues = 0;
        for (let i = 1; i < sortedPayments.length; i++) {
          const prev = new Date(sortedPayments[i-1].scheduledDate);
          const curr = new Date(sortedPayments[i].scheduledDate);
          const daysDiff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff !== 14 && daysDiff !== 0) {
            spacingIssues++;
          }
        }
        if (spacingIssues > 0) {
          console.log(`      ⚠️ ISSUE: ${spacingIssues} payment(s) not properly spaced at 14-day intervals`);
        }
      }
    }
    console.log('   ' + '-'.repeat(70));
  }
  
  // 3. Get membership enrollments
  const memberships = await db.select().from(membershipEnrollments)
    .where(eq(membershipEnrollments.parentId, parent.id));
  
  console.log(`\n🎫 MEMBERSHIP ENROLLMENTS (${memberships.length} total):`);
  console.log('-'.repeat(80));
  for (const membership of memberships) {
    console.log(`   ID: ${membership.id}`);
    console.log(`   Year: ${membership.membershipYear}`);
    console.log(`   Status: ${membership.status}`);
    console.log(`   Amount: $${((membership.amount || 0) / 100).toFixed(2)}`);
    console.log(`   Amount Paid: $${((membership.amountPaid || 0) / 100).toFixed(2)}`);
    console.log(`   Balance Due: $${((membership.balanceDue || 0) / 100).toFixed(2)}`);
    console.log('');
  }
  
  // 4. Get credits
  const credits = await db.select().from(userCredits)
    .where(eq(userCredits.userId, parent.id));
  
  console.log(`\n💰 USER CREDITS (${credits.length} total):`);
  console.log('-'.repeat(80));
  let totalAvailable = 0;
  for (const credit of credits) {
    const available = (credit.amountCents || 0) - (credit.consumedAmountCents || 0);
    if (available > 0) {
      totalAvailable += available;
    }
    console.log(`   Type: ${credit.creditType} | Amount: $${((credit.amountCents || 0) / 100).toFixed(2)} | Consumed: $${((credit.consumedAmountCents || 0) / 100).toFixed(2)} | Status: ${credit.status}`);
  }
  console.log(`   TOTAL AVAILABLE: $${(totalAvailable / 100).toFixed(2)}`);
  
  // 5. Get payment history
  const paymentHistory = await db.select().from(stripePaymentHistory)
    .where(eq(stripePaymentHistory.userId, parent.id))
    .orderBy(desc(stripePaymentHistory.createdAt))
    .limit(10);
  
  console.log(`\n💳 RECENT PAYMENT HISTORY (last 10):`);
  console.log('-'.repeat(80));
  for (const payment of paymentHistory) {
    const date = payment.createdAt ? new Date(payment.createdAt).toISOString().split('T')[0] : 'N/A';
    console.log(`   ${date} | $${((payment.amount || 0) / 100).toFixed(2)} | ${payment.status} | ${payment.paymentIntentId?.substring(0, 20)}...`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('🏁 DIAGNOSTIC COMPLETE');
  console.log('='.repeat(80));
}

// Run the diagnostic
const targetEmail = process.argv[2];
if (!targetEmail) {
  console.error('Usage: npx tsx server/scripts/diagnose-parent-payments.ts <email>');
  process.exit(1);
}

diagnoseParentPayments(targetEmail)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Diagnostic failed:', err);
    process.exit(1);
  });
