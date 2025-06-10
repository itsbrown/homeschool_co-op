/**
 * AI Image Generator for Educational Coloring Pages
 * Uses OpenAI DALL-E 3 for high-quality educational illustrations
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate high-quality educational coloring page using DALL-E 3
 */
export async function generateEducationalColoringPage(
  subject: string, 
  elements: string[], 
  ageRange: string
): Promise<string> {
  console.log(`🎨 Generating AI coloring page for: ${subject}`);
  console.log(`📝 Elements: ${elements.join(', ')}`);
  console.log(`👶 Age range: ${ageRange}`);

  try {
    // Create detailed prompt for DALL-E 3
    const prompt = createDetailedPrompt(subject, elements, ageRange);
    console.log(`🎯 DALL-E prompt: ${prompt}`);

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      size: "1024x1024",
      quality: "hd",
      style: "natural",
      n: 1,
    });

    const imageUrl = response.data[0]?.url;
    if (!imageUrl) {
      throw new Error('No image URL returned from DALL-E');
    }

    console.log(`✅ Generated DALL-E image: ${imageUrl}`);
    return imageUrl;

  } catch (error) {
    console.error('❌ DALL-E generation failed:', error);
    
    // Fallback to Anthropic-generated detailed SVG
    console.log('🔄 Falling back to detailed SVG generation...');
    return await generateFallbackSVG(subject, elements, ageRange);
  }
}

/**
 * Create optimized prompt for DALL-E 3 coloring pages (GenColor.ai style)
 */
function createDetailedPrompt(subject: string, elements: string[], ageRange: string): string {
  // Enhanced prompting inspired by GenColor.ai's specialized approach
  const basePrompt = `Professional coloring book page design for children aged ${ageRange}. `;
  
  let specificPrompt = '';
  
  if (subject.toLowerCase().includes('vehicle') || elements.some(e => ['car', 'truck', 'airplane', 'bicycle'].includes(e.toLowerCase()))) {
    specificPrompt = `Transportation theme featuring ${elements.join(', ')}. Include detailed vehicle designs with proper proportions, safety features, and educational elements like traffic signs, road markings, and infrastructure. `;
  } else if (subject.toLowerCase().includes('sea') || elements.some(e => ['fish', 'octopus', 'seahorse', 'starfish'].includes(e.toLowerCase()))) {
    specificPrompt = `Underwater ecosystem showcasing ${elements.join(', ')}. Include marine biodiversity with coral formations, seabed details, water plants, and educational elements about ocean life. `;
  } else if (subject.toLowerCase().includes('forest') || elements.some(e => ['deer', 'rabbit', 'squirrel', 'owl'].includes(e.toLowerCase()))) {
    specificPrompt = `Woodland habitat featuring ${elements.join(', ')}. Show natural forest ecosystem with trees, plants, animal homes, and educational elements about wildlife conservation. `;
  } else if (subject.toLowerCase().includes('space') || elements.some(e => ['rocket', 'planet', 'star', 'astronaut'].includes(e.toLowerCase()))) {
    specificPrompt = `Space exploration theme with ${elements.join(', ')}. Include accurate astronomical objects, space technology, and educational elements about the solar system and space science. `;
  } else if (subject.toLowerCase().includes('garden') || elements.some(e => ['flower', 'butterfly', 'bee', 'plant'].includes(e.toLowerCase()))) {
    specificPrompt = `Garden ecosystem featuring ${elements.join(', ')}. Show plant life cycles, pollinator relationships, and educational elements about nature and gardening. `;
  } else if (subject.toLowerCase().includes('history') || elements.some(e => ['antoinette', 'minister', 'church', 'historical'].includes(e.toLowerCase()))) {
    specificPrompt = `Historical educational scene featuring ${elements.join(', ')}. Include period-accurate details, educational context, and age-appropriate historical elements. `;
  } else {
    specificPrompt = `Educational scene featuring ${elements.join(', ')} with clear learning objectives and engaging visual elements. `;
  }

  // GenColor.ai style specifications
  const stylePrompt = `TECHNICAL SPECIFICATIONS: 
  - Bold, consistent 3-4px black outlines optimized for children's motor skills
  - White background with no gradients, shadows, or fills
  - Closed shapes with no gaps in lines for easy coloring
  - Age-appropriate complexity: ${ageRange === '3-5' ? 'simple large shapes' : ageRange === '5-8' ? 'moderate detail level' : 'detailed but manageable complexity'}
  - Educational value with clear, recognizable subjects
  - High contrast line art suitable for printing and digital coloring
  - Professional coloring book quality with proper spacing between elements
  - No text or labels within the coloring areas`;

  return basePrompt + specificPrompt + stylePrompt;
}

/**
 * Generate fallback SVG when DALL-E is unavailable
 */
async function generateFallbackSVG(subject: string, elements: string[], ageRange: string): Promise<string> {
  // Import detailed SVG generators
  const { 
    createDetailedVehiclesSVG, 
    createDetailedSeaCreaturesSVG, 
    createDetailedForestAnimalsSVG, 
    createDetailedHistoricalFigureSVG, 
    createDetailedSpaceSVG, 
    createDetailedGardenSVG, 
    createDetailedGeneralSVG 
  } = await import('./detailedSVGGenerator.js');

  const allText = (subject + ' ' + elements.join(' ')).toLowerCase();
  
  console.log(`🎨 Creating detailed fallback SVG for: ${subject}`);
  
  if (allText.includes('vehicle') || allText.includes('car') || allText.includes('truck') || allText.includes('airplane') || allText.includes('bicycle')) {
    return createDetailedVehiclesSVG(subject, elements);
  } else if (allText.includes('sea') || allText.includes('ocean') || allText.includes('fish') || allText.includes('octopus') || allText.includes('seahorse')) {
    return createDetailedSeaCreaturesSVG(subject, elements);
  } else if (allText.includes('forest') || allText.includes('animal') || allText.includes('deer') || allText.includes('rabbit') || allText.includes('squirrel')) {
    return createDetailedForestAnimalsSVG(subject, elements);
  } else if (allText.includes('antoinette') || allText.includes('minister') || allText.includes('church') || allText.includes('blackwell')) {
    return createDetailedHistoricalFigureSVG(subject, elements);
  } else if (allText.includes('space') || allText.includes('planet') || allText.includes('star') || allText.includes('rocket')) {
    return createDetailedSpaceSVG(subject, elements);
  } else if (allText.includes('garden') || allText.includes('flower') || allText.includes('plant') || allText.includes('butterfly')) {
    return createDetailedGardenSVG(subject, elements);
  } else {
    return createDetailedGeneralSVG(subject, elements);
  }
}

/**
 * Download and save image from URL to local filesystem
 */
export async function downloadAndSaveImage(imageUrl: string, filename: string): Promise<string> {
  try {
    console.log(`📥 Downloading image from: ${imageUrl}`);
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const uploadsDir = path.join(process.cwd(), 'uploads', 'activities');
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    
    const filePath = path.join(uploadsDir, filename);
    await fs.promises.writeFile(filePath, buffer);
    
    console.log(`✅ Saved image to: ${filePath}`);
    return `/uploads/activities/${filename}`;
    
  } catch (error) {
    console.error('❌ Failed to download and save image:', error);
    throw error;
  }
}