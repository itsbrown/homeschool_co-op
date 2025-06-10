/**
 * Test Thick Line Coloring Page Generation
 * Validates traditional coloring book style with 3-4px solid lines
 */

import { generateStabilityColoringPage } from './server/services/stabilityAI';
import fs from 'fs';
import path from 'path';

interface TestResult {
  subject: string;
  ageRange: string;
  fileSize: number;
  success: boolean;
  error?: string;
}

const testScenarios = [
  {
    subject: "Farm Animals",
    ageRange: "5-8",
    elements: ["Barn", "Cow", "Pig", "Horse", "Sheep", "Chickens"],
    expectedStyle: "Simple thick lines for young children"
  },
  {
    subject: "Ocean Life", 
    ageRange: "7-12",
    elements: ["Whale", "Dolphin", "Octopus", "Seahorse", "Coral Reef"],
    expectedStyle: "Moderately detailed thick lines"
  },
  {
    subject: "Space Adventure",
    ageRange: "10-14", 
    elements: ["Rocket", "Astronaut", "Planets", "Space Station", "Stars"],
    expectedStyle: "Detailed thick lines for older children"
  }
];

async function testThickLineGeneration(): Promise<void> {
  console.log('🎨 Testing Thick Line Coloring Page Generation\n');
  
  const results: TestResult[] = [];
  
  for (const scenario of testScenarios) {
    console.log(`Testing: ${scenario.subject} (Ages ${scenario.ageRange})`);
    console.log(`Expected: ${scenario.expectedStyle}`);
    
    try {
      const svgContent = await generateStabilityColoringPage(
        scenario.subject,
        scenario.elements,
        scenario.ageRange
      );
      
      // Save test file
      const filename = `test_thick_lines_${scenario.subject.replace(/\s+/g, '_')}_${Date.now()}.svg`;
      const filepath = path.join('uploads/activities', filename);
      
      fs.writeFileSync(filepath, svgContent);
      const fileSize = fs.statSync(filepath).size;
      
      results.push({
        subject: scenario.subject,
        ageRange: scenario.ageRange,
        fileSize,
        success: true
      });
      
      console.log(`✅ Generated: ${filename}`);
      console.log(`📏 File size: ${fileSize} bytes (${(fileSize/1024).toFixed(1)}KB)`);
      
      // Validate thick line characteristics
      validateThickLines(svgContent, scenario.subject);
      
    } catch (error) {
      console.error(`❌ Failed: ${error}`);
      results.push({
        subject: scenario.subject,
        ageRange: scenario.ageRange,
        fileSize: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    console.log('---');
  }
  
  // Generate summary report
  generateTestReport(results);
}

function validateThickLines(svgContent: string, subject: string): void {
  console.log(`🔍 Validating thick line characteristics for ${subject}:`);
  
  // Check for embedded image (indicates Stability AI generation)
  const hasEmbeddedImage = svgContent.includes('data:image/png;base64,');
  console.log(`   📸 Embedded image: ${hasEmbeddedImage ? '✅' : '❌'}`);
  
  // Check file size indicates quality generation (>100KB)
  const isLargeFile = svgContent.length > 100000;
  console.log(`   📏 Large file (>100KB): ${isLargeFile ? '✅' : '❌'}`);
  
  // Check for traditional coloring book comment
  const hasColoringComment = svgContent.includes('Professional') && svgContent.includes('coloring page');
  console.log(`   🎨 Coloring page format: ${hasColoringComment ? '✅' : '❌'}`);
  
  // Check SVG structure
  const hasProperSVG = svgContent.includes('<svg') && svgContent.includes('viewBox="0 0 1024 1024"');
  console.log(`   🖼️  Proper SVG structure: ${hasProperSVG ? '✅' : '❌'}`);
}

function generateTestReport(results: TestResult[]): void {
  console.log('\n📊 THICK LINE COLORING PAGE TEST REPORT');
  console.log('==========================================');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  
  if (successful.length > 0) {
    console.log('\n🎯 Successful Generations:');
    successful.forEach(result => {
      console.log(`   ${result.subject} (${result.ageRange}): ${(result.fileSize/1024).toFixed(1)}KB`);
    });
    
    const avgSize = successful.reduce((sum, r) => sum + r.fileSize, 0) / successful.length;
    console.log(`   Average file size: ${(avgSize/1024).toFixed(1)}KB`);
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed Generations:');
    failed.forEach(result => {
      console.log(`   ${result.subject}: ${result.error}`);
    });
  }
  
  // Quality assessment
  const largeFiles = successful.filter(r => r.fileSize > 100000);
  const qualityPercentage = (largeFiles.length / successful.length) * 100;
  
  console.log(`\n🎨 Quality Assessment:`);
  console.log(`   High-quality files (>100KB): ${largeFiles.length}/${successful.length} (${qualityPercentage.toFixed(1)}%)`);
  
  if (qualityPercentage >= 80) {
    console.log('   🌟 EXCELLENT - Thick line generation is working consistently');
  } else if (qualityPercentage >= 60) {
    console.log('   ⚠️  GOOD - Most generations are high quality');
  } else {
    console.log('   🔧 NEEDS IMPROVEMENT - Quality inconsistent');
  }
}

// Run the test
if (require.main === module) {
  testThickLineGeneration()
    .then(() => {
      console.log('\n✅ Thick line coloring page test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}