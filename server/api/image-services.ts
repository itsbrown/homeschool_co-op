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
 * @desc Test image generation by creating a sample coloring page
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
    const imagePath = await generateAmericanSymbolsLineArt();
    
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
        imageSize: fs.statSync(imagePath).size,
        timestamp: new Date()
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

export default router;