/**
 * Script to diagnose and fix Erica Wilson's payment data
 * Run with: npx tsx server/scripts/fix-erica-wilson.ts
 */

import { getDb } from '../db';
import { users, children, schoolClassEnrollments, scheduledPayments, membershipEnrollments, stripePaymentHistory } from '../../shared/schema';
import { eq, and, or, ilike } from 'drizzle-orm';

async function diagnoseEricaWilson() {
  const db = await getDb();
  
  console.log('🔍 Diagnosing Erica Wilson payment data...\n');
  
  // 1. Find user
  const user = await db.select().from(users)
    .where(eq(users.email, 'erica_wilson223@yahoo.com'))
    .limit(1);
  
  if (!user.length) {
    console.log('❌ User not found with email erica_wilson223@yahoo.com');
    return;
  }
  
  const ericaUser = user[0];
  console.log('👤 User found:');
  console.log(`   ID: ${ericaUser.id}`);
  console.log(`   Email: ${ericaUser.email}`);
  console.log(`   Name: ${ericaUser.name || ericaUser.username}`);
  console.log(`   Stripe Customer ID: ${ericaUser.stripeCustomerId}`);
  console.log('');
  
  // 2. Find children
  const ericaChildren = await db.select().from(children)
    .where(eq(children.parentEmail, ericaUser.email));
  
  console.log(`👶 Children found: ${ericaChildren.length}`);
  for (const child of ericaChildren) {
    console.log(`   - ${child.firstName} ${child.lastName} (ID: ${child.id})`);
  }
  console.log('');
  
  // 3. Find enrollments
  const childIds = ericaChildren.map(c => c.id);
  let allEnrollments = [];
  
  for (const childId of childIds) {
    const enrollments = await db.select().from(schoolClassEnrollments)
      .where(eq(schoolClassEnrollments.childId, childId));
    allEnrollments.push(...enrollments);
  }
  
  console.log(`📚 Enrollments found: ${allEnrollments.length}`);
  let totalEnrollmentCost = 0;
  let totalRemainingBalance = 0;
  
  for (const enrollment of allEnrollments) {
    const totalCostDollars = (enrollment.totalCost || 0) / 100;
    const remainingDollars = (enrollment.remainingBalance || 0) / 100;
    const amountDollars = (enrollment.amount || 0) / 100;
    totalEnrollmentCost += enrollment.totalCost || 0;
    totalRemainingBalance += enrollment.remainingBalance || 0;
    
    console.log(`   Enrollment ID: ${enrollment.id}`);
    console.log(`      Child: ${enrollment.childName}`);
    console.log(`      Status: ${enrollment.status}`);
    console.log(`      Total Cost: $${totalCostDollars.toFixed(2)} (${enrollment.totalCost} cents)`);
    console.log(`      Amount (paid?): $${amountDollars.toFixed(2)} (${enrollment.amount} cents)`);
    console.log(`      Remaining Balance: $${remainingDollars.toFixed(2)} (${enrollment.remainingBalance} cents)`);
    console.log(`      Payment Status: ${enrollment.paymentStatus}`);
    console.log('');
  }
  
  console.log(`💰 TOTAL from enrollments:`);
  console.log(`   Total Cost: $${(totalEnrollmentCost/100).toFixed(2)}`);
  console.log(`   Remaining Balance: $${(totalRemainingBalance/100).toFixed(2)}`);
  console.log('');
  
  // 4. Find membership enrollments
  const memberships = await db.select().from(membershipEnrollments)
    .where(eq(membershipEnrollments.parentUserId, ericaUser.id));
  
  console.log(`🏅 Membership enrollments found: ${memberships.length}`);
  let totalMembershipAmount = 0;
  let totalMembershipRemaining = 0;
  
  for (const membership of memberships) {
    const amountDollars = (membership.amount || 0) / 100;
    const amountPaidDollars = (membership.amountPaid || 0) / 100;
    const remainingDollars = (membership.remainingBalance || 0) / 100;
    totalMembershipAmount += membership.amount || 0;
    totalMembershipRemaining += membership.remainingBalance || 0;
    
    console.log(`   Membership ID: ${membership.id}`);
    console.log(`      Status: ${membership.status}`);
    console.log(`      Amount: $${amountDollars.toFixed(2)} (${membership.amount} cents)`);
    console.log(`      Amount Paid: $${amountPaidDollars.toFixed(2)} (${membership.amountPaid} cents)`);
    console.log(`      Remaining Balance: $${remainingDollars.toFixed(2)} (${membership.remainingBalance} cents)`);
    console.log('');
  }
  
  console.log(`💰 TOTAL from memberships:`);
  console.log(`   Total Amount: $${(totalMembershipAmount/100).toFixed(2)}`);
  console.log(`   Remaining: $${(totalMembershipRemaining/100).toFixed(2)}`);
  console.log('');
  
  // 5. Find scheduled payments
  const scheduled = await db.select().from(scheduledPayments)
    .where(eq(scheduledPayments.parentEmail, ericaUser.email));
  
  console.log(`📅 Scheduled payments found: ${scheduled.length}`);
  for (const sp of scheduled) {
    console.log(`   Payment ID: ${sp.id}`);
    console.log(`      Amount: $${((sp.amount || 0)/100).toFixed(2)} (${sp.amount} cents)`);
    console.log(`      Status: ${sp.status}`);
    console.log(`      Scheduled Date: ${sp.scheduledDate}`);
    console.log(`      Enrollment ID: ${sp.enrollmentId}`);
    console.log('');
  }
  
  // 6. Find Stripe payment history
  const payments = await db.select().from(stripePaymentHistory)
    .where(eq(stripePaymentHistory.userId, ericaUser.id));
  
  console.log(`💳 Stripe payment history found: ${payments.length}`);
  for (const payment of payments) {
    console.log(`   Payment ID: ${payment.id}`);
    console.log(`      Amount: $${((payment.amount || 0)/100).toFixed(2)} (${payment.amount} cents)`);
    console.log(`      Status: ${payment.status}`);
    console.log(`      Description: ${payment.description}`);
    console.log(`      Created: ${payment.createdAt}`);
    console.log('');
  }
  
  // 7. Calculate expected amounts
  console.log('='.repeat(60));
  console.log('📊 SUMMARY:');
  console.log('='.repeat(60));
  
  const totalDueFromEnrollments = totalRemainingBalance;
  const totalDueFromMemberships = totalMembershipRemaining;
  const grandTotalDue = totalDueFromEnrollments + totalDueFromMemberships;
  
  console.log(`Total Due from Enrollments: $${(totalDueFromEnrollments/100).toFixed(2)}`);
  console.log(`Total Due from Memberships: $${(totalDueFromMemberships/100).toFixed(2)}`);
  console.log(`GRAND TOTAL DUE: $${(grandTotalDue/100).toFixed(2)}`);
  console.log('');
  
  // The displayed $1,975 is 197500 cents
  // Expected calculation should be $1,800 (enrollments) + $175 (membership?) - $17.10 (paid) = $1,957.90
  // Or if membership is $0 already, just $1,800 - $17.10 = $1,782.90
  
  console.log('🤔 Hypothesis: The $1,975 displayed may include:');
  console.log('   - $1,800 from 2 class enrollments (2 × $900)');
  console.log('   - $175 from membership fee');
  console.log('   - The $17.10 deposit was NOT subtracted from remaining balances');
  
  process.exit(0);
}

diagnoseEricaWilson().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
