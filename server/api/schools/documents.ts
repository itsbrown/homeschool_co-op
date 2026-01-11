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

// Upload a new document
router.post('/upload', supabaseAuth, async (req: any, res) => {
  try {
    const { title, description, category, isPublished, visibleToAll } = req.body;
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

    res.json({ 
      success: true, 
      message: 'Document uploaded successfully',
      document 
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
