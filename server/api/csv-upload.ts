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
    
    // Check for column mappings from the frontend
    let columnMapping: Record<string, string> = {};
    try {
      if (req.body.mapping) {
        columnMapping = JSON.parse(req.body.mapping);
        console.log("Received column mapping:", columnMapping);
      }
    } catch (error) {
      console.error("Error parsing mapping data:", error);
      // Continue without mapping if there's an error
    }
    
    // Read the uploaded file
    const fileContent = uploadedFile.data.toString('utf-8');

    // Parse the CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    
    // Log the first record to debug what fields are available
    console.log("First CSV record:", records[0]);

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
        // Helper function to get mapped fields with fallbacks
        const getValue = (fieldKey: string, defaultFieldNames: string[]): string => {
          // First try using the mapping
          if (columnMapping[fieldKey] && record[columnMapping[fieldKey]]) {
            return record[columnMapping[fieldKey]];
          }
          
          // Then try default field names
          for (const fieldName of defaultFieldNames) {
            if (record[fieldName] && record[fieldName].trim()) {
              return record[fieldName];
            }
          }
          
          return '';
        };
        
        // Extract title (required)
        const title = getValue('title', ['Class Name', 'Title', 'Name', 'Course Title']);
        if (!title) {
          throw new Error('Class title is required');
        }
        
        // Build description from available fields
        let description = getValue('description', ['Description', 'Class Description', 'Details']);
        const subjects = getValue('subjects', ['Subjects Covered', 'Subjects', 'Topics']);
        const learningObjectives = getValue('learningObjectives', ['Learning Objectives', 'Objectives', 'Goals']);
        const materials = getValue('materials', ['Curriculum Materials', 'Materials', 'Resources']);
        
        // If no direct description, build one from components
        if (!description) {
          let descParts = [];
          if (subjects) descParts.push(`Subjects: ${subjects}`);
          if (learningObjectives) descParts.push(`Learning Objectives: ${learningObjectives}`);
          if (materials) descParts.push(`Materials: ${materials}`);
          if (record['Teaching Methods']) descParts.push(`Teaching Methods: ${record['Teaching Methods']}`);
          if (record['Sample Activities']) descParts.push(`Sample Activities: ${record['Sample Activities']}`);
          
          description = descParts.join('\n\n');
          
          // Default description if nothing else
          if (!description) {
            description = `${title} class`;
          }
        }
        
        // Extract dates with fallbacks
        let startDate: Date | null = null;
        const startDateStr = getValue('startDate', ['Start Date', 'Begin Date', 'Class Start']);
        try {
          startDate = startDateStr ? new Date(startDateStr) : new Date();
        } catch (e) {
          startDate = new Date();
        }
        
        let endDate: Date | null = null;
        const endDateStr = getValue('endDate', ['End Date', 'Finish Date', 'Class End']);
        try {
          endDate = endDateStr ? new Date(endDateStr) : new Date(startDate);
          if (endDate <= startDate) {
            // Default to 3 months after start
            endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 3);
          }
        } catch (e) {
          endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + 3);
        }
        
        // Extract grade levels
        let gradeLevels: string[] = [];
        const gradeLevelStr = getValue('gradeLevels', ['Grade Levels', 'Grades', 'Level', 'Age/Grade Range']);
        
        if (gradeLevelStr) {
          // Parse grade levels from string
          gradeLevels = gradeLevelStr.split(/[,;-]/).map(g => g.trim());
        } else {
          gradeLevels = ['K-12']; // Default
        }
        
        // Extract durations
        const durationWeeksStr = getValue('durationWeeks', ['Duration (weeks)', 'Weeks', 'Term Length']);
        const durationWeeks = parseInt(durationWeeksStr || '10', 10);
        
        const sessionsPerWeekStr = getValue('sessionsPerWeek', ['Sessions Per Week', 'Weekly Sessions']);
        const sessionsPerWeek = parseInt(sessionsPerWeekStr || '1', 10);
        
        const sessionLengthStr = getValue('sessionLengthMinutes', ['Session Length (min)', 'Minutes', 'Duration']);
        const sessionLengthMinutes = parseInt(sessionLengthStr || '60', 10);
        
        // Extract price - convert to cents
        let price = 0;
        const priceStr = getValue('price', ['Price', 'Cost', 'Fee', 'Pricing', 'Tuition']);
        if (priceStr) {
          // Handle $ in price
          if (priceStr.includes('$')) {
            const priceMatch = priceStr.match(/\$(\d+(\.\d+)?)/);
            if (priceMatch && priceMatch.length >= 2) {
              price = Math.round(parseFloat(priceMatch[1]) * 100);
            }
          } else {
            price = Math.round(parseFloat(priceStr) * 100);
          }
        }
        
        // Extract other fields
        const capacity = parseInt(getValue('capacity', ['Capacity', 'Max Students', 'Class Size']) || '20', 10);
        const instructorName = getValue('instructorName', ['Instructor', 'Teacher', 'Faculty']) || 'Staff Instructor';
        const sessionDays = getValue('sessionDays', ['Session Days', 'Days', 'Class Days']) || 'Monday-Friday';
        const category = getValue('category', ['Category', 'Class Type', 'Type']) || 'academic';
        const categoryName = getValue('categoryName', ['Category Name', 'Program', 'Term']) || 'SPRING 2025 PROGRAM';
        
        console.log(`Processing class: ${title}, Price: ${price}, Start: ${startDate}`);
        
        // Map data to class structure
        const classData = {
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
          instructorId: req.session.userId,
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
      success: results.successful > 0,
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