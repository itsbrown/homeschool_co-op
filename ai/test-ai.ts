/**
 * AI Module Testing Script
 * Tests the AI module functionality for scanning and analyzing knowledge base content
 */

import { 
  extractContentFromFiles, 
  extractKeywords, 
  buildSemanticMap,
  generateMockEmbeddings,
  type FileContent
} from './src';

// Sample files mimicking knowledge base content
const sampleFiles = [
  {
    name: 'american_founding.txt',
    type: 'text/plain',
    content: `The American founding is a pivotal moment in history that established a new form of government 
    based on enlightenment principles. Key figures included George Washington, Thomas Jefferson, 
    John Adams, and Benjamin Franklin. The Declaration of Independence (1776) and the Constitution (1787) 
    are central documents that outline the fundamental rights and governance structure.
    
    The American Revolution began with growing tensions between colonists and the British government
    over issues like taxation without representation, restrictions on western expansion, and limitations
    on self-governance. Events like the Boston Tea Party and the battles of Lexington and Concord
    marked the escalation from political dispute to armed conflict.`
  },
  {
    name: 'constitutional_principles.txt',
    type: 'text/plain',
    content: `The Constitution established three branches of government: legislative, executive, and judicial.
    This separation of powers creates a system of checks and balances to prevent any branch from becoming
    too powerful. The Bill of Rights, comprising the first ten amendments, guarantees fundamental civil
    liberties such as freedom of speech, religion, and the right to due process.
    
    Key principles include federalism (dividing power between national and state governments),
    popular sovereignty (government derives power from the people), and individual rights.
    The founding fathers were influenced by Enlightenment thinkers like John Locke and Montesquieu.`
  },
  {
    name: 'founding_fathers.txt',
    type: 'text/plain',
    content: `The Founding Fathers were a group of leaders who united the Thirteen Colonies, led the war for
    independence from Great Britain, and built a new nation.
    
    George Washington (1732-1799): Commander of the Continental Army and first President.
    Thomas Jefferson (1743-1826): Principal author of the Declaration of Independence and third President.
    John Adams (1735-1826): Diplomat, first Vice President, and second President.
    Benjamin Franklin (1706-1790): Scientist, inventor, statesman, and diplomat.
    James Madison (1751-1836): "Father of the Constitution" and fourth President.
    Alexander Hamilton (1755-1804): First Secretary of the Treasury and economic theorist.`
  }
];

// Function to test content extraction
async function testContentExtraction() {
  console.log('Testing content extraction from files...');
  
  try {
    const extractedContent = await extractContentFromFiles(sampleFiles);
    
    console.log(`Successfully extracted content from ${extractedContent.length} files`);
    extractedContent.forEach((content, idx) => {
      console.log(`\nFile ${idx + 1}: ${content.fileName}`);
      console.log(`Content preview: ${content.content.substring(0, 100)}...`);
    });
    
    return extractedContent;
  } catch (error) {
    console.error('Error in content extraction:', error);
    return [];
  }
}

// Function to test keyword extraction
function testKeywordExtraction(extractedContent: FileContent[]) {
  console.log('\n\nTesting keyword extraction...');
  
  try {
    extractedContent.forEach((content) => {
      const keywords = extractKeywords(content.content, 5);
      console.log(`\nKeywords for ${content.fileName}:`);
      console.log(keywords.join(', '));
    });
  } catch (error) {
    console.error('Error in keyword extraction:', error);
  }
}

// Function to test semantic map building
function testSemanticMapBuilding(extractedContent: FileContent[]) {
  console.log('\n\nTesting semantic map building...');
  
  try {
    // Generate mock embeddings for each content item
    const embeddings = extractedContent.map(content => ({
      fileName: content.fileName,
      embedding: generateMockEmbeddings(content.content),
      keywords: extractKeywords(content.content, 10)
    }));
    
    // Build semantic map
    const semanticMap = buildSemanticMap(extractedContent, embeddings);
    
    console.log('\nGenerated Semantic Map:');
    console.log('Topics:', semanticMap.topics.map(topic => topic.keywords));
    console.log('Key Concepts:', semanticMap.concepts);
    console.log('Concept Relations:', semanticMap.relations.length);
    console.log('Main Ideas:', semanticMap.mainIdeas.map(idea => idea.substring(0, 50) + '...'));
    
    return semanticMap;
  } catch (error) {
    console.error('Error in semantic map building:', error);
    return null;
  }
}

// Main test function
async function runTests() {
  console.log('Starting AI module tests...\n');
  
  // Test content extraction
  const extractedContent = await testContentExtraction();
  
  if (extractedContent.length > 0) {
    // Test keyword extraction
    testKeywordExtraction(extractedContent);
    
    // Test semantic map building
    testSemanticMapBuilding(extractedContent);
  }
  
  console.log('\nTests completed.');
}

// Run the tests
runTests().catch(error => {
  console.error('Error running tests:', error);
});