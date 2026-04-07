
import { Router } from "express";
import { z } from "zod";
import * as brevo from '@getbrevo/brevo';
import { supabaseStorage } from "../supabase-storage";
import { storage } from "../storage";
import { getBrevoApiInstance, logEmailAttempt } from "../lib/email-service";

const router = Router();

// Use the single shared Brevo instance from email-service.ts
const brevoApiInstance = getBrevoApiInstance();

// School application schema
const schoolApplicationSchema = z.object({
  // School Information
  schoolName: z.string().min(1, "School name is required"),
  schoolType: z.enum(["public", "private", "charter", "homeschool_coop", "other"]),
  schoolTypeOther: z.string().optional(),
  
  // Contact Information
  adminFirstName: z.string().min(1, "First name is required"),
  adminLastName: z.string().min(1, "Last name is required"),
  adminEmail: z.string().email("Valid email is required"),
  adminPhone: z.string().min(1, "Phone number is required"),
  
  // School Details
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().min(1, "ZIP code is required"),
  website: z.string().url().optional().or(z.literal("")),
  
  // School Stats
  currentStudentCount: z.number().min(0),
  gradelevelsServed: z.array(z.string()).min(1, "At least one grade level required"),
  establishedYear: z.number().min(1800).max(new Date().getFullYear()),
  
  // Platform Interest
  reasonForJoining: z.string().min(50, "Please provide at least 50 characters explaining why you want to join"),
  currentChallenges: z.string().min(30, "Please describe your current educational challenges"),
  expectedStudentGrowth: z.number().min(0),
  
  // References
  reference1Name: z.string().min(1, "Reference name is required"),
  reference1Email: z.string().email("Valid reference email is required"),
  reference1Relationship: z.string().min(1, "Relationship to reference is required"),
  reference2Name: z.string().optional(),
  reference2Email: z.string().email().optional().or(z.literal("")),
  reference2Relationship: z.string().optional(),
  
  // Agreement
  agreesToTerms: z.boolean().refine(val => val === true, "You must agree to the terms"),
  agreesToDataSharing: z.boolean().refine(val => val === true, "You must agree to data sharing policy")
});

// Helper function to generate token
function generateApplicationToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Send application confirmation email
async function sendApplicationConfirmationEmail(email: string, schoolName: string, applicationId: string): Promise<boolean> {
  try {
    if (!brevoApiInstance) {
      console.log('📧 Brevo not configured, skipping application confirmation email');
      await logEmailAttempt({ recipientEmail: email, type: 'application_confirmation', subject: `School Application Received - ${schoolName}`, status: 'failed', error: 'Brevo not configured' });
      return false;
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4F46E5; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Application Received</h1>
          <p style="color: #E0E7FF; margin: 8px 0 0 0;">ASA Platform</p>
        </div>
        
        <div style="padding: 24px;">
          <h2 style="color: #333;">Thank you for your school application!</h2>
          <p>Dear Administrator,</p>
          <p>We have received your application for <strong>${schoolName}</strong> to join the ASA Platform.</p>
          
          <div style="background-color: #F3F4F6; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 8px 0; color: #4F46E5;">Application Details:</h3>
            <p style="margin: 4px 0;"><strong>School:</strong> ${schoolName}</p>
            <p style="margin: 4px 0;"><strong>Application ID:</strong> ${applicationId}</p>
            <p style="margin: 4px 0;"><strong>Status:</strong> Under Review</p>
          </div>
          
          <p><strong>What happens next?</strong></p>
          <ol>
            <li>Our team will review your application within 3-5 business days</li>
            <li>We may contact your references for verification</li>
            <li>You'll receive an email with our decision</li>
            <li>If approved, you'll receive setup instructions and platform access</li>
          </ol>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            If you have any questions, please contact our support team at support@americanseekersacademy.com
          </p>
        </div>
      </div>
    `;

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.to = [{ email: email }];
    sendSmtpEmail.sender = { email: 'contact@americanseekersacademy.com', name: 'ASA Platform' };
    const subject = `School Application Received - ${schoolName}`;
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;

    const result = await Promise.race([
      brevoApiInstance.sendTransacEmail(sendSmtpEmail),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout:application_confirmation:${email}`)), 10000)
      ),
    ]);
    console.log(`✅ Application confirmation email sent to ${email}`);
    await logEmailAttempt({ recipientEmail: email, type: 'application_confirmation', subject, status: 'sent' });
    return true;
  } catch (error: any) {
    const isTimeout = error?.message?.startsWith('timeout:');
    const isIpBlocked = error?.body?.code === 'unauthorized' || error?.statusCode === 401;
    if (isTimeout) {
      console.error(`[Email timeout] application_confirmation email to ${email} timed out after 10s`);
      await logEmailAttempt({ recipientEmail: email, type: 'application_confirmation', subject: `School Application Received - ${schoolName}`, status: 'timeout', error: 'Timed out after 10s' });
    } else if (isIpBlocked) {
      console.error(`[Email blocked] Brevo rejected application_confirmation email to ${email}: IP not whitelisted`);
      await logEmailAttempt({ recipientEmail: email, type: 'application_confirmation', subject: `School Application Received - ${schoolName}`, status: 'failed', error: 'Brevo IP not whitelisted' });
    } else {
      console.error('❌ Error sending application confirmation email:', error);
      await logEmailAttempt({ recipientEmail: email, type: 'application_confirmation', subject: `School Application Received - ${schoolName}`, status: 'failed', error: error.message || String(error) });
    }
    return false;
  }
}

// Send application decision email
async function sendApplicationDecisionEmail(email: string, schoolName: string, approved: boolean, reason?: string): Promise<boolean> {
  try {
    if (!brevoApiInstance) {
      console.log('📧 Brevo not configured, skipping decision email');
      await logEmailAttempt({ recipientEmail: email, type: 'application_decision', subject: `School Application ${approved ? 'Approved' : 'Declined'} - ${schoolName}`, status: 'failed', error: 'Brevo not configured' });
      return false;
    }

    const status = approved ? 'Approved' : 'Declined';
    const statusColor = approved ? '#10B981' : '#EF4444';
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${statusColor}; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Application ${status}</h1>
          <p style="color: white; margin: 8px 0 0 0;">ASA Platform</p>
        </div>
        
        <div style="padding: 24px;">
          <h2 style="color: #333;">Your school application has been ${approved ? 'approved' : 'declined'}</h2>
          <p>Dear Administrator,</p>
          <p>We have completed our review of your application for <strong>${schoolName}</strong>.</p>
          
          ${approved ? `
            <div style="background-color: #F0FDF4; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10B981;">
              <h3 style="margin: 0 0 8px 0; color: #059669;">Congratulations! Your application has been approved.</h3>
              <p style="margin: 0;">You will receive a separate email with your platform access credentials and setup instructions within the next 24 hours.</p>
            </div>
          ` : `
            <div style="background-color: #FEF2F2; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #EF4444;">
              <h3 style="margin: 0 0 8px 0; color: #DC2626;">Unfortunately, we cannot approve your application at this time.</h3>
              ${reason ? `<p style="margin: 0;"><strong>Reason:</strong> ${reason}</p>` : ''}
              <p style="margin: 8px 0 0 0;">You may reapply in the future if your circumstances change.</p>
            </div>
          `}
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            If you have any questions, please contact our support team at support@americanseekersacademy.com
          </p>
        </div>
      </div>
    `;

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.to = [{ email: email }];
    sendSmtpEmail.sender = { email: 'contact@americanseekersacademy.com', name: 'ASA Platform' };
    const decisionSubject = `School Application ${status} - ${schoolName}`;
    sendSmtpEmail.subject = decisionSubject;
    sendSmtpEmail.htmlContent = htmlContent;

    const result = await Promise.race([
      brevoApiInstance.sendTransacEmail(sendSmtpEmail),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout:application_decision:${email}`)), 10000)
      ),
    ]);
    console.log(`✅ Application decision email sent to ${email}`);
    await logEmailAttempt({ recipientEmail: email, type: 'application_decision', subject: decisionSubject, status: 'sent' });
    return true;
  } catch (error: any) {
    const isTimeout = error?.message?.startsWith('timeout:');
    const isIpBlocked = error?.body?.code === 'unauthorized' || error?.statusCode === 401;
    if (isTimeout) {
      console.error(`[Email timeout] application_decision email to ${email} timed out after 10s`);
      await logEmailAttempt({ recipientEmail: email, type: 'application_decision', subject: `School Application - ${schoolName}`, status: 'timeout', error: 'Timed out after 10s' });
    } else if (isIpBlocked) {
      console.error(`[Email blocked] Brevo rejected application_decision email to ${email}: IP not whitelisted`);
      await logEmailAttempt({ recipientEmail: email, type: 'application_decision', subject: `School Application - ${schoolName}`, status: 'failed', error: 'Brevo IP not whitelisted' });
    } else {
      console.error('❌ Error sending application decision email:', error);
      await logEmailAttempt({ recipientEmail: email, type: 'application_decision', subject: `School Application - ${schoolName}`, status: 'failed', error: error.message || String(error) });
    }
    return false;
  }
}

// Submit a new school application
router.post("/", async (req, res) => {
  try {
    const validatedData = schoolApplicationSchema.safeParse(req.body);
    if (!validatedData.success) {
      return res.status(400).json({ 
        message: "Invalid application data", 
        errors: validatedData.error.issues 
      });
    }

    // Check if email already has a pending application
    const existingApplications = await storage.getSchoolApplicationsByStatus('pending');
    const underReviewApplications = await storage.getSchoolApplicationsByStatus('under_review');
    const allPendingApps = [...existingApplications, ...underReviewApplications];
    
    const existingApplication = allPendingApps.find(app => 
      app.adminEmail === validatedData.data.adminEmail
    );

    if (existingApplication) {
      return res.status(400).json({ 
        message: "You already have a pending application. Please wait for a decision before submitting another." 
      });
    }

    const newApplication = await storage.createSchoolApplication({
      ...validatedData.data,
      gradelevelsServed: validatedData.data.gradelevelsServed,
      token: generateApplicationToken()
    });

    // Send confirmation email
    const emailSent = await sendApplicationConfirmationEmail(
      validatedData.data.adminEmail, 
      validatedData.data.schoolName,
      newApplication.id.toString()
    );

    console.log(`📋 New school application submitted: ${validatedData.data.schoolName} by ${validatedData.data.adminEmail}`);

    res.status(201).json({
      message: "Application submitted successfully",
      applicationId: newApplication.id,
      emailSent,
      status: 'pending'
    });
  } catch (error) {
    console.error("Error submitting school application:", error);
    res.status(500).json({ message: "Error submitting application" });
  }
});

// Get all applications (Super Admin only)
router.get("/", async (req, res) => {
  try {
    // TODO: Add super admin authentication check here
    const applications = await storage.getAllSchoolApplications();
    
    // Don't expose sensitive information like tokens
    const sanitizedApplications = applications.map(app => {
      const { token, ...sanitized } = app;
      return sanitized;
    });

    res.json(sanitizedApplications);
  } catch (error) {
    console.error("Error fetching applications:", error);
    res.status(500).json({ message: "Error fetching applications" });
  }
});

// Get application by ID
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const application = await storage.getSchoolApplicationById(id);

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    // Remove sensitive token information
    const { token, ...sanitizedApplication } = application;
    res.json(sanitizedApplication);
  } catch (error) {
    console.error("Error fetching application:", error);
    res.status(500).json({ message: "Error fetching application" });
  }
});

// Update application status (Super Admin only)
router.patch("/:id/status", async (req, res) => {
  try {
    // TODO: Add super admin authentication check here
    const id = parseInt(req.params.id);
    const { status, reviewNotes, reviewerEmail } = req.body;

    if (!['approved', 'declined', 'under_review'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const application = await storage.getSchoolApplicationById(id);

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    const previousStatus = application.status;

    // Update application
    const updatedApplication = await storage.updateSchoolApplicationStatus(
      id,
      status,
      reviewerEmail || 'admin',
      reviewNotes || undefined
    );

    // Send decision email if status changed to approved/declined
    if (previousStatus !== status && ['approved', 'declined'].includes(status)) {
      const emailSent = await sendApplicationDecisionEmail(
        application.adminEmail,
        application.schoolName,
        status === 'approved',
        reviewNotes
      );

      // If approved, create school admin invitation
      if (status === 'approved') {
        try {
          // Import the role invitation creation
          const roleInvitations = await import('./role-invitations');
          // This would create an invitation for the school admin role
          console.log(`🎓 Application approved for ${application.schoolName} - school admin invitation should be created`);
        } catch (error) {
          console.error('Error creating school admin invitation:', error);
        }
      }
    }

    console.log(`📋 Application ${id} status updated to ${status} by ${reviewerEmail}`);

    res.json({
      message: "Application status updated successfully",
      application: updatedApplication
    });
  } catch (error) {
    console.error("Error updating application status:", error);
    res.status(500).json({ message: "Error updating application status" });
  }
});

// Check application status by email
router.post("/check-status", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const allApplications = await storage.getAllSchoolApplications();
    const userApplications = allApplications
      .filter(app => app.adminEmail === email)
      .map(app => {
        const { token, adminEmail, ...publicData } = app;
        return publicData;
      })
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    res.json({
      applications: userApplications,
      hasActiveApplication: userApplications.some(app => ['pending', 'under_review'].includes(app.status))
    });
  } catch (error) {
    console.error("Error checking application status:", error);
    res.status(500).json({ message: "Error checking application status" });
  }
});

export default router;
