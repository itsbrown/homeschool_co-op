import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { testDb } from '../../helpers/testDatabase';
import { api } from '../../helpers/apiHelpers';
import { resetAllMocks, mockBrevoService, mockTwilioService, mockWebSocketService } from '../../helpers/mockServices';

/**
 * PHASE 1: Core Platform Features
 * Integration Tests for Notification System
 * 
 * Test Coverage:
 * - Individual notifications
 * - Role-based notifications
 * - Location-based notifications
 * - Broadcast notifications
 * - Delivery methods (in-app, email, SMS)
 * - Real-time WebSocket delivery
 * - Notification center operations
 * - Multi-location notifications
 */

describe('Integration: Notification System', () => {
  let testSchool: any;
  let testAdmin: any;
  let testParent: any;
  let testEducator: any;
  let testLocation1: any;
  let testLocation2: any;

  beforeAll(async () => {
    await testDb.cleanup();
    
    const env = await testDb.setupTestEnvironment();
    testSchool = env.school;
    testAdmin = env.admin;
    testParent = env.parent;
    testEducator = env.educator;
    testLocation1 = env.locations[0];
    testLocation2 = env.locations[1];
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(() => {
    resetAllMocks();
  });

  describe('Individual Notifications', () => {
    it('should send notification to specific user', async () => {
      await api.loginAsUser(testAdmin.email);

      const notificationData = {
        userId: testParent.id,
        schoolId: testSchool.id,
        title: 'Welcome to ASA',
        message: 'Thank you for joining our school community!',
        type: 'info'
      };

      const response = await api.post('/api/notifications', notificationData);

      expect(response.status).toBe(200);
      expect(response.body.notification.userId).toBe(testParent.id);
      expect(response.body.notification.title).toBe('Welcome to ASA');
    });

    it('should retrieve notifications for logged-in user', async () => {
      // Create notification for parent
      await api.loginAsUser(testAdmin.email);
      await api.post('/api/notifications', {
        userId: testParent.id,
        schoolId: testSchool.id,
        title: 'Test Notification',
        message: 'This is a test'
      });

      // Login as parent and retrieve
      await api.loginAsUser(testParent.email);
      const response = await api.get('/api/notifications');

      expect(response.status).toBe(200);
      expect(response.body.notifications).toBeDefined();
      expect(response.body.notifications.some((n: any) => n.title === 'Test Notification')).toBe(true);
    });

    it('should mark notification as read', async () => {
      await api.loginAsUser(testAdmin.email);
      const createResponse = await api.post('/api/notifications', {
        userId: testParent.id,
        schoolId: testSchool.id,
        title: 'Unread Notification',
        message: 'Please read this'
      });

      const notificationId = createResponse.body.notification.id;

      await api.loginAsUser(testParent.email);
      const markReadResponse = await api.patch(`/api/notifications/${notificationId}/read`);

      expect(markReadResponse.status).toBe(200);
      expect(markReadResponse.body.notification.isRead).toBe(true);
      expect(markReadResponse.body.notification.readAt).toBeDefined();
    });

    it('should delete notification', async () => {
      await api.loginAsUser(testAdmin.email);
      const createResponse = await api.post('/api/notifications', {
        userId: testParent.id,
        schoolId: testSchool.id,
        title: 'To Delete',
        message: 'Will be deleted'
      });

      const notificationId = createResponse.body.notification.id;

      await api.loginAsUser(testParent.email);
      const deleteResponse = await api.delete(`/api/notifications/${notificationId}`);

      expect(deleteResponse.status).toBe(200);

      const getResponse = await api.get(`/api/notifications/${notificationId}`);
      expect(getResponse.status).toBe(404);
    });
  });

  describe('Role-Based Notifications', () => {
    it('should send notification to all parents', async () => {
      const parent2 = await testDb.createTestUser({ 
        role: 'parent',
        email: 'parent2@test.com'
      });

      await api.loginAsUser(testAdmin.email);

      const response = await api.post('/api/notifications/broadcast', {
        schoolId: testSchool.id,
        targetRole: 'parent',
        title: 'Message to All Parents',
        message: 'Important parent information'
      });

      expect(response.status).toBe(200);
      expect(response.body.sentCount).toBeGreaterThanOrEqual(2);
    });

    it('should send notification to all educators', async () => {
      const educator2 = await testDb.createTestUser({ 
        role: 'teacher',
        email: 'educator2@test.com'
      });

      await api.loginAsUser(testAdmin.email);

      const response = await api.post('/api/notifications/broadcast', {
        schoolId: testSchool.id,
        targetRole: 'teacher',
        title: 'Staff Meeting',
        message: 'Please attend staff meeting on Friday'
      });

      expect(response.status).toBe(200);
      expect(response.body.sentCount).toBeGreaterThanOrEqual(2);
    });

    it('should not send to users of different role', async () => {
      await api.loginAsUser(testAdmin.email);

      await api.post('/api/notifications/broadcast', {
        schoolId: testSchool.id,
        targetRole: 'teacher',
        title: 'Educators Only',
        message: 'For teachers'
      });

      await api.loginAsUser(testParent.email);
      const response = await api.get('/api/notifications');

      expect(response.status).toBe(200);
      expect(response.body.notifications.some((n: any) => n.title === 'Educators Only')).toBe(false);
    });
  });

  describe('Location-Based Notifications', () => {
    it('should send notification to users at specific location', async () => {
      // Create class at location 1
      const class1 = await testDb.createTestClass(testSchool.id, {
        title: 'Class at Location 1',
        locationId: testLocation1.id
      });

      // Enroll child
      const child = await testDb.createTestChild(testParent.id);
      await testDb.createTestEnrollment(child.id, class1.id);

      await api.loginAsUser(testAdmin.email);

      const response = await api.post('/api/notifications/broadcast', {
        schoolId: testSchool.id,
        locationId: testLocation1.id,
        title: 'Location 1 Announcement',
        message: 'Important info for Location 1'
      });

      expect(response.status).toBe(200);
      expect(response.body.sentCount).toBeGreaterThan(0);
    });

    it('should send to multiple locations', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.post('/api/notifications/broadcast', {
        schoolId: testSchool.id,
        locationIds: [testLocation1.id, testLocation2.id],
        title: 'Multi-Location Notice',
        message: 'Sent to both locations'
      });

      expect(response.status).toBe(200);
      expect(response.body.locationsSent).toContain(testLocation1.id);
      expect(response.body.locationsSent).toContain(testLocation2.id);
    });

    it('should not send to users at excluded locations', async () => {
      const parent2 = await testDb.createTestUser({ 
        role: 'parent',
        email: 'parent2@test.com'
      });

      // Parent 1 child at location 1
      const child1 = await testDb.createTestChild(testParent.id);
      const class1 = await testDb.createTestClass(testSchool.id, {
        locationId: testLocation1.id
      });
      await testDb.createTestEnrollment(child1.id, class1.id);

      // Parent 2 child at location 2
      const child2 = await testDb.createTestChild(parent2.id);
      const class2 = await testDb.createTestClass(testSchool.id, {
        locationId: testLocation2.id
      });
      await testDb.createTestEnrollment(child2.id, class2.id);

      await api.loginAsUser(testAdmin.email);

      // Send only to location 1
      await api.post('/api/notifications/broadcast', {
        schoolId: testSchool.id,
        locationId: testLocation1.id,
        title: 'Location 1 Only',
        message: 'Only for location 1'
      });

      // Check parent 2 (location 2) didn't receive it
      await api.loginAsUser(parent2.email);
      const response = await api.get('/api/notifications');

      expect(response.body.notifications.some((n: any) => n.title === 'Location 1 Only')).toBe(false);
    });
  });

  describe('Broadcast Notifications', () => {
    it('should send notification to entire school', async () => {
      const parent2 = await testDb.createTestUser({ role: 'parent', email: 'p2@test.com' });
      const educator2 = await testDb.createTestUser({ role: 'teacher', email: 'e2@test.com' });

      await api.loginAsUser(testAdmin.email);

      const response = await api.post('/api/notifications/broadcast', {
        schoolId: testSchool.id,
        title: 'School-Wide Announcement',
        message: 'Important news for everyone',
        priority: 'high'
      });

      expect(response.status).toBe(200);
      expect(response.body.sentCount).toBeGreaterThanOrEqual(4); // admin, parent, educator, parent2, educator2
    });

    it('should support scheduled notifications', async () => {
      await api.loginAsUser(testAdmin.email);

      const scheduledDate = new Date();
      scheduledDate.setHours(scheduledDate.getHours() + 2);

      const response = await api.post('/api/notifications/broadcast', {
        schoolId: testSchool.id,
        title: 'Scheduled Notification',
        message: 'This will be sent later',
        scheduledFor: scheduledDate
      });

      expect(response.status).toBe(200);
      expect(response.body.notification.scheduledFor).toBeDefined();
      expect(response.body.notification.status).toBe('scheduled');
    });

    it('should support notification expiration', async () => {
      await api.loginAsUser(testAdmin.email);

      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 7);

      const response = await api.post('/api/notifications', {
        userId: testParent.id,
        schoolId: testSchool.id,
        title: 'Expiring Notification',
        message: 'Valid for 1 week',
        expiresAt: expirationDate
      });

      expect(response.status).toBe(200);
      expect(response.body.notification.expiresAt).toBeDefined();
    });
  });

  describe('Delivery Methods', () => {
    it('should send in-app notification only', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.post('/api/notifications', {
        userId: testParent.id,
        schoolId: testSchool.id,
        title: 'In-App Only',
        message: 'This is in-app only',
        deliveryMethods: ['in-app']
      });

      expect(response.status).toBe(200);
      expect(mockBrevoService.sendTransacEmail).not.toHaveBeenCalled();
      expect(mockTwilioService.messages.create).not.toHaveBeenCalled();
    });

    it('should send email notification', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.post('/api/notifications', {
        userId: testParent.id,
        schoolId: testSchool.id,
        title: 'Email Notification',
        message: 'This will be emailed',
        deliveryMethods: ['in-app', 'email']
      });

      expect(response.status).toBe(200);
      expect(mockBrevoService.sendTransacEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: testParent.email }]
        })
      );
    });

    it('should send SMS notification when phone number exists', async () => {
      const parentWithPhone = await testDb.createTestUser({
        role: 'parent',
        email: 'withphone@test.com',
        phone: '555-1234'
      });

      await api.loginAsUser(testAdmin.email);

      const response = await api.post('/api/notifications', {
        userId: parentWithPhone.id,
        schoolId: testSchool.id,
        title: 'SMS Test',
        message: 'This will be sent via SMS',
        deliveryMethods: ['in-app', 'sms']
      });

      expect(response.status).toBe(200);
      expect(mockTwilioService.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '555-1234',
          body: expect.stringContaining('SMS Test')
        })
      );
    });

    it('should send via all delivery methods', async () => {
      const parentWithPhone = await testDb.createTestUser({
        role: 'parent',
        email: 'all@test.com',
        phone: '555-9999'
      });

      await api.loginAsUser(testAdmin.email);

      const response = await api.post('/api/notifications', {
        userId: parentWithPhone.id,
        schoolId: testSchool.id,
        title: 'All Methods',
        message: 'Sent via all channels',
        deliveryMethods: ['in-app', 'email', 'sms']
      });

      expect(response.status).toBe(200);
      expect(mockBrevoService.sendTransacEmail).toHaveBeenCalled();
      expect(mockTwilioService.messages.create).toHaveBeenCalled();
    });
  });

  describe('Real-Time WebSocket Delivery', () => {
    it('should deliver notification via WebSocket to online user', async () => {
      // Mock WebSocket connection for parent
      const mockSocket = mockWebSocketService.mockConnection(testParent.id);

      await api.loginAsUser(testAdmin.email);

      await api.post('/api/notifications', {
        userId: testParent.id,
        schoolId: testSchool.id,
        title: 'Real-Time Test',
        message: 'Should appear instantly'
      });

      expect(mockWebSocketService.sendToUser).toHaveBeenCalledWith(
        testParent.id,
        expect.objectContaining({
          type: 'notification',
          data: expect.objectContaining({
            title: 'Real-Time Test'
          })
        })
      );
    });

    it('should deliver broadcast via WebSocket to all connected users', async () => {
      mockWebSocketService.mockConnection(testParent.id);
      mockWebSocketService.mockConnection(testEducator.id);

      await api.loginAsUser(testAdmin.email);

      await api.post('/api/notifications/broadcast', {
        schoolId: testSchool.id,
        title: 'Broadcast Test',
        message: 'Everyone should see this'
      });

      expect(mockWebSocketService.broadcast).toHaveBeenCalled();
    });

    it('should queue notifications for offline users', async () => {
      // Don't create WebSocket connection
      await api.loginAsUser(testAdmin.email);

      const response = await api.post('/api/notifications', {
        userId: testParent.id,
        schoolId: testSchool.id,
        title: 'Offline Test',
        message: 'User is offline'
      });

      expect(response.status).toBe(200);
      expect(response.body.notification.deliveryStatus).toBe('queued');
    });
  });

  describe('Notification Center Operations', () => {
    beforeEach(async () => {
      await api.loginAsUser(testAdmin.email);

      // Create multiple notifications
      for (let i = 1; i <= 5; i++) {
        await api.post('/api/notifications', {
          userId: testParent.id,
          schoolId: testSchool.id,
          title: `Notification ${i}`,
          message: `Message ${i}`,
          type: i % 2 === 0 ? 'info' : 'warning'
        });
      }
    });

    it('should retrieve unread notifications count', async () => {
      await api.loginAsUser(testParent.email);

      const response = await api.get('/api/notifications/unread-count');

      expect(response.status).toBe(200);
      expect(response.body.count).toBeGreaterThanOrEqual(5);
    });

    it('should filter notifications by type', async () => {
      await api.loginAsUser(testParent.email);

      const response = await api.get('/api/notifications', {
        type: 'warning'
      });

      expect(response.status).toBe(200);
      expect(response.body.notifications.every((n: any) => n.type === 'warning')).toBe(true);
    });

    it('should paginate notifications', async () => {
      await api.loginAsUser(testParent.email);

      const page1 = await api.get('/api/notifications', {
        page: 1,
        limit: 3
      });

      expect(page1.status).toBe(200);
      expect(page1.body.notifications.length).toBeLessThanOrEqual(3);
      expect(page1.body.pagination.total).toBeGreaterThanOrEqual(5);

      const page2 = await api.get('/api/notifications', {
        page: 2,
        limit: 3
      });

      expect(page2.status).toBe(200);
      expect(page2.body.notifications[0].id).not.toBe(page1.body.notifications[0].id);
    });

    it('should mark all notifications as read', async () => {
      await api.loginAsUser(testParent.email);

      const response = await api.post('/api/notifications/mark-all-read');

      expect(response.status).toBe(200);

      const checkResponse = await api.get('/api/notifications/unread-count');
      expect(checkResponse.body.count).toBe(0);
    });

    it('should delete all read notifications', async () => {
      await api.loginAsUser(testParent.email);

      await api.post('/api/notifications/mark-all-read');

      const deleteResponse = await api.delete('/api/notifications/read');

      expect(deleteResponse.status).toBe(200);

      const getResponse = await api.get('/api/notifications');
      expect(getResponse.body.notifications.length).toBe(0);
    });
  });

  describe('Notification Preferences', () => {
    it('should allow user to set notification preferences', async () => {
      await api.loginAsUser(testParent.email);

      const preferences = {
        emailNotifications: true,
        smsNotifications: false,
        inAppNotifications: true,
        notifyOnEnrollment: true,
        notifyOnPayment: true,
        notifyOnDailyFlow: false
      };

      const response = await api.patch('/api/user/notification-preferences', preferences);

      expect(response.status).toBe(200);
      expect(response.body.preferences.emailNotifications).toBe(true);
      expect(response.body.preferences.smsNotifications).toBe(false);
    });

    it('should respect user preferences when sending notifications', async () => {
      await api.loginAsUser(testParent.email);

      await api.patch('/api/user/notification-preferences', {
        emailNotifications: false
      });

      await api.loginAsUser(testAdmin.email);

      await api.post('/api/notifications', {
        userId: testParent.id,
        schoolId: testSchool.id,
        title: 'Test',
        message: 'Test',
        deliveryMethods: ['in-app', 'email']
      });

      // Email should not be sent due to user preferences
      expect(mockBrevoService.sendTransacEmail).not.toHaveBeenCalled();
    });
  });

  describe('Notification Templates', () => {
    it('should use template for enrollment confirmation', async () => {
      const child = await testDb.createTestChild(testParent.id);
      const classRecord = await testDb.createTestClass(testSchool.id, {
        title: 'Music Class'
      });

      await api.loginAsUser(testParent.email);

      const response = await api.post('/api/enrollments', {
        childId: child.id,
        classId: classRecord.id
      });

      expect(response.status).toBe(200);

      // Check that enrollment confirmation notification was sent
      await api.loginAsUser(testParent.email);
      const notifications = await api.get('/api/notifications');

      expect(notifications.body.notifications.some((n: any) => 
        n.type === 'enrollment_confirmation' && n.message.includes('Music Class')
      )).toBe(true);
    });

    it('should use template for payment confirmation', async () => {
      await api.loginAsUser(testAdmin.email);

      const response = await api.post('/api/notifications/send-payment-confirmation', {
        userId: testParent.id,
        amount: 5000,
        className: 'Art Class'
      });

      expect(response.status).toBe(200);
      expect(mockBrevoService.sendTransacEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: expect.any(Number)
        })
      );
    });
  });
});
