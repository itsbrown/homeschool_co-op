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
  avatar: text("avatar"),
  subscription: text("subscription", { enum: ["free", "individual", "family", "educator", "institutional"] }).default("free").notNull(),
  permissions: jsonb("permissions").default({}).notNull(), // Custom permissions
  schoolId: integer("school_id"), // Link user to school
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
  });
export type InsertSchool = z.infer<typeof insertSchoolSchema>;
export type School = typeof schools.$inferSelect;

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
  schedule: jsonb("schedule").notNull(), // JSON object with schedule details
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

// Class enrollments for school classes
export const schoolClassEnrollments = pgTable("school_class_enrollments", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().references(() => schoolClasses.id),
  studentId: integer("student_id").notNull().references(() => schoolStudents.id),
  enrollmentDate: timestamp("enrollment_date").defaultNow().notNull(),
  grade: text("grade"), // final grade for the class
  status: text("status", { enum: ["enrolled", "completed", "withdrawn", "failed"] }).default("enrolled").notNull(),
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
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  birthdate: date("birthdate").notNull(),
  gradeLevel: text("grade_level").notNull(),
  school: text("school"),
  learningStyle: text("learning_style"),
  specialNeeds: text("special_needs"),
  interests: text("interests").array(),
  allergies: text("allergies"),
  medicalInfo: text("medical_info"),
  profileImage: text("profile_image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertChildSchema = createInsertSchema(children)
  .omit({ id: true, createdAt: true, updatedAt: true, parentId: true })
  .extend({
    // Set default values for nullable fields
    school: z.string().nullable().default(null),
    learningStyle: z.string().nullable().default(null),
    specialNeeds: z.string().nullable().default(null),
    interests: z.array(z.string()).nullable().default(null),
    allergies: z.string().nullable().default(null),
    medicalInfo: z.string().nullable().default(null),
    profileImage: z.string().nullable().default(null)
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
  instructorId: integer("instructor_id").notNull().references(() => users.id),
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

// Define program relations - programEnrollments will be defined later
export const programsRelations = relations(programs, ({ one, many }) => ({
  instructor: one(users, { fields: [programs.instructorId], references: [users.id] }),
  curriculum: one(curricula, { fields: [programs.curriculumId], references: [curricula.id] })
  // enrollments relation will be added after programEnrollments is defined
}));

// Program enrollments table
export const programEnrollments = pgTable("program_enrollments", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => programs.id),
  childId: integer("child_id").notNull().references(() => children.id),
  enrollmentDate: timestamp("enrollment_date").defaultNow().notNull(),
  status: text("status", { 
    enum: ["pending", "confirmed", "waitlisted", "cancelled", "completed"] 
  }).default("pending").notNull(),
  paymentStatus: text("payment_status", { 
    enum: ["pending", "paid", "refunded", "failed"] 
  }).default("pending").notNull(),
  paymentMethod: text("payment_method", { 
    enum: ["credit_card", "paypal", "bank_transfer", "cash", "scholarship"] 
  }),
  transactionId: text("transaction_id"),
  discountCode: text("discount_code"),
  discountAmount: integer("discount_amount"), // in cents
  totalPaid: integer("total_paid"), // in cents
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProgramEnrollmentSchema = createInsertSchema(programEnrollments)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    // Set default values for optional fields
    status: z.enum(["pending", "confirmed", "waitlisted", "cancelled", "completed"]).default("pending"),
    paymentStatus: z.enum(["pending", "paid", "refunded", "failed"]).default("pending"),
    enrollmentDate: z.date().default(() => new Date()),
    notes: z.string().nullable().default(null),
    paymentMethod: z.enum(["credit_card", "paypal", "bank_transfer", "cash", "scholarship"]).nullable().default(null)
  });
export type InsertProgramEnrollment = z.infer<typeof insertProgramEnrollmentSchema>;
export type ProgramEnrollment = typeof programEnrollments.$inferSelect;

// Define program enrollment relations
export const programEnrollmentsRelations = relations(programEnrollments, ({ one }) => ({
  program: one(programs, { fields: [programEnrollments.programId], references: [programs.id] }),
  child: one(children, { fields: [programEnrollments.childId], references: [children.id] })
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

// Classes table for AI-suggested pricing
export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").references(() => schools.id), // Multi-location support
  locationId: integer("location_id").references(() => locations.id), // Multi-location support
  title: text("title").notNull(),
  description: text("description").notNull(),
  productId: text("product_id"),
  productType: text("product_type"),
  categoryName: text("category_name"), // e.g. "SPRING 2025 10 WEEK PROGRAM"
  category: text("category").notNull(), // academic, arts, music, sports, stem, language, coding, cooking, crafts
  startDate: date("start_date"),
  endDate: date("end_date"),
  numSessions: integer("num_sessions"),
  sessionDays: text("session_days"),
  durationWeeks: integer("duration_weeks"),
  sessionsPerWeek: integer("sessions_per_week"),
  sessionLengthMinutes: integer("session_length_minutes"),
  gradeLevels: text("grade_levels").array(),
  capacity: integer("capacity"),
  location: text("location"),
  instructorName: text("instructor_name"),
  instructorId: integer("instructor_id").references(() => users.id),
  price: integer("price").notNull(), // in cents
  suggestedPrice: integer("suggested_price"), // AI suggested price in cents
  totalOrders: integer("total_orders").default(0),
  paidOrders: integer("paid_orders").default(0),
  totalWaitlisted: integer("total_waitlisted").default(0),
  totalOrderValue: integer("total_order_value").default(0), // in cents
  totalDiscounted: integer("total_discounted").default(0), // in cents
  totalCollected: integer("total_collected").default(0), // in cents
  isPublished: boolean("is_published").default(false).notNull(),
  enrollmentCount: integer("enrollment_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertClassSchema = createInsertSchema(classes)
  .omit({ id: true, createdAt: true, updatedAt: true, instructorId: true, enrollmentCount: true })
  .extend({
    // String dates will be converted to Date objects
    startDate: z.string().nullable().transform((str) => str ? new Date(str) : null),
    endDate: z.string().nullable().transform((str) => str ? new Date(str) : null),
    // Convert dollar amounts to cents for storage
    price: z.number().transform(amount => Math.round(amount * 100)),
    suggestedPrice: z.number().optional().transform(amount => amount ? Math.round(amount * 100) : undefined),
    // Make certain fields optional
    productId: z.string().optional(),
    productType: z.string().optional(),
    categoryName: z.string().optional(),
    numSessions: z.number().optional(),
    sessionDays: z.string().optional(),
    durationWeeks: z.number().optional(),
    sessionsPerWeek: z.number().optional(),
    sessionLengthMinutes: z.number().optional(),
    gradeLevels: z.array(z.string()).optional(),
    capacity: z.number().optional(),
    location: z.string().optional(),
    instructorName: z.string().optional(),
    totalOrders: z.number().optional(),
    paidOrders: z.number().optional(), 
    totalWaitlisted: z.number().optional(),
    totalOrderValue: z.number().optional(),
    totalDiscounted: z.number().optional(),
    totalCollected: z.number().optional(),
  });
export type InsertClass = z.infer<typeof insertClassSchema>;
export type Class = typeof classes.$inferSelect;

// Define class relations
export const classesRelations = relations(classes, ({ one }) => ({
  instructor: one(users, { fields: [classes.instructorId], references: [users.id] }),
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
    enum: ["email", "in_app", "both"] 
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
  deliveryType: text("delivery_type", { enum: ["email", "in_app"] }).notNull(),
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

// Payments table for tracking payment transactions
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  stripePaymentIntentId: text("stripe_payment_intent_id").notNull(),
  parentEmail: text("parent_email").notNull(),
  childName: text("child_name").notNull(),
  className: text("class_name").notNull(),
  amount: integer("amount").notNull(), // in cents
  currency: text("currency").default("usd").notNull(),
  status: text("status", { enum: ["pending", "completed", "failed", "refunded"] }).default("pending").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Scheduled payments for payment plans (3-payment plan, split payments, etc.)
export const scheduledPayments = pgTable("scheduled_payments", {
  id: serial("id").primaryKey(),
  parentEmail: text("parent_email").notNull(),
  enrollmentIds: integer("enrollment_ids").array().notNull(),
  paymentPlan: text("payment_plan").notNull(), // "three_payments", "split", etc
  installmentNumber: integer("installment_number").notNull(), // 1, 2, 3...
  totalInstallments: integer("total_installments").notNull(),
  amount: integer("amount").notNull(), // amount in cents
  currency: text("currency").default("usd").notNull(),
  dueDate: timestamp("due_date").notNull(),
  status: text("status", { enum: ["pending", "paid", "overdue", "cancelled"] }).default("pending").notNull(),
  originalPaymentId: integer("original_payment_id").references(() => payments.id),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPaymentSchema = createInsertSchema(payments)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

export const insertScheduledPaymentSchema = createInsertSchema(scheduledPayments)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertScheduledPayment = z.infer<typeof insertScheduledPaymentSchema>;
export type ScheduledPayment = typeof scheduledPayments.$inferSelect;

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

// Discount schemas for validation
export const insertDiscountSchema = createInsertSchema(discounts)
  .omit({ id: true, createdAt: true, updatedAt: true, currentUsageCount: true })
  .extend({
    // Convert dollar amounts to cents for storage
    minOrderAmount: z.number().optional().transform(amount => amount ? Math.round(amount * 100) : undefined),
    maxDiscountAmount: z.number().optional().transform(amount => amount ? Math.round(amount * 100) : undefined),
    // For fixed amount discounts, convert to cents
    value: z.number().transform(value => Math.round(value * 100)),
  });

export const insertDiscountApplicationSchema = createInsertSchema(discountApplications)
  .omit({ id: true, createdAt: true });

export type InsertDiscount = z.infer<typeof insertDiscountSchema>;
export type Discount = typeof discounts.$inferSelect;
export type InsertDiscountApplication = z.infer<typeof insertDiscountApplicationSchema>;
export type DiscountApplication = typeof discountApplications.$inferSelect;