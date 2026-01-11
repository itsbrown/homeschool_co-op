import express from 'express';
import path from 'path';
import fs from 'fs';
import { storage } from '../../storage';
import { UploadedFile } from 'express-fileupload';
import { supabaseAuth } from '../../middleware/supabase-auth';

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

// Helper function to send document notification
async function sendDocumentNotification(
  document: any, 
  targeting: any, 
  senderId: number,
  schoolId: number
) {
  try {
    const notificationSubject = `New Document: ${document.title}`;
    const notificationContent = `A new document "${document.title}" has been published${document.description ? `: ${document.description}` : ''}. You can view it in your documents section.`;

    let notificationData: any = {
      senderId,
      type: 'in_app' as const,
      priority: 'normal' as const,
      subject: notificationSubject,
      content: notificationContent,
      status: 'pending' as const,
    };

    switch (targeting.targetType) {
      case 'all_parents':
        notificationData.targetType = 'all_parents';
        notificationData.targetData = { schoolId };
        break;
      case 'class_specific':
        notificationData.targetType = 'class_specific';
        notificationData.targetData = { classIds: targeting.classIds, schoolId };
        break;
      case 'individual':
        notificationData.targetType = 'individual';
        notificationData.targetData = { userIds: targeting.userIds };
        break;
      case 'role':
        notificationData.targetType = 'role';
        notificationData.targetData = { 
          roles: targeting.roles, 
          locationIds: targeting.locationIds,
          schoolId 
        };
        break;
      case 'location':
        notificationData.targetType = 'location';
        notificationData.targetData = { locationIds: targeting.locationIds, schoolId };
        break;
      default:
        console.log('Unknown targeting type, skipping notification');
        return null;
    }

    // Create the notification
    const notification = await storage.createNotification(notificationData);
    console.log(`✅ Created document notification ID ${notification.id} for document: ${document.title}`);

    // Resolve recipients
    const recipients = await resolveDocumentNotificationRecipients(targeting, schoolId);
    console.log(`📧 Document notification: ${recipients.length} recipients to process`);

    // Create recipient records for in-app notifications
    for (const recipientId of recipients) {
      await storage.createNotificationRecipient({
        notificationId: notification.id,
        recipientId,
        deliveryType: 'in_app' as const,
        status: 'delivered' as const,
        deliveredAt: new Date(),
      });
    }

    // Update notification status
    await storage.updateNotification(notification.id, {
      status: 'sent',
    });

    console.log(`✅ Document notification sent to ${recipients.length} recipients`);
    return notification;
  } catch (error) {
    console.error('Error sending document notification:', error);
    return null;
  }
}

// Upload a new document
router.post('/upload', supabaseAuth, async (req: any, res) => {
  try {
    const { title, description, category, isPublished, visibleToAll, notificationTargeting } = req.body;
    const uploadedBy = req.user?.id;

    if (!title) {
      return res.status(400).json({ 
        success: false, 
        message: 'Document title is required' 
      });
    }

    if (!uploadedBy) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
    }

    // SECURITY: Derive schoolId from authenticated user - do not accept from client
    const user = await storage.getUser(uploadedBy);
    if (!user || !user.schoolId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User is not associated with a school' 
      });
    }

    // Always use server-derived schoolId from authenticated user
    const schoolId = user.schoolId;

    // Check for uploaded file
    if (!req.files || !req.files.document) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    const documentFile = req.files.document as UploadedFile;

    // Validate file type (allow PDF, Word, images)
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/gif'
    ];

    if (!allowedMimeTypes.includes(documentFile.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Allowed types: PDF, Word documents, and images.'
      });
    }

    // Validate file size (25MB limit)
    if (documentFile.size > 25 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 25MB.'
      });
    }

    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'uploads', 'school-documents', schoolId.toString());
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(documentFile.name);
    const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${safeTitle}-${timestamp}${ext}`;
    const filepath = path.join(uploadDir, filename);

    // Save the file
    await documentFile.mv(filepath);

    // Generate the URL for the uploaded file
    const fileUrl = `/uploads/school-documents/${schoolId}/${filename}`;

    // Create document record in database
    const document = await storage.createSchoolDocument({
      schoolId,
      uploadedBy,
      title,
      description: description || null,
      category: category || 'other',
      fileName: documentFile.name,
      filePath: fileUrl,
      fileSize: documentFile.size,
      mimeType: documentFile.mimetype,
      isPublished: isPublished !== 'false',
      visibleToAll: visibleToAll !== 'false'
    });

    // Send notification if document is published and targeting is provided
    let notificationSent = false;
    if (isPublished !== 'false' && notificationTargeting) {
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
        : 'Document uploaded successfully',
      document,
      notificationSent
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload document' 
    });
  }
});

// Update document metadata
router.patch('/:id', supabaseAuth, async (req: any, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const { title, description, category, isPublished, visibleToAll } = req.body;
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

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    if (visibleToAll !== undefined) updateData.visibleToAll = visibleToAll;

    const document = await storage.updateSchoolDocument(documentId, updateData);

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
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create notification' 
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

    // Delete the file from disk
    const filePath = path.join(process.cwd(), document.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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
