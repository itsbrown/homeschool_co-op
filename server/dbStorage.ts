import { 
  users, type User, type InsertUser, 
  curricula, type Curriculum, type InsertCurriculum, 
  lessons, type Lesson, type InsertLesson, 
  events, type Event, type InsertEvent, 
  marketplaceItems, type MarketplaceItem, type InsertMarketplaceItem,
  knowledgeBases, type KnowledgeBase, type InsertKnowledgeBase,
  children, type Child, type InsertChild,
  emergencyContacts, type EmergencyContact, type InsertEmergencyContact,
  programs, type Program, type InsertProgram,
  programEnrollments, type ProgramEnrollment, type InsertProgramEnrollment,
  classes, type Class, type InsertClass,
  activities, type Activity, type InsertActivity
} from "@shared/schema";

import { eq, like, and, or, desc, asc, sql } from "drizzle-orm";
import { db } from "./db";
import { IStorage } from "./storage";

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [createdUser] = await db.insert(users).values(user).returning();
    return createdUser;
  }

  // Curriculum methods
  async getCurriculum(id: number): Promise<Curriculum | undefined> {
    const [curriculum] = await db.select().from(curricula).where(eq(curricula.id, id));
    return curriculum;
  }

  async getCurriculaByAuthor(authorId: number): Promise<Curriculum[]> {
    return db.select().from(curricula).where(eq(curricula.authorId, authorId));
  }

  async createCurriculum(curriculum: InsertCurriculum): Promise<Curriculum> {
    const [createdCurriculum] = await db.insert(curricula).values(curriculum).returning();
    return createdCurriculum;
  }

  async updateCurriculum(id: number, curriculum: Partial<InsertCurriculum>): Promise<Curriculum | undefined> {
    const [updatedCurriculum] = await db
      .update(curricula)
      .set({ ...curriculum, updatedAt: new Date() })
      .where(eq(curricula.id, id))
      .returning();
    return updatedCurriculum;
  }

  // Class methods
  async getClassById(id: number): Promise<Class | undefined> {
    const [classItem] = await db.select().from(classes).where(eq(classes.id, id));
    return classItem;
  }

  async getClassesByInstructor(instructorId: number): Promise<Class[]> {
    return db.select().from(classes).where(eq(classes.instructorId, instructorId));
  }

  async getClasses(options: { 
    page: number; 
    limit: number; 
    search?: string; 
    category?: string; 
    status?: "published" | "draft" | "" 
  }): Promise<Class[]> {
    const { page, limit, search = "", category = "", status = "" } = options;
    
    // Build filters
    const filters = [];
    
    if (search) {
      filters.push(
        or(
          like(classes.title, `%${search}%`),
          like(classes.description, `%${search}%`)
        )
      );
    }
    
    if (category) {
      filters.push(eq(classes.category, category));
    }
    
    if (status === "published") {
      filters.push(eq(classes.isPublished, true));
    } else if (status === "draft") {
      filters.push(eq(classes.isPublished, false));
    }
    
    // Apply pagination
    const offset = (page - 1) * limit;
    
    const query = db.select()
      .from(classes)
      .orderBy(desc(classes.createdAt))
      .limit(limit)
      .offset(offset);
    
    // Add filters if any exist
    if (filters.length > 0) {
      query.where(and(...filters));
    }
    
    return query;
  }

  async getClassesCount(options: { 
    search?: string; 
    category?: string; 
    status?: "published" | "draft" | "" 
  }): Promise<number> {
    const { search = "", category = "", status = "" } = options;
    
    // Build filters
    const filters = [];
    
    if (search) {
      filters.push(
        or(
          like(classes.title, `%${search}%`),
          like(classes.description, `%${search}%`)
        )
      );
    }
    
    if (category) {
      filters.push(eq(classes.category, category));
    }
    
    if (status === "published") {
      filters.push(eq(classes.isPublished, true));
    } else if (status === "draft") {
      filters.push(eq(classes.isPublished, false));
    }
    
    // Count total results
    const query = db.select({ count: sql<number>`COUNT(*)` })
      .from(classes);
    
    // Add filters if any exist
    if (filters.length > 0) {
      query.where(and(...filters));
    }
    
    const [result] = await query;
    return result?.count || 0;
  }

  async createClass(classData: InsertClass & { instructorId: number }): Promise<Class> {
    const [createdClass] = await db.insert(classes).values(classData).returning();
    return createdClass;
  }

  async updateClass(id: number, classData: Partial<InsertClass>): Promise<Class | undefined> {
    const [updatedClass] = await db
      .update(classes)
      .set({ ...classData, updatedAt: new Date() })
      .where(eq(classes.id, id))
      .returning();
    return updatedClass;
  }

  async deleteClass(id: number): Promise<void> {
    await db.delete(classes).where(eq(classes.id, id));
  }

  async incrementClassEnrollment(id: number): Promise<Class | undefined> {
    const [updatedClass] = await db
      .update(classes)
      .set({ 
        enrollmentCount: sql`${classes.enrollmentCount} + 1`, 
        updatedAt: new Date() 
      })
      .where(eq(classes.id, id))
      .returning();
    return updatedClass;
  }

  // Knowledge Base methods
  async getKnowledgeBase(id: number): Promise<KnowledgeBase | undefined> {
    const [knowledgeBase] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id));
    return knowledgeBase;
  }

  async getKnowledgeBaseByTitle(title: string): Promise<KnowledgeBase | undefined> {
    const [knowledgeBase] = await db.select().from(knowledgeBases)
      .where(eq(knowledgeBases.title, title));
    return knowledgeBase;
  }

  async getKnowledgeBasesByAuthor(authorId: number): Promise<KnowledgeBase[]> {
    return db.select().from(knowledgeBases).where(eq(knowledgeBases.authorId, authorId));
  }

  async getKnowledgeBasesBySubject(subject: string): Promise<KnowledgeBase[]> {
    return db.select().from(knowledgeBases)
      .where(eq(sql`LOWER(${knowledgeBases.subject})`, subject.toLowerCase()));
  }

  async getPublicKnowledgeBases(limit?: number): Promise<KnowledgeBase[]> {
    const query = db.select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.isPublic, true))
      .orderBy(desc(knowledgeBases.createdAt));
    
    if (limit) {
      query.limit(limit);
    }
    
    return query;
  }

  async createKnowledgeBase(insertKnowledgeBase: InsertKnowledgeBase): Promise<KnowledgeBase> {
    const [knowledgeBase] = await db.insert(knowledgeBases)
      .values({ ...insertKnowledgeBase, downloadCount: 0 })
      .returning();
    return knowledgeBase;
  }

  async updateKnowledgeBase(id: number, updateData: Partial<InsertKnowledgeBase>): Promise<KnowledgeBase | undefined> {
    const [updatedKnowledgeBase] = await db
      .update(knowledgeBases)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(knowledgeBases.id, id))
      .returning();
    return updatedKnowledgeBase;
  }

  async incrementDownloadCount(id: number): Promise<KnowledgeBase | undefined> {
    const [updatedKnowledgeBase] = await db
      .update(knowledgeBases)
      .set({ 
        downloadCount: sql`${knowledgeBases.downloadCount} + 1`, 
        updatedAt: new Date() 
      })
      .where(eq(knowledgeBases.id, id))
      .returning();
    return updatedKnowledgeBase;
  }

  // Programs methods
  async getProgram(id: number): Promise<Program | undefined> {
    const [program] = await db.select().from(programs).where(eq(programs.id, id));
    return program;
  }

  async getProgramsByOrganizer(organizerId: number): Promise<Program[]> {
    return db.select().from(programs).where(eq(programs.organizerId, organizerId));
  }

  async createProgram(program: InsertProgram): Promise<Program> {
    const [createdProgram] = await db.insert(programs).values(program).returning();
    return createdProgram;
  }

  async updateProgram(id: number, program: Partial<InsertProgram>): Promise<Program | undefined> {
    const [updatedProgram] = await db
      .update(programs)
      .set({ ...program, updatedAt: new Date() })
      .where(eq(programs.id, id))
      .returning();
    return updatedProgram;
  }

  async deleteProgram(id: number): Promise<void> {
    await db.delete(programs).where(eq(programs.id, id));
  }

  // Program Enrollment methods
  async getProgramEnrollment(id: number): Promise<ProgramEnrollment | undefined> {
    const [enrollment] = await db.select().from(programEnrollments).where(eq(programEnrollments.id, id));
    return enrollment;
  }

  async getProgramEnrollmentsByParent(parentId: number): Promise<ProgramEnrollment[]> {
    return db.select().from(programEnrollments).where(eq(programEnrollments.parentId, parentId));
  }

  async getProgramEnrollmentsByProgram(programId: number): Promise<ProgramEnrollment[]> {
    return db.select().from(programEnrollments).where(eq(programEnrollments.programId, programId));
  }

  async createProgramEnrollment(enrollment: InsertProgramEnrollment): Promise<ProgramEnrollment> {
    const [createdEnrollment] = await db.insert(programEnrollments).values(enrollment).returning();
    return createdEnrollment;
  }

  async updateProgramEnrollment(id: number, enrollment: Partial<InsertProgramEnrollment>): Promise<ProgramEnrollment | undefined> {
    const [updatedEnrollment] = await db
      .update(programEnrollments)
      .set({ ...enrollment, updatedAt: new Date() })
      .where(eq(programEnrollments.id, id))
      .returning();
    return updatedEnrollment;
  }

  async deleteProgramEnrollment(id: number): Promise<void> {
    await db.delete(programEnrollments).where(eq(programEnrollments.id, id));
  }

  // Child methods
  async getChild(id: number): Promise<Child | undefined> {
    const [child] = await db.select().from(children).where(eq(children.id, id));
    return child;
  }

  async getChildrenByParent(parentId: number): Promise<Child[]> {
    return db.select().from(children).where(eq(children.parentId, parentId));
  }

  async createChild(child: InsertChild): Promise<Child> {
    const [createdChild] = await db.insert(children).values(child).returning();
    return createdChild;
  }

  async updateChild(id: number, child: Partial<InsertChild>): Promise<Child | undefined> {
    const [updatedChild] = await db
      .update(children)
      .set({ ...child, updatedAt: new Date() })
      .where(eq(children.id, id))
      .returning();
    return updatedChild;
  }

  async deleteChild(id: number): Promise<void> {
    await db.delete(children).where(eq(children.id, id));
  }

  // Emergency Contact methods
  async getEmergencyContact(id: number): Promise<EmergencyContact | undefined> {
    const [contact] = await db.select().from(emergencyContacts).where(eq(emergencyContacts.id, id));
    return contact;
  }

  async getEmergencyContactsByParent(parentId: number): Promise<EmergencyContact[]> {
    return db.select().from(emergencyContacts).where(eq(emergencyContacts.parentId, parentId));
  }

  async createEmergencyContact(contact: InsertEmergencyContact): Promise<EmergencyContact> {
    const [createdContact] = await db.insert(emergencyContacts).values(contact).returning();
    return createdContact;
  }

  async updateEmergencyContact(id: number, contact: Partial<InsertEmergencyContact>): Promise<EmergencyContact | undefined> {
    const [updatedContact] = await db
      .update(emergencyContacts)
      .set({ ...contact, updatedAt: new Date() })
      .where(eq(emergencyContacts.id, id))
      .returning();
    return updatedContact;
  }

  async deleteEmergencyContact(id: number): Promise<void> {
    await db.delete(emergencyContacts).where(eq(emergencyContacts.id, id));
  }
  
  // Activity methods
  async getActivity(id: number): Promise<Activity | undefined> {
    const [activity] = await db.select().from(activities).where(eq(activities.id, id));
    return activity;
  }

  async getActivitiesByType(activityType: string): Promise<Activity[]> {
    return db.select().from(activities).where(eq(activities.activityType, activityType));
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const [createdActivity] = await db.insert(activities).values(activity).returning();
    return createdActivity;
  }

  async updateActivity(id: number, activity: Partial<InsertActivity>): Promise<Activity | undefined> {
    const [updatedActivity] = await db
      .update(activities)
      .set({ ...activity, updatedAt: new Date() })
      .where(eq(activities.id, id))
      .returning();
    return updatedActivity;
  }

  async deleteActivity(id: number): Promise<void> {
    await db.delete(activities).where(eq(activities.id, id));
  }
  
  // Lesson methods
  async getLesson(id: number): Promise<Lesson | undefined> {
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, id));
    return lesson;
  }

  async getLessonsByCurriculum(curriculumId: number): Promise<Lesson[]> {
    return db.select().from(lessons).where(eq(lessons.curriculumId, curriculumId));
  }

  async getLessonsByAuthor(authorId: number): Promise<Lesson[]> {
    return db.select().from(lessons).where(eq(lessons.authorId, authorId));
  }

  async createLesson(lesson: InsertLesson): Promise<Lesson> {
    const [createdLesson] = await db.insert(lessons).values(lesson).returning();
    return createdLesson;
  }

  async updateLesson(id: number, lesson: Partial<InsertLesson>): Promise<Lesson | undefined> {
    const [updatedLesson] = await db
      .update(lessons)
      .set({ ...lesson, updatedAt: new Date() })
      .where(eq(lessons.id, id))
      .returning();
    return updatedLesson;
  }

  // Event methods
  async getEvent(id: number): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async getEventsByOrganizer(organizerId: number): Promise<Event[]> {
    return db.select().from(events).where(eq(events.organizerId, organizerId));
  }

  async getUpcomingEvents(userId: number): Promise<Event[]> {
    const now = new Date();
    return db.select()
      .from(events)
      .where(
        and(
          eq(events.organizerId, userId),
          sql`${events.startDate} > ${now}`
        )
      )
      .orderBy(asc(events.startDate))
      .limit(10);
  }

  async getAllEvents(userId: number): Promise<Event[]> {
    return db.select()
      .from(events)
      .where(eq(events.organizerId, userId))
      .orderBy(desc(events.startDate));
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const [createdEvent] = await db.insert(events).values(event).returning();
    return createdEvent;
  }

  // Marketplace methods
  async getMarketplaceItem(id: number): Promise<MarketplaceItem | undefined> {
    const [item] = await db.select().from(marketplaceItems).where(eq(marketplaceItems.id, id));
    return item;
  }

  async getMarketplaceItemsBySeller(sellerId: number): Promise<MarketplaceItem[]> {
    return db.select().from(marketplaceItems).where(eq(marketplaceItems.sellerId, sellerId));
  }

  async getTopSellingItems(limit: number): Promise<MarketplaceItem[]> {
    return db.select()
      .from(marketplaceItems)
      .where(eq(marketplaceItems.isActive, true))
      .orderBy(desc(marketplaceItems.salesCount))
      .limit(limit);
  }

  async createMarketplaceItem(item: InsertMarketplaceItem): Promise<MarketplaceItem> {
    const [createdItem] = await db.insert(marketplaceItems).values(item).returning();
    return createdItem;
  }

  async updateMarketplaceItemStats(id: number, sales: number, revenue: number): Promise<MarketplaceItem | undefined> {
    const [updatedItem] = await db
      .update(marketplaceItems)
      .set({ 
        salesCount: sql`${marketplaceItems.salesCount} + ${sales}`,
        revenue: sql`${marketplaceItems.revenue} + ${revenue}`,
        updatedAt: new Date() 
      })
      .where(eq(marketplaceItems.id, id))
      .returning();
    return updatedItem;
  }
}