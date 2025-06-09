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
  activities, type Activity, type InsertActivity,
  roleInvitations, type RoleInvitation, type InsertRoleInvitation,
  marketingLinks, type MarketingLink, type InsertMarketingLink,
  linkAnalytics, type LinkAnalytics, type InsertLinkAnalytics
} from "@shared/schema";

export interface IStorage {
  // Methods for backup
  getAllUsers(): Promise<User[]>;
  getAllCurricula(): Promise<Curriculum[]>;
  getAllKnowledgeBases(): Promise<KnowledgeBase[]>;
  getAllActivities(): Promise<Activity[]>;
  getAllPayments(): Promise<Payment[]>;
  getAllEnrollments(): Promise<Enrollment[]>;
  
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  
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
  getAllEvents(userId: number): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  
  // Marketplace methods
  getMarketplaceItem(id: number): Promise<MarketplaceItem | undefined>;
  getMarketplaceItemsBySeller(sellerId: number): Promise<MarketplaceItem[]>;
  getTopSellingItems(limit: number): Promise<MarketplaceItem[]>;
  createMarketplaceItem(item: InsertMarketplaceItem): Promise<MarketplaceItem>;
  updateMarketplaceItemStats(id: number, sales: number, revenue: number): Promise<MarketplaceItem | undefined>;
  
  // Knowledge Base methods
  getKnowledgeBase(id: number): Promise<KnowledgeBase | undefined>;
  getKnowledgeBaseById(id: number, userId: number): Promise<KnowledgeBase | undefined>;
  
  // Activity methods
  getActivityById(id: number, userId: number): Promise<Activity | undefined>;
  getActivitiesByAuthor(authorId: number): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  updateActivityDownloadCount(id: number): Promise<Activity | undefined>;
  updateActivityPdfUrl(id: number, pdfUrl: string): Promise<Activity | undefined>;
  getKnowledgeBasesByAuthor(authorId: number): Promise<KnowledgeBase[]>;
  getKnowledgeBasesBySubject(subject: string): Promise<KnowledgeBase[]>;
  getPublicKnowledgeBases(limit?: number): Promise<KnowledgeBase[]>;
  createKnowledgeBase(knowledgeBase: InsertKnowledgeBase): Promise<KnowledgeBase>;
  updateKnowledgeBase(id: number, knowledgeBase: Partial<KnowledgeBase>): Promise<KnowledgeBase | undefined>;
  incrementDownloadCount(id: number): Promise<KnowledgeBase | undefined>;
  addPurchaser(id: number, userId: number): Promise<KnowledgeBase | undefined>;
  
  // Child methods
  getChildById(id: number): Promise<Child | undefined>;
  getChildrenByParentId(parentId: number): Promise<Child[]>;
  getChildrenByParentEmail(parentEmail: string): Promise<Child[]>;
  getAllChildren(): Promise<Child[]>;
  createChild(child: InsertChild & { parentId: number }): Promise<Child>;
  updateChild(id: number, child: Partial<InsertChild>): Promise<Child | undefined>;
  deleteChild(id: number): Promise<void>;
  
  // Role invitation methods
  createRoleInvitation(invitation: any): Promise<any>;
  getRoleInvitations(): Promise<any[]>;
  getActiveRoleInvitation(token: string): Promise<any>;
  acceptRoleInvitation(token: string): Promise<void>;
  revokeRoleInvitation(id: number): Promise<void>;
  
  // Emergency Contact methods
  getEmergencyContactById(id: number): Promise<EmergencyContact | undefined>;
  getEmergencyContactsByUserId(userId: number): Promise<EmergencyContact[]>;
  createEmergencyContact(contact: InsertEmergencyContact & { userId: number }): Promise<EmergencyContact>;
  updateEmergencyContact(id: number, contact: Partial<InsertEmergencyContact>): Promise<EmergencyContact | undefined>;
  deleteEmergencyContact(id: number): Promise<void>;
  
  // Program methods
  getProgramById(id: number): Promise<Program | undefined>;
  getPublishedPrograms(category?: string, gradeLevel?: string): Promise<Program[]>;
  getProgramsByInstructorId(instructorId: number): Promise<Program[]>;
  createProgram(program: InsertProgram & { instructorId: number }): Promise<Program>;
  updateProgram(id: number, program: Partial<InsertProgram>): Promise<Program | undefined>;
  deleteProgram(id: number): Promise<void>;
  
  // Program Enrollment methods
  getProgramEnrollmentById(id: number): Promise<ProgramEnrollment | undefined>;
  getEnrollmentsByChildIds(childIds: number[]): Promise<ProgramEnrollment[]>;
  getEnrollmentsByProgramId(programId: number): Promise<ProgramEnrollment[]>;
  getEnrollmentCountForProgram(programId: number): Promise<number>;
  createProgramEnrollment(enrollment: InsertProgramEnrollment): Promise<ProgramEnrollment>;
  updateProgramEnrollment(id: number, enrollment: Partial<InsertProgramEnrollment>): Promise<ProgramEnrollment | undefined>;
  deleteProgramEnrollment(id: number): Promise<void>;
  
  // Class Enrollment methods
  createEnrollment(enrollment: any): Promise<any>;
  getEnrollmentsByChildId(childId: number): Promise<any[]>;
  
  // Class methods
  getClassById(id: number): Promise<Class | undefined>;
  getClasses(options: { page: number; limit: number; search?: string; category?: string; status?: "published" | "draft" | "" }): Promise<Class[]>;
  getClassesCount(options: { search?: string; category?: string; status?: "published" | "draft" | "" }): Promise<number>;
  createClass(classData: InsertClass & { instructorId: number }): Promise<Class>;
  updateClass(id: number, classData: Partial<InsertClass>): Promise<Class | undefined>;
  deleteClass(id: number): Promise<void>;
  
  // Role Invitation methods
  getActiveRoleInvitation(email: string): Promise<RoleInvitation | undefined>;
  createRoleInvitation(invitation: InsertRoleInvitation & { invitedBy: number }): Promise<RoleInvitation>;
  acceptRoleInvitation(token: string, userEmail: string): Promise<RoleInvitation | undefined>;
  getRoleInvitationsByInviter(inviterId: number): Promise<RoleInvitation[]>;
  
  // Marketing Link methods
  getMarketingLinkById(id: number): Promise<MarketingLink | undefined>;
  getMarketingLinkByCampaignId(campaignId: string): Promise<MarketingLink | undefined>;
  getMarketingLinksBySchoolId(schoolId: number): Promise<MarketingLink[]>;
  createMarketingLink(link: InsertMarketingLink): Promise<MarketingLink>;
  updateMarketingLink(id: number, link: Partial<InsertMarketingLink>): Promise<MarketingLink | undefined>;
  deleteMarketingLink(id: number): Promise<void>;
  incrementLinkClick(campaignId: string): Promise<void>;
  incrementLinkConversion(campaignId: string): Promise<void>;
  
  // Link Analytics methods
  createLinkAnalytics(analytics: InsertLinkAnalytics): Promise<LinkAnalytics>;
  getLinkAnalyticsByLinkId(linkId: number, startDate?: Date, endDate?: Date): Promise<LinkAnalytics[]>;
  getLinkAnalyticsBySchoolId(schoolId: number, startDate?: Date, endDate?: Date): Promise<LinkAnalytics[]>;
}

export class MemStorage implements IStorage {
  private usersStore: Map<number, User>;
  private curriculaStore: Map<number, Curriculum>;
  private lessonsStore: Map<number, Lesson>;
  private eventsStore: Map<number, Event>;
  private marketplaceItemsStore: Map<number, MarketplaceItem>;
  private knowledgeBaseStore: Map<number, KnowledgeBase>;
  private childrenStore: Map<number, Child>;
  private emergencyContactsStore: Map<number, EmergencyContact>;
  private programsStore: Map<number, Program>;
  private programEnrollmentsStore: Map<number, ProgramEnrollment>;
  private classesStore: Map<number, Class>;
  private activitiesStore: Map<number, Activity>;
  private marketingLinksStore: Map<number, MarketingLink>;
  private linkAnalyticsStore: Map<number, LinkAnalytics>;
  
  private userIdCounter: number;
  private curriculumIdCounter: number;
  private lessonIdCounter: number;
  private eventIdCounter: number;
  private marketplaceItemIdCounter: number;
  private knowledgeBaseIdCounter: number;
  private childIdCounter: number;
  private emergencyContactIdCounter: number;
  private programIdCounter: number;
  private programEnrollmentIdCounter: number;
  private classIdCounter: number;
  private activityIdCounter: number;
  private marketingLinkIdCounter: number;
  private linkAnalyticsIdCounter: number;
  private classEnrollments: any[];

  constructor() {
    this.usersStore = new Map();
    this.curriculaStore = new Map();
    this.lessonsStore = new Map();
    this.eventsStore = new Map();
    this.marketplaceItemsStore = new Map();
    this.knowledgeBaseStore = new Map();
    this.childrenStore = new Map();
    this.emergencyContactsStore = new Map();
    this.programsStore = new Map();
    this.programEnrollmentsStore = new Map();
    this.classesStore = new Map();
    this.activitiesStore = new Map();
    this.marketingLinksStore = new Map();
    this.linkAnalyticsStore = new Map();
    this.classEnrollments = [];
    
    this.userIdCounter = 1;
    this.curriculumIdCounter = 1;
    this.lessonIdCounter = 1;
    this.eventIdCounter = 1;
    this.marketplaceItemIdCounter = 1;
    this.knowledgeBaseIdCounter = 1;
    this.childIdCounter = 1;
    this.emergencyContactIdCounter = 1;
    this.programIdCounter = 1;
    this.programEnrollmentIdCounter = 1;
    this.classIdCounter = 1;
    this.activityIdCounter = 1;
    this.marketingLinkIdCounter = 1;
    this.linkAnalyticsIdCounter = 1;
    
    // Initialize with a default admin user
    
    // Add sample events for testing the calendar
    this.initializeSampleEvents();
    
    // Load enrollments from file
    this.initializeEnrollments().catch(console.error);
    this.initializeKnowledgeBases().catch(console.error);
    this.initializeSampleClasses().catch(console.error);
    this.initializeChildren().catch(console.error);

    this.createUser({
      username: "admin",
      email: "admin@example.com",
      password: "$2a$10$JdJO7S7.eRlVhAdJBtmCQO0Pic.7x9Ebf65nGcNLAjUWXbkILhk6.", // "password"
      role: "admin",
      name: "Admin User",
      subscription: "individual"
    });
    
    // Super Admin user
    this.createUser({
      username: "superadmin",
      email: "superadmin@americanseekersacademy.com",
      password: "$2a$10$JdJO7S7.eRlVhAdJBtmCQO0Pic.7x9Ebf65nGcNLAjUWXbkILhk6.", // "password"
      role: "superAdmin",
      name: "Super Administrator",
      subscription: "institutional",
      supabaseId: "ac3f50b8-0e07-401f-80b8-96af1de10106"
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
    
    // Test users for each role
    this.createUser({
      username: "learner",
      email: "learner@example.com",
      password: "$2a$10$JdJO7S7.eRlVhAdJBtmCQO0Pic.7x9Ebf65nGcNLAjUWXbkILhk6.", // "password"
      role: "learner",
      name: "Test Learner",
      subscription: "free"
    });
    
    this.createUser({
      username: "parent",
      email: "parent@example.com",
      password: "$2a$10$JdJO7S7.eRlVhAdJBtmCQO0Pic.7x9Ebf65nGcNLAjUWXbkILhk6.", // "password"
      role: "parent",
      name: "Test Parent",
      subscription: "family"
    });
    
    this.createUser({
      username: "educator",
      email: "educator@example.com",
      password: "$2a$10$JdJO7S7.eRlVhAdJBtmCQO0Pic.7x9Ebf65nGcNLAjUWXbkILhk6.", // "password"
      role: "educator",
      name: "Test Educator",
      subscription: "educator"
    });
    
    // School admin user for American Seekers Academy
    this.createUser({
      username: "contact",
      email: "contact.americanseekersacademy@gmail.com",
      password: "$2a$10$JdJO7S7.eRlVhAdJBtmCQO0Pic.7x9Ebf65nGcNLAjUWXbkILhk6.", // "password"
      role: "schoolAdmin",
      name: "Corey Creates",
      subscription: "school"
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
  
  async updateUser(id: number, updateData: Partial<InsertUser>): Promise<User | undefined> {
    const existingUser = this.usersStore.get(id);
    if (!existingUser) {
      return undefined;
    }
    
    const updatedUser: User = { ...existingUser, ...updateData };
    this.usersStore.set(id, updatedUser);
    return updatedUser;
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
  
  async getAllEvents(userId: number): Promise<Event[]> {
    // For now, return all events - in a real app we would filter based on permissions
    return Array.from(this.eventsStore.values())
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
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
    return this.knowledgeBaseStore.get(id);
  }
  
  async getKnowledgeBasesByAuthor(authorId: number): Promise<KnowledgeBase[]> {
    return Array.from(this.knowledgeBaseStore.values()).filter(
      kb => kb.authorId === authorId
    );
  }
  
  async getKnowledgeBasesBySubject(subject: string): Promise<KnowledgeBase[]> {
    return Array.from(this.knowledgeBaseStore.values()).filter(
      kb => kb.subject.toLowerCase() === subject.toLowerCase()
    );
  }
  
  async getPublicKnowledgeBases(limit?: number): Promise<KnowledgeBase[]> {
    const publicBases = Array.from(this.knowledgeBaseStore.values()).filter(
      kb => kb.isPublic
    );
    
    if (limit) {
      return publicBases.slice(0, limit);
    }
    
    return publicBases;
  }

  async getAllKnowledgeBases(): Promise<KnowledgeBase[]> {
    return Array.from(this.knowledgeBaseStore.values());
  }
  
  async createKnowledgeBase(insertKnowledgeBase: InsertKnowledgeBase): Promise<KnowledgeBase> {
    const id = this.knowledgeBaseIdCounter++;
    const now = new Date();
    const knowledgeBase: KnowledgeBase = { 
      ...insertKnowledgeBase, 
      id, 
      createdAt: now,
      updatedAt: now,
      downloadCount: 0,
      purchasedBy: []
    };
    
    this.knowledgeBaseStore.set(id, knowledgeBase);
    return knowledgeBase;
  }
  
  async updateKnowledgeBase(id: number, updateData: Partial<InsertKnowledgeBase>): Promise<KnowledgeBase | undefined> {
    const knowledgeBase = this.knowledgeBaseStore.get(id);
    if (!knowledgeBase) return undefined;
    
    const updatedKnowledgeBase = {
      ...knowledgeBase,
      ...updateData,
      updatedAt: new Date()
    };
    
    this.knowledgeBaseStore.set(id, updatedKnowledgeBase);
    return updatedKnowledgeBase;
  }
  
  async incrementDownloadCount(id: number): Promise<KnowledgeBase | undefined> {
    const knowledgeBase = this.knowledgeBaseStore.get(id);
    if (!knowledgeBase) return undefined;
    
    const updatedKnowledgeBase = {
      ...knowledgeBase,
      downloadCount: knowledgeBase.downloadCount + 1
    };
    
    this.knowledgeBaseStore.set(id, updatedKnowledgeBase);
    return updatedKnowledgeBase;
  }
  
  async addPurchaser(id: number, userId: number): Promise<KnowledgeBase | undefined> {
    const knowledgeBase = this.knowledgeBaseStore.get(id);
    if (!knowledgeBase) return undefined;
    
    // Check if user has already purchased
    if (knowledgeBase.purchasedBy.includes(userId)) {
      return knowledgeBase;
    }
    
    const updatedKnowledgeBase = {
      ...knowledgeBase,
      purchasedBy: [...knowledgeBase.purchasedBy, userId]
    };
    
    this.knowledgeBaseStore.set(id, updatedKnowledgeBase);
    return updatedKnowledgeBase;
  }

  // Child methods
  async getChildById(id: number): Promise<Child | undefined> {
    return this.childrenStore.get(id);
  }

  async getChildrenByParentId(parentId: number): Promise<Child[]> {
    return Array.from(this.childrenStore.values()).filter(child => child.parentId === parentId);
  }

  async getChildrenByParentEmail(parentEmail: string): Promise<Child[]> {
    return Array.from(this.childrenStore.values()).filter(child => (child as any).parentEmail === parentEmail);
  }

  async createChild(childData: InsertChild & { parentId: number }): Promise<Child> {
    const id = this.childIdCounter++;
    const now = new Date();
    
    const child: Child = {
      ...childData,
      id,
      createdAt: now,
      updatedAt: now
    };
    
    this.childrenStore.set(id, child);
    return child;
  }

  async updateChild(id: number, updateData: Partial<InsertChild>): Promise<Child | undefined> {
    const child = this.childrenStore.get(id);
    if (!child) return undefined;
    
    const updatedChild: Child = {
      ...child,
      ...updateData,
      updatedAt: new Date()
    };
    
    this.childrenStore.set(id, updatedChild);
    return updatedChild;
  }

  async deleteChild(id: number): Promise<void> {
    this.childrenStore.delete(id);
  }

  async getAllChildren(): Promise<Child[]> {
    return Array.from(this.childrenStore.values());
  }

  // Emergency Contact methods
  async getEmergencyContactById(id: number): Promise<EmergencyContact | undefined> {
    return this.emergencyContactsStore.get(id);
  }

  async getEmergencyContactsByUserId(userId: number): Promise<EmergencyContact[]> {
    return Array.from(this.emergencyContactsStore.values()).filter(contact => contact.userId === userId);
  }

  async createEmergencyContact(contactData: InsertEmergencyContact & { userId: number }): Promise<EmergencyContact> {
    const id = this.emergencyContactIdCounter++;
    const now = new Date();
    
    const contact: EmergencyContact = {
      ...contactData,
      id,
      createdAt: now,
      updatedAt: now
    };
    
    this.emergencyContactsStore.set(id, contact);
    return contact;
  }

  async updateEmergencyContact(id: number, updateData: Partial<InsertEmergencyContact>): Promise<EmergencyContact | undefined> {
    const contact = this.emergencyContactsStore.get(id);
    if (!contact) return undefined;
    
    const updatedContact: EmergencyContact = {
      ...contact,
      ...updateData,
      updatedAt: new Date()
    };
    
    this.emergencyContactsStore.set(id, updatedContact);
    return updatedContact;
  }

  async deleteEmergencyContact(id: number): Promise<void> {
    this.emergencyContactsStore.delete(id);
  }

  // Program methods
  async getProgramById(id: number): Promise<Program | undefined> {
    return this.programsStore.get(id);
  }

  async getPublishedPrograms(category?: string, gradeLevel?: string): Promise<Program[]> {
    let programs = Array.from(this.programsStore.values()).filter(program => program.isPublished);
    
    if (category) {
      programs = programs.filter(program => program.category === category);
    }
    
    if (gradeLevel) {
      programs = programs.filter(program => program.gradeLevels && program.gradeLevels.includes(gradeLevel));
    }
    
    return programs;
  }

  async getProgramsByInstructorId(instructorId: number): Promise<Program[]> {
    return Array.from(this.programsStore.values()).filter(program => program.instructorId === instructorId);
  }

  async createProgram(programData: InsertProgram & { instructorId: number }): Promise<Program> {
    const id = this.programIdCounter++;
    const now = new Date();
    
    const program: Program = {
      ...programData,
      id,
      createdAt: now,
      updatedAt: now
    };
    
    this.programsStore.set(id, program);
    return program;
  }

  async updateProgram(id: number, updateData: Partial<InsertProgram>): Promise<Program | undefined> {
    const program = this.programsStore.get(id);
    if (!program) return undefined;
    
    const updatedProgram: Program = {
      ...program,
      ...updateData,
      updatedAt: new Date()
    };
    
    this.programsStore.set(id, updatedProgram);
    return updatedProgram;
  }

  async deleteProgram(id: number): Promise<void> {
    this.programsStore.delete(id);
  }

  // Program Enrollment methods
  async getProgramEnrollmentById(id: number): Promise<ProgramEnrollment | undefined> {
    return this.programEnrollmentsStore.get(id);
  }

  async getEnrollmentsByChildIds(childIds: number[]): Promise<ProgramEnrollment[]> {
    return Array.from(this.programEnrollmentsStore.values())
      .filter(enrollment => childIds.includes(enrollment.childId));
  }

  async getEnrollmentsByProgramId(programId: number): Promise<ProgramEnrollment[]> {
    return Array.from(this.programEnrollmentsStore.values())
      .filter(enrollment => enrollment.programId === programId);
  }

  async getEnrollmentCountForProgram(programId: number): Promise<number> {
    return this.getEnrollmentsByProgramId(programId).then(enrollments => 
      enrollments.filter(enrollment => 
        enrollment.status === 'active' || enrollment.status === 'pending').length
    );
  }

  async createProgramEnrollment(enrollmentData: InsertProgramEnrollment): Promise<ProgramEnrollment> {
    const id = this.programEnrollmentIdCounter++;
    const now = new Date();
    
    const enrollment: ProgramEnrollment = {
      ...enrollmentData,
      id,
      createdAt: now,
      updatedAt: now
    };
    
    this.programEnrollmentsStore.set(id, enrollment);
    return enrollment;
  }

  async updateProgramEnrollment(id: number, updateData: Partial<InsertProgramEnrollment>): Promise<ProgramEnrollment | undefined> {
    const enrollment = this.programEnrollmentsStore.get(id);
    if (!enrollment) return undefined;
    
    const updatedEnrollment: ProgramEnrollment = {
      ...enrollment,
      ...updateData,
      updatedAt: new Date()
    };
    
    this.programEnrollmentsStore.set(id, updatedEnrollment);
    return updatedEnrollment;
  }

  async deleteProgramEnrollment(id: number): Promise<void> {
    this.programEnrollmentsStore.delete(id);
  }

  // Class Enrollment methods
  async createEnrollment(enrollment: any): Promise<any> {
    // Save to memory array
    if (!this.classEnrollments) {
      this.classEnrollments = [];
    }
    this.classEnrollments.push(enrollment);
    console.log(`📝 ENROLLMENT STORED: Child ${enrollment.childId} enrolled in class ${enrollment.classId}`);
    console.log(`📝 Total enrollments in memory: ${this.classEnrollments.length}`);
    console.log(`📝 All enrollments:`, this.classEnrollments);
    
    // Save to file for persistence
    try {
      console.log(`💾 About to save enrollments to file...`);
      await this.saveEnrollmentsToFile();
      console.log(`💾 Save operation completed`);
    } catch (error) {
      console.error(`❌ Error in createEnrollment save operation:`, error);
    }
    
    return enrollment;
  }

  async getEnrollmentsByChildId(childId: number): Promise<any[]> {
    if (!this.classEnrollments) {
      console.log(`📝 No classEnrollments array exists for child ${childId}`);
      return [];
    }
    const enrollments = this.classEnrollments.filter(enrollment => enrollment.childId === childId);
    console.log(`📝 ENROLLMENT QUERY: Child ${childId} has ${enrollments.length} enrollments`);
    console.log(`📝 Enrollments found:`, enrollments);
    return enrollments;
  }

  async removeEnrollment(enrollmentId: number): Promise<boolean> {
    if (!this.classEnrollments) {
      console.log(`❌ No classEnrollments array exists for enrollment ${enrollmentId}`);
      return false;
    }
    
    const initialLength = this.classEnrollments.length;
    this.classEnrollments = this.classEnrollments.filter(enrollment => enrollment.id !== enrollmentId);
    const finalLength = this.classEnrollments.length;
    
    if (initialLength === finalLength) {
      console.log(`❌ Enrollment ${enrollmentId} not found`);
      return false;
    }
    
    console.log(`❌ ENROLLMENT REMOVED: ID ${enrollmentId}`);
    console.log(`📝 Total enrollments remaining: ${this.classEnrollments.length}`);
    
    // Save to file for persistence
    try {
      console.log(`💾 About to save enrollments to file after removal...`);
      await this.saveEnrollmentsToFile();
      console.log(`💾 Save operation completed after removal`);
    } catch (error) {
      console.error(`❌ Error in removeEnrollment save operation:`, error);
    }
    
    return true;
  }

  async getAllEnrollments(): Promise<any[]> {
    if (!this.classEnrollments) {
      console.log(`📝 No classEnrollments array exists`);
      return [];
    }
    return this.classEnrollments;
  }
  
  // Class methods
  async getClassById(id: number): Promise<Class | undefined> {
    return this.classesStore.get(id);
  }
  
  async getClasses(options: { page: number; limit: number; search?: string; category?: string; status?: "published" | "draft" | "" }): Promise<Class[]> {
    const { page, limit, search = "", category = "", status = "" } = options;
    
    let filteredClasses = Array.from(this.classesStore.values());
    
    // Apply filters
    if (search) {
      const searchLower = search.toLowerCase();
      filteredClasses = filteredClasses.filter(classItem => 
        classItem.title.toLowerCase().includes(searchLower) || 
        classItem.description.toLowerCase().includes(searchLower)
      );
    }
    
    if (category) {
      filteredClasses = filteredClasses.filter(classItem => 
        classItem.category.toLowerCase() === category.toLowerCase()
      );
    }
    
    if (status === "published") {
      filteredClasses = filteredClasses.filter(classItem => classItem.isPublished);
    } else if (status === "draft") {
      filteredClasses = filteredClasses.filter(classItem => !classItem.isPublished);
    }
    
    // Sort by creation date (newest first)
    filteredClasses.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    
    return filteredClasses.slice(startIndex, endIndex);
  }
  
  async getClassesCount(options: { search?: string; category?: string; status?: "published" | "draft" | "" }): Promise<number> {
    const { search = "", category = "", status = "" } = options;
    
    let filteredClasses = Array.from(this.classesStore.values());
    
    // Apply filters
    if (search) {
      const searchLower = search.toLowerCase();
      filteredClasses = filteredClasses.filter(classItem => 
        classItem.title.toLowerCase().includes(searchLower) || 
        classItem.description.toLowerCase().includes(searchLower)
      );
    }
    
    if (category) {
      filteredClasses = filteredClasses.filter(classItem => 
        classItem.category.toLowerCase() === category.toLowerCase()
      );
    }
    
    if (status === "published") {
      filteredClasses = filteredClasses.filter(classItem => classItem.isPublished);
    } else if (status === "draft") {
      filteredClasses = filteredClasses.filter(classItem => !classItem.isPublished);
    }
    
    return filteredClasses.length;
  }
  
  async createClass(classData: InsertClass & { instructorId: number }): Promise<Class> {
    const id = this.classIdCounter++;
    const now = new Date();
    
    const newClass: Class = {
      ...classData,
      id,
      createdAt: now,
      updatedAt: now,
      enrollmentCount: 0
    };
    
    this.classesStore.set(id, newClass);
    return newClass;
  }
  
  async updateClass(id: number, updateData: Partial<InsertClass>): Promise<Class | undefined> {
    const classItem = this.classesStore.get(id);
    if (!classItem) return undefined;
    
    const updatedClass: Class = {
      ...classItem,
      ...updateData,
      updatedAt: new Date()
    };
    
    this.classesStore.set(id, updatedClass);
    return updatedClass;
  }
  
  async deleteClass(id: number): Promise<void> {
    this.classesStore.delete(id);
  }
  
  // Knowledge Base methods
  async getKnowledgeBase(id: number): Promise<KnowledgeBase | undefined> {
    return this.knowledgeBaseStore.get(id);
  }
  
  async getPublicKnowledgeBases(limit?: number): Promise<KnowledgeBase[]> {
    const publicKnowledgeBases = Array.from(this.knowledgeBaseStore.values())
      .filter(kb => kb.isPublic)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    return limit ? publicKnowledgeBases.slice(0, limit) : publicKnowledgeBases;
  }
  
  async getKnowledgeBasesBySubject(subject: string): Promise<KnowledgeBase[]> {
    return Array.from(this.knowledgeBaseStore.values())
      .filter(kb => kb.isPublic && kb.subject.toLowerCase() === subject.toLowerCase())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  async getKnowledgeBasesByAuthor(authorId: number): Promise<KnowledgeBase[]> {
    return Array.from(this.knowledgeBaseStore.values())
      .filter(kb => kb.authorId === authorId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  async createKnowledgeBase(knowledgeBaseData: InsertKnowledgeBase & { authorId: number }): Promise<KnowledgeBase> {
    const id = this.knowledgeBaseIdCounter++;
    const now = new Date();
    
    const newKnowledgeBase: KnowledgeBase = {
      ...knowledgeBaseData,
      id,
      createdAt: now,
      updatedAt: now,
      downloadCount: 0,
      purchasedBy: []
    };
    
    this.knowledgeBaseStore.set(id, newKnowledgeBase);
    return newKnowledgeBase;
  }
  
  async updateKnowledgeBase(id: number, updateData: Partial<KnowledgeBase>): Promise<KnowledgeBase | undefined> {
    const knowledgeBase = this.knowledgeBaseStore.get(id);
    if (!knowledgeBase) return undefined;
    
    const updatedKnowledgeBase: KnowledgeBase = {
      ...knowledgeBase,
      ...updateData,
      updatedAt: new Date()
    };
    
    this.knowledgeBaseStore.set(id, updatedKnowledgeBase);
    return updatedKnowledgeBase;
  }
  
  async incrementDownloadCount(id: number): Promise<KnowledgeBase | undefined> {
    const knowledgeBase = this.knowledgeBaseStore.get(id);
    if (!knowledgeBase) return undefined;
    
    const updatedKnowledgeBase: KnowledgeBase = {
      ...knowledgeBase,
      downloadCount: knowledgeBase.downloadCount + 1,
      updatedAt: new Date()
    };
    
    this.knowledgeBaseStore.set(id, updatedKnowledgeBase);
    return updatedKnowledgeBase;
  }
  
  async addPurchaser(id: number, userId: number): Promise<KnowledgeBase | undefined> {
    const knowledgeBase = this.knowledgeBaseStore.get(id);
    if (!knowledgeBase) return undefined;
    
    // Check if user has already purchased
    if (knowledgeBase.purchasedBy.includes(userId)) {
      return knowledgeBase;
    }
    
    const updatedKnowledgeBase: KnowledgeBase = {
      ...knowledgeBase,
      purchasedBy: [...knowledgeBase.purchasedBy, userId],
      updatedAt: new Date()
    };
    
    this.knowledgeBaseStore.set(id, updatedKnowledgeBase);
    return updatedKnowledgeBase;
  }
  
  async deleteKnowledgeBase(id: number): Promise<void> {
    this.knowledgeBaseStore.delete(id);
  }
  
  // Helper method to initialize sample knowledge bases
  private async initializeKnowledgeBases(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // First try to load from JSON file
      const kbFilePath = path.join(process.cwd(), 'data', 'knowledge-bases.json');
      
      if (fs.existsSync(kbFilePath)) {
        const data = fs.readFileSync(kbFilePath, 'utf8');
        const knowledgeBases = JSON.parse(data);
        
        for (const kb of knowledgeBases) {
          this.knowledgeBaseStore.set(kb.id, {
            ...kb,
            createdAt: new Date(kb.createdAt),
            updatedAt: new Date(kb.updatedAt)
          });
          if (kb.id >= this.knowledgeBaseIdCounter) {
            this.knowledgeBaseIdCounter = kb.id + 1;
          }
        }
        console.log(`✅ Successfully loaded ${knowledgeBases.length} knowledge bases from storage`);
        return;
      }

      // Try to load from uploads directory
      const uploadsPath = path.join(process.cwd(), 'uploads', 'knowledge-bases');
      
      if (fs.existsSync(uploadsPath)) {
        const kbDirs = fs.readdirSync(uploadsPath).filter(item => {
          return fs.statSync(path.join(uploadsPath, item)).isDirectory();
        });
        
        let loadedCount = 0;
        for (const kbId of kbDirs) {
          const kbPath = path.join(uploadsPath, kbId);
          const files = fs.readdirSync(kbPath);
          
          if (files.length > 0) {
            // Create knowledge base entry from uploaded files
            const kb: KnowledgeBase = {
              id: this.knowledgeBaseIdCounter++,
              title: kbId.includes('antoinette') ? 'Antoinette Brown Blackwell Collection' : 
                     kbId.includes('american') ? 'American Seekers Academy' : 'Uploaded Knowledge Base',
              description: `Knowledge base containing ${files.length} uploaded files`,
              subject: 'General',
              difficulty: 'All Levels',
              authorId: 2, // Super admin
              price: 0,
              files: files.map(file => ({
                url: `/uploads/knowledge-bases/${kbId}/${file}`,
                type: path.extname(file).substring(1),
                name: file
              })),
              metadata: { 
                tags: ['uploaded', 'documents'], 
                objectives: ['Access uploaded content']
              },
              isPublic: true,
              downloadCount: 0,
              purchasedBy: [],
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            this.knowledgeBaseStore.set(kb.id, kb);
            loadedCount++;
          }
        }
        
        if (loadedCount > 0) {
          console.log(`✅ Successfully loaded ${loadedCount} uploaded knowledge bases`);
          return;
        }
      }

      // Fallback to sample data if no uploads found
      this.initializeSampleKnowledgeBases();
    } catch (error) {
      console.error('Error loading knowledge bases:', error);
      this.initializeSampleKnowledgeBases();
    }
  }

  private initializeSampleKnowledgeBases(): void {
    // Sample knowledge base 1: Mathematics
    const kb1: KnowledgeBase = {
      id: this.knowledgeBaseIdCounter++,
      title: "Elementary Math Fundamentals",
      description: "A comprehensive resource covering key elementary math concepts including addition, subtraction, multiplication, division, fractions, and basic geometry.",
      subject: "Mathematics",
      difficulty: "Beginner",
      authorId: 1, // Admin user
      price: 0, // Free
      files: [{ url: "/kb/math-fundamentals.pdf", type: "pdf", name: "Math Fundamentals Guide" }],
      metadata: { 
        tags: ["math", "elementary", "arithmetic", "geometry"], 
        objectives: ["Master basic arithmetic operations", "Understand fractions", "Learn introductory geometry"]
      },
      isPublic: true,
      downloadCount: 45,
      purchasedBy: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.knowledgeBaseStore.set(kb1.id, kb1);
    
    // Sample knowledge base 2: Science
    const kb2: KnowledgeBase = {
      id: this.knowledgeBaseIdCounter++,
      title: "Introduction to Physical Science",
      description: "An overview of fundamental physical science topics including forces, motion, energy, simple machines, and basic physics concepts.",
      subject: "Science",
      difficulty: "Intermediate",
      authorId: 2, // Sarah (educator user)
      price: 0, // Free
      files: [{ url: "/kb/physical-science.pdf", type: "pdf", name: "Physical Science Handbook" }],
      metadata: { 
        tags: ["science", "physics", "energy", "forces"], 
        objectives: ["Understand Newton's laws", "Explore energy transformation", "Learn about simple machines"]
      },
      isPublic: true,
      downloadCount: 32,
      purchasedBy: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.knowledgeBaseStore.set(kb2.id, kb2);
    
    // Sample knowledge base 3: Language Arts
    const kb3: KnowledgeBase = {
      id: this.knowledgeBaseIdCounter++,
      title: "Creative Writing Techniques",
      description: "A collection of creative writing strategies, prompts, and examples to inspire and guide student writing across different genres.",
      subject: "Language Arts",
      difficulty: "Intermediate",
      authorId: 2, // Sarah (educator user)
      price: 500, // $5.00
      files: [{ url: "/kb/creative-writing.pdf", type: "pdf", name: "Creative Writing Manual" }],
      metadata: { 
        tags: ["writing", "creativity", "storytelling", "language arts"], 
        objectives: ["Develop narrative writing skills", "Build character development techniques", "Master descriptive language"]
      },
      isPublic: true,
      downloadCount: 18,
      purchasedBy: [1, 5], // Some users have purchased this
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.knowledgeBaseStore.set(kb3.id, kb3);
    
    // Sample knowledge base 4: History
    const kb4: KnowledgeBase = {
      id: this.knowledgeBaseIdCounter++,
      title: "Ancient Civilizations",
      description: "An exploration of major ancient civilizations including Egypt, Greece, Rome, China, and Mesopotamia, with timelines, key figures, and cultural highlights.",
      subject: "History",
      difficulty: "Advanced",
      authorId: 1, // Admin user
      price: 0, // Free
      files: [{ url: "/kb/ancient-civilizations.pdf", type: "pdf", name: "Ancient Civilizations Resource" }],
      metadata: { 
        tags: ["history", "ancient", "civilizations", "world history"], 
        objectives: ["Compare ancient civilizations", "Understand historical timelines", "Explore cultural achievements"]
      },
      isPublic: true,
      downloadCount: 27,
      purchasedBy: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.knowledgeBaseStore.set(kb4.id, kb4);
  }
  
  // Helper method to initialize sample events for the calendar
  private initializeSampleEvents(): void {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();
    
    // Sample event 1: Class - Today
    const event1: Event = {
      id: this.eventIdCounter++,
      title: "Introduction to Python",
      startDate: new Date(currentYear, currentMonth, currentDay, 10, 0),
      endDate: new Date(currentYear, currentMonth, currentDay, 12, 0),
      eventType: "class",
      location: "Main Campus - Room 101",
      description: "Learn the basics of Python programming language",
      organizerId: 1,
      createdAt: new Date()
    };
    this.eventsStore.set(event1.id, event1);
    
    // Sample event 2: Meeting - Tomorrow
    const event2: Event = {
      id: this.eventIdCounter++,
      title: "Parent-Teacher Conference",
      startDate: new Date(currentYear, currentMonth, currentDay + 1, 14, 0),
      endDate: new Date(currentYear, currentMonth, currentDay + 1, 15, 0),
      eventType: "meeting",
      location: "Virtual Meeting",
      description: "Discuss student progress and upcoming curriculum",
      organizerId: 1,
      createdAt: new Date()
    };
    this.eventsStore.set(event2.id, event2);
    
    // Sample event 3: Workshop - Next week
    const event3: Event = {
      id: this.eventIdCounter++,
      title: "Art & Creativity Workshop",
      startDate: new Date(currentYear, currentMonth, currentDay + 7, 13, 0),
      endDate: new Date(currentYear, currentMonth, currentDay + 7, 16, 0),
      eventType: "workshop",
      location: "Art Studio - Building B",
      description: "Explore different art techniques and creative expression",
      organizerId: 1,
      createdAt: new Date()
    };
    this.eventsStore.set(event3.id, event3);
    
    // Sample event 4: Camp - Later this month
    const event4: Event = {
      id: this.eventIdCounter++,
      title: "Summer Science Camp",
      startDate: new Date(currentYear, currentMonth, currentDay + 14, 9, 0),
      endDate: new Date(currentYear, currentMonth, currentDay + 18, 15, 0),
      eventType: "camp",
      location: "Science Center",
      description: "Five-day science exploration camp for elementary students",
      organizerId: 1,
      createdAt: new Date()
    };
    this.eventsStore.set(event4.id, event4);
    
    // Sample event 5: Other - Next month
    const event5: Event = {
      id: this.eventIdCounter++,
      title: "End of Semester Celebration",
      startDate: new Date(currentYear, currentMonth + 1, 5, 17, 0),
      endDate: new Date(currentYear, currentMonth + 1, 5, 19, 0),
      eventType: "other",
      location: "School Auditorium",
      description: "Celebration of student achievements with performances and awards",
      organizerId: 1,
      createdAt: new Date()
    };
    this.eventsStore.set(event5.id, event5);
  }
  
  // Activity methods
  async createActivity(activity: InsertActivity): Promise<Activity> {
    const id = this.activityIdCounter++;
    const now = new Date();
    
    const newActivity: Activity = {
      ...activity,
      id,
      createdAt: now,
      updatedAt: now,
      downloadCount: 0,
      isPublic: activity.isPublic || false
    };
    
    this.activitiesStore.set(id, newActivity);
    return newActivity;
  }
  
  async getActivityById(id: number, userId: number = 0): Promise<Activity | undefined> {
    const activity = this.activitiesStore.get(id);
    
    // Check if activity exists and is either public, owned by the user, or user is a guest (userId = 0)
    if (activity && (activity.isPublic || activity.authorId === userId || userId === 0)) {
      return activity;
    }
    
    return undefined;
  }
  
  async getActivitiesByAuthor(authorId: number): Promise<Activity[]> {
    const activities: Activity[] = [];
    
    for (const activity of this.activitiesStore.values()) {
      if (activity.authorId === authorId) {
        activities.push(activity);
      }
    }
    
    // Sort by most recently created
    return activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  async updateActivityDownloadCount(id: number): Promise<Activity | undefined> {
    const activity = this.activitiesStore.get(id);
    
    if (!activity) {
      return undefined;
    }
    
    const updatedActivity: Activity = {
      ...activity,
      downloadCount: activity.downloadCount + 1,
      updatedAt: new Date()
    };
    
    this.activitiesStore.set(id, updatedActivity);
    return updatedActivity;
  }
  
  async updateActivityPdfUrl(id: number, pdfUrl: string): Promise<Activity | undefined> {
    const activity = this.activitiesStore.get(id);
    
    if (!activity) {
      console.error(`Activity with ID ${id} not found for PDF URL update`);
      return undefined;
    }
    
    console.log(`Updating activity ${id} with PDF URL: ${pdfUrl}`);
    
    const updatedActivity: Activity = {
      ...activity,
      pdfUrl: pdfUrl,
      updatedAt: new Date()
    };
    
    this.activitiesStore.set(id, updatedActivity);
    console.log(`Activity ${id} successfully updated with PDF URL`);
    
    return updatedActivity;
  }

  private async initializeSampleClasses() {
    // Load classes from the actual JSON file
    try {
      const fs = await import('fs');
      const path = await import('path');
      const classesFilePath = path.join(process.cwd(), 'data', 'classes.json');
      
      if (fs.existsSync(classesFilePath)) {
        const classesData = JSON.parse(fs.readFileSync(classesFilePath, 'utf-8'));
        console.log(`🏫 Loading ${classesData.length} classes from classes.json`);
        
        classesData.forEach((classData: any) => {
          // Ensure the class has required fields and set defaults for missing ones
          const normalizedClass = {
            ...classData,
            // Set required fields with defaults if missing
            category: classData.category || 'general',
            isPublished: classData.isPublished !== false,
            status: classData.status || 'published',
            instructorId: classData.instructorId || 1,
            // Handle dates properly
            startDate: classData.startDate ? new Date(classData.startDate) : new Date(),
            endDate: classData.endDate ? new Date(classData.endDate) : new Date(),
            createdAt: classData.createdAt ? new Date(classData.createdAt) : new Date(),
            updatedAt: classData.updatedAt ? new Date(classData.updatedAt) : new Date()
          };
          
          // Add to store with existing ID
          this.classesStore.set(classData.id, normalizedClass as Class);
          
          // Update counter to be higher than max ID
          if (classData.id >= this.classIdCounter) {
            this.classIdCounter = classData.id + 1;
          }
        });
        
        console.log(`✅ Successfully loaded ${this.classesStore.size} classes into storage`);
        console.log(`📊 Available class IDs: [${Array.from(this.classesStore.keys()).join(', ')}]`);
      } else {
        console.log('⚠️ classes.json not found, using fallback sample classes');
        this.createFallbackClasses();
      }
    } catch (error) {
      console.error('❌ Error loading classes from JSON:', error);
      this.createFallbackClasses();
    }
  }

  private createFallbackClasses() {
    // Fallback sample classes only if JSON loading fails
    const sampleClasses = [
      {
        title: "Introduction to Mathematics",
        category: "mathematics",
        categoryName: "Mathematics",
        description: "A comprehensive introduction to basic mathematical concepts for beginners.",
        price: 49.99,
        startDate: new Date("2025-07-01"),
        endDate: new Date("2025-08-15"),
        instructorId: 1,
        isPublished: true,
        status: "published"
      }
    ];

    sampleClasses.forEach(classData => {
      this.createClass({
        ...classData,
        instructorId: classData.instructorId
      });
    });
  }

  private async initializeEnrollments() {
    // Load enrollments from the actual JSON file
    try {
      const fs = await import('fs');
      const path = await import('path');
      const enrollmentsFilePath = path.join(process.cwd(), 'data', 'enrollments.json');
      
      if (fs.existsSync(enrollmentsFilePath)) {
        const enrollmentsData = JSON.parse(fs.readFileSync(enrollmentsFilePath, 'utf-8'));
        console.log(`📚 Loading ${enrollmentsData.length} enrollments from enrollments.json`);
        
        this.classEnrollments = enrollmentsData.map((enrollment: any) => ({
          ...enrollment,
          enrollmentDate: enrollment.enrollmentDate ? new Date(enrollment.enrollmentDate) : new Date()
        }));
        
        console.log(`✅ Successfully loaded ${this.classEnrollments.length} enrollments into storage`);
      } else {
        console.log('📚 No enrollments.json found, starting with empty enrollments');
        this.classEnrollments = [];
      }
    } catch (error) {
      console.error('❌ Error loading enrollments from JSON:', error);
      this.classEnrollments = [];
    }
  }

  private async saveEnrollmentsToFile() {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const enrollmentsFilePath = path.join(process.cwd(), 'data', 'enrollments.json');
      
      console.log(`💾 Attempting to save ${this.classEnrollments.length} enrollments to file: ${enrollmentsFilePath}`);
      console.log(`💾 Enrollment data to save:`, JSON.stringify(this.classEnrollments, null, 2));
      
      // Ensure data directory exists
      const dataDir = path.dirname(enrollmentsFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log(`📁 Created data directory: ${dataDir}`);
      }
      
      const enrollmentData = JSON.stringify(this.classEnrollments, null, 2);
      fs.writeFileSync(enrollmentsFilePath, enrollmentData);
      console.log(`✅ Successfully saved ${this.classEnrollments.length} enrollments to enrollments.json`);
      
      // Verify the file was written
      const savedData = fs.readFileSync(enrollmentsFilePath, 'utf-8');
      console.log(`🔍 Verification - File contents: ${savedData.substring(0, 100)}...`);
    } catch (error) {
      console.error('❌ Error saving enrollments to file:', error);
      console.error('❌ Error details:', error.message);
    }
  }

  private async initializeChildren() {
    // Load children from the actual JSON file
    try {
      const fs = await import('fs');
      const path = await import('path');
      const childrenFilePath = path.join(process.cwd(), 'data', 'children.json');
      
      if (fs.existsSync(childrenFilePath)) {
        const childrenData = JSON.parse(fs.readFileSync(childrenFilePath, 'utf-8'));
        console.log(`👶 Loading ${childrenData.length} children from children.json`);
        
        childrenData.forEach((childData: any) => {
          // Ensure the child has required fields and set defaults for missing ones
          const normalizedChild = {
            ...childData,
            // Handle dates properly
            birthDate: childData.birthDate ? new Date(childData.birthDate) : new Date(),
            createdAt: childData.createdAt ? new Date(childData.createdAt) : new Date(),
            updatedAt: childData.updatedAt ? new Date(childData.updatedAt) : new Date()
          };
          
          // Add to store with existing ID
          this.childrenStore.set(childData.id, normalizedChild as Child);
          
          // Update counter to be higher than max ID
          if (childData.id >= this.childIdCounter) {
            this.childIdCounter = childData.id + 1;
          }
        });
        
        console.log(`✅ Successfully loaded ${this.childrenStore.size} children into storage`);
        console.log(`👶 Available child IDs: [${Array.from(this.childrenStore.keys()).join(', ')}]`);
      } else {
        console.log('⚠️ children.json not found, no children loaded into storage');
      }
    } catch (error) {
      console.error('❌ Error loading children from JSON:', error);
    }
  }

  // Marketing Links Methods
  async createMarketingLink(data: InsertMarketingLink): Promise<MarketingLink> {
    const id = this.marketingLinkIdCounter++;
    const now = new Date();
    const marketingLink: MarketingLink = {
      id,
      createdAt: now,
      updatedAt: now,
      ...data
    };
    this.marketingLinksStore.set(id, marketingLink);
    return marketingLink;
  }

  async getMarketingLinkById(id: number): Promise<MarketingLink | undefined> {
    return this.marketingLinksStore.get(id);
  }

  async getMarketingLinkByCampaignId(campaignId: string): Promise<MarketingLink | undefined> {
    for (const link of this.marketingLinksStore.values()) {
      if (link.campaignId === campaignId) {
        return link;
      }
    }
    return undefined;
  }

  async getMarketingLinksBySchoolId(schoolId: number): Promise<MarketingLink[]> {
    return Array.from(this.marketingLinksStore.values()).filter(
      link => link.schoolId === schoolId
    );
  }

  async updateMarketingLink(id: number, data: Partial<InsertMarketingLink>): Promise<MarketingLink | undefined> {
    const existing = this.marketingLinksStore.get(id);
    if (!existing) return undefined;

    const updated: MarketingLink = {
      ...existing,
      ...data,
      updatedAt: new Date()
    };
    this.marketingLinksStore.set(id, updated);
    return updated;
  }

  async deleteMarketingLink(id: number): Promise<boolean> {
    return this.marketingLinksStore.delete(id);
  }

  async createLinkAnalytics(data: InsertLinkAnalytics): Promise<LinkAnalytics> {
    const id = this.linkAnalyticsIdCounter++;
    const analytics: LinkAnalytics = {
      id,
      timestamp: new Date(),
      ...data
    };
    this.linkAnalyticsStore.set(id, analytics);
    return analytics;
  }

  async incrementLinkClick(linkId: number): Promise<void> {
    await this.createLinkAnalytics({
      linkId,
      event: 'click',
      ipAddress: null,
      userAgent: null,
      referrer: null
    });
  }

  async incrementLinkConversion(linkId: number): Promise<void> {
    await this.createLinkAnalytics({
      linkId,
      event: 'conversion',
      ipAddress: null,
      userAgent: null,
      referrer: null
    });
  }

  async getLinkAnalytics(linkId: number): Promise<LinkAnalytics[]> {
    return Array.from(this.linkAnalyticsStore.values()).filter(
      analytics => analytics.linkId === linkId
    );
  }
}

import { DatabaseStorage } from "./dbStorage";
import { supabaseStorage } from './supabase-storage';

// Use the MemStorage implementation for classes functionality
export const storage = new MemStorage();
