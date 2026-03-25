import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { supabaseAuth, requireSchoolContext } from '../middleware/supabase-auth';
import { 
  insertAssessmentTypeSchema, 
  insertCurriculumBookSchema, 
  insertStudentAssessmentSchema,
  scoreFormatEnum,
  assessmentCategoryEnum
} from '../../shared/schema';
import { z } from 'zod';

/**
 * Calculate Lexile score from grade level score
 * Formula: Lexile = 200 + (gradeLevel × 100)
 * Example: Grade 6.96 → 896L
 * 
 * @param gradeLevel - The grade level score (e.g., 6.96)
 * @returns The Lexile score as an integer, or null if not calculable
 */
export function calculateLexileFromGradeLevel(gradeLevel: number | string | null): number | null {
  if (gradeLevel === null || gradeLevel === undefined) {
    return null;
  }
  
  const numericGrade = typeof gradeLevel === 'string' ? parseFloat(gradeLevel) : gradeLevel;
  
  if (isNaN(numericGrade) || numericGrade < 0) {
    return null;
  }
  
  // Lexile formula: 200 + (gradeLevel × 100)
  const lexileScore = Math.round(200 + (numericGrade * 100));
  
  // Lexile scores typically range from below 0 (BR) to about 2000
  // We'll cap at reasonable bounds: 0 to 2000
  return Math.max(0, Math.min(2000, lexileScore));
}

/**
 * Parse a score string to extract grade level for McCall-Crabbs format assessments
 * Supports formats like "6.96", "6.5", or averaged multiple scores
 * 
 * @param score - The raw score string
 * @returns Parsed grade level or null
 */
export function parseGradeLevelScore(score: string): number | null {
  if (!score || typeof score !== 'string') {
    return null;
  }
  
  const trimmed = score.trim();
  
  // Try direct numeric parse (e.g., "6.96")
  const directParse = parseFloat(trimmed);
  if (!isNaN(directParse) && directParse >= 0 && directParse <= 20) {
    return directParse;
  }
  
  // If score contains multiple values separated by comma/semicolon, average them
  if (trimmed.includes(',') || trimmed.includes(';')) {
    const parts = trimmed.split(/[,;]/).map(p => parseFloat(p.trim())).filter(n => !isNaN(n));
    if (parts.length > 0) {
      return parts.reduce((sum, n) => sum + n, 0) / parts.length;
    }
  }
  
  return null;
}

const router = Router();

// ==================== ASSESSMENT TYPES ====================

router.get('/types', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const assessmentTypes = await storage.getAssessmentTypesBySchoolId(schoolId);
    res.json(assessmentTypes);
  } catch (error) {
    console.error('Error fetching assessment types:', error);
    res.status(500).json({ message: 'Failed to fetch assessment types' });
  }
});

router.get('/types/:id', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const assessmentType = await storage.getAssessmentTypeById(id);
    
    if (!assessmentType) {
      return res.status(404).json({ message: 'Assessment type not found' });
    }
    
    const schoolId = (req.user as any).schoolId;
    if (assessmentType.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(assessmentType);
  } catch (error) {
    console.error('Error fetching assessment type:', error);
    res.status(500).json({ message: 'Failed to fetch assessment type' });
  }
});

router.post('/types', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const role = (req.user as any).role || (req.user as any).activeRole;
    
    if (role !== 'schoolAdmin' && role !== 'admin') {
      return res.status(403).json({ message: 'Only administrators can create assessment types' });
    }
    
    const validatedData = insertAssessmentTypeSchema.parse({
      ...req.body,
      schoolId
    });
    
    const assessmentType = await storage.createAssessmentType(validatedData);
    res.status(201).json(assessmentType);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('Error creating assessment type:', error);
    res.status(500).json({ message: 'Failed to create assessment type' });
  }
});

router.patch('/types/:id', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const schoolId = (req.user as any).schoolId;
    const role = (req.user as any).role || (req.user as any).activeRole;
    
    if (role !== 'schoolAdmin' && role !== 'admin') {
      return res.status(403).json({ message: 'Only administrators can update assessment types' });
    }
    
    const existing = await storage.getAssessmentTypeById(id);
    if (!existing) {
      return res.status(404).json({ message: 'Assessment type not found' });
    }
    if (existing.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const { schoolId: _, id: __, createdAt: ___, ...safeData } = req.body;
    
    const updated = await storage.updateAssessmentType(id, safeData);
    res.json(updated);
  } catch (error) {
    console.error('Error updating assessment type:', error);
    res.status(500).json({ message: 'Failed to update assessment type' });
  }
});

router.delete('/types/:id', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const schoolId = (req.user as any).schoolId;
    const role = (req.user as any).role || (req.user as any).activeRole;
    
    if (role !== 'schoolAdmin' && role !== 'admin') {
      return res.status(403).json({ message: 'Only administrators can delete assessment types' });
    }
    
    const existing = await storage.getAssessmentTypeById(id);
    if (!existing) {
      return res.status(404).json({ message: 'Assessment type not found' });
    }
    if (existing.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    await storage.deleteAssessmentType(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting assessment type:', error);
    res.status(500).json({ message: 'Failed to delete assessment type' });
  }
});

// ==================== CURRICULUM BOOKS ====================

router.get('/types/:typeId/books', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const typeId = parseInt(req.params.typeId);
    const schoolId = (req.user as any).schoolId;
    
    const assessmentType = await storage.getAssessmentTypeById(typeId);
    if (!assessmentType) {
      return res.status(404).json({ message: 'Assessment type not found' });
    }
    if (assessmentType.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const books = await storage.getCurriculumBooksByAssessmentTypeId(typeId);
    res.json(books);
  } catch (error) {
    console.error('Error fetching curriculum books:', error);
    res.status(500).json({ message: 'Failed to fetch curriculum books' });
  }
});

router.post('/types/:typeId/books', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const typeId = parseInt(req.params.typeId);
    const schoolId = (req.user as any).schoolId;
    const role = (req.user as any).role || (req.user as any).activeRole;
    
    if (role !== 'schoolAdmin' && role !== 'admin') {
      return res.status(403).json({ message: 'Only administrators can create curriculum books' });
    }
    
    const assessmentType = await storage.getAssessmentTypeById(typeId);
    if (!assessmentType) {
      return res.status(404).json({ message: 'Assessment type not found' });
    }
    if (assessmentType.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const validatedData = insertCurriculumBookSchema.parse({
      ...req.body,
      assessmentTypeId: typeId
    });
    
    const book = await storage.createCurriculumBook(validatedData);
    res.status(201).json(book);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('Error creating curriculum book:', error);
    res.status(500).json({ message: 'Failed to create curriculum book' });
  }
});

router.patch('/books/:id', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const schoolId = (req.user as any).schoolId;
    const role = (req.user as any).role || (req.user as any).activeRole;
    
    if (role !== 'schoolAdmin' && role !== 'admin') {
      return res.status(403).json({ message: 'Only administrators can update curriculum books' });
    }
    
    const book = await storage.getCurriculumBookById(id);
    if (!book) {
      return res.status(404).json({ message: 'Curriculum book not found' });
    }
    
    const assessmentType = await storage.getAssessmentTypeById(book.assessmentTypeId);
    if (!assessmentType || assessmentType.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const { id: _, assessmentTypeId: __, createdAt: ___, ...safeData } = req.body;
    
    const updated = await storage.updateCurriculumBook(id, safeData);
    res.json(updated);
  } catch (error) {
    console.error('Error updating curriculum book:', error);
    res.status(500).json({ message: 'Failed to update curriculum book' });
  }
});

router.delete('/books/:id', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const schoolId = (req.user as any).schoolId;
    const role = (req.user as any).role || (req.user as any).activeRole;
    
    if (role !== 'schoolAdmin' && role !== 'admin') {
      return res.status(403).json({ message: 'Only administrators can delete curriculum books' });
    }
    
    const book = await storage.getCurriculumBookById(id);
    if (!book) {
      return res.status(404).json({ message: 'Curriculum book not found' });
    }
    
    const assessmentType = await storage.getAssessmentTypeById(book.assessmentTypeId);
    if (!assessmentType || assessmentType.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    await storage.deleteCurriculumBook(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting curriculum book:', error);
    res.status(500).json({ message: 'Failed to delete curriculum book' });
  }
});

// ==================== STUDENT ASSESSMENTS ====================

router.get('/students', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const { locationId, assessmentTypeId, childId } = req.query;
    
    const filters: { locationId?: number; assessmentTypeId?: number; childId?: number } = {};
    if (locationId) filters.locationId = parseInt(locationId as string);
    if (assessmentTypeId) filters.assessmentTypeId = parseInt(assessmentTypeId as string);
    if (childId) filters.childId = parseInt(childId as string);
    
    const assessments = await storage.getStudentAssessmentsBySchoolId(schoolId, filters);
    res.json(assessments);
  } catch (error) {
    console.error('Error fetching student assessments:', error);
    res.status(500).json({ message: 'Failed to fetch student assessments' });
  }
});

router.get('/students/child/:childId', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const childId = parseInt(req.params.childId);
    const assessments = await storage.getStudentAssessmentsByChildId(childId);
    res.json(assessments);
  } catch (error) {
    console.error('Error fetching child assessments:', error);
    res.status(500).json({ message: 'Failed to fetch child assessments' });
  }
});

router.post('/students', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const recordedBy = (req.user as any).id;
    const role = (req.user as any).role || (req.user as any).activeRole;
    
    if (role !== 'schoolAdmin' && role !== 'admin' && role !== 'educator' && role !== 'teacher') {
      return res.status(403).json({ message: 'Only educators and administrators can record assessments' });
    }
    
    const { schoolId: _, recordedBy: __, ...clientData } = req.body;
    
    // Auto-calculate Lexile score from grade-level score if not provided
    let lexileScore = clientData.lexileScore;
    if (lexileScore === undefined || lexileScore === null) {
      const gradeLevel = parseGradeLevelScore(clientData.score);
      if (gradeLevel !== null) {
        lexileScore = calculateLexileFromGradeLevel(gradeLevel);
      }
    }
    
    const validatedData = insertStudentAssessmentSchema.parse({
      ...clientData,
      schoolId,
      recordedBy,
      source: clientData.source || 'manual_entry',
      lexileScore
    });
    
    const assessmentType = await storage.getAssessmentTypeById(validatedData.assessmentTypeId);
    if (!assessmentType || assessmentType.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Invalid assessment type' });
    }
    
    const assessment = await storage.createStudentAssessment(validatedData);
    res.status(201).json(assessment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('Error creating student assessment:', error);
    res.status(500).json({ message: 'Failed to create student assessment' });
  }
});

router.patch('/students/:id', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const schoolId = (req.user as any).schoolId;
    const role = (req.user as any).role || (req.user as any).activeRole;
    
    if (role !== 'schoolAdmin' && role !== 'admin' && role !== 'educator' && role !== 'teacher') {
      return res.status(403).json({ message: 'Only educators and administrators can update assessments' });
    }
    
    const existing = await storage.getStudentAssessmentById(id);
    if (!existing) {
      return res.status(404).json({ message: 'Assessment not found' });
    }
    if (existing.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const { schoolId: _, recordedBy: __, id: ___, createdAt: ____, childId: _____, ...safeData } = req.body;
    
    // If score is being updated, recalculate Lexile score
    if (safeData.score !== undefined && safeData.lexileScore === undefined) {
      const gradeLevel = parseGradeLevelScore(safeData.score);
      if (gradeLevel !== null) {
        safeData.lexileScore = calculateLexileFromGradeLevel(gradeLevel);
      }
    }
    
    const updated = await storage.updateStudentAssessment(id, safeData);
    res.json(updated);
  } catch (error) {
    console.error('Error updating student assessment:', error);
    res.status(500).json({ message: 'Failed to update student assessment' });
  }
});

router.delete('/students/:id', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const schoolId = (req.user as any).schoolId;
    const role = (req.user as any).role || (req.user as any).activeRole;
    
    if (role !== 'schoolAdmin' && role !== 'admin') {
      return res.status(403).json({ message: 'Only administrators can delete assessments' });
    }
    
    const existing = await storage.getStudentAssessmentById(id);
    if (!existing) {
      return res.status(404).json({ message: 'Assessment not found' });
    }
    if (existing.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    await storage.deleteStudentAssessment(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting student assessment:', error);
    res.status(500).json({ message: 'Failed to delete student assessment' });
  }
});

// ==================== METADATA ENDPOINTS ====================

router.get('/metadata/score-formats', supabaseAuth, async (req: Request, res: Response) => {
  res.json(scoreFormatEnum);
});

router.get('/metadata/categories', supabaseAuth, async (req: Request, res: Response) => {
  res.json(assessmentCategoryEnum);
});

// ==================== PARENT ASSESSMENTS ENDPOINT ====================

router.get('/parent/my-children', supabaseAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    
    // Get the parent's children
    const children = await storage.getChildrenByParentId(userId);
    
    if (!children || children.length === 0) {
      return res.json([]);
    }
    
    // Get assessments for each child with type and book info
    const result = await Promise.all(children.map(async (child) => {
      const assessments = await storage.getStudentAssessmentsByChildId(child.id);
      
      // Enrich assessments with type and book names
      const enrichedAssessments = await Promise.all(assessments.map(async (assessment) => {
        const assessmentType = await storage.getAssessmentTypeById(assessment.assessmentTypeId);
        let curriculumBook = null;
        if (assessment.curriculumBookId) {
          curriculumBook = await storage.getCurriculumBookById(assessment.curriculumBookId);
        }
        
        return {
          ...assessment,
          assessmentTypeName: assessmentType?.name || 'Unknown',
          assessmentTypeCategory: assessmentType?.category || 'custom',
          curriculumBookName: curriculumBook?.name || null
        };
      }));
      
      return {
        child: {
          id: child.id,
          firstName: child.firstName,
          lastName: child.lastName,
          gradeLevel: child.gradeLevel
        },
        assessments: enrichedAssessments.sort((a, b) => 
          new Date(b.assessmentDate).getTime() - new Date(a.assessmentDate).getTime()
        )
      };
    }));
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching parent assessments:', error);
    res.status(500).json({ message: 'Failed to fetch assessments' });
  }
});

export default router;
