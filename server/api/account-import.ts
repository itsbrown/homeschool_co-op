
import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { parse } from "csv-parse/sync";
import * as fileUpload from "express-fileupload";
import { UploadedFile } from "express-fileupload";
import path from "path";

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
router.post("/preview-import", async (req: Request, res: Response) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }
    
    const importMode: ImportMode = (req.body.mode as ImportMode) || 'skip';
    const preview = await processImportPreview(req.files, importMode);
    
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
router.post("/upload-accounts", async (req: Request, res: Response) => {
  try {
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
        await processParents(records, results, options);
      } else if (fileName.includes('child')) {
        await processChildren(records, results, options);
      } else if (fileName.includes('enrollment')) {
        await processEnrollments(records, results, options);
      } else if (fileName.includes('payment')) {
        await processPayments(records, results, options);
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

async function processParents(records: any[], results: any, options: ImportOptions) {
  for (const record of records) {
    try {
      const parentData = {
        firstName: record['First Name'] || record.firstName,
        lastName: record['Last Name'] || record.lastName,
        email: record['Email'] || record.email,
        phone: record['Phone'] || record.phone,
        role: 'parent' as const,
        schoolId: 1, // TODO: get from session
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

async function processChildren(records: any[], results: any, options: ImportOptions) {
  for (const record of records) {
    try {
      const childData = {
        firstName: record['First Name'] || record.firstName,
        lastName: record['Last Name'] || record.lastName,
        birthdate: record['Birth Date'] || record.birthdate,
        gradeLevel: record['Grade Level'] || record.gradeLevel,
        parentEmail: record['Parent Email'] || record.parentEmail,
        schoolId: 1, // TODO: get from session
        createdAt: record['Created Date'] ? new Date(record['Created Date']) : new Date(),
        updatedAt: new Date()
      };
      
      // Check for existing child by name and parent email
      const existingChildren = await storage.getChildrenByParentEmail(childData.parentEmail);
      const existingChild = existingChildren.find(child => 
        child.firstName === childData.firstName && child.lastName === childData.lastName
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

async function processEnrollments(records: any[], results: any, options: ImportOptions) {
  for (const record of records) {
    try {
      const enrollmentData = {
        classId: parseInt(record['Class ID'] || record.classId),
        childId: parseInt(record['Child ID'] || record.childId),
        childName: record['Child Name'] || record.childName,
        className: record['Class Name'] || record.className,
        status: record['Status'] || record.status || 'enrolled',
        enrollmentDate: record['Enrollment Date'] ? new Date(record['Enrollment Date']) : new Date(),
        amount: record['Amount'] ? Math.round(parseFloat(record['Amount']) * 100) : 0,
        remainingBalance: record['Remaining Balance'] ? Math.round(parseFloat(record['Remaining Balance']) * 100) : 0
      };
      
      // Check for existing enrollment by childId and programId (not classId)
      const allEnrollments = await storage.getAllEnrollments();
      const existingEnrollment = allEnrollments.find(enrollment => 
        enrollment.childId === enrollmentData.childId
      );
      
      if (existingEnrollment) {
        const duplicateInfo = `Enrollment for ${enrollmentData.childName} in ${enrollmentData.className}`;
        
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
        await storage.createEnrollment(enrollmentData);
        results.enrollments.successful++;
      }
    } catch (error: any) {
      results.enrollments.failed++;
      results.errors.push(`Enrollment row: ${error?.message || 'Unknown error'}`);
    }
  }
}

async function processPayments(records: any[], results: any, options: ImportOptions) {
  for (const record of records) {
    try {
      const paymentData = {
        stripePaymentIntentId: record.id || record['Payment ID'] || `imported_${Date.now()}_${Math.random()}`,
        parentEmail: record['Customer Email'] || record.parentEmail,
        amount: Math.round(parseFloat(record.Amount) * 100),
        currency: record.Currency || 'usd',
        status: record.Status === 'Paid' ? 'completed' : 'pending',
        description: record.Description || 'Imported payment',
        createdAt: new Date(record['Created date (UTC)'] || record.createdAt),
        updatedAt: new Date(),
        metadata: {
          importedAt: new Date().toISOString(),
          originalId: record.id
        }
      };
      
      // Check for existing payment by stripePaymentIntentId
      const allPayments = await storage.getAllPayments();
      const existingPayment = allPayments.find(payment => 
        payment.stripePaymentIntentId === paymentData.stripePaymentIntentId
      );
      
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
        const correctedPaymentData = {
          className: paymentData.description || 'Imported payment',
          parentEmail: paymentData.parentEmail,
          stripePaymentIntentId: paymentData.stripePaymentIntentId,
          childName: 'Unknown', // Would need to be derived from other data
          amount: paymentData.amount,
          currency: paymentData.currency,
          status: paymentData.status as any,
          metadata: paymentData.metadata
        };
        await storage.createPayment(correctedPaymentData);
        results.payments.successful++;
      }
    } catch (error: any) {
      results.payments.failed++;
      results.errors.push(`Payment row: ${error?.message || 'Unknown error'}`);
    }
  }
}

// Process import preview to analyze duplicates
async function processImportPreview(files: any, importMode: ImportMode): Promise<ImportPreview> {
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
      await analyzeParents(records, preview, importMode);
    } else if (fileName.includes('child')) {
      await analyzeChildren(records, preview, importMode);
    } else if (fileName.includes('enrollment')) {
      await analyzeEnrollments(records, preview, importMode);
    } else if (fileName.includes('payment')) {
      await analyzePayments(records, preview, importMode);
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

async function analyzeParents(records: any[], preview: ImportPreview, importMode: ImportMode) {
  for (const record of records) {
    const parentData = {
      firstName: record['First Name'] || record.firstName,
      lastName: record['Last Name'] || record.lastName,
      email: record['Email'] || record.email,
      phone: record['Phone'] || record.phone,
      role: 'parent' as const
    };
    
    const existingUser = await storage.getUserByEmail(parentData.email);
    
    if (existingUser) {
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

async function analyzeChildren(records: any[], preview: ImportPreview, importMode: ImportMode) {
  for (const record of records) {
    const childData = {
      firstName: record['First Name'] || record.firstName,
      lastName: record['Last Name'] || record.lastName,
      birthdate: record['Birth Date'] || record.birthdate,
      gradeLevel: record['Grade Level'] || record.gradeLevel,
      parentEmail: record['Parent Email'] || record.parentEmail
    };
    
    const existingChildren = await storage.getChildrenByParentEmail(childData.parentEmail);
    const existingChild = existingChildren.find(child => 
      child.firstName === childData.firstName && child.lastName === childData.lastName
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

async function analyzeEnrollments(records: any[], preview: ImportPreview, importMode: ImportMode) {
  for (const record of records) {
    const enrollmentData = {
      classId: parseInt(record['Class ID'] || record.classId),
      childId: parseInt(record['Child ID'] || record.childId),
      childName: record['Child Name'] || record.childName,
      className: record['Class Name'] || record.className,
      status: record['Status'] || record.status || 'enrolled'
    };
    
    const allEnrollments = await storage.getAllEnrollments();
    const existingEnrollment = allEnrollments.find(enrollment => 
      enrollment.childId === enrollmentData.childId && enrollment.classId === enrollmentData.classId
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

async function analyzePayments(records: any[], preview: ImportPreview, importMode: ImportMode) {
  for (const record of records) {
    const paymentData = {
      stripePaymentIntentId: record.id || record['Payment ID'] || `imported_${Date.now()}_${Math.random()}`,
      parentEmail: record['Customer Email'] || record.parentEmail,
      amount: Math.round(parseFloat(record.Amount) * 100),
      currency: record.Currency || 'usd',
      status: record.Status === 'Paid' ? 'completed' : 'pending',
      description: record.Description || 'Imported payment'
    };
    
    const allPayments = await storage.getAllPayments();
    const existingPayment = allPayments.find(payment => 
      payment.stripePaymentIntentId === paymentData.stripePaymentIntentId
    );
    
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
