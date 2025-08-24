
import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { parse } from "csv-parse/sync";
import { UploadedFile } from "express-fileupload";

const router = Router();

// Import payment data from CSV
router.post("/upload-payments", async (req: Request, res: Response) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    
    const uploadedFile = req.files.file as UploadedFile;
    
    if (!uploadedFile.name.toLowerCase().endsWith('.csv')) {
      return res.status(400).json({ message: "Only CSV files are allowed" });
    }
    
    const fileContent = uploadedFile.data.toString('utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };
    
    for (const record of records) {
      try {
        // Extract payment data
        const paymentData = {
          stripePaymentIntentId: record.id || `imported_${Date.now()}_${Math.random()}`,
          parentEmail: record['Customer Email'] || record['parentEmail (metadata)'],
          amount: Math.round(parseFloat(record.Amount) * 100), // Convert to cents
          currency: record.Currency || 'usd',
          status: record.Status === 'Paid' ? 'completed' : 'pending',
          description: record.Description || 'Imported payment',
          createdAt: new Date(record['Created date (UTC)']),
          updatedAt: new Date(),
          paymentType: record['paymentType (metadata)'] || 'full_payment',
          enrollmentIds: record['enrollmentIds (metadata)'] ? 
            JSON.parse(record['enrollmentIds (metadata)']) : [],
          metadata: {
            originalStripeId: record.id,
            importedAt: new Date().toISOString(),
            feeAmount: record.Fee ? Math.round(parseFloat(record.Fee) * 100) : 0,
            customerId: record['Customer ID'],
            invoiceId: record['Invoice ID']
          }
        };
        
        // Create payment record
        await storage.createPayment(paymentData);
        
        // If we have enrollment IDs, update enrollment status
        if (paymentData.enrollmentIds.length > 0) {
          for (const enrollmentId of paymentData.enrollmentIds) {
            try {
              await storage.updateEnrollment(enrollmentId, {
                status: 'enrolled',
                paymentIntentId: paymentData.stripePaymentIntentId,
                remainingBalance: 0
              });
            } catch (enrollmentError) {
              console.warn(`Could not update enrollment ${enrollmentId}:`, enrollmentError);
            }
          }
        }
        
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${results.successful + results.failed}: ${error.message}`);
      }
    }
    
    return res.status(200).json({
      message: `Successfully imported ${results.successful} payments. Failed: ${results.failed}.`,
      processedCount: results.successful,
      failedCount: results.failed,
      errors: results.errors,
      success: results.successful > 0,
    });
    
  } catch (error: any) {
    console.error("Error processing payment import:", error);
    return res.status(500).json({ 
      message: "Error processing payment import", 
      error: error.message 
    });
  }
});

export default router;
