import express from "express";
import { storage } from "../storage";
import { supabaseAuth, requireEducatorRole } from "../middleware/supabase-auth";
import { z } from "zod";
import type { InsertClassSession, ClassSession, EducatorClassAssignment } from "@shared/schema";

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
          classSchedule: classInfo?.schedule,
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
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    console.log('[EducatorDashboard] Fetching my classes for user:', userId);

    const assignments = await storage.getEducatorClassAssignmentsByEducatorId(userId);

    // Enrich with class details
    const classesWithDetails = await Promise.all(
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
          classSchedule: classInfo?.schedule,
          classLocation: classInfo?.location,
          capacity: classInfo?.capacity,
          enrollmentCount,
          schoolId: assignment.schoolId
        };
      })
    );

    res.json(classesWithDetails);
  } catch (error) {
    console.error('[EducatorDashboard] Error fetching my classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
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
    const allDailyFlowEntries = await storage.getAllDailyFlowEntries();
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
        classSchedule: classInfo?.schedule,
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

export default router;
