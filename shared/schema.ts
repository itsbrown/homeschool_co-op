import { pgTable, text, serial, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
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
  marketplaceItems: many(marketplaceItems)
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

export const insertCurriculumSchema = createInsertSchema(curricula).omit({ id: true, createdAt: true, updatedAt: true });
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

export const insertLessonSchema = createInsertSchema(lessons).omit({ id: true, createdAt: true, updatedAt: true });
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

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true });
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

export const insertMarketplaceItemSchema = createInsertSchema(marketplaceItems).omit({ id: true, createdAt: true, sales: true, revenue: true });
export type InsertMarketplaceItem = z.infer<typeof insertMarketplaceItemSchema>;
export type MarketplaceItem = typeof marketplaceItems.$inferSelect;

// Define marketplace item relations
export const marketplaceItemsRelations = relations(marketplaceItems, ({ one }) => ({
  seller: one(users, { fields: [marketplaceItems.sellerId], references: [users.id] })
}));
