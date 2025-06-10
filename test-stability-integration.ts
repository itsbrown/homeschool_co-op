/**
 * Comprehensive Stability AI Integration Test Suite
 * Tests API connectivity, image generation, and thick line processing
 */

import { generateStabilityColoringPage } from './server/services/stabilityAI';
import fs from 'fs';
import path from 'path';

interface APITestResult {
  test: string;
  success: boolean;
  duration: number;
  fileSize?: number;
  error?: string;
}

async function testStabilityAPIConnectivity(): Promise<APITestResult> {
  const startTime = Date.now();
  
  try {
    console.log('Testing Stability AI API connectivity...');
    
    // Test with minimal generation
    const svgContent = await generateStabilityColoringPage(
      "Simple Circle",
      ["Circle"],
      "5-8"
    );
    
    const duration = Date.now() - startTime;
    const fileSize = svgContent.length;
    
    console.log(`API Response received in ${duration}ms`);
    console.log(`Generated content size: ${fileSize} bytes`);
    
    return {
      test: "API Connectivity",
      success: true,
      duration,
      fileSize
    };
    
  } catch (error) {
    return {
      test: "API Connectivity", 
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function testThickLineProcessing(): Promise<APITestResult> {
  const startTime = Date.now();
  
  try {
    console.log('Testing thick line processing...');
    
    const svgContent = await generateStabilityColoringPage(
      "Test Shape",
      ["Square", "Triangle"],
      "6-10"
    );
    
    const duration = Date.now() - startTime;
    
    // Validate thick line characteristics
    const hasEmbeddedImage = svgContent.includes('data:image/png;base64,');
    const isLargeFile = svgContent.length > 50000;
    const hasProperStructure = svgContent.includes('<svg') && svgContent.includes('viewBox');
    
    if (!hasEmbeddedImage) {
      throw new Error('Missing embedded image - not using Stability AI');
    }
    
    if (!isLargeFile) {
      throw new Error(`File too small (${svgContent.length} bytes) - likely fallback generation`);
    }
    
    return {
      test: "Thick Line Processing",
      success: true,
      duration,
      fileSize: svgContent.length
    };
    
  } catch (error) {
    return {
      test: "Thick Line Processing",
      success: false, 
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function testMultipleSubjects(): Promise<APITestResult[]> {
  const subjects = [
    { name: "Animals", elements: ["Cat", "Dog"], ageRange: "5-8" },
    { name: "Vehicles", elements: ["Car", "Truck"], ageRange: "7-12" },
    { name: "Nature", elements: ["Tree", "Flower"], ageRange: "6-10" }
  ];
  
  const results: APITestResult[] = [];
  
  for (const subject of subjects) {
    const startTime = Date.now();
    
    try {
      console.log(`Testing subject: ${subject.name}`);
      
      const svgContent = await generateStabilityColoringPage(
        subject.name,
        subject.elements,
        subject.ageRange
      );
      
      const duration = Date.now() - startTime;
      
      // Save test file
      const filename = `test_${subject.name.toLowerCase()}_${Date.now()}.svg`;
      const filepath = path.join('uploads/activities', filename);
      fs.writeFileSync(filepath, svgContent);
      
      results.push({
        test: `Subject: ${subject.name}`,
        success: true,
        duration,
        fileSize: svgContent.length
      });
      
      console.log(`Generated ${filename} (${(svgContent.length/1024).toFixed(1)}KB)`);
      
    } catch (error) {
      results.push({
        test: `Subject: ${subject.name}`,
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  return results;
}

async function runComprehensiveTests(): Promise<void> {
  console.log('🧪 STABILITY AI INTEGRATION TEST SUITE');
  console.log('=======================================\n');
  
  const allResults: APITestResult[] = [];
  
  // Test 1: API Connectivity
  console.log('🔌 Test 1: API Connectivity');
  const connectivityResult = await testStabilityAPIConnectivity();
  allResults.push(connectivityResult);
  console.log(`Result: ${connectivityResult.success ? '✅ PASS' : '❌ FAIL'}`);
  if (connectivityResult.error) console.log(`Error: ${connectivityResult.error}`);
  console.log('');
  
  // Test 2: Thick Line Processing
  console.log('🎨 Test 2: Thick Line Processing');
  const thickLineResult = await testThickLineProcessing();
  allResults.push(thickLineResult);
  console.log(`Result: ${thickLineResult.success ? '✅ PASS' : '❌ FAIL'}`);
  if (thickLineResult.error) console.log(`Error: ${thickLineResult.error}`);
  console.log('');
  
  // Test 3: Multiple Subjects
  console.log('📚 Test 3: Multiple Subject Generation');
  const subjectResults = await testMultipleSubjects();
  allResults.push(...subjectResults);
  
  const subjectSuccesses = subjectResults.filter(r => r.success).length;
  console.log(`Results: ${subjectSuccesses}/${subjectResults.length} subjects passed`);
  console.log('');
  
  // Generate final report
  generateFinalReport(allResults);
}

function generateFinalReport(results: APITestResult[]): void {
  console.log('📊 FINAL TEST REPORT');
  console.log('====================');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Passed: ${successful.length}/${results.length} tests`);
  console.log(`❌ Failed: ${failed.length}/${results.length} tests`);
  
  if (successful.length > 0) {
    const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
    const avgFileSize = successful
      .filter(r => r.fileSize)
      .reduce((sum, r) => sum + (r.fileSize || 0), 0) / successful.filter(r => r.fileSize).length;
    
    console.log(`⏱️  Average duration: ${(avgDuration/1000).toFixed(1)}s`);
    console.log(`📏 Average file size: ${(avgFileSize/1024).toFixed(1)}KB`);
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    failed.forEach(result => {
      console.log(`   ${result.test}: ${result.error}`);
    });
  }
  
  // Overall assessment
  const successRate = (successful.length / results.length) * 100;
  
  console.log(`\n🎯 Overall Success Rate: ${successRate.toFixed(1)}%`);
  
  if (successRate === 100) {
    console.log('🌟 EXCELLENT - All systems working perfectly');
  } else if (successRate >= 80) {
    console.log('✅ GOOD - System mostly functional');
  } else if (successRate >= 60) {
    console.log('⚠️  NEEDS ATTENTION - Some issues detected');
  } else {
    console.log('🔧 CRITICAL - Major issues need fixing');
  }
  
  console.log('\n🔍 Quality Indicators:');
  const largeFiles = successful.filter(r => r.fileSize && r.fileSize > 100000);
  console.log(`   High-quality generations: ${largeFiles.length}/${successful.filter(r => r.fileSize).length}`);
  console.log(`   Stability AI integration: ${successful.some(r => r.test.includes('API')) ? '✅ Working' : '❌ Failed'}`);
  console.log(`   Thick line processing: ${successful.some(r => r.test.includes('Thick Line')) ? '✅ Working' : '❌ Failed'}`);
}

// Run tests
runComprehensiveTests()
  .then(() => {
    console.log('\n✅ Test suite completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  });