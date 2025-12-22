/**
 * Production Fix Script: Erica Wilson Payment Data
 * 
 * Problem: The $17.10 deposit payment was not properly credited to enrollment balances.
 * - Amount Due shows: $1,975.00
 * - Should be: $1,800 - $17.10 = $1,782.90 (assuming membership is separate)
 * 
 * This script will:
 * 1. Find Erica Wilson's user account
 * 2. Find her children and enrollments
 * 3. Calculate correct remaining balances based on actual Stripe payments
 * 4. Update enrollment records with correct remaining balances
 * 5. Update scheduled payments if needed
 * 
 * Run with: npx tsx server/scripts/fix-erica-wilson-production.ts
 * 
 * Add --dry-run flag to preview changes without applying: 
 *   npx tsx server/scripts/fix-erica-wilson-production.ts --dry-run
 */

import { getDb } from '../db';
import { 
  users, 
  children, 
  programEnrollments,
  scheduledPayments, 
  membershipEnrollments, 
  stripePaymentHistory 
} from '../../shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

const ERICA_EMAIL = 'erica_wilson223@yahoo.com';
const DRY_RUN = process.argv.includes('--dry-run');

// Known Stripe payments from screenshot (in cents)
const KNOWN_STRIPE_PAYMENTS = {
  deposit: 1710,          // $17.10 deposit - Nov 14
  fullPaymentIntent: 171000, // $1,710.00 incomplete - Nov 14 (not yet paid)
  olderPayment: 17100     // $171.00 - Jun 27 (different transaction?)
};

async function fixEricaWilsonPayments() {
  const db = await getDb();
  
  console.log('='.repeat(70));
  console.log('ERICA WILSON PAYMENT FIX SCRIPT');
  console.log('='.repeat(70));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes will be made)' : '⚡ LIVE (changes will be applied)'}`);
  console.log('');
  
  // 1. Find user
  console.log('Step 1: Finding user...');
  const [ericaUser] = await db.select().from(users)
    .where(eq(users.email, ERICA_EMAIL))
    .limit(1);
  
  if (!ericaUser) {
    console.error(`❌ User not found with email: ${ERICA_EMAIL}`);
    console.log('');
    console.log('Please verify the email address is correct.');
    process.exit(1);
  }
  
  console.log(`✅ Found user:`);
  console.log(`   ID: ${ericaUser.id}`);
  console.log(`   Email: ${ericaUser.email}`);
  console.log(`   Name: ${ericaUser.name || ericaUser.username}`);
  console.log(`   Member ID: ${ericaUser.memberId || 'none'}`);
  console.log(`   Stripe Customer ID: ${ericaUser.stripeCustomerId || 'none'}`);
  console.log('');
  
  // 2. Find children
  console.log('Step 2: Finding children...');
  const ericaChildren = await db.select().from(children)
    .where(eq(children.parentEmail, ERICA_EMAIL));
  
  if (ericaChildren.length === 0) {
    console.log('⚠️  No children found for this parent.');
    console.log('    Checking enrollments directly...');
  } else {
    console.log(`✅ Found ${ericaChildren.length} children:`);
    for (const child of ericaChildren) {
      console.log(`   - ${child.firstName} ${child.lastName} (ID: ${child.id})`);
    }
  }
  console.log('');
  
  // 3. Find enrollments from programEnrollments table
  console.log('Step 3: Finding enrollments...');
  
  // First try by parentEmail
  let allEnrollments = await db.select().from(programEnrollments)
    .where(eq(programEnrollments.parentEmail, ERICA_EMAIL));
  
  // If not found, try by parentId
  if (allEnrollments.length === 0 && ericaUser) {
    allEnrollments = await db.select().from(programEnrollments)
      .where(eq(programEnrollments.parentId, ericaUser.id));
  }
  
  // Also search by childName pattern if no enrollments found
  if (allEnrollments.length === 0) {
    console.log('   No enrollments found by parentEmail/parentId, searching by childName...');
    const allEnrollmentsInDb = await db.select().from(programEnrollments);
    allEnrollments = allEnrollmentsInDb.filter((e: typeof programEnrollments.$inferSelect) => 
      e.childName?.toLowerCase().includes('marek') ||
      e.childName?.toLowerCase().includes('miles') ||
      e.childName?.toLowerCase().includes('maddox')
    );
  }
  
  if (allEnrollments.length === 0) {
    console.log('❌ No enrollments found for this user.');
    console.log('   Please verify the user has active enrollments.');
    process.exit(1);
  }
  
  console.log(`✅ Found ${allEnrollments.length} enrollments:`);
  let totalCostCents = 0;
  let totalCurrentRemainingCents = 0;
  let totalPaidInEnrollments = 0;
  
  for (const enrollment of allEnrollments) {
    const totalCostDollars = (enrollment.totalCost || 0) / 100;
    const remainingDollars = (enrollment.remainingBalance || 0) / 100;
    const paidDollars = (enrollment.totalPaid || 0) / 100;
    totalCostCents += enrollment.totalCost || 0;
    totalCurrentRemainingCents += enrollment.remainingBalance || 0;
    totalPaidInEnrollments += enrollment.totalPaid || 0;
    
    console.log(`   Enrollment ID: ${enrollment.id}`);
    console.log(`      Child: ${enrollment.childName}`);
    console.log(`      Class: ${enrollment.className}`);
    console.log(`      Status: ${enrollment.status}`);
    console.log(`      Total Cost: $${totalCostDollars.toFixed(2)}`);
    console.log(`      Total Paid (in record): $${paidDollars.toFixed(2)}`);
    console.log(`      Current Remaining: $${remainingDollars.toFixed(2)}`);
    console.log(`      Payment Status: ${enrollment.paymentStatus}`);
    console.log('');
  }
  
  // 4. Find actual payments from Stripe history
  console.log('Step 4: Finding payment history...');
  const payments = await db.select().from(stripePaymentHistory)
    .where(eq(stripePaymentHistory.userId, ericaUser.id));
  
  let totalPaidCents = 0;
  console.log(`Found ${payments.length} payment records in database:`);
  
  for (const payment of payments) {
    if (payment.status === 'succeeded' || payment.status === 'completed') {
      totalPaidCents += payment.amount || 0;
      console.log(`   ✅ $${((payment.amount || 0)/100).toFixed(2)} - ${payment.description} (${payment.status})`);
    } else {
      console.log(`   ⏳ $${((payment.amount || 0)/100).toFixed(2)} - ${payment.description} (${payment.status})`);
    }
  }
  
  // If no payments in DB, use known Stripe data from screenshot
  if (payments.length === 0) {
    console.log('');
    console.log('⚠️  No payment records in database. Using known Stripe payments from screenshot:');
    console.log(`   ✅ $17.10 - Deposit payment (succeeded)`);
    totalPaidCents = 1710; // $17.10 deposit
  }
  
  console.log('');
  console.log(`Total successfully paid: $${(totalPaidCents/100).toFixed(2)}`);
  console.log('');
  
  // 5. Find membership enrollments
  console.log('Step 5: Checking membership enrollments...');
  const memberships = await db.select().from(membershipEnrollments)
    .where(eq(membershipEnrollments.parentUserId, ericaUser.id));
  
  let membershipAmountDueCents = 0;
  if (memberships.length > 0) {
    console.log(`Found ${memberships.length} membership enrollments:`);
    for (const m of memberships) {
      const remaining = (m.remainingBalance || 0);
      membershipAmountDueCents += remaining;
      console.log(`   - Status: ${m.status}, Amount: $${((m.amount || 0)/100).toFixed(2)}, Remaining: $${(remaining/100).toFixed(2)}`);
    }
  } else {
    console.log('   No membership enrollments found.');
  }
  console.log('');
  
  // 6. Calculate correct amounts
  console.log('Step 6: Calculating correct amounts...');
  console.log('-'.repeat(50));
  
  const expectedTotalDueCents = totalCostCents - totalPaidCents;
  const currentDisplayedDueCents = totalCurrentRemainingCents + membershipAmountDueCents;
  
  console.log(`Total enrollment cost: $${(totalCostCents/100).toFixed(2)}`);
  console.log(`Total amount paid: $${(totalPaidCents/100).toFixed(2)}`);
  console.log(`Paid recorded in enrollments: $${(totalPaidInEnrollments/100).toFixed(2)}`);
  console.log(`Membership remaining: $${(membershipAmountDueCents/100).toFixed(2)}`);
  console.log('');
  console.log(`Current displayed Amount Due: $${(currentDisplayedDueCents/100).toFixed(2)}`);
  console.log(`Expected Amount Due (classes): $${(expectedTotalDueCents/100).toFixed(2)}`);
  console.log(`Expected Total (with membership): $${((expectedTotalDueCents + membershipAmountDueCents)/100).toFixed(2)}`);
  console.log('');
  
  // 7. Calculate per-enrollment fix
  // Distribute the paid amount proportionally across enrollments
  const paidPerEnrollment = Math.floor(totalPaidCents / allEnrollments.length);
  const remainder = totalPaidCents % allEnrollments.length;
  
  console.log('Step 7: Proposed fixes...');
  console.log('-'.repeat(50));
  
  const fixes: Array<{
    enrollmentId: number;
    childName: string;
    currentRemaining: number;
    currentTotalPaid: number;
    newRemaining: number;
    newTotalPaid: number;
    amountCredited: number;
  }> = [];
  
  for (let i = 0; i < allEnrollments.length; i++) {
    const enrollment = allEnrollments[i];
    const currentRemaining = enrollment.remainingBalance || 0;
    const currentTotalPaid = enrollment.totalPaid || 0;
    const totalCost = enrollment.totalCost || 0;
    
    // Credit this enrollment's share of payments
    const creditAmount = paidPerEnrollment + (i === 0 ? remainder : 0);
    const newTotalPaid = creditAmount;
    const newRemaining = Math.max(0, totalCost - newTotalPaid);
    
    fixes.push({
      enrollmentId: enrollment.id,
      childName: enrollment.childName || 'Unknown',
      currentRemaining,
      currentTotalPaid,
      newRemaining,
      newTotalPaid,
      amountCredited: creditAmount
    });
    
    console.log(`Enrollment ${enrollment.id} (${enrollment.childName}):`);
    console.log(`   Current remaining: $${(currentRemaining/100).toFixed(2)}`);
    console.log(`   Current total paid: $${(currentTotalPaid/100).toFixed(2)}`);
    console.log(`   Credit amount: $${(creditAmount/100).toFixed(2)}`);
    console.log(`   New total paid: $${(newTotalPaid/100).toFixed(2)}`);
    console.log(`   New remaining: $${(newRemaining/100).toFixed(2)}`);
    console.log('');
  }
  
  // 8. Apply fixes
  if (DRY_RUN) {
    console.log('='.repeat(70));
    console.log('🔍 DRY RUN COMPLETE - No changes were made');
    console.log('='.repeat(70));
    console.log('');
    console.log('To apply these changes, run without --dry-run flag:');
    console.log('  npx tsx server/scripts/fix-erica-wilson-production.ts');
    console.log('');
  } else {
    console.log('Step 8: Applying fixes...');
    console.log('-'.repeat(50));
    
    for (const fix of fixes) {
      try {
        await db.update(programEnrollments)
          .set({
            remainingBalance: fix.newRemaining,
            totalPaid: fix.newTotalPaid,
            paymentStatus: fix.newRemaining <= 0 ? 'completed' : 
                          fix.amountCredited > 0 ? 'deposit_paid' : 'pending'
          })
          .where(eq(programEnrollments.id, fix.enrollmentId));
        
        console.log(`✅ Updated enrollment ${fix.enrollmentId}: paid=$${(fix.newTotalPaid/100).toFixed(2)}, remaining=$${(fix.newRemaining/100).toFixed(2)}`);
      } catch (error) {
        console.error(`❌ Failed to update enrollment ${fix.enrollmentId}:`, error);
      }
    }
    
    // 9. Update scheduled payments if needed
    console.log('');
    console.log('Step 9: Checking scheduled payments...');
    
    const enrollmentIds = allEnrollments.map((e: typeof programEnrollments.$inferSelect) => e.id);
    const scheduled = await db.select().from(scheduledPayments)
      .where(inArray(scheduledPayments.enrollmentId, enrollmentIds));
    
    if (scheduled.length > 0) {
      console.log(`Found ${scheduled.length} scheduled payments to review:`);
      
      for (const sp of scheduled) {
        // Find the corresponding enrollment
        const enrollment = fixes.find(f => f.enrollmentId === sp.enrollmentId);
        if (enrollment && sp.status === 'pending') {
          // Update the scheduled payment amount to match the new remaining balance
          const newAmount = enrollment.newRemaining;
          
          if (newAmount !== sp.amount) {
            try {
              await db.update(scheduledPayments)
                .set({ amount: newAmount })
                .where(eq(scheduledPayments.id, sp.id));
              
              console.log(`✅ Updated scheduled payment ${sp.id}: $${((sp.amount || 0)/100).toFixed(2)} -> $${(newAmount/100).toFixed(2)}`);
            } catch (error) {
              console.error(`❌ Failed to update scheduled payment ${sp.id}:`, error);
            }
          }
        }
      }
    } else {
      console.log('   No scheduled payments found for these enrollments.');
    }
    
    console.log('');
    console.log('='.repeat(70));
    console.log('✅ FIX COMPLETE');
    console.log('='.repeat(70));
    console.log('');
    console.log('Summary:');
    console.log(`   - Updated ${fixes.length} enrollment(s)`);
    console.log(`   - Total credited: $${(totalPaidCents/100).toFixed(2)}`);
    console.log(`   - New Amount Due: $${((totalCostCents - totalPaidCents + membershipAmountDueCents)/100).toFixed(2)}`);
    console.log('');
    console.log('Please verify the changes by viewing the parent profile in the admin panel.');
  }
  
  process.exit(0);
}

// Run the script
fixEricaWilsonPayments().catch(err => {
  console.error('Script failed with error:', err);
  process.exit(1);
});
