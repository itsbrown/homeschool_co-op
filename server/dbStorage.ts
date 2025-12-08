import { eq, and, desc, asc, like, or, sql, lt, gt, isNull, inArray } from 'drizzle-orm';
import { getDb } from './db';
import { IStorage } from './storage';
import {
  User, InsertUser, users,
  UserRole, userRoles,
  Class, InsertClass, classes,
  KnowledgeBase, InsertKnowledgeBase, knowledgeBases,
  Curriculum, InsertCurriculum, curricula,
  Activity, InsertActivity, activities,
  Lesson, InsertLesson, lessons,
  Program, InsertProgram, programs,
  ProgramEnrollment, InsertProgramEnrollment, programEnrollments,
  MembershipEnrollment, InsertMembershipEnrollment, membershipEnrollments,
  MembershipAgreement, InsertMembershipAgreement, membershipAgreements,
  SchoolDocument, InsertSchoolDocument, schoolDocuments,
  PaymentReceipt, InsertPaymentReceipt, paymentReceipts,
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
  Category, InsertCategory, categories,
  UserLocation, InsertUserLocation, userLocations,
  Notification, InsertNotification, notifications,
  NotificationRecipient, InsertNotificationRecipient, notificationRecipients,
  Discount, InsertDiscount, discounts,
  DiscountApplication, InsertDiscountApplication, discountApplications,
  StaffPosition, InsertStaffPosition, staffPositions,
  StaffInvitation, InsertStaffInvitation, staffInvitations,
  PasswordResetToken, InsertPasswordResetToken, passwordResetTokens,
  RoleInvitation, InsertRoleInvitation, roleInvitations,
  EducatorClassAssignment, InsertEducatorClassAssignment, educatorClassAssignments,
  ClassSession, InsertClassSession, classSessions,
  EducatorSchedule, InsertEducatorSchedule, educatorSchedules,
  AuditLog, InsertAuditLog, auditLogs
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

  async getLocationsBySchool(schoolId: number): Promise<Location[]> {
    const db = await getDb();
    return await db.select().from(locations).where(eq(locations.schoolId, schoolId));
  }

  async getSchoolsByAdminId(adminId: number): Promise<School[]> {
    const db = await getDb();
    return await db.select().from(schools).where(eq(schools.adminId, adminId));
  }

  // User Role methods
  async getUserRolesByUserId(userId: number): Promise<UserRole[]> {
    const db = await getDb();
    return await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  }

  async deleteUserRolesByUserId(userId: number): Promise<void> {
    const db = await getDb();
    await db.delete(userRoles).where(eq(userRoles.userId, userId));
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
  }): Promise<any[]> {
    const db = await getDb();
    
    // Start with a select that includes location join
    const baseQuery = db
      .select({
        // Select all class fields (same as getClassesBySchoolId)
        id: classes.id,
        type: classes.type,
        legacyProgramId: classes.legacyProgramId,
        schoolId: classes.schoolId,
        locationId: classes.locationId,
        title: classes.title,
        description: classes.description,
        category: classes.category,
        gradeLevels: classes.gradeLevels,
        startDate: classes.startDate,
        endDate: classes.endDate,
        schedule: classes.schedule,
        capacity: classes.capacity,
        price: classes.price,
        instructorId: classes.instructorId,
        isPublished: classes.isPublished,
        createdAt: classes.createdAt,
        updatedAt: classes.updatedAt,
        productId: classes.productId,
        productType: classes.productType,
        categoryName: classes.categoryName,
        numSessions: classes.numSessions,
        sessionDays: classes.sessionDays,
        durationWeeks: classes.durationWeeks,
        sessionsPerWeek: classes.sessionsPerWeek,
        sessionLengthMinutes: classes.sessionLengthMinutes,
        startTime: classes.startTime,
        endTime: classes.endTime,
        status: classes.status,
        location: classes.location,
        instructorName: classes.instructorName,
        suggestedPrice: classes.suggestedPrice,
        totalOrders: classes.totalOrders,
        paidOrders: classes.paidOrders,
        totalWaitlisted: classes.totalWaitlisted,
        totalOrderValue: classes.totalOrderValue,
        totalDiscounted: classes.totalDiscounted,
        totalCollected: classes.totalCollected,
        isAdminOnly: classes.isAdminOnly,
        enrollmentCount: classes.enrollmentCount,
        ageRange: classes.ageRange,
        scheduleType: classes.scheduleType,
        scheduleDetails: classes.scheduleDetails,
        locationName: classes.locationName,
        locationAddress: classes.locationAddress,
        isVirtual: classes.isVirtual,
        meetingUrl: classes.meetingUrl,
        curriculumId: classes.curriculumId,
        coverImage: classes.coverImage,
        materials: classes.materials,
        // Add location name from join
        locationNameFromTable: locations.name,
        // Add category name from join
        categoryNameFromTable: categories.name,
      })
      .from(classes)
      .leftJoin(locations, eq(classes.locationId, locations.id))
      .leftJoin(categories, eq(classes.categoryId, categories.id));

    // Build query conditions
    const conditions = [];
    
    if (options.search) {
      conditions.push(
        or(
          like(classes.title, `%${options.search}%`),
          like(classes.description, `%${options.search}%`)
        )
      );
    }

    if (options.category) {
      conditions.push(eq(classes.category, options.category));
    }

    // Apply where conditions if any
    let query = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;

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

    const result = await query;
    
    // Map results to include locationName and categoryName (prefer joined values, fallback to old fields)
    return result.map(row => ({
      ...row,
      locationName: row.locationNameFromTable || row.location || null,
      categoryName: row.categoryNameFromTable || row.category || null,
    }));
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
    
    // Check for related enrollments
    const relatedEnrollments = await db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.marketplaceClassId, id));
    
    if (relatedEnrollments.length > 0) {
      throw new Error(`Cannot delete class: ${relatedEnrollments.length} student(s) enrolled. Please cancel all enrollments first.`);
    }
    
    // Check for related discount applications
    const relatedDiscounts = await db
      .select()
      .from(discountApplications)
      .where(eq(discountApplications.classId, id));
    
    if (relatedDiscounts.length > 0) {
      throw new Error(`Cannot delete class: has ${relatedDiscounts.length} discount application(s). Please remove discount applications first.`);
    }
    
    // Check for related daily flow entries
    const relatedFlowEntries = await db
      .select()
      .from(dailyFlowEntries)
      .where(eq(dailyFlowEntries.classId, id));
    
    if (relatedFlowEntries.length > 0) {
      throw new Error(`Cannot delete class: has ${relatedFlowEntries.length} daily flow entries. Please remove flow entries first.`);
    }
    
    // Check for related daily flow schedules
    const relatedFlowSchedules = await db
      .select()
      .from(dailyFlowSchedules)
      .where(eq(dailyFlowSchedules.classId, id));
    
    if (relatedFlowSchedules.length > 0) {
      throw new Error(`Cannot delete class: has ${relatedFlowSchedules.length} daily flow schedules. Please remove schedules first.`);
    }
    
    // If no related records, safe to delete
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

  async getAllClasses(): Promise<any[]> {
    const db = await getDb();
    
    // Left join with locations to include locationName
    const result = await db
      .select({
        // Select all class fields
        id: classes.id,
        type: classes.type,
        legacyProgramId: classes.legacyProgramId,
        schoolId: classes.schoolId,
        locationId: classes.locationId,
        title: classes.title,
        description: classes.description,
        category: classes.category,
        gradeLevels: classes.gradeLevels,
        startDate: classes.startDate,
        endDate: classes.endDate,
        schedule: classes.schedule,
        capacity: classes.capacity,
        price: classes.price,
        instructorId: classes.instructorId,
        isPublished: classes.isPublished,
        createdAt: classes.createdAt,
        updatedAt: classes.updatedAt,
        productId: classes.productId,
        productType: classes.productType,
        categoryName: classes.categoryName,
        numSessions: classes.numSessions,
        sessionDays: classes.sessionDays,
        durationWeeks: classes.durationWeeks,
        sessionsPerWeek: classes.sessionsPerWeek,
        sessionLengthMinutes: classes.sessionLengthMinutes,
        startTime: classes.startTime,
        endTime: classes.endTime,
        status: classes.status,
        location: classes.location,
        instructorName: classes.instructorName,
        suggestedPrice: classes.suggestedPrice,
        totalOrders: classes.totalOrders,
        paidOrders: classes.paidOrders,
        totalWaitlisted: classes.totalWaitlisted,
        totalOrderValue: classes.totalOrderValue,
        totalDiscounted: classes.totalDiscounted,
        totalCollected: classes.totalCollected,
        isAdminOnly: classes.isAdminOnly,
        enrollmentCount: classes.enrollmentCount,
        ageRange: classes.ageRange,
        scheduleType: classes.scheduleType,
        scheduleDetails: classes.scheduleDetails,
        locationName: classes.locationName,
        locationAddress: classes.locationAddress,
        isVirtual: classes.isVirtual,
        meetingUrl: classes.meetingUrl,
        curriculumId: classes.curriculumId,
        coverImage: classes.coverImage,
        materials: classes.materials,
        // Add location name from join
        locationNameFromTable: locations.name,
        // Add category name from join
        categoryNameFromTable: categories.name,
      })
      .from(classes)
      .leftJoin(locations, eq(classes.locationId, locations.id))
      .leftJoin(categories, eq(classes.categoryId, categories.id));
    
    // Map results to include locationName and categoryName (prefer joined values, fallback to old fields)
    const allClasses = result.map(row => ({
      ...row,
      locationName: row.locationNameFromTable || row.location || null,
      categoryName: row.categoryNameFromTable || row.category || null,
    }));
    
    console.log(`📊 getAllClasses: Found ${allClasses.length} total classes`);
    const schoolIdCounts = allClasses.reduce((acc, c) => {
      const sid = c.schoolId ?? 'null';
      acc[sid] = (acc[sid] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`📊 Classes by schoolId:`, schoolIdCounts);
    return allClasses;
  }

  async getClassesBySchoolId(schoolId: string): Promise<any[]> {
    const db = await getDb();
    const schoolIdNum = parseInt(schoolId, 10);
    if (isNaN(schoolIdNum)) {
      return [];
    }
    
    // Left join with locations to include locationName
    const result = await db
      .select({
        // Select all class fields
        id: classes.id,
        type: classes.type,
        legacyProgramId: classes.legacyProgramId,
        schoolId: classes.schoolId,
        locationId: classes.locationId,
        title: classes.title,
        description: classes.description,
        category: classes.category,
        gradeLevels: classes.gradeLevels,
        startDate: classes.startDate,
        endDate: classes.endDate,
        schedule: classes.schedule,
        capacity: classes.capacity,
        price: classes.price,
        instructorId: classes.instructorId,
        isPublished: classes.isPublished,
        createdAt: classes.createdAt,
        updatedAt: classes.updatedAt,
        productId: classes.productId,
        productType: classes.productType,
        categoryName: classes.categoryName,
        numSessions: classes.numSessions,
        sessionDays: classes.sessionDays,
        durationWeeks: classes.durationWeeks,
        sessionsPerWeek: classes.sessionsPerWeek,
        sessionLengthMinutes: classes.sessionLengthMinutes,
        startTime: classes.startTime,
        endTime: classes.endTime,
        status: classes.status,
        location: classes.location,
        instructorName: classes.instructorName,
        suggestedPrice: classes.suggestedPrice,
        totalOrders: classes.totalOrders,
        paidOrders: classes.paidOrders,
        totalWaitlisted: classes.totalWaitlisted,
        totalOrderValue: classes.totalOrderValue,
        totalDiscounted: classes.totalDiscounted,
        totalCollected: classes.totalCollected,
        isAdminOnly: classes.isAdminOnly,
        enrollmentCount: classes.enrollmentCount,
        ageRange: classes.ageRange,
        scheduleType: classes.scheduleType,
        scheduleDetails: classes.scheduleDetails,
        locationName: classes.locationName,
        locationAddress: classes.locationAddress,
        isVirtual: classes.isVirtual,
        meetingUrl: classes.meetingUrl,
        curriculumId: classes.curriculumId,
        coverImage: classes.coverImage,
        materials: classes.materials,
        // Add location name from join
        locationNameFromTable: locations.name,
        // Add category name from join
        categoryNameFromTable: categories.name,
      })
      .from(classes)
      .leftJoin(locations, eq(classes.locationId, locations.id))
      .leftJoin(categories, eq(classes.categoryId, categories.id))
      .where(eq(classes.schoolId, schoolIdNum));
    
    // Map results to include locationName and categoryName (prefer joined values, fallback to old fields)
    const mappedResults = result.map(row => ({
      ...row,
      locationName: row.locationNameFromTable || row.location || null,
      categoryName: row.categoryNameFromTable || row.category || null,
    }));
    
    console.log(`📊 Filtered classes for schoolId=${schoolIdNum}: ${mappedResults.length}`);
    return mappedResults;
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
      const db = await getDb();
      const result = await db.select().from(knowledgeBases);
      return result;
    } catch (error) {
      console.error("Error fetching all knowledge bases from database:", error);
      return [];
    }
  }

  async getAllActivities(): Promise<Activity[]> {
    try {
      const db = await getDb();
      const result = await db.select().from(activities);
      return result;
    } catch (error) {
      console.error("Error fetching all activities from database:", error);
      return [];
    }
  }

  async getAllEnrollments(): Promise<ProgramEnrollment[]> {
    try {
      const db = await getDb();
      const result = await db.select().from(programEnrollments);
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

  // Note: programs table doesn't have an organizerId field, use instructorId instead
  // async getProgramsByOrganizer(organizerId: number): Promise<Program[]> {
  //   const db = await getDb();
  //   return await db.select().from(programs).where(eq(programs.organizerId, organizerId));
  // }

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

  async getProgramEnrollmentById(id: number): Promise<ProgramEnrollment | undefined> {
    return this.getProgramEnrollment(id);
  }

  async getProgramEnrollmentsByParent(parentId: number): Promise<ProgramEnrollment[]> {
    const db = await getDb();
    return await db.select().from(programEnrollments).where(eq(programEnrollments.parentId, parentId));
  }

  async getProgramEnrollmentsByProgram(programId: number): Promise<ProgramEnrollment[]> {
    const db = await getDb();
    return await db.select().from(programEnrollments).where(eq(programEnrollments.programId, programId));
  }

  async getProgramEnrollmentsByChild(childId: number): Promise<ProgramEnrollment[]> {
    const db = await getDb();
    return await db.select().from(programEnrollments).where(eq(programEnrollments.childId, childId));
  }

  async getEnrollmentCountForProgram(programId: number): Promise<number> {
    const db = await getDb();
    const enrollments = await db.select().from(programEnrollments)
      .where(eq(programEnrollments.programId, programId));
    // Count only valid statuses: pending_payment, enrolled, waitlist, completed
    return enrollments.filter(e => 
      e.status === 'pending_payment' || 
      e.status === 'enrolled' || 
      e.status === 'waitlist' ||
      e.status === 'completed'
    ).length;
  }

  async getEnrollmentCountForClass(classId: number): Promise<number> {
    const db = await getDb();
    const { or } = await import('drizzle-orm');
    const enrollments = await db.select().from(programEnrollments)
      .where(or(
        eq(programEnrollments.classId, classId),
        eq(programEnrollments.marketplaceClassId, classId)
      ));
    // Count only valid statuses: pending_payment, enrolled, waitlist, completed
    return enrollments.filter(e => 
      e.status === 'pending_payment' || 
      e.status === 'enrolled' || 
      e.status === 'waitlist' ||
      e.status === 'completed'
    ).length;
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

  async cancelPendingEnrollments(enrollmentIds: number[], parentUserId: number): Promise<{ cancelled: number[]; skipped: number[]; errors: string[] }> {
    const db = await getDb();
    const cancelled: number[] = [];
    const skipped: number[] = [];
    const errors: string[] = [];

    // Fetch all the enrollments to validate them
    const enrollmentsToCheck = await db
      .select()
      .from(programEnrollments)
      .where(inArray(programEnrollments.id, enrollmentIds));

    for (const enrollment of enrollmentsToCheck) {
      // Verify ownership by checking if the child belongs to the parent
      const child = await this.getChildById(enrollment.childId);
      if (!child || child.parentUserId !== parentUserId) {
        errors.push(`Enrollment ${enrollment.id} does not belong to this parent`);
        continue;
      }

      // Skip if enrollment has been paid
      if (enrollment.amountPaid && enrollment.amountPaid > 0) {
        skipped.push(enrollment.id);
        continue;
      }

      // Skip if not in pending_payment status
      if (enrollment.status !== 'pending_payment') {
        skipped.push(enrollment.id);
        continue;
      }

      // Update to cancelled status
      await db
        .update(programEnrollments)
        .set({
          status: 'cancelled',
          updatedAt: new Date()
        })
        .where(eq(programEnrollments.id, enrollment.id));
      
      cancelled.push(enrollment.id);
    }

    return { cancelled, skipped, errors };
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
      expirationDate: new Date(membershipYear, 11, 31),
      paymentMethod: null,
      notes: null,
      gracePeriodEnd: null
    };

    return this.createMembershipEnrollment(enrollmentData);
  }

  // Membership Agreement methods
  async getMembershipAgreementById(id: number): Promise<MembershipAgreement | undefined> {
    const db = await getDb();
    const [agreement] = await db.select().from(membershipAgreements).where(eq(membershipAgreements.id, id));
    return agreement;
  }

  async getMembershipAgreementsByParentId(parentUserId: number): Promise<MembershipAgreement[]> {
    const db = await getDb();
    return await db
      .select()
      .from(membershipAgreements)
      .where(eq(membershipAgreements.parentUserId, parentUserId))
      .orderBy(desc(membershipAgreements.signedAt));
  }

  async getMembershipAgreementsBySchoolId(schoolId: number): Promise<MembershipAgreement[]> {
    const db = await getDb();
    return await db
      .select()
      .from(membershipAgreements)
      .where(eq(membershipAgreements.schoolId, schoolId))
      .orderBy(desc(membershipAgreements.signedAt));
  }

  async getMembershipAgreementByEnrollmentId(enrollmentId: number): Promise<MembershipAgreement | undefined> {
    const db = await getDb();
    const [agreement] = await db
      .select()
      .from(membershipAgreements)
      .where(eq(membershipAgreements.membershipEnrollmentId, enrollmentId));
    return agreement;
  }

  async getLatestMembershipAgreementByParentAndSchool(parentUserId: number, schoolId: number): Promise<MembershipAgreement | undefined> {
    const db = await getDb();
    const [agreement] = await db
      .select()
      .from(membershipAgreements)
      .where(
        and(
          eq(membershipAgreements.parentUserId, parentUserId),
          eq(membershipAgreements.schoolId, schoolId)
        )
      )
      .orderBy(desc(membershipAgreements.signedAt))
      .limit(1);
    return agreement;
  }

  async createMembershipAgreement(agreementData: InsertMembershipAgreement): Promise<MembershipAgreement> {
    const db = await getDb();
    const [newAgreement] = await db
      .insert(membershipAgreements)
      .values({
        ...agreementData,
        signedAt: new Date(),
        createdAt: new Date()
      })
      .returning();
    return newAgreement;
  }

  async hasSignedCurrentAgreement(parentUserId: number, schoolId: number, currentVersion: string): Promise<boolean> {
    const latestAgreement = await this.getLatestMembershipAgreementByParentAndSchool(parentUserId, schoolId);
    return latestAgreement !== undefined && latestAgreement.agreementVersion === currentVersion;
  }

  // School Documents methods
  async getSchoolDocumentById(id: number): Promise<SchoolDocument | undefined> {
    const db = await getDb();
    const [document] = await db.select().from(schoolDocuments).where(eq(schoolDocuments.id, id));
    return document;
  }

  async getSchoolDocumentsBySchoolId(schoolId: number): Promise<SchoolDocument[]> {
    const db = await getDb();
    return await db
      .select()
      .from(schoolDocuments)
      .where(eq(schoolDocuments.schoolId, schoolId))
      .orderBy(desc(schoolDocuments.createdAt));
  }

  async getPublishedSchoolDocuments(schoolId: number): Promise<SchoolDocument[]> {
    const db = await getDb();
    return await db
      .select()
      .from(schoolDocuments)
      .where(
        and(
          eq(schoolDocuments.schoolId, schoolId),
          eq(schoolDocuments.isPublished, true)
        )
      )
      .orderBy(desc(schoolDocuments.createdAt));
  }

  async createSchoolDocument(documentData: InsertSchoolDocument): Promise<SchoolDocument> {
    const db = await getDb();
    const [newDocument] = await db
      .insert(schoolDocuments)
      .values({
        ...documentData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newDocument;
  }

  async updateSchoolDocument(id: number, documentData: Partial<InsertSchoolDocument>): Promise<SchoolDocument | undefined> {
    const db = await getDb();
    const [updatedDocument] = await db
      .update(schoolDocuments)
      .set({
        ...documentData,
        updatedAt: new Date()
      })
      .where(eq(schoolDocuments.id, id))
      .returning();
    return updatedDocument;
  }

  async deleteSchoolDocument(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(schoolDocuments).where(eq(schoolDocuments.id, id));
  }

  // Payment Receipts methods
  async getPaymentReceiptById(id: number): Promise<PaymentReceipt | undefined> {
    const db = await getDb();
    const [receipt] = await db.select().from(paymentReceipts).where(eq(paymentReceipts.id, id));
    return receipt;
  }

  async getPaymentReceiptByNumber(receiptNumber: string): Promise<PaymentReceipt | undefined> {
    const db = await getDb();
    const [receipt] = await db.select().from(paymentReceipts).where(eq(paymentReceipts.receiptNumber, receiptNumber));
    return receipt;
  }

  async getPaymentReceiptsByParentId(parentUserId: number): Promise<PaymentReceipt[]> {
    const db = await getDb();
    return await db
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.parentUserId, parentUserId))
      .orderBy(desc(paymentReceipts.paymentDate));
  }

  async getPaymentReceiptsBySchoolId(schoolId: number): Promise<PaymentReceipt[]> {
    const db = await getDb();
    return await db
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.schoolId, schoolId))
      .orderBy(desc(paymentReceipts.paymentDate));
  }

  async createPaymentReceipt(receiptData: InsertPaymentReceipt): Promise<PaymentReceipt> {
    const db = await getDb();
    const [newReceipt] = await db
      .insert(paymentReceipts)
      .values({
        ...receiptData,
        paymentDate: new Date(),
        createdAt: new Date()
      })
      .returning();
    return newReceipt;
  }

  async updatePaymentReceiptStatus(id: number, status: 'generated' | 'downloaded' | 'emailed'): Promise<PaymentReceipt | undefined> {
    const db = await getDb();
    const [updatedReceipt] = await db
      .update(paymentReceipts)
      .set({ status })
      .where(eq(paymentReceipts.id, id))
      .returning();
    return updatedReceipt;
  }

  // Child methods
  async getChild(id: number): Promise<Child | undefined> {
    const db = await getDb();
    const [child] = await db.select().from(children).where(eq(children.id, id));
    return child;
  }

  // Alias for getChild to maintain API compatibility
  async getChildById(id: number): Promise<Child | undefined> {
    return this.getChild(id);
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
    return await db.select().from(emergencyContacts).where(eq(emergencyContacts.userId, parentId));
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
    return await db.select().from(activities).where(eq(activities.type, activityType));
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
      .orderBy(desc(marketplaceItems.sales))
      .limit(limit);
  }

  async createMarketplaceItem(item: InsertMarketplaceItem): Promise<MarketplaceItem> {
    const db = await getDb();
    const [newItem] = await db
      .insert(marketplaceItems)
      .values({
        ...item,
        sales: 0,
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
        sales: sql`${marketplaceItems.sales} + ${sales}`,
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

  async deleteSchoolStaffByUserId(userId: number): Promise<void> {
    const db = await getDb();
    await db.delete(schoolStaff).where(eq(schoolStaff.userId, userId));
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

  async updateScheduledPaymentReminderCount(id: number, count: number): Promise<ScheduledPayment | undefined> {
    const db = await getDb();
    const [updatedPayment] = await db
      .update(scheduledPayments)
      .set({
        reminderCount: count,
        lastReminderSentAt: new Date(),
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

  // Category methods (school-specific)
  async getCategoryById(id: number): Promise<Category | undefined> {
    const db = await getDb();
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category;
  }

  async getCategoriesBySchoolId(schoolId: number): Promise<Category[]> {
    const db = await getDb();
    return await db
      .select()
      .from(categories)
      .where(and(eq(categories.schoolId, schoolId), eq(categories.isActive, true)))
      .orderBy(asc(categories.name));
  }

  async getAllCategories(): Promise<Category[]> {
    const db = await getDb();
    return await db.select().from(categories).where(eq(categories.isActive, true));
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const db = await getDb();
    const [newCategory] = await db
      .insert(categories)
      .values({
        ...category,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newCategory;
  }

  async updateCategory(id: number, category: Partial<InsertCategory>): Promise<Category | undefined> {
    const db = await getDb();
    const [updatedCategory] = await db
      .update(categories)
      .set({
        ...category,
        updatedAt: new Date()
      })
      .where(eq(categories.id, id))
      .returning();
    return updatedCategory;
  }

  async deleteCategory(id: number): Promise<void> {
    const db = await getDb();
    await db
      .update(categories)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(categories.id, id));
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

  // Notification methods
  async getNotificationById(id: number): Promise<Notification | undefined> {
    const db = await getDb();
    const [notification] = await db.select().from(notifications).where(eq(notifications.id, id));
    return notification;
  }

  async getAllNotifications(): Promise<Notification[]> {
    const db = await getDb();
    return await db.select().from(notifications).orderBy(desc(notifications.createdAt));
  }

  async getNotificationsByUserId(userId: number, role?: string): Promise<Notification[]> {
    const db = await getDb();
    
    const recipients = await db
      .select()
      .from(notificationRecipients)
      .where(eq(notificationRecipients.recipientId, userId));
    
    const notificationIds = recipients.map((r: any) => r.notificationId);
    
    if (notificationIds.length === 0 && role !== 'schoolAdmin') {
      return [];
    }
    
    let query = db.select().from(notifications);
    
    if (role === 'schoolAdmin') {
      query = query.where(
        or(
          sql`${notifications.id} IN (${sql.join(notificationIds, sql`, `)})`,
          eq(notifications.senderId, userId)
        )
      );
    } else {
      query = query.where(sql`${notifications.id} IN (${sql.join(notificationIds, sql`, `)})`);
    }
    
    const notifs = await query.orderBy(desc(notifications.createdAt));
    
    return notifs.map((notification: any) => {
      const recipientInfo = recipients.find((r: any) => r.notificationId === notification.id);
      return {
        ...notification,
        recipientStatus: recipientInfo?.status,
        readAt: recipientInfo?.readAt,
      } as any;
    });
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const db = await getDb();
    const [newNotification] = await db
      .insert(notifications)
      .values({
        ...notification,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newNotification;
  }

  async updateNotification(id: number, notification: Partial<InsertNotification>): Promise<Notification | undefined> {
    const db = await getDb();
    const [updatedNotification] = await db
      .update(notifications)
      .set({
        ...notification,
        updatedAt: new Date()
      })
      .where(eq(notifications.id, id))
      .returning();
    return updatedNotification;
  }

  async deleteNotification(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  // Notification recipient methods
  async getNotificationRecipientById(id: number): Promise<NotificationRecipient | undefined> {
    const db = await getDb();
    const [recipient] = await db.select().from(notificationRecipients).where(eq(notificationRecipients.id, id));
    return recipient;
  }

  async getNotificationRecipientsByNotificationId(notificationId: number): Promise<NotificationRecipient[]> {
    const db = await getDb();
    return await db
      .select()
      .from(notificationRecipients)
      .where(eq(notificationRecipients.notificationId, notificationId));
  }

  async getNotificationRecipientsByUserId(userId: number): Promise<NotificationRecipient[]> {
    const db = await getDb();
    return await db
      .select()
      .from(notificationRecipients)
      .where(eq(notificationRecipients.recipientId, userId))
      .orderBy(desc(notificationRecipients.createdAt));
  }

  async createNotificationRecipient(recipient: InsertNotificationRecipient): Promise<NotificationRecipient> {
    const db = await getDb();
    const [newRecipient] = await db
      .insert(notificationRecipients)
      .values({
        ...recipient,
        createdAt: new Date()
      })
      .returning();
    return newRecipient;
  }

  async updateNotificationRecipient(id: number, recipient: Partial<InsertNotificationRecipient>): Promise<NotificationRecipient | undefined> {
    const db = await getDb();
    const [updatedRecipient] = await db
      .update(notificationRecipients)
      .set(recipient)
      .where(eq(notificationRecipients.id, id))
      .returning();
    return updatedRecipient;
  }

  // Push Subscription methods
  async getPushSubscriptionsByUserId(userId: number): Promise<any[]> {
    const db = await getDb();
    const { pushSubscriptions } = await import('../shared/schema.js');
    return await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
  }

  async getPushSubscriptionByEndpoint(endpoint: string): Promise<any | undefined> {
    const db = await getDb();
    const { pushSubscriptions } = await import('../shared/schema.js');
    const [subscription] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
    return subscription;
  }

  async createPushSubscription(subscription: any): Promise<any> {
    const db = await getDb();
    const { pushSubscriptions } = await import('../shared/schema.js');
    const [created] = await db
      .insert(pushSubscriptions)
      .values(subscription)
      .returning();
    return created;
  }

  async updatePushSubscription(id: number, subscription: Partial<any>): Promise<any | undefined> {
    const db = await getDb();
    const { pushSubscriptions } = await import('../shared/schema.js');
    const [updated] = await db
      .update(pushSubscriptions)
      .set(subscription)
      .where(eq(pushSubscriptions.id, id))
      .returning();
    return updated;
  }

  async deletePushSubscription(id: number): Promise<void> {
    const db = await getDb();
    const { pushSubscriptions } = await import('../shared/schema.js');
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
  }

  async deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
    const db = await getDb();
    const { pushSubscriptions } = await import('../shared/schema.js');
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  // Discount methods
  async getDiscountById(id: number): Promise<Discount | undefined> {
    const db = await getDb();
    const [discount] = await db.select().from(discounts).where(eq(discounts.id, id));
    return discount;
  }

  async getAllDiscounts(): Promise<Discount[]> {
    const db = await getDb();
    return await db.select().from(discounts);
  }

  async getDiscountsBySchoolId(schoolId: number): Promise<Discount[]> {
    const db = await getDb();
    return await db.select().from(discounts).where(eq(discounts.schoolId, schoolId));
  }

  async createDiscount(discount: InsertDiscount): Promise<Discount> {
    const db = await getDb();
    const [newDiscount] = await db.insert(discounts).values({
      ...discount,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newDiscount;
  }

  async updateDiscount(id: number, discount: Partial<InsertDiscount>): Promise<Discount | undefined> {
    const db = await getDb();
    const [updatedDiscount] = await db
      .update(discounts)
      .set({
        ...discount,
        updatedAt: new Date()
      })
      .where(eq(discounts.id, id))
      .returning();
    return updatedDiscount;
  }

  /**
   * Atomically increment discount usage counter, respecting usage limits.
   * Uses conditional UPDATE to prevent race conditions from exceeding limits.
   * @returns true if increment succeeded, false if limit exceeded
   */
  async incrementDiscountUsageAtomic(discountId: number): Promise<boolean> {
    const db = await getDb();
    // Use raw SQL for atomic conditional update
    // Only increment if: usage_limit IS NULL (no limit) OR current_usage_count < usage_limit
    const result = await db.execute(sql`
      UPDATE discounts 
      SET current_usage_count = COALESCE(current_usage_count, 0) + 1,
          updated_at = NOW()
      WHERE id = ${discountId}
        AND (usage_limit IS NULL OR COALESCE(current_usage_count, 0) < usage_limit)
      RETURNING id
    `);
    // If no rows returned, the update failed (limit exceeded)
    return result.rows.length > 0;
  }

  async deleteDiscount(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(discounts).where(eq(discounts.id, id));
  }

  // Discount Application methods
  async getDiscountApplicationById(id: number): Promise<DiscountApplication | undefined> {
    const db = await getDb();
    const [application] = await db.select().from(discountApplications).where(eq(discountApplications.id, id));
    return application;
  }

  async getAllDiscountApplications(): Promise<DiscountApplication[]> {
    const db = await getDb();
    return await db.select().from(discountApplications);
  }

  async getDiscountApplicationsBySchoolId(schoolId: number): Promise<DiscountApplication[]> {
    const db = await getDb();
    // Join with discounts table to filter by schoolId
    return await db
      .select()
      .from(discountApplications)
      .innerJoin(discounts, eq(discountApplications.discountId, discounts.id))
      .where(eq(discounts.schoolId, schoolId))
      .then((results: any) => results.map((r: any) => r.discount_applications));
  }

  async getDiscountApplicationsByDiscountId(discountId: number): Promise<DiscountApplication[]> {
    const db = await getDb();
    return await db.select().from(discountApplications).where(eq(discountApplications.discountId, discountId));
  }

  async createDiscountApplication(application: InsertDiscountApplication): Promise<DiscountApplication> {
    const db = await getDb();
    const [newApplication] = await db.insert(discountApplications).values({
      ...application,
      createdAt: new Date()
    }).returning();
    return newApplication;
  }

  async updateDiscountApplication(id: number, application: Partial<InsertDiscountApplication>): Promise<DiscountApplication | undefined> {
    const db = await getDb();
    const [updatedApplication] = await db
      .update(discountApplications)
      .set(application)
      .where(eq(discountApplications.id, id))
      .returning();
    return updatedApplication;
  }

  // ============================================
  // Staff Position Methods
  // ============================================

  async getAllStaffPositions(): Promise<StaffPosition[]> {
    const db = await getDb();
    return await db.select().from(staffPositions);
  }

  async getStaffPositionById(id: number): Promise<StaffPosition | undefined> {
    const db = await getDb();
    const [position] = await db.select().from(staffPositions).where(eq(staffPositions.id, id));
    return position;
  }

  async getStaffPositionsBySchoolId(schoolId: number | null): Promise<StaffPosition[]> {
    const db = await getDb();
    if (schoolId === null) {
      return await db.select().from(staffPositions).where(isNull(staffPositions.schoolId));
    }
    return await db.select().from(staffPositions).where(eq(staffPositions.schoolId, schoolId));
  }

  async createStaffPosition(position: InsertStaffPosition): Promise<StaffPosition> {
    const db = await getDb();
    const [newPosition] = await db.insert(staffPositions).values(position).returning();
    return newPosition;
  }

  async updateStaffPosition(id: number, position: Partial<InsertStaffPosition>): Promise<StaffPosition | undefined> {
    const db = await getDb();
    const [updatedPosition] = await db
      .update(staffPositions)
      .set(position)
      .where(eq(staffPositions.id, id))
      .returning();
    return updatedPosition;
  }

  async deleteStaffPosition(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(staffPositions).where(eq(staffPositions.id, id));
  }

  // ============================================
  // Staff Invitation Methods
  // ============================================

  async getAllStaffInvitations(): Promise<StaffInvitation[]> {
    const db = await getDb();
    return await db.select().from(staffInvitations);
  }

  async getStaffInvitationById(id: number): Promise<StaffInvitation | undefined> {
    const db = await getDb();
    const [invitation] = await db.select().from(staffInvitations).where(eq(staffInvitations.id, id));
    return invitation;
  }

  async getStaffInvitationByToken(token: string): Promise<StaffInvitation | undefined> {
    const db = await getDb();
    const [invitation] = await db.select().from(staffInvitations).where(eq(staffInvitations.token, token));
    return invitation;
  }

  async getStaffInvitationsBySchoolId(schoolId: number): Promise<StaffInvitation[]> {
    const db = await getDb();
    return await db.select().from(staffInvitations).where(eq(staffInvitations.schoolId, schoolId));
  }

  async getStaffInvitationsByEmail(email: string): Promise<StaffInvitation[]> {
    const db = await getDb();
    return await db.select().from(staffInvitations).where(eq(staffInvitations.email, email));
  }

  async createStaffInvitation(invitation: InsertStaffInvitation): Promise<StaffInvitation> {
    const db = await getDb();
    const [newInvitation] = await db.insert(staffInvitations).values(invitation).returning();
    return newInvitation;
  }

  async updateStaffInvitation(id: number, invitation: Partial<InsertStaffInvitation>): Promise<StaffInvitation | undefined> {
    const db = await getDb();
    const [updatedInvitation] = await db
      .update(staffInvitations)
      .set(invitation)
      .where(eq(staffInvitations.id, id))
      .returning();
    return updatedInvitation;
  }

  async deleteStaffInvitation(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(staffInvitations).where(eq(staffInvitations.id, id));
  }

  // ============================================
  // Password Reset Token Methods
  // ============================================

  async getPasswordResetTokenByToken(token: string): Promise<PasswordResetToken | undefined> {
    const db = await getDb();
    const [resetToken] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
    return resetToken;
  }

  async createPasswordResetToken(tokenData: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const db = await getDb();
    const [newToken] = await db.insert(passwordResetTokens).values(tokenData).returning();
    return newToken;
  }

  async markPasswordResetTokenAsUsed(token: string): Promise<void> {
    const db = await getDb();
    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.token, token));
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    const db = await getDb();
    const now = new Date();
    await db.delete(passwordResetTokens).where(
      and(
        eq(passwordResetTokens.used, false),
        lt(passwordResetTokens.expiresAt, now)
      )
    );
  }

  // ============================================
  // Role Invitation Methods
  // ============================================

  async getPendingRoleInvitationsByEmails(emails: string[]): Promise<Map<string, boolean>> {
    if (emails.length === 0) {
      return new Map();
    }

    const db = await getDb();
    const now = new Date();
    
    // Find all pending invitations for the given emails
    const pendingInvitations = await db
      .select({ email: roleInvitations.email })
      .from(roleInvitations)
      .where(
        and(
          inArray(roleInvitations.email, emails),
          eq(roleInvitations.isActive, true),
          isNull(roleInvitations.usedAt),
          gt(roleInvitations.expiresAt, now)
        )
      );

    // Build map of email -> true for emails with pending invitations
    const pendingMap = new Map<string, boolean>();
    for (const invitation of pendingInvitations) {
      pendingMap.set(invitation.email, true);
    }

    return pendingMap;
  }

  async getActiveRoleInvitation(tokenOrEmail: string): Promise<RoleInvitation | undefined> {
    const db = await getDb();
    const now = new Date();
    
    const [invitation] = await db
      .select()
      .from(roleInvitations)
      .where(
        and(
          or(
            eq(roleInvitations.token, tokenOrEmail),
            eq(roleInvitations.email, tokenOrEmail)
          ),
          eq(roleInvitations.isActive, true),
          isNull(roleInvitations.usedAt),
          gt(roleInvitations.expiresAt, now)
        )
      );
    
    return invitation;
  }

  async createRoleInvitation(invitation: InsertRoleInvitation & { invitedBy: number; token: string }): Promise<RoleInvitation> {
    const db = await getDb();
    const [newInvitation] = await db.insert(roleInvitations).values(invitation).returning();
    return newInvitation;
  }

  async updateRoleInvitation(id: number, updates: { token?: string; expiresAt?: Date; isActive?: boolean; usedAt?: Date | null }): Promise<RoleInvitation | undefined> {
    const db = await getDb();
    const [updatedInvitation] = await db
      .update(roleInvitations)
      .set(updates)
      .where(eq(roleInvitations.id, id))
      .returning();
    return updatedInvitation;
  }

  async acceptRoleInvitation(token: string, userEmail: string): Promise<RoleInvitation | undefined> {
    const db = await getDb();
    const now = new Date();
    
    const [updatedInvitation] = await db
      .update(roleInvitations)
      .set({ usedAt: now })
      .where(eq(roleInvitations.token, token))
      .returning();
    
    return updatedInvitation;
  }

  async getRoleInvitationsByInviter(inviterId: number): Promise<RoleInvitation[]> {
    const db = await getDb();
    return await db
      .select()
      .from(roleInvitations)
      .where(eq(roleInvitations.invitedBy, inviterId))
      .orderBy(desc(roleInvitations.createdAt));
  }

  async getRoleInvitations(): Promise<RoleInvitation[]> {
    const db = await getDb();
    return await db
      .select()
      .from(roleInvitations)
      .orderBy(desc(roleInvitations.createdAt));
  }

  // Notification data initialization from JSON files
  async initializeNotifications(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    const db = await getDb();

    try {
      await db.transaction(async (tx) => {
        let notificationsInserted = 0;
        let notificationsSkipped = 0;

        // Load and upsert notifications
        const notificationsFilePath = path.join(process.cwd(), 'data', 'notifications.json');
        if (fs.existsSync(notificationsFilePath)) {
          const notificationsData = JSON.parse(fs.readFileSync(notificationsFilePath, 'utf-8'));
          console.log(`📬 Seeding ${notificationsData.length} notifications from notifications.json`);

          for (const notification of notificationsData) {
            try {
              const result = await tx.insert(notifications)
                .values({
                  id: notification.id,
                  senderId: notification.senderId,
                  type: notification.type,
                  priority: notification.priority,
                  subject: notification.subject,
                  content: notification.content,
                  targetType: notification.targetType,
                  targetData: notification.targetData,
                  scheduledFor: notification.scheduledFor ? new Date(notification.scheduledFor) : null,
                  sentAt: notification.sentAt ? new Date(notification.sentAt) : null,
                  status: notification.status,
                  deliveryStats: notification.deliveryStats || {},
                  createdAt: new Date(notification.createdAt),
                  updatedAt: new Date(notification.updatedAt)
                })
                .onConflictDoNothing();
              
              if (result.rowCount && result.rowCount > 0) {
                notificationsInserted++;
              } else {
                notificationsSkipped++;
              }
            } catch (error) {
              console.error(`⚠️  Error inserting notification ${notification.id}:`, error);
              notificationsSkipped++;
            }
          }
          console.log(`✅ Notifications: ${notificationsInserted} inserted, ${notificationsSkipped} skipped (already exist)`);
          
          // Always reset the sequence to avoid duplicate key errors, even if no new records were inserted
          await tx.execute(sql`SELECT setval('notifications_id_seq', (SELECT COALESCE(MAX(id), 1) FROM notifications))`);
          console.log('✅ Reset notifications ID sequence');
        } else {
          console.log('📬 No notifications.json found, skipping notification seeding');
        }

        // Load and upsert notification recipients with validation
        let recipientsInserted = 0;
        let recipientsSkipped = 0;
        
        const recipientsFilePath = path.join(process.cwd(), 'data', 'notification-recipients.json');
        if (fs.existsSync(recipientsFilePath)) {
          const recipientsData = JSON.parse(fs.readFileSync(recipientsFilePath, 'utf-8'));
          console.log(`📬 Seeding ${recipientsData.length} notification recipients from notification-recipients.json`);

          // Pre-fetch valid notification IDs and user IDs for efficient validation
          const validNotificationIds = new Set(
            (await tx.select({ id: notifications.id }).from(notifications)).map(n => n.id)
          );
          const validUserIds = new Set(
            (await tx.select({ id: users.id }).from(users)).map(u => u.id)
          );

          for (const recipient of recipientsData) {
            try {
              // Validate foreign key references before attempting insert
              if (!validNotificationIds.has(recipient.notificationId)) {
                recipientsSkipped++;
                continue;
              }
              if (!validUserIds.has(recipient.recipientId)) {
                recipientsSkipped++;
                continue;
              }

              const result = await tx.insert(notificationRecipients)
                .values({
                  id: recipient.id,
                  notificationId: recipient.notificationId,
                  recipientId: recipient.recipientId,
                  deliveryType: recipient.deliveryType,
                  status: recipient.status || 'pending',
                  deliveredAt: recipient.deliveredAt ? new Date(recipient.deliveredAt) : null,
                  readAt: recipient.readAt ? new Date(recipient.readAt) : null,
                  createdAt: new Date(recipient.createdAt)
                })
                .onConflictDoNothing();
              
              if (result.rowCount && result.rowCount > 0) {
                recipientsInserted++;
              } else {
                recipientsSkipped++;
              }
            } catch (error) {
              console.error(`⚠️  Error inserting recipient ${recipient.id}:`, error);
              recipientsSkipped++;
            }
          }
          console.log(`✅ Recipients: ${recipientsInserted} inserted, ${recipientsSkipped} skipped (invalid refs or already exist)`);
          
          // Always reset the sequence to avoid duplicate key errors, even if no new records were inserted
          await tx.execute(sql`SELECT setval('notification_recipients_id_seq', (SELECT COALESCE(MAX(id), 1) FROM notification_recipients))`);
          console.log('✅ Reset notification_recipients ID sequence');
        } else {
          console.log('📬 No notification-recipients.json found, skipping recipient seeding');
        }
      });
    } catch (error) {
      console.error('❌ FATAL: Notification seeding failed, transaction rolled back:', error);
      throw error; // Re-throw to prevent silent failures
    }
  }

  // ============================================
  // Educator Class Assignment Methods (Phase 1a)
  // ============================================

  async getEducatorClassAssignmentById(id: number): Promise<EducatorClassAssignment | undefined> {
    const db = await getDb();
    const [assignment] = await db.select().from(educatorClassAssignments).where(eq(educatorClassAssignments.id, id));
    return assignment;
  }

  async getEducatorClassAssignmentsByEducatorId(educatorId: number): Promise<EducatorClassAssignment[]> {
    const db = await getDb();
    return db.select().from(educatorClassAssignments).where(eq(educatorClassAssignments.educatorId, educatorId));
  }

  async getEducatorClassAssignmentsByClassId(classId: number): Promise<EducatorClassAssignment[]> {
    const db = await getDb();
    return db.select().from(educatorClassAssignments).where(eq(educatorClassAssignments.classId, classId));
  }

  async getEducatorClassAssignmentsBySchoolId(schoolId: number): Promise<EducatorClassAssignment[]> {
    const db = await getDb();
    return db.select().from(educatorClassAssignments).where(eq(educatorClassAssignments.schoolId, schoolId));
  }

  async getActiveEducatorAssignmentForClass(educatorId: number, classId: number): Promise<EducatorClassAssignment | undefined> {
    const db = await getDb();
    const today = new Date().toISOString().split('T')[0];
    const [assignment] = await db.select().from(educatorClassAssignments)
      .where(
        and(
          eq(educatorClassAssignments.educatorId, educatorId),
          eq(educatorClassAssignments.classId, classId),
          or(
            isNull(educatorClassAssignments.validFrom),
            sql`${educatorClassAssignments.validFrom} <= ${today}`
          ),
          or(
            isNull(educatorClassAssignments.validTo),
            sql`${educatorClassAssignments.validTo} >= ${today}`
          )
        )
      );
    return assignment;
  }

  async createEducatorClassAssignment(assignment: InsertEducatorClassAssignment): Promise<EducatorClassAssignment> {
    const db = await getDb();
    const [newAssignment] = await db.insert(educatorClassAssignments).values({
      ...assignment,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newAssignment;
  }

  async updateEducatorClassAssignment(id: number, assignment: Partial<InsertEducatorClassAssignment>): Promise<EducatorClassAssignment | undefined> {
    const db = await getDb();
    const [updated] = await db
      .update(educatorClassAssignments)
      .set({ ...assignment, updatedAt: new Date() })
      .where(eq(educatorClassAssignments.id, id))
      .returning();
    return updated;
  }

  async deleteEducatorClassAssignment(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(educatorClassAssignments).where(eq(educatorClassAssignments.id, id));
  }

  // ============================================
  // Class Session Methods (Phase 1a)
  // ============================================

  async getClassSessionById(id: number): Promise<ClassSession | undefined> {
    const db = await getDb();
    const [session] = await db.select().from(classSessions).where(eq(classSessions.id, id));
    return session;
  }

  async getClassSessionsByClassId(classId: number): Promise<ClassSession[]> {
    const db = await getDb();
    return db.select().from(classSessions).where(eq(classSessions.classId, classId));
  }

  async getClassSessionsByEducatorId(educatorId: number): Promise<ClassSession[]> {
    const db = await getDb();
    return db.select().from(classSessions).where(eq(classSessions.educatorId, educatorId));
  }

  async getClassSessionsBySchoolId(schoolId: number): Promise<ClassSession[]> {
    const db = await getDb();
    return db.select().from(classSessions).where(eq(classSessions.schoolId, schoolId));
  }

  async getClassSessionsByDate(schoolId: number, date: string): Promise<ClassSession[]> {
    const db = await getDb();
    return db.select().from(classSessions)
      .where(
        and(
          eq(classSessions.schoolId, schoolId),
          eq(classSessions.scheduledDate, date)
        )
      );
  }

  async getClassSessionsByDateRange(schoolId: number, startDate: string, endDate: string): Promise<ClassSession[]> {
    const db = await getDb();
    return db.select().from(classSessions)
      .where(
        and(
          eq(classSessions.schoolId, schoolId),
          sql`${classSessions.scheduledDate} >= ${startDate}`,
          sql`${classSessions.scheduledDate} <= ${endDate}`
        )
      );
  }

  async getActiveClassSession(educatorId: number): Promise<ClassSession | undefined> {
    const db = await getDb();
    const [session] = await db.select().from(classSessions)
      .where(
        and(
          eq(classSessions.educatorId, educatorId),
          eq(classSessions.status, 'in_progress')
        )
      );
    return session;
  }

  async createClassSession(session: InsertClassSession): Promise<ClassSession> {
    const db = await getDb();
    const [newSession] = await db.insert(classSessions).values({
      ...session,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newSession;
  }

  async updateClassSession(id: number, session: Partial<InsertClassSession>): Promise<ClassSession | undefined> {
    const db = await getDb();
    const [updated] = await db
      .update(classSessions)
      .set({ ...session, updatedAt: new Date() })
      .where(eq(classSessions.id, id))
      .returning();
    return updated;
  }

  async deleteClassSession(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(classSessions).where(eq(classSessions.id, id));
  }

  // Educator Schedule methods (Phase 1b)
  async getEducatorScheduleById(id: number): Promise<EducatorSchedule | undefined> {
    const db = await getDb();
    const [schedule] = await db.select().from(educatorSchedules).where(eq(educatorSchedules.id, id));
    return schedule;
  }

  async getEducatorSchedulesByEducatorId(educatorId: number): Promise<EducatorSchedule[]> {
    const db = await getDb();
    return db.select().from(educatorSchedules)
      .where(eq(educatorSchedules.educatorId, educatorId))
      .orderBy(asc(educatorSchedules.dayOfWeek), asc(educatorSchedules.startTime));
  }

  async getEducatorSchedulesByClassId(classId: number): Promise<EducatorSchedule[]> {
    const db = await getDb();
    return db.select().from(educatorSchedules)
      .where(eq(educatorSchedules.classId, classId))
      .orderBy(asc(educatorSchedules.dayOfWeek), asc(educatorSchedules.startTime));
  }

  async getEducatorSchedulesBySchoolId(schoolId: number): Promise<EducatorSchedule[]> {
    const db = await getDb();
    return db.select().from(educatorSchedules)
      .where(eq(educatorSchedules.schoolId, schoolId))
      .orderBy(asc(educatorSchedules.educatorId), asc(educatorSchedules.dayOfWeek), asc(educatorSchedules.startTime));
  }

  async getEducatorSchedulesByAssignmentId(assignmentId: number): Promise<EducatorSchedule[]> {
    const db = await getDb();
    return db.select().from(educatorSchedules)
      .where(eq(educatorSchedules.assignmentId, assignmentId))
      .orderBy(asc(educatorSchedules.dayOfWeek), asc(educatorSchedules.startTime));
  }

  async getEducatorSchedulesForWeek(educatorId: number, weekStartDate: string): Promise<EducatorSchedule[]> {
    const db = await getDb();
    const weekEnd = new Date(weekStartDate);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    
    return db.select().from(educatorSchedules)
      .where(and(
        eq(educatorSchedules.educatorId, educatorId),
        eq(educatorSchedules.isActive, true),
        or(
          isNull(educatorSchedules.effectiveTo),
          sql`${educatorSchedules.effectiveTo} >= ${weekStartDate}`
        ),
        sql`${educatorSchedules.effectiveFrom} <= ${weekEndStr}`
      ))
      .orderBy(asc(educatorSchedules.dayOfWeek), asc(educatorSchedules.startTime));
  }

  async createEducatorSchedule(schedule: InsertEducatorSchedule): Promise<EducatorSchedule> {
    const db = await getDb();
    const [newSchedule] = await db.insert(educatorSchedules).values(schedule).returning();
    return newSchedule;
  }

  async updateEducatorSchedule(id: number, schedule: Partial<InsertEducatorSchedule>): Promise<EducatorSchedule | undefined> {
    const db = await getDb();
    const [updated] = await db.update(educatorSchedules)
      .set({ ...schedule, updatedAt: new Date() })
      .where(eq(educatorSchedules.id, id))
      .returning();
    return updated;
  }

  async deleteEducatorSchedule(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(educatorSchedules).where(eq(educatorSchedules.id, id));
  }

  // Audit Log methods (Phase 1b)
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const db = await getDb();
    const [newLog] = await db.insert(auditLogs).values(log).returning();
    return newLog;
  }

  async getAuditLogsByTargetId(targetType: string, targetId: string): Promise<AuditLog[]> {
    const db = await getDb();
    return db.select().from(auditLogs)
      .where(and(
        eq(auditLogs.targetType, targetType),
        eq(auditLogs.targetId, targetId)
      ))
      .orderBy(desc(auditLogs.createdAt));
  }

  async getAuditLogsByActorId(actorId: number): Promise<AuditLog[]> {
    const db = await getDb();
    return db.select().from(auditLogs)
      .where(eq(auditLogs.actorId, actorId))
      .orderBy(desc(auditLogs.createdAt));
  }

  async getAuditLogsBySchoolId(
    schoolId: number, 
    filters?: { actionType?: string; severity?: string; startDate?: string; endDate?: string }
  ): Promise<AuditLog[]> {
    const db = await getDb();
    const conditions: any[] = [eq(auditLogs.schoolId, schoolId)];
    
    if (filters?.actionType) {
      conditions.push(eq(auditLogs.actionType, filters.actionType));
    }
    if (filters?.severity) {
      conditions.push(eq(auditLogs.severity, filters.severity));
    }
    if (filters?.startDate) {
      conditions.push(sql`${auditLogs.createdAt} >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      conditions.push(sql`${auditLogs.createdAt} <= ${filters.endDate}`);
    }
    
    return db.select().from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt));
  }
}