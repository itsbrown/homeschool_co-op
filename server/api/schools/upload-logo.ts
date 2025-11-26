import express from 'express';
import path from 'path';
import fs from 'fs';
import { storage } from '../../storage';
import { UploadedFile } from 'express-fileupload';

const router = express.Router();

// Logo upload endpoint
router.post('/', async (req, res) => {
  try {
    console.log('📋 Raw request body:', req.body);
    console.log('📋 All body keys:', Object.keys(req.body || {}));
    console.log('📋 Files object:', req.files);
    
    const { schoolId } = req.body;
    
    console.log('📋 School ID from body:', schoolId);
    console.log('📋 School ID type:', typeof schoolId);
    
    if (!schoolId || schoolId === '' || schoolId === 'undefined') {
      console.log('❌ Invalid school ID:', schoolId);
      return res.status(400).json({ 
        success: false, 
        message: `School ID is required (received: "${schoolId}")` 
      });
    }
    
    // Check for uploaded file using express-fileupload
    if (!req.files || !req.files.logo) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }
    
    const logoFile = req.files.logo as UploadedFile;
    
    console.log('📁 File info:', { 
      name: logoFile.name, 
      size: logoFile.size, 
      mimetype: logoFile.mimetype 
    });
    
    // Validate file type
    if (!logoFile.mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed'
      });
    }
    
    // Validate file size (5MB limit)
    if (logoFile.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    
    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'uploads', 'logos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(logoFile.name);
    const filename = `school-logo-${timestamp}${ext}`;
    const filepath = path.join(uploadDir, filename);
    
    // Save the file
    await logoFile.mv(filepath);
    
    // Generate the URL for the uploaded file
    const logoUrl = `/uploads/logos/${filename}`;
    
    const schoolIdNum = parseInt(schoolId);
    console.log('🖼️ Uploading logo for school:', schoolId, '(parsed as:', schoolIdNum, ')');
    console.log('📁 File saved as:', filename);
    console.log('🌐 Logo URL:', logoUrl);
    
    // Check if school exists first - with debugging
    console.log('🔍 Looking up school with ID:', schoolIdNum);
    console.log('🔍 Storage type:', storage.constructor.name);
    
    const existingSchool = await storage.getSchool(schoolIdNum);
    console.log('🔍 School lookup result:', existingSchool);
    
    if (!existingSchool) {
      // Clean up uploaded file
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      console.log('❌ School not found with ID:', schoolIdNum);
      
      // Try to list all schools for debugging
      try {
        const allSchools = await storage.getAllSchools?.();
        console.log('🔍 All available schools:', allSchools);
      } catch (e: any) {
        console.log('🔍 Could not list all schools:', e.message);
      }
      
      return res.status(404).json({
        success: false,
        message: `School not found with ID: ${schoolIdNum}`
      });
    }
    
    // Delete old logo file if it exists
    if (existingSchool.logo) {
      // Remove leading slash from logo path since it's stored as a URL path (e.g., "/uploads/logos/...")
      const normalizedLogoPath = existingSchool.logo.replace(/^\//, '');
      const oldLogoPath = path.join(process.cwd(), normalizedLogoPath);
      console.log('🗑️ Attempting to delete old logo:', oldLogoPath);
      if (fs.existsSync(oldLogoPath)) {
        try {
          fs.unlinkSync(oldLogoPath);
          console.log('✅ Old logo deleted successfully');
        } catch (deleteError) {
          console.log('⚠️ Could not delete old logo:', deleteError);
          // Continue with upload even if old file deletion fails
        }
      } else {
        console.log('ℹ️ Old logo file not found at path:', oldLogoPath);
      }
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
        fs.unlinkSync(filepath);
        return res.status(500).json({
          success: false,
          message: 'Failed to update school in storage'
        });
      }
    } catch (storageError) {
      console.error('Storage update failed:', storageError);
      
      // Clean up the uploaded file on error
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to update school logo'
      });
    }
    
  } catch (error: any) {
    console.error('Logo upload error:', error);
    
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload logo'
    });
  }
});

export default router;