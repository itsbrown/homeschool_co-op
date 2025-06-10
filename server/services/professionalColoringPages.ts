/**
 * Professional Coloring Page Generator using AI
 * Creates detailed, educational SVG coloring pages using Claude
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateProfessionalColoringPage(
  subject: string,
  elements: string[],
  ageRange: string
): Promise<string> {
  console.log(`🎨 Generating professional coloring page: ${subject} for ages ${ageRange}`);

  try {
    const prompt = createDetailedColoringPrompt(subject, elements, ageRange);
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: `You are a professional children's book illustrator and coloring book artist. Create detailed, high-quality SVG coloring pages that are:
      - Age-appropriate with proper complexity levels
      - Educational and engaging for children
      - Professional illustration quality with anatomically correct but child-friendly designs
      - Optimized for coloring with proper line weights and closed shapes
      - No text within the coloring areas
      - Clean, detailed outlines suitable for children to color`,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in response');
    }
    const svgContent = extractSVGFromResponse(textContent.text);
    
    if (!svgContent || svgContent.length < 100) {
      throw new Error('Generated SVG content is too short or invalid');
    }

    console.log(`✅ Generated professional coloring page (${svgContent.length} characters)`);
    return svgContent;

  } catch (error) {
    console.error('❌ Failed to generate professional coloring page:', error);
    throw error;
  }
}

function createDetailedColoringPrompt(subject: string, elements: string[], ageRange: string): string {
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
- Make animals/characters cute and appealing to children

SUBJECT-SPECIFIC GUIDANCE:
${getSubjectGuidance(subject, elements)}

OUTPUT: Return ONLY the complete SVG code, starting with <svg> and ending with </svg>. No explanations or additional text.`;
}

function getSubjectGuidance(subject: string, elements: string[]): string {
  const lowerSubject = subject.toLowerCase();
  const allText = (subject + ' ' + elements.join(' ')).toLowerCase();

  if (allText.includes('farm') || allText.includes('cow') || allText.includes('pig')) {
    return `- Create a detailed farm scene with barn, fence, grass, and sky
- Make animals anatomically correct with proper proportions
- Include farm details like hay bales, water troughs, or farm tools
- Show animals in natural farm poses and interactions
- Add environmental elements like clouds, sun, and trees`;
  }

  if (allText.includes('ocean') || allText.includes('sea') || allText.includes('fish')) {
    return `- Create an underwater scene with coral, seaweed, and ocean floor
- Make sea creatures anatomically accurate with flowing fins and natural poses
- Include bubbles, coral formations, and sea plants
- Show creatures in their natural habitat with proper scale relationships
- Add depth with foreground and background elements`;
  }

  if (allText.includes('vehicle') || allText.includes('car') || allText.includes('truck')) {
    return `- Show vehicles with accurate proportions and realistic details
- Include proper wheels, windows, doors, and mechanical elements
- Add road, traffic signs, or urban/rural environment
- Make vehicles appealing to children with friendly designs
- Include safety features and educational vehicle components`;
  }

  if (allText.includes('space') || allText.includes('planet') || allText.includes('rocket')) {
    return `- Create a detailed space scene with planets, stars, and cosmic elements
- Show spacecraft with realistic but child-friendly details
- Include astronauts, space stations, or alien landscapes
- Add educational elements like solar system components
- Use flowing lines for space trails and cosmic phenomena`;
  }

  return `- Create a detailed, engaging scene showcasing the subject
- Include environmental context and background elements
- Make all elements age-appropriate and educational
- Use proper proportions and realistic but child-friendly details
- Add complementary elements that enhance the learning experience`;
}

function extractSVGFromResponse(text: string): string {
  // Extract SVG content from Claude's response
  const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
  if (svgMatch) {
    return svgMatch[0];
  }

  // If no complete SVG found, try to construct one from partial content
  if (text.includes('<svg') && text.includes('</svg>')) {
    const startIndex = text.indexOf('<svg');
    const endIndex = text.lastIndexOf('</svg>') + 6;
    return text.substring(startIndex, endIndex);
  }

  throw new Error('No valid SVG content found in response');
}

export async function isAnthropicAvailable(): Promise<boolean> {
  try {
    return !!process.env.ANTHROPIC_API_KEY;
  } catch {
    return false;
  }
}