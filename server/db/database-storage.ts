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
  programEnrollments, type ProgramEnrollment, type InsertProgramEnrollment
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, gte, gt, sql } from "drizzle-orm";
import { IStorage } from "../storage";

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }
  
  // Curriculum methods
  async getCurriculum(id: number): Promise<Curriculum | undefined> {
    const [curriculum] = await db.select().from(curricula).where(eq(curricula.id, id));
    return curriculum || undefined;
  }
  
  async getCurriculaByAuthor(authorId: number): Promise<Curriculum[]> {
    return await db.select().from(curricula).where(eq(curricula.authorId, authorId));
  }
  
  async createCurriculum(insertCurriculum: InsertCurriculum): Promise<Curriculum> {
    const [curriculum] = await db
      .insert(curricula)
      .values(insertCurriculum)
      .returning();
    return curriculum;
  }
  
  async updateCurriculum(id: number, updateData: Partial<InsertCurriculum>): Promise<Curriculum | undefined> {
    const now = new Date();
    
    const [updatedCurriculum] = await db
      .update(curricula)
      .set({ ...updateData, updatedAt: now })
      .where(eq(curricula.id, id))
      .returning();
    
    return updatedCurriculum || undefined;
  }
  
  // Lesson methods
  async getLesson(id: number): Promise<Lesson | undefined> {
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, id));
    return lesson || undefined;
  }
  
  async getLessonsByCurriculum(curriculumId: number): Promise<Lesson[]> {
    return await db.select().from(lessons).where(eq(lessons.curriculumId, curriculumId));
  }
  
  async getLessonsByAuthor(authorId: number): Promise<Lesson[]> {
    return await db.select().from(lessons).where(eq(lessons.authorId, authorId));
  }
  
  async createLesson(insertLesson: InsertLesson): Promise<Lesson> {
    const [lesson] = await db
      .insert(lessons)
      .values(insertLesson)
      .returning();
    return lesson;
  }
  
  async updateLesson(id: number, updateData: Partial<InsertLesson>): Promise<Lesson | undefined> {
    const now = new Date();
    
    const [updatedLesson] = await db
      .update(lessons)
      .set({ ...updateData, updatedAt: now })
      .where(eq(lessons.id, id))
      .returning();
    
    return updatedLesson || undefined;
  }
  
  // Event methods
  async getEvent(id: number): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event || undefined;
  }

  async getEventsByOrganizer(organizerId: number): Promise<Event[]> {
    return await db.select().from(events).where(eq(events.organizerId, organizerId));
  }
  
  async getUpcomingEvents(userId: number): Promise<Event[]> {
    const now = new Date();
    
    return await db
      .select()
      .from(events)
      .where(and(
        eq(events.organizerId, userId),
        gte(events.startDate, now)
      ))
      .orderBy(events.startDate)
      .limit(5);
  }
  
  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const [event] = await db
      .insert(events)
      .values(insertEvent)
      .returning();
    return event;
  }
  
  // Marketplace methods
  async getMarketplaceItem(id: number): Promise<MarketplaceItem | undefined> {
    const [item] = await db.select().from(marketplaceItems).where(eq(marketplaceItems.id, id));
    return item || undefined;
  }
  
  async getMarketplaceItemsBySeller(sellerId: number): Promise<MarketplaceItem[]> {
    return await db.select().from(marketplaceItems).where(eq(marketplaceItems.sellerId, sellerId));
  }
  
  async getTopSellingItems(limit: number): Promise<MarketplaceItem[]> {
    return await db
      .select()
      .from(marketplaceItems)
      .orderBy(desc(marketplaceItems.sales))
      .limit(limit);
  }
  
  async createMarketplaceItem(insertItem: InsertMarketplaceItem): Promise<MarketplaceItem> {
    const [item] = await db
      .insert(marketplaceItems)
      .values({
        ...insertItem,
        sales: 0,
        revenue: 0
      })
      .returning();
    return item;
  }
  
  async updateMarketplaceItemStats(id: number, sales: number, revenue: number): Promise<MarketplaceItem | undefined> {
    const item = await this.getMarketplaceItem(id);
    if (!item) return undefined;
    
    const [updatedItem] = await db
      .update(marketplaceItems)
      .set({
        sales: item.sales + sales,
        revenue: item.revenue + revenue
      })
      .where(eq(marketplaceItems.id, id))
      .returning();
    
    return updatedItem || undefined;
  }
  
  // Knowledge Base methods
  async getKnowledgeBase(id: number): Promise<KnowledgeBase | undefined> {
    const [knowledgeBase] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id));
    return knowledgeBase || undefined;
  }
  
  async getKnowledgeBasesByAuthor(authorId: number): Promise<KnowledgeBase[]> {
    return await db.select().from(knowledgeBases).where(eq(knowledgeBases.authorId, authorId));
  }
  
  async getKnowledgeBasesBySubject(subject: string): Promise<KnowledgeBase[]> {
    // Case insensitive search by converting both to lowercase
    return await db
      .select()
      .from(knowledgeBases)
      .where(
        sql`LOWER(${knowledgeBases.subject}) = LOWER(${subject})`
      );
  }
  
  async getPublicKnowledgeBases(limit?: number): Promise<KnowledgeBase[]> {
    const query = db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.isPublic, true))
      .orderBy(desc(knowledgeBases.downloadCount));
    
    if (limit) {
      return await query.limit(limit);
    }
    
    return await query;
  }
  
  async createKnowledgeBase(insertKnowledgeBase: InsertKnowledgeBase): Promise<KnowledgeBase> {
    const now = new Date();
    
    const [knowledgeBase] = await db
      .insert(knowledgeBases)
      .values({
        ...insertKnowledgeBase,
        downloadCount: 0,
        purchasedBy: [],
        createdAt: now,
        updatedAt: now
      })
      .returning();
    
    return knowledgeBase;
  }
  
  async updateKnowledgeBase(id: number, updateData: Partial<InsertKnowledgeBase>): Promise<KnowledgeBase | undefined> {
    const now = new Date();
    
    const [updatedKnowledgeBase] = await db
      .update(knowledgeBases)
      .set({ 
        ...updateData, 
        updatedAt: now 
      })
      .where(eq(knowledgeBases.id, id))
      .returning();
    
    return updatedKnowledgeBase || undefined;
  }
  
  async incrementDownloadCount(id: number): Promise<KnowledgeBase | undefined> {
    const knowledgeBase = await this.getKnowledgeBase(id);
    if (!knowledgeBase) return undefined;
    
    const [updatedKnowledgeBase] = await db
      .update(knowledgeBases)
      .set({
        downloadCount: knowledgeBase.downloadCount + 1
      })
      .where(eq(knowledgeBases.id, id))
      .returning();
    
    return updatedKnowledgeBase || undefined;
  }
  
  async addPurchaser(id: number, userId: number): Promise<KnowledgeBase | undefined> {
    const knowledgeBase = await this.getKnowledgeBase(id);
    if (!knowledgeBase) return undefined;
    
    // Check if user has already purchased
    if (knowledgeBase.purchasedBy.includes(userId)) {
      return knowledgeBase;
    }
    
    // Add the user to the purchasedBy array
    const updatedPurchasedBy = [...knowledgeBase.purchasedBy, userId];
    
    const [updatedKnowledgeBase] = await db
      .update(knowledgeBases)
      .set({
        purchasedBy: updatedPurchasedBy
      })
      .where(eq(knowledgeBases.id, id))
      .returning();
    
    return updatedKnowledgeBase || undefined;
  }
}