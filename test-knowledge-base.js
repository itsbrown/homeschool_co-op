// Test script for knowledge base and Anthropic integration
import { db } from './server/db.js';
import { knowledgeBases } from './shared/schema.js';
import { generateEnhancedPrompt } from './server/services/knowledgeBaseService.js';
import { generateCurriculumWithAI } from './server/services/anthropic.js';

async function createTestKnowledgeBase() {
  try {
    console.log('Creating test knowledge base...');
    
    // Create a test knowledge base for curriculum standards
    const [knowledgeBase] = await db
      .insert(knowledgeBases)
      .values({
        title: 'Common Core Math Standards - Grade 5',
        description: 'Comprehensive collection of Grade 5 math standards from Common Core',
        type: 'curriculum_standards',
        subject: 'Mathematics',
        gradeLevel: 'Grade 5',
        authorId: 1, // Admin user
        isPublished: true,
        isPublic: true,
        downloads: 0,
        avgRating: 0,
        ratingCount: 0,
        content: {
          standards: [
            'Operations & Algebraic Thinking: Write and interpret numerical expressions',
            'Operations & Algebraic Thinking: Analyze patterns and relationships',
            'Number & Operations in Base Ten: Understand the place value system',
            'Number & Operations in Base Ten: Perform operations with multi-digit whole numbers and decimals',
            'Number & Operations—Fractions: Use equivalent fractions as a strategy to add and subtract fractions',
            'Number & Operations—Fractions: Apply and extend previous understandings of multiplication and division',
            'Measurement & Data: Convert like measurement units within a given measurement system',
            'Measurement & Data: Represent and interpret data',
            'Measurement & Data: Geometric measurement: understand concepts of volume',
            'Geometry: Graph points on the coordinate plane to solve real-world problems',
            'Geometry: Classify two-dimensional figures into categories based on their properties'
          ],
          summary: 'These standards define what students should understand and be able to do in mathematics for Grade 5.',
          keyCompetencies: [
            'Problem Solving',
            'Reasoning and Proof',
            'Communication',
            'Connections',
            'Representation'
          ],
          crossCuttingConcepts: [
            'Patterns and Structure',
            'Properties of Operations',
            'Algorithmic Thinking',
            'Mathematical Modeling',
            'Precision'
          ]
        },
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    
    console.log('Test knowledge base created successfully:', knowledgeBase.id);
    
    // Generate an enhanced prompt
    const basePrompt = 'Create a curriculum for teaching fractions to Grade 5 students';
    const enhancedPrompt = await generateEnhancedPrompt(
      basePrompt,
      'Mathematics',
      'Grade 5',
      1, // Admin user ID
      'curriculum'
    );
    
    console.log('\nEnhanced Prompt:');
    console.log(enhancedPrompt);
    
    // Test AI generation with enhanced prompt
    console.log('\nGenerating curriculum with AI...');
    const aiResult = await generateCurriculumWithAI(enhancedPrompt);
    
    console.log('\nAI Result:');
    console.log(aiResult.substring(0, 500) + '...');
    
  } catch (error) {
    console.error('Error running knowledge base test:', error);
  } finally {
    // Close the database connection
    await db.end();
  }
}

// Run the test
createTestKnowledgeBase();