/**
 * OCR Activity Generator Service
 * Extends the existing activity generation with OCR-extracted text capabilities
 */

import { extractTextFromDocument, isDocumentAIAvailable } from './documentAI';
import { generateEducationalActivity } from './openai';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generate educational activity using OCR-extracted text as context
 * @param subject Subject of the activity
 * @param ageRange Target age range
 * @param activityType Type of activity to generate
 * @param difficulty Difficulty level
 * @param instructions Additional instructions
 * @param filePath Path to file for OCR processing (optional)
 * @param knowledgeBaseContent Existing knowledge base content (optional)
 * @returns Generated activity content
 */
export const generateActivityWithOCR = async (
  subject: string,
  ageRange: string,
  activityType: string,
  difficulty: string,
  instructions: string,
  filePath?: string,
  knowledgeBaseContent?: string
): Promise<any> => {
  // Prepare content from OCR if a file is provided
  let combinedContent = knowledgeBaseContent || '';
  
  if (filePath) {
    try {
      // Check if Document AI is available
      if (!isDocumentAIAvailable()) {
        console.warn('Document AI is not available, skipping OCR processing');
      } else if (fs.existsSync(filePath)) {
        console.log(`Processing file with OCR: ${filePath}`);
        
        // Extract text from the document
        const extractedText = await extractTextFromDocument(filePath);
        
        // Combine with existing knowledge base content
        combinedContent = `
          EXTRACTED TEXT FROM DOCUMENT:
          ${extractedText}
          
          ${combinedContent}
        `;
        
        console.log(`OCR processing complete. Extracted ${extractedText.length} characters.`);
      } else {
        console.warn(`File not found for OCR processing: ${filePath}`);
      }
    } catch (error) {
      console.error('Error during OCR processing:', error);
      // Continue with activity generation even if OCR fails
    }
  }
  
  // Generate the activity using the enhanced content
  return await generateEducationalActivity(
    subject,
    ageRange,
    activityType,
    difficulty,
    instructions,
    combinedContent
  );
};

/**
 * Save an uploaded file for OCR processing
 * @param fileBuffer Buffer containing the file data
 * @param originalFilename Original filename
 * @returns Path to the saved file
 */
export const saveFileForOCR = async (
  fileBuffer: Buffer,
  originalFilename: string
): Promise<string> => {
  // Create uploads directory if it doesn't exist
  const uploadsDir = path.join(process.cwd(), 'uploads', 'ocr');
  
  try {
    await fs.promises.mkdir(uploadsDir, { recursive: true });
  } catch (error) {
    console.error('Error creating OCR uploads directory:', error);
    throw new Error('Failed to create uploads directory');
  }
  
  // Generate a unique filename
  const timestamp = Date.now();
  const extension = path.extname(originalFilename).toLowerCase();
  const filename = `ocr_${timestamp}${extension}`;
  const filePath = path.join(uploadsDir, filename);
  
  // Write the file
  try {
    await fs.promises.writeFile(filePath, fileBuffer);
    console.log(`File saved for OCR processing: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('Error saving file for OCR processing:', error);
    throw new Error('Failed to save file for OCR processing');
  }
};