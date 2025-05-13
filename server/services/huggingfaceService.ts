import { HfInference } from '@huggingface/inference';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { ensureDirectoryExists } from './pdfGenerator';

const writeFileAsync = promisify(fs.writeFile);

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
    
    // Use Hugging Face text-to-image model
    // For line art specifically we're using the scribble-diffusion model
    const imageBlob = await hf.textToImage({
      model: 'timbrooks/instruct-pix2pix',
      inputs: enhancedPrompt,
      parameters: {
        negative_prompt: 'color, shading, realistic, detailed, grayscale, complexity, photorealistic',
        guidance_scale: 7.5,
        num_inference_steps: 30,
      }
    });
    
    // Convert blob to buffer
    const buffer = Buffer.from(await imageBlob.arrayBuffer());
    
    // Write image to file
    await writeFileAsync(outputPath, buffer);
    
    console.log(`Line art successfully generated and saved to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Error generating line art:', error);
    throw new Error(`Failed to generate line art: ${error.message}`);
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