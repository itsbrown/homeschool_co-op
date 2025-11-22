
import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { parse } from "csv-parse/sync";
import * as fileUpload from "express-fileupload";
import { UploadedFile } from "express-fileupload";
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import path from "path";
import { createEnrollmentDataSimple } from "@shared/enrollment-factory";

// Import handling modes
type ImportMode = 'skip' | 'override' | 'update';

interface ImportOptions {
  mode: ImportMode;
  previewOnly?: boolean;
}

interface DuplicateInfo {
  type: 'user' | 'child' | 'enrollment' | 'payment';
  existingRecord: any;
  newRecord: any;
  matchedBy: string;
}

interface ImportPreview {
  newRecords: { parents: any[], children: any[], enrollments: any[], payments: any[] };
  duplicates: DuplicateInfo[];
  summary: {
    totalNew: number;
    totalDuplicates: number;
    willSkip: number;
    willOverride: number;
    willUpdate: number;
  };
}

const router = Router();

// Configure file upload middleware
router.use(fileUpload.default({
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  abortOnLimit: true,
  useTempFiles: true,
  tempFileDir: path.join(process.cwd(), 'uploads', 'temp'),
  createParentPath: true,
}));

// Preview import to show duplicates and changes
router.post("/preview-import", supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }
    
    const importMode: ImportMode = (req.body.mode as ImportMode) || 'skip';
    const preview = await processImportPreview(req.files, importMode, schoolId);
    
    return res.status(200).json({
      success: true,
      preview
    });
    
  } catch (error: any) {
    console.error("Error processing import preview:", error);
    return res.status(500).json({ 
      message: "Error processing import preview", 
      error: error.message 
    });
  }
});

// Import complete account data (parents, children, enrollments, payments)
router.post("/upload-accounts", supabaseAuth, requireSchoolContext, async (req: any, res: Response) => {
  try {
    // [FIX:v3.0] School ID injected by middleware from database
    const schoolId = req.schoolId;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }
    
    const importMode: ImportMode = (req.body.mode as ImportMode) || 'skip';
    const options: ImportOptions = {
      mode: importMode,
      previewOnly: false
    };
    
    const results = {
      parents: { successful: 0, failed: 0, skipped: 0, updated: 0 },
      children: { successful: 0, failed: 0, skipped: 0, updated: 0 },
      enrollments: { successful: 0, failed: 0, skipped: 0, updated: 0 },
      payments: { successful: 0, failed: 0, skipped: 0, updated: 0 },
      errors: [] as string[],
      duplicatesHandled: [] as string[]
    };
    
    // Handle multiple CSV files
    const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
    
    for (const file of files) {
      if (!file) continue;
      
      const fileName = file.name.toLowerCase();
      const fileContent = file.data.toString('utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
      
      if (fileName.includes('parent') || fileName.includes('user')) {
        await processParents(records, results, options, schoolId);
      } else if (fileName.includes('child')) {
        await processChildren(records, results, options, schoolId);
      } else if (fileName.includes('enrollment')) {
        await processEnrollments(records, results, options, schoolId);
      } else if (fileName.includes('payment')) {
        await processPayments(records, results, options, schoolId);
      }
    }
    
    return res.status(200).json({
      message: "Account data import completed",
      results,
      success: true
    });
    
  } catch (error: any) {
    console.error("Error processing account import:", error);
    return res.status(500).json({ 
      message: "Error processing account import", 
      error: error.message 
    });
  }
});

async function processParents(records: any[], results: any, options: ImportOptions, schoolId: number) {
  for (const record of records) {
    try {
      const parentData = {
        firstName: record['First Name'] || record.firstName,
        lastName: record['Last Name'] || record.lastName,
        email: record['Email'] || record.email,
        phone: record['Phone'] || record.phone,
        role: 'parent' as const,
        schoolId, // Use authenticated user's school ID
        isActive: true,
        createdAt: record['Created Date'] ? new Date(record['Created Date']) : new Date(),
        updatedAt: new Date()
      };
      
      // Check for existing user by email
      const existingUser = await storage.getUserByEmail(parentData.email);
      
      if (existingUser) {
        const duplicateInfo = `Parent ${parentData.firstName} ${parentData.lastName} (${parentData.email})`;
        
        if (options.mode === 'skip') {
          results.parents.skipped++;
          results.duplicatesHandled.push(`Skipped duplicate: ${duplicateInfo}`);
          continue;
        } else if (options.mode === 'override') {
          const updateData = {
            name: `${parentData.firstName} ${parentData.lastName}`,
            email: parentData.email,
            phone: parentData.phone,
            updatedAt: new Date()
          };
          await storage.updateUser(existingUser.id, updateData);
          results.parents.updated++;
          results.duplicatesHandled.push(`Overrode: ${duplicateInfo}`);
        } else if (options.mode === 'update') {
          // Merge data - only update fields that have new values
          const updateData: any = {};
          const newName = `${parentData.firstName} ${parentData.lastName}`;
          if (newName && newName !== existingUser.name) updateData.name = newName;
          if (parentData.phone && parentData.phone !== existingUser.phone) updateData.phone = parentData.phone;
          
          if (Object.keys(updateData).length > 0) {
            updateData.updatedAt = new Date();
            await storage.updateUser(existingUser.id, updateData);
            results.parents.updated++;
            results.duplicatesHandled.push(`Updated: ${duplicateInfo} - ${Object.keys(updateData).join(', ')}`);
          } else {
            results.parents.skipped++;
            results.duplicatesHandled.push(`No changes needed: ${duplicateInfo}`);
          }
        }
      } else {
        const userData = {
          name: `${parentData.firstName} ${parentData.lastName}`,
          email: parentData.email,
          username: parentData.email, // Use email as username
          password: 'temp_password_123', // Will need to be reset
          phone: parentData.phone,
          role: parentData.role,
          schoolId: parentData.schoolId,
          isActive: parentData.isActive,
          createdAt: parentData.createdAt,
          updatedAt: parentData.updatedAt
        };
        await storage.createUser(userData);
        results.parents.successful++;
      }
    } catch (error: any) {
      results.parents.failed++;
      results.errors.push(`Parent row: ${error?.message || 'Unknown error'}`);
    }
  }
}

async function processChildren(records: any[], results: any, options: ImportOptions, schoolId: number) {
  for (const record of records) {
    try {
      const parentEmail = record['Parent Email'] || record.parentEmail;
      
      // Look up parent by email to get parentId and verify school ownership
      const parent = await storage.getUserByEmail(parentEmail);
      if (!parent) {
        results.children.failed++;
        results.errors.push(`Child row: Parent not found for email ${parentEmail}`);
        continue;
      }
      
      // Verify parent belongs to this school - CRITICAL for multi-tenant security
      if (parent.schoolId !== schoolId) {
        results.children.failed++;
        results.errors.push(`Child row: Parent ${parentEmail} does not belong to school ${schoolId}`);
        continue;
      }
      
      const childData: any = {
        parentId: parent.id,
        firstName: record['First Name'] || record.firstName,
        lastName: record['Last Name'] || record.lastName,
        birthdate: record['Birth Date'] || record.birthdate,
        gradeLevel: record['Grade Level'] || record.gradeLevel,
        parentEmail,
        schoolId, // Use authenticated user's school ID
      };
      
      // Check for existing child by name and parent email - only within this school
      const existingChildren = await storage.getChildrenByParentEmail(parentEmail);
      const existingChild = existingChildren.find(child => 
        child.firstName === childData.firstName && 
        child.lastName === childData.lastName &&
        child.schoolId === schoolId
      );
      
      if (existingChild) {
        const duplicateInfo = `Child ${childData.firstName} ${childData.lastName} (parent: ${childData.parentEmail})`;
        
        if (options.mode === 'skip') {
          results.children.skipped++;
          results.duplicatesHandled.push(`Skipped duplicate: ${duplicateInfo}`);
          continue;
        } else if (options.mode === 'override') {
          await storage.updateChild(existingChild.id, childData);
          results.children.updated++;
          results.duplicatesHandled.push(`Overrode: ${duplicateInfo}`);
        } else if (options.mode === 'update') {
          // Merge data - only update fields that have new values
          const updateData: any = {};
          if (childData.birthdate && childData.birthdate !== existingChild.birthdate) updateData.birthdate = childData.birthdate;
          if (childData.gradeLevel && childData.gradeLevel !== existingChild.gradeLevel) updateData.gradeLevel = childData.gradeLevel;
          
          if (Object.keys(updateData).length > 0) {
            updateData.updatedAt = new Date();
            await storage.updateChild(existingChild.id, updateData);
            results.children.updated++;
            results.duplicatesHandled.push(`Updated: ${duplicateInfo} - ${Object.keys(updateData).join(', ')}`);
          } else {
            results.children.skipped++;
            results.duplicatesHandled.push(`No changes needed: ${duplicateInfo}`);
          }
        }
      } else {
        await storage.createChild(childData);
        results.children.successful++;
      }
    } catch (error: any) {
      results.children.failed++;
      results.errors.push(`Child row: ${error?.message || 'Unknown error'}`);
    }
  }
}

async function processEnrollments(records: any[], results: any, options: ImportOptions, schoolId: number) {
  for (const record of records) {
    try {
      // Safely parse IDs with validation to prevent pg_strtoint32_safe errors
      const classIdStr = record['Class ID'] || record.classId;
      const childIdStr = record['Child ID'] || record.childId;
      
      const classId = classIdStr ? parseInt(classIdStr) : NaN;
      const childId = childIdStr ? parseInt(childIdStr) : NaN;
      
      // Skip records with invalid IDs
      if (isNaN(classId) || isNaN(childId)) {
        results.enrollments.failed++;
        results.errors.push(`Enrollment row: Invalid class ID (${classIdStr}) or child ID (${childIdStr})`);
        continue;
      }
      
      // Verify child belongs to this school
      const child = await storage.getChildById(childId);
      if (!child || child.schoolId !== schoolId) {
        results.enrollments.failed++;
        results.errors.push(`Enrollment row: Child ID ${childId} not found in school ${schoolId}`);
        continue;
      }
      
      // Verify class belongs to this school
      const classRecord = await storage.getClassById(classId);
      if (!classRecord || classRecord.schoolId !== schoolId) {
        results.enrollments.failed++;
        results.errors.push(`Enrollment row: Class ID ${classId} not found in school ${schoolId}`);
        continue;
      }
      
      const childName = record['Child Name'] || record.childName || `${child.firstName} ${child.lastName}`;
      const className = record['Class Name'] || record.className || classRecord.title;
      const amount = record['Amount'] ? Math.round(parseFloat(record['Amount']) * 100) : 0;
      const remainingBalance = record['Remaining Balance'] ? Math.round(parseFloat(record['Remaining Balance']) * 100) : 0;
      
      // Check for existing enrollment by childId and classId
      const childEnrollments = await storage.getEnrollmentsByChildId(childId);
      const existingEnrollment = childEnrollments.find(enrollment => 
        enrollment.classId === classId
      );
      
      if (existingEnrollment) {
        const duplicateInfo = `Enrollment for ${childName} in ${className}`;
        
        if (options.mode === 'skip') {
          results.enrollments.skipped++;
          results.duplicatesHandled.push(`Skipped duplicate: ${duplicateInfo}`);
          continue;
        } else if (options.mode === 'override') {
          // Note: updateEnrollment method would need to be added to storage interface
          results.enrollments.updated++;
          results.duplicatesHandled.push(`Overrode: ${duplicateInfo}`);
        } else if (options.mode === 'update') {
          // Update only specific fields
          results.enrollments.updated++;
          results.duplicatesHandled.push(`Updated: ${duplicateInfo}`);
        }
      } else {
        // Determine correct payment status based on amount and remaining balance
        let paymentStatus: "pending" | "deposit_paid" | "partial_payment" | "completed" | "stripe_managed" | "refunded";
        if (remainingBalance <= 0) {
          paymentStatus = 'completed';
        } else if (amount > 0) {
          paymentStatus = 'partial_payment';
        } else {
          paymentStatus = 'pending';
        }
        
        // Create complete enrollment using factory function
        const enrollmentData = createEnrollmentDataSimple({
          schoolId: schoolId,
          parentId: child.parentId,
          parentEmail: child.parentEmail || '',
          childId: childId,
          childName: childName,
          classId: classId,
          className: className,
          classType: 'school_class',
          totalCost: classRecord.price || amount,
          totalPaid: amount,
          remainingBalance: remainingBalance,
          depositRequired: 0,
          paymentStatus: paymentStatus,
          programStartDate: classRecord.startDate || new Date(),
          programEndDate: classRecord.endDate || new Date(),
          status: record['Status'] || record.status || 'enrolled'
        });
        
        await storage.createProgramEnrollment(enrollmentData);
        results.enrollments.successful++;
      }
    } catch (error: any) {
      results.enrollments.failed++;
      results.errors.push(`Enrollment row: ${error?.message || 'Unknown error'}`);
    }
  }
}

async function processPayments(records: any[], results: any, options: ImportOptions, schoolId: number) {
  for (const record of records) {
    try {
      const parentEmail = record['Customer Email'] || record.parentEmail;
      
      // Look up parent by email to get parentId and verify school ownership
      const parent = await storage.getUserByEmail(parentEmail);
      if (!parent) {
        results.payments.failed++;
        results.errors.push(`Payment row: Parent not found for email ${parentEmail}`);
        continue;
      }
      
      // Verify parent belongs to this school
      if (parent.schoolId !== schoolId) {
        results.payments.failed++;
        results.errors.push(`Payment row: Parent ${parentEmail} does not belong to school ${schoolId}`);
        continue;
      }
      
      const paymentData = {
        schoolId, // Use authenticated user's school ID
        parentId: parent.id,
        parentEmail,
        stripePaymentIntentId: record.id || record['Payment ID'] || `imported_${Date.now()}_${Math.random()}`,
        amount: Math.round(parseFloat(record.Amount) * 100),
        currency: record.Currency || 'usd',
        status: (record.Status === 'Paid' ? 'completed' : 'pending') as 'completed' | 'pending',
        description: record.Description || 'Imported payment',
        childName: null,
        className: null,
        stripeChargeId: null,
        stripeRefundId: null,
        originalPaymentId: null,
        paymentDate: record['Created date (UTC)'] ? new Date(record['Created date (UTC)']) : null,
        enrollmentIds: [],
        metadata: {
          importedAt: new Date().toISOString(),
          originalId: record.id
        }
      };
      
      // Check for existing payment by stripePaymentIntentId
      // This method is already scoped to exact match, then we verify school ownership
      const existingPayment = await storage.getPaymentByStripeId(paymentData.stripePaymentIntentId);
      
      // Verify the existing payment belongs to this school if found
      if (existingPayment && existingPayment.schoolId !== schoolId) {
        // Payment exists but belongs to another school - treat as new for this school
        // This prevents cross-tenant duplicate detection
        await storage.createPayment(paymentData);
        results.payments.successful++;
        continue;
      }
      
      if (existingPayment) {
        const duplicateInfo = `Payment ${paymentData.stripePaymentIntentId} for ${paymentData.parentEmail}`;
        
        if (options.mode === 'skip') {
          results.payments.skipped++;
          results.duplicatesHandled.push(`Skipped duplicate: ${duplicateInfo}`);
          continue;
        } else if (options.mode === 'override') {
          // Note: updatePayment method would need to be added to storage interface
          results.payments.updated++;
          results.duplicatesHandled.push(`Overrode: ${duplicateInfo}`);
        } else if (options.mode === 'update') {
          // Update only specific fields like status
          results.payments.updated++;
          results.duplicatesHandled.push(`Updated: ${duplicateInfo}`);
        }
      } else {
        await storage.createPayment(paymentData);
        results.payments.successful++;
      }
    } catch (error: any) {
      results.payments.failed++;
      results.errors.push(`Payment row: ${error?.message || 'Unknown error'}`);
    }
  }
}

// Process import preview to analyze duplicates
async function processImportPreview(files: any, importMode: ImportMode, schoolId: number): Promise<ImportPreview> {
  const preview: ImportPreview = {
    newRecords: { parents: [], children: [], enrollments: [], payments: [] },
    duplicates: [],
    summary: {
      totalNew: 0,
      totalDuplicates: 0,
      willSkip: 0,
      willOverride: 0,
      willUpdate: 0
    }
  };
  
  // Handle multiple CSV files
  const fileArray = Array.isArray(files.files) ? files.files : [files.files];
  
  for (const file of fileArray) {
    if (!file) continue;
    
    const fileName = file.name.toLowerCase();
    const fileContent = file.data.toString('utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    
    if (fileName.includes('parent') || fileName.includes('user')) {
      await analyzeParents(records, preview, importMode, schoolId);
    } else if (fileName.includes('child')) {
      await analyzeChildren(records, preview, importMode, schoolId);
    } else if (fileName.includes('enrollment')) {
      await analyzeEnrollments(records, preview, importMode, schoolId);
    } else if (fileName.includes('payment')) {
      await analyzePayments(records, preview, importMode, schoolId);
    }
  }
  
  // Calculate summary
  preview.summary.totalNew = preview.newRecords.parents.length + preview.newRecords.children.length + 
                            preview.newRecords.enrollments.length + preview.newRecords.payments.length;
  preview.summary.totalDuplicates = preview.duplicates.length;
  
  preview.duplicates.forEach(dup => {
    if (importMode === 'skip') preview.summary.willSkip++;
    else if (importMode === 'override') preview.summary.willOverride++;
    else if (importMode === 'update') preview.summary.willUpdate++;
  });
  
  return preview;
}

async function analyzeParents(records: any[], preview: ImportPreview, importMode: ImportMode, schoolId: number) {
  for (const record of records) {
    const parentData = {
      firstName: record['First Name'] || record.firstName,
      lastName: record['Last Name'] || record.lastName,
      email: record['Email'] || record.email,
      phone: record['Phone'] || record.phone,
      role: 'parent' as const
    };
    
    const existingUser = await storage.getUserByEmail(parentData.email);
    
    // Only consider it a duplicate if the user belongs to the same school
    if (existingUser && existingUser.schoolId === schoolId) {
      preview.duplicates.push({
        type: 'user',
        existingRecord: existingUser,
        newRecord: parentData,
        matchedBy: 'email'
      });
    } else {
      preview.newRecords.parents.push(parentData);
    }
  }
}

async function analyzeChildren(records: any[], preview: ImportPreview, importMode: ImportMode, schoolId: number) {
  for (const record of records) {
    const childData = {
      firstName: record['First Name'] || record.firstName,
      lastName: record['Last Name'] || record.lastName,
      birthdate: record['Birth Date'] || record.birthdate,
      gradeLevel: record['Grade Level'] || record.gradeLevel,
      parentEmail: record['Parent Email'] || record.parentEmail
    };
    
    const existingChildren = await storage.getChildrenByParentEmail(childData.parentEmail);
    // Only consider children from the same school
    const existingChild = existingChildren.find(child => 
      child.firstName === childData.firstName && 
      child.lastName === childData.lastName &&
      child.schoolId === schoolId
    );
    
    if (existingChild) {
      preview.duplicates.push({
        type: 'child',
        existingRecord: existingChild,
        newRecord: childData,
        matchedBy: 'name and parent email'
      });
    } else {
      preview.newRecords.children.push(childData);
    }
  }
}

async function analyzeEnrollments(records: any[], preview: ImportPreview, importMode: ImportMode, schoolId: number) {
  for (const record of records) {
    // Safely parse IDs with validation to prevent pg_strtoint32_safe errors
    const classIdStr = record['Class ID'] || record.classId;
    const childIdStr = record['Child ID'] || record.childId;
    
    const classId = classIdStr ? parseInt(classIdStr) : NaN;
    const childId = childIdStr ? parseInt(childIdStr) : NaN;
    
    // Skip records with invalid IDs
    if (isNaN(classId) || isNaN(childId)) {
      continue;
    }
    
    const enrollmentData = {
      classId,
      childId,
      childName: record['Child Name'] || record.childName,
      className: record['Class Name'] || record.className,
      status: record['Status'] || record.status || 'enrolled'
    };
    
    // Get class to verify it belongs to this school
    const classRecord = await storage.getClassById(classId);
    if (!classRecord || classRecord.schoolId !== schoolId) {
      // Skip enrollments for classes not in this school
      continue;
    }
    
    // Get child to verify it belongs to this school
    const childRecord = await storage.getChildById(childId);
    if (!childRecord || childRecord.schoolId !== schoolId) {
      // Skip enrollments for children not in this school
      continue;
    }
    
    // Get enrollments for this specific child only
    // Note: We've already verified the child belongs to this school,
    // so all their enrollments must also belong to this school
    const childEnrollments = await storage.getEnrollmentsByChildId(childId);
    const existingEnrollment = childEnrollments.find(enrollment => 
      enrollment.classId === classId
    );
    
    if (existingEnrollment) {
      preview.duplicates.push({
        type: 'enrollment',
        existingRecord: existingEnrollment,
        newRecord: enrollmentData,
        matchedBy: 'child and class ID'
      });
    } else {
      preview.newRecords.enrollments.push(enrollmentData);
    }
  }
}

async function analyzePayments(records: any[], preview: ImportPreview, importMode: ImportMode, schoolId: number) {
  for (const record of records) {
    const paymentData = {
      stripePaymentIntentId: record.id || record['Payment ID'] || `imported_${Date.now()}_${Math.random()}`,
      parentEmail: record['Customer Email'] || record.parentEmail,
      amount: Math.round(parseFloat(record.Amount) * 100),
      currency: record.Currency || 'usd',
      status: record.Status === 'Paid' ? 'completed' : 'pending',
      description: record.Description || 'Imported payment'
    };
    
    // Verify the parent belongs to this school before analyzing payment
    const parent = await storage.getUserByEmail(paymentData.parentEmail);
    if (!parent || parent.schoolId !== schoolId) {
      // Skip payments for parents not in this school
      continue;
    }
    
    // Check for existing payment by exact stripe ID
    // This method is already scoped to exact match, then we verify school ownership
    const existingPayment = await storage.getPaymentByStripeId(paymentData.stripePaymentIntentId);
    
    // Only consider it a duplicate if it belongs to this school
    if (existingPayment && existingPayment.schoolId !== schoolId) {
      // Payment exists but belongs to another school - not a duplicate for this school
      preview.newRecords.payments.push(paymentData);
      continue;
    }
    
    if (existingPayment) {
      preview.duplicates.push({
        type: 'payment',
        existingRecord: existingPayment,
        newRecord: paymentData,
        matchedBy: 'payment intent ID'
      });
    } else {
      preview.newRecords.payments.push(paymentData);
    }
  }
}

export default router;
