/**
 * Document AI Service for OCR Processing
 * Uses Google Cloud Document AI to extract text from uploaded documents, books, and images
 */

import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';

// Initialize the Document AI client
// This requires proper authentication with Google Cloud (using GOOGLE_APPLICATION_CREDENTIALS env var)
let documentAIClient: DocumentProcessorServiceClient | null = null;
let storage: Storage | null = null;

// Document AI processor configuration
const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || '';
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us';
const processorId = process.env.GOOGLE_CLOUD_DOCUMENT_AI_PROCESSOR_ID || '';
const processorPath = `projects/${projectId}/locations/${location}/processors/${processorId}`;

/**
 * Initialize the Document AI and Storage services
 */
export const initDocumentAI = async (): Promise<boolean> => {
  try {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.warn('GOOGLE_APPLICATION_CREDENTIALS not set, Document AI services will not be available');
      return false;
    }
    
    if (!projectId || !processorId) {
      console.warn('Google Cloud Project ID or Processor ID not configured, Document AI services will not be available');
      return false;
    }
    
    // Initialize Document AI client
    documentAIClient = new DocumentProcessorServiceClient();
    
    // Initialize Google Cloud Storage client
    storage = new Storage();
    
    console.log('Document AI service initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize Document AI service:', error instanceof Error ? error.message : String(error));
    return false;
  }
};

/**
 * Check if Document AI service is available
 */
export const isDocumentAIAvailable = (): boolean => {
  return !!documentAIClient && !!storage;
};

/**
 * Process a document using Document AI OCR
 * @param filePath Path to the file to process
 * @returns Extracted text from the document
 */
export const processDocument = async (filePath: string): Promise<string> => {
  if (!documentAIClient) {
    throw new Error('Document AI client not initialized');
  }
  
  try {
    // Read the file into memory
    const imageFile = fs.readFileSync(filePath);
    const encodedImage = Buffer.from(imageFile).toString('base64');
    
    // Configure the process request
    const request = {
      name: processorPath,
      rawDocument: {
        content: encodedImage,
        mimeType: getMimeType(filePath),
      },
    };
    
    // Process the document
    const [result] = await documentAIClient.processDocument(request);
    const { document } = result;
    
    if (!document || !document.text) {
      throw new Error('Document processing completed but no text was extracted');
    }
    
    // Return the extracted text
    return document.text;
  } catch (error) {
    console.error('Error processing document with Document AI:', error instanceof Error ? error.message : String(error));
    throw new Error(`Document AI processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Upload a file to Google Cloud Storage
 * @param filePath Local path to the file
 * @param destinationPath Path in Google Cloud Storage
 * @returns Public URL of the uploaded file
 */
export const uploadFileToStorage = async (
  filePath: string,
  destinationPath: string
): Promise<string> => {
  if (!storage) {
    throw new Error('Google Cloud Storage client not initialized');
  }
  
  try {
    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || '';
    if (!bucketName) {
      throw new Error('Google Cloud Storage bucket not configured');
    }
    
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(destinationPath);
    
    await bucket.upload(filePath, {
      destination: destinationPath,
      metadata: {
        contentType: getMimeType(filePath),
      },
    });
    
    // Make the file publicly accessible and get its URL
    await file.makePublic();
    return `https://storage.googleapis.com/${bucketName}/${destinationPath}`;
  } catch (error) {
    console.error('Error uploading file to Google Cloud Storage:', error);
    throw new Error(`File upload failed: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Get MIME type based on file extension
 * @param filePath Path to the file
 * @returns MIME type
 */
const getMimeType = (filePath: string): string => {
  const extension = path.extname(filePath).toLowerCase();
  
  switch (extension) {
    case '.pdf':
      return 'application/pdf';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.tiff':
      return 'image/tiff';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.txt':
      return 'text/plain';
    case '.doc':
      return 'application/msword';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return 'application/octet-stream';
  }
};

/**
 * Extract text from a document using Document AI OCR
 * This is the main function that should be called from other parts of the application
 * @param filePath Path to the file to process
 * @returns Extracted text content 
 */
export const extractTextFromDocument = async (filePath: string): Promise<string> => {
  if (!isDocumentAIAvailable()) {
    throw new Error('Document AI service not available');
  }
  
  try {
    // Process the document with Document AI
    const extractedText = await processDocument(filePath);
    
    // Log success message with text preview
    const textPreview = extractedText.substring(0, 100) + (extractedText.length > 100 ? '...' : '');
    console.log(`Successfully extracted text from ${filePath}. Preview: ${textPreview}`);
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting text from document:', error);
    throw new Error(`Text extraction failed: ${error.message || 'Unknown error'}`);
  }
};

// Initialize the service when the module is imported
initDocumentAI().catch(error => {
  console.error('Failed to initialize Document AI service during module loading:', error);
});