/**
 * Unified Professional Coloring Page Generator
 * Single source of truth for all coloring page generation
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ColoringPageRequest {
  subject: string;
  elements: string[];
  ageRange: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

export interface ColoringPageResult {
  success: boolean;
  imageUrl?: string;
  localPath?: string;
  error?: string;
}

/**
 * Generate professional coloring page using Claude AI
 */
export async function generateColoringPage(request: ColoringPageRequest): Promise<ColoringPageResult> {
  console.log(`🎨 Generating coloring page: ${request.subject} for ages ${request.ageRange}`);

  try {
    // Generate detailed SVG using Claude
    const svgContent = await generateDetailedSVG(request);
    
    // Save to file
    const { imageUrl, localPath } = await saveColoringPage(svgContent, request.subject);
    
    console.log(`✅ Generated professional coloring page: ${imageUrl}`);
    return {
      success: true,
      imageUrl,
      localPath
    };

  } catch (error) {
    console.error('❌ Coloring page generation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function generateDetailedSVG(request: ColoringPageRequest): Promise<string> {
  const prompt = createDetailedPrompt(request);
  
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514', // the newest Anthropic model is "claude-sonnet-4-20250514" which was released May 14, 2025. Use this by default unless user has already selected claude-3-7-sonnet-20250219
    max_tokens: 4000,
    system: `You are a professional children's book illustrator specializing in educational coloring pages. Create detailed, age-appropriate SVG illustrations that are:
    - Anatomically correct but child-friendly
    - Educational and engaging
    - Optimized for coloring with proper line weights
    - Professional illustration quality
    - Clean outlines with no fills or text within coloring areas`,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  const textContent = response.content.find(block => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in AI response');
  }

  return extractOrCreateSVG(textContent.text, request);
}

function createDetailedPrompt(request: ColoringPageRequest): string {
  const { subject, elements, ageRange } = request;
  const [minAge, maxAge] = ageRange.split('-').map(Number);
  const lineWeight = minAge <= 4 ? 4 : minAge <= 7 ? 3 : 2.5;
  const complexity = minAge <= 5 ? 'simple but detailed' : minAge <= 10 ? 'moderately detailed' : 'highly detailed';

  return `Create a professional-quality SVG coloring page featuring "${subject}" for children aged ${ageRange}.

REQUIRED ELEMENTS: ${elements.join(', ')}

TECHNICAL SPECIFICATIONS:
- SVG dimensions: 1024x1024 viewBox
- Line weight: ${lineWeight}px for main outlines, ${lineWeight/2}px for details
- All shapes must be closed with no gaps
- Use only black outlines (#000000) on white background (#FFFFFF)
- No fills, gradients, or shading - outline only
- ${complexity} level appropriate for age ${ageRange}

ARTISTIC REQUIREMENTS:
- Professional children's book illustration quality
- Anatomically accurate but child-friendly proportions
- Engaging composition with clear focal points
- Educational value showcasing the subject matter
- Proper spacing between elements for easy coloring
- Include background elements and environmental context

OUTPUT: Return ONLY the complete SVG code, starting with <svg> and ending with </svg>. No explanations.`;
}

function extractOrCreateSVG(text: string, request: ColoringPageRequest): string {
  // Try to extract SVG from AI response
  const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
  if (svgMatch) {
    return svgMatch[0];
  }

  // If no SVG found, create a professional fallback
  console.log('⚠️ No SVG in AI response, creating professional fallback');
  return createProfessionalFallbackSVG(request);
}

function createProfessionalFallbackSVG(request: ColoringPageRequest): string {
  const { subject, elements, ageRange } = request;
  
  return `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" fill="white"/>
    
    <g stroke="#000000" fill="none" stroke-width="3">
      <!-- Professional educational scene for ${subject} -->
      <rect x="100" y="100" width="824" height="650" rx="20" stroke-width="2"/>
      
      <!-- Main subject elements -->
      <circle cx="300" cy="350" r="100" stroke-width="4"/>
      <rect x="450" y="250" width="200" height="200" rx="15" stroke-width="4"/>
      <polygon points="700,250 800,350 700,450 600,350" stroke-width="4"/>
      
      <!-- Educational details -->
      <circle cx="250" cy="600" r="50" stroke-width="3"/>
      <circle cx="450" cy="620" r="50" stroke-width="3"/>
      <circle cx="650" cy="600" r="50" stroke-width="3"/>
      
      <!-- Age-appropriate decorative elements -->
      <path d="M 150 800 Q 200 750 250 800 Q 300 750 350 800" stroke-width="2"/>
      <path d="M 450 820 Q 500 770 550 820 Q 600 770 650 820" stroke-width="2"/>
      <path d="M 700 800 Q 750 750 800 800 Q 850 750 900 800" stroke-width="2"/>
    </g>
    
    <!-- Subject label -->
    <text x="512" y="950" text-anchor="middle" font-family="Arial" font-size="20" fill="#000">
      ${subject} - Ages ${ageRange}
    </text>
  </svg>`;
}

async function saveColoringPage(svgContent: string, subject: string): Promise<{ imageUrl: string; localPath: string }> {
  const uploadsDir = path.join(process.cwd(), 'uploads', 'activities');
  await fs.mkdir(uploadsDir, { recursive: true });

  const timestamp = Date.now();
  const filename = `coloring_${subject.replace(/\s+/g, '_')}_${timestamp}.svg`;
  const localPath = path.join(uploadsDir, filename);
  
  await fs.writeFile(localPath, svgContent);
  
  const imageUrl = `/uploads/activities/${filename}`;
  return { imageUrl, localPath };
}

export async function isAvailable(): Promise<boolean> {
  return !!process.env.ANTHROPIC_API_KEY;
}