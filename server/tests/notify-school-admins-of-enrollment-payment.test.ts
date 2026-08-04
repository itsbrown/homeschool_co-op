import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockGetAllUsers = jest.fn();
const mockGetSchoolStaffBySchoolId = jest.fn();
const mockGetSchool = jest.fn();
const mockGetUser = jest.fn();
const mockGetUserByEmail = jest.fn();
const mockGetProgramEnrollmentById = jest.fn();
const mockGetChildById = jest.fn();
const mockGetClassById = jest.fn();
const mockCreateNotification = jest.fn();
const mockCreateNotificationRecipient = jest.fn();
const mockUpdatePayment = jest.fn();
const mockSendPaidEnrollmentAdminNotificationEmail = jest.fn();

jest.mock('../storage', () => ({
  storage: {
    getAllUsers: (...a: unknown[]) => mockGetAllUsers(...a),
    getSchoolStaffBySchoolId: (...a: unknown[]) => mockGetSchoolStaffBySchoolId(...a),
    getSchool: (...a: unknown[]) => mockGetSchool(...a),
    getUser: (...a: unknown[]) => mockGetUser(...a),
    getUserByEmail: (...a: unknown[]) => mockGetUserByEmail(...a),
    getProgramEnrollmentById: (...a: unknown[]) => mockGetProgramEnrollmentById(...a),
    getChildById: (...a: unknown[]) => mockGetChildById(...a),
    getClassById: (...a: unknown[]) => mockGetClassById(...a),
    createNotification: (...a: unknown[]) => mockCreateNotification(...a),
    createNotificationRecipient: (...a: unknown[]) => mockCreateNotificationRecipient(...a),
    updatePayment: (...a: unknown[]) => mockUpdatePayment(...a),
  },
}));

jest.mock('../lib/email-service', () => ({
  sendPaidEnrollmentAdminNotificationEmail: (...a: unknown[]) =>
    mockSendPaidEnrollmentAdminNotificationEmail(...a),
}));

describe('notify-school-admins-of-enrollment-payment', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetAllUsers.mockReset();
    mockGetSchoolStaffBySchoolId.mockReset();
    mockGetSchool.mockReset();
    mockGetUser.mockReset();
    mockGetUserByEmail.mockReset();
    mockGetProgramEnrollmentById.mockReset();
    mockGetChildById.mockReset();
    mockGetClassById.mockReset();
    mockCreateNotification.mockReset();
    mockCreateNotificationRecipient.mockReset();
    mockUpdatePayment.mockReset();
    mockSendPaidEnrollmentAdminNotificationEmail.mockReset();

    mockGetSchoolStaffBySchoolId.mockResolvedValue([]);
    mockGetAllUsers.mockResolvedValue([
      {
        id: 10,
        email: 'admin@school.test',
        name: 'School Admin',
        role: 'schoolAdmin',
        schoolId: 5,
        phone: '555-0100',
      },
    ]);
    mockGetSchool.mockResolvedValue({ id: 5, name: 'Test Academy' });
    mockGetUser.mockResolvedValue({
      id: 20,
      email: 'parent@test.com',
      name: 'Pat Parent',
      phone: '555-0200',
      schoolId: 5,
    });
    mockGetUserByEmail.mockResolvedValue({
      id: 20,
      email: 'parent@test.com',
      name: 'Pat Parent',
      phone: '555-0200',
      schoolId: 5,
    });
    mockGetProgramEnrollmentById.mockResolvedValue({
      id: 100,
      childId: 7,
      childName: 'Sam Student',
      className: 'Science Lab',
      classId: 3,
      marketplaceClassId: null,
      totalPaid: 15000,
      totalCost: 30000,
      schoolId: 5,
    });
    mockGetChildById.mockResolvedValue({
      id: 7,
      firstName: 'Sam',
      lastName: 'Student',
      birthdate: '2015-06-15',
      gradeLevel: '4th Grade',
    });
    mockGetClassById.mockResolvedValue({ id: 3, title: 'Science Lab' });
    mockCreateNotification.mockResolvedValue({ id: 99 });
    mockCreateNotificationRecipient.mockResolvedValue({ id: 1 });
    mockUpdatePayment.mockResolvedValue({});
    mockSendPaidEnrollmentAdminNotificationEmail.mockResolvedValue(true);
  });

  it('ageFromBirthdate computes whole years', async () => {
    const { ageFromBirthdate } = await import(
      '../lib/notify-school-admins-of-enrollment-payment'
    );
    expect(ageFromBirthdate('2015-01-01')).toBeGreaterThanOrEqual(10);
    expect(ageFromBirthdate(null)).toBeNull();
  });

  it('shouldNotifyAdminsForEnrollmentPayment skips balance and scheduled', async () => {
    const { shouldNotifyAdminsForEnrollmentPayment } = await import(
      '../lib/notify-school-admins-of-enrollment-payment'
    );
    expect(shouldNotifyAdminsForEnrollmentPayment('balance_payment')).toBe(false);
    expect(shouldNotifyAdminsForEnrollmentPayment('scheduled_payment')).toBe(false);
    expect(shouldNotifyAdminsForEnrollmentPayment('cart_checkout')).toBe(true);
    expect(shouldNotifyAdminsForEnrollmentPayment('enrollment_payment')).toBe(true);
    expect(shouldNotifyAdminsForEnrollmentPayment(null)).toBe(true);
  });

  it('notifies admins with parent, student age/grade, and class, then marks payment', async () => {
    const { notifySchoolAdminsOfEnrollmentPaymentIdempotent } = await import(
      '../lib/notify-school-admins-of-enrollment-payment'
    );

    const payment = {
      id: 55,
      schoolId: 5,
      parentId: 20,
      parentEmail: 'parent@test.com',
      amount: 15000,
      stripePaymentIntentId: 'pi_test_123',
      paymentDate: new Date('2026-07-27T15:00:00Z'),
      metadata: {},
    } as any;

    const sent = await notifySchoolAdminsOfEnrollmentPaymentIdempotent({
      payment,
      enrollmentIds: [100],
      paymentType: 'cart_checkout',
      paymentPlan: 'full',
      paymentIntentId: 'pi_test_123',
      amountPaidCents: 15000,
    });

    expect(sent).toBe(true);
    expect(mockSendPaidEnrollmentAdminNotificationEmail).toHaveBeenCalledTimes(1);
    const emailArg = mockSendPaidEnrollmentAdminNotificationEmail.mock.calls[0]![0] as any;
    expect(emailArg.parentEmail).toBe('parent@test.com');
    expect(emailArg.parentName).toBe('Pat Parent');
    expect(emailArg.lines[0].studentName).toBe('Sam Student');
    expect(emailArg.lines[0].gradeLevel).toBe('4th Grade');
    expect(emailArg.lines[0].className).toBe('Science Lab');
    expect(emailArg.lines[0].age).toBeGreaterThanOrEqual(10);
    expect(emailArg.amountPaidCents).toBe(15000);

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockUpdatePayment).toHaveBeenCalledWith(
      55,
      expect.objectContaining({
        metadata: expect.objectContaining({
          adminEnrollmentNotifySentAt: expect.any(String),
        }),
      }),
    );
  });

  it('skips when already notified (idempotent)', async () => {
    const { notifySchoolAdminsOfEnrollmentPaymentIdempotent } = await import(
      '../lib/notify-school-admins-of-enrollment-payment'
    );

    const payment = {
      id: 55,
      schoolId: 5,
      parentId: 20,
      parentEmail: 'parent@test.com',
      amount: 15000,
      metadata: { adminEnrollmentNotifySentAt: '2026-07-27T12:00:00.000Z' },
    } as any;

    const sent = await notifySchoolAdminsOfEnrollmentPaymentIdempotent({
      payment,
      enrollmentIds: [100],
      paymentType: 'cart_checkout',
      amountPaidCents: 15000,
    });

    expect(sent).toBe(false);
    expect(mockSendPaidEnrollmentAdminNotificationEmail).not.toHaveBeenCalled();
  });

  it('skips balance_payment', async () => {
    const { notifySchoolAdminsOfEnrollmentPaymentIdempotent } = await import(
      '../lib/notify-school-admins-of-enrollment-payment'
    );

    const sent = await notifySchoolAdminsOfEnrollmentPaymentIdempotent({
      payment: {
        id: 1,
        schoolId: 5,
        parentEmail: 'parent@test.com',
        metadata: {},
      } as any,
      enrollmentIds: [100],
      paymentType: 'balance_payment',
      amountPaidCents: 5000,
    });

    expect(sent).toBe(false);
    expect(mockSendPaidEnrollmentAdminNotificationEmail).not.toHaveBeenCalled();
  });
});
