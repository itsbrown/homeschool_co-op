import { 
  users, type User, type InsertUser, 
  curricula, type Curriculum, type InsertCurriculum, 
  lessons, type Lesson, type InsertLesson, 
  events, type Event, type InsertEvent, 
  marketplaceItems, type MarketplaceItem, type InsertMarketplaceItem,
  knowledgeBases, type KnowledgeBase, type InsertKnowledgeBase,
  knowledgeBaseRatings, userKnowledgeBases, type InsertKnowledgeBaseRating
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, gte, gt, isNull, or, sql, asc, not, count } from "drizzle-orm";
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
    const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id));
    return kb || undefined;
  }

  async getKnowledgeBasesByAuthor(authorId: number): Promise<KnowledgeBase[]> {
    return await db.select().from(knowledgeBases).where(eq(knowledgeBases.authorId, authorId));
  }

  async getPublicKnowledgeBases(): Promise<KnowledgeBase[]> {
    return await db.select().from(knowledgeBases).where(
      and(
        eq(knowledgeBases.isPublished, true),
        eq(knowledgeBases.isPublic, true)
      )
    );
  }

  async getUserKnowledgeBases(userId: number): Promise<KnowledgeBase[]> {
    // Get knowledge bases authored by the user
    const authoredKBs = await this.getKnowledgeBasesByAuthor(userId);
    
    // Get knowledge bases acquired by the user
    const userAcquiredKBIds = await db
      .select({ knowledgeBaseId: userKnowledgeBases.knowledgeBaseId })
      .from(userKnowledgeBases)
      .where(
        and(
          eq(userKnowledgeBases.userId, userId),
          eq(userKnowledgeBases.isActive, true)
        )
      );
    
    // If user has acquired knowledge bases, get them
    if (userAcquiredKBIds.length > 0) {
      const acquiredKBs = await db
        .select()
        .from(knowledgeBases)
        .where(
          or(
            ...userAcquiredKBIds.map(item => eq(knowledgeBases.id, item.knowledgeBaseId))
          )
        );
      
      return [...authoredKBs, ...acquiredKBs];
    }
    
    return authoredKBs;
  }

  async getRecommendedKnowledgeBases(subject?: string, gradeLevel?: string, limit: number = 5): Promise<KnowledgeBase[]> {
    let query = db
      .select()
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.isPublished, true),
          eq(knowledgeBases.isPublic, true)
        )
      );
    
    // Add subject filter if provided
    if (subject) {
      query = query.where(eq(knowledgeBases.subject, subject));
    }
    
    // Add grade level filter if provided
    if (gradeLevel) {
      query = query.where(eq(knowledgeBases.gradeLevel, gradeLevel));
    }
    
    // Order by rating and downloads
    const results = await query
      .orderBy(desc(knowledgeBases.avgRating), desc(knowledgeBases.downloads))
      .limit(limit);
    
    return results;
  }

  async createKnowledgeBase(knowledgeBase: InsertKnowledgeBase, authorId: number): Promise<KnowledgeBase> {
    const now = new Date();
    
    const [kb] = await db
      .insert(knowledgeBases)
      .values({
        ...knowledgeBase,
        authorId,
        createdAt: now,
        updatedAt: now,
        downloads: 0,
        avgRating: 0,
        ratingCount: 0
      })
      .returning();
    
    return kb;
  }

  async updateKnowledgeBase(id: number, updateData: Partial<InsertKnowledgeBase>): Promise<KnowledgeBase | undefined> {
    const now = new Date();
    
    const [updatedKB] = await db
      .update(knowledgeBases)
      .set({
        ...updateData,
        updatedAt: now
      })
      .where(eq(knowledgeBases.id, id))
      .returning();
    
    return updatedKB || undefined;
  }

  async deleteKnowledgeBase(id: number): Promise<boolean> {
    try {
      // First check if the knowledge base exists
      const kb = await this.getKnowledgeBase(id);
      if (!kb) return false;
      
      // Delete related ratings
      await db
        .delete(knowledgeBaseRatings)
        .where(eq(knowledgeBaseRatings.knowledgeBaseId, id));
      
      // Delete related user associations
      await db
        .delete(userKnowledgeBases)
        .where(eq(userKnowledgeBases.knowledgeBaseId, id));
      
      // Delete the knowledge base
      await db
        .delete(knowledgeBases)
        .where(eq(knowledgeBases.id, id));
      
      return true;
    } catch (error) {
      console.error("Error deleting knowledge base:", error);
      return false;
    }
  }

  async rateKnowledgeBase(knowledgeBaseId: number, userId: number, rating: number, comment?: string): Promise<KnowledgeBase> {
    // Check if user has already rated this knowledge base
    const [existingRating] = await db
      .select()
      .from(knowledgeBaseRatings)
      .where(
        and(
          eq(knowledgeBaseRatings.knowledgeBaseId, knowledgeBaseId),
          eq(knowledgeBaseRatings.userId, userId)
        )
      );
    
    if (existingRating) {
      // Update existing rating
      await db
        .update(knowledgeBaseRatings)
        .set({
          rating,
          comment: comment || existingRating.comment
        })
        .where(eq(knowledgeBaseRatings.id, existingRating.id));
    } else {
      // Create new rating
      await db
        .insert(knowledgeBaseRatings)
        .values({
          knowledgeBaseId,
          userId,
          rating,
          comment,
          createdAt: new Date()
        });
    }
    
    // Calculate new average rating
    const result = await db
      .select({
        avgRating: sql`AVG(${knowledgeBaseRatings.rating})`,
        count: sql`COUNT(*)`
      })
      .from(knowledgeBaseRatings)
      .where(eq(knowledgeBaseRatings.knowledgeBaseId, knowledgeBaseId));
    
    // Update knowledge base with new rating stats
    if (result.length > 0) {
      const [updatedKB] = await db
        .update(knowledgeBases)
        .set({
          avgRating: result[0].avgRating,
          ratingCount: result[0].count
        })
        .where(eq(knowledgeBases.id, knowledgeBaseId))
        .returning();
      
      return updatedKB;
    }
    
    // If no ratings found (unlikely), return the original knowledge base
    const kb = await this.getKnowledgeBase(knowledgeBaseId);
    if (!kb) {
      throw new Error(`Knowledge base with ID ${knowledgeBaseId} not found`);
    }
    
    return kb;
  }

  async acquireKnowledgeBase(knowledgeBaseId: number, userId: number, isPurchased: boolean = false): Promise<boolean> {
    try {
      // Check if knowledge base exists
      const kb = await this.getKnowledgeBase(knowledgeBaseId);
      if (!kb) return false;
      
      // Check if user already has this knowledge base
      const [existingAcquisition] = await db
        .select()
        .from(userKnowledgeBases)
        .where(
          and(
            eq(userKnowledgeBases.knowledgeBaseId, knowledgeBaseId),
            eq(userKnowledgeBases.userId, userId)
          )
        );
      
      if (existingAcquisition) {
        // If inactive, reactivate it
        if (!existingAcquisition.isActive) {
          await db
            .update(userKnowledgeBases)
            .set({ isActive: true })
            .where(eq(userKnowledgeBases.id, existingAcquisition.id));
        }
      } else {
        // Create new user-knowledge base relationship
        await db
          .insert(userKnowledgeBases)
          .values({
            knowledgeBaseId,
            userId,
            isPurchased,
            isActive: true,
            acquiredAt: new Date()
          });
      }
      
      // Increment download count
      await db
        .update(knowledgeBases)
        .set({ downloads: kb.downloads + 1 })
        .where(eq(knowledgeBases.id, knowledgeBaseId));
      
      return true;
    } catch (error) {
      console.error("Error acquiring knowledge base:", error);
      return false;
    }
  }
}