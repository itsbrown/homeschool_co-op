import express from "express";
import path from "path";
import fs from "fs";
import * as fileUpload from "express-fileupload";
import { UploadedFile } from "express-fileupload";

const router = express.Router();

// Configure file upload middleware specifically for knowledge base files
router.use(fileUpload.default({
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  abortOnLimit: true,
  useTempFiles: true,
  tempFileDir: path.join(process.cwd(), 'uploads', 'temp'),
  createParentPath: true,
}));

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Upload files for knowledge bases
router.post('/knowledge-base', async (req, res) => {
  try {
    console.log('📁 File upload request received');
    
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No files were uploaded" 
      });
    }

    const uploadedFiles: any[] = [];
    const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];

    for (const file of files.filter(Boolean)) {
      const uploadedFile = file as UploadedFile;
      
      // Generate unique filename
      const timestamp = Date.now();
      const sanitizedName = uploadedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `${timestamp}_${sanitizedName}`;
      const filepath = path.join(uploadsDir, filename);

      // Move file from temp to uploads
      await uploadedFile.mv(filepath);

      uploadedFiles.push({
        url: `/uploads/${filename}`,
        type: path.extname(uploadedFile.name).slice(1).toLowerCase(),
        name: uploadedFile.name,
        size: uploadedFile.size,
        uploadedAt: new Date().toISOString()
      });

      console.log(`✅ File uploaded: ${uploadedFile.name} -> ${filename}`);
    }

    res.json({
      success: true,
      files: uploadedFiles,
      message: `Successfully uploaded ${uploadedFiles.length} file(s)`
    });

  } catch (error) {
    console.error('❌ File upload error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to upload files",
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