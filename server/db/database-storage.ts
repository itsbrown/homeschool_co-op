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
  
  // Child methods
  async getChildById(id: number): Promise<Child | undefined> {
    const [child] = await db.select().from(children).where(eq(children.id, id));
    return child || undefined;
  }

  async getChildrenByParentId(parentId: number): Promise<Child[]> {
    return await db.select().from(children).where(eq(children.parentId, parentId));
  }

  async createChild(childData: InsertChild & { parentId: number }): Promise<Child> {
    const [child] = await db
      .insert(children)
      .values(childData)
      .returning();
    return child;
  }

  async updateChild(id: number, updateData: Partial<InsertChild>): Promise<Child | undefined> {
    const [updatedChild] = await db
      .update(children)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(children.id, id))
      .returning();
    
    return updatedChild || undefined;
  }

  async deleteChild(id: number): Promise<void> {
    await db.delete(children).where(eq(children.id, id));
  }

  // Emergency Contact methods
  async getEmergencyContactById(id: number): Promise<EmergencyContact | undefined> {
    const [contact] = await db.select().from(emergencyContacts).where(eq(emergencyContacts.id, id));
    return contact || undefined;
  }

  async getEmergencyContactsByUserId(userId: number): Promise<EmergencyContact[]> {
    return await db.select().from(emergencyContacts).where(eq(emergencyContacts.userId, userId));
  }

  async createEmergencyContact(contactData: InsertEmergencyContact & { userId: number }): Promise<EmergencyContact> {
    const [contact] = await db
      .insert(emergencyContacts)
      .values(contactData)
      .returning();
    return contact;
  }

  async updateEmergencyContact(id: number, updateData: Partial<InsertEmergencyContact>): Promise<EmergencyContact | undefined> {
    const [updatedContact] = await db
      .update(emergencyContacts)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(emergencyContacts.id, id))
      .returning();
    
    return updatedContact || undefined;
  }

  async deleteEmergencyContact(id: number): Promise<void> {
    await db.delete(emergencyContacts).where(eq(emergencyContacts.id, id));
  }

  // Program methods
  async getProgramById(id: number): Promise<Program | undefined> {
    const [program] = await db.select().from(programs).where(eq(programs.id, id));
    return program || undefined;
  }

  async getPublishedPrograms(category?: string, gradeLevel?: string): Promise<Program[]> {
    let query = db.select().from(programs).where(eq(programs.isPublished, true));
    
    if (category) {
      query = query.where(eq(programs.category, category));
    }
    
    // For gradeLevel filtering, we need to check if the grade level is in the array
    let result = await query;
    
    if (gradeLevel) {
      // Filter in memory for array containment
      result = result.filter(program => 
        program.gradeLevels.includes(gradeLevel)
      );
    }
    
    return result;
  }

  async getProgramsByInstructorId(instructorId: number): Promise<Program[]> {
    return await db.select().from(programs).where(eq(programs.instructorId, instructorId));
  }

  async createProgram(programData: InsertProgram & { instructorId: number }): Promise<Program> {
    const [program] = await db
      .insert(programs)
      .values(programData)
      .returning();
    return program;
  }

  async updateProgram(id: number, updateData: Partial<InsertProgram>): Promise<Program | undefined> {
    const [updatedProgram] = await db
      .update(programs)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(programs.id, id))
      .returning();
    
    return updatedProgram || undefined;
  }

  async deleteProgram(id: number): Promise<void> {
    await db.delete(programs).where(eq(programs.id, id));
  }

  // Program Enrollment methods
  async getProgramEnrollmentById(id: number): Promise<ProgramEnrollment | undefined> {
    const [enrollment] = await db.select().from(programEnrollments).where(eq(programEnrollments.id, id));
    return enrollment || undefined;
  }

  async getEnrollmentsByChildIds(childIds: number[]): Promise<ProgramEnrollment[]> {
    if (childIds.length === 0) return [];
    
    return await db
      .select()
      .from(programEnrollments)
      .where(sql`${programEnrollments.childId} IN (${sql.join(childIds, sql`, `)})`);
  }

  async getEnrollmentsByProgramId(programId: number): Promise<ProgramEnrollment[]> {
    return await db.select().from(programEnrollments).where(eq(programEnrollments.programId, programId));
  }

  async getEnrollmentCountForProgram(programId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.programId, programId),
          sql`${programEnrollments.status} IN ('pending', 'confirmed', 'active')`
        )
      );
    
    return result[0]?.count || 0;
  }

  async createProgramEnrollment(enrollmentData: InsertProgramEnrollment): Promise<ProgramEnrollment> {
    const [enrollment] = await db
      .insert(programEnrollments)
      .values(enrollmentData)
      .returning();
    return enrollment;
  }

  async updateProgramEnrollment(id: number, updateData: Partial<InsertProgramEnrollment>): Promise<ProgramEnrollment | undefined> {
    const [updatedEnrollment] = await db
      .update(programEnrollments)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(programEnrollments.id, id))
      .returning();
    
    return updatedEnrollment || undefined;
  }

  async deleteProgramEnrollment(id: number): Promise<void> {
    await db.delete(programEnrollments).where(eq(programEnrollments.id, id));
  }
}