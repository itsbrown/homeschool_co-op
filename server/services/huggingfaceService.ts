import { HfInference } from '@huggingface/inference';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const writeFileAsync = promisify(fs.writeFile);

/**
 * Create an educational SVG coloring page based on the prompt
 */
function createEducationalSVG(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();
  
  // Determine the type of educational content based on the prompt
  if (lowerPrompt.includes('animal') || lowerPrompt.includes('cat') || lowerPrompt.includes('dog') || lowerPrompt.includes('bird')) {
    return createAnimalSVG(prompt);
  } else if (lowerPrompt.includes('history') || lowerPrompt.includes('american') || lowerPrompt.includes('flag') || lowerPrompt.includes('liberty')) {
    return createHistorySVG(prompt);
  } else if (lowerPrompt.includes('math') || lowerPrompt.includes('number') || lowerPrompt.includes('shape')) {
    return createMathSVG(prompt);
  } else if (lowerPrompt.includes('science') || lowerPrompt.includes('plant') || lowerPrompt.includes('space')) {
    return createScienceSVG(prompt);
  } else {
    return createGeneralSVG(prompt);
  }
}

/**
 * Create an animal-themed SVG coloring page
 */
function createAnimalSVG(prompt: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" fill="white"/>
    
    <!-- Cat outline -->
    <circle cx="256" cy="180" r="80" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="230" cy="160" r="12" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="282" cy="160" r="12" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 240 190 Q 256 200 272 190" fill="none" stroke="black" stroke-width="2"/>
    <line x1="256" y1="200" x2="256" y2="210" stroke="black" stroke-width="2"/>
    <path d="M 240 210 Q 256 220 272 210" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Ears -->
    <polygon points="200,120 220,80 240,120" fill="none" stroke="black" stroke-width="3"/>
    <polygon points="272,120 292,80 312,120" fill="none" stroke="black" stroke-width="3"/>
    
    <!-- Body -->
    <ellipse cx="256" cy="320" rx="60" ry="80" fill="none" stroke="black" stroke-width="3"/>
    
    <!-- Legs -->
    <rect x="220" y="380" width="15" height="40" fill="none" stroke="black" stroke-width="2"/>
    <rect x="277" y="380" width="15" height="40" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Tail -->
    <path d="M 316 300 Q 350 280 360 320 Q 370 360 340 380" fill="none" stroke="black" stroke-width="3"/>
    
    <!-- Whiskers -->
    <line x1="180" y1="170" x2="220" y2="175" stroke="black" stroke-width="1"/>
    <line x1="180" y1="185" x2="220" y2="185" stroke="black" stroke-width="1"/>
    <line x1="292" y1="175" x2="332" y2="170" stroke="black" stroke-width="1"/>
    <line x1="292" y1="185" x2="332" y2="185" stroke="black" stroke-width="1"/>
    
    <text x="256" y="460" font-family="Arial" font-size="14" text-anchor="middle" fill="black">
      ${prompt.substring(0, 40)}
    </text>
  </svg>`;
}

/**
 * Create a history-themed SVG coloring page
 */
function createHistorySVG(prompt: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" fill="white"/>
    
    <!-- American Flag -->
    <rect x="150" y="100" width="212" height="120" fill="none" stroke="black" stroke-width="3"/>
    
    <!-- Stripes -->
    <line x1="150" y1="110" x2="362" y2="110" stroke="black" stroke-width="2"/>
    <line x1="150" y1="120" x2="362" y2="120" stroke="black" stroke-width="2"/>
    <line x1="150" y1="130" x2="362" y2="130" stroke="black" stroke-width="2"/>
    <line x1="150" y1="140" x2="362" y2="140" stroke="black" stroke-width="2"/>
    
    <!-- Star field -->
    <rect x="150" y="100" width="85" height="60" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Stars -->
    <text x="170" y="120" font-family="Arial" font-size="12" fill="black">★</text>
    <text x="190" y="120" font-family="Arial" font-size="12" fill="black">★</text>
    <text x="210" y="120" font-family="Arial" font-size="12" fill="black">★</text>
    <text x="180" y="135" font-family="Arial" font-size="12" fill="black">★</text>
    <text x="200" y="135" font-family="Arial" font-size="12" fill="black">★</text>
    <text x="170" y="150" font-family="Arial" font-size="12" fill="black">★</text>
    <text x="190" y="150" font-family="Arial" font-size="12" fill="black">★</text>
    <text x="210" y="150" font-family="Arial" font-size="12" fill="black">★</text>
    
    <!-- Liberty Bell -->
    <path d="M 200 280 Q 180 260 180 240 Q 180 220 200 210 Q 220 200 240 200 Q 260 200 280 210 Q 300 220 300 240 Q 300 260 280 280 Z" fill="none" stroke="black" stroke-width="3"/>
    <rect x="235" y="280" width="10" height="30" fill="none" stroke="black" stroke-width="2"/>
    <line x1="220" y1="250" x2="260" y2="250" stroke="black" stroke-width="2"/>
    
    <text x="256" y="460" font-family="Arial" font-size="14" text-anchor="middle" fill="black">
      ${prompt.substring(0, 40)}
    </text>
  </svg>`;
}

/**
 * Create a math-themed SVG coloring page
 */
function createMathSVG(prompt: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" fill="white"/>
    
    <!-- Geometric shapes -->
    <circle cx="150" cy="150" r="50" fill="none" stroke="black" stroke-width="3"/>
    <rect x="250" y="100" width="100" height="100" fill="none" stroke="black" stroke-width="3"/>
    <polygon points="150,300 100,400 200,400" fill="none" stroke="black" stroke-width="3"/>
    
    <!-- Numbers -->
    <text x="150" y="160" font-family="Arial" font-size="36" text-anchor="middle" fill="black">1</text>
    <text x="300" y="160" font-family="Arial" font-size="36" text-anchor="middle" fill="black">2</text>
    <text x="150" y="360" font-family="Arial" font-size="36" text-anchor="middle" fill="black">3</text>
    
    <!-- Math symbols -->
    <text x="200" y="160" font-family="Arial" font-size="24" text-anchor="middle" fill="black">+</text>
    <text x="350" y="160" font-family="Arial" font-size="24" text-anchor="middle" fill="black">=</text>
    <text x="400" y="160" font-family="Arial" font-size="36" text-anchor="middle" fill="black">?</text>
    
    <text x="256" y="460" font-family="Arial" font-size="14" text-anchor="middle" fill="black">
      ${prompt.substring(0, 40)}
    </text>
  </svg>`;
}

/**
 * Create a science-themed SVG coloring page
 */
function createScienceSVG(prompt: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" fill="white"/>
    
    <!-- Sun -->
    <circle cx="120" cy="120" r="40" fill="none" stroke="black" stroke-width="3"/>
    <line x1="80" y1="80" x2="90" y2="90" stroke="black" stroke-width="2"/>
    <line x1="150" y1="80" x2="140" y2="90" stroke="black" stroke-width="2"/>
    <line x1="80" y1="160" x2="90" y2="150" stroke="black" stroke-width="2"/>
    <line x1="150" y1="160" x2="140" y2="150" stroke="black" stroke-width="2"/>
    
    <!-- Plant -->
    <line x1="200" y1="400" x2="200" y2="300" stroke="black" stroke-width="4"/>
    <ellipse cx="200" cy="280" rx="30" ry="20" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="170" cy="300" rx="20" ry="15" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="230" cy="300" rx="20" ry="15" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Flower -->
    <circle cx="300" cy="200" r="15" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="285" cy="185" rx="10" ry="20" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="315" cy="185" rx="10" ry="20" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="285" cy="215" rx="10" ry="20" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="315" cy="215" rx="10" ry="20" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Earth -->
    <circle cx="400" cy="350" r="60" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 360 330 Q 380 310 400 330 Q 420 350 440 330" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 360 370 Q 380 390 400 370 Q 420 350 440 370" fill="none" stroke="black" stroke-width="2"/>
    
    <text x="256" y="460" font-family="Arial" font-size="14" text-anchor="middle" fill="black">
      ${prompt.substring(0, 40)}
    </text>
  </svg>`;
}

/**
 * Create a general educational SVG coloring page
 */
function createGeneralSVG(prompt: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" fill="white"/>
    
    <!-- House -->
    <rect x="180" y="250" width="152" height="120" fill="none" stroke="black" stroke-width="3"/>
    <polygon points="180,250 256,180 332,250" fill="none" stroke="black" stroke-width="3"/>
    <rect x="200" y="300" width="30" height="50" fill="none" stroke="black" stroke-width="2"/>
    <rect x="280" y="290" width="40" height="40" fill="none" stroke="black" stroke-width="2"/>
    <line x1="280" y1="310" x2="320" y2="310" stroke="black" stroke-width="1"/>
    <line x1="300" y1="290" x2="300" y2="330" stroke="black" stroke-width="1"/>
    
    <!-- Tree -->
    <rect x="120" y="300" width="20" height="70" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="130" cy="280" r="40" fill="none" stroke="black" stroke-width="3"/>
    
    <!-- Clouds -->
    <circle cx="100" cy="80" r="20" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="120" cy="80" r="25" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="140" cy="80" r="20" fill="none" stroke="black" stroke-width="2"/>
    
    <circle cx="350" cy="60" r="15" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="365" cy="60" r="20" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="380" cy="60" r="15" fill="none" stroke="black" stroke-width="2"/>
    
    <text x="256" y="460" font-family="Arial" font-size="14" text-anchor="middle" fill="black">
      ${prompt.substring(0, 40)}
    </text>
  </svg>`;
}

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
 * @param prefix File prefix to match for cleanup
 */
export const cleanupImageFiles = async (
  directory: string = path.join(process.cwd(), 'uploads', 'images'),
  maxFiles: number = 10,
  prefix: string = 'american_symbols_'
): Promise<void> => {
  try {
    // Ensure directory exists
    if (!fs.existsSync(directory)) {
      return;
    }
    
    const files = await fs.promises.readdir(directory);
    const matchingFiles = files
      .filter(file => file.startsWith(prefix) && file.endsWith('.png'))
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
  const prompt = "American historical symbols: A clear line drawing showing: (1) George Washington in his general's uniform with distinct facial features, (2) the Liberty Bell with its famous crack clearly visible, (3) a 13-star American flag with each star having five points, and (4) Independence Hall with its recognizable façade. Each element should be clearly separated with clean outlines perfect for a children's coloring book";
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
      
      // Cleanup temporarily disabled
      console.log('Using cached image - cleanup functionality temporarily disabled');
      
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
    
    // Cleanup temporarily disabled
    console.log('Cached new image - cleanup functionality temporarily disabled');
  } catch (cacheError) {
    console.warn('Failed to cache image:', cacheError);
  }
  
  return imagePath;
}

/**
 * Generate a line art image based on educational topic
 * Tailors the prompt to create age-appropriate historical/educational content
 * Works with any educational subject, not just American history
 * 
 * @param title Title/topic of the coloring page
 * @param description Additional description or details
 * @returns Path to the generated image
 */
export async function generateEducationalLineArt(
  title: string,
  description?: string
): Promise<string> {
  // Start building an appropriate prompt based on the title
  let prompt = title;
  
  if (description && description.trim().length > 0) {
    prompt += `: ${description}`;
  }
  
  // Identify the general category of the content to customize the prompt
  const lowerTitle = title.toLowerCase();
  const lowerDesc = description ? description.toLowerCase() : '';
  
  // Determine if we have a specific category to enhance the prompt
  if (lowerTitle.includes('history') || lowerDesc.includes('history')) {
    console.log('Using Hugging Face for historical line art');
    if (lowerTitle.includes('america') || lowerDesc.includes('america')) {
      prompt = `${prompt}: A simple, line-drawn illustration showing historical figures and symbols from early American history`;
    } else {
      prompt = `${prompt}: A simple, line-drawn illustration showing historical figures and elements from this time period`;
    }
  } else if (lowerTitle.includes('science') || lowerDesc.includes('science')) {
    console.log('Using Hugging Face for science line art');
    prompt = `${prompt}: A simple, line-drawn illustration showing scientific concepts with labeled elements`;
  } else if (lowerTitle.includes('math') || lowerDesc.includes('math')) {
    console.log('Using Hugging Face for math line art');
    prompt = `${prompt}: A simple, line-drawn illustration showing mathematical concepts with clear shapes and numbers`;
  } else if (lowerTitle.includes('geography') || lowerDesc.includes('geography')) {
    console.log('Using Hugging Face for geography line art');
    prompt = `${prompt}: A simple, line-drawn illustration showing geographical features and landmarks`;
  } else {
    console.log('Using Hugging Face for general educational line art');
    prompt = `${prompt}: A simple, line-drawn educational illustration`;
  }
  
  // Add standard educational formatting for any topic
  prompt += `, educational, child-friendly, outline drawing perfect for coloring by elementary students`;
  
  console.log('Generating line art for prompt:', JSON.stringify(prompt));
  
  // Create a safe filename from the title
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
    
    // Enhance the prompt for line art generation with more specific guidance
    // Adapt the prompt based on the content type for better results
    let enhancedPrompt = '';
    
    if (prompt.toLowerCase().includes('math') || prompt.toLowerCase().includes('science')) {
      enhancedPrompt = `A simple black and white line drawing for a children's educational coloring page of: ${prompt}. 
      Clear, distinct outlines with labeled elements. All scientific/mathematical concepts should be accurately 
      drawn with simple labels where appropriate. Very clean lines, no shading, high contrast outlines suitable for 
      elementary school children to color. Make each element easily identifiable and well-spaced.`;
    } else if (prompt.toLowerCase().includes('geography') || prompt.toLowerCase().includes('map')) {
      enhancedPrompt = `A simple black and white line drawing for a children's educational coloring page of: ${prompt}. 
      Clear, distinct outlines of geographical features, landmarks or maps. Major elements should be clearly 
      defined and labeled appropriately. Very clean lines, no shading, high contrast outlines suitable for 
      elementary school children to color. Make each element easily identifiable and well-spaced.`;
    } else {
      enhancedPrompt = `A simple black and white line drawing for a children's coloring page of: ${prompt}. 
      Clear, distinct outlines with no overlapping text. All symbols must be accurately drawn (e.g., stars with 5 points, 
      buildings with proper shapes, etc). Very clean lines, no shading, high contrast outlines suitable for 
      elementary school children to color. Make each element easily identifiable and separated from others.`;
    }
    
    console.log(`Using enhanced prompt: "${enhancedPrompt}"`);
    
    // Use Hugging Face text-to-image model with optimized parameters for line art
    const response = await hf.textToImage({
      model: 'stabilityai/stable-diffusion-xl-base-1.0',  // Using SDXL as it's more reliable
      inputs: enhancedPrompt,
      parameters: {
        negative_prompt: 'color, shading, realistic, textures, grayscale, complexity, photorealistic, detailed backgrounds, text, watermarks, signatures, blurry lines, overlapping elements',
        guidance_scale: 9.0,          // Higher guidance scale for better prompt adherence
        num_inference_steps: 50,      // More steps for higher quality
        sampler: 'DPMSolverMultistep' // Better for clean line art
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

/**
 * Generate a custom coloring page image using Hugging Face
 * @param prompt Custom prompt for image generation
 * @returns Path to the generated image file
 */
export async function generateCustomImage(prompt: string): Promise<string> {
  if (!isHuggingFaceAvailable()) {
    throw new Error('Hugging Face API is not available');
  }

  try {
    const uploadDir = path.join(process.cwd(), 'uploads', 'images');
    await ensureDirectoryExists(uploadDir);

    // Create a specialized prompt for coloring pages
    const coloringPrompt = `${prompt} simple black and white line art coloring page, clean outlines, no shading, suitable for children to color, educational drawing, minimalist style, black lines on white background`;

    console.log('Generating custom coloring page with prompt:', coloringPrompt);

    const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
    
    // Generate the image
    const response = await hf.textToImage({
      model: 'stabilityai/stable-diffusion-2-1',
      inputs: coloringPrompt,
      parameters: {
        negative_prompt: 'color, shading, shadows, realistic, photographic, complex details, cluttered',
        num_inference_steps: 20,
        guidance_scale: 7.5,
        width: 512,
        height: 512,
      }
    });

    // Convert response to buffer
    const buffer = Buffer.from(await (response as any).arrayBuffer());
    
    // Generate unique filename
    const timestamp = Date.now();
    const outputFilename = `coloring_page_${timestamp}.png`;
    const outputPath = path.join(uploadDir, outputFilename);
    
    // Write image to file
    await writeFileAsync(outputPath, buffer);
    
    console.log(`Custom coloring page generated and saved to ${outputPath}`);
    return outputPath;
    
  } catch (error) {
    console.error('Error generating custom coloring page:', error);
    
    // Create a fallback SVG coloring page
    try {
      console.log('Generating fallback SVG coloring page');
      const uploadDir = path.join(process.cwd(), 'uploads', 'images');
      await ensureDirectoryExists(uploadDir);
      
      const fallbackSvg = createEducationalSVG(prompt);
      
      const fallbackPath = path.join(uploadDir, `fallback_coloring_${Date.now()}.svg`);
      await writeFileAsync(fallbackPath, fallbackSvg);
      return fallbackPath;
      
    } catch (fallbackError) {
      console.error('Fallback SVG creation failed:', fallbackError);
      throw new Error(`Failed to generate coloring page: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}