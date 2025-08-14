
import { Router } from "express";
import { z } from "zod";
import * as brevo from '@getbrevo/brevo';
import { supabaseStorage } from "../supabase-storage";
import fs from 'fs';
import path from 'path';

const router = Router();

// Initialize Brevo
let brevoApiInstance: brevo.TransactionalEmailsApi | null = null;
if (process.env.BREVO_API_KEY) {
  brevoApiInstance = new brevo.TransactionalEmailsApi();
  brevoApiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
  console.log('✅ Brevo initialized for school applications');
} else {
  console.warn('⚠️ BREVO_API_KEY not found - school application emails will not be sent');
}

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

// File storage for applications
const DATA_DIR = path.join(process.cwd(), 'data');
const APPLICATIONS_FILE = path.join(DATA_DIR, 'school-applications.json');

// Helper functions
function loadApplications() {
  if (!fs.existsSync(APPLICATIONS_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(APPLICATIONS_FILE, 'utf8'));
  } catch (error) {
    console.error('Error loading applications:', error);
    return [];
  }
}

function saveApplications(applications: any[]) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(applications, null, 2));
}

function generateApplicationToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Send application confirmation email
async function sendApplicationConfirmationEmail(email: string, schoolName: string, applicationId: string): Promise<boolean> {
  try {
    if (!brevoApiInstance) {
      console.log('📧 Brevo not configured, skipping application confirmation email');
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
    sendSmtpEmail.subject = `School Application Received - ${schoolName}`;
    sendSmtpEmail.htmlContent = htmlContent;

    const result = await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Application confirmation email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending application confirmation email:', error);
    return false;
  }
}

// Send application decision email
async function sendApplicationDecisionEmail(email: string, schoolName: string, approved: boolean, reason?: string): Promise<boolean> {
  try {
    if (!brevoApiInstance) {
      console.log('📧 Brevo not configured, skipping decision email');
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
    sendSmtpEmail.subject = `School Application ${status} - ${schoolName}`;
    sendSmtpEmail.htmlContent = htmlContent;

    const result = await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Application decision email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending application decision email:', error);
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

    const applications = loadApplications();
    
    // Check if email already has a pending application
    const existingApplication = applications.find(app => 
      app.adminEmail === validatedData.data.adminEmail && 
      ['pending', 'under_review'].includes(app.status)
    );

    if (existingApplication) {
      return res.status(400).json({ 
        message: "You already have a pending application. Please wait for a decision before submitting another." 
      });
    }

    const applicationId = `APP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    const newApplication = {
      id: applicationId,
      ...validatedData.data,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: null,
      token: generateApplicationToken()
    };

    applications.push(newApplication);
    saveApplications(applications);

    // Send confirmation email
    const emailSent = await sendApplicationConfirmationEmail(
      validatedData.data.adminEmail, 
      validatedData.data.schoolName,
      applicationId
    );

    console.log(`📋 New school application submitted: ${validatedData.data.schoolName} by ${validatedData.data.adminEmail}`);

    res.status(201).json({
      message: "Application submitted successfully",
      applicationId,
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
    const applications = loadApplications();
    
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
    const { id } = req.params;
    const applications = loadApplications();
    const application = applications.find(app => app.id === id);

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
    const { id } = req.params;
    const { status, reviewNotes, reviewerEmail } = req.body;

    if (!['approved', 'declined', 'under_review'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const applications = loadApplications();
    const applicationIndex = applications.findIndex(app => app.id === id);

    if (applicationIndex === -1) {
      return res.status(404).json({ message: "Application not found" });
    }

    const application = applications[applicationIndex];
    const previousStatus = application.status;

    // Update application
    applications[applicationIndex] = {
      ...application,
      status,
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewerEmail || 'admin',
      reviewNotes: reviewNotes || null
    };

    saveApplications(applications);

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
      application: applications[applicationIndex]
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

    const applications = loadApplications();
    const userApplications = applications
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
