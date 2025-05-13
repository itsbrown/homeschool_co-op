import { 
  isHuggingFaceAvailable, 
  generateAmericanSymbolsLineArt as generateAmericanSymbolsLineArtHF,
  generateEducationalLineArt as generateEducationalLineArtHF
} from './huggingfaceService';

import { 
  isSageMakerAvailable, 
  generateAmericanSymbolsLineArtSageMaker, 
  generateEducationalLineArtSageMaker 
} from './sagemakerService';

/**
 * Check if any image generation service is available
 * @returns Boolean indicating if at least one image generation service is available
 */
export const isImageGenerationAvailable = (): boolean => {
  return isHuggingFaceAvailable() || isSageMakerAvailable();
};

/**
 * Get the preferred image generation service
 * @returns String indicating the preferred service ('sagemaker', 'huggingface', or 'none')
 */
export const getPreferredImageService = (): 'sagemaker' | 'huggingface' | 'none' => {
  // Prefer SageMaker if available, then fall back to Hugging Face
  if (isSageMakerAvailable()) {
    return 'sagemaker';
  } else if (isHuggingFaceAvailable()) {
    return 'huggingface';
  } else {
    return 'none';
  }
};

/**
 * Generate an American historical symbols image for coloring
 * Uses the optimal available service (SageMaker first, then Hugging Face)
 * 
 * @returns Path to the generated image
 */
export async function generateAmericanSymbolsLineArt(): Promise<string> {
  const preferredService = getPreferredImageService();
  
  if (preferredService === 'sagemaker') {
    console.log('Using SageMaker for American symbols line art');
    return await generateAmericanSymbolsLineArtSageMaker();
  } else if (preferredService === 'huggingface') {
    console.log('Using Hugging Face for American symbols line art');
    return await generateAmericanSymbolsLineArtHF();
  } else {
    throw new Error('No image generation service available');
  }
}

/**
 * Generate a line art image based on educational topic
 * Uses the optimal available service (SageMaker first, then Hugging Face)
 * 
 * @param title Title/topic of the coloring page
 * @param description Additional description or details
 * @returns Path to the generated image
 */
export async function generateEducationalLineArt(
  title: string,
  description?: string
): Promise<string> {
  const preferredService = getPreferredImageService();
  
  if (preferredService === 'sagemaker') {
    console.log('Using SageMaker for educational line art');
    return await generateEducationalLineArtSageMaker(title, description);
  } else if (preferredService === 'huggingface') {
    console.log('Using Hugging Face for educational line art');
    return await generateEducationalLineArtHF(title, description);
  } else {
    throw new Error('No image generation service available');
  }
}