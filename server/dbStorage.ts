import { eq, and, desc, asc, like, or, sql, lt, gt, lte, gte, isNull, inArray, ilike } from 'drizzle-orm';
import { normalizeEmailForLookup } from '@shared/parent-identity';
import { normalizeSchoolFeatures } from './lib/school-features';
import { getDb } from './db';
import { IStorage, type InsertPaymentReminderLog, type PaymentReminderLog } from './storage';
import {
  createLocationCore,
  deleteLocationCore,
  getAllLocationsCore,
  getLocationCore,
  getLocationsBySchoolIdCore,
  updateLocationCore,
} from './lib/location-db';
import { getAllSchoolsCore, getSchoolCoreById, insertSchoolCore } from './lib/school-db';
import * as apDb from './lib/assessment-progress-db';
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
  schoolClasses,
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
  UserSchoolPermission, InsertUserSchoolPermission, userSchoolPermissions,
  Notification, InsertNotification, notifications,
  NotificationRecipient, InsertNotificationRecipient, notificationRecipients,
  Discount, InsertDiscount, discounts,
  DiscountApplication, InsertDiscountApplication, discountApplications,
  FamilyPaymentPlan, InsertFamilyPaymentPlan, familyPaymentPlans,
  EnrollmentPriceHistory, InsertEnrollmentPriceHistory, enrollmentPriceHistory,
  StaffPosition, InsertStaffPosition, staffPositions,
  StaffInvitation, InsertStaffInvitation, staffInvitations,
  PasswordResetToken, InsertPasswordResetToken, passwordResetTokens,
  RoleInvitation, InsertRoleInvitation, roleInvitations,
  credits,
  unifiedCreditUsageLogs,
  creditHolds,
  stripePaymentHistory,
  type Credit,
  type InsertCredit,
  type CreditStatus,
  type CreditType,
  type UnifiedCreditUsageLog,
  type InsertUnifiedCreditUsageLog,
  type CreditHold,
  type InsertCreditHold,
  type CreditHoldStatus,
  type StripePaymentHistory,
  type InsertStripePaymentHistory,
  technicalSupportIssues,
  type TechnicalSupportIssue,
  type InsertTechnicalSupportIssue,
} from '../shared/schema';
import { sqlStripeHistoryUserAtSchool } from './lib/admin-school-context';

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
    const normalized = normalizeEmailForLookup(email);
    if (!normalized) return undefined;
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(trim(${users.email})) = ${normalized}`)
      .limit(1);
    return user;
  }

  async getUserBySupabaseId(supabaseId: string): Promise<User | undefined> {
    const id = supabaseId?.trim();
    if (!id) return undefined;
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.supabaseId, id)).limit(1);
    return user;
  }

  async getUserByAuth0Id(auth0Id: string): Promise<User | undefined> {
    const id = auth0Id?.trim();
    if (!id) return undefined;
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.auth0Id, id)).limit(1);
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

  async searchUsers(params: {
    schoolId: number | null;
    query?: string;
    role?: string;
    limit: number;
    offset: number;
  }): Promise<{ users: User[]; total: number }> {
    const db = await getDb();
    const limit = Math.max(1, Math.min(params.limit, 100));
    const offset = Math.max(0, params.offset);
    const qRaw = (params.query ?? "").trim();
    const escapeIlike = (s: string) => s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

    const conditions: any[] = [];

    if (params.schoolId != null && Number.isFinite(Number(params.schoolId))) {
      const sid = Number(params.schoolId);
      const roleRows = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.schoolId, sid));
      const rawIds = roleRows.map((r: { userId: number | null }) => r.userId).filter((id: number | null): id is number => id != null);
      const userIdsFromRoles = [...new Set(rawIds)];

      // Include parents linked only via children/enrollments at this school (legacy school_id mismatch).
      const schoolScopeParts: ReturnType<typeof eq>[] = [
        eq(users.schoolId, sid),
        sql`lower(trim(${users.email})) IN (
          SELECT lower(trim(c.parent_email)) FROM children c
          WHERE c.school_id = ${sid} AND c.parent_email IS NOT NULL AND trim(c.parent_email) <> ''
        )`,
        sql`${users.id} IN (
          SELECT me.parent_user_id FROM membership_enrollments me WHERE me.school_id = ${sid}
        )`,
        sql`lower(trim(${users.email})) IN (
          SELECT lower(trim(pe.parent_email)) FROM program_enrollments pe
          WHERE pe.school_id = ${sid} AND pe.parent_email IS NOT NULL AND trim(pe.parent_email) <> ''
        )`,
      ];
      if (userIdsFromRoles.length > 0) {
        schoolScopeParts.push(inArray(users.id, userIdsFromRoles));
      }
      conditions.push(or(...schoolScopeParts));
    }

    if (qRaw.length > 0) {
      const pat = `%${escapeIlike(qRaw)}%`;
      conditions.push(
        or(
          ilike(users.email, pat),
          ilike(users.name, pat),
          ilike(users.firstName, pat),
          ilike(users.lastName, pat),
        ),
      );
    }

    if (params.role) {
      const r = params.role;
      conditions.push(sql`((${users.role})::text = ${r} OR coalesce(${users.activeRole}, '') = ${r})`);
    }

    const whereExpr = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);

    const countBase = db.select({ c: sql<number>`count(*)::int` }).from(users);
    const [countRow] = whereExpr ? await countBase.where(whereExpr) : await countBase;
    const total = Number(countRow?.c ?? 0);

    const selectBase = db.select().from(users).orderBy(asc(users.email)).limit(limit).offset(offset);
    const rows = whereExpr ? await selectBase.where(whereExpr) : await selectBase;

    return { users: rows as User[], total };
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
    try {
      const db = await getDb();
      const [school] = await db.select().from(schools).where(eq(schools.id, id));
      return school;
    } catch (error) {
      console.warn(`getSchool(${id}) drizzle fallback:`, error instanceof Error ? error.message : error);
      return (await getSchoolCoreById(id)) as School | undefined;
    }
  }

  async getSchoolFeatures(schoolId: number): Promise<Record<string, boolean>> {
    const db = await getDb();
    try {
      const result = await db.execute(sql`
        SELECT enabled_features AS features FROM schools WHERE id = ${schoolId} LIMIT 1
      `);
      const row = result.rows[0] as { features?: unknown } | undefined;
      return normalizeSchoolFeatures(row?.features ?? {});
    } catch (err: unknown) {
      console.warn(`getSchoolFeatures: lookup failed for school ${schoolId}`, err);
      return normalizeSchoolFeatures({});
    }
  }

  async updateSchoolFeatures(schoolId: number, features: Record<string, boolean>): Promise<void> {
    const db = await getDb();
    await db.execute(sql`
      UPDATE schools
      SET enabled_features = ${JSON.stringify(features)}::jsonb,
          updated_at = NOW()
      WHERE id = ${schoolId}
    `);
  }

  async getSchoolByCode(registrationCode: string): Promise<School | undefined> {
    const normalized = registrationCode.trim();
    if (!normalized) {
      return undefined;
    }
    try {
      const { getSchoolCoreByRegistrationCode } = await import('./lib/school-db');
      const core = await getSchoolCoreByRegistrationCode(normalized);
      if (core) {
        return core as School;
      }
    } catch (error) {
      console.warn(
        'getSchoolByCode core lookup failed:',
        error instanceof Error ? error.message : error,
      );
    }
    try {
      const db = await getDb();
      const [school] = await db
        .select()
        .from(schools)
        .where(sql`LOWER(TRIM(${schools.registrationCode})) = LOWER(${normalized})`)
        .limit(1);
      return school;
    } catch (error) {
      const all = await getAllSchoolsCore();
      return all.find(
        (s) => s.registrationCode?.toLowerCase() === normalized.toLowerCase(),
      ) as School | undefined;
    }
  }

  async getAllSchools(): Promise<School[]> {
    try {
      const db = await getDb();
      return await db.select().from(schools);
    } catch (error) {
      console.warn('getAllSchools drizzle fallback:', error instanceof Error ? error.message : error);
      return (await getAllSchoolsCore()) as School[];
    }
  }

  async createSchool(schoolData: InsertSchool & { adminId: number }): Promise<School> {
    try {
      const db = await getDb();
      const [newSchool] = await db.insert(schools).values({
        ...schoolData,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      return newSchool;
    } catch (error) {
      console.warn('createSchool drizzle fallback:', error instanceof Error ? error.message : error);
      const created = await insertSchoolCore({
        name: schoolData.name,
        type: schoolData.type,
        adminId: schoolData.adminId,
        address: schoolData.address ?? null,
        city: schoolData.city,
        state: schoolData.state,
        zipCode: schoolData.zipCode,
        phoneNumber: schoolData.phoneNumber ?? null,
        email: schoolData.email,
        website: schoolData.website ?? null,
        description: schoolData.description ?? null,
        foundedYear: schoolData.foundedYear ?? null,
        accreditation: schoolData.accreditation ?? null,
        enrollmentSize: schoolData.enrollmentSize ?? null,
        registrationCode: schoolData.registrationCode ?? `SCH${Date.now()}`,
        status: schoolData.status ?? 'active',
      });
      return created as School;
    }
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

  async createUserRole(role: {
    userId: number;
    role: string;
    schoolId?: number | null;
    isPrimary?: boolean;
  }): Promise<UserRole> {
    const db = await getDb();
    const [created] = await db
      .insert(userRoles)
      .values({
        userId: role.userId,
        role: role.role,
        schoolId: role.schoolId ?? null,
        isPrimary: role.isPrimary ?? false,
      })
      .returning();

    if (role.isPrimary) {
      await db
        .update(users)
        .set({ activeRoleId: created.id })
        .where(eq(users.id, role.userId));
    }

    return created;
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
        enrollmentOpen: classes.enrollmentOpen,
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
    // Never send `id` on insert — serial PK must come from Postgres; a stale or
    // mem-sourced id causes 23505 duplicate key (classes_pkey) on shared DBs.
    const { id: _ignoredId, ...insertPayload } = classData as InsertClass & { id?: number };
    const [newClass] = await db.insert(classes).values({
      ...insertPayload,
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
        enrollmentOpen: classes.enrollmentOpen,
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
        enrollmentOpen: classes.enrollmentOpen,
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
      if (!child || child.parentId !== parentUserId) {
        errors.push(`Enrollment ${enrollment.id} does not belong to this parent`);
        continue;
      }

      // Skip if enrollment has been paid
      const paid = enrollment.totalPaid ?? 0;
      if (paid > 0) {
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

    const expirationDate = new Date(membershipYear, 11, 31);
    const enrollmentData: InsertMembershipEnrollment = {
      schoolId,
      parentUserId,
      membershipYear,
      amount: 6000, // $60 in cents
      amountPaid: 0,
      remainingBalance: 6000,
      totalAmount: 6000,
      balanceDue: 6000,
      status: 'pending_payment',
      dueDate: new Date(),
      expirationDate,
      endDate: expirationDate,
      membershipTier: 'basic',
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      startDate: null,
      renewalDate: null,
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

  async getSchoolDocumentByShareToken(shareToken: string): Promise<SchoolDocument | undefined> {
    const db = await getDb();
    const [document] = await db
      .select()
      .from(schoolDocuments)
      .where(eq(schoolDocuments.shareToken, shareToken));
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

  async getChildrenByParentId(parentId: number): Promise<Child[]> {
    return this.getChildrenByParent(parentId);
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
    const normalized = normalizeEmailForLookup(parentEmail);
    if (!normalized) return [];

    const parent = await this.getUserByEmail(parentEmail);
    const byParentId = parent
      ? await db.select().from(children).where(eq(children.parentId, parent.id))
      : [];

    const byDenormalizedEmail = await db
      .select()
      .from(children)
      .where(sql`lower(trim(${children.parentEmail})) = ${normalized}`);

    const map = new Map<number, Child>();
    for (const c of [...byParentId, ...byDenormalizedEmail]) {
      map.set(c.id, c);
    }
    return [...map.values()];
  }

  // Emergency Contact methods
  async getEmergencyContact(id: number): Promise<EmergencyContact | undefined> {
    const db = await getDb();
    const [contact] = await db.select().from(emergencyContacts).where(eq(emergencyContacts.id, id));
    return contact;
  }

  /** IStorage alias — emergency contacts are keyed by parent user id. */
  async getEmergencyContactById(id: number): Promise<EmergencyContact | undefined> {
    return this.getEmergencyContact(id);
  }

  async getEmergencyContactsByParent(parentId: number): Promise<EmergencyContact[]> {
    const db = await getDb();
    return await db.select().from(emergencyContacts).where(eq(emergencyContacts.userId, parentId));
  }

  /** IStorage alias — same as getEmergencyContactsByParent. */
  async getEmergencyContactsByUserId(userId: number): Promise<EmergencyContact[]> {
    return this.getEmergencyContactsByParent(userId);
  }

  async createEmergencyContact(
    contact: InsertEmergencyContact & { userId: number },
  ): Promise<EmergencyContact> {
    const db = await getDb();
    const [newContact] = await db
      .insert(emergencyContacts)
      .values({
        userId: contact.userId,
        firstName: contact.firstName,
        lastName: contact.lastName,
        relationship: contact.relationship,
        phoneNumber: contact.phoneNumber,
        email: contact.email?.trim() ? contact.email.trim() : null,
        isAuthorizedPickup: contact.isAuthorizedPickup ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
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
    const normalized = normalizeEmailForLookup(parentEmail);
    if (!normalized) return [];
    return await db
      .select()
      .from(payments)
      .where(sql`lower(trim(${payments.parentEmail})) = ${normalized}`);
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

  /**
   * Parent manual pay: only one in-flight charge per installment. Autopay uses `charged_by = auto_pay`;
   * this path uses `parent_manual` so we do not steal rows mid–off-session charge.
   */
  async claimScheduledPaymentForParentCharge(
    id: number,
    parentId: number,
  ): Promise<ScheduledPayment | undefined> {
    const db = await getDb();
    const [row] = await db
      .update(scheduledPayments)
      .set({
        status: 'processing',
        chargedBy: 'parent_manual',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(scheduledPayments.id, id),
          eq(scheduledPayments.parentId, parentId),
          sql`${scheduledPayments.status} in ('pending', 'overdue', 'failed')`,
        ),
      )
      .returning();
    return row;
  }

  async releaseScheduledPaymentParentClaim(
    id: number,
    parentId: number,
  ): Promise<ScheduledPayment | undefined> {
    const db = await getDb();
    const [row] = await db
      .update(scheduledPayments)
      .set({
        status: 'pending',
        chargedBy: null,
        stripePaymentIntentId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(scheduledPayments.id, id),
          eq(scheduledPayments.parentId, parentId),
          eq(scheduledPayments.status, 'processing'),
          eq(scheduledPayments.chargedBy, 'parent_manual'),
        ),
      )
      .returning();
    return row;
  }

  async getScheduledPaymentsByParentEmail(parentEmail: string): Promise<ScheduledPayment[]> {
    const db = await getDb();
    const normalized = normalizeEmailForLookup(parentEmail);
    if (!normalized) return [];
    return await db
      .select()
      .from(scheduledPayments)
      .where(sql`lower(trim(${scheduledPayments.parentEmail})) = ${normalized}`)
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

  async deleteScheduledPayment(id: number): Promise<void> {
    const db = await getDb();
    await db.delete(scheduledPayments).where(eq(scheduledPayments.id, id));
  }

  /**
   * Admin payment-plan changes: drop installments that are not yet completed so a new schedule can be created.
   * Keeps `completed` rows for payment history.
   */
  async deletePendingScheduledPaymentsByEnrollmentId(enrollmentId: number): Promise<number> {
    const db = await getDb();
    const deleted = await db
      .delete(scheduledPayments)
      .where(
        and(
          eq(scheduledPayments.enrollmentId, enrollmentId),
          sql`${scheduledPayments.status} in ('pending', 'overdue', 'failed', 'processing')`,
        ),
      )
      .returning({ id: scheduledPayments.id });
    return deleted.length;
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

  // Location methods — raw postgres (avoids Drizzle execute/select issues on Replit)
  async getLocation(id: number): Promise<Location | undefined> {
    return getLocationCore(id);
  }

  async getLocationsBySchoolId(schoolId: number): Promise<Location[]> {
    return getLocationsBySchoolIdCore(schoolId);
  }

  async getAllLocations(): Promise<Location[]> {
    return getAllLocationsCore();
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    return createLocationCore(location);
  }

  async updateLocation(id: number, location: Partial<InsertLocation>): Promise<Location | undefined> {
    return updateLocationCore(id, location);
  }

  async deleteLocation(id: number): Promise<void> {
    return deleteLocationCore(id);
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

  async getHiddenCategoryIds(): Promise<number[]> {
    const db = await getDb();
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.isPublic, false), eq(categories.isActive, true)));
    return rows.map(r => r.id);
  }

  async getAllCategories(): Promise<Category[]> {
    const db = await getDb();
    return await db.select().from(categories).where(eq(categories.isActive, true));
  }

  async getHiddenCategoryIds(): Promise<number[]> {
    const db = await getDb();
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.isPublic, false), eq(categories.isActive, true)));
    return rows.map((row) => row.id);
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

  async getUserLocationByUserAndLocation(
    userId: number,
    locationId: number,
  ): Promise<UserLocation | undefined> {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(userLocations)
      .where(and(eq(userLocations.userId, userId), eq(userLocations.locationId, locationId)))
      .limit(1);
    return row;
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

  async getUserSchoolPermissionById(id: number): Promise<UserSchoolPermission | undefined> {
    const db = await getDb();
    const [row] = await db.select().from(userSchoolPermissions).where(eq(userSchoolPermissions.id, id));
    return row;
  }

  async getUserSchoolPermissionByUserAndSchool(
    userId: number,
    schoolId: number,
  ): Promise<UserSchoolPermission | undefined> {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(userSchoolPermissions)
      .where(
        and(
          eq(userSchoolPermissions.userId, userId),
          eq(userSchoolPermissions.schoolId, schoolId),
          eq(userSchoolPermissions.isActive, true),
        ),
      );
    return row;
  }

  async getUserSchoolPermissionRowByUserAndSchool(
    userId: number,
    schoolId: number,
  ): Promise<UserSchoolPermission | undefined> {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(userSchoolPermissions)
      .where(
        and(
          eq(userSchoolPermissions.userId, userId),
          eq(userSchoolPermissions.schoolId, schoolId),
        ),
      );
    return row;
  }

  async getUserSchoolPermissionsBySchoolId(schoolId: number): Promise<UserSchoolPermission[]> {
    const db = await getDb();
    return await db
      .select()
      .from(userSchoolPermissions)
      .where(
        and(eq(userSchoolPermissions.schoolId, schoolId), eq(userSchoolPermissions.isActive, true)),
      )
      .orderBy(asc(userSchoolPermissions.createdAt));
  }

  async createUserSchoolPermission(
    permission: InsertUserSchoolPermission,
  ): Promise<UserSchoolPermission> {
    const db = await getDb();
    const [row] = await db
      .insert(userSchoolPermissions)
      .values({
        ...permission,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return row;
  }

  async updateUserSchoolPermission(
    id: number,
    permission: Partial<InsertUserSchoolPermission>,
  ): Promise<UserSchoolPermission | undefined> {
    const db = await getDb();
    const [row] = await db
      .update(userSchoolPermissions)
      .set({ ...permission, updatedAt: new Date() })
      .where(eq(userSchoolPermissions.id, id))
      .returning();
    return row;
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

  async getSentNotificationsBySchool(schoolId: number): Promise<Notification[]> {
    const db = await getDb();
    const rows = await db
      .select({ n: notifications })
      .from(notifications)
      .innerJoin(
        userRoles,
        and(eq(userRoles.userId, notifications.senderId), eq(userRoles.schoolId, schoolId)),
      )
      .orderBy(desc(notifications.createdAt));

    const seen = new Set<number>();
    const result: Notification[] = [];
    for (const row of rows) {
      if (seen.has(row.n.id)) continue;
      seen.add(row.n.id);
      result.push(row.n as Notification);
    }
    return result;
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

  async getDiscountUsageCountByUser(discountId: number, parentEmail: string): Promise<number> {
    const db = await getDb();
    const normalized = normalizeEmailForLookup(parentEmail);
    if (!normalized) {
      return 0;
    }
    const [row] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(discountApplications)
      .where(
        and(
          eq(discountApplications.discountId, discountId),
          sql`LOWER(TRIM(${discountApplications.parentEmail})) = ${normalized}`,
        ),
      );
    return row?.c ?? 0;
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
  // F001: Family payment plans
  // ============================================

  async createFamilyPaymentPlan(plan: InsertFamilyPaymentPlan): Promise<FamilyPaymentPlan> {
    const db = await getDb();
    const now = new Date();
    const [row] = await db
      .insert(familyPaymentPlans)
      .values({
        ...plan,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row;
  }

  async getFamilyPaymentPlan(id: number): Promise<FamilyPaymentPlan | undefined> {
    const db = await getDb();
    const [row] = await db.select().from(familyPaymentPlans).where(eq(familyPaymentPlans.id, id));
    return row;
  }

  async getFamilyPaymentPlansByParent(parentId: number, schoolId: number): Promise<FamilyPaymentPlan[]> {
    const db = await getDb();
    return await db
      .select()
      .from(familyPaymentPlans)
      .where(
        and(
          eq(familyPaymentPlans.parentId, parentId),
          eq(familyPaymentPlans.schoolId, schoolId),
          inArray(familyPaymentPlans.status, ["active", "recalculating"]),
        ),
      )
      .orderBy(desc(familyPaymentPlans.createdAt));
  }

  async updateFamilyPaymentPlan(
    id: number,
    plan: Partial<InsertFamilyPaymentPlan>,
  ): Promise<FamilyPaymentPlan | undefined> {
    const db = await getDb();
    const [row] = await db
      .update(familyPaymentPlans)
      .set({ ...plan, updatedAt: new Date() })
      .where(eq(familyPaymentPlans.id, id))
      .returning();
    return row;
  }

  /** Safeguard 2: 5-minute lock auto-expire; same operationId may re-acquire. */
  async acquireFamilyPlanLock(planId: number, operationId: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.execute(sql`
      UPDATE family_payment_plans
      SET locked_at = NOW(),
          locked_by = ${operationId},
          updated_at = NOW()
      WHERE id = ${planId}
        AND (
          locked_at IS NULL
          OR locked_by = ${operationId}
          OR locked_at < NOW() - INTERVAL '5 minutes'
        )
      RETURNING id
    `);
    return result.rows.length > 0;
  }

  async releaseFamilyPlanLock(planId: number, operationId: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.execute(sql`
      UPDATE family_payment_plans
      SET locked_at = NULL,
          locked_by = NULL,
          updated_at = NOW()
      WHERE id = ${planId}
        AND locked_by = ${operationId}
      RETURNING id
    `);
    return result.rows.length > 0;
  }

  // ============================================
  // F001: Enrollment price history
  // ============================================

  async createPriceHistoryEntry(entry: InsertEnrollmentPriceHistory): Promise<EnrollmentPriceHistory> {
    const db = await getDb();
    const [row] = await db.insert(enrollmentPriceHistory).values(entry).returning();
    return row;
  }

  async getPriceHistory(enrollmentId: number): Promise<EnrollmentPriceHistory[]> {
    const db = await getDb();
    return await db
      .select()
      .from(enrollmentPriceHistory)
      .where(eq(enrollmentPriceHistory.enrollmentId, enrollmentId))
      .orderBy(desc(enrollmentPriceHistory.effectiveDate), desc(enrollmentPriceHistory.createdAt));
  }

  /** Safeguard 3: sum completed payment rows that reference this enrollment. */
  async getTotalPaidForEnrollment(enrollmentId: number): Promise<number> {
    const db = await getDb();
    const [row] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${payments.amount}), 0)::int`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.status, "completed"),
          sql`${payments.enrollmentIds} @> ${JSON.stringify([enrollmentId])}::jsonb`,
        ),
      );
    return row?.total ?? 0;
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

  async getParentsBySchoolId(schoolId: number): Promise<User[]> {
    const { users: matched } = await this.searchUsers({
      schoolId,
      role: 'parent',
      limit: 500,
      offset: 0,
    });
    return matched.filter((u) => u.isActive !== false);
  }

  async getCreditById(id: number): Promise<Credit | undefined> {
    const db = await getDb();
    const [credit] = await db.select().from(credits).where(eq(credits.id, id));
    return credit;
  }

  async getCredits(filters: {
    userId?: number;
    schoolId?: number;
    creditType?: CreditType;
    status?: CreditStatus;
    includeExpired?: boolean;
  }): Promise<Credit[]> {
    const db = await getDb();
    const conditions = [];
    if (filters.userId) conditions.push(eq(credits.userId, filters.userId));
    if (filters.schoolId) conditions.push(eq(credits.schoolId, filters.schoolId));
    if (filters.creditType) conditions.push(eq(credits.creditType, filters.creditType));
    if (filters.status) conditions.push(eq(credits.status, filters.status));
    if (!filters.includeExpired) {
      const now = new Date();
      conditions.push(or(isNull(credits.expiresAt), gt(credits.expiresAt, now)));
    }
    if (conditions.length === 0) {
      return db.select().from(credits).orderBy(desc(credits.createdAt));
    }
    return db.select().from(credits).where(and(...conditions)).orderBy(desc(credits.createdAt));
  }

  async createCredit(credit: InsertCredit): Promise<Credit> {
    const db = await getDb();
    const [newCredit] = await db.insert(credits).values(credit).returning();
    return newCredit;
  }

  async updateCredit(
    id: number,
    updates: Partial<InsertCredit> & {
      usedAmountCents?: number;
      status?: CreditStatus;
      approvedBy?: number;
      approvedAt?: Date;
      expiresAt?: Date;
    }
  ): Promise<Credit | undefined> {
    const db = await getDb();
    const [updated] = await db
      .update(credits)
      .set({ ...updates, updatedAt: new Date() } as Record<string, unknown>)
      .where(eq(credits.id, id))
      .returning();
    return updated;
  }

  async approveCredit(id: number, approvedBy: number): Promise<Credit | undefined> {
    const db = await getDb();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const [updated] = await db
      .update(credits)
      .set({
        status: 'approved' as CreditStatus,
        approvedBy,
        approvedAt: new Date(),
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(credits.id, id))
      .returning();
    return updated;
  }

  async rejectCredit(id: number, approvedBy: number, reason: string): Promise<Credit | undefined> {
    const db = await getDb();
    const [updated] = await db
      .update(credits)
      .set({
        status: 'rejected' as CreditStatus,
        approvedBy,
        approvedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(credits.id, id))
      .returning();
    return updated;
  }

  async revokeCredit(id: number, reason: string): Promise<Credit | undefined> {
    const db = await getDb();
    const [updated] = await db
      .update(credits)
      .set({
        status: 'revoked' as CreditStatus,
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(credits.id, id))
      .returning();

    if (updated) {
      await db
        .update(creditHolds)
        .set({ status: 'released' as CreditHoldStatus, releasedAt: new Date() })
        .where(and(eq(creditHolds.creditId, id), eq(creditHolds.status, 'pending')));
    }

    return updated;
  }

  async getAvailableCredits(userId: number): Promise<Credit[]> {
    const db = await getDb();
    const now = new Date();
    return db
      .select()
      .from(credits)
      .where(
        and(
          eq(credits.userId, userId),
          or(eq(credits.status, 'approved'), eq(credits.status, 'partially_used')),
          or(isNull(credits.expiresAt), gt(credits.expiresAt, now))
        )
      )
      .orderBy(asc(credits.expiresAt));
  }

  async getTotalAvailableCredits(userId: number): Promise<number> {
    const availableCredits = await this.getAvailableCredits(userId);
    const totalUnused = availableCredits.reduce(
      (total, credit) => total + (credit.creditAmountCents - credit.usedAmountCents),
      0
    );
    const heldCredits = await this.getTotalHeldCreditsForUser(userId);
    return Math.max(0, totalUnused - heldCredits);
  }

  async getPendingCredits(schoolId: number, creditType?: CreditType): Promise<Credit[]> {
    const db = await getDb();
    const conditions = [eq(credits.schoolId, schoolId), eq(credits.status, 'pending')];
    if (creditType) conditions.push(eq(credits.creditType, creditType));
    return db.select().from(credits).where(and(...conditions)).orderBy(asc(credits.createdAt));
  }

  async useCredits(
    userId: number,
    amountCents: number,
    paymentHistoryId?: number,
    description?: string
  ): Promise<{ usedCredits: UnifiedCreditUsageLog[]; totalUsed: number }> {
    const db = await getDb();
    const availableCredits = await this.getAvailableCredits(userId);
    let remainingAmount = amountCents;
    const usedCredits: UnifiedCreditUsageLog[] = [];
    for (const credit of availableCredits) {
      if (remainingAmount <= 0) break;
      const availableFromCredit = credit.creditAmountCents - credit.usedAmountCents;
      const amountToUse = Math.min(availableFromCredit, remainingAmount);
      if (amountToUse > 0) {
        const [usageLog] = await db
          .insert(unifiedCreditUsageLogs)
          .values({
            creditId: credit.id,
            paymentHistoryId: paymentHistoryId || null,
            amountCents: amountToUse,
            description: description || null,
          })
          .returning();
        usedCredits.push(usageLog);
        const newUsedAmount = credit.usedAmountCents + amountToUse;
        const newStatus: CreditStatus =
          newUsedAmount >= credit.creditAmountCents ? 'used' : 'partially_used';
        await db
          .update(credits)
          .set({ usedAmountCents: newUsedAmount, status: newStatus, updatedAt: new Date() })
          .where(eq(credits.id, credit.id));
        remainingAmount -= amountToUse;
      }
    }
    const totalUsed = amountCents - remainingAmount;
    return { usedCredits, totalUsed };
  }

  async restoreCredits(usageLogs: UnifiedCreditUsageLog[]): Promise<{ restoredCount: number; totalRestored: number }> {
    const db = await getDb();
    let totalRestored = 0;
    let restoredCount = 0;
    for (const log of usageLogs) {
      try {
        const [credit] = await db.select().from(credits).where(eq(credits.id, log.creditId));
        if (credit) {
          const newUsedAmount = Math.max(0, credit.usedAmountCents - log.amountCents);
          const newStatus: CreditStatus =
            newUsedAmount === 0
              ? 'approved'
              : newUsedAmount < credit.creditAmountCents
                ? 'partially_used'
                : 'used';
          await db
            .update(credits)
            .set({ usedAmountCents: newUsedAmount, status: newStatus, updatedAt: new Date() })
            .where(eq(credits.id, credit.id));
          await db.delete(unifiedCreditUsageLogs).where(eq(unifiedCreditUsageLogs.id, log.id));
          totalRestored += log.amountCents;
          restoredCount++;
        }
      } catch {
        /* continue */
      }
    }
    return { restoredCount, totalRestored };
  }

  async completeCreditsOnlyPayment(params: {
    holdSessionId: string;
    scheduledPaymentId: number;
    parentId: number;
    enrollmentId: number | null;
    schoolId: number | null;
    creditsApplied: number;
    originalAmount: number;
    installmentNumber: number;
    totalInstallments: number;
    parentEmail: string;
    childName: string | null;
    className: string | null;
    chargedBy?: 'auto_pay' | 'parent_manual' | 'parent_manual_saved_card' | 'admin_manual';
    completionSource?: string;
    description?: string;
  }): Promise<void> {
    const db = await getDb();
    const {
      holdSessionId,
      scheduledPaymentId,
      parentId,
      enrollmentId,
      schoolId,
      creditsApplied,
      originalAmount,
      installmentNumber,
      totalInstallments,
      parentEmail,
      childName,
      className,
    } = params;
    const chargedBy = params.chargedBy ?? 'auto_pay';
    const completionSource = params.completionSource ?? 'credits_only';
    const initiator = chargedBy === 'auto_pay' ? 'Auto-pay' : 'Parent';
    const description =
      params.description ??
      `${initiator} installment ${installmentNumber}/${totalInstallments} — fully covered by credits`;

    await db.transaction(async (tx) => {
      const pendingHolds = await tx
        .select()
        .from(creditHolds)
        .where(and(eq(creditHolds.checkoutSessionId, holdSessionId), eq(creditHolds.status, 'pending')));

      for (const hold of pendingHolds) {
        const [credit] = await tx.select().from(credits).where(eq(credits.id, hold.creditId));
        if (!credit) continue;
        const newUsed = credit.usedAmountCents + hold.amountCents;
        const newStatus: CreditStatus = newUsed >= credit.creditAmountCents ? 'used' : 'partially_used';
        await tx
          .update(credits)
          .set({ usedAmountCents: newUsed, status: newStatus, updatedAt: new Date() })
          .where(eq(credits.id, credit.id));
        await tx.insert(unifiedCreditUsageLogs).values({
          creditId: hold.creditId,
          paymentHistoryId: null,
          amountCents: hold.amountCents,
          description,
        });
        await tx
          .update(creditHolds)
          .set({ status: 'finalized' as CreditHoldStatus, finalizedAt: new Date() })
          .where(eq(creditHolds.id, hold.id));
      }

      await tx.insert(payments).values({
        schoolId: schoolId ?? 1,
        parentId,
        parentEmail,
        amount: 0,
        currency: 'usd',
        childName: childName ?? null,
        className: className ?? null,
        description,
        status: 'completed',
        stripePaymentIntentId: null,
        stripeChargeId: null,
        stripeRefundId: null,
        paymentMethod: 'other',
        enrollmentIds: enrollmentId ? [enrollmentId] : [],
        originalPaymentId: null,
        paymentDate: new Date(),
        metadata: {
          source: completionSource,
          scheduledPaymentId,
          creditsAppliedCents: creditsApplied,
          originalAmountCents: originalAmount,
          autoPayInitiated: chargedBy === 'auto_pay',
          chargedBy,
        },
      });

      if (enrollmentId) {
        const [enrollment] = await tx
          .select()
          .from(programEnrollments)
          .where(eq(programEnrollments.id, enrollmentId));
        if (enrollment) {
          const newTotalPaid = (enrollment.totalPaid || 0) + creditsApplied;
          const newBalance = Math.max(0, (enrollment.totalCost || 0) - newTotalPaid);
          await tx
            .update(programEnrollments)
            .set({
              totalPaid: newTotalPaid,
              remainingBalance: newBalance,
              paymentStatus: newBalance <= 0 ? 'completed' : 'partial_payment',
              updatedAt: new Date(),
            })
            .where(eq(programEnrollments.id, enrollmentId));
        }
      }

      await tx
        .update(scheduledPayments)
        .set({
          status: 'completed',
          processedAt: new Date(),
          completionSource,
          chargedBy,
          updatedAt: new Date(),
        })
        .where(eq(scheduledPayments.id, scheduledPaymentId));
    });
  }

  async expireCredits(): Promise<number> {
    const db = await getDb();
    const now = new Date();
    const result = await db
      .update(credits)
      .set({ status: 'expired' as CreditStatus, updatedAt: new Date() })
      .where(
        and(
          or(eq(credits.status, 'approved'), eq(credits.status, 'partially_used')),
          lt(credits.expiresAt, now)
        )
      )
      .returning();
    return result.length;
  }

  async getUnifiedCreditUsageLogById(id: number): Promise<UnifiedCreditUsageLog | undefined> {
    const db = await getDb();
    const [log] = await db.select().from(unifiedCreditUsageLogs).where(eq(unifiedCreditUsageLogs.id, id));
    return log;
  }

  async getUnifiedCreditUsageLogsByCreditId(creditId: number): Promise<UnifiedCreditUsageLog[]> {
    const db = await getDb();
    return db
      .select()
      .from(unifiedCreditUsageLogs)
      .where(eq(unifiedCreditUsageLogs.creditId, creditId))
      .orderBy(desc(unifiedCreditUsageLogs.createdAt));
  }

  async getUnifiedCreditUsageLogsByPaymentHistoryId(paymentHistoryId: number): Promise<UnifiedCreditUsageLog[]> {
    const db = await getDb();
    return db
      .select()
      .from(unifiedCreditUsageLogs)
      .where(eq(unifiedCreditUsageLogs.paymentHistoryId, paymentHistoryId))
      .orderBy(desc(unifiedCreditUsageLogs.createdAt));
  }

  async getDoubleSpentCredits(schoolId?: number): Promise<Credit[]> {
    const db = await getDb();
    const conditions = [sql`${credits.usedAmountCents} > ${credits.creditAmountCents}`];
    if (schoolId !== undefined) conditions.push(eq(credits.schoolId, schoolId));
    return db.select().from(credits).where(and(...conditions));
  }

  async getMismatchedStatusCredits(schoolId?: number): Promise<Credit[]> {
    const db = await getDb();
    const schoolCondition = schoolId !== undefined ? eq(credits.schoolId, schoolId) : sql`1=1`;
    return db
      .select()
      .from(credits)
      .where(
        and(
          schoolCondition,
          or(
            and(eq(credits.status, 'used'), sql`${credits.usedAmountCents} != ${credits.creditAmountCents}`),
            and(
              eq(credits.status, 'partially_used'),
              or(lte(credits.usedAmountCents, 0), gte(credits.usedAmountCents, credits.creditAmountCents))
            ),
            and(eq(credits.status, 'approved'), gt(credits.usedAmountCents, 0))
          )
        )
      );
  }

  async getCompletedScheduledPaymentsWithCreditSource(schoolId?: number): Promise<ScheduledPayment[]> {
    const db = await getDb();
    const conditions = [eq(scheduledPayments.status, 'completed')];
    if (schoolId !== undefined) conditions.push(eq(scheduledPayments.schoolId, schoolId));
    const allCompleted = await db.select().from(scheduledPayments).where(and(...conditions));
    return allCompleted.filter((sp: ScheduledPayment) => {
      if (sp.stripePaymentIntentId && sp.stripePaymentIntentId.startsWith('credit_')) return true;
      const meta = sp.metadata;
      if (meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
        const reservation = (meta as Record<string, unknown>).pendingCreditsReservation;
        if (typeof reservation === 'number' && reservation > 0) return true;
      }
      return false;
    });
  }

  async getUnifiedCreditUsageLogsByScheduledPaymentId(scheduledPaymentId: number): Promise<UnifiedCreditUsageLog[]> {
    const db = await getDb();
    return db
      .select()
      .from(unifiedCreditUsageLogs)
      .where(like(unifiedCreditUsageLogs.description, `%Scheduled payment ${scheduledPaymentId}%`))
      .orderBy(desc(unifiedCreditUsageLogs.createdAt));
  }

  async getUnifiedCreditUsageLogsByCheckoutPaymentIntentId(
    paymentIntentId: string,
  ): Promise<UnifiedCreditUsageLog[]> {
    const db = await getDb();
    return db
      .select()
      .from(unifiedCreditUsageLogs)
      .where(eq(unifiedCreditUsageLogs.description, `Checkout ${paymentIntentId}`))
      .orderBy(desc(unifiedCreditUsageLogs.createdAt));
  }

  async createUnifiedCreditUsageLog(log: InsertUnifiedCreditUsageLog): Promise<UnifiedCreditUsageLog> {
    const db = await getDb();
    const [newLog] = await db.insert(unifiedCreditUsageLogs).values(log).returning();
    return newLog;
  }

  async saveStripePayment(payment: InsertStripePaymentHistory): Promise<StripePaymentHistory> {
    const db = await getDb();
    const [record] = await db.insert(stripePaymentHistory).values(payment).returning();
    return record;
  }

  async getStripePaymentHistoryByUserId(userId: number): Promise<StripePaymentHistory[]> {
    const db = await getDb();
    return db
      .select()
      .from(stripePaymentHistory)
      .where(eq(stripePaymentHistory.userId, userId))
      .orderBy(desc(stripePaymentHistory.stripeCreatedAt));
  }

  async getStripePaymentsBySubscription(subscriptionId: string): Promise<StripePaymentHistory[]> {
    const db = await getDb();
    return db.select().from(stripePaymentHistory).where(eq(stripePaymentHistory.subscriptionId, subscriptionId));
  }

  async getStripePaymentByIntentId(paymentIntentId: string): Promise<StripePaymentHistory | undefined> {
    const db = await getDb();
    const [record] = await db
      .select()
      .from(stripePaymentHistory)
      .where(eq(stripePaymentHistory.paymentIntentId, paymentIntentId))
      .limit(1);
    return record;
  }

  async createCreditHolds(
    userId: number,
    amountCents: number,
    checkoutSessionId: string,
    description?: string,
    expiresInMinutes: number = 30
  ): Promise<{ holds: CreditHold[]; totalHeld: number }> {
    const db = await getDb();
    const holds: CreditHold[] = [];
    let remainingAmount = amountCents;
    const availableCredits = await db
      .select()
      .from(credits)
      .where(
        and(
          eq(credits.userId, userId),
          or(eq(credits.status, 'approved'), eq(credits.status, 'partially_used')),
          or(gt(credits.expiresAt, new Date()), sql`${credits.expiresAt} IS NULL`)
        )
      )
      .orderBy(asc(credits.expiresAt), asc(credits.createdAt));
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    for (const credit of availableCredits) {
      if (remainingAmount <= 0) break;
      const existingHoldsResult = await db
        .select({ total: sql<number>`COALESCE(SUM(${creditHolds.amountCents}), 0)` })
        .from(creditHolds)
        .where(and(eq(creditHolds.creditId, credit.id), eq(creditHolds.status, 'pending')));
      const heldAmount = Number(existingHoldsResult[0]?.total || 0);
      const availableAmount = credit.creditAmountCents - credit.usedAmountCents - heldAmount;
      if (availableAmount <= 0) continue;
      const holdAmount = Math.min(availableAmount, remainingAmount);
      const [hold] = await db
        .insert(creditHolds)
        .values({
          userId,
          creditId: credit.id,
          amountCents: holdAmount,
          checkoutSessionId,
          status: 'pending',
          expiresAt,
          description,
        })
        .returning();
      holds.push(hold);
      remainingAmount -= holdAmount;
    }
    const totalHeld = amountCents - remainingAmount;
    return { holds, totalHeld };
  }

  async finalizeCreditHolds(
    checkoutSessionId: string,
    paymentHistoryId?: number,
    description?: string
  ): Promise<{ finalizedCount: number; totalFinalized: number; usageLogs: UnifiedCreditUsageLog[] }> {
    const db = await getDb();
    return db.transaction(async (tx) => {
      const usageLogs: UnifiedCreditUsageLog[] = [];
      let totalFinalized = 0;
      const pendingHolds = await tx
        .select()
        .from(creditHolds)
        .where(and(eq(creditHolds.checkoutSessionId, checkoutSessionId), eq(creditHolds.status, 'pending')));
      for (const hold of pendingHolds) {
        const [credit] = await tx.select().from(credits).where(eq(credits.id, hold.creditId));
        if (!credit) continue;
        const newUsedAmount = credit.usedAmountCents + hold.amountCents;
        const newStatus: CreditStatus = newUsedAmount >= credit.creditAmountCents ? 'used' : 'partially_used';
        await tx
          .update(credits)
          .set({ usedAmountCents: newUsedAmount, status: newStatus, updatedAt: new Date() })
          .where(eq(credits.id, credit.id));
        const [usageLog] = await tx
          .insert(unifiedCreditUsageLogs)
          .values({
            creditId: hold.creditId,
            paymentHistoryId,
            amountCents: hold.amountCents,
            description: description || hold.description || `Credit applied from hold #${hold.id}`,
          })
          .returning();
        usageLogs.push(usageLog);
        await tx
          .update(creditHolds)
          .set({ status: 'finalized' as CreditHoldStatus, finalizedAt: new Date() })
          .where(eq(creditHolds.id, hold.id));
        totalFinalized += hold.amountCents;
      }
      return { finalizedCount: pendingHolds.length, totalFinalized, usageLogs };
    });
  }

  async releaseCreditHolds(checkoutSessionId: string): Promise<{ releasedCount: number; totalReleased: number }> {
    const db = await getDb();
    let totalReleased = 0;
    const pendingHolds = await db
      .select()
      .from(creditHolds)
      .where(and(eq(creditHolds.checkoutSessionId, checkoutSessionId), eq(creditHolds.status, 'pending')));
    for (const hold of pendingHolds) {
      await db
        .update(creditHolds)
        .set({ status: 'released' as CreditHoldStatus, releasedAt: new Date() })
        .where(eq(creditHolds.id, hold.id));
      totalReleased += hold.amountCents;
    }
    return { releasedCount: pendingHolds.length, totalReleased };
  }

  async getActiveHoldsForUser(userId: number): Promise<CreditHold[]> {
    const db = await getDb();
    return db
      .select()
      .from(creditHolds)
      .where(
        and(
          eq(creditHolds.userId, userId),
          eq(creditHolds.status, 'pending'),
          gt(creditHolds.expiresAt, new Date())
        )
      )
      .orderBy(asc(creditHolds.createdAt));
  }

  async getTotalHeldCreditsForUser(userId: number): Promise<number> {
    const db = await getDb();
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(${creditHolds.amountCents}), 0)` })
      .from(creditHolds)
      .where(
        and(eq(creditHolds.userId, userId), eq(creditHolds.status, 'pending'), gt(creditHolds.expiresAt, new Date()))
      );
    return Number(result[0]?.total || 0);
  }

  async expireStaleHolds(): Promise<number> {
    const db = await getDb();
    const now = new Date();
    const expiredHolds = await db
      .update(creditHolds)
      .set({ status: 'expired' as CreditHoldStatus, releasedAt: now })
      .where(and(eq(creditHolds.status, 'pending'), lt(creditHolds.expiresAt, now)))
      .returning();
    return expiredHolds.length;
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

  /**
   * Families with at least one qualifying enrollment whose enrollment_date or program_start_date
   * falls within [periodStart, periodEnd] (inclusive, date strings YYYY-MM-DD).
   */
  async getEnrollmentFamiliesByPeriod(
    schoolId: number,
    periodStart: string,
    periodEnd: string,
  ): Promise<
    Array<{
      parentId: number;
      parentEmail: string;
      childName: string;
      className: string;
    }>
  > {
    const db = await getDb();
    const excludedStatuses = ['cancelled', 'withdrawn', 'failed'] as const;

    const rows = await db
      .select({
        parentId: programEnrollments.parentId,
        parentEmail: programEnrollments.parentEmail,
        childName: programEnrollments.childName,
        className: programEnrollments.className,
      })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.schoolId, schoolId),
          not(inArray(programEnrollments.status, [...excludedStatuses])),
          sql`(
            (${programEnrollments.enrollmentDate}::date >= ${periodStart}::date
              AND ${programEnrollments.enrollmentDate}::date <= ${periodEnd}::date)
            OR (
              ${programEnrollments.programStartDate} IS NOT NULL
              AND ${programEnrollments.programStartDate}::date >= ${periodStart}::date
              AND ${programEnrollments.programStartDate}::date <= ${periodEnd}::date
            )
          )`,
        ),
      );

    return rows.map((r) => ({
      parentId: r.parentId,
      parentEmail: normalizeEmailForLookup(r.parentEmail) || r.parentEmail.trim(),
      childName: r.childName,
      className: r.className,
    }));
  }

  /** Distinct normalized parent emails with qualifying enrollment on/after sinceDate. */
  async getParentEmailsWithEnrollmentSince(schoolId: number, sinceDate: string): Promise<string[]> {
    const db = await getDb();
    const qualifyingStatuses = [
      'pending_payment',
      'pending_admin_approval',
      'enrolled',
      'completed',
      'waitlist',
    ] as const;

    const rows = await db
      .selectDistinct({ parentEmail: programEnrollments.parentEmail })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.schoolId, schoolId),
          inArray(programEnrollments.status, [...qualifyingStatuses]),
          sql`(
            ${programEnrollments.enrollmentDate}::date >= ${sinceDate}::date
            OR (
              ${programEnrollments.programStartDate} IS NOT NULL
              AND ${programEnrollments.programStartDate}::date >= ${sinceDate}::date
            )
          )`,
        ),
      );

    return rows
      .map((r) => normalizeEmailForLookup(r.parentEmail) || r.parentEmail.trim())
      .filter(Boolean);
  }

  async getDistinctParentEmailsForSchool(schoolId: number): Promise<string[]> {
    const db = await getDb();
    const rows = await db
      .selectDistinct({ parentEmail: programEnrollments.parentEmail })
      .from(programEnrollments)
      .where(eq(programEnrollments.schoolId, schoolId));
    return rows
      .map((r) => normalizeEmailForLookup(r.parentEmail) || r.parentEmail.trim())
      .filter(Boolean);
  }

  /** Max GREATEST(enrollment_date, program_start_date) per normalized parent email (qualifying statuses only). */
  async getLastEnrollmentDateByParentEmails(
    schoolId: number,
    emails: string[],
  ): Promise<Map<string, string>> {
    const normalized = [
      ...new Set(emails.map((e) => normalizeEmailForLookup(e)).filter(Boolean)),
    ];
    const result = new Map<string, string>();
    if (normalized.length === 0) return result;

    const db = await getDb();
    const qualifyingStatuses = [
      'pending_payment',
      'pending_admin_approval',
      'enrolled',
      'completed',
      'waitlist',
    ];

    const rows = await db
      .select({
        parentEmailKey: sql<string>`LOWER(TRIM(${programEnrollments.parentEmail}))`,
        lastEnrollmentDate: sql<string>`MAX(GREATEST(
          ${programEnrollments.enrollmentDate}::date,
          COALESCE(${programEnrollments.programStartDate}, ${programEnrollments.enrollmentDate}::date)
        ))::text`,
      })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.schoolId, schoolId),
          inArray(programEnrollments.status, [...qualifyingStatuses]),
          inArray(
            sql`LOWER(TRIM(${programEnrollments.parentEmail}))`,
            normalized,
          ),
        ),
      )
      .groupBy(sql`LOWER(TRIM(${programEnrollments.parentEmail}))`);

    for (const row of rows) {
      const key = normalizeEmailForLookup(row.parentEmailKey);
      if (key && row.lastEnrollmentDate) {
        result.set(key, row.lastEnrollmentDate);
      }
    }
    return result;
  }

  async getStripePaymentHistoryForSchool(schoolId: number, limit = 100): Promise<StripePaymentHistory[]> {
    const db = await getDb();
    const cap = Math.min(Math.max(limit, 1), 200);
    return db
      .select()
      .from(stripePaymentHistory)
      .where(sqlStripeHistoryUserAtSchool(schoolId, stripePaymentHistory.userId))
      .orderBy(desc(stripePaymentHistory.stripeCreatedAt))
      .limit(cap);
  }

  private mapPaymentReminderLogRow(row: Record<string, unknown>): PaymentReminderLog {
    return {
      id: Number(row.id),
      schoolId: Number(row.school_id),
      scheduledPaymentId: row.scheduled_payment_id != null ? Number(row.scheduled_payment_id) : null,
      parentEmail: String(row.parent_email),
      parentName: row.parent_name != null ? String(row.parent_name) : null,
      childName: row.child_name != null ? String(row.child_name) : null,
      className: row.class_name != null ? String(row.class_name) : null,
      amountCents: row.amount_cents != null ? Number(row.amount_cents) : null,
      reminderType: String(row.reminder_type),
      status: row.status as PaymentReminderLog['status'],
      isManual: Boolean(row.is_manual),
      sentBy: row.sent_by != null ? Number(row.sent_by) : null,
      errorMessage: row.error_message != null ? String(row.error_message) : null,
      sentAt: new Date(row.sent_at as string | Date),
    };
  }

  async createPaymentReminderLog(log: InsertPaymentReminderLog): Promise<PaymentReminderLog> {
    const db = await getDb();
    const result = await db.execute(sql`
      INSERT INTO payment_reminder_logs (
        school_id,
        scheduled_payment_id,
        parent_email,
        parent_name,
        child_name,
        class_name,
        amount_cents,
        reminder_type,
        status,
        is_manual,
        sent_by,
        error_message
      ) VALUES (
        ${log.schoolId},
        ${log.scheduledPaymentId ?? null},
        ${log.parentEmail},
        ${log.parentName ?? null},
        ${log.childName ?? null},
        ${log.className ?? null},
        ${log.amountCents ?? null},
        ${log.reminderType},
        ${log.status},
        ${log.isManual ?? false},
        ${log.sentBy ?? null},
        ${log.errorMessage ?? null}
      )
      RETURNING *
    `);
    const row = result.rows[0] as Record<string, unknown>;
    return this.mapPaymentReminderLogRow(row);
  }

  async getPaymentReminderLogsBySchool(
    schoolId: number,
    limit = 100,
  ): Promise<PaymentReminderLog[]> {
    const db = await getDb();
    const cap = Math.min(Math.max(limit, 1), 500);
    const result = await db.execute(sql`
      SELECT *
      FROM payment_reminder_logs
      WHERE school_id = ${schoolId}
      ORDER BY sent_at DESC
      LIMIT ${cap}
    `);
    return (result.rows as Record<string, unknown>[]).map((row) => this.mapPaymentReminderLogRow(row));
  }

  // Assessment & progress (see server/lib/assessment-progress-db.ts)
  getChildByIdForSchool = apDb.getChildByIdForSchool;
  getChildrenForSchool = apDb.getChildrenForSchool;
  fuzzyMatchStudentsForSchool = apDb.fuzzyMatchStudentsForSchool;
  resolveActiveSessionIdForChild = apDb.resolveActiveSessionIdForChild;
  getAssessmentTypesBySchoolId = apDb.getAssessmentTypesBySchoolId;
  getAssessmentTypeById = apDb.getAssessmentTypeById;
  createAssessmentType = apDb.createAssessmentType;
  updateAssessmentType = apDb.updateAssessmentType;
  deleteAssessmentType = apDb.deleteAssessmentType;
  getCurriculumBooksByAssessmentTypeId = apDb.getCurriculumBooksByAssessmentTypeId;
  getCurriculumBookById = apDb.getCurriculumBookById;
  createCurriculumBook = apDb.createCurriculumBook;
  updateCurriculumBook = apDb.updateCurriculumBook;
  deleteCurriculumBook = apDb.deleteCurriculumBook;
  getStudentAssessmentById = apDb.getStudentAssessmentById;
  getStudentAssessmentsByChildId = apDb.getStudentAssessmentsByChildId;
  getStudentAssessmentsBySchoolId = apDb.getStudentAssessmentsBySchoolId;
  createStudentAssessment = apDb.createStudentAssessment;
  updateStudentAssessment = apDb.updateStudentAssessment;
  deleteStudentAssessment = apDb.deleteStudentAssessment;
  recordLexileAssessment = apDb.recordLexileAssessment;
  getLexileHistoryForChildBySchool = apDb.getLexileHistoryForChildBySchool;
  getProgressSubjectsBySchool = apDb.getProgressSubjectsBySchool;
  createProgressSubject = apDb.createProgressSubject;
  updateProgressSubject = apDb.updateProgressSubject;
  getProgressTracksBySubject = apDb.getProgressTracksBySubject;
  getProgressTrackById = apDb.getProgressTrackById;
  createProgressTrack = apDb.createProgressTrack;
  updateProgressTrack = apDb.updateProgressTrack;
  createStudentProgressLog = apDb.createStudentProgressLog;
  getStudentProgressCurrent = apDb.getStudentProgressCurrent;
  getStudentProgressLog = apDb.getStudentProgressLog;
  getRecentProgressLogForSchool = apDb.getRecentProgressLogForSchool;
  getParentProgressSummary = apDb.getParentProgressSummary;
  getProgressInsightCache = apDb.getProgressInsightCache;
  saveProgressInsightCache = apDb.saveProgressInsightCache;
  ensureProgressSubjectsForSchool = apDb.ensureProgressSubjectsForSchool;
  getProgressTrackCatalog = apDb.getProgressTrackCatalog;
  getAssessmentSessionsForSchool = apDb.getAssessmentSessionsForSchool;
  getAssessmentSessionById = apDb.getAssessmentSessionById;
  createAssessmentSession = apDb.createAssessmentSession;
  updateAssessmentSession = apDb.updateAssessmentSession;
  getQuarterlyProgressMeta = apDb.getQuarterlyProgressMeta;
  upsertQuarterlyProgressMeta = apDb.upsertQuarterlyProgressMeta;
  getQuarterlySkillChecks = apDb.getQuarterlySkillChecks;
  saveQuarterlySkillChecks = apDb.saveQuarterlySkillChecks;
  skillChecksToMap = apDb.skillChecksToMap;
  buildStudentProgressReport = apDb.buildStudentProgressReport;
  saveQuarterlyProgressSnapshot = apDb.saveQuarterlyProgressSnapshot;
  getQuarterlyProgressSnapshots = apDb.getQuarterlyProgressSnapshots;
  getQuarterlyProgressSnapshotsForSchool = apDb.getQuarterlyProgressSnapshotsForSchool;
  getQuarterlyProgressSnapshotById = apDb.getQuarterlyProgressSnapshotById;

  private mapTechnicalSupportIssueRow(row: TechnicalSupportIssue) {
    return {
      id: row.id,
      userId: row.userId ?? undefined,
      userEmail: row.userEmail,
      userRole: row.userRole,
      schoolId: row.schoolId ?? undefined,
      issueCategory: row.issueCategory,
      issueType: row.issueType,
      severity: row.severity,
      title: row.title,
      description: row.description,
      userAgent: row.userAgent ?? '',
      url: row.url ?? '',
      browserInfo: (row.browserInfo as Record<string, string>) ?? {},
      reproductionSteps: (row.reproductionSteps as string[]) ?? [],
      recommendedActions: (row.recommendedActions as string[]) ?? [],
      aiDiagnosis: row.aiDiagnosis ?? undefined,
      aiUserResponse: row.aiUserResponse ?? undefined,
      screenshotObjectPath: row.screenshotObjectPath ?? undefined,
      status: row.status,
      assignedTo: row.assignedTo ?? undefined,
      resolution: row.resolution ?? undefined,
      timestamp: row.createdAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async createTechnicalIssue(issue: InsertTechnicalSupportIssue & { id: string }): Promise<any> {
    const db = await getDb();
    const [row] = await db
      .insert(technicalSupportIssues)
      .values({
        id: issue.id,
        userId: issue.userId ?? null,
        userEmail: issue.userEmail,
        userRole: issue.userRole ?? 'parent',
        schoolId: issue.schoolId ?? null,
        issueCategory: issue.issueCategory ?? 'platform',
        issueType: issue.issueType ?? 'other',
        severity: issue.severity ?? 'medium',
        title: issue.title,
        description: issue.description,
        userAgent: issue.userAgent ?? null,
        url: issue.url ?? null,
        browserInfo: issue.browserInfo ?? {},
        reproductionSteps: issue.reproductionSteps ?? [],
        recommendedActions: issue.recommendedActions ?? [],
        aiDiagnosis: issue.aiDiagnosis ?? null,
        aiUserResponse: issue.aiUserResponse ?? null,
        screenshotObjectPath: issue.screenshotObjectPath ?? null,
        status: issue.status ?? 'open',
        assignedTo: issue.assignedTo ?? null,
        resolution: issue.resolution ?? null,
      })
      .returning();
    return this.mapTechnicalSupportIssueRow(row);
  }

  async getTechnicalIssue(id: string): Promise<any> {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(technicalSupportIssues)
      .where(eq(technicalSupportIssues.id, id))
      .limit(1);
    return row ? this.mapTechnicalSupportIssueRow(row) : undefined;
  }

  async getAllTechnicalIssues(): Promise<any[]> {
    const db = await getDb();
    const rows = await db
      .select()
      .from(technicalSupportIssues)
      .orderBy(desc(technicalSupportIssues.createdAt));
    return rows.map((row) => this.mapTechnicalSupportIssueRow(row));
  }

  async getTechnicalIssuesBySchoolId(schoolId: number): Promise<any[]> {
    const db = await getDb();
    const rows = await db
      .select()
      .from(technicalSupportIssues)
      .where(
        and(
          eq(technicalSupportIssues.schoolId, schoolId),
          eq(technicalSupportIssues.issueCategory, 'school_policy'),
        ),
      )
      .orderBy(desc(technicalSupportIssues.createdAt));
    return rows.map((row) => this.mapTechnicalSupportIssueRow(row));
  }

  async updateTechnicalIssue(id: string, updates: Partial<{
    status: string;
    resolution: string;
    assignedTo: string;
  }>): Promise<any> {
    const db = await getDb();
    const [row] = await db
      .update(technicalSupportIssues)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(technicalSupportIssues.id, id))
      .returning();
    return row ? this.mapTechnicalSupportIssueRow(row) : null;
  }
}
