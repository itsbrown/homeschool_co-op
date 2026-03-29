import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { storage } from '../storage';
import { supabaseAuth, requireSchoolContext } from '../middleware/supabase-auth';

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const ALLOWED_ROLES = ['schoolAdmin', 'admin', 'educator', 'teacher'];

function requireLexileRole(req: Request, res: Response, next: Function) {
  const role = (req.user as any)?.role || (req.user as any)?.activeRole;
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(403).json({ message: 'Only educators and administrators can access Lexile data' });
  }
  next();
}

const lexileEntrySchema = z.object({
  childId: z.number().int().positive(),
  readingGradeLevel: z.string().optional(),
  lexileRange: z.string().optional(),
  bookList: z.string().optional(),
  notes: z.string().optional(),
});

const matchRowsSchema = z.object({
  rows: z.array(z.record(z.string())).min(1),
  studentNameColumn: z.string().min(1),
});

const columnMappingSchema = z.object({
  studentName: z.string().optional(),
  lexileRange: z.string().optional(),
  readingGradeLevel: z.string().optional(),
  bookList: z.string().optional(),
  notes: z.string().optional(),
}).optional();

const confirmedRowSchema = z.object({
  rowIndex: z.number().int(),
  matchedChildId: z.number().int().positive().nullable(),
  row: z.record(z.string()),
});

const importRowsSchema = z.object({
  confirmedRows: z.array(confirmedRowSchema).min(1),
  columnMapping: columnMappingSchema,
});

// GET /api/lexile/history/:childId - returns Lexile assessment history for a student
router.get('/history/:childId', supabaseAuth, requireSchoolContext, requireLexileRole, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const childId = parseInt(req.params.childId);
    if (isNaN(childId)) {
      return res.status(400).json({ message: 'Invalid student ID' });
    }
    const child = await storage.getChildByIdForSchool(childId, schoolId);
    if (!child) {
      return res.status(404).json({ message: 'Student not found in your school' });
    }
    const history = await storage.getLexileHistoryForChildBySchool(childId, schoolId);
    res.json(history);
  } catch (error) {
    console.error('Error fetching lexile history:', error);
    res.status(500).json({ message: 'Failed to fetch history' });
  }
});

// GET /api/lexile/students - returns children list for the active school
router.get('/students', supabaseAuth, requireSchoolContext, requireLexileRole, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const students = await storage.getChildrenForSchool(schoolId);
    res.json(students);
  } catch (error) {
    console.error('Error fetching lexile students:', error);
    res.status(500).json({ message: 'Failed to fetch students' });
  }
});

// POST /api/lexile/entry - manual entry
router.post('/entry', supabaseAuth, requireSchoolContext, requireLexileRole, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const userId = (req.user as any).id;

    const parsed = lexileEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid data', errors: parsed.error.errors });
    }
    const { childId, readingGradeLevel, lexileRange, bookList, notes } = parsed.data;

    // Tenant isolation: verify child belongs to requester's school
    const child = await storage.getChildByIdForSchool(childId, schoolId);
    if (!child) {
      return res.status(404).json({ message: 'Student not found in your school' });
    }

    const assessment = await storage.recordLexileAssessment(
      childId, schoolId, userId,
      { readingGradeLevel, lexileRange, bookList, notes }
    );

    res.json({ success: true, assessment });
  } catch (error) {
    console.error('Error saving lexile entry:', error);
    res.status(500).json({ message: 'Failed to save lexile entry' });
  }
});

// POST /api/lexile/upload/preview - parse CSV and return rows + headers
router.post('/upload/preview', supabaseAuth, requireSchoolContext, requireLexileRole, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const csvText = req.file.buffer.toString('utf-8');
    const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });

    if (!records || records.length === 0) {
      return res.status(400).json({ message: 'CSV file is empty or has no data rows' });
    }

    const columns = Object.keys(records[0]);
    const sampleData = records.slice(0, 5);

    res.json({ columns, sampleData, allRecords: records, totalRows: records.length });
  } catch (error) {
    console.error('Error previewing CSV:', error);
    res.status(500).json({ message: 'Failed to parse CSV file' });
  }
});

// POST /api/lexile/upload/match - fuzzy-match student names against children in requester's school
router.post('/upload/match', supabaseAuth, requireSchoolContext, requireLexileRole, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const parsed = matchRowsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request', errors: parsed.error.errors });
    }
    const { rows, studentNameColumn } = parsed.data;

    const matchedRows = await Promise.all(rows.map(async (row: Record<string, string>, idx: number) => {
      const rawName = (row[studentNameColumn] || '').trim();
      if (!rawName) {
        return { rowIndex: idx, rawName, matchedChildId: null, confidence: 0, candidates: [], row };
      }

      // Use storage interface for fuzzy matching - school-scoped
      const candidates = await storage.fuzzyMatchStudentsForSchool(schoolId, rawName);

      const exactMatch = candidates.find((c: { id: number; name: string; gradeLevel: string }) =>
        c.name.toLowerCase() === rawName.toLowerCase()
      );

      return {
        rowIndex: idx,
        rawName,
        matchedChildId: exactMatch?.id ?? (candidates.length === 1 ? candidates[0].id : null),
        matchedChildName: exactMatch?.name ?? (candidates.length === 1 ? candidates[0].name : null),
        confidence: exactMatch ? 1.0 : candidates.length === 1 ? 0.7 : candidates.length > 1 ? 0.4 : 0,
        candidates,
        row,
      };
    }));

    const students = await storage.getChildrenForSchool(schoolId);
    res.json({ matchedRows, students });
  } catch (error) {
    console.error('Error matching students:', error);
    res.status(500).json({ message: 'Failed to match students' });
  }
});

// POST /api/lexile/upload/import - import confirmed rows with partial success
router.post('/upload/import', supabaseAuth, requireSchoolContext, requireLexileRole, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const userId = (req.user as any).id;
    const parsed = importRowsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request', errors: parsed.error.errors });
    }
    const { confirmedRows, columnMapping } = parsed.data;

    let updated = 0;
    let skipped = 0;
    const errors: { row: number; reason: string }[] = [];

    for (const item of confirmedRows) {
      const { rowIndex, matchedChildId, row } = item;

      if (!matchedChildId) {
        skipped++;
        continue;
      }

      // Tenant isolation: verify child belongs to requester's school
      const child = await storage.getChildByIdForSchool(matchedChildId, schoolId);
      if (!child) {
        errors.push({ row: rowIndex, reason: 'Student not found in your school' });
        continue;
      }

      try {
        const lexileRange = columnMapping?.lexileRange ? row[columnMapping.lexileRange] : undefined;
        const readingGradeLevel = columnMapping?.readingGradeLevel ? row[columnMapping.readingGradeLevel] : undefined;
        const bookList = columnMapping?.bookList ? row[columnMapping.bookList] : undefined;
        const notes = columnMapping?.notes ? row[columnMapping.notes] : undefined;

        await storage.recordLexileAssessment(
          matchedChildId, schoolId, userId,
          { readingGradeLevel, lexileRange, bookList, notes }
        );
        updated++;
      } catch (err) {
        errors.push({ row: rowIndex, reason: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    res.json({ updated, skipped, errors });
  } catch (error) {
    console.error('Error importing lexile data:', error);
    res.status(500).json({ message: 'Failed to import lexile data' });
  }
});

export default router;
