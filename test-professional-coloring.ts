/**
 * Test Professional Coloring Page Generation
 * Direct test of the advanced SVG generator
 */

import { generateAdvancedColoringPage } from './server/services/alternativeColoringGenerator';
import * as fs from 'fs/promises';
import * as path from 'path';

async function testProfessionalColoring() {
  console.log('🎨 Testing Professional Coloring Page Generation\n');

  const testCases = [
    {
      subject: 'Farm Animals',
      elements: ['Cow', 'Pig', 'Chicken', 'Barn', 'Fence'],
      ageRange: '4-7'
    },
    {
      subject: 'Ocean Life', 
      elements: ['Whale', 'Dolphin', 'Fish', 'Coral Reef', 'Starfish'],
      ageRange: '6-9'
    },
    {
      subject: 'Transportation',
      elements: ['Car', 'Airplane', 'Train', 'Bus'],
      ageRange: '3-6'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\nTesting: ${testCase.subject} (Ages ${testCase.ageRange})`);
    console.log(`Elements: ${testCase.elements.join(', ')}`);
    
    try {
      const svgContent = await generateAdvancedColoringPage(
        testCase.subject,
        testCase.elements,
        testCase.ageRange
      );

      // Save the test result
      const uploadsDir = path.join(process.cwd(), 'uploads', 'test-results');
      await fs.mkdir(uploadsDir, { recursive: true });
      
      const filename = `test_${testCase.subject.replace(/\s+/g, '_')}_${testCase.ageRange.replace('-', 'to')}.svg`;
      const filePath = path.join(uploadsDir, filename);
      await fs.writeFile(filePath, svgContent);
      
      console.log(`✅ Generated: ${filename}`);
      console.log(`   Size: ${svgContent.length} characters`);
      console.log(`   Quality: ${svgContent.length > 2000 ? 'High Detail' : svgContent.length > 1000 ? 'Medium Detail' : 'Basic'}`);
      console.log(`   File: /uploads/test-results/${filename}`);
      
    } catch (error) {
      console.log(`❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  console.log('\n🎯 Professional coloring page generation test complete');
}

testProfessionalColoring().catch(console.error);