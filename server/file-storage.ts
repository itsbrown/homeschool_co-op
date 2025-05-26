import { IStorage } from './storage';
import { 
  User, InsertUser, 
  Curriculum, InsertCurriculum, 
  Lesson, InsertLesson, 
  Event, InsertEvent, 
  MarketplaceItem, InsertMarketplaceItem,
  KnowledgeBase, InsertKnowledgeBase,
  Child, InsertChild,
  EmergencyContact, InsertEmergencyContact,
  Program, InsertProgram,
  ProgramEnrollment, InsertProgramEnrollment,
  Class, InsertClass,
  Activity, InsertActivity
} from '@shared/schema';
import * as fileDb from './file-db';
import { userStorage } from './users-storage';

// Validation error class
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Validation utilities
const validateId = (id: number) => {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Invalid ID: must be a positive integer');
  }
};

const validateEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }
};

const validateString = (value: string, field: string, maxLength = 255) => {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${field} is required`);
  }
  if (value.length > maxLength) {
    throw new ValidationError(`${field} must be less than ${maxLength} characters`);
  }
};

const validateDate = (date: Date) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new ValidationError('Invalid date');
  }
};

export class FileStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    validateId(id);
    return userStorage.getUserById(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    validateString(username, 'Username');
    return userStorage.getUserByUsername(username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    validateEmail(email);
    return userStorage.getUserByEmail(email);
  }

  async createUser(user: InsertUser): Promise<User> {
    validateString(user.username, 'Username');
    validateEmail(user.email);
    validateString(user.password, 'Password', 72);
    validateString(user.name, 'Name');
    if (user.avatar) validateString(user.avatar, 'Avatar URL');
    return userStorage.createUser(user);
  }

  // Curriculum methods  
  async getCurriculum(id: number): Promise<Curriculum | undefined> {
    validateId(id);
    return fileDb.getCurriculum(id);
  }

  async getCurriculaByAuthor(authorId: number): Promise<Curriculum[]> {
    validateId(authorId);
    return fileDb.getCurriculaByAuthor(authorId);
  }

  async createCurriculum(curriculum: InsertCurriculum): Promise<Curriculum> {
    validateString(curriculum.title, 'Title');
    validateString(curriculum.subject, 'Subject');
    validateString(curriculum.gradeLevel, 'Grade Level');
    if (curriculum.description) validateString(curriculum.description, 'Description', 1000);
    return fileDb.createCurriculum(curriculum);
  }

  async updateCurriculum(id: number, curriculum: Partial<InsertCurriculum>): Promise<Curriculum | undefined> {
    validateId(id);
    if (curriculum.title) validateString(curriculum.title, 'Title');
    if (curriculum.subject) validateString(curriculum.subject, 'Subject');
    if (curriculum.gradeLevel) validateString(curriculum.gradeLevel, 'Grade Level');
    if (curriculum.description) validateString(curriculum.description, 'Description', 1000);
    return fileDb.updateCurriculum(id, curriculum);
  }

  // Lesson methods
  async getLesson(id: number): Promise<Lesson | undefined> {
    return fileDb.getLesson(id);
  }

  async getLessonsByCurriculum(curriculumId: number): Promise<Lesson[]> {
    return fileDb.getLessonsByCurriculum(curriculumId);
  }

  async getLessonsByAuthor(authorId: number): Promise<Lesson[]> {
    return fileDb.getLessonsByAuthor(authorId);
  }

  async createLesson(lesson: InsertLesson): Promise<Lesson> {
    return fileDb.createLesson(lesson);
  }

  async updateLesson(id: number, lesson: Partial<InsertLesson>): Promise<Lesson | undefined> {
    return fileDb.updateLesson(id, lesson);
  }

  // Event methods
  async getEvent(id: number): Promise<Event | undefined> {
    return fileDb.getEvent(id);
  }

  async getEventsByOrganizer(organizerId: number): Promise<Event[]> {
    return fileDb.getEventsByOrganizer(organizerId);
  }

  async getUpcomingEvents(userId: number): Promise<Event[]> {
    return fileDb.getUpcomingEvents(userId);
  }

  async getAllEvents(userId: number): Promise<Event[]> {
    return fileDb.getAllEvents(userId);
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    return fileDb.createEvent(event);
  }

  // Marketplace methods
  async getMarketplaceItem(id: number): Promise<MarketplaceItem | undefined> {
    return fileDb.getMarketplaceItem(id);
  }

  async getMarketplaceItemsBySeller(sellerId: number): Promise<MarketplaceItem[]> {
    return fileDb.getMarketplaceItemsBySeller(sellerId);
  }

  async getTopSellingItems(limit: number): Promise<MarketplaceItem[]> {
    return fileDb.getTopSellingItems(limit);
  }

  async createMarketplaceItem(item: InsertMarketplaceItem): Promise<MarketplaceItem> {
    return fileDb.createMarketplaceItem(item);
  }

  async updateMarketplaceItemStats(id: number, sales: number, revenue: number): Promise<MarketplaceItem | undefined> {
    return fileDb.updateMarketplaceItemStats(id, sales, revenue);
  }

  // Knowledge Base methods
  async getKnowledgeBase(id: number): Promise<KnowledgeBase | undefined> {
    return fileDb.getKnowledgeBase(id);
  }

  async getKnowledgeBaseById(id: number, userId: number): Promise<KnowledgeBase | undefined> {
    return fileDb.getKnowledgeBaseById(id, userId);
  }

  async getKnowledgeBasesByAuthor(authorId: number): Promise<KnowledgeBase[]> {
    return fileDb.getKnowledgeBasesByAuthor(authorId);
  }

  async getKnowledgeBasesBySubject(subject: string): Promise<KnowledgeBase[]> {
    return fileDb.getKnowledgeBasesBySubject(subject);
  }

  async getPublicKnowledgeBases(limit?: number): Promise<KnowledgeBase[]> {
    return fileDb.getPublicKnowledgeBases(limit);
  }

  async createKnowledgeBase(knowledgeBase: InsertKnowledgeBase): Promise<KnowledgeBase> {
    return fileDb.createKnowledgeBase(knowledgeBase);
  }

  async updateKnowledgeBase(id: number, knowledgeBase: Partial<InsertKnowledgeBase>): Promise<KnowledgeBase | undefined> {
    return fileDb.updateKnowledgeBase(id, knowledgeBase);
  }

  async incrementDownloadCount(id: number): Promise<KnowledgeBase | undefined> {
    return fileDb.incrementDownloadCount(id);
  }

  async addPurchaser(id: number, userId: number): Promise<KnowledgeBase | undefined> {
    return fileDb.addPurchaser(id, userId);
  }

  // Activity methods
  async getActivityById(id: number, userId: number): Promise<Activity | undefined> {
    return fileDb.getActivityById(id, userId);
  }

  async getActivitiesByAuthor(authorId: number): Promise<Activity[]> {
    return fileDb.getActivitiesByAuthor(authorId);
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    return fileDb.createActivity(activity);
  }

  async updateActivityDownloadCount(id: number): Promise<Activity | undefined> {
    return fileDb.updateActivityDownloadCount(id);
  }

  async updateActivityPdfUrl(id: number, pdfUrl: string): Promise<Activity | undefined> {
    return fileDb.updateActivityPdfUrl(id, pdfUrl);
  }

  // Child methods - using in-memory storage since fileDb doesn't have child functions
  async getChildById(id: number): Promise<Child | undefined> {
    // Simple in-memory implementation
    const children = this.loadChildren();
    return children.find(child => child.id === id);
  }

  async getChildrenByParentId(parentId: number): Promise<Child[]> {
    const children = this.loadChildren();
    return children.filter(child => child.parentId === parentId);
  }

  async createChild(child: InsertChild & { parentId: number }): Promise<Child> {
    const children = this.loadChildren();
    const id = children.length > 0 ? Math.max(...children.map(c => c.id)) + 1 : 1;
    const now = new Date();
    
    const newChild: Child = {
      ...child,
      id,
      createdAt: now,
      updatedAt: now
    };
    
    children.push(newChild);
    this.saveChildren(children);
    return newChild;
  }

  async updateChild(id: number, child: Partial<InsertChild>): Promise<Child | undefined> {
    const children = this.loadChildren();
    const index = children.findIndex(c => c.id === id);
    
    if (index === -1) return undefined;
    
    children[index] = {
      ...children[index],
      ...child,
      updatedAt: new Date()
    };
    
    this.saveChildren(children);
    return children[index];
  }

  async deleteChild(id: number): Promise<void> {
    const children = this.loadChildren();
    const filtered = children.filter(child => child.id !== id);
    this.saveChildren(filtered);
  }

  private loadChildren(): Child[] {
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '../data/children.json');
      
      if (!fs.existsSync(filePath)) {
        return [];
      }
      
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading children:', error);
      return [];
    }
  }

  private saveChildren(children: Child[]): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const dataDir = path.join(__dirname, '../data');
      const filePath = path.join(dataDir, 'children.json');
      
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, JSON.stringify(children, null, 2));
    } catch (error) {
      console.error('Error saving children:', error);
    }
  }

  // Emergency Contact methods
  async getEmergencyContactById(id: number): Promise<EmergencyContact | undefined> {
    return fileDb.getEmergencyContactById(id);
  }

  async getEmergencyContactsByUserId(userId: number): Promise<EmergencyContact[]> {
    return fileDb.getEmergencyContactsByUserId(userId);
  }

  async createEmergencyContact(contact: InsertEmergencyContact & { userId: number }): Promise<EmergencyContact> {
    return fileDb.createEmergencyContact(contact);
  }

  async updateEmergencyContact(id: number, contact: Partial<InsertEmergencyContact>): Promise<EmergencyContact | undefined> {
    return fileDb.updateEmergencyContact(id, contact);
  }

  async deleteEmergencyContact(id: number): Promise<void> {
    await fileDb.deleteEmergencyContact(id);
  }

  // Program methods
  async getProgramById(id: number): Promise<Program | undefined> {
    return fileDb.getProgramById(id);
  }

  async getPublishedPrograms(category?: string, gradeLevel?: string): Promise<Program[]> {
    return fileDb.getPublishedPrograms(category, gradeLevel);
  }

  async getProgramsByInstructorId(instructorId: number): Promise<Program[]> {
    return fileDb.getProgramsByInstructorId(instructorId);
  }

  async createProgram(program: InsertProgram & { instructorId: number }): Promise<Program> {
    return fileDb.createProgram(program);
  }

  async updateProgram(id: number, program: Partial<InsertProgram>): Promise<Program | undefined> {
    return fileDb.updateProgram(id, program);
  }

  async deleteProgram(id: number): Promise<void> {
    await fileDb.deleteProgram(id);
  }

  // Program Enrollment methods
  async getProgramEnrollmentById(id: number): Promise<ProgramEnrollment | undefined> {
    return fileDb.getProgramEnrollmentById(id);
  }

  async getEnrollmentsByChildIds(childIds: number[]): Promise<ProgramEnrollment[]> {
    return fileDb.getEnrollmentsByChildIds(childIds);
  }

  async getEnrollmentsByProgramId(programId: number): Promise<ProgramEnrollment[]> {
    return fileDb.getEnrollmentsByProgramId(programId);
  }

  async getEnrollmentCountForProgram(programId: number): Promise<number> {
    return fileDb.getEnrollmentCountForProgram(programId);
  }

  async createProgramEnrollment(enrollment: InsertProgramEnrollment): Promise<ProgramEnrollment> {
    return fileDb.createProgramEnrollment(enrollment);
  }

  async updateProgramEnrollment(id: number, enrollment: Partial<InsertProgramEnrollment>): Promise<ProgramEnrollment | undefined> {
    return fileDb.updateProgramEnrollment(id, enrollment);
  }

  async deleteProgramEnrollment(id: number): Promise<void> {
    await fileDb.deleteProgramEnrollment(id);
  }

  // Class methods - already implemented
  async getClassById(id: number): Promise<Class | undefined> {
    return fileDb.getClassById(id);
  }

  async getClasses(options: { page: number; limit: number; search?: string; category?: string; status?: string }): Promise<Class[]> {
    const { page, limit, search, category, status } = options;
    const offset = (page - 1) * limit;
    return fileDb.getClasses({
      limit,
      offset,
      search,
      category,
      status
    });
  }

  async getClassesCount(options: { search?: string; category?: string; status?: string }): Promise<number> {
    return fileDb.getClassesCount(options);
  }

  async createClass(classData: InsertClass & { instructorId: number }): Promise<Class> {
    return fileDb.createClass(classData);
  }

  async updateClass(id: number, classData: Partial<InsertClass>): Promise<Class | undefined> {
    return fileDb.updateClass(id, classData);
  }

  async deleteClass(id: number): Promise<void> {
    await fileDb.deleteClass(id);
  }
  
  async getAllKnowledgeBases(): Promise<KnowledgeBase[]> {
    return fileDb.getAllKnowledgeBases();
  }

  async getAllActivities(): Promise<Activity[]> {
    return fileDb.getAllActivities();
  }

  async getAllPayments(): Promise<Payment[]> {
    return fileDb.getAllPayments();
  }

  async getAllEnrollments(): Promise<ProgramEnrollment[]> {
    return fileDb.getAllEnrollments();
  }
}