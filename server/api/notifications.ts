import express from "express";
import { z } from "zod";
import { insertNotificationSchema } from "@shared/schema";
import { storage } from '../storage.js';
import { sendSMS, isTwilioConfigured } from '../services/twilio.js';
import * as brevo from '@getbrevo/brevo';

const router = express.Router();

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

router.get("/", async (req, res) => {
  try {
    let userId = req.query.userId ? parseInt(req.query.userId as string) : null;
    const role = req.query.role as string;
    
    if (!userId) {
      const email = (req as any).auth?.email;
      
      if (email) {
        console.log('📬 GET /api/notifications - Authenticated user email:', email);
        
        const user = await storage.getUserByEmail(email);
        
        if (!user) {
          console.warn(`⚠️ No user found for email: ${email}`);
          return res.json([]);
        }
        
        console.log('👤 User found:', { id: user.id, email: user.email });
        userId = user.id;
      } else {
        const allNotifications = await storage.getAllNotifications();
        return res.json(allNotifications);
      }
    }
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Valid user ID required" });
    }

    const notifications = await storage.getNotificationsByUserId(userId, role);
    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

router.post("/send-individual", async (req, res) => {
  try {
    const { userIds, subject, content, type = "both", priority = "normal", scheduledFor } = req.body;
    const senderId = req.body.senderId || 1;

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

    const notification = await storage.createNotification(notificationData);
    
    await processNotification(notification);

    res.status(201).json(notification);
  } catch (error) {
    console.error("Error sending individual notification:", error);
    res.status(500).json({ message: "Failed to send notification" });
  }
});

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

    const notification = await storage.createNotification(notificationData);
    await processNotification(notification);

    res.status(201).json(notification);
  } catch (error) {
    console.error("Error sending role-based notification:", error);
    res.status(500).json({ message: "Failed to send notification" });
  }
});

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

    const notification = await storage.createNotification(notificationData);
    await processNotification(notification);

    res.status(201).json(notification);
  } catch (error) {
    console.error("Error sending location-based notification:", error);
    res.status(500).json({ message: "Failed to send notification" });
  }
});

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

    const notification = await storage.createNotification(notificationData);
    await processNotification(notification);

    res.status(201).json(notification);
  } catch (error) {
    console.error("Error sending broadcast notification:", error);
    res.status(500).json({ message: "Failed to send notification" });
  }
});

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

router.post("/:id/read", async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    const email = (req as any).auth?.payload?.email;
    
    if (isNaN(notificationId)) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }
    
    if (!email) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const user = await storage.getUserByEmail(email);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await markNotificationAsRead(notificationId, user.id);
    res.json({ message: "Notification marked as read" });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ message: "Failed to mark notification as read" });
  }
});

router.post("/mark-all-read", async (req, res) => {
  try {
    const email = (req as any).auth?.payload?.email;
    
    if (!email) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const user = await storage.getUserByEmail(email);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await markAllNotificationsAsRead(user.id);
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ message: "Failed to mark all notifications as read" });
  }
});

async function processNotification(notification: any): Promise<void> {
  try {
    const recipients = await resolveNotificationRecipients(notification);
    
    const recipientRecords = [];
    
    for (const recipientId of recipients) {
      if (notification.type === "email" || notification.type === "both" || notification.type === "all") {
        const recipient = await storage.createNotificationRecipient({
          notificationId: notification.id,
          recipientId,
          deliveryType: "email" as const,
          status: "pending" as const,
        });
        recipientRecords.push(recipient);
      }
      
      if (notification.type === "in_app" || notification.type === "both" || notification.type === "all") {
        const recipient = await storage.createNotificationRecipient({
          notificationId: notification.id,
          recipientId,
          deliveryType: "in_app" as const,
          status: "delivered" as const,
          deliveredAt: new Date(),
        });
        recipientRecords.push(recipient);
      }
      
      if (notification.type === "sms" || notification.type === "all") {
        const recipient = await storage.createNotificationRecipient({
          notificationId: notification.id,
          recipientId,
          deliveryType: "sms" as const,
          status: "pending" as const,
        });
        recipientRecords.push(recipient);
      }
    }
    
    await storage.updateNotification(notification.id, {
      status: "sent",
      deliveryStats: {
        totalRecipients: recipients.length,
        emailRecipients: recipientRecords.filter(r => r.deliveryType === "email").length,
        inAppRecipients: recipientRecords.filter(r => r.deliveryType === "in_app").length,
        smsRecipients: recipientRecords.filter(r => r.deliveryType === "sms").length,
      },
      sentAt: new Date(),
    } as any);
    
    if (notification.type === "email" || notification.type === "both" || notification.type === "all") {
      await sendNotificationEmails(notification, recipients);
    }
    
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
    await storage.updateNotification(notification.id, {
      status: "failed",
    });
  }
}

async function resolveNotificationRecipients(notification: any): Promise<number[]> {
  let recipients: number[] = [];
  
  switch (notification.targetType) {
    case "individual":
      recipients = notification.targetData.userIds || [];
      break;
      
    case "role":
      const allUsers = await storage.getAllUsers();
      let roleUsers = allUsers.filter(u => 
        notification.targetData.roles?.includes(u.role)
      );
      
      if (notification.targetData.locationIds && notification.targetData.locationIds.length > 0) {
        const locationUserIds: number[] = [];
        for (const locationId of notification.targetData.locationIds) {
          const userLocations = await storage.getUserLocationsByLocationId(locationId);
          locationUserIds.push(...userLocations.map(ul => ul.userId));
        }
        roleUsers = roleUsers.filter(u => locationUserIds.includes(u.id));
      }
      
      recipients = roleUsers.map(u => u.id);
      break;
      
    case "location":
      const locationUserIds: number[] = [];
      for (const locationId of notification.targetData.locationIds || []) {
        const userLocations = await storage.getUserLocationsByLocationId(locationId);
        locationUserIds.push(...userLocations.map(ul => ul.userId));
      }
      
      let locationUsers = await storage.getAllUsers();
      locationUsers = locationUsers.filter(u => locationUserIds.includes(u.id));
      
      if (notification.targetData.roles && notification.targetData.roles.length > 0) {
        locationUsers = locationUsers.filter(u => notification.targetData.roles.includes(u.role));
      }
      
      recipients = locationUsers.map(u => u.id);
      break;
      
    case "all":
      const users = await storage.getAllUsers();
      recipients = users.map(u => u.id);
      break;
  }
  
  return [...new Set(recipients)].filter(id => id && id > 0);
}

async function sendNotificationEmails(notification: any, recipientIds: number[]): Promise<void> {
  console.log(`📧 Sending notification emails for: ${notification.subject} to ${recipientIds.length} recipients`);
  
  const brevoApiKey = process.env.BREVO_API_KEY;
  if (!brevoApiKey) {
    console.log('⚠️ Brevo API key not configured, skipping email delivery');
    return;
  }
  
  const brevoApiInstance = new brevo.TransactionalEmailsApi();
  brevoApiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
  
  for (const recipientId of recipientIds) {
    const user = await storage.getUser(recipientId);
    if (!user || !user.email) {
      console.log(`⚠️ No email for user ${recipientId}, skipping email`);
      continue;
    }
    
    try {
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
      sendSmtpEmail.to = [{ email: user.email, name: user.name || user.email }];
      
      await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
      
      const recipients = await storage.getNotificationRecipientsByNotificationId(notification.id);
      const recipientRecord = recipients.find(
        r => r.recipientId === recipientId && r.deliveryType === "email"
      );
      if (recipientRecord) {
        await storage.updateNotificationRecipient(recipientRecord.id, {
          status: "sent",
          sentAt: new Date(),
        });
      }
      
      console.log(`✅ Email sent to ${user.email} for notification: ${notification.subject}`);
    } catch (error) {
      console.error(`❌ Failed to send email to user ${recipientId}:`, error);
      
      const recipients = await storage.getNotificationRecipientsByNotificationId(notification.id);
      const recipientRecord = recipients.find(
        r => r.recipientId === recipientId && r.deliveryType === "email"
      );
      if (recipientRecord) {
        await storage.updateNotificationRecipient(recipientRecord.id, {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }
}

async function sendNotificationSMS(notification: any, recipientIds: number[]): Promise<void> {
  for (const recipientId of recipientIds) {
    const user = await storage.getUser(recipientId);
    if (!user || !user.phone) {
      console.log(`⚠️ No phone number for user ${recipientId}, skipping SMS`);
      continue;
    }
    
    try {
      const smsMessage = `${notification.subject}\n\n${notification.content}`;
      await sendSMS(user.phone, smsMessage);
      
      const recipients = await storage.getNotificationRecipientsByNotificationId(notification.id);
      const recipientRecord = recipients.find(
        r => r.recipientId === recipientId && r.deliveryType === "sms"
      );
      if (recipientRecord) {
        await storage.updateNotificationRecipient(recipientRecord.id, {
          status: "sent",
          sentAt: new Date(),
        });
      }
      
      console.log(`📱 SMS sent to ${user.phone} for notification: ${notification.subject}`);
    } catch (error) {
      console.error(`❌ Failed to send SMS to user ${recipientId}:`, error);
      
      const recipients = await storage.getNotificationRecipientsByNotificationId(notification.id);
      const recipientRecord = recipients.find(
        r => r.recipientId === recipientId && r.deliveryType === "sms"
      );
      if (recipientRecord) {
        await storage.updateNotificationRecipient(recipientRecord.id, {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }
}

async function getNotificationStats(notificationId: number): Promise<any> {
  const notification = await storage.getNotificationById(notificationId);
  if (!notification) {
    return null;
  }
  
  const notificationRecipients = await storage.getNotificationRecipientsByNotificationId(notificationId);
  
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
  const recipients = await storage.getNotificationRecipientsByNotificationId(notificationId);
  const inAppRecipient = recipients.find(r => r.recipientId === userId && r.deliveryType === "in_app");
  
  if (inAppRecipient) {
    await storage.updateNotificationRecipient(inAppRecipient.id, {
      status: "read",
      readAt: new Date(),
    });
  }
}

async function markAllNotificationsAsRead(userId: number): Promise<void> {
  const recipients = await storage.getNotificationRecipientsByUserId(userId);
  const now = new Date();
  
  for (const recipient of recipients) {
    if (recipient.status !== "read") {
      await storage.updateNotificationRecipient(recipient.id, {
        status: "read",
        readAt: now,
      });
    }
  }
}

export default router;
