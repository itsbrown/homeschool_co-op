import { eq, and, desc, asc, like, or, sql } from 'drizzle-orm';
import { getDb } from './db';
import { IStorage } from './storage';
import {
  User, InsertUser, users,
  Class, InsertClass, classes,
  KnowledgeBase, InsertKnowledgeBase, knowledgeBases,
  Curriculum, InsertCurriculum, curricula,
  Activity, InsertActivity, activities,
  Lesson, InsertLesson, lessons,
  Program, InsertProgram, programs,
  ProgramEnrollment, InsertProgramEnrollment, programEnrollments,
  MembershipEnrollment, InsertMembershipEnrollment, membershipEnrollments,
  StripeSubscriptionSchedule, InsertStripeSubscriptionSchedule, stripeSubscriptionSchedules,
  DailyFlowTemplate, InsertDailyFlowTemplate, dailyFlowTemplates,
  DailyFlowEntry, InsertDailyFlowEntry, dailyFlowEntries,
  DailyFlowSchedule, InsertDailyFlowSchedule, dailyFlowSchedules,
  MarketingLink, InsertMarketingLink, marketingLinks,
  Child, InsertChild, children,
  EmergencyContact, InsertEmergencyContact, emergencyContacts,
  Event, InsertEvent, events,
  MarketplaceItem, InsertMarketplaceItem, marketplaceItems,
  School, InsertSchool, schools,
  SchoolStudent, InsertSchoolStudent, schoolStudents,
  SchoolStaff, InsertSchoolStaff, schoolStaff,
  Payment, InsertPayment, payments,
  ScheduledPayment, InsertScheduledPayment, scheduledPayments,
  Refund, InsertRefund, refunds,
  Location, InsertLocation, locations,
  UserLocation, InsertUserLocation, userLocations,
  MarketplaceClassEnrollment, InsertMarketplaceClassEnrollment, marketplaceClassEnrollments
} from '../shared/schema';

/**
 * DatabaseStorage - Implements IStorage using PostgreSQL and Drizzle ORM
 */
export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const db = await getDb();
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async getAllUsers(): Promise<User[]> {
    const db = await getDb();
    return await db.select().from(users);
  }

  async updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined> {
    const db = await getDb();
    const [updatedUser] = await db
      .update(users)
      .set(user)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async deleteUser(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(users).where(eq(users.id, id));
  }

  // School methods
  async getSchool(id: number): Promise<School | undefined> {
    const db = await getDb();
    const [school] = await db.select().from(schools).where(eq(schools.id, id));
    return school;
  }

  async getSchoolByCode(registrationCode: string): Promise<School | undefined> {
    const db = await getDb();
    const [school] = await db.select().from(schools).where(eq(schools.registrationCode, registrationCode));
    return school;
  }

  async getAllSchools(): Promise<School[]> {
    const db = await getDb();
    return await db.select().from(schools);
  }

  async createSchool(schoolData: InsertSchool & { adminId: number }): Promise<School> {
    const db = await getDb();
    const [newSchool] = await db.insert(schools).values({
      ...schoolData,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newSchool;
  }

  async updateSchool(id: number, schoolData: Partial<InsertSchool>): Promise<School | undefined> {
    const db = await getDb();
    const [updatedSchool] = await db
      .update(schools)
      .set({
        ...schoolData,
        updatedAt: new Date()
      })
      .where(eq(schools.id, id))
      .returning();
    return updatedSchool;
  }

  // School Student methods
  async createSchoolStudent(schoolStudent: InsertSchoolStudent): Promise<SchoolStudent> {
    const db = await getDb();
    const [newSchoolStudent] = await db.insert(schoolStudents).values({
      ...schoolStudent,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newSchoolStudent;
  }

  async updateSchoolStudent(id: number, schoolStudent: Partial<InsertSchoolStudent>): Promise<SchoolStudent | undefined> {
    const db = await getDb();
    const [updatedSchoolStudent] = await db
      .update(schoolStudents)
      .set({
        ...schoolStudent,
        updatedAt: new Date()
      })
      .where(eq(schoolStudents.id, id))
      .returning();
    return updatedSchoolStudent;
  }

  async deleteSchoolStudent(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(schoolStudents).where(eq(schoolStudents.id, id));
  }

  async getSchoolStudentsBySchoolId(schoolId: number): Promise<SchoolStudent[]> {
    const db = await getDb();
    return await db.select().from(schoolStudents).where(eq(schoolStudents.schoolId, schoolId));
  }

  async getSchoolStudentsByChildId(childId: number): Promise<SchoolStudent[]> {
    const db = await getDb();
    return await db.select().from(schoolStudents).where(eq(schoolStudents.childId, childId));
  }

  // Curriculum methods
  async getCurriculum(id: number): Promise<Curriculum | undefined> {
    const db = await getDb();
    const [curriculum] = await db.select().from(curricula).where(eq(curricula.id, id));
    return curriculum;
  }

  async getCurriculaByAuthor(authorId: number): Promise<Curriculum[]> {
    const db = await getDb();
    return await db.select().from(curricula).where(eq(curricula.authorId, authorId));
  }

  async createCurriculum(curriculum: InsertCurriculum): Promise<Curriculum> {
    const db = await getDb();
    const [newCurriculum] = await db.insert(curricula).values(curriculum).returning();
    return newCurriculum;
  }

  async updateCurriculum(id: number, curriculum: Partial<InsertCurriculum>): Promise<Curriculum | undefined> {
    const db = await getDb();
    const [updatedCurriculum] = await db
      .update(curricula)
      .set(curriculum)
      .where(eq(curricula.id, id))
      .returning();
    return updatedCurriculum;
  }

  // Class methods
  async getClassById(id: number): Promise<Class | undefined> {
    const db = await getDb();
    const [cls] = await db.select().from(classes).where(eq(classes.id, id));
    return cls;
  }

  async getClassesByInstructor(instructorId: number): Promise<Class[]> {
    const db = await getDb();
    return await db.select().from(classes).where(eq(classes.instructorId, instructorId));
  }

  async getClasses(options: { 
    limit?: number; 
    offset?: number; 
    search?: string;
    category?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<Class[]> {
    const db = await getDb();
    let query = db.select().from(classes);

    // Apply search filter
    if (options.search) {
      query = query.where(
        or(
          like(classes.title, `%${options.search}%`),
          like(classes.description, `%${options.search}%`)
        )
      );
    }

    // Apply category filter
    if (options.category) {
      query = query.where(eq(classes.category, options.category));
    }

    // Apply sorting
    if (options.sortBy) {
      const sortColumn = classes[options.sortBy as keyof typeof classes] || classes.createdAt;
      query = query.orderBy(
        options.sortOrder === 'asc' 
          ? asc(sortColumn) 
          : desc(sortColumn)
      );
    } else {
      // Default sort by createdAt desc
      query = query.orderBy(desc(classes.createdAt));
    }

    // Apply pagination
    if (options.limit) {
      query = query.limit(options.limit);
      if (options.offset) {
        query = query.offset(options.offset);
      }
    }

    return await query;
  }

  async getClassesCount(options: { 
    search?: string;
    category?: string;
  }): Promise<number> {
    const db = await getDb();
    let query = db.select({ count: sql`count(*)` }).from(classes);

    // Apply search filter
    if (options.search) {
      query = query.where(
        or(
          like(classes.title, `%${options.search}%`),
          like(classes.description, `%${options.search}%`)
        )
      );
    }

    // Apply category filter
    if (options.category) {
      query = query.where(eq(classes.category, options.category));
    }

    const result = await query;
    return Number(result[0]?.count || 0);
  }

  async createClass(classData: InsertClass & { instructorId: number }): Promise<Class> {
    const db = await getDb();
    const [newClass] = await db.insert(classes).values({
      ...classData,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newClass;
  }

  async updateClass(id: number, classData: Partial<InsertClass>): Promise<Class | undefined> {
    const db = await getDb();
    const [updatedClass] = await db
      .update(classes)
      .set({
        ...classData,
        updatedAt: new Date()
      })
      .where(eq(classes.id, id))
      .returning();
    return updatedClass;
  }

  async deleteClass(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(classes).where(eq(classes.id, id));
  }

  async incrementClassEnrollment(id: number): Promise<Class | undefined> {
    const db = await getDb();
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

  async getAllClasses(): Promise<Class[]> {
    const db = await getDb();
    return await db.select().from(classes);
  }

  async getClassesBySchoolId(schoolId: string): Promise<Class[]> {
    const db = await getDb();
    const schoolIdNum = parseInt(schoolId, 10);
    if (isNaN(schoolIdNum)) {
      return [];
    }
    return await db.select().from(classes).where(eq(classes.schoolId, schoolIdNum));
  }

  // Knowledge Base methods
  async getKnowledgeBase(id: number): Promise<KnowledgeBase | undefined> {
    const db = await getDb();
    const [knowledgeBase] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id));
    return knowledgeBase;
  }

  async getKnowledgeBaseByTitle(title: string): Promise<KnowledgeBase | undefined> {
    const db = await getDb();
    const [knowledgeBase] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.title, title));
    return knowledgeBase;
  }

  async getKnowledgeBasesByAuthor(authorId: number): Promise<KnowledgeBase[]> {
    const db = await getDb();
    return await db.select().from(knowledgeBases).where(eq(knowledgeBases.authorId, authorId));
  }

  async getKnowledgeBasesBySubject(subject: string): Promise<KnowledgeBase[]> {
    const db = await getDb();
    return await db.select().from(knowledgeBases).where(eq(knowledgeBases.subject, subject));
  }

  async getPublicKnowledgeBases(limit?: number): Promise<KnowledgeBase[]> {
    const db = await getDb();
    let query = db.select().from(knowledgeBases).where(eq(knowledgeBases.isPublic, true));

    if (limit) {
      query = query.limit(limit);
    }

    return await query;
  }

  async createKnowledgeBase(insertKnowledgeBase: InsertKnowledgeBase): Promise<KnowledgeBase> {
    const db = await getDb();
    const [knowledgeBase] = await db
      .insert(knowledgeBases)
      .values({
        ...insertKnowledgeBase,
        downloadCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return knowledgeBase;
  }

  async updateKnowledgeBase(id: number, updateData: Partial<InsertKnowledgeBase>): Promise<KnowledgeBase | undefined> {
    const db = await getDb();
    const [updatedKnowledgeBase] = await db
      .update(knowledgeBases)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(knowledgeBases.id, id))
      .returning();
    return updatedKnowledgeBase;
  }

  async incrementDownloadCount(id: number): Promise<KnowledgeBase | undefined> {
    const db = await getDb();
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

  async getAllKnowledgeBases(): Promise<KnowledgeBase[]> {
    try {
      if (!this.db) {
        console.log("Database connection not available, returning empty knowledge bases array");
        return [];
      }
      const result = await this.db.select().from(knowledgeBases);
      return result;
    } catch (error) {
      console.error("Error fetching all knowledge bases from database:", error);
      return [];
    }
  }

  async getAllActivities(): Promise<Activity[]> {
    try {
      if (!this.db) {
        console.log("Database connection not available, returning empty activities array");
        return [];
      }
      const result = await this.db.select().from(activities);
      return result;
    } catch (error) {
      console.error("Error fetching all activities from database:", error);
      return [];
    }
  }

  async getAllEnrollments(): Promise<ProgramEnrollment[]> {
    try {
      if (!this.db) {
        console.log("Database connection not available, returning empty enrollments array");
        return [];
      }
      const result = await this.db.select().from(programEnrollments);
      return result;
    } catch (error) {
      console.error("Error fetching all enrollments from database:", error);
      return [];
    }
  }

  // Program methods
  async getProgram(id: number): Promise<Program | undefined> {
    const db = await getDb();
    const [program] = await db.select().from(programs).where(eq(programs.id, id));
    return program;
  }

  async getProgramsByOrganizer(organizerId: number): Promise<Program[]> {
    const db = await getDb();
    return await db.select().from(programs).where(eq(programs.organizerId, organizerId));
  }

  async createProgram(program: InsertProgram): Promise<Program> {
    const db = await getDb();
    const [newProgram] = await db
      .insert(programs)
      .values({
        ...program,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newProgram;
  }

  async updateProgram(id: number, program: Partial<InsertProgram>): Promise<Program | undefined> {
    const db = await getDb();
    const [updatedProgram] = await db
      .update(programs)
      .set({
        ...program,
        updatedAt: new Date()
      })
      .where(eq(programs.id, id))
      .returning();
    return updatedProgram;
  }

  async deleteProgram(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(programs).where(eq(programs.id, id));
  }

  // Program Enrollment methods
  async getProgramEnrollment(id: number): Promise<ProgramEnrollment | undefined> {
    try {
      const db = await getDb();
      const [enrollment] = await db.select().from(programEnrollments).where(eq(programEnrollments.id, id));
      return enrollment;
    } catch (error: any) {
      // Handle case where ID is too large for database integer type (e.g., timestamp-based IDs from file storage)
      if (error?.code === '22003') { // PostgreSQL numeric value out of range error
        console.log(`📝 Enrollment ID ${id} too large for database integer type, skipping database lookup`);
        return undefined;
      }
      throw error;
    }
  }

  async getProgramEnrollmentsByParent(parentId: number): Promise<ProgramEnrollment[]> {
    const db = await getDb();
    return await db.select().from(programEnrollments).where(eq(programEnrollments.parentId, parentId));
  }

  async getProgramEnrollmentsByProgram(programId: number): Promise<ProgramEnrollment[]> {
    const db = await getDb();
    return await db.select().from(programEnrollments).where(eq(programEnrollments.programId, programId));
  }

  async createProgramEnrollment(enrollment: InsertProgramEnrollment): Promise<ProgramEnrollment> {
    const db = await getDb();
    const [newEnrollment] = await db
      .insert(programEnrollments)
      .values({
        ...enrollment,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newEnrollment;
  }

  async updateProgramEnrollment(id: number, enrollment: Partial<InsertProgramEnrollment>): Promise<ProgramEnrollment | undefined> {
    const db = await getDb();
    const [updatedEnrollment] = await db
      .update(programEnrollments)
      .set({
        ...enrollment,
        updatedAt: new Date()
      })
      .where(eq(programEnrollments.id, id))
      .returning();
    return updatedEnrollment;
  }

  async deleteProgramEnrollment(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(programEnrollments).where(eq(programEnrollments.id, id));
  }

  // Membership Enrollment methods
  async getMembershipEnrollmentById(id: number): Promise<MembershipEnrollment | undefined> {
    const db = await getDb();
    const [enrollment] = await db.select().from(membershipEnrollments).where(eq(membershipEnrollments.id, id));
    return enrollment;
  }

  async getMembershipEnrollmentsByParentId(parentUserId: number): Promise<MembershipEnrollment[]> {
    const db = await getDb();
    return await db.select().from(membershipEnrollments).where(eq(membershipEnrollments.parentUserId, parentUserId));
  }

  async getMembershipEnrollmentsBySchoolId(schoolId: number): Promise<MembershipEnrollment[]> {
    const db = await getDb();
    return await db.select().from(membershipEnrollments).where(eq(membershipEnrollments.schoolId, schoolId));
  }

  async getMembershipEnrollmentByParentAndSchoolAndYear(parentUserId: number, schoolId: number, membershipYear: number): Promise<MembershipEnrollment | undefined> {
    const db = await getDb();
    const [enrollment] = await db
      .select()
      .from(membershipEnrollments)
      .where(
        and(
          eq(membershipEnrollments.parentUserId, parentUserId),
          eq(membershipEnrollments.schoolId, schoolId),
          eq(membershipEnrollments.membershipYear, membershipYear)
        )
      );
    return enrollment;
  }

  async createMembershipEnrollment(enrollmentData: InsertMembershipEnrollment): Promise<MembershipEnrollment> {
    const db = await getDb();
    const [newEnrollment] = await db
      .insert(membershipEnrollments)
      .values({
        ...enrollmentData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newEnrollment;
  }

  async updateMembershipEnrollment(id: number, updateData: Partial<InsertMembershipEnrollment>): Promise<MembershipEnrollment | undefined> {
    const db = await getDb();
    const [updatedEnrollment] = await db
      .update(membershipEnrollments)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(membershipEnrollments.id, id))
      .returning();
    return updatedEnrollment;
  }

  async deleteMembershipEnrollment(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(membershipEnrollments).where(eq(membershipEnrollments.id, id));
  }

  async createOrUpdateMembershipEnrollment(parentUserId: number, schoolId: number, membershipYear: number): Promise<MembershipEnrollment> {
    const existing = await this.getMembershipEnrollmentByParentAndSchoolAndYear(parentUserId, schoolId, membershipYear);
    
    if (existing) {
      return existing;
    }

    const enrollmentData: InsertMembershipEnrollment = {
      schoolId,
      parentUserId,
      membershipYear,
      amount: 6000, // $60 in cents
      amountPaid: 0,
      remainingBalance: 6000,
      status: 'pending_payment',
      dueDate: new Date(),
      expirationDate: new Date(membershipYear, 11, 31)
    };

    return this.createMembershipEnrollment(enrollmentData);
  }

  // Child methods
  async getChild(id: number): Promise<Child | undefined> {
    const db = await getDb();
    const [child] = await db.select().from(children).where(eq(children.id, id));
    return child;
  }

  async getChildrenByParent(parentId: number): Promise<Child[]> {
    const db = await getDb();
    return await db.select().from(children).where(eq(children.parentId, parentId));
  }

  async createChild(child: InsertChild): Promise<Child> {
    const db = await getDb();
    const [newChild] = await db
      .insert(children)
      .values({
        ...child,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newChild;
  }

  async updateChild(id: number, child: Partial<InsertChild>): Promise<Child | undefined> {
    const db = await getDb();
    const [updatedChild] = await db
      .update(children)
      .set({
        ...child,
        updatedAt: new Date()
      })
      .where(eq(children.id, id))
      .returning();
    return updatedChild;
  }

  async deleteChild(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(children).where(eq(children.id, id));
  }

  async getAllChildren(): Promise<Child[]> {
    const db = await getDb();
    return await db.select().from(children);
  }

  async getChildrenByParentEmail(parentEmail: string): Promise<Child[]> {
    const db = await getDb();
    // First, find the parent user by email
    const [parent] = await db.select().from(users).where(eq(users.email, parentEmail));
    if (!parent) return [];
    
    // Then get children by parent ID
    return await db.select().from(children).where(eq(children.parentId, parent.id));
  }

  // Emergency Contact methods
  async getEmergencyContact(id: number): Promise<EmergencyContact | undefined> {
    const db = await getDb();
    const [contact] = await db.select().from(emergencyContacts).where(eq(emergencyContacts.id, id));
    return contact;
  }

  async getEmergencyContactsByParent(parentId: number): Promise<EmergencyContact[]> {
    const db = await getDb();
    return await db.select().from(emergencyContacts).where(eq(emergencyContacts.parentId, parentId));
  }

  async createEmergencyContact(contact: InsertEmergencyContact): Promise<EmergencyContact> {
    const db = await getDb();
    const [newContact] = await db
      .insert(emergencyContacts)
      .values({
        ...contact,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newContact;
  }

  async updateEmergencyContact(id: number, contact: Partial<InsertEmergencyContact>): Promise<EmergencyContact | undefined> {
    const db = await getDb();
    const [updatedContact] = await db
      .update(emergencyContacts)
      .set({
        ...contact,
        updatedAt: new Date()
      })
      .where(eq(emergencyContacts.id, id))
      .returning();
    return updatedContact;
  }

  async deleteEmergencyContact(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(emergencyContacts).where(eq(emergencyContacts.id, id));
  }

  // Activity methods
  async getActivity(id: number): Promise<Activity | undefined> {
    const db = await getDb();
    const [activity] = await db.select().from(activities).where(eq(activities.id, id));
    return activity;
  }

  async getActivitiesByType(activityType: string): Promise<Activity[]> {
    const db = await getDb();
    return await db.select().from(activities).where(eq(activities.activityType, activityType));
  }

  async getActivitiesByAuthor(authorId: number): Promise<Activity[]> {
    const db = await getDb();
    return await db.select().from(activities).where(eq(activities.authorId, authorId));
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const db = await getDb();
    const [newActivity] = await db
      .insert(activities)
      .values({
        ...activity,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newActivity;
  }

  async updateActivity(id: number, activity: Partial<InsertActivity>): Promise<Activity | undefined> {
    const db = await getDb();
    const [updatedActivity] = await db
      .update(activities)
      .set({
        ...activity,
        updatedAt: new Date()
      })
      .where(eq(activities.id, id))
      .returning();
    return updatedActivity;
  }

  async updateActivityDownloadCount(id: number): Promise<Activity | undefined> {
    const db = await getDb();
    const [updatedActivity] = await db
      .update(activities)
      .set({
        downloadCount: sql`${activities.downloadCount} + 1`,
        updatedAt: new Date()
      })
      .where(eq(activities.id, id))
      .returning();
    return updatedActivity;
  }

  async deleteActivity(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(activities).where(eq(activities.id, id));
  }

  // Lesson methods
  async getLesson(id: number): Promise<Lesson | undefined> {
    const db = await getDb();
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, id));
    return lesson;
  }

  async getLessonsByCurriculum(curriculumId: number): Promise<Lesson[]> {
    const db = await getDb();
    return await db.select().from(lessons).where(eq(lessons.curriculumId, curriculumId));
  }

  async getLessonsByAuthor(authorId: number): Promise<Lesson[]> {
    const db = await getDb();
    return await db.select().from(lessons).where(eq(lessons.authorId, authorId));
  }

  async createLesson(lesson: InsertLesson): Promise<Lesson> {
    const db = await getDb();
    const [newLesson] = await db
      .insert(lessons)
      .values({
        ...lesson,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newLesson;
  }

  async updateLesson(id: number, lesson: Partial<InsertLesson>): Promise<Lesson | undefined> {
    const db = await getDb();
    const [updatedLesson] = await db
      .update(lessons)
      .set({
        ...lesson,
        updatedAt: new Date()
      })
      .where(eq(lessons.id, id))
      .returning();
    return updatedLesson;
  }

  // Event methods
  async getEvent(id: number): Promise<Event | undefined> {
    const db = await getDb();
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async getEventsByOrganizer(organizerId: number): Promise<Event[]> {
    const db = await getDb();
    return await db.select().from(events).where(eq(events.organizerId, organizerId));
  }

  async getUpcomingEvents(userId: number): Promise<Event[]> {
    const db = await getDb();
    const now = new Date();
    return await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.organizerId, userId),
          sql`${events.endDate} >= ${now}`
        )
      )
      .orderBy(asc(events.startDate))
      .limit(10);
  }

  async getAllEvents(userId: number): Promise<Event[]> {
    const db = await getDb();
    return await db
      .select()
      .from(events)
      .where(eq(events.organizerId, userId))
      .orderBy(asc(events.startDate));
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const db = await getDb();
    const [newEvent] = await db
      .insert(events)
      .values({
        ...event,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newEvent;
  }

  // Marketplace Item methods
  async getMarketplaceItem(id: number): Promise<MarketplaceItem | undefined> {
    const db = await getDb();
    const [item] = await db.select().from(marketplaceItems).where(eq(marketplaceItems.id, id));
    return item;
  }

  async getMarketplaceItemsBySeller(sellerId: number): Promise<MarketplaceItem[]> {
    const db = await getDb();
    return await db.select().from(marketplaceItems).where(eq(marketplaceItems.sellerId, sellerId));
  }

  async getTopSellingItems(limit: number): Promise<MarketplaceItem[]> {
    const db = await getDb();
    return await db
      .select()
      .from(marketplaceItems)
      .orderBy(desc(marketplaceItems.salesCount))
      .limit(limit);
  }

  async createMarketplaceItem(item: InsertMarketplaceItem): Promise<MarketplaceItem> {
    const db = await getDb();
    const [newItem] = await db
      .insert(marketplaceItems)
      .values({
        ...item,
        salesCount: 0,
        revenue: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newItem;
  }

  async updateMarketplaceItemStats(id: number, sales: number, revenue: number): Promise<MarketplaceItem | undefined> {
    const db = await getDb();
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

  // School Staff methods
  async getSchoolStaffById(id: number): Promise<SchoolStaff | undefined> {
    const db = await getDb();
    const [staff] = await db.select().from(schoolStaff).where(eq(schoolStaff.id, id));
    return staff;
  }

  async getAllSchoolStaff(): Promise<SchoolStaff[]> {
    const db = await getDb();
    return await db.select().from(schoolStaff);
  }

  async getSchoolStaffBySchoolId(schoolId: number): Promise<SchoolStaff[]> {
    const db = await getDb();
    return await db.select().from(schoolStaff).where(eq(schoolStaff.schoolId, schoolId));
  }

  async getSchoolStaffByLocationId(locationId: number): Promise<SchoolStaff[]> {
    const db = await getDb();
    return await db.select().from(schoolStaff).where(eq(schoolStaff.locationId, locationId));
  }

  async getSchoolStaffByUserId(userId: number): Promise<SchoolStaff | undefined> {
    const db = await getDb();
    const [staff] = await db.select().from(schoolStaff).where(eq(schoolStaff.userId, userId));
    return staff;
  }

  async getSchoolStaffByEmail(email: string): Promise<SchoolStaff | undefined> {
    const db = await getDb();
    const [staff] = await db
      .select({
        id: schoolStaff.id,
        schoolId: schoolStaff.schoolId,
        locationId: schoolStaff.locationId,
        userId: schoolStaff.userId,
        role: schoolStaff.role,
        position: schoolStaff.position,
        department: schoolStaff.department,
        startDate: schoolStaff.startDate,
        endDate: schoolStaff.endDate,
        isActive: schoolStaff.isActive,
        permissions: schoolStaff.permissions,
        createdAt: schoolStaff.createdAt,
        updatedAt: schoolStaff.updatedAt,
      })
      .from(schoolStaff)
      .innerJoin(users, eq(schoolStaff.userId, users.id))
      .where(eq(users.email, email));
    return staff;
  }

  async createSchoolStaff(staff: InsertSchoolStaff): Promise<SchoolStaff> {
    const db = await getDb();
    const [newStaff] = await db.insert(schoolStaff).values({
      ...staff,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newStaff;
  }

  async updateSchoolStaff(id: number, staff: Partial<InsertSchoolStaff>): Promise<SchoolStaff | undefined> {
    const db = await getDb();
    const [updatedStaff] = await db
      .update(schoolStaff)
      .set({
        ...staff,
        updatedAt: new Date()
      })
      .where(eq(schoolStaff.id, id))
      .returning();
    return updatedStaff;
  }

  async deleteSchoolStaff(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(schoolStaff).where(eq(schoolStaff.id, id));
  }

  // Payment methods
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const db = await getDb();
    const [newPayment] = await db
      .insert(payments)
      .values({
        ...payment,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newPayment;
  }

  async getPaymentById(id: number): Promise<Payment | undefined> {
    const db = await getDb();
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment;
  }

  async getPaymentsByParentEmail(parentEmail: string): Promise<Payment[]> {
    const db = await getDb();
    return await db.select().from(payments).where(eq(payments.parentEmail, parentEmail));
  }

  async getPaymentByStripeId(stripePaymentIntentId: string): Promise<Payment | undefined> {
    const db = await getDb();
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripePaymentIntentId, stripePaymentIntentId));
    return payment;
  }

  async getAllPayments(): Promise<Payment[]> {
    const db = await getDb();
    return await db.select().from(payments).orderBy(desc(payments.createdAt));
  }

  async updatePaymentStatus(
    id: number,
    status: 'pending' | 'succeeded' | 'failed' | 'canceled'
  ): Promise<Payment | undefined> {
    const db = await getDb();
    // Map interface status values to database schema values
    const dbStatus: 'pending' | 'completed' | 'failed' | 'cancelled' = 
      status === 'succeeded' ? 'completed' :
      status === 'canceled' ? 'cancelled' :
      status;
    
    const [updatedPayment] = await db
      .update(payments)
      .set({
        status: dbStatus,
        updatedAt: new Date()
      })
      .where(eq(payments.id, id))
      .returning();
    return updatedPayment;
  }

  async updatePayment(id: number, payment: Partial<InsertPayment>): Promise<Payment | undefined> {
    const db = await getDb();
    const [updatedPayment] = await db
      .update(payments)
      .set({
        ...payment,
        updatedAt: new Date()
      })
      .where(eq(payments.id, id))
      .returning();
    return updatedPayment;
  }

  // Scheduled Payment methods
  async createScheduledPayment(payment: InsertScheduledPayment): Promise<ScheduledPayment> {
    const db = await getDb();
    const [newPayment] = await db
      .insert(scheduledPayments)
      .values({
        ...payment,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newPayment;
  }

  async getScheduledPaymentById(id: number): Promise<ScheduledPayment | undefined> {
    const db = await getDb();
    const [payment] = await db.select().from(scheduledPayments).where(eq(scheduledPayments.id, id));
    return payment;
  }

  async getScheduledPaymentsByParentEmail(parentEmail: string): Promise<ScheduledPayment[]> {
    const db = await getDb();
    return await db
      .select()
      .from(scheduledPayments)
      .where(eq(scheduledPayments.parentEmail, parentEmail))
      .orderBy(asc(scheduledPayments.scheduledDate));
  }

  async getScheduledPaymentsByEnrollmentId(enrollmentId: number): Promise<ScheduledPayment[]> {
    const db = await getDb();
    return await db
      .select()
      .from(scheduledPayments)
      .where(eq(scheduledPayments.enrollmentId, enrollmentId))
      .orderBy(asc(scheduledPayments.scheduledDate));
  }

  async getAllScheduledPayments(): Promise<ScheduledPayment[]> {
    const db = await getDb();
    return await db.select().from(scheduledPayments).orderBy(asc(scheduledPayments.scheduledDate));
  }

  async updateScheduledPaymentStatus(
    id: number,
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'skipped'
  ): Promise<ScheduledPayment | undefined> {
    const db = await getDb();
    const [updatedPayment] = await db
      .update(scheduledPayments)
      .set({
        status,
        updatedAt: new Date()
      })
      .where(eq(scheduledPayments.id, id))
      .returning();
    return updatedPayment;
  }

  async updateScheduledPayment(id: number, payment: Partial<InsertScheduledPayment>): Promise<ScheduledPayment | undefined> {
    const db = await getDb();
    const [updatedPayment] = await db
      .update(scheduledPayments)
      .set({
        ...payment,
        updatedAt: new Date()
      })
      .where(eq(scheduledPayments.id, id))
      .returning();
    return updatedPayment;
  }

  // Refund methods
  async createRefund(refund: InsertRefund): Promise<Refund> {
    const db = await getDb();
    const [newRefund] = await db
      .insert(refunds)
      .values({
        ...refund,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newRefund;
  }

  async getRefundById(id: number): Promise<Refund | undefined> {
    const db = await getDb();
    const [refund] = await db.select().from(refunds).where(eq(refunds.id, id));
    return refund;
  }

  async getRefundsByPaymentId(paymentId: number): Promise<Refund[]> {
    const db = await getDb();
    return await db.select().from(refunds).where(eq(refunds.paymentId, paymentId));
  }

  async getRefundsByEnrollmentId(enrollmentId: number): Promise<Refund[]> {
    const db = await getDb();
    return await db
      .select()
      .from(refunds)
      .where(eq(refunds.enrollmentId, enrollmentId))
      .orderBy(desc(refunds.createdAt));
  }

  async getAllRefunds(): Promise<Refund[]> {
    const db = await getDb();
    return await db.select().from(refunds).orderBy(desc(refunds.createdAt));
  }

  async updateRefund(id: number, refund: Partial<InsertRefund>): Promise<Refund | undefined> {
    const db = await getDb();
    const [updatedRefund] = await db
      .update(refunds)
      .set({
        ...refund,
        updatedAt: new Date()
      })
      .where(eq(refunds.id, id))
      .returning();
    return updatedRefund;
  }

  // Stripe Subscription Schedule methods
  async createStripeSubscriptionSchedule(schedule: InsertStripeSubscriptionSchedule): Promise<StripeSubscriptionSchedule> {
    const db = await getDb();
    const [newSchedule] = await db
      .insert(stripeSubscriptionSchedules)
      .values({
        ...schedule,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newSchedule;
  }

  async getStripeSubscriptionScheduleById(id: number): Promise<StripeSubscriptionSchedule | undefined> {
    const db = await getDb();
    const [schedule] = await db
      .select()
      .from(stripeSubscriptionSchedules)
      .where(eq(stripeSubscriptionSchedules.id, id));
    return schedule;
  }

  async getStripeSubscriptionScheduleByStripeId(stripeScheduleId: string): Promise<StripeSubscriptionSchedule | undefined> {
    const db = await getDb();
    const [schedule] = await db
      .select()
      .from(stripeSubscriptionSchedules)
      .where(eq(stripeSubscriptionSchedules.stripeScheduleId, stripeScheduleId));
    return schedule;
  }

  async getStripeSubscriptionSchedulesByParentEmail(parentEmail: string): Promise<StripeSubscriptionSchedule[]> {
    const db = await getDb();
    return await db
      .select()
      .from(stripeSubscriptionSchedules)
      .where(eq(stripeSubscriptionSchedules.parentEmail, parentEmail))
      .orderBy(desc(stripeSubscriptionSchedules.createdAt));
  }

  async updateStripeSubscriptionSchedule(id: number, schedule: Partial<InsertStripeSubscriptionSchedule>): Promise<StripeSubscriptionSchedule | undefined> {
    const db = await getDb();
    const [updatedSchedule] = await db
      .update(stripeSubscriptionSchedules)
      .set({
        ...schedule,
        updatedAt: new Date()
      })
      .where(eq(stripeSubscriptionSchedules.id, id))
      .returning();
    return updatedSchedule;
  }

  // Daily Flow Template methods
  async getDailyFlowTemplates(filters?: { schoolId?: number; gradeLevel?: string; subject?: string }): Promise<DailyFlowTemplate[]> {
    const db = await getDb();
    let query = db.select().from(dailyFlowTemplates);
    const conditions = [];
    
    if (filters?.schoolId) {
      conditions.push(eq(dailyFlowTemplates.schoolId, filters.schoolId));
    }
    if (filters?.gradeLevel) {
      conditions.push(eq(dailyFlowTemplates.gradeLevel, filters.gradeLevel));
    }
    if (filters?.subject) {
      conditions.push(eq(dailyFlowTemplates.subject, filters.subject));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query.orderBy(desc(dailyFlowTemplates.createdAt));
  }

  async getDailyFlowTemplateById(id: number): Promise<DailyFlowTemplate | undefined> {
    const db = await getDb();
    const [template] = await db.select().from(dailyFlowTemplates).where(eq(dailyFlowTemplates.id, id));
    return template;
  }

  async createDailyFlowTemplate(template: InsertDailyFlowTemplate): Promise<DailyFlowTemplate> {
    const db = await getDb();
    const [newTemplate] = await db
      .insert(dailyFlowTemplates)
      .values({
        ...template,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newTemplate;
  }

  async updateDailyFlowTemplate(id: number, template: Partial<InsertDailyFlowTemplate>): Promise<DailyFlowTemplate | undefined> {
    const db = await getDb();
    const [updatedTemplate] = await db
      .update(dailyFlowTemplates)
      .set({
        ...template,
        updatedAt: new Date()
      })
      .where(eq(dailyFlowTemplates.id, id))
      .returning();
    return updatedTemplate;
  }

  async deleteDailyFlowTemplate(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(dailyFlowTemplates).where(eq(dailyFlowTemplates.id, id));
  }

  // Daily Flow Entry methods
  async getDailyFlowEntries(filters?: { classId?: number; startDate?: string; endDate?: string }): Promise<DailyFlowEntry[]> {
    const db = await getDb();
    let query = db.select().from(dailyFlowEntries);
    const conditions = [];
    
    if (filters?.classId) {
      conditions.push(eq(dailyFlowEntries.classId, filters.classId));
    }
    if (filters?.startDate) {
      conditions.push(sql`${dailyFlowEntries.date} >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      conditions.push(sql`${dailyFlowEntries.date} <= ${filters.endDate}`);
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query.orderBy(desc(dailyFlowEntries.date));
  }

  async getDailyFlowEntryById(id: number): Promise<DailyFlowEntry | undefined> {
    const db = await getDb();
    const [entry] = await db.select().from(dailyFlowEntries).where(eq(dailyFlowEntries.id, id));
    return entry;
  }

  async createDailyFlowEntry(entry: InsertDailyFlowEntry): Promise<DailyFlowEntry> {
    const db = await getDb();
    const [newEntry] = await db
      .insert(dailyFlowEntries)
      .values({
        ...entry,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newEntry;
  }

  async updateDailyFlowEntry(id: number, entry: Partial<InsertDailyFlowEntry>): Promise<DailyFlowEntry | undefined> {
    const db = await getDb();
    const [updatedEntry] = await db
      .update(dailyFlowEntries)
      .set({
        ...entry,
        updatedAt: new Date()
      })
      .where(eq(dailyFlowEntries.id, id))
      .returning();
    return updatedEntry;
  }

  async deleteDailyFlowEntry(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(dailyFlowEntries).where(eq(dailyFlowEntries.id, id));
  }

  // Daily Flow Schedule methods
  async getDailyFlowSchedules(filters?: { templateId?: number; classId?: number }): Promise<DailyFlowSchedule[]> {
    const db = await getDb();
    let query = db.select().from(dailyFlowSchedules);
    const conditions = [];
    
    if (filters?.templateId) {
      conditions.push(eq(dailyFlowSchedules.templateId, filters.templateId));
    }
    if (filters?.classId) {
      conditions.push(eq(dailyFlowSchedules.classId, filters.classId));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query.orderBy(asc(dailyFlowSchedules.dayOfWeek), asc(dailyFlowSchedules.startTime));
  }

  async getDailyFlowScheduleById(id: number): Promise<DailyFlowSchedule | undefined> {
    const db = await getDb();
    const [schedule] = await db.select().from(dailyFlowSchedules).where(eq(dailyFlowSchedules.id, id));
    return schedule;
  }

  async createDailyFlowSchedule(schedule: InsertDailyFlowSchedule): Promise<DailyFlowSchedule> {
    const db = await getDb();
    const [newSchedule] = await db
      .insert(dailyFlowSchedules)
      .values({
        ...schedule,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newSchedule;
  }

  async updateDailyFlowSchedule(id: number, schedule: Partial<InsertDailyFlowSchedule>): Promise<DailyFlowSchedule | undefined> {
    const db = await getDb();
    const [updatedSchedule] = await db
      .update(dailyFlowSchedules)
      .set({
        ...schedule,
        updatedAt: new Date()
      })
      .where(eq(dailyFlowSchedules.id, id))
      .returning();
    return updatedSchedule;
  }

  async deleteDailyFlowSchedule(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(dailyFlowSchedules).where(eq(dailyFlowSchedules.id, id));
  }

  async getDailyFlowStats(filters?: { classId?: number; startDate?: string; endDate?: string }): Promise<{ totalEntries: number; completedEntries: number; completionRate: number }> {
    const entries = await this.getDailyFlowEntries(filters);
    const totalEntries = entries.length;
    const completedEntries = entries.filter(e => e.isCompleted).length;
    const completionRate = totalEntries > 0 ? (completedEntries / totalEntries) * 100 : 0;
    
    return {
      totalEntries,
      completedEntries,
      completionRate
    };
  }

  // Marketing Link methods
  async getMarketingLinkById(id: number): Promise<MarketingLink | undefined> {
    const db = await getDb();
    const [link] = await db.select().from(marketingLinks).where(eq(marketingLinks.id, id));
    return link;
  }

  async getMarketingLinkByCampaignId(campaignId: string): Promise<MarketingLink | undefined> {
    const db = await getDb();
    const [link] = await db.select().from(marketingLinks).where(eq(marketingLinks.campaignId, campaignId));
    return link;
  }

  async getMarketingLinksBySchoolId(schoolId: number): Promise<MarketingLink[]> {
    const db = await getDb();
    return await db
      .select()
      .from(marketingLinks)
      .where(eq(marketingLinks.schoolId, schoolId))
      .orderBy(desc(marketingLinks.createdAt));
  }

  async createMarketingLink(link: InsertMarketingLink): Promise<MarketingLink> {
    const db = await getDb();
    const [newLink] = await db
      .insert(marketingLinks)
      .values({
        ...link,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newLink;
  }

  async updateMarketingLink(id: number, link: Partial<InsertMarketingLink>): Promise<MarketingLink | undefined> {
    const db = await getDb();
    const [updatedLink] = await db
      .update(marketingLinks)
      .set({
        ...link,
        updatedAt: new Date()
      })
      .where(eq(marketingLinks.id, id))
      .returning();
    return updatedLink;
  }

  async deleteMarketingLink(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(marketingLinks).where(eq(marketingLinks.id, id));
  }

  async incrementLinkClick(campaignId: string): Promise<void> {
    const db = await getDb();
    const link = await this.getMarketingLinkByCampaignId(campaignId);
    if (!link) return;
    
    await db
      .update(marketingLinks)
      .set({
        clickCount: sql`${marketingLinks.clickCount} + 1`,
        updatedAt: new Date()
      })
      .where(eq(marketingLinks.campaignId, campaignId));
  }

  // Location methods
  async getLocation(id: number): Promise<Location | undefined> {
    const db = await getDb();
    const [location] = await db.select().from(locations).where(eq(locations.id, id));
    return location;
  }

  async getLocationsBySchoolId(schoolId: number): Promise<Location[]> {
    const db = await getDb();
    return await db
      .select()
      .from(locations)
      .where(and(eq(locations.schoolId, schoolId), eq(locations.isActive, true)))
      .orderBy(asc(locations.name));
  }

  async getAllLocations(): Promise<Location[]> {
    const db = await getDb();
    return await db.select().from(locations).where(eq(locations.isActive, true));
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const db = await getDb();
    const [newLocation] = await db
      .insert(locations)
      .values({
        ...location,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newLocation;
  }

  async updateLocation(id: number, location: Partial<InsertLocation>): Promise<Location | undefined> {
    const db = await getDb();
    const [updatedLocation] = await db
      .update(locations)
      .set({
        ...location,
        updatedAt: new Date()
      })
      .where(eq(locations.id, id))
      .returning();
    return updatedLocation;
  }

  async deleteLocation(id: number): Promise<void> {
    const db = await getDb();
    await db
      .update(locations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(locations.id, id));
  }

  // User Location methods
  async getUserLocationsByUserId(userId: number): Promise<UserLocation[]> {
    const db = await getDb();
    return await db
      .select()
      .from(userLocations)
      .where(and(eq(userLocations.userId, userId), eq(userLocations.isActive, true)))
      .orderBy(asc(userLocations.assignedAt));
  }

  async getUserLocationsByLocationId(locationId: number): Promise<UserLocation[]> {
    const db = await getDb();
    return await db
      .select()
      .from(userLocations)
      .where(and(eq(userLocations.locationId, locationId), eq(userLocations.isActive, true)))
      .orderBy(asc(userLocations.assignedAt));
  }

  async createUserLocation(userLocation: InsertUserLocation): Promise<UserLocation> {
    const db = await getDb();
    const [newUserLocation] = await db
      .insert(userLocations)
      .values({
        ...userLocation,
        assignedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newUserLocation;
  }

  async updateUserLocation(id: number, userLocation: Partial<InsertUserLocation>): Promise<UserLocation | undefined> {
    const db = await getDb();
    const [updatedUserLocation] = await db
      .update(userLocations)
      .set({
        ...userLocation,
        updatedAt: new Date()
      })
      .where(eq(userLocations.id, id))
      .returning();
    return updatedUserLocation;
  }

  async deleteUserLocation(id: number): Promise<void> {
    const db = await getDb();
    await db
      .update(userLocations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(userLocations.id, id));
  }

  // Marketplace Class Enrollment methods
  async getMarketplaceEnrollmentById(id: number): Promise<MarketplaceClassEnrollment | undefined> {
    const db = await getDb();
    const [enrollment] = await db.select().from(marketplaceClassEnrollments).where(eq(marketplaceClassEnrollments.id, id));
    return enrollment;
  }

  async getMarketplaceEnrollmentsByChildId(childId: number): Promise<MarketplaceClassEnrollment[]> {
    const db = await getDb();
    return await db
      .select()
      .from(marketplaceClassEnrollments)
      .where(eq(marketplaceClassEnrollments.childId, childId))
      .orderBy(desc(marketplaceClassEnrollments.enrollmentDate));
  }

  async getMarketplaceEnrollmentsByClassId(classId: number): Promise<MarketplaceClassEnrollment[]> {
    const db = await getDb();
    return await db
      .select()
      .from(marketplaceClassEnrollments)
      .where(eq(marketplaceClassEnrollments.classId, classId))
      .orderBy(desc(marketplaceClassEnrollments.enrollmentDate));
  }

  async createMarketplaceEnrollment(enrollment: InsertMarketplaceClassEnrollment): Promise<MarketplaceClassEnrollment> {
    const db = await getDb();
    const [newEnrollment] = await db
      .insert(marketplaceClassEnrollments)
      .values({
        ...enrollment,
        enrollmentDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newEnrollment;
  }

  async updateMarketplaceEnrollment(id: number, enrollment: Partial<InsertMarketplaceClassEnrollment>): Promise<MarketplaceClassEnrollment | undefined> {
    const db = await getDb();
    const [updatedEnrollment] = await db
      .update(marketplaceClassEnrollments)
      .set({
        ...enrollment,
        updatedAt: new Date()
      })
      .where(eq(marketplaceClassEnrollments.id, id))
      .returning();
    return updatedEnrollment;
  }

  async deleteMarketplaceEnrollment(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(marketplaceClassEnrollments).where(eq(marketplaceClassEnrollments.id, id));
  }
}