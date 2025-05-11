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
  classes, type Class, type InsertClass
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
  getKnowledgeBasesBySubject(subject: string): Promise<KnowledgeBase[]>;
  getPublicKnowledgeBases(limit?: number): Promise<KnowledgeBase[]>;
  createKnowledgeBase(knowledgeBase: InsertKnowledgeBase): Promise<KnowledgeBase>;
  updateKnowledgeBase(id: number, knowledgeBase: Partial<InsertKnowledgeBase>): Promise<KnowledgeBase | undefined>;
  incrementDownloadCount(id: number): Promise<KnowledgeBase | undefined>;
  addPurchaser(id: number, userId: number): Promise<KnowledgeBase | undefined>;
  
  // Child methods
  getChildById(id: number): Promise<Child | undefined>;
  getChildrenByParentId(parentId: number): Promise<Child[]>;
  createChild(child: InsertChild & { parentId: number }): Promise<Child>;
  updateChild(id: number, child: Partial<InsertChild>): Promise<Child | undefined>;
  deleteChild(id: number): Promise<void>;
  
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
  
  // Class methods
  getClassById(id: number): Promise<Class | undefined>;
  getClasses(options: { page: number; limit: number; search?: string; category?: string; status?: "published" | "draft" | "" }): Promise<Class[]>;
  getClassesCount(options: { search?: string; category?: string; status?: "published" | "draft" | "" }): Promise<number>;
  createClass(classData: InsertClass & { instructorId: number }): Promise<Class>;
  updateClass(id: number, classData: Partial<InsertClass>): Promise<Class | undefined>;
  deleteClass(id: number): Promise<void>;
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
      programs = programs.filter(program => program.gradeLevel === gradeLevel);
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
}

export const storage = new MemStorage();
