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

// Upload files for knowledge bases
router.post('/knowledge-base', async (req, res) => {
  try {
    console.log('📁 File upload request received');
    console.log('📄 Request files:', req.files);
    
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No files were uploaded" 
      });
    }

    const uploadedFiles: any[] = [];
    
    // Handle both single and multiple files
    let fileList: UploadedFile[] = [];
    
    if (req.files.files) {
      if (Array.isArray(req.files.files)) {
        fileList = req.files.files as UploadedFile[];
      } else {
        fileList = [req.files.files as UploadedFile];
      }
    } else {
      // Check for other possible field names
      const firstKey = Object.keys(req.files)[0];
      const firstFile = req.files[firstKey];
      if (Array.isArray(firstFile)) {
        fileList = firstFile as UploadedFile[];
      } else {
        fileList = [firstFile as UploadedFile];
      }
    }

    for (const uploadedFile of fileList) {
      if (!uploadedFile) continue;
      
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