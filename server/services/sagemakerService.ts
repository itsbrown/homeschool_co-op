import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { ensureDirectoryExists } from './huggingfaceService';

const writeFileAsync = promisify(fs.writeFile);

/**
 * Check if Amazon SageMaker API is available
 * @returns Boolean indicating if the API is available
 */
export const isSageMakerAvailable = (): boolean => {
  return !!process.env.SAGEMAKER_ENDPOINT;
};

/**
 * Generate an American historical symbols image for coloring using SageMaker Stable Diffusion
 * 
 * @returns Path to the generated image
 */
export async function generateAmericanSymbolsLineArtSageMaker(): Promise<string> {
  const prompt = "A simplified cartoon-style scene for young children showing George Washington in his general's uniform, the Liberty Bell with a crack, an American flag with 13 stars in a circle, and Independence Hall in Philadelphia, black-and-white line art";
  
  return await generateLineArtSageMaker(prompt, `american_symbols_sagemaker_${Date.now()}.png`);
}

/**
 * Generate a line art image based on educational topic using SageMaker
 * Tailors the prompt to create age-appropriate historical/educational content
 * 
 * @param title Title/topic of the coloring page
 * @param description Additional description or details
 * @returns Path to the generated image
 */
export async function generateEducationalLineArtSageMaker(
  title: string,
  description?: string
): Promise<string> {
  let prompt = title;
  
  if (description) {
    prompt += `: ${description}`;
  }
  
  // Add educational context to make it appropriate for children
  prompt += `, simplified cartoon-style black-and-white line art for children's coloring page, no shading, clear outlines`;
  
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_sagemaker_${Date.now()}.png`;
  return await generateLineArtSageMaker(prompt, filename);
}

/**
 * Generates a black and white line art image for coloring using SageMaker Stable Diffusion endpoint
 * 
 * @param prompt Description of the image to generate
 * @param outputFilename Filename to save the image to (without path)
 * @returns Path to the generated image
 */
export async function generateLineArtSageMaker(
  prompt: string,
  outputFilename = `lineArt_sagemaker_${Date.now()}.png`
): Promise<string> {
  try {
    console.log(`Generating line art via SageMaker for prompt: "${prompt}"`);

    if (!process.env.SAGEMAKER_ENDPOINT) {
      throw new Error('SAGEMAKER_ENDPOINT environment variable is not set');
    }

    // Ensure the uploads directory exists
    const uploadDir = path.join(process.cwd(), 'uploads', 'images');
    await ensureDirectoryExists(uploadDir);
    
    // Complete path for the output file
    const outputPath = path.join(uploadDir, outputFilename);
    
    // Use fetch to send request to SageMaker endpoint
    const response = await fetch(process.env.SAGEMAKER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        negative_prompt: "color, shading, realistic, complex details",
        steps: 50,
        cfg_scale: 7.5
      })
    });
    
    // Check if the request was successful
    if (!response.ok) {
      throw new Error(`SageMaker API error: ${response.status} ${response.statusText}`);
    }
    
    // Parse the response body
    const responseData = await response.json();
    
    // Check if response contains the expected data
    if (!responseData.image) {
      throw new Error('Invalid response format from SageMaker endpoint');
    }
    
    // Decode base64 image
    const imageBuffer = Buffer.from(responseData.image, 'base64');
    
    // Write the image to file
    await writeFileAsync(outputPath, imageBuffer);
    
    console.log(`Line art successfully generated via SageMaker and saved to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Error generating line art with SageMaker:', error);
    
    // Throw the error to be handled by the calling function
    // This allows the imageGenerationService to fallback to Hugging Face if available
    throw new Error(`SageMaker image generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}