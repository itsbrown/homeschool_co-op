import Stripe from 'stripe';
import { IStorage } from '../storage';
import { CurrencyUtils } from '../../shared/currency-utils';
import { InsertScheduledPayment } from '@shared/schema';
import {
  buildBiweeklyCheckoutPhases,
  buildBiweeklyPhasesFromInstallmentMetadata,
} from '../lib/biweekly-checkout-contract';
import { checkoutAnchorDate } from '../lib/payment-calculator';
import { calculatePaymentSchedule, PaymentFrequency } from '../lib/payment-calculator';
import { getStripeClient } from '../config/stripe';
import {
  mapCheckoutPlanToDbPaymentPlan,
  normalizeCheckoutPaymentPlanRequest,
  type CheckoutPaymentPlanId,
} from '@shared/checkout-payment-plan';
import { resolveEnrollmentIdsFromScheduledRow } from '../lib/scheduled-payment-intent-metadata';

/** Read at call time — env is set in Jest beforeAll after this module may have loaded. */
function skipStripeApiInTests(): boolean {
  return (
    process.env.NODE_ENV === 'test' &&
    process.env.ENABLE_STRIPE_PREFLIGHT_IN_TESTS !== 'true'
  );
}

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
  /** Volunteer credits applied to this checkout (card charge = totalAmount). */
  creditsAppliedCents?: number;
  /** Gross cents owed before credits (enrollments + membership in cart). */
  originalAmountCents?: number;
  /** Parent user id for credit consumption on webhook success. */
  creditUserId?: number;
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
    const normalized = normalizeCheckoutPaymentPlanRequest(
      data.paymentPlan,
      data.paymentFrequency ?? 'one_time',
    );
    if (normalized.corrected) {
      console.warn('⚠️ Checkout payment plan/frequency mismatch corrected:', {
        requestedPlan: data.paymentPlan,
        requestedFrequency: data.paymentFrequency,
        paymentPlan: normalized.paymentPlan,
        paymentFrequency: normalized.paymentFrequency,
      });
    }
    data.paymentPlan = normalized.paymentPlan as PaymentPlanData['paymentPlan'];
    data.paymentFrequency = normalized.paymentFrequency;

    console.log('🎯 Creating Stripe payment plan:', {
      parentEmail: data.parentEmail,
      enrollmentIds: data.enrollmentIds,
      totalAmount: CurrencyUtils.toDisplay(data.totalAmount),
      paymentPlan: data.paymentPlan,
      paymentFrequency: data.paymentFrequency || 'one_time',
      creditsAppliedCents: data.creditsAppliedCents ?? 0,
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

    await this.cancelOrphanPendingScheduledPayments(
      data.parentEmail,
      data.enrollmentIds,
    );

    // Get enrollment data for date-based scheduling if needed.
    // Earliest start + latest end across all enrollments in this checkout so
    // multi-class carts match cart-pricing / parent expectations.
    let programStartDate: Date | null = null;
    let programEndDate: Date | null = null;
    
    if (data.paymentFrequency && data.paymentFrequency !== 'one_time' && data.enrollmentIds.length > 0) {
      for (const enrollmentId of data.enrollmentIds) {
        const enrollment = await this.storage.getEnrollmentById(enrollmentId);
        if (!enrollment?.programStartDate || !enrollment?.programEndDate) {
          continue;
        }
        const parsedStartDate = new Date(enrollment.programStartDate);
        const parsedEndDate = new Date(enrollment.programEndDate);
        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          console.warn('⚠️ Invalid enrollment dates on enrollment', enrollmentId, {
            rawStartDate: enrollment.programStartDate,
            rawEndDate: enrollment.programEndDate,
          });
          continue;
        }
        if (!programStartDate || parsedStartDate < programStartDate) {
          programStartDate = parsedStartDate;
        }
        if (!programEndDate || parsedEndDate > programEndDate) {
          programEndDate = parsedEndDate;
        }
      }
      if (programStartDate && programEndDate) {
        console.log('📅 Using enrollment date span for payment schedule:', {
          enrollmentCount: data.enrollmentIds.length,
          startDate: programStartDate.toLocaleDateString(),
          endDate: programEndDate.toLocaleDateString(),
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
    let paymentIntent: Stripe.PaymentIntent;

    const appliedCredits = Math.floor(data.creditsAppliedCents ?? 0);

    if (skipStripeApiInTests()) {
      // Inline PaymentIntent when tests are not exercising the Stripe client mock
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
          paymentFrequency: data.paymentFrequency ?? 'one_time',
          totalAmount: data.totalAmount.toString(),
          installmentNumber: '1',
          totalInstallments: phases.length.toString(),
          createdBy: 'asa_payment_system',
          version: 'v2_stripe_simplified',
          ...(appliedCredits > 0
            ? {
                creditsAppliedCents: String(appliedCredits),
                originalAmountCents: String(
                  data.originalAmountCents != null && data.originalAmountCents > 0
                    ? Math.floor(data.originalAmountCents)
                    : data.totalAmount + appliedCredits
                ),
                ...(data.creditUserId != null && data.creditUserId > 0
                  ? { userId: String(Math.floor(data.creditUserId)) }
                  : {}),
              }
            : {}),
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
        paymentFrequency: data.paymentFrequency ?? 'one_time',
        totalAmount: data.totalAmount.toString(),
        installmentNumber: '1',
        totalInstallments: phases.length.toString(),
        createdBy: 'asa_payment_system',
        version: 'v2_stripe_simplified'
      };

      if (appliedCredits > 0) {
        paymentMetadata.creditsAppliedCents = String(appliedCredits);
        const gross =
          data.originalAmountCents != null && data.originalAmountCents > 0
            ? Math.floor(data.originalAmountCents)
            : data.totalAmount + appliedCredits;
        paymentMetadata.originalAmountCents = String(gross);
        if (data.creditUserId != null && data.creditUserId > 0) {
          paymentMetadata.userId = String(Math.floor(data.creditUserId));
        }
      }
      
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

    // Installments 2+ are created only after installment 1 succeeds (webhook).
    const scheduledPayments: any[] = [];

    // Update enrollments with PaymentIntent reference
    await this.updateEnrollmentsWithPaymentIntent(
      data.enrollmentIds,
      paymentIntent.id,
      customer.id,
      data.paymentPlan as CheckoutPaymentPlanId,
      data.paymentFrequency ?? 'one_time',
    );

    console.log(
      '✅ Payment plan created with PaymentIntent for installment 1;',
      phases.length > 1
        ? `${phases.length - 1} future installments will be scheduled after payment succeeds`
        : 'single payment plan',
    );

    return {
      paymentIntent,
      scheduledPayments,
    };
  }

  /**
   * After checkout installment 1 succeeds, persist installments 2..N in scheduled_payments.
   * Idempotent per checkout PaymentIntent id.
   */
  async persistRemainingScheduledPaymentsAfterFirstCheckoutPayment(
    paymentIntent: Pick<Stripe.PaymentIntent, 'id' | 'metadata' | 'amount'>,
  ): Promise<any[]> {
    const meta = paymentIntent.metadata as Record<string, string | undefined>;
    const parentEmail = meta.parentEmail;
    const enrollmentIdsRaw = meta.enrollmentIds;
    if (!parentEmail || !enrollmentIdsRaw) {
      console.warn(
        '⚠️ Skipping scheduled payment creation — missing parentEmail or enrollmentIds on PI',
        paymentIntent.id,
      );
      return [];
    }

    let enrollmentIds: number[] = [];
    try {
      const parsed = JSON.parse(enrollmentIdsRaw) as unknown;
      if (Array.isArray(parsed)) {
        enrollmentIds = parsed.filter(
          (id): id is number => typeof id === 'number' && Number.isFinite(id),
        );
      }
    } catch {
      console.warn('⚠️ Invalid enrollmentIds JSON on PI', paymentIntent.id);
      return [];
    }
    if (enrollmentIds.length === 0) return [];

    const totalInstallments = parseInt(String(meta.totalInstallments ?? '1'), 10) || 1;
    const installmentNumber = parseInt(String(meta.installmentNumber ?? '1'), 10) || 1;
    if (totalInstallments <= 1 || installmentNumber !== 1) {
      return [];
    }

    const existing = await this.storage.getScheduledPaymentsByParentEmail(parentEmail);
    const alreadyCreated = existing.some((row) => {
      const rowMeta = row.metadata as Record<string, unknown> | null | undefined;
      return rowMeta?.checkoutPaymentIntentId === paymentIntent.id;
    });
    if (alreadyCreated) {
      console.log('ℹ️ Scheduled payments already exist for checkout PI', paymentIntent.id);
      return existing.filter((row) => {
        const rowMeta = row.metadata as Record<string, unknown> | null | undefined;
        return rowMeta?.checkoutPaymentIntentId === paymentIntent.id;
      });
    }

    const normalized = normalizeCheckoutPaymentPlanRequest(
      meta.paymentPlan ?? 'full',
      meta.paymentFrequency ?? 'one_time',
    );
    const totalAmountCents = parseInt(String(meta.totalAmount ?? '0'), 10) || 0;
    if (totalAmountCents <= 0) {
      console.warn('⚠️ Skipping scheduled payments — missing totalAmount on PI', paymentIntent.id);
      return [];
    }

    const parentUser = await this.storage.getUserByEmail(parentEmail);
    if (!parentUser) return [];

    let programStartDate: Date | null = null;
    let programEndDate: Date | null = null;
    for (const enrollmentId of enrollmentIds) {
      const enrollment = await this.storage.getEnrollmentById(enrollmentId);
      if (!enrollment?.programStartDate || !enrollment?.programEndDate) continue;
      const parsedStartDate = new Date(enrollment.programStartDate);
      const parsedEndDate = new Date(enrollment.programEndDate);
      if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) continue;
      if (!programStartDate || parsedStartDate < programStartDate) {
        programStartDate = parsedStartDate;
      }
      if (!programEndDate || parsedEndDate > programEndDate) {
        programEndDate = parsedEndDate;
      }
    }

    const phases = this.buildPaymentPhases(
      normalized.paymentPlan,
      totalAmountCents,
      normalized.paymentFrequency,
      programStartDate,
      programEndDate,
    );

    let effectivePhases = phases;
    const metaInstallmentCount = parseInt(String(meta.totalInstallments ?? '1'), 10) || 1;
    if (
      metaInstallmentCount > 1 &&
      effectivePhases.length !== metaInstallmentCount &&
      (normalized.paymentPlan === 'biweekly' || meta.paymentPlan === 'biweekly')
    ) {
      console.warn(
        `⚠️ Scheduled payment rebuild got ${effectivePhases.length} phases but PI metadata says ${metaInstallmentCount} — using metadata-aligned biweekly schedule`,
        paymentIntent.id,
      );
      effectivePhases = buildBiweeklyPhasesFromInstallmentMetadata(
        totalAmountCents,
        metaInstallmentCount,
        checkoutAnchorDate(),
      ).map((phase) => ({
        amount: phase.amount,
        dueDate: phase.dueDate,
        installmentNumber: phase.installmentNumber,
        description: `Biweekly payment ${phase.installmentNumber} of ${metaInstallmentCount}`,
      }));
    }

    if (effectivePhases.length <= 1) return [];

    const firstEnrollment = await this.storage.getEnrollmentById(enrollmentIds[0]);
    const schoolId = firstEnrollment?.schoolId || parentUser.schoolId;
    if (!schoolId) return [];

    const created: any[] = [];
    for (let i = 1; i < effectivePhases.length; i++) {
      const phase = effectivePhases[i];
      const row = await this.storage.createScheduledPayment({
        schoolId,
        enrollmentId: enrollmentIds[0],
        parentId: parentUser.id,
        parentEmail,
        amount: phase.amount,
        currency: 'usd',
        scheduledDate: phase.dueDate,
        frequency: 'one_time' as const,
        installmentNumber: phase.installmentNumber,
        totalInstallments: effectivePhases.length,
        status: 'pending' as const,
        stripePaymentIntentId: null,
        processedAt: null,
        failureReason: null,
        retryCount: 0,
        metadata: {
          enrollmentIds,
          paymentPlan: normalized.paymentPlan,
          description: phase.description,
          autoPay: true,
          checkoutPaymentIntentId: paymentIntent.id,
        },
      });
      created.push(row);
    }

    console.log(
      `📅 Created ${created.length} scheduled payments after successful checkout PI ${paymentIntent.id}`,
    );
    return created;
  }

  /** Cancel stale pending rows from abandoned checkouts for the same enrollments. */
  private async cancelOrphanPendingScheduledPayments(
    parentEmail: string,
    enrollmentIds: number[],
  ): Promise<void> {
    const idSet = new Set(enrollmentIds);
    const rows = await this.storage.getScheduledPaymentsByParentEmail(parentEmail);
    for (const row of rows) {
      if (String(row.status) !== 'pending') continue;
      const linked = resolveEnrollmentIdsFromScheduledRow(row);
      if (!linked.some((id) => idSet.has(id))) continue;
      await this.storage.updateScheduledPaymentStatus(row.id, 'cancelled');
      console.log(`🧹 Cancelled orphan pending scheduled payment ${row.id} for ${parentEmail}`);
    }
  }

  /**
   * Get existing Stripe customer or create new one
   */
  private async getOrCreateCustomer(email: string): Promise<Stripe.Customer> {
    console.log('🔍 Looking for existing Stripe customer:', email);

    if (skipStripeApiInTests()) {
      // Inline customer when tests are not exercising the Stripe client mock
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

    // Biweekly checkout: only when plan is biweekly (never from orphaned frequency alone).
    if (plan === 'biweekly' && frequency === 'biweekly' && startDate && endDate) {
      console.log('📅 Using checkout biweekly schedule (matches cart / autopay due dates)');
      const phases = buildBiweeklyCheckoutPhases(totalAmount, startDate, endDate, checkoutAnchorDate());
      if (phases.length < 2) {
        console.warn('⚠️ Biweekly checkout schedule collapsed — using full payment');
        return [
          {
            amount: totalAmount,
            dueDate: new Date(),
            installmentNumber: 1,
            description: 'Full Payment (program too short for biweekly plan)',
          },
        ];
      }
      const belowMinimum = phases.some(
        (p) => p.amount < STRIPE_MINIMUM_AMOUNT,
      );
      if (belowMinimum) {
        console.warn(
          `⚠️ Biweekly installments below Stripe minimum for ${CurrencyUtils.toDisplay(totalAmount)} — using full payment`,
        );
        return [
          {
            amount: totalAmount,
            dueDate: new Date(),
            installmentNumber: 1,
            description: 'Full Payment (amount below minimum for payment plans)',
          },
        ];
      }
      return phases.map((phase) => ({
        amount: phase.amount,
        dueDate: phase.dueDate,
        installmentNumber: phase.installmentNumber,
        description: `Biweekly payment ${phase.installmentNumber} of ${phases.length}`,
      }));
    }

    // Weekly/monthly installments: split plan with explicit frequency only
    if (
      plan === 'split' &&
      frequency &&
      frequency !== 'one_time' &&
      startDate &&
      endDate
    ) {
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
    paymentPlan: CheckoutPaymentPlanId,
    paymentFrequency: PaymentFrequency,
  ): Promise<void> {
    console.log('🔄 Updating enrollments with PaymentIntent references:', enrollmentIds);

    const dbPaymentPlan = mapCheckoutPlanToDbPaymentPlan(paymentPlan);

    for (const enrollmentId of enrollmentIds) {
      const existingEnrollment = await this.storage.getEnrollmentById(enrollmentId);
      if (existingEnrollment) {
        const priorMeta =
          (existingEnrollment.metadata as Record<string, unknown> | null) ?? {};
        await this.storage.updateEnrollment(enrollmentId, {
          stripeCustomerId: customerId,
          paymentPlan: dbPaymentPlan,
          paymentFrequency,
          paymentSystemVersion: 'v2_stripe_simplified',
          paymentStatus: 'pending',
          metadata: {
            ...priorMeta,
            paymentPlan,
            initialPaymentIntentId: paymentIntentId,
            stripeCustomerId: customerId,
          },
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