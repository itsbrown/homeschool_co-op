import express from "express";
import path from "path";
import fs from "fs";
import { UploadedFile } from "express-fileupload";

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

export default router;