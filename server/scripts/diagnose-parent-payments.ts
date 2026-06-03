/**
 * Diagnostic Script: Trace a parent's payment data through the system
 *
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/diagnose-parent-payments.ts parent@example.com
 *
 * Reports enrollments, scheduled payments, membership, credits, payments,
 * and portal parity (cart exclusion vs billing summary balance).
 */

import { getDb } from '../db';
import { storage } from '../storage';
import { enrollmentShouldExcludeFromCart } from '../../shared/enrollment-cart-eligibility';
import { resolveEnrollmentEffectiveBalance } from '../lib/enrollment-effective-balance';
import {
  users,
  programEnrollments,
  scheduledPayments,
  payments,
  membershipEnrollments,
  credits,
} from '../../shared/schema';
import { eq, desc, or } from 'drizzle-orm';

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
    console.log(
      `   Effective Balance: $${((enrollment.effectiveBalance ?? resolveEnrollmentEffectiveBalance(enrollment)) / 100).toFixed(2)}`,
    );
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
    .where(eq(membershipEnrollments.parentUserId, parent.id));
  
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
  
  // 4. Unified credits ledger
  const creditRows = await db
    .select()
    .from(credits)
    .where(eq(credits.userId, parent.id));

  console.log(`\n💰 CREDITS (${creditRows.length} total):`);
  console.log('-'.repeat(80));
  let totalAvailable = 0;
  for (const credit of creditRows) {
    const available = Math.max(
      0,
      (credit.creditAmountCents || 0) - (credit.usedAmountCents || 0),
    );
    if (credit.status === 'approved' || credit.status === 'partially_used') {
      totalAvailable += available;
    }
    console.log(
      `   ${credit.title || credit.creditType} | $${((credit.creditAmountCents || 0) / 100).toFixed(2)} | used $${((credit.usedAmountCents || 0) / 100).toFixed(2)} | ${credit.status}`,
    );
  }
  console.log(`   TOTAL AVAILABLE (approved/partial): $${(totalAvailable / 100).toFixed(2)}`);

  // 5. payments table (authoritative receipts)
  const paymentRows = await db
    .select()
    .from(payments)
    .where(
      or(eq(payments.parentId, parent.id), eq(payments.parentEmail, parentEmail)),
    )
    .orderBy(desc(payments.createdAt))
    .limit(15);

  console.log(`\n💳 PAYMENTS TABLE (last 15):`);
  console.log('-'.repeat(80));
  for (const payment of paymentRows) {
    const date = payment.createdAt
      ? new Date(payment.createdAt).toISOString().split('T')[0]
      : 'N/A';
    const pi = payment.stripePaymentIntentId?.substring(0, 24) ?? '—';
    console.log(
      `   ${date} | $${((payment.amount || 0) / 100).toFixed(2)} | ${payment.status} | ${pi}`,
    );
  }

  // 6. Portal parity (matches parent Payments UI)
  const allScheduled = await storage.getScheduledPaymentsByParentEmail(parentEmail);
  const actionableScheduled = allScheduled.filter((p) =>
    ['pending', 'failed', 'overdue'].includes(String(p.status).toLowerCase()),
  );

  let billingStyleBalanceCents = 0;
  for (const enrollment of enrollments) {
    billingStyleBalanceCents += Math.max(
      0,
      resolveEnrollmentEffectiveBalance(enrollment),
    );
  }

  console.log(`\n🖥️  PORTAL PARITY:`);
  console.log('-'.repeat(80));
  console.log(
    `   Billing-summary style enrollment balance: $${(billingStyleBalanceCents / 100).toFixed(2)}`,
  );
  console.log(
    `   Actionable scheduled payments (pending/failed/overdue): ${actionableScheduled.length}`,
  );

  for (const enrollment of enrollments) {
    const eff = resolveEnrollmentEffectiveBalance(enrollment);
    if (eff <= 0) continue;
    const excluded = enrollmentShouldExcludeFromCart(enrollment, allScheduled);
    console.log(
      `   Enrollment #${enrollment.id} (${enrollment.childName}): $${(eff / 100).toFixed(2)} owed | cart/upcoming excluded=${excluded}`,
    );
    if (excluded && actionableScheduled.length === 0) {
      console.log(
        `      ⚠️ DEAD END: balance owed but excluded from cart and no upcoming installments`,
      );
    }
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
