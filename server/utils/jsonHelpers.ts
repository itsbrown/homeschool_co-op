/**
 * JSON Utility Functions
 * Contains helper functions for working with JSON data and AI-generated JSON responses
 */

/**
 * Cleans and extracts valid JSON from AI responses that might include markdown formatting
 * @param response Raw text response possibly containing JSON
 * @returns Cleaned JSON string ready for parsing
 */
export function cleanJsonResponse(response: string): string {
  if (!response) return '';
  
  // First, check if the response is wrapped in markdown code blocks (```json ... ```)
  const jsonBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    return jsonBlockMatch[1].trim();
  }
  
  // If not in code blocks, look for a JSON object or array
  const jsonMatch = response.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim();
  }
  
  // If no JSON patterns found, return the original response trimmed
  return response.trim();
}

/**
 * Repairs common JSON formatting issues in AI-generated content
 * @param jsonString Potentially malformed JSON string
 * @returns Cleaned JSON string with common formatting issues fixed
 */
export function repairJsonString(jsonString: string): string {
  return jsonString
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
    .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
    .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
    .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Ensure property names are double-quoted
    .replace(/:\s*'/g, ': "') // Replace single quotes with double quotes for values
    .replace(/'\s*,/g, '",')  // Replace single quotes with double quotes for values
    .replace(/'\s*}/g, '"}')  // Replace single quotes with double quotes for values
    .replace(/'\s*]/g, '"]'); // Replace single quotes with double quotes for values
}

/**
 * Safely parses AI-generated JSON by cleaning and repairing it first
 * @param text Raw text potentially containing JSON
 * @returns Parsed JavaScript object or null if parsing fails
 */
export function safeJsonParse(text: string): any {
  try {
    // First try to clean any markdown or extra text
    const cleanedText = cleanJsonResponse(text);
    
    // Try parsing directly
    try {
      return JSON.parse(cleanedText);
    } catch (initialError) {
      // If direct parsing fails, try repairing common formatting issues
      const repairedText = repairJsonString(cleanedText);
      return JSON.parse(repairedText);
    }
  } catch (error) {
    console.error('JSON parsing failed even after cleaning and repair:', error);
    console.error('Original text sample:', text.substring(0, 200) + '...');
    return null;
  }
}