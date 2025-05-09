/**
 * Test Knowledge Base Integration with AI Module
 * This script tests the integration between the new AI semantic understanding 
 * and the actual knowledge base files in the system.
 */

import { extractKnowledgeBaseContext, enhanceCurriculumGeneration } from './src';
import type { KnowledgeBase } from '../shared/schema';

// Mock Knowledge Base for testing
const mockKnowledgeBase: KnowledgeBase = {
  id: 999,
  title: "American Founding Test Knowledge Base",
  description: `The American founding refers to the period when the United States was established as a nation, 
  encompassing events like the American Revolution (1775-1783) and the creation of foundational documents like 
  the Declaration of Independence (1776) and the Constitution (1787). 
  
  Key figures included George Washington, Thomas Jefferson, Benjamin Franklin, John Adams, James Madison, and 
  Alexander Hamilton. The founding established principles of liberty, self-governance, and checks and balances.`,
  subject: "History",
  difficulty: "Intermediate",
  authorId: 1,
  price: 0,
  isPublic: true, 
  downloadCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  files: null,
  metadata: JSON.stringify({
    objectives: [
      "Understand the key events of the American Revolution",
      "Learn about the founding fathers and their contributions",
      "Analyze the principles in the Declaration of Independence",
      "Explore the structure of the U.S. Constitution"
    ],
    tags: ["American History", "Revolution", "Founding Fathers", "Constitution"]
  }),
  purchasedBy: []
};

// Test context extraction
async function testContextExtraction() {
  console.log("Testing knowledge base context extraction...");
  
  try {
    const context = await extractKnowledgeBaseContext([mockKnowledgeBase]);
    
    console.log("\nExtracted Context:");
    console.log("Knowledge Base Info:", context.knowledgeBaseInfo.substring(0, 100) + "...");
    console.log("Key Topics:", context.keyTopics);
    console.log("Key Concepts:", context.keyConcepts);
    console.log("Main Ideas:", context.mainIdeas.length);
    console.log("Content Excerpts:", context.contentExcerpts.length);
    
    return context;
  } catch (error) {
    console.error("Error in knowledge base context extraction:", error);
    return null;
  }
}

// Test curriculum enhancement
async function testCurriculumEnhancement() {
  console.log("\nTesting curriculum enhancement with knowledge base...");
  
  const params = {
    subject: "U.S. History",
    gradeLevel: "Middle School (6-8)",
    learningStyles: ["visual", "reading-writing"],
    additionalDetails: "Focus on the principles that inspired the founding fathers"
  };
  
  try {
    const enhancedPrompt = await enhanceCurriculumGeneration(params, [mockKnowledgeBase]);
    
    console.log("\nEnhanced Curriculum Prompt (excerpt):");
    console.log(enhancedPrompt.substring(0, 500) + "...");
    
    return enhancedPrompt;
  } catch (error) {
    console.error("Error in curriculum enhancement:", error);
    return null;
  }
}

// Run all tests
async function runTests() {
  console.log("Starting Knowledge Base Integration Tests...\n");
  
  await testContextExtraction();
  await testCurriculumEnhancement();
  
  console.log("\nTests completed.");
}

// Execute tests
runTests().catch(error => {
  console.error("Error running tests:", error);
});