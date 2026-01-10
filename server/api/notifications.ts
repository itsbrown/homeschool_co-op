import express from "express";
import { z } from "zod";
import { insertNotificationSchema } from "@shared/schema";
import { storage } from '../storage';
import { sendSMS, isTwilioConfigured } from '../services/twilio';
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
  console.log('🎯 GET /api/notifications - START');
  try {
    const view = req.query.view as string;
    
    // Admin view: return all sent notifications for the admin's school
    if (view === 'sent') {
      console.log('📤 Admin view requested - verifying admin authorization');
      
      // Get user from auth
      const email = (req as any).auth?.payload?.email || (req as any).auth?.email || (req as any).user?.email;
      if (!email) {
        console.log('❌ No email found in auth for admin view');
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        console.log('❌ User not found for admin view');
        return res.status(401).json({ message: "User not found" });
      }
      
      // Verify user has admin role and get their admin school IDs
      const userRoles = await storage.getUserRolesByUserId(user.id);
      const adminRoles = userRoles.filter(r => 
        r.role?.toLowerCase() === 'admin' || 
        r.role?.toLowerCase() === 'school_admin' ||
        r.role?.toLowerCase() === 'schooladmin' ||
        r.role?.toLowerCase() === 'superadmin'
      );
      
      if (adminRoles.length === 0) {
        console.log('❌ User does not have admin role for sent view');
        return res.status(403).json({ message: "Admin role required to view all sent notifications" });
      }
      
      // Check if superadmin (gets all notifications)
      const isSuperAdmin = adminRoles.some(r => r.role?.toLowerCase() === 'superadmin');
      
      // Get all school IDs where user is admin (not from non-admin roles)
      const adminSchoolIds = adminRoles
        .filter(r => r.schoolId)
        .map(r => r.schoolId!);
      
      console.log('📤 Returning sent notifications for admin, school IDs:', adminSchoolIds, 'isSuperAdmin:', isSuperAdmin);
      
      // Get all notifications
      const allNotifications = await storage.getAllNotifications();
      
      // Superadmins see all notifications; regular admins see only their schools
      const scopedNotifications = isSuperAdmin 
        ? allNotifications
        : allNotifications.filter(n => 
            !n.schoolId || // Global notifications (no school)
            adminSchoolIds.includes(n.schoolId) // Notifications from admin's schools
          );
      
      return res.json(scopedNotifications);
    }
    
    let userId = req.query.userId ? parseInt(req.query.userId as string) : null;
    const role = req.query.role as string;
    console.log('📊 userId from query:', userId, 'role:', role);
    
    if (!userId) {
      const email = (req as any).auth?.payload?.email || (req as any).auth?.email;
      console.log('📧 Extracted email:', email);
      
      if (email) {
        console.log('✅ Email found, fetching user...');
        
        const user = await storage.getUserByEmail(email);
        
        if (!user) {
          console.warn(`⚠️ No user found for email: ${email}`);
          return res.json([]);
        }
        
        console.log('👤 User found:', { id: user.id, email: user.email });
        userId = user.id;
      } else {
        // No email and no userId - return empty for safety
        console.log('❌ No user context available');
        return res.json([]);
      }
    }
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Valid user ID required" });
    }

    const notifications = await storage.getNotificationsByUserId(userId, role);
    
    // Enrich each notification with read status for this user
    const enrichedNotifications = await Promise.all(
      notifications.map(async (notification) => {
        const recipients = await storage.getNotificationRecipientsByNotificationId(notification.id);
        const userRecipient = recipients.find(r => r.recipientId === userId && r.deliveryType === "in_app");
        
        return {
          ...notification,
          read: userRecipient?.status === "read",
          readAt: userRecipient?.readAt || null,
        };
      })
    );
    
    // Prevent caching of personalized notification data
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // DEBUG: Log read status for each notification
    console.log('📧 Notification read status:', enrichedNotifications.map(n => ({
      id: n.id,
      subject: n.subject,
      read: n.read
    })));
    
    res.json(enrichedNotifications);
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

// Send notification to parents of students enrolled in specific classes
router.post("/send-by-class", async (req, res) => {
  try {
    const { classIds, subject, content, type = "in_app", priority = "normal", scheduledFor } = req.body;
    const senderId = req.body.senderId || 1;

    if (!classIds || !Array.isArray(classIds) || classIds.length === 0) {
      return res.status(400).json({ message: "Class IDs are required" });
    }

    console.log('[Notifications] Sending class-specific notification to classes:', classIds);

    // Collect all parent user IDs from selected classes
    const parentUserIds = new Set<number>();

    for (const classId of classIds) {
      const enrollments = await storage.getEnrollmentsByClassId(classId);
      const activeEnrollments = enrollments.filter((e: any) => 
        e.status === 'enrolled' || e.status === 'active' || e.status === 'confirmed'
      );

      for (const enrollment of activeEnrollments) {
        if (enrollment.childId) {
          const child = await storage.getChildById(enrollment.childId);
          if (child?.parentEmail) {
            const parentUser = await storage.getUserByEmail(child.parentEmail);
            if (parentUser) {
              parentUserIds.add(parentUser.id);
            }
          }
        }
      }
    }

    if (parentUserIds.size === 0) {
      return res.status(400).json({ message: "No parents found in selected classes" });
    }

    const userIdsArray = Array.from(parentUserIds);
    console.log('[Notifications] Found', userIdsArray.length, 'parent users for class notification');

    // Use "individual" targetType to work with existing pipeline
    const notificationData = {
      senderId,
      type,
      priority,
      subject,
      content,
      targetType: "individual" as const,
      targetData: { userIds: userIdsArray, classIds }, // Include classIds for reference
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    };

    const notification = await storage.createNotification(notificationData);
    
    // Use existing processNotification pipeline
    await processNotification(notification);

    console.log('[Notifications] Class notification created with', userIdsArray.length, 'recipients');

    res.status(201).json({
      ...notification,
      recipientCount: userIdsArray.length
    });
  } catch (error) {
    console.error("Error sending class-specific notification:", error);
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

// PUT /api/notifications/:id - Update a draft notification
router.put("/:id", async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    if (isNaN(notificationId)) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }

    // Get the existing notification
    const existingNotification = await storage.getNotificationById(notificationId);
    if (!existingNotification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Only allow editing draft notifications
    if (existingNotification.status !== "draft") {
      return res.status(400).json({ message: "Can only edit draft notifications" });
    }

    const { subject, content, type, priority, targetType, targetData, sendNow } = req.body;

    // Build update object with only provided fields
    const updateData: any = {};
    if (subject !== undefined) updateData.subject = subject;
    if (content !== undefined) updateData.content = content;
    if (type !== undefined) updateData.type = type;
    if (priority !== undefined) updateData.priority = priority;
    if (targetType !== undefined) updateData.targetType = targetType;
    if (targetData !== undefined) updateData.targetData = targetData;

    // If sendNow is true, validate targeting before processing
    if (sendNow) {
      const finalTargetType = targetType || existingNotification.targetType;
      const finalTargetData = targetData || existingNotification.targetData;
      
      // Validate required targeting data based on target type
      if (finalTargetType === "individual") {
        if (!finalTargetData?.userIds || finalTargetData.userIds.length === 0) {
          return res.status(400).json({ message: "Individual notifications require at least one user" });
        }
      } else if (finalTargetType === "class") {
        if (!finalTargetData?.classIds || finalTargetData.classIds.length === 0) {
          return res.status(400).json({ message: "Class notifications require at least one class" });
        }
      } else if (finalTargetType === "location") {
        if (!finalTargetData?.locationIds || finalTargetData.locationIds.length === 0) {
          return res.status(400).json({ message: "Location notifications require at least one location" });
        }
      } else if (finalTargetType === "role") {
        if (!finalTargetData?.roles || finalTargetData.roles.length === 0) {
          return res.status(400).json({ message: "Role notifications require at least one role" });
        }
      }
      
      updateData.status = "sent";
      updateData.sentAt = new Date();
    }

    const updatedNotification = await storage.updateNotification(notificationId, updateData);
    if (!updatedNotification) {
      return res.status(500).json({ message: "Failed to update notification" });
    }

    // If sending the draft, process it to deliver to recipients
    if (sendNow) {
      await processNotification(updatedNotification);
    }

    res.json(updatedNotification);
  } catch (error) {
    console.error("Error updating notification:", error);
    res.status(500).json({ message: "Failed to update notification" });
  }
});

// DELETE /api/notifications/:id - Delete a draft notification
router.delete("/:id", async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    if (isNaN(notificationId)) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }

    // Get the existing notification
    const existingNotification = await storage.getNotificationById(notificationId);
    if (!existingNotification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Only allow deleting draft notifications
    if (existingNotification.status !== "draft") {
      return res.status(400).json({ message: "Can only delete draft notifications" });
    }

    await storage.deleteNotification(notificationId);
    res.json({ message: "Notification deleted" });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ message: "Failed to delete notification" });
  }
});

export default router;
