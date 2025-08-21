import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { storage } from '../../storage';

const router = express.Router();

// Configure multer for file uploads
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'logos');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const schoolId = req.body.schoolId || 'unknown';
    cb(null, `school-${schoolId}-${timestamp}${ext}`);
  }
});

const upload = multer({
  storage: logoStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Logo upload endpoint
router.post('/', upload.single('logo'), async (req, res) => {
  try {
    const { schoolId } = req.body;
    
    if (!schoolId) {
      return res.status(400).json({ 
        success: false, 
        message: 'School ID is required' 
      });
    }
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }
    
    // Generate the URL for the uploaded file
    const logoUrl = `/uploads/logos/${req.file.filename}`;
    
    const schoolIdNum = parseInt(schoolId);
    console.log('🖼️ Uploading logo for school:', schoolId, '(parsed as:', schoolIdNum, ')');
    console.log('📁 File saved as:', req.file.filename);
    console.log('🌐 Logo URL:', logoUrl);
    
    // Check if school exists first
    const existingSchool = await storage.getSchool(schoolIdNum);
    if (!existingSchool) {
      // Clean up uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.log('❌ School not found with ID:', schoolIdNum);
      return res.status(404).json({
        success: false,
        message: `School not found with ID: ${schoolIdNum}`
      });
    }
    
    try {
      // Update school logo in storage
      const updatedSchool = await storage.updateSchool(schoolIdNum, {
        logo: logoUrl
      });
      
      if (updatedSchool) {
        console.log('✅ School logo updated successfully');
        return res.json({
          success: true,
          message: 'Logo uploaded successfully',
          logoUrl: logoUrl,
          school: updatedSchool
        });
      } else {
        // If storage update fails, clean up the uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(500).json({
          success: false,
          message: 'Failed to update school in storage'
        });
      }
    } catch (storageError) {
      console.error('Storage update failed:', storageError);
      
      // Clean up the uploaded file on error
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to update school logo'
      });
    }
    
  } catch (error: any) {
    console.error('Logo upload error:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload logo'
    });
  }
});

export default router;