import { Router, Request, Response } from 'express';
import { parse } from 'csv-parse/sync';
import { supabaseAuth, requireSchoolContext } from '../middleware/supabase-auth';
import { storage } from '../storage';
import { anthropicService } from '../services/anthropic';
import { UploadedFile } from 'express-fileupload';

const router = Router();

interface ColumnMapping {
  studentName?: string;
  firstName?: string;
  lastName?: string;
  assessmentDate?: string;
  score?: string;
  scoreNumerator?: string;
  scoreDenominator?: string;
  bookTitle?: string;
  lessonNumber?: string;
  notes?: string;
}

interface ParsedAssessment {
  studentName: string;
  firstName?: string;
  lastName?: string;
  matchedChildId?: number;
  matchConfidence?: number;
  matchedChildName?: string;
  assessmentDate?: string;
  score?: string;
  scoreNumerator?: number;
  scoreDenominator?: number;
  bookTitle?: string;
  lessonNumber?: number;
  notes?: string;
  rowIndex: number;
  errors: string[];
  warnings: string[];
}

interface AIColumnSuggestion {
  column: string;
  suggestedField: string;
  confidence: number;
}

router.post('/preview', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const role = (req.user as any).role || (req.user as any).activeRole;
    
    if (role !== 'schoolAdmin' && role !== 'admin' && role !== 'educator' && role !== 'teacher') {
      return res.status(403).json({ message: 'Only educators and administrators can upload assessments' });
    }
    
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const uploadedFile = req.files.file as UploadedFile;
    
    if (!uploadedFile.name.toLowerCase().endsWith('.csv')) {
      return res.status(400).json({ message: 'Only CSV files are allowed' });
    }
    
    const fileContent = uploadedFile.data.toString('utf-8');
    
    let records: Record<string, string>[];
    try {
      records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (parseError) {
      return res.status(400).json({ message: 'Invalid CSV format' });
    }
    
    if (records.length === 0) {
      return res.status(400).json({ message: 'The CSV file is empty' });
    }
    
    const columns = Object.keys(records[0]);
    
    let aiSuggestions: AIColumnSuggestion[] = [];
    if (anthropicService.isAvailable()) {
      try {
        const sampleData = records.slice(0, 3).map(r => 
          Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(', ')
        ).join('\n');
        
        const prompt = `Analyze these CSV columns and sample data for a student assessment upload system.

Columns: ${columns.join(', ')}

Sample data (first 3 rows):
${sampleData}

Map each column to ONE of these field types:
- studentName: Full student name (e.g., "John Smith" or "Smith, John")
- firstName: Student's first name only
- lastName: Student's last name only  
- assessmentDate: Date of assessment
- score: Combined score value (could be numeric, fraction like "8/10", letter grade, or percentage)
- scoreNumerator: Numerator part of a fraction score
- scoreDenominator: Denominator part of a fraction score
- bookTitle: Name of curriculum book or material
- lessonNumber: Lesson or chapter number
- notes: Comments or notes
- ignore: Column should be ignored

Return ONLY a JSON array with this format:
[{"column": "Column Name", "suggestedField": "fieldType", "confidence": 0.95}]

Be smart about detecting:
- Name columns that might be formatted as "Last, First" or "First Last"
- Score formats like "85%", "8/10", "B+", or just "85"
- Date formats in various styles`;

        const response = await anthropicService.generateContent(prompt, true, 1024);
        if (response) {
          const jsonMatch = response.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            aiSuggestions = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (aiError) {
        console.error('AI column mapping error:', aiError);
      }
    }
    
    const suggestedMapping: ColumnMapping = {};
    const columnLower = columns.map(c => c.toLowerCase());
    
    const namePatterns = ['student name', 'name', 'student', 'full name', 'pupil'];
    const firstNamePatterns = ['first name', 'firstname', 'first', 'given name'];
    const lastNamePatterns = ['last name', 'lastname', 'last', 'surname', 'family name'];
    const datePatterns = ['date', 'assessment date', 'test date', 'recorded'];
    const scorePatterns = ['score', 'grade', 'result', 'mark', 'points'];
    const bookPatterns = ['book', 'curriculum', 'material', 'textbook', 'title'];
    const lessonPatterns = ['lesson', 'chapter', 'unit', 'section', 'number'];
    const notesPatterns = ['notes', 'comments', 'remarks', 'feedback'];
    
    for (const col of columns) {
      const colLower = col.toLowerCase();
      
      if (namePatterns.some(p => colLower.includes(p))) {
        suggestedMapping.studentName = col;
      } else if (firstNamePatterns.some(p => colLower.includes(p))) {
        suggestedMapping.firstName = col;
      } else if (lastNamePatterns.some(p => colLower.includes(p))) {
        suggestedMapping.lastName = col;
      } else if (datePatterns.some(p => colLower.includes(p))) {
        suggestedMapping.assessmentDate = col;
      } else if (scorePatterns.some(p => colLower.includes(p))) {
        suggestedMapping.score = col;
      } else if (bookPatterns.some(p => colLower.includes(p))) {
        suggestedMapping.bookTitle = col;
      } else if (lessonPatterns.some(p => colLower.includes(p))) {
        suggestedMapping.lessonNumber = col;
      } else if (notesPatterns.some(p => colLower.includes(p))) {
        suggestedMapping.notes = col;
      }
    }
    
    for (const suggestion of aiSuggestions) {
      if (suggestion.confidence >= 0.7) {
        const field = suggestion.suggestedField;
        if (field !== 'ignore' && field in suggestedMapping === false) {
          (suggestedMapping as any)[field] = suggestion.column;
        }
      }
    }
    
    res.json({
      columns,
      suggestedMapping,
      aiSuggestions,
      sampleData: records.slice(0, 5),
      allRecords: records,
      totalRows: records.length,
    });
  } catch (error) {
    console.error('Error previewing assessment upload:', error);
    res.status(500).json({ message: 'Failed to preview file' });
  }
});

router.post('/match-students', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const role = (req.user as any).role || (req.user as any).activeRole;
    
    if (role !== 'schoolAdmin' && role !== 'admin' && role !== 'educator' && role !== 'teacher') {
      return res.status(403).json({ message: 'Only educators and administrators can upload assessments' });
    }
    
    const { records, mapping } = req.body as { 
      records: Record<string, string>[]; 
      mapping: ColumnMapping;
    };
    
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({ message: 'Invalid records data' });
    }
    
    const children = await storage.getChildrenBySchoolId(schoolId);
    
    const parsedAssessments: ParsedAssessment[] = [];
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const parsed: ParsedAssessment = {
        studentName: '',
        rowIndex: i + 1,
        errors: [],
        warnings: [],
      };
      
      if (mapping.studentName && record[mapping.studentName]) {
        parsed.studentName = record[mapping.studentName].trim();
        
        if (parsed.studentName.includes(',')) {
          const parts = parsed.studentName.split(',').map(p => p.trim());
          parsed.lastName = parts[0];
          parsed.firstName = parts.slice(1).join(' ');
        } else {
          const parts = parsed.studentName.split(/\s+/);
          if (parts.length >= 2) {
            parsed.firstName = parts[0];
            parsed.lastName = parts.slice(1).join(' ');
          } else {
            parsed.firstName = parts[0];
          }
        }
      } else {
        if (mapping.firstName && record[mapping.firstName]) {
          parsed.firstName = record[mapping.firstName].trim();
        }
        if (mapping.lastName && record[mapping.lastName]) {
          parsed.lastName = record[mapping.lastName].trim();
        }
        parsed.studentName = [parsed.firstName, parsed.lastName].filter(Boolean).join(' ');
      }
      
      if (!parsed.studentName) {
        parsed.errors.push('Student name is required');
      }
      
      if (mapping.assessmentDate && record[mapping.assessmentDate]) {
        parsed.assessmentDate = record[mapping.assessmentDate];
      }
      
      if (mapping.score && record[mapping.score]) {
        const scoreStr = record[mapping.score].trim();
        
        if (scoreStr.includes('/')) {
          const parts = scoreStr.split('/');
          parsed.scoreNumerator = parseFloat(parts[0]);
          parsed.scoreDenominator = parseFloat(parts[1]);
          parsed.score = scoreStr;
        } else if (scoreStr.includes('%')) {
          parsed.score = scoreStr.replace('%', '');
          parsed.scoreNumerator = parseFloat(parsed.score);
          parsed.scoreDenominator = 100;
        } else {
          parsed.score = scoreStr;
          const numScore = parseFloat(scoreStr);
          if (!isNaN(numScore)) {
            parsed.scoreNumerator = numScore;
          }
        }
      } else {
        if (mapping.scoreNumerator && record[mapping.scoreNumerator]) {
          parsed.scoreNumerator = parseFloat(record[mapping.scoreNumerator]);
        }
        if (mapping.scoreDenominator && record[mapping.scoreDenominator]) {
          parsed.scoreDenominator = parseFloat(record[mapping.scoreDenominator]);
        }
        if (parsed.scoreNumerator !== undefined) {
          parsed.score = parsed.scoreDenominator 
            ? `${parsed.scoreNumerator}/${parsed.scoreDenominator}`
            : String(parsed.scoreNumerator);
        }
      }
      
      if (mapping.bookTitle && record[mapping.bookTitle]) {
        parsed.bookTitle = record[mapping.bookTitle].trim();
      }
      
      if (mapping.lessonNumber && record[mapping.lessonNumber]) {
        const lessonStr = record[mapping.lessonNumber].replace(/[^\d]/g, '');
        parsed.lessonNumber = parseInt(lessonStr, 10) || undefined;
      }
      
      if (mapping.notes && record[mapping.notes]) {
        parsed.notes = record[mapping.notes].trim();
      }
      
      if (parsed.studentName && children.length > 0) {
        const match = fuzzyMatchStudent(
          parsed.firstName || '',
          parsed.lastName || '',
          parsed.studentName,
          children
        );
        
        if (match) {
          parsed.matchedChildId = match.childId;
          parsed.matchConfidence = match.confidence;
          parsed.matchedChildName = match.childName;
          
          if (match.confidence < 0.8) {
            parsed.warnings.push(`Low confidence match (${Math.round(match.confidence * 100)}%)`);
          }
        } else {
          parsed.warnings.push('No matching student found');
        }
      }
      
      parsedAssessments.push(parsed);
    }
    
    const matchedCount = parsedAssessments.filter(p => p.matchedChildId).length;
    const unmatchedCount = parsedAssessments.filter(p => !p.matchedChildId && !p.errors.length).length;
    const errorCount = parsedAssessments.filter(p => p.errors.length > 0).length;
    
    res.json({
      assessments: parsedAssessments,
      summary: {
        total: parsedAssessments.length,
        matched: matchedCount,
        unmatched: unmatchedCount,
        errors: errorCount,
      },
      availableStudents: children.map(c => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        gradeLevel: c.gradeLevel,
      })),
    });
  } catch (error) {
    console.error('Error matching students:', error);
    res.status(500).json({ message: 'Failed to match students' });
  }
});

router.post('/import', supabaseAuth, requireSchoolContext, async (req: Request, res: Response) => {
  try {
    const schoolId = (req.user as any).schoolId;
    const recordedBy = (req.user as any).id;
    const role = (req.user as any).role || (req.user as any).activeRole;
    
    if (role !== 'schoolAdmin' && role !== 'admin' && role !== 'educator' && role !== 'teacher') {
      return res.status(403).json({ message: 'Only educators and administrators can upload assessments' });
    }
    
    const { assessments, assessmentTypeId, curriculumBookId, locationId } = req.body as {
      assessments: ParsedAssessment[];
      assessmentTypeId: number;
      curriculumBookId?: number;
      locationId?: number;
    };
    
    if (!assessments || !Array.isArray(assessments)) {
      return res.status(400).json({ message: 'Invalid assessments data' });
    }
    
    if (!assessmentTypeId) {
      return res.status(400).json({ message: 'Assessment type is required' });
    }
    
    const assessmentType = await storage.getAssessmentTypeById(assessmentTypeId);
    if (!assessmentType || assessmentType.schoolId !== schoolId) {
      return res.status(403).json({ message: 'Invalid assessment type' });
    }
    
    if (curriculumBookId) {
      const book = await storage.getCurriculumBookById(curriculumBookId);
      if (!book || book.assessmentTypeId !== assessmentTypeId) {
        return res.status(400).json({ message: 'Invalid curriculum book' });
      }
    }
    
    const schoolChildren = await storage.getChildrenBySchoolId(schoolId);
    const validChildIds = new Set(schoolChildren.map(c => c.id));
    
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as { row: number; error: string }[],
    };
    
    for (const assessment of assessments) {
      if (!assessment.matchedChildId) {
        results.failed++;
        results.errors.push({ row: assessment.rowIndex, error: 'No student matched' });
        continue;
      }
      
      if (!validChildIds.has(assessment.matchedChildId)) {
        results.failed++;
        results.errors.push({ row: assessment.rowIndex, error: 'Student does not belong to this school' });
        continue;
      }
      
      if (assessment.errors.length > 0) {
        results.failed++;
        results.errors.push({ row: assessment.rowIndex, error: assessment.errors.join(', ') });
        continue;
      }
      
      try {
        let assessmentDate = new Date();
        if (assessment.assessmentDate) {
          const parsed = new Date(assessment.assessmentDate);
          if (!isNaN(parsed.getTime())) {
            assessmentDate = parsed;
          }
        }
        
        let scoreText = assessment.score || '';
        if (!scoreText && assessment.scoreNumerator !== undefined) {
          scoreText = assessment.scoreDenominator 
            ? `${assessment.scoreNumerator}/${assessment.scoreDenominator}`
            : String(assessment.scoreNumerator);
        }
        
        await storage.createStudentAssessment({
          schoolId,
          childId: assessment.matchedChildId,
          assessmentTypeId,
          curriculumBookId: curriculumBookId || null,
          locationId: locationId || null,
          assessmentDate,
          score: scoreText || '0',
          lesson: assessment.lessonNumber || null,
          notes: assessment.notes || null,
          recordedBy,
        });
        
        results.successful++;
      } catch (err) {
        results.failed++;
        results.errors.push({ 
          row: assessment.rowIndex, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        });
      }
    }
    
    res.json({
      message: `Successfully imported ${results.successful} assessments. Failed: ${results.failed}.`,
      successful: results.successful,
      failed: results.failed,
      errors: results.errors,
    });
  } catch (error) {
    console.error('Error importing assessments:', error);
    res.status(500).json({ message: 'Failed to import assessments' });
  }
});

function fuzzyMatchStudent(
  firstName: string,
  lastName: string,
  fullName: string,
  children: Array<{ id: number; firstName: string; lastName: string }>
): { childId: number; confidence: number; childName: string } | null {
  let bestMatch: { childId: number; confidence: number; childName: string } | null = null;
  
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z]/g, '');
  
  const firstNorm = normalize(firstName);
  const lastNorm = normalize(lastName);
  const fullNorm = normalize(fullName);
  
  for (const child of children) {
    const childFirstNorm = normalize(child.firstName);
    const childLastNorm = normalize(child.lastName);
    const childFullNorm = normalize(`${child.firstName} ${child.lastName}`);
    const childName = `${child.firstName} ${child.lastName}`;
    
    let confidence = 0;
    
    if (childFullNorm === fullNorm) {
      confidence = 1.0;
    } else if (childFirstNorm === firstNorm && childLastNorm === lastNorm) {
      confidence = 1.0;
    } else if (childLastNorm === lastNorm && childFirstNorm.startsWith(firstNorm.slice(0, 3))) {
      confidence = 0.9;
    } else if (childLastNorm === lastNorm) {
      confidence = 0.7;
    } else if (levenshteinSimilarity(childFullNorm, fullNorm) > 0.8) {
      confidence = levenshteinSimilarity(childFullNorm, fullNorm);
    } else if (childFirstNorm === firstNorm) {
      confidence = 0.5;
    }
    
    if (confidence > (bestMatch?.confidence || 0)) {
      bestMatch = { childId: child.id, confidence, childName };
    }
  }
  
  return bestMatch && bestMatch.confidence >= 0.5 ? bestMatch : null;
}

function levenshteinSimilarity(a: string, b: string): number {
  if (a.length === 0) return b.length === 0 ? 1 : 0;
  if (b.length === 0) return 0;
  
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  const maxLen = Math.max(a.length, b.length);
  return 1 - matrix[b.length][a.length] / maxLen;
}

export default router;
