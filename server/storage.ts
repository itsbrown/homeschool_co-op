import { 
  users, type User, type InsertUser, 
  curricula, type Curriculum, type InsertCurriculum, 
  lessons, type Lesson, type InsertLesson, 
  events, type Event, type InsertEvent, 
  marketplaceItems, type MarketplaceItem, type InsertMarketplaceItem,
  knowledgeBases, type KnowledgeBase, type InsertKnowledgeBase,
  knowledgeBaseRatings, userKnowledgeBases
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Curriculum methods
  getCurriculum(id: number): Promise<Curriculum | undefined>;
  getCurriculaByAuthor(authorId: number): Promise<Curriculum[]>;
  createCurriculum(curriculum: InsertCurriculum): Promise<Curriculum>;
  updateCurriculum(id: number, curriculum: Partial<InsertCurriculum>): Promise<Curriculum | undefined>;
  
  // Lesson methods
  getLesson(id: number): Promise<Lesson | undefined>;
  getLessonsByCurriculum(curriculumId: number): Promise<Lesson[]>;
  getLessonsByAuthor(authorId: number): Promise<Lesson[]>;
  createLesson(lesson: InsertLesson): Promise<Lesson>;
  updateLesson(id: number, lesson: Partial<InsertLesson>): Promise<Lesson | undefined>;
  
  // Event methods
  getEvent(id: number): Promise<Event | undefined>;
  getEventsByOrganizer(organizerId: number): Promise<Event[]>;
  getUpcomingEvents(userId: number): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  
  // Marketplace methods
  getMarketplaceItem(id: number): Promise<MarketplaceItem | undefined>;
  getMarketplaceItemsBySeller(sellerId: number): Promise<MarketplaceItem[]>;
  getTopSellingItems(limit: number): Promise<MarketplaceItem[]>;
  createMarketplaceItem(item: InsertMarketplaceItem): Promise<MarketplaceItem>;
  updateMarketplaceItemStats(id: number, sales: number, revenue: number): Promise<MarketplaceItem | undefined>;
  
  // Knowledge Base methods
  getKnowledgeBase(id: number): Promise<KnowledgeBase | undefined>;
  getKnowledgeBasesByAuthor(authorId: number): Promise<KnowledgeBase[]>;
  getPublicKnowledgeBases(): Promise<KnowledgeBase[]>;
  getUserKnowledgeBases(userId: number): Promise<KnowledgeBase[]>;
  getRecommendedKnowledgeBases(subject?: string, gradeLevel?: string, limit?: number): Promise<KnowledgeBase[]>;
  createKnowledgeBase(knowledgeBase: InsertKnowledgeBase, authorId: number): Promise<KnowledgeBase>;
  updateKnowledgeBase(id: number, knowledgeBase: Partial<InsertKnowledgeBase>): Promise<KnowledgeBase | undefined>;
  deleteKnowledgeBase(id: number): Promise<boolean>;
  rateKnowledgeBase(knowledgeBaseId: number, userId: number, rating: number, comment?: string): Promise<KnowledgeBase>;
  acquireKnowledgeBase(knowledgeBaseId: number, userId: number, isPurchased?: boolean): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private usersStore: Map<number, User>;
  private curriculaStore: Map<number, Curriculum>;
  private lessonsStore: Map<number, Lesson>;
  private eventsStore: Map<number, Event>;
  private marketplaceItemsStore: Map<number, MarketplaceItem>;
  private knowledgeBasesStore: Map<number, KnowledgeBase>;
  private knowledgeBaseRatingsStore: Map<number, any>;
  private userKnowledgeBasesStore: Map<number, any>;
  
  private userIdCounter: number;
  private curriculumIdCounter: number;
  private lessonIdCounter: number;
  private eventIdCounter: number;
  private marketplaceItemIdCounter: number;
  private knowledgeBaseIdCounter: number;
  private knowledgeBaseRatingIdCounter: number;
  private userKnowledgeBaseIdCounter: number;

  constructor() {
    this.usersStore = new Map();
    this.curriculaStore = new Map();
    this.lessonsStore = new Map();
    this.eventsStore = new Map();
    this.marketplaceItemsStore = new Map();
    this.knowledgeBasesStore = new Map();
    this.knowledgeBaseRatingsStore = new Map();
    this.userKnowledgeBasesStore = new Map();
    
    this.userIdCounter = 1;
    this.curriculumIdCounter = 1;
    this.lessonIdCounter = 1;
    this.eventIdCounter = 1;
    this.marketplaceItemIdCounter = 1;
    this.knowledgeBaseIdCounter = 1;
    this.knowledgeBaseRatingIdCounter = 1;
    this.userKnowledgeBaseIdCounter = 1;
    
    // Initialize with a default admin user
    this.createUser({
      username: "admin",
      email: "admin@example.com",
      password: "$2a$10$JdJO7S7.eRlVhAdJBtmCQO0Pic.7x9Ebf65nGcNLAjUWXbkILhk6.", // "password"
      role: "admin",
      name: "Admin User",
      subscription: "individual"
    });
    
    // Sample educator user
    this.createUser({
      username: "sarah",
      email: "sarah@example.com",
      password: "$2a$10$JdJO7S7.eRlVhAdJBtmCQO0Pic.7x9Ebf65nGcNLAjUWXbkILhk6.", // "password"
      role: "educator",
      name: "Sarah Johnson",
      subscription: "educator"
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.usersStore.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.usersStore.values()).find(
      (user) => user.username === username,
    );
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.usersStore.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const now = new Date();
    const user: User = { ...insertUser, id, createdAt: now };
    this.usersStore.set(id, user);
    return user;
  }
  
  // Curriculum methods
  async getCurriculum(id: number): Promise<Curriculum | undefined> {
    return this.curriculaStore.get(id);
  }
  
  async getCurriculaByAuthor(authorId: number): Promise<Curriculum[]> {
    return Array.from(this.curriculaStore.values()).filter(
      curriculum => curriculum.authorId === authorId
    );
  }
  
  async createCurriculum(insertCurriculum: InsertCurriculum): Promise<Curriculum> {
    const id = this.curriculumIdCounter++;
    const now = new Date();
    const curriculum: Curriculum = { ...insertCurriculum, id, createdAt: now, updatedAt: now };
    this.curriculaStore.set(id, curriculum);
    return curriculum;
  }
  
  async updateCurriculum(id: number, updateData: Partial<InsertCurriculum>): Promise<Curriculum | undefined> {
    const curriculum = this.curriculaStore.get(id);
    if (!curriculum) return undefined;
    
    const updatedCurriculum = {
      ...curriculum,
      ...updateData,
      updatedAt: new Date()
    };
    
    this.curriculaStore.set(id, updatedCurriculum);
    return updatedCurriculum;
  }
  
  // Lesson methods
  async getLesson(id: number): Promise<Lesson | undefined> {
    return this.lessonsStore.get(id);
  }
  
  async getLessonsByCurriculum(curriculumId: number): Promise<Lesson[]> {
    return Array.from(this.lessonsStore.values()).filter(
      lesson => lesson.curriculumId === curriculumId
    );
  }
  
  async getLessonsByAuthor(authorId: number): Promise<Lesson[]> {
    return Array.from(this.lessonsStore.values()).filter(
      lesson => lesson.authorId === authorId
    );
  }
  
  async createLesson(insertLesson: InsertLesson): Promise<Lesson> {
    const id = this.lessonIdCounter++;
    const now = new Date();
    const lesson: Lesson = { ...insertLesson, id, createdAt: now, updatedAt: now };
    this.lessonsStore.set(id, lesson);
    return lesson;
  }
  
  async updateLesson(id: number, updateData: Partial<InsertLesson>): Promise<Lesson | undefined> {
    const lesson = this.lessonsStore.get(id);
    if (!lesson) return undefined;
    
    const updatedLesson = {
      ...lesson,
      ...updateData,
      updatedAt: new Date()
    };
    
    this.lessonsStore.set(id, updatedLesson);
    return updatedLesson;
  }
  
  // Event methods
  async getEvent(id: number): Promise<Event | undefined> {
    return this.eventsStore.get(id);
  }
  
  async getEventsByOrganizer(organizerId: number): Promise<Event[]> {
    return Array.from(this.eventsStore.values()).filter(
      event => event.organizerId === organizerId
    );
  }
  
  async getUpcomingEvents(userId: number): Promise<Event[]> {
    const now = new Date();
    return Array.from(this.eventsStore.values())
      .filter(event => event.startDate > now)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .slice(0, 5);
  }
  
  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const id = this.eventIdCounter++;
    const now = new Date();
    const event: Event = { ...insertEvent, id, createdAt: now };
    this.eventsStore.set(id, event);
    return event;
  }
  
  // Marketplace methods
  async getMarketplaceItem(id: number): Promise<MarketplaceItem | undefined> {
    return this.marketplaceItemsStore.get(id);
  }
  
  async getMarketplaceItemsBySeller(sellerId: number): Promise<MarketplaceItem[]> {
    return Array.from(this.marketplaceItemsStore.values()).filter(
      item => item.sellerId === sellerId
    );
  }
  
  async getTopSellingItems(limit: number): Promise<MarketplaceItem[]> {
    return Array.from(this.marketplaceItemsStore.values())
      .sort((a, b) => b.sales - a.sales)
      .slice(0, limit);
  }
  
  async createMarketplaceItem(insertItem: InsertMarketplaceItem): Promise<MarketplaceItem> {
    const id = this.marketplaceItemIdCounter++;
    const now = new Date();
    const item: MarketplaceItem = {
      ...insertItem,
      id,
      sales: 0,
      revenue: 0,
      createdAt: now
    };
    this.marketplaceItemsStore.set(id, item);
    return item;
  }
  
  async updateMarketplaceItemStats(id: number, sales: number, revenue: number): Promise<MarketplaceItem | undefined> {
    const item = this.marketplaceItemsStore.get(id);
    if (!item) return undefined;
    
    const updatedItem = {
      ...item,
      sales: item.sales + sales,
      revenue: item.revenue + revenue
    };
    
    this.marketplaceItemsStore.set(id, updatedItem);
    return updatedItem;
  }

  // Knowledge Base methods
  async getKnowledgeBase(id: number): Promise<KnowledgeBase | undefined> {
    return this.knowledgeBasesStore.get(id);
  }

  async getKnowledgeBasesByAuthor(authorId: number): Promise<KnowledgeBase[]> {
    return Array.from(this.knowledgeBasesStore.values()).filter(
      kb => kb.authorId === authorId
    );
  }

  async getPublicKnowledgeBases(): Promise<KnowledgeBase[]> {
    return Array.from(this.knowledgeBasesStore.values()).filter(
      kb => kb.isPublic && kb.isPublished
    );
  }

  async getUserKnowledgeBases(userId: number): Promise<KnowledgeBase[]> {
    // Get knowledge bases authored by the user
    const authoredKBs = this.getKnowledgeBasesByAuthor(userId);
    
    // Get knowledge bases acquired by the user
    const userKBs = Array.from(this.userKnowledgeBasesStore.values())
      .filter(ukb => ukb.userId === userId && ukb.isActive)
      .map(ukb => this.knowledgeBasesStore.get(ukb.knowledgeBaseId))
      .filter(kb => kb !== undefined) as KnowledgeBase[];
    
    return [...await authoredKBs, ...userKBs];
  }

  async getRecommendedKnowledgeBases(subject?: string, gradeLevel?: string, limit: number = 5): Promise<KnowledgeBase[]> {
    let filteredKBs = Array.from(this.knowledgeBasesStore.values())
      .filter(kb => kb.isPublished && kb.isPublic);
    
    if (subject) {
      filteredKBs = filteredKBs.filter(kb => kb.subject === subject);
    }
    
    if (gradeLevel) {
      filteredKBs = filteredKBs.filter(kb => kb.gradeLevel === gradeLevel);
    }
    
    // Sort by rating and downloads
    return filteredKBs
      .sort((a, b) => {
        // Sort by rating first
        if (a.avgRating !== b.avgRating) {
          return b.avgRating - a.avgRating;
        }
        // Then by downloads
        return b.downloads - a.downloads;
      })
      .slice(0, limit);
  }

  async createKnowledgeBase(knowledgeBase: InsertKnowledgeBase, authorId: number): Promise<KnowledgeBase> {
    const id = this.knowledgeBaseIdCounter++;
    const now = new Date();
    
    const newKB: KnowledgeBase = {
      ...knowledgeBase,
      id,
      authorId,
      createdAt: now,
      updatedAt: now,
      downloads: 0,
      avgRating: 0,
      ratingCount: 0
    };
    
    this.knowledgeBasesStore.set(id, newKB);
    return newKB;
  }

  async updateKnowledgeBase(id: number, updateData: Partial<InsertKnowledgeBase>): Promise<KnowledgeBase | undefined> {
    const kb = this.knowledgeBasesStore.get(id);
    if (!kb) return undefined;
    
    const updatedKB = {
      ...kb,
      ...updateData,
      updatedAt: new Date()
    };
    
    this.knowledgeBasesStore.set(id, updatedKB);
    return updatedKB;
  }

  async deleteKnowledgeBase(id: number): Promise<boolean> {
    if (!this.knowledgeBasesStore.has(id)) {
      return false;
    }
    
    this.knowledgeBasesStore.delete(id);
    
    // Also remove any ratings and user associations
    for (const [ratingId, rating] of this.knowledgeBaseRatingsStore.entries()) {
      if (rating.knowledgeBaseId === id) {
        this.knowledgeBaseRatingsStore.delete(ratingId);
      }
    }
    
    for (const [userKbId, userKb] of this.userKnowledgeBasesStore.entries()) {
      if (userKb.knowledgeBaseId === id) {
        this.userKnowledgeBasesStore.delete(userKbId);
      }
    }
    
    return true;
  }

  async rateKnowledgeBase(knowledgeBaseId: number, userId: number, rating: number, comment?: string): Promise<KnowledgeBase> {
    const kb = this.knowledgeBasesStore.get(knowledgeBaseId);
    if (!kb) {
      throw new Error(`Knowledge base with ID ${knowledgeBaseId} not found`);
    }
    
    // Check if user has already rated this knowledge base
    const existingRating = Array.from(this.knowledgeBaseRatingsStore.values())
      .find(r => r.knowledgeBaseId === knowledgeBaseId && r.userId === userId);
    
    if (existingRating) {
      // Update existing rating
      existingRating.rating = rating;
      if (comment !== undefined) {
        existingRating.comment = comment;
      }
    } else {
      // Create new rating
      const ratingId = this.knowledgeBaseRatingIdCounter++;
      this.knowledgeBaseRatingsStore.set(ratingId, {
        id: ratingId,
        knowledgeBaseId,
        userId,
        rating,
        comment,
        createdAt: new Date()
      });
    }
    
    // Update knowledge base average rating
    const allRatings = Array.from(this.knowledgeBaseRatingsStore.values())
      .filter(r => r.knowledgeBaseId === knowledgeBaseId);
    
    const sum = allRatings.reduce((acc, r) => acc + r.rating, 0);
    const avg = sum / allRatings.length;
    
    // Update the knowledge base
    const updatedKB = {
      ...kb,
      avgRating: avg,
      ratingCount: allRatings.length
    };
    
    this.knowledgeBasesStore.set(knowledgeBaseId, updatedKB);
    return updatedKB;
  }

  async acquireKnowledgeBase(knowledgeBaseId: number, userId: number, isPurchased: boolean = false): Promise<boolean> {
    const kb = this.knowledgeBasesStore.get(knowledgeBaseId);
    if (!kb) {
      return false;
    }
    
    // Check if user already has this knowledge base
    const existingAcquisition = Array.from(this.userKnowledgeBasesStore.values())
      .find(ukb => ukb.knowledgeBaseId === knowledgeBaseId && ukb.userId === userId);
    
    if (existingAcquisition) {
      // If inactive, reactivate it
      if (!existingAcquisition.isActive) {
        existingAcquisition.isActive = true;
      }
    } else {
      // Create new user-knowledge base relationship
      const userKbId = this.userKnowledgeBaseIdCounter++;
      this.userKnowledgeBasesStore.set(userKbId, {
        id: userKbId,
        knowledgeBaseId,
        userId,
        isPurchased,
        isActive: true,
        acquiredAt: new Date()
      });
    }
    
    // Increment download count
    const updatedKB = {
      ...kb,
      downloads: kb.downloads + 1
    };
    
    this.knowledgeBasesStore.set(knowledgeBaseId, updatedKB);
    return true;
  }
}

// Import DatabaseStorage for PostgreSQL database storage
import { DatabaseStorage } from "./db/database-storage";

// Use DatabaseStorage for persistent storage with our PostgreSQL database
console.log("Using DatabaseStorage with PostgreSQL database");
export const storage = new DatabaseStorage();
