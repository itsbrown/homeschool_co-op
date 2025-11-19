/**
 * Enrollment Factory - Single Source of Truth for Creating Enrollment Data
 * 
 * This factory function ensures ALL required fields are provided when creating enrollments.
 * TypeScript will throw compilation errors if any required fields are missing.
 * 
 * Usage:
 *   const enrollmentData = createEnrollmentData({
 *     child,
 *     classInfo,
 *     parent,
 *     classType: 'marketplace',
 *     paymentDetails: { ... }
 *   });
 *   await storage.createProgramEnrollment(enrollmentData);
 */

import type { InsertProgramEnrollment } from "./schema";

/**
 * Validates that monetary value is in cents (not dollars)
 * Throws error for values that appear to be dollar-denominated
 * 
 * CRITICAL: All monetary values must be stored in CENTS per schema.ts
 * This validation prevents dollar-to-cent conversion bugs in class enrollments
 * 
 * @param value - The monetary value to validate
 * @param fieldName - Name of the field being validated (for error messages)
 * @throws Error if value appears to be in dollars instead of cents
 */
function validateMonetaryValueInCents(value: number | null | undefined, fieldName: string): void {
  // Skip validation for null/undefined/zero values
  if (!value || value === 0) return;

  // BLOCK all values under $10 (1000 cents) for class enrollments
  // Rationale: No legitimate class enrollment should have values this low
  // - Class prices are typically $50+ (5000+ cents)
  // - Deposits (10% of price) are typically $5+ (500+ cents)
  // - Any value < 1000 cents is almost certainly a dollar amount
  //
  // Examples of BLOCKED values (likely dollars):
  //   100 cents = $1.00 → probably meant $100 (10,000 cents)
  //   200 cents = $2.00 → probably meant $200 (20,000 cents)
  //   75 cents = $0.75 → probably meant $75 (7,500 cents)
  //   995 cents = $9.95 → probably meant $995 (99,500 cents)
  //
  // Examples of ALLOWED values (legitimate cents):
  //   2500 cents = $25.00 deposit ✓
  //   4900 cents = $49.00 discounted price ✓
  //   147000 cents = $1,470.00 class price ✓
  if (value > 0 && value < 1000) {
    throw new Error(
      `❌ VALIDATION ERROR: ${fieldName} = ${value} cents ($${(value / 100).toFixed(2)}) is BLOCKED. ` +
      `Class enrollments should never have values under $10 (1000 cents). ` +
      `This appears to be a dollar value instead of cents. ` +
      `If you meant $${value.toFixed(2)}, pass ${value * 100} cents instead. ` +
      `Schema requirement: All monetary values MUST be in CENTS (shared/schema.ts).`
    );
  }
  
  // Log diagnostic info for monetary values to help troubleshoot issues
  if (value > 0 && value < 10000) {
    console.log(
      `💰 ${fieldName}: ${value} cents = $${(value / 100).toFixed(2)}`
    );
  }
}

/**
 * Child data required for enrollment
 */
export interface EnrollmentChildInput {
  id: number;
  firstName: string;
  lastName: string;
  parentId: number;
  parentEmail: string;
}

/**
 * Class/Program data required for enrollment
 */
export interface EnrollmentClassInput {
  id: number;
  title: string;
  schoolId: number;
  price: number; // in cents
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}

/**
 * Parent/User data required for enrollment
 */
export interface EnrollmentParentInput {
  id: number;
  email: string;
}

/**
 * Payment details for enrollment
 */
export interface EnrollmentPaymentDetails {
  totalCost: number; // in cents
  depositRequired?: number; // in cents, defaults to 0
  totalPaid?: number; // in cents, defaults to 0
  paymentStatus?: "pending" | "deposit_paid" | "partial_payment" | "completed" | "stripe_managed" | "refunded";
  paymentPlan?: "full_payment" | "deposit_only" | "biweekly" | "custom" | null;
  paymentFrequency?: "weekly" | "biweekly" | "monthly" | "one_time";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

/**
 * Enrollment status options
 */
export interface EnrollmentStatusDetails {
  status?: "pending_payment" | "enrolled" | "waitlist" | "cancelled" | "completed" | "withdrawn" | "failed";
  waitlistPosition?: number | null;
}

/**
 * Optional metadata
 */
export interface EnrollmentMetadata {
  variantId?: string | null;
  notes?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Complete input parameters for creating an enrollment
 */
export interface CreateEnrollmentInput {
  child: EnrollmentChildInput;
  classInfo: EnrollmentClassInput;
  parent: EnrollmentParentInput;
  classType: "school_class" | "marketplace";
  schoolClassId?: number | null; // For school_class type
  marketplaceClassId?: number | null; // For marketplace type
  programId?: number | null; // Legacy support
  paymentDetails: EnrollmentPaymentDetails;
  statusDetails?: EnrollmentStatusDetails;
  metadata?: EnrollmentMetadata;
}

/**
 * Factory function to create a complete enrollment data object
 * 
 * This function enforces ALL required fields at compile-time.
 * If you forget a field, TypeScript will error.
 * 
 * @param input - Complete enrollment parameters
 * @returns InsertProgramEnrollment ready for database insertion
 */
export function createEnrollmentData(input: CreateEnrollmentInput): InsertProgramEnrollment {
  const {
    child,
    classInfo,
    parent,
    classType,
    schoolClassId,
    marketplaceClassId,
    programId,
    paymentDetails,
    statusDetails = {},
    metadata = {},
  } = input;

  // Validate class type matches provided IDs
  if (classType === "school_class" && !schoolClassId) {
    throw new Error("schoolClassId is required when classType is 'school_class'");
  }
  if (classType === "marketplace" && !marketplaceClassId) {
    throw new Error("marketplaceClassId is required when classType is 'marketplace'");
  }

  // CRITICAL: Validate monetary values are in CENTS, not DOLLARS
  validateMonetaryValueInCents(paymentDetails.totalCost, 'paymentDetails.totalCost');
  validateMonetaryValueInCents(paymentDetails.depositRequired, 'paymentDetails.depositRequired');
  validateMonetaryValueInCents(paymentDetails.totalPaid, 'paymentDetails.totalPaid');

  // Calculate remaining balance
  const totalCost = paymentDetails.totalCost;
  const totalPaid = paymentDetails.totalPaid ?? 0;
  const remainingBalance = totalCost - totalPaid;
  
  // Validate calculated remaining balance
  validateMonetaryValueInCents(remainingBalance, 'remainingBalance (calculated)');

  // Convert dates to proper format
  const programStartDate = classInfo.startDate 
    ? (typeof classInfo.startDate === 'string' ? classInfo.startDate : classInfo.startDate.toISOString().split('T')[0])
    : null;
  const programEndDate = classInfo.endDate 
    ? (typeof classInfo.endDate === 'string' ? classInfo.endDate : classInfo.endDate.toISOString().split('T')[0])
    : null;

  // Return complete enrollment object with ALL required fields
  return {
    // School and class identification
    schoolId: classInfo.schoolId,
    classType,
    classId: schoolClassId ?? null,
    marketplaceClassId: marketplaceClassId ?? null,
    programId: programId ?? null,

    // Child information
    childId: child.id,
    childName: `${child.firstName} ${child.lastName}`,

    // Class information
    className: classInfo.title,
    variantId: metadata.variantId ?? null,

    // Parent information
    parentId: parent.id,
    parentEmail: parent.email,

    // Financial fields (all in cents)
    totalCost,
    totalPaid,
    remainingBalance,
    depositRequired: paymentDetails.depositRequired ?? 0,

    // Payment tracking
    paymentStatus: paymentDetails.paymentStatus ?? "pending",
    paymentPlan: paymentDetails.paymentPlan ?? null,
    paymentFrequency: paymentDetails.paymentFrequency ?? "one_time",
    paymentSystemVersion: "v2_stripe",

    // Program dates for payment calculations
    programStartDate,
    programEndDate,

    // Enrollment status
    status: statusDetails.status ?? "enrolled",
    waitlistPosition: statusDetails.waitlistPosition ?? null,
    enrollmentDate: new Date(),

    // Stripe integration
    stripeSubscriptionId: paymentDetails.stripeSubscriptionId ?? null,
    stripeCustomerId: paymentDetails.stripeCustomerId ?? null,

    // Metadata
    notes: metadata.notes ?? null,
    metadata: metadata.metadata ?? {},
  };
}

/**
 * Helper function to create enrollment for marketplace classes
 * Convenience wrapper with classType pre-set to 'marketplace'
 */
export function createMarketplaceEnrollmentData(
  input: Omit<CreateEnrollmentInput, "classType" | "schoolClassId"> & { marketplaceClassId: number }
): InsertProgramEnrollment {
  return createEnrollmentData({
    ...input,
    classType: "marketplace",
    schoolClassId: null,
  });
}

/**
 * Helper function to create enrollment for school classes
 * Convenience wrapper with classType pre-set to 'school_class'
 */
export function createSchoolClassEnrollmentData(
  input: Omit<CreateEnrollmentInput, "classType" | "marketplaceClassId"> & { schoolClassId: number }
): InsertProgramEnrollment {
  return createEnrollmentData({
    ...input,
    classType: "school_class",
    marketplaceClassId: null,
  });
}

/**
 * Simplified flat parameters for enrollment creation
 * Use this when you have individual fields instead of nested objects
 */
export interface SimpleEnrollmentParams {
  // School and class
  schoolId: number | null;
  classId: number | null;
  className: string;
  classType: "school_class" | "marketplace";
  
  // Child
  childId: number;
  childName: string;
  
  // Parent
  parentId: number;
  parentEmail: string;
  
  // Financial (all in cents)
  totalCost: number;
  depositRequired?: number;
  totalPaid?: number;
  remainingBalance?: number;
  
  // Payment
  paymentStatus?: "pending" | "deposit_paid" | "partial_payment" | "completed" | "stripe_managed" | "refunded";
  paymentPlan?: "full_payment" | "deposit_only" | "biweekly" | "custom" | null;
  paymentFrequency?: "weekly" | "biweekly" | "monthly" | "one_time";
  
  // Program dates
  programStartDate: string | Date | null;
  programEndDate: string | Date | null;
  
  // Optional
  programId?: number | null;
  marketplaceClassId?: number | null;
  variantId?: string | null;
  status?: "pending_payment" | "enrolled" | "waitlist" | "cancelled" | "completed" | "withdrawn" | "failed";
  waitlistPosition?: number | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  notes?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Simplified factory function for flat parameters
 * Use this when you have individual enrollment fields
 */
export function createEnrollmentDataSimple(params: SimpleEnrollmentParams): InsertProgramEnrollment {
  // CRITICAL: Validate monetary values are in CENTS, not DOLLARS
  validateMonetaryValueInCents(params.totalCost, 'totalCost');
  validateMonetaryValueInCents(params.depositRequired, 'depositRequired');
  validateMonetaryValueInCents(params.totalPaid, 'totalPaid');
  validateMonetaryValueInCents(params.remainingBalance, 'remainingBalance');

  // Convert dates to proper format
  const programStartDate = params.programStartDate 
    ? (typeof params.programStartDate === 'string' ? params.programStartDate : params.programStartDate.toISOString().split('T')[0])
    : null;
  const programEndDate = params.programEndDate 
    ? (typeof params.programEndDate === 'string' ? params.programEndDate : params.programEndDate.toISOString().split('T')[0])
    : null;

  return {
    // School and class identification
    schoolId: params.schoolId,
    classType: params.classType,
    classId: params.classId,
    marketplaceClassId: params.marketplaceClassId ?? null,
    programId: params.programId ?? null,

    // Child information
    childId: params.childId,
    childName: params.childName,

    // Class information
    className: params.className,
    variantId: params.variantId ?? null,

    // Parent information
    parentId: params.parentId,
    parentEmail: params.parentEmail,

    // Financial fields (all in cents)
    totalCost: params.totalCost,
    totalPaid: params.totalPaid ?? 0,
    remainingBalance: params.remainingBalance ?? (params.totalCost - (params.totalPaid ?? 0)),
    depositRequired: params.depositRequired ?? 0,

    // Payment tracking
    paymentStatus: params.paymentStatus ?? "pending",
    paymentPlan: params.paymentPlan ?? null,
    paymentFrequency: params.paymentFrequency ?? "one_time",
    paymentSystemVersion: "v2_stripe",

    // Program dates for payment calculations
    programStartDate,
    programEndDate,

    // Enrollment status
    status: params.status ?? "enrolled",
    waitlistPosition: params.waitlistPosition ?? null,
    enrollmentDate: new Date(),

    // Stripe integration
    stripeSubscriptionId: params.stripeSubscriptionId ?? null,
    stripeCustomerId: params.stripeCustomerId ?? null,

    // Metadata
    notes: params.notes ?? null,
    metadata: params.metadata ?? {},
  };
}
