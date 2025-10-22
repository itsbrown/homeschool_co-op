import express from "express";
import { z } from "zod";
import { insertNotificationSchema } from "@shared/schema";
import fs from 'fs';
import path from 'path';
import { sendSMS, isTwilioConfigured } from '../services/twilio.js';
import * as brevo from '@getbrevo/brevo';

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
    const userId = req.query.userId ? parseInt(req.query.userId as string) : null;
    const role = req.query.role as string;
    
    // If no userId provided, return all notifications (for admin view)
    if (!userId) {
      const allNotifications = loadNotifications();
      return res.json(allNotifications);
    }
    
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
  type: "email" | "in_app" | "sms" | "both" | "all";
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
  deliveryType: "email" | "in_app" | "sms";
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
      // Handle email delivery
      if (notification.type === "email" || notification.type === "both" || notification.type === "all") {
        recipientRecords.push({
          id: recipientIdCounter++,
          notificationId: notification.id,
          recipientId,
          deliveryType: "email" as const,
          status: "pending" as const,
          createdAt: new Date().toISOString(),
        });
      }
      
      // Handle in-app delivery
      if (notification.type === "in_app" || notification.type === "both" || notification.type === "all") {
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
      
      // Handle SMS delivery
      if (notification.type === "sms" || notification.type === "all") {
        recipientRecords.push({
          id: recipientIdCounter++,
          notificationId: notification.id,
          recipientId,
          deliveryType: "sms" as const,
          status: "pending" as const,
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
        smsRecipients: recipientRecords.filter(r => r.deliveryType === "sms").length,
      };
      saveNotifications(notifications);
    }
    
    // Send emails using Brevo
    if (notification.type === "email" || notification.type === "both" || notification.type === "all") {
      await sendNotificationEmails(notification, recipients);
    }
    
    // Send SMS using Twilio (if configured)
    if (notification.type === "sms" || notification.type === "all") {
      const twilioConfigured = await isTwilioConfigured();
      if (twilioConfigured) {
        await sendNotificationSMS(notification, recipients);
      } else {
        console.log('⚠️ Twilio not configured. Skipping SMS delivery for notification:', notification.id);
      }
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
  console.log(`📧 Sending notification emails for: ${notification.subject} to ${recipientIds.length} recipients`);
  
  // Initialize Brevo API
  const brevoApiKey = process.env.BREVO_API_KEY;
  if (!brevoApiKey) {
    console.log('⚠️ Brevo API key not configured, skipping email delivery');
    return;
  }
  
  const brevoApiInstance = new brevo.TransactionalEmailsApi();
  brevoApiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
  
  const users = loadUsers();
  const recipientRecords = loadNotificationRecipients();
  
  for (const recipientId of recipientIds) {
    const user = users.find(u => u.id === recipientId);
    if (!user || !user.email) {
      console.log(`⚠️ No email for user ${recipientId}, skipping email`);
      continue;
    }
    
    try {
      // Create HTML email content
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4F46E5; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0;">${notification.subject}</h1>
            <p style="color: #E0E7FF; margin: 8px 0 0 0;">American Seekers Academy</p>
          </div>
          <div style="padding: 24px;">
            <div style="color: #1F2937; line-height: 1.6;">
              ${notification.content.replace(/\n/g, '<br>')}
            </div>
          </div>
          <div style="background-color: #F3F4F6; padding: 16px; text-align: center; font-size: 12px; color: #6B7280;">
            <p style="margin: 0;">American Seekers Academy - Building Tomorrow's Leaders</p>
          </div>
        </div>
      `;
      
      const sendSmtpEmail = new brevo.SendSmtpEmail();
      sendSmtpEmail.subject = notification.subject;
      sendSmtpEmail.htmlContent = htmlContent;
      sendSmtpEmail.sender = { 
        name: "American Seekers Academy", 
        email: "noreply@americanseekersacademy.com" 
      };
      sendSmtpEmail.to = [{ email: user.email, name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email }];
      
      await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
      
      // Update recipient status to sent
      const recipientIndex = recipientRecords.findIndex(
        r => r.notificationId === notification.id && r.recipientId === recipientId && r.deliveryType === "email"
      );
      if (recipientIndex !== -1) {
        recipientRecords[recipientIndex].status = "sent";
        recipientRecords[recipientIndex].sentAt = new Date().toISOString();
        saveNotificationRecipients(recipientRecords);
      }
      
      console.log(`✅ Email sent to ${user.email} for notification: ${notification.subject}`);
    } catch (error) {
      console.error(`❌ Failed to send email to user ${recipientId}:`, error);
      
      // Update recipient status to failed
      const recipientIndex = recipientRecords.findIndex(
        r => r.notificationId === notification.id && r.recipientId === recipientId && r.deliveryType === "email"
      );
      if (recipientIndex !== -1) {
        recipientRecords[recipientIndex].status = "failed";
        recipientRecords[recipientIndex].errorMessage = error instanceof Error ? error.message : 'Unknown error';
        saveNotificationRecipients(recipientRecords);
      }
    }
  }
}

async function sendNotificationSMS(notification: NotificationData, recipientIds: number[]): Promise<void> {
  // Note: Twilio configuration is already checked by the caller
  const users = loadUsers();
  const recipientRecords = loadNotificationRecipients();
  
  for (const recipientId of recipientIds) {
    const user = users.find(u => u.id === recipientId);
    if (!user || !user.phoneNumber) {
      console.log(`⚠️ No phone number for user ${recipientId}, skipping SMS`);
      continue;
    }
    
    try {
      // Send SMS using Twilio
      const smsMessage = `${notification.subject}\n\n${notification.content}`;
      await sendSMS(user.phoneNumber, smsMessage);
      
      // Update recipient status to sent
      const recipientIndex = recipientRecords.findIndex(
        r => r.notificationId === notification.id && r.recipientId === recipientId && r.deliveryType === "sms"
      );
      if (recipientIndex !== -1) {
        recipientRecords[recipientIndex].status = "sent";
        recipientRecords[recipientIndex].sentAt = new Date().toISOString();
        saveNotificationRecipients(recipientRecords);
      }
      
      console.log(`📱 SMS sent to ${user.phoneNumber} for notification: ${notification.subject}`);
    } catch (error) {
      console.error(`❌ Failed to send SMS to user ${recipientId}:`, error);
      
      // Update recipient status to failed
      const recipientIndex = recipientRecords.findIndex(
        r => r.notificationId === notification.id && r.recipientId === recipientId && r.deliveryType === "sms"
      );
      if (recipientIndex !== -1) {
        recipientRecords[recipientIndex].status = "failed";
        recipientRecords[recipientIndex].errorMessage = error instanceof Error ? error.message : 'Unknown error';
        saveNotificationRecipients(recipientRecords);
      }
    }
  }
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
    smsSent: notificationRecipients.filter(r => r.deliveryType === "sms" && r.status === "sent").length,
    smsFailed: notificationRecipients.filter(r => r.deliveryType === "sms" && r.status === "failed").length,
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