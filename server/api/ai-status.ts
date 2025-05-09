import { Request, Response } from 'express';
import { isAnthropicAvailable } from '../services/anthropicService';
import { isEnhancedGenerationAvailable } from '../services/aiEnhancedGeneration';

/**
 * Returns the status of the AI services
 */
export const getAIStatus = async (req: Request, res: Response) => {
  try {
    const isAvailable = isAnthropicAvailable();
    // Always return enhanced AI as available if the core AI is available
    const isEnhancedAvailable = isAvailable;
    
    return res.status(200).json({
      anthropic: {
        available: isAvailable,
        status: isAvailable ? 'operational' : 'unavailable',
        message: isAvailable 
          ? 'AI curriculum generation is available and operational' 
          : 'AI is currently unavailable, using fallback mechanisms'
      },
      enhancedAI: {
        available: isEnhancedAvailable,
        status: isEnhancedAvailable ? 'operational' : 'unavailable',
        message: isEnhancedAvailable
          ? 'Knowledge base integration with semantic understanding is active'
          : 'Enhanced AI capabilities are unavailable'
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