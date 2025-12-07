// Direct test of Anthropic API integration
const { anthropicService } = require('./server/services/anthropicService');

async function testDirectAnthropic() {
  try {
    console.log('Testing direct Anthropic API call...');
    
    const testContent = `
    American History: The Revolutionary War
    
    The American Revolutionary War (1775-1783) was a pivotal conflict that established the United States as an independent nation. The war began with tensions over taxation without representation in the British Parliament.
    
    Key Events:
    - Boston Tea Party (1773): Colonists protested the Tea Act by dumping tea into Boston Harbor
    - Lexington and Concord (1775): The first battles of the Revolutionary War
    - Declaration of Independence (1776): Formal statement of independence from British rule
    - Valley Forge (1777-1778): Washington's army endured harsh winter conditions
    - Yorktown (1781): Final major battle leading to British surrender
    `;
    
    const prompt = `Analyze this educational content and provide structured insights:

Content: "${testContent}"

Please provide a JSON response with the following structure:
{
  "summary": "Brief 2-3 sentence summary of the content",
  "keyTopics": ["array", "of", "main", "topics"],
  "concepts": ["key", "educational", "concepts"],
  "gradeLevel": "K-2, 3-5, 6-8, 9-12, or College",
  "subjectAreas": ["subject", "areas", "covered"],
  "learningObjectives": ["what", "students", "will", "learn"],
  "difficulty": "Beginner, Intermediate, or Advanced",
  "readabilityScore": 70
}

Focus on educational value and learning outcomes.`;

    const result = await anthropicService.generateContent(prompt, true, 1000);
    
    console.log('✅ Anthropic API response received:');
    console.log(result);
    
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(result);
      console.log('✅ Successfully parsed as JSON:', parsed);
    } catch (parseError) {
      console.log('⚠️ Response is not valid JSON, but API call succeeded');
    }
    
  } catch (error) {
    console.error('❌ Error testing Anthropic API:', error);
  }
}

testDirectAnthropic();