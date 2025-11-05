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
  status?: "enrolled" | "completed" | "withdrawn" | "cancelled" | "waitlist";
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

  // Calculate remaining balance
  const totalCost = paymentDetails.totalCost;
  const totalPaid = paymentDetails.totalPaid ?? 0;
  const remainingBalance = totalCost - totalPaid;

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
