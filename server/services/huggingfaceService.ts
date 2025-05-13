import { HfInference } from '@huggingface/inference';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import * as minimatch from 'minimatch';

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

/**
 * Cleans up temporary image files to prevent disk space issues
 * @param directory Directory to clean up
 * @param maxFiles Maximum number of files to keep (newest files are preserved)
 * @param filePattern Pattern to match files for cleanup
 */
export const cleanupImageFiles = async (
  directory: string = path.join(process.cwd(), 'uploads', 'images'),
  maxFiles: number = 10,
  filePattern: string = 'american_symbols_*.png'
): Promise<void> => {
  try {
    // Ensure directory exists
    if (!fs.existsSync(directory)) {
      return;
    }
    
    const files = await fs.promises.readdir(directory);
    const matchingFiles = files
      .filter(file => minimatch(file, filePattern))
      .map(file => ({
        name: file,
        path: path.join(directory, file),
        stats: fs.statSync(path.join(directory, file))
      }))
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime()); // newest first
    
    if (matchingFiles.length <= maxFiles) {
      return; // No cleanup needed
    }
    
    // Delete older files beyond the maximum limit
    const filesToDelete = matchingFiles.slice(maxFiles);
    for (const file of filesToDelete) {
      try {
        await fs.promises.unlink(file.path);
        console.log(`Cleaned up old image file: ${file.name}`);
      } catch (unlinkError) {
        console.warn(`Failed to delete old image file ${file.name}:`, unlinkError);
      }
    }
    
    console.log(`Image cleanup complete. Kept ${maxFiles} newest files, deleted ${filesToDelete.length} old files.`);
  } catch (error) {
    console.warn('Error during image cleanup:', error);
    // Non-critical operation, don't throw error
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
 * Generate an American historical symbols image for coloring
 * 
 * @returns Path to the generated image
 */
/**
 * Generate an American historical symbols image for coloring
 * Implementation includes caching to avoid repeated API calls
 * 
 * @returns Path to the generated image
 */
export async function generateAmericanSymbolsLineArt(): Promise<string> {
  const prompt = "American historical symbols: George Washington in his general's uniform standing next to the Liberty Bell, with a 13-star American flag and Independence Hall in the background";
  const cacheDir = path.join(process.cwd(), 'uploads', 'cache');
  const cacheFilename = 'american_symbols_cached.png';
  const cachedPath = path.join(cacheDir, cacheFilename);
  
  try {
    // Try to use cached image if it exists
    await ensureDirectoryExists(cacheDir);
    
    if (fs.existsSync(cachedPath)) {
      console.log('Using cached American symbols image');
      const uploadDir = path.join(process.cwd(), 'uploads', 'images');
      await ensureDirectoryExists(uploadDir);
      
      // Copy the cached file to a new unique file
      const outputFilename = `american_symbols_${Date.now()}.png`;
      const outputPath = path.join(uploadDir, outputFilename);
      fs.copyFileSync(cachedPath, outputPath);
      
      // Run image cleanup in the background
      cleanupImageFiles().catch(err => {
        console.warn('Background image cleanup failed:', err);
      });
      
      return outputPath;
    }
  } catch (cacheError) {
    console.warn('Error checking cache:', cacheError);
    // Continue to generate fresh image if cache fails
  }
  
  // Generate a new image
  const imagePath = await generateLineArt(prompt, `american_symbols_${Date.now()}.png`);
  
  // Cache the result for future use
  try {
    fs.copyFileSync(imagePath, cachedPath);
    console.log('Cached American symbols image for future use');
    
    // Run image cleanup in the background
    cleanupImageFiles().catch(err => {
      console.warn('Background image cleanup failed:', err);
    });
  } catch (cacheError) {
    console.warn('Failed to cache image:', cacheError);
  }
  
  return imagePath;
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
    
    // In TypeScript/Node.js environment, the response is likely to be a Buffer already
    if (Buffer.isBuffer(response)) {
      buffer = response;
    } else if (typeof response === 'string') {
      // Handle string response (could be base64 or URL)
      if (response.startsWith('data:')) {
        // Remove the data URL prefix
        const base64Data = response.split(',')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        buffer = Buffer.from(response, 'base64');
      }
    } else if (response instanceof Uint8Array) {
      // Handle Uint8Array
      buffer = Buffer.from(response);
    } else if (typeof response === 'object' && response !== null) {
      // If the response is a complex object (possibly with arrayBuffer or blob methods)
      console.log('Complex response object detected:', typeof response);
      
      if ('arrayBuffer' in response && typeof response.arrayBuffer === 'function') {
        try {
          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        } catch (error) {
          console.error('Error converting response to buffer using arrayBuffer():', error);
          throw error;
        }
      } else if ('blob' in response && typeof response.blob === 'function') {
        try {
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        } catch (error) {
          console.error('Error converting response to buffer using blob():', error);
          throw error;
        }
      } else {
        console.error('Unsupported response format:', response);
        throw new Error('Unsupported response format from Hugging Face API');
      }
    } else {
      console.error('Unexpected response type:', typeof response);
      throw new Error(`Unexpected response type: ${typeof response}`);
    }
    
    // As a fallback for testing, if no image is generated, use a local placeholder
    if (!buffer || buffer.length === 0) {
      // Draw a simple SVG instead
      console.log('No image data received, using SVG fallback');
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
        <rect x="50" y="50" width="700" height="500" fill="none" stroke="black" stroke-width="2"/>
        <text x="400" y="300" font-family="Arial" font-size="24" text-anchor="middle">
          Line Art for: ${prompt}
        </text>
      </svg>`;
      
      buffer = Buffer.from(svgContent);
      outputFilename = outputFilename.replace('.png', '.svg');
      const svgOutputPath = path.join(uploadDir, outputFilename);
      await writeFileAsync(svgOutputPath, buffer);
      return svgOutputPath;
    }
    
    // Write image to file
    await writeFileAsync(outputPath, buffer);
    
    console.log(`Line art successfully generated and saved to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Error generating line art:', error);
    
    // Create a fallback SVG as a last resort
    try {
      console.log('Generating fallback SVG due to error');
      const uploadDir = path.join(process.cwd(), 'uploads', 'images');
      await ensureDirectoryExists(uploadDir);
      
      const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
        <rect x="50" y="50" width="700" height="500" fill="none" stroke="black" stroke-width="2"/>
        <text x="400" y="300" font-family="Arial" font-size="24" text-anchor="middle">
          Coloring Image: ${prompt}
        </text>
        <text x="400" y="340" font-family="Arial" font-size="16" text-anchor="middle">
          (Image generation failed, please try again)
        </text>
      </svg>`;
      
      const fallbackPath = path.join(uploadDir, `fallback_${Date.now()}.svg`);
      await writeFileAsync(fallbackPath, fallbackSvg);
      return fallbackPath;
    } catch (fallbackError) {
      console.error('Even fallback SVG creation failed:', fallbackError);
      throw new Error(`Failed to generate any image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}