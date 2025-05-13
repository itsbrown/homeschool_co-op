import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { storage } from '../storage';

// Create uploads directory if it doesn't exist
const ensureDirectoryExists = async (dirPath: string) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`Error creating directory ${dirPath}:`, error);
    throw error;
  }
};

/**
 * Generates a PDF worksheet from an activity
 * @param activityId The ID of the activity to generate a PDF for
 * @param userId User ID for permission checking
 * @returns Path to the generated PDF file
 */
export const generateWorksheetPDF = async (activityId: number, userId: number): Promise<string> => {
  try {
    // Get activity data
    const activity = await storage.getActivityById(activityId, userId);
    if (!activity) {
      throw new Error(`Activity with ID ${activityId} not found or not accessible.`);
    }

    const { content } = activity;
    const activityContent = typeof content === 'string' ? JSON.parse(content) : content;
    
    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const pdfDir = path.join(uploadsDir, 'pdf');
    await ensureDirectoryExists(pdfDir);
    
    const timestamp = Date.now();
    const pdfFileName = `${activity.type}_${activity.subject.replace(/\s+/g, '_')}_${timestamp}.pdf`;
    const pdfPath = path.join(pdfDir, pdfFileName);
    
    // Create PDF
    const doc = new PDFDocument({ size: 'letter', margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    
    doc.pipe(stream);
    
    // Add content based on activity type
    switch (activity.type) {
      case 'worksheet':
        await createWorksheetPDF(doc, activityContent);
        break;
      case 'coloring':
        await createColoringPagePDF(doc, activityContent);
        break;
      case 'crossword':
        await createCrosswordPDF(doc, activityContent);
        break;
      case 'wordsearch':
        await createWordSearchPDF(doc, activityContent);
        break;
      case 'maze':
        await createMazePDF(doc, activityContent);
        break;
      default:
        await createGenericPDF(doc, activityContent);
    }
    
    // Finalize and close the PDF
    doc.end();
    
    // Wait for the stream to finish
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', (error) => reject(error));
    });
    
    // Update activity with PDF URL
    const pdfUrl = `/uploads/pdf/${pdfFileName}`;
    await storage.updateActivityPdfUrl(activityId, pdfUrl);
    
    return pdfUrl;
  } catch (error) {
    console.error(`Error generating PDF for activity ${activityId}:`, error);
    throw error;
  }
};

// Helper function to create a worksheet PDF
const createWorksheetPDF = async (doc: PDFKit.PDFDocument, content: any) => {
  doc.fontSize(24).font('Helvetica-Bold').text(content.title, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(12).font('Helvetica').text(content.description, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(14).font('Helvetica-Bold').text('Instructions:', { underline: true });
  doc.fontSize(12).font('Helvetica').text(content.instructions);
  doc.moveDown();
  
  // Add any questions or problems
  if (content.content?.questions) {
    doc.fontSize(14).font('Helvetica-Bold').text('Questions:', { underline: true });
    doc.moveDown();
    
    content.content.questions.forEach((question: any, index: number) => {
      doc.fontSize(12).font('Helvetica-Bold').text(`${index + 1}. ${question.question}`);
      doc.fontSize(10).font('Helvetica').text('Answer: _____________________________');
      doc.moveDown(0.5);
    });
  }
  
  // Add any problems or exercises
  if (content.content?.problems) {
    doc.fontSize(14).font('Helvetica-Bold').text('Problems:', { underline: true });
    doc.moveDown();
    
    content.content.problems.forEach((problem: any, index: number) => {
      doc.fontSize(12).font('Helvetica-Bold').text(`${index + 1}. ${problem.problem}`);
      doc.fontSize(10).font('Helvetica').text('Work space:');
      
      // Add a box for work
      doc.rect(doc.x, doc.y, 400, 100).stroke();
      doc.moveDown(8);
    });
  }
  
  // Add footer with target skills
  doc.moveDown();
  if (content.targetSkills) {
    doc.fontSize(10).font('Helvetica-Oblique').text(`Target Skills: ${content.targetSkills.join(', ')}`, { align: 'center' });
  }
};

// Helper function to create a coloring page PDF
const createColoringPagePDF = async (doc: PDFKit.PDFDocument, content: any) => {
  doc.fontSize(24).font('Helvetica-Bold').text(content.title, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(12).font('Helvetica').text(content.description, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(14).font('Helvetica-Bold').text('Instructions:', { underline: true });
  doc.fontSize(12).font('Helvetica').text(content.instructions);
  doc.moveDown();
  
  // Add coloring instructions
  if (content.content?.elements) {
    doc.fontSize(14).font('Helvetica-Bold').text('Coloring Guide:', { underline: true });
    doc.moveDown();
    
    content.content.elements.forEach((element: any) => {
      doc.fontSize(12).font('Helvetica-Bold').text(`${element.name}:`);
      doc.fontSize(12).font('Helvetica').text(`${element.description}`);
      doc.moveDown(0.5);
    });
  }
  
  // Add image description (in a real implementation, we would generate or import an actual SVG here)
  doc.moveDown();
  doc.fontSize(12).font('Helvetica-Italic').text("Image Description:", { underline: true });
  if (content.content?.image) {
    doc.fontSize(12).font('Helvetica').text(content.content.image);
  }
  
  // Create a placeholder for the coloring image (in production this would be a real image)
  doc.moveDown();
  
  // Draw a placeholder frame for the coloring page
  doc.rect(100, doc.y, 400, 300).stroke();
  doc.fontSize(14).font('Helvetica').text('Coloring Image Would Appear Here', 
    100 + 200 - doc.widthOfString('Coloring Image Would Appear Here') / 2, 
    doc.y + 150 - doc.currentLineHeight() / 2);
  
  doc.moveDown(20);
  
  // Add learning facts if available
  if (content.content?.learningFacts) {
    doc.fontSize(14).font('Helvetica-Bold').text('Did You Know?', { underline: true });
    doc.moveDown();
    
    content.content.learningFacts.forEach((fact: string, index: number) => {
      doc.fontSize(12).font('Helvetica').text(`• ${fact}`);
      doc.moveDown(0.5);
    });
  }
  
  // Add footer with target skills
  doc.moveDown();
  if (content.targetSkills) {
    doc.fontSize(10).font('Helvetica-Oblique').text(`Target Skills: ${content.targetSkills.join(', ')}`, { align: 'center' });
  }
};

// Helper function to create a crossword puzzle PDF
const createCrosswordPDF = async (doc: PDFKit.PDFDocument, content: any) => {
  doc.fontSize(24).font('Helvetica-Bold').text(content.title, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(12).font('Helvetica').text(content.description, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(14).font('Helvetica-Bold').text('Instructions:', { underline: true });
  doc.fontSize(12).font('Helvetica').text(content.instructions);
  doc.moveDown();
  
  // Draw a placeholder for the crossword grid
  doc.rect(100, doc.y, 400, 300).stroke();
  doc.fontSize(14).font('Helvetica').text('Crossword Puzzle Would Appear Here', 
    100 + 200 - doc.widthOfString('Crossword Puzzle Would Appear Here') / 2, 
    doc.y + 150 - doc.currentLineHeight() / 2);
  
  doc.moveDown(20);
  
  // Add clues
  if (content.content?.clues) {
    doc.addPage();
    
    doc.fontSize(18).font('Helvetica-Bold').text('Clues', { align: 'center' });
    doc.moveDown();
    
    if (content.content.clues.across) {
      doc.fontSize(14).font('Helvetica-Bold').text('Across:', { underline: true });
      doc.moveDown();
      
      Object.entries(content.content.clues.across).forEach(([number, clue]: [string, any]) => {
        doc.fontSize(12).font('Helvetica-Bold').text(`${number}.`, { continued: true });
        doc.fontSize(12).font('Helvetica').text(` ${clue}`);
        doc.moveDown(0.5);
      });
      
      doc.moveDown();
    }
    
    if (content.content.clues.down) {
      doc.fontSize(14).font('Helvetica-Bold').text('Down:', { underline: true });
      doc.moveDown();
      
      Object.entries(content.content.clues.down).forEach(([number, clue]: [string, any]) => {
        doc.fontSize(12).font('Helvetica-Bold').text(`${number}.`, { continued: true });
        doc.fontSize(12).font('Helvetica').text(` ${clue}`);
        doc.moveDown(0.5);
      });
    }
  }
  
  // Add footer with target skills
  doc.moveDown();
  if (content.targetSkills) {
    doc.fontSize(10).font('Helvetica-Oblique').text(`Target Skills: ${content.targetSkills.join(', ')}`, { align: 'center' });
  }
};

// Helper function to create a word search PDF
const createWordSearchPDF = async (doc: PDFKit.PDFDocument, content: any) => {
  doc.fontSize(24).font('Helvetica-Bold').text(content.title, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(12).font('Helvetica').text(content.description, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(14).font('Helvetica-Bold').text('Instructions:', { underline: true });
  doc.fontSize(12).font('Helvetica').text(content.instructions);
  doc.moveDown();
  
  // Draw a placeholder for the word search grid
  doc.rect(100, doc.y, 400, 300).stroke();
  doc.fontSize(14).font('Helvetica').text('Word Search Grid Would Appear Here', 
    100 + 200 - doc.widthOfString('Word Search Grid Would Appear Here') / 2, 
    doc.y + 150 - doc.currentLineHeight() / 2);
  
  doc.moveDown(20);
  
  // Add word list
  if (content.content?.words) {
    doc.fontSize(14).font('Helvetica-Bold').text('Words to Find:', { underline: true });
    doc.moveDown();
    
    // Create a multi-column layout for the words
    const words = content.content.words;
    const columns = 3;
    const wordsPerColumn = Math.ceil(words.length / columns);
    
    for (let i = 0; i < wordsPerColumn; i++) {
      for (let j = 0; j < columns; j++) {
        const index = i + j * wordsPerColumn;
        if (index < words.length) {
          const x = doc.x + j * 150;
          doc.fontSize(12).font('Helvetica').text(words[index], x, doc.y);
        }
      }
      doc.moveDown();
    }
  }
  
  // Add footer with target skills
  doc.moveDown();
  if (content.targetSkills) {
    doc.fontSize(10).font('Helvetica-Oblique').text(`Target Skills: ${content.targetSkills.join(', ')}`, { align: 'center' });
  }
};

// Helper function to create a maze PDF
const createMazePDF = async (doc: PDFKit.PDFDocument, content: any) => {
  doc.fontSize(24).font('Helvetica-Bold').text(content.title, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(12).font('Helvetica').text(content.description, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(14).font('Helvetica-Bold').text('Instructions:', { underline: true });
  doc.fontSize(12).font('Helvetica').text(content.instructions);
  doc.moveDown();
  
  // Draw a placeholder for the maze
  doc.rect(100, doc.y, 400, 400).stroke();
  doc.fontSize(14).font('Helvetica').text('Maze Would Appear Here', 
    100 + 200 - doc.widthOfString('Maze Would Appear Here') / 2, 
    doc.y + 200 - doc.currentLineHeight() / 2);
  
  doc.moveDown(25);
  
  // Add any educational facts related to the maze
  if (content.content?.facts) {
    doc.fontSize(14).font('Helvetica-Bold').text('Fun Facts:', { underline: true });
    doc.moveDown();
    
    content.content.facts.forEach((fact: string, index: number) => {
      doc.fontSize(12).font('Helvetica').text(`• ${fact}`);
      doc.moveDown(0.5);
    });
  }
  
  // Add footer with target skills
  doc.moveDown();
  if (content.targetSkills) {
    doc.fontSize(10).font('Helvetica-Oblique').text(`Target Skills: ${content.targetSkills.join(', ')}`, { align: 'center' });
  }
};

// Generic PDF for any other type of activity
const createGenericPDF = async (doc: PDFKit.PDFDocument, content: any) => {
  doc.fontSize(24).font('Helvetica-Bold').text(content.title, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(12).font('Helvetica').text(content.description, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(14).font('Helvetica-Bold').text('Instructions:', { underline: true });
  doc.fontSize(12).font('Helvetica').text(content.instructions);
  doc.moveDown();
  
  // Add any content fields that are present
  if (content.content) {
    Object.entries(content.content).forEach(([key, value]) => {
      if (typeof value === 'string') {
        doc.fontSize(14).font('Helvetica-Bold').text(`${key.charAt(0).toUpperCase() + key.slice(1)}:`, { underline: true });
        doc.fontSize(12).font('Helvetica').text(value);
        doc.moveDown();
      } else if (Array.isArray(value)) {
        doc.fontSize(14).font('Helvetica-Bold').text(`${key.charAt(0).toUpperCase() + key.slice(1)}:`, { underline: true });
        value.forEach((item: any, index: number) => {
          if (typeof item === 'string') {
            doc.fontSize(12).font('Helvetica').text(`• ${item}`);
          } else if (typeof item === 'object') {
            Object.entries(item).forEach(([itemKey, itemValue]) => {
              if (typeof itemValue === 'string') {
                doc.fontSize(12).font('Helvetica-Bold').text(`${itemKey}:`, { continued: true });
                doc.fontSize(12).font('Helvetica').text(` ${itemValue}`);
              }
            });
          }
          doc.moveDown(0.5);
        });
        doc.moveDown();
      }
    });
  }
  
  // Add footer with target skills
  doc.moveDown();
  if (content.targetSkills) {
    doc.fontSize(10).font('Helvetica-Oblique').text(`Target Skills: ${content.targetSkills.join(', ')}`, { align: 'center' });
  }
};