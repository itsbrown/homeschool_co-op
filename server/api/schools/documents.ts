import express from 'express';
import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { storage } from '../../storage';
import { supabaseAuth } from '../../middleware/supabase-auth';
import { fileUploadService, DOCUMENT_ALLOWED_MIME_TYPES } from '../../services/fileUploadService';
import { ObjectStorageService } from '../../replit_integrations/object_storage';
import { sendNotificationEmails } from '../notifications';

const router = express.Router();

// Get all documents for a school (admin view)
router.get('/', supabaseAuth, async (req: any, res) => {
  try {
    // SECURITY: Derive schoolId from authenticated user - do not accept from client
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
    }

    const user = await storage.getUser(userId);
    if (!user || !user.schoolId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User is not associated with a school' 
      });
    }

    // Always use server-derived schoolId from authenticated user
    const documents = await storage.getSchoolDocumentsBySchoolId(user.schoolId);
    
    res.json({ 
      success: true, 
      documents 
    });
  } catch (error) {
    console.error('Error fetching school documents:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch documents' 
    });
  }
});

// Get published documents for parents
router.get('/published', supabaseAuth, async (req: any, res) => {
  try {
    // SECURITY: Derive school ID from authenticated user's school
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
    }

    const user = await storage.getUser(userId);
    if (!user || !user.schoolId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User is not associated with a school' 
      });
    }

    // Use user's own school ID, not a query parameter
    const documents = await storage.getPublishedSchoolDocuments(user.schoolId);
    
    res.json({ 
      success: true, 
      documents 
    });
  } catch (error) {
    console.error('Error fetching published documents:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch documents' 
    });
  }
});

// Helper function to resolve notification recipients
async function resolveDocumentNotificationRecipients(
  targeting: any,
  schoolId: number
): Promise<number[]> {
  let recipients: number[] = [];

  switch (targeting.targetType) {
    case 'all_parents':
      // Get all parents from the school
      const allUsers = await storage.getAllUsers();
      recipients = allUsers
        .filter(u => u.role === 'parent' && u.schoolId === schoolId)
        .map(u => u.id);
      console.log(`📧 Resolved ${recipients.length} parents for all_parents targeting (schoolId: ${schoolId})`);
      break;

    case 'class_specific':
      // Get parents of enrolled students in the specified classes
      const classIds = targeting.classIds || [];
      const parentIds = new Set<number>();
      
      for (const classId of classIds) {
        const enrollments = await storage.getEnrollmentsByProgramId(classId);
        for (const enrollment of enrollments) {
          if (enrollment.parentId) {
            parentIds.add(enrollment.parentId);
          }
        }
      }
      
      recipients = Array.from(parentIds);
      console.log(`📧 Resolved ${recipients.length} parents for class_specific targeting (classes: ${classIds.join(', ')})`);
      break;

    case 'individual':
      recipients = targeting.userIds || [];
      console.log(`📧 Resolved ${recipients.length} users for individual targeting`);
      break;

    case 'role':
      const roleUsers = await storage.getAllUsers();
      let filteredUsers = roleUsers.filter(u => 
        targeting.roles?.includes(u.role) && u.schoolId === schoolId
      );
      recipients = filteredUsers.map(u => u.id);
      console.log(`📧 Resolved ${recipients.length} users for role targeting`);
      break;

    case 'location':
      const locationUserIds: number[] = [];
      for (const locationId of targeting.locationIds || []) {
        const userLocations = await storage.getUserLocationsByLocationId(locationId);
        locationUserIds.push(...userLocations.map(ul => ul.userId));
      }
      recipients = [...new Set(locationUserIds)];
      console.log(`📧 Resolved ${recipients.length} users for location targeting`);
      break;

    default:
      console.log('Unknown targeting type, no recipients resolved');
      break;
  }

  return recipients.filter(id => id && id > 0);
}

// Helper function to sanitize filenames — strips characters outside a-z A-Z 0-9 . - _
// Both the basename and the extension are sanitized so no unsafe characters survive.
function sanitizeFilename(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  const ext = lastDot > 0 ? filename.slice(lastDot) : '';
  const base = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  const sanitizedBase = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  const sanitizedExt = ext.replace(/[^a-zA-Z0-9._-]/g, '_');
  return sanitizedBase + sanitizedExt;
}

// Helper: send a single joint notification covering one or more documents.
// Delivers in-app + email. For a single document it also stores the scalar
// `documentId` in targetData for backward compatibility; the `documentIds`
// array is the authoritative link for both single and bulk uploads.
async function sendBulkDocumentNotification(
  documents: any[],
  targeting: any,
  senderId: number,
  schoolId: number
) {
  try {
    if (!documents || documents.length === 0) {
      return null;
    }

    // Resolve recipients first — bail early if there are none
    const recipients = await resolveDocumentNotificationRecipients(targeting, schoolId);
    console.log(`📧 Document notification: ${recipients.length} recipients for ${documents.length} document(s)`);

    if (recipients.length === 0) {
      console.log('⚠️ No recipients resolved — skipping notification record creation');
      return null;
    }

    const documentIds = documents.map((d) => d.id);
    const isSingle = documents.length === 1;

    const notificationSubject = isSingle
      ? `New Document: ${documents[0].title}`
      : `${documents.length} New Documents Published`;
    const notificationContent = isSingle
      ? `A new document "${documents[0].title}" has been published${documents[0].description ? `: ${documents[0].description}` : ''}. You can view it in your documents section.`
      : `${documents.length} new documents have been published:\n${documents.map((d) => `• ${d.title}`).join('\n')}\n\nYou can view them in your documents section.`;

    const notificationData: any = {
      senderId,
      // Deliver via both in-app and email so parents are alerted even when not logged in.
      type: 'both' as const,
      priority: 'normal' as const,
      subject: notificationSubject,
      content: notificationContent,
      status: 'pending' as const,
    };

    // documentIds (array) drives visibility for both single and bulk;
    // documentId (scalar) retained for single uploads for backward compat.
    const baseTargetData: any = { schoolId, documentIds };
    if (isSingle) baseTargetData.documentId = documentIds[0];

    switch (targeting.targetType) {
      case 'all_parents':
        notificationData.targetType = 'all_parents';
        notificationData.targetData = { ...baseTargetData };
        break;
      case 'class_specific':
        notificationData.targetType = 'class_specific';
        notificationData.targetData = { ...baseTargetData, classIds: targeting.classIds };
        break;
      case 'individual':
        notificationData.targetType = 'individual';
        notificationData.targetData = { ...baseTargetData, userIds: targeting.userIds };
        break;
      case 'role':
        notificationData.targetType = 'role';
        notificationData.targetData = {
          ...baseTargetData,
          roles: targeting.roles,
          locationIds: targeting.locationIds,
        };
        break;
      case 'location':
        notificationData.targetType = 'location';
        notificationData.targetData = { ...baseTargetData, locationIds: targeting.locationIds };
        break;
      default:
        console.log('Unknown targeting type, skipping notification');
        return null;
    }

    // Create the notification
    const notification = await storage.createNotification(notificationData);
    console.log(`✅ Created document notification ID ${notification.id} for ${documents.length} document(s)`);

    // Create recipient records for both in-app and email delivery
    for (const recipientId of recipients) {
      await storage.createNotificationRecipient({
        notificationId: notification.id,
        recipientId,
        deliveryType: 'in_app' as const,
        status: 'delivered' as const,
        deliveredAt: new Date(),
      });
      await storage.createNotificationRecipient({
        notificationId: notification.id,
        recipientId,
        deliveryType: 'email' as const,
        status: 'pending' as const,
      });
    }

    // Send emails via Brevo (per-recipient status is updated inside; failures are non-fatal
    // and respect each user's email notification preference). Skips gracefully if Brevo is unset.
    try {
      await sendNotificationEmails(notification, recipients);
    } catch (emailError) {
      console.error('Error sending document notification emails:', emailError);
    }

    // Update notification status
    await storage.updateNotification(notification.id, {
      status: 'sent',
    });

    console.log(`✅ Document notification sent to ${recipients.length} recipients (in-app + email)`);
    return notification;
  } catch (error) {
    console.error('Error sending document notification:', error);
    return null;
  }
}

// Helper function to send a notification for a single document
async function sendDocumentNotification(
  document: any,
  targeting: any,
  senderId: number,
  schoolId: number
) {
  try {
    return await sendBulkDocumentNotification([document], targeting, senderId, schoolId);
  } catch (error) {
    console.error('Error sending document notification:', error);
    return null;
  }
}

const registerDocumentSchema = z.object({
  objectPath: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.coerce.number().int().positive(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().optional(),
  isPublished: z.union([z.boolean(), z.string()]).optional(),
  visibleToAll: z.union([z.boolean(), z.string()]).optional(),
  notificationTargeting: z.unknown().optional(),
  expiresAt: z.string().optional().nullable(),
});

// Register a document after client presigned upload (category `documents`).
router.post('/upload', supabaseAuth, async (req: any, res) => {
  try {
    const parsedBody = registerDocumentSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        success: false,
        message: parsedBody.error.errors[0]?.message || 'Invalid request',
      });
    }

    const {
      objectPath,
      fileName,
      mimeType,
      sizeBytes,
      title,
      description,
      category,
      isPublished,
      visibleToAll,
      notificationTargeting,
      expiresAt,
    } = parsedBody.data;

    const uploadedBy = req.user?.id;
    if (!uploadedBy) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const schoolId = req.user?.schoolId;
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'User is not associated with a school.',
      });
    }

    if (!objectPath.startsWith('/objects/documents/')) {
      return res.status(400).json({
        success: false,
        message: 'objectPath must be a private document storage path (/objects/documents/...)',
      });
    }

    if (!DOCUMENT_ALLOWED_MIME_TYPES.includes(mimeType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Allowed types: PDF, Word documents, and images.',
      });
    }

    if (sizeBytes > 25 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 25MB.',
      });
    }

    const sanitizedFileName = sanitizeFilename(fileName);

    let existingDocWithName;
    try {
      existingDocWithName = await storage.getSchoolDocumentByFileName(schoolId, sanitizedFileName);
    } catch (dbCheckError: any) {
      console.error('❌ DB error during duplicate filename check:', dbCheckError.message, dbCheckError.stack);
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable.',
      });
    }
    if (existingDocWithName) {
      return res.status(409).json({
        success: false,
        message: `A document named "${sanitizedFileName}" already exists for this school. Please rename the file before uploading.`,
      });
    }

    const fileUrl = objectPath;
    const parsedIsPublished = isPublished === 'true' || isPublished === true;
    const parsedVisibleToAll = visibleToAll === 'true' || visibleToAll === true;

    let document;
    try {
      document = await storage.createSchoolDocument({
        schoolId,
        uploadedBy,
        title,
        description: description || null,
        category: category || 'other',
        fileName: sanitizedFileName,
        filePath: fileUrl,
        fileSize: sizeBytes,
        mimeType,
        isPublished: parsedIsPublished,
        visibleToAll: parsedVisibleToAll,
        ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
      });
    } catch (dbError: any) {
      console.error('❌ DB insert failed after presigned upload — cleaning up orphaned file:', fileUrl, dbError);
      await fileUploadService.deleteObject(fileUrl);
      return res.status(500).json({
        success: false,
        message: 'Failed to save document record',
      });
    }

    let notificationSent = false;
    if (parsedIsPublished && notificationTargeting) {
      try {
        const targeting = typeof notificationTargeting === 'string'
          ? JSON.parse(notificationTargeting)
          : notificationTargeting;

        const notification = await sendDocumentNotification(document, targeting, uploadedBy, schoolId);
        notificationSent = !!notification;
      } catch (parseError) {
        console.error('Error parsing notification targeting:', parseError);
      }
    }

    res.json({
      success: true,
      message: notificationSent
        ? 'Document uploaded and notification sent successfully'
        : 'Document registered successfully',
      document,
      notificationSent,
    });
  } catch (error: any) {
    console.error('Error registering document:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to register document',
    });
  }
});

// Download a document by ID
router.get('/:id/download', supabaseAuth, async (req: any, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
    }

    // Get the document
    const document = await storage.getSchoolDocumentById(documentId);
    if (!document) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found' 
      });
    }

    // SECURITY: Verify user has access to this document
    const user = await storage.getUser(userId);
    
    // Determine effective school access: prefer user.schoolId, then check enrollments
    // In multi-school scenarios, check if any enrollment matches the document's schoolId
    let hasSchoolAccess = user?.schoolId === document.schoolId;
    if (!hasSchoolAccess && user) {
      const enrollments = await storage.getProgramEnrollmentsByParent(user.id);
      const matchingEnrollment = enrollments.find(e => e.schoolId === document.schoolId);
      if (matchingEnrollment) {
        hasSchoolAccess = true;
        console.log(`📄 Download: Access granted via enrollment for schoolId ${document.schoolId}`);
      }
    }
    
    if (!user || !hasSchoolAccess) {
      console.log(`🚨 SECURITY: User ${userId} attempted to download document ${documentId} from school ${document.schoolId} but has no matching school access`);
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied: You do not have permission to download this document' 
      });
    }

    // Check if this is an object storage path (new uploads use /objects/ prefix for private documents)
    const isObjectStoragePath = document.filePath.startsWith('/objects/');
    
    if (isObjectStoragePath) {
      // Fetch from object storage (private documents)
      try {
        const objectStorageService = new ObjectStorageService();
        const objectFile = await objectStorageService.getObjectEntityFile(document.filePath);
        
        // Set Content-Disposition header for download before streaming
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.fileName)}"`);
        
        // Use the downloadObject method to stream the file to the response
        await objectStorageService.downloadObject(objectFile, res, 0); // 0 cache TTL for downloads
        console.log(`📥 Downloaded document from object storage: ${document.filePath}`);

        // Record download event (fire and forget - don't block response)
        try {
          await storage.createDocumentView({ documentId: documentId, userId: userId });
        } catch (trackError) {
          console.warn('Failed to record download event:', trackError);
        }

        return; // Response already sent by downloadObject
      } catch (downloadError: any) {
        console.error(`❌ Failed to download from object storage: ${document.filePath}`, downloadError);
        // Distinguish between not-found and other errors
        if (downloadError.name === 'ObjectNotFoundError') {
          return res.status(404).json({ 
            success: false, 
            message: 'Document file not found in storage' 
          });
        }
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to retrieve document from storage' 
        });
      }
    } else {
      // Legacy: fetch from local filesystem
      const relativePath = document.filePath.startsWith('/') 
        ? document.filePath.substring(1) 
        : document.filePath;
      const absolutePath = path.join(process.cwd(), relativePath);

      // Check if file exists
      if (!fs.existsSync(absolutePath)) {
        console.error(`Document file not found: ${absolutePath}`);
        return res.status(404).json({ 
          success: false, 
          message: 'Document file not found on server' 
        });
      }

      // Get file stats
      const stats = fs.statSync(absolutePath);

      // Set proper headers for file download
      res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.fileName)}"`);
      res.setHeader('Cache-Control', 'no-cache');

      // Stream the file to the response
      const fileStream = fs.createReadStream(absolutePath);
      fileStream.pipe(res);

      fileStream.on('error', (err: any) => {
        console.error('Error streaming file:', err);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            message: 'Error streaming file' 
          });
        }
      });

      fileStream.on('close', async () => {
        // Record download event after stream completes
        try {
          await storage.createDocumentView({ documentId: documentId, userId: userId });
        } catch (trackError) {
          console.warn('Failed to record download event:', trackError);
        }
      });
    }
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to download document' 
    });
  }
});

// PUBLIC download via share token — NO authentication. Anyone with the link can
// download, but only while the document is shared, published, not archived, and not expired.
// (3-segment path does not collide with the authenticated 2-segment /:id/download route.)
router.get('/public/:token/download', async (req: any, res) => {
  try {
    const token = req.params.token;
    if (!token || typeof token !== 'string') {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const document = await storage.getSchoolDocumentByShareToken(token);

    // Use a generic 404 for every "not available" case so we don't leak document state.
    const isExpired = (document as any)?.expiresAt && new Date((document as any).expiresAt) < new Date();
    if (
      !document ||
      !document.shareToken ||
      !document.isPublished ||
      (document as any).isArchived ||
      isExpired
    ) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const isObjectStoragePath = document.filePath.startsWith('/objects/');

    if (isObjectStoragePath) {
      try {
        const objectStorageService = new ObjectStorageService();
        const objectFile = await objectStorageService.getObjectEntityFile(document.filePath);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.fileName)}"`);
        await objectStorageService.downloadObject(objectFile, res, 0);
        console.log(`📥 Public download via share token for document ${document.id}`);
        return;
      } catch (downloadError: any) {
        console.error(`❌ Public download failed from object storage: ${document.filePath}`, downloadError);
        if (downloadError.name === 'ObjectNotFoundError') {
          return res.status(404).json({ success: false, message: 'Document file not found' });
        }
        return res.status(500).json({ success: false, message: 'Failed to retrieve document' });
      }
    }

    // Legacy: stream from local filesystem
    const relativePath = document.filePath.startsWith('/') ? document.filePath.substring(1) : document.filePath;
    const absolutePath = path.join(process.cwd(), relativePath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: 'Document file not found' });
    }
    const stats = fs.statSync(absolutePath);
    res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.fileName)}"`);
    res.setHeader('Cache-Control', 'no-cache');
    const fileStream = fs.createReadStream(absolutePath);
    fileStream.pipe(res);
    fileStream.on('error', (err: any) => {
      console.error('Error streaming public file:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error streaming file' });
      }
    });
  } catch (error) {
    console.error('Error in public document download:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to download document' });
    }
  }
});

// Get download history for a document (admin only)
router.get('/:id/views', supabaseAuth, async (req: any, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const document = await storage.getSchoolDocumentById(documentId);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // SECURITY: Verify admin belongs to the same school
    const user = await storage.getUser(userId);
    if (!user || user.schoolId !== document.schoolId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const views = await storage.getDocumentViews(documentId);
    res.json({ success: true, views });
  } catch (error) {
    console.error('Error fetching document views:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch document views' });
  }
});

// Update document metadata
router.patch('/:id', supabaseAuth, async (req: any, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const { title, description, category, isPublished, visibleToAll, expiresAt, isArchived } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
    }

    // SECURITY: Verify the user can modify this document (belongs to their school)
    const existingDoc = await storage.getSchoolDocumentById(documentId);
    if (!existingDoc) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found' 
      });
    }

    const user = await storage.getUser(userId);
    if (!user || user.schoolId !== existingDoc.schoolId) {
      console.log(`🚨 SECURITY: User ${userId} attempted to update document ${documentId} from school ${existingDoc.schoolId} but belongs to school ${user?.schoolId}`);
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied: You do not have permission to update this document' 
      });
    }

    // Detect draft-to-published transition before updating
    const isDraftToPublished = isPublished === true && existingDoc.isPublished === false;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    if (visibleToAll !== undefined) updateData.visibleToAll = visibleToAll;
    if (isArchived !== undefined) updateData.isArchived = isArchived;
    if (expiresAt !== undefined) {
      // Accept null to clear, or a date string (YYYY-MM-DD or ISO)
      updateData.expiresAt = expiresAt === null ? null : new Date(expiresAt);
    }

    const document = await storage.updateSchoolDocument(documentId, updateData);

    // Send notification when document transitions from draft to published
    if (isDraftToPublished && document) {
      try {
        // Use existing targeting settings from the document if available, otherwise default to all_parents
        const targeting = { targetType: 'all_parents' };
        await sendDocumentNotification(document, targeting, userId, existingDoc.schoolId);
        console.log(`📧 Sent publish notification for document ${documentId} (draft→published)`);
      } catch (notifyError) {
        // Log but don't fail the update if notification fails
        console.error('Error sending publish notification:', notifyError);
      }
    }

    res.json({ 
      success: true, 
      message: 'Document updated successfully',
      document 
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update document' 
    });
  }
});

// Send notification for existing document
router.post('/:id/notify', supabaseAuth, async (req: any, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const { targeting } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
    }

    if (!targeting || !targeting.targetType) {
      return res.status(400).json({ 
        success: false, 
        message: 'Notification targeting is required' 
      });
    }

    // Get the document
    const document = await storage.getSchoolDocumentById(documentId);
    if (!document) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found' 
      });
    }

    // SECURITY: Verify the user can send notifications for this document (belongs to their school)
    const user = await storage.getUser(userId);
    if (!user || user.schoolId !== document.schoolId) {
      console.log(`🚨 SECURITY: User ${userId} attempted to send notification for document ${documentId} from school ${document.schoolId} but belongs to school ${user?.schoolId}`);
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied: You do not have permission to send notifications for this document' 
      });
    }

    // Send the notification
    const notification = await sendDocumentNotification(document, targeting, userId, document.schoolId);
    
    if (!notification) {
      // Could be zero recipients (not an error) or an internal failure
      // Return 200 no-op so the caller is not misled by a 500
      return res.json({ 
        success: true, 
        message: 'No recipients matched the targeting criteria — notification not sent',
        notificationId: null
      });
    }

    res.json({ 
      success: true, 
      message: 'Notification sent successfully',
      notificationId: notification.id
    });
  } catch (error) {
    console.error('Error sending document notification:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send notification' 
    });
  }
});

// Send a single joint notification covering multiple documents (bulk upload)
router.post('/notify-bulk', supabaseAuth, async (req: any, res) => {
  try {
    const { documentIds, targeting } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'documentIds (non-empty array) is required' });
    }

    if (!targeting || !targeting.targetType) {
      return res.status(400).json({ success: false, message: 'Notification targeting is required' });
    }

    const user = await storage.getUser(userId);
    if (!user || !user.schoolId) {
      return res.status(400).json({ success: false, message: 'User is not associated with a school' });
    }

    // SECURITY: only include documents that belong to the admin's school
    const documents: any[] = [];
    for (const rawId of documentIds) {
      const id = Number(rawId);
      if (!Number.isFinite(id) || id <= 0) continue;
      const doc = await storage.getSchoolDocumentById(id);
      if (doc && doc.schoolId === user.schoolId) {
        documents.push(doc);
      } else if (doc) {
        console.log(`🚨 SECURITY: User ${userId} tried to notify for document ${id} from school ${doc.schoolId} but belongs to school ${user.schoolId}`);
      }
    }

    if (documents.length === 0) {
      return res.status(404).json({ success: false, message: 'No accessible documents found for the provided IDs' });
    }

    const notification = await sendBulkDocumentNotification(documents, targeting, userId, user.schoolId);

    if (!notification) {
      return res.json({
        success: true,
        message: 'No recipients matched the targeting criteria — notification not sent',
        notificationId: null,
        documentCount: documents.length,
      });
    }

    res.json({
      success: true,
      message: 'Notification sent successfully',
      notificationId: notification.id,
      documentCount: documents.length,
    });
  } catch (error) {
    console.error('Error sending bulk document notification:', error);
    res.status(500).json({ success: false, message: 'Failed to send notification' });
  }
});

// Build the relative public download path for a share token.
function buildSharePath(token: string): string {
  return `/api/schools/documents/public/${token}/download`;
}

// Enable public sharing for a document — generates a share token if none exists.
// Returns the (relative) share path; the client builds the absolute URL.
router.post('/:id/share', supabaseAuth, async (req: any, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const document = await storage.getSchoolDocumentById(documentId);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // SECURITY: admin must belong to the document's school
    const user = await storage.getUser(userId);
    if (!user || user.schoolId !== document.schoolId) {
      console.log(`🚨 SECURITY: User ${userId} attempted to share document ${documentId} from school ${document.schoolId} but belongs to school ${user?.schoolId}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Reuse the existing token if already shared; otherwise generate a new unguessable one.
    let token = document.shareToken;
    if (!token) {
      token = randomBytes(24).toString('base64url');
      await storage.updateSchoolDocument(documentId, { shareToken: token } as any);
    }

    res.json({
      success: true,
      shareToken: token,
      sharePath: buildSharePath(token),
      message: 'Public link enabled',
    });
  } catch (error) {
    console.error('Error enabling document share link:', error);
    res.status(500).json({ success: false, message: 'Failed to enable public link' });
  }
});

// Disable public sharing for a document — clears the share token (revokes the link).
router.delete('/:id/share', supabaseAuth, async (req: any, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const document = await storage.getSchoolDocumentById(documentId);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // SECURITY: admin must belong to the document's school
    const user = await storage.getUser(userId);
    if (!user || user.schoolId !== document.schoolId) {
      console.log(`🚨 SECURITY: User ${userId} attempted to unshare document ${documentId} from school ${document.schoolId} but belongs to school ${user?.schoolId}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await storage.updateSchoolDocument(documentId, { shareToken: null } as any);

    res.json({ success: true, message: 'Public link revoked' });
  } catch (error) {
    console.error('Error disabling document share link:', error);
    res.status(500).json({ success: false, message: 'Failed to revoke public link' });
  }
});

// Delete a document
router.delete('/:id', supabaseAuth, async (req: any, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
    }

    // Get the document first to delete the file
    const document = await storage.getSchoolDocumentById(documentId);
    
    if (!document) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found' 
      });
    }

    // SECURITY: Verify the user can delete this document (belongs to their school)
    const user = await storage.getUser(userId);
    if (!user || user.schoolId !== document.schoolId) {
      console.log(`🚨 SECURITY: User ${userId} attempted to delete document ${documentId} from school ${document.schoolId} but belongs to school ${user?.schoolId}`);
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied: You do not have permission to delete this document' 
      });
    }

    // Delete the file from storage (object storage or legacy filesystem)
    const isObjectStoragePath = document.filePath.startsWith('/objects/');
    
    if (isObjectStoragePath) {
      // Delete from object storage — abort DB deletion if storage deletion fails
      try {
        const objectStorageService = new ObjectStorageService();
        await objectStorageService.deleteObject(document.filePath);
        console.log(`🗑️ Deleted document from object storage: ${document.filePath}`);
      } catch (deleteError: any) {
        console.error(`❌ Failed to delete from object storage: ${document.filePath}`, deleteError);
        return res.status(500).json({
          success: false,
          message: 'Failed to delete document file from storage. Database record preserved.'
        });
      }
    } else {
      // Legacy: delete from local filesystem — file may already be missing, log and continue
      const filePath = path.join(process.cwd(), document.filePath);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Deleted document from filesystem: ${filePath}`);
        } catch (fsError: any) {
          console.error(`⚠️ Failed to delete legacy file (continuing): ${filePath}`, fsError);
        }
      } else {
        console.log(`⚠️ Legacy file not found, skipping filesystem deletion: ${filePath}`);
      }
    }

    // Delete from database
    await storage.deleteSchoolDocument(documentId);

    res.json({ 
      success: true, 
      message: 'Document deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete document' 
    });
  }
});

export default router;
