import { pgTable, text, serial, integer, boolean, jsonb, timestamp, decimal } from "drizzle-orm/pg-core";
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
  userKnowledgeBases: many(userKnowledgeBases)
}));

// Knowledge Bases table
export const knowledgeBases = pgTable("knowledge_bases", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type", { 
    enum: [
      "curriculum_standards", 
      "teaching_resources", 
      "assessment_tools", 
      "subject_specific", 
      "pedagogical_approaches", 
      "general"
    ] 
  }).notNull(),
  subject: text("subject"),
  gradeLevel: text("grade_level"),
  content: jsonb("content").notNull(), // Structured knowledge content
  authorId: integer("author_id").notNull().references(() => users.id),
  version: text("version").default("1.0.0").notNull(),
  isPublished: boolean("is_published").default(false).notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
  price: integer("price").default(0).notNull(),
  downloads: integer("downloads").default(0).notNull(),
  avgRating: decimal("avg_rating", { precision: 3, scale: 2 }).default("0").notNull(),
  ratingCount: integer("rating_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBases).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true, 
  authorId: true,
  downloads: true,
  avgRating: true,
  ratingCount: true
});
export type InsertKnowledgeBase = z.infer<typeof insertKnowledgeBaseSchema>;
export type KnowledgeBase = typeof knowledgeBases.$inferSelect;

// User Knowledge Bases junction table for purchased/acquired knowledge bases
export const userKnowledgeBases = pgTable("user_knowledge_bases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  knowledgeBaseId: integer("knowledge_base_id").notNull().references(() => knowledgeBases.id),
  isPurchased: boolean("is_purchased").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
});

export const insertUserKnowledgeBaseSchema = createInsertSchema(userKnowledgeBases).omit({ 
  id: true, 
  acquiredAt: true 
});
export type InsertUserKnowledgeBase = z.infer<typeof insertUserKnowledgeBaseSchema>;
export type UserKnowledgeBase = typeof userKnowledgeBases.$inferSelect;

// Knowledge Base Ratings table
export const knowledgeBaseRatings = pgTable("knowledge_base_ratings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  knowledgeBaseId: integer("knowledge_base_id").notNull().references(() => knowledgeBases.id),
  rating: integer("rating").notNull(), // 1-5 stars
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertKnowledgeBaseRatingSchema = createInsertSchema(knowledgeBaseRatings).omit({ 
  id: true, 
  createdAt: true
});
export type InsertKnowledgeBaseRating = z.infer<typeof insertKnowledgeBaseRatingSchema>;
export type KnowledgeBaseRating = typeof knowledgeBaseRatings.$inferSelect;

// Knowledge References to track when a knowledge base is used in content generation
export const knowledgeReferences = pgTable("knowledge_references", {
  id: serial("id").primaryKey(),
  knowledgeBaseId: integer("knowledge_base_id").notNull().references(() => knowledgeBases.id),
  referenceType: text("reference_type", { enum: ["curriculum", "lesson", "assessment"] }).notNull(),
  referenceId: integer("reference_id").notNull(), // The ID of the item that referenced this knowledge base
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertKnowledgeReferenceSchema = createInsertSchema(knowledgeReferences).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertKnowledgeReference = z.infer<typeof insertKnowledgeReferenceSchema>;
export type KnowledgeReference = typeof knowledgeReferences.$inferSelect;

// Define knowledge base relations
export const knowledgeBasesRelations = relations(knowledgeBases, ({ one, many }) => ({
  author: one(users, { fields: [knowledgeBases.authorId], references: [users.id] }),
  userKnowledgeBases: many(userKnowledgeBases),
  knowledgeReferences: many(knowledgeReferences),
  ratings: many(knowledgeBaseRatings),
  curricula: many(curricula),
  lessons: many(lessons)
}));

// Define user knowledge base relations
export const userKnowledgeBasesRelations = relations(userKnowledgeBases, ({ one }) => ({
  user: one(users, { fields: [userKnowledgeBases.userId], references: [users.id] }),
  knowledgeBase: one(knowledgeBases, { fields: [userKnowledgeBases.knowledgeBaseId], references: [knowledgeBases.id] }),
}));

// Define knowledge base rating relations
export const knowledgeBaseRatingsRelations = relations(knowledgeBaseRatings, ({ one }) => ({
  user: one(users, { fields: [knowledgeBaseRatings.userId], references: [users.id] }),
  knowledgeBase: one(knowledgeBases, { fields: [knowledgeBaseRatings.knowledgeBaseId], references: [knowledgeBases.id] }),
}));

// Define knowledge reference relations
export const knowledgeReferencesRelations = relations(knowledgeReferences, ({ one }) => ({
  knowledgeBase: one(knowledgeBases, { fields: [knowledgeReferences.knowledgeBaseId], references: [knowledgeBases.id] }),
}));

// Curriculum table
export const curricula = pgTable("curricula", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  gradeLevel: text("grade_level").notNull(),
  authorId: integer("author_id").notNull().references(() => users.id),
  knowledgeBaseId: integer("knowledge_base_id").references(() => knowledgeBases.id), // Optional reference to a knowledge base used
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
  knowledgeBase: one(knowledgeBases, { fields: [curricula.knowledgeBaseId], references: [knowledgeBases.id] }),
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
  knowledgeBaseId: integer("knowledge_base_id").references(() => knowledgeBases.id), // Optional reference to a knowledge base used
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
  curriculum: one(curricula, { fields: [lessons.curriculumId], references: [curricula.id] }),
  knowledgeBase: one(knowledgeBases, { fields: [lessons.knowledgeBaseId], references: [knowledgeBases.id] })
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
  itemType: text("item_type", { enum: ["curriculum", "lesson", "resource", "activity", "knowledge_base"] }).notNull(),
  contentId: integer("content_id").notNull(), // reference to curriculum, lesson, or knowledge_base id
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
