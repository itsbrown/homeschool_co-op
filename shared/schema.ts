import { pgTable, text, serial, integer, boolean, jsonb, timestamp, date, varchar, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Define the enum for user roles
const roleEnum = pgEnum('role', ["student", "parent", "learner", "educator", "mentor", "teacher", "schoolAdmin", "admin", "superAdmin"]);

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
  locationId: integer("location_id").references(() => locations.id), // Parent's home location (children auto-inherit)
  phone: text("phone"), // User's phone number
  emergencyContactFirstName: text("emergency_contact_first_name"), // Emergency contact first name
  emergencyContactLastName: text("emergency_contact_last_name"), // Emergency contact last name
  emergencyContactPhone: text("emergency_contact_phone"), // Emergency contact phone
  emergencyContactRelationship: text("emergency_contact_relationship"), // Emergency contact relationship
  isActive: boolean("is_active").default(true).notNull(),
  lastLogin: timestamp("last_login"),
  activeRole: text("active_role"), // Currently active role for multi-role users (NULL means use primary role)
  activeRoleId: integer("active_role_id"), // ID of the currently active role from user_roles table (NULL means use primary role)
  stripeCustomerId: text("stripe_customer_id"), // Stripe customer ID for payments
  hasCompletedOnboarding: boolean("has_completed_onboarding").default(false), // Whether user has completed the onboarding tour
  memberId: text("member_id"), // System-generated or admin-assigned membership ID (e.g., ASA-2025-X7K9M2)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// User Roles table - for multi-role support (e.g., someone can be both parent AND educator)
// Note: role column uses text type (not enum) to support both system roles and custom staff positions
export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text("role").notNull(), // Text type to support custom staff positions like "Mentor", "Tutor", etc.
  schoolId: integer("school_id"), // For tenant scoping - educators/admins must be tied to a school
  isPrimary: boolean("is_primary").default(false).notNull(), // Which role is the user's primary/default role
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// System roles that are always valid, plus custom staff positions validated at API layer
export const systemRoles = ["student", "parent", "learner", "educator", "mentor", "teacher", "schoolAdmin", "admin", "superAdmin"] as const;
export type SystemRole = typeof systemRoles[number];

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({ id: true, createdAt: true });
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRoles.$inferSelect;

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
  
  // Onboarding Tour Configuration
  onboardingTourEnabled: boolean("onboarding_tour_enabled").default(true), // Enable/disable onboarding tour for new parents
  
  // Payment/Subscription Display Configuration
  showSubscriptionStatus: boolean("show_subscription_status").default(false), // Show subscription status during checkout (disabled by default to avoid date parsing issues)
  
  // Membership Agreement Configuration
  membershipAgreementTemplate: text("membership_agreement_template"), // The agreement text/HTML that members must sign
  membershipAgreementVersion: text("membership_agreement_version").default("1.0"), // Version of the current agreement
  membershipAgreementUpdatedAt: timestamp("membership_agreement_updated_at"), // When the agreement was last updated
  
  // Premium Feature Toggles (controlled by Super Admin)
  enabledFeatures: jsonb("enabled_features").default({}).notNull(), // { financialReports: true, aiInsights: true, ... }
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
    
    // Onboarding Tour Configuration
    onboardingTourEnabled: z.boolean().default(true),
    
    // Payment/Subscription Display Configuration
    showSubscriptionStatus: z.boolean().default(false),
    
    // Membership Agreement Configuration
    membershipAgreementTemplate: z.string().nullable().default(null),
    membershipAgreementVersion: z.string().default("1.0"),
    membershipAgreementUpdatedAt: z.date().nullable().default(null),
    
    // Premium Feature Toggles
    enabledFeatures: z.record(z.string(), z.boolean()).default({}),
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
// Note: unique constraint on (childId, schoolId) removed from schema to fix deployment.
// Application-level duplicate checking is in place. Manually create index on production after deploy:
// CREATE UNIQUE INDEX IF NOT EXISTS "unique_child_school" ON "school_students" (child_id, school_id);

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
    locationId: z.number().nullable().default(null), // Multi-location support
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
  status: text("status", { enum: ["pending_payment", "pending_admin_approval", "enrolled", "waitlist", "cancelled", "completed", "withdrawn", "failed"] }).default("enrolled").notNull(),
  notes: text("notes"),
  lastReminderSentAt: timestamp("last_reminder_sent_at"), // For payment reminder tracking
  reminderCount: integer("reminder_count").default(0), // Track how many reminders sent
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
// Note: unique constraint on (parentId, firstName, lastName) removed from schema to fix deployment.
// Application-level duplicate checking is in place. Manually create index on production after deploy:
// CREATE UNIQUE INDEX IF NOT EXISTS "unique_parent_child" ON "children" (parent_id, lower(first_name), lower(last_name));

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
    enum: ["pending_payment", "pending_admin_approval", "enrolled", "waitlist", "cancelled", "completed", "withdrawn", "failed"] 
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

export const updateProgramEnrollmentSchema = insertProgramEnrollmentSchema.partial().extend({
  remainingBalance: z.number().optional(),
  paymentStatus: z.enum(["pending", "deposit_paid", "partial_payment", "completed", "stripe_managed", "refunded"]).optional(),
  status: z.enum(["pending_payment", "pending_admin_approval", "enrolled", "waitlist", "cancelled", "completed", "withdrawn", "failed"]).optional(),
  totalPaid: z.number().optional(),
});
export type UpdateProgramEnrollment = z.infer<typeof updateProgramEnrollmentSchema>;

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

// Enriched Payment History types for API responses
export const enrichedPaymentHistorySchema = z.object({
  // Base payment fields
  id: z.number(),
  amount: z.number(), // Raw cents (e.g., 90000 for $900.00) - frontend formats using CurrencyUtils
  currency: z.string(),
  status: z.string(),
  description: z.string(),
  date: z.string(), // ISO date string (serialized from Date)
  createdAt: z.string(), // ISO date string
  updatedAt: z.string(), // ISO date string
  stripePaymentIntentId: z.string().nullable(),
  enrollmentIds: z.array(z.number()),
  metadata: z.record(z.any()).nullable(),
  childName: z.string(),
  programName: z.string(),
  paymentMethod: z.string(),
  
  // Enriched fields from enrollment linking
  paymentPlan: z.string().nullable(),
  enrollmentDetails: z.array(z.object({
    enrollmentId: z.number(),
    childName: z.string(),
    className: z.string(),
    status: z.string(),
    paymentPlan: z.string().nullable(),
  })),
  
  // Stripe enrichment fields (nullable when no Stripe data available)
  stripeStatus: z.string().nullable(),
  stripeAmount: z.number().nullable(), // Amount in cents from Stripe
  stripeCreated: z.string().nullable(), // ISO date string from Stripe timestamp
  
  // Future enhancement fields
  nextPaymentDate: z.string().nullable().optional(), // ISO date string
  source: z.enum(['database', 'stripe']).optional(), // Tag for Stripe-only payments
  
  // Discount tracking fields for payment history display
  subtotalAmount: z.number().nullable().optional(), // Original subtotal before discounts (cents)
  discountTotal: z.number().nullable().optional(), // Total discount applied (cents)
  discountSnapshot: z.object({
    subtotal: z.number(),
    discountTotal: z.number(),
    appliedDiscounts: z.array(z.object({
      source: z.enum(['promo', 'sibling', 'free_after_threshold', 'automatic', 'bundle']),
      discountId: z.number().optional(),
      code: z.string().optional(),
      name: z.string(),
      type: z.string(),
      value: z.number(),
      amount: z.number(),
    })),
  }).nullable().optional(),
});

export type EnrichedPaymentHistory = z.infer<typeof enrichedPaymentHistorySchema>;

// API response wrapper for payment history endpoint
export const enrichedPaymentHistoryListResponseSchema = z.object({
  success: z.boolean(),
  payments: z.array(enrichedPaymentHistorySchema),
});

export type EnrichedPaymentHistoryListResponse = z.infer<typeof enrichedPaymentHistoryListResponseSchema>;

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
  
  // Reminder tracking
  reminderCount: integer("reminder_count").default(0).notNull(),
  lastReminderSentAt: timestamp("last_reminder_sent_at"),
  
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
    reminderCount: z.number().default(0),
    lastReminderSentAt: z.date().nullable().default(null),
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

// Stripe Payment History table - for syncing payment data from Stripe API
export const stripePaymentHistory = pgTable("stripe_payment_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Stripe identifiers
  paymentIntentId: text("payment_intent_id").notNull().unique(), // Stripe payment_intent ID
  customerId: text("customer_id").notNull(), // Stripe customer ID
  subscriptionId: text("subscription_id"), // Stripe subscription ID if applicable
  
  // Payment details (amounts in cents)
  amount: integer("amount").notNull(),
  currency: text("currency").default("usd").notNull(),
  
  // Discount tracking for payment dashboards
  subtotalAmount: integer("subtotal_amount"), // Original price before discounts (cents)
  discountTotal: integer("discount_total"), // Total discount applied (cents)
  discountSnapshot: jsonb("discount_snapshot"), // Immutable snapshot of discounts at payment time
  
  // Payment status from Stripe
  status: text("status", { 
    enum: ["succeeded", "pending", "failed", "canceled", "refunded"] 
  }).notNull(),
  
  // Payment method and metadata
  paymentMethod: text("payment_method"), // card, bank_transfer, etc.
  description: text("description"),
  
  // Unified payment processing fields (PaymentProcessorService)
  idempotencyKey: text("idempotency_key").unique(), // Prevent duplicate processing
  source: text("source", { 
    enum: ["stripe", "manual", "payment_plan"] 
  }), // Payment source type
  snapshotJson: jsonb("snapshot_json"), // Canonical cart snapshot at payment time
  snapshotChecksum: text("snapshot_checksum"), // HMAC checksum for integrity verification
  
  // Timestamps
  stripeCreatedAt: timestamp("stripe_created_at").notNull(), // When payment was created in Stripe
  createdAt: timestamp("created_at").defaultNow().notNull(), // When we synced it to our DB
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStripePaymentHistorySchema = createInsertSchema(stripePaymentHistory)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    subscriptionId: z.string().nullable().default(null),
    paymentMethod: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
    subtotalAmount: z.number().nullable().default(null),
    discountTotal: z.number().nullable().default(null),
    discountSnapshot: z.any().nullable().default(null),
    idempotencyKey: z.string().nullable().default(null),
    source: z.enum(["stripe", "manual", "payment_plan"]).nullable().default(null),
    snapshotJson: z.any().nullable().default(null),
    snapshotChecksum: z.string().nullable().default(null),
  });
export type InsertStripePaymentHistory = z.infer<typeof insertStripePaymentHistorySchema>;
export type StripePaymentHistory = typeof stripePaymentHistory.$inferSelect;

// Payment Discounts table - normalized discount breakdown per payment for reporting
export const paymentDiscounts = pgTable("payment_discounts", {
  id: serial("id").primaryKey(),
  paymentHistoryId: integer("payment_history_id").notNull().references(() => stripePaymentHistory.id, { onDelete: 'cascade' }),
  discountId: integer("discount_id").references(() => discounts.id), // Optional reference to discount record
  
  // Discount source type
  source: text("source", {
    enum: ["promo", "sibling", "free_after_threshold", "automatic", "bundle"]
  }).notNull(),
  
  // Snapshot of discount details at time of payment (immutable)
  codeSnapshot: text("code_snapshot"), // Promo code if applicable
  nameSnapshot: text("name_snapshot"), // Discount name at time of payment
  typeSnapshot: text("type_snapshot"), // percentage, fixed_amount, bundle
  valueSnapshot: integer("value_snapshot"), // Discount value (percentage or fixed amount)
  
  // Amount applied (in cents)
  amount: integer("amount").notNull(),
  
  // Link to specific enrollment if applicable
  enrollmentId: integer("enrollment_id").references(() => schoolClassEnrollments.id),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentDiscountSchema = createInsertSchema(paymentDiscounts)
  .omit({ id: true, createdAt: true })
  .extend({
    discountId: z.number().nullable().default(null),
    codeSnapshot: z.string().nullable().default(null),
    nameSnapshot: z.string().nullable().default(null),
    typeSnapshot: z.string().nullable().default(null),
    valueSnapshot: z.number().nullable().default(null),
    enrollmentId: z.number().nullable().default(null),
  });
export type InsertPaymentDiscount = z.infer<typeof insertPaymentDiscountSchema>;
export type PaymentDiscount = typeof paymentDiscounts.$inferSelect;

// Payment Allocations table - links payments to enrollments for deriving totals
// This is the source of truth for "how much has been paid toward each enrollment"
export const paymentAllocations = pgTable("payment_allocations", {
  id: serial("id").primaryKey(),
  paymentHistoryId: integer("payment_history_id").notNull().references(() => stripePaymentHistory.id, { onDelete: 'cascade' }),
  enrollmentId: integer("enrollment_id").notNull().references(() => schoolClassEnrollments.id, { onDelete: 'cascade' }),
  
  // Amount allocated to this enrollment (in cents)
  // Positive for payments, negative for refunds
  allocatedAmountCents: integer("allocated_amount_cents").notNull(),
  
  // Allocation type for audit trail
  allocationType: text("allocation_type", {
    enum: ["payment", "refund", "reallocation_out", "reallocation_in", "adjustment"]
  }).notNull().default("payment"),
  
  // Optional reference to source allocation (for reallocations)
  sourceAllocationId: integer("source_allocation_id"),
  
  // Admin comment for manual adjustments/reallocations
  adminComment: text("admin_comment"),
  
  // Metadata for audit trail
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentAllocationSchema = createInsertSchema(paymentAllocations)
  .omit({ id: true, createdAt: true })
  .extend({
    sourceAllocationId: z.number().nullable().default(null),
    adminComment: z.string().nullable().default(null),
    metadata: z.any().nullable().default(null),
  });
export type InsertPaymentAllocation = z.infer<typeof insertPaymentAllocationSchema>;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;

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
  totalAmount: integer("total_amount").notNull(), // Total membership amount in cents (required by database)
  balanceDue: integer("balance_due").notNull(), // Balance still owed in cents (required by database)
  status: text("status", { 
    enum: ["pending_payment", "enrolled", "expired", "grace_period", "suspended"] 
  }).default("pending_payment").notNull(),
  dueDate: timestamp("due_date").notNull(), // When membership payment is due
  endDate: timestamp("end_date").notNull(), // When membership period ends (same as expirationDate for consistency)
  expirationDate: timestamp("expiration_date").notNull(), // When membership expires
  gracePeriodEnd: timestamp("grace_period_end"), // End of grace period if applicable
  paymentMethod: text("payment_method", { 
    enum: ["credit_card", "paypal", "bank_transfer", "cash", "check", "other"] 
  }),
  notes: text("notes"),
  // Stripe integration for subscription-based memberships
  membershipTier: text("membership_tier", {
    enum: ["basic", "standard", "premium", "vip"]
  }).default("basic").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id"), // Stripe subscription ID for recurring billing
  stripeCustomerId: text("stripe_customer_id"), // Stripe customer ID
  startDate: timestamp("start_date"), // When membership actually started (payment date)
  renewalDate: timestamp("renewal_date"), // Individual anniversary renewal date
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
    membershipTier: z.enum(["basic", "standard", "premium", "vip"]).default("basic"),
    stripeSubscriptionId: z.string().nullable().default(null),
    stripeCustomerId: z.string().nullable().default(null),
    startDate: z.date().nullable().default(null),
    renewalDate: z.date().nullable().default(null),
    endDate: z.date(), // Required field - when membership period ends
    totalAmount: z.number(), // Required field - total membership amount in cents
    balanceDue: z.number(), // Required field - balance still owed in cents
  });
export type InsertMembershipEnrollment = z.infer<typeof insertMembershipEnrollmentSchema>;
export type MembershipEnrollment = typeof membershipEnrollments.$inferSelect;

/** 
 * Valid membership statuses that indicate a fully paid/active membership.
 * Use isActiveMembership() helper for consistent status checks across the codebase.
 * - 'enrolled': Membership is fully paid and active
 * - 'grace_period': Membership expired but still within grace period (counts as active)
 */
export const VALID_PAID_MEMBERSHIP_STATUSES = ['enrolled', 'grace_period'] as const;

/** Type for valid paid membership statuses */
export type PaidMembershipStatus = typeof VALID_PAID_MEMBERSHIP_STATUSES[number];

/** 
 * Check if a membership status indicates an active/paid membership.
 * Use this instead of checking status directly for consistency across the codebase.
 * @param status - The membership status to check
 * @returns true if the membership is considered active (enrolled or in grace period)
 */
export function isActiveMembership(status: string | null | undefined): boolean {
  return !!status && (VALID_PAID_MEMBERSHIP_STATUSES as readonly string[]).includes(status);
}

// Define membership enrollment relations
export const membershipEnrollmentsRelations = relations(membershipEnrollments, ({ one }) => ({
  school: one(schools, { fields: [membershipEnrollments.schoolId], references: [schools.id] }),
  parent: one(users, { fields: [membershipEnrollments.parentUserId], references: [users.id] })
}));

// Membership Agreements table - stores signed membership agreements
export const membershipAgreements = pgTable("membership_agreements", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  parentUserId: integer("parent_user_id").notNull().references(() => users.id),
  membershipEnrollmentId: integer("membership_enrollment_id").references(() => membershipEnrollments.id), // Optional link to specific enrollment
  signatoryName: text("signatory_name").notNull(), // Legal name used for signature
  agreementVersion: text("agreement_version").notNull(), // Version of agreement that was signed
  agreementContent: text("agreement_content").notNull(), // Full text of the agreement at time of signing (preserved for legal purposes)
  signedAt: timestamp("signed_at").defaultNow().notNull(), // When the agreement was signed
  ipAddress: text("ip_address"), // IP address for audit purposes
  userAgent: text("user_agent"), // Browser/device info for audit purposes
  documentPath: text("document_path"), // Path to PDF copy in storage (optional)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMembershipAgreementSchema = createInsertSchema(membershipAgreements)
  .omit({ id: true, createdAt: true, signedAt: true })
  .extend({
    signatoryName: z.string().min(2, "Legal name is required"),
    agreementVersion: z.string().default("1.0"),
    agreementContent: z.string().min(1, "Agreement content is required"),
    ipAddress: z.string().nullable().default(null),
    userAgent: z.string().nullable().default(null),
    documentPath: z.string().nullable().default(null),
    membershipEnrollmentId: z.number().nullable().default(null),
  });
export type InsertMembershipAgreement = z.infer<typeof insertMembershipAgreementSchema>;
export type MembershipAgreement = typeof membershipAgreements.$inferSelect;

// Define membership agreement relations
export const membershipAgreementsRelations = relations(membershipAgreements, ({ one }) => ({
  school: one(schools, { fields: [membershipAgreements.schoolId], references: [schools.id] }),
  parent: one(users, { fields: [membershipAgreements.parentUserId], references: [users.id] }),
  enrollment: one(membershipEnrollments, { fields: [membershipAgreements.membershipEnrollmentId], references: [membershipEnrollments.id] })
}));

// School Documents table - for admin-uploaded documents that parents can view
export const schoolDocuments = pgTable("school_documents", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  uploadedBy: integer("uploaded_by").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category", { enum: ["policy", "form", "handbook", "announcement", "other"] }).default("other").notNull(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  isPublished: boolean("is_published").default(true).notNull(),
  visibleToAll: boolean("visible_to_all").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSchoolDocumentSchema = createInsertSchema(schoolDocuments)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    title: z.string().min(1, "Title is required"),
    description: z.string().nullable().default(null),
    category: z.enum(["policy", "form", "handbook", "announcement", "other"]).default("other"),
    fileName: z.string().min(1),
    filePath: z.string().min(1),
    fileSize: z.number().positive(),
    mimeType: z.string().min(1),
    isPublished: z.boolean().default(true),
    visibleToAll: z.boolean().default(true),
  });
export type InsertSchoolDocument = z.infer<typeof insertSchoolDocumentSchema>;
export type SchoolDocument = typeof schoolDocuments.$inferSelect;

// Define school document relations
export const schoolDocumentsRelations = relations(schoolDocuments, ({ one }) => ({
  school: one(schools, { fields: [schoolDocuments.schoolId], references: [schools.id] }),
  uploader: one(users, { fields: [schoolDocuments.uploadedBy], references: [users.id] })
}));

// Payment Receipts table - automatically generated when payments are made
export const paymentReceipts = pgTable("payment_receipts", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  parentUserId: integer("parent_user_id").notNull().references(() => users.id),
  receiptNumber: text("receipt_number").notNull().unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  enrollmentIds: integer("enrollment_ids").array(),
  childNames: text("child_names").array(),
  classNames: text("class_names").array(),
  amount: integer("amount").notNull(),
  paymentMethod: text("payment_method"),
  paymentDate: timestamp("payment_date").defaultNow().notNull(),
  status: text("status", { enum: ["generated", "downloaded", "emailed"] }).default("generated").notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentReceiptSchema = createInsertSchema(paymentReceipts)
  .omit({ id: true, createdAt: true, paymentDate: true })
  .extend({
    receiptNumber: z.string().min(1),
    stripePaymentIntentId: z.string().nullable().default(null),
    enrollmentIds: z.array(z.number()).nullable().default(null),
    childNames: z.array(z.string()).nullable().default(null),
    classNames: z.array(z.string()).nullable().default(null),
    amount: z.number().positive(),
    paymentMethod: z.string().nullable().default(null),
    status: z.enum(["generated", "downloaded", "emailed"]).default("generated"),
    metadata: z.record(z.any()).default({}),
  });
export type InsertPaymentReceipt = z.infer<typeof insertPaymentReceiptSchema>;
export type PaymentReceipt = typeof paymentReceipts.$inferSelect;

// Define payment receipt relations
export const paymentReceiptsRelations = relations(paymentReceipts, ({ one }) => ({
  school: one(schools, { fields: [paymentReceipts.schoolId], references: [schools.id] }),
  parent: one(users, { fields: [paymentReceipts.parentUserId], references: [users.id] })
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

// Events table (extended for school calendar)
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  location: text("location"),
  organizerId: integer("organizer_id").notNull().references(() => users.id),
  schoolId: integer("school_id").references(() => schools.id),
  eventType: text("event_type", { enum: ["class", "meeting", "workshop", "camp", "holiday", "deadline", "special", "other"] }).notNull(),
  color: text("color"),
  isAllDay: boolean("is_all_day").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// Define role invitation relations
export const roleInvitationsRelations = relations(roleInvitations, ({ one }) => ({
  inviter: one(users, { fields: [roleInvitations.invitedBy], references: [users.id] }),
  school: one(schools, { fields: [roleInvitations.schoolId], references: [schools.id] })
}));

// Define event relations
export const eventsRelations = relations(events, ({ one }) => ({
  organizer: one(users, { fields: [events.organizerId], references: [users.id] }),
  school: one(schools, { fields: [events.schoolId], references: [schools.id] })
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
  categoryId: integer("category_id").references(() => categories.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // DEPRECATED: Will be removed after migration - use categoryId instead
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
  
  // Volunteer waiver - document that volunteers must sign before assisting
  volunteerWaiverId: integer("volunteer_waiver_id").references(() => schoolDocuments.id),
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
    
    // Volunteer waiver (optional)
    volunteerWaiverId: z.number().nullable().optional(),
  });
export type InsertClass = z.infer<typeof insertClassSchema>;
export type Class = typeof classes.$inferSelect;

// Define class relations
export const classesRelations = relations(classes, ({ one }) => ({
  instructor: one(users, { fields: [classes.instructorId], references: [users.id] }),
  curriculum: one(curricula, { fields: [classes.curriculumId], references: [curricula.id] }),
}));

// Class Inclusions - tracks which classes are included in other classes (e.g., Full Day includes Woodshop, Art, Music)
export const classInclusions = pgTable("class_inclusions", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  parentClassId: integer("parent_class_id").notNull().references(() => classes.id, { onDelete: "cascade" }), // The "container" class (e.g., Full Day)
  includedClassId: integer("included_class_id").notNull().references(() => classes.id, { onDelete: "cascade" }), // The included class (e.g., Woodshop)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertClassInclusionSchema = createInsertSchema(classInclusions)
  .omit({ id: true, createdAt: true });
export type InsertClassInclusion = z.infer<typeof insertClassInclusionSchema>;
export type ClassInclusion = typeof classInclusions.$inferSelect;

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
  canViewParentContacts: boolean("can_view_parent_contacts").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserLocationSchema = createInsertSchema(userLocations)
  .omit({ id: true, createdAt: true, updatedAt: true, assignedAt: true });
export type InsertUserLocation = z.infer<typeof insertUserLocationSchema>;
export type UserLocation = typeof userLocations.$inferSelect;

// Categories table for class/program categorization (school-specific)
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  name: text("name").notNull(), // e.g., "Early Childhood", "High School", "Kindergarten"
  description: text("description"), // Optional description of the category
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint to prevent duplicate categories within the same school
  uniqueSchoolCategory: unique("categories_school_id_name_unique").on(table.schoolId, table.name)
}));

export const insertCategorySchema = createInsertSchema(categories)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    description: z.string().nullable().default(null),
  });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

// Notifications table for enhanced messaging system (extended for announcements)
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => users.id),
  schoolId: integer("school_id").references(() => schools.id),
  type: text("type", { 
    enum: ["email", "in_app", "sms", "both", "all"] 
  }).notNull().default("both"),
  priority: text("priority", { 
    enum: ["low", "normal", "high", "urgent"] 
  }).notNull().default("normal"),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  targetType: text("target_type", { 
    enum: ["individual", "role", "location", "all", "all_parents", "enrolled_parents", "unenrolled_parents", "class_specific", "missed_payments"] 
  }).notNull(),
  targetData: jsonb("target_data").notNull(),
  targetClassId: integer("target_class_id").references(() => schoolClasses.id),
  targetUserIds: integer("target_user_ids").array(),
  isAnnouncement: boolean("is_announcement").default(false),
  isPinned: boolean("is_pinned").default(false),
  scheduledFor: timestamp("scheduled_for"),
  sentAt: timestamp("sent_at"),
  expiresAt: timestamp("expires_at"),
  status: text("status", { 
    enum: ["draft", "scheduled", "sending", "sent", "failed"] 
  }).default("draft").notNull(),
  deliveryStats: jsonb("delivery_stats").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications)
  .omit({ id: true, createdAt: true, updatedAt: true, sentAt: true })
  .extend({
    scheduledFor: z.string().nullable().transform((str) => str ? new Date(str) : null),
    expiresAt: z.string().nullable().optional().transform((str) => str ? new Date(str) : null),
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
  school: one(schools, { fields: [notifications.schoolId], references: [schools.id] }),
  targetClass: one(schoolClasses, { fields: [notifications.targetClassId], references: [schoolClasses.id] }),
  recipients: many(notificationRecipients),
}));

export const notificationRecipientsRelations = relations(notificationRecipients, ({ one }) => ({
  notification: one(notifications, { fields: [notificationRecipients.notificationId], references: [notifications.id] }),
  recipient: one(users, { fields: [notificationRecipients.recipientId], references: [users.id] }),
}));

// Legacy payment tables are now defined earlier in the schema with comprehensive financial tracking
// See programEnrollments, payments, scheduledPayments, and refunds tables above

// Saved audiences for announcement targeting
export const savedAudiences = pgTable("saved_audiences", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").references(() => schools.id).notNull(),
  name: text("name").notNull(),
  targetType: text("target_type").notNull(),
  targetClassId: integer("target_class_id").references(() => schoolClasses.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSavedAudienceSchema = createInsertSchema(savedAudiences).omit({ id: true, createdAt: true });
export type InsertSavedAudience = z.infer<typeof insertSavedAudienceSchema>;
export type SavedAudience = typeof savedAudiences.$inferSelect;

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
  appliesToMembership: boolean("applies_to_membership").default(false), // Apply to membership fees
  
  // Role-based discount eligibility
  requiredRoles: text("required_roles").array(), // Roles required for discount (e.g., ["parent", "educator"])
  roleMatchLogic: text("role_match_logic", { enum: ["and", "or"] }).default("or"), // "and" = user must have ALL roles, "or" = user must have ANY role
  
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

// ==========================================
// EDUCATOR DASHBOARD TABLES (Phase 1a)
// ==========================================

// Educator Class Assignments - Links educators to classes with permissions
export const educatorClassAssignments = pgTable("educator_class_assignments", {
  id: serial("id").primaryKey(),
  educatorId: integer("educator_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  classId: integer("class_id").notNull().references(() => classes.id, { onDelete: 'cascade' }),
  schoolId: integer("school_id").notNull().references(() => schools.id, { onDelete: 'cascade' }),
  isPrimary: boolean("is_primary").default(true).notNull(), // Primary teacher vs assistant
  canStartSession: boolean("can_start_session").default(true).notNull(), // Permission to start/end sessions
  validFrom: date("valid_from"), // For substitutes: when assignment starts
  validTo: date("valid_to"), // For substitutes: when assignment ends (null = permanent)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEducatorClassAssignmentSchema = createInsertSchema(educatorClassAssignments)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEducatorClassAssignment = z.infer<typeof insertEducatorClassAssignmentSchema>;
export type EducatorClassAssignment = typeof educatorClassAssignments.$inferSelect;

// Class Sessions - Tracks individual class session instances
export const classSessions = pgTable("class_sessions", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().references(() => classes.id, { onDelete: 'cascade' }),
  schoolId: integer("school_id").notNull().references(() => schools.id, { onDelete: 'cascade' }),
  educatorId: integer("educator_id").notNull().references(() => users.id), // Who started the session
  substituteEducatorId: integer("substitute_educator_id").references(() => users.id), // If covered by substitute
  
  // Scheduled times (set by admin via educator_schedules in Phase 1b)
  scheduledDate: date("scheduled_date").notNull(),
  scheduledStartTime: text("scheduled_start_time").notNull(), // HH:MM format
  scheduledEndTime: text("scheduled_end_time").notNull(), // HH:MM format
  
  // Actual times (recorded when educator checks in/out)
  actualStartTime: timestamp("actual_start_time"), // When educator clicked "Start Class"
  actualEndTime: timestamp("actual_end_time"), // When educator clicked "End Class"
  
  // Session status
  status: text("status", { 
    enum: ["scheduled", "in_progress", "completed", "cancelled", "no_show"] 
  }).default("scheduled").notNull(),
  cancelledReason: text("cancelled_reason"), // If cancelled, why
  
  // Session content
  notes: text("notes"), // Educator notes about the session
  dailyFlowEntryId: integer("daily_flow_entry_id").references(() => dailyFlowEntries.id), // Link to lesson plan
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertClassSessionSchema = createInsertSchema(classSessions)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClassSession = z.infer<typeof insertClassSessionSchema>;
export type ClassSession = typeof classSessions.$inferSelect;

// Relations for educator dashboard tables
export const educatorClassAssignmentsRelations = relations(educatorClassAssignments, ({ one }) => ({
  educator: one(users, { fields: [educatorClassAssignments.educatorId], references: [users.id] }),
  class: one(classes, { fields: [educatorClassAssignments.classId], references: [classes.id] }),
  school: one(schools, { fields: [educatorClassAssignments.schoolId], references: [schools.id] }),
}));

export const classSessionsRelations = relations(classSessions, ({ one }) => ({
  class: one(classes, { fields: [classSessions.classId], references: [classes.id] }),
  school: one(schools, { fields: [classSessions.schoolId], references: [schools.id] }),
  educator: one(users, { fields: [classSessions.educatorId], references: [users.id] }),
  substituteEducator: one(users, { fields: [classSessions.substituteEducatorId], references: [users.id] }),
  dailyFlowEntry: one(dailyFlowEntries, { fields: [classSessions.dailyFlowEntryId], references: [dailyFlowEntries.id] }),
}));

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

// ===== PHASE 1B: Educator Schedules & Audit Logs =====

// Educator Schedules - Admin-set time blocks for educators per class
export const educatorSchedules = pgTable("educator_schedules", {
  id: serial("id").primaryKey(),
  
  // Links to assignment (enforces permission scope)
  assignmentId: integer("assignment_id").notNull().references(() => educatorClassAssignments.id, { onDelete: 'cascade' }),
  
  // Denormalized for query efficiency
  educatorId: integer("educator_id").notNull().references(() => users.id),
  classId: integer("class_id").notNull().references(() => classes.id),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  
  // Schedule type: recurring (weekly), one_time (specific date), adhoc (flexible)
  scheduleType: text("schedule_type", { enum: ["recurring", "one_time", "adhoc"] }).default("recurring").notNull(),
  
  // For recurring schedules (0=Sunday, 1=Monday, ..., 6=Saturday)
  dayOfWeek: integer("day_of_week"),
  
  // For one-time schedules
  scheduledDate: text("scheduled_date"), // YYYY-MM-DD format
  
  // Time range (stored as HH:MM format in 24-hour time)
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  
  // Effective date range (when this schedule is valid)
  effectiveFrom: text("effective_from").notNull(), // YYYY-MM-DD
  effectiveTo: text("effective_to"), // YYYY-MM-DD, null = indefinite
  
  // Status and metadata
  isActive: boolean("is_active").default(true).notNull(),
  timezone: text("timezone").default("America/New_York").notNull(),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEducatorScheduleSchema = createInsertSchema(educatorSchedules)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEducatorSchedule = z.infer<typeof insertEducatorScheduleSchema>;
export type EducatorSchedule = typeof educatorSchedules.$inferSelect;

// Educator Schedules relations
export const educatorSchedulesRelations = relations(educatorSchedules, ({ one }) => ({
  assignment: one(educatorClassAssignments, { fields: [educatorSchedules.assignmentId], references: [educatorClassAssignments.id] }),
  educator: one(users, { fields: [educatorSchedules.educatorId], references: [users.id] }),
  class: one(classes, { fields: [educatorSchedules.classId], references: [classes.id] }),
  school: one(schools, { fields: [educatorSchedules.schoolId], references: [schools.id] }),
}));

// Audit Logs - Tracks all actions for compliance and debugging
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  
  // Action details
  actionType: text("action_type").notNull(), // e.g., 'session_start', 'session_end', 'schedule_create', 'schedule_update'
  severity: text("severity", { enum: ["info", "warn", "error"] }).default("info").notNull(),
  
  // Actor (who performed the action)
  actorId: integer("actor_id").references(() => users.id),
  actorRole: text("actor_role"), // Role at time of action (for historical accuracy)
  actorEmail: text("actor_email"), // Email for reference even if user deleted
  
  // Target (what was affected)
  targetType: text("target_type").notNull(), // e.g., 'class_session', 'educator_schedule', 'user'
  targetId: text("target_id").notNull(), // ID of the target (text to support various ID formats)
  
  // Context
  schoolId: integer("school_id").references(() => schools.id),
  requestId: text("request_id"), // For correlating related logs
  
  // Request metadata
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  
  // Detailed metadata (before/after state, additional context)
  metadata: jsonb("metadata").default({}).notNull(), // { context, before, after, diff, error }
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs)
  .omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Audit Logs relations
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
  school: one(schools, { fields: [auditLogs.schoolId], references: [schools.id] }),
}));

// ==========================================
// PHASE 2: ATTENDANCE TRACKING
// ==========================================

// Session Attendance - Tracks student attendance per class session
export const sessionAttendance = pgTable("session_attendance", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => classSessions.id, { onDelete: 'cascade' }),
  childId: integer("child_id").notNull().references(() => children.id, { onDelete: 'cascade' }),
  schoolId: integer("school_id").notNull().references(() => schools.id, { onDelete: 'cascade' }),
  
  // Attendance status
  status: text("status", { 
    enum: ["present", "absent", "late", "excused", "early_departure"] 
  }).default("present").notNull(),
  
  // Timestamps
  checkInTime: timestamp("check_in_time"), // Actual arrival time
  checkOutTime: timestamp("check_out_time"), // Actual departure time
  
  // Additional info
  tardyMinutes: integer("tardy_minutes"), // How many minutes late
  earlyDepartureMinutes: integer("early_departure_minutes"), // How many minutes early left
  excuseReason: text("excuse_reason"), // Reason for absence/early departure
  notes: text("notes"), // Educator notes about attendance
  
  // Who recorded the attendance
  recordedBy: integer("recorded_by").notNull().references(() => users.id),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  
  // Tracking
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSessionAttendanceSchema = createInsertSchema(sessionAttendance)
  .omit({ id: true, createdAt: true, updatedAt: true, recordedAt: true });
export type InsertSessionAttendance = z.infer<typeof insertSessionAttendanceSchema>;
export type SessionAttendance = typeof sessionAttendance.$inferSelect;

// Session Attendance relations
export const sessionAttendanceRelations = relations(sessionAttendance, ({ one }) => ({
  session: one(classSessions, { fields: [sessionAttendance.sessionId], references: [classSessions.id] }),
  child: one(children, { fields: [sessionAttendance.childId], references: [children.id] }),
  school: one(schools, { fields: [sessionAttendance.schoolId], references: [schools.id] }),
  recorder: one(users, { fields: [sessionAttendance.recordedBy], references: [users.id] }),
}));

// ==========================================
// ERROR TRACKING & TELEMETRY
// ==========================================

// Error Logs - Track application errors for debugging and monitoring
export const errorLogs = pgTable("error_logs", {
  id: serial("id").primaryKey(),
  
  // Error identification
  errorType: text("error_type", { 
    enum: ["frontend", "backend", "api", "database", "auth", "payment", "unknown"] 
  }).default("unknown").notNull(),
  severity: text("severity", { 
    enum: ["low", "medium", "high", "critical"] 
  }).default("medium").notNull(),
  
  // Error details
  message: text("message").notNull(),
  stackTrace: text("stack_trace"),
  errorCode: text("error_code"), // HTTP status code or custom error code
  
  // Context
  url: text("url"), // URL where error occurred
  route: text("route"), // API route or page route
  method: text("method"), // HTTP method (GET, POST, etc.)
  
  // User context (if authenticated)
  userId: integer("user_id").references(() => users.id),
  userEmail: text("user_email"),
  schoolId: integer("school_id").references(() => schools.id),
  
  // Request metadata
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  requestBody: jsonb("request_body"), // Sanitized request body (no PII)
  
  // Additional context
  metadata: jsonb("metadata").default({}).notNull(), // { componentStack, breadcrumbs, custom data }
  
  // Resolution tracking
  status: text("status", { 
    enum: ["new", "acknowledged", "investigating", "resolved", "ignored"] 
  }).default("new").notNull(),
  resolvedBy: integer("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  
  // Notification tracking
  notificationSent: boolean("notification_sent").default(false).notNull(),
  notificationSentAt: timestamp("notification_sent_at"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertErrorLogSchema = createInsertSchema(errorLogs)
  .omit({ id: true, createdAt: true, updatedAt: true, resolvedAt: true, notificationSentAt: true });
export type InsertErrorLog = z.infer<typeof insertErrorLogSchema>;
export type ErrorLog = typeof errorLogs.$inferSelect;

// Error Logs relations
export const errorLogsRelations = relations(errorLogs, ({ one }) => ({
  user: one(users, { fields: [errorLogs.userId], references: [users.id] }),
  school: one(schools, { fields: [errorLogs.schoolId], references: [schools.id] }),
  resolver: one(users, { fields: [errorLogs.resolvedBy], references: [users.id] }),
}));

// ==================== VOLUNTEER MANAGEMENT (Phase 2) ====================

// Signed Waivers - Tracks one-time volunteer waiver signatures
export const signedWaivers = pgTable("signed_waivers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  schoolId: integer("school_id").notNull().references(() => schools.id, { onDelete: 'cascade' }),
  documentId: integer("document_id").notNull().references(() => schoolDocuments.id), // The waiver document
  
  // Signature details
  signedAt: timestamp("signed_at").defaultNow().notNull(),
  signatoryName: text("signatory_name").notNull(), // Legal name as signed
  
  // Signature image storage (object storage)
  signatureUrl: text("signature_url"),
  signatureMimeType: text("signature_mime_type"),
  signatureSizeBytes: integer("signature_size_bytes"),
  signatureUploadedAt: timestamp("signature_uploaded_at"),
  
  // Metadata for audit
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  
  // Expiration (waivers may need to be re-signed annually)
  expiresAt: timestamp("expires_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSignedWaiverSchema = createInsertSchema(signedWaivers)
  .omit({ id: true, createdAt: true, signedAt: true });
export type InsertSignedWaiver = z.infer<typeof insertSignedWaiverSchema>;
export type SignedWaiver = typeof signedWaivers.$inferSelect;

export const signedWaiversRelations = relations(signedWaivers, ({ one }) => ({
  user: one(users, { fields: [signedWaivers.userId], references: [users.id] }),
  school: one(schools, { fields: [signedWaivers.schoolId], references: [schools.id] }),
  document: one(schoolDocuments, { fields: [signedWaivers.documentId], references: [schoolDocuments.id] }),
}));

// Session Volunteers - Tracks which volunteers/aides assisted in a class session
export const sessionVolunteers = pgTable("session_volunteers", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => classSessions.id, { onDelete: 'cascade' }),
  volunteerId: integer("volunteer_id").notNull().references(() => users.id),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  
  // Role for this session
  role: text("role", { enum: ["aide", "volunteer", "substitute"] }).notNull().default("volunteer"),
  
  // Time tracking for volunteer hours
  checkInTime: timestamp("check_in_time"),
  checkOutTime: timestamp("check_out_time"),
  actualMinutes: integer("actual_minutes"), // Calculated when they check out
  
  // Waiver reference - must have signed waiver before volunteering
  signedWaiverId: integer("signed_waiver_id").references(() => signedWaivers.id),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSessionVolunteerSchema = createInsertSchema(sessionVolunteers)
  .omit({ id: true, createdAt: true });
export type InsertSessionVolunteer = z.infer<typeof insertSessionVolunteerSchema>;
export type SessionVolunteer = typeof sessionVolunteers.$inferSelect;

export const sessionVolunteersRelations = relations(sessionVolunteers, ({ one }) => ({
  session: one(classSessions, { fields: [sessionVolunteers.sessionId], references: [classSessions.id] }),
  volunteer: one(users, { fields: [sessionVolunteers.volunteerId], references: [users.id] }),
  school: one(schools, { fields: [sessionVolunteers.schoolId], references: [schools.id] }),
  signedWaiver: one(signedWaivers, { fields: [sessionVolunteers.signedWaiverId], references: [signedWaivers.id] }),
}));

// Volunteer Credits - Credits earned by volunteering that can be applied to account balances
// Rate: $20/hr, non-cashable, 1-year expiration from approval date
export const volunteerCredits = pgTable("volunteer_credits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  schoolId: integer("school_id").notNull().references(() => schools.id, { onDelete: 'cascade' }),
  
  // Source of the credit
  sessionId: integer("session_id").references(() => classSessions.id), // Optional - credits can be manually added
  sessionVolunteerId: integer("session_volunteer_id").references(() => sessionVolunteers.id),
  
  // Hours and credit calculation ($20/hr rate)
  minutesWorked: integer("minutes_worked").notNull(),
  creditAmountCents: integer("credit_amount_cents").notNull(), // Calculated: Math.floor(minutes/60) * 2000 cents
  
  // Status workflow: pending -> approved/rejected
  status: text("status", { enum: ["pending", "approved", "rejected", "partially_used", "used", "expired"] }).notNull().default("pending"),
  
  // Admin approval tracking
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  
  // Usage tracking
  usedAmountCents: integer("used_amount_cents").default(0).notNull(), // Amount already applied to payments
  
  // Expiration - 1 year from approval date
  expiresAt: timestamp("expires_at"),
  
  // Notes
  notes: text("notes"), // Admin notes or description of the volunteer work
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVolunteerCreditSchema = createInsertSchema(volunteerCredits)
  .omit({ id: true, createdAt: true, updatedAt: true, approvedAt: true, usedAmountCents: true });
export type InsertVolunteerCredit = z.infer<typeof insertVolunteerCreditSchema>;
export type VolunteerCredit = typeof volunteerCredits.$inferSelect;

export const volunteerCreditsRelations = relations(volunteerCredits, ({ one }) => ({
  user: one(users, { fields: [volunteerCredits.userId], references: [users.id] }),
  school: one(schools, { fields: [volunteerCredits.schoolId], references: [schools.id] }),
  session: one(classSessions, { fields: [volunteerCredits.sessionId], references: [classSessions.id] }),
  sessionVolunteer: one(sessionVolunteers, { fields: [volunteerCredits.sessionVolunteerId], references: [sessionVolunteers.id] }),
  approver: one(users, { fields: [volunteerCredits.approvedBy], references: [users.id] }),
}));

// Credit Usage Log - Tracks when credits are applied to payments
export const creditUsageLogs = pgTable("credit_usage_logs", {
  id: serial("id").primaryKey(),
  creditId: integer("credit_id").notNull().references(() => volunteerCredits.id, { onDelete: 'cascade' }),
  paymentHistoryId: integer("payment_history_id").references(() => stripePaymentHistory.id), // May be null if payment failed
  
  amountCents: integer("amount_cents").notNull(), // Amount of credit applied
  description: text("description"), // What the credit was applied to
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCreditUsageLogSchema = createInsertSchema(creditUsageLogs)
  .omit({ id: true, createdAt: true });
export type InsertCreditUsageLog = z.infer<typeof insertCreditUsageLogSchema>;
export type CreditUsageLog = typeof creditUsageLogs.$inferSelect;

export const creditUsageLogsRelations = relations(creditUsageLogs, ({ one }) => ({
  credit: one(volunteerCredits, { fields: [creditUsageLogs.creditId], references: [volunteerCredits.id] }),
  paymentHistory: one(stripePaymentHistory, { fields: [creditUsageLogs.paymentHistoryId], references: [stripePaymentHistory.id] }),
}));

// ==================== UNIFIED CREDIT SYSTEM ====================
// Single ledger for all credit types: volunteer, referral, achievement, marketing, manual
// Designed for extensibility - new credit types can be added without schema changes

export const creditTypeEnum = ["volunteer", "referral", "achievement", "marketing", "manual", "fundraiser"] as const;
export type CreditType = typeof creditTypeEnum[number];

export const creditStatusEnum = ["pending", "approved", "rejected", "partially_used", "used", "expired", "revoked"] as const;
export type CreditStatus = typeof creditStatusEnum[number];

export const credits = pgTable("credits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  schoolId: integer("school_id").notNull().references(() => schools.id, { onDelete: 'cascade' }),
  
  // Credit type for filtering and extensibility
  creditType: text("credit_type", { enum: creditTypeEnum }).notNull(),
  
  // Source tracking - links to origin record (session_volunteer, referral, achievement, etc.)
  sourceType: text("source_type"), // 'session_volunteer', 'referral_signup', 'course_completion', 'manual_grant', etc.
  sourceId: integer("source_id"), // FK to source record (polymorphic)
  
  // Credit amount
  creditAmountCents: integer("credit_amount_cents").notNull(),
  usedAmountCents: integer("used_amount_cents").default(0).notNull(),
  
  // Status workflow: pending → approved/rejected → partially_used/used/expired/revoked
  status: text("status", { enum: creditStatusEnum }).notNull().default("pending"),
  
  // Admin approval tracking
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  
  // Expiration - set on approval (e.g., 1 year from approval date)
  expiresAt: timestamp("expires_at"),
  
  // Display info
  title: text("title"), // Human-readable title, e.g., "Volunteer Credit - Art Class Session"
  description: text("description"), // Detailed description
  
  // Type-specific data stored as JSONB for flexibility
  // For volunteer: { minutesWorked, hourlyRateCents, sessionId, sessionVolunteerId }
  // For referral: { referredUserId, referralCode }
  // For achievement: { achievementType, courseId, studentId }
  metadata: jsonb("metadata"),
  
  // Admin notes
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCreditSchema = createInsertSchema(credits)
  .omit({ id: true, createdAt: true, updatedAt: true, approvedAt: true, usedAmountCents: true });
export type InsertCredit = z.infer<typeof insertCreditSchema>;
export type Credit = typeof credits.$inferSelect;

export const creditsRelations = relations(credits, ({ one }) => ({
  user: one(users, { fields: [credits.userId], references: [users.id] }),
  school: one(schools, { fields: [credits.schoolId], references: [schools.id] }),
  approver: one(users, { fields: [credits.approvedBy], references: [users.id] }),
}));

// Unified Credit Usage Log - Tracks when any credit type is applied to payments
export const unifiedCreditUsageLogs = pgTable("unified_credit_usage_logs", {
  id: serial("id").primaryKey(),
  creditId: integer("credit_id").notNull().references(() => credits.id, { onDelete: 'cascade' }),
  paymentHistoryId: integer("payment_history_id").references(() => stripePaymentHistory.id),
  
  amountCents: integer("amount_cents").notNull(),
  description: text("description"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUnifiedCreditUsageLogSchema = createInsertSchema(unifiedCreditUsageLogs)
  .omit({ id: true, createdAt: true });
export type InsertUnifiedCreditUsageLog = z.infer<typeof insertUnifiedCreditUsageLogSchema>;
export type UnifiedCreditUsageLog = typeof unifiedCreditUsageLogs.$inferSelect;

export const unifiedCreditUsageLogsRelations = relations(unifiedCreditUsageLogs, ({ one }) => ({
  credit: one(credits, { fields: [unifiedCreditUsageLogs.creditId], references: [credits.id] }),
  paymentHistory: one(stripePaymentHistory, { fields: [unifiedCreditUsageLogs.paymentHistoryId], references: [stripePaymentHistory.id] }),
}));

// ==================== CREDIT HOLDS ====================
// Reserve-then-finalize pattern: credits are held (reserved) during checkout,
// then finalized (converted to usage) on success or released on failure/expiration

export const creditHoldStatusEnum = ["pending", "finalized", "released", "expired"] as const;
export type CreditHoldStatus = typeof creditHoldStatusEnum[number];

export const creditHolds = pgTable("credit_holds", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  creditId: integer("credit_id").notNull().references(() => credits.id, { onDelete: 'cascade' }),
  
  amountCents: integer("amount_cents").notNull(),
  
  checkoutSessionId: text("checkout_session_id").notNull(),
  
  status: text("status", { enum: creditHoldStatusEnum }).notNull().default("pending"),
  
  expiresAt: timestamp("expires_at").notNull(),
  finalizedAt: timestamp("finalized_at"),
  releasedAt: timestamp("released_at"),
  
  description: text("description"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCreditHoldSchema = createInsertSchema(creditHolds)
  .omit({ id: true, createdAt: true, finalizedAt: true, releasedAt: true });
export type InsertCreditHold = z.infer<typeof insertCreditHoldSchema>;
export type CreditHold = typeof creditHolds.$inferSelect;

export const creditHoldsRelations = relations(creditHolds, ({ one }) => ({
  user: one(users, { fields: [creditHolds.userId], references: [users.id] }),
  credit: one(credits, { fields: [creditHolds.creditId], references: [credits.id] }),
}));

// ==================== ASSESSMENT & STUDENT PROGRESS TRACKING ====================

// Score format options for different assessment types
export const scoreFormatEnum = ["numeric", "fraction", "level", "percentage", "letter_grade"] as const;
export type ScoreFormat = typeof scoreFormatEnum[number];

// Assessment category for grouping
export const assessmentCategoryEnum = ["reading", "math", "phonics", "writing", "science", "history", "custom"] as const;
export type AssessmentCategory = typeof assessmentCategoryEnum[number];

// Assessment Types - defines different assessment tools like McCall-Crabbs, Phonograms, Math Levels
export const assessmentTypes = pgTable("assessment_types", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category", { enum: assessmentCategoryEnum }).notNull().default("custom"),
  scoreFormat: text("score_format", { enum: scoreFormatEnum }).notNull().default("numeric"),
  maxScore: integer("max_score"),
  levelOptions: text("level_options").array(),
  hasCurriculumBooks: boolean("has_curriculum_books").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueSchoolAssessmentType: unique("assessment_types_school_id_name_unique").on(table.schoolId, table.name)
}));

export const insertAssessmentTypeSchema = createInsertSchema(assessmentTypes)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    description: z.string().nullable().default(null),
    maxScore: z.number().nullable().default(null),
    levelOptions: z.array(z.string()).nullable().default(null),
  });
export type InsertAssessmentType = z.infer<typeof insertAssessmentTypeSchema>;
export type AssessmentType = typeof assessmentTypes.$inferSelect;

// Curriculum Books - for structured curricula like McCall-Crabbs Books A, B, C, D, E, F
export const curriculumBooks = pgTable("curriculum_books", {
  id: serial("id").primaryKey(),
  assessmentTypeId: integer("assessment_type_id").notNull().references(() => assessmentTypes.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  totalLessons: integer("total_lessons"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCurriculumBookSchema = createInsertSchema(curriculumBooks)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    description: z.string().nullable().default(null),
    totalLessons: z.number().nullable().default(null),
  });
export type InsertCurriculumBook = z.infer<typeof insertCurriculumBookSchema>;
export type CurriculumBook = typeof curriculumBooks.$inferSelect;

// Assessment source enum - tracks whether entry was manual or from in-app testing
export const assessmentSourceEnum = pgEnum("assessment_source", ["manual_entry", "in_app"]);

// Student Assessments - individual assessment records with location support
export const studentAssessments = pgTable("student_assessments", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  locationId: integer("location_id").references(() => locations.id),
  childId: integer("child_id").notNull().references(() => children.id, { onDelete: 'cascade' }),
  assessmentTypeId: integer("assessment_type_id").notNull().references(() => assessmentTypes.id),
  curriculumBookId: integer("curriculum_book_id").references(() => curriculumBooks.id),
  assessmentDate: timestamp("assessment_date").notNull(),
  score: text("score").notNull(),
  lesson: integer("lesson"),
  notes: text("notes"),
  source: assessmentSourceEnum("source").default("manual_entry").notNull(),
  lexileScore: integer("lexile_score"),
  sessionId: integer("session_id"),
  recordedBy: integer("recorded_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Assessment Sessions - for future in-app testing, tracks complete test sessions
export const assessmentSessions = pgTable("assessment_sessions", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  childId: integer("child_id").notNull().references(() => children.id, { onDelete: 'cascade' }),
  assessmentTypeId: integer("assessment_type_id").notNull().references(() => assessmentTypes.id),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  status: text("status").notNull().default("in_progress"),
  totalQuestions: integer("total_questions"),
  correctAnswers: integer("correct_answers"),
  timeSpentSeconds: integer("time_spent_seconds"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStudentAssessmentSchema = createInsertSchema(studentAssessments)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    locationId: z.number().nullable().default(null),
    curriculumBookId: z.number().nullable().default(null),
    lesson: z.number().nullable().default(null),
    notes: z.string().nullable().default(null),
    source: z.enum(["manual_entry", "in_app"]).default("manual_entry"),
    lexileScore: z.number().nullable().default(null),
    sessionId: z.number().nullable().default(null),
    assessmentDate: z.union([z.string(), z.date()]).transform((val) => typeof val === 'string' ? new Date(val) : val),
  });
export type InsertStudentAssessment = z.infer<typeof insertStudentAssessmentSchema>;
export type StudentAssessment = typeof studentAssessments.$inferSelect;

export const insertAssessmentSessionSchema = createInsertSchema(assessmentSessions)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    completedAt: z.union([z.string(), z.date(), z.null()]).transform((val) => val === null ? null : typeof val === 'string' ? new Date(val) : val).nullable().default(null),
    startedAt: z.union([z.string(), z.date()]).transform((val) => typeof val === 'string' ? new Date(val) : val),
    totalQuestions: z.number().nullable().default(null),
    correctAnswers: z.number().nullable().default(null),
    timeSpentSeconds: z.number().nullable().default(null),
    metadata: z.any().nullable().default(null),
  });
export type InsertAssessmentSession = z.infer<typeof insertAssessmentSessionSchema>;
export type AssessmentSession = typeof assessmentSessions.$inferSelect;

// Relations for assessment tables
export const assessmentTypesRelations = relations(assessmentTypes, ({ one, many }) => ({
  school: one(schools, { fields: [assessmentTypes.schoolId], references: [schools.id] }),
  curriculumBooks: many(curriculumBooks),
  studentAssessments: many(studentAssessments),
}));

export const curriculumBooksRelations = relations(curriculumBooks, ({ one, many }) => ({
  assessmentType: one(assessmentTypes, { fields: [curriculumBooks.assessmentTypeId], references: [assessmentTypes.id] }),
  studentAssessments: many(studentAssessments),
}));

export const studentAssessmentsRelations = relations(studentAssessments, ({ one }) => ({
  school: one(schools, { fields: [studentAssessments.schoolId], references: [schools.id] }),
  location: one(locations, { fields: [studentAssessments.locationId], references: [locations.id] }),
  child: one(children, { fields: [studentAssessments.childId], references: [children.id] }),
  assessmentType: one(assessmentTypes, { fields: [studentAssessments.assessmentTypeId], references: [assessmentTypes.id] }),
  curriculumBook: one(curriculumBooks, { fields: [studentAssessments.curriculumBookId], references: [curriculumBooks.id] }),
  recorder: one(users, { fields: [studentAssessments.recordedBy], references: [users.id] }),
  session: one(assessmentSessions, { fields: [studentAssessments.sessionId], references: [assessmentSessions.id] }),
}));

export const assessmentSessionsRelations = relations(assessmentSessions, ({ one, many }) => ({
  school: one(schools, { fields: [assessmentSessions.schoolId], references: [schools.id] }),
  child: one(children, { fields: [assessmentSessions.childId], references: [children.id] }),
  assessmentType: one(assessmentTypes, { fields: [assessmentSessions.assessmentTypeId], references: [assessmentTypes.id] }),
  assessments: many(studentAssessments),
}));

// ==================== FUNDRAISER SYSTEM ====================
// Campaigns, products, family links, and order tracking with automatic credit generation

export const fundraiserCampaigns = pgTable("fundraiser_campaigns", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFundraiserCampaignSchema = createInsertSchema(fundraiserCampaigns)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    description: z.string().nullable().default(null),
    startDate: z.union([z.string(), z.date()]).transform((val) => typeof val === 'string' ? new Date(val) : val),
    endDate: z.union([z.string(), z.date()]).transform((val) => typeof val === 'string' ? new Date(val) : val),
  });
export type InsertFundraiserCampaign = z.infer<typeof insertFundraiserCampaignSchema>;
export type FundraiserCampaign = typeof fundraiserCampaigns.$inferSelect;

export const fundraiserProducts = pgTable("fundraiser_products", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => fundraiserCampaigns.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  priceCents: integer("price_cents").notNull(),
  creditAmountCents: integer("credit_amount_cents").notNull(),
  stockQuantity: integer("stock_quantity"),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFundraiserProductSchema = createInsertSchema(fundraiserProducts)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    description: z.string().nullable().default(null),
    imageUrl: z.string().nullable().default(null),
    stockQuantity: z.number().nullable().default(null),
  });
export type InsertFundraiserProduct = z.infer<typeof insertFundraiserProductSchema>;
export type FundraiserProduct = typeof fundraiserProducts.$inferSelect;

export const fundraiserFamilyLinks = pgTable("fundraiser_family_links", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => fundraiserCampaigns.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  slug: text("slug").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueSlugPerCampaign: unique().on(table.campaignId, table.slug),
}));

export const insertFundraiserFamilyLinkSchema = createInsertSchema(fundraiserFamilyLinks)
  .omit({ id: true, createdAt: true });
export type InsertFundraiserFamilyLink = z.infer<typeof insertFundraiserFamilyLinkSchema>;
export type FundraiserFamilyLink = typeof fundraiserFamilyLinks.$inferSelect;

export const fundraiserOrderStatusEnum = ["pending", "paid", "fulfilled", "cancelled", "refunded"] as const;
export type FundraiserOrderStatus = typeof fundraiserOrderStatusEnum[number];

export const fundraiserOrders = pgTable("fundraiser_orders", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => fundraiserCampaigns.id),
  familyLinkId: integer("family_link_id").references(() => fundraiserFamilyLinks.id),
  sellerUserId: integer("seller_user_id").references(() => users.id),
  
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone"),
  
  totalCents: integer("total_cents").notNull(),
  creditEarnedCents: integer("credit_earned_cents").notNull(),
  
  status: text("status", { enum: fundraiserOrderStatusEnum }).default("pending").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeSessionId: text("stripe_session_id"),
  
  creditId: integer("credit_id").references(() => credits.id),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFundraiserOrderSchema = createInsertSchema(fundraiserOrders)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    customerPhone: z.string().nullable().default(null),
    familyLinkId: z.number().nullable().default(null),
    sellerUserId: z.number().nullable().default(null),
    stripePaymentIntentId: z.string().nullable().default(null),
    stripeSessionId: z.string().nullable().default(null),
    creditId: z.number().nullable().default(null),
  });
export type InsertFundraiserOrder = z.infer<typeof insertFundraiserOrderSchema>;
export type FundraiserOrder = typeof fundraiserOrders.$inferSelect;

export const fundraiserOrderItems = pgTable("fundraiser_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => fundraiserOrders.id, { onDelete: 'cascade' }),
  productId: integer("product_id").notNull().references(() => fundraiserProducts.id),
  quantity: integer("quantity").notNull(),
  priceCents: integer("price_cents").notNull(),
  creditAmountCents: integer("credit_amount_cents").notNull(),
});

export const insertFundraiserOrderItemSchema = createInsertSchema(fundraiserOrderItems)
  .omit({ id: true });
export type InsertFundraiserOrderItem = z.infer<typeof insertFundraiserOrderItemSchema>;
export type FundraiserOrderItem = typeof fundraiserOrderItems.$inferSelect;

// Fundraiser relations
export const fundraiserCampaignsRelations = relations(fundraiserCampaigns, ({ one, many }) => ({
  school: one(schools, { fields: [fundraiserCampaigns.schoolId], references: [schools.id] }),
  products: many(fundraiserProducts),
  familyLinks: many(fundraiserFamilyLinks),
  orders: many(fundraiserOrders),
}));

export const fundraiserProductsRelations = relations(fundraiserProducts, ({ one }) => ({
  campaign: one(fundraiserCampaigns, { fields: [fundraiserProducts.campaignId], references: [fundraiserCampaigns.id] }),
}));

export const fundraiserFamilyLinksRelations = relations(fundraiserFamilyLinks, ({ one, many }) => ({
  campaign: one(fundraiserCampaigns, { fields: [fundraiserFamilyLinks.campaignId], references: [fundraiserCampaigns.id] }),
  user: one(users, { fields: [fundraiserFamilyLinks.userId], references: [users.id] }),
  orders: many(fundraiserOrders),
}));

export const fundraiserOrdersRelations = relations(fundraiserOrders, ({ one, many }) => ({
  campaign: one(fundraiserCampaigns, { fields: [fundraiserOrders.campaignId], references: [fundraiserCampaigns.id] }),
  familyLink: one(fundraiserFamilyLinks, { fields: [fundraiserOrders.familyLinkId], references: [fundraiserFamilyLinks.id] }),
  seller: one(users, { fields: [fundraiserOrders.sellerUserId], references: [users.id] }),
  credit: one(credits, { fields: [fundraiserOrders.creditId], references: [credits.id] }),
  items: many(fundraiserOrderItems),
}));

export const fundraiserOrderItemsRelations = relations(fundraiserOrderItems, ({ one }) => ({
  order: one(fundraiserOrders, { fields: [fundraiserOrderItems.orderId], references: [fundraiserOrders.id] }),
  product: one(fundraiserProducts, { fields: [fundraiserOrderItems.productId], references: [fundraiserProducts.id] }),
}));

// PII Access Logs - Audit trail for accessing sensitive parent contact information
export const piiAccessLogs = pgTable("pii_access_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  locationId: integer("location_id").references(() => locations.id),
  schoolId: integer("school_id").references(() => schools.id),
  accessType: text("access_type", {
    enum: ["view_parent_contacts", "export_parent_contacts", "view_student_details", "view_enrollment_details"]
  }).notNull(),
  resourceType: text("resource_type", {
    enum: ["enrollment", "student", "parent", "location"]
  }).notNull(),
  resourceIds: integer("resource_ids").array(), // IDs of records accessed
  recordCount: integer("record_count").notNull().default(0), // Number of records accessed
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  requestPath: text("request_path"),
  accessedAt: timestamp("accessed_at").defaultNow().notNull(),
});

export const insertPiiAccessLogSchema = createInsertSchema(piiAccessLogs)
  .omit({ id: true, accessedAt: true })
  .extend({
    resourceIds: z.array(z.number()).nullable().default(null),
    ipAddress: z.string().nullable().default(null),
    userAgent: z.string().nullable().default(null),
    requestPath: z.string().nullable().default(null),
  });
export type InsertPiiAccessLog = z.infer<typeof insertPiiAccessLogSchema>;
export type PiiAccessLog = typeof piiAccessLogs.$inferSelect;

// PII Access Logs relations
export const piiAccessLogsRelations = relations(piiAccessLogs, ({ one }) => ({
  user: one(users, { fields: [piiAccessLogs.userId], references: [users.id] }),
  location: one(locations, { fields: [piiAccessLogs.locationId], references: [locations.id] }),
  school: one(schools, { fields: [piiAccessLogs.schoolId], references: [schools.id] }),
}));

// Payment Reminder Logs - Track all payment reminders sent (automatic and manual)
export const paymentReminderLogs = pgTable("payment_reminder_logs", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schools.id),
  scheduledPaymentId: integer("scheduled_payment_id").references(() => scheduledPayments.id),
  parentEmail: text("parent_email").notNull(),
  parentName: text("parent_name"),
  childName: text("child_name"),
  className: text("class_name"),
  amountCents: integer("amount_cents"),
  reminderType: text("reminder_type", {
    enum: ["7_days_before", "3_days_before", "1_day_before", "due_today", "1_day_overdue", "7_days_overdue", "manual", "summary"]
  }).notNull(),
  status: text("status", {
    enum: ["sent", "failed", "pending"]
  }).default("pending").notNull(),
  isManual: boolean("is_manual").default(false).notNull(),
  sentBy: integer("sent_by").references(() => users.id),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

export const insertPaymentReminderLogSchema = createInsertSchema(paymentReminderLogs)
  .omit({ id: true, sentAt: true });
export type InsertPaymentReminderLog = z.infer<typeof insertPaymentReminderLogSchema>;
export type PaymentReminderLog = typeof paymentReminderLogs.$inferSelect;

export const paymentReminderLogsRelations = relations(paymentReminderLogs, ({ one }) => ({
  school: one(schools, { fields: [paymentReminderLogs.schoolId], references: [schools.id] }),
  scheduledPayment: one(scheduledPayments, { fields: [paymentReminderLogs.scheduledPaymentId], references: [scheduledPayments.id] }),
  sentByUser: one(users, { fields: [paymentReminderLogs.sentBy], references: [users.id] }),
}));