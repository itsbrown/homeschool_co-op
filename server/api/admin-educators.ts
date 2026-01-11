import express from "express";
import { storage } from "../storage";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireSchoolContext } from "../middleware/require-school-context";
import { z } from "zod";
import type { InsertEducatorSchedule, InsertAuditLog } from "@shared/schema";

const router = express.Router();

router.use(supabaseAuth);
router.use(requireSchoolContext);

// ============================================
// Admin Educator Schedule Management (Phase 1b)
// ============================================

// GET /api/admin/educators - Get all educators for a school
router.get('/', async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    if (!schoolId) {
      return res.status(400).json({ error: 'School context required' });
    }

    console.log('[AdminEducators] Fetching educators for school:', schoolId);

    // Get all educator assignments for the school
    const assignments = await storage.getEducatorClassAssignmentsBySchoolId(parseInt(schoolId));

    // Get unique educator IDs
    const educatorIds = [...new Set(assignments.map(a => a.educatorId))];

    // Get educator details and their assignments
    const educators = await Promise.all(
      educatorIds.map(async (educatorId) => {
        const user = await storage.getUser(educatorId);
        const educatorAssignments = assignments.filter(a => a.educatorId === educatorId);
        
        // Get class details for each assignment
        const classesWithDetails = await Promise.all(
          educatorAssignments.map(async (assignment) => {
            const classInfo = await storage.getClassById(assignment.classId);
            return {
              assignmentId: assignment.id,
              classId: assignment.classId,
              className: classInfo?.title || 'Unknown Class',
              isPrimary: assignment.isPrimary,
              canStartSession: assignment.canStartSession,
              validFrom: assignment.validFrom,
              validTo: assignment.validTo
            };
          })
        );

        return {
          id: educatorId,
          name: user?.name || 'Unknown',
          email: user?.email || 'Unknown',
          classes: classesWithDetails,
          totalAssignments: classesWithDetails.length
        };
      })
    );

    res.json(educators);
  } catch (error) {
    console.error('[AdminEducators] Error fetching educators:', error);
    res.status(500).json({ error: 'Failed to fetch educators' });
  }
});

// GET /api/admin/educators/:educatorId - Get single educator details with schedules
router.get('/:educatorId', async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const educatorId = parseInt(req.params.educatorId);
    
    if (!schoolId) {
      return res.status(400).json({ error: 'School context required' });
    }

    console.log('[AdminEducators] Fetching educator details:', educatorId);

    // Get educator user info
    const user = await storage.getUser(educatorId);
    if (!user) {
      return res.status(404).json({ error: 'Educator not found' });
    }

    // Get assignments for this educator in this school
    const allAssignments = await storage.getEducatorClassAssignmentsByEducatorId(educatorId);
    const schoolAssignments = allAssignments.filter(a => a.schoolId === parseInt(schoolId));

    if (schoolAssignments.length === 0) {
      return res.status(404).json({ error: 'Educator not found in this school' });
    }

    // Get schedules for this educator
    const schedules = await storage.getEducatorSchedulesByEducatorId(educatorId);
    const schoolSchedules = schedules.filter(s => s.schoolId === parseInt(schoolId));

    // Get class details for assignments
    const classesWithDetails = await Promise.all(
      schoolAssignments.map(async (assignment) => {
        const classInfo = await storage.getClassById(assignment.classId);
        const classSchedules = schoolSchedules.filter(s => s.assignmentId === assignment.id);
        
        return {
          assignmentId: assignment.id,
          classId: assignment.classId,
          className: classInfo?.title || 'Unknown Class',
          classLocation: classInfo?.location,
          isPrimary: assignment.isPrimary,
          canStartSession: assignment.canStartSession,
          validFrom: assignment.validFrom,
          validTo: assignment.validTo,
          schedules: classSchedules
        };
      })
    );

    // Get recent sessions for hours worked
    const sessions = await storage.getClassSessionsByEducatorId(educatorId);
    const recentSessions = sessions.slice(0, 20);

    res.json({
      id: educatorId,
      name: user.name,
      email: user.email,
      classes: classesWithDetails,
      totalSchedules: schoolSchedules.length,
      recentSessions
    });
  } catch (error) {
    console.error('[AdminEducators] Error fetching educator details:', error);
    res.status(500).json({ error: 'Failed to fetch educator details' });
  }
});

// POST /api/admin/educators/schedules - Create a new schedule for an educator
const createScheduleSchema = z.object({
  assignmentId: z.number(),
  educatorId: z.number(),
  classId: z.number(),
  scheduleType: z.enum(['recurring', 'one_time', 'adhoc']).default('recurring'),
  dayOfWeek: z.number().min(0).max(6).optional(),
  scheduledDate: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().optional(),
  timezone: z.string().default('America/New_York'),
  notes: z.string().optional()
});

router.post('/schedules', async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const actorId = req.user?.id;
    
    if (!schoolId) {
      return res.status(400).json({ error: 'School context required' });
    }

    console.log('[AdminEducators] Creating schedule:', req.body);

    const validatedData = createScheduleSchema.parse(req.body);

    // Verify assignment exists and belongs to this school
    const assignment = await storage.getEducatorClassAssignmentById(validatedData.assignmentId);
    if (!assignment || assignment.schoolId !== parseInt(schoolId)) {
      return res.status(404).json({ error: 'Assignment not found in this school' });
    }

    // Create schedule
    const scheduleData: InsertEducatorSchedule = {
      assignmentId: validatedData.assignmentId,
      educatorId: validatedData.educatorId,
      classId: validatedData.classId,
      schoolId: parseInt(schoolId),
      scheduleType: validatedData.scheduleType,
      dayOfWeek: validatedData.dayOfWeek,
      scheduledDate: validatedData.scheduledDate,
      startTime: validatedData.startTime,
      endTime: validatedData.endTime,
      effectiveFrom: validatedData.effectiveFrom,
      effectiveTo: validatedData.effectiveTo,
      timezone: validatedData.timezone,
      notes: validatedData.notes,
      isActive: true
    };

    const schedule = await storage.createEducatorSchedule(scheduleData);

    // Create audit log
    const auditLog: InsertAuditLog = {
      actionType: 'educator_schedule_created',
      severity: 'info',
      actorId: actorId,
      actorRole: 'admin',
      actorEmail: req.user?.email,
      targetType: 'educator_schedule',
      targetId: String(schedule.id),
      schoolId: parseInt(schoolId),
      metadata: {
        context: 'Admin created educator schedule',
        after: scheduleData
      }
    };
    await storage.createAuditLog(auditLog);

    console.log('[AdminEducators] Schedule created:', schedule.id);
    res.status(201).json(schedule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid schedule data',
        details: error.errors
      });
    }
    console.error('[AdminEducators] Error creating schedule:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// PUT /api/admin/educators/schedules/:id - Update a schedule
router.put('/schedules/:id', async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const actorId = req.user?.id;
    const scheduleId = parseInt(req.params.id);
    
    if (!schoolId) {
      return res.status(400).json({ error: 'School context required' });
    }

    console.log('[AdminEducators] Updating schedule:', scheduleId, req.body);

    // Get existing schedule
    const existingSchedule = await storage.getEducatorScheduleById(scheduleId);
    if (!existingSchedule || existingSchedule.schoolId !== parseInt(schoolId)) {
      return res.status(404).json({ error: 'Schedule not found in this school' });
    }

    const validatedData = createScheduleSchema.partial().parse(req.body);

    const updatedSchedule = await storage.updateEducatorSchedule(scheduleId, validatedData);

    // Create audit log
    const auditLog: InsertAuditLog = {
      actionType: 'educator_schedule_updated',
      severity: 'info',
      actorId: actorId,
      actorRole: 'admin',
      actorEmail: req.user?.email,
      targetType: 'educator_schedule',
      targetId: String(scheduleId),
      schoolId: parseInt(schoolId),
      metadata: {
        context: 'Admin updated educator schedule',
        before: existingSchedule,
        after: validatedData,
        diff: Object.keys(validatedData)
      }
    };
    await storage.createAuditLog(auditLog);

    console.log('[AdminEducators] Schedule updated:', scheduleId);
    res.json(updatedSchedule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid schedule data',
        details: error.errors
      });
    }
    console.error('[AdminEducators] Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// DELETE /api/admin/educators/schedules/:id - Delete a schedule
router.delete('/schedules/:id', async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const actorId = req.user?.id;
    const scheduleId = parseInt(req.params.id);
    
    if (!schoolId) {
      return res.status(400).json({ error: 'School context required' });
    }

    console.log('[AdminEducators] Deleting schedule:', scheduleId);

    // Get existing schedule
    const existingSchedule = await storage.getEducatorScheduleById(scheduleId);
    if (!existingSchedule || existingSchedule.schoolId !== parseInt(schoolId)) {
      return res.status(404).json({ error: 'Schedule not found in this school' });
    }

    await storage.deleteEducatorSchedule(scheduleId);

    // Create audit log
    const auditLog: InsertAuditLog = {
      actionType: 'educator_schedule_deleted',
      severity: 'warn',
      actorId: actorId,
      actorRole: 'admin',
      actorEmail: req.user?.email,
      targetType: 'educator_schedule',
      targetId: String(scheduleId),
      schoolId: parseInt(schoolId),
      metadata: {
        context: 'Admin deleted educator schedule',
        before: existingSchedule
      }
    };
    await storage.createAuditLog(auditLog);

    console.log('[AdminEducators] Schedule deleted:', scheduleId);
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('[AdminEducators] Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// GET /api/admin/educators/schedules - Get all schedules for a school
router.get('/schedules', async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    
    if (!schoolId) {
      return res.status(400).json({ error: 'School context required' });
    }

    const { educatorId, classId } = req.query;

    console.log('[AdminEducators] Fetching schedules for school:', schoolId);

    let schedules = await storage.getEducatorSchedulesBySchoolId(parseInt(schoolId));

    // Apply filters
    if (educatorId) {
      schedules = schedules.filter(s => s.educatorId === parseInt(educatorId as string));
    }
    if (classId) {
      schedules = schedules.filter(s => s.classId === parseInt(classId as string));
    }

    // Enrich with class and educator details
    const schedulesWithDetails = await Promise.all(
      schedules.map(async (schedule) => {
        const classInfo = await storage.getClassById(schedule.classId);
        const educator = await storage.getUser(schedule.educatorId);
        return {
          ...schedule,
          className: classInfo?.title || 'Unknown Class',
          educatorName: educator?.name || 'Unknown Educator',
          educatorEmail: educator?.email
        };
      })
    );

    res.json(schedulesWithDetails);
  } catch (error) {
    console.error('[AdminEducators] Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// ============================================
// Class Assignment Management
// ============================================

// GET /api/admin/educators/class-assignments/:classId - Get all educator assignments for a class
router.get('/class-assignments/:classId', async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const classId = parseInt(req.params.classId);
    
    if (!schoolId) {
      return res.status(400).json({ error: 'School context required' });
    }

    console.log('[AdminEducators] Fetching assignments for class:', classId);

    // Get assignments for this class
    const assignments = await storage.getEducatorClassAssignmentsByClassId(classId);
    
    // Filter to only this school's assignments
    const schoolAssignments = assignments.filter(a => a.schoolId === parseInt(schoolId));

    // Enrich with educator details
    const assignmentsWithDetails = await Promise.all(
      schoolAssignments.map(async (assignment) => {
        const educator = await storage.getUser(assignment.educatorId);
        // Get user roles to identify position (educator, mentor, aide)
        const roles = await storage.getUserRolesByUserId(assignment.educatorId);
        const schoolRole = roles.find((r: any) => r.schoolId === parseInt(schoolId));
        
        return {
          ...assignment,
          educatorName: educator?.name || 'Unknown',
          educatorEmail: educator?.email || '',
          role: schoolRole?.role || 'educator'
        };
      })
    );

    res.json(assignmentsWithDetails);
  } catch (error) {
    console.error('[AdminEducators] Error fetching class assignments:', error);
    res.status(500).json({ error: 'Failed to fetch class assignments' });
  }
});

// POST /api/admin/educators/class-assignments - Add educator to class
router.post('/class-assignments', async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const actorId = req.user?.id;
    
    if (!schoolId) {
      return res.status(400).json({ error: 'School context required' });
    }

    const assignmentSchema = z.object({
      educatorId: z.number(),
      classId: z.number(),
      isPrimary: z.boolean().optional().default(false),
      canStartSession: z.boolean().optional().default(true),
      validFrom: z.string().nullable().optional(),
      validTo: z.string().nullable().optional()
    });

    const validatedData = assignmentSchema.parse(req.body);
    
    console.log('[AdminEducators] Creating class assignment:', validatedData);

    // Check if assignment already exists
    const existingAssignments = await storage.getEducatorClassAssignmentsByClassId(validatedData.classId);
    const alreadyAssigned = existingAssignments.some(a => 
      a.educatorId === validatedData.educatorId && 
      a.schoolId === parseInt(schoolId)
    );

    if (alreadyAssigned) {
      return res.status(400).json({ error: 'Educator is already assigned to this class' });
    }

    // If this will be the primary instructor, clear primary from any existing assignments
    if (validatedData.isPrimary) {
      const existingAssignments = await storage.getEducatorClassAssignmentsByClassId(validatedData.classId);
      for (const assignment of existingAssignments) {
        if (assignment.isPrimary) {
          await storage.updateEducatorClassAssignment(assignment.id, { isPrimary: false });
        }
      }
    }

    // Create the assignment
    const assignment = await storage.createEducatorClassAssignment({
      educatorId: validatedData.educatorId,
      classId: validatedData.classId,
      schoolId: parseInt(schoolId),
      isPrimary: validatedData.isPrimary,
      canStartSession: validatedData.canStartSession,
      validFrom: validatedData.validFrom || null,
      validTo: validatedData.validTo || null
    });

    // Get educator details (needed for instructorName sync and audit log)
    const educator = await storage.getUser(validatedData.educatorId);
    // Derive instructor display name with proper fallback order: name > firstName+lastName > email > Unknown
    const instructorName = educator?.name 
      || (educator?.firstName && educator?.lastName ? `${educator.firstName} ${educator.lastName}` : null)
      || educator?.email 
      || 'Unknown Instructor';

    // Sync class.instructorId and instructorName when primary instructor is set
    if (validatedData.isPrimary) {
      await storage.updateClass(validatedData.classId, { 
        instructorId: validatedData.educatorId,
        instructorName: instructorName
      });
      console.log('[AdminEducators] Synced class instructor to:', instructorName, '(ID:', validatedData.educatorId, ')');
    }

    // Create audit log
    const classInfo = await storage.getClassById(validatedData.classId);
    
    const auditLog: InsertAuditLog = {
      actionType: 'educator_class_assignment_created',
      severity: 'info',
      actorId: actorId,
      actorRole: 'admin',
      actorEmail: req.user?.email,
      targetType: 'educator_class_assignment',
      targetId: String(assignment.id),
      schoolId: parseInt(schoolId),
      metadata: {
        context: `Admin assigned ${educator?.name} to ${classInfo?.title}`,
        educatorId: validatedData.educatorId,
        classId: validatedData.classId,
        isPrimary: validatedData.isPrimary
      }
    };
    await storage.createAuditLog(auditLog);

    console.log('[AdminEducators] Assignment created:', assignment.id);
    res.status(201).json(assignment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid assignment data',
        details: error.errors
      });
    }
    console.error('[AdminEducators] Error creating class assignment:', error);
    res.status(500).json({ error: 'Failed to create class assignment' });
  }
});

// PATCH /api/admin/educators/class-assignments/:id - Update educator assignment (e.g., make lead instructor)
router.patch('/class-assignments/:id', async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const actorId = req.user?.id;
    const assignmentId = parseInt(req.params.id);
    
    if (!schoolId) {
      return res.status(400).json({ error: 'School context required' });
    }

    const updateSchema = z.object({
      isPrimary: z.boolean().optional(),
      canStartSession: z.boolean().optional()
    });

    const validatedData = updateSchema.parse(req.body);
    
    console.log('[AdminEducators] Updating class assignment:', assignmentId, validatedData);

    // Get existing assignment to verify school ownership
    const existingAssignment = await storage.getEducatorClassAssignmentById(assignmentId);
    if (!existingAssignment || existingAssignment.schoolId !== parseInt(schoolId)) {
      return res.status(404).json({ error: 'Assignment not found in this school' });
    }

    // If making this educator the primary, clear primary from all other assignments for this class
    if (validatedData.isPrimary) {
      const allAssignments = await storage.getEducatorClassAssignmentsByClassId(existingAssignment.classId);
      for (const assignment of allAssignments) {
        if (assignment.id !== assignmentId && assignment.isPrimary) {
          await storage.updateEducatorClassAssignment(assignment.id, { isPrimary: false });
        }
      }
    }

    // Update the assignment
    const updatedAssignment = await storage.updateEducatorClassAssignment(assignmentId, validatedData);

    // Get educator details for instructor sync and audit log
    const educator = await storage.getUser(existingAssignment.educatorId);
    // Derive instructor display name with proper fallback order: name > firstName+lastName > email > Unknown
    const instructorName = educator?.name 
      || (educator?.firstName && educator?.lastName ? `${educator.firstName} ${educator.lastName}` : null)
      || educator?.email 
      || 'Unknown Instructor';

    // Sync class.instructorId and instructorName when primary instructor is changed
    if (validatedData.isPrimary) {
      await storage.updateClass(existingAssignment.classId, { 
        instructorId: existingAssignment.educatorId,
        instructorName: instructorName
      });
      console.log('[AdminEducators] Synced class instructor to:', instructorName, '(ID:', existingAssignment.educatorId, ')');
    }

    // Get details for audit log
    const classInfo = await storage.getClassById(existingAssignment.classId);

    // Create audit log
    const auditLog: InsertAuditLog = {
      actionType: 'educator_class_assignment_updated',
      severity: 'info',
      actorId: actorId,
      actorRole: 'admin',
      actorEmail: req.user?.email,
      targetType: 'educator_class_assignment',
      targetId: String(assignmentId),
      schoolId: parseInt(schoolId),
      metadata: {
        context: `Admin updated ${educator?.name}'s assignment for ${classInfo?.title}`,
        before: existingAssignment,
        after: validatedData
      }
    };
    await storage.createAuditLog(auditLog);

    console.log('[AdminEducators] Assignment updated:', assignmentId);
    res.json(updatedAssignment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid update data',
        details: error.errors
      });
    }
    console.error('[AdminEducators] Error updating class assignment:', error);
    res.status(500).json({ error: 'Failed to update class assignment' });
  }
});

// DELETE /api/admin/educators/class-assignments/:id - Remove educator from class
router.delete('/class-assignments/:id', async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const actorId = req.user?.id;
    const assignmentId = parseInt(req.params.id);
    
    if (!schoolId) {
      return res.status(400).json({ error: 'School context required' });
    }

    console.log('[AdminEducators] Deleting class assignment:', assignmentId);

    // Get existing assignment to verify school ownership
    const existingAssignment = await storage.getEducatorClassAssignmentById(assignmentId);
    if (!existingAssignment || existingAssignment.schoolId !== parseInt(schoolId)) {
      return res.status(404).json({ error: 'Assignment not found in this school' });
    }

    // Get details for audit log before deletion
    const classInfo = await storage.getClassById(existingAssignment.classId);
    const educator = await storage.getUser(existingAssignment.educatorId);

    await storage.deleteEducatorClassAssignment(assignmentId);

    // If the removed assignment was the primary instructor, clear both instructorId and instructorName
    if (existingAssignment.isPrimary) {
      await storage.updateClass(existingAssignment.classId, { 
        instructorId: null,
        instructorName: null
      });
      console.log('[AdminEducators] Cleared class instructor since primary instructor was removed');
    }

    // Create audit log
    const auditLog: InsertAuditLog = {
      actionType: 'educator_class_assignment_deleted',
      severity: 'warn',
      actorId: actorId,
      actorRole: 'admin',
      actorEmail: req.user?.email,
      targetType: 'educator_class_assignment',
      targetId: String(assignmentId),
      schoolId: parseInt(schoolId),
      metadata: {
        context: `Admin removed ${educator?.name} from ${classInfo?.title}`,
        before: existingAssignment
      }
    };
    await storage.createAuditLog(auditLog);

    console.log('[AdminEducators] Assignment deleted:', assignmentId);
    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    console.error('[AdminEducators] Error deleting class assignment:', error);
    res.status(500).json({ error: 'Failed to delete class assignment' });
  }
});

// ============================================
// Audit Log Viewing (Phase 1b)
// ============================================

// GET /api/admin/educators/audit-logs - Get audit logs for a school
router.get('/audit-logs', async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    
    if (!schoolId) {
      return res.status(400).json({ error: 'School context required' });
    }

    const { actionType, severity, startDate, endDate } = req.query;

    console.log('[AdminEducators] Fetching audit logs for school:', schoolId);

    const filters: any = {};
    if (actionType) filters.actionType = actionType;
    if (severity) filters.severity = severity;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const logs = await storage.getAuditLogsBySchoolId(parseInt(schoolId), filters);

    // Enrich with actor details
    const logsWithDetails = await Promise.all(
      logs.map(async (log) => {
        let actorName = 'System';
        if (log.actorId) {
          const actor = await storage.getUser(log.actorId);
          actorName = actor?.name || 'Unknown User';
        }
        return {
          ...log,
          actorName
        };
      })
    );

    res.json(logsWithDetails);
  } catch (error) {
    console.error('[AdminEducators] Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// GET /api/admin/educators/sessions - Get all sessions for a school
router.get('/sessions', async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    
    if (!schoolId) {
      return res.status(400).json({ error: 'School context required' });
    }

    const { educatorId, classId, date, status } = req.query;

    console.log('[AdminEducators] Fetching sessions for school:', schoolId);

    let sessions = await storage.getClassSessionsBySchoolId(parseInt(schoolId));

    // Apply filters
    if (educatorId) {
      sessions = sessions.filter(s => s.educatorId === parseInt(educatorId as string));
    }
    if (classId) {
      sessions = sessions.filter(s => s.classId === parseInt(classId as string));
    }
    if (date) {
      sessions = sessions.filter(s => s.scheduledDate === date);
    }
    if (status) {
      sessions = sessions.filter(s => s.status === status);
    }

    // Enrich with class and educator details
    const sessionsWithDetails = await Promise.all(
      sessions.map(async (session) => {
        const classInfo = await storage.getClassById(session.classId);
        const educator = await storage.getUser(session.educatorId);
        return {
          ...session,
          className: classInfo?.title || 'Unknown Class',
          educatorName: educator?.name || 'Unknown Educator',
          educatorEmail: educator?.email
        };
      })
    );

    res.json(sessionsWithDetails);
  } catch (error) {
    console.error('[AdminEducators] Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

export default router;
