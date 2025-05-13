import { Router } from 'express';
import { isHuggingFaceAvailable } from '../services/huggingfaceService';
import { isSageMakerAvailable } from '../services/sagemakerService';
import { getPreferredImageService } from '../services/imageGenerationService';

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

export default router;