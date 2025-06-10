/**
 * Colorify AI Integration Service
 * Professional coloring page generation specifically designed for educational content
 */

import fs from 'fs';
import path from 'path';

interface ColorifyAIRequest {
  subject: string;
  elements: string[];
  ageRange: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  style: 'educational' | 'realistic' | 'cartoon' | 'detailed';
  lineThickness: number;
  complexity: 'simple' | 'moderate' | 'detailed';
}

interface ColorifyAIResponse {
  success: boolean;
  imageUrl?: string;
  downloadUrl?: string;
  error?: string;
  metadata?: {
    elements: string[];
    complexity: string;
    ageAppropriate: boolean;
    educationalValue: number;
  };
}

/**
 * Generate educational coloring page using Colorify AI
 */
export async function generateColoringPage(
  subject: string,
  elements: string[],
  ageRange: string,
  difficulty: 'beginner' | 'intermediate' | 'advanced' = 'beginner'
): Promise<{ imageUrl: string; localPath: string }> {
  
  console.log(`🎨 Generating Colorify AI coloring page for: ${subject}`);
  console.log(`📝 Elements: ${elements.join(', ')}`);
  console.log(`👶 Age range: ${ageRange}`);

  try {
    // Check if Colorify AI API key is available
    const apiKey = process.env.COLORIFY_AI_API_KEY;
    if (!apiKey) {
      throw new Error('Colorify AI API key not configured');
    }

    // Prepare request payload optimized for educational content
    const requestPayload: ColorifyAIRequest = {
      subject,
      elements,
      ageRange,
      difficulty,
      style: 'educational',
      lineThickness: getOptimalLineThickness(ageRange),
      complexity: getComplexityForAge(ageRange)
    };

    console.log(`🎯 Colorify AI request:`, requestPayload);

    // Make API request to Colorify AI
    const response = await fetch('https://api.colorify.ai/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Platform': 'american-seekers-academy',
        'X-Content-Type': 'educational'
      },
      body: JSON.stringify({
        prompt: createEducationalPrompt(subject, elements, ageRange),
        style: 'coloring_book',
        line_thickness: requestPayload.lineThickness,
        complexity: requestPayload.complexity,
        age_range: ageRange,
        educational_focus: true,
        closed_shapes: true,
        no_text: true,
        background: 'white',
        format: 'png',
        size: '1024x1024',
        quality: 'high'
      })
    });

    if (!response.ok) {
      throw new Error(`Colorify AI API error: ${response.status} ${response.statusText}`);
    }

    const result: ColorifyAIResponse = await response.json();

    if (!result.success || !result.imageUrl) {
      throw new Error(`Colorify AI generation failed: ${result.error}`);
    }

    console.log(`✅ Colorify AI generated image: ${result.imageUrl}`);

    // Download and save the image locally
    const localPath = await downloadAndSaveImage(result.imageUrl, subject, elements);
    
    return {
      imageUrl: result.imageUrl,
      localPath
    };

  } catch (error) {
    console.error('❌ Colorify AI generation failed:', error);
    
    // Fallback to enhanced SVG generation
    console.log('🔄 Falling back to enhanced SVG generation...');
    return await generateEnhancedSVGFallback(subject, elements, ageRange);
  }
}

/**
 * Create educational prompt optimized for Colorify AI
 */
function createEducationalPrompt(subject: string, elements: string[], ageRange: string): string {
  const ageLevel = getAgeLevel(ageRange);
  
  let basePrompt = `Educational coloring page for ${ageLevel} featuring ${subject}. `;
  
  if (elements.length > 0) {
    basePrompt += `Include these specific elements: ${elements.join(', ')}. `;
  }

  const subjectSpecificGuidance = getSubjectSpecificGuidance(subject, elements);
  const ageSpecificGuidance = getAgeSpecificGuidance(ageRange);

  return basePrompt + subjectSpecificGuidance + ageSpecificGuidance;
}

/**
 * Get optimal line thickness based on age range
 */
function getOptimalLineThickness(ageRange: string): number {
  const [minAge] = ageRange.split('-').map(Number);
  
  if (minAge <= 4) return 4; // Thick lines for toddlers
  if (minAge <= 7) return 3; // Medium-thick for early elementary
  if (minAge <= 12) return 2.5; // Standard for elementary
  return 2; // Thinner for teens/adults
}

/**
 * Get complexity level based on age range
 */
function getComplexityForAge(ageRange: string): 'simple' | 'moderate' | 'detailed' {
  const [minAge] = ageRange.split('-').map(Number);
  
  if (minAge <= 5) return 'simple';
  if (minAge <= 10) return 'moderate';
  return 'detailed';
}

/**
 * Get age level description
 */
function getAgeLevel(ageRange: string): string {
  const [minAge, maxAge] = ageRange.split('-').map(Number);
  
  if (maxAge <= 5) return 'preschoolers';
  if (maxAge <= 8) return 'early elementary students';
  if (maxAge <= 12) return 'elementary students';
  if (maxAge <= 15) return 'middle school students';
  return 'high school students';
}

/**
 * Get subject-specific guidance for better results
 */
function getSubjectSpecificGuidance(subject: string, elements: string[]): string {
  const lowerSubject = subject.toLowerCase();
  
  if (lowerSubject.includes('animal') || elements.some(e => ['animal', 'pet', 'wildlife'].some(term => e.toLowerCase().includes(term)))) {
    return 'Show animals in their natural habitat with anatomically accurate but simplified features. Include environmental context. ';
  }
  
  if (lowerSubject.includes('vehicle') || elements.some(e => ['car', 'truck', 'plane', 'bike'].some(term => e.toLowerCase().includes(term)))) {
    return 'Display vehicles with clear, recognizable features and proper proportions. Include safety elements and context. ';
  }
  
  if (lowerSubject.includes('history') || lowerSubject.includes('historical')) {
    return 'Create historically accurate representations with period-appropriate clothing, architecture, and objects. Make complex concepts accessible. ';
  }
  
  if (lowerSubject.includes('science') || lowerSubject.includes('space') || lowerSubject.includes('nature')) {
    return 'Include scientifically accurate details while maintaining simplicity. Add educational context and clear relationships between elements. ';
  }
  
  return 'Create engaging, educational content with clear visual relationships between elements. ';
}

/**
 * Get age-specific guidance
 */
function getAgeSpecificGuidance(ageRange: string): string {
  const [minAge] = ageRange.split('-').map(Number);
  
  if (minAge <= 4) {
    return 'Use large, simple shapes with minimal detail. Ensure all shapes are completely closed with thick, bold outlines.';
  }
  
  if (minAge <= 7) {
    return 'Balance detail with simplicity. Include moderate complexity while maintaining clear, colorable areas.';
  }
  
  if (minAge <= 12) {
    return 'Include educational details and moderate complexity. Add background elements and context.';
  }
  
  return 'Provide detailed, engaging content with complex but manageable elements. Include educational context and relationships.';
}

/**
 * Download and save Colorify AI generated image
 */
async function downloadAndSaveImage(imageUrl: string, subject: string, elements: string[]): Promise<string> {
  try {
    console.log(`📥 Downloading Colorify AI image from: ${imageUrl}`);
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const uploadsDir = path.join(process.cwd(), 'uploads', 'activities');
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    
    const timestamp = Date.now();
    const filename = `colorify_${subject.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.png`;
    const filePath = path.join(uploadsDir, filename);
    
    await fs.promises.writeFile(filePath, buffer);
    
    console.log(`✅ Saved Colorify AI image to: ${filePath}`);
    return `/uploads/activities/${filename}`;
    
  } catch (error) {
    console.error('❌ Failed to download Colorify AI image:', error);
    throw error;
  }
}

/**
 * Enhanced SVG fallback when Colorify AI is unavailable
 */
async function generateEnhancedSVGFallback(
  subject: string, 
  elements: string[], 
  ageRange: string
): Promise<{ imageUrl: string; localPath: string }> {
  
  // Import enhanced SVG generators
  const { createDetailedEducationalSVG } = await import('./enhancedSVGGenerator');
  
  console.log(`🎨 Creating enhanced SVG fallback for: ${subject}`);
  
  const svgContent = createDetailedEducationalSVG(subject, elements, ageRange);
  
  // Save SVG file
  const uploadsDir = path.join(process.cwd(), 'uploads', 'activities');
  await fs.promises.mkdir(uploadsDir, { recursive: true });
  
  const timestamp = Date.now();
  const filename = `enhanced_svg_${subject.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.svg`;
  const filePath = path.join(uploadsDir, filename);
  
  await fs.promises.writeFile(filePath, svgContent);
  
  const localPath = `/uploads/activities/${filename}`;
  
  return {
    imageUrl: localPath,
    localPath
  };
}

/**
 * Check if Colorify AI is available and configured
 */
export function isColorifyAIAvailable(): boolean {
  return !!process.env.COLORIFY_AI_API_KEY;
}

/**
 * Get Colorify AI service status
 */
export async function getColorifyAIStatus(): Promise<{
  available: boolean;
  configured: boolean;
  status: 'operational' | 'degraded' | 'down' | 'not_configured';
}> {
  const configured = isColorifyAIAvailable();
  
  if (!configured) {
    return {
      available: false,
      configured: false,
      status: 'not_configured'
    };
  }

  try {
    // Test API connectivity
    const response = await fetch('https://api.colorify.ai/v1/status', {
      headers: {
        'Authorization': `Bearer ${process.env.COLORIFY_AI_API_KEY}`
      }
    });

    const available = response.ok;
    const status = available ? 'operational' : 'degraded';

    return {
      available,
      configured,
      status
    };

  } catch (error) {
    return {
      available: false,
      configured: true,
      status: 'down'
    };
  }
}