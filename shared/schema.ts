import { pgTable, text, serial, integer, boolean, jsonb, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["learner", "parent", "educator", "admin"] }).default("learner").notNull(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  subscription: text("subscription", { enum: ["free", "individual", "family", "educator", "institutional"] }).default("free").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Define user relations
export const usersRelations = relations(users, ({ many }) => ({
  curricula: many(curricula),
  lessons: many(lessons),
  events: many(events),
  marketplaceItems: many(marketplaceItems),
  knowledgeBases: many(knowledgeBases),
  children: many(children),
  emergencyContacts: many(emergencyContacts)
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBases).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true, 
  authorId: true, 
  downloadCount: true,
  purchasedBy: true 
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
