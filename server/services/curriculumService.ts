import { AIGenerationFormData } from "@/lib/types";
import { Curriculum, Lesson } from "@shared/schema";
import { generateAICurriculum } from "./anthropicService";
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
      activities: string[];
      resources: string[];
      assessments: string[];
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
    // Check if knowledge bases are provided and if enhanced generation is available
    if (formData.knowledgeBaseIds && formData.knowledgeBaseIds.length > 0 && isEnhancedGenerationAvailable()) {
      try {
        console.log('Attempting to use enhanced AI curriculum generation with knowledge base integration');
        
        // Fetch knowledge bases
        const { storage } = await import('../storage');
        const knowledgeBases = await Promise.all(
          formData.knowledgeBaseIds.map(id => storage.getKnowledgeBase(id))
        );
        
        // Filter out undefined knowledge bases
        const validKnowledgeBases = knowledgeBases.filter(kb => kb !== undefined);
        
        if (validKnowledgeBases.length > 0) {
          console.log(`Using enhanced generation with ${validKnowledgeBases.length} knowledge bases`);
          // Use our enhanced curriculum generation that better integrates knowledge base content
          const enhancedCurriculum = await generateEnhancedCurriculum(formData, validKnowledgeBases);
          return enhancedCurriculum;
        }
      } catch (enhancedError) {
        console.warn('Enhanced curriculum generation failed, falling back to standard AI generation:', enhancedError);
      }
    }
    
    // Fall back to standard AI generation if enhanced generation fails or isn't applicable
    console.log('Using standard AI curriculum generation');
    const aiCurriculum = await generateAICurriculum(formData);
    return aiCurriculum;
  } catch (error: any) {
    console.warn('AI curriculum generation failed, falling back to template-based generation:', error);
    
    // Fallback to template-based generation if AI fails
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

// Helper function to generate lesson templates
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
  
  for (let i = 1; i <= count; i++) {
    const duration = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
    
    // Choose a more meaningful lesson title
    let lessonTitle: string;
    if (i <= genericLessonTitles.length) {
      lessonTitle = genericLessonTitles[i-1];
    } else {
      lessonTitle = `Topic ${i}`;
    }
    
    const activities = [];
    if (learningStyles.includes('visual')) {
      activities.push("Create visual concept maps", "Analyze diagrams and charts");
    }
    if (learningStyles.includes('auditory')) {
      activities.push("Group discussions on key concepts", "Verbal explanations of processes");
    }
    if (learningStyles.includes('reading-writing')) {
      activities.push("Reading and summarizing texts", "Research and write about concepts");
    }
    if (learningStyles.includes('kinesthetic')) {
      activities.push("Hands-on experiments", "Interactive demonstrations");
    }
    
    lessons.push({
      title: lessonTitle,
      description: `Students will explore core concepts and develop essential skills related to ${lessonTitle.toLowerCase()}`,
      duration: duration,
      activities: activities.slice(0, 3),
      resources: ["Digital presentations", "Interactive worksheets", "Reference materials"],
      assessments: ["Formative assessment", "Skills check", "Reflection questions"]
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
  
  return {
    title: `${unitPrefix}: ${cleanTitle}`,
    description: lessonTemplate.description,
    subject: subject,
    gradeLevel: gradeLevel,
    authorId: authorId,
    curriculumId: curriculumId,
    isPublished: false,
    duration: lessonTemplate.duration,
    content: {
      activities: lessonTemplate.activities,
      resources: lessonTemplate.resources,
      assessments: lessonTemplate.assessments
    },
    status: "draft"
  };
}
