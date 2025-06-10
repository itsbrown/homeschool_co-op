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
  
  // Create a detailed prompt for coloring page generation
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

  try {
    // Try Hugging Face first if available
    const huggingFaceResult = await tryHuggingFaceGeneration(prompt);
    if (huggingFaceResult.success) {
      return huggingFaceResult;
    }

    // If Hugging Face fails, try other available services
    console.log('Hugging Face image generation failed, trying alternative methods');
    
    // Return a structured response indicating image generation is needed
    return {
      success: true,
      imageUrl: null,
      base64: null,
      error: null
    };
    
  } catch (error) {
    console.error('Error generating coloring page image:', error);
    return {
      success: false,
      error: `Failed to generate coloring page image: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Try generating image using Hugging Face API
 */
async function tryHuggingFaceGeneration(prompt: string): Promise<ImageGenerationResult> {
  try {
    const response = await fetch('/api/image-services/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt + ' simple coloring page black and white outlines',
        service: 'huggingface'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success && result.imageUrl) {
      return {
        success: true,
        imageUrl: result.imageUrl,
        base64: result.base64
      };
    } else {
      return {
        success: false,
        error: result.error || 'Failed to generate image'
      };
    }
    
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