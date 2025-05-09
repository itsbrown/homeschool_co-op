import { Request, Response } from 'express';
import { isAnthropicAvailable } from '../services/anthropicService';
import { isEnhancedGenerationAvailable } from '../services/aiEnhancedGeneration';

/**
 * Returns the status of the AI services
 */
export const getAIStatus = async (req: Request, res: Response) => {
  try {
    const isAvailable = isAnthropicAvailable();
    const isEnhancedAvailable = isEnhancedGenerationAvailable();
    
    return res.status(200).json({
      anthropic: {
        available: isAvailable,
        status: isAvailable ? 'operational' : 'unavailable',
        message: isAvailable 
          ? 'Anthropic API is available and operational' 
          : 'Anthropic API is currently unavailable, using fallback mechanisms'
      },
      enhancedAI: {
        available: isEnhancedAvailable,
        status: isEnhancedAvailable ? 'operational' : 'unavailable',
        message: isEnhancedAvailable
          ? 'Enhanced AI capabilities for knowledge base integration are available'
          : 'Enhanced AI capabilities are unavailable, using standard generation'
      }
    });
  } catch (error) {
    console.error('Error checking AI status:', error);
    return res.status(500).json({ 
      message: 'Failed to check AI service status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};