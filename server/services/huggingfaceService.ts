import { HfInference } from '@huggingface/inference';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const writeFileAsync = promisify(fs.writeFile);

// Helper function to ensure a directory exists
export const ensureDirectoryExists = async (dirPath: string) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`Error creating directory ${dirPath}:`, error);
    throw error;
  }
};

// Initialize Hugging Face client
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

/**
 * Check if Hugging Face API is available
 * @returns Boolean indicating if the API is available
 */
export const isHuggingFaceAvailable = (): boolean => {
  return !!process.env.HUGGINGFACE_API_KEY;
};

/**
 * Generates a black and white line art image for coloring using Stable Diffusion
 * 
 * @param prompt Description of the image to generate
 * @param outputFilename Filename to save the image to (without path)
 * @returns Path to the generated image
 */
export async function generateLineArt(
  prompt: string,
  outputFilename = `lineArt_${Date.now()}.png`
): Promise<string> {
  try {
    console.log(`Generating line art for prompt: "${prompt}"`);

    // Ensure the uploads directory exists
    const uploadDir = path.join(process.cwd(), 'uploads', 'images');
    await ensureDirectoryExists(uploadDir);
    
    // Complete path for the output file
    const outputPath = path.join(uploadDir, outputFilename);
    
    // Enhance the prompt for line art generation
    const enhancedPrompt = `A simple black and white line drawing for a children's coloring page of: ${prompt}. Clean lines, no shading, suitable for coloring by young children.`;
    
    console.log(`Using enhanced prompt: "${enhancedPrompt}"`);
    
    // Use Hugging Face text-to-image model
    const response = await hf.textToImage({
      model: 'stabilityai/stable-diffusion-xl-base-1.0',  // Using SDXL as it's more reliable
      inputs: enhancedPrompt,
      parameters: {
        negative_prompt: 'color, shading, realistic, detailed, grayscale, complexity, photorealistic',
        guidance_scale: 7.5,
        num_inference_steps: 30,
      }
    });
    
    // Handle different response types from Hugging Face
    let buffer;
    
    if (Buffer.isBuffer(response)) {
      // Already a buffer
      buffer = response;
    } else if (typeof response === 'string') {
      // Base64 string
      if (response.startsWith('data:')) {
        // Remove the data URL prefix
        const base64Data = response.split(',')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        buffer = Buffer.from(response, 'base64');
      }
    } else {
      // For other response types (like Blob), we'll need to use node-fetch or similar
      // This is a simplified version
      console.log('Response type:', typeof response);
      
      // If response has arrayBuffer method, use it
      if (response && typeof response === 'object' && 'arrayBuffer' in response && 
          typeof response.arrayBuffer === 'function') {
        try {
          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        } catch (error) {
          console.error('Error converting response to buffer:', error);
          throw new Error('Failed to convert image response to buffer');
        }
      } else {
        throw new Error(`Unsupported response type: ${typeof response}`);
      }
    }
    
    // Write image to file
    await writeFileAsync(outputPath, buffer);
    
    console.log(`Line art successfully generated and saved to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Error generating line art:', error);
    throw new Error(`Failed to generate line art: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate an American historical symbols image for coloring
 * 
 * @returns Path to the generated image
 */
export async function generateAmericanSymbolsLineArt(): Promise<string> {
  const prompt = "American historical symbols: George Washington in his general's uniform standing next to the Liberty Bell, with a 13-star American flag and Independence Hall in the background";
  
  return await generateLineArt(prompt, `american_symbols_${Date.now()}.png`);
}

/**
 * Generate a line art image based on educational topic
 * Tailors the prompt to create age-appropriate historical/educational content
 * 
 * @param title Title/topic of the coloring page
 * @param description Additional description or details
 * @returns Path to the generated image
 */
export async function generateEducationalLineArt(
  title: string,
  description?: string
): Promise<string> {
  let prompt = title;
  
  if (description) {
    prompt += `: ${description}`;
  }
  
  // Add educational context to make it appropriate for children
  prompt += ` Simple, educational, child-friendly, outline drawing for coloring`;
  
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.png`;
  return await generateLineArt(prompt, filename);
}