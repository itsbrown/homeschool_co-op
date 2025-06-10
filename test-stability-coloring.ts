/**
 * Test Stability AI coloring page generation through our service
 */

import { generateStabilityColoringPage } from './server/services/stabilityAI';
import * as fs from 'fs/promises';
import * as path from 'path';

async function testStabilityColoringService() {
  console.log('🧪 Testing Stability AI coloring page service...');
  
  try {
    const subject = 'Farm Animals';
    const elements = ['cow', 'pig', 'chicken', 'barn'];
    const ageRange = '5-8';
    
    console.log(`📝 Generating coloring page: ${subject} with elements: ${elements.join(', ')}`);
    
    const svgContent = await generateStabilityColoringPage(subject, elements, ageRange);
    
    console.log(`✅ Generated SVG content (${svgContent.length} characters)`);
    
    // Save test file
    const testDir = './uploads/test-coloring-pages';
    await fs.mkdir(testDir, { recursive: true });
    const testFile = path.join(testDir, 'stability_farm_animals_test.svg');
    await fs.writeFile(testFile, svgContent);
    
    console.log(`💾 Saved test coloring page to: ${testFile}`);
    return true;
    
  } catch (error) {
    console.error('❌ Stability AI coloring service test failed:', error);
    return false;
  }
}

testStabilityColoringService().then(success => {
  console.log(success ? '🎉 Stability AI coloring service test completed' : '💥 Test failed');
  process.exit(success ? 0 : 1);
});