import { Request, Response } from "express";
import { storage } from "../storage";
import { parse } from "csv-parse/sync";
import { ZodError } from "zod";
import { formatZodError } from "../utils";
import { UploadedFile } from "express-fileupload";

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateToYMD(dateStr: string | undefined | null): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  const s = dateStr.trim();

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  const usMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
  }

  return null;
}

function addMonthsYMD(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const newMonth = m - 1 + months;
  const newYear = y + Math.floor(newMonth / 12);
  const finalMonth = (newMonth % 12) + 1;
  const maxDay = new Date(newYear, finalMonth, 0).getDate();
  const finalDay = Math.min(d, maxDay);
  return `${newYear}-${String(finalMonth).padStart(2, '0')}-${String(finalDay).padStart(2, '0')}`;
}

interface CsvProcessOptions {
  instructorId: number;
  schoolId?: number | null;
}

function parseAndValidateCsvFile(req: Request): { records: any[]; columnMapping: Record<string, string> } {
  if (!req.files || Object.keys(req.files).length === 0) {
    throw { status: 400, message: "No file uploaded" };
  }

  const uploadedFile = req.files.file as UploadedFile;

  if (!uploadedFile.name.toLowerCase().endsWith('.csv')) {
    throw { status: 400, message: "Only CSV files are allowed" };
  }

  let columnMapping: Record<string, string> = {};
  try {
    if (req.body.mapping) {
      columnMapping = JSON.parse(req.body.mapping);
      console.log("Received column mapping:", columnMapping);
    }
  } catch (error) {
    console.error("Error parsing mapping data:", error);
  }

  const fileContent = uploadedFile.data.toString('utf-8');

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log("First CSV record:", records[0]);

  if (records.length === 0) {
    throw { status: 400, message: "The CSV file is empty" };
  }

  return { records, columnMapping };
}

async function processClassRecords(
  records: any[],
  columnMapping: Record<string, string>,
  options: CsvProcessOptions
) {
  const results = {
    successful: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const record of records) {
    try {
      const getValue = (fieldKey: string, defaultFieldNames: string[]): string => {
        if (columnMapping[fieldKey] && columnMapping[fieldKey] !== "__none__" && record[columnMapping[fieldKey]]) {
          return record[columnMapping[fieldKey]];
        }
        for (const fieldName of defaultFieldNames) {
          if (record[fieldName] && record[fieldName].trim()) {
            return record[fieldName];
          }
        }
        return '';
      };

      const title = getValue('title', ['Class Name', 'Title', 'Name', 'Course Title']);
      if (!title) {
        throw new Error('Class title is required');
      }

      let description = getValue('description', ['Description', 'Class Description', 'Details']);
      const subjects = getValue('subjects', ['Subjects Covered', 'Subjects', 'Topics']);
      const learningObjectives = getValue('learningObjectives', ['Learning Objectives', 'Objectives', 'Goals']);
      const materials = getValue('materials', ['Curriculum Materials', 'Materials', 'Resources']);

      if (!description) {
        let descParts = [];
        if (subjects) descParts.push(`Subjects: ${subjects}`);
        if (learningObjectives) descParts.push(`Learning Objectives: ${learningObjectives}`);
        if (materials) descParts.push(`Materials: ${materials}`);
        if (record['Teaching Methods']) descParts.push(`Teaching Methods: ${record['Teaching Methods']}`);
        if (record['Sample Activities']) descParts.push(`Sample Activities: ${record['Sample Activities']}`);
        description = descParts.join('\n\n');
        if (!description) {
          description = `${title} class`;
        }
      }

      const startDateStr = getValue('startDate', ['Start Date', 'Begin Date', 'Class Start']);
      const startDate = parseDateToYMD(startDateStr) || todayYMD();

      const endDateStr = getValue('endDate', ['End Date', 'Finish Date', 'Class End']);
      let endDate = parseDateToYMD(endDateStr) || startDate;
      if (endDate <= startDate) {
        endDate = addMonthsYMD(startDate, 3);
      }

      let gradeLevels: string[] = [];
      const gradeLevelStr = getValue('gradeLevels', ['Grade Levels', 'Grades', 'Level', 'Age/Grade Range']);
      if (gradeLevelStr) {
        gradeLevels = gradeLevelStr.split(/[,;-]/).map(g => g.trim());
      } else {
        gradeLevels = ['K-12'];
      }

      const durationWeeksStr = getValue('durationWeeks', ['Duration (weeks)', 'Weeks', 'Term Length']);
      const durationWeeks = parseInt(durationWeeksStr || '10', 10);

      const sessionsPerWeekStr = getValue('sessionsPerWeek', ['Sessions Per Week', 'Weekly Sessions']);
      const sessionsPerWeek = parseInt(sessionsPerWeekStr || '1', 10);

      const sessionLengthStr = getValue('sessionLengthMinutes', ['Session Length (min)', 'Minutes', 'Duration']);
      const sessionLengthMinutes = parseInt(sessionLengthStr || '60', 10);

      let price = 0;
      const priceStr = getValue('price', ['Price', 'Cost', 'Fee', 'Pricing', 'Tuition']);
      if (priceStr) {
        if (priceStr.includes('$')) {
          const priceMatch = priceStr.match(/\$(\d+(\.\d+)?)/);
          if (priceMatch && priceMatch.length >= 2) {
            price = Math.round(parseFloat(priceMatch[1]) * 100);
          }
        } else {
          price = Math.round(parseFloat(priceStr) * 100);
        }
      }

      const capacity = parseInt(getValue('capacity', ['Capacity', 'Max Students', 'Class Size']) || '20', 10);
      const instructorName = getValue('instructorName', ['Instructor', 'Teacher', 'Faculty']) || 'Staff Instructor';
      const sessionDays = getValue('sessionDays', ['Session Days', 'Days', 'Class Days']) || 'Monday-Friday';
      const category = getValue('category', ['Category', 'Class Type', 'Type']) || 'academic';
      const categoryName = getValue('categoryName', ['Category Name', 'Program', 'Term']) || '';

      console.log(`Processing class: ${title}, Price: ${price}, Start: ${startDate}, SchoolId: ${options.schoolId || 'none'}`);

      const classData: any = {
        title,
        description: description.trim(),
        productId: `class-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        productType: 'class',
        categoryName,
        category,
        startDate,
        endDate,
        numSessions: durationWeeks * sessionsPerWeek,
        sessionDays,
        durationWeeks,
        sessionsPerWeek,
        sessionLengthMinutes,
        gradeLevels,
        capacity,
        location: getValue('location', ['Location', 'Venue', 'Site']) || 'On-site',
        instructorName,
        price,
        suggestedPrice: price,
        totalOrders: 0,
        paidOrders: 0,
        isPublished: true,
        instructorId: options.instructorId,
      };

      if (options.schoolId) {
        classData.schoolId = options.schoolId;
      }

      await storage.createClass(classData);

      results.successful++;
    } catch (error) {
      results.failed++;
      if (error instanceof ZodError) {
        results.errors.push(`Row ${results.successful + results.failed}: ${JSON.stringify(formatZodError(error))}`);
      } else if (error instanceof Error) {
        results.errors.push(`Row ${results.successful + results.failed}: ${error.message}`);
      } else {
        results.errors.push(`Row ${results.successful + results.failed}: Unknown error`);
      }
    }
  }

  return results;
}

export const uploadClassesCsv = async (req: Request, res: Response) => {
  try {
    const { records, columnMapping } = parseAndValidateCsvFile(req);

    const authUser = (req as any).user || (req as any).auth;
    const instructorId = authUser?.id || authUser?.dbUserId;

    if (!instructorId) {
      return res.status(401).json({ message: "Could not identify the authenticated user." });
    }

    const results = await processClassRecords(records, columnMapping, {
      instructorId,
    });

    return res.status(200).json({
      message: `Successfully imported ${results.successful} classes. Failed: ${results.failed}.`,
      processedCount: results.successful,
      failedCount: results.failed,
      errors: results.errors,
      success: results.successful > 0,
    });
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Error processing CSV upload:", error);
    return res.status(500).json({
      message: "Error processing CSV upload",
      error: error.message,
    });
  }
};

export const uploadSchoolClassesCsv = async (req: Request, res: Response) => {
  try {
    const { records, columnMapping } = parseAndValidateCsvFile(req);

    const authUser = (req as any).user || (req as any).auth;
    const instructorId = authUser?.id || authUser?.dbUserId;

    if (!instructorId) {
      return res.status(401).json({ message: "Could not identify the authenticated user." });
    }

    const schoolId = (req as any).auth?.payload?.school_id
      ? parseInt((req as any).auth.payload.school_id, 10)
      : authUser?.schoolId || authUser?.dbUserSchoolId || null;

    if (!schoolId) {
      return res.status(400).json({ message: "Could not determine your school. Please try again." });
    }

    console.log(`School CSV upload - instructorId: ${instructorId}, schoolId: ${schoolId}, records: ${records.length}`);

    const results = await processClassRecords(records, columnMapping, {
      instructorId,
      schoolId,
    });

    return res.status(200).json({
      message: `Successfully imported ${results.successful} classes. Failed: ${results.failed}.`,
      processedCount: results.successful,
      failedCount: results.failed,
      errors: results.errors,
      success: results.successful > 0,
    });
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Error processing school CSV upload:", error);
    return res.status(500).json({
      message: "Error processing CSV upload",
      error: error.message,
    });
  }
};
