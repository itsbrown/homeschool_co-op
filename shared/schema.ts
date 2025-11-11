import { pgTable, text, serial, integer, boolean, jsonb, timestamp, date, varchar, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Define the enum for user roles
const roleEnum = pgEnum('role', ["student", "parent", "teacher", "schoolAdmin", "admin", "superAdmin"]);

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  auth0Id: varchar('auth0_id', { length: 255 }).unique(), // Link to Auth0 user ID
  supabaseId: text("supabase_id").unique(), // Link to Supabase auth.users
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: roleEnum("role").default("student").notNull(),
  name: text("name").notNull(),
  firstName: text("first_name"), // User's first name
  lastName: text("last_name"), // User's last name
  avatar: text("avatar"),
  subscription: text("subscription", { enum: ["free", "individual", "family", "educator", "institutional"] }).default("free").notNull(),
  permissions: jsonb("permissions").default({}).notNull(), // Custom permissions
  schoolId: integer("school_id"), // Link user to school
  phone: text("phone"), // User's phone number
  emergencyContactFirstName: text("emergency_contact_first_name"), // Emergency contact first name
  emergencyContactLastName: text("emergency_contact_last_name"), // Emergency contact last name
  emergencyContactPhone: text("emergency_contact_phone"), // Emergency contact phone
  emergencyContactRelationship: text("emergency_contact_relationship"), // Emergency contact relationship
  isActive: boolean("is_active").default(true).notNull(),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Define user relations
// Schools/Co-ops table
export const schools = pgTable("schools", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["school", "co-op", "homeschool_group", "other"] }).notNull(),
  adminId: integer("admin_id").notNull(),
  address: text("address"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  phoneNumber: text("phone_number"),
  email: text("email").notNull(),
  website: text("website"),
  logo: text("logo"), 
  description: text("description"),
  foundedYear: integer("founded_year"),
  accreditation: text("accreditation"),
  enrollmentSize: integer("enrollment_size"),
  isVerified: boolean("is_verified").default(false).notNull(),
  status: text("status", { enum: ["pending", "active", "inactive", "suspended"] }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  registrationCode: text("registration_code").unique(), // Unique code for registration links
  
  // Membership Configuration
  membershipFeeAmount: integer("membership_fee_amount").default(0), // Annual membership fee in cents
  membershipRenewalMonth: integer("membership_renewal_month").default(9), // Month for renewal (1-12, default September)
  membershipRenewalDay: integer("membership_renewal_day").default(1), // Day for renewal (1-31)
  membershipGracePeriodDays: integer("membership_grace_period_days").default(30), // Grace period in days
  membershipDescription: text("membership_description"), // Benefits description
  membershipRequired: boolean("membership_required").default(true), // Whether membership is required
  
  // "Free After X" Discount Configuration
  freeAfterThresholdEnabled: boolean("free_after_threshold_enabled").default(false), // Enable/disable "free after X children" discount
  freeAfterThreshold: integer("free_after_threshold").default(3), // Number of children before free enrollments apply (default: 3, meaning 4th+ child gets discounts)
});

export const insertSchoolSchema = createInsertSchema(schools)
  .omit({ id: true, createdAt: true, updatedAt: true, adminId: true, isVerified: true })
  .extend({
    // Set default values for nullable fields
    address: z.string().nullable().default(null),
    phoneNumber: z.string().nullable().default(null),
    website: z.string().nullable().default(null),
    logo: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
    foundedYear: z.number().nullable().default(null),
    accreditation: z.string().nullable().default(null),
    enrollmentSize: z.number().nullable().default(null),
    registrationCode: z.string().nullable().default(null),
    
    // Membership configuration fields
    membershipFeeAmount: z.number().default(0),
    membershipRenewalMonth: z.number().min(1).max(12).default(9),
    membershipRenewalDay: z.number().min(1).max(31).default(1),
    membershipGracePeriodDays: z.number().default(30),
    
    // "Free After X" Discount Configuration
    freeAfterThresholdEnabled: z.boolean().default(false),
    freeAfterThreshold: z.number().int().min(1).default(3),
    membershipDescription: z.string().nullable().default(null),
    membershipRequired: z.boolean().default(true),
  });
export type InsertSchool = z.infer<typeof insertSchoolSchema>;
export type School = typeof schools.$inferSelect;

// School Applications table - for schools applying to join the platform
export const schoolApplications = pgTable("school_applications", {
  id: serial("id").primaryKey(),
  
  // School Information
  schoolName: text("school_name").notNull(),
  schoolType: text("school_type", { enum: ["public", "private", "charter", "homeschool_coop", "other"] }).notNull(),
  schoolTypeOther: text("school_type_other"),
  
  // Contact Information
  adminFirstName: text("admin_first_name").notNull(),
  adminLastName: text("admin_last_name").notNull(),
  adminEmail: text("admin_email").notNull(),
  adminPhone: text("admin_phone").notNull(),
  
  // School Details
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  website: text("website"),
  
  // School Stats
  currentStudentCount: integer("current_student_count").notNull(),
  gradeLevelsServed: text("grade_levels_served").array().notNull(),
  establishedYear: integer("established_year").notNull(),
  
  // Platform Interest
  reasonForJoining: text("reason_for_joining").notNull(),
  currentChallenges: text("current_challenges").notNull(),
  expectedStudentGrowth: integer("expected_student_growth").notNull(),
  
  // References
  reference1Name: text("reference1_name").notNull(),
  reference1Email: text("reference1_email").notNull(),
  reference1Relationship: text("reference1_relationship").notNull(),
  reference2Name: text("reference2_name"),
  reference2Email: text("reference2_email"),
  reference2Relationship: text("reference2_relationship"),
  
  // Agreement
  agreesToTerms: boolean("agrees_to_terms").notNull(),
  agreesToDataSharing: boolean("agrees_to_data_sharing").notNull(),
  
  // Application status
  status: text("status", { enum: ["pending", "under_review", "approved", "declined"] }).default("pending").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by"),
  reviewNotes: text("review_notes"),
  
  // Security token for application verification
  token: text("token").notNull().unique(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSchoolApplicationSchema = createInsertSchema(schoolApplications)
  .omit({ id: true, createdAt: true, updatedAt: true, submittedAt: true, reviewedAt: true, reviewedBy: true, reviewNotes: true, token: true, status: true })
  .extend({
    schoolTypeOther: z.string().optional(),
    website: z.string().optional(),
    reference2Name: z.string().optional(),
    reference2Email: z.string().optional(),
    reference2Relationship: z.string().optional(),
  });
export type InsertSchoolApplication = z.infer<typeof insertSchoolApplicationSchema>;
export type SchoolApplication = typeof schoolApplications.$inferSelect;

// School-Student relationship table (for students affiliated with a school)
export const schoolStudents = pgTable("school_students", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  locationId: integer("location_id").references(() => locations.id), // Multi-location support
  childId: integer("child_id").notNull().references(() => children.id),
  enrollmentDate: timestamp("enrollment_date").defaultNow().notNull(),
  grade: text("grade").notNull(),
  status: text("status", { enum: ["active", "inactive", "graduated", "transferred"] }).default("active").notNull(),
  studentId: text("student_id"), // School's internal ID for the student
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSchoolStudentSchema = createInsertSchema(schoolStudents)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    // Set default values for nullable fields
    studentId: z.string().nullable().default(null),
    notes: z.string().nullable().default(null),
  });
export type InsertSchoolStudent = z.infer<typeof insertSchoolStudentSchema>;
export type SchoolStudent = typeof schoolStudents.$inferSelect;

// School-Staff relationship table (for teachers/staff of a school)
export const schoolStaff = pgTable("school_staff", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  locationId: integer("location_id").references(() => locations.id), // Multi-location support
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["teacher", "administrator", "staff", "other"] }).notNull(),
  position: text("position").notNull(), // specific job title
  department: text("department"),
  startDate: timestamp("start_date").defaultNow().notNull(),
  endDate: timestamp("end_date"), // null if currently employed
  isActive: boolean("is_active").default(true).notNull(),
  permissions: jsonb("permissions").default({}).notNull(), // JSON object for granular permissions
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSchoolStaffSchema = createInsertSchema(schoolStaff)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    // Set default values for nullable fields
    department: z.string().nullable().default(null),
    endDate: z.date().nullable().default(null),
  });
export type InsertSchoolStaff = z.infer<typeof insertSchoolStaffSchema>;
export type SchoolStaff = typeof schoolStaff.$inferSelect;

// Staff Positions (job titles/roles available at a school)
export const staffPositions = pgTable("staff_positions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false).notNull(),
  schoolId: integer("school_id").references(() => schools.id), // null for global positions
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStaffPositionSchema = createInsertSchema(staffPositions)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    description: z.string().nullable().default(null),
    schoolId: z.number().nullable().default(null),
  });
export type InsertStaffPosition = z.infer<typeof insertStaffPositionSchema>;
export type StaffPosition = typeof staffPositions.$inferSelect;

// Staff Invitations (pending staff member invitations)
export const staffInvitations = pgTable("staff_invitations", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  email: text("email").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role", { enum: ["teacher", "administrator", "staff", "other"] }).notNull(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  locationId: integer("location_id").references(() => locations.id),
  classId: integer("class_id"),
  message: text("message"),
  status: text("status", { enum: ["pending", "accepted", "expired", "cancelled"] }).default("pending").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStaffInvitationSchema = createInsertSchema(staffInvitations)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    locationId: z.number().nullable().default(null),
    classId: z.number().nullable().default(null),
    message: z.string().nullable().default(null),
  });
export type InsertStaffInvitation = z.infer<typeof insertStaffInvitationSchema>;
export type StaffInvitation = typeof staffInvitations.$inferSelect;

// Password Reset Tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  email: text("email").notNull(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens)
  .omit({ id: true, createdAt: true });
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// School classes specifically created for a school
export const schoolClasses = pgTable("school_classes", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  locationId: integer("location_id").references(() => locations.id), // Multi-location support
  title: text("title").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  gradeLevel: text("grade_level").notNull(),
  teacherId: integer("teacher_id").references(() => users.id),
  academicYear: text("academic_year").notNull(), // e.g., "2024-2025"
  semester: text("semester"), // Fall, Spring, etc.
  schedule: jsonb("schedule").notNull(), // JSON object with schedule details - supports variants
  // schedule structure: { variants: [{ name: string, startTime: string, endTime: string, days: string[] }] }
  location: text("location"),
  maxEnrollment: integer("max_enrollment").notNull(),
  currentEnrollment: integer("current_enrollment").default(0).notNull(),
  curriculumId: integer("curriculum_id").references(() => curricula.id),
  status: text("status", { enum: ["draft", "active", "completed", "cancelled"] }).default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSchoolClassSchema = createInsertSchema(schoolClasses)
  .omit({ id: true, createdAt: true, updatedAt: true, currentEnrollment: true })
  .extend({
    // Set default values for nullable fields
    description: z.string().nullable().default(null),
    teacherId: z.number().nullable().default(null),
    semester: z.string().nullable().default(null),
    location: z.string().nullable().default(null),
    curriculumId: z.number().nullable().default(null),
  });
export type InsertSchoolClass = z.infer<typeof insertSchoolClassSchema>;
export type SchoolClass = typeof schoolClasses.$inferSelect;

// Class Variant types for the schedule JSON structure
export interface ClassVariant {
  id: string;
  name: string; // e.g., "Morning Session", "Afternoon Session"
  startTime: string; // e.g., "9:00 AM"
  endTime: string; // e.g., "12:00 PM"
  days: string[]; // e.g., ["Monday", "Wednesday", "Friday"]
  price: number; // Price in cents for this specific variant
}

export interface ClassSchedule {
  variants: ClassVariant[];
  description?: string; // Optional legacy description field
}

// Validation schema for class variants
export const classVariantSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Variant name is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  days: z.array(z.string()).min(1, "At least one day must be selected"),
  price: z.number().min(0, "Price must be a positive number"),
});

export const classScheduleSchema = z.object({
  variants: z.array(classVariantSchema).min(1, "At least one variant is required"),
  description: z.string().optional(),
});

// Class enrollments for school classes
export const schoolClassEnrollments = pgTable("school_class_enrollments", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().references(() => schoolClasses.id),
  studentId: integer("student_id").notNull().references(() => schoolStudents.id),
  enrollmentDate: timestamp("enrollment_date").defaultNow().notNull(),
  grade: text("grade"), // final grade for the class
  status: text("status", { enum: ["pending_payment", "enrolled", "waitlist", "cancelled", "completed", "withdrawn", "failed"] }).default("enrolled").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSchoolClassEnrollmentSchema = createInsertSchema(schoolClassEnrollments)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    // Set default values for nullable fields
    grade: z.string().nullable().default(null),
    notes: z.string().nullable().default(null),
  });
export type InsertSchoolClassEnrollment = z.infer<typeof insertSchoolClassEnrollmentSchema>;
export type SchoolClassEnrollment = typeof schoolClassEnrollments.$inferSelect;

// Update user relations to include schools
export const usersRelations = relations(users, ({ many, one }) => ({
  curricula: many(curricula),
  lessons: many(lessons),
  events: many(events),
  marketplaceItems: many(marketplaceItems),
  knowledgeBases: many(knowledgeBases),
  children: many(children),
  emergencyContacts: many(emergencyContacts),
  administeredSchools: many(schools),
  schoolStaffPositions: many(schoolStaff)
}));

// Children table for parent registration
export const children = pgTable("children", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").notNull().references(() => users.id),
  parentEmail: text("parent_email"), // Used for linking children to parents via email
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  birthdate: date("birthdate").notNull(),
  gradeLevel: text("grade_level").notNull(),
  gender: text("gender"),
  school: text("school"),
  schoolId: integer("school_id").references(() => schools.id),
  locationId: integer("location_id").references(() => locations.id),
  learningStyle: text("learning_style"),
  specialNeeds: text("special_needs"),
  interests: text("interests").array(),
  allergies: text("allergies"),
  medicalInfo: text("medical_info"),
  profileImage: text("profile_image"),
  emergencyContact: text("emergency_contact"),
  additionalLanguages: text("additional_languages"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertChildSchema = createInsertSchema(children)
  .omit({ id: true, createdAt: true, updatedAt: true, parentId: true })
  .extend({
    // Set default values for nullable fields
    gender: z.string().nullable().default(null),
    school: z.string().nullable().default(null),
    schoolId: z.number().nullable().default(null),
    locationId: z.number().nullable().default(null),
    learningStyle: z.string().nullable().default(null),
    specialNeeds: z.string().nullable().default(null),
    interests: z.array(z.string()).nullable().default(null),
    allergies: z.string().nullable().default(null),
    medicalInfo: z.string().nullable().default(null),
    profileImage: z.string().nullable().default(null),
    emergencyContact: z.string().nullable().default(null),
    additionalLanguages: z.string().nullable().default(null),
    notes: z.string().nullable().default(null)
  });
export type InsertChild = z.infer<typeof insertChildSchema>;
export type Child = typeof children.$inferSelect;

// Define child relations - note: programEnrollments will be defined later
export const childrenRelations = relations(children, ({ one, many }) => ({
  parent: one(users, { fields: [children.parentId], references: [users.id] })
  // programEnrollments relation will be added after the programEnrollments table is defined
}));

// Emergency contacts table
export const emergencyContacts = pgTable("emergency_contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  relationship: text("relationship").notNull(),
  phoneNumber: text("phone_number").notNull(),
  email: text("email"),
  isAuthorizedPickup: boolean("is_authorized_pickup").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEmergencyContactSchema = createInsertSchema(emergencyContacts)
  .omit({ id: true, createdAt: true, updatedAt: true, userId: true })
  .extend({
    // Set default values for nullable fields
    email: z.string().nullable().default(null),
    isAuthorizedPickup: z.boolean().default(false)
  });
export type InsertEmergencyContact = z.infer<typeof insertEmergencyContactSchema>;
export type EmergencyContact = typeof emergencyContacts.$inferSelect;

// Program Enrollments table - for paid class enrollments with financial tracking
// Unified table for both school_classes and marketplace classes
export const programEnrollments = pgTable("program_enrollments", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  
  // Class type to distinguish between school-specific and marketplace classes
  classType: text("class_type", { 
    enum: ["school_class", "marketplace"] 
  }).default("school_class").notNull(),
  
  // Class references - use classId for school_classes, marketplaceClassId for marketplace classes
  classId: integer("class_id").references(() => schoolClasses.id), // For school_class type
  marketplaceClassId: integer("marketplace_class_id").references(() => classes.id), // For marketplace type
  programId: integer("program_id"), // Legacy field for backward compatibility
  childId: integer("child_id").notNull().references(() => children.id),
  childName: text("child_name").notNull(), // Denormalized for reporting
  className: text("class_name").notNull(), // Denormalized for reporting
  variantId: text("variant_id"), // Class variant/schedule selection
  parentId: integer("parent_id").notNull().references(() => users.id),
  parentEmail: text("parent_email").notNull(),
  
  // Financial fields (all amounts in cents)
  totalCost: integer("total_cost").notNull(),
  totalPaid: integer("total_paid").default(0).notNull(),
  remainingBalance: integer("remaining_balance").notNull(),
  depositRequired: integer("deposit_required").default(0).notNull(),
  
  // Payment tracking
  paymentStatus: text("payment_status", { 
    enum: ["pending", "deposit_paid", "partial_payment", "completed", "stripe_managed", "refunded"] 
  }).default("pending").notNull(),
  paymentPlan: text("payment_plan", { 
    enum: ["full_payment", "deposit_only", "biweekly", "custom"] 
  }),
  paymentFrequency: text("payment_frequency", {
    enum: ["weekly", "biweekly", "monthly", "one_time"]
  }).default("one_time"),
  paymentSystemVersion: text("payment_system_version").default("v2_stripe"), // Track migration versions
  
  // Program dates for payment calculations
  programStartDate: date("program_start_date"), // Copied from class for payment schedule
  programEndDate: date("program_end_date"), // Copied from class for payment schedule
  
  // Enrollment status
  status: text("status", { 
    enum: ["pending_payment", "enrolled", "waitlist", "cancelled", "completed", "withdrawn", "failed"] 
  }).default("enrolled").notNull(),
  waitlistPosition: integer("waitlist_position"), // Position in waitlist (null if not waitlisted)
  enrollmentDate: timestamp("enrollment_date").defaultNow().notNull(),
  
  // Stripe integration
  stripeSubscriptionId: text("stripe_subscription_id"), // For subscription-based payments
  stripeCustomerId: text("stripe_customer_id"), // Parent's Stripe customer ID
  
  // Metadata for additional info
  notes: text("notes"),
  metadata: jsonb("metadata").default({}).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProgramEnrollmentSchema = createInsertSchema(programEnrollments)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    classType: z.enum(["school_class", "marketplace"]).default("school_class"),
    programId: z.number().nullable().default(null),
    classId: z.number().nullable().default(null),
    marketplaceClassId: z.number().nullable().default(null),
    variantId: z.string().nullable().default(null),
    depositRequired: z.number().default(0),
    totalPaid: z.number().default(0),
    paymentPlan: z.enum(["full_payment", "deposit_only", "biweekly", "custom"]).nullable().default(null),
    stripeSubscriptionId: z.string().nullable().default(null),
    stripeCustomerId: z.string().nullable().default(null),
    notes: z.string().nullable().default(null),
    metadata: z.record(z.any()).default({}),
  });
export type InsertProgramEnrollment = z.infer<typeof insertProgramEnrollmentSchema>;
export type ProgramEnrollment = typeof programEnrollments.$inferSelect;

// Payments table - for tracking all payment transactions
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  
  // Parent/payer information
  parentId: integer("parent_id").references(() => users.id),
  parentEmail: text("parent_email").notNull(),
  
  // Payment details (amounts in cents)
  amount: integer("amount").notNull(),
  currency: text("currency").default("usd").notNull(),
  
  // Transaction metadata
  childName: text("child_name"), // For display purposes
  className: text("class_name"), // For display purposes
  description: text("description"),
  
  // Payment status
  status: text("status", { 
    enum: ["pending", "processing", "completed", "failed", "refunded", "cancelled"] 
  }).default("pending").notNull(),
  
  // Stripe integration
  stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
  stripeChargeId: text("stripe_charge_id"),
  stripeRefundId: text("stripe_refund_id"), // If this payment was refunded
  
  // Payment type
  paymentMethod: text("payment_method", { 
    enum: ["stripe", "cash", "check", "bank_transfer", "other"] 
  }).default("stripe").notNull(),
  
  // Related records
  enrollmentIds: jsonb("enrollment_ids").default([]).notNull(), // Array of enrollment IDs this payment covers
  originalPaymentId: integer("original_payment_id"), // For refunds - references payments.id
  
  // Metadata
  metadata: jsonb("metadata").default({}).notNull(),
  
  // Timestamps
  paymentDate: timestamp("payment_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPaymentSchema = createInsertSchema(payments)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    parentId: z.number().nullable().default(null),
    childName: z.string().nullable().default(null),
    className: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
    stripePaymentIntentId: z.string().nullable().default(null),
    stripeChargeId: z.string().nullable().default(null),
    stripeRefundId: z.string().nullable().default(null),
    originalPaymentId: z.number().nullable().default(null),
    paymentDate: z.date().nullable().default(null),
    enrollmentIds: z.array(z.number()).default([]),
    metadata: z.record(z.any()).default({}),
  });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// Scheduled Payments table - for recurring payment schedules
export const scheduledPayments = pgTable("scheduled_payments", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  
  // Related enrollment
  enrollmentId: integer("enrollment_id").notNull().references(() => programEnrollments.id),
  
  // Payer information
  parentId: integer("parent_id").notNull().references(() => users.id),
  parentEmail: text("parent_email").notNull(),
  
  // Schedule details (amounts in cents)
  amount: integer("amount").notNull(),
  currency: text("currency").default("usd").notNull(),
  
  // Payment schedule
  scheduledDate: timestamp("scheduled_date").notNull(),
  frequency: text("frequency", { 
    enum: ["one_time", "weekly", "monthly", "quarterly", "annual"] 
  }).default("one_time").notNull(),
  installmentNumber: integer("installment_number").notNull(), // Which installment in the series
  totalInstallments: integer("total_installments").notNull(), // Total number of installments
  
  // Status
  status: text("status", { 
    enum: ["pending", "processing", "completed", "failed", "cancelled", "skipped"] 
  }).default("pending").notNull(),
  
  // Stripe integration
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  
  // Processing details
  processedAt: timestamp("processed_at"),
  failureReason: text("failure_reason"),
  retryCount: integer("retry_count").default(0).notNull(),
  
  // Metadata
  metadata: jsonb("metadata").default({}).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertScheduledPaymentSchema = createInsertSchema(scheduledPayments)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    stripePaymentIntentId: z.string().nullable().default(null),
    processedAt: z.date().nullable().default(null),
    failureReason: z.string().nullable().default(null),
    retryCount: z.number().default(0),
    metadata: z.record(z.any()).default({}),
  });
export type InsertScheduledPayment = z.infer<typeof insertScheduledPaymentSchema>;
export type ScheduledPayment = typeof scheduledPayments.$inferSelect;

// Refunds table - for tracking refund transactions
export const refunds = pgTable("refunds", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  
  // Related payment
  paymentId: integer("payment_id").notNull().references(() => payments.id),
  enrollmentId: integer("enrollment_id").references(() => programEnrollments.id),
  
  // Refund details (amounts in cents)
  amount: integer("amount").notNull(),
  currency: text("currency").default("usd").notNull(),
  
  // Refund metadata
  reason: text("reason").notNull(),
  description: text("description"),
  
  // Status
  status: text("status", { 
    enum: ["pending", "processing", "completed", "failed", "cancelled"] 
  }).default("pending").notNull(),
  
  // Stripe integration
  stripeRefundId: text("stripe_refund_id").unique(),
  
  // Processing details
  processedBy: integer("processed_by").references(() => users.id), // Admin who processed
  processedAt: timestamp("processed_at"),
  failureReason: text("failure_reason"),
  
  // Metadata
  metadata: jsonb("metadata").default({}).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRefundSchema = createInsertSchema(refunds)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    enrollmentId: z.number().nullable().default(null),
    description: z.string().nullable().default(null),
    stripeRefundId: z.string().nullable().default(null),
    processedBy: z.number().nullable().default(null),
    processedAt: z.date().nullable().default(null),
    failureReason: z.string().nullable().default(null),
    metadata: z.record(z.any()).default({}),
  });
export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type Refund = typeof refunds.$inferSelect;

// Define emergency contact relations
export const emergencyContactsRelations = relations(emergencyContacts, ({ one }) => ({
  user: one(users, { fields: [emergencyContacts.userId], references: [users.id] })
}));

// Programs table for the Programs Category
export const programs = pgTable("programs", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").references(() => schools.id), // Multi-location support
  locationId: integer("location_id").references(() => locations.id), // Multi-location support
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category", { 
    enum: ["academic", "enrichment", "summer-camp", "workshop", "course", "other"] 
  }).notNull(),
  ageRange: text("age_range").notNull(),
  gradeLevels: text("grade_levels").array().notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  scheduleType: text("schedule_type", { 
    enum: ["one-time", "recurring", "flexible"] 
  }).notNull(),
  scheduleDetails: jsonb("schedule_details").notNull(),
  locationName: text("location_name"),
  locationAddress: text("location_address"),
  isVirtual: boolean("is_virtual").default(false).notNull(),
  meetingUrl: text("meeting_url"),
  capacity: integer("capacity").notNull(),
  price: integer("price").notNull(), // in cents
  instructorId: integer("instructor_id").references(() => users.id),
  curriculumId: integer("curriculum_id").references(() => curricula.id),
  coverImage: text("cover_image"),
  materials: jsonb("materials"),
  isPublished: boolean("is_published").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProgramSchema = createInsertSchema(programs)
  .omit({ id: true, createdAt: true, updatedAt: true, instructorId: true })
  .extend({
    // Allow strings for date fields which will be parsed into Date objects
    startDate: z.string().transform((str) => new Date(str)),
    endDate: z.string().transform((str) => new Date(str))
  });
export type InsertProgram = z.infer<typeof insertProgramSchema>;
export type Program = typeof programs.$inferSelect;

// Define program relations - programEnrollments is defined earlier for financial tracking
export const programsRelations = relations(programs, ({ one, many }) => ({
  instructor: one(users, { fields: [programs.instructorId], references: [users.id] }),
  curriculum: one(curricula, { fields: [programs.curriculumId], references: [curricula.id] }),
  enrollments: many(programEnrollments)
}));

// Define program enrollment relations (table defined earlier with financial fields)
export const programEnrollmentsRelations = relations(programEnrollments, ({ one }) => ({
  program: one(programs, { fields: [programEnrollments.programId], references: [programs.id] }),
  child: one(children, { fields: [programEnrollments.childId], references: [children.id] }),
  parent: one(users, { fields: [programEnrollments.parentId], references: [users.id] }),
  school: one(schools, { fields: [programEnrollments.schoolId], references: [schools.id] })
}));

// Stripe Subscription Schedules table - tracks Stripe payment plans
export const stripeSubscriptionSchedules = pgTable("stripe_subscription_schedules", {
  id: serial("id").primaryKey(),
  stripeScheduleId: text("stripe_schedule_id").notNull().unique(),
  parentEmail: text("parent_email").notNull(),
  enrollmentIds: jsonb("enrollment_ids").notNull(), // Array of enrollment IDs
  totalAmount: integer("total_amount").notNull(), // In cents
  paymentPlan: text("payment_plan", { 
    enum: ["deposit", "split", "biweekly", "full"] 
  }).notNull(),
  status: text("status", { 
    enum: ["active", "completed", "canceled", "paused"] 
  }).default("active").notNull(),
  currentPhase: integer("current_phase").default(1).notNull(),
  totalPhases: integer("total_phases").notNull(),
  nextPaymentDate: timestamp("next_payment_date"),
  lastPaymentDate: timestamp("last_payment_date"),
  completedDate: timestamp("completed_date"),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStripeSubscriptionScheduleSchema = createInsertSchema(stripeSubscriptionSchedules)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    status: z.enum(["active", "completed", "canceled", "paused"]).default("active"),
    currentPhase: z.number().default(1),
    nextPaymentDate: z.date().nullable().default(null),
    lastPaymentDate: z.date().nullable().default(null),
    completedDate: z.date().nullable().default(null),
    metadata: z.record(z.any()).default({})
  });
export type InsertStripeSubscriptionSchedule = z.infer<typeof insertStripeSubscriptionScheduleSchema>;
export type StripeSubscriptionSchedule = typeof stripeSubscriptionSchedules.$inferSelect;

// Membership enrollments table - tracks annual membership payments for parents
export const membershipEnrollments = pgTable("membership_enrollments", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  parentUserId: integer("parent_user_id").notNull().references(() => users.id),
  membershipYear: integer("membership_year").notNull(), // Year this membership covers (e.g., 2025)
  amount: integer("amount").notNull(), // Total membership fee in cents
  amountPaid: integer("amount_paid").default(0).notNull(), // Amount paid so far in cents
  remainingBalance: integer("remaining_balance").notNull(), // Remaining balance in cents
  status: text("status", { 
    enum: ["pending_payment", "enrolled", "expired", "grace_period", "suspended"] 
  }).default("pending_payment").notNull(),
  dueDate: timestamp("due_date").notNull(), // When membership payment is due
  expirationDate: timestamp("expiration_date").notNull(), // When membership expires
  gracePeriodEnd: timestamp("grace_period_end"), // End of grace period if applicable
  paymentMethod: text("payment_method", { 
    enum: ["credit_card", "paypal", "bank_transfer", "cash", "check", "other"] 
  }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMembershipEnrollmentSchema = createInsertSchema(membershipEnrollments)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    // Set default values for optional fields
    status: z.enum(["pending_payment", "enrolled", "expired", "grace_period", "suspended"]).default("pending_payment"),
    amountPaid: z.number().default(0),
    notes: z.string().nullable().default(null),
    paymentMethod: z.enum(["credit_card", "paypal", "bank_transfer", "cash", "check", "other"]).nullable().default(null),
    gracePeriodEnd: z.date().nullable().default(null),
  });
export type InsertMembershipEnrollment = z.infer<typeof insertMembershipEnrollmentSchema>;
export type MembershipEnrollment = typeof membershipEnrollments.$inferSelect;

// Define membership enrollment relations
export const membershipEnrollmentsRelations = relations(membershipEnrollments, ({ one }) => ({
  school: one(schools, { fields: [membershipEnrollments.schoolId], references: [schools.id] }),
  parent: one(users, { fields: [membershipEnrollments.parentUserId], references: [users.id] })
}));

// Curriculum table
export const curricula = pgTable("curricula", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  gradeLevel: text("grade_level").notNull(),
  authorId: integer("author_id").notNull().references(() => users.id),
  isPublished: boolean("is_published").default(false).notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
  price: integer("price").default(0).notNull(),
  learningStyles: text("learning_styles").array().notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCurriculumSchema = createInsertSchema(curricula).omit({ id: true, createdAt: true, updatedAt: true, authorId: true });
export type InsertCurriculum = z.infer<typeof insertCurriculumSchema>;
export type Curriculum = typeof curricula.$inferSelect;

// Define curriculum relations
export const curriculaRelations = relations(curricula, ({ one, many }) => ({
  author: one(users, { fields: [curricula.authorId], references: [users.id] }),
  lessons: many(lessons)
}));

// Lessons table
export const lessons = pgTable("lessons", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  gradeLevel: text("grade_level").notNull(),
  authorId: integer("author_id").notNull().references(() => users.id),
  curriculumId: integer("curriculum_id").references(() => curricula.id),
  isPublished: boolean("is_published").default(false).notNull(),
  duration: integer("duration").notNull(), // in minutes
  content: jsonb("content").notNull(),
  status: text("status", { enum: ["draft", "published", "archived"] }).default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLessonSchema = createInsertSchema(lessons).omit({ id: true, createdAt: true, updatedAt: true, authorId: true });
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type Lesson = typeof lessons.$inferSelect;

// Define lesson relations
export const lessonsRelations = relations(lessons, ({ one }) => ({
  author: one(users, { fields: [lessons.authorId], references: [users.id] }),
  curriculum: one(curricula, { fields: [lessons.curriculumId], references: [curricula.id] })
}));

// Role Invitations table
export const roleInvitations = pgTable("role_invitations", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role", { enum: ["teacher", "schoolAdmin", "admin", "superAdmin"] }).notNull(),
  invitedBy: integer("invited_by").notNull().references(() => users.id),
  schoolId: integer("school_id").references(() => schools.id), // Optional - for school-specific roles
  token: text("token").notNull().unique(), // Unique invitation token
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"), // When invitation was accepted
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRoleInvitationSchema = createInsertSchema(roleInvitations).omit({ 
  id: true, 
  createdAt: true, 
  token: true,
  usedAt: true 
});
export type InsertRoleInvitation = z.infer<typeof insertRoleInvitationSchema>;
export type RoleInvitation = typeof roleInvitations.$inferSelect;

// Events table
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  location: text("location"),
  organizerId: integer("organizer_id").notNull().references(() => users.id),
  eventType: text("event_type", { enum: ["class", "meeting", "workshop", "camp", "other"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true, organizerId: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// Define role invitation relations
export const roleInvitationsRelations = relations(roleInvitations, ({ one }) => ({
  inviter: one(users, { fields: [roleInvitations.invitedBy], references: [users.id] }),
  school: one(schools, { fields: [roleInvitations.schoolId], references: [schools.id] })
}));

// Define event relations
export const eventsRelations = relations(events, ({ one }) => ({
  organizer: one(users, { fields: [events.organizerId], references: [users.id] })
}));

// MarketplaceItems table
export const marketplaceItems = pgTable("marketplace_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  price: integer("price").notNull(), // in cents
  sellerId: integer("seller_id").notNull().references(() => users.id),
  itemType: text("item_type", { enum: ["curriculum", "lesson", "resource", "activity"] }).notNull(),
  contentId: integer("content_id").notNull(), // reference to curriculum or lesson id
  isActive: boolean("is_active").default(true).notNull(),
  sales: integer("sales").default(0).notNull(),
  revenue: integer("revenue").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMarketplaceItemSchema = createInsertSchema(marketplaceItems).omit({ id: true, createdAt: true, sales: true, revenue: true, sellerId: true });
export type InsertMarketplaceItem = z.infer<typeof insertMarketplaceItemSchema>;
export type MarketplaceItem = typeof marketplaceItems.$inferSelect;

// Define marketplace item relations
export const marketplaceItemsRelations = relations(marketplaceItems, ({ one }) => ({
  seller: one(users, { fields: [marketplaceItems.sellerId], references: [users.id] })
}));

// Knowledge Base table
export const knowledgeBases = pgTable("knowledge_bases", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  difficulty: text("difficulty").notNull(), // beginner, intermediate, advanced
  authorId: integer("author_id").notNull().references(() => users.id),
  price: integer("price").default(0).notNull(), // in cents
  files: jsonb("files").notNull(), // [{url: string, type: string, name: string}]
  metadata: jsonb("metadata").notNull(), // {tags: string[], objectives: string[]}
  isPublic: boolean("is_public").default(false).notNull(),
  downloadCount: integer("download_count").default(0).notNull(),
  purchasedBy: jsonb("purchased_by").default([]).notNull(), // array of user IDs
  aiProcessed: boolean("ai_processed").default(false).notNull(),
  aiInsights: jsonb("ai_insights"), // AI analysis results
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBases).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true, 
  authorId: true, 
  downloadCount: true,
  purchasedBy: true,
  aiProcessed: true,
  aiInsights: true,
  processedAt: true
});
export type InsertKnowledgeBase = z.infer<typeof insertKnowledgeBaseSchema>;
export type KnowledgeBase = typeof knowledgeBases.$inferSelect;

// Define knowledge base relations
export const knowledgeBasesRelations = relations(knowledgeBases, ({ one, many }) => ({
  author: one(users, { fields: [knowledgeBases.authorId], references: [users.id] }),
}));

// Now that all tables are defined, update the child relations with programEnrollments
export const childProgramEnrollmentsRelations = relations(children, ({ many }) => ({
  programEnrollments: many(programEnrollments)
}));

// Now that all tables are defined, update the program relations with enrollments
export const programEnrollmentsRelations2 = relations(programs, ({ many }) => ({
  enrollments: many(programEnrollments)
}));

// Activities table for worksheets, puzzles, coloring pages, etc.
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type", { enum: ["worksheet", "crossword", "coloring", "wordsearch", "maze"] }).notNull(),
  content: jsonb("content").notNull(), // JSON structure depends on activity type
  url: text("url").notNull(), // Path to the JSON data file
  pdfUrl: text("pdf_url"), // Path to the generated PDF for printing
  ageRange: text("age_range").notNull(), // "4-5", "6-7", "8-10", "11-13", "14-18"
  subject: text("subject").notNull(),
  authorId: integer("author_id").notNull().references(() => users.id),
  difficulty: text("difficulty", { enum: ["beginner", "intermediate", "advanced"] }).notNull(),
  isPublic: boolean("is_public").default(false),
  downloadCount: integer("download_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activities).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true, 
  downloadCount: true,
  pdfUrl: true
});
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect;

export const activitiesRelations = relations(activities, ({ one }) => ({
  author: one(users, { fields: [activities.authorId], references: [users.id] }),
}));

// Unified Classes table - consolidates both marketplace programs and school admin classes
export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  
  // Type discriminator - distinguishes between marketplace programs and school admin classes
  type: text("type", { enum: ["marketplace", "school_admin"] }).notNull().default("school_admin"),
  legacyProgramId: integer("legacy_program_id").unique(), // For safe ID mapping during migration
  
  // Shared fields (used by both types)
  schoolId: integer("school_id").references(() => schools.id),
  locationId: integer("location_id").references(() => locations.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // academic, enrichment, summer-camp, workshop, course, arts, music, sports, stem, language, coding, cooking, crafts, other
  gradeLevels: text("grade_levels").array(),
  startDate: date("start_date"), // Keep as date type for compatibility
  endDate: date("end_date"), // Keep as date type for compatibility
  schedule: jsonb("schedule").default(null), // JSON object with schedule details - supports variants for school_admin
  capacity: integer("capacity"),
  price: integer("price").notNull(), // in cents
  instructorId: integer("instructor_id").references(() => users.id),
  isPublished: boolean("is_published").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  
  // School admin specific fields (from original classes table)
  productId: text("product_id"),
  productType: text("product_type"),
  categoryName: text("category_name"), // e.g. "SPRING 2025 10 WEEK PROGRAM"
  numSessions: integer("num_sessions"),
  sessionDays: text("session_days"),
  durationWeeks: integer("duration_weeks"),
  sessionsPerWeek: integer("sessions_per_week"),
  sessionLengthMinutes: integer("session_length_minutes"),
  startTime: text("start_time"), // HH:MM format
  endTime: text("end_time"), // HH:MM format
  status: text("status", { enum: ["upcoming", "active", "completed", "cancelled"] }).default("upcoming").notNull(),
  location: text("location"),
  instructorName: text("instructor_name"),
  suggestedPrice: integer("suggested_price"), // AI suggested price in cents
  totalOrders: integer("total_orders").default(0),
  paidOrders: integer("paid_orders").default(0),
  totalWaitlisted: integer("total_waitlisted").default(0),
  totalOrderValue: integer("total_order_value").default(0), // in cents
  totalDiscounted: integer("total_discounted").default(0), // in cents
  totalCollected: integer("total_collected").default(0), // in cents
  isAdminOnly: boolean("is_admin_only").default(false).notNull(),
  enrollmentCount: integer("enrollment_count").default(0).notNull(),
  
  // Marketplace specific fields (from original programs table)
  ageRange: text("age_range"), // "4-5", "6-7", "8-10", etc.
  scheduleType: text("schedule_type", { enum: ["one-time", "recurring", "flexible"] }),
  scheduleDetails: jsonb("schedule_details"), // Detailed schedule info for marketplace programs
  locationName: text("location_name"),
  locationAddress: text("location_address"),
  isVirtual: boolean("is_virtual").default(false),
  meetingUrl: text("meeting_url"),
  curriculumId: integer("curriculum_id").references(() => curricula.id),
  coverImage: text("cover_image"),
  materials: jsonb("materials"),
});

export const insertClassSchema = createInsertSchema(classes)
  .omit({ id: true, createdAt: true, updatedAt: true, instructorId: true, enrollmentCount: true })
  .extend({
    // Type discriminator (optional - has DB default)
    type: z.enum(["marketplace", "school_admin"]).optional().default("school_admin"),
    
    // String dates will be converted to Date objects
    startDate: z.string().nullable().transform((str) => str ? new Date(str) : null),
    endDate: z.string().nullable().transform((str) => str ? new Date(str) : null),
    
    // Convert dollar amounts to cents for storage
    price: z.number().transform(amount => Math.round(amount * 100)),
    suggestedPrice: z.number().optional().transform(amount => amount ? Math.round(amount * 100) : undefined),
    
    // Shared optional fields
    schoolId: z.number().optional(),
    locationId: z.number().optional(),
    gradeLevels: z.array(z.string()).optional(),
    capacity: z.number().optional(),
    schedule: z.any().optional(),
    isPublished: z.boolean().default(false),
    
    // School admin specific fields (optional)
    productId: z.string().optional(),
    productType: z.string().optional(),
    categoryName: z.string().optional(),
    numSessions: z.number().optional(),
    sessionDays: z.string().optional(),
    durationWeeks: z.number().optional(),
    sessionsPerWeek: z.number().optional(),
    sessionLengthMinutes: z.number().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    status: z.enum(["upcoming", "active", "completed", "cancelled"]).optional(),
    location: z.string().optional(),
    instructorName: z.string().optional(),
    totalOrders: z.number().optional(),
    paidOrders: z.number().optional(), 
    totalWaitlisted: z.number().optional(),
    totalOrderValue: z.number().optional(),
    totalDiscounted: z.number().optional(),
    totalCollected: z.number().optional(),
    isAdminOnly: z.boolean().optional(),
    
    // Marketplace specific fields (optional)
    ageRange: z.string().optional(),
    scheduleType: z.enum(["one-time", "recurring", "flexible"]).optional(),
    scheduleDetails: z.any().optional(),
    locationName: z.string().optional(),
    locationAddress: z.string().optional(),
    isVirtual: z.boolean().optional(),
    meetingUrl: z.string().optional(),
    curriculumId: z.number().optional(),
    coverImage: z.string().optional(),
    materials: z.any().optional(),
  });
export type InsertClass = z.infer<typeof insertClassSchema>;
export type Class = typeof classes.$inferSelect;

// Define class relations
export const classesRelations = relations(classes, ({ one }) => ({
  instructor: one(users, { fields: [classes.instructorId], references: [users.id] }),
  curriculum: one(curricula, { fields: [classes.curriculumId], references: [curricula.id] }),
}));

// Marketing Links table for school admin marketing campaigns
export const marketingLinks = pgTable("marketing_links", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  campaignId: text("campaign_id").notNull().unique(), // Unique identifier for the campaign
  campaignName: text("campaign_name").notNull(), // User-friendly campaign name
  linkUrl: text("link_url").notNull(), // The actual marketing link URL
  isActive: boolean("is_active").default(true).notNull(),
  clickCount: integer("click_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Marketing Links schema and types
export const insertMarketingLinkSchema = createInsertSchema(marketingLinks);
export type InsertMarketingLink = z.infer<typeof insertMarketingLinkSchema>;
export type MarketingLink = typeof marketingLinks.$inferSelect;

// Link Analytics table for tracking marketing link performance
export const linkAnalytics = pgTable("link_analytics", {
  id: serial("id").primaryKey(),
  linkId: integer("link_id").notNull().references(() => marketingLinks.id),
  event: text("event", { enum: ["click", "conversion"] }).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  referrer: text("referrer")
});

export const insertLinkAnalyticsSchema = createInsertSchema(linkAnalytics);
export type InsertLinkAnalytics = z.infer<typeof insertLinkAnalyticsSchema>;
export type LinkAnalytics = typeof linkAnalytics.$inferSelect;

// **MULTI-LOCATION SUPPORT TABLES**

// Locations table for physical campuses/sites within a school
export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  name: text("name").notNull(), // e.g., "Downtown Campus", "North Branch"
  code: text("code").notNull(), // e.g., "DT", "NB" for short identification
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  phoneNumber: text("phone_number"),
  email: text("email"),
  managerName: text("manager_name"),
  capacity: integer("capacity"), // total capacity for this location
  isActive: boolean("is_active").default(true).notNull(),
  timezone: text("timezone").default("America/New_York").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLocationSchema = createInsertSchema(locations)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    phoneNumber: z.string().nullable().default(null),
    email: z.string().nullable().default(null),
    managerName: z.string().nullable().default(null),
    capacity: z.number().nullable().default(null),
  });
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locations.$inferSelect;

// User-Location access mapping for multi-location permissions
export const userLocations = pgTable("user_locations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  locationId: integer("location_id").notNull().references(() => locations.id),
  accessLevel: text("access_level", { 
    enum: ["view", "manage", "admin"] 
  }).notNull().default("view"),
  canViewReports: boolean("can_view_reports").default(false).notNull(),
  canManageStaff: boolean("can_manage_staff").default(false).notNull(),
  canManageClasses: boolean("can_manage_classes").default(false).notNull(),
  canManageStudents: boolean("can_manage_students").default(false).notNull(),
  canSendNotifications: boolean("can_send_notifications").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserLocationSchema = createInsertSchema(userLocations)
  .omit({ id: true, createdAt: true, updatedAt: true, assignedAt: true });
export type InsertUserLocation = z.infer<typeof insertUserLocationSchema>;
export type UserLocation = typeof userLocations.$inferSelect;

// Notifications table for enhanced messaging system
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => users.id),
  type: text("type", { 
    enum: ["email", "in_app", "sms", "both", "all"] 
  }).notNull().default("both"),
  priority: text("priority", { 
    enum: ["low", "normal", "high", "urgent"] 
  }).notNull().default("normal"),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  targetType: text("target_type", { 
    enum: ["individual", "role", "location", "all"] 
  }).notNull(),
  targetData: jsonb("target_data").notNull(), // Store recipient info as JSON
  scheduledFor: timestamp("scheduled_for"),
  sentAt: timestamp("sent_at"),
  status: text("status", { 
    enum: ["draft", "scheduled", "sending", "sent", "failed"] 
  }).default("draft").notNull(),
  deliveryStats: jsonb("delivery_stats").default({}), // Track delivery results
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications)
  .omit({ id: true, createdAt: true, updatedAt: true, sentAt: true })
  .extend({
    scheduledFor: z.string().nullable().transform((str) => str ? new Date(str) : null),
  });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Notification recipients table for tracking individual delivery
export const notificationRecipients = pgTable("notification_recipients", {
  id: serial("id").primaryKey(),
  notificationId: integer("notification_id").notNull().references(() => notifications.id),
  recipientId: integer("recipient_id").notNull().references(() => users.id),
  deliveryType: text("delivery_type", { enum: ["email", "in_app", "sms"] }).notNull(),
  status: text("status", { 
    enum: ["pending", "sent", "delivered", "read", "failed"] 
  }).default("pending").notNull(),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationRecipientSchema = createInsertSchema(notificationRecipients)
  .omit({ id: true, createdAt: true });
export type InsertNotificationRecipient = z.infer<typeof insertNotificationRecipientSchema>;
export type NotificationRecipient = typeof notificationRecipients.$inferSelect;

// Relations for multi-location support
export const locationsRelations = relations(locations, ({ one, many }) => ({
  school: one(schools, { fields: [locations.schoolId], references: [schools.id] }),
  staff: many(schoolStaff),
  students: many(schoolStudents),
  classes: many(schoolClasses),
  userAccess: many(userLocations),
}));

export const userLocationsRelations = relations(userLocations, ({ one }) => ({
  user: one(users, { fields: [userLocations.userId], references: [users.id] }),
  location: one(locations, { fields: [userLocations.locationId], references: [locations.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one, many }) => ({
  sender: one(users, { fields: [notifications.senderId], references: [users.id] }),
  recipients: many(notificationRecipients),
}));

export const notificationRecipientsRelations = relations(notificationRecipients, ({ one }) => ({
  notification: one(notifications, { fields: [notificationRecipients.notificationId], references: [notifications.id] }),
  recipient: one(users, { fields: [notificationRecipients.recipientId], references: [users.id] }),
}));

// Legacy payment tables are now defined earlier in the schema with comprehensive financial tracking
// See programEnrollments, payments, scheduledPayments, and refunds tables above

// Discounts table for managing school discounts
export const discounts = pgTable("discounts", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").references(() => schools.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  code: text("code").unique(), // Optional discount code for manual application
  type: text("type", { enum: ["percentage", "fixed_amount"] }).notNull(),
  value: integer("value").notNull(), // Percentage (0-100) or fixed amount in cents
  applicationMethod: text("application_method", { enum: ["automatic", "manual", "both"] }).default("manual").notNull(),
  
  // Automatic application conditions
  minOrderAmount: integer("min_order_amount"), // Minimum order amount in cents
  maxDiscountAmount: integer("max_discount_amount"), // Maximum discount amount in cents (for percentage discounts)
  applicableToClasses: integer("applicable_to_classes").array(), // Specific class IDs
  applicableToCategories: text("applicable_to_categories").array(), // Class categories
  applicableToGradeLevels: text("applicable_to_grade_levels").array(), // Grade levels
  newStudentsOnly: boolean("new_students_only").default(false),
  siblingDiscount: boolean("sibling_discount").default(false), // Apply when multiple siblings enroll
  
  // Bundle discount rules (optional)
  bundleRule: jsonb("bundle_rule").$type<{
    type: 'nth_item_free' | 'buy_x_get_y_free' | 'buy_x_get_y_percent_off';
    buyQuantity: number;
    freeQuantity?: number;
    discountPercentage?: number;
  }>(),
  
  // Usage limits
  usageLimit: integer("usage_limit"), // Total times this discount can be used
  usageLimitPerUser: integer("usage_limit_per_user"), // Times per user/family
  currentUsageCount: integer("current_usage_count").default(0),
  
  // Time constraints
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  
  // Status and metadata
  isActive: boolean("is_active").default(true).notNull(),
  priority: integer("priority").default(0), // Higher priority discounts apply first
  combinableWithOthers: boolean("combinable_with_others").default(false),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Track discount applications/usage
export const discountApplications = pgTable("discount_applications", {
  id: serial("id").primaryKey(),
  discountId: integer("discount_id").references(() => discounts.id).notNull(),
  parentEmail: text("parent_email").notNull(),
  childId: integer("child_id").references(() => children.id),
  schoolEnrollmentId: integer("school_enrollment_id").references(() => schoolClassEnrollments.id),
  programEnrollmentId: integer("program_enrollment_id").references(() => programEnrollments.id),
  paymentId: integer("payment_id").references(() => payments.id),
  classId: integer("class_id").references(() => classes.id),
  
  // Application details
  originalAmount: integer("original_amount").notNull(), // Original amount before discount in cents
  discountAmount: integer("discount_amount").notNull(), // Amount of discount applied in cents
  finalAmount: integer("final_amount").notNull(), // Final amount after discount in cents
  applicationMethod: text("application_method", { enum: ["automatic", "manual"] }).notNull(),
  appliedBy: integer("applied_by").references(() => users.id), // User who applied manual discount
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Define relationships for discounts
export const discountRelations = relations(discounts, ({ one, many }) => ({
  school: one(schools, { fields: [discounts.schoolId], references: [schools.id] }),
  createdByUser: one(users, { fields: [discounts.createdBy], references: [users.id] }),
  applications: many(discountApplications),
}));

export const discountApplicationRelations = relations(discountApplications, ({ one }) => ({
  discount: one(discounts, { fields: [discountApplications.discountId], references: [discounts.id] }),
  child: one(children, { fields: [discountApplications.childId], references: [children.id] }),
  schoolEnrollment: one(schoolClassEnrollments, { fields: [discountApplications.schoolEnrollmentId], references: [schoolClassEnrollments.id] }),
  programEnrollment: one(programEnrollments, { fields: [discountApplications.programEnrollmentId], references: [programEnrollments.id] }),
  payment: one(payments, { fields: [discountApplications.paymentId], references: [payments.id] }),
  class: one(classes, { fields: [discountApplications.classId], references: [classes.id] }),
  appliedByUser: one(users, { fields: [discountApplications.appliedBy], references: [users.id] }),
}));

// Bundle rule validation schema
export const bundleRuleSchema = z.object({
  type: z.enum(['nth_item_free', 'buy_x_get_y_free', 'buy_x_get_y_percent_off']),
  buyQuantity: z.number().int().min(1, 'Buy quantity must be at least 1'),
  freeQuantity: z.number().int().min(1).optional(),
  discountPercentage: z.number().min(0).max(100).optional(),
}).refine((data) => {
  // Validate field alignment with type
  if (data.type === 'nth_item_free' || data.type === 'buy_x_get_y_free') {
    return data.freeQuantity !== undefined && data.freeQuantity > 0;
  }
  if (data.type === 'buy_x_get_y_percent_off') {
    return data.discountPercentage !== undefined && data.discountPercentage > 0;
  }
  return true;
}, {
  message: 'Bundle rule fields must match the selected type'
});

export type BundleRule = z.infer<typeof bundleRuleSchema>;

// Discount schemas for validation
export const insertDiscountSchema = createInsertSchema(discounts)
  .omit({ id: true, createdAt: true, updatedAt: true, currentUsageCount: true })
  .extend({
    // Convert dollar amounts to cents for storage
    minOrderAmount: z.number().optional().transform(amount => amount ? Math.round(amount * 100) : undefined),
    maxDiscountAmount: z.number().optional().transform(amount => amount ? Math.round(amount * 100) : undefined),
    // For fixed amount discounts, convert to cents
    value: z.number().transform(value => Math.round(value * 100)),
    // Bundle rule validation
    bundleRule: bundleRuleSchema.optional(),
  });

export const insertDiscountApplicationSchema = createInsertSchema(discountApplications)
  .omit({ id: true, createdAt: true });

export type InsertDiscount = z.infer<typeof insertDiscountSchema>;
export type Discount = typeof discounts.$inferSelect;
export type InsertDiscountApplication = z.infer<typeof insertDiscountApplicationSchema>;
export type DiscountApplication = typeof discountApplications.$inferSelect;

// Daily Flow Tables
// Daily Flow Templates - Reusable templates for scheduling
export const dailyFlowTemplates = pgTable("daily_flow_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  gradeLevel: text("grade_level").notNull(),
  subject: text("subject").notNull(),
  createdBy: text("created_by").notNull(), // Email of creator
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Daily Flow Entries - Individual scheduled activities
export const dailyFlowEntries = pgTable("daily_flow_entries", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => dailyFlowTemplates.id),
  classId: integer("class_id").notNull().references(() => classes.id),
  date: date("date").notNull(), // YYYY-MM-DD
  startTime: text("start_time").notNull(), // HH:MM format
  endTime: text("end_time").notNull(), // HH:MM format
  subject: text("subject").notNull(),
  lessonTitle: text("lesson_title").notNull(),
  lessonDescription: text("lesson_description"),
  lessonLink: text("lesson_link"),
  materials: jsonb("materials").default([]), // Array of strings
  objectives: jsonb("objectives").default([]), // Array of strings
  isCompleted: boolean("is_completed").default(false).notNull(),
  completedBy: text("completed_by"), // Email of who completed it
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdBy: text("created_by").notNull(), // Email of creator
  lastModifiedBy: text("last_modified_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Daily Flow Schedules - Recurring patterns for automatic scheduling
export const dailyFlowSchedules = pgTable("daily_flow_schedules", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => dailyFlowTemplates.id),
  classId: integer("class_id").notNull().references(() => classes.id),
  dayOfWeek: integer("day_of_week").notNull(), // 0 = Sunday, 6 = Saturday
  startTime: text("start_time").notNull(), // HH:MM format
  endTime: text("end_time").notNull(), // HH:MM format
  subject: text("subject").notNull(),
  lessonTitle: text("lesson_title").notNull(),
  lessonDescription: text("lesson_description"),
  lessonLink: text("lesson_link"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Define relationships for daily flow tables
export const dailyFlowTemplateRelations = relations(dailyFlowTemplates, ({ one, many }) => ({
  school: one(schools, { fields: [dailyFlowTemplates.schoolId], references: [schools.id] }),
  entries: many(dailyFlowEntries),
  schedules: many(dailyFlowSchedules),
}));

export const dailyFlowEntryRelations = relations(dailyFlowEntries, ({ one }) => ({
  template: one(dailyFlowTemplates, { fields: [dailyFlowEntries.templateId], references: [dailyFlowTemplates.id] }),
  class: one(classes, { fields: [dailyFlowEntries.classId], references: [classes.id] }),
}));

export const dailyFlowScheduleRelations = relations(dailyFlowSchedules, ({ one }) => ({
  template: one(dailyFlowTemplates, { fields: [dailyFlowSchedules.templateId], references: [dailyFlowTemplates.id] }),
  class: one(classes, { fields: [dailyFlowSchedules.classId], references: [classes.id] }),
}));

// Daily Flow schemas for validation
export const insertDailyFlowTemplateSchema = createInsertSchema(dailyFlowTemplates)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertDailyFlowEntrySchema = createInsertSchema(dailyFlowEntries)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertDailyFlowScheduleSchema = createInsertSchema(dailyFlowSchedules)
  .omit({ id: true, createdAt: true, updatedAt: true });

export type InsertDailyFlowTemplate = z.infer<typeof insertDailyFlowTemplateSchema>;
export type DailyFlowTemplate = typeof dailyFlowTemplates.$inferSelect;
export type InsertDailyFlowEntry = z.infer<typeof insertDailyFlowEntrySchema>;
export type DailyFlowEntry = typeof dailyFlowEntries.$inferSelect;
export type InsertDailyFlowSchedule = z.infer<typeof insertDailyFlowScheduleSchema>;
export type DailyFlowSchedule = typeof dailyFlowSchedules.$inferSelect;

// Custom Forms - Form Builder System
export const customForms = pgTable("custom_forms", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  title: text("title").notNull(),
  description: text("description"),
  slug: text("slug").notNull(), // URL-friendly identifier
  formType: text("form_type", { 
    enum: ["student_registration", "permission_slip", "survey", "event_registration", "product_order", "feedback", "custom"] 
  }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isTemplate: boolean("is_template").default(false).notNull(), // Template for cloning
  
  // Access control
  accessLevel: text("access_level", { 
    enum: ["public", "members", "parents", "students", "staff", "custom"] 
  }).default("members").notNull(),
  allowedRoles: jsonb("allowed_roles").default([]).notNull(), // Array of roles for custom access
  
  // Location targeting for multi-location schools
  isAllLocations: boolean("is_all_locations").default(true).notNull(), // true = visible to all locations
  allowedLocationIds: integer("allowed_location_ids").array(), // Specific location IDs if not all locations
  
  // Platform fee configuration for product orders
  platformFeeType: text("platform_fee_type", {
    enum: ["none", "flat_per_item", "percentage"]
  }).default("none"),
  platformFeeAmount: integer("platform_fee_amount").default(0), // In cents for flat, basis points for percentage (e.g., 500 = 5%)
  
  // Form settings
  settings: jsonb("settings").default({
    requireAuth: true,
    allowMultipleSubmissions: false,
    showProgressBar: true,
    confirmationMessage: "Thank you for your submission!",
    redirectUrl: null,
    notifyOnSubmission: true,
    notificationEmails: [],
  }).notNull(),
  
  // Conditional logic configuration
  conditionalLogic: jsonb("conditional_logic").default([]).notNull(), // Rules for show/hide fields
  
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const customFormFields = pgTable("custom_form_fields", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => customForms.id, { onDelete: 'cascade' }),
  fieldType: text("field_type", { 
    enum: ["text", "textarea", "email", "phone", "number", "price", "quantity", "date", "time", "datetime", 
           "dropdown", "radio", "checkbox", "multi_checkbox", "file_upload", "signature", "rating", "slider", "product"] 
  }).notNull(),
  
  label: text("label").notNull(),
  placeholder: text("placeholder"),
  helpText: text("help_text"),
  
  // Field properties
  isRequired: boolean("is_required").default(false).notNull(),
  order: integer("order").notNull(), // Display order
  
  // Field-specific config (options for dropdown/radio, min/max for numbers, etc.)
  fieldConfig: jsonb("field_config").default({}).notNull(),
  
  // Validation rules
  validationRules: jsonb("validation_rules").default({}).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const customFormSubmissions = pgTable("custom_form_submissions", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => customForms.id, { onDelete: 'cascade' }),
  submittedBy: integer("submitted_by").references(() => users.id), // Null for public submissions
  submitterEmail: text("submitter_email"), // For public submissions
  submitterName: text("submitter_name"), // For public submissions
  
  // Form response data
  responseData: jsonb("response_data").notNull(), // Key-value pairs of field responses
  
  // Payment information for product orders
  subtotal: integer("subtotal").default(0), // Subtotal in cents (before platform fee)
  platformFee: integer("platform_fee").default(0), // Platform fee in cents
  totalAmount: integer("total_amount").default(0), // Total amount in cents (subtotal + platform fee)
  paymentStatus: text("payment_status", {
    enum: ["pending", "processing", "completed", "failed", "refunded"]
  }),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  
  // Shipping information for product orders
  shippingAddress: jsonb("shipping_address"), // { street, city, state, zipCode, country }
  
  // Product images for product orders
  productImages: text("product_images").array(), // Array of image URLs
  
  // Metadata
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  
  status: text("status", { 
    enum: ["pending", "approved", "rejected", "processed"] 
  }).default("pending").notNull(),
  
  notes: text("notes"), // Admin notes
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations for custom forms
export const customFormRelations = relations(customForms, ({ one, many }) => ({
  school: one(schools, { fields: [customForms.schoolId], references: [schools.id] }),
  creator: one(users, { fields: [customForms.createdBy], references: [users.id] }),
  fields: many(customFormFields),
  submissions: many(customFormSubmissions),
}));

export const customFormFieldRelations = relations(customFormFields, ({ one }) => ({
  form: one(customForms, { fields: [customFormFields.formId], references: [customForms.id] }),
}));

export const customFormSubmissionRelations = relations(customFormSubmissions, ({ one }) => ({
  form: one(customForms, { fields: [customFormSubmissions.formId], references: [customForms.id] }),
  submitter: one(users, { fields: [customFormSubmissions.submittedBy], references: [users.id] }),
}));

// Validation schemas
export const insertCustomFormSchema = createInsertSchema(customForms)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    description: z.string().nullable().default(null),
    accessLevel: z.string().default("members"),
    allowedRoles: z.array(z.string()).default([]),
    isAllLocations: z.boolean().default(true),
    allowedLocationIds: z.array(z.number()).nullable().default(null),
    platformFeeType: z.enum(["none", "flat_per_item", "percentage"]).default("none"),
    platformFeeAmount: z.number().default(0),
    settings: z.object({
      requireAuth: z.boolean().default(true),
      allowMultipleSubmissions: z.boolean().default(false),
      showProgressBar: z.boolean().default(true),
      confirmationMessage: z.string().default("Thank you for your submission!"),
      redirectUrl: z.string().nullable().default(null),
      notifyOnSubmission: z.boolean().default(true),
      notificationEmails: z.array(z.string().email()).default([]),
    }).default({
      requireAuth: true,
      allowMultipleSubmissions: false,
      showProgressBar: true,
      confirmationMessage: "Thank you for your submission!",
      redirectUrl: null,
      notifyOnSubmission: true,
      notificationEmails: [],
    }),
    conditionalLogic: z.array(z.any()).default([]),
  });

export const insertCustomFormFieldSchema = createInsertSchema(customFormFields)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    placeholder: z.string().nullable().default(null),
    helpText: z.string().nullable().default(null),
    fieldConfig: z.record(z.any()).default({}),
    validationRules: z.record(z.any()).default({}),
  });

export const insertCustomFormSubmissionSchema = createInsertSchema(customFormSubmissions)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    submittedBy: z.number().nullable().default(null),
    submitterEmail: z.string().email().nullable().default(null),
    submitterName: z.string().nullable().default(null),
    subtotal: z.number().default(0),
    platformFee: z.number().default(0),
    totalAmount: z.number().default(0),
    paymentStatus: z.enum(["pending", "processing", "completed", "failed", "refunded"]).nullable().default(null),
    stripePaymentIntentId: z.string().nullable().default(null),
    shippingAddress: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
      country: z.string().default("USA"),
    }).nullable().default(null),
    productImages: z.array(z.string()).nullable().default(null),
    ipAddress: z.string().nullable().default(null),
    userAgent: z.string().nullable().default(null),
    notes: z.string().nullable().default(null),
  });

export type InsertCustomForm = z.infer<typeof insertCustomFormSchema>;
export type CustomForm = typeof customForms.$inferSelect;
export type InsertCustomFormField = z.infer<typeof insertCustomFormFieldSchema>;
export type CustomFormField = typeof customFormFields.$inferSelect;
export type InsertCustomFormSubmission = z.infer<typeof insertCustomFormSubmissionSchema>;
export type CustomFormSubmission = typeof customFormSubmissions.$inferSelect;

// Push Subscriptions table for web push notifications
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dhKey: text("p256dh_key").notNull(), // Public key for encryption
  authKey: text("auth_key").notNull(), // Authentication secret
  userAgent: text("user_agent"), // Browser/device info
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// Push subscriptions relations
export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
}));