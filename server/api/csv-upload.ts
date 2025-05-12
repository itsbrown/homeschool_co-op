import { Request, Response } from "express";
import { storage } from "../storage";
import { parse } from "csv-parse/sync";
import multer from "multer";
import fs from "fs";
import path from "path";
import { ZodError } from "zod";
import { formatZodError } from "../utils";

// Extended request interface to include multer file
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Configure multer for file upload
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Process classes CSV upload
export const uploadClassesCsv = [
  upload.single('file'),
  async (req: MulterRequest, res: Response) => {
    try {
      // Check for authentication
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Check for admin role
      if (req.session.userRole !== "admin") {
        return res.status(403).json({ message: "Only administrators can upload class data" });
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Verify file type
      if (path.extname(req.file.originalname).toLowerCase() !== '.csv') {
        // Clean up the uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "Only CSV files are allowed" });
      }

      // Read the uploaded file
      const fileContent = fs.readFileSync(req.file.path, { encoding: 'utf-8' });

      // Parse the CSV
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      if (records.length === 0) {
        // Clean up the uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "The CSV file is empty" });
      }

      // Process the CSV records and create classes
      const results = {
        successful: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const record of records) {
        try {
          // Extract age/grade range
          let minAge = 5;
          let maxAge = 18;
          let gradeLevels: string[] = [];
          
          const ageGradeRange = record['Age/Grade Range'] || '';
          
          if (ageGradeRange.includes('Ages')) {
            // Format: "Ages 0–3" or "Ages 4–5 (PreK–K)"
            const ageRange = ageGradeRange.match(/Ages\s+(\d+)[\u2013\-](\d+)/);
            if (ageRange && ageRange.length >= 3) {
              minAge = parseInt(ageRange[1], 10);
              maxAge = parseInt(ageRange[2], 10);
            }
          } else if (ageGradeRange.includes('Grades')) {
            // Format: "Grades 1–2" or "Grades 3–5"
            const gradeRange = ageGradeRange.match(/Grades\s+(\d+)[\u2013\-](\d+)/);
            if (gradeRange && gradeRange.length >= 3) {
              const minGrade = parseInt(gradeRange[1], 10);
              const maxGrade = parseInt(gradeRange[2], 10);
              
              // Convert grades to ages (approximate)
              minAge = minGrade + 5;
              maxAge = maxGrade + 5;
              
              // Generate grade levels array
              for (let i = minGrade; i <= maxGrade; i++) {
                let gradeSuffix = 'th';
                if (i === 1) gradeSuffix = 'st';
                else if (i === 2) gradeSuffix = 'nd';
                else if (i === 3) gradeSuffix = 'rd';
                
                gradeLevels.push(`${i}${gradeSuffix} Grade`);
              }
            }
          }
          
          // Extract subjects as a description
          const subjects = record['Subjects Covered'] || '';
          
          // Extract and convert hours to schedule
          const hours = record['Instructional Hours'] || '';
          const hoursMatch = hours.match(/(\d+)\s+hours/);
          let schedule = 'Flexible schedule';
          if (hoursMatch && hoursMatch.length >= 2) {
            const totalHours = parseInt(hoursMatch[1], 10);
            schedule = `${totalHours} hours annually, schedule TBD`;
          }
          
          // Extract pricing
          let price = 0;
          const pricing = record['Pricing'] || '';
          const priceMatch = pricing.match(/\$(\d+)/);
          if (priceMatch && priceMatch.length >= 2) {
            price = parseInt(priceMatch[1], 10);
          }
          
          // Learning objectives as description
          const learningObjectives = record['Learning Objectives'] || '';
          
          // Materials as added benefits
          const materials = record['Curriculum Materials'] || '';
          
          // Build description from available fields
          let description = '';
          if (subjects) description += `Subjects: ${subjects}\n\n`;
          if (learningObjectives) description += `Learning Objectives: ${learningObjectives}\n\n`;
          if (materials) description += `Materials: ${materials}\n\n`;
          if (record['Teaching Methods']) description += `Teaching Methods: ${record['Teaching Methods']}\n\n`;
          if (record['Sample Activities']) description += `Sample Activities: ${record['Sample Activities']}\n\n`;
          if (record['Assessments']) description += `Assessments: ${record['Assessments']}\n\n`;
          
          // Validate and transform the record
          const classData = {
            title: record['Class Name'] || '',
            description: description.trim(),
            category: 'academic',
            maxCapacity: 20,
            minAge,
            maxAge,
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            schedule,
            location: 'On-site',
            price,
            gradeLevels,
            status: "published" as "published" | "draft" | "archived",
            isPublished: true,
            instructorId: req.session.userId, // Default to the current admin user
          };

          // Create the class
          await storage.createClass({
            ...classData,
            instructorId: req.session.userId,
          });

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

      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);

      // Send the results
      return res.status(200).json({
        message: `Successfully imported ${results.successful} classes. Failed: ${results.failed}.`,
        processedCount: results.successful,
        failedCount: results.failed,
        errors: results.errors,
      });
    } catch (error: any) {
      // Clean up the uploaded file if it exists
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }

      console.error("Error processing CSV upload:", error);
      return res.status(500).json({ 
        message: "Error processing CSV upload", 
        error: error.message 
      });
    }
  }
];

// Helper function to safely parse CSV fields
function parseField(value: string | undefined, defaultValue: any): any {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return value;
}