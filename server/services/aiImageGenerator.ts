/**
 * AI Image Generator for Educational Coloring Pages
 * Uses Stability AI for high-quality educational illustrations
 */

import { generateStabilityColoringPage } from './stabilityAI';

/**
 * Generate high-quality educational coloring page using Stability AI
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
    // Use Stability AI for professional coloring page generation
    const svgContent = await generateStabilityColoringPage(subject, elements, ageRange);
    console.log(`✅ Generated Stability AI coloring page (${svgContent.length} characters)`);
    return svgContent;

  } catch (error) {
    console.error('❌ Stability AI generation failed:', error);
    throw error;
  }
}