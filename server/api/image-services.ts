import { Router } from 'express';
import { 
  isHuggingFaceAvailable, 
  generateAmericanSymbolsLineArt as generateHfAmericanSymbols 
} from '../services/huggingfaceService';
import { isSageMakerAvailable } from '../services/sagemakerService';
import { 
  getPreferredImageService,
  generateAmericanSymbolsLineArt
} from '../services/imageGenerationService';
import fs from 'fs';
import path from 'path';

const router = Router();

/**
 * @route GET /api/image-services/status
 * @desc Get the status of all image generation services
 * @access Public
 */
router.get('/status', async (req, res) => {
  try {
    const huggingFaceAvailable = isHuggingFaceAvailable();
    const sageMakerAvailable = isSageMakerAvailable();
    const preferredService = getPreferredImageService();
    
    res.json({
      status: 'success',
      data: {
        huggingFace: {
          available: huggingFaceAvailable,
          status: huggingFaceAvailable ? 'operational' : 'unavailable'
        },
        sageMaker: {
          available: sageMakerAvailable,
          status: sageMakerAvailable ? 'operational' : 'unavailable'
        },
        preferredService: preferredService,
        anyServiceAvailable: huggingFaceAvailable || sageMakerAvailable
      }
    });
  } catch (error) {
    console.error('Error checking image services status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to check image services status',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @route GET /api/image-services/test-generation
 * @desc Test image generation by creating a sample coloring page image only
 * @access Public
 */
router.get('/test-generation', async (req, res) => {
  try {
    if (!isHuggingFaceAvailable()) {
      return res.status(400).json({
        status: 'error', 
        message: 'Hugging Face API key not configured. Please contact your administrator to provide a HUGGINGFACE_API_KEY.'
      });
    }
    
    console.log('Starting test image generation with American symbols');
    
    // Start timing
    const startTime = Date.now();
    
    // Generate the image
    const imagePath = await generateAmericanSymbolsLineArt();
    
    // End timing
    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000; // in seconds
    
    // Check cache info
    const cacheDir = path.join(process.cwd(), 'uploads', 'cache');
    const cacheFilename = 'american_symbols_cached.png';
    const cachedPath = path.join(cacheDir, cacheFilename);
    const cacheExists = fs.existsSync(cachedPath);
    const cacheCreated = cacheExists ? fs.statSync(cachedPath).birthtime : null;
    
    // Prepare relative URL from absolute path
    const relativePath = '/uploads/images/' + path.basename(imagePath);
    
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return res.status(500).json({
        status: 'error',
        message: 'Image generation returned a path but the file does not exist'
      });
    }
    
    res.json({
      status: 'success',
      message: 'Test image successfully generated',
      data: {
        imagePath: relativePath,
        imageUrl: `${req.protocol}://${req.get('host')}${relativePath}`,
        imageSize: fs.statSync(imagePath).size,
        timestamp: new Date(),
        processingTime: `${processingTime.toFixed(2)} seconds`,
        imageService: 'Hugging Face Stable Diffusion',
        cacheInfo: {
          cacheUsed: processingTime < 1.0, // Likely used cache if very fast
          cacheExists,
          cachePath: cacheExists ? cachedPath : null,
          cacheCreated: cacheCreated ? cacheCreated.toISOString() : null,
          cacheSize: cacheExists ? fs.statSync(cachedPath).size : null
        }
      }
    });
  } catch (error) {
    console.error('Error in test image generation:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate test image',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @route GET /api/image-services/test-coloring-pdf
 * @desc Test the generation of a complete coloring page PDF with AI image
 * @access Public
 */
router.get('/test-coloring-pdf', async (req, res) => {
  try {
    if (!isHuggingFaceAvailable()) {
      return res.status(400).json({
        status: 'error', 
        message: 'Hugging Face API key not configured. Please contact your administrator to provide a HUGGINGFACE_API_KEY.'
      });
    }
    
    // Clear existing cache to ensure a fresh image is generated
    try {
      const fs = require('fs');
      const path = require('path');
      const cacheDir = path.join(process.cwd(), 'uploads', 'cache');
      const cacheFile = path.join(cacheDir, 'american_symbols_cached.png');
      
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
        console.log('Cleared cached image to force a fresh generation');
      }
    } catch (cacheError) {
      console.warn('Error clearing cache:', cacheError);
    }
    
    // Import PDF generator
    const { generateWorksheetPDF } = await import('../services/pdfGenerator');
    const { storage } = await import('../storage');
    
    // Create a sample coloring page activity with enhanced elements for accurate rendering
    const sampleActivity = {
      title: "America's Important Symbols - Coloring Page",
      type: "coloring" as "worksheet" | "crossword" | "coloring" | "wordsearch" | "maze",
      subject: "History",
      difficulty: "beginner" as "beginner" | "intermediate" | "advanced",
      ageRange: "5-8",
      content: {
        title: "America's Important Symbols - Coloring Page",
        description: "A coloring page featuring detailed American historical symbols for young learners.",
        instructions: "Color each part of the picture carefully. Think about what each symbol means to American history. Use the coloring guide below for ideas or choose your own colors!",
        targetSkills: ["History knowledge", "Fine motor skills", "Symbol recognition", "Following directions"],
        content: {
          image: "This illustration features clearly separated historical American symbols: George Washington in his general's uniform with distinct facial features, the Liberty Bell with its famous crack clearly visible, a 13-star American flag with properly drawn five-pointed stars, and Independence Hall with its recognizable façade.",
          elements: [
            { name: "George Washington", description: "America's first president - color his uniform blue and his hair white" },
            { name: "Liberty Bell", description: "Famous bell with a crack - color it brown or gold" },
            { name: "13-Star Flag", description: "The original American flag with 13 five-pointed stars in a circle" },
            { name: "Independence Hall", description: "Famous building where important documents were signed" },
            { name: "Bald Eagle", description: "America's national bird - color its head white and body brown" }
          ]
        }
      },
      authorId: 1,
      isPublic: true
    };
    
    // Save temporary activity in database
    const savedActivity = await storage.createActivity(sampleActivity);
    
    if (!savedActivity || !savedActivity.id) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to create temporary activity in database'
      });
    }
    
    console.log('Starting PDF generation for test coloring page');
    
    // Generate the PDF
    const pdfUrl = await generateWorksheetPDF(savedActivity.id, 1);
    
    // Update the activity with the PDF URL
    await storage.updateActivityPdfUrl(savedActivity.id, pdfUrl);
    
    res.json({
      status: 'success',
      message: 'Test coloring page PDF generated successfully',
      data: {
        activityId: savedActivity.id,
        pdfUrl,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error generating test coloring PDF:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate test coloring PDF',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;