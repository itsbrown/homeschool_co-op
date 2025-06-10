/**
 * Real Professional Coloring Page Generator using DALL-E 3
 * Generates actual images and converts them to coloring page format
 */

import OpenAI from 'openai';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateRealColoringPage(
  subject: string,
  elements: string[],
  ageRange: string
): Promise<string> {
  console.log(`🎨 Generating real coloring page: ${subject} for ages ${ageRange}`);

  try {
    // Step 1: Generate the base image using DALL-E 3
    const imagePrompt = createImagePrompt(subject, elements, ageRange);
    
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1024",
      quality: "hd",
      style: "natural"
    });

    if (!imageResponse.data || imageResponse.data.length === 0) {
      throw new Error('No image data received from DALL-E');
    }
    
    const imageUrl = imageResponse.data[0].url;
    if (!imageUrl) {
      throw new Error('No image URL received from DALL-E');
    }

    // Step 2: Download the generated image
    const imageBuffer = await downloadImage(imageUrl);

    // Step 3: Convert to coloring page format
    const coloringPageBuffer = await convertToColoringPage(imageBuffer, ageRange);

    // Step 4: Save as SVG-compatible format
    const svgContent = await convertToSVG(coloringPageBuffer, subject, ageRange);

    console.log(`✅ Generated real coloring page (${svgContent.length} characters)`);
    return svgContent;

  } catch (error) {
    console.error('❌ Real coloring page generation failed:', error);
    throw error;
  }
}

function createImagePrompt(subject: string, elements: string[], ageRange: string): string {
  const [minAge] = ageRange.split('-').map(Number);
  const complexity = minAge <= 5 ? 'simple and clear' : minAge <= 8 ? 'moderately detailed' : 'detailed';
  
  return `Black and white line art coloring page illustration of ${subject} with ${elements.join(', ')}. ${complexity} design for children ages ${ageRange}. Bold outlines, no fills, no shading, no colors. Educational coloring book style like Dover Publications. Clean simple shapes perfect for coloring.`;
}

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function convertToColoringPage(imageBuffer: Buffer, ageRange: string): Promise<Buffer> {
  const [minAge] = ageRange.split('-').map(Number);
  
  // Convert to grayscale and enhance edges for coloring page effect
  const processedImage = await sharp(imageBuffer)
    .grayscale()
    .normalize()
    .modulate({ 
      brightness: 1.2,
      saturation: 0.8
    })
    .threshold(200) // Convert to high contrast black and white
    .png()
    .toBuffer();

  // Apply edge detection for outline effect
  const edgeDetected = await sharp(processedImage)
    .convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
    })
    .threshold(100)
    .negate() // Invert so lines are black on white
    .png()
    .toBuffer();

  return edgeDetected;
}

async function convertToSVG(imageBuffer: Buffer, subject: string, ageRange: string): Promise<string> {
  // Save the processed image temporarily
  const tempDir = path.join(process.cwd(), 'uploads', 'temp');
  await fs.mkdir(tempDir, { recursive: true });
  
  const tempImagePath = path.join(tempDir, `temp_${Date.now()}.png`);
  await fs.writeFile(tempImagePath, imageBuffer);
  
  // Convert PNG to base64 for embedding in SVG
  const base64Image = imageBuffer.toString('base64');
  
  // Create SVG with embedded image
  const svgContent = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <!-- Professional ${subject} coloring page for ages ${ageRange} -->
  <rect width="1024" height="1024" fill="white"/>
  <image href="data:image/png;base64,${base64Image}" 
         x="0" y="0" 
         width="1024" height="1024" 
         style="mix-blend-mode: multiply;"/>
  
  <!-- Educational metadata -->
  <metadata>
    <title>${subject} - Professional Coloring Page</title>
    <description>AI-generated educational coloring page featuring ${subject}, suitable for children ages ${ageRange}</description>
    <generator>DALL-E 3 + Edge Detection Processing</generator>
  </metadata>
</svg>`;

  // Clean up temp file
  try {
    await fs.unlink(tempImagePath);
  } catch (error) {
    console.warn('Failed to clean up temp file:', error);
  }

  return svgContent;
}

// Alternative approach: Generate vector-style coloring pages
export async function generateVectorColoringPage(
  subject: string,
  elements: string[],
  ageRange: string
): Promise<string> {
  console.log(`🎨 Generating vector coloring page: ${subject} for ages ${ageRange}`);

  const vectorPrompt = `Create a detailed line art illustration of ${subject} specifically designed as a coloring page. Include: ${elements.join(', ')}.

Requirements:
- Black outlines only on white background
- No fills, shading, or colors
- Clean, bold lines suitable for children ages ${ageRange}
- Professional coloring book quality
- All shapes should be closed for easy coloring
- Educational and engaging composition`;

  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: vectorPrompt,
      n: 1,
      size: "1024x1024",
      quality: "hd",
      style: "natural"
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('No image data received from DALL-E');
    }
    
    const imageUrl = response.data[0].url;
    if (!imageUrl) {
      throw new Error('No image URL received from DALL-E');
    }

    const imageBuffer = await downloadImage(imageUrl);
    return await convertToSVG(imageBuffer, subject, ageRange);

  } catch (error) {
    console.error('❌ Vector coloring page generation failed:', error);
    throw error;
  }
}