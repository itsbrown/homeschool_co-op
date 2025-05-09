import { AIGenerationFormData } from "@/lib/types";
import { Curriculum, Lesson } from "@shared/schema";
import { generateAICurriculum, isAnthropicAvailable } from "./anthropicService";
import { generateEnhancedCurriculum, isEnhancedGenerationAvailable } from "./aiEnhancedGeneration";

// Template for curriculum structure
export interface CurriculumTemplate {
  title: string;
  description: string;
  objectives: string[];
  units: {
    title: string;
    description: string;
    lessons: {
      title: string;
      description: string;
      duration: number;
      // Legacy fields
      activities?: string[];
      // New structured format fields
      learningObjectives?: string[];
      introduction?: string;
      mainActivities?: {
        type: string;
        name: string;
        description: string;
        duration: number;
      }[];
      resources?: any[]; // Using any to handle both string[] and object[] formats
      assessments?: any[]; // Using any to handle both string[] and object[] formats
      reflection?: string[];
    }[];
  }[];
}

// Common learning objectives based on subject
const subjectObjectives: Record<string, string[]> = {
  "Mathematics": [
    "Develop problem-solving skills and logical reasoning",
    "Master fundamental mathematical concepts",
    "Apply mathematical thinking to real-world scenarios",
    "Build confidence in mathematical abilities"
  ],
  "Science": [
    "Understand scientific principles and natural phenomena",
    "Develop inquiry and investigation skills",
    "Apply the scientific method to solve problems",
    "Connect scientific concepts to everyday experiences"
  ],
  "Language Arts": [
    "Develop strong reading comprehension skills",
    "Build effective written and verbal communication abilities",
    "Analyze and interpret diverse texts",
    "Foster creativity and critical thinking through language"
  ],
  "Social Studies": [
    "Understand historical events and their impact on society",
    "Develop awareness of diverse cultures and perspectives",
    "Analyze social, political, and economic systems",
    "Build civic engagement and global citizenship skills"
  ],
  "Computer Science": [
    "Develop computational thinking and problem-solving skills",
    "Understand fundamental programming concepts",
    "Design and create digital artifacts",
    "Evaluate technology's impact on society"
  ],
  "Art": [
    "Develop creative expression through various mediums",
    "Understand art history and cultural influences",
    "Build technical skills in artistic creation",
    "Develop critical analysis of visual elements"
  ],
  "Music": [
    "Develop musical performance and composition skills",
    "Understand music theory and notation",
    "Appreciate diverse musical traditions",
    "Connect music to historical and cultural contexts"
  ],
  "Physical Education": [
    "Develop physical fitness and motor skills",
    "Learn teamwork and sportsmanship",
    "Understand principles of health and wellness",
    "Build lifelong healthy habits"
  ]
};

// Generate a curriculum template based on form data and selected knowledge bases
export async function generateCurriculumTemplate(formData: AIGenerationFormData): Promise<CurriculumTemplate> {
  try {
    // First check if AI is available at all
    if (isAnthropicAvailable()) {
      try {
        console.log('Using AI curriculum generation with knowledge base integration');
        
        // Always attempt to use enhanced generation if AI is available, regardless of knowledge bases
        if (isEnhancedGenerationAvailable()) {
          return await generateEnhancedCurriculum(formData);
        }
        
        // If enhanced generation is not available, fall back to standard AI
        console.log('Enhanced AI unavailable, using standard AI curriculum generation');
        return await generateAICurriculum(formData);
      } catch (aiError) {
        console.warn('AI curriculum generation failed, falling back to template-based generation:', aiError);
      }
    } else {
      console.log('AI services unavailable, using template-based generation');
    }
    
    // Generate fallback template-based curriculum
    console.log('Using template-based generation');
    return generateTemplateBasedCurriculum(formData);
  } catch (error: any) {
    console.warn('AI curriculum generation failed, falling back to template-based generation:', error);
    return generateTemplateBasedCurriculum(formData);
  }
}

/**
 * Generates a template-based curriculum when AI is unavailable or fails
 */
function generateTemplateBasedCurriculum(formData: AIGenerationFormData): CurriculumTemplate {
  const { subject, gradeLevel, learningStyles, additionalDetails, knowledgeBaseIds } = formData;
  
  // Generate title based on subject and grade level
  const title = `${subject} Curriculum for ${gradeLevel}`;
  
  // Generate description with learning styles and additional details
  const description = `A comprehensive ${subject} curriculum designed for ${gradeLevel} students. This curriculum incorporates ${learningStyles.join(", ")} learning styles${additionalDetails ? ` with focus on ${additionalDetails}` : ''}.`;
  
  // Generate objectives based on subject
  const objectives = subjectObjectives[subject] || [
    "Develop comprehensive understanding of the subject matter",
    "Build critical thinking and problem-solving skills",
    "Apply concepts to real-world situations",
    "Foster a love of learning and subject mastery"
  ];
  
  // Generate units based on subject and grade level
  const units = generateUnits(subject, gradeLevel, learningStyles);
  
  return {
    title,
    description,
    objectives,
    units
  };
}

// Generate units based on subject
function generateUnits(subject: string, gradeLevel: string, learningStyles: string[]): CurriculumTemplate["units"] {
  console.log(`Generating template-based units for ${subject} at ${gradeLevel} level with ${learningStyles.join(', ')} learning styles`);
  
  const units: CurriculumTemplate["units"] = [];
  
  if (subject === "Mathematics") {
    units.push(
      {
        title: "Numbers and Operations",
        description: "Fundamental concepts of numbers, operations, and their applications",
        lessons: generateLessons(3, learningStyles, 30, 45)
      },
      {
        title: "Algebra and Functions",
        description: "Introduction to algebraic thinking and functional relationships",
        lessons: generateLessons(3, learningStyles, 30, 45)
      },
      {
        title: "Geometry and Measurement",
        description: "Exploring shapes, spatial relationships, and measurement concepts",
        lessons: generateLessons(3, learningStyles, 30, 45)
      },
      {
        title: "Data Analysis and Probability",
        description: "Collecting, organizing, and interpreting data; understanding chance",
        lessons: generateLessons(3, learningStyles, 30, 45)
      }
    );
  } else if (subject === "Science") {
    units.push(
      {
        title: "Life Science",
        description: "Study of living organisms, their structures, functions, and ecosystems",
        lessons: generateLessons(3, learningStyles, 40, 60)
      },
      {
        title: "Physical Science",
        description: "Exploration of matter, energy, forces, and motion",
        lessons: generateLessons(3, learningStyles, 40, 60)
      },
      {
        title: "Earth and Space Science",
        description: "Understanding Earth's systems, weather, climate, and astronomy",
        lessons: generateLessons(3, learningStyles, 40, 60)
      },
      {
        title: "Engineering and Technology",
        description: "Applying scientific principles to design solutions to problems",
        lessons: generateLessons(3, learningStyles, 40, 60)
      }
    );
  } else if (subject === "Computer Science") {
    units.push(
      {
        title: "Computational Thinking",
        description: "Problem-solving approaches and algorithmic thinking",
        lessons: generateLessons(3, learningStyles, 45, 60)
      },
      {
        title: "Programming Fundamentals",
        description: "Basic programming concepts and introductory coding skills",
        lessons: generateLessons(3, learningStyles, 45, 60)
      },
      {
        title: "Digital Citizenship",
        description: "Safe, ethical, and responsible use of technology",
        lessons: generateLessons(3, learningStyles, 45, 60)
      },
      {
        title: "Creative Computing",
        description: "Creating digital artifacts and expressing ideas through technology",
        lessons: generateLessons(3, learningStyles, 45, 60)
      }
    );
  } else {
    // Generic units for other subjects
    units.push(
      {
        title: "Unit 1: Fundamentals",
        description: `Introduction to ${subject} fundamentals`,
        lessons: generateLessons(3, learningStyles, 30, 60)
      },
      {
        title: "Unit 2: Core Concepts",
        description: `Exploring key concepts in ${subject}`,
        lessons: generateLessons(3, learningStyles, 30, 60)
      },
      {
        title: "Unit 3: Advanced Topics",
        description: `Deeper exploration of ${subject} concepts`,
        lessons: generateLessons(3, learningStyles, 30, 60)
      },
      {
        title: "Unit 4: Application and Synthesis",
        description: `Applying ${subject} knowledge in real-world contexts`,
        lessons: generateLessons(3, learningStyles, 30, 60)
      }
    );
  }
  
  return units;
}

// Helper function to generate structured lesson templates
function generateLessons(count: number, learningStyles: string[], minDuration: number, maxDuration: number) {
  const lessons = [];
  
  // List of more specific lesson titles by common subject areas
  const lessonTitlesBySubject: Record<string, string[]> = {
    "Mathematics": [
      "Number Systems & Operations", 
      "Algebraic Thinking", 
      "Geometry Concepts", 
      "Data Analysis", 
      "Measurement Principles"
    ],
    "Science": [
      "Scientific Method & Inquiry", 
      "Energy & Matter", 
      "Living Systems", 
      "Earth Systems", 
      "Forces & Motion"
    ],
    "Language Arts": [
      "Reading Comprehension", 
      "Writing Process", 
      "Speaking & Listening", 
      "Language Conventions", 
      "Research Skills"
    ],
    "Social Studies": [
      "Historical Analysis", 
      "Geographic Concepts", 
      "Civic Engagement", 
      "Cultural Studies", 
      "Economic Principles"
    ],
    "Computer Science": [
      "Computational Thinking", 
      "Programming Fundamentals", 
      "Data Structures", 
      "Algorithms", 
      "Digital Ethics"
    ]
  };
  
  // Generic lesson titles for any subject
  const genericLessonTitles = [
    "Key Principles", 
    "Fundamental Concepts", 
    "Essential Frameworks", 
    "Core Methodologies", 
    "Critical Applications"
  ];
  
  // Teaching strategies by learning style
  const teachingStrategies: Record<string, string[]> = {
    'visual': [
      'Direct instruction with visual aids',
      'Visual concept mapping',
      'Diagram and chart analysis',
      'Video demonstrations'
    ],
    'auditory': [
      'Lecture and discussion',
      'Peer teaching',
      'Audio recordings',
      'Group discussions'
    ],
    'reading-writing': [
      'Independent research',
      'Note-taking strategies',
      'Written analysis',
      'Journaling and reflection'
    ],
    'kinesthetic': [
      'Hands-on experimentation',
      'Project-based learning',
      'Role-playing and simulations',
      'Physical models and manipulatives'
    ]
  };
  
  for (let i = 1; i <= count; i++) {
    const duration = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
    
    // Choose a more meaningful lesson title
    let lessonTitle: string;
    if (i <= genericLessonTitles.length) {
      lessonTitle = genericLessonTitles[i-1];
    } else {
      lessonTitle = `Topic ${i}`;
    }
    
    // Generate 2-3 learning objectives
    const learningObjectives = [
      `Understand key concepts related to ${lessonTitle.toLowerCase()}`,
      `Apply ${lessonTitle.toLowerCase()} to solve real-world problems`,
      `Analyze the significance of ${lessonTitle.toLowerCase()} in broader contexts`
    ];
    
    // Generate introduction that aligns with objectives
    const introduction = `This lesson introduces students to important ${lessonTitle.toLowerCase()} that form the foundation of this subject area. Students will explore key ideas, apply concepts to practical situations, and evaluate their understanding through targeted activities and assessments.`;
    
    // Generate activities based on learning styles
    const mainActivities = [];
    const preferredLearningStyles = [...learningStyles]; // Copy the array to avoid modifying the original
    
    // Ensure we include at least one activity for each selected learning style
    for (const style of preferredLearningStyles) {
      if (teachingStrategies[style] && teachingStrategies[style].length > 0) {
        // Select a random strategy for this learning style
        const strategyIndex = Math.floor(Math.random() * teachingStrategies[style].length);
        const strategy = teachingStrategies[style][strategyIndex];
        
        mainActivities.push({
          type: style,
          name: strategy,
          description: `Students will engage with ${lessonTitle.toLowerCase()} through ${strategy.toLowerCase()}, allowing them to develop a deeper understanding of key concepts.`,
          duration: Math.floor(duration / 3) // Allocate approximately 1/3 of the lesson time
        });
      }
    }
    
    // Generate assessment strategies
    const assessmentTypes = ['formative', 'summative', 'diagnostic', 'performance'];
    const assessmentTools = ['quiz', 'discussion', 'project', 'presentation', 'written reflection'];
    
    const assessments = [
      {
        type: assessmentTypes[Math.floor(Math.random() * assessmentTypes.length)],
        tool: assessmentTools[Math.floor(Math.random() * assessmentTools.length)],
        description: `Students will demonstrate their understanding of ${lessonTitle.toLowerCase()} through this assessment.`,
        alignment: `This assessment aligns with learning objective ${Math.floor(Math.random() * 3) + 1}.`
      }
    ];
    
    // Generate resources
    const resources = [
      {
        type: 'reading',
        name: `Core concepts in ${lessonTitle}`,
        url: '#',
        description: 'Primary reference material for this lesson'
      },
      {
        type: 'media',
        name: 'Supplementary visual aids',
        url: '#',
        description: 'Visual resources to support learning'
      },
      {
        type: 'worksheet',
        name: 'Practice activities',
        url: '#',
        description: 'Exercises to reinforce learning'
      }
    ];
    
    // Generate reflection prompts
    const reflectionPrompts = [
      `How does your understanding of ${lessonTitle.toLowerCase()} connect to previous knowledge?`,
      `What aspects of ${lessonTitle.toLowerCase()} did you find most challenging?`,
      `How might you apply these concepts in real-world contexts?`
    ];
    
    // Extract simple string activities from mainActivities for backward compatibility
    const simpleActivities = mainActivities.map(activity => 
      `${activity.name}: ${activity.description.substring(0, 50)}...`
    );
    
    lessons.push({
      title: lessonTitle,
      description: `Students will explore core concepts and develop essential skills related to ${lessonTitle.toLowerCase()}`,
      duration: duration,
      // Include activities for backward compatibility
      activities: simpleActivities,
      // Include new structured format fields
      learningObjectives: learningObjectives,
      introduction: introduction,
      mainActivities: mainActivities,
      assessments: assessments,
      resources: resources,
      reflection: reflectionPrompts
    });
  }
  return lessons;
}

// Convert curriculum template to database format
export function curriculumTemplateToDbFormat(template: CurriculumTemplate, authorId: number): Omit<Curriculum, "id" | "createdAt" | "updatedAt"> {
  // Extract subject and grade level from the template title
  // Example format: "Mathematics Curriculum for High School"
  let subject = '';
  let gradeLevel = '';
  
  if (template.title.includes("for")) {
    subject = template.title.split(" ")[0];
    gradeLevel = template.title.split("for ")[1];
  } else if (template.title.includes("Curriculum")) {
    subject = template.title.split("Curriculum")[0].trim();
    gradeLevel = template.title.split("Curriculum")[1].trim();
  } else {
    // Fallback values if title format is unexpected
    subject = template.title.split(" ")[0];
    gradeLevel = "General";
  }
  
  // Extract learning styles from description or set default
  let learningStyles: string[] = [];
  const learningStylesText = template.description.toLowerCase();
  
  if (learningStylesText.includes("visual")) learningStyles.push("visual");
  if (learningStylesText.includes("auditory")) learningStyles.push("auditory");
  if (learningStylesText.includes("kinesthetic")) learningStyles.push("kinesthetic");
  if (learningStylesText.includes("reading")) learningStyles.push("reading-writing");
  
  // Default to visual if none found
  if (learningStyles.length === 0) {
    learningStyles = ["visual"];
  }
  
  console.log(`Extracted metadata - Subject: ${subject}, Grade Level: ${gradeLevel}, Learning Styles: ${learningStyles.join(', ')}`);
  
  return {
    title: template.title,
    description: template.description,
    subject,
    gradeLevel,
    authorId,
    isPublished: false,
    isPublic: false,
    price: 0,
    learningStyles,
    content: template
  };
}

// Convert lesson template to database format
export function lessonTemplateToDbFormat(
  lessonTemplate: CurriculumTemplate["units"][0]["lessons"][0],
  unitTitle: string,
  curriculumId: number,
  authorId: number,
  subject: string,
  gradeLevel: string
): Omit<Lesson, "id" | "createdAt" | "updatedAt"> {
  // Extract unit number if present (e.g., "Unit 1: Fundamentals" -> "Unit 1")
  const unitPrefix = unitTitle.match(/^Unit \d+/)?.[0] || "";
  
  // Create a clean title without duplication
  let cleanTitle = lessonTemplate.title;
  
  // If the lesson title starts with "Lesson X", remove it to avoid duplication
  if (/^Lesson \d+/i.test(cleanTitle)) {
    cleanTitle = cleanTitle.replace(/^Lesson \d+:\s*/i, '').trim();
  }
  
  // Handle both legacy and new structured lesson formats
  let contentObject: any = {};
  
  // Check if this is the new structured format with learningObjectives
  if ('learningObjectives' in lessonTemplate) {
    contentObject = {
      learningObjectives: lessonTemplate.learningObjectives || [],
      introduction: lessonTemplate.introduction || '',
      mainActivities: lessonTemplate.mainActivities || [],
      resources: lessonTemplate.resources || [],
      assessments: lessonTemplate.assessments || [],
      reflection: lessonTemplate.reflection || []
    };
  } else {
    // Legacy format
    contentObject = {
      activities: lessonTemplate.activities || [],
      resources: lessonTemplate.resources || [],
      assessments: lessonTemplate.assessments || [],
      // Add empty placeholders for the new fields to maintain compatibility
      learningObjectives: [],
      introduction: '',
      mainActivities: [],
      reflection: []
    };
  }
  
  return {
    title: `${unitPrefix}: ${cleanTitle}`,
    description: lessonTemplate.description,
    subject: subject,
    gradeLevel: gradeLevel,
    authorId: authorId,
    curriculumId: curriculumId,
    isPublished: false,
    duration: lessonTemplate.duration,
    content: contentObject,
    status: "draft"
  };
}
