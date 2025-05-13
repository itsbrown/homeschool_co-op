/**
 * OCR Test API
 * Endpoint to test the OCR functionality with Document AI
 */

import express from 'express';
import * as fileUpload from 'express-fileupload';
import { processDocument } from '../services/documentAI';
import path from 'path';
import fs from 'fs/promises';

const router = express.Router();

// Configure file upload middleware
router.use(fileUpload.default({
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  abortOnLimit: true,
  useTempFiles: true,
  tempFileDir: path.join(process.cwd(), 'uploads', 'temp'),
  createParentPath: true,
}));

// OCR endpoint to extract text from a document
router.post('/process', async (req, res) => {
  try {
    if (!req.files || !req.files.document) {
      return res.status(400).json({
        success: false,
        error: 'No document provided for OCR processing',
      });
    }

    const document = req.files.document as fileUpload.UploadedFile;
    console.log(`Processing document: ${document.name} (${document.size} bytes, ${document.mimetype})`);
    
    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const ocrDir = path.join(uploadsDir, 'ocr');
    await fs.mkdir(ocrDir, { recursive: true });
    
    // Save the file to disk
    const timestamp = Date.now();
    const filePath = path.join(ocrDir, `${timestamp}_${document.name}`);
    await document.mv(filePath);
    
    // Process the document with Document AI
    console.log(`Processing document at path: ${filePath}`);
    const extractedText = await processDocument(filePath);
    
    // Return the extracted text
    return res.json({
      success: true,
      filename: document.name,
      size: document.size,
      mimeType: document.mimetype,
      extractedText,
      textLength: extractedText.length,
      textPreview: extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : ''),
    });
  } catch (error) {
    console.error('Error processing document with OCR:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({
      success: false,
      error: `Error processing document: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
});

export default router;