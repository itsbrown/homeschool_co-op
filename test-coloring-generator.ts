/**
 * Test Professional Coloring Page Generator Capabilities
 */

import { generateProfessionalColoringPage } from './server/services/professionalColoringPages';
import * as fs from 'fs/promises';
import * as path from 'path';

interface TestScenario {
  name: string;
  subject: string;
  elements: string[];
  ageRange: string;
}

const testScenarios: TestScenario[] = [
  {
    name: "Farm Animals (Ages 4-6)",
    subject: "Farm Animals",
    elements: ["Cow", "Pig", "Chicken", "Barn", "Fence", "Sun"],
    ageRange: "4-6"
  },
  {
    name: "Ocean Life (Ages 6-9)",
    subject: "Ocean Life", 
    elements: ["Whale", "Dolphin", "Fish", "Coral", "Starfish", "Seaweed"],
    ageRange: "6-9"
  },
  {
    name: "Space Exploration (Ages 8-12)",
    subject: "Space Exploration",
    elements: ["Rocket", "Astronaut", "Planets", "Stars", "Moon", "Satellite"],
    ageRange: "8-12"
  },
  {
    name: "Transportation (Ages 3-5)",
    subject: "Transportation",
    elements: ["Car", "Truck", "Airplane", "Train", "Road", "Traffic Light"],
    ageRange: "3-5"
  }
];

async function testColoringGenerator() {
  console.log("🎨 Testing Professional Coloring Page Generator Capabilities\n");
  
  const results: any[] = [];
  
  for (const scenario of testScenarios) {
    console.log(`Testing: ${scenario.name}`);
    console.log(`Subject: ${scenario.subject}`);
    console.log(`Elements: ${scenario.elements.join(', ')}`);
    console.log(`Age Range: ${scenario.ageRange}`);
    
    try {
      const startTime = Date.now();
      
      const svgContent = await generateProfessionalColoringPage(
        scenario.subject,
        scenario.elements,
        scenario.ageRange
      );
      
      const endTime = Date.now();
      const generationTime = endTime - startTime;
      
      // Save the generated SVG
      const uploadsDir = path.join(process.cwd(), 'uploads', 'test-coloring');
      await fs.mkdir(uploadsDir, { recursive: true });
      
      const filename = `test_${scenario.subject.replace(/\s+/g, '_')}_${scenario.ageRange.replace('-', 'to')}.svg`;
      const filePath = path.join(uploadsDir, filename);
      await fs.writeFile(filePath, svgContent);
      
      const fileSize = svgContent.length;
      const isDetailed = svgContent.includes('viewBox') && fileSize > 500;
      const hasProperStructure = svgContent.includes('<svg') && svgContent.includes('</svg>');
      
      const result = {
        scenario: scenario.name,
        success: true,
        generationTime: `${generationTime}ms`,
        fileSize: `${fileSize} characters`,
        filePath: `/uploads/test-coloring/${filename}`,
        quality: isDetailed ? 'Detailed' : 'Basic',
        structure: hasProperStructure ? 'Valid SVG' : 'Invalid',
        complexity: fileSize > 2000 ? 'High' : fileSize > 1000 ? 'Medium' : 'Low'
      };
      
      results.push(result);
      console.log(`✅ Success - ${result.quality} quality, ${result.complexity} complexity`);
      console.log(`   File: ${result.filePath}`);
      console.log(`   Size: ${result.fileSize}, Time: ${result.generationTime}\n`);
      
    } catch (error) {
      const result = {
        scenario: scenario.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        generationTime: 'Failed',
        fileSize: '0 characters',
        filePath: 'None',
        quality: 'Failed',
        structure: 'Invalid',
        complexity: 'None'
      };
      
      results.push(result);
      console.log(`❌ Failed - ${result.error}\n`);
    }
  }
  
  // Generate summary report
  console.log("📊 COLORING PAGE GENERATOR CAPABILITIES REPORT");
  console.log("================================================");
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => r.success === false).length;
  
  console.log(`✅ Successful generations: ${successful}/${testScenarios.length}`);
  console.log(`❌ Failed generations: ${failed}/${testScenarios.length}`);
  console.log(`📈 Success rate: ${Math.round((successful / testScenarios.length) * 100)}%`);
  
  console.log("\n🎯 QUALITY ANALYSIS:");
  results.forEach(result => {
    if (result.success) {
      console.log(`${result.scenario}: ${result.quality} (${result.complexity} complexity)`);
      console.log(`   Link: http://localhost:5000${result.filePath}`);
    } else {
      console.log(`${result.scenario}: FAILED - ${result.error}`);
    }
  });
  
  return results;
}

export { testColoringGenerator };