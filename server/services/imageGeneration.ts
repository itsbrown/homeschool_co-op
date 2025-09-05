import fetch from 'node-fetch';

interface ImageGenerationOptions {
  prompt: string;
  style?: 'coloring-page' | 'illustration' | 'realistic';
  width?: number;
  height?: number;
}

interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  base64?: string;
  error?: string;
}

/**
 * Generate coloring page images using available image generation services
 */
export async function generateColoringPageImage(
  subject: string,
  ageRange: string,
  elements: string[]
): Promise<ImageGenerationResult> {
  
  try {
    // Use Stability AI for professional coloring page generation
    const { generateStabilityColoringPage } = await import('./stabilityAI');
    
    console.log(`🎨 Generating professional AI coloring page for: ${subject}`);
    const filePath = await generateStabilityColoringPage(subject, elements, ageRange);
    
    console.log(`✅ Generated professional coloring page: ${filePath}`);
    
    return {
      success: true,
      imageUrl: filePath,
      base64: undefined
    };
    
  } catch (error: unknown) {
    console.error('❌ Professional AI coloring page generation failed:', error);
    
    try {
      // Try Hugging Face as backup
      const prompt = `Create a simple black and white coloring page suitable for ages ${ageRange}. 
      Subject: ${subject}
      
      The image should include these elements: ${elements.join(', ')}
      
      Style requirements:
      - Simple, clear black outlines on white background
      - No shading or filled areas - just outlines to color
      - Age-appropriate complexity for ${ageRange}
      - Educational and engaging
      - Clean lines suitable for coloring
      - No text or words in the image
      
      Make it a simple line drawing that children can easily color.`;

      const huggingFaceResult = await tryHuggingFaceGeneration(prompt);
      if (huggingFaceResult.success) {
        return huggingFaceResult;
      }

      console.log('Hugging Face image generation failed, generating fallback SVG');
      
      // Import and use fallback SVG generation
      const { createEducationalSVG } = await import('./huggingfaceService');
      const fs = await import('fs');
      const path = await import('path');
      
      // Generate educational SVG based on the prompt
      const svgContent = await createEducationalSVG(prompt);
      
      // Create uploads directory if it doesn't exist
      const uploadDir = path.default.join(process.cwd(), 'uploads', 'images');
      await fs.default.promises.mkdir(uploadDir, { recursive: true });
      
      // Save SVG to file
      const timestamp = Date.now();
      const filename = `coloring_fallback_${timestamp}.svg`;
      const filepath = path.default.join(uploadDir, filename);
      
      await fs.default.promises.writeFile(filepath, svgContent);
      
      // Create URL and base64
      const imageUrl = `/uploads/images/${filename}`;
      const base64 = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
      
      return {
        success: true,
        imageUrl: imageUrl,
        base64: base64
      };
      
    } catch (fallbackError: unknown) {
      console.error('Error generating coloring page image:', fallbackError);
      return {
        success: false,
        error: `Failed to generate coloring page image: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
      };
    }
  }
}

/**
 * Try generating image using Hugging Face API
 */
async function tryHuggingFaceGeneration(prompt: string): Promise<ImageGenerationResult> {
  try {
    // Import and use the Hugging Face service directly
    const { generateCustomImage, isHuggingFaceAvailable } = await import('./huggingfaceService');
    
    if (!isHuggingFaceAvailable()) {
      return {
        success: false,
        error: 'Hugging Face service is not available'
      };
    }

    const imagePath = await generateCustomImage(prompt);
    
    if (!imagePath) {
      return {
        success: false,
        error: 'Failed to generate image - no path returned'
      };
    }

    // Convert to URL format
    const fs = await import('fs');
    const path = await import('path');
    
    if (!fs.default.existsSync(imagePath)) {
      return {
        success: false,
        error: 'Generated image file does not exist'
      };
    }

    // Create relative URL
    const filename = path.default.basename(imagePath);
    const imageUrl = `/uploads/images/${filename}`;
    
    // Read as base64
    const imageBuffer = fs.default.readFileSync(imagePath);
    const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;

    return {
      success: true,
      imageUrl: imageUrl,
      base64: base64
    };
    
  } catch (error) {
    console.error('Hugging Face generation error:', error);
    return {
      success: false,
      error: `Hugging Face API error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Create a fallback text-based coloring page description
 */
export function createColoringPageFallback(
  subject: string,
  ageRange: string,
  elements: string[]
): any {
  return {
    type: 'text-based-coloring',
    title: `${subject} Coloring Activity`,
    description: `A coloring page featuring ${subject} elements for ages ${ageRange}`,
    instructions: 'This activity describes elements to draw and color. An actual coloring page image will be generated when image services are available.',
    content: {
      theme: `Educational ${subject} Coloring Activity`,
      elements: elements.map(element => ({
        name: element,
        description: `Draw and color ${element} related to ${subject}`
      })),
      drawingInstructions: [
        'Use this description to create your own coloring page',
        'Draw simple outlines of each element listed',
        'Make sure lines are thick enough for coloring',
        'Leave areas white for coloring'
      ],
      learningFacts: [
        `${subject} includes many interesting elements to explore`,
        `Coloring helps develop fine motor skills and creativity`,
        `Each element represents an important aspect of ${subject}`
      ]
    },
    note: 'Image generation services are currently being set up. This text-based version provides the framework for creating the coloring page.'
  };
}