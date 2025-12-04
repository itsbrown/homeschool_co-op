import {
  users, type User, type InsertUser,
  userRoles, type UserRole,
  curricula, type Curriculum, type InsertCurriculum,
  lessons, type Lesson, type InsertLesson,
  events, type Event, type InsertEvent,
  marketplaceItems, type MarketplaceItem, type InsertMarketplaceItem,
  knowledgeBases, type KnowledgeBase, type InsertKnowledgeBase,
  children, type Child, type InsertChild,
  emergencyContacts, type EmergencyContact, type InsertEmergencyContact,
  programs, type Program, type InsertProgram,
  programEnrollments, type ProgramEnrollment, type InsertProgramEnrollment,
  membershipEnrollments, type MembershipEnrollment, type InsertMembershipEnrollment,
  membershipAgreements, type MembershipAgreement, type InsertMembershipAgreement,
  schoolDocuments, type SchoolDocument, type InsertSchoolDocument,
  paymentReceipts, type PaymentReceipt, type InsertPaymentReceipt,
  stripeSubscriptionSchedules, type StripeSubscriptionSchedule, type InsertStripeSubscriptionSchedule,
  stripePaymentHistory, type StripePaymentHistory, type InsertStripePaymentHistory,
  classes, type Class, type InsertClass,
  activities, type Activity, type InsertActivity,
  roleInvitations, type RoleInvitation, type InsertRoleInvitation,
  staffPositions, type StaffPosition, type InsertStaffPosition,
  staffInvitations, type StaffInvitation, type InsertStaffInvitation,
  passwordResetTokens, type PasswordResetToken, type InsertPasswordResetToken,
  marketingLinks, type MarketingLink, type InsertMarketingLink,
  linkAnalytics, type LinkAnalytics, type InsertLinkAnalytics,
  payments, type Payment, type InsertPayment,
  scheduledPayments, type ScheduledPayment, type InsertScheduledPayment,
  refunds, type Refund, type InsertRefund,
  schools, type School, type InsertSchool,
  schoolApplications, type SchoolApplication, type InsertSchoolApplication,
  schoolStudents, type SchoolStudent, type InsertSchoolStudent,
  schoolStaff, type SchoolStaff, type InsertSchoolStaff,
  userLocations, type UserLocation, type InsertUserLocation,
  locations, type Location, type InsertLocation,
  dailyFlowTemplates, type DailyFlowTemplate, type InsertDailyFlowTemplate,
  dailyFlowEntries, type DailyFlowEntry, type InsertDailyFlowEntry,
  dailyFlowSchedules, type DailyFlowSchedule, type InsertDailyFlowSchedule,
  notifications, type Notification, type InsertNotification,
  notificationRecipients, type NotificationRecipient, type InsertNotificationRecipient,
  discounts, type Discount, type InsertDiscount,
  discountApplications, type DiscountApplication, type InsertDiscountApplication
} from "@shared/schema";
import { eq, inArray } from 'drizzle-orm';
import { getDb } from './db';

export interface IStorage {
  // Methods for backup
  getAllUsers(): Promise<User[]>;
  getAllCurricula(): Promise<Curriculum[]>;
  getAllKnowledgeBases(): Promise<KnowledgeBase[]>;
  getAllActivities(): Promise<Activity[]>;
  getAllPayments(): Promise<Payment[]>;
  getAllEnrollments(): Promise<ProgramEnrollment[]>;

  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;

  // School methods
  getSchool(id: number): Promise<School | undefined>;
  getSchoolByCode(registrationCode: string): Promise<School | undefined>;
  createSchool(school: InsertSchool): Promise<School>;
  updateSchool(id: number, school: Partial<InsertSchool>): Promise<School | undefined>;
  getAllSchools(): Promise<School[]>;
  getSchoolsByAdminId(adminId: number): Promise<School[]>;

  // User Role methods
  getUserRolesByUserId(userId: number): Promise<UserRole[]>;

  // Location methods
  getLocationsBySchool(schoolId: number): Promise<Location[]>;

  // School Application methods
  getSchoolApplicationById(id: number): Promise<SchoolApplication | undefined>;
  getSchoolApplicationByEmail(email: string): Promise<SchoolApplication | undefined>;
  getAllSchoolApplications(): Promise<SchoolApplication[]>;
  getSchoolApplicationsByStatus(status: 'pending' | 'under_review' | 'approved' | 'declined'): Promise<SchoolApplication[]>;
  createSchoolApplication(application: InsertSchoolApplication & { token: string }): Promise<SchoolApplication>;
  updateSchoolApplicationStatus(id: number, status: 'pending' | 'under_review' | 'approved' | 'declined', reviewedBy?: string, reviewNotes?: string): Promise<SchoolApplication | undefined>;

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

  // Technical Support methods
  createTechnicalIssue(issue: any): Promise<any>;
  getTechnicalIssue(id: string): Promise<any>;
  getAllTechnicalIssues(): Promise<any[]>;
  updateTechnicalIssue(id: string, updates: any): Promise<any>;
  
  // Notification methods
  getNotificationById(id: number): Promise<Notification | undefined>;
  getAllNotifications(): Promise<Notification[]>;
  getNotificationsByUserId(userId: number, role?: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  updateNotification(id: number, notification: Partial<InsertNotification>): Promise<Notification | undefined>;
  deleteNotification(id: number): Promise<void>;
  
  // Notification recipient methods
  getNotificationRecipientById(id: number): Promise<NotificationRecipient | undefined>;
  getNotificationRecipientsByNotificationId(notificationId: number): Promise<NotificationRecipient[]>;
  getNotificationRecipientsByUserId(userId: number): Promise<NotificationRecipient[]>;
  createNotificationRecipient(recipient: InsertNotificationRecipient): Promise<NotificationRecipient>;
  updateNotificationRecipient(id: number, recipient: Partial<InsertNotificationRecipient>): Promise<NotificationRecipient | undefined>;
  
  // Push Subscription methods
  getPushSubscriptionsByUserId(userId: number): Promise<any[]>;
  getPushSubscriptionByEndpoint(endpoint: string): Promise<any | undefined>;
  createPushSubscription(subscription: any): Promise<any>;
  updatePushSubscription(id: number, subscription: Partial<any>): Promise<any | undefined>;
  deletePushSubscription(id: number): Promise<void>;
  deletePushSubscriptionByEndpoint(endpoint: string): Promise<void>;
  
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
  getActiveRoleInvitation(tokenOrEmail: string): Promise<any>;
  updateRoleInvitation(id: number, updates: { token?: string; expiresAt?: Date; isActive?: boolean; usedAt?: Date | null }): Promise<any>;
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
  getProgramEnrollmentsByParent(parentId: number): Promise<ProgramEnrollment[]>;
  getEnrollmentsByChildIds(childIds: number[]): Promise<ProgramEnrollment[]>;
  getEnrollmentsByProgramId(programId: number): Promise<ProgramEnrollment[]>;
  getEnrollmentCountForProgram(programId: number): Promise<number>;
  getEnrollmentCountForClass(classId: number): Promise<number>;
  createProgramEnrollment(enrollment: InsertProgramEnrollment): Promise<ProgramEnrollment>;
  updateProgramEnrollment(id: number, enrollment: Partial<InsertProgramEnrollment>): Promise<ProgramEnrollment | undefined>;
  deleteProgramEnrollment(id: number): Promise<void>;
  cancelPendingEnrollments(enrollmentIds: number[], parentUserId: number): Promise<{ cancelled: number[]; skipped: number[]; errors: string[] }>;
  getStripeCustomerIdsByParentEmail(parentEmail: string): Promise<string[]>;
  getStripeLinkedEnrollmentsByParentEmail(parentEmail: string): Promise<ProgramEnrollment[]>;

  // Membership Enrollment methods
  getMembershipEnrollmentById(id: number): Promise<MembershipEnrollment | undefined>;
  getMembershipEnrollmentsByParentId(parentUserId: number): Promise<MembershipEnrollment[]>;
  getMembershipEnrollmentsBySchoolId(schoolId: number): Promise<MembershipEnrollment[]>;
  getMembershipEnrollmentByParentAndSchoolAndYear(parentUserId: number, schoolId: number, membershipYear: number): Promise<MembershipEnrollment | undefined>;
  createMembershipEnrollment(enrollment: InsertMembershipEnrollment): Promise<MembershipEnrollment>;
  updateMembershipEnrollment(id: number, enrollment: Partial<InsertMembershipEnrollment>): Promise<MembershipEnrollment | undefined>;
  deleteMembershipEnrollment(id: number): Promise<void>;
  createOrUpdateMembershipEnrollment(parentUserId: number, schoolId: number, membershipYear: number): Promise<MembershipEnrollment>;

  // Membership Agreement methods
  getMembershipAgreementById(id: number): Promise<MembershipAgreement | undefined>;
  getMembershipAgreementsByParentId(parentUserId: number): Promise<MembershipAgreement[]>;
  getMembershipAgreementsBySchoolId(schoolId: number): Promise<MembershipAgreement[]>;
  getMembershipAgreementByEnrollmentId(enrollmentId: number): Promise<MembershipAgreement | undefined>;
  getLatestMembershipAgreementByParentAndSchool(parentUserId: number, schoolId: number): Promise<MembershipAgreement | undefined>;
  createMembershipAgreement(agreement: InsertMembershipAgreement): Promise<MembershipAgreement>;
  hasSignedCurrentAgreement(parentUserId: number, schoolId: number, currentVersion: string): Promise<boolean>;

  // School Documents methods
  getSchoolDocumentById(id: number): Promise<SchoolDocument | undefined>;
  getSchoolDocumentsBySchoolId(schoolId: number): Promise<SchoolDocument[]>;
  getPublishedSchoolDocuments(schoolId: number): Promise<SchoolDocument[]>;
  createSchoolDocument(document: InsertSchoolDocument): Promise<SchoolDocument>;
  updateSchoolDocument(id: number, document: Partial<InsertSchoolDocument>): Promise<SchoolDocument | undefined>;
  deleteSchoolDocument(id: number): Promise<void>;

  // Payment Receipts methods
  getPaymentReceiptById(id: number): Promise<PaymentReceipt | undefined>;
  getPaymentReceiptByNumber(receiptNumber: string): Promise<PaymentReceipt | undefined>;
  getPaymentReceiptsByParentId(parentUserId: number): Promise<PaymentReceipt[]>;
  getPaymentReceiptsBySchoolId(schoolId: number): Promise<PaymentReceipt[]>;
  createPaymentReceipt(receipt: InsertPaymentReceipt): Promise<PaymentReceipt>;
  updatePaymentReceiptStatus(id: number, status: 'generated' | 'downloaded' | 'emailed'): Promise<PaymentReceipt | undefined>;

  // Class Enrollment methods (DEPRECATED - Use Program Enrollment methods above)
  /**
   * @deprecated Use createProgramEnrollment() with createEnrollmentData() factory from @shared/enrollment-factory instead
   * This method exists for backward compatibility only and will be removed in a future version.
   * See replit.md "Storage Layer Patterns" for correct usage.
   */
  createEnrollment(enrollment: any): Promise<any>;
  
  /**
   * @deprecated Use getEnrollmentsByChildIds() (note: plural 'Ids', expects array) instead
   * This method exists for backward compatibility only and will be removed in a future version.
   */
  getEnrollmentsByChildId(childId: number): Promise<any[]>;
  getEnrollmentsByChildIds(childIds: number[]): Promise<any[]>;
  getEnrollmentsByClassId(classId: number): Promise<any[]>;
  
  /**
   * @deprecated Use getProgramEnrollmentById() instead
   * This method exists for backward compatibility only and will be removed in a future version.
   */
  getEnrollmentById(id: number): Promise<any>;
  
  /**
   * @deprecated Use updateProgramEnrollment(id, updates) instead
   * This method exists for backward compatibility only and will be removed in a future version.
   */
  updateEnrollment(enrollment: any): Promise<any>;
  
  /**
   * @deprecated Use deleteProgramEnrollment() instead
   * This method exists for backward compatibility only and will be removed in a future version.
   */
  deleteEnrollment(id: number): Promise<void>;
  
  /**
   * @deprecated Use deleteProgramEnrollment() instead
   * This method exists for backward compatibility only and will be removed in a future version.
   */
  removeEnrollment(enrollmentId: number): Promise<boolean>;

  // Class methods
  getClassById(id: number): Promise<Class | undefined>;
  getClasses(options: { page: number; limit: number; search?: string; category?: string; status?: "published" | "draft" | "" }): Promise<Class[]>;
  getClassesCount(options: { search?: string; category?: string; status?: "published" | "draft" | "" }): Promise<number>;
  getAllClasses(): Promise<Class[]>;
  getClassesBySchoolId(schoolId: string): Promise<Class[]>;
  createClass(classData: InsertClass & { instructorId: number }): Promise<Class>;
  updateClass(id: number, classData: Partial<InsertClass>): Promise<Class | undefined>;
  deleteClass(id: number): Promise<void>;

  // Role Invitation methods
  getActiveRoleInvitation(tokenOrEmail: string): Promise<RoleInvitation | undefined>;
  createRoleInvitation(invitation: InsertRoleInvitation & { invitedBy: number; token: string }): Promise<RoleInvitation>;
  acceptRoleInvitation(token: string, userEmail: string): Promise<RoleInvitation | undefined>;
  getRoleInvitationsByInviter(inviterId: number): Promise<RoleInvitation[]>;
  getPendingRoleInvitationsByEmails(emails: string[]): Promise<Map<string, boolean>>;

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

  // Payment methods
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentsByParentEmail(parentEmail: string): Promise<Payment[]>;
  getPaymentByStripeId(stripePaymentIntentId: string): Promise<Payment | undefined>;
  updatePaymentStatus(id: number, status: 'pending' | 'succeeded' | 'failed' | 'canceled'): Promise<Payment | undefined>;

  // Stripe Payment History methods
  saveStripePayment(payment: InsertStripePaymentHistory): Promise<StripePaymentHistory>;
  getStripePaymentHistoryByUserId(userId: number): Promise<StripePaymentHistory[]>;
  getStripePaymentsBySubscription(subscriptionId: string): Promise<StripePaymentHistory[]>;
  getStripePaymentByIntentId(paymentIntentId: string): Promise<StripePaymentHistory | undefined>;

  // Scheduled Payment methods
  createScheduledPayment(payment: any): Promise<any>;
  getScheduledPaymentsByParentEmail(parentEmail: string): Promise<any[]>;
  getAllScheduledPayments(): Promise<any[]>;
  updateScheduledPaymentStatus(id: number, status: string): Promise<any | undefined>;
  updateScheduledPaymentReminderCount(id: number, count: number): Promise<any | undefined>;

  // Refund methods
  createRefund(refund: InsertRefund): Promise<Refund>;
  getRefundById(id: number): Promise<Refund | undefined>;
  getRefundsByPaymentId(paymentId: number): Promise<Refund[]>;
  getRefundsBySchoolId(schoolId: number): Promise<Refund[]>;
  updateRefund(id: number, refund: Partial<InsertRefund>): Promise<Refund | undefined>;
  deleteRefund(id: number): Promise<void>;

  // Stripe Subscription Schedule methods
  createStripeSubscriptionSchedule(schedule: InsertStripeSubscriptionSchedule): Promise<StripeSubscriptionSchedule>;
  getStripeSubscriptionScheduleById(id: number): Promise<StripeSubscriptionSchedule | undefined>;
  getStripeSubscriptionScheduleByStripeId(stripeScheduleId: string): Promise<StripeSubscriptionSchedule | undefined>;
  getStripeSubscriptionSchedulesByParentEmail(parentEmail: string): Promise<StripeSubscriptionSchedule[]>;
  updateStripeSubscriptionSchedule(id: number, schedule: Partial<InsertStripeSubscriptionSchedule>): Promise<StripeSubscriptionSchedule | undefined>;

  // Enhanced enrollment methods
  /**
   * @deprecated Use getProgramEnrollmentById() in a loop or add batch method to interface
   * This method exists for backward compatibility only and will be removed in a future version.
   */
  getEnrollmentsByIds(enrollmentIds: number[]): Promise<any[]>;
  
  /**
   * @deprecated Use updateProgramEnrollment(id, updates) instead
   * This method exists for backward compatibility only and will be removed in a future version.
   */
  updateEnrollment(id: number, updates: any): Promise<any>;

  // School Student methods
  getSchoolStudentById(id: number): Promise<SchoolStudent | undefined>;
  getAllSchoolStudents(): Promise<SchoolStudent[]>;
  getSchoolStudentsBySchoolId(schoolId: number): Promise<SchoolStudent[]>;
  getSchoolStudentsByLocationId(locationId: number): Promise<SchoolStudent[]>;
  getSchoolStudentByChildId(childId: number): Promise<SchoolStudent | undefined>;
  getSchoolStudentByChildAndSchool(childId: number, schoolId: number): Promise<SchoolStudent | undefined>;
  createSchoolStudent(schoolStudent: InsertSchoolStudent): Promise<SchoolStudent>;
  updateSchoolStudent(id: number, schoolStudent: Partial<InsertSchoolStudent>): Promise<SchoolStudent | undefined>;
  deleteSchoolStudent(id: number): Promise<void>;

  // School Staff methods
  getSchoolStaffById(id: number): Promise<SchoolStaff | undefined>;
  getAllSchoolStaff(): Promise<SchoolStaff[]>;
  getSchoolStaffBySchoolId(schoolId: number): Promise<SchoolStaff[]>;
  getSchoolStaffByLocationId(locationId: number): Promise<SchoolStaff[]>;
  getSchoolStaffByUserId(userId: number): Promise<SchoolStaff | undefined>;
  getSchoolStaffByEmail(email: string): Promise<SchoolStaff | undefined>;
  createSchoolStaff(schoolStaff: InsertSchoolStaff): Promise<SchoolStaff>;
  updateSchoolStaff(id: number, schoolStaff: Partial<InsertSchoolStaff>): Promise<SchoolStaff | undefined>;
  deleteSchoolStaff(id: number): Promise<void>;

  // User Location methods  
  getUserLocationById(id: number): Promise<UserLocation | undefined>;
  getUserLocationsByUserId(userId: number): Promise<UserLocation[]>;
  getUserLocationsByLocationId(locationId: number): Promise<UserLocation[]>;
  createUserLocation(userLocation: InsertUserLocation): Promise<UserLocation>;
  updateUserLocation(id: number, userLocation: Partial<InsertUserLocation>): Promise<UserLocation | undefined>;
  deleteUserLocation(id: number): Promise<void>;

  // Location methods
  getLocationById(id: number): Promise<Location | undefined>;
  getLocations(): Promise<Location[]>;
  getLocationsBySchoolId(schoolId: number): Promise<Location[]>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(id: number, location: Partial<InsertLocation>): Promise<Location | undefined>;
  deleteLocation(id: number): Promise<void>;

  // Category methods
  getCategoryById(id: number): Promise<any>;
  getCategoriesBySchoolId(schoolId: number): Promise<any[]>;
  createCategory(category: any): Promise<any>;
  updateCategory(id: number, category: any): Promise<any>;
  deleteCategory(id: number): Promise<void>;

  // Discount methods
  getDiscountById(id: number): Promise<Discount | undefined>;
  getAllDiscounts(): Promise<Discount[]>;
  getDiscountsBySchoolId(schoolId: number): Promise<Discount[]>;
  createDiscount(discount: InsertDiscount): Promise<Discount>;
  updateDiscount(id: number, discount: Partial<InsertDiscount>): Promise<Discount | undefined>;
  incrementDiscountUsageAtomic(discountId: number): Promise<boolean>;
  deleteDiscount(id: number): Promise<void>;

  // Discount Application methods
  getDiscountApplicationById(id: number): Promise<DiscountApplication | undefined>;
  getAllDiscountApplications(): Promise<DiscountApplication[]>;
  getDiscountApplicationsBySchoolId(schoolId: number): Promise<DiscountApplication[]>;
  getDiscountApplicationsByDiscountId(discountId: number): Promise<DiscountApplication[]>;
  createDiscountApplication(application: InsertDiscountApplication): Promise<DiscountApplication>;
  updateDiscountApplication(id: number, application: Partial<InsertDiscountApplication>): Promise<DiscountApplication | undefined>;

  // Daily Flow Template methods
  getDailyFlowTemplates(filters?: { schoolId?: number; gradeLevel?: string; subject?: string }): Promise<DailyFlowTemplate[]>;
  getDailyFlowTemplateById(id: number): Promise<DailyFlowTemplate | undefined>;
  createDailyFlowTemplate(template: InsertDailyFlowTemplate): Promise<DailyFlowTemplate>;
  updateDailyFlowTemplate(id: number, template: Partial<InsertDailyFlowTemplate>): Promise<DailyFlowTemplate | undefined>;
  deleteDailyFlowTemplate(id: number): Promise<void>;

  // Daily Flow Entry methods
  getDailyFlowEntries(filters?: { classId?: number; startDate?: string; endDate?: string }): Promise<DailyFlowEntry[]>;
  getDailyFlowEntryById(id: number): Promise<DailyFlowEntry | undefined>;
  createDailyFlowEntry(entry: InsertDailyFlowEntry): Promise<DailyFlowEntry>;
  updateDailyFlowEntry(id: number, entry: Partial<InsertDailyFlowEntry>): Promise<DailyFlowEntry | undefined>;
  deleteDailyFlowEntry(id: number): Promise<void>;

  // Daily Flow Schedule methods
  getDailyFlowSchedules(filters?: { templateId?: number; classId?: number }): Promise<DailyFlowSchedule[]>;
  getDailyFlowScheduleById(id: number): Promise<DailyFlowSchedule | undefined>;
  createDailyFlowSchedule(schedule: InsertDailyFlowSchedule): Promise<DailyFlowSchedule>;
  updateDailyFlowSchedule(id: number, schedule: Partial<InsertDailyFlowSchedule>): Promise<DailyFlowSchedule | undefined>;
  deleteDailyFlowSchedule(id: number): Promise<void>;

  // Daily Flow utility methods
  generateDailyFlowEntriesFromTemplate(params: { templateId: number; classId: number; startDate: string; endDate: string; createdBy: string }): Promise<DailyFlowEntry[]>;
  getDailyFlowStats(filters?: { classId?: number; startDate?: string; endDate?: string }): Promise<{ totalEntries: number; completedEntries: number; completionRate: number }>;

  // Staff Position methods
  getAllStaffPositions(): Promise<StaffPosition[]>;
  getStaffPositionById(id: number): Promise<StaffPosition | undefined>;
  getStaffPositionsBySchoolId(schoolId: number | null): Promise<StaffPosition[]>;
  createStaffPosition(position: InsertStaffPosition): Promise<StaffPosition>;
  updateStaffPosition(id: number, position: Partial<InsertStaffPosition>): Promise<StaffPosition | undefined>;
  deleteStaffPosition(id: number): Promise<void>;

  // Staff Invitation methods
  getAllStaffInvitations(): Promise<StaffInvitation[]>;
  getStaffInvitationById(id: number): Promise<StaffInvitation | undefined>;
  getStaffInvitationByToken(token: string): Promise<StaffInvitation | undefined>;
  getStaffInvitationsBySchoolId(schoolId: number): Promise<StaffInvitation[]>;
  getStaffInvitationsByEmail(email: string): Promise<StaffInvitation[]>;
  createStaffInvitation(invitation: InsertStaffInvitation): Promise<StaffInvitation>;
  updateStaffInvitation(id: number, invitation: Partial<InsertStaffInvitation>): Promise<StaffInvitation | undefined>;
  deleteStaffInvitation(id: number): Promise<void>;

  // Password Reset Token methods
  getPasswordResetTokenByToken(token: string): Promise<PasswordResetToken | undefined>;
  createPasswordResetToken(tokenData: InsertPasswordResetToken): Promise<PasswordResetToken>;
  markPasswordResetTokenAsUsed(token: string): Promise<void>;
  deleteExpiredPasswordResetTokens(): Promise<void>;
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
  private membershipEnrollmentsStore: Map<number, MembershipEnrollment>;
  private membershipAgreementsStore: Map<number, MembershipAgreement>;
  private classesStore: Map<number, Class>;
  private activitiesStore: Map<number, Activity>;
  private marketingLinksStore: Map<number, MarketingLink>;
  private schoolStudentsStore: Map<number, SchoolStudent>;
  private userLocationsStore: Map<number, UserLocation>;
  private locationsStore: Map<number, Location>;
  private linkAnalyticsStore: Map<number, LinkAnalytics>;
  private paymentsStore: Map<number, Payment>;
  private refundsStore: Map<number, Refund>;
  private schoolsStore: Map<number, School>;
  private dailyFlowTemplatesStore: Map<number, DailyFlowTemplate>;
  private dailyFlowEntriesStore: Map<number, DailyFlowEntry>;
  private dailyFlowSchedulesStore: Map<number, DailyFlowSchedule>;
  private technicalIssuesStore: Map<string, any>;
  private adminNotificationsStore: Map<string, any>;
  private userNotificationsStore: Map<string, any>;

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
  private membershipEnrollmentIdCounter: number;
  private membershipAgreementIdCounter: number;
  private classIdCounter: number;
  private activityIdCounter: number;
  private marketingLinkIdCounter: number;
  private linkAnalyticsIdCounter: number;
  private paymentIdCounter: number;
  private refundIdCounter: number;
  private schoolIdCounter: number;
  private schoolStudentIdCounter: number;
  private userLocationIdCounter: number;
  private locationIdCounter: number;
  private dailyFlowTemplateIdCounter: number;
  private dailyFlowEntryIdCounter: number;
  private dailyFlowScheduleIdCounter: number;
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
    this.membershipEnrollmentsStore = new Map();
    this.membershipAgreementsStore = new Map();
    this.classesStore = new Map();
    this.activitiesStore = new Map();
    this.marketingLinksStore = new Map();
    this.schoolStudentsStore = new Map();
    this.userLocationsStore = new Map();
    this.locationsStore = new Map();
    this.linkAnalyticsStore = new Map();
    this.paymentsStore = new Map();
    this.refundsStore = new Map();
    this.schoolsStore = new Map();
    this.dailyFlowTemplatesStore = new Map();
    this.dailyFlowEntriesStore = new Map();
    this.dailyFlowSchedulesStore = new Map();
    this.technicalIssuesStore = new Map();
    this.adminNotificationsStore = new Map();
    this.userNotificationsStore = new Map();
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
    this.membershipEnrollmentIdCounter = 1;
    this.membershipAgreementIdCounter = 1;
    this.classIdCounter = 1;
    this.activityIdCounter = 1;
    this.marketingLinkIdCounter = 1;
    this.linkAnalyticsIdCounter = 1;
    this.paymentIdCounter = 1;
    this.refundIdCounter = 1;
    this.schoolIdCounter = 1;
    this.schoolStudentIdCounter = 1;
    this.userLocationIdCounter = 1;
    this.locationIdCounter = 1;
    this.dailyFlowTemplateIdCounter = 1;
    this.dailyFlowEntryIdCounter = 1;
    this.dailyFlowScheduleIdCounter = 1;

    // Initialize with a default admin user

    // Add sample events for testing the calendar
    this.initializeSampleEvents();

    // Load users from file (skip in test environment to prevent overwriting test data)
    if (process.env.NODE_ENV !== 'test') {
      this.loadUsersFromJSON().catch(console.error);
    } else {
      console.log('🧪 Test mode: Skipping loadUsersFromJSON to preserve test data');
    }

    // Load enrollments from file
    this.initializeEnrollments().catch(console.error);
    this.initializeKnowledgeBases().catch(console.error);
    // Classes are now in database - no longer loading from JSON file
    // this.initializeSampleClasses().catch(console.error);
    // Children are now in database - no longer loading from JSON file
    // this.initializeChildren().catch(console.error);
    this.initializeScheduledPayments().catch(console.error);
    this.initializePayments().catch(console.error);
    // School students are now in database - no longer loading from JSON file
    this.initializeSchoolStudents().catch(console.error);
    
    // Locations and user locations are now in database - no longer loading from JSON files
    // this.initializeUserLocations().catch(console.error);
    // this.initializeLocations().catch(console.error);
    this.initializeDailyFlowTemplates().catch(console.error);
    this.initializeDailyFlowEntries().catch(console.error);
    this.initializeDailyFlowSchedules().catch(console.error);

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
      role: "teacher",
      name: "Sarah Johnson",
      subscription: "educator"
    });

    // Test users for each role
    this.createUser({
      username: "learner",
      email: "learner@example.com",
      password: "$2a$10$JdJO7S7.eRlVhAdJBtmCQO0Pic.7x9Ebf65nGcNLAjUWXbkILhk6.", // "password"
      role: "student",
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
      role: "teacher",
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
      subscription: "institutional"
    });
  }

  // Clear all data from memory storage (for testing)
  clearAll() {
    this.usersStore.clear();
    this.curriculaStore.clear();
    this.lessonsStore.clear();
    this.eventsStore.clear();
    this.marketplaceItemsStore.clear();
    this.knowledgeBaseStore.clear();
    this.childrenStore.clear();
    this.emergencyContactsStore.clear();
    this.programsStore.clear();
    this.programEnrollmentsStore.clear();
    this.membershipEnrollmentsStore.clear();
    this.classesStore.clear();
    this.activitiesStore.clear();
    this.marketingLinksStore.clear();
    this.schoolStudentsStore.clear();
    this.userLocationsStore.clear();
    this.locationsStore.clear();
    this.linkAnalyticsStore.clear();
    this.paymentsStore.clear();
    this.refundsStore.clear();
    this.schoolsStore.clear();
    this.dailyFlowTemplatesStore.clear();
    this.dailyFlowEntriesStore.clear();
    this.dailyFlowSchedulesStore.clear();
    this.technicalIssuesStore.clear();
    this.adminNotificationsStore.clear();
    this.userNotificationsStore.clear();
    this.classEnrollments = [];
    
    // Reset ID counters
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
    this.membershipEnrollmentIdCounter = 1;
    this.classIdCounter = 1;
    this.activityIdCounter = 1;
    this.marketingLinkIdCounter = 1;
    this.linkAnalyticsIdCounter = 1;
    this.paymentIdCounter = 1;
    this.refundIdCounter = 1;
    this.schoolIdCounter = 1;
    this.schoolStudentIdCounter = 1;
    this.userLocationIdCounter = 1;
    this.locationIdCounter = 1;
    this.dailyFlowTemplateIdCounter = 1;
    this.dailyFlowEntryIdCounter = 1;
    this.dailyFlowScheduleIdCounter = 1;
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

  async createUser(userData: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const now = new Date();
    const user: User = { 
      ...userData, 
      id, 
      createdAt: now,
      updatedAt: now,
      auth0Id: userData.auth0Id || null,
      supabaseId: userData.supabaseId || null,
      role: userData.role || "student",
      subscription: userData.subscription || "free",
      permissions: userData.permissions || {},
      isActive: userData.isActive !== undefined ? userData.isActive : true,
      lastLogin: userData.lastLogin || null,
      schoolId: userData.schoolId || null,
      emergencyContactFirstName: userData.emergencyContactFirstName || null,
      emergencyContactLastName: userData.emergencyContactLastName || null,
      emergencyContactPhone: userData.emergencyContactPhone || null,
      emergencyContactRelationship: userData.emergencyContactRelationship || null,
      avatar: userData.avatar || null,
      phone: userData.phone || null
    };
    this.usersStore.set(id, user);
    return user;
  }

  async updateUser(id: number, updateData: Partial<InsertUser>): Promise<User | undefined> {
    const existingUser = this.usersStore.get(id);
    if (!existingUser) {
      return undefined;
    }

    const updatedUser: User = { 
      ...existingUser, 
      ...updateData,
      updatedAt: new Date()
    };
    this.usersStore.set(id, updatedUser);
    
    // Save to persistent storage (same as child editing)
    try {
      await this.saveUsersToDisk();
    } catch (error) {
      console.error('❌ Error saving user changes to disk:', error);
    }
    
    return updatedUser;
  }

  async deleteUser(id: number): Promise<void> {
    this.usersStore.delete(id);
    await this.saveUsersToDisk();
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.usersStore.values());
  }

  // School methods
  async getSchool(id: number): Promise<School | undefined> {
    return this.schoolsStore.get(id);
  }

  async getSchoolByCode(registrationCode: string): Promise<School | undefined> {
    return Array.from(this.schoolsStore.values()).find(
      school => school.registrationCode === registrationCode
    );
  }

  async createSchool(schoolData: InsertSchool & { adminId: number }): Promise<School> {
    const id = this.schoolIdCounter++;
    const now = new Date();
    const school: School = { 
      ...schoolData, 
      id, 
      createdAt: now, 
      updatedAt: now,
      adminId: schoolData.adminId,
      isVerified: false,
      status: schoolData.status || "pending",
      address: schoolData.address || null,
      phoneNumber: schoolData.phoneNumber || null,
      website: schoolData.website || null,
      logo: schoolData.logo || null,
      description: schoolData.description || null,
      foundedYear: schoolData.foundedYear || null,
      accreditation: schoolData.accreditation || null,
      enrollmentSize: schoolData.enrollmentSize || null,
      registrationCode: schoolData.registrationCode || null
    };
    this.schoolsStore.set(id, school);
    return school;
  }

  async updateSchool(id: number, updateData: Partial<InsertSchool>): Promise<School | undefined> {
    const existingSchool = this.schoolsStore.get(id);
    if (!existingSchool) {
      return undefined;
    }

    const updatedSchool: School = { 
      ...existingSchool, 
      ...updateData,
      updatedAt: new Date()
    };
    this.schoolsStore.set(id, updatedSchool);
    return updatedSchool;
  }

  async getAllSchools(): Promise<School[]> {
    return Array.from(this.schoolsStore.values());
  }

  async getSchoolsByAdminId(adminId: number): Promise<School[]> {
    return Array.from(this.schoolsStore.values()).filter(
      school => school.adminId === adminId
    );
  }

  async getUserRolesByUserId(userId: number): Promise<UserRole[]> {
    return [];
  }

  async getLocationsBySchool(schoolId: number): Promise<Location[]> {
    return [];
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

  async createCurriculum(insertCurriculum: InsertCurriculum & { authorId: number }): Promise<Curriculum> {
    const id = this.curriculumIdCounter++;
    const now = new Date();
    const curriculum: Curriculum = { 
      ...insertCurriculum, 
      id, 
      createdAt: now, 
      updatedAt: now,
      authorId: insertCurriculum.authorId,
      description: insertCurriculum.description || null,
      isPublished: insertCurriculum.isPublished !== undefined ? insertCurriculum.isPublished : false,
      isPublic: insertCurriculum.isPublic !== undefined ? insertCurriculum.isPublic : false,
      price: insertCurriculum.price !== undefined ? insertCurriculum.price : 0
    };
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

  async getAllCurricula(): Promise<Curriculum[]> {
    return Array.from(this.curriculaStore.values());
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

  async createLesson(insertLesson: InsertLesson & { authorId: number }): Promise<Lesson> {
    const id = this.lessonIdCounter++;
    const now = new Date();
    const lesson: Lesson = { 
      ...insertLesson, 
      id, 
      createdAt: now, 
      updatedAt: now,
      authorId: insertLesson.authorId,
      description: insertLesson.description || null,
      isPublished: insertLesson.isPublished !== undefined ? insertLesson.isPublished : false,
      status: insertLesson.status || "draft",
      curriculumId: insertLesson.curriculumId || null
    };
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

  async createEvent(insertEvent: InsertEvent & { organizerId: number }): Promise<Event> {
    const id = this.eventIdCounter++;
    const now = new Date();
    const event: Event = { 
      ...insertEvent, 
      id, 
      createdAt: now,
      organizerId: insertEvent.organizerId,
      description: insertEvent.description || null,
      location: insertEvent.location || null
    };
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

  async createMarketplaceItem(insertItem: InsertMarketplaceItem & { sellerId: number }): Promise<MarketplaceItem> {
    const id = this.marketplaceItemIdCounter++;
    const now = new Date();
    const item: MarketplaceItem = {
      ...insertItem,
      id,
      sales: 0,
      revenue: 0,
      createdAt: now,
      sellerId: insertItem.sellerId,
      description: insertItem.description || null,
      isActive: insertItem.isActive !== undefined ? insertItem.isActive : true
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

  async getKnowledgeBaseById(id: number, userId: number): Promise<KnowledgeBase | undefined> {
    const knowledgeBase = this.knowledgeBaseStore.get(id);
    
    // Check if knowledge base exists and is either public, owned by the user, or user is an admin
    if (knowledgeBase && (knowledgeBase.isPublic || knowledgeBase.authorId === userId || userId === 0)) {
      return knowledgeBase;
    }

    return undefined;
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

  async createKnowledgeBase(insertKnowledgeBase: InsertKnowledgeBase & { authorId: number }): Promise<KnowledgeBase> {
    const id = this.knowledgeBaseIdCounter++;
    const now = new Date();
    const knowledgeBase: KnowledgeBase = {
      ...insertKnowledgeBase,
      id,
      createdAt: now,
      updatedAt: now,
      downloadCount: 0,
      purchasedBy: [],
      authorId: insertKnowledgeBase.authorId,
      description: insertKnowledgeBase.description || null,
      isPublic: insertKnowledgeBase.isPublic !== undefined ? insertKnowledgeBase.isPublic : false,
      price: insertKnowledgeBase.price !== undefined ? insertKnowledgeBase.price : 0,
      aiProcessed: false,
      aiInsights: null,
      processedAt: null
    };

    this.knowledgeBaseStore.set(id, knowledgeBase);

    // Persist to disk
    await this.saveKnowledgeBasesToDisk();
    console.log(`✅ Knowledge base created and saved to disk with ID: ${id}, title: "${knowledgeBase.title}"`);
    console.log(`📊 Total knowledge bases in storage: ${this.knowledgeBaseStore.size}`);

    return knowledgeBase;
  }

  async updateKnowledgeBase(id: number, updateData: Partial<InsertKnowledgeBase>): Promise<KnowledgeBase | undefined> {
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
      downloadCount: knowledgeBase.downloadCount + 1
    };

    this.knowledgeBaseStore.set(id, updatedKnowledgeBase);
    return updatedKnowledgeBase;
  }

  async addPurchaser(id: number, userId: number): Promise<KnowledgeBase | undefined> {
    const knowledgeBase = this.knowledgeBaseStore.get(id);
    if (!knowledgeBase) return undefined;

    // Check if user has already purchased
    const purchasedByArray = Array.isArray(knowledgeBase.purchasedBy) ? knowledgeBase.purchasedBy : [];
    if (purchasedByArray.includes(userId)) {
      return knowledgeBase;
    }

    const updatedKnowledgeBase: KnowledgeBase = {
      ...knowledgeBase,
      purchasedBy: [...purchasedByArray, userId]
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
      updatedAt: now,
      schoolId: childData.schoolId || null,
      parentEmail: childData.parentEmail || null
    };

    this.childrenStore.set(id, child);

    // Save to persistent storage
    await this.saveChildrenToDisk();

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

    // Save to persistent storage
    await this.saveChildrenToDisk();

    return updatedChild;
  }

  async deleteChild(id: number): Promise<void> {
    this.childrenStore.delete(id);

    // Save to persistent storage
    await this.saveChildrenToDisk();
  }

  private async saveChildrenToDisk(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const dataDir = path.join(process.cwd(), 'data');
      const filePath = path.join(dataDir, 'children.json');

      // Ensure data directory exists
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Convert Map to Array for JSON serialization
      const children = Array.from(this.childrenStore.values());

      // Write to file
      fs.writeFileSync(filePath, JSON.stringify(children, null, 2));

      console.log(`💾 Successfully saved ${children.length} children to disk`);
    } catch (error) {
      console.error('❌ Error saving children to disk:', error);
    }
  }

  private async loadUsersFromJSON(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const bcrypt = await import('bcryptjs');
      
      const dataDir = path.join(process.cwd(), 'data');
      const filePath = path.join(dataDir, 'users.json');
      
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const users = JSON.parse(fileContent);
        
        // Clear existing users and load from file
        this.usersStore.clear();
        let maxId = 0;
        let hashedCount = 0;
        
        for (const user of users) {
          // Hash plain-text passwords for security
          let password = user.password;
          if (password && !password.startsWith('$2a$') && !password.startsWith('$2b$')) {
            // This is a plain-text password, hash it
            password = await bcrypt.hash(password, 10);
            hashedCount++;
          }
          
          this.usersStore.set(user.id, {
            ...user,
            password,
            createdAt: new Date(user.createdAt),
            updatedAt: new Date(user.updatedAt)
          });
          maxId = Math.max(maxId, user.id);
        }
        
        // Update the counter to avoid ID conflicts
        this.userIdCounter = maxId + 1;
        
        console.log(`✅ Successfully loaded ${users.length} users from storage`);
        if (hashedCount > 0) {
          console.log(`🔒 Hashed ${hashedCount} plain-text passwords for security`);
        }
      } else {
        console.log('👥 No users.json found, starting with empty users');
      }
    } catch (error) {
      console.error('❌ Error loading users from JSON:', error);
    }
  }

  async saveUsersToDisk(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const dataDir = path.join(process.cwd(), 'data');
      const filePath = path.join(dataDir, 'users.json');

      // Ensure data directory exists
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Convert Map to Array for JSON serialization
      const users = Array.from(this.usersStore.values());

      // Write to file
      fs.writeFileSync(filePath, JSON.stringify(users, null, 2));

      console.log(`💾 Successfully saved ${users.length} users to disk`);
    } catch (error) {
      console.error('❌ Error saving users to disk:', error);
    }
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
      updatedAt: now,
      schoolId: programData.schoolId || null,
      isPublished: programData.isPublished ?? false,
      locationId: programData.locationId || null,
      locationName: programData.locationName || null,
      locationAddress: programData.locationAddress || null
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

  async getProgramEnrollmentsByParent(parentId: number): Promise<ProgramEnrollment[]> {
    return Array.from(this.programEnrollmentsStore.values())
      .filter(enrollment => enrollment.parentId === parentId);
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
    // Count enrollments with valid statuses (excluding cancelled, withdrawn, failed)
    // Valid statuses: pending_payment, enrolled, waitlist, completed
    return this.getEnrollmentsByProgramId(programId).then(enrollments =>
      enrollments.filter(enrollment =>
        enrollment.status === 'pending_payment' || 
        enrollment.status === 'enrolled' || 
        enrollment.status === 'waitlist' ||
        enrollment.status === 'completed').length
    );
  }

  async getEnrollmentCountForClass(classId: number): Promise<number> {
    // Count enrollments for a class by classId or marketplaceClassId
    // Valid statuses: pending_payment, enrolled, waitlist, completed
    const enrollments = Array.from(this.programEnrollmentsStore.values())
      .filter(enrollment => 
        (enrollment.classId === classId || enrollment.marketplaceClassId === classId) &&
        (enrollment.status === 'pending_payment' || 
         enrollment.status === 'enrolled' || 
         enrollment.status === 'waitlist' ||
         enrollment.status === 'completed')
      );
    return enrollments.length;
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

  async cancelPendingEnrollments(enrollmentIds: number[], parentUserId: number): Promise<{ cancelled: number[]; skipped: number[]; errors: string[] }> {
    const cancelled: number[] = [];
    const skipped: number[] = [];
    const errors: string[] = [];

    for (const id of enrollmentIds) {
      const enrollment = this.programEnrollmentsStore.get(id);
      if (!enrollment) {
        errors.push(`Enrollment ${id} not found`);
        continue;
      }

      // Verify ownership by checking if the child belongs to the parent
      const child = await this.getChildById(enrollment.childId);
      if (!child || child.parentUserId !== parentUserId) {
        errors.push(`Enrollment ${id} does not belong to this parent`);
        continue;
      }

      // Skip if enrollment has been paid
      if (enrollment.amountPaid && enrollment.amountPaid > 0) {
        skipped.push(id);
        continue;
      }

      // Skip if not in pending_payment status
      if (enrollment.status !== 'pending_payment') {
        skipped.push(id);
        continue;
      }

      // Update to cancelled status
      const updatedEnrollment: ProgramEnrollment = {
        ...enrollment,
        status: 'cancelled',
        updatedAt: new Date()
      };
      this.programEnrollmentsStore.set(id, updatedEnrollment);
      cancelled.push(id);
    }

    return { cancelled, skipped, errors };
  }

  async getStripeCustomerIdsByParentEmail(parentEmail: string): Promise<string[]> {
    // In-memory implementation: extract unique Stripe customer IDs from enrollments
    const enrollments = Array.from(this.programEnrollmentsStore.values());
    const activeStatuses = ['pending_payment', 'enrolled', 'completed'];
    
    const uniqueCustomerIds = new Set(
      enrollments
        .filter(e => e.parentEmail === parentEmail && activeStatuses.includes(e.status) && e.stripeCustomerId)
        .map(e => e.stripeCustomerId!)
    );
    
    return Array.from(uniqueCustomerIds);
  }

  async getStripeLinkedEnrollmentsByParentEmail(parentEmail: string): Promise<ProgramEnrollment[]> {
    // In-memory implementation: return enrollments with Stripe data
    const activeStatuses = ['pending_payment', 'enrolled', 'completed'];
    
    return Array.from(this.programEnrollmentsStore.values())
      .filter(e => 
        e.parentEmail === parentEmail && 
        activeStatuses.includes(e.status) && 
        e.stripeCustomerId !== null
      );
  }

  // Membership Enrollment methods
  async getMembershipEnrollmentById(id: number): Promise<MembershipEnrollment | undefined> {
    return this.membershipEnrollmentsStore.get(id);
  }

  async getMembershipEnrollmentsByParentId(parentUserId: number): Promise<MembershipEnrollment[]> {
    return Array.from(this.membershipEnrollmentsStore.values())
      .filter(enrollment => enrollment.parentUserId === parentUserId);
  }

  async getMembershipEnrollmentsBySchoolId(schoolId: number): Promise<MembershipEnrollment[]> {
    return Array.from(this.membershipEnrollmentsStore.values())
      .filter(enrollment => enrollment.schoolId === schoolId);
  }

  async getMembershipEnrollmentByParentAndSchoolAndYear(parentUserId: number, schoolId: number, membershipYear: number): Promise<MembershipEnrollment | undefined> {
    return Array.from(this.membershipEnrollmentsStore.values())
      .find(enrollment => 
        enrollment.parentUserId === parentUserId && 
        enrollment.schoolId === schoolId && 
        enrollment.membershipYear === membershipYear
      );
  }

  async createMembershipEnrollment(enrollmentData: InsertMembershipEnrollment): Promise<MembershipEnrollment> {
    const id = this.membershipEnrollmentIdCounter++;
    const now = new Date();

    const enrollment: MembershipEnrollment = {
      ...enrollmentData,
      id,
      createdAt: now,
      updatedAt: now
    };

    this.membershipEnrollmentsStore.set(id, enrollment);
    return enrollment;
  }

  async updateMembershipEnrollment(id: number, updateData: Partial<InsertMembershipEnrollment>): Promise<MembershipEnrollment | undefined> {
    const enrollment = this.membershipEnrollmentsStore.get(id);
    if (!enrollment) return undefined;

    const updatedEnrollment: MembershipEnrollment = {
      ...enrollment,
      ...updateData,
      updatedAt: new Date()
    };

    this.membershipEnrollmentsStore.set(id, updatedEnrollment);
    return updatedEnrollment;
  }

  async deleteMembershipEnrollment(id: number): Promise<void> {
    this.membershipEnrollmentsStore.delete(id);
  }

  async createOrUpdateMembershipEnrollment(parentUserId: number, schoolId: number, membershipYear: number): Promise<MembershipEnrollment> {
    // Check if enrollment already exists
    const existing = await this.getMembershipEnrollmentByParentAndSchoolAndYear(parentUserId, schoolId, membershipYear);
    if (existing) {
      return existing;
    }

    // Get school to get membership configuration
    const school = await this.getSchool(schoolId);
    if (!school) {
      throw new Error('School not found');
    }

    // Calculate membership dates
    const renewalDate = new Date(membershipYear, (school.membershipRenewalMonth || 9) - 1, school.membershipRenewalDay || 1);
    const expirationDate = new Date(membershipYear + 1, (school.membershipRenewalMonth || 9) - 1, school.membershipRenewalDay || 1);
    const gracePeriodEnd = new Date(expirationDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + (school.membershipGracePeriodDays || 30));

    // Create new membership enrollment
    const enrollmentData: InsertMembershipEnrollment = {
      schoolId,
      parentUserId,
      membershipYear,
      amount: school.membershipFeeAmount || 0,
      amountPaid: 0,
      remainingBalance: school.membershipFeeAmount || 0,
      status: 'pending_payment',
      dueDate: renewalDate,
      expirationDate,
      gracePeriodEnd,
      notes: null,
      paymentMethod: null
    };

    return this.createMembershipEnrollment(enrollmentData);
  }

  // Membership Agreement methods
  async getMembershipAgreementById(id: number): Promise<MembershipAgreement | undefined> {
    return this.membershipAgreementsStore.get(id);
  }

  async getMembershipAgreementsByParentId(parentUserId: number): Promise<MembershipAgreement[]> {
    return Array.from(this.membershipAgreementsStore.values())
      .filter(agreement => agreement.parentUserId === parentUserId)
      .sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime());
  }

  async getMembershipAgreementsBySchoolId(schoolId: number): Promise<MembershipAgreement[]> {
    return Array.from(this.membershipAgreementsStore.values())
      .filter(agreement => agreement.schoolId === schoolId)
      .sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime());
  }

  async getMembershipAgreementByEnrollmentId(enrollmentId: number): Promise<MembershipAgreement | undefined> {
    return Array.from(this.membershipAgreementsStore.values())
      .find(agreement => agreement.membershipEnrollmentId === enrollmentId);
  }

  async getLatestMembershipAgreementByParentAndSchool(parentUserId: number, schoolId: number): Promise<MembershipAgreement | undefined> {
    const agreements = Array.from(this.membershipAgreementsStore.values())
      .filter(agreement => agreement.parentUserId === parentUserId && agreement.schoolId === schoolId)
      .sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime());
    return agreements[0];
  }

  async createMembershipAgreement(agreementData: InsertMembershipAgreement): Promise<MembershipAgreement> {
    const id = this.membershipAgreementIdCounter++;
    const now = new Date();

    const agreement: MembershipAgreement = {
      ...agreementData,
      id,
      signedAt: now,
      createdAt: now
    };

    this.membershipAgreementsStore.set(id, agreement);
    return agreement;
  }

  async hasSignedCurrentAgreement(parentUserId: number, schoolId: number, currentVersion: string): Promise<boolean> {
    const latestAgreement = await this.getLatestMembershipAgreementByParentAndSchool(parentUserId, schoolId);
    return latestAgreement !== undefined && latestAgreement.agreementVersion === currentVersion;
  }

  // Class Enrollment methods
  async createEnrollment(enrollment: any): Promise<any> {
    // Generate a unique ID for the enrollment
    const id = Date.now() + Math.random(); // Simple unique ID generation
    const enrollmentWithId = {
      ...enrollment,
      id: Math.floor(id) // Ensure it's an integer
    };

    // Save to memory array
    if (!this.classEnrollments) {
      this.classEnrollments = [];
    }
    this.classEnrollments.push(enrollmentWithId);
    console.log(`📝 ENROLLMENT STORED: Child ${enrollmentWithId.childId} enrolled in class ${enrollmentWithId.classId} with ID ${enrollmentWithId.id}`);
    console.log(`📝 Total enrollments in memory: ${this.classEnrollments.length}`);

    // Save to file for persistence
    try {
      console.log(`💾 About to save enrollments to file...`);
      await this.saveEnrollmentsToFile();
      console.log(`💾 Save operation completed`);
    } catch (error) {
      console.error(`❌ Error in createEnrollment save operation:`, error);
    }

    return enrollmentWithId;
  }

  async getEnrollmentsByChildId(childId: number): Promise<any[]> {
    // Read from programEnrollmentsStore (the canonical source for all enrollments)
    const enrollments = Array.from(this.programEnrollmentsStore.values())
      .filter(enrollment => enrollment.childId === childId);
    console.log(`📝 ENROLLMENT QUERY: Child ${childId} has ${enrollments.length} enrollments from programEnrollmentsStore`);
    console.log(`📝 Enrollments found:`, enrollments);
    return enrollments;
  }

  async getEnrollmentsByChildIds(childIds: number[]): Promise<any[]> {
    // Read from programEnrollmentsStore (the canonical source for all enrollments)
    const enrollments = Array.from(this.programEnrollmentsStore.values())
      .filter(enrollment => childIds.includes(enrollment.childId));
    console.log(`📝 ENROLLMENT QUERY: Children ${childIds.join(', ')} have ${enrollments.length} enrollments from programEnrollmentsStore`);
    return enrollments;
  }

  async getEnrollmentsByClassId(classId: number): Promise<any[]> {
    // Read from programEnrollmentsStore (the canonical source for all enrollments)
    const enrollments = Array.from(this.programEnrollmentsStore.values())
      .filter(enrollment => enrollment.classId === classId);
    console.log(`📝 ENROLLMENT QUERY: Class ${classId} has ${enrollments.length} enrollments from programEnrollmentsStore`);
    return enrollments;
  }

  async getEnrollmentById(id: number): Promise<any> {
    // Read from programEnrollmentsStore (the canonical source for all enrollments)
    const enrollment = this.programEnrollmentsStore.get(id);
    console.log(`📝 ENROLLMENT QUERY: Enrollment ${id} ${enrollment ? 'found' : 'not found'} in programEnrollmentsStore`);
    return enrollment;
  }

  async updateEnrollment(idOrEnrollment: any, updates?: any): Promise<any> {
    let enrollmentId: number;
    let updateData: any;

    if (typeof idOrEnrollment === 'number' && updates) {
      enrollmentId = idOrEnrollment;
      updateData = updates;
    } else if (typeof idOrEnrollment === 'object' && idOrEnrollment.id) {
      enrollmentId = idOrEnrollment.id;
      updateData = idOrEnrollment;
    } else {
      console.log(`❌ Invalid parameters for updateEnrollment`);
      return null;
    }

    if (!this.classEnrollments) {
      console.log(`❌ No classEnrollments array exists for enrollment ${enrollmentId}`);
      return null;
    }

    const index = this.classEnrollments.findIndex(e => e.id === enrollmentId);
    if (index === -1) {
      console.log(`❌ Enrollment ${enrollmentId} not found for update`);
      return null;
    }

    const updatedEnrollment = { ...this.classEnrollments[index], ...updateData };
    this.classEnrollments[index] = updatedEnrollment;

    console.log(`✅ ENROLLMENT UPDATED: ID ${updatedEnrollment.id}, Status: ${updatedEnrollment.status}`);
    console.log(`📝 Updated enrollment:`, updatedEnrollment);

    try {
      console.log(`💾 About to save enrollments to file after update...`);
      await this.saveEnrollmentsToFile();
      console.log(`💾 Save operation completed after update`);
    } catch (error) {
      console.error(`❌ Error in updateEnrollment save operation:`, error);
    }

    return updatedEnrollment;
  }

  async deleteEnrollment(id: number): Promise<void> {
    if (!this.classEnrollments) {
      console.log(`❌ No classEnrollments array exists for enrollment ${id}`);
      return;
    }

    const initialLength = this.classEnrollments.length;
    this.classEnrollments = this.classEnrollments.filter(enrollment => enrollment.id !== id);
    const finalLength = this.classEnrollments.length;

    if (initialLength === finalLength) {
      console.log(`❌ Enrollment ${id} not found`);
      return;
    }

    console.log(`❌ ENROLLMENT DELETED: ID ${id}`);
    console.log(`📝 Total enrollments remaining: ${this.classEnrollments.length}`);

    // Save to file for persistence
    try {
      console.log(`💾 About to save enrollments to file after deletion...`);
      await this.saveEnrollmentsToFile();
      console.log(`💾 Save operation completed after deletion`);
    } catch (error) {
      console.error(`❌ Error in deleteEnrollment save operation:`, error);
    }
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

  async getEnrollmentsByIds(enrollmentIds: number[]): Promise<any[]> {
    if (!this.classEnrollments) {
      console.log(`📝 No classEnrollments array exists for enrollmentIds ${enrollmentIds}`);
      return [];
    }
    const enrollments = this.classEnrollments.filter(enrollment => enrollmentIds.includes(enrollment.id));
    console.log(`📝 ENROLLMENT QUERY: Found ${enrollments.length} enrollments for IDs ${enrollmentIds}`);
    return enrollments;
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

  async getAllClasses(): Promise<Class[]> {
    return Array.from(this.classesStore.values());
  }

  async getClassesBySchoolId(schoolId: string): Promise<Class[]> {
    const schoolIdNum = parseInt(schoolId, 10);
    if (isNaN(schoolIdNum)) {
      return [];
    }
    return Array.from(this.classesStore.values()).filter(
      classItem => classItem.schoolId === schoolIdNum
    );
  }

  async createClass(classData: InsertClass & { instructorId: number }): Promise<Class> {
    const id = this.classIdCounter++;
    const now = new Date();

    const newClass: Class = {
      ...classData,
      id,
      createdAt: now,
      updatedAt: now,
      enrollmentCount: 0,
      isPublished: classData.isPublished ?? false,
      capacity: classData.capacity || null,
      locationId: classData.locationId || null,
      schoolId: classData.schoolId || null,
      startDate: typeof classData.startDate === 'string' ? classData.startDate : classData.startDate?.toISOString() || null,
      endDate: typeof classData.endDate === 'string' ? classData.endDate : classData.endDate?.toISOString() || null,
      status: (classData.status as "completed" | "active" | "cancelled" | "upcoming") || 'upcoming'
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
      updatedAt: new Date(),
      startDate: updateData.startDate ? (typeof updateData.startDate === 'string' ? updateData.startDate : updateData.startDate.toISOString()) : classItem.startDate,
      endDate: updateData.endDate ? (typeof updateData.endDate === 'string' ? updateData.endDate : updateData.endDate.toISOString()) : classItem.endDate,
      status: (updateData.status as "completed" | "active" | "cancelled" | "upcoming") || classItem.status || 'upcoming'
    };

    this.classesStore.set(id, updatedClass);
    return updatedClass;
  }

  async deleteClass(id: number): Promise<void> {
    this.classesStore.delete(id);
  }


  async deleteKnowledgeBase(id: number): Promise<void> {
    this.knowledgeBaseStore.delete(id);
    await this.saveKnowledgeBasesToDisk();
  }

  private async saveKnowledgeBasesToDisk(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const kbFilePath = path.join(dataDir, 'knowledge-bases.json');
      const knowledgeBases = Array.from(this.knowledgeBaseStore.values());

      fs.writeFileSync(kbFilePath, JSON.stringify(knowledgeBases, null, 2));
      console.log(`✅ Saved ${knowledgeBases.length} knowledge bases to storage`);
    } catch (error) {
      console.error('Error saving knowledge bases:', error);
    }
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
            // Try to read first file to extract title
            let title = 'Uploaded Knowledge Base';
            let subject = 'General';

            try {
              const firstFile = files[0];
              const filePath = path.join(kbPath, firstFile);
              const content = fs.readFileSync(filePath, 'utf8');

              // Extract title from content
              const lines = content.split('\n');
              const firstLine = lines[0]?.trim();

              if (firstLine && firstLine.length > 0) {
                title = firstLine.replace(/^#+\s*/, ''); // Remove markdown headers

                // Determine subject based on content
                const contentLower = content.toLowerCase();
                if (contentLower.includes('history') || contentLower.includes('revolutionary')) {
                  subject = 'History';
                } else if (contentLower.includes('math') || contentLower.includes('mathematics')) {
                  subject = 'Mathematics';
                } else if (contentLower.includes('science') || contentLower.includes('physics')) {
                  subject = 'Science';
                } else if (contentLower.includes('english') || contentLower.includes('writing')) {
                  subject = 'Language Arts';
                }
              }
            } catch (error) {
              // Keep default title if file reading fails
            }

            // Create knowledge base entry from uploaded files
            const kb: KnowledgeBase = {
              id: this.knowledgeBaseIdCounter++,
              title: title,
              description: `Knowledge base containing ${files.length} uploaded files`,
              subject: subject,
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
              updatedAt: new Date(),
              aiProcessed: false,
              aiInsights: null,
              processedAt: null
            };

            this.knowledgeBaseStore.set(kb.id, kb);
            loadedCount++;
          }
        }

        if (loadedCount > 0) {
          console.log(`✅ Successfully loaded ${loadedCount} uploaded knowledge bases`);
          // Also create representative knowledge bases to restore previously created content
          this.createRepresentativeKnowledgeBases();
          await this.saveKnowledgeBasesToDisk();
          return;
        }
      }

      // Create some representative knowledge bases based on previously created content
      this.createRepresentativeKnowledgeBases();
    } catch (error) {
      console.error('Error loading knowledge bases:', error);
      this.initializeSampleKnowledgeBases();
    }
  }

  private createRepresentativeKnowledgeBases(): void {
    // Create knowledge bases that represent previously created content
    const kb1: KnowledgeBase = {
      id: this.knowledgeBaseIdCounter++,
      title: "Antoinette Brown Blackwell Collection",
      description: "Historical collection featuring the first ordained female minister in the United States and women's rights advocate",
      subject: "History",
      difficulty: "High School",
      authorId: 2, // Super admin
      price: 0,
      files: [
        {
          url: "/attached_assets/antoinette_brown_blackwell.json",
          type: "json",
          name: "antoinette_brown_blackwell.json"
        }
      ],
      metadata: {
        tags: ["women's rights", "history", "biography", "pioneering women"],
        objectives: ["Learn about women's suffrage", "Understand religious leadership", "Explore 19th century social movements"]
      },
      isPublic: true,
      downloadCount: 0,
      purchasedBy: [],
      aiProcessed: false,
      aiInsights: null,
      processedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const kb2: KnowledgeBase = {
      id: this.knowledgeBaseIdCounter++,
      title: "American Seekers Academy Platform",
      description: "Comprehensive development documentation and architecture for the ASA learning management system",
      subject: "Technology",
      difficulty: "Advanced",
      authorId: 2,
      price: 0,
      files: [
        {
          url: "/attached_assets/ASA_Platform_Features_and_Roles.md",
          type: "md",
          name: "Platform Features and Roles"
        },
        {
          url: "/attached_assets/ASA_Platform_System_Architecture.md",
          type: "md",
          name: "System Architecture"
        }
      ],
      metadata: {
        tags: ["education technology", "platform development", "system architecture"],
        objectives: ["Understand platform design", "Learn system architecture", "Explore educational technology"]
      },
      isPublic: true,
      downloadCount: 0,
      purchasedBy: [],
      aiProcessed: false,
      aiInsights: null,
      processedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const kb3: KnowledgeBase = {
      id: this.knowledgeBaseIdCounter++,
      title: "Learning AI Development Resources",
      description: "Collection of AI integration strategies and implementation guides for educational platforms",
      subject: "Computer Science",
      difficulty: "Advanced",
      authorId: 2,
      price: 0,
      files: [
        {
          url: "/attached_assets/Learning app AI.txt",
          type: "txt",
          name: "AI Learning Application Guide"
        },
        {
          url: "/attached_assets/ASA_Platform_NLP_Recommendation.markdown",
          type: "md",
          name: "NLP Recommendation System"
        }
      ],
      metadata: {
        tags: ["artificial intelligence", "educational technology", "NLP", "machine learning"],
        objectives: ["Implement AI in education", "Understand NLP applications", "Design recommendation systems"]
      },
      isPublic: true,
      downloadCount: 0,
      purchasedBy: [],
      aiProcessed: false,
      aiInsights: null,
      processedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.knowledgeBaseStore.set(kb1.id, kb1);
    this.knowledgeBaseStore.set(kb2.id, kb2);
    this.knowledgeBaseStore.set(kb3.id, kb3);

    console.log(`✅ Created 3 representative knowledge bases based on previous content`);
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
      endDate: new Date(currentYear, currentMonth, currentDay + 14, 15, 0),
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
      downloadCount: (activity.downloadCount || 0) + 1,
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

  async getAllActivities(): Promise<Activity[]> {
    return Array.from(this.activitiesStore.values());
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

        // Clear existing classes first to reload fresh data
        this.classesStore.clear();

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
        type: "school_admin" as const,
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

  private async initializeScheduledPayments() {
    // Load scheduled payments from the JSON file
    try {
      const fs = await import('fs');
      const path = await import('path');
      const scheduledPaymentsFilePath = path.join(process.cwd(), 'data', 'scheduled-payments.json');

      if (fs.existsSync(scheduledPaymentsFilePath)) {
        const scheduledPaymentsData = JSON.parse(fs.readFileSync(scheduledPaymentsFilePath, 'utf-8'));
        console.log(`💳 Loading ${scheduledPaymentsData.length} scheduled payments from scheduled-payments.json`);

        // Load scheduled payments into memory store
        for (const payment of scheduledPaymentsData) {
          const scheduledPayment: ScheduledPayment = {
            ...payment,
            dueDate: new Date(payment.dueDate),
            createdAt: new Date(payment.createdAt),
            updatedAt: new Date(payment.updatedAt)
          };
          this.scheduledPaymentsStore.set(payment.id, scheduledPayment);
          this.scheduledPaymentIdCounter = Math.max(this.scheduledPaymentIdCounter, payment.id + 1);
        }

        console.log(`✅ Successfully loaded ${scheduledPaymentsData.length} scheduled payments into storage`);
      } else {
        console.log('💳 No scheduled-payments.json found, starting with empty scheduled payments');
      }
    } catch (error) {
      console.error('❌ Error loading scheduled payments from JSON:', error);
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
      ...data,
      isActive: data.isActive ?? true,
      clickCount: data.clickCount ?? 0
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
      updatedAt: new Date(),
      isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
      clickCount: data.clickCount !== undefined ? data.clickCount : existing.clickCount
    };
    this.marketingLinksStore.set(id, updated);
    return updated;
  }

  async deleteMarketingLink(id: number): Promise<void> {
    this.marketingLinksStore.delete(id);
  }

  async createLinkAnalytics(data: InsertLinkAnalytics): Promise<LinkAnalytics> {
    const id = this.linkAnalyticsIdCounter++;
    const analytics: LinkAnalytics = {
      id,
      timestamp: new Date(),
      ...data,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      referrer: data.referrer || null
    };
    this.linkAnalyticsStore.set(id, analytics);
    return analytics;
  }

  async incrementLinkClick(campaignId: string): Promise<void> {
    const link = await this.getMarketingLinkByCampaignId(campaignId);
    if (!link) return;
    const linkId = link.id;
    await this.createLinkAnalytics({
      linkId,
      event: 'click',
      ipAddress: null,
      userAgent: null,
      referrer: null
    });
  }

  async incrementLinkConversion(campaignId: string): Promise<void> {
    const link = await this.getMarketingLinkByCampaignId(campaignId);
    if (!link) return;
    const linkId = link.id;
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

  async getLinkAnalyticsByLinkId(linkId: number, startDate?: Date, endDate?: Date): Promise<LinkAnalytics[]> {
    return Array.from(this.linkAnalyticsStore.values()).filter(
      analytics => analytics.linkId === linkId
    );
  }

  async getLinkAnalyticsBySchoolId(schoolId: number, startDate?: Date, endDate?: Date): Promise<LinkAnalytics[]> {
    return Array.from(this.linkAnalyticsStore.values()).filter(
      analytics => analytics.linkId === schoolId
    );
  }

  // Payment methods implementation
  async getAllPayments(): Promise<Payment[]> {
    return Array.from(this.paymentsStore.values());
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const id = this.paymentIdCounter++;
    const now = new Date();
    const newPayment: Payment = {
      id,
      createdAt: now,
      updatedAt: now,
      ...payment,
      metadata: payment.metadata || {},
      currency: payment.currency || 'usd',
      status: payment.status || 'pending'
    };
    this.paymentsStore.set(id, newPayment);
    
    // Save to file for persistence
    await this.savePaymentsToFile();
    console.log(`💾 Saved new payment ${id} to file`);
    
    return newPayment;
  }

  private async savePaymentsToFile(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const paymentsFilePath = path.join(process.cwd(), 'data', 'payment-history.json');

      const allPayments = Array.from(this.paymentsStore.values());
      await fs.promises.writeFile(paymentsFilePath, JSON.stringify(allPayments, null, 2));
      console.log(`💾 Saved ${allPayments.length} payment history records to file`);
    } catch (error) {
      console.error('❌ Error saving payments to file:', error);
    }
  }

  async getPaymentsByParentEmail(parentEmail: string): Promise<Payment[]> {
    return Array.from(this.paymentsStore.values()).filter(
      payment => payment.parentEmail === parentEmail
    );
  }

  async getPaymentByStripeId(stripePaymentIntentId: string): Promise<Payment | undefined> {
    return Array.from(this.paymentsStore.values()).find(
      payment => payment.stripePaymentIntentId === stripePaymentIntentId
    );
  }

  async updatePaymentStatus(id: number, status: 'pending' | 'failed' | 'succeeded' | 'canceled'): Promise<Payment | undefined> {
    const payment = this.paymentsStore.get(id);
    if (!payment) return undefined;

    const updatedPayment: Payment = {
      ...payment,
      status: status === 'succeeded' ? 'completed' : status === 'canceled' ? 'refunded' : status,
      updatedAt: new Date()
    };
    this.paymentsStore.set(id, updatedPayment);
    return updatedPayment;
  }

  // Stripe Payment History methods implementation
  async saveStripePayment(payment: InsertStripePaymentHistory): Promise<StripePaymentHistory> {
    const db = await getDb();
    
    // Check if payment already exists by payment_intent_id
    const existing = await this.getStripePaymentByIntentId(payment.paymentIntentId);
    if (existing) {
      return existing;
    }
    
    const result = await db.insert(stripePaymentHistory).values(payment).returning();
    return result[0];
  }

  async getStripePaymentHistoryByUserId(userId: number): Promise<StripePaymentHistory[]> {
    const db = await getDb();
    const result = await db.select().from(stripePaymentHistory).where(eq(stripePaymentHistory.userId, userId));
    return result;
  }

  async getStripePaymentsBySubscription(subscriptionId: string): Promise<StripePaymentHistory[]> {
    const db = await getDb();
    const result = await db.select().from(stripePaymentHistory).where(eq(stripePaymentHistory.subscriptionId, subscriptionId));
    return result;
  }

  async getStripePaymentByIntentId(paymentIntentId: string): Promise<StripePaymentHistory | undefined> {
    const db = await getDb();
    const result = await db.select().from(stripePaymentHistory).where(eq(stripePaymentHistory.paymentIntentId, paymentIntentId)).limit(1);
    return result[0];
  }

  private async initializePayments() {
    // Load payments from the JSON file
    try {
      const fs = await import('fs');
      const path = await import('path');
      const paymentsFilePath = path.join(process.cwd(), 'data', 'payment-history.json');

      if (fs.existsSync(paymentsFilePath)) {
        const paymentsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf-8'));
        console.log(`💰 Loading ${paymentsData.length} payments from payment-history.json`);

        // Load payments into memory store
        for (const payment of paymentsData) {
          const paymentRecord: Payment = {
            ...payment,
            createdAt: new Date(payment.createdAt),
            updatedAt: new Date(payment.updatedAt)
          };
          this.paymentsStore.set(payment.id, paymentRecord);
          this.paymentIdCounter = Math.max(this.paymentIdCounter, payment.id + 1);
        }

        console.log(`✅ Successfully loaded ${paymentsData.length} payments into storage`);
      } else {
        console.log('💰 No payment-history.json found, starting with empty payment history');
      }
    } catch (error) {
      console.error('❌ Error loading payments from JSON:', error);
    }
  }

  // Refund methods implementation
  async createRefund(refund: InsertRefund): Promise<Refund> {
    const id = this.refundIdCounter++;
    const now = new Date();
    const newRefund: Refund = {
      id,
      createdAt: now,
      updatedAt: now,
      ...refund,
      enrollmentId: refund.enrollmentId || null,
      description: refund.description || null,
      stripeRefundId: refund.stripeRefundId || null,
      processedBy: refund.processedBy || null,
      processedAt: refund.processedAt || null,
      failureReason: refund.failureReason || null,
      metadata: refund.metadata || {},
      currency: refund.currency || 'usd',
      status: refund.status || 'pending'
    };
    this.refundsStore.set(id, newRefund);
    return newRefund;
  }

  async getRefundById(id: number): Promise<Refund | undefined> {
    return this.refundsStore.get(id);
  }

  async getRefundsByPaymentId(paymentId: number): Promise<Refund[]> {
    return Array.from(this.refundsStore.values()).filter(
      refund => refund.paymentId === paymentId
    );
  }

  async getRefundsBySchoolId(schoolId: number): Promise<Refund[]> {
    return Array.from(this.refundsStore.values()).filter(
      refund => refund.schoolId === schoolId
    );
  }

  async updateRefund(id: number, refundUpdate: Partial<InsertRefund>): Promise<Refund | undefined> {
    const refund = this.refundsStore.get(id);
    if (!refund) return undefined;

    const updatedRefund: Refund = {
      ...refund,
      ...refundUpdate,
      updatedAt: new Date()
    };
    this.refundsStore.set(id, updatedRefund);
    return updatedRefund;
  }

  async deleteRefund(id: number): Promise<void> {
    this.refundsStore.delete(id);
  }

  // Scheduled payments methods
  private scheduledPaymentsStore = new Map<number, ScheduledPayment>();
  private scheduledPaymentIdCounter = 1;

  async createScheduledPayment(scheduledPayment: InsertScheduledPayment): Promise<ScheduledPayment> {
    const id = this.scheduledPaymentIdCounter++;
    const now = new Date();
    const newScheduledPayment: ScheduledPayment = {
      id,
      createdAt: now,
      updatedAt: now,
      ...scheduledPayment,
      description: scheduledPayment.description || null,
      currency: scheduledPayment.currency || 'USD'
    };
    this.scheduledPaymentsStore.set(id, newScheduledPayment);
    return newScheduledPayment;
  }

  async getScheduledPaymentsByParentEmail(parentEmail: string): Promise<ScheduledPayment[]> {
    // Debug: check if scheduled payments are loaded
    console.log('🔍 MemStorage: scheduledPaymentsStore size:', this.scheduledPaymentsStore.size);
    console.log('🔍 MemStorage: looking for payments for email:', parentEmail);
    
    const allPayments = Array.from(this.scheduledPaymentsStore.values());
    console.log('🔍 MemStorage: all scheduled payments:', allPayments);
    
    const filteredPayments = allPayments.filter(
      payment => payment.parentEmail === parentEmail
    );
    console.log('🔍 MemStorage: filtered payments for parent:', filteredPayments);
    
    return filteredPayments;
  }

  async updateScheduledPaymentStatus(id: number, status: 'pending' | 'paid' | 'overdue' | 'cancelled'): Promise<ScheduledPayment | undefined> {
    const payment = this.scheduledPaymentsStore.get(id);
    if (!payment) return undefined;

    const updatedPayment: ScheduledPayment = {
      ...payment,
      status,
      updatedAt: new Date()
    };
    this.scheduledPaymentsStore.set(id, updatedPayment);
    
    // Save to file for persistence
    await this.saveScheduledPaymentsToFile();
    console.log(`💾 Saved scheduled payment ${id} status update to file`);
    
    return updatedPayment;
  }

  async updateScheduledPaymentReminderCount(id: number, count: number): Promise<ScheduledPayment | undefined> {
    const payment = this.scheduledPaymentsStore.get(id);
    if (!payment) return undefined;

    const updatedPayment: ScheduledPayment = {
      ...payment,
      reminderCount: count,
      updatedAt: new Date()
    };
    this.scheduledPaymentsStore.set(id, updatedPayment);
    
    // Save to file for persistence
    await this.saveScheduledPaymentsToFile();
    console.log(`💾 Saved scheduled payment ${id} reminder count update to file`);
    
    return updatedPayment;
  }

  private async saveScheduledPaymentsToFile(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const scheduledPaymentsFilePath = path.join(process.cwd(), 'data', 'scheduled-payments.json');

      const allPayments = Array.from(this.scheduledPaymentsStore.values());
      await fs.promises.writeFile(scheduledPaymentsFilePath, JSON.stringify(allPayments, null, 2));
      console.log(`💾 Saved ${allPayments.length} scheduled payments to file`);
    } catch (error) {
      console.error('❌ Error saving scheduled payments to file:', error);
    }
  }

  // School Students initialization and methods
  private async initializeSchoolStudents(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const schoolStudentsFilePath = path.join(process.cwd(), 'data', 'school-students.json');

      if (fs.existsSync(schoolStudentsFilePath)) {
        const schoolStudentsData = JSON.parse(fs.readFileSync(schoolStudentsFilePath, 'utf-8'));
        console.log(`🎓 Loading ${schoolStudentsData.length} school students from school-students.json`);

        for (const schoolStudent of schoolStudentsData) {
          const record: SchoolStudent = {
            ...schoolStudent,
            enrollmentDate: new Date(schoolStudent.enrollmentDate),
            createdAt: new Date(schoolStudent.createdAt),
            updatedAt: new Date(schoolStudent.updatedAt)
          };
          this.schoolStudentsStore.set(schoolStudent.id, record);
          this.schoolStudentIdCounter = Math.max(this.schoolStudentIdCounter, schoolStudent.id + 1);
        }

        console.log(`✅ Successfully loaded ${schoolStudentsData.length} school students into storage`);
      } else {
        console.log('🎓 No school-students.json found, starting with empty school students');
      }
    } catch (error) {
      console.error('❌ Error loading school students from JSON:', error);
    }
  }

  async getSchoolStudentById(id: number): Promise<SchoolStudent | undefined> {
    return this.schoolStudentsStore.get(id);
  }

  async getAllSchoolStudents(): Promise<SchoolStudent[]> {
    return Array.from(this.schoolStudentsStore.values());
  }

  async getSchoolStudentsBySchoolId(schoolId: number): Promise<SchoolStudent[]> {
    return Array.from(this.schoolStudentsStore.values()).filter(
      student => student.schoolId === schoolId
    );
  }

  async getSchoolStudentsByLocationId(locationId: number): Promise<SchoolStudent[]> {
    return Array.from(this.schoolStudentsStore.values()).filter(
      student => student.locationId === locationId
    );
  }

  async getSchoolStudentByChildId(childId: number): Promise<SchoolStudent | undefined> {
    return Array.from(this.schoolStudentsStore.values()).find(
      student => student.childId === childId
    );
  }

  async getSchoolStudentByChildAndSchool(childId: number, schoolId: number): Promise<SchoolStudent | undefined> {
    return Array.from(this.schoolStudentsStore.values()).find(
      student => student.childId === childId && student.schoolId === schoolId
    );
  }

  async createSchoolStudent(schoolStudent: InsertSchoolStudent): Promise<SchoolStudent> {
    const id = this.schoolStudentIdCounter++;
    const now = new Date();
    const newSchoolStudent: SchoolStudent = {
      id,
      ...schoolStudent,
      status: schoolStudent.status ?? 'active',
      locationId: schoolStudent.locationId || null,
      enrollmentDate: schoolStudent.enrollmentDate || now,
      createdAt: now,
      updatedAt: now
    };

    this.schoolStudentsStore.set(id, newSchoolStudent);
    await this.saveSchoolStudentsToDisk();
    return newSchoolStudent;
  }

  async updateSchoolStudent(id: number, updateData: Partial<InsertSchoolStudent>): Promise<SchoolStudent | undefined> {
    const schoolStudent = this.schoolStudentsStore.get(id);
    if (!schoolStudent) return undefined;

    const updatedSchoolStudent: SchoolStudent = {
      ...schoolStudent,
      ...updateData,
      updatedAt: new Date()
    };

    this.schoolStudentsStore.set(id, updatedSchoolStudent);
    await this.saveSchoolStudentsToDisk();
    return updatedSchoolStudent;
  }

  async deleteSchoolStudent(id: number): Promise<void> {
    this.schoolStudentsStore.delete(id);
    await this.saveSchoolStudentsToDisk();
  }

  private async saveSchoolStudentsToDisk(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const schoolStudentsFilePath = path.join(process.cwd(), 'data', 'school-students.json');

      const dataDir = path.dirname(schoolStudentsFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const schoolStudents = Array.from(this.schoolStudentsStore.values());
      fs.writeFileSync(schoolStudentsFilePath, JSON.stringify(schoolStudents, null, 2));
      console.log(`💾 Successfully saved ${schoolStudents.length} school students to disk`);
    } catch (error) {
      console.error('❌ Error saving school students to disk:', error);
    }
  }

  // User Locations initialization and methods
  private async initializeUserLocations(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const userLocationsFilePath = path.join(process.cwd(), 'data', 'user-locations.json');

      if (fs.existsSync(userLocationsFilePath)) {
        const userLocationsData = JSON.parse(fs.readFileSync(userLocationsFilePath, 'utf-8'));
        console.log(`🏢 Loading ${userLocationsData.length} user locations from user-locations.json`);

        for (const userLocation of userLocationsData) {
          const record: UserLocation = {
            ...userLocation,
            assignedAt: new Date(userLocation.assignedAt),
            createdAt: new Date(userLocation.createdAt),
            updatedAt: new Date(userLocation.updatedAt)
          };
          this.userLocationsStore.set(userLocation.id, record);
          this.userLocationIdCounter = Math.max(this.userLocationIdCounter, userLocation.id + 1);
        }

        console.log(`✅ Successfully loaded ${userLocationsData.length} user locations into storage`);
      } else {
        console.log('🏢 No user-locations.json found, starting with empty user locations');
      }
    } catch (error) {
      console.error('❌ Error loading user locations from JSON:', error);
    }
  }

  async getUserLocationById(id: number): Promise<UserLocation | undefined> {
    return this.userLocationsStore.get(id);
  }

  async getUserLocationsByUserId(userId: number): Promise<UserLocation[]> {
    return Array.from(this.userLocationsStore.values()).filter(
      userLocation => userLocation.userId === userId && userLocation.isActive
    );
  }

  async getUserLocationsByLocationId(locationId: number): Promise<UserLocation[]> {
    return Array.from(this.userLocationsStore.values()).filter(
      userLocation => userLocation.locationId === locationId && userLocation.isActive
    );
  }

  async createUserLocation(userLocation: InsertUserLocation): Promise<UserLocation> {
    const id = this.userLocationIdCounter++;
    const now = new Date();
    const newUserLocation: UserLocation = {
      id,
      ...userLocation,
      isActive: userLocation.isActive ?? true,
      accessLevel: userLocation.accessLevel ?? 'view',
      canViewReports: userLocation.canViewReports ?? false,
      canManageStaff: userLocation.canManageStaff ?? false,
      canManageClasses: userLocation.canManageClasses ?? false,
      canManageStudents: userLocation.canManageStudents ?? false,
      canSendNotifications: userLocation.canSendNotifications ?? false,
      assignedAt: now,
      createdAt: now,
      updatedAt: now
    };

    this.userLocationsStore.set(id, newUserLocation);
    await this.saveUserLocationsToDisk();
    return newUserLocation;
  }

  async updateUserLocation(id: number, updateData: Partial<InsertUserLocation>): Promise<UserLocation | undefined> {
    const userLocation = this.userLocationsStore.get(id);
    if (!userLocation) return undefined;

    const updatedUserLocation: UserLocation = {
      ...userLocation,
      ...updateData,
      updatedAt: new Date()
    };

    this.userLocationsStore.set(id, updatedUserLocation);
    await this.saveUserLocationsToDisk();
    return updatedUserLocation;
  }

  async deleteUserLocation(id: number): Promise<void> {
    this.userLocationsStore.delete(id);
    await this.saveUserLocationsToDisk();
  }

  private async saveUserLocationsToDisk(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const userLocationsFilePath = path.join(process.cwd(), 'data', 'user-locations.json');

      const dataDir = path.dirname(userLocationsFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const userLocations = Array.from(this.userLocationsStore.values());
      fs.writeFileSync(userLocationsFilePath, JSON.stringify(userLocations, null, 2));
      console.log(`💾 Successfully saved ${userLocations.length} user locations to disk`);
    } catch (error) {
      console.error('❌ Error saving user locations to disk:', error);
    }
  }

  // Locations initialization and methods
  private async initializeLocations(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const locationsFilePath = path.join(process.cwd(), 'data', 'locations.json');

      if (fs.existsSync(locationsFilePath)) {
        const locationsData = JSON.parse(fs.readFileSync(locationsFilePath, 'utf-8'));
        console.log(`🏢 Loading ${locationsData.length} locations from locations.json`);

        for (const location of locationsData) {
          const record: Location = {
            ...location,
            createdAt: new Date(location.createdAt),
            updatedAt: new Date(location.updatedAt)
          };
          this.locationsStore.set(location.id, record);
          this.locationIdCounter = Math.max(this.locationIdCounter, location.id + 1);
        }

        console.log(`✅ Successfully loaded ${locationsData.length} locations into storage`);
      } else {
        console.log('🏢 No locations.json found, starting with empty locations');
      }
    } catch (error) {
      console.error('❌ Error loading locations from JSON:', error);
    }
  }

  async getLocationById(id: number): Promise<Location | undefined> {
    return this.locationsStore.get(id);
  }

  async getLocations(): Promise<Location[]> {
    return Array.from(this.locationsStore.values());
  }

  async getLocationsBySchoolId(schoolId: number): Promise<Location[]> {
    return Array.from(this.locationsStore.values()).filter(
      location => location.schoolId === schoolId && location.isActive
    );
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const id = this.locationIdCounter++;
    const now = new Date();
    const newLocation: Location = {
      id,
      ...location,
      isActive: location.isActive ?? true,
      timezone: location.timezone || 'UTC',
      createdAt: now,
      updatedAt: now
    };

    this.locationsStore.set(id, newLocation);
    await this.saveLocationsToDisk();
    return newLocation;
  }

  async updateLocation(id: number, updateData: Partial<InsertLocation>): Promise<Location | undefined> {
    const location = this.locationsStore.get(id);
    if (!location) return undefined;

    const updatedLocation: Location = {
      ...location,
      ...updateData,
      updatedAt: new Date()
    };

    this.locationsStore.set(id, updatedLocation);
    await this.saveLocationsToDisk();
    return updatedLocation;
  }

  async deleteLocation(id: number): Promise<void> {
    this.locationsStore.delete(id);
    await this.saveLocationsToDisk();
  }

  private async saveLocationsToDisk(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const locationsFilePath = path.join(process.cwd(), 'data', 'locations.json');

      const dataDir = path.dirname(locationsFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const locations = Array.from(this.locationsStore.values());
      fs.writeFileSync(locationsFilePath, JSON.stringify(locations, null, 2));
      console.log(`💾 Successfully saved ${locations.length} locations to disk`);
    } catch (error) {
      console.error('❌ Error saving locations to disk:', error);
    }
  }

  // Daily Flow data initialization methods
  private async initializeDailyFlowTemplates(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const templatesFilePath = path.join(process.cwd(), 'data', 'daily-flow-templates.json');

      if (fs.existsSync(templatesFilePath)) {
        const templatesData = JSON.parse(fs.readFileSync(templatesFilePath, 'utf-8'));
        console.log(`📋 Loading ${templatesData.length} daily flow templates from daily-flow-templates.json`);

        for (const template of templatesData) {
          const record: DailyFlowTemplate = {
            ...template,
            createdAt: new Date(template.createdAt),
            updatedAt: new Date(template.updatedAt)
          };
          this.dailyFlowTemplatesStore.set(template.id, record);
          this.dailyFlowTemplateIdCounter = Math.max(this.dailyFlowTemplateIdCounter, template.id + 1);
        }

        console.log(`✅ Successfully loaded ${templatesData.length} daily flow templates into storage`);
      } else {
        console.log('📋 No daily-flow-templates.json found, starting with empty templates');
      }
    } catch (error) {
      console.error('❌ Error loading daily flow templates from JSON:', error);
    }
  }

  private async initializeDailyFlowEntries(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const entriesFilePath = path.join(process.cwd(), 'data', 'daily-flow-entries.json');

      if (fs.existsSync(entriesFilePath)) {
        const entriesData = JSON.parse(fs.readFileSync(entriesFilePath, 'utf-8'));
        console.log(`📊 Loading ${entriesData.length} daily flow entries from daily-flow-entries.json`);

        for (const entry of entriesData) {
          const record: DailyFlowEntry = {
            ...entry,
            date: new Date(entry.date),
            createdAt: new Date(entry.createdAt),
            updatedAt: new Date(entry.updatedAt),
            completedActivities: entry.completedActivities || []
          };
          this.dailyFlowEntriesStore.set(entry.id, record);
          this.dailyFlowEntryIdCounter = Math.max(this.dailyFlowEntryIdCounter, entry.id + 1);
        }

        console.log(`✅ Successfully loaded ${entriesData.length} daily flow entries into storage`);
      } else {
        console.log('📊 No daily-flow-entries.json found, starting with empty entries');
      }
    } catch (error) {
      console.error('❌ Error loading daily flow entries from JSON:', error);
    }
  }

  private async initializeDailyFlowSchedules(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const schedulesFilePath = path.join(process.cwd(), 'data', 'daily-flow-schedules.json');

      if (fs.existsSync(schedulesFilePath)) {
        const schedulesData = JSON.parse(fs.readFileSync(schedulesFilePath, 'utf-8'));
        console.log(`🗓️ Loading ${schedulesData.length} daily flow schedules from daily-flow-schedules.json`);

        for (const schedule of schedulesData) {
          const record: DailyFlowSchedule = {
            ...schedule,
            startDate: new Date(schedule.startDate),
            endDate: schedule.endDate ? new Date(schedule.endDate) : null,
            createdAt: new Date(schedule.createdAt),
            updatedAt: new Date(schedule.updatedAt)
          };
          this.dailyFlowSchedulesStore.set(schedule.id, record);
          this.dailyFlowScheduleIdCounter = Math.max(this.dailyFlowScheduleIdCounter, schedule.id + 1);
        }

        console.log(`✅ Successfully loaded ${schedulesData.length} daily flow schedules into storage`);
      } else {
        console.log('🗓️ No daily-flow-schedules.json found, starting with empty schedules');
      }
    } catch (error) {
      console.error('❌ Error loading daily flow schedules from JSON:', error);
    }
  }

  // Daily Flow Template methods
  async getDailyFlowTemplates(filters?: { schoolId?: number; gradeLevel?: string; subject?: string }): Promise<DailyFlowTemplate[]> {
    let templates = Array.from(this.dailyFlowTemplatesStore.values());
    
    if (filters) {
      if (filters.schoolId) {
        templates = templates.filter(t => t.schoolId === filters.schoolId);
      }
      if (filters.gradeLevel) {
        templates = templates.filter(t => t.gradeLevel === filters.gradeLevel);
      }
      if (filters.subject) {
        templates = templates.filter(t => t.subject === filters.subject);
      }
    }
    
    return templates;
  }

  async getDailyFlowTemplateById(id: number): Promise<DailyFlowTemplate | undefined> {
    return this.dailyFlowTemplatesStore.get(id);
  }

  async createDailyFlowTemplate(template: InsertDailyFlowTemplate): Promise<DailyFlowTemplate> {
    const id = this.dailyFlowTemplateIdCounter++;
    const now = new Date();
    const newTemplate: DailyFlowTemplate = {
      id,
      ...template,
      isActive: template.isActive ?? true,
      description: template.description || null,
      createdAt: now,
      updatedAt: now
    };

    this.dailyFlowTemplatesStore.set(id, newTemplate);
    await this.saveDailyFlowTemplatesToDisk();
    return newTemplate;
  }

  async updateDailyFlowTemplate(id: number, template: Partial<InsertDailyFlowTemplate>): Promise<DailyFlowTemplate | undefined> {
    const existingTemplate = this.dailyFlowTemplatesStore.get(id);
    if (!existingTemplate) return undefined;

    const updatedTemplate: DailyFlowTemplate = {
      ...existingTemplate,
      ...template,
      updatedAt: new Date()
    };

    this.dailyFlowTemplatesStore.set(id, updatedTemplate);
    await this.saveDailyFlowTemplatesToDisk();
    return updatedTemplate;
  }

  async deleteDailyFlowTemplate(id: number): Promise<void> {
    this.dailyFlowTemplatesStore.delete(id);
    await this.saveDailyFlowTemplatesToDisk();
  }

  private async saveDailyFlowTemplatesToDisk(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const templatesFilePath = path.join(process.cwd(), 'data', 'daily-flow-templates.json');

      const dataDir = path.dirname(templatesFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const templates = Array.from(this.dailyFlowTemplatesStore.values());
      fs.writeFileSync(templatesFilePath, JSON.stringify(templates, null, 2));
      console.log(`💾 Successfully saved ${templates.length} daily flow templates to disk`);
    } catch (error) {
      console.error('❌ Error saving daily flow templates to disk:', error);
    }
  }

  // Daily Flow Entry methods
  async getDailyFlowEntries(filters?: { classId?: number; startDate?: string; endDate?: string }): Promise<DailyFlowEntry[]> {
    let entries = Array.from(this.dailyFlowEntriesStore.values());
    
    if (filters) {
      if (filters.classId) {
        entries = entries.filter(e => e.classId === filters.classId);
      }
      if (filters.startDate) {
        entries = entries.filter(e => e.date >= filters.startDate!);
      }
      if (filters.endDate) {
        entries = entries.filter(e => e.date <= filters.endDate!);
      }
    }
    
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }

  async getDailyFlowEntryById(id: number): Promise<DailyFlowEntry | undefined> {
    return this.dailyFlowEntriesStore.get(id);
  }

  async createDailyFlowEntry(entry: InsertDailyFlowEntry): Promise<DailyFlowEntry> {
    const id = this.dailyFlowEntryIdCounter++;
    const now = new Date();
    const newEntry: DailyFlowEntry = {
      id,
      ...entry,
      materials: entry.materials ?? {},
      notes: entry.notes || null,
      templateId: entry.templateId || null,
      isCompleted: entry.isCompleted ?? false,
      completedAt: entry.completedAt || null,
      completedBy: entry.completedBy || null,
      lastModifiedBy: entry.lastModifiedBy || null,
      lessonDescription: entry.lessonDescription || null,
      createdAt: now,
      updatedAt: now
    };

    this.dailyFlowEntriesStore.set(id, newEntry);
    await this.saveDailyFlowEntriesToDisk();
    return newEntry;
  }

  async updateDailyFlowEntry(id: number, entry: Partial<InsertDailyFlowEntry>): Promise<DailyFlowEntry | undefined> {
    const existingEntry = this.dailyFlowEntriesStore.get(id);
    if (!existingEntry) return undefined;

    const updatedEntry: DailyFlowEntry = {
      ...existingEntry,
      ...entry,
      updatedAt: new Date()
    };

    this.dailyFlowEntriesStore.set(id, updatedEntry);
    await this.saveDailyFlowEntriesToDisk();
    return updatedEntry;
  }

  async deleteDailyFlowEntry(id: number): Promise<void> {
    this.dailyFlowEntriesStore.delete(id);
    await this.saveDailyFlowEntriesToDisk();
  }

  private async saveDailyFlowEntriesToDisk(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const entriesFilePath = path.join(process.cwd(), 'data', 'daily-flow-entries.json');

      const dataDir = path.dirname(entriesFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const entries = Array.from(this.dailyFlowEntriesStore.values());
      fs.writeFileSync(entriesFilePath, JSON.stringify(entries, null, 2));
      console.log(`💾 Successfully saved ${entries.length} daily flow entries to disk`);
    } catch (error) {
      console.error('❌ Error saving daily flow entries to disk:', error);
    }
  }

  // Daily Flow Schedule methods
  async getDailyFlowSchedules(filters?: { templateId?: number; classId?: number }): Promise<DailyFlowSchedule[]> {
    let schedules = Array.from(this.dailyFlowSchedulesStore.values());
    
    if (filters) {
      if (filters.templateId) {
        schedules = schedules.filter(s => s.templateId === filters.templateId);
      }
      if (filters.classId) {
        schedules = schedules.filter(s => s.classId === filters.classId);
      }
    }
    
    return schedules;
  }

  async getDailyFlowScheduleById(id: number): Promise<DailyFlowSchedule | undefined> {
    return this.dailyFlowSchedulesStore.get(id);
  }

  async createDailyFlowSchedule(schedule: InsertDailyFlowSchedule): Promise<DailyFlowSchedule> {
    const id = this.dailyFlowScheduleIdCounter++;
    const now = new Date();
    const newSchedule: DailyFlowSchedule = {
      id,
      ...schedule,
      isActive: schedule.isActive ?? true,
      lessonDescription: schedule.lessonDescription || null,
      lessonLink: schedule.lessonLink || null,
      createdAt: now,
      updatedAt: now
    };

    this.dailyFlowSchedulesStore.set(id, newSchedule);
    await this.saveDailyFlowSchedulesToDisk();
    return newSchedule;
  }

  async updateDailyFlowSchedule(id: number, schedule: Partial<InsertDailyFlowSchedule>): Promise<DailyFlowSchedule | undefined> {
    const existingSchedule = this.dailyFlowSchedulesStore.get(id);
    if (!existingSchedule) return undefined;

    const updatedSchedule: DailyFlowSchedule = {
      ...existingSchedule,
      ...schedule,
      updatedAt: new Date()
    };

    this.dailyFlowSchedulesStore.set(id, updatedSchedule);
    await this.saveDailyFlowSchedulesToDisk();
    return updatedSchedule;
  }

  async deleteDailyFlowSchedule(id: number): Promise<void> {
    this.dailyFlowSchedulesStore.delete(id);
    await this.saveDailyFlowSchedulesToDisk();
  }

  private async saveDailyFlowSchedulesToDisk(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const schedulesFilePath = path.join(process.cwd(), 'data', 'daily-flow-schedules.json');

      const dataDir = path.dirname(schedulesFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const schedules = Array.from(this.dailyFlowSchedulesStore.values());
      fs.writeFileSync(schedulesFilePath, JSON.stringify(schedules, null, 2));
      console.log(`💾 Successfully saved ${schedules.length} daily flow schedules to disk`);
    } catch (error) {
      console.error('❌ Error saving daily flow schedules to disk:', error);
    }
  }

  // Daily Flow utility methods
  async generateDailyFlowEntriesFromTemplate(params: { 
    templateId: number; 
    classId: number; 
    startDate: string; 
    endDate: string; 
    createdBy: string 
  }): Promise<DailyFlowEntry[]> {
    const template = await this.getDailyFlowTemplateById(params.templateId);
    if (!template) {
      throw new Error(`Template with ID ${params.templateId} not found`);
    }

    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    const entries: DailyFlowEntry[] = [];

    // Generate entries for each day in the date range
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      // Skip weekends if template is weekdays only
      if (template.daysOfWeek && template.daysOfWeek.length > 0) {
        const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        if (!template.daysOfWeek.includes(dayNames[dayOfWeek])) {
          continue;
        }
      }

      const entry: InsertDailyFlowEntry = {
        templateId: template.id,
        classId: params.classId,
        date: d.toISOString().split('T')[0], // YYYY-MM-DD format
        title: template.name,
        activities: template.activities || [],
        resources: template.resources || [],
        notes: '',
        isCompleted: false,
        completedAt: null,
        completedBy: null,
        createdBy: params.createdBy
      };

      const newEntry = await this.createDailyFlowEntry(entry);
      entries.push(newEntry);
    }

    return entries;
  }

  async getDailyFlowStats(filters?: { 
    classId?: number; 
    startDate?: string; 
    endDate?: string 
  }): Promise<{ totalEntries: number; completedEntries: number; completionRate: number }> {
    const entries = await this.getDailyFlowEntries(filters);
    const totalEntries = entries.length;
    const completedEntries = entries.filter(e => e.isCompleted).length;
    const completionRate = totalEntries > 0 ? (completedEntries / totalEntries) * 100 : 0;

    return {
      totalEntries,
      completedEntries,
      completionRate: Math.round(completionRate * 100) / 100 // Round to 2 decimal places
    };
  }

  // Technical Support methods
  async createTechnicalIssue(issue: any): Promise<any> {
    this.technicalIssuesStore.set(issue.id, { ...issue, timestamp: new Date() });
    return issue;
  }

  async getTechnicalIssue(id: string): Promise<any> {
    return this.technicalIssuesStore.get(id);
  }

  async getAllTechnicalIssues(): Promise<any[]> {
    return Array.from(this.technicalIssuesStore.values());
  }

  async updateTechnicalIssue(id: string, updates: any): Promise<any> {
    const issue = this.technicalIssuesStore.get(id);
    if (issue) {
      const updatedIssue = { ...issue, ...updates };
      this.technicalIssuesStore.set(id, updatedIssue);
      return updatedIssue;
    }
    return null;
  }

  // Notification methods  
  async createAdminNotification(notification: any): Promise<any> {
    this.adminNotificationsStore.set(notification.id, { ...notification, createdAt: new Date() });
    return notification;
  }

  async createUserNotification(notification: any): Promise<any> {
    this.userNotificationsStore.set(notification.id, { ...notification, createdAt: new Date() });
    return notification;
  }

  // Role invitation methods (implements both interface signatures)
  async createRoleInvitation(invitation: any): Promise<any> {
    // For in-memory storage, just return a mock invitation
    const id = Date.now();
    const now = new Date();
    return { 
      ...invitation, 
      id, 
      status: 'pending', 
      createdAt: now,
      updatedAt: now,
      token: `token_${id}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      acceptedAt: null
    };
  }

  async getRoleInvitations(): Promise<any[]> {
    // For in-memory storage, return empty array
    return [];
  }

  async getActiveRoleInvitation(tokenOrEmail: string): Promise<any> {
    // For in-memory storage, return null/undefined
    return null;
  }

  async updateRoleInvitation(id: number, updates: { token?: string; expiresAt?: Date; isActive?: boolean; usedAt?: Date | null }): Promise<any> {
    // For in-memory storage, return null/undefined
    return null;
  }

  async acceptRoleInvitation(token: string, userEmail?: string): Promise<any> {
    // For in-memory storage, return null/undefined
    return null;
  }

  async revokeRoleInvitation(id: number): Promise<void> {
    // For in-memory storage, do nothing
    return;
  }

  async getRoleInvitationsByInviter(inviterId: number): Promise<RoleInvitation[]> {
    // For in-memory storage, return empty array
    return [];
  }

  async getPendingRoleInvitationsByEmails(emails: string[]): Promise<Map<string, boolean>> {
    // For in-memory storage, return empty map
    return new Map();
  }

  // Missing methods for full interface compliance
  async getAllScheduledPayments(): Promise<any[]> {
    return [];
  }

  async createStripeSubscriptionSchedule(schedule: any): Promise<any> {
    return { ...schedule, id: Date.now() };
  }

  async getStripeSubscriptionScheduleById(id: number): Promise<any> {
    return null;
  }

  async getStripeSubscriptionScheduleByStripeId(stripeScheduleId: string): Promise<any> {
    return null;
  }

  async getStripeSubscriptionSchedulesByParentEmail(parentEmail: string): Promise<any[]> {
    return [];
  }

  async updateStripeSubscriptionSchedule(id: number, schedule: any): Promise<any> {
    return null;
  }

  // Category methods (stubs for memory storage)
  async getCategoryById(id: number): Promise<any> {
    return null;
  }

  async getCategoriesBySchoolId(schoolId: number): Promise<any[]> {
    return [];
  }

  async createCategory(category: any): Promise<any> {
    const id = Date.now();
    return { ...category, id };
  }

  async updateCategory(id: number, category: any): Promise<any> {
    return { ...category, id };
  }

  async deleteCategory(id: number): Promise<void> {
    return;
  }
}

  import { DatabaseStorage } from "./dbStorage";
  import { supabaseStorage, SupabaseStorage } from './supabase-storage';

  // Create a shared MemStorage instance to ensure consistency
  const sharedMemStorage = new MemStorage();

  // TODO: Make CombinedStorage formally implement IStorage interface
  // Currently CombinedStorage has all required IStorage methods but adds extra helper methods,
  // causing 127+ type errors when forcing interface compliance. This requires a full storage
  // layer refactor to align interface contracts across MemStorage, DatabaseStorage, and CombinedStorage.
  // For now, services casting to IStorage (like StripePaymentPlanService) use 'as any' as a pragmatic
  // workaround since all required methods are present. Future work: align all storage implementations.
  class CombinedStorage {
    private dbStorage: DatabaseStorage | MemStorage;
    private memStorage: MemStorage;
    private supabaseStorage: SupabaseStorage
    private fileStorage: MemStorage; // Assuming fileStorage is also an instance of MemStorage for fallback

    constructor() {
      // Try to initialize DatabaseStorage, fall back to MemStorage if unavailable
      try {
        this.dbStorage = new DatabaseStorage();
      } catch (error) {
        console.log('⚠️ Database not available, using MemStorage for all operations');
        this.dbStorage = sharedMemStorage;
      }
      this.memStorage = sharedMemStorage; // Use the shared instance
      this.supabaseStorage = supabaseStorage;
      this.fileStorage = sharedMemStorage; // Use the shared instance for consistency
    }

    /**
     * Classify errors to distinguish business rules from transport issues
     */
    private isBusinessRuleViolation(error: any): boolean {
      // Business rule violations should bubble up, not fall back
      if (!error) return false;
      
      const message = error.message?.toLowerCase() || '';
      const code = error.code || '';
      
      // Unique constraint violations
      if (message.includes('unique') || message.includes('already exists') || message.includes('duplicate')) {
        return true;
      }
      
      // Foreign key constraints
      if (message.includes('foreign key') || code === '23503') {
        return true;
      }
      
      // Check constraints
      if (message.includes('check constraint') || code === '23514') {
        return true;
      }
      
      // Not null constraints
      if (message.includes('not null') || code === '23502') {
        return true;
      }
      
      return false;
    }

    /**
     * Log error with classification for better diagnostics
     */
    private logStorageError(operation: string, error: any, willFallback: boolean): void {
      const isBusinessRule = this.isBusinessRuleViolation(error);
      
      if (isBusinessRule) {
        console.warn(`🚨 [STORAGE] Business rule violation in ${operation}:`, error.message);
        if (willFallback) {
          console.warn(`⚠️ [STORAGE] Business rule should bubble up, but falling back anyway`);
        }
      } else {
        console.log(`💾 [STORAGE] Transport error in ${operation}, ${willFallback ? 'falling back to memory' : 'no fallback'}`);
        if (process.env.NODE_ENV === 'development') {
          console.log(`   Error details:`, error.message || error);
        }
      }
    }

    /**
     * Execute operation with fallback, properly handling business rules
     */
    private async executeWithFallback<T>(
      operation: string,
      dbOperation: () => Promise<T>,
      memOperation: () => Promise<T>
    ): Promise<T> {
      try {
        return await dbOperation();
      } catch (error) {
        // Business rule violations should bubble up
        if (this.isBusinessRuleViolation(error)) {
          this.logStorageError(operation, error, false);
          throw error;
        }
        
        // Transport errors fall back to memory
        this.logStorageError(operation, error, true);
        return await memOperation();
      }
    }

    async getAllUsers(): Promise<User[]> {
      try {
        return await this.dbStorage.getAllUsers();
      } catch (error) {
        console.log('💾 Database unavailable, using file storage fallback for getAllUsers');
        // Prioritize file storage (where real users are stored) over memory storage
        try {
          const fs = await import('fs');
          const path = await import('path');
          const DATA_DIR = path.join(process.cwd(), 'data');
          const USERS_FILE = path.join(DATA_DIR, 'users.json');

          if (fs.existsSync(USERS_FILE)) {
            const fileContent = fs.readFileSync(USERS_FILE, 'utf8');
            const users = JSON.parse(fileContent);
            console.log('🔍 File storage getAllUsers returned', users.length, 'users');
            return users;
          }
        } catch (fileError) {
          console.log('❌ File storage fallback failed:', fileError);
        }

        // Only use memory storage if file storage fails
        console.log('🧠 Using memory storage as final fallback');
        try {
          const memUsers = await this.memStorage.getAllUsers();
          console.log('🧠 Memory storage getAllUsers returned', memUsers.length, 'users');
          return memUsers;
        } catch (memError) {
          console.log('❌ Memory storage failed:', memError);
          return [];
        }
      }
    }

    async getAllCurricula(): Promise<Curriculum[]> {
      return this.dbStorage.getAllCurricula();
    }

    async getAllKnowledgeBases(): Promise<KnowledgeBase[]> {
      return this.dbStorage.getAllKnowledgeBases();
    }

    async getAllActivities(): Promise<Activity[]> {
      return this.dbStorage.getAllActivities();
    }

    async getAllPayments(): Promise<Payment[]> {
      try {
        // Prefer dbStorage, but fallback to fileStorage (memStorage instance) if unavailable
        if (this.dbStorage && typeof this.dbStorage.getAllPayments === 'function') {
          return await this.dbStorage.getAllPayments();
        } else {
          console.log('💾 DB storage unavailable or method missing, using file storage fallback for getAllPayments');
          return await this.fileStorage.getAllPayments();
        }
      } catch (error) {
        console.error('❌ Error getting all payments, falling back to file storage:', error);
        return await this.fileStorage.getAllPayments();
      }
    }

    async getAllEnrollments(): Promise<ProgramEnrollment[]> {
      return this.dbStorage.getAllEnrollments();
    }

    async getUser(id: number): Promise<User | undefined> {
      try {
        // Try database storage first
        const result = await this.dbStorage.getUser(id);
        return result;
      } catch (error) {
        // Fall back to memory storage first (contains test data and runtime changes)
        try {
          const memUser = await this.fileStorage.getUser(id);
          if (memUser) {
            return memUser;
          }
        } catch (memError) {
          // Memory storage failed, continue to JSON fallback
        }
        
        // Final fallback to reading directly from JSON file
        try {
          const fs = await import('fs');
          const path = await import('path');
          const DATA_DIR = path.join(process.cwd(), 'data');
          const USERS_FILE = path.join(DATA_DIR, 'users.json');

          if (fs.existsSync(USERS_FILE)) {
            const fileContent = fs.readFileSync(USERS_FILE, 'utf8');
            const users = JSON.parse(fileContent);
            const user = users.find((u: any) => u.id === id);
            return user;
          }
          return undefined;
        } catch (fileError) {
          return undefined;
        }
      }
    }

    async getUserByUsername(username: string): Promise<User | undefined> {
      try {
        // Try database storage first
        return await this.dbStorage.getUserByUsername(username);
      } catch (error) {
        console.log('💾 Database unavailable, checking memory storage for username lookup');
        
        // Try memory storage first as it's most up-to-date
        try {
          const memUser = await sharedMemStorage.getUserByUsername(username);
          if (memUser) {
            console.log('🧠 Found user in memory storage:', username);
            return memUser;
          }
        } catch (memError) {
          console.log('🧠 Memory storage lookup failed:', memError);
        }
        
        // Fall back to file storage if memory storage also fails
        console.log('💾 Using file storage fallback for username lookup');
        try {
          const fs = await import('fs');
          const path = await import('path');
          const DATA_DIR = path.join(process.cwd(), 'data');
          const USERS_FILE = path.join(DATA_DIR, 'users.json');

          if (fs.existsSync(USERS_FILE)) {
            const fileContent = fs.readFileSync(USERS_FILE, 'utf8');
            const users = JSON.parse(fileContent);
            const user = users.find((u: any) => u.username === username);
            console.log('🔍 File storage lookup result for username', username, ':', user ? 'Found' : 'Not found');
            return user;
          }
          return undefined;
        } catch (fileError) {
          console.log('❌ File storage fallback failed:', fileError);
          return undefined;
        }
      }
    }

    async getUserByEmail(email: string): Promise<User | undefined> {
      try {
        // Try database storage first
        return await this.dbStorage.getUserByEmail(email);
      } catch (error) {
        console.error('❌ Database error in getUserByEmail:', error);
        console.error('Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          email: email
        });
        console.log('💾 Database query failed, checking memory storage for email lookup');
        
        // Try memory storage first as it's most up-to-date
        try {
          const memUser = await sharedMemStorage.getUserByEmail(email);
          if (memUser) {
            console.log('🧠 Found user in memory storage:', email);
            return memUser;
          }
        } catch (memError) {
          console.log('🧠 Memory storage lookup failed:', memError);
        }
        
        // Fall back to file storage if memory storage also fails
        console.log('💾 Using file storage fallback for email lookup');
        try {
          const fs = await import('fs');
          const path = await import('path');
          const DATA_DIR = path.join(process.cwd(), 'data');
          const USERS_FILE = path.join(DATA_DIR, 'users.json');

          if (fs.existsSync(USERS_FILE)) {
            const fileContent = fs.readFileSync(USERS_FILE, 'utf8');
            const users = JSON.parse(fileContent);
            const user = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
            console.log('🔍 File storage lookup result for', email, ':', user ? 'Found' : 'Not found');
            return user;
          }
          console.log('❌ Users file not found at:', USERS_FILE);
          return undefined;
        } catch (fileError) {
          console.log('❌ File storage fallback failed:', fileError);
          return undefined;
        }
      }
    }

    async createUser(user: InsertUser): Promise<User> {
      // Enforce unique email constraint with fallback to memStorage
      let existingUser;
      try {
        existingUser = await this.dbStorage.getUserByEmail(user.email);
      } catch (error) {
        // Database unavailable, check memStorage instead
        existingUser = await this.memStorage.getUserByEmail(user.email);
      }
      
      if (existingUser) {
        throw new Error(`User with email ${user.email} already exists`);
      }
      
      try {
        // Try database storage first
        return await this.dbStorage.createUser(user);
      } catch (error) {
        console.log('💾 Database unavailable, using file storage for user creation');
        // Create user in memory first
        const newUser = await this.memStorage.createUser(user);
        
        // Also persist to file storage immediately
        try {
          const fs = await import('fs');
          const path = await import('path');
          const DATA_DIR = path.join(process.cwd(), 'data');
          const USERS_FILE = path.join(DATA_DIR, 'users.json');

          // Ensure data directory exists
          if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
          }

          // Read existing users from file
          let users = [];
          if (fs.existsSync(USERS_FILE)) {
            const fileContent = fs.readFileSync(USERS_FILE, 'utf8');
            users = JSON.parse(fileContent);
          }
          
          // Add new user to file
          users.push(newUser);
          
          // Write back to file
          fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
          console.log(`💾 Persisted user to file: ${newUser.email}`);
        } catch (fileError) {
          console.log('❌ Failed to persist user to file:', fileError);
        }
        
        return newUser;
      }
    }


    async updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined> {
      console.log(`🔄 CombinedStorage.updateUser called for user ID: ${id}`);
      try {
        console.log(`📡 Attempting database update for user ID: ${id}`);
        // Try database storage first
        const result = await this.dbStorage.updateUser(id, user);
        console.log(`✅ Database update successful for user ID: ${id}`);
        return result;
      } catch (error) {
        console.log(`💾 Database update failed for user ID: ${id}, error:`, error instanceof Error ? error.message : error);
        console.log('💾 Database unavailable, using file storage for user update');
        
        try {
          // Update user in memory storage (which automatically saves to file)
          const updatedUser = await sharedMemStorage.updateUser(id, user);
          
          return updatedUser;
        } catch (fallbackError) {
          console.error('❌ Fallback storage also failed:', fallbackError);
          throw fallbackError;
        }
      }
    }

    async deleteUser(id: number): Promise<void> {
      try {
        // Try database storage first
        return await this.dbStorage.deleteUser(id);
      } catch (error) {
        console.log('💾 Database unavailable, using file storage for user deletion');
        // Fall back to memory storage and file persistence
        this.memStorage.deleteUser(id);
        
        // Also remove from file storage
        try {
          const fs = await import('fs');
          const path = await import('path');
          const DATA_DIR = path.join(process.cwd(), 'data');
          const USERS_FILE = path.join(DATA_DIR, 'users.json');

          if (fs.existsSync(USERS_FILE)) {
            const fileContent = fs.readFileSync(USERS_FILE, 'utf8');
            let users = JSON.parse(fileContent);
            
            // Remove user from file
            users = users.filter((u: any) => u.id !== id);
            
            // Write back to file
            fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
            console.log(`💾 Deleted user from file: ID ${id}`);
          }
        } catch (fileError) {
          console.log('❌ Failed to delete user from file:', fileError);
        }
      }
    }

    // School methods - use database storage with fallback to memory
    async getSchool(id: number): Promise<School | undefined> {
      try {
        return await this.dbStorage.getSchool(id);
      } catch (error) {
        return this.memStorage.getSchool(id);
      }
    }

    async getSchoolByCode(registrationCode: string): Promise<School | undefined> {
      try {
        return await this.dbStorage.getSchoolByCode(registrationCode);
      } catch (error) {
        return this.memStorage.getSchoolByCode(registrationCode);
      }
    }

    async createSchool(school: InsertSchool): Promise<School> {
      try {
        return await this.dbStorage.createSchool(school);
      } catch (error) {
        return this.memStorage.createSchool(school);
      }
    }

    async updateSchool(id: number, school: Partial<InsertSchool>): Promise<School | undefined> {
      try {
        return await this.dbStorage.updateSchool(id, school);
      } catch (error) {
        return this.memStorage.updateSchool(id, school);
      }
    }

    async getAllSchools(): Promise<School[]> {
      try {
        return await this.dbStorage.getAllSchools();
      } catch (error) {
        return this.memStorage.getAllSchools();
      }
    }

    async getSchoolsByAdminId(adminId: number): Promise<School[]> {
      try {
        return await this.dbStorage.getSchoolsByAdminId(adminId);
      } catch (error) {
        return this.memStorage.getSchoolsByAdminId(adminId);
      }
    }

    async getUserRolesByUserId(userId: number): Promise<UserRole[]> {
      try {
        return await this.dbStorage.getUserRolesByUserId(userId);
      } catch (error) {
        return this.memStorage.getUserRolesByUserId(userId);
      }
    }

    async getLocationsBySchool(schoolId: number): Promise<Location[]> {
      try {
        return await this.dbStorage.getLocationsBySchool(schoolId);
      } catch (error) {
        return this.memStorage.getLocationsBySchool(schoolId);
      }
    }

    async getCurriculum(id: number): Promise<Curriculum | undefined> {
      return this.dbStorage.getCurriculum(id);
    }

    async getCurriculaByAuthor(authorId: number): Promise<Curriculum[]> {
      return this.dbStorage.getCurriculaByAuthor(authorId);
    }

    async createCurriculum(curriculum: InsertCurriculum): Promise<Curriculum> {
      return this.dbStorage.createCurriculum(curriculum);
    }

    async updateCurriculum(id: number, curriculum: Partial<InsertCurriculum>): Promise<Curriculum | undefined> {
      return this.dbStorage.updateCurriculum(id, curriculum);
    }

    async getLesson(id: number): Promise<Lesson | undefined> {
      return this.dbStorage.getLesson(id);
    }

    async getLessonsByCurriculum(curriculumId: number): Promise<Lesson[]> {
      return this.dbStorage.getLessonsByCurriculum(curriculumId);
    }

    async getLessonsByAuthor(authorId: number): Promise<Lesson[]> {
      return this.dbStorage.getLessonsByAuthor(authorId);
    }

    async createLesson(lesson: InsertLesson): Promise<Lesson> {
      return this.dbStorage.createLesson(lesson);
    }

    async updateLesson(id: number, lesson: Partial<InsertLesson>): Promise<Lesson | undefined> {
      return this.dbStorage.updateLesson(id, lesson);
    }

    async getEvent(id: number): Promise<Event | undefined> {
      return this.dbStorage.getEvent(id);
    }

    async getEventsByOrganizer(organizerId: number): Promise<Event[]> {
      return this.dbStorage.getEventsByOrganizer(organizerId);
    }

    async getUpcomingEvents(userId: number): Promise<Event[]> {
      return this.dbStorage.getUpcomingEvents(userId);
    }

    async getAllEvents(userId: number): Promise<Event[]> {
      return this.dbStorage.getAllEvents(userId);
    }

    async createEvent(event: InsertEvent): Promise<Event> {
      return this.dbStorage.createEvent(event);
    }

    async getMarketplaceItem(id: number): Promise<MarketplaceItem | undefined> {
      return this.dbStorage.getMarketplaceItem(id);
    }

    async getMarketplaceItemsBySeller(sellerId: number): Promise<MarketplaceItem[]> {
      return this.dbStorage.getMarketplaceItemsBySeller(sellerId);
    }

    async getTopSellingItems(limit: number): Promise<MarketplaceItem[]> {
      return this.dbStorage.getTopSellingItems(limit);
    }

    async createMarketplaceItem(item: InsertMarketplaceItem): Promise<MarketplaceItem> {
      return this.dbStorage.createMarketplaceItem(item);
    }

    async updateMarketplaceItemStats(id: number, sales: number, revenue: number): Promise<MarketplaceItem | undefined> {
      return this.dbStorage.updateMarketplaceItemStats(id, sales, revenue);
    }

    async getKnowledgeBase(id: number): Promise<KnowledgeBase | undefined> {
      return this.dbStorage.getKnowledgeBase(id);
    }

    async getKnowledgeBaseById(id: number, userId: number): Promise<KnowledgeBase | undefined> {
      return this.dbStorage.getKnowledgeBaseById(id, userId);
    }

    async getActivityById(id: number, userId: number): Promise<Activity | undefined> {
      return this.dbStorage.getActivityById(id, userId);
    }

    async getActivitiesByAuthor(authorId: number): Promise<Activity[]> {
      return this.dbStorage.getActivitiesByAuthor(authorId);
    }

    async createActivity(activity: InsertActivity): Promise<Activity> {
      return this.dbStorage.createActivity(activity);
    }

    async updateActivityDownloadCount(id: number): Promise<Activity | undefined> {
      return this.dbStorage.updateActivityDownloadCount(id);
    }

    async updateActivityPdfUrl(id: number, pdfUrl: string): Promise<Activity | undefined> {
      return this.dbStorage.updateActivityPdfUrl(id, pdfUrl);
    }

    async getKnowledgeBasesByAuthor(authorId: number): Promise<KnowledgeBase[]> {
      return this.dbStorage.getKnowledgeBasesByAuthor(authorId);
    }

    async getKnowledgeBasesBySubject(subject: string): Promise<KnowledgeBase[]> {
      return this.dbStorage.getKnowledgeBasesBySubject(subject);
    }

    async getPublicKnowledgeBases(limit?: number): Promise<KnowledgeBase[]> {
      return this.dbStorage.getPublicKnowledgeBases(limit);
    }

    async createKnowledgeBase(knowledgeBase: InsertKnowledgeBase): Promise<KnowledgeBase> {
      return this.dbStorage.createKnowledgeBase(knowledgeBase);
    }

    async updateKnowledgeBase(id: number, knowledgeBase: Partial<KnowledgeBase>): Promise<KnowledgeBase | undefined> {
      return this.dbStorage.updateKnowledgeBase(id, knowledgeBase);
    }

    async incrementDownloadCount(id: number): Promise<KnowledgeBase | undefined> {
      return this.dbStorage.incrementDownloadCount(id);
    }

    async addPurchaser(id: number, userId: number): Promise<KnowledgeBase | undefined> {
      return this.dbStorage.addPurchaser(id, userId);
    }

    async getChildById(id: number): Promise<Child | undefined> {
      // Use dbStorage for child retrieval to get data from database
      return this.dbStorage.getChildById(id);
    }

    async getChildrenByParentId(parentId: number): Promise<Child[]> {
      // Use dbStorage for children retrieval to get data from database
      return this.dbStorage.getChildrenByParentId(parentId);
    }

    async getChildrenByParentEmail(parentEmail: string): Promise<Child[]> {
      try {
        // Use dbStorage to get children from database by parent email
        return await this.dbStorage.getChildrenByParentEmail(parentEmail);
      } catch (error) {
        console.error('❌ Database error in getChildrenByParentEmail, falling back to memStorage:', error);
        return await this.memStorage.getChildrenByParentEmail(parentEmail);
      }
    }

    async getAllChildren(): Promise<Child[]> {
      // Use dbStorage for children retrieval to get data from database
      return this.dbStorage.getAllChildren();
    }

    async createChild(child: InsertChild & { parentId: number }): Promise<Child> {
      try {
        return await this.dbStorage.createChild(child);
      } catch (error) {
        return this.memStorage.createChild(child);
      }
    }

    async updateChild(id: number, child: Partial<InsertChild>): Promise<Child | undefined> {
      try {
        return await this.dbStorage.updateChild(id, child);
      } catch (error) {
        return this.memStorage.updateChild(id, child);
      }
    }

    async deleteChild(id: number): Promise<void> {
      try {
        return await this.dbStorage.deleteChild(id);
      } catch (error) {
        return this.memStorage.deleteChild(id);
      }
    }


    async revokeRoleInvitation(id: number): Promise<void> {
      return this.dbStorage.revokeRoleInvitation(id);
    }

    async getEmergencyContactById(id: number): Promise<EmergencyContact | undefined> {
      return this.dbStorage.getEmergencyContactById(id);
    }

    async getEmergencyContactsByUserId(userId: number): Promise<EmergencyContact[]> {
      return this.dbStorage.getEmergencyContactsByUserId(userId);
    }

    async createEmergencyContact(contact: InsertEmergencyContact & { userId: number }): Promise<EmergencyContact> {
      return this.dbStorage.createEmergencyContact(contact);
    }

    async updateEmergencyContact(id: number, contact: Partial<InsertEmergencyContact>): Promise<EmergencyContact | undefined> {
      return this.dbStorage.updateEmergencyContact(id, contact);
    }

    async deleteEmergencyContact(id: number): Promise<void> {
      return this.dbStorage.deleteEmergencyContact(id);
    }

    async getProgramById(id: number): Promise<Program | undefined> {
      return this.dbStorage.getProgramById(id);
    }

    async getPublishedPrograms(category?: string, gradeLevel?: string): Promise<Program[]> {
      return this.dbStorage.getPublishedPrograms(category, gradeLevel);
    }

    async getProgramsByInstructorId(instructorId: number): Promise<Program[]> {
      return this.dbStorage.getProgramsByInstructorId(instructorId);
    }

    async createProgram(program: InsertProgram & { instructorId: number }): Promise<Program> {
      return this.dbStorage.createProgram(program);
    }

    async updateProgram(id: number, program: Partial<InsertProgram>): Promise<Program | undefined> {
      return this.dbStorage.updateProgram(id, program);
    }

    async deleteProgram(id: number): Promise<void> {
      return this.dbStorage.deleteProgram(id);
    }

    async getProgramEnrollmentById(id: number): Promise<ProgramEnrollment | undefined> {
      try {
        if (this.dbStorage && typeof this.dbStorage.getProgramEnrollmentById === 'function') {
          return await this.dbStorage.getProgramEnrollmentById(id);
        } else {
          console.log('💾 DB storage unavailable, using memStorage fallback for getProgramEnrollmentById');
          return await this.memStorage.getProgramEnrollmentById(id);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.log('❌ Error getting program enrollment from database, falling back to memStorage:', error);
        return await this.memStorage.getProgramEnrollmentById(id);
      }
    }

    async getProgramEnrollmentsByParent(parentId: number): Promise<ProgramEnrollment[]> {
      try {
        if (this.dbStorage && typeof this.dbStorage.getProgramEnrollmentsByParent === 'function') {
          return await this.dbStorage.getProgramEnrollmentsByParent(parentId);
        } else {
          console.log('💾 DB storage unavailable, using memStorage fallback for getProgramEnrollmentsByParent');
          return await this.memStorage.getProgramEnrollmentsByParent(parentId);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.log('❌ Error getting program enrollments by parent from database, falling back to memStorage:', error);
        return await this.memStorage.getProgramEnrollmentsByParent(parentId);
      }
    }

    async getEnrollmentsByChildIds(childIds: number[]): Promise<ProgramEnrollment[]> {
      try {
        // Get enrollments for multiple children from unified program_enrollments table
        const db = await getDb();
        return await db.select().from(programEnrollments).where(
          childIds.length === 1 
            ? eq(programEnrollments.childId, childIds[0])
            : inArray(programEnrollments.childId, childIds)
        );
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.error('❌ Error getting enrollments by child IDs in database, falling back to memStorage:', error);
        // Fallback to memStorage: get all enrollments and filter by child IDs
        const allEnrollments = await this.memStorage.getAllEnrollments();
        return allEnrollments.filter(e => childIds.includes(e.childId));
      }
    }

    async getEnrollmentsByProgramId(programId: number): Promise<ProgramEnrollment[]> {
      return this.dbStorage.getProgramEnrollmentsByProgram(programId);
    }

    async getEnrollmentCountForProgram(programId: number): Promise<number> {
      const enrollments = await this.dbStorage.getProgramEnrollmentsByProgram(programId);
      return enrollments.length;
    }

    async getEnrollmentCountForClass(classId: number): Promise<number> {
      return await this.dbStorage.getEnrollmentCountForClass(classId);
    }

    async createProgramEnrollment(enrollment: InsertProgramEnrollment): Promise<ProgramEnrollment> {
      try {
        if (this.dbStorage && typeof this.dbStorage.createProgramEnrollment === 'function') {
          return await this.dbStorage.createProgramEnrollment(enrollment);
        } else {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('Database storage is required in production environment');
          }
          console.log('💾 DB storage unavailable or method missing, using memStorage fallback for createProgramEnrollment');
          return await this.memStorage.createProgramEnrollment(enrollment);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.error('❌ Error creating program enrollment in database, falling back to memStorage:', error);
        return await this.memStorage.createProgramEnrollment(enrollment);
      }
    }

    async updateProgramEnrollment(id: number, enrollment: Partial<InsertProgramEnrollment>): Promise<ProgramEnrollment | undefined> {
      try {
        if (this.dbStorage && typeof this.dbStorage.updateProgramEnrollment === 'function') {
          return await this.dbStorage.updateProgramEnrollment(id, enrollment);
        } else {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('Database storage is required in production environment');
          }
          console.log('💾 DB storage unavailable or method missing, using memStorage fallback for updateProgramEnrollment');
          return await this.memStorage.updateProgramEnrollment(id, enrollment);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.error('❌ Error updating program enrollment in database, falling back to memStorage:', error);
        return await this.memStorage.updateProgramEnrollment(id, enrollment);
      }
    }

    async deleteProgramEnrollment(id: number): Promise<void> {
      try {
        if (this.dbStorage && typeof this.dbStorage.deleteProgramEnrollment === 'function') {
          return await this.dbStorage.deleteProgramEnrollment(id);
        } else {
          console.log('💾 DB storage unavailable, using memStorage fallback for deleteProgramEnrollment');
          return await this.memStorage.deleteProgramEnrollment(id);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.log('❌ Error deleting program enrollment from database, falling back to memStorage:', error);
        return await this.memStorage.deleteProgramEnrollment(id);
      }
    }

    async cancelPendingEnrollments(enrollmentIds: number[], parentUserId: number): Promise<{ cancelled: number[]; skipped: number[]; errors: string[] }> {
      return this.dbStorage.cancelPendingEnrollments(enrollmentIds, parentUserId);
    }

    async getStripeCustomerIdsByParentEmail(parentEmail: string): Promise<string[]> {
      const db = await getDb();
      const { eq, and, inArray, isNotNull } = await import('drizzle-orm');
      
      // Get enrollments with Stripe customer IDs for active statuses
      const activeStatuses = ['pending_payment', 'enrolled', 'completed'] as const;
      const enrollments = await db.select({
        stripeCustomerId: programEnrollments.stripeCustomerId
      })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.parentEmail, parentEmail),
          isNotNull(programEnrollments.stripeCustomerId),
          inArray(programEnrollments.status, activeStatuses)
        )
      );
      
      // Deduplicate customer IDs using Set
      const uniqueCustomerIds = new Set(
        enrollments
          .map(e => e.stripeCustomerId)
          .filter((id): id is string => id !== null)
      );
      
      return Array.from(uniqueCustomerIds);
    }

    async getStripeLinkedEnrollmentsByParentEmail(parentEmail: string): Promise<ProgramEnrollment[]> {
      const db = await getDb();
      const { eq, and, inArray, isNotNull } = await import('drizzle-orm');
      
      // Get all enrollments with Stripe data for active statuses
      const activeStatuses = ['pending_payment', 'enrolled', 'completed'] as const;
      return await db.select()
        .from(programEnrollments)
        .where(
          and(
            eq(programEnrollments.parentEmail, parentEmail),
            isNotNull(programEnrollments.stripeCustomerId),
            inArray(programEnrollments.status, activeStatuses)
          )
        );
    }

    async createEnrollment(enrollment: any): Promise<any> {
      try {
        // All enrollments now stored in unified program_enrollments table
        if (this.dbStorage && typeof this.dbStorage.createProgramEnrollment === 'function') {
          return await this.dbStorage.createProgramEnrollment(enrollment);
        } else {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('Database storage is required in production environment');
          }
          console.log('💾 DB storage unavailable or method missing, using memStorage fallback for createEnrollment');
          return await this.memStorage.createEnrollment(enrollment);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.error('❌ Error creating enrollment in database, falling back to memStorage:', error);
        return await this.memStorage.createEnrollment(enrollment);
      }
    }

    async getEnrollmentsByChildId(childId: number): Promise<any[]> {
      try {
        // Get all enrollments for child from unified program_enrollments table
        if (this.dbStorage && typeof this.dbStorage.getProgramEnrollmentsByChild === 'function') {
          return await this.dbStorage.getProgramEnrollmentsByChild(childId);
        } else {
          console.log('💾 DB storage unavailable, using memStorage fallback for getEnrollmentsByChildId');
          return await this.memStorage.getEnrollmentsByChildId(childId);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.log('❌ Error getting enrollments from database, falling back to memStorage:', error);
        return await this.memStorage.getEnrollmentsByChildId(childId);
      }
    }

    async getEnrollmentsByChildIds(childIds: number[]): Promise<any[]> {
      try {
        console.log('💾 DB storage unavailable, using memStorage fallback for getEnrollmentsByChildIds');
        return await this.memStorage.getEnrollmentsByChildIds(childIds);
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.log('❌ Error getting enrollments from database, falling back to memStorage:', error);
        return await this.memStorage.getEnrollmentsByChildIds(childIds);
      }
    }

    async getEnrollmentsByClassId(classId: number): Promise<any[]> {
      try {
        console.log('💾 DB storage unavailable, using memStorage fallback for getEnrollmentsByClassId');
        return await this.memStorage.getEnrollmentsByClassId(classId);
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.log('❌ Error getting enrollments from database, falling back to memStorage:', error);
        return await this.memStorage.getEnrollmentsByClassId(classId);
      }
    }

    async getEnrollmentById(id: number): Promise<any> {
      try {
        // Get enrollment from unified program_enrollments table
        if (this.dbStorage && typeof this.dbStorage.getProgramEnrollmentById === 'function') {
          return await this.dbStorage.getProgramEnrollmentById(id);
        } else {
          console.log('💾 DB storage unavailable, using memStorage fallback for getEnrollmentById');
          return await this.memStorage.getEnrollmentById(id);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.log('❌ Error getting enrollment from database, falling back to memStorage:', error);
        return await this.memStorage.getEnrollmentById(id);
      }
    }

    async updateEnrollment(idOrEnrollment: any, updates?: any): Promise<any> {
      try {
        // Handle both calling signatures
        const id = typeof idOrEnrollment === 'number' ? idOrEnrollment : idOrEnrollment.id;
        const data = typeof idOrEnrollment === 'number' ? updates : idOrEnrollment;
        if (this.dbStorage && typeof this.dbStorage.updateProgramEnrollment === 'function') {
          return await this.dbStorage.updateProgramEnrollment(id, data);
        } else {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('Database storage is required in production environment');
          }
          console.log('💾 DB storage unavailable or method missing, using memStorage fallback for updateEnrollment');
          return await this.memStorage.updateEnrollment(id, data);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.error('❌ Error updating enrollment in database, falling back to memStorage:', error);
        const id = typeof idOrEnrollment === 'number' ? idOrEnrollment : idOrEnrollment.id;
        const data = typeof idOrEnrollment === 'number' ? updates : idOrEnrollment;
        return await this.memStorage.updateEnrollment(id, data);
      }
    }

    async deleteEnrollment(id: number): Promise<void> {
      return this.dbStorage.deleteProgramEnrollment(id);
    }

    async getClassesBySchoolId(schoolId: string): Promise<Class[]> {
      return this.dbStorage.getClassesBySchoolId(schoolId);
    }

    async getClassById(classId: number): Promise<Class | undefined> {
      try {
        const result = await this.dbStorage.getClassById(classId);
        return result || undefined;
      } catch (error) {
        console.error('❌ Database error in getClassById, falling back to memStorage:', error);
        return await this.memStorage.getClassById(classId);
      }
    }

    async getClasses(options: { page: number; limit: number; search?: string; category?: string; status?: "published" | "draft" | "" }): Promise<Class[]> {
      return this.dbStorage.getClasses(options);
    }

    async getClassesCount(options: { search?: string; category?: string; status?: "published" | "draft" | "" }): Promise<number> {
      return this.dbStorage.getClassesCount(options);
    }

    async getAllClasses(): Promise<Class[]> {
      return this.dbStorage.getAllClasses();
    }

    async createClass(classData: InsertClass & { instructorId: number }): Promise<Class> {
      try {
        if (this.dbStorage && typeof this.dbStorage.createClass === 'function') {
          return await this.dbStorage.createClass(classData);
        } else {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('Database storage is required in production environment');
          }
          console.log('💾 DB storage unavailable or method missing, using memStorage fallback for createClass');
          return await this.memStorage.createClass(classData);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.error('❌ Error creating class in database, falling back to memStorage:', error);
        return await this.memStorage.createClass(classData);
      }
    }

    async updateClass(id: number, classData: Partial<InsertClass>): Promise<Class | undefined> {
      return this.dbStorage.updateClass(id, classData);
    }

    async deleteClass(id: number): Promise<void> {
      return this.dbStorage.deleteClass(id);
    }

    async getActiveRoleInvitation(tokenOrEmail: string): Promise<RoleInvitation | undefined> {
      return this.dbStorage.getActiveRoleInvitation(tokenOrEmail);
    }

    async createRoleInvitation(invitation: InsertRoleInvitation & { invitedBy: number; token: string }): Promise<RoleInvitation> {
      return this.dbStorage.createRoleInvitation(invitation);
    }

    async updateRoleInvitation(id: number, updates: { token?: string; expiresAt?: Date; isActive?: boolean; usedAt?: Date | null }): Promise<any> {
      return this.dbStorage.updateRoleInvitation(id, updates);
    }

    async acceptRoleInvitation(token: string): Promise<void>;
    async acceptRoleInvitation(token: string, userEmail: string): Promise<RoleInvitation | undefined>;
    async acceptRoleInvitation(token: string, userEmail?: string): Promise<any> {
      if (userEmail) {
        return this.dbStorage.acceptRoleInvitation(token, userEmail);
      } else {
        return this.memStorage.acceptRoleInvitation(token);
      }
    }

    async getRoleInvitationsByInviter(inviterId: number): Promise<RoleInvitation[]> {
      return this.dbStorage.getRoleInvitationsByInviter(inviterId);
    }

    async getPendingRoleInvitationsByEmails(emails: string[]): Promise<Map<string, boolean>> {
      return this.dbStorage.getPendingRoleInvitationsByEmails(emails);
    }

    async createMarketingLink(link: InsertMarketingLink): Promise<MarketingLink> {
      return this.dbStorage.createMarketingLink(link);
    }

    async getMarketingLinkById(id: number): Promise<MarketingLink | undefined> {
      return this.dbStorage.getMarketingLinkById(id);
    }

    async getMarketingLinkByCampaignId(campaignId: string): Promise<MarketingLink | undefined> {
      return this.dbStorage.getMarketingLinkByCampaignId(campaignId);
    }

    async getMarketingLinksBySchoolId(schoolId: number): Promise<MarketingLink[]> {
      return this.dbStorage.getMarketingLinksBySchoolId(schoolId);
    }

    async updateMarketingLink(id: number, link: Partial<InsertMarketingLink>): Promise<MarketingLink | undefined> {
      return this.dbStorage.updateMarketingLink(id, link);
    }

    async deleteMarketingLink(id: number): Promise<void> {
      return this.dbStorage.deleteMarketingLink(id);
    }

    async incrementLinkClick(campaignId: string): Promise<void> {
      return this.dbStorage.incrementLinkClick(campaignId);
    }

    async incrementLinkConversion(campaignId: string): Promise<void> {
      const link = await this.memStorage.getMarketingLinkByCampaignId(campaignId);
      if (link) {
        await this.memStorage.incrementLinkConversion(link.id);
      }
    }

    async createLinkAnalytics(analytics: InsertLinkAnalytics): Promise<LinkAnalytics> {
      return this.memStorage.createLinkAnalytics(analytics);
    }

    async getLinkAnalyticsByLinkId(linkId: number, startDate?: Date, endDate?: Date): Promise<LinkAnalytics[]> {
      return this.memStorage.getLinkAnalytics(linkId);
    }

    async getLinkAnalyticsBySchoolId(schoolId: number, startDate?: Date, endDate?: Date): Promise<LinkAnalytics[]> {
      return this.memStorage.getLinkAnalyticsBySchoolId(schoolId, startDate, endDate);
    }

      // Payment methods implementation - use memStorage since database is failing
      async createPayment(payment: InsertPayment): Promise<Payment> {
        try {
          // Prefer dbStorage, but fallback to fileStorage (memStorage instance) if unavailable
          if (this.dbStorage && typeof this.dbStorage.createPayment === 'function') {
            return await this.dbStorage.createPayment(payment);
          } else {
            console.log('💾 DB storage unavailable or method missing, using file storage fallback for createPayment');
            return await this.fileStorage.createPayment(payment);
          }
        } catch (error) {
          console.error('❌ Error creating payment, falling back to file storage:', error);
          return await this.fileStorage.createPayment(payment);
        }
      }

      async getPaymentsByParentEmail(parentEmail: string): Promise<Payment[]> {
        return this.memStorage.getPaymentsByParentEmail(parentEmail);
      }

      async getPaymentByStripeId(stripePaymentIntentId: string): Promise<Payment | undefined> {
        return this.memStorage.getPaymentByStripeId(stripePaymentIntentId);
      }

      async updatePaymentStatus(id: number, status: 'pending' | 'succeeded' | 'failed' | 'canceled'): Promise<Payment | undefined> {
        // Map interface status values to internal implementation values
        let internalStatus: 'pending' | 'failed' | 'succeeded' | 'canceled';
        switch (status) {
          case 'succeeded':
            internalStatus = 'succeeded';
            break;
          case 'canceled':
            internalStatus = 'canceled';
            break;
          default:
            internalStatus = status;
        }
        return this.memStorage.updatePaymentStatus(id, internalStatus);
      }

      async removeEnrollment(enrollmentId: number): Promise<boolean> {
        return this.memStorage.removeEnrollment(enrollmentId);
      }

      // Scheduled payments methods 
      async createScheduledPayment(scheduledPayment: InsertScheduledPayment): Promise<ScheduledPayment> {
        console.log('📝 createScheduledPayment called:', {
          parentEmail: scheduledPayment.parentEmail,
          amount: scheduledPayment.amount,
          scheduledDate: scheduledPayment.scheduledDate,
          hasDbStorage: !!this.dbStorage,
          hasMethod: this.dbStorage && typeof this.dbStorage.createScheduledPayment === 'function'
        });
        
        try {
          if (this.dbStorage && typeof this.dbStorage.createScheduledPayment === 'function') {
            console.log('💾 Using PostgreSQL database for scheduled payment creation');
            const result = await this.dbStorage.createScheduledPayment(scheduledPayment);
            console.log('✅ Scheduled payment saved to database:', result.id);
            return result;
          } else {
            console.log('⚠️ DB storage unavailable or method missing, using file storage fallback for createScheduledPayment');
            return await this.fileStorage.createScheduledPayment(scheduledPayment);
          }
        } catch (error) {
          console.error('❌ Error creating scheduled payment in database, falling back to file storage:', error);
          return await this.fileStorage.createScheduledPayment(scheduledPayment);
        }
      }

      async getScheduledPaymentsByParentEmail(parentEmail: string): Promise<ScheduledPayment[]> {
        try {
          if (this.dbStorage && typeof this.dbStorage.getScheduledPaymentsByParentEmail === 'function') {
            return await this.dbStorage.getScheduledPaymentsByParentEmail(parentEmail);
          } else {
            console.log('💾 DB storage unavailable or method missing, using file storage fallback for getScheduledPaymentsByParentEmail');
            return await this.fileStorage.getScheduledPaymentsByParentEmail(parentEmail);
          }
        } catch (error) {
          return await this.fileStorage.getScheduledPaymentsByParentEmail(parentEmail);
        }
      }

      async updateScheduledPaymentStatus(id: number, status: 'pending' | 'paid' | 'overdue' | 'cancelled'): Promise<ScheduledPayment | undefined> {
        try {
          if (this.dbStorage && typeof this.dbStorage.updateScheduledPaymentStatus === 'function') {
            return await this.dbStorage.updateScheduledPaymentStatus(id, status);
          } else {
            return await this.memStorage.updateScheduledPaymentStatus(id, status);
          }
        } catch (error) {
          return await this.memStorage.updateScheduledPaymentStatus(id, status);
        }
      }

      async updateScheduledPaymentReminderCount(id: number, count: number): Promise<ScheduledPayment | undefined> {
        try {
          if (this.dbStorage && typeof this.dbStorage.updateScheduledPaymentReminderCount === 'function') {
            return await this.dbStorage.updateScheduledPaymentReminderCount(id, count);
          } else {
            return await this.memStorage.updateScheduledPaymentReminderCount(id, count);
          }
        } catch (error) {
          return await this.memStorage.updateScheduledPaymentReminderCount(id, count);
        }
      }

      // Refund methods - use memStorage since database fallback is needed
      async createRefund(refund: InsertRefund): Promise<Refund> {
        return this.memStorage.createRefund(refund);
      }

      async getRefundById(id: number): Promise<Refund | undefined> {
        return this.memStorage.getRefundById(id);
      }

      async getRefundsByPaymentId(paymentId: number): Promise<Refund[]> {
        return this.memStorage.getRefundsByPaymentId(paymentId);
      }

      async getRefundsBySchoolId(schoolId: number): Promise<Refund[]> {
        return this.memStorage.getRefundsBySchoolId(schoolId);
      }

      async updateRefund(id: number, refund: Partial<InsertRefund>): Promise<Refund | undefined> {
        return this.memStorage.updateRefund(id, refund);
      }

      async deleteRefund(id: number): Promise<void> {
        return this.memStorage.deleteRefund(id);
      }

      // School Student methods - Migrated to database storage
      async getSchoolStudentById(id: number): Promise<SchoolStudent | undefined> {
        // dbStorage doesn't have getById, so use memStorage as fallback
        return this.memStorage.getSchoolStudentById(id);
      }

      async getAllSchoolStudents(): Promise<SchoolStudent[]> {
        // dbStorage doesn't have getAll, so use memStorage as fallback
        return this.memStorage.getAllSchoolStudents();
      }

      async getSchoolStudentsBySchoolId(schoolId: number): Promise<SchoolStudent[]> {
        return this.dbStorage.getSchoolStudentsBySchoolId(schoolId);
      }

      async getSchoolStudentsByLocationId(locationId: number): Promise<SchoolStudent[]> {
        // dbStorage doesn't have this method yet, use memStorage as fallback
        return this.memStorage.getSchoolStudentsByLocationId(locationId);
      }

      async getSchoolStudentByChildId(childId: number): Promise<SchoolStudent | undefined> {
        const students = await this.dbStorage.getSchoolStudentsByChildId(childId);
        return students[0]; // Return first match
      }

      async getSchoolStudentByChildAndSchool(childId: number, schoolId: number): Promise<SchoolStudent | undefined> {
        const students = await this.dbStorage.getSchoolStudentsByChildId(childId);
        return students.find(s => s.schoolId === schoolId);
      }

      async createSchoolStudent(schoolStudent: InsertSchoolStudent): Promise<SchoolStudent> {
        return this.dbStorage.createSchoolStudent(schoolStudent);
      }

      async updateSchoolStudent(id: number, schoolStudent: Partial<InsertSchoolStudent>): Promise<SchoolStudent | undefined> {
        return this.dbStorage.updateSchoolStudent(id, schoolStudent);
      }

      async deleteSchoolStudent(id: number): Promise<void> {
        return this.dbStorage.deleteSchoolStudent(id);
      }

      // School Staff methods - Database storage
      async getSchoolStaffById(id: number): Promise<SchoolStaff | undefined> {
        return this.dbStorage.getSchoolStaffById(id);
      }

      async getAllSchoolStaff(): Promise<SchoolStaff[]> {
        return this.dbStorage.getAllSchoolStaff();
      }

      async getSchoolStaffBySchoolId(schoolId: number): Promise<SchoolStaff[]> {
        return this.dbStorage.getSchoolStaffBySchoolId(schoolId);
      }

      async getSchoolStaffByLocationId(locationId: number): Promise<SchoolStaff[]> {
        return this.dbStorage.getSchoolStaffByLocationId(locationId);
      }

      async getSchoolStaffByUserId(userId: number): Promise<SchoolStaff | undefined> {
        return this.dbStorage.getSchoolStaffByUserId(userId);
      }

      async getSchoolStaffByEmail(email: string): Promise<SchoolStaff | undefined> {
        return this.dbStorage.getSchoolStaffByEmail(email);
      }

      async createSchoolStaff(schoolStaff: InsertSchoolStaff): Promise<SchoolStaff> {
        return this.dbStorage.createSchoolStaff(schoolStaff);
      }

      async updateSchoolStaff(id: number, schoolStaff: Partial<InsertSchoolStaff>): Promise<SchoolStaff | undefined> {
        return this.dbStorage.updateSchoolStaff(id, schoolStaff);
      }

      async deleteSchoolStaff(id: number): Promise<void> {
        return this.dbStorage.deleteSchoolStaff(id);
      }

      // User Location methods
      async getUserLocationById(id: number): Promise<UserLocation | undefined> {
        return this.memStorage.getUserLocationById(id);
      }

      async getUserLocationsByUserId(userId: number): Promise<UserLocation[]> {
        return this.dbStorage.getUserLocationsByUserId(userId);
      }

      async getUserLocationsByLocationId(locationId: number): Promise<UserLocation[]> {
        return this.dbStorage.getUserLocationsByLocationId(locationId);
      }

      async createUserLocation(userLocation: InsertUserLocation): Promise<UserLocation> {
        return this.dbStorage.createUserLocation(userLocation);
      }

      async updateUserLocation(id: number, userLocation: Partial<InsertUserLocation>): Promise<UserLocation | undefined> {
        return this.dbStorage.updateUserLocation(id, userLocation);
      }

      async deleteUserLocation(id: number): Promise<void> {
        return this.dbStorage.deleteUserLocation(id);
      }

      // Location methods - use database storage with fallback to memory
      async getLocationById(id: number): Promise<Location | undefined> {
        try {
          return await this.dbStorage.getLocation(id);
        } catch (error) {
          return this.memStorage.getLocation(id);
        }
      }

      async getLocations(): Promise<Location[]> {
        try {
          return await this.dbStorage.getAllLocations();
        } catch (error) {
          return this.memStorage.getAllLocations();
        }
      }

      async getLocationsBySchoolId(schoolId: number): Promise<Location[]> {
        try {
          return await this.dbStorage.getLocationsBySchoolId(schoolId);
        } catch (error) {
          return this.memStorage.getLocationsBySchoolId(schoolId);
        }
      }

      async createLocation(location: InsertLocation): Promise<Location> {
        try {
          return await this.dbStorage.createLocation(location);
        } catch (error) {
          return this.memStorage.createLocation(location);
        }
      }

      async updateLocation(id: number, location: Partial<InsertLocation>): Promise<Location | undefined> {
        try {
          return await this.dbStorage.updateLocation(id, location);
        } catch (error) {
          return this.memStorage.updateLocation(id, location);
        }
      }

      async deleteLocation(id: number): Promise<void> {
        try {
          return await this.dbStorage.deleteLocation(id);
        } catch (error) {
          return this.memStorage.deleteLocation(id);
        }
      }

      // Category methods - use database storage with fallback to memory
      async getCategoryById(id: number): Promise<any> {
        try {
          return await this.dbStorage.getCategoryById(id);
        } catch (error) {
          return this.memStorage.getCategoryById(id);
        }
      }

      async getCategoriesBySchoolId(schoolId: number): Promise<any[]> {
        try {
          return await this.dbStorage.getCategoriesBySchoolId(schoolId);
        } catch (error) {
          return this.memStorage.getCategoriesBySchoolId(schoolId);
        }
      }

      async createCategory(category: any): Promise<any> {
        try {
          return await this.dbStorage.createCategory(category);
        } catch (error) {
          return this.memStorage.createCategory(category);
        }
      }

      async updateCategory(id: number, category: any): Promise<any> {
        try {
          return await this.dbStorage.updateCategory(id, category);
        } catch (error) {
          return this.memStorage.updateCategory(id, category);
        }
      }

      async deleteCategory(id: number): Promise<void> {
        try {
          return await this.dbStorage.deleteCategory(id);
        } catch (error) {
          return this.memStorage.deleteCategory(id);
        }
      }

      // Daily Flow Template methods
      async getDailyFlowTemplates(filters?: { schoolId?: number; gradeLevel?: string; subject?: string }): Promise<DailyFlowTemplate[]> {
        return this.dbStorage.getDailyFlowTemplates(filters);
      }

      async getDailyFlowTemplateById(id: number): Promise<DailyFlowTemplate | undefined> {
        return this.dbStorage.getDailyFlowTemplateById(id);
      }

      async createDailyFlowTemplate(template: InsertDailyFlowTemplate): Promise<DailyFlowTemplate> {
        return this.dbStorage.createDailyFlowTemplate(template);
      }

      async updateDailyFlowTemplate(id: number, template: Partial<InsertDailyFlowTemplate>): Promise<DailyFlowTemplate | undefined> {
        return this.dbStorage.updateDailyFlowTemplate(id, template);
      }

      async deleteDailyFlowTemplate(id: number): Promise<void> {
        return this.dbStorage.deleteDailyFlowTemplate(id);
      }

      // Daily Flow Entry methods
      async getDailyFlowEntries(filters?: { classId?: number; startDate?: string; endDate?: string }): Promise<DailyFlowEntry[]> {
        return this.dbStorage.getDailyFlowEntries(filters);
      }

      async getDailyFlowEntryById(id: number): Promise<DailyFlowEntry | undefined> {
        return this.dbStorage.getDailyFlowEntryById(id);
      }

      async createDailyFlowEntry(entry: InsertDailyFlowEntry): Promise<DailyFlowEntry> {
        return this.dbStorage.createDailyFlowEntry(entry);
      }

      async updateDailyFlowEntry(id: number, entry: Partial<InsertDailyFlowEntry>): Promise<DailyFlowEntry | undefined> {
        return this.dbStorage.updateDailyFlowEntry(id, entry);
      }

      async deleteDailyFlowEntry(id: number): Promise<void> {
        return this.dbStorage.deleteDailyFlowEntry(id);
      }

      // Daily Flow Schedule methods
      async getDailyFlowSchedules(filters?: { templateId?: number; classId?: number }): Promise<DailyFlowSchedule[]> {
        return this.dbStorage.getDailyFlowSchedules(filters);
      }

      async getDailyFlowScheduleById(id: number): Promise<DailyFlowSchedule | undefined> {
        return this.dbStorage.getDailyFlowScheduleById(id);
      }

      async createDailyFlowSchedule(schedule: InsertDailyFlowSchedule): Promise<DailyFlowSchedule> {
        return this.dbStorage.createDailyFlowSchedule(schedule);
      }

      async updateDailyFlowSchedule(id: number, schedule: Partial<InsertDailyFlowSchedule>): Promise<DailyFlowSchedule | undefined> {
        return this.dbStorage.updateDailyFlowSchedule(id, schedule);
      }

      async deleteDailyFlowSchedule(id: number): Promise<void> {
        return this.dbStorage.deleteDailyFlowSchedule(id);
      }

      // Daily Flow utility methods
      async generateDailyFlowEntriesFromTemplate(params: { templateId: number; classId: number; startDate: string; endDate: string; createdBy: string }): Promise<DailyFlowEntry[]> {
        return this.memStorage.generateDailyFlowEntriesFromTemplate(params);
      }

      async getDailyFlowStats(filters?: { classId?: number; startDate?: string; endDate?: string }): Promise<{ totalEntries: number; completedEntries: number; completionRate: number }> {
        return this.dbStorage.getDailyFlowStats(filters);
      }

      // Technical Support methods
      async createTechnicalIssue(issue: any): Promise<any> {
        return this.memStorage.createTechnicalIssue(issue);
      }

      async getTechnicalIssue(id: string): Promise<any> {
        return this.memStorage.getTechnicalIssue(id);
      }

      async getAllTechnicalIssues(): Promise<any[]> {
        return this.memStorage.getAllTechnicalIssues();
      }

      async updateTechnicalIssue(id: string, updates: any): Promise<any> {
        return this.memStorage.updateTechnicalIssue(id, updates);
      }

      // Notification methods
      async getNotificationById(id: number): Promise<Notification | undefined> {
        return this.dbStorage.getNotificationById(id);
      }

      async getAllNotifications(): Promise<Notification[]> {
        return this.dbStorage.getAllNotifications();
      }

      async getNotificationsByUserId(userId: number, role?: string): Promise<Notification[]> {
        return this.dbStorage.getNotificationsByUserId(userId, role);
      }

      async createNotification(notification: InsertNotification): Promise<Notification> {
        return this.dbStorage.createNotification(notification);
      }

      async updateNotification(id: number, notification: Partial<InsertNotification>): Promise<Notification | undefined> {
        return this.dbStorage.updateNotification(id, notification);
      }

      async deleteNotification(id: number): Promise<void> {
        return this.dbStorage.deleteNotification(id);
      }

      // Notification recipient methods
      async getNotificationRecipientById(id: number): Promise<NotificationRecipient | undefined> {
        return this.dbStorage.getNotificationRecipientById(id);
      }

      async getNotificationRecipientsByNotificationId(notificationId: number): Promise<NotificationRecipient[]> {
        return this.dbStorage.getNotificationRecipientsByNotificationId(notificationId);
      }

      async getNotificationRecipientsByUserId(userId: number): Promise<NotificationRecipient[]> {
        return this.dbStorage.getNotificationRecipientsByUserId(userId);
      }

      async createNotificationRecipient(recipient: InsertNotificationRecipient): Promise<NotificationRecipient> {
        return this.dbStorage.createNotificationRecipient(recipient);
      }

      async updateNotificationRecipient(id: number, recipient: Partial<InsertNotificationRecipient>): Promise<NotificationRecipient | undefined> {
        return this.dbStorage.updateNotificationRecipient(id, recipient);
      }

      // Push Subscription methods
      async getPushSubscriptionsByUserId(userId: number): Promise<any[]> {
        return this.dbStorage.getPushSubscriptionsByUserId(userId);
      }

      async getPushSubscriptionByEndpoint(endpoint: string): Promise<any | undefined> {
        return this.dbStorage.getPushSubscriptionByEndpoint(endpoint);
      }

      async createPushSubscription(subscription: any): Promise<any> {
        return this.dbStorage.createPushSubscription(subscription);
      }

      async updatePushSubscription(id: number, subscription: Partial<any>): Promise<any | undefined> {
        return this.dbStorage.updatePushSubscription(id, subscription);
      }

      async deletePushSubscription(id: number): Promise<void> {
        return this.dbStorage.deletePushSubscription(id);
      }

      async deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
        return this.dbStorage.deletePushSubscriptionByEndpoint(endpoint);
      }

      // Discount methods
      async getDiscountById(id: number): Promise<Discount | undefined> {
        return this.dbStorage.getDiscountById(id);
      }

      async getAllDiscounts(): Promise<Discount[]> {
        return this.dbStorage.getAllDiscounts();
      }

      async getDiscountsBySchoolId(schoolId: number): Promise<Discount[]> {
        return this.dbStorage.getDiscountsBySchoolId(schoolId);
      }

      async createDiscount(discount: InsertDiscount): Promise<Discount> {
        return this.dbStorage.createDiscount(discount);
      }

      async updateDiscount(id: number, discount: Partial<InsertDiscount>): Promise<Discount | undefined> {
        return this.dbStorage.updateDiscount(id, discount);
      }

      async incrementDiscountUsageAtomic(discountId: number): Promise<boolean> {
        return this.dbStorage.incrementDiscountUsageAtomic(discountId);
      }

      async deleteDiscount(id: number): Promise<void> {
        return this.dbStorage.deleteDiscount(id);
      }

      // Discount Application methods
      async getDiscountApplicationById(id: number): Promise<DiscountApplication | undefined> {
        return this.dbStorage.getDiscountApplicationById(id);
      }

      async getAllDiscountApplications(): Promise<DiscountApplication[]> {
        return this.dbStorage.getAllDiscountApplications();
      }

      async getDiscountApplicationsBySchoolId(schoolId: number): Promise<DiscountApplication[]> {
        return this.dbStorage.getDiscountApplicationsBySchoolId(schoolId);
      }

      async getDiscountApplicationsByDiscountId(discountId: number): Promise<DiscountApplication[]> {
        return this.dbStorage.getDiscountApplicationsByDiscountId(discountId);
      }

      async createDiscountApplication(application: InsertDiscountApplication): Promise<DiscountApplication> {
        return this.dbStorage.createDiscountApplication(application);
      }

      async updateDiscountApplication(id: number, application: Partial<InsertDiscountApplication>): Promise<DiscountApplication | undefined> {
        return this.dbStorage.updateDiscountApplication(id, application);
      }

      // Membership Enrollment methods
      async getMembershipEnrollmentById(id: number): Promise<MembershipEnrollment | undefined> {
        return this.dbStorage.getMembershipEnrollmentById(id);
      }

      async getMembershipEnrollmentsByParentId(parentUserId: number): Promise<MembershipEnrollment[]> {
        return this.dbStorage.getMembershipEnrollmentsByParentId(parentUserId);
      }

      async getMembershipEnrollmentsBySchoolId(schoolId: number): Promise<MembershipEnrollment[]> {
        return this.dbStorage.getMembershipEnrollmentsBySchoolId(schoolId);
      }

      async getMembershipEnrollmentByParentAndSchoolAndYear(parentUserId: number, schoolId: number, membershipYear: number): Promise<MembershipEnrollment | undefined> {
        return this.dbStorage.getMembershipEnrollmentByParentAndSchoolAndYear(parentUserId, schoolId, membershipYear);
      }

      async createMembershipEnrollment(enrollment: InsertMembershipEnrollment): Promise<MembershipEnrollment> {
        return this.dbStorage.createMembershipEnrollment(enrollment);
      }

      async updateMembershipEnrollment(id: number, enrollment: Partial<InsertMembershipEnrollment>): Promise<MembershipEnrollment | undefined> {
        return this.dbStorage.updateMembershipEnrollment(id, enrollment);
      }

      async deleteMembershipEnrollment(id: number): Promise<void> {
        return this.dbStorage.deleteMembershipEnrollment(id);
      }

      async createOrUpdateMembershipEnrollment(parentUserId: number, schoolId: number, membershipYear: number): Promise<MembershipEnrollment> {
        return this.dbStorage.createOrUpdateMembershipEnrollment(parentUserId, schoolId, membershipYear);
      }

      // Membership Agreement methods
      async getMembershipAgreementById(id: number): Promise<MembershipAgreement | undefined> {
        return this.dbStorage.getMembershipAgreementById(id);
      }

      async getMembershipAgreementsByParentId(parentUserId: number): Promise<MembershipAgreement[]> {
        return this.dbStorage.getMembershipAgreementsByParentId(parentUserId);
      }

      async getMembershipAgreementsBySchoolId(schoolId: number): Promise<MembershipAgreement[]> {
        return this.dbStorage.getMembershipAgreementsBySchoolId(schoolId);
      }

      async getMembershipAgreementByEnrollmentId(enrollmentId: number): Promise<MembershipAgreement | undefined> {
        return this.dbStorage.getMembershipAgreementByEnrollmentId(enrollmentId);
      }

      async getLatestMembershipAgreementByParentAndSchool(parentUserId: number, schoolId: number): Promise<MembershipAgreement | undefined> {
        return this.dbStorage.getLatestMembershipAgreementByParentAndSchool(parentUserId, schoolId);
      }

      async createMembershipAgreement(agreement: InsertMembershipAgreement): Promise<MembershipAgreement> {
        return this.dbStorage.createMembershipAgreement(agreement);
      }

      async hasSignedCurrentAgreement(parentUserId: number, schoolId: number, currentVersion: string): Promise<boolean> {
        return this.dbStorage.hasSignedCurrentAgreement(parentUserId, schoolId, currentVersion);
      }

      async getRoleInvitations(): Promise<any[]> {
        try {
          if (this.dbStorage && typeof this.dbStorage.getRoleInvitations === 'function') {
            return await this.dbStorage.getRoleInvitations();
          }
        } catch (error) {
          console.error('❌ Error fetching role invitations from database:', error);
        }
        return this.memStorage.getRoleInvitations();
      }

      async getAllScheduledPayments(): Promise<any[]> {
        console.log('📋 getAllScheduledPayments called - checking database...');
        try {
          if (this.dbStorage && typeof this.dbStorage.getAllScheduledPayments === 'function') {
            const payments = await this.dbStorage.getAllScheduledPayments();
            console.log(`📋 Found ${payments.length} scheduled payments in database`);
            return payments;
          } else {
            console.log('⚠️ DB storage unavailable for getAllScheduledPayments, using memStorage fallback');
            return await this.memStorage.getAllScheduledPayments();
          }
        } catch (error) {
          console.error('❌ Error fetching scheduled payments from database:', error);
          return await this.memStorage.getAllScheduledPayments();
        }
      }

      async createStripeSubscriptionSchedule(schedule: InsertStripeSubscriptionSchedule): Promise<StripeSubscriptionSchedule> {
        return this.dbStorage.createStripeSubscriptionSchedule(schedule);
      }

      async getStripeSubscriptionSchedulesByParentEmail(parentEmail: string): Promise<StripeSubscriptionSchedule[]> {
        return this.dbStorage.getStripeSubscriptionSchedulesByParentEmail(parentEmail);
      }

      async getStripeSubscriptionScheduleById(id: number): Promise<StripeSubscriptionSchedule | undefined> {
        return this.dbStorage.getStripeSubscriptionScheduleById(id);
      }

      async getStripeSubscriptionScheduleByStripeId(stripeScheduleId: string): Promise<StripeSubscriptionSchedule | undefined> {
        return this.dbStorage.getStripeSubscriptionScheduleByStripeId(stripeScheduleId);
      }

      async updateStripeSubscriptionSchedule(id: number, schedule: Partial<InsertStripeSubscriptionSchedule>): Promise<StripeSubscriptionSchedule | undefined> {
        return this.dbStorage.updateStripeSubscriptionSchedule(id, schedule);
      }

      async getEnrollmentsByIds(enrollmentIds: number[]): Promise<any[]> {
        return this.memStorage.getEnrollmentsByIds(enrollmentIds);
      }

      // Staff Position methods
      async getAllStaffPositions(): Promise<StaffPosition[]> {
        return this.dbStorage.getAllStaffPositions();
      }

      async getStaffPositionById(id: number): Promise<StaffPosition | undefined> {
        return this.dbStorage.getStaffPositionById(id);
      }

      async getStaffPositionsBySchoolId(schoolId: number | null): Promise<StaffPosition[]> {
        return this.dbStorage.getStaffPositionsBySchoolId(schoolId);
      }

      async createStaffPosition(position: InsertStaffPosition): Promise<StaffPosition> {
        return this.dbStorage.createStaffPosition(position);
      }

      async updateStaffPosition(id: number, position: Partial<InsertStaffPosition>): Promise<StaffPosition | undefined> {
        return this.dbStorage.updateStaffPosition(id, position);
      }

      async deleteStaffPosition(id: number): Promise<void> {
        return this.dbStorage.deleteStaffPosition(id);
      }

      // Staff Invitation methods
      async getAllStaffInvitations(): Promise<StaffInvitation[]> {
        return this.dbStorage.getAllStaffInvitations();
      }

      async getStaffInvitationById(id: number): Promise<StaffInvitation | undefined> {
        return this.dbStorage.getStaffInvitationById(id);
      }

      async getStaffInvitationByToken(token: string): Promise<StaffInvitation | undefined> {
        return this.dbStorage.getStaffInvitationByToken(token);
      }

      async getStaffInvitationsBySchoolId(schoolId: number): Promise<StaffInvitation[]> {
        return this.dbStorage.getStaffInvitationsBySchoolId(schoolId);
      }

      async getStaffInvitationsByEmail(email: string): Promise<StaffInvitation[]> {
        return this.dbStorage.getStaffInvitationsByEmail(email);
      }

      async createStaffInvitation(invitation: InsertStaffInvitation): Promise<StaffInvitation> {
        return this.dbStorage.createStaffInvitation(invitation);
      }

      async updateStaffInvitation(id: number, invitation: Partial<InsertStaffInvitation>): Promise<StaffInvitation | undefined> {
        return this.dbStorage.updateStaffInvitation(id, invitation);
      }

      async deleteStaffInvitation(id: number): Promise<void> {
        return this.dbStorage.deleteStaffInvitation(id);
      }

      // Password Reset Token methods
      async getPasswordResetTokenByToken(token: string): Promise<PasswordResetToken | undefined> {
        return this.dbStorage.getPasswordResetTokenByToken(token);
      }

      async createPasswordResetToken(tokenData: InsertPasswordResetToken): Promise<PasswordResetToken> {
        return this.dbStorage.createPasswordResetToken(tokenData);
      }

      async markPasswordResetTokenAsUsed(token: string): Promise<void> {
        return this.dbStorage.markPasswordResetTokenAsUsed(token);
      }

      async deleteExpiredPasswordResetTokens(): Promise<void> {
        return this.dbStorage.deleteExpiredPasswordResetTokens();
      }

      // School Document methods
      async getSchoolDocumentById(id: number): Promise<SchoolDocument | undefined> {
        return this.dbStorage.getSchoolDocumentById(id);
      }

      async getSchoolDocumentsBySchoolId(schoolId: number): Promise<SchoolDocument[]> {
        return this.dbStorage.getSchoolDocumentsBySchoolId(schoolId);
      }

      async getPublishedSchoolDocuments(schoolId: number): Promise<SchoolDocument[]> {
        return this.dbStorage.getPublishedSchoolDocuments(schoolId);
      }

      async createSchoolDocument(document: InsertSchoolDocument): Promise<SchoolDocument> {
        return this.dbStorage.createSchoolDocument(document);
      }

      async updateSchoolDocument(id: number, document: Partial<InsertSchoolDocument>): Promise<SchoolDocument | undefined> {
        return this.dbStorage.updateSchoolDocument(id, document);
      }

      async deleteSchoolDocument(id: number): Promise<void> {
        return this.dbStorage.deleteSchoolDocument(id);
      }

      // Database initialization methods
      async initializeNotifications(): Promise<void> {
        return this.dbStorage.initializeNotifications();
      }

      // Clear all data from storage (for testing)
      clearAll() {
        this.memStorage.clearAll();
      }
  }

  // Use the MemStorage implementation for classes functionality
  export const storage = new CombinedStorage();
  export { sharedMemStorage };