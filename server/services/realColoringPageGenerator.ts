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
    // Use Stability AI for professional coloring page generation (now returns PNG file path)
    const filePath = await generateStabilityColoringPage(subject, elements, ageRange);
    
    // Read the PNG file and create SVG wrapper for compatibility
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const fullPath = path.join(process.cwd(), filePath.replace(/^\//, ''));
    const pngBuffer = await fs.readFile(fullPath);
    const base64Image = pngBuffer.toString('base64');
    
    // Create SVG wrapper with embedded PNG for proper black lines on white background
    const svgContent = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <!-- Professional ${subject} coloring page for ages ${ageRange} -->
  <rect width="1024" height="1024" fill="white"/>
  <image href="data:image/png;base64,${base64Image}" 
         x="0" y="0" 
         width="1024" height="1024"/>
</svg>`;
    
    console.log(`✅ Generated real coloring page PNG with SVG wrapper (${svgContent.length} characters)`);
    return svgContent;

  } catch (error) {
    console.error('❌ Real coloring page generation failed:', error);
    throw error;
  }
}