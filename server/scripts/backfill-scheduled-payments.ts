/**
 * Backfill Scheduled Payments Script
 * 
 * This script identifies payment plans that were created but are missing their
 * scheduled payments entries (future installments). It creates the missing
 * scheduled payments based on the payment plan metadata from Stripe or local records.
 * 
 * Usage:
 * - Dry run (default): npm run backfill:scheduled-payments -- --dry-run
 * - Execute: npm run backfill:scheduled-payments -- --execute
 */

import { storage } from '../storage';
import { getStripeClient } from '../config/stripe';
import { CurrencyUtils } from '../../shared/currency-utils';

interface PaymentPlanInfo {
  paymentIntentId: string;
  parentEmail: string;
  enrollmentIds: number[];
  paymentPlan: string;
  totalAmount: number;
  installmentNumber: number;
  totalInstallments: number;
  createdAt: Date;
}

interface BackfillResult {
  paymentIntentId: string;
  parentEmail: string;
  paymentPlan: string;
  scheduledPaymentsCreated: number;
  success: boolean;
  error?: string;
}

async function findPaymentPlansMissingScheduledPayments(): Promise<PaymentPlanInfo[]> {
  console.log('🔍 Searching for payment plans missing scheduled payments...');
  
  const missingPlans: PaymentPlanInfo[] = [];
  
  try {
    const stripe = await getStripeClient();
    
    // Search for payment intents with payment plan metadata
    // Look for payments from the last 90 days
    const threeMonthsAgo = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
    
    console.log('📅 Searching Stripe for payment intents since:', new Date(threeMonthsAgo * 1000).toISOString());
    
    // Get payment intents with payment plan metadata
    const paymentIntents = await stripe.paymentIntents.list({
      created: { gte: threeMonthsAgo },
      limit: 100
    });
    
    console.log(`📋 Found ${paymentIntents.data.length} payment intents to analyze`);
    
    for (const pi of paymentIntents.data) {
      // Only process succeeded payments with payment plan metadata
      if (pi.status !== 'succeeded') continue;
      if (!pi.metadata?.paymentPlan) continue;
      if (pi.metadata.paymentPlan === 'full') continue; // Full payments don't need scheduled payments
      
      const paymentPlan = pi.metadata.paymentPlan;
      const parentEmail = pi.metadata.parentEmail;
      const totalInstallments = parseInt(pi.metadata.totalInstallments || '1');
      const installmentNumber = parseInt(pi.metadata.installmentNumber || '1');
      
      // Only check first installment payments (where scheduled payments should have been created)
      if (installmentNumber !== 1) continue;
      
      // Parse enrollment IDs from metadata
      let enrollmentIds: number[] = [];
      try {
        if (pi.metadata.enrollmentIds) {
          enrollmentIds = JSON.parse(pi.metadata.enrollmentIds);
        }
      } catch (e) {
        console.log(`⚠️ Could not parse enrollmentIds for ${pi.id}`);
        continue;
      }
      
      if (!parentEmail || enrollmentIds.length === 0) {
        console.log(`⚠️ Missing required data for ${pi.id}`);
        continue;
      }
      
      // Check if scheduled payments exist for this parent
      const existingScheduled = await storage.getScheduledPaymentsByParentEmail(parentEmail);
      
      // Check if we already have the right number of scheduled payments for this enrollment
      const scheduledForEnrollment = existingScheduled.filter(sp => 
        enrollmentIds.includes(sp.enrollmentId)
      );
      
      // Expected scheduled payments = totalInstallments - 1 (first one is the immediate payment)
      const expectedScheduledPayments = totalInstallments - 1;
      
      if (scheduledForEnrollment.length < expectedScheduledPayments) {
        console.log(`📌 Found missing scheduled payments for ${pi.id}:`, {
          paymentPlan,
          parentEmail,
          totalInstallments,
          existingScheduled: scheduledForEnrollment.length,
          expected: expectedScheduledPayments
        });
        
        missingPlans.push({
          paymentIntentId: pi.id,
          parentEmail,
          enrollmentIds,
          paymentPlan,
          totalAmount: parseInt(pi.metadata.totalAmount || String(pi.amount)),
          installmentNumber,
          totalInstallments,
          createdAt: new Date(pi.created * 1000)
        });
      }
    }
    
    console.log(`\n📊 Analysis complete: ${missingPlans.length} payment plans missing scheduled payments`);
    
  } catch (error) {
    console.error('❌ Error analyzing payment intents:', error);
  }
  
  return missingPlans;
}

async function backfillScheduledPayments(
  plan: PaymentPlanInfo,
  dryRun: boolean
): Promise<BackfillResult> {
  const result: BackfillResult = {
    paymentIntentId: plan.paymentIntentId,
    parentEmail: plan.parentEmail,
    paymentPlan: plan.paymentPlan,
    scheduledPaymentsCreated: 0,
    success: false
  };
  
  try {
    // Get parent user
    const parentUser = await storage.getUserByEmail(plan.parentEmail);
    if (!parentUser) {
      result.error = 'Parent user not found';
      return result;
    }
    
    // Get first enrollment for school ID
    const firstEnrollment = await storage.getEnrollmentById(plan.enrollmentIds[0]);
    if (!firstEnrollment) {
      result.error = 'First enrollment not found';
      return result;
    }
    
    const schoolId = firstEnrollment.schoolId || parentUser.schoolId;
    if (!schoolId) {
      result.error = 'No school ID found';
      return result;
    }
    
    // Check what scheduled payments already exist
    const existingScheduled = await storage.getScheduledPaymentsByParentEmail(plan.parentEmail);
    const existingForEnrollment = existingScheduled.filter(sp => 
      plan.enrollmentIds.includes(sp.enrollmentId)
    );
    const existingInstallments = new Set(existingForEnrollment.map(sp => sp.installmentNumber));
    
    // Calculate payment schedule based on plan type
    const phases = buildPaymentPhases(plan.paymentPlan, plan.totalAmount, plan.createdAt);
    
    console.log(`\n📅 Payment schedule for ${plan.paymentIntentId}:`);
    phases.forEach(phase => {
      const exists = existingInstallments.has(phase.installmentNumber);
      console.log(`  ${exists ? '✅' : '❌'} Installment ${phase.installmentNumber}: ${CurrencyUtils.toDisplay(phase.amount)} due ${phase.dueDate.toLocaleDateString()}`);
    });
    
    // Create missing scheduled payments (skip installment 1 which was the immediate payment)
    for (let i = 1; i < phases.length; i++) {
      const phase = phases[i];
      
      // Skip if this installment already exists
      if (existingInstallments.has(phase.installmentNumber)) {
        console.log(`  ⏭️ Skipping installment ${phase.installmentNumber} - already exists`);
        continue;
      }
      
      if (dryRun) {
        console.log(`  📝 [DRY RUN] Would create scheduled payment: installment ${phase.installmentNumber}`);
        result.scheduledPaymentsCreated++;
      } else {
        // Determine status based on due date
        const now = new Date();
        const status = phase.dueDate < now ? 'pending' : 'pending'; // Could mark past-due as 'overdue'
        
        const scheduledPayment = await storage.createScheduledPayment({
          schoolId,
          enrollmentId: plan.enrollmentIds[0],
          parentId: parentUser.id,
          parentEmail: plan.parentEmail,
          amount: phase.amount,
          currency: 'usd',
          scheduledDate: phase.dueDate,
          frequency: 'one_time' as const,
          installmentNumber: phase.installmentNumber,
          totalInstallments: phases.length,
          status: status as 'pending',
          stripePaymentIntentId: null,
          processedAt: null,
          failureReason: null,
          retryCount: 0,
          metadata: {
            enrollmentIds: plan.enrollmentIds,
            paymentPlan: plan.paymentPlan,
            description: phase.description,
            backfilledAt: new Date().toISOString(),
            originalPaymentIntentId: plan.paymentIntentId
          }
        });
        
        console.log(`  ✅ Created scheduled payment ${scheduledPayment.id}: installment ${phase.installmentNumber}`);
        result.scheduledPaymentsCreated++;
      }
    }
    
    result.success = true;
    
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error backfilling for ${plan.paymentIntentId}:`, result.error);
  }
  
  return result;
}

interface PaymentPhase {
  amount: number;
  dueDate: Date;
  installmentNumber: number;
  description: string;
}

function buildPaymentPhases(plan: string, totalAmount: number, startDate: Date): PaymentPhase[] {
  const add14Days = (date: Date) => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + 14);
    return newDate;
  };
  
  const add30Days = (date: Date) => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + 30);
    return newDate;
  };
  
  switch (plan) {
    case 'deposit':
      const depositAmount = Math.max(Math.round(totalAmount * 0.1), 50);
      const balanceAmount = totalAmount - depositAmount;
      return [
        { amount: depositAmount, dueDate: startDate, installmentNumber: 1, description: 'Deposit Payment (10%)' },
        { amount: balanceAmount, dueDate: add30Days(startDate), installmentNumber: 2, description: 'Balance Payment' }
      ];
      
    case 'split':
      const firstHalf = Math.max(Math.round(totalAmount * 0.5), 50);
      const secondHalf = totalAmount - firstHalf;
      return [
        { amount: firstHalf, dueDate: startDate, installmentNumber: 1, description: 'First Payment (50%)' },
        { amount: secondHalf, dueDate: add30Days(startDate), installmentNumber: 2, description: 'Second Payment (50%)' }
      ];
      
    case 'biweekly':
      const biweeklyAmount = Math.max(Math.round(totalAmount / 4), 50);
      const lastBiweeklyAmount = totalAmount - (biweeklyAmount * 3);
      return [
        { amount: biweeklyAmount, dueDate: startDate, installmentNumber: 1, description: 'Biweekly Payment 1' },
        { amount: biweeklyAmount, dueDate: add14Days(startDate), installmentNumber: 2, description: 'Biweekly Payment 2' },
        { amount: biweeklyAmount, dueDate: add14Days(add14Days(startDate)), installmentNumber: 3, description: 'Biweekly Payment 3' },
        { amount: lastBiweeklyAmount, dueDate: add14Days(add14Days(add14Days(startDate))), installmentNumber: 4, description: 'Biweekly Payment 4' }
      ];
      
    default:
      return [{ amount: totalAmount, dueDate: startDate, installmentNumber: 1, description: 'Full Payment' }];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SCHEDULED PAYMENTS BACKFILL SCRIPT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes will be made)' : '⚡ EXECUTE (changes will be applied)'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Step 1: Find payment plans missing scheduled payments
  const missingPlans = await findPaymentPlansMissingScheduledPayments();
  
  if (missingPlans.length === 0) {
    console.log('\n✅ No payment plans missing scheduled payments. All good!');
    return;
  }
  
  // Step 2: Display summary
  console.log('\n📋 PAYMENT PLANS REQUIRING BACKFILL:');
  console.log('────────────────────────────────────────────────────────────────');
  
  for (const plan of missingPlans) {
    console.log(`\n📌 ${plan.paymentIntentId}`);
    console.log(`   Email: ${plan.parentEmail}`);
    console.log(`   Plan: ${plan.paymentPlan} (${plan.totalInstallments} installments)`);
    console.log(`   Total: ${CurrencyUtils.toDisplay(plan.totalAmount)}`);
    console.log(`   Created: ${plan.createdAt.toLocaleDateString()}`);
    console.log(`   Enrollments: ${plan.enrollmentIds.join(', ')}`);
  }
  
  // Step 3: Backfill each plan
  console.log('\n\n📝 PROCESSING BACKFILL:');
  console.log('────────────────────────────────────────────────────────────────');
  
  const results: BackfillResult[] = [];
  
  for (const plan of missingPlans) {
    console.log(`\n🔄 Processing ${plan.paymentIntentId}...`);
    const result = await backfillScheduledPayments(plan, dryRun);
    results.push(result);
  }
  
  // Step 4: Summary
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  BACKFILL SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalCreated = results.reduce((sum, r) => sum + r.scheduledPaymentsCreated, 0);
  
  console.log(`\n✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log(`📅 Scheduled payments ${dryRun ? 'to be created' : 'created'}: ${totalCreated}`);
  
  if (failed.length > 0) {
    console.log('\n❌ FAILED BACKFILLS:');
    for (const f of failed) {
      console.log(`   ${f.paymentIntentId}: ${f.error}`);
    }
  }
  
  if (dryRun && totalCreated > 0) {
    console.log('\n💡 To execute these changes, run:');
    console.log('   npx tsx server/scripts/backfill-scheduled-payments.ts --execute');
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

// Run the script
main().catch(console.error);
