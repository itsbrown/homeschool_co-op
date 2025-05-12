import { Request, Response } from "express";
import { storage } from "../storage";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import { ZodError } from "zod";
import { formatZodError } from "../utils";
import { UploadedFile } from "express-fileupload";

// Process classes CSV upload
export const uploadClassesCsv = async (req: Request, res: Response) => {
  try {
    // Note: Authentication and role checks are now handled by middleware
    
    // Check if file was uploaded
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    
    const uploadedFile = req.files.file as UploadedFile;
    
    // Verify file type
    if (!uploadedFile.name.toLowerCase().endsWith('.csv')) {
      return res.status(400).json({ message: "Only CSV files are allowed" });
    }
    
    // Read the uploaded file
    const fileContent = uploadedFile.data.toString('utf-8');

    // Parse the CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
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
        
        // Calculate session details based on hours
        const hoursMatch = hours.match(/(\d+)\s+hours/);
        let durationWeeks = 36; // Default to 36 weeks (standard school year)
        let sessionsPerWeek = 5; // Default to 5 sessions per week
        let sessionLengthMinutes = 50; // Default to 50 minutes per session
        
        if (hoursMatch && hoursMatch.length >= 2) {
          const totalHours = parseInt(hoursMatch[1], 10);
          const totalMinutes = totalHours * 60;
          // Calculate based on 36-week school year
          const minutesPerWeek = totalMinutes / durationWeeks;
          sessionLengthMinutes = Math.round(minutesPerWeek / sessionsPerWeek);
        }
        
        // Set capacity based on the class type
        const capacity = 20; // Default capacity
        
        // Create a date range for the school year (starting now, ending in 9 months)
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 9);
        
        // Get the first instructor in the system, or the current user
        let instructorName = "Staff Instructor";
        
        // Validate and transform the record
        const classData = {
          title: record['Class Name'] || '',
          description: description.trim(),
          category: 'academic',
          startDate,
          endDate,
          durationWeeks,
          sessionsPerWeek,
          sessionLengthMinutes,
          gradeLevels,
          capacity,
          location: 'On-site',
          instructorName,
          price,
          suggestedPrice: price, // Set the same as regular price initially
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

    // Send the results
    return res.status(200).json({
      message: `Successfully imported ${results.successful} classes. Failed: ${results.failed}.`,
      processedCount: results.successful,
      failedCount: results.failed,
      errors: results.errors,
    });
  } catch (error: any) {
    console.error("Error processing CSV upload:", error);
    return res.status(500).json({ 
      message: "Error processing CSV upload", 
      error: error.message 
    });
  }
};

// Helper function to safely parse CSV fields
function parseField(value: string | undefined, defaultValue: any): any {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return value;
}