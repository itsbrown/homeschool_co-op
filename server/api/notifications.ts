import express from "express";
import { z } from "zod";
import { insertNotificationSchema } from "@shared/schema";
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Enhanced notification target schema
const notificationTargetSchema = z.object({
  type: z.enum(["individual", "role", "location", "all"]),
  recipients: z.object({
    userIds: z.array(z.number()).optional(),
    roles: z.array(z.string()).optional(),
    locationIds: z.array(z.number()).optional(),
    includeAllLocations: z.boolean().optional(),
  }),
});

const enhancedNotificationSchema = insertNotificationSchema.extend({
  targetType: z.enum(["individual", "role", "location", "all"]),
  targetData: notificationTargetSchema.shape.recipients,
});

// Get notifications for a user/admin
router.get("/", async (req, res) => {
  try {
    const userId = parseInt(req.query.userId as string);
    const role = req.query.role as string;
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Valid user ID required" });
    }

    const notifications = await getUserNotifications(userId, role);
    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

// Send notification to individual user(s)
router.post("/send-individual", async (req, res) => {
  try {
    const { userIds, subject, content, type = "both", priority = "normal", scheduledFor } = req.body;
    const senderId = req.body.senderId || 1; // Default to admin user

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "User IDs are required" });
    }

    const notificationData = {
      senderId,
      type,
      priority,
      subject,
      content,
      targetType: "individual" as const,
      targetData: { userIds },
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    };

    const notification = await createNotification(notificationData);
    
    // Process the notification (send emails, etc.)
    await processNotification(notification);

    res.status(201).json(notification);
  } catch (error) {
    console.error("Error sending individual notification:", error);
    res.status(500).json({ message: "Failed to send notification" });
  }
});

// Send notification by role at specific location(s)
router.post("/send-by-role", async (req, res) => {
  try {
    const { roles, locationIds, subject, content, type = "both", priority = "normal", scheduledFor } = req.body;
    const senderId = req.body.senderId || 1;

    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ message: "Roles are required" });
    }

    const notificationData = {
      senderId,
      type,
      priority,
      subject,
      content,
      targetType: "role" as const,
      targetData: { roles, locationIds },
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    };

    const notification = await createNotification(notificationData);
    await processNotification(notification);

    res.status(201).json(notification);
  } catch (error) {
    console.error("Error sending role-based notification:", error);
    res.status(500).json({ message: "Failed to send notification" });
  }
});

// Send notification to entire location(s)
router.post("/send-by-location", async (req, res) => {
  try {
    const { locationIds, includeRoles, subject, content, type = "both", priority = "normal", scheduledFor } = req.body;
    const senderId = req.body.senderId || 1;

    if (!locationIds || !Array.isArray(locationIds) || locationIds.length === 0) {
      return res.status(400).json({ message: "Location IDs are required" });
    }

    const notificationData = {
      senderId,
      type,
      priority,
      subject,
      content,
      targetType: "location" as const,
      targetData: { locationIds, roles: includeRoles },
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    };

    const notification = await createNotification(notificationData);
    await processNotification(notification);

    res.status(201).json(notification);
  } catch (error) {
    console.error("Error sending location-based notification:", error);
    res.status(500).json({ message: "Failed to send notification" });
  }
});

// Send notification to all users
router.post("/send-all", async (req, res) => {
  try {
    const { subject, content, type = "both", priority = "normal", scheduledFor } = req.body;
    const senderId = req.body.senderId || 1;

    const notificationData = {
      senderId,
      type,
      priority,
      subject,
      content,
      targetType: "all" as const,
      targetData: {},
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    };

    const notification = await createNotification(notificationData);
    await processNotification(notification);

    res.status(201).json(notification);
  } catch (error) {
    console.error("Error sending broadcast notification:", error);
    res.status(500).json({ message: "Failed to send notification" });
  }
});

// Get notification delivery stats
router.get("/:id/stats", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }

    const stats = await getNotificationStats(id);
    if (!stats) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json(stats);
  } catch (error) {
    console.error("Error fetching notification stats:", error);
    res.status(500).json({ message: "Failed to fetch notification stats" });
  }
});

// Mark notification as read
router.post("/:id/read", async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    const userId = parseInt(req.body.userId);
    
    if (isNaN(notificationId) || isNaN(userId)) {
      return res.status(400).json({ message: "Invalid notification ID or user ID" });
    }

    await markNotificationAsRead(notificationId, userId);
    res.json({ message: "Notification marked as read" });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ message: "Failed to mark notification as read" });
  }
});

// Mark all notifications as read for a user
router.post("/mark-all-read", async (req, res) => {
  try {
    const userId = parseInt(req.body.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    await markAllNotificationsAsRead(userId);
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ message: "Failed to mark all notifications as read" });
  }
});

// **FILE-BASED STORAGE IMPLEMENTATION**

const DATA_DIR = path.join(process.cwd(), 'data');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');
const NOTIFICATION_RECIPIENTS_FILE = path.join(DATA_DIR, 'notification-recipients.json');
const STAFF_FILE = path.join(DATA_DIR, 'staff.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const USER_LOCATIONS_FILE = path.join(DATA_DIR, 'user-locations.json');

interface NotificationData {
  id: number;
  senderId: number;
  type: "email" | "in_app" | "both";
  priority: "low" | "normal" | "high" | "urgent";
  subject: string;
  content: string;
  targetType: "individual" | "role" | "location" | "all";
  targetData: any;
  scheduledFor?: string;
  sentAt?: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  deliveryStats: any;
  createdAt: string;
  updatedAt: string;
}

interface NotificationRecipientData {
  id: number;
  notificationId: number;
  recipientId: number;
  deliveryType: "email" | "in_app";
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  errorMessage?: string;
  createdAt: string;
}

let notificationIdCounter = 1;
let recipientIdCounter = 1;

function loadNotifications(): NotificationData[] {
  if (!fs.existsSync(NOTIFICATIONS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(NOTIFICATIONS_FILE, 'utf8');
    const notifications = JSON.parse(data);
    if (notifications.length > 0) {
      notificationIdCounter = Math.max(...notifications.map((n: any) => n.id)) + 1;
    }
    return notifications;
  } catch (error) {
    console.error('Error loading notifications:', error);
    return [];
  }
}

function saveNotifications(notifications: NotificationData[]): void {
  try {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
  } catch (error) {
    console.error('Error saving notifications:', error);
  }
}

function loadNotificationRecipients(): NotificationRecipientData[] {
  if (!fs.existsSync(NOTIFICATION_RECIPIENTS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(NOTIFICATION_RECIPIENTS_FILE, 'utf8');
    const recipients = JSON.parse(data);
    if (recipients.length > 0) {
      recipientIdCounter = Math.max(...recipients.map((r: any) => r.id)) + 1;
    }
    return recipients;
  } catch (error) {
    console.error('Error loading notification recipients:', error);
    return [];
  }
}

function saveNotificationRecipients(recipients: NotificationRecipientData[]): void {
  try {
    fs.writeFileSync(NOTIFICATION_RECIPIENTS_FILE, JSON.stringify(recipients, null, 2));
  } catch (error) {
    console.error('Error saving notification recipients:', error);
  }
}

function loadStaff(): any[] {
  if (!fs.existsSync(STAFF_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(STAFF_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading staff:', error);
    return [];
  }
}

function loadUsers(): any[] {
  if (!fs.existsSync(USERS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading users:', error);
    return [];
  }
}

function loadUserLocations(): any[] {
  if (!fs.existsSync(USER_LOCATIONS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(USER_LOCATIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading user locations:', error);
    return [];
  }
}

async function getUserNotifications(userId: number, role: string): Promise<any[]> {
  const notifications = loadNotifications();
  const recipients = loadNotificationRecipients();
  
  // Get notifications where user is a recipient or is the sender (if admin)
  const userRecipients = recipients.filter(r => r.recipientId === userId);
  const userNotificationIds = userRecipients.map(r => r.notificationId);
  
  let userNotifications = notifications.filter(n => 
    userNotificationIds.includes(n.id) || (role === 'school_admin' && n.senderId === userId)
  );
  
  // Add recipient info to notifications
  return userNotifications.map(notification => {
    const recipientInfo = userRecipients.find(r => r.notificationId === notification.id);
    return {
      ...notification,
      recipientStatus: recipientInfo?.status,
      readAt: recipientInfo?.readAt,
    };
  });
}

async function createNotification(notificationData: any): Promise<NotificationData> {
  const notifications = loadNotifications();
  
  const newNotification: NotificationData = {
    id: notificationIdCounter++,
    ...notificationData,
    status: notificationData.scheduledFor ? "scheduled" : "draft",
    deliveryStats: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  notifications.push(newNotification);
  saveNotifications(notifications);
  
  return newNotification;
}

async function processNotification(notification: NotificationData): Promise<void> {
  try {
    const recipients = await resolveNotificationRecipients(notification);
    
    // Create recipient records
    const recipientRecords = [];
    const existingRecipients = loadNotificationRecipients();
    
    for (const recipientId of recipients) {
      if (notification.type === "email" || notification.type === "both") {
        recipientRecords.push({
          id: recipientIdCounter++,
          notificationId: notification.id,
          recipientId,
          deliveryType: "email" as const,
          status: "pending" as const,
          createdAt: new Date().toISOString(),
        });
      }
      
      if (notification.type === "in_app" || notification.type === "both") {
        recipientRecords.push({
          id: recipientIdCounter++,
          notificationId: notification.id,
          recipientId,
          deliveryType: "in_app" as const,
          status: "delivered" as const, // In-app notifications are immediately "delivered"
          deliveredAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
      }
    }
    
    existingRecipients.push(...recipientRecords);
    saveNotificationRecipients(existingRecipients);
    
    // Update notification status
    const notifications = loadNotifications();
    const notificationIndex = notifications.findIndex(n => n.id === notification.id);
    if (notificationIndex !== -1) {
      notifications[notificationIndex].status = "sent";
      notifications[notificationIndex].sentAt = new Date().toISOString();
      notifications[notificationIndex].deliveryStats = {
        totalRecipients: recipients.length,
        emailRecipients: recipientRecords.filter(r => r.deliveryType === "email").length,
        inAppRecipients: recipientRecords.filter(r => r.deliveryType === "in_app").length,
      };
      saveNotifications(notifications);
    }
    
    // Send emails using Brevo (simplified for now)
    if (notification.type === "email" || notification.type === "both") {
      await sendNotificationEmails(notification, recipients);
    }
    
  } catch (error) {
    console.error("Error processing notification:", error);
    // Update notification status to failed
    const notifications = loadNotifications();
    const notificationIndex = notifications.findIndex(n => n.id === notification.id);
    if (notificationIndex !== -1) {
      notifications[notificationIndex].status = "failed";
      saveNotifications(notifications);
    }
  }
}

async function resolveNotificationRecipients(notification: NotificationData): Promise<number[]> {
  const users = loadUsers();
  const userLocations = loadUserLocations();
  let recipients: number[] = [];
  
  switch (notification.targetType) {
    case "individual":
      // Direct user IDs
      recipients = notification.targetData.userIds || [];
      break;
      
    case "role":
      // Filter users by role
      let roleUsers = users.filter(u => 
        notification.targetData.roles?.includes(u.role)
      );
      
      // If locationIds specified, further filter by location
      if (notification.targetData.locationIds && notification.targetData.locationIds.length > 0) {
        const locationUserIds = userLocations
          .filter(ul => notification.targetData.locationIds.includes(ul.locationId))
          .map(ul => ul.userId);
        roleUsers = roleUsers.filter(u => locationUserIds.includes(u.id));
      }
      
      recipients = roleUsers.map(u => u.id);
      break;
      
    case "location":
      // Get users at specific locations
      const locationUserIds = userLocations
        .filter(ul => notification.targetData.locationIds?.includes(ul.locationId))
        .map(ul => ul.userId);
      
      let locationUsers = users.filter(u => locationUserIds.includes(u.id));
      
      // If roles specified, further filter by role
      if (notification.targetData.roles && notification.targetData.roles.length > 0) {
        locationUsers = locationUsers.filter(u => notification.targetData.roles.includes(u.role));
      }
      
      recipients = locationUsers.map(u => u.id);
      break;
      
    case "all":
      // All users
      recipients = users.map(u => u.id);
      break;
  }
  
  // Remove duplicates and filter out invalid IDs
  return [...new Set(recipients)].filter(id => id && id > 0);
}

async function sendNotificationEmails(notification: NotificationData, recipientIds: number[]): Promise<void> {
  // This would integrate with your existing Brevo email service
  console.log(`📧 Sending notification emails for: ${notification.subject} to ${recipientIds.length} recipients`);
  
  // For now, just log the email sending
  // In a real implementation, you'd integrate with the existing Brevo service
  // from server/api/school-admin.ts or server/lib/emailService.ts
}

async function getNotificationStats(notificationId: number): Promise<any> {
  const notifications = loadNotifications();
  const recipients = loadNotificationRecipients();
  
  const notification = notifications.find(n => n.id === notificationId);
  if (!notification) {
    return null;
  }
  
  const notificationRecipients = recipients.filter(r => r.notificationId === notificationId);
  
  const stats = {
    id: notification.id,
    subject: notification.subject,
    status: notification.status,
    sentAt: notification.sentAt,
    totalRecipients: notificationRecipients.length,
    emailsSent: notificationRecipients.filter(r => r.deliveryType === "email" && r.status !== "failed").length,
    emailsDelivered: notificationRecipients.filter(r => r.deliveryType === "email" && r.status === "delivered").length,
    emailsFailed: notificationRecipients.filter(r => r.deliveryType === "email" && r.status === "failed").length,
    inAppDelivered: notificationRecipients.filter(r => r.deliveryType === "in_app" && r.status === "delivered").length,
    totalRead: notificationRecipients.filter(r => r.status === "read").length,
  };
  
  return stats;
}

async function markNotificationAsRead(notificationId: number, userId: number): Promise<void> {
  const recipients = loadNotificationRecipients();
  const recipientIndex = recipients.findIndex(r => 
    r.notificationId === notificationId && r.recipientId === userId
  );
  
  if (recipientIndex !== -1) {
    recipients[recipientIndex].status = "read";
    recipients[recipientIndex].readAt = new Date().toISOString();
    saveNotificationRecipients(recipients);
  }
}

async function markAllNotificationsAsRead(userId: number): Promise<void> {
  const recipients = loadNotificationRecipients();
  const now = new Date().toISOString();
  
  recipients.forEach(recipient => {
    if (recipient.recipientId === userId && recipient.status !== "read") {
      recipient.status = "read";
      recipient.readAt = now;
    }
  });
  
  saveNotificationRecipients(recipients);
}

export default router;