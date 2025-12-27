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
  paymentPlan: 'deposit' | 'split' | 'biweekly' | 'full';
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
          totalAmount: data.totalAmount.toString(),
          installmentNumber: '1',
          totalInstallments: phases.length.toString(),
          createdBy: 'asa_payment_system',
          version: 'v2_stripe_simplified'
        },
        status: 'requires_payment_method',
        created: Math.floor(Date.now() / 1000)
      } as Stripe.PaymentIntent;
      console.log('🧪 Test mode: Created mock PaymentIntent:', paymentIntent.id);
    } else {
      const stripe = await getStripeClient();
      // Build metadata including membership if present
      const paymentMetadata: Record<string, string> = {
        enrollmentIds: JSON.stringify(data.enrollmentIds),
        parentEmail: data.parentEmail,
        paymentPlan: data.paymentPlan,
        totalAmount: data.totalAmount.toString(),
        installmentNumber: '1',
        totalInstallments: phases.length.toString(),
        createdBy: 'asa_payment_system',
        version: 'v2_stripe_simplified'
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

    // Get parent user and enrollment data for scheduled payment records
    const parentUser = await this.storage.getUserByEmail(data.parentEmail);
    if (!parentUser) {
      throw new Error(`Parent user not found: ${data.parentEmail}`);
    }
    
    const firstEnrollmentData = await this.storage.getEnrollmentById(data.enrollmentIds[0]);
    if (!firstEnrollmentData) {
      throw new Error(`Enrollment not found: ${data.enrollmentIds[0]}`);
    }
    
    const schoolId = firstEnrollmentData.schoolId || parentUser.schoolId;
    if (!schoolId) {
      throw new Error(`Cannot create scheduled payment: No valid school ID found for parent ${data.parentEmail}`);
    }

    // Create scheduled payments for remaining phases (if any)
    // IMPORTANT: Create a scheduled payment for EACH enrollment to ensure proper balance tracking
    // Split amounts proportionally based on each enrollment's actual cost (not evenly)
    const scheduledPayments = [];
    const enrollmentCount = data.enrollmentIds.length;
    
    // Fetch all enrollment data to calculate cost-weighted proportions
    const enrollmentDataList: Array<{ id: number; totalCost: number }> = [];
    let totalEnrollmentCost = 0;
    
    for (const enrollmentId of data.enrollmentIds) {
      const enrollmentData = await this.storage.getEnrollmentById(enrollmentId);
      if (enrollmentData) {
        const cost = enrollmentData.totalCost || 0;
        enrollmentDataList.push({ id: enrollmentId, totalCost: cost });
        totalEnrollmentCost += cost;
      }
    }
    
    // Calculate each enrollment's proportion of the total cost
    // If total is 0, fall back to equal split
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
    
    for (let i = 1; i < phases.length; i++) {
      const phase = phases[i];
      
      // Split the phase amount proportionally based on each enrollment's cost share
      let allocatedAmount = 0;
      
      for (let j = 0; j < enrollmentProportions.length; j++) {
        const enrollment = enrollmentProportions[j];
        let enrollmentAmount: number;
        
        if (j === enrollmentProportions.length - 1) {
          // Last enrollment gets the remainder to ensure exact total
          enrollmentAmount = phase.amount - allocatedAmount;
        } else {
          // Calculate proportional amount and round
          enrollmentAmount = Math.round(phase.amount * enrollment.proportion);
          allocatedAmount += enrollmentAmount;
        }
        
        const scheduledPayment = await this.storage.createScheduledPayment({
          schoolId: schoolId,
          enrollmentId: enrollment.id,
          parentId: parentUser.id,
          parentEmail: data.parentEmail,
          amount: enrollmentAmount,
          currency: 'usd',
          scheduledDate: phase.dueDate,
          frequency: 'one_time' as const,
          installmentNumber: phase.installmentNumber,
          totalInstallments: phases.length,
          status: 'pending' as const,
          stripePaymentIntentId: null,
          processedAt: null,
          failureReason: null,
          retryCount: 0,
          metadata: {
            enrollmentIds: data.enrollmentIds,
            paymentPlan: data.paymentPlan,
            description: phase.description,
            enrollmentIndex: j,
            totalEnrollments: enrollmentCount,
            isProportionalSplit: enrollmentCount > 1,
            proportion: enrollment.proportion,
            enrollmentTotalCost: enrollment.totalCost
          }
        });
        scheduledPayments.push(scheduledPayment);
        
        if (enrollmentCount > 1) {
          console.log(`📅 Scheduled payment ${phase.installmentNumber} for enrollment ${enrollment.id}: ${CurrencyUtils.toDisplay(enrollmentAmount)} (${(enrollment.proportion * 100).toFixed(1)}% of phase) due ${phase.dueDate.toLocaleDateString()}`);
        }
      }
      
      if (enrollmentCount === 1) {
        console.log(`📅 Scheduled payment ${phase.installmentNumber}: ${CurrencyUtils.toDisplay(phase.amount)} due ${phase.dueDate.toLocaleDateString()}`);
      } else {
        console.log(`📅 Scheduled payment ${phase.installmentNumber}: ${CurrencyUtils.toDisplay(phase.amount)} split proportionally across ${enrollmentCount} enrollments`);
      }
    }

    // Update enrollments with PaymentIntent reference
    await this.updateEnrollmentsWithPaymentIntent(data.enrollmentIds, paymentIntent.id, customer.id, data.paymentPlan);

    console.log('✅ Payment plan created successfully with PaymentIntent and', scheduledPayments.length, 'scheduled payments');

    return {
      paymentIntent,
      scheduledPayments
    };
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

      case 'split':
        // 50% now, 50% in 30 days
        // Ensure ALL payments meet Stripe's minimum
        const calculatedFirstHalf = Math.round(totalAmount * 0.5);
        const firstHalf = Math.max(calculatedFirstHalf, STRIPE_MINIMUM_AMOUNT);
        const secondHalf = totalAmount - firstHalf;
        
        // Check if total amount is too small for split payments
        if (totalAmount < STRIPE_MINIMUM_AMOUNT * 2 || secondHalf < STRIPE_MINIMUM_AMOUNT) {
          // If total is less than $1.00 or second payment would be below minimum, use full payment
          console.warn(`⚠️ Split plan not viable for amount ${CurrencyUtils.toDisplay(totalAmount)} - using full payment instead`);
          return [{
            amount: totalAmount, // Use exact total, validation already ensures it's >= $0.50
            dueDate: now,
            installmentNumber: 1,
            description: 'Full Payment (amount below minimum for payment plans)'
          }];
        }
        
        return [
          {
            amount: firstHalf,
            dueDate: now,
            installmentNumber: 1,
            description: 'First Payment (50%)'
          },
          {
            amount: secondHalf,
            dueDate: add30Days(now),
            installmentNumber: 2,
            description: 'Second Payment (50%)'
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