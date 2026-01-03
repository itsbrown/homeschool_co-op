import Stripe from 'stripe';
import { IStorage } from '../storage';
import { CurrencyUtils } from '../../shared/currency-utils';
import { InsertScheduledPayment } from '@shared/schema';
import { calculatePaymentSchedule, PaymentFrequency } from '../lib/payment-calculator';
import { getStripeClient } from '../config/stripe';

const isTestMode = process.env.NODE_ENV === 'test';

// Stripe's minimum payment amount is $0.50 USD (50 cents)
const STRIPE_MINIMUM_AMOUNT = 50;

export interface PaymentPlanData {
  parentEmail: string;
  enrollmentIds: number[];
  totalAmount: number; // In cents
  paymentPlan: 'deposit' | 'biweekly' | 'full';
  paymentFrequency?: PaymentFrequency; // Optional: for date-based payment schedules
  // Membership data (optional) - derived server-side from authenticated user
  membership?: {
    parentUserId: number;
    schoolId: number;
    amount: number; // In cents
    year: number;
    // Optional discount info for tracking
    discountId?: number;
    discountName?: string;
    originalAmount?: number;
    discountAmount?: number;
  };
  // Discount tracking for payment dashboards
  discountSnapshot?: {
    subtotal: number; // Original subtotal before discounts (cents)
    discountTotal: number; // Total discount applied (cents)
    appliedDiscounts: Array<{
      source: 'promo' | 'sibling' | 'free_after_threshold' | 'automatic' | 'bundle';
      discountId?: number;
      code?: string;
      name: string;
      type: string;
      value: number;
      amount: number; // Discount amount in cents
    }>;
  };
  // Credits applied to this payment (in cents) - unified credit system
  creditsAppliedCents?: number;
  // Credit allocation breakdown for payment history tracking
  creditAllocation?: {
    enrollmentCredits: number;
    membershipCredits: number;
  };
}

export interface PaymentPhase {
  amount: number; // amount in cents
  dueDate: Date;
  installmentNumber: number;
  description: string;
}

export interface PaymentPlanResult {
  paymentIntent: Stripe.PaymentIntent;
  scheduledPayments: any[]; // Future payment records
}

export class StripePaymentPlanService {
  constructor(private storage: IStorage) {}

  /**
   * Create immediate payment intent and scheduled payments for payment plans
   */
  async createEducationalPaymentPlan(data: PaymentPlanData): Promise<PaymentPlanResult> {
    console.log('🎯 Creating Stripe payment plan:', {
      parentEmail: data.parentEmail,
      enrollmentIds: data.enrollmentIds,
      totalAmount: CurrencyUtils.toDisplay(data.totalAmount),
      paymentPlan: data.paymentPlan,
      paymentFrequency: data.paymentFrequency || 'one_time'
    });

    // Validate total amount meets Stripe's minimum
    if (data.totalAmount < STRIPE_MINIMUM_AMOUNT) {
      throw new Error(
        `Payment amount ${CurrencyUtils.toDisplay(data.totalAmount)} is below Stripe's minimum of $0.50. ` +
        `Please ensure the class price is at least $0.50 to process payments.`
      );
    }

    // Get or create Stripe customer
    const customer = await this.getOrCreateCustomer(data.parentEmail);
    console.log('👤 Customer ready:', customer.id);

    // Get enrollment data for date-based scheduling if needed
    let programStartDate: Date | null = null;
    let programEndDate: Date | null = null;
    
    if (data.paymentFrequency && data.paymentFrequency !== 'one_time' && data.enrollmentIds.length > 0) {
      const firstEnrollment = await this.storage.getEnrollmentById(data.enrollmentIds[0]);
      if (firstEnrollment?.programStartDate && firstEnrollment?.programEndDate) {
        const parsedStartDate = new Date(firstEnrollment.programStartDate);
        const parsedEndDate = new Date(firstEnrollment.programEndDate);
        
        // Only use dates if they are valid (not NaN)
        if (!isNaN(parsedStartDate.getTime()) && !isNaN(parsedEndDate.getTime())) {
          programStartDate = parsedStartDate;
          programEndDate = parsedEndDate;
          console.log('📅 Using enrollment dates for payment schedule:', {
            startDate: programStartDate.toLocaleDateString(),
            endDate: programEndDate.toLocaleDateString()
          });
        } else {
          console.warn('⚠️ Invalid enrollment dates, using default payment schedule:', {
            rawStartDate: firstEnrollment.programStartDate,
            rawEndDate: firstEnrollment.programEndDate
          });
        }
      }
    }

    // Build payment phases based on plan type and frequency
    const phases = this.buildPaymentPhases(
      data.paymentPlan, 
      data.totalAmount, 
      data.paymentFrequency,
      programStartDate,
      programEndDate
    );
    console.log('📅 Built phases:', phases.length);

    // Create immediate PaymentIntent for the first payment
    const firstPhase = phases[0];
    let paymentIntent: Stripe.PaymentIntent;
    
    if (isTestMode) {
      // Mock payment intent for test environment
      const testFuturePhases = phases.slice(1).map(p => ({
        amount: p.amount,
        dueDate: p.dueDate.toISOString(),
        installmentNumber: p.installmentNumber,
        description: p.description
      }));
      
      paymentIntent = {
        id: `pi_test_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        object: 'payment_intent',
        amount: firstPhase.amount,
        currency: 'usd',
        client_secret: `pi_test_${Date.now()}_secret_${Math.random().toString(36).substring(7)}`,
        customer: customer.id,
        description: `ASA Learning Platform - ${data.paymentPlan} payment (${firstPhase.description})`,
        metadata: {
          enrollmentIds: JSON.stringify(data.enrollmentIds),
          parentEmail: data.parentEmail,
          paymentPlan: data.paymentPlan,
          paymentFrequency: data.paymentFrequency || 'one_time',
          totalAmount: data.totalAmount.toString(),
          installmentNumber: '1',
          totalInstallments: phases.length.toString(),
          futurePhases: JSON.stringify(testFuturePhases),
          createdBy: 'asa_payment_system',
          version: 'v3_post_confirmation_scheduling'
        },
        status: 'requires_payment_method',
        created: Math.floor(Date.now() / 1000)
      } as Stripe.PaymentIntent;
      console.log('🧪 Test mode: Created mock PaymentIntent:', paymentIntent.id);
    } else {
      const stripe = await getStripeClient();
      // Build metadata including membership if present
      // Store phases for scheduled payment creation at confirmation time
      const futurePhases = phases.slice(1).map(p => ({
        amount: p.amount,
        dueDate: p.dueDate.toISOString(),
        installmentNumber: p.installmentNumber,
        description: p.description
      }));
      
      const paymentMetadata: Record<string, string> = {
        enrollmentIds: JSON.stringify(data.enrollmentIds),
        parentEmail: data.parentEmail,
        paymentPlan: data.paymentPlan,
        paymentFrequency: data.paymentFrequency || 'one_time',
        totalAmount: data.totalAmount.toString(),
        installmentNumber: '1',
        totalInstallments: phases.length.toString(),
        futurePhases: JSON.stringify(futurePhases),
        createdBy: 'asa_payment_system',
        version: 'v3_post_confirmation_scheduling'
      };
      
      // Add membership metadata if present (derived server-side, not from client)
      if (data.membership) {
        paymentMetadata.hasMembership = 'true';
        paymentMetadata.membershipParentUserId = data.membership.parentUserId.toString();
        paymentMetadata.membershipSchoolId = data.membership.schoolId.toString();
        paymentMetadata.membershipAmount = data.membership.amount.toString();
        paymentMetadata.membershipYear = data.membership.year.toString();
        
        // Include discount info if a discount was applied
        if (data.membership.discountId) {
          paymentMetadata.membershipDiscountId = data.membership.discountId.toString();
          paymentMetadata.membershipDiscountName = data.membership.discountName || '';
          paymentMetadata.membershipOriginalAmount = (data.membership.originalAmount || data.membership.amount).toString();
          paymentMetadata.membershipDiscountAmount = (data.membership.discountAmount || 0).toString();
        }
        
        console.log('🎫 Adding membership metadata to payment intent:', {
          parentUserId: data.membership.parentUserId,
          schoolId: data.membership.schoolId,
          amount: data.membership.amount,
          year: data.membership.year,
          hasDiscount: !!data.membership.discountId,
          discountName: data.membership.discountName
        });
      }
      
      // Add discount snapshot metadata if present
      if (data.discountSnapshot) {
        paymentMetadata.discountSnapshot = JSON.stringify(data.discountSnapshot);
        paymentMetadata.subtotalAmount = data.discountSnapshot.subtotal.toString();
        paymentMetadata.discountTotal = data.discountSnapshot.discountTotal.toString();
        console.log('💰 Adding discount snapshot to payment metadata:', {
          subtotal: data.discountSnapshot.subtotal,
          discountTotal: data.discountSnapshot.discountTotal,
          discountsCount: data.discountSnapshot.appliedDiscounts.length
        });
      }
      
      // Add credits metadata if applied (unified credit system)
      if (data.creditsAppliedCents && data.creditsAppliedCents > 0) {
        paymentMetadata.creditsAppliedCents = data.creditsAppliedCents.toString();
        
        // Also store credit allocation breakdown if available
        if (data.creditAllocation) {
          paymentMetadata.creditAllocation = JSON.stringify(data.creditAllocation);
        }
        
        console.log('💰 Adding credits to payment metadata:', {
          creditsAppliedCents: data.creditsAppliedCents,
          creditAllocation: data.creditAllocation
        });
      }
      
      paymentIntent = await stripe.paymentIntents.create({
        amount: firstPhase.amount,
        currency: 'usd',
        customer: customer.id,
        description: `ASA Learning Platform - ${data.paymentPlan} payment (${firstPhase.description})`,
        metadata: paymentMetadata,
        automatic_payment_methods: {
          enabled: true
        }
      });
    }

    console.log('💳 PaymentIntent created for first payment:', paymentIntent.id, CurrencyUtils.toDisplay(firstPhase.amount));

    // Update enrollments with PaymentIntent reference
    await this.updateEnrollmentsWithPaymentIntent(data.enrollmentIds, paymentIntent.id, customer.id, data.paymentPlan);

    // NOTE: Scheduled payments are now created AFTER payment confirmation (not here)
    // This prevents orphaned scheduled payments when users change plans or abandon checkout
    // The phases data is stored in PaymentIntent metadata for use at confirmation time
    console.log('✅ PaymentIntent created successfully. Scheduled payments will be created after payment confirmation.');
    console.log('📅 Future phases to be scheduled after confirmation:', phases.length - 1);

    return {
      paymentIntent,
      scheduledPayments: [] // Empty - will be created at confirmation time
    };
  }

  /**
   * Create scheduled payments from PaymentIntent metadata after payment confirmation.
   * This method is called by the confirm endpoint after verifying payment success.
   * Includes idempotency check to prevent duplicate scheduled payments.
   */
  async createScheduledPaymentsFromConfirmedPayment(
    paymentIntentId: string,
    metadata: Record<string, string>
  ): Promise<{ created: number; skipped: boolean }> {
    console.log('📅 Creating scheduled payments from confirmed payment:', paymentIntentId);
    
    // Parse metadata
    const enrollmentIds: number[] = JSON.parse(metadata.enrollmentIds || '[]');
    const parentEmail = metadata.parentEmail;
    const paymentPlan = metadata.paymentPlan;
    const futurePhases = JSON.parse(metadata.futurePhases || '[]') as Array<{
      amount: number;
      dueDate: string;
      installmentNumber: number;
      description: string;
    }>;
    const totalInstallments = parseInt(metadata.totalInstallments || '1', 10);
    
    if (!enrollmentIds.length || !parentEmail) {
      console.log('⚠️ Missing enrollment IDs or parent email in metadata, skipping scheduled payment creation');
      return { created: 0, skipped: true };
    }
    
    if (futurePhases.length === 0) {
      console.log('✅ No future phases to schedule (full payment or single installment)');
      return { created: 0, skipped: false };
    }
    
    // Idempotency check: Check if scheduled payments already exist for these enrollments
    const existingPayments = await this.storage.getScheduledPaymentsByEnrollmentId(enrollmentIds[0]);
    const pendingPayments = existingPayments.filter(p => p.status === 'pending');
    
    if (pendingPayments.length > 0) {
      console.log(`⏭️ Scheduled payments already exist for enrollment ${enrollmentIds[0]} (${pendingPayments.length} pending). Skipping creation.`);
      return { created: 0, skipped: true };
    }
    
    // Get parent user and enrollment data
    const parentUser = await this.storage.getUserByEmail(parentEmail);
    if (!parentUser) {
      console.error(`❌ Parent user not found: ${parentEmail}`);
      return { created: 0, skipped: true };
    }
    
    const firstEnrollmentData = await this.storage.getEnrollmentById(enrollmentIds[0]);
    if (!firstEnrollmentData) {
      console.error(`❌ Enrollment not found: ${enrollmentIds[0]}`);
      return { created: 0, skipped: true };
    }
    
    const schoolId = firstEnrollmentData.schoolId || parentUser.schoolId;
    if (!schoolId) {
      console.error(`❌ No valid school ID found for parent ${parentEmail}`);
      return { created: 0, skipped: true };
    }
    
    // Fetch all enrollment data to calculate cost-weighted proportions
    const enrollmentDataList: Array<{ id: number; totalCost: number }> = [];
    let totalEnrollmentCost = 0;
    
    for (const enrollmentId of enrollmentIds) {
      const enrollmentData = await this.storage.getEnrollmentById(enrollmentId);
      if (enrollmentData) {
        const cost = enrollmentData.totalCost || 0;
        enrollmentDataList.push({ id: enrollmentId, totalCost: cost });
        totalEnrollmentCost += cost;
      }
    }
    
    const enrollmentCount = enrollmentIds.length;
    const enrollmentProportions = enrollmentDataList.map(e => ({
      id: e.id,
      proportion: totalEnrollmentCost > 0 ? e.totalCost / totalEnrollmentCost : 1 / enrollmentCount,
      totalCost: e.totalCost
    }));
    
    console.log('📊 Enrollment cost proportions:', enrollmentProportions.map(e => ({
      id: e.id,
      totalCost: CurrencyUtils.toDisplay(e.totalCost),
      proportion: `${(e.proportion * 100).toFixed(1)}%`
    })));
    
    // Create scheduled payments for each future phase
    let createdCount = 0;
    
    for (const phase of futurePhases) {
      const phaseDate = new Date(phase.dueDate);
      let allocatedAmount = 0;
      
      for (let j = 0; j < enrollmentProportions.length; j++) {
        const enrollment = enrollmentProportions[j];
        let enrollmentAmount: number;
        
        if (j === enrollmentProportions.length - 1) {
          enrollmentAmount = phase.amount - allocatedAmount;
        } else {
          enrollmentAmount = Math.round(phase.amount * enrollment.proportion);
          allocatedAmount += enrollmentAmount;
        }
        
        await this.storage.createScheduledPayment({
          schoolId: schoolId,
          enrollmentId: enrollment.id,
          parentId: parentUser.id,
          parentEmail: parentEmail,
          amount: enrollmentAmount,
          currency: 'usd',
          scheduledDate: phaseDate,
          frequency: 'one_time' as const,
          installmentNumber: phase.installmentNumber,
          totalInstallments: totalInstallments,
          status: 'pending' as const,
          stripePaymentIntentId: paymentIntentId,
          processedAt: null,
          failureReason: null,
          retryCount: 0,
          metadata: {
            enrollmentIds: enrollmentIds,
            paymentPlan: paymentPlan,
            description: phase.description,
            enrollmentIndex: j,
            totalEnrollments: enrollmentCount,
            isProportionalSplit: enrollmentCount > 1,
            proportion: enrollment.proportion,
            enrollmentTotalCost: enrollment.totalCost,
            createdFromConfirmation: true
          }
        });
        createdCount++;
        
        if (enrollmentCount > 1) {
          console.log(`📅 Scheduled payment ${phase.installmentNumber} for enrollment ${enrollment.id}: ${CurrencyUtils.toDisplay(enrollmentAmount)} due ${phaseDate.toLocaleDateString()}`);
        }
      }
      
      if (enrollmentCount === 1) {
        console.log(`📅 Scheduled payment ${phase.installmentNumber}: ${CurrencyUtils.toDisplay(phase.amount)} due ${phaseDate.toLocaleDateString()}`);
      }
    }
    
    console.log(`✅ Created ${createdCount} scheduled payments from confirmed payment ${paymentIntentId}`);
    return { created: createdCount, skipped: false };
  }

  /**
   * Get existing Stripe customer or create new one
   */
  private async getOrCreateCustomer(email: string): Promise<Stripe.Customer> {
    console.log('🔍 Looking for existing Stripe customer:', email);

    if (isTestMode) {
      // Mock customer for test environment
      const mockCustomer = {
        id: `cus_test_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        object: 'customer',
        email: email,
        created: Math.floor(Date.now() / 1000),
        metadata: {
          source: 'asa_learning_platform',
          created_by: 'payment_plan_service',
          test_mode: 'true'
        }
      } as Stripe.Customer;
      console.log('🧪 Test mode: Created mock customer:', mockCustomer.id);
      return mockCustomer;
    }

    const stripe = await getStripeClient();

    // Search for existing customer by email
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      console.log('✅ Found existing customer:', existingCustomers.data[0].id);
      return existingCustomers.data[0];
    }

    // Create new customer
    console.log('👤 Creating new Stripe customer for:', email);
    const customer = await stripe.customers.create({
      email: email,
      metadata: {
        source: 'asa_learning_platform',
        created_by: 'payment_plan_service'
      }
    });

    console.log('✅ New customer created:', customer.id);
    return customer;
  }

  /**
   * Build payment phases based on payment plan type
   */
  private buildPaymentPhases(
    plan: string, 
    totalAmount: number, 
    frequency?: PaymentFrequency,
    startDate?: Date | null,
    endDate?: Date | null
  ): PaymentPhase[] {
    console.log('🏗️ Building payment phases for plan:', plan, 'frequency:', frequency, 'amount:', CurrencyUtils.toDisplay(totalAmount));

    // Use date-based calculator if frequency is provided and dates are available
    if (frequency && frequency !== 'one_time' && startDate && endDate) {
      console.log('📅 Using date-based payment calculator with enrollment dates');
      const schedule = calculatePaymentSchedule(totalAmount, startDate, endDate, frequency);
      
      // Validate that all computed payments meet Stripe's minimum
      const hasPaymentBelowMinimum = 
        schedule.paymentAmount < STRIPE_MINIMUM_AMOUNT || 
        schedule.finalPaymentAmount < STRIPE_MINIMUM_AMOUNT;
      
      if (hasPaymentBelowMinimum) {
        // If any date-based payment would be below minimum, fall back to full payment
        console.warn(
          `⚠️ Date-based ${frequency} payment plan not viable for amount ${CurrencyUtils.toDisplay(totalAmount)} ` +
          `(${schedule.numberOfPayments} payments of ${CurrencyUtils.toDisplay(schedule.paymentAmount)} each would violate Stripe's $0.50 minimum) - ` +
          `using full payment instead`
        );
        return [{
          amount: totalAmount,
          dueDate: new Date(),
          installmentNumber: 1,
          description: 'Full Payment (amount below minimum for payment plans)'
        }];
      }
      
      return schedule.paymentDates.map((dueDate, index) => ({
        amount: index === schedule.paymentDates.length - 1 
          ? schedule.finalPaymentAmount 
          : schedule.paymentAmount,
        dueDate,
        installmentNumber: index + 1,
        description: `${frequency} payment ${index + 1} of ${schedule.numberOfPayments}`
      }));
    }

    // Fall back to legacy payment plan logic
    const now = new Date();
    const add30Days = (date: Date) => {
      const newDate = new Date(date);
      newDate.setDate(newDate.getDate() + 30);
      return newDate;
    };

    switch (plan) {
      case 'deposit':
        // 10% deposit now, 90% in 30 days
        // Ensure ALL payments meet Stripe's minimum of $0.50 (50 cents)
        const calculatedDeposit = Math.round(totalAmount * 0.1);
        const depositAmount = Math.max(calculatedDeposit, STRIPE_MINIMUM_AMOUNT);
        const balanceAmount = totalAmount - depositAmount;
        
        // Check if total amount is too small for any split payment plan
        if (totalAmount < STRIPE_MINIMUM_AMOUNT * 2 || balanceAmount < STRIPE_MINIMUM_AMOUNT || depositAmount >= totalAmount) {
          // If total is less than $1.00 or remaining balance would be below minimum, use full payment
          console.warn(`⚠️ Deposit plan not viable for amount ${CurrencyUtils.toDisplay(totalAmount)} - using full payment instead`);
          return [{
            amount: totalAmount, // Use exact total, validation already ensures it's >= $0.50
            dueDate: now,
            installmentNumber: 1,
            description: 'Full Payment (amount below minimum for payment plans)'
          }];
        }
        
        return [
          {
            amount: depositAmount,
            dueDate: now,
            installmentNumber: 1,
            description: `Deposit Payment (${depositAmount === calculatedDeposit ? '10%' : 'minimum $0.50'})`
          },
          {
            amount: balanceAmount,
            dueDate: add30Days(now),
            installmentNumber: 2,
            description: 'Balance Payment'
          }
        ];

      case 'biweekly':
        // Fallback: 4 biweekly payments (8 weeks total)
        // Note: This is only used when class dates are not available
        // Normally, the date-based calculator handles this plan
        const calculatedBiweekly = Math.round(totalAmount / 4);
        const biweeklyAmount = Math.max(calculatedBiweekly, STRIPE_MINIMUM_AMOUNT);
        const lastBiweeklyAmount = totalAmount - (biweeklyAmount * 3); // Handle rounding
        
        // Check if total amount is too small for 4 biweekly payments
        // Minimum for biweekly is $2.00 (4 payments × $0.50 each)
        if (totalAmount < STRIPE_MINIMUM_AMOUNT * 4 || lastBiweeklyAmount < STRIPE_MINIMUM_AMOUNT || biweeklyAmount * 4 > totalAmount * 1.5) {
          // If total is less than $2.00 or any payment would be below minimum, use full payment
          console.warn(`⚠️ Biweekly plan not viable for amount ${CurrencyUtils.toDisplay(totalAmount)} - using full payment instead`);
          return [{
            amount: totalAmount, // Use exact total, validation already ensures it's >= $0.50
            dueDate: now,
            installmentNumber: 1,
            description: 'Full Payment (amount below minimum for payment plans)'
          }];
        }
        
        const add14Days = (date: Date) => {
          const newDate = new Date(date);
          newDate.setDate(newDate.getDate() + 14);
          return newDate;
        };
        return [
          {
            amount: biweeklyAmount,
            dueDate: now,
            installmentNumber: 1,
            description: 'Biweekly Payment 1'
          },
          {
            amount: biweeklyAmount,
            dueDate: add14Days(now),
            installmentNumber: 2,
            description: 'Biweekly Payment 2'
          },
          {
            amount: biweeklyAmount,
            dueDate: add14Days(add14Days(now)),
            installmentNumber: 3,
            description: 'Biweekly Payment 3'
          },
          {
            amount: lastBiweeklyAmount,
            dueDate: add14Days(add14Days(add14Days(now))),
            installmentNumber: 4,
            description: 'Biweekly Payment 4'
          }
        ];

      case 'full':
        // Full payment now
        return [
          {
            amount: totalAmount,
            dueDate: now,
            installmentNumber: 1,
            description: 'Full Payment'
          }
        ];

      default:
        throw new Error(`Unsupported payment plan: ${plan}`);
    }
  }

  /**
   * Update enrollments with PaymentIntent references
   */
  private async updateEnrollmentsWithPaymentIntent(
    enrollmentIds: number[], 
    paymentIntentId: string, 
    customerId: string,
    paymentPlan: string
  ): Promise<void> {
    console.log('🔄 Updating enrollments with PaymentIntent references:', enrollmentIds);

    for (const enrollmentId of enrollmentIds) {
      const existingEnrollment = await this.storage.getEnrollmentById(enrollmentId);
      if (existingEnrollment) {
        await this.storage.updateEnrollment(enrollmentId, {
          ...existingEnrollment,
          stripeCustomerId: customerId,
          paymentSystemVersion: 'v2_stripe_simplified',
          paymentStatus: paymentPlan === 'full' ? 'pending' : 'partial_payment',
          migrationDate: new Date(),
          // Store payment plan info in metadata
          metadata: {
            ...existingEnrollment.metadata,
            paymentPlan,
            initialPaymentIntentId: paymentIntentId,
            stripeCustomerId: customerId
          }
        });
      }
      console.log(`✅ Updated enrollment ${enrollmentId} with PaymentIntent ${paymentIntentId}`);
    }
  }


  /**
   * Handle scheduled payment completion after manual payment or webhook
   */
  async handleScheduledPaymentCompleted(scheduledPaymentId: number, paymentIntentId: string): Promise<void> {
    console.log('📅 Processing scheduled payment completion:', scheduledPaymentId);

    const scheduledPayments = await this.storage.getAllScheduledPayments();
    const scheduledPayment = scheduledPayments.find(p => p.id === scheduledPaymentId);
    
    if (!scheduledPayment) {
      console.error('❌ Scheduled payment not found:', scheduledPaymentId);
      return;
    }

    // Update scheduled payment status
    await this.storage.updateScheduledPaymentStatus(scheduledPaymentId, 'paid');

    // Update enrollment balances
    const enrollmentIds = scheduledPayment.enrollmentIds;
    for (const enrollmentId of enrollmentIds) {
      const enrollment = await this.storage.getEnrollmentById(enrollmentId);
      if (enrollment) {
        const newPaidAmount = (enrollment.totalPaid || 0) + scheduledPayment.amount;
        const newBalance = Math.max(0, (enrollment.totalCost || 0) - newPaidAmount);

        await this.storage.updateEnrollment(enrollmentId, {
          ...enrollment,
          totalPaid: newPaidAmount,
          remainingBalance: newBalance,
          paymentStatus: newBalance === 0 ? 'completed' : 'partial_payment',
          lastPaymentDate: new Date()
        });
      }
    }

    console.log('✅ Scheduled payment completed and enrollments updated');
  }

  /**
   * Get upcoming scheduled payments for a parent
   */
  async getUpcomingPayments(parentEmail: string): Promise<any[]> {
    console.log('📅 Getting upcoming payments for:', parentEmail);
    
    const scheduledPayments = await this.storage.getScheduledPaymentsByParentEmail(parentEmail);
    
    return scheduledPayments
      .filter(payment => payment.status === 'pending')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }
}