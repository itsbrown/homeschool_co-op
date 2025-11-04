import express from "express";
import path from "path";
import fs from "fs";
import { UploadedFile } from "express-fileupload";
import { jwtCheck } from '../middleware/auth0-auth';

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

console.log(`📁 Upload directory ready: ${uploadsDir}`);

// Upload files for knowledge bases
router.post('/knowledge-base', async (req, res) => {
  try {
    console.log("📁 File upload request received");
    console.log("📄 Request files:", req.files);

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No files were uploaded.' 
      });
    }

    const uploadedFiles = [];
    const uploadDir = path.join(process.cwd(), 'uploads');

    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Handle multiple files
    const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];

    // File size limits
    const maxFileSize = 50 * 1024 * 1024; // 50MB per file
    const maxTotalSize = 200 * 1024 * 1024; // 200MB total

    // Check individual file sizes
    const invalidFiles = files.filter(file => file && file.size > maxFileSize);
    if (invalidFiles.length > 0) {
      return res.status(400).json({
        success: false,
        message: `${invalidFiles.length} file(s) exceed the 50MB limit`,
        invalidFiles: invalidFiles.map(f => ({ name: f.name, size: f.size }))
      });
    }

    // Check total size
    const totalSize = files.reduce((sum, file) => sum + (file ? file.size : 0), 0);
    if (totalSize > maxTotalSize) {
      return res.status(400).json({
        success: false,
        message: 'Combined file size cannot exceed 200MB',
        totalSize,
        maxSize: maxTotalSize
      });
    }

    for (const file of files) {
      if (!file) continue;

      // Create unique filename with timestamp
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `${timestamp}_${sanitizedName}`;
      const filepath = path.join(uploadDir, filename);

      // Move file to uploads directory
      await file.mv(filepath);

      console.log(`✅ File uploaded: ${file.name} -> ${filename}`);

      uploadedFiles.push({
        url: `/uploads/${filename}`,
        type: path.extname(file.name).substring(1).toLowerCase() || 'unknown',
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      files: uploadedFiles
    });

  } catch (error) {
    console.error('❌ File upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload files',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Upload product images (max 3, size and type validation) - REQUIRES AUTHENTICATION
router.post('/product-images', jwtCheck, async (req, res) => {
  try {
    console.log("📸 Product image upload request received");

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No images were uploaded.' 
      });
    }

    const uploadedImages = [];
    const uploadDir = path.join(process.cwd(), 'uploads', 'product-images');

    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Handle multiple files (max 3)
    const images = Array.isArray(req.files.images) 
      ? req.files.images 
      : req.files.images 
        ? [req.files.images] 
        : [];

    // Validate max 3 images
    if (images.length > 3) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 3 images allowed per upload',
      });
    }

    // Validate image types and sizes
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxFileSize = 5 * 1024 * 1024; // 5MB per image

    for (const image of images) {
      if (!image) continue;

      // Validate file type
      if (!allowedTypes.includes(image.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `Invalid file type: ${image.name}. Only JPG, PNG, and WebP images are allowed.`,
        });
      }

      // Validate file size
      if (image.size > maxFileSize) {
        return res.status(400).json({
          success: false,
          message: `Image ${image.name} exceeds 5MB size limit`,
        });
      }

      // Create unique filename with timestamp
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(7);
      const ext = path.extname(image.name);
      const filename = `product_${timestamp}_${randomStr}${ext}`;
      const filepath = path.join(uploadDir, filename);

      // Move file to uploads directory
      await image.mv(filepath);

      console.log(`✅ Product image uploaded: ${image.name} -> ${filename}`);

      uploadedImages.push({
        url: `/uploads/product-images/${filename}`,
        filename,
        originalName: image.name,
        size: image.size,
        uploadedAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      images: uploadedImages
    });

  } catch (error) {
    console.error('❌ Product image upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload images',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get uploaded file
router.get('/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.sendFile(filepath);
  } catch (error) {
    console.error('❌ File serve error:', error);
    res.status(500).json({ message: 'Error serving file' });
  }
});

// Serve product images
router.get('/product-images/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(uploadsDir, 'product-images', filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'Image not found' });
    }

    res.sendFile(filepath);
  } catch (error) {
    console.error('❌ Image serve error:', error);
    res.status(500).json({ message: 'Error serving image' });
  }
});

export default router;