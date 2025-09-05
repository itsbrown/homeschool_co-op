import Stripe from 'stripe';
import { MemStorage } from '../storage';
import { CurrencyUtils } from '../../shared/currency-utils';

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
  paymentPlan: 'deposit' | 'split' | 'monthly' | 'full';
}

export interface StripePhase {
  items: Array<{ price: string }>;
  iterations: number;
  start_date?: number;
}

export class StripePaymentPlanService {
  constructor(private storage: MemStorage) {}

  /**
   * Create a Stripe subscription schedule for payment plans
   */
  async createEducationalPaymentPlan(data: PaymentPlanData): Promise<Stripe.SubscriptionSchedule> {
    console.log('🎯 Creating Stripe payment plan:', {
      parentEmail: data.parentEmail,
      enrollmentIds: data.enrollmentIds,
      totalAmount: CurrencyUtils.toDisplay(data.totalAmount),
      paymentPlan: data.paymentPlan
    });

    // Get or create Stripe customer
    const customer = await this.getOrCreateCustomer(data.parentEmail);
    console.log('👤 Customer ready:', customer.id);

    // Build payment phases based on plan type
    const phases = await this.buildPaymentPhases(data.paymentPlan, data.totalAmount);
    console.log('📅 Built phases:', phases.length);

    // Create subscription schedule
    const schedule = await stripe.subscriptionSchedules.create({
      customer: customer.id,
      start_date: 'now',
      end_behavior: 'cancel',
      phases,
      metadata: {
        enrollmentIds: JSON.stringify(data.enrollmentIds),
        parentEmail: data.parentEmail,
        paymentPlan: data.paymentPlan,
        totalAmount: data.totalAmount.toString(),
        createdBy: 'asa_payment_system',
        version: 'v2_stripe'
      }
    });

    console.log('✅ Stripe subscription schedule created:', schedule.id);

    // Store in our database
    await this.storage.createStripeSubscriptionSchedule({
      stripeScheduleId: schedule.id,
      parentEmail: data.parentEmail,
      enrollmentIds: data.enrollmentIds,
      totalAmount: data.totalAmount,
      paymentPlan: data.paymentPlan,
      status: 'active',
      currentPhase: 1,
      totalPhases: phases.length,
      nextPaymentDate: this.calculateNextPaymentDate(data.paymentPlan),
      metadata: {
        stripeCustomerId: customer.id,
        originalPlan: data.paymentPlan
      }
    });

    // Update enrollments with Stripe references
    await this.updateEnrollmentsWithStripe(data.enrollmentIds, schedule.id, customer.id);

    return schedule;
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
   private async buildPaymentPhases(plan: string, totalAmount: number): Promise<StripePhase[]> {
    console.log('🏗️ Building payment phases for plan:', plan, 'amount:', CurrencyUtils.toDisplay(totalAmount));

    switch (plan) {
      case 'deposit':
        // 10% deposit now, 90% in 30 days
        const depositAmount = Math.round(totalAmount * 0.1);
        const balanceAmount = totalAmount - depositAmount;
        const depositPriceId = await this.createOneTimePrice(depositAmount, 'Deposit Payment');
        const balancePriceId = await this.createOneTimePrice(balanceAmount, 'Balance Payment');
        return [
          {
            items: [{ price: depositPriceId }],
            iterations: 1
          },
          {
            items: [{ price: balancePriceId }],
            iterations: 1,
            start_date: this.addDays(new Date(), 30).getTime() / 1000
          }
        ];

      case 'split':
        // 50% now, 50% in 30 days
        const firstHalf = Math.round(totalAmount * 0.5);
        const secondHalf = totalAmount - firstHalf;
        const firstPriceId = await this.createOneTimePrice(firstHalf, 'First Payment');
        const secondPriceId = await this.createOneTimePrice(secondHalf, 'Second Payment');
        return [
          {
            items: [{ price: firstPriceId }],
            iterations: 1
          },
          {
            items: [{ price: secondPriceId }],
            iterations: 1,
            start_date: this.addDays(new Date(), 30).getTime() / 1000
          }
        ];

      case 'monthly':
        // 3 monthly payments
        const monthlyAmount = Math.round(totalAmount / 3);
        const lastMonthAmount = totalAmount - (monthlyAmount * 2); // Handle rounding
        const month1PriceId = await this.createOneTimePrice(monthlyAmount, 'Month 1 Payment');
        const month2PriceId = await this.createOneTimePrice(monthlyAmount, 'Month 2 Payment');
        const month3PriceId = await this.createOneTimePrice(lastMonthAmount, 'Month 3 Payment');
        return [
          {
            items: [{ price: month1PriceId }],
            iterations: 1
          },
          {
            items: [{ price: month2PriceId }],
            iterations: 1,
            start_date: this.addDays(new Date(), 30).getTime() / 1000
          },
          {
            items: [{ price: month3PriceId }],
            iterations: 1,
            start_date: this.addDays(new Date(), 60).getTime() / 1000
          }
        ];

      case 'full':
        // Full payment now
        const fullPriceId = await this.createOneTimePrice(totalAmount, 'Full Payment');
        return [
          {
            items: [{ price: fullPriceId }],
            iterations: 1
          }
        ];

      default:
        throw new Error(`Unsupported payment plan: ${plan}`);
    }
  }

  /**
   * Create a one-time price for Stripe
   */
  private async createOneTimePrice(amount: number, description: string): Promise<string> {
    console.log('💰 Creating Stripe price:', CurrencyUtils.toDisplay(amount), description);

    const price = await stripe.prices.create({
      unit_amount: amount,
      currency: 'usd',
      product_data: {
        name: `ASA Learning Platform - ${description}`
      },
      metadata: {
        service: 'asa_payment_plan',
        type: 'one_time_payment',
        description: description
      }
    });

    console.log('✅ Price created:', price.id);
    return price.id;
  }

  /**
   * Update enrollments with Stripe subscription schedule references
   */
  private async updateEnrollmentsWithStripe(
    enrollmentIds: number[], 
    scheduleId: string, 
    customerId: string
  ): Promise<void> {
    console.log('🔄 Updating enrollments with Stripe references:', enrollmentIds);

    for (const enrollmentId of enrollmentIds) {
      await this.storage.updateEnrollment(enrollmentId, {
        stripeSubscriptionScheduleId: scheduleId,
        stripeCustomerId: customerId,
        paymentSystemVersion: 'v2_stripe',
        paymentStatus: 'stripe_managed',
        migrationDate: new Date()
      });
      console.log(`✅ Updated enrollment ${enrollmentId} with Stripe schedule ${scheduleId}`);
    }
  }

  /**
   * Calculate next payment date based on payment plan
   */
  private calculateNextPaymentDate(plan: string): Date | null {
    switch (plan) {
      case 'deposit':
      case 'split':
        return this.addDays(new Date(), 30);
      case 'monthly':
        return this.addDays(new Date(), 30);
      case 'full':
        return null; // No future payments
      default:
        return null;
    }
  }

  /**
   * Add days to a date
   */
  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Handle Stripe webhook events for subscription schedules
   */
  async handleStripeWebhook(event: Stripe.Event): Promise<void> {
    console.log('🔔 Processing Stripe webhook:', event.type);

    switch (event.type) {
      case 'subscription_schedule.phase_started':
        await this.handlePhaseStarted(event.data.object as Stripe.SubscriptionSchedule);
        break;

      case 'invoice.payment_succeeded':
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription_schedule) {
          await this.handleSchedulePaymentSuccess(invoice);
        }
        break;

      case 'invoice.payment_failed':
        const failedInvoice = event.data.object as Stripe.Invoice;
        if (failedInvoice.subscription_schedule) {
          await this.handleSchedulePaymentFailure(failedInvoice);
        }
        break;

      case 'subscription_schedule.completed':
        await this.handleScheduleCompleted(event.data.object as Stripe.SubscriptionSchedule);
        break;

      default:
        console.log('ℹ️ Unhandled webhook event type:', event.type);
    }
  }

  /**
   * Handle subscription schedule phase started
   */
  private async handlePhaseStarted(schedule: Stripe.SubscriptionSchedule): Promise<void> {
    console.log('📅 Subscription schedule phase started:', schedule.id);

    // Update our database record
    const dbSchedule = await this.storage.getStripeSubscriptionScheduleByStripeId(schedule.id);
    if (dbSchedule) {
      await this.storage.updateStripeSubscriptionSchedule(dbSchedule.id, {
        currentPhase: schedule.current_phase?.start_date ? 
          Math.floor((Date.now() / 1000 - schedule.current_phase.start_date) / (30 * 24 * 60 * 60)) + 1 : 
          dbSchedule.currentPhase + 1,
        lastPaymentDate: new Date()
      });
    }

    // Send payment reminder email (implement as needed)
    console.log('📧 Would send payment reminder email for schedule:', schedule.id);
  }

  /**
   * Handle successful payment for subscription schedule
   */
  private async handleSchedulePaymentSuccess(invoice: Stripe.Invoice): Promise<void> {
    console.log('✅ Schedule payment succeeded:', invoice.id);

    const scheduleId = invoice.subscription_schedule as string;
    const dbSchedule = await this.storage.getStripeSubscriptionScheduleByStripeId(scheduleId);

    if (dbSchedule) {
      // Update payment tracking
      await this.storage.updateStripeSubscriptionSchedule(dbSchedule.id, {
        lastPaymentDate: new Date(),
        currentPhase: dbSchedule.currentPhase + 1
      });

      // Update enrollment balances
      const enrollments = await this.storage.getEnrollmentsByIds(dbSchedule.enrollmentIds);
      for (const enrollment of enrollments) {
        const newPaidAmount = (enrollment.totalPaid || 0) + (invoice.amount_paid || 0);
        const newBalance = Math.max(0, (enrollment.totalCost || 0) - newPaidAmount);

        await this.storage.updateEnrollment(enrollment.id, {
          totalPaid: newPaidAmount,
          remainingBalance: newBalance,
          paymentStatus: newBalance === 0 ? 'paid' : 'stripe_managed'
        });
      }

      console.log('✅ Updated enrollment balances for schedule:', scheduleId);
    }
  }

  /**
   * Handle failed payment for subscription schedule
   */
  private async handleSchedulePaymentFailure(invoice: Stripe.Invoice): Promise<void> {
    console.log('❌ Schedule payment failed:', invoice.id);

    // Stripe will automatically retry failed payments
    // We can send additional notifications here if needed
    console.log('🔄 Stripe will handle payment retries automatically');
  }

  /**
   * Handle completed subscription schedule
   */
  private async handleScheduleCompleted(schedule: Stripe.SubscriptionSchedule): Promise<void> {
    console.log('🎉 Subscription schedule completed:', schedule.id);

    const dbSchedule = await this.storage.getStripeSubscriptionScheduleByStripeId(schedule.id);
    if (dbSchedule) {
      await this.storage.updateStripeSubscriptionSchedule(dbSchedule.id, {
        status: 'completed',
        completedDate: new Date()
      });

      // Mark all enrollments as fully paid
      const enrollments = await this.storage.getEnrollmentsByIds(dbSchedule.enrollmentIds);
      for (const enrollment of enrollments) {
        await this.storage.updateEnrollment(enrollment.id, {
          paymentStatus: 'paid',
          remainingBalance: 0
        });
      }

      console.log('✅ Marked all enrollments as completed for schedule:', schedule.id);
    }
  }
}