import express from "express";
import { storage } from "../storage";
import { supabaseAuth, requireEducatorRole } from "../middleware/supabase-auth";
import { z } from "zod";
import type { InsertClassSession, ClassSession, EducatorClassAssignment, InsertAuditLog, InsertSessionAttendance, SessionAttendance } from "@shared/schema";
import { formatScheduleString } from "../utils/schedule";

const router = express.Router();

router.use(supabaseAuth);
router.use(requireEducatorRole);

// GET /api/educator/dashboard - Get educator dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    console.log('[EducatorDashboard] Fetching dashboard for user:', userId);

    // Get educator's class assignments
    const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
    console.log('[EducatorDashboard] Found', assignments.length, 'class assignments');

    // Get today's date for filtering sessions
    const today = new Date().toISOString().split('T')[0];

    // Get all sessions and filter for today
    const allSessions = await storage.getClassSessionsByEducatorId(userId);
    const todaySessions = allSessions.filter((s: ClassSession) => s.scheduledDate === today);
    console.log('[EducatorDashboard] Found', todaySessions.length, 'sessions for today');

    // Get active session if any
    const activeSession = await storage.getActiveClassSession(userId);

    // Get class details for assignments (these are "today's classes" for the educator)
    const todayClasses = await Promise.all(
      assignments.map(async (assignment: EducatorClassAssignment) => {
        const classInfo = await storage.getClassById(assignment.classId);
        const enrollmentCount = await storage.getEnrollmentCountForClass(assignment.classId);
        return {
          assignmentId: assignment.id,
          classId: assignment.classId,
          isPrimary: assignment.isPrimary,
          canStartSession: assignment.canStartSession,
          validFrom: assignment.validFrom,
          validTo: assignment.validTo,
          className: classInfo?.title || 'Unknown Class',
          classDescription: classInfo?.description,
          classSchedule: formatScheduleString(classInfo?.schedule),
          classLocation: classInfo?.location,
          capacity: classInfo?.capacity,
          enrollmentCount,
          schoolId: assignment.schoolId
        };
      })
    );

    // Calculate completed and upcoming sessions for today
    const completedToday = todaySessions.filter((s: ClassSession) => s.status === 'completed').length;
    const upcomingSessions = todaySessions.filter((s: ClassSession) => s.status === 'scheduled').length;

    res.json({
      todayClasses,
      activeSession: activeSession || null,
      upcomingSessions,
      completedToday
    });
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// GET /api/educator/my-classes - Get classes assigned to the educator
router.get('/my-classes', async (req, res) => {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    console.log('[EducatorDashboard] Fetching my classes for user:', userId, userEmail);

    const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);

    // If assignments exist, use them
    if (assignments.length > 0) {
      console.log('[EducatorDashboard] Found', assignments.length, 'class assignments');
      const classesWithDetails = await Promise.all(
        assignments.map(async (assignment: EducatorClassAssignment) => {
          const classInfo = await storage.getClassById(assignment.classId);
          const enrollmentCount = await storage.getEnrollmentCountForClass(assignment.classId);
          
          return {
            assignmentId: assignment.id,
            classId: assignment.classId,
            id: assignment.classId,
            title: classInfo?.title || 'Unknown Class',
            isPrimary: assignment.isPrimary,
            canStartSession: assignment.canStartSession,
            validFrom: assignment.validFrom,
            validTo: assignment.validTo,
            className: classInfo?.title || 'Unknown Class',
            classDescription: classInfo?.description,
            classSchedule: formatScheduleString(classInfo?.schedule),
            schedule: formatScheduleString(classInfo?.schedule),
            classLocation: classInfo?.location,
            location: classInfo?.location,
            capacity: classInfo?.capacity,
            enrollmentCount,
            schoolId: assignment.schoolId
          };
        })
      );
      return res.json(classesWithDetails);
    }

    // Fallback: Look up classes by instructor email/name (legacy data)
    console.log('[EducatorDashboard] No assignments found, falling back to instructor lookup');
    const educator = await storage.getUser(userId);
    if (!educator) {
      console.log('[EducatorDashboard] Educator not found for userId:', userId);
      return res.json([]);
    }

    const allClasses = await storage.getAllClasses();
    const assignedClasses = allClasses.filter(cls => 
      cls.instructorId === educator.id ||
      cls.instructorName === educator.name
    );

    console.log(`[EducatorDashboard] Fallback found ${assignedClasses.length} classes for educator`);

    const classesWithEnrollmentCounts = await Promise.all(
      assignedClasses.map(async (cls) => {
        const enrollmentCount = await storage.getEnrollmentCountForClass(cls.id);
        return {
          assignmentId: cls.id,
          classId: cls.id,
          id: cls.id,
          title: cls.title,
          isPrimary: true,
          canStartSession: true,
          validFrom: null,
          validTo: null,
          className: cls.title,
          classDescription: cls.description,
          classSchedule: formatScheduleString(cls.schedule),
          schedule: formatScheduleString(cls.schedule),
          classLocation: cls.location,
          location: cls.location,
          capacity: cls.capacity,
          enrollmentCount,
          schoolId: cls.schoolId
        };
      })
    );

    res.json(classesWithEnrollmentCounts);
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching my classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// GET /api/educator/my-students - Get students for educator's classes (authenticated)
router.get('/my-students', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    console.log('[EducatorDashboard] Fetching my students for user:', userId);

    const educator = await storage.getUser(userId);
    if (!educator) {
      console.log('[EducatorDashboard] Educator not found for userId:', userId);
      return res.json({ students: [], totalStudents: 0 });
    }

    // Get classes assigned to this educator (check assignments first, then fall back to instructor lookup)
    const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
    
    let assignedClassIds: number[] = [];
    let assignedClasses: any[] = [];

    if (assignments.length > 0) {
      assignedClassIds = assignments.map(a => a.classId);
      assignedClasses = await Promise.all(
        assignedClassIds.map(async (classId) => {
          const classInfo = await storage.getClassById(classId);
          return classInfo;
        })
      );
      assignedClasses = assignedClasses.filter(Boolean);
    } else {
      // Fallback to instructor lookup
      const allClasses = await storage.getAllClasses();
      assignedClasses = allClasses.filter(cls => 
        cls.instructorId === educator.id ||
        cls.instructorName === educator.name
      );
      assignedClassIds = assignedClasses.map(cls => cls.id);
    }

    console.log(`[EducatorDashboard] Found ${assignedClasses.length} classes for educator`);

    const allChildren = await storage.getAllChildren();
    const allProgramEnrollments = await storage.getAllEnrollments();
    
    const allEnrollments = allProgramEnrollments.filter((enrollment: any) =>
      enrollment.classType === 'marketplace' &&
      enrollment.marketplaceClassId &&
      assignedClassIds.includes(enrollment.marketplaceClassId)
    );

    const studentsWithClasses = allEnrollments.map((enrollment: any) => {
      const child = allChildren.find(c => c.id === enrollment.childId);
      const classInfo = assignedClasses.find(c => c.id === enrollment.marketplaceClassId);
      
      if (child) {
        return {
          id: child.id,
          firstName: child.firstName,
          lastName: child.lastName,
          gradeLevel: child.gradeLevel,
          parentEmail: child.parentEmail,
          birthdate: child.birthdate,
          classId: enrollment.marketplaceClassId,
          className: classInfo ? classInfo.title : 'Unknown Class',
          enrollmentDate: enrollment.enrollmentDate,
          enrollmentStatus: enrollment.status
        };
      }
      return null;
    }).filter(Boolean);

    console.log(`[EducatorDashboard] Found ${studentsWithClasses.length} students for educator`);
    
    res.json({
      students: studentsWithClasses,
      totalStudents: studentsWithClasses.length,
      assignedClasses: assignedClasses.length
    });
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching my students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// GET /api/educator/classes/:id - Get specific class details for an educator
router.get('/classes/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const classId = parseInt(req.params.id);
    if (isNaN(classId)) {
      return res.status(400).json({ error: 'Invalid class ID' });
    }

    console.log('[EducatorDashboard] Fetching class details for class:', classId, 'user:', userId);

    // Get class info
    const classInfo = await storage.getClassById(classId);
    if (!classInfo) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Verify educator has access to this class (via assignments or instructor match)
    const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
    const isAssigned = assignments.some(a => a.classId === classId);
    
    if (!isAssigned) {
      // Fallback: check if educator is the instructor
      const educator = await storage.getUser(userId);
      const isInstructor = educator && (
        classInfo.instructorId === educator.id ||
        classInfo.instructorName === educator.name
      );
      
      if (!isInstructor) {
        return res.status(403).json({ error: 'You do not have access to this class' });
      }
    }

    // Get enrollment count
    const enrollmentCount = await storage.getEnrollmentCountForClass(classId);
    
    // Format schedule for display using shared helper
    const scheduleStr = formatScheduleString(classInfo.schedule);

    // Determine status based on dates
    const now = new Date();
    const validFrom = classInfo.startDate ? new Date(classInfo.startDate) : null;
    const validTo = classInfo.endDate ? new Date(classInfo.endDate) : null;
    
    let status = 'active';
    if (validTo && now > validTo) {
      status = 'completed';
    } else if (validFrom && now < validFrom) {
      status = 'upcoming';
    }

    res.json({
      id: classInfo.id,
      title: classInfo.title,
      description: classInfo.description,
      category: classInfo.category,
      gradeLevel: classInfo.gradeLevels,
      location: classInfo.location,
      schedule: scheduleStr,
      scheduleRaw: classInfo.schedule,
      price: classInfo.price,
      capacity: classInfo.capacity,
      enrollmentCount,
      startDate: classInfo.startDate,
      endDate: classInfo.endDate,
      status,
      instructorId: classInfo.instructorId,
      instructorName: classInfo.instructorName,
      volunteerWaiverId: classInfo.volunteerWaiverId || null
    });
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching class details:', error);
    res.status(500).json({ error: 'Failed to fetch class details' });
  }
});

// GET /api/educator/classes/:id/assignments - Get educator/aide assignments for a class
router.get('/classes/:id/assignments', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const classId = parseInt(req.params.id);
    if (isNaN(classId)) {
      return res.status(400).json({ error: 'Invalid class ID' });
    }

    console.log('[EducatorDashboard] Fetching class assignments for class:', classId, 'user:', userId);

    // Verify educator has access to this class
    const userAssignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
    const isAssigned = userAssignments.some(a => a.classId === classId);
    
    if (!isAssigned) {
      // Fallback: check if educator is the instructor
      const classInfo = await storage.getClassById(classId);
      const educator = await storage.getUser(userId);
      const isInstructor = classInfo && educator && (
        classInfo.instructorId === educator.id ||
        classInfo.instructorName === educator.name
      );
      
      if (!isInstructor) {
        return res.status(403).json({ error: 'You do not have access to this class' });
      }
    }

    // Get all assignments for this class
    const allAssignments = await storage.getEducatorClassAssignmentsByClassId(classId);
    
    // Enrich with educator details
    const enrichedAssignments = await Promise.all(
      allAssignments.map(async (assignment) => {
        const educator = await storage.getUser(assignment.educatorId);
        const userRoles = await storage.getUserRolesByUserId(assignment.educatorId);
        // Get the most relevant role (prioritize educator-type roles)
        const educatorRole = userRoles?.find(r => 
          ['educator', 'mentor', 'aide', 'assistant'].includes(r.role.toLowerCase())
        );
        
        return {
          id: assignment.id,
          educatorId: assignment.educatorId,
          classId: assignment.classId,
          schoolId: assignment.schoolId,
          isPrimary: assignment.isPrimary,
          canStartSession: assignment.canStartSession,
          validFrom: assignment.validFrom,
          validTo: assignment.validTo,
          educatorName: educator?.name || educator?.email?.split('@')[0] || 'Unknown',
          educatorEmail: educator?.email || '',
          role: educatorRole?.role || 'Staff'
        };
      })
    );

    res.json(enrichedAssignments);
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching class assignments:', error);
    res.status(500).json({ error: 'Failed to fetch class assignments' });
  }
});

// GET /api/educator/classes/:id/students - Get students for a specific class
router.get('/classes/:id/students', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const classId = parseInt(req.params.id);
    if (isNaN(classId)) {
      return res.status(400).json({ error: 'Invalid class ID' });
    }

    console.log('[EducatorDashboard] Fetching students for class:', classId, 'user:', userId);

    // Verify educator has access to this class
    const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
    const isAssigned = assignments.some(a => a.classId === classId);
    
    if (!isAssigned) {
      // Fallback: check if educator is the instructor
      const classInfo = await storage.getClassById(classId);
      const educator = await storage.getUser(userId);
      const isInstructor = classInfo && educator && (
        classInfo.instructorId === educator.id ||
        classInfo.instructorName === educator.name
      );
      
      if (!isInstructor) {
        return res.status(403).json({ error: 'You do not have access to this class' });
      }
    }

    // Get enrolled students from program_enrollments
    const allChildren = await storage.getAllChildren();
    const allEnrollments = await storage.getAllEnrollments();
    
    const classEnrollments = allEnrollments.filter((enrollment: any) =>
      enrollment.classType === 'marketplace' &&
      enrollment.marketplaceClassId === classId
    );

    const students = classEnrollments.map((enrollment: any) => {
      const child = allChildren.find(c => c.id === enrollment.childId);
      if (child) {
        return {
          id: child.id,
          firstName: child.firstName,
          lastName: child.lastName,
          gradeLevel: child.gradeLevel,
          birthdate: child.birthdate,
          parentEmail: child.parentEmail,
          enrollmentDate: enrollment.enrollmentDate,
          enrollmentStatus: enrollment.status
        };
      }
      return null;
    }).filter(Boolean);

    console.log(`[EducatorDashboard] Found ${students.length} students for class ${classId}`);
    
    res.json({
      students,
      totalStudents: students.length
    });
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching class students:', error);
    res.status(500).json({ error: 'Failed to fetch class students' });
  }
});

// GET /api/educator/sessions - Get educator's sessions with optional filters
router.get('/sessions', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const { date, status, classId } = req.query;
    console.log('[EducatorDashboard] Fetching sessions for user:', userId, { date, status, classId });

    let sessions = await storage.getClassSessionsByEducatorId(userId);
    
    // Filter by date if provided
    if (date) {
      sessions = sessions.filter((s: ClassSession) => s.scheduledDate === date);
    }

    // Apply additional filters
    if (status) {
      sessions = sessions.filter((s: ClassSession) => s.status === status);
    }
    if (classId) {
      sessions = sessions.filter((s: ClassSession) => s.classId === parseInt(classId as string));
    }

    // Enrich with class details
    const sessionsWithDetails = await Promise.all(
      sessions.map(async (session: ClassSession) => {
        const classInfo = await storage.getClassById(session.classId);
        return {
          ...session,
          className: classInfo?.title || 'Unknown Class'
        };
      })
    );

    res.json(sessionsWithDetails);
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/educator/sessions/:id - Get a single session by ID
router.get('/sessions/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    console.log('[EducatorDashboard] Fetching session:', sessionId, 'for user:', userId);

    // Get the session
    const session = await storage.getClassSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify educator owns this session or is substitute
    if (session.educatorId !== userId && session.substituteEducatorId !== userId) {
      return res.status(403).json({ 
        error: 'You are not authorized to view this session',
        code: 'NOT_AUTHORIZED'
      });
    }

    // Enrich with class details
    const classInfo = await storage.getClassById(session.classId);
    if (!classInfo) {
      console.log('[EducatorDashboard] Class not found for session:', sessionId, 'classId:', session.classId);
      return res.status(404).json({ error: 'Associated class not found' });
    }

    const sessionWithDetails = {
      ...session,
      className: classInfo.title || 'Unknown Class',
      classSchedule: formatScheduleString(classInfo.schedule),
      classLocation: classInfo.location
    };

    console.log('[EducatorDashboard] Session fetched:', sessionId);
    res.json(sessionWithDetails);
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// POST /api/educator/sessions - Create a new session
const createSessionSchema = z.object({
  classId: z.number(),
  scheduledDate: z.string(),
  scheduledStartTime: z.string(),
  scheduledEndTime: z.string(),
  dailyFlowEntryId: z.number().optional(),
  notes: z.string().optional()
});

router.post('/sessions', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    console.log('[EducatorDashboard] Creating session:', req.body);

    const validatedData = createSessionSchema.parse(req.body);

    // Verify educator is assigned to this class
    const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
    const assignment = assignments.find((a: EducatorClassAssignment) => a.classId === validatedData.classId);

    if (!assignment) {
      console.log('[EducatorDashboard] User not assigned to class:', validatedData.classId);
      return res.status(403).json({ 
        error: 'You are not assigned to this class',
        code: 'NOT_ASSIGNED'
      });
    }

    if (!assignment.canStartSession) {
      console.log('[EducatorDashboard] User cannot start sessions for class:', validatedData.classId);
      return res.status(403).json({ 
        error: 'You do not have permission to start sessions for this class',
        code: 'NO_SESSION_PERMISSION'
      });
    }

    const sessionData: InsertClassSession = {
      classId: validatedData.classId,
      schoolId: assignment.schoolId,
      educatorId: userId,
      scheduledDate: validatedData.scheduledDate,
      scheduledStartTime: validatedData.scheduledStartTime,
      scheduledEndTime: validatedData.scheduledEndTime,
      dailyFlowEntryId: validatedData.dailyFlowEntryId,
      notes: validatedData.notes,
      status: 'scheduled'
    };

    const session = await storage.createClassSession(sessionData);
    console.log('[EducatorDashboard] Session created:', session.id);

    res.status(201).json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid session data',
        details: error.errors
      });
    }
    console.error('[EducatorDashboard] Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// POST /api/educator/sessions/:id/start - Start a session (check-in)
router.post('/sessions/:id/start', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const sessionId = parseInt(req.params.id);
    console.log('[EducatorDashboard] Starting session:', sessionId);

    // Get the session
    const session = await storage.getClassSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify educator owns this session or is substitute
    if (session.educatorId !== userId && session.substituteEducatorId !== userId) {
      return res.status(403).json({ 
        error: 'You are not authorized to start this session',
        code: 'NOT_AUTHORIZED'
      });
    }

    // Check if session is already started
    if (session.status === 'in_progress') {
      return res.status(400).json({ 
        error: 'Session is already in progress',
        code: 'ALREADY_STARTED'
      });
    }

    // Check if session is already completed or cancelled
    if (['completed', 'cancelled'].includes(session.status)) {
      return res.status(400).json({ 
        error: `Cannot start a ${session.status} session`,
        code: 'INVALID_STATUS'
      });
    }

    // Update session status
    const updatedSession = await storage.updateClassSession(sessionId, {
      status: 'in_progress',
      actualStartTime: new Date()
    });

    // Create audit log for session start
    try {
      const auditLog: InsertAuditLog = {
        actionType: 'session_started',
        severity: 'info',
        actorId: userId,
        actorRole: 'educator',
        actorEmail: req.user?.email,
        targetType: 'class_session',
        targetId: String(sessionId),
        schoolId: session.schoolId,
        metadata: {
          context: 'Educator started class session',
          classId: session.classId,
          scheduledDate: session.scheduledDate,
          actualStartTime: updatedSession?.actualStartTime
        }
      };
      await storage.createAuditLog(auditLog);
    } catch (auditError) {
      console.error('[EducatorDashboard] Failed to create audit log:', auditError);
    }

    console.log('[EducatorDashboard] Session started:', sessionId);
    res.json(updatedSession);
  } catch (error) {
    console.error('[EducatorDashboard] Error starting session:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// POST /api/educator/sessions/:id/end - End a session (check-out)
router.post('/sessions/:id/end', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const sessionId = parseInt(req.params.id);
    const { notes } = req.body;
    console.log('[EducatorDashboard] Ending session:', sessionId);

    // Get the session
    const session = await storage.getClassSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify educator owns this session or is substitute
    if (session.educatorId !== userId && session.substituteEducatorId !== userId) {
      return res.status(403).json({ 
        error: 'You are not authorized to end this session',
        code: 'NOT_AUTHORIZED'
      });
    }

    // Check if session is in progress
    if (session.status !== 'in_progress') {
      return res.status(400).json({ 
        error: 'Session is not in progress',
        code: 'NOT_IN_PROGRESS'
      });
    }

    // Update session status
    const updateData: any = {
      status: 'completed',
      actualEndTime: new Date()
    };
    if (notes) {
      updateData.notes = notes;
    }

    const updatedSession = await storage.updateClassSession(sessionId, updateData);

    // Create audit log for session end
    try {
      const auditLog: InsertAuditLog = {
        actionType: 'session_ended',
        severity: 'info',
        actorId: userId,
        actorRole: 'educator',
        actorEmail: req.user?.email,
        targetType: 'class_session',
        targetId: String(sessionId),
        schoolId: session.schoolId,
        metadata: {
          context: 'Educator ended class session',
          classId: session.classId,
          scheduledDate: session.scheduledDate,
          actualStartTime: session.actualStartTime,
          actualEndTime: updatedSession?.actualEndTime,
          notes: notes || null
        }
      };
      await storage.createAuditLog(auditLog);
    } catch (auditError) {
      console.error('[EducatorDashboard] Failed to create audit log:', auditError);
    }

    // Auto-create pending volunteer credits for all volunteers in this session
    try {
      const sessionVolunteers = await storage.getSessionVolunteersBySessionId(sessionId);
      const HOURLY_RATE_CENTS = 2000; // $20/hr
      
      for (const volunteer of sessionVolunteers) {
        // Calculate actual minutes worked (use check-in/out times if available, else use session times)
        let minutesWorked = volunteer.actualMinutes || 0;
        
        if (!minutesWorked && volunteer.checkInTime && volunteer.checkOutTime) {
          const checkIn = new Date(volunteer.checkInTime).getTime();
          const checkOut = new Date(volunteer.checkOutTime).getTime();
          minutesWorked = Math.round((checkOut - checkIn) / (1000 * 60));
        } else if (!minutesWorked && session.actualStartTime && updatedSession?.actualEndTime) {
          // Fallback to session times
          const sessionStart = new Date(session.actualStartTime).getTime();
          const sessionEnd = new Date(updatedSession.actualEndTime).getTime();
          minutesWorked = Math.round((sessionEnd - sessionStart) / (1000 * 60));
        }
        
        if (minutesWorked > 0) {
          // Calculate credit amount: ($20/hr = 2000 cents/hr) / 60 min * minutesWorked
          const hoursWorked = minutesWorked / 60;
          const creditAmountCents = Math.round(hoursWorked * HOURLY_RATE_CENTS);
          
          // Create pending volunteer credit
          await storage.createVolunteerCredit({
            userId: volunteer.volunteerId,
            schoolId: session.schoolId,
            sessionId: sessionId,
            minutesWorked: minutesWorked,
            hourlyRateCents: HOURLY_RATE_CENTS,
            creditAmountCents: creditAmountCents,
            status: 'pending',
            description: `Volunteer credit for ${hoursWorked.toFixed(2)} hours on ${new Date(session.scheduledDate).toLocaleDateString()}`
          });
          
          console.log(`[VolunteerCredits] Created pending credit for volunteer ${volunteer.volunteerId}: ${creditAmountCents} cents (${hoursWorked.toFixed(2)} hours)`);
        }
      }
    } catch (creditError) {
      console.error('[EducatorDashboard] Failed to create volunteer credits:', creditError);
      // Don't fail the session end if credit creation fails
    }

    console.log('[EducatorDashboard] Session ended:', sessionId);
    res.json(updatedSession);
  } catch (error) {
    console.error('[EducatorDashboard] Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// POST /api/educator/sessions/:id/cancel - Cancel a session
router.post('/sessions/:id/cancel', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const sessionId = parseInt(req.params.id);
    const { reason } = req.body;
    console.log('[EducatorDashboard] Cancelling session:', sessionId);

    // Get the session
    const session = await storage.getClassSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify educator owns this session
    if (session.educatorId !== userId) {
      return res.status(403).json({ 
        error: 'You are not authorized to cancel this session',
        code: 'NOT_AUTHORIZED'
      });
    }

    // Check if session can be cancelled
    if (['completed', 'cancelled'].includes(session.status)) {
      return res.status(400).json({ 
        error: `Cannot cancel a ${session.status} session`,
        code: 'INVALID_STATUS'
      });
    }

    // Update session status
    const updatedSession = await storage.updateClassSession(sessionId, {
      status: 'cancelled',
      cancelledReason: reason
    });

    // Create audit log for session cancellation
    try {
      const auditLog: InsertAuditLog = {
        actionType: 'session_cancelled',
        severity: 'warn',
        actorId: userId,
        actorRole: 'educator',
        actorEmail: req.user?.email,
        targetType: 'class_session',
        targetId: String(sessionId),
        schoolId: session.schoolId,
        metadata: {
          context: 'Educator cancelled class session',
          classId: session.classId,
          scheduledDate: session.scheduledDate,
          reason: reason || null
        }
      };
      await storage.createAuditLog(auditLog);
    } catch (auditError) {
      console.error('[EducatorDashboard] Failed to create audit log:', auditError);
    }

    console.log('[EducatorDashboard] Session cancelled:', sessionId);
    res.json(updatedSession);
  } catch (error) {
    console.error('[EducatorDashboard] Error cancelling session:', error);
    res.status(500).json({ error: 'Failed to cancel session' });
  }
});

// GET /api/educator/daily-flow/:classId - Get daily flow for a class
router.get('/daily-flow/:classId', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const classId = parseInt(req.params.classId);
    const { date } = req.query;
    const targetDate = date as string || new Date().toISOString().split('T')[0];
    
    console.log('[EducatorDashboard] Fetching daily flow for class:', classId, 'date:', targetDate);

    // Verify educator is assigned to this class
    const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
    const assignment = assignments.find((a: EducatorClassAssignment) => a.classId === classId);

    if (!assignment) {
      return res.status(403).json({ 
        error: 'You are not assigned to this class',
        code: 'NOT_ASSIGNED'
      });
    }

    // Get daily flow entries and filter by class and date
    const allDailyFlowEntries = await storage.getDailyFlowEntries({ classId, date: targetDate });
    const dailyFlowEntry = allDailyFlowEntries.find((entry: any) => 
      entry.classId === classId && entry.date === targetDate
    );

    if (!dailyFlowEntry) {
      return res.json({
        message: 'No daily flow entry found for this date',
        classId,
        date: targetDate,
        entry: null
      });
    }

    res.json({
      classId,
      date: targetDate,
      entry: dailyFlowEntry
    });
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching daily flow:', error);
    res.status(500).json({ error: 'Failed to fetch daily flow' });
  }
});

// GET /api/educator/active-session - Get currently active session for this educator
router.get('/active-session', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    console.log('[EducatorDashboard] Fetching active session for user:', userId);

    const activeSession = await storage.getActiveClassSession(userId);

    if (!activeSession) {
      return res.json({ activeSession: null });
    }

    // Enrich with class details
    const classInfo = await storage.getClassById(activeSession.classId);
    
    res.json({
      activeSession: {
        ...activeSession,
        className: classInfo?.title || 'Unknown Class',
        classSchedule: formatScheduleString(classInfo?.schedule),
        classLocation: classInfo?.location
      }
    });
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching active session:', error);
    res.status(500).json({ error: 'Failed to fetch active session' });
  }
});

// Legacy routes (without auth middleware for backwards compatibility)
// TODO: Migrate these to use authentication

// Get classes assigned to a specific educator by email (legacy)
router.get('/classes', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ message: 'Email parameter is required' });
    }

    console.log(`[EducatorDashboard] Fetching classes for educator: ${email}`);

    const educator = await storage.getUserByEmail(email as string);
    if (!educator) {
      console.log(`[EducatorDashboard] Educator not found for email: ${email}`);
      return res.json([]);
    }

    const allClasses = await storage.getAllClasses();
    const assignedClasses = allClasses.filter(cls => 
      cls.instructorId === educator.id ||
      cls.instructorName === educator.name
    );

    console.log(`[EducatorDashboard] Found ${assignedClasses.length} classes for educator ${email}`);
    
    const classesWithEnrollmentCounts = await Promise.all(
      assignedClasses.map(async (cls) => {
        const enrollmentCount = await storage.getEnrollmentCountForClass(cls.id);
        return {
          ...cls,
          enrollmentCount
        };
      })
    );
    
    res.json(classesWithEnrollmentCounts);
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching educator classes:', error);
    res.status(500).json({ message: 'Failed to fetch educator classes' });
  }
});

// Get students for classes taught by a specific educator (legacy)
router.get('/students', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ message: 'Email parameter is required' });
    }

    console.log(`[EducatorDashboard] Fetching students for educator: ${email}`);

    const educator = await storage.getUserByEmail(email as string);
    if (!educator) {
      console.log(`[EducatorDashboard] Educator not found for email: ${email}`);
      return res.json({ students: [], totalStudents: 0 });
    }

    const allClasses = await storage.getAllClasses();
    const assignedClasses = allClasses.filter(cls => 
      cls.instructorId === educator.id ||
      cls.instructorName === educator.name
    );

    console.log(`[EducatorDashboard] Found ${assignedClasses.length} classes for educator`);

    const assignedClassIds = assignedClasses.map(cls => cls.id);

    const allChildren = await storage.getAllChildren();

    const allProgramEnrollments = await storage.getAllEnrollments();
    const allEnrollments = allProgramEnrollments.filter((enrollment: any) =>
      enrollment.classType === 'marketplace' &&
      enrollment.marketplaceClassId &&
      assignedClassIds.includes(enrollment.marketplaceClassId)
    );

    const studentsWithClasses = allEnrollments.map((enrollment: any) => {
      const child = allChildren.find(c => c.id === enrollment.childId);
      const classInfo = assignedClasses.find(c => c.id === enrollment.marketplaceClassId);
      
      if (child) {
        return {
          id: child.id,
          firstName: child.firstName,
          lastName: child.lastName,
          gradeLevel: child.gradeLevel,
          parentEmail: child.parentEmail,
          classId: enrollment.marketplaceClassId,
          className: classInfo ? classInfo.title : 'Unknown Class',
          enrollmentDate: enrollment.enrollmentDate,
          enrollmentStatus: enrollment.status
        };
      }
      return null;
    }).filter(Boolean);

    console.log(`[EducatorDashboard] Found ${studentsWithClasses.length} students for educator ${email}`);
    
    res.json({
      students: studentsWithClasses,
      totalStudents: studentsWithClasses.length,
      assignedClasses: assignedClasses.length
    });
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching educator students:', error);
    res.status(500).json({ message: 'Failed to fetch educator students' });
  }
});

// Get students for a specific class (legacy)
router.get('/class-students/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ message: 'Email parameter is required' });
    }

    console.log(`[EducatorDashboard] Fetching students for class ${classId}, educator: ${email}`);

    const educator = await storage.getUserByEmail(email as string);
    if (!educator) {
      console.log(`[EducatorDashboard] Educator not found for email: ${email}`);
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    const targetClass = await storage.getClassById(parseInt(classId));
    if (!targetClass) {
      console.log(`[EducatorDashboard] Class not found: ${classId}`);
      return res.status(404).json({ message: 'Class not found' });
    }

    const isAuthorized = 
      targetClass.instructorId === educator.id ||
      targetClass.instructorName === educator.name;

    if (!isAuthorized) {
      console.log(`[EducatorDashboard] Educator ${email} not authorized for class ${classId}`);
      return res.status(403).json({ message: 'You are not authorized to view this class' });
    }

    const allProgramEnrollments = await storage.getAllEnrollments();
    const classEnrollments = allProgramEnrollments.filter((enrollment: any) =>
      enrollment.classType === 'marketplace' &&
      enrollment.marketplaceClassId === parseInt(classId)
    );

    const allChildren = await storage.getAllChildren();

    const studentsInClass = classEnrollments.map((enrollment: any) => {
      const child = allChildren.find(c => c.id === enrollment.childId);
      
      if (child) {
        return {
          id: child.id,
          firstName: child.firstName,
          lastName: child.lastName,
          gradeLevel: child.gradeLevel,
          birthdate: child.birthdate,
          parentEmail: child.parentEmail,
          enrollmentDate: enrollment.createdAt || enrollment.enrollmentDate,
          interests: child.interests,
          specialNeeds: child.specialNeeds
        };
      }
      return null;
    }).filter(Boolean);

    console.log(`[EducatorDashboard] Found ${studentsInClass.length} students for class ${classId}`);
    
    res.json({
      students: studentsInClass,
      totalStudents: studentsInClass.length,
      classInfo: {
        id: targetClass.id,
        title: targetClass.title,
        capacity: targetClass.capacity
      }
    });
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching class students:', error);
    res.status(500).json({ message: 'Failed to fetch class students' });
  }
});

// ============================================
// PHASE 1b: Educator Schedule & Hours Endpoints
// ============================================

// GET /api/educator/schedules - Get all schedules for the educator
router.get('/schedules', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    console.log('[EducatorDashboard] Fetching schedules for educator:', userId);

    const schedules = await storage.getEducatorSchedulesByEducatorId(userId);

    // Enrich with class details
    const schedulesWithDetails = await Promise.all(
      schedules.map(async (schedule) => {
        const classInfo = await storage.getClassById(schedule.classId);
        return {
          ...schedule,
          className: classInfo?.title || 'Unknown Class',
          classLocation: classInfo?.location
        };
      })
    );

    res.json(schedulesWithDetails);
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// Helper to map day names to day index (0=Monday, 6=Sunday)
const DAY_NAME_TO_INDEX: Record<string, number> = {
  'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
  'friday': 4, 'saturday': 5, 'sunday': 6,
  'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5, 'sun': 6
};

// Day name mappings (full names, abbreviations, variants, plurals, dots)
const DAY_PATTERNS: Array<{ pattern: RegExp; dayName: string }> = [
  { pattern: /\bmon\.?(day)?s?\b/i, dayName: 'monday' },
  { pattern: /\btue\.?s?(day)?s?\b/i, dayName: 'tuesday' },
  { pattern: /\bwed\.?(nesday)?s?\b/i, dayName: 'wednesday' },
  { pattern: /\bthu\.?(r|rs|rsday)?s?\b/i, dayName: 'thursday' },
  { pattern: /\bfri\.?(day)?s?\b/i, dayName: 'friday' },
  { pattern: /\bsat\.?(urday)?s?\b/i, dayName: 'saturday' },
  { pattern: /\bsun\.?(day)?s?\b/i, dayName: 'sunday' },
];

// Helper to parse string schedule like "Monday, Wednesday, Friday 9:00 AM-12:00 PM"
// or "Mon/Wed 9 AM – 12 PM" or "Monday-Friday 9:00-10:00"
// Also handles multi-block schedules like "Mon-Fri 9AM-12PM & Sat 10AM-12PM"
function parseScheduleString(scheduleStr: string): Array<{ day: string; startTime: string; endTime: string }> {
  const entries: Array<{ day: string; startTime: string; endTime: string }> = [];
  
  // Split on multi-block delimiters: "&", "and", ";"
  // But only if the block has day information (to avoid splitting time ranges)
  const blocks = scheduleStr.split(/\s*(?:&|;|\band\b)\s*/i).filter(b => b.trim());
  
  // If we have multiple blocks, parse each separately
  if (blocks.length > 1) {
    for (const block of blocks) {
      // Check if block contains day information
      const hasDayInfo = DAY_PATTERNS.some(({ pattern }) => pattern.test(block));
      if (hasDayInfo) {
        entries.push(...parseSingleScheduleBlock(block));
      }
    }
    if (entries.length > 0) {
      return entries;
    }
  }
  
  // Single block or fallback - parse as single schedule
  return parseSingleScheduleBlock(scheduleStr);
}

// Parse a single schedule block (no multi-block delimiters)
function parseSingleScheduleBlock(scheduleStr: string): Array<{ day: string; startTime: string; endTime: string }> {
  const entries: Array<{ day: string; startTime: string; endTime: string }> = [];
  
  // Extract time range from the string
  // Only match actual times: must have colon OR AM/PM (not bare numbers like grade ranges)
  // Handles: "9:00 AM-12:00 PM", "9AM-10:30AM", "9 AM – 12 PM", "09:00-12:00", "noon", "midnight"
  
  let startTime = '09:00';
  let endTime = '10:00';
  
  // Time patterns that definitively look like times:
  // 1. Numbers with colon: "9:00", "10:30"
  // 2. Numbers with AM/PM: "9AM", "9 AM", "9:00 AM"
  // 3. Special words: "noon", "midnight"
  const timeTokenPattern = /\b(\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{1,2}\s*(?:AM|PM)|noon|midnight)\b/gi;
  const timeMatches = scheduleStr.match(timeTokenPattern);
  
  if (timeMatches && timeMatches.length >= 2) {
    let startToken = timeMatches[0].trim();
    let endToken = timeMatches[1].trim();
    
    // Check for special tokens that shouldn't get AM/PM appended
    const isSpecialTime = (t: string) => /^(noon|midnight)$/i.test(t);
    
    // Extract hour from token for smart meridiem inference
    const extractHour = (t: string): number => {
      if (/^noon$/i.test(t)) return 12;
      if (/^midnight$/i.test(t)) return 0;
      const match = t.match(/^(\d{1,2})/);
      return match ? parseInt(match[1], 10) : 0;
    };
    
    // Propagate AM/PM if one token has it and the other doesn't (skip special tokens)
    const startHasMeridiem = /AM|PM/i.test(startToken);
    const endHasMeridiem = /AM|PM/i.test(endToken);
    
    if (!startHasMeridiem && endHasMeridiem && !isSpecialTime(startToken)) {
      // End has AM/PM but start doesn't - use smart inference
      const endMeridiem = endToken.match(/AM|PM/i)?.[0]?.toUpperCase() || '';
      const startHour = extractHour(startToken);
      const endHour = extractHour(endToken);
      
      // Smart meridiem inference based on hour patterns:
      // 1. "11:30-1 PM" → start > end (11 > 1), start is AM (morning-to-afternoon)
      // 2. "10-12 PM" → end is 12 PM (noon), start is AM (morning-to-noon)
      // 3. "4:00-5:30 PM" → start < end, both are PM (same period)
      // 4. "11:30-12:30 PM" → end is 12, start is AM (11:30 AM - 12:30 PM)
      let startMeridiem = endMeridiem;
      
      if (endMeridiem === 'PM') {
        // End is PM - check if start should be AM
        if (endHour === 12 && startHour >= 8 && startHour <= 11) {
          // "10-12 PM" or "11:30-12:30 PM" → morning-to-noon, start is AM
          startMeridiem = 'AM';
        } else if (startHour > endHour && endHour >= 1 && endHour <= 6) {
          // "11:30-1 PM" → start hour is bigger, morning-to-afternoon transition
          startMeridiem = 'AM';
        }
        // Otherwise, both are PM (e.g., "4:00-5:30 PM")
      }
      // If end is AM, start is also AM (both morning)
      
      startToken = startToken + ' ' + startMeridiem;
    } else if (startHasMeridiem && !endHasMeridiem && !isSpecialTime(endToken)) {
      // Start has AM/PM, propagate to end
      const meridiem = startToken.match(/AM|PM/i)?.[0] || '';
      endToken = endToken + ' ' + meridiem;
    }
    
    startTime = convertTo24Hour(startToken);
    endTime = convertTo24Hour(endToken);
    
    // Validate: if start > end, something went wrong with meridiem inference
    // Common issue: "10 PM-12" where end becomes 12:00 (noon) instead of 00:00 (midnight)
    const startMinutes = parseInt(startTime.split(':')[0], 10) * 60 + parseInt(startTime.split(':')[1], 10);
    const endMinutes = parseInt(endTime.split(':')[0], 10) * 60 + parseInt(endTime.split(':')[1], 10);
    
    if (startMinutes > endMinutes) {
      // Try to fix: if end is 12:00 and start is PM, end should be midnight (00:00)
      if (endTime === '12:00' && startMinutes >= 720) {
        // "10 PM-12" likely means 10 PM to midnight
        endTime = '00:00';
      } else {
        // Fallback: assume both are same period and use reasonable defaults
        // This prevents broken rendering while still showing the class
        startTime = '09:00';
        endTime = '10:00';
      }
    }
  } else if (timeMatches && timeMatches.length === 1) {
    // Single time - assume 1 hour duration
    startTime = convertTo24Hour(timeMatches[0].trim());
    const startHour = parseInt(startTime.split(':')[0], 10);
    endTime = `${((startHour + 1) % 24).toString().padStart(2, '0')}:00`;
  }
  
  // Extract all days - start with individual day names (full or abbreviated)
  const foundDays = new Set<string>();
  
  for (const { pattern, dayName } of DAY_PATTERNS) {
    if (pattern.test(scheduleStr)) {
      foundDays.add(dayName);
    }
  }
  
  // Also check for day ranges like "Monday-Friday", "Mon-Fri", "Mon to Fri", "Monday through Friday"
  // Supports: hyphen, dash, "to", "through", "thru"
  const dayRangePattern = /\b(mon\.?(?:day)?s?|tue\.?s?(?:day)?s?|wed\.?(?:nesday)?s?|thu\.?(?:r|rs|rsday)?s?|fri\.?(?:day)?s?|sat\.?(?:urday)?s?|sun\.?(?:day)?s?)\s*(?:[-–]|to|through|thru)\s*(mon\.?(?:day)?s?|tue\.?s?(?:day)?s?|wed\.?(?:nesday)?s?|thu\.?(?:r|rs|rsday)?s?|fri\.?(?:day)?s?|sat\.?(?:urday)?s?|sun\.?(?:day)?s?)\b/i;
  const rangeMatch = scheduleStr.match(dayRangePattern);
  
  if (rangeMatch) {
    const startDayName = normalizeDayName(rangeMatch[1]);
    const endDayName = normalizeDayName(rangeMatch[2]);
    
    const startIdx = DAY_NAME_TO_INDEX[startDayName];
    const endIdx = DAY_NAME_TO_INDEX[endDayName];
    
    if (startIdx !== undefined && endIdx !== undefined && startIdx < endIdx) {
      // Expand range and add all days
      const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      for (let i = startIdx; i <= endIdx; i++) {
        foundDays.add(dayOrder[i]);
      }
    }
  }
  
  for (const dayName of foundDays) {
    entries.push({ day: dayName, startTime, endTime });
  }
  
  return entries;
}

// Normalize day name abbreviations to full names
function normalizeDayName(dayStr: string): string {
  const lower = dayStr.toLowerCase();
  for (const { pattern, dayName } of DAY_PATTERNS) {
    if (pattern.test(lower)) {
      return dayName;
    }
  }
  return lower;
}

// Convert time string to 24-hour format
// Handles: "9:00 AM", "9AM", "9 AM", "09:00", "9", "noon", "midnight"
function convertTo24Hour(timeStr: string): string {
  const cleaned = timeStr.replace(/\s+/g, '').toUpperCase();
  
  // Handle special keywords
  if (cleaned === 'NOON') return '12:00';
  if (cleaned === 'MIDNIGHT') return '00:00';
  
  // Try format with colon: "9:00AM" or "09:00"
  let match = cleaned.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = match[3];
    
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
  
  // Try format without colon: "9AM" or "9"
  match = cleaned.match(/^(\d{1,2})(AM|PM)?$/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const period = match[2];
    
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}:00`;
  }
  
  return timeStr; // Return as-is if no pattern matches
}

// GET /api/educator/schedules/week - Get schedules for a specific week (classes, events, holidays)
router.get('/schedules/week', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const { weekStart } = req.query;
    const weekStartDate = weekStart as string || getWeekStartDate(new Date());
    
    // Calculate week end date
    const weekStartObj = new Date(weekStartDate + 'T12:00:00');
    const weekEndObj = new Date(weekStartObj);
    weekEndObj.setDate(weekEndObj.getDate() + 6);
    const weekEndDate = weekEndObj.toISOString().split('T')[0];
    
    console.log('[EducatorDashboard] Fetching week schedules for educator:', userId, 'week:', weekStartDate, 'to', weekEndDate);

    // 1. Get educator's class assignments
    const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
    console.log('[EducatorDashboard] Found', assignments.length, 'class assignments');

    // 2. Build class schedule entries from assignments
    const classSchedules: any[] = [];
    const schoolIds = new Set<number>();
    
    // Build list of classes to process (either from assignments or instructor fallback)
    let classesToProcess: Array<{ classInfo: any; assignmentId: number; schoolId: number | null }> = [];
    
    if (assignments.length > 0) {
      // Use assignments
      for (const assignment of assignments) {
        const classInfo = await storage.getClassById(assignment.classId);
        if (classInfo) {
          classesToProcess.push({
            classInfo,
            assignmentId: assignment.id,
            schoolId: assignment.schoolId
          });
        }
      }
    } else {
      // Fallback: Look up classes by instructor email/name (legacy data)
      console.log('[EducatorDashboard] No assignments found, falling back to instructor lookup for schedules');
      const educator = await storage.getUser(userId);
      if (educator) {
        const allClasses = await storage.getAllClasses();
        const assignedClasses = allClasses.filter(cls => 
          cls.instructorId === educator.id ||
          cls.instructorName === educator.name
        );
        console.log(`[EducatorDashboard] Fallback found ${assignedClasses.length} classes for educator schedules`);
        
        for (const cls of assignedClasses) {
          classesToProcess.push({
            classInfo: cls,
            assignmentId: cls.id, // Use class ID as pseudo-assignment ID
            schoolId: cls.schoolId
          });
        }
      }
    }
    
    for (const { classInfo, assignmentId, schoolId } of classesToProcess) {
      if (schoolId) {
        schoolIds.add(schoolId);
      }
      
      // Check if class is active during this week (startDate/endDate)
      const classStartDate = classInfo.startDate ? new Date(classInfo.startDate).toISOString().split('T')[0] : null;
      const classEndDate = classInfo.endDate ? new Date(classInfo.endDate).toISOString().split('T')[0] : null;
      
      // Skip if class hasn't started or has ended
      if (classStartDate && classStartDate > weekEndDate) continue;
      if (classEndDate && classEndDate < weekStartDate) continue;
      
      // Parse the class schedule JSON
      const scheduleData = classInfo.schedule as any;
      if (!scheduleData) continue;
      
      // Handle different schedule formats
      // Format 1: { variants: [{ days: ["Monday", "Wednesday"], startTime: "09:00", endTime: "12:00" }] }
      // Format 2: [{ day: "Monday", time: "09:00" }]
      // Format 3: string like "Monday, Wednesday, Friday 9:00 AM-12:00 PM"
      // Format 4: { days: ["Monday", "Wednesday"], startTime, endTime }
      
      let scheduleEntries: Array<{ day: string; startTime: string; endTime: string }> = [];
      
      if (typeof scheduleData === 'string') {
        // Format 3: String format like "Monday, Wednesday, Friday 9:00 AM-12:00 PM"
        scheduleEntries = parseScheduleString(scheduleData);
      } else if (Array.isArray(scheduleData)) {
        // Format 2: Array of { day, time }
        scheduleEntries = scheduleData.map((s: any) => ({
          day: s.day,
          startTime: s.time || s.startTime || '09:00',
          endTime: s.endTime || '10:00'
        }));
      } else if (scheduleData.variants && Array.isArray(scheduleData.variants)) {
        // Format 1: { variants: [...] }
        for (const variant of scheduleData.variants) {
          if (variant.days && Array.isArray(variant.days)) {
            for (const day of variant.days) {
              scheduleEntries.push({
                day: day,
                startTime: variant.startTime || '09:00',
                endTime: variant.endTime || '10:00'
              });
            }
          }
        }
      } else if (scheduleData.days && Array.isArray(scheduleData.days)) {
        // Format 4: { days: ["Monday", "Wednesday"], startTime, endTime }
        for (const day of scheduleData.days) {
          scheduleEntries.push({
            day: day,
            startTime: scheduleData.startTime || '09:00',
            endTime: scheduleData.endTime || '10:00'
          });
        }
      } else if (typeof scheduleData === 'object' && scheduleData.day) {
        // Single day object: { day: "Monday", startTime, endTime }
        scheduleEntries.push({
          day: scheduleData.day,
          startTime: scheduleData.startTime || scheduleData.time || '09:00',
          endTime: scheduleData.endTime || '10:00'
        });
      }
      
      // Expand each schedule entry to the specific dates in this week
      for (const entry of scheduleEntries) {
        const dayIndex = DAY_NAME_TO_INDEX[entry.day.toLowerCase()];
        if (dayIndex === undefined) continue;
        
        const entryDate = new Date(weekStartObj);
        entryDate.setDate(entryDate.getDate() + dayIndex);
        const calculatedDate = entryDate.toISOString().split('T')[0];
        
        // Skip if outside class date range
        if (classStartDate && calculatedDate < classStartDate) continue;
        if (classEndDate && calculatedDate > classEndDate) continue;
        
        classSchedules.push({
          id: assignmentId,
          type: 'class',
          assignmentId: assignmentId,
          educatorId: userId,
          classId: classInfo.id,
          className: classInfo.title || 'Unknown Class',
          classLocation: classInfo.location,
          classStartDate: classStartDate,
          classEndDate: classEndDate,
          scheduleType: 'recurring',
          dayOfWeek: dayIndex,
          startTime: entry.startTime,
          endTime: entry.endTime,
          calculatedDate: calculatedDate,
          isActive: true
        });
      }
    }

    // 3. Get educator schedules from the educator_schedules table (if any explicit overrides)
    const explicitSchedules = await storage.getEducatorSchedulesForWeek(userId, weekStartDate);
    for (const schedule of explicitSchedules) {
      const classInfo = await storage.getClassById(schedule.classId);
      const baseSchedule = {
        ...schedule,
        type: 'class',
        className: classInfo?.title || 'Unknown Class',
        classLocation: classInfo?.location,
        classStartDate: classInfo?.startDate ? new Date(classInfo.startDate).toISOString().split('T')[0] : null,
        classEndDate: classInfo?.endDate ? new Date(classInfo.endDate).toISOString().split('T')[0] : null
      };

      if (schedule.scheduleType === 'recurring' && schedule.dayOfWeek !== null) {
        const scheduleDate = new Date(weekStartObj);
        scheduleDate.setDate(scheduleDate.getDate() + schedule.dayOfWeek);
        classSchedules.push({
          ...baseSchedule,
          calculatedDate: scheduleDate.toISOString().split('T')[0]
        });
      } else if (schedule.scheduleType === 'one_time' && schedule.scheduledDate) {
        classSchedules.push({
          ...baseSchedule,
          calculatedDate: schedule.scheduledDate
        });
      }
    }

    // 4. Get events and holidays for all schools the educator is assigned to
    const events: any[] = [];
    const holidays: any[] = [];
    
    for (const schoolId of schoolIds) {
      const weekStartAsDate = new Date(weekStartDate + 'T00:00:00');
      const weekEndAsDate = new Date(weekEndDate + 'T23:59:59');
      
      const schoolEvents = await storage.getEventsBySchoolAndDateRange(schoolId, weekStartAsDate, weekEndAsDate);
      
      for (const event of schoolEvents) {
        const eventDate = new Date(event.startDate).toISOString().split('T')[0];
        const eventEntry = {
          id: event.id,
          type: event.eventType === 'holiday' ? 'holiday' : 'event',
          title: event.title,
          description: event.description,
          location: event.location,
          startDate: event.startDate,
          endDate: event.endDate,
          isAllDay: event.isAllDay,
          eventType: event.eventType,
          color: event.color,
          calculatedDate: eventDate,
          schoolId: schoolId
        };
        
        if (event.eventType === 'holiday') {
          holidays.push(eventEntry);
        } else {
          events.push(eventEntry);
        }
      }
    }

    // 5. Combine and return all data
    res.json({
      weekStart: weekStartDate,
      weekEnd: weekEndDate,
      schedules: classSchedules,
      events: events,
      holidays: holidays
    });
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching week schedules:', error);
    res.status(500).json({ error: 'Failed to fetch week schedules' });
  }
});

// GET /api/educator/my-hours - Get logged hours summary
router.get('/my-hours', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const { startDate, endDate } = req.query;
    
    // Default to current week if no dates provided
    const today = new Date();
    const defaultStart = getWeekStartDate(today);
    const defaultEnd = new Date(defaultStart);
    defaultEnd.setDate(defaultEnd.getDate() + 6);
    
    const start = startDate as string || defaultStart;
    const end = endDate as string || defaultEnd.toISOString().split('T')[0];

    console.log('[EducatorDashboard] Fetching hours for educator:', userId, 'from', start, 'to', end);

    // Get all sessions for the educator
    const allSessions = await storage.getClassSessionsByEducatorId(userId);
    
    // Filter by date range
    const sessionsInRange = allSessions.filter((session: ClassSession) => {
      return session.scheduledDate >= start && session.scheduledDate <= end;
    });

    // Calculate hours from actual sessions
    let totalSessionScheduledMinutes = 0;
    let totalActualMinutes = 0;
    const sessionsByDate: Record<string, any[]> = {};

    for (const session of sessionsInRange) {
      // Get class info
      const classInfo = await storage.getClassById(session.classId);
      
      // Calculate scheduled duration
      const scheduledStart = parseTimeToMinutes(session.scheduledStartTime);
      const scheduledEnd = parseTimeToMinutes(session.scheduledEndTime);
      const scheduledDuration = scheduledEnd - scheduledStart;
      totalSessionScheduledMinutes += scheduledDuration;

      // Calculate actual duration if completed
      let actualDuration = 0;
      if (session.actualStartTime && session.actualEndTime) {
        const actualStart = new Date(session.actualStartTime).getTime();
        const actualEnd = new Date(session.actualEndTime).getTime();
        actualDuration = Math.round((actualEnd - actualStart) / (1000 * 60));
        totalActualMinutes += actualDuration;
      }

      const sessionData = {
        id: session.id,
        classId: session.classId,
        className: classInfo?.title || 'Unknown Class',
        status: session.status,
        scheduledStartTime: session.scheduledStartTime,
        scheduledEndTime: session.scheduledEndTime,
        actualStartTime: session.actualStartTime,
        actualEndTime: session.actualEndTime,
        scheduledMinutes: scheduledDuration,
        actualMinutes: actualDuration,
        notes: session.notes
      };

      if (!sessionsByDate[session.scheduledDate]) {
        sessionsByDate[session.scheduledDate] = [];
      }
      sessionsByDate[session.scheduledDate].push(sessionData);
    }

    // Calculate expected scheduled hours from class assignments
    let expectedScheduledMinutes = 0;
    const assignedClasses: any[] = [];
    
    // Get educator's class assignments
    const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
    
    // Day name to number mapping (Sunday = 0)
    const dayNameToNumber: Record<string, number> = {
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
      'thursday': 4, 'friday': 5, 'saturday': 6
    };

    for (const assignment of assignments) {
      // Check if assignment is valid for the date range
      if (assignment.validFrom && assignment.validFrom > end) continue;
      if (assignment.validTo && assignment.validTo < start) continue;

      const classInfo = await storage.getClassById(assignment.classId);
      if (!classInfo) continue;

      // Check if class dates overlap with the date range
      const classStart = classInfo.startDate;
      const classEnd = classInfo.endDate;
      if (classStart && classStart > end) continue;
      if (classEnd && classEnd < start) continue;

      // Parse variants to get schedule and calculate hours
      // Variants are stored in the schedule JSON column
      const schedule = classInfo.schedule as any;
      const variants = schedule?.variants as any[];
      if (!variants || !Array.isArray(variants)) continue;

      let classMinutes = 0;
      const classDays: string[] = [];

      for (const variant of variants) {
        const days = variant.days || [];
        const startTime = variant.startTime;
        const endTime = variant.endTime;

        if (!startTime || !endTime) continue;

        // Calculate duration for this variant
        const variantStart = parseTimeToMinutes(startTime);
        const variantEnd = parseTimeToMinutes(endTime);
        const duration = variantEnd - variantStart;
        
        // Skip invalid/zero durations
        if (duration <= 0) continue;

        // Count how many times each day appears in the date range
        const rangeStart = new Date(start + 'T12:00:00');
        const rangeEnd = new Date(end + 'T12:00:00');

        for (const dayName of days) {
          const dayNum = dayNameToNumber[dayName.toLowerCase()];
          if (dayNum === undefined) continue;

          classDays.push(dayName);

          // Count occurrences of this day in the range
          let current = new Date(rangeStart);
          while (current <= rangeEnd) {
            if (current.getDay() === dayNum) {
              // Check if this date is within class start/end dates
              const currentStr = current.toISOString().split('T')[0];
              const inClassRange = (!classStart || currentStr >= classStart) && 
                                   (!classEnd || currentStr <= classEnd);
              const inAssignmentRange = (!assignment.validFrom || currentStr >= assignment.validFrom) &&
                                        (!assignment.validTo || currentStr <= assignment.validTo);
              
              if (inClassRange && inAssignmentRange) {
                classMinutes += duration;
                expectedScheduledMinutes += duration;
              }
            }
            current.setDate(current.getDate() + 1);
          }
        }
      }

      if (classMinutes > 0) {
        assignedClasses.push({
          classId: classInfo.id,
          className: classInfo.title,
          isPrimary: assignment.isPrimary,
          days: [...new Set(classDays)],
          scheduledMinutes: classMinutes,
          scheduledHours: Math.round(classMinutes / 60 * 10) / 10
        });
      }
    }

    // Sort sessions by date
    const sortedDates = Object.keys(sessionsByDate).sort();
    const sessionsList = sortedDates.map(date => ({
      date,
      sessions: sessionsByDate[date]
    }));

    res.json({
      startDate: start,
      endDate: end,
      summary: {
        totalScheduledMinutes: totalSessionScheduledMinutes,
        totalScheduledHours: Math.round(totalSessionScheduledMinutes / 60 * 10) / 10,
        totalActualMinutes,
        totalActualHours: Math.round(totalActualMinutes / 60 * 10) / 10,
        expectedScheduledMinutes,
        expectedScheduledHours: Math.round(expectedScheduledMinutes / 60 * 10) / 10,
        completedSessions: sessionsInRange.filter((s: ClassSession) => s.status === 'completed').length,
        cancelledSessions: sessionsInRange.filter((s: ClassSession) => s.status === 'cancelled').length,
        totalSessions: sessionsInRange.length
      },
      sessionsByDate: sessionsList,
      assignedClasses
    });
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching hours:', error);
    res.status(500).json({ error: 'Failed to fetch hours' });
  }
});

// ==================== ATTENDANCE ENDPOINTS (Phase 2) ====================

// Schema for attendance status validation
const attendanceStatusSchema = z.enum(['present', 'absent', 'late', 'excused']);

// Time format validation (HH:MM or HH:MM:SS)
const timeStringSchema = z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, {
  message: 'Time must be in HH:MM or HH:MM:SS format'
});

// Notes length limit (prevent excessively long notes)
const notesSchema = z.string().max(500, { message: 'Notes must be 500 characters or less' });

const createAttendanceSchema = z.object({
  sessionId: z.number().int().positive(),
  childId: z.number().int().positive(),
  status: attendanceStatusSchema,
  checkInTime: timeStringSchema.optional(),
  checkOutTime: timeStringSchema.optional(),
  notes: notesSchema.optional()
});

const updateAttendanceSchema = z.object({
  status: attendanceStatusSchema.optional(),
  checkInTime: timeStringSchema.nullable().optional(),
  checkOutTime: timeStringSchema.nullable().optional(),
  notes: notesSchema.nullable().optional()
});

const bulkAttendanceSchema = z.object({
  sessionId: z.number().int().positive(),
  attendance: z.array(z.object({
    childId: z.number().int().positive(),
    status: attendanceStatusSchema,
    checkInTime: timeStringSchema.optional(),
    checkOutTime: timeStringSchema.optional(),
    notes: notesSchema.optional()
  }))
});

// Helper function to verify educator assignment for a class with validity check
async function verifyEducatorAssignment(userId: number, classId: number, schoolId: number): Promise<boolean> {
  const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
  const today = new Date().toISOString().split('T')[0];
  
  return assignments.some(a => 
    a.classId === classId && 
    a.schoolId === schoolId &&
    (!a.validFrom || a.validFrom <= today) &&
    (!a.validTo || a.validTo >= today)
  );
}

// GET /api/educator/sessions/:sessionId/attendance - Get attendance for a session
router.get('/sessions/:sessionId/attendance', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const sessionId = parseInt(req.params.sessionId);
    if (isNaN(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    // Verify the session exists
    const session = await storage.getClassSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify educator has a valid assignment for this class (checks school, validity dates)
    const hasValidAssignment = await verifyEducatorAssignment(userId, session.classId, session.schoolId);
    
    // Must be either the session educator OR have a valid assignment for this class
    if (session.educatorId !== userId && !hasValidAssignment) {
      return res.status(403).json({ error: 'Not authorized to view this session\'s attendance' });
    }

    const attendance = await storage.getAttendanceBySessionId(sessionId);
    
    // Enrich with child names
    const attendanceWithChildren = await Promise.all(
      attendance.map(async (record: SessionAttendance) => {
        const child = await storage.getChildById(record.childId);
        return {
          ...record,
          childName: child ? `${child.firstName} ${child.lastName}` : 'Unknown',
          childFirstName: child?.firstName,
          childLastName: child?.lastName
        };
      })
    );

    console.log(`[Attendance] Retrieved ${attendanceWithChildren.length} attendance records for session ${sessionId}`);
    res.json(attendanceWithChildren);
  } catch (error) {
    console.error('[Attendance] Error fetching attendance:', error);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// GET /api/educator/sessions/:sessionId/roster - Get students enrolled in the class for attendance
router.get('/sessions/:sessionId/roster', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const sessionId = parseInt(req.params.sessionId);
    if (isNaN(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    // Verify the session exists
    const session = await storage.getClassSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify educator has a valid assignment for this class (checks school, validity dates)
    const hasValidAssignment = await verifyEducatorAssignment(userId, session.classId, session.schoolId);
    
    // Must be either the session educator OR have a valid assignment for this class
    if (session.educatorId !== userId && !hasValidAssignment) {
      return res.status(403).json({ error: 'Not authorized to view this class roster' });
    }

    // Get enrollments for this class
    const enrollments = await storage.getEnrollmentsByClassId(session.classId);
    const activeEnrollments = enrollments.filter(e => e.status === 'active');

    // Get existing attendance for this session
    const existingAttendance = await storage.getAttendanceBySessionId(sessionId);
    const attendanceMap = new Map(existingAttendance.map(a => [a.childId, a]));

    // Build roster with attendance status
    const roster = await Promise.all(
      activeEnrollments.map(async (enrollment) => {
        const child = await storage.getChildById(enrollment.childId);
        const attendance = attendanceMap.get(enrollment.childId);
        return {
          childId: enrollment.childId,
          childName: child ? `${child.firstName} ${child.lastName}` : 'Unknown',
          childFirstName: child?.firstName,
          childLastName: child?.lastName,
          enrollmentId: enrollment.id,
          attendance: attendance ? {
            id: attendance.id,
            status: attendance.status,
            checkInTime: attendance.checkInTime,
            checkOutTime: attendance.checkOutTime,
            notes: attendance.notes
          } : null
        };
      })
    );

    console.log(`[Attendance] Roster for session ${sessionId}: ${roster.length} students`);
    res.json(roster);
  } catch (error) {
    console.error('[Attendance] Error fetching roster:', error);
    res.status(500).json({ error: 'Failed to fetch roster' });
  }
});

// POST /api/educator/attendance - Create a single attendance record
router.post('/attendance', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const parseResult = createAttendanceSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid request data', details: parseResult.error.errors });
    }

    const { sessionId, childId, status, checkInTime, checkOutTime, notes } = parseResult.data;

    // Verify the session exists
    const session = await storage.getClassSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify educator has a valid assignment for this class (checks school, validity dates)
    const hasValidAssignment = await verifyEducatorAssignment(userId, session.classId, session.schoolId);
    
    if (session.educatorId !== userId && !hasValidAssignment) {
      return res.status(403).json({ error: 'Not authorized to modify attendance for this session' });
    }

    // Verify child is enrolled in the class
    const enrollments = await storage.getEnrollmentsByClassId(session.classId);
    const childEnrolled = enrollments.some(e => e.childId === childId && e.status === 'active');
    if (!childEnrolled) {
      return res.status(400).json({ error: 'Child is not enrolled in this class' });
    }

    const attendanceData: InsertSessionAttendance = {
      sessionId,
      childId,
      schoolId: session.schoolId,
      status,
      recordedById: userId,
      checkInTime: checkInTime || null,
      checkOutTime: checkOutTime || null,
      notes: notes || null
    };

    // Use upsert to handle duplicate submissions gracefully
    const record = await storage.upsertAttendance(attendanceData);

    // Create audit log
    await storage.createAuditLog({
      action: 'attendance_recorded',
      targetType: 'session_attendance',
      targetId: record.id,
      actorId: userId,
      schoolId: session.schoolId,
      metadata: { sessionId, childId, status, classId: session.classId },
      severity: 'info'
    });

    console.log(`[Attendance] Created/updated attendance for child ${childId} in session ${sessionId}: ${status}`);
    res.status(201).json(record);
  } catch (error) {
    console.error('[Attendance] Error creating attendance:', error);
    res.status(500).json({ error: 'Failed to create attendance record' });
  }
});

// POST /api/educator/attendance/bulk - Create/update multiple attendance records at once
router.post('/attendance/bulk', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const parseResult = bulkAttendanceSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid request data', details: parseResult.error.errors });
    }

    const { sessionId, attendance } = parseResult.data;

    // Verify the session exists
    const session = await storage.getClassSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify educator has a valid assignment for this class (checks school, validity dates)
    const hasValidAssignment = await verifyEducatorAssignment(userId, session.classId, session.schoolId);
    
    if (session.educatorId !== userId && !hasValidAssignment) {
      return res.status(403).json({ error: 'Not authorized to modify attendance for this session' });
    }

    // Process all attendance records sequentially to maintain consistency
    const results: SessionAttendance[] = [];
    const errors: Array<{ childId: number; error: string }> = [];
    
    for (const item of attendance) {
      try {
        const attendanceData: InsertSessionAttendance = {
          sessionId,
          childId: item.childId,
          schoolId: session.schoolId,
          status: item.status,
          recordedById: userId,
          checkInTime: item.checkInTime || null,
          checkOutTime: item.checkOutTime || null,
          notes: item.notes || null
        };

        const record = await storage.upsertAttendance(attendanceData);
        results.push(record);
      } catch (itemError) {
        console.error(`[Attendance] Error processing child ${item.childId}:`, itemError);
        errors.push({ childId: item.childId, error: 'Failed to record attendance' });
      }
    }

    // Create audit log for bulk operation
    await storage.createAuditLog({
      action: 'attendance_bulk_recorded',
      targetType: 'class_session',
      targetId: sessionId,
      actorId: userId,
      schoolId: session.schoolId,
      metadata: { 
        sessionId, 
        classId: session.classId,
        successCount: results.length,
        errorCount: errors.length,
        statuses: attendance.map(a => ({ childId: a.childId, status: a.status }))
      },
      severity: errors.length > 0 ? 'warning' : 'info'
    });

    console.log(`[Attendance] Bulk recorded ${results.length} attendance records for session ${sessionId}`);
    
    // Return results with any errors
    if (errors.length > 0) {
      return res.status(207).json({ results, errors }); // 207 Multi-Status
    }
    res.status(201).json(results);
  } catch (error) {
    console.error('[Attendance] Error creating bulk attendance:', error);
    res.status(500).json({ error: 'Failed to create attendance records' });
  }
});

// PATCH /api/educator/attendance/:id - Update an attendance record
router.patch('/attendance/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const attendanceId = parseInt(req.params.id);
    if (isNaN(attendanceId)) {
      return res.status(400).json({ error: 'Invalid attendance ID' });
    }

    const parseResult = updateAttendanceSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid request data', details: parseResult.error.errors });
    }

    // Get educator's class assignments to determine which schools/classes they can access
    const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
    if (assignments.length === 0) {
      return res.status(403).json({ error: 'No class assignments found' });
    }

    // Get sessions for educator's assigned classes to find the attendance record
    const assignedClassIds = assignments.map(a => a.classId);
    let existingRecord: SessionAttendance | undefined;
    let session;

    // Look up attendance by checking sessions the educator has access to
    for (const classId of assignedClassIds) {
      const sessions = await storage.getClassSessionsByClassId(classId);
      for (const sess of sessions) {
        const attendance = await storage.getAttendanceBySessionId(sess.id);
        const found = attendance.find(a => a.id === attendanceId);
        if (found) {
          existingRecord = found;
          session = sess;
          break;
        }
      }
      if (existingRecord) break;
    }

    if (!existingRecord || !session) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    // Verify educator has a valid assignment for this class (checks school, validity dates)
    const hasValidAssignment = await verifyEducatorAssignment(userId, session.classId, session.schoolId);
    
    if (session.educatorId !== userId && !hasValidAssignment) {
      return res.status(403).json({ error: 'Not authorized to modify this attendance record' });
    }

    const updateData: Partial<InsertSessionAttendance> = {};
    if (parseResult.data.status !== undefined) updateData.status = parseResult.data.status;
    if (parseResult.data.checkInTime !== undefined) updateData.checkInTime = parseResult.data.checkInTime;
    if (parseResult.data.checkOutTime !== undefined) updateData.checkOutTime = parseResult.data.checkOutTime;
    if (parseResult.data.notes !== undefined) updateData.notes = parseResult.data.notes;

    const updated = await storage.updateAttendance(attendanceId, updateData);

    // Create audit log
    await storage.createAuditLog({
      action: 'attendance_updated',
      targetType: 'session_attendance',
      targetId: attendanceId,
      actorId: userId,
      schoolId: session.schoolId,
      metadata: { changes: updateData, sessionId: session.id, classId: session.classId },
      severity: 'info'
    });

    console.log(`[Attendance] Updated attendance record ${attendanceId}`);
    res.json(updated);
  } catch (error) {
    console.error('[Attendance] Error updating attendance:', error);
    res.status(500).json({ error: 'Failed to update attendance record' });
  }
});

// DELETE /api/educator/attendance/:id - Delete an attendance record
router.delete('/attendance/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const attendanceId = parseInt(req.params.id);
    if (isNaN(attendanceId)) {
      return res.status(400).json({ error: 'Invalid attendance ID' });
    }

    // Get educator's class assignments to determine which schools/classes they can access
    const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
    if (assignments.length === 0) {
      return res.status(403).json({ error: 'No class assignments found' });
    }

    // Get sessions for educator's assigned classes to find the attendance record
    const assignedClassIds = assignments.map(a => a.classId);
    let existingRecord: SessionAttendance | undefined;
    let session;

    // Look up attendance by checking sessions the educator has access to
    for (const classId of assignedClassIds) {
      const sessions = await storage.getClassSessionsByClassId(classId);
      for (const sess of sessions) {
        const attendance = await storage.getAttendanceBySessionId(sess.id);
        const found = attendance.find(a => a.id === attendanceId);
        if (found) {
          existingRecord = found;
          session = sess;
          break;
        }
      }
      if (existingRecord) break;
    }

    if (!existingRecord || !session) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    // Verify educator has a valid assignment for this class (checks school, validity dates)
    const hasValidAssignment = await verifyEducatorAssignment(userId, session.classId, session.schoolId);
    
    if (session.educatorId !== userId && !hasValidAssignment) {
      return res.status(403).json({ error: 'Not authorized to delete this attendance record' });
    }

    await storage.deleteAttendance(attendanceId);

    // Create audit log
    await storage.createAuditLog({
      action: 'attendance_deleted',
      targetType: 'session_attendance',
      targetId: attendanceId,
      actorId: userId,
      schoolId: session.schoolId,
      metadata: { childId: existingRecord.childId, status: existingRecord.status, sessionId: session.id, classId: session.classId },
      severity: 'warning'
    });

    console.log(`[Attendance] Deleted attendance record ${attendanceId}`);
    res.status(204).send();
  } catch (error) {
    console.error('[Attendance] Error deleting attendance:', error);
    res.status(500).json({ error: 'Failed to delete attendance record' });
  }
});

// GET /api/educator/children/:childId/attendance - Get attendance history for a child
router.get('/children/:childId/attendance', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const childId = parseInt(req.params.childId);
    if (isNaN(childId)) {
      return res.status(400).json({ error: 'Invalid child ID' });
    }

    // Verify the educator teaches this child (has an assignment for a class the child is enrolled in)
    const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
    const classIds = assignments.map(a => a.classId);
    
    // Get child's enrollments
    const child = await storage.getChildById(childId);
    if (!child) {
      return res.status(404).json({ error: 'Child not found' });
    }

    // Check if child is in any of educator's classes
    let isTeachingChild = false;
    for (const classId of classIds) {
      const enrollments = await storage.getEnrollmentsByClassId(classId);
      if (enrollments.some(e => e.childId === childId && e.status === 'active')) {
        isTeachingChild = true;
        break;
      }
    }

    if (!isTeachingChild) {
      return res.status(403).json({ error: 'Not authorized to view this child\'s attendance' });
    }

    const attendance = await storage.getAttendanceByChildId(childId);

    // Enrich with session and class info
    const attendanceWithDetails = await Promise.all(
      attendance.map(async (record: SessionAttendance) => {
        const session = await storage.getClassSessionById(record.sessionId);
        const classInfo = session ? await storage.getClassById(session.classId) : null;
        return {
          ...record,
          sessionDate: session?.scheduledDate,
          className: classInfo?.title || 'Unknown'
        };
      })
    );

    console.log(`[Attendance] Retrieved ${attendanceWithDetails.length} attendance records for child ${childId}`);
    res.json(attendanceWithDetails);
  } catch (error) {
    console.error('[Attendance] Error fetching child attendance:', error);
    res.status(500).json({ error: 'Failed to fetch attendance history' });
  }
});

// ==================== END ATTENDANCE ENDPOINTS ====================

// Helper function to get week start date (Monday)
function getWeekStartDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

// Helper function to parse time string to minutes
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

// ==================== VOLUNTEER WAIVER ENDPOINTS ====================

// GET /api/educator/waivers/check - Check if current user has signed a specific waiver
// Security: Users can only check their own waiver status
router.get('/waivers/check', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const documentIdParam = req.query.documentId as string;

    if (!documentIdParam) {
      return res.status(400).json({ error: 'Missing documentId' });
    }

    const documentId = parseInt(documentIdParam);

    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid documentId' });
    }

    // Verify the document exists
    const document = await storage.getSchoolDocumentById(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    console.log(`[Waiver] Checking waiver for user ${userId} and document ${documentId}`);

    // Check for an active signed waiver (user checks their own status)
    const signedWaiver = await storage.getActiveSignedWaiver(userId, documentId);

    if (signedWaiver) {
      res.json({
        signed: true,
        signedAt: signedWaiver.signedAt,
        expiresAt: signedWaiver.expiresAt
      });
    } else {
      res.json({
        signed: false
      });
    }
  } catch (error) {
    console.error('[Waiver] Error checking waiver status:', error);
    res.status(500).json({ error: 'Failed to check waiver status' });
  }
});

// GET /api/educator/waivers/check-volunteer - Check if a volunteer has signed a specific waiver (for session start)
// Security: Educator must have assignments in the school where the document belongs
router.get('/waivers/check-volunteer', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const volunteerIdParam = req.query.volunteerId as string;
    const documentIdParam = req.query.documentId as string;

    if (!volunteerIdParam || !documentIdParam) {
      return res.status(400).json({ error: 'Missing volunteerId or documentId' });
    }

    const volunteerId = parseInt(volunteerIdParam);
    const documentId = parseInt(documentIdParam);

    if (isNaN(volunteerId) || isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid volunteerId or documentId' });
    }

    // Verify the document exists and get its school
    const document = await storage.getSchoolDocumentById(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const schoolId = document.schoolId;

    // Verify educator has assignments in this school
    const educatorAssignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);
    const hasSchoolAccess = educatorAssignments.some(a => a.schoolId === schoolId);
    
    if (!hasSchoolAccess) {
      return res.status(403).json({ error: 'Not authorized to check waivers for this school' });
    }

    // Verify the volunteer has a role in this school
    const volunteerRoles = await storage.getUserRolesByUserId(volunteerId);
    const volunteerHasSchoolRole = volunteerRoles?.some(r => r.schoolId === schoolId);
    
    if (!volunteerHasSchoolRole) {
      return res.status(403).json({ error: 'Volunteer is not associated with this school' });
    }

    console.log(`[Waiver] Educator ${userId} checking waiver for volunteer ${volunteerId} and document ${documentId}`);

    // Check for an active signed waiver
    const signedWaiver = await storage.getActiveSignedWaiver(volunteerId, documentId);

    if (signedWaiver) {
      res.json({
        signed: true,
        signedAt: signedWaiver.signedAt,
        expiresAt: signedWaiver.expiresAt
      });
    } else {
      res.json({
        signed: false
      });
    }
  } catch (error) {
    console.error('[Waiver] Error checking volunteer waiver status:', error);
    res.status(500).json({ error: 'Failed to check waiver status' });
  }
});

// POST /api/educator/waivers/sign - Sign a waiver
// Security: User can only sign waivers for themselves, schoolId derived from document
router.post('/waivers/sign', async (req, res) => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const { documentId, signatureData } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: 'Missing required field: documentId' });
    }

    // Users can only sign waivers for themselves
    const volunteerId = currentUserId;

    console.log(`[Waiver] Signing waiver for volunteer ${volunteerId}, document ${documentId}`);

    // Verify the document exists - derive schoolId from document (authoritative source)
    const document = await storage.getSchoolDocumentById(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const schoolId = document.schoolId;

    // Verify the document is a waiver/form/policy type
    if (!['form', 'policy', 'waiver'].includes(document.category || '')) {
      return res.status(400).json({ error: 'Document is not a signable waiver' });
    }

    // Verify user has a role in this school (they should be associated with the school to volunteer)
    const userRoles = await storage.getUserRolesByUserId(currentUserId);
    const hasSchoolRole = userRoles?.some(r => r.schoolId === schoolId);
    
    if (!hasSchoolRole) {
      return res.status(403).json({ error: 'You are not associated with this school' });
    }

    // Check if waiver is already signed
    const existingWaiver = await storage.getActiveSignedWaiver(volunteerId, documentId);
    if (existingWaiver) {
      return res.status(400).json({ error: 'Waiver already signed and active', waiver: existingWaiver });
    }

    // Calculate expiration (1 year from now)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    // Create the signed waiver record
    const signedWaiver = await storage.createSignedWaiver({
      userId: volunteerId,
      documentId,
      schoolId,
      signedAt: new Date(),
      expiresAt,
      signatureData: signatureData || null,
      ipAddress: req.ip || null
    });

    console.log(`[Waiver] Waiver signed successfully, ID: ${signedWaiver.id}`);

    res.status(201).json({
      success: true,
      waiver: signedWaiver
    });
  } catch (error) {
    console.error('[Waiver] Error signing waiver:', error);
    res.status(500).json({ error: 'Failed to sign waiver' });
  }
});

// GET /api/educator/documents/:id - Get a specific school document (for waiver display)
router.get('/documents/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const documentId = parseInt(req.params.id);
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const document = await storage.getSchoolDocumentById(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    console.error('[Document] Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// ==================== END VOLUNTEER WAIVER ENDPOINTS ====================

export default router;
