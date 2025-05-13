import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { storage } from '../storage';
import { generateSvgForActivity } from './svgGenerator';
import { 
  isImageGenerationAvailable, 
  generateAmericanSymbolsLineArt, 
  generateEducationalLineArt 
} from './imageGenerationService';

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
  
  // Add coloring guide - handle multiple potential data structures
  doc.fontSize(14).font(BOLD_FONT).text('Coloring Guide:', { underline: true });
  doc.moveDown();
  
  // Different possible structures based on AI models (OpenAI vs Anthropic)
  let hasColoringGuide = false;
  
  // Structure 1: content.content.elements array with name/description
  if (content.content?.elements && Array.isArray(content.content.elements)) {
    hasColoringGuide = true;
    content.content.elements.forEach((element: any) => {
      if (typeof element === 'object' && element !== null) {
        // Handle objects with name and description
        if (element.name && element.description) {
          doc.fontSize(12).font(BOLD_FONT).text(`${element.name}:`);
          doc.fontSize(12).font(REGULAR_FONT).text(`${element.description}`);
        } 
        // Handle objects with element and instruction
        else if (element.element && element.instruction) {
          doc.fontSize(12).font(BOLD_FONT).text(`${element.element}:`);
          doc.fontSize(12).font(REGULAR_FONT).text(`${element.instruction}`);
        }
        // If we have just a string in the elements array
        else if (typeof element === 'string') {
          doc.fontSize(12).font(BOLD_FONT).text(`${element}:`);
          doc.fontSize(12).font(REGULAR_FONT).text(`Color this element as you like`);
        }
        doc.moveDown(0.5);
      }
    });
  }
  
  // Structure 2: content.coloring_guide array
  if (content.coloring_guide && Array.isArray(content.coloring_guide)) {
    hasColoringGuide = true;
    content.coloring_guide.forEach((guide: any) => {
      if (typeof guide === 'object' && guide !== null) {
        if (guide.element && guide.instruction) {
          doc.fontSize(12).font(BOLD_FONT).text(`${guide.element}:`);
          doc.fontSize(12).font(REGULAR_FONT).text(`${guide.instruction}`);
        }
        doc.moveDown(0.5);
      }
    });
  }
  
  // Structure 3: content.content.theme with elements array
  if (content.content?.theme && content.content?.elements && Array.isArray(content.content.elements)) {
    hasColoringGuide = true;
    // Simple elements array with just strings
    content.content.elements.forEach((element: string) => {
      doc.fontSize(12).font(BOLD_FONT).text(`${element}:`);
      
      // Use appropriate text based on content subject
      if (content.title.toLowerCase().includes('american symbol')) {
        doc.fontSize(12).font(REGULAR_FONT).text(`Color this important American symbol`);
      } else if (content.subject) {
        doc.fontSize(12).font(REGULAR_FONT).text(`Color this ${content.subject.toLowerCase()} element`);
      } else {
        doc.fontSize(12).font(REGULAR_FONT).text(`Color this element according to your creativity`);
      }
      
      doc.moveDown(0.5);
    });
  }
  
  // If no coloring guide was found at all, add some generic guidance
  if (!hasColoringGuide) {
    // Extract potential elements from the title and description
    const text = `${content.title} ${content.description || ''} ${content.content?.image || ''}`.toLowerCase();
    
    // Create a generic coloring guide based on the content
    const elements: string[] = [];
    
    // Try to extract names of people, objects, or concepts from the title/description
    const titleWords = content.title.split(' ');
    const namePattern = /^[A-Z][a-z]+/; // Simple pattern to identify proper nouns
    
    titleWords.forEach((word: string) => {
      if (namePattern.test(word) && word.length > 3) {
        elements.push(word);
      }
    });
    
    // Check if this appears to be about a historical figure
    if (text.includes('antoinette') && text.includes('brown') && text.includes('blackwell')) {
      doc.fontSize(12).font(BOLD_FONT).text(`Antoinette Brown Blackwell:`);
      doc.fontSize(12).font(REGULAR_FONT).text(`First ordained woman minister in the United States`);
      doc.moveDown(0.5);
      
      doc.fontSize(12).font(BOLD_FONT).text(`Dress and Robe:`);
      doc.fontSize(12).font(REGULAR_FONT).text(`Typical clothing of the 19th century`);
      doc.moveDown(0.5);
      
      doc.fontSize(12).font(BOLD_FONT).text(`Surroundings:`);
      doc.fontSize(12).font(REGULAR_FONT).text(`Nature elements showing her connection to spirituality`);
      doc.moveDown(0.5);
    } 
    // American symbols fallback - only if explicitly about American symbols
    else if (content.title.toLowerCase().includes('american symbol') || 
            (content.title.toLowerCase().includes('founding') && content.title.toLowerCase().includes('symbol'))) {
      
      doc.fontSize(12).font(BOLD_FONT).text(`Liberty Bell:`);
      doc.fontSize(12).font(REGULAR_FONT).text(`Famous bell with a crack, rung for independence`);
      doc.moveDown(0.5);
      
      doc.fontSize(12).font(BOLD_FONT).text(`American Flag:`);
      doc.fontSize(12).font(REGULAR_FONT).text(`The original flag with 13 stars arranged in a circle`);
      doc.moveDown(0.5);
      
      doc.fontSize(12).font(BOLD_FONT).text(`Eagle:`);
      doc.fontSize(12).font(REGULAR_FONT).text(`National bird of the United States`);
      doc.moveDown(0.5);
    }
    // Generic guidance for other topics
    else {
      // Use elements from the title if we extracted any
      if (elements.length > 0) {
        elements.forEach((element: string) => {
          doc.fontSize(12).font(BOLD_FONT).text(`${element}:`);
          doc.fontSize(12).font(REGULAR_FONT).text(`Color this element based on historical accuracy or your imagination`);
          doc.moveDown(0.5);
        });
      } else {
        // Most generic fallback if we couldn't extract anything specific
        doc.fontSize(12).font(BOLD_FONT).text(`Main Subject:`);
        doc.fontSize(12).font(REGULAR_FONT).text(`Color the main subject with appropriate colors`);
        doc.moveDown(0.5);
        
        doc.fontSize(12).font(BOLD_FONT).text(`Background Elements:`);
        doc.fontSize(12).font(REGULAR_FONT).text(`Color the surroundings to enhance the main subject`);
        doc.moveDown(0.5);
      }
    }
  }
  
  // Optional image description (if provided)
  if (content.content?.image || content.content?.description) {
    doc.moveDown();
    doc.fontSize(12).font(REGULAR_FONT).text("Image Description:", { underline: true });
    doc.fontSize(12).font(REGULAR_FONT).text(content.content?.image || content.content?.description || "");
  }
  
  // Create the coloring image using SVG generator
  doc.moveDown();
  
  try {
    // Use the imported image generation service functions
    // Determine if we should use AI-generated images
    const useAiGeneration = isImageGenerationAvailable();
    let imagePath = '';
    
    if (useAiGeneration) {
      console.log('Using AI service for dynamic line art generation');
      
      try {
        // Always use the most appropriate image generation function based on content
        // No longer restricting to only American symbols/history
        
        // Only use the American symbols generator for content explicitly about American founding symbols
        if ((content.title.toLowerCase().includes('american symbols') || content.title.toLowerCase().includes('founding symbols')) && 
            (content.content?.image && 
             (content.content.image.toLowerCase().includes('liberty bell') || 
              content.content.image.toLowerCase().includes('washington') ||
              content.content.image.toLowerCase().includes('american flag') ||
              content.content.image.toLowerCase().includes('independence hall')))) {
          // Specifically for American symbols/history content that matches all key elements
          console.log('Using specialized American symbols image generator');
          imagePath = await generateAmericanSymbolsLineArt();
        } else {
          // For all other educational content - more flexible approach
          console.log('Using general educational image generator for: ' + content.title);
          imagePath = await generateEducationalLineArt(
            content.title,
            content.content?.image || content.description
          );
        }
        
        console.log('AI generated image path:', imagePath);
        
        // Always add a new page for the image to prevent text overlap
        doc.addPage();
        
        // Add a title to the new page
        doc.fontSize(14).font('Helvetica-Bold').text('Coloring Page', { align: 'center' });
        doc.moveDown();
        
        // Calculate the optimal image dimensions with fixed width to ensure quality
        const maxWidth = 500;
        const pageMarginTop = 50;
        const pageMarginBottom = 50;
        const availableHeight = doc.page.height - pageMarginTop - pageMarginBottom - 40; // 40px for the title
        const maxHeight = Math.min(600, availableHeight);
        
        // Center the image horizontally
        const xPosition = (doc.page.width - maxWidth) / 2;
        
        // Add the generated image to the PDF with dynamic sizing
        doc.image(imagePath, xPosition, doc.y, { 
          width: maxWidth,
          height: maxHeight,
          fit: [maxWidth, maxHeight],
          align: 'center'
        });
        
        console.log('AI-generated image added to PDF with dimensions:', { maxWidth, maxHeight });
        
        // Clean up the image file after a delay (optional)
        setTimeout(() => {
          try {
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            console.log('Temporary AI image file cleaned up');
          } catch (e) {
            console.warn(`Failed to clean up AI image file: ${e}`);
          }
        }, 5000);
      } catch (aiError) {
        console.error('Error generating AI image:', aiError);
        throw new Error('AI image generation failed, falling back to SVG');
      }
    } else {
      // Fallback to SVG generation if no image service (Hugging Face or SageMaker) is available
      console.log('No image generation service available (Hugging Face or SageMaker), falling back to SVG generation');
      
      // Add a notice about image service unavailability
      doc.moveDown();
      doc.fontSize(12).font('Helvetica-Bold').fillColor('red')
         .text('Note: Authentic image generation service is not available.', { align: 'center' });
      doc.fontSize(10).font('Helvetica').fillColor('red')
         .text('Contact your administrator to enable Hugging Face or SageMaker API for image generation.', { align: 'center' });
      doc.moveDown();
      doc.fillColor('black');
      
      // Import sharp for SVG to PNG conversion
      const sharp = require('sharp');
      
      // Generate SVG content based on the activity title and description
      // Use the actual content description, not a hardcoded American symbols fallback
      let svgContent = generateSvgForActivity(
        content.title, 
        'coloring',
        content.content?.image || content.description || content.title
      );
      
      // Ensure SVG content is properly formatted
      if (!svgContent.trim().startsWith('<svg')) {
        svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
          ${svgContent}
        </svg>`;
      }
      
      // Create temporary directory if it doesn't exist
      const tempDir = path.join(process.cwd(), 'uploads', 'temp');
      await ensureDirectoryExists(tempDir);
      
      // Create unique filenames using timestamp and random string
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 10);
      const svgFilePath = path.join(tempDir, `temp_${timestamp}_${randomString}.svg`);
      const pngFilePath = path.join(tempDir, `temp_${timestamp}_${randomString}.png`);
      
      console.log('Using SVG file path:', svgFilePath);
      console.log('Using PNG file path:', pngFilePath);
      
      // Write SVG to file
      fs.writeFileSync(svgFilePath, svgContent, 'utf8');
      console.log('SVG written to file');
      
      // Create a buffer from the SVG content for Sharp to process
      const svgBuffer = Buffer.from(svgContent);
      
      // Convert SVG to PNG using buffer input instead of file
      await sharp(svgBuffer)
        .resize(800, 600)
        .png()
        .toFile(pngFilePath);
      
      console.log('SVG converted to PNG');
      
      // Add the PNG to the PDF
      doc.image(pngFilePath, 50, doc.y, { width: 500 });
      console.log('PNG added to PDF');
      
      // Clean up temporary files
      setTimeout(() => {
        try {
          if (fs.existsSync(svgFilePath)) fs.unlinkSync(svgFilePath);
          if (fs.existsSync(pngFilePath)) fs.unlinkSync(pngFilePath);
          console.log('Temporary files cleaned up');
        } catch (e) {
          console.warn(`Failed to clean up temporary files: ${e}`);
        }
      }, 3000);
    }
  } catch (imageError) {
    console.error('Error generating image:', imageError);
    
    // Try fallback using direct SVG rendering without file operations
    try {
      console.log('Attempting fallback SVG rendering method');
      // Use content description or title for the SVG, not hardcoded American symbols
      const svgContent = generateSvgForActivity(
        content.title, 
        'coloring',
        content.content?.image || content.description || content.title
      );
      
      // Encode SVG as base64 data URL
      const svgBase64 = Buffer.from(svgContent).toString('base64');
      const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
      
      // Create a placeholder for the image and add a note about it
      doc.rect(100, doc.y, 400, 300).stroke();
      
      // Use dynamic title from the content
      const imageTitle = `Coloring Image: ${content.title}`;
      doc.fontSize(14)
         .font(STANDARD_FONT)
         .text(imageTitle, 
            100 + 200 - doc.widthOfString(imageTitle) / 2, 
            doc.y + 20);
            
      // Use dynamic description from the content
      const imageDescription = content.description || 
                              content.content?.image || 
                              `This is a coloring page about ${content.title}`;
                              
      doc.fontSize(12)
         .font(STANDARD_FONT)
         .text(imageDescription, 150, doc.y + 50, { align: 'center' });
         
      console.log('Added fallback image description');
    } catch (fallbackError) {
      console.error('Fallback SVG rendering also failed:', fallbackError);
      
      // Ultimate fallback to simple placeholder
      doc.rect(100, doc.y, 400, 300).stroke();
      doc.fontSize(14)
         .font(STANDARD_FONT)
         .text('Coloring Image Would Appear Here', 
           100 + 200 - doc.widthOfString('Coloring Image Would Appear Here') / 2, 
           doc.y + 150 - doc.currentLineHeight() / 2);
    }
  }
  
  doc.moveDown(20);
  
  // Add learning facts on a new page or in a small sidebar so they don't overlap the image
  if (content.content?.learningFacts) {
    // Add a new page for the facts
    doc.addPage();
    
    // Add a more discreet header for the facts section
    // Use a dynamic title based on the content subject
    if (content.title.toLowerCase().includes('american') || 
        content.title.toLowerCase().includes('history')) {
      doc.fontSize(12).font(BOLD_FONT).text('Fun Facts About American History', { align: 'center' });
    } else {
      doc.fontSize(12).font(BOLD_FONT).text(`Fun Facts About ${content.subject || 'This Topic'}`, { align: 'center' });
    }
    doc.moveDown();
    
    // Add the facts with smaller font and more subtle formatting
    content.content.learningFacts.forEach((fact: string, index: number) => {
      doc.fontSize(10).font(STANDARD_FONT).text(`• ${fact}`);
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