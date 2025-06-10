/**
 * Real Professional Coloring Page Generator using Stability AI
 * Generates actual images and converts them to coloring page format
 */

import { generateStabilityColoringPage } from './stabilityAI';

export async function generateRealColoringPage(
  subject: string,
  elements: string[],
  ageRange: string
): Promise<string> {
  console.log(`🎨 Generating real coloring page: ${subject} for ages ${ageRange}`);

  try {
    // Use Stability AI for professional coloring page generation
    const svgContent = await generateStabilityColoringPage(subject, elements, ageRange);
    console.log(`✅ Generated real coloring page (${svgContent.length} characters)`);
    return svgContent;

  } catch (error) {
    console.error('❌ Real coloring page generation failed:', error);
    throw error;
  }
}