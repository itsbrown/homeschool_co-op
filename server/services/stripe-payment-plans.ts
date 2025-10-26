import Stripe from 'stripe';
import { IStorage } from '../storage';
import { CurrencyUtils } from '../../shared/currency-utils';
import { InsertScheduledPayment } from '@shared/schema';
import { calculatePaymentSchedule, PaymentFrequency } from '../lib/payment-calculator';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil'
});

export interface PaymentPlanData {
  parentEmail: string;
  enrollmentIds: number[];
  totalAmount: number; // In cents
  paymentPlan: 'deposit' | 'split' | 'biweekly' | 'full';
  paymentFrequency?: PaymentFrequency; // Optional: for date-based payment schedules
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

    // Get or create Stripe customer
    const customer = await this.getOrCreateCustomer(data.parentEmail);
    console.log('👤 Customer ready:', customer.id);

    // Get enrollment data for date-based scheduling if needed
    let programStartDate: Date | null = null;
    let programEndDate: Date | null = null;
    
    if (data.paymentFrequency && data.paymentFrequency !== 'one_time' && data.enrollmentIds.length > 0) {
      const firstEnrollment = await this.storage.getEnrollmentById(data.enrollmentIds[0]);
      if (firstEnrollment?.programStartDate && firstEnrollment?.programEndDate) {
        programStartDate = new Date(firstEnrollment.programStartDate);
        programEndDate = new Date(firstEnrollment.programEndDate);
        console.log('📅 Using enrollment dates for payment schedule:', {
          startDate: programStartDate.toLocaleDateString(),
          endDate: programEndDate.toLocaleDateString()
        });
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
    const paymentIntent = await stripe.paymentIntents.create({
      amount: firstPhase.amount,
      currency: 'usd',
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
      automatic_payment_methods: {
        enabled: true
      }
    });

    console.log('💳 PaymentIntent created for first payment:', paymentIntent.id, CurrencyUtils.toDisplay(firstPhase.amount));

    // Create scheduled payments for remaining phases (if any)
    const scheduledPayments = [];
    for (let i = 1; i < phases.length; i++) {
      const phase = phases[i];
      const scheduledPayment = await this.storage.createScheduledPayment({
        parentEmail: data.parentEmail,
        enrollmentIds: data.enrollmentIds,
        paymentPlan: data.paymentPlan,
        installmentNumber: phase.installmentNumber,
        totalInstallments: phases.length,
        amount: phase.amount,
        currency: 'usd',
        dueDate: phase.dueDate,
        status: 'pending' as const,
        originalPaymentId: null, // Will be updated after first payment succeeds
        description: phase.description
      });
      scheduledPayments.push(scheduledPayment);
      console.log(`📅 Scheduled payment ${phase.installmentNumber}: ${CurrencyUtils.toDisplay(phase.amount)} due ${phase.dueDate.toLocaleDateString()}`);
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
        const depositAmount = Math.round(totalAmount * 0.1);
        const balanceAmount = totalAmount - depositAmount;
        return [
          {
            amount: depositAmount,
            dueDate: now,
            installmentNumber: 1,
            description: 'Deposit Payment (10%)'
          },
          {
            amount: balanceAmount,
            dueDate: add30Days(now),
            installmentNumber: 2,
            description: 'Balance Payment (90%)'
          }
        ];

      case 'split':
        // 50% now, 50% in 30 days
        const firstHalf = Math.round(totalAmount * 0.5);
        const secondHalf = totalAmount - firstHalf;
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
        const biweeklyAmount = Math.round(totalAmount / 4);
        const lastBiweeklyAmount = totalAmount - (biweeklyAmount * 3); // Handle rounding
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
          paymentStatus: paymentPlan === 'full' ? 'pending_payment' : 'payment_plan_active',
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
          paymentStatus: newBalance === 0 ? 'paid' : 'payment_plan_active',
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