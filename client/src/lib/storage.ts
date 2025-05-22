/**
 * Local storage helper functions
 */

export interface KnowledgeBase {
  id: number;
  title: string;
  description: string;
  subjectArea: string;
  gradeLevel: string[];
  status: string;
  visibility: string;
  fileCount: number;
  size: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  creator: string;
  rating: number;
  usageCount: number;
}

// Knowledge Base storage
export const saveKnowledgeBase = (knowledgeBase: KnowledgeBase): void => {
  const existingData = localStorage.getItem('knowledgeBases');
  let knowledgeBases: KnowledgeBase[] = [];
  
  if (existingData) {
    try {
      knowledgeBases = JSON.parse(existingData);
    } catch (e) {
      console.error('Error parsing knowledge bases from localStorage:', e);
      knowledgeBases = [];
    }
  }
  
  knowledgeBases.push(knowledgeBase);
  localStorage.setItem('knowledgeBases', JSON.stringify(knowledgeBases));
  
  // Log success
  console.log('Knowledge base saved successfully:', knowledgeBase.title);
  console.log('Total knowledge bases in storage:', knowledgeBases.length);
};

export const getKnowledgeBases = (): KnowledgeBase[] => {
  const existingData = localStorage.getItem('knowledgeBases');
  
  if (!existingData) {
    return [];
  }
  
  try {
    return JSON.parse(existingData);
  } catch (e) {
    console.error('Error parsing knowledge bases from localStorage:', e);
    return [];
  }
};

export const clearKnowledgeBases = (): void => {
  localStorage.removeItem('knowledgeBases');
};