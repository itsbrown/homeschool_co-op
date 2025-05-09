// Test file for AI integration
import { generateCurriculumWithAI, generateLessonPlanWithAI, analyzeStudentWork } from './server/services/anthropic.js';

async function testAnthropicServices() {
  try {
    console.log('Testing Anthropic AI integration...');
    
    // Test curriculum generation
    console.log('\n1. Testing curriculum generation...');
    const currPrompt = 'Generate a short curriculum for mathematics for elementary school students that incorporates visual learning styles.';
    const currResult = await generateCurriculumWithAI(currPrompt);
    console.log('Curriculum generation result sample:', currResult.substring(0, 200) + '...');
    
    // Test lesson plan generation
    console.log('\n2. Testing lesson plan generation...');
    const lessonResult = await generateLessonPlanWithAI(
      'Mathematics',
      'Elementary School',
      45,
      ['visual', 'kinesthetic'],
      'Learn basic addition and subtraction'
    );
    console.log('Lesson plan generation result sample:', lessonResult.substring(0, 200) + '...');
    
    // Test student work analysis
    console.log('\n3. Testing student work analysis...');
    const analysisResult = await analyzeStudentWork(
      'Mathematics',
      'Solve these addition problems: 2+2, 3+5, 7+4',
      'I think 2+2=4, 3+5=8, and 7+4=10',
      'Elementary School'
    );
    console.log('Analysis result sample:', analysisResult.substring(0, 200) + '...');
    
    console.log('\nAll tests completed!');
  } catch (error) {
    console.error('Error testing Anthropic services:', error);
  }
}

// Run the tests
testAnthropicServices();