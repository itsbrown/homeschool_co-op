import { Router } from "express";
import { z } from "zod";
import * as brevo from '@getbrevo/brevo';
import { supabaseStorage } from "../supabase-storage";

const router = Router();

// Initialize Brevo
let brevoApiInstance: brevo.TransactionalEmailsApi | null = null;
if (process.env.BREVO_API_KEY) {
  brevoApiInstance = new brevo.TransactionalEmailsApi();
  brevoApiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
  console.log('✅ Brevo initialized for role invitations');
} else {
  console.warn('⚠️ BREVO_API_KEY not found - role invitation emails will not be sent');
}

// Generate a random token for invitations
function generateInvitationToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Send role invitation email via Brevo
async function sendRoleInvitationEmail(email: string, role: string, token: string): Promise<boolean> {
  try {
    if (!brevoApiInstance) {
      console.log('📧 Brevo not configured, skipping role invitation email send');
      return false;
    }

    const invitationUrl = `https://${process.env.REPL_ID}.replit.app/accept-invitation?token=${token}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4F46E5; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Role Invitation</h1>
          <p style="color: #E0E7FF; margin: 8px 0 0 0;">ASA Platform</p>
        </div>
        
        <div style="padding: 24px;">
          <h2 style="color: #333;">You're Invited to Join ASA Platform</h2>
          <p>Hello,</p>
          <p>You've been invited to join ASA Platform with the role of <strong>${role}</strong>.</p>
          <p>Click the button below to accept your invitation and set up your account:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${invitationUrl}" 
               style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Accept Invitation
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${invitationUrl}</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This invitation will expire in 7 days. If you have any questions, please contact our support team.
          </p>
        </div>
      </div>
    `;

    const textContent = `
You're Invited to Join ASA Platform

Hello,

You've been invited to join ASA Platform with the role of ${role}.

Please visit the following link to accept your invitation:
${invitationUrl}

This invitation will expire in 7 days. If you have any questions, please contact our support team.
    `;

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.to = [{ email: email }];
    sendSmtpEmail.sender = { email: 'contact@americanseekersacademy.com', name: 'ASA Platform' };
    sendSmtpEmail.subject = `You've been invited to join ASA Platform as ${role}`;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.textContent = textContent;

    const result = await brevoApiInstance.sendTransacEmail(sendSmtpEmail);

    console.log(`✅ Role invitation email sent successfully to ${email} for role ${role}`);
    console.log('📧 Brevo Message ID:', result.body.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending role invitation email:', error);
    return false;
  }
}

// Get all role invitations
router.get("/", async (req, res) => {
  try {
    const invitations = await supabaseStorage.getRoleInvitations();
    res.status(200).json(invitations);
  } catch (error) {
    console.error("Error fetching role invitations:", error);
    res.status(500).json({ message: "Error fetching invitations" });
  }
});

// Send a role invitation
router.post("/", async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ message: "Email and role are required" });
    }

    // Validate role
    const validRoles = ["teacher", "schoolAdmin", "admin", "superAdmin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role specified" });
    }

    // Check if there's already an active invitation for this email
    const existingInvitations = await supabaseStorage.getRoleInvitations();
    const existingInvitation = existingInvitations.find(inv => 
      inv.email === email && inv.is_active && !inv.used_at
    );

    if (existingInvitation) {
      return res.status(400).json({ message: "An active invitation already exists for this email" });
    }

    // Create new invitation
    const token = generateInvitationToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days

    const invitationData = {
      email,
      role,
      token,
      invited_by: "Admin", // In a real system, get this from the authenticated user
      expires_at: expiresAt.toISOString(),
    };

    const invitation = await supabaseStorage.createRoleInvitation(invitationData);

    // Send real email invitation
    const emailSent = await sendRoleInvitationEmail(email, role, token);
    
    if (!emailSent) {
      // If email fails, we still keep the invitation but note the issue
      console.warn(`⚠️ Email delivery failed for invitation to ${email}, but invitation was created`);
    }

    res.status(201).json({
      message: emailSent ? "Invitation sent successfully" : "Invitation created but email delivery failed",
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt
      },
      emailSent
    });
  } catch (error) {
    console.error("Error sending role invitation:", error);
    res.status(500).json({ message: "Error sending invitation" });
  }
});

// Revoke a role invitation
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const invitation = roleInvitations.get(id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    // Mark invitation as inactive
    invitation.isActive = false;
    roleInvitations.set(id, invitation);

    res.status(200).json({ message: "Invitation revoked successfully" });
  } catch (error) {
    console.error("Error revoking invitation:", error);
    res.status(500).json({ message: "Error revoking invitation" });
  }
});

// Check if an email has an active invitation
router.post("/check", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const invitation = Array.from(roleInvitations.values())
      .find(inv => inv.email === email && inv.isActive && !inv.usedAt && inv.expiresAt > new Date());

    if (invitation) {
      return res.status(200).json({
        hasInvitation: true,
        role: invitation.role,
        token: invitation.token
      });
    }

    return res.status(200).json({ hasInvitation: false });
  } catch (error) {
    console.error("Error checking invitation:", error);
    res.status(500).json({ message: "Error checking invitation" });
  }
});

// Validate invitation token
router.get("/validate", async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ valid: false, message: 'Token is required' });
    }

    const invitation = Array.from(roleInvitations.values())
      .find(inv => inv.token === token && inv.isActive && !inv.usedAt);
    
    if (!invitation) {
      return res.status(404).json({ valid: false, message: 'Invalid or expired invitation' });
    }

    // Check if invitation has expired
    if (new Date() > invitation.expiresAt) {
      return res.status(400).json({ valid: false, message: 'Invitation has expired' });
    }

    return res.json({ 
      valid: true, 
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        invitedBy: invitation.invitedBy,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt
      }
    });
  } catch (error) {
    console.error('Error validating invitation:', error);
    return res.status(500).json({ valid: false, message: 'Failed to validate invitation' });
  }
});

// Accept an invitation
router.post("/accept", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    const invitation = Array.from(roleInvitations.values())
      .find(inv => inv.token === token && inv.isActive && !inv.usedAt);

    if (!invitation) {
      return res.status(404).json({ message: "Invalid or expired invitation" });
    }

    if (invitation.expiresAt < new Date()) {
      return res.status(400).json({ message: "Invitation has expired" });
    }

    // Mark invitation as used
    invitation.usedAt = new Date();
    roleInvitations.set(invitation.id, invitation);

    res.status(200).json({
      message: "Invitation accepted successfully",
      role: invitation.role,
      email: invitation.email
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    res.status(500).json({ message: "Error accepting invitation" });
  }
});

export default router;