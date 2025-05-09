// Test file for AI integration with TypeScript
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client with API key from environment variables
let anthropic: Anthropic | null = null;

try {
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    console.log('Anthropic API initialized successfully, key available:', !!process.env.ANTHROPIC_API_KEY);
  } else {
    console.warn('Anthropic API Key not provided in environment variables');
  }
} catch (error) {
  console.error('Failed to initialize Anthropic client:', error);
}

// the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
const MODEL = 'claude-3-7-sonnet-20250219';

async function testAnthropicServices() {
  try {
    console.log('Testing Anthropic AI integration...');
    
    if (!anthropic) {
      console.error('Anthropic client not initialized. Unable to run tests.');
      return;
    }
    
    // Test a simple prompt
    console.log('\nTesting basic AI prompt response...');
    
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        { role: 'user', content: 'Provide a brief overview of adaptive learning technology.' }
      ],
    });

    const contentBlock = response.content[0];
    if (contentBlock.type !== 'text') {
      throw new Error('Unexpected response format from AI');
    }
    
    console.log('Response sample:', contentBlock.text.substring(0, 200) + '...');
    
    console.log('\nAI test completed successfully!');
  } catch (error: any) {
    console.error('Error testing Anthropic services:', error);
  }
}

// Run the tests
testAnthropicServices();