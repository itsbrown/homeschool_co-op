import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { storage } from '../storage';
import { generateSvgForActivity } from './svgGenerator';

// Create uploads directory if it doesn't exist
const ensureDirectoryExists = async (dirPath: string) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`Error creating directory ${dirPath}:`, error);
    throw error;
  }
};

// Define standard fonts that are built into PDFKit
const STANDARD_FONT = 'Helvetica';
const BOLD_FONT = 'Helvetica-Bold';

/**
 * Generates a PDF worksheet from an activity
 * @param activityId The ID of the activity to generate a PDF for
 * @param userId User ID for permission checking
 * @returns Path to the generated PDF file
 */
export const generateWorksheetPDF = async (activityId: number, userId: number): Promise<string> => {
  try {
    // Get activity data - first try with user ID for permission check
    let activity = await storage.getActivityById(activityId, userId);
    
    // Fallback: if user is not the owner, try to get it if it's public
    if (!activity) {
      console.log(`Activity not found with user ID ${userId}, trying to access it as a public resource`);
      activity = await storage.getActivityById(activityId, 0); // 0 for public access
    }
    
    if (!activity) {
      throw new Error(`Activity with ID ${activityId} not found or not accessible.`);
    }
    
    console.log(`Found activity: ${activity.title}, type: ${activity.type}`); // Debugging

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
    console.log(`Setting PDF URL to: ${pdfUrl}`);
    const updatedActivity = await storage.updateActivityPdfUrl(activityId, pdfUrl);
    if (!updatedActivity) {
      console.error(`Failed to update activity ${activityId} with PDF URL ${pdfUrl}`);
    } else {
      console.log(`Successfully updated activity with PDF URL`);
    }
    
    return pdfUrl;
  } catch (error) {
    console.error(`Error generating PDF for activity ${activityId}:`, error);
    throw error;
  }
};

// Helper function to create a worksheet PDF
const createWorksheetPDF = async (doc: PDFKit.PDFDocument, content: any) => {
  doc.fontSize(24).font(BOLD_FONT).text(content.title, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(12).font(STANDARD_FONT).text(content.description, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(14).font(BOLD_FONT).text('Instructions:', { underline: true });
  doc.fontSize(12).font(STANDARD_FONT).text(content.instructions);
  doc.moveDown();
  
  // Add any questions or problems
  if (content.content?.questions) {
    doc.fontSize(14).font(BOLD_FONT).text('Questions:', { underline: true });
    doc.moveDown();
    
    content.content.questions.forEach((question: any, index: number) => {
      doc.fontSize(12).font(BOLD_FONT).text(`${index + 1}. ${question.question}`);
      doc.fontSize(10).font(STANDARD_FONT).text('Answer: _____________________________');
      doc.moveDown(0.5);
    });
  }
  
  // Add any problems or exercises
  if (content.content?.problems) {
    doc.fontSize(14).font(BOLD_FONT).text('Problems:', { underline: true });
    doc.moveDown();
    
    content.content.problems.forEach((problem: any, index: number) => {
      doc.fontSize(12).font(BOLD_FONT).text(`${index + 1}. ${problem.problem}`);
      doc.fontSize(10).font(STANDARD_FONT).text('Work space:');
      
      // Add a box for work
      doc.rect(doc.x, doc.y, 400, 100).stroke();
      doc.moveDown(8);
    });
  }
  
  // Add footer with target skills
  doc.moveDown();
  if (content.targetSkills) {
    doc.fontSize(10).font(STANDARD_FONT).text(`Target Skills: ${content.targetSkills.join(', ')}`, { align: 'center' });
  }
};

// Helper function to create a coloring page PDF
const createColoringPagePDF = async (doc: PDFKit.PDFDocument, content: any) => {
  // Use only standard fonts to avoid issues
  const REGULAR_FONT = 'Helvetica';
  const BOLD_FONT = 'Helvetica-Bold';
  
  doc.fontSize(24).font(BOLD_FONT).text(content.title, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(12).font(REGULAR_FONT).text(content.description, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(14).font(BOLD_FONT).text('Instructions:', { underline: true });
  doc.fontSize(12).font(REGULAR_FONT).text(content.instructions);
  doc.moveDown();
  
  // Add coloring instructions
  if (content.content?.elements) {
    doc.fontSize(14).font(BOLD_FONT).text('Coloring Guide:', { underline: true });
    doc.moveDown();
    
    content.content.elements.forEach((element: any) => {
      doc.fontSize(12).font(BOLD_FONT).text(`${element.name}:`);
      doc.fontSize(12).font(REGULAR_FONT).text(`${element.description}`);
      doc.moveDown(0.5);
    });
  }
  
  // Add image description (in a real implementation, we would generate or import an actual SVG here)
  doc.moveDown();
  // Use REGULAR_FONT instead of Helvetica-Italic which is causing the error
  doc.fontSize(12).font(REGULAR_FONT).text("Image Description:", { underline: true });
  if (content.content?.image) {
    doc.fontSize(12).font(REGULAR_FONT).text(content.content.image);
  }
  
  // Create the coloring image using SVG generator
  doc.moveDown();
  
  try {
    // Generate SVG content based on the activity title and description
    const svgContent = generateSvgForActivity(
      content.title, 
      'coloring',
      content.content?.image || 'American symbols'
    );
    
    // Create a temporary SVG file
    const svgFilePath = path.join(process.cwd(), 'uploads', 'temp', `temp_${Date.now()}.svg`);
    await ensureDirectoryExists(path.dirname(svgFilePath));
    fs.writeFileSync(svgFilePath, svgContent);
    
    // Add the SVG to the PDF
    doc.image(svgFilePath, 50, doc.y, { width: 500 });
    
    // Clean up temporary file
    setTimeout(() => {
      try {
        fs.unlinkSync(svgFilePath);
      } catch (e) {
        console.warn(`Failed to clean up temporary SVG file: ${e}`);
      }
    }, 1000);
  } catch (svgError) {
    console.error('Error generating SVG:', svgError);
    
    // Fallback to placeholder if SVG generation fails
    doc.rect(100, doc.y, 400, 300).stroke();
    doc.fontSize(14).font(STANDARD_FONT).text('Coloring Image Would Appear Here', 
      100 + 200 - doc.widthOfString('Coloring Image Would Appear Here') / 2, 
      doc.y + 150 - doc.currentLineHeight() / 2);
  }
  
  doc.moveDown(20);
  
  // Add learning facts if available
  if (content.content?.learningFacts) {
    doc.fontSize(14).font(BOLD_FONT).text('Did You Know?', { underline: true });
    doc.moveDown();
    
    content.content.learningFacts.forEach((fact: string, index: number) => {
      doc.fontSize(12).font(STANDARD_FONT).text(`• ${fact}`);
      doc.moveDown(0.5);
    });
  }
  
  // Add footer with target skills
  doc.moveDown();
  if (content.targetSkills) {
    doc.fontSize(10).font(STANDARD_FONT).text(`Target Skills: ${content.targetSkills.join(', ')}`, { align: 'center' });
  }
};

// Helper function to create a crossword puzzle PDF
const createCrosswordPDF = async (doc: PDFKit.PDFDocument, content: any) => {
  doc.fontSize(24).font(BOLD_FONT).text(content.title, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(12).font(STANDARD_FONT).text(content.description, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(14).font(BOLD_FONT).text('Instructions:', { underline: true });
  doc.fontSize(12).font(STANDARD_FONT).text(content.instructions);
  doc.moveDown();
  
  // Generate and add the crossword SVG
  try {
    // Generate SVG content based on the activity title
    const svgContent = generateSvgForActivity(
      content.title, 
      'crossword',
      ''
    );
    
    // Create a temporary SVG file
    const svgFilePath = path.join(process.cwd(), 'uploads', 'temp', `temp_${Date.now()}.svg`);
    await ensureDirectoryExists(path.dirname(svgFilePath));
    fs.writeFileSync(svgFilePath, svgContent);
    
    // Add the SVG to the PDF
    doc.image(svgFilePath, 50, doc.y, { width: 500 });
    
    // Clean up temporary file
    setTimeout(() => {
      try {
        fs.unlinkSync(svgFilePath);
      } catch (e) {
        console.warn(`Failed to clean up temporary SVG file: ${e}`);
      }
    }, 1000);
  } catch (svgError) {
    console.error('Error generating crossword SVG:', svgError);
    
    // Fallback to placeholder if SVG generation fails
    doc.rect(100, doc.y, 400, 300).stroke();
    doc.fontSize(14).font(STANDARD_FONT).text('Crossword Puzzle Would Appear Here', 
      100 + 200 - doc.widthOfString('Crossword Puzzle Would Appear Here') / 2, 
      doc.y + 150 - doc.currentLineHeight() / 2);
  }
  
  doc.moveDown(20);
  
  // Add clues
  if (content.content?.clues) {
    doc.addPage();
    
    doc.fontSize(18).font(BOLD_FONT).text('Clues', { align: 'center' });
    doc.moveDown();
    
    if (content.content.clues.across) {
      doc.fontSize(14).font(BOLD_FONT).text('Across:', { underline: true });
      doc.moveDown();
      
      Object.entries(content.content.clues.across).forEach(([number, clue]: [string, any]) => {
        doc.fontSize(12).font(BOLD_FONT).text(`${number}.`, { continued: true });
        doc.fontSize(12).font(STANDARD_FONT).text(` ${clue}`);
        doc.moveDown(0.5);
      });
      
      doc.moveDown();
    }
    
    if (content.content.clues.down) {
      doc.fontSize(14).font(BOLD_FONT).text('Down:', { underline: true });
      doc.moveDown();
      
      Object.entries(content.content.clues.down).forEach(([number, clue]: [string, any]) => {
        doc.fontSize(12).font(BOLD_FONT).text(`${number}.`, { continued: true });
        doc.fontSize(12).font(STANDARD_FONT).text(` ${clue}`);
        doc.moveDown(0.5);
      });
    }
  }
  
  // Add footer with target skills
  doc.moveDown();
  if (content.targetSkills) {
    doc.fontSize(10).font(STANDARD_FONT).text(`Target Skills: ${content.targetSkills.join(', ')}`, { align: 'center' });
  }
};

// Helper function to create a word search PDF
const createWordSearchPDF = async (doc: PDFKit.PDFDocument, content: any) => {
  doc.fontSize(24).font(BOLD_FONT).text(content.title, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(12).font(STANDARD_FONT).text(content.description, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(14).font(BOLD_FONT).text('Instructions:', { underline: true });
  doc.fontSize(12).font(STANDARD_FONT).text(content.instructions);
  doc.moveDown();
  
  // Generate and add the word search SVG
  try {
    // Generate SVG content based on the activity title
    const svgContent = generateSvgForActivity(
      content.title, 
      'wordsearch',
      ''
    );
    
    // Create a temporary SVG file
    const svgFilePath = path.join(process.cwd(), 'uploads', 'temp', `temp_${Date.now()}.svg`);
    await ensureDirectoryExists(path.dirname(svgFilePath));
    fs.writeFileSync(svgFilePath, svgContent);
    
    // Add the SVG to the PDF
    doc.image(svgFilePath, 50, doc.y, { width: 500 });
    
    // Clean up temporary file
    setTimeout(() => {
      try {
        fs.unlinkSync(svgFilePath);
      } catch (e) {
        console.warn(`Failed to clean up temporary SVG file: ${e}`);
      }
    }, 1000);
  } catch (svgError) {
    console.error('Error generating word search SVG:', svgError);
    
    // Fallback to placeholder if SVG generation fails
    doc.rect(100, doc.y, 400, 300).stroke();
    doc.fontSize(14).font(STANDARD_FONT).text('Word Search Grid Would Appear Here', 
      100 + 200 - doc.widthOfString('Word Search Grid Would Appear Here') / 2, 
      doc.y + 150 - doc.currentLineHeight() / 2);
  }
  
  doc.moveDown(20);
  
  // Add word list
  if (content.content?.words) {
    doc.fontSize(14).font(BOLD_FONT).text('Words to Find:', { underline: true });
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
          doc.fontSize(12).font(STANDARD_FONT).text(words[index], x, doc.y);
        }
      }
      doc.moveDown();
    }
  }
  
  // Add footer with target skills
  doc.moveDown();
  if (content.targetSkills) {
    doc.fontSize(10).font(STANDARD_FONT).text(`Target Skills: ${content.targetSkills.join(', ')}`, { align: 'center' });
  }
};

// Helper function to create a maze PDF
const createMazePDF = async (doc: PDFKit.PDFDocument, content: any) => {
  doc.fontSize(24).font(BOLD_FONT).text(content.title, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(12).font(STANDARD_FONT).text(content.description, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(14).font(BOLD_FONT).text('Instructions:', { underline: true });
  doc.fontSize(12).font(STANDARD_FONT).text(content.instructions);
  doc.moveDown();
  
  // Generate and add the maze SVG
  try {
    // Generate SVG content based on the activity title
    const svgContent = generateSvgForActivity(
      content.title, 
      'maze',
      ''
    );
    
    // Create a temporary SVG file
    const svgFilePath = path.join(process.cwd(), 'uploads', 'temp', `temp_${Date.now()}.svg`);
    await ensureDirectoryExists(path.dirname(svgFilePath));
    fs.writeFileSync(svgFilePath, svgContent);
    
    // Add the SVG to the PDF
    doc.image(svgFilePath, 50, doc.y, { width: 500 });
    
    // Clean up temporary file
    setTimeout(() => {
      try {
        fs.unlinkSync(svgFilePath);
      } catch (e) {
        console.warn(`Failed to clean up temporary SVG file: ${e}`);
      }
    }, 1000);
  } catch (svgError) {
    console.error('Error generating maze SVG:', svgError);
    
    // Fallback to placeholder if SVG generation fails
    doc.rect(100, doc.y, 400, 400).stroke();
    doc.fontSize(14).font(STANDARD_FONT).text('Maze Would Appear Here', 
      100 + 200 - doc.widthOfString('Maze Would Appear Here') / 2, 
      doc.y + 200 - doc.currentLineHeight() / 2);
  }
  
  doc.moveDown(25);
  
  // Add any educational facts related to the maze
  if (content.content?.facts) {
    doc.fontSize(14).font(BOLD_FONT).text('Fun Facts:', { underline: true });
    doc.moveDown();
    
    content.content.facts.forEach((fact: string, index: number) => {
      doc.fontSize(12).font(STANDARD_FONT).text(`• ${fact}`);
      doc.moveDown(0.5);
    });
  }
  
  // Add footer with target skills
  doc.moveDown();
  if (content.targetSkills) {
    doc.fontSize(10).font(STANDARD_FONT).text(`Target Skills: ${content.targetSkills.join(', ')}`, { align: 'center' });
  }
};

// Generic PDF for any other type of activity
const createGenericPDF = async (doc: PDFKit.PDFDocument, content: any) => {
  doc.fontSize(24).font(BOLD_FONT).text(content.title, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(12).font(STANDARD_FONT).text(content.description, { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(14).font(BOLD_FONT).text('Instructions:', { underline: true });
  doc.fontSize(12).font(STANDARD_FONT).text(content.instructions);
  doc.moveDown();
  
  // Add any content fields that are present
  if (content.content) {
    Object.entries(content.content).forEach(([key, value]) => {
      if (typeof value === 'string') {
        doc.fontSize(14).font(BOLD_FONT).text(`${key.charAt(0).toUpperCase() + key.slice(1)}:`, { underline: true });
        doc.fontSize(12).font(STANDARD_FONT).text(value);
        doc.moveDown();
      } else if (Array.isArray(value)) {
        doc.fontSize(14).font(BOLD_FONT).text(`${key.charAt(0).toUpperCase() + key.slice(1)}:`, { underline: true });
        value.forEach((item: any, index: number) => {
          if (typeof item === 'string') {
            doc.fontSize(12).font(STANDARD_FONT).text(`• ${item}`);
          } else if (typeof item === 'object') {
            Object.entries(item).forEach(([itemKey, itemValue]) => {
              if (typeof itemValue === 'string') {
                doc.fontSize(12).font(BOLD_FONT).text(`${itemKey}:`, { continued: true });
                doc.fontSize(12).font(STANDARD_FONT).text(` ${itemValue}`);
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
    doc.fontSize(10).font(STANDARD_FONT).text(`Target Skills: ${content.targetSkills.join(', ')}`, { align: 'center' });
  }
};