
import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { parse } from "csv-parse/sync";
import { UploadedFile } from "express-fileupload";

const router = Router();

// Import complete account data (parents, children, enrollments, payments)
router.post("/upload-accounts", async (req: Request, res: Response) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }
    
    const results = {
      parents: { successful: 0, failed: 0 },
      children: { successful: 0, failed: 0 },
      enrollments: { successful: 0, failed: 0 },
      payments: { successful: 0, failed: 0 },
      errors: [] as string[]
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
        await processParents(records, results);
      } else if (fileName.includes('child')) {
        await processChildren(records, results);
      } else if (fileName.includes('enrollment')) {
        await processEnrollments(records, results);
      } else if (fileName.includes('payment')) {
        await processPayments(records, results);
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

async function processParents(records: any[], results: any) {
  for (const record of records) {
    try {
      const parentData = {
        firstName: record['First Name'] || record.firstName,
        lastName: record['Last Name'] || record.lastName,
        email: record['Email'] || record.email,
        phone: record['Phone'] || record.phone,
        role: 'parent' as const,
        schoolId: req.session.schoolId || 1,
        isActive: true,
        createdAt: record['Created Date'] ? new Date(record['Created Date']) : new Date(),
        updatedAt: new Date()
      };
      
      await storage.createUser(parentData);
      results.parents.successful++;
    } catch (error) {
      results.parents.failed++;
      results.errors.push(`Parent row: ${error.message}`);
    }
  }
}

async function processChildren(records: any[], results: any) {
  for (const record of records) {
    try {
      const childData = {
        firstName: record['First Name'] || record.firstName,
        lastName: record['Last Name'] || record.lastName,
        birthdate: record['Birth Date'] || record.birthdate,
        gradeLevel: record['Grade Level'] || record.gradeLevel,
        parentEmail: record['Parent Email'] || record.parentEmail,
        schoolId: req.session.schoolId || 1,
        createdAt: record['Created Date'] ? new Date(record['Created Date']) : new Date(),
        updatedAt: new Date()
      };
      
      await storage.createChild(childData);
      results.children.successful++;
    } catch (error) {
      results.children.failed++;
      results.errors.push(`Child row: ${error.message}`);
    }
  }
}

async function processEnrollments(records: any[], results: any) {
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
      
      await storage.createEnrollment(enrollmentData);
      results.enrollments.successful++;
    } catch (error) {
      results.enrollments.failed++;
      results.errors.push(`Enrollment row: ${error.message}`);
    }
  }
}

async function processPayments(records: any[], results: any) {
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
      
      await storage.createPayment(paymentData);
      results.payments.successful++;
    } catch (error) {
      results.payments.failed++;
      results.errors.push(`Payment row: ${error.message}`);
    }
  }
}

export default router;
