import { Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { formatZodError } from "../utils";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// Initialize AI service clients
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Input validation schema
const messageSchema = z.object({
  message: z.string().min(1, "Message is required"),
  childrenIds: z.array(z.number()).optional(),
  history: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string()
  })).optional()
});

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are the official AI enrollment assistant for American Seekers Academy, a comprehensive educational institution dedicated to providing quality education and fostering academic excellence.

ABOUT AMERICAN SEEKERS ACADEMY:
American Seekers Academy is an innovative educational institution offering diverse programs, courses, and learning opportunities for students of all ages. We pride ourselves on personalized education, experienced instructors, and comprehensive learning resources.

YOUR ROLE & CAPABILITIES:
As the official AI enrollment assistant, you have access to complete, real-time information about:

SCHOOL OPERATIONS:
- All available programs, classes, and courses with detailed information
- Instructor profiles, specializations, and qualifications  
- Educational resources, knowledge bases, and learning materials
- Curriculum offerings across all subjects and grade levels
- Individual lessons and educational activities
- School policies, procedures, and enrollment requirements
- Pricing, payment options, and financial assistance information
- Scheduling, locations, and facility information

STUDENT SERVICES:
1. Child Registration & Enrollment Management
2. Program Recommendations based on student profiles
3. Academic Planning & Course Selection
4. Instructor Matching & Assignment
5. Resource & Material Recommendations
6. Scheduling Coordination & Conflict Resolution
7. Payment Processing & Financial Planning
8. Academic Progress Tracking & Support

CONVERSATION APPROACH:
- Act as a knowledgeable school representative with access to all current information
- Provide specific, accurate details about programs, instructors, and resources
- Make personalized recommendations based on student needs and interests
- Explain costs, schedules, and requirements clearly
- Guide families through enrollment processes step-by-step
- Connect families with appropriate instructors and programs
- Answer questions about school policies and procedures confidently
- Suggest educational materials and activities that align with student goals

PROFESSIONAL STANDARDS:
- Always use authentic, current data from the school's systems
- Provide accurate pricing, availability, and scheduling information
- Ensure recommendations match student age, grade level, and learning preferences
- Respect family privacy and maintain confidentiality
- Direct complex issues to appropriate school staff when necessary
- Follow all school enrollment policies and procedures

RESPONSE FORMAT:
Your responses should be professional, informative, and focused on helping families succeed.
If you need to perform specific actions, include structured details.

ACTIONS:
- To register a new child: [REGISTER_CHILD: firstName: John, lastName: Doe, birthdate: 2015-05-15, gradeLevel: 4, interests: science,math, learningStyle: visual]
- To enroll a child in a program: [ENROLL: Child ID: 123, Program ID: 456]
- To recommend programs: [RECOMMEND: science, art]
- To view children: [VIEW_CHILDREN]
- To view programs (optionally filtered): [VIEW_PROGRAMS] or [VIEW_PROGRAMS: science]`;

/**
 * Calculate age from birthdate string
 */
function calculateAge(birthdate: string): number {
  const today = new Date();
  const birthDate = new Date(birthdate);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();
  
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Process a request from the enrollment assistant
 */
export const processEnrollmentMessage = async (req: Request, res: Response) => {
  try {
    // Validate input
    const parseResult = messageSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        message: "Invalid request body",
        errors: formatZodError(parseResult.error)
      });
    }
    
    const { message, childrenIds = [], history = [] } = parseResult.data;
    
    // Check authentication
    if (!req.auth?.userId) {
      return res.status(401).json({ message: "You need to be logged in to use the enrollment assistant" });
    }
    
    // Get comprehensive school data for context
    const children = [];
    for (const childId of childrenIds) {
      const child = await storage.getChildById(childId);
      if (child) {
        children.push(child);
      }
    }
    
    // Get user context to determine school affiliation
    const currentUser = await storage.getUserByEmail(req.auth.email);
    const userSchoolId = currentUser?.schoolId || 1; // Default to first school if not specified
    
    // Get available data based on what storage methods exist
    let programs = [];
    let instructors = [];
    let knowledgeBases = [];
    let activities = [];
    let curricula = [];
    let lessons = [];
    let schools = [];
    let classes = [];

    try {
      // Get programs/classes (using available methods)
      if (typeof storage.getPublishedPrograms === 'function') {
        programs = await storage.getPublishedPrograms();
      } else if (typeof storage.getPrograms === 'function') {
        programs = await storage.getPrograms();
      } else if (typeof storage.getClasses === 'function') {
        classes = await storage.getClasses();
      }

      // Get instructors
      if (typeof storage.getAllUsers === 'function') {
        const users = await storage.getAllUsers();
        instructors = users.filter(user => user.role === 'instructor');
      }

      // Get schools
      if (typeof storage.getSchools === 'function') {
        schools = await storage.getSchools();
      }

      // Try to get additional educational resources if methods exist
      if (typeof storage.getPublicKnowledgeBases === 'function') {
        knowledgeBases = await storage.getPublicKnowledgeBases(50);
      } else if (typeof storage.getKnowledgeBases === 'function') {
        knowledgeBases = await storage.getKnowledgeBases();
      }

      if (typeof storage.getPublicActivities === 'function') {
        activities = await storage.getPublicActivities(50);
      } else if (typeof storage.getActivities === 'function') {
        activities = await storage.getActivities();
      }

      if (typeof storage.getPublicCurricula === 'function') {
        curricula = await storage.getPublicCurricula(50);
      } else if (typeof storage.getCurricula === 'function') {
        curricula = await storage.getCurricula();
      }

      if (typeof storage.getPublicLessons === 'function') {
        lessons = await storage.getPublicLessons(50);
      } else if (typeof storage.getLessons === 'function') {
        lessons = await storage.getLessons();
      }

    } catch (error) {
      console.error('Error fetching school data for AI assistant:', error);
      // Continue with empty arrays if data fetching fails
    }
    
    // Format comprehensive context
    const childrenContext = children.length > 0
      ? `CHILDREN INFORMATION:\n${children.map(child => 
          `Child ID: ${child.id}
           Name: ${child.firstName} ${child.lastName}
           Age: ${calculateAge(child.birthdate)}
           Grade: ${child.gradeLevel}
           Learning Style: ${child.learningStyle || 'Not specified'}
           Interests: ${child.interests?.join(', ') || 'Not specified'}
           Special Needs: ${child.specialNeeds || 'None'}`
        ).join('\n\n')}`
      : 'No children are registered for this parent.';
      
    const programsContext = programs.length > 0
      ? `AVAILABLE PROGRAMS:\n${programs.map(program => 
          `Program ID: ${program.id}
           Title: ${program.title}
           Description: ${program.description || 'No description provided'}
           Age Range: ${program.ageRange || 'All ages'}
           Grade Levels: ${program.gradeLevels?.join(', ') || 'All grades'}
           Category: ${program.category || 'General'}
           Start Date: ${program.startDate ? new Date(program.startDate).toLocaleDateString() : 'Not specified'}
           End Date: ${program.endDate ? new Date(program.endDate).toLocaleDateString() : 'Not specified'}
           Schedule: ${program.schedule || 'Flexible scheduling'}
           Price: $${program.price || 0}
           Location: ${program.locationName || program.location || 'Online/TBD'}
           Max Capacity: ${program.maxCapacity || 'Unlimited'} students
           Current Enrollment: ${program.enrollmentCount || 0} students
           Instructor: ${program.instructorName || 'TBD'}
           Materials Included: ${program.materialsIncluded ? 'Yes' : 'No'}
           Prerequisites: ${program.prerequisites || 'None'}
           Enrollment Status: ${program.isPublished ? 'Open' : 'Closed'}`
        ).join('\n\n')}`
      : 'No programs are currently available.';

    const classesContext = classes.length > 0
      ? `AVAILABLE CLASSES:\n${classes.map(cls => 
          `Class ID: ${cls.id}
           Title: ${cls.title}
           Description: ${cls.description || 'No description provided'}
           Category: ${cls.category || 'General'}
           Age Range: ${cls.ageRange || 'All ages'}
           Grade Levels: ${cls.gradeLevels?.join(', ') || 'All grades'}
           Schedule: ${cls.schedule || 'Flexible scheduling'}
           Price: $${cls.price || 0}
           Location: ${cls.location || 'Online/TBD'}
           Max Capacity: ${cls.maxCapacity || 'Unlimited'} students
           Current Enrollment: ${cls.enrollmentCount || 0} students
           Instructor: ${cls.instructorName || cls.instructor || 'TBD'}
           Duration: ${cls.duration || 'Variable'} minutes
           Materials: ${cls.materials || 'Basic supplies'}
           Start Date: ${cls.startDate ? new Date(cls.startDate).toLocaleDateString() : 'Ongoing'}
           End Date: ${cls.endDate ? new Date(cls.endDate).toLocaleDateString() : 'Ongoing'}
           Status: ${cls.isPublished ? 'Open for enrollment' : 'Closed'}`
        ).join('\n\n')}`
      : '';

    const instructorsContext = instructors.length > 0
      ? `SCHOOL INSTRUCTORS:\n${instructors.map(instructor => 
          `Instructor ID: ${instructor.id}
           Name: ${instructor.firstName} ${instructor.lastName}
           Email: ${instructor.email}
           Specializations: ${instructor.specializations?.join(', ') || 'General instruction'}
           Bio: ${instructor.bio || 'No bio available'}
           Years Experience: ${instructor.yearsExperience || 'Not specified'}
           Certifications: ${instructor.certifications?.join(', ') || 'None listed'}`
        ).join('\n\n')}`
      : 'No instructor information available.';

    const knowledgeBasesContext = knowledgeBases.length > 0
      ? `KNOWLEDGE RESOURCES:\n${knowledgeBases.map(kb => 
          `Resource ID: ${kb.id}
           Title: ${kb.title}
           Subject: ${kb.subject}
           Description: ${kb.description || 'No description'}
           Difficulty Level: ${kb.difficulty}
           Price: $${kb.price || 0}
           Downloads: ${kb.downloadCount} times
           Author: ${kb.authorId || 'School Staff'}`
        ).join('\n\n')}`
      : 'No knowledge base resources available.';

    const activitiesContext = activities.length > 0
      ? `EDUCATIONAL ACTIVITIES:\n${activities.map(activity => 
          `Activity ID: ${activity.id}
           Title: ${activity.title}
           Type: ${activity.type}
           Subject: ${activity.subject}
           Age Range: ${activity.ageRange}
           Description: ${activity.description || 'Engaging educational activity'}
           Difficulty: ${activity.difficulty || 'Beginner'}
           Downloads: ${activity.downloadCount || 0} times`
        ).join('\n\n')}`
      : 'No activities available.';

    const curriculaContext = curricula.length > 0
      ? `CURRICULUM OFFERINGS:\n${curricula.map(curriculum => 
          `Curriculum ID: ${curriculum.id}
           Title: ${curriculum.title}
           Subject: ${curriculum.subject}
           Grade Level: ${curriculum.gradeLevel}
           Description: ${curriculum.description || 'Comprehensive curriculum'}
           Learning Styles: ${curriculum.learningStyles?.join(', ') || 'All learning styles'}
           Price: $${curriculum.price || 0}`
        ).join('\n\n')}`
      : 'No curriculum information available.';

    const lessonsContext = lessons.length > 0
      ? `INDIVIDUAL LESSONS:\n${lessons.map(lesson => 
          `Lesson ID: ${lesson.id}
           Title: ${lesson.title}
           Subject: ${lesson.subject}
           Grade Level: ${lesson.gradeLevel}
           Duration: ${lesson.duration} minutes
           Description: ${lesson.description || 'Educational lesson'}
           Status: ${lesson.status || 'Available'}`
        ).join('\n\n')}`
      : 'No individual lessons available.';

    const schoolsContext = schools.length > 0
      ? `SCHOOL INFORMATION:\n${schools.map(school => 
          `School ID: ${school.id}
           Name: ${school.name}
           Address: ${school.address || 'Contact for location'}
           Phone: ${school.phone || 'Contact for phone'}
           Email: ${school.email || 'Contact for email'}
           Website: ${school.website || 'No website listed'}
           Principal: ${school.principalName || 'Contact school'}
           Grades Served: ${school.gradesServed?.join(', ') || 'All grades'}
           Student Capacity: ${school.capacity || 'Contact for capacity'}
           Mission: ${school.mission || 'Providing quality education'}`
        ).join('\n\n')}`
      : 'School information not available.';
    
    // Full context for the AI with comprehensive school data
    const fullContext = `AMERICAN SEEKERS ACADEMY - COMPREHENSIVE SCHOOL INFORMATION

${schoolsContext}

${childrenContext}

${programsContext}

${classesContext}

${instructorsContext}

${knowledgeBasesContext}

${curriculaContext}

${lessonsContext}

${activitiesContext}

SCHOOL-SPECIFIC CONTEXT:
- Current user school ID: ${userSchoolId}
- User email: ${req.auth.email}
- Available data sources: ${[
  programs.length > 0 ? 'Programs' : null,
  classes.length > 0 ? 'Classes' : null,
  instructors.length > 0 ? 'Instructors' : null,
  knowledgeBases.length > 0 ? 'Knowledge Bases' : null,
  activities.length > 0 ? 'Activities' : null,
  curricula.length > 0 ? 'Curricula' : null,
  lessons.length > 0 ? 'Lessons' : null,
  schools.length > 0 ? 'Schools' : null
].filter(Boolean).join(', ')}

ASSISTANT CAPABILITIES:
- Answer questions about programs, classes, instructors, and school policies
- Help with child registration and enrollment processes
- Provide information about educational resources and activities
- Assist with scheduling and program selection
- Explain pricing, payment options, and enrollment requirements
- Connect families with appropriate instructors and programs
- Suggest educational materials and activities based on child's needs and interests
- Access real-time data about class availability, instructor schedules, and enrollment status`;
    
    // Prepare messages for the AI
    const messages = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\nCURRENT DATA:\n${fullContext}` },
      ...history,
      { role: "user", content: message }
    ];
    
    let aiResponse = "";
    
    // Try Anthropic first (Claude), fall back to OpenAI if needed
    try {
      const response = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219", // the newest Anthropic model
        system: messages[0].content,
        messages: messages.slice(1).map(msg => ({
          role: msg.role === "system" ? "user" : msg.role,
          content: msg.content
        })),
        max_tokens: 1000,
      });
      
      aiResponse = response.content[0].text;
    } catch (error) {
      console.error("Error with Anthropic API, falling back to OpenAI:", error);
      
      // Fall back to OpenAI
      const openaiResponse = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: 1000,
      });
      
      aiResponse = openaiResponse.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
    }
    
    // Parse potential actions from the AI response
    const action = parseActionFromResponse(aiResponse);
    
    // Process actions that require database operations
    let processedAction = action;
    
    if (action && action.type === "register_child") {
      try {
        // Get the parent user
        const user = await storage.getUser(req.auth.userId);
        
        if (!user || user.role !== "parent") {
          return res.status(403).json({ 
            message: "Only parents can register children",
            aiResponse
          });
        }
        
        // Format the child data for registration
        const childData = {
          firstName: action.firstName,
          lastName: action.lastName,
          birthdate: action.birthdate,
          gradeLevel: action.gradeLevel,
          parentId: user.id,
          interests: action.interests,
          learningStyle: action.learningStyle || null,
          specialNeeds: action.specialNeeds || null,
          // These can be updated later
          school: null,
          allergies: null,
          medicalInfo: null,
          profileImage: null
        };
        
        // Create the child in the database
        const newChild = await storage.createChild(childData);
        
        // Update the action with the new child ID
        processedAction = {
          ...action,
          childId: newChild.id,
          success: true
        };
      } catch (error) {
        console.error("Error registering child:", error);
        processedAction = {
          ...action,
          success: false,
          error: "Failed to register child in the database"
        };
      }
    }
    
    // Return response
    return res.json({
      message: aiResponse,
      action: processedAction
    });
    
  } catch (error) {
    console.error("Error processing enrollment message:", error);
    return res.status(500).json({ message: "Error processing your request" });
  }
};

/**
 * Parse potential actions from the AI response
 */
function parseActionFromResponse(response: string): any {
  // Look for action markers in the response
  const enrollPattern = /\[\s*ENROLL\s*:\s*Child\s*ID\s*:\s*(\d+)\s*,\s*Program\s*ID\s*:\s*(\d+)\s*\]/i;
  const recommendPattern = /\[\s*RECOMMEND\s*:\s*(.*?)\s*\]/i;
  const viewChildrenPattern = /\[\s*VIEW_CHILDREN\s*\]/i;
  const viewProgramsPattern = /\[\s*VIEW_PROGRAMS\s*(?::\s*(.*?))?\s*\]/i;
  const registerChildPattern = /\[\s*REGISTER_CHILD\s*:\s*firstName\s*:\s*(.*?)\s*,\s*lastName\s*:\s*(.*?)\s*,\s*birthdate\s*:\s*([\d-]+)\s*,\s*gradeLevel\s*:\s*(\d+|[a-zA-Z]+)\s*(?:,\s*interests\s*:\s*(.*?))?\s*(?:,\s*learningStyle\s*:\s*(.*?))?\s*(?:,\s*specialNeeds\s*:\s*(.*?))?\s*\]/i;
  
  // Check for child registration action
  const registerChildMatch = response.match(registerChildPattern);
  if (registerChildMatch) {
    // Parse interests if provided
    const interestsStr = registerChildMatch[5] || '';
    const interests = interestsStr.split(',').map(i => i.trim()).filter(i => i);

    // Parse grade level - could be a number or string
    let gradeLevel = registerChildMatch[4];
    // Try to convert to number if it's numeric
    if (/^\d+$/.test(gradeLevel)) {
      gradeLevel = parseInt(gradeLevel).toString();
    }
    
    return {
      type: "register_child",
      firstName: registerChildMatch[1],
      lastName: registerChildMatch[2],
      birthdate: registerChildMatch[3],
      gradeLevel: gradeLevel,
      interests: interests,
      learningStyle: registerChildMatch[6] || 'not specified',
      specialNeeds: registerChildMatch[7] || ''
    };
  }
  
  // Check for enrollment action
  const enrollMatch = response.match(enrollPattern);
  if (enrollMatch) {
    return {
      type: "enroll",
      childId: parseInt(enrollMatch[1]),
      programId: parseInt(enrollMatch[2])
    };
  }
  
  // Check for recommend action
  const recommendMatch = response.match(recommendPattern);
  if (recommendMatch) {
    return {
      type: "recommend",
      interestArea: recommendMatch[1]
    };
  }
  
  // Check for view children action
  if (viewChildrenPattern.test(response)) {
    return { type: "view_children" };
  }
  
  // Check for view programs action
  const viewProgramsMatch = response.match(viewProgramsPattern);
  if (viewProgramsMatch) {
    return {
      type: "view_programs",
      interestArea: viewProgramsMatch[1]
    };
  }
  
  return undefined;
}