import { Router } from "express";
import { z } from "zod";
import * as brevo from '@getbrevo/brevo';
import { storage } from "../storage";
import { systemRoles } from "@shared/schema";
import type { SystemRole } from "@shared/schema";
import { getBrevoApiInstance, logEmailAttempt } from "../lib/email-service";

const router = Router();

// Map invitation fields to camelCase DTO (handles both snake_case from DB and camelCase from storage)
function mapInvitationToDTO(invitation: any) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    token: invitation.token,
    invitedBy: invitation.invited_by || invitation.invitedBy,
    isActive: invitation.is_active ?? invitation.isActive,
    usedAt: invitation.used_at || invitation.usedAt,
    createdAt: invitation.created_at || invitation.createdAt,
    expiresAt: invitation.expires_at || invitation.expiresAt
  };
}

// Use the single shared Brevo instance from email-service.ts
const brevoApiInstance = getBrevoApiInstance();

// Generate a random token for invitations
function generateInvitationToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Send role invitation email via Brevo
async function sendRoleInvitationEmail(email: string, role: string, token: string): Promise<boolean> {
  try {
    if (!brevoApiInstance) {
      console.log('📧 Brevo not configured, skipping role invitation email send');
      await logEmailAttempt({ recipientEmail: email, type: 'role_invitation', subject: `Role invitation for ${role}`, status: 'failed', error: 'Brevo not configured' });
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
    const subject = `You've been invited to join ASA Platform as ${role}`;
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.textContent = textContent;

    const result = await Promise.race([
      brevoApiInstance.sendTransacEmail(sendSmtpEmail),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout:role_invitation:${email}`)), 10000)
      ),
    ]);

    console.log(`✅ Role invitation email sent successfully to ${email} for role ${role}`);
    console.log('📧 Brevo Message ID:', result.body.messageId);
    await logEmailAttempt({ recipientEmail: email, type: 'role_invitation', subject, status: 'sent' });
    return true;
  } catch (error: any) {
    const isTimeout = error?.message?.startsWith('timeout:');
    const isIpBlocked = error?.body?.code === 'unauthorized' || error?.statusCode === 401;
    if (isTimeout) {
      console.error(`[Email timeout] role_invitation email to ${email} timed out after 10s`);
      await logEmailAttempt({ recipientEmail: email, type: 'role_invitation', subject: `Role invitation for ${role}`, status: 'timeout', error: 'Timed out after 10s' });
    } else if (isIpBlocked) {
      console.error(`[Email blocked] Brevo rejected role_invitation email to ${email}: IP not whitelisted`);
      await logEmailAttempt({ recipientEmail: email, type: 'role_invitation', subject: `Role invitation for ${role}`, status: 'failed', error: 'Brevo IP not whitelisted' });
    } else {
      console.error('❌ Error sending role invitation email:', error);
      await logEmailAttempt({ recipientEmail: email, type: 'role_invitation', subject: `Role invitation for ${role}`, status: 'failed', error: error.message || String(error) });
    }
    return false;
  }
}

// Get all role invitations (uses local PostgreSQL storage)
router.get("/", async (req, res) => {
  try {
    const invitations = await storage.getRoleInvitations();
    res.status(200).json(invitations.map(mapInvitationToDTO));
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
    const validRoles = ["educator", "teacher", "schoolAdmin", "admin", "superAdmin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role specified" });
    }

    // Check if there's already an active invitation for this email (uses local PostgreSQL storage)
    const existingInvitations = await storage.getRoleInvitations();
    const existingInvitation = existingInvitations.find(inv => {
      const isActive = inv.is_active ?? inv.isActive;
      const usedAt = inv.used_at || inv.usedAt;
      return inv.email === email && isActive && !usedAt;
    });

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
      invitedBy: 1, // Default admin ID
      expiresAt: expiresAt, // Pass Date object, not string
      isActive: true,
    };

    const invitation = await storage.createRoleInvitation(invitationData);

    // Send real email invitation (fire-and-forget)
    sendRoleInvitationEmail(email, role, token)
      .catch(err => console.error('[Email fire-and-forget] sendRoleInvitationEmail failed:', err));

    const invitationDTO = mapInvitationToDTO(invitation);
    res.status(201).json({
      message: "Invitation sent successfully",
      invitation: {
        id: invitationDTO.id,
        email: invitationDTO.email,
        role: invitationDTO.role,
        createdAt: invitationDTO.createdAt,
        expiresAt: invitationDTO.expiresAt
      },
      emailSent: true
    });
  } catch (error) {
    console.error("Error sending role invitation:", error);
    res.status(500).json({ message: "Error sending invitation" });
  }
});

// Revoke a role invitation (uses local PostgreSQL storage)
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    // Try to revoke - this will throw if not found
    await storage.revokeRoleInvitation(id);

    res.status(200).json({ message: "Invitation revoked successfully" });
  } catch (error) {
    console.error("Error revoking invitation:", error);
    res.status(500).json({ message: "Error revoking invitation" });
  }
});

// Check if an email has an active invitation (uses local PostgreSQL storage)
router.post("/check", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const invitation = await storage.getActiveRoleInvitation(email);

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

// Validate invitation token (uses local PostgreSQL storage)
router.get("/validate", async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ valid: false, message: 'Token is required' });
    }

    const invitation = await storage.getActiveRoleInvitation(token);
    
    if (!invitation) {
      return res.status(404).json({ valid: false, message: 'Invalid or expired invitation' });
    }

    const invitationDTO = mapInvitationToDTO(invitation);
    
    // Check if invitation has expired
    if (invitationDTO.expiresAt && new Date() > new Date(invitationDTO.expiresAt)) {
      return res.status(400).json({ valid: false, message: 'Invitation has expired' });
    }

    return res.json({ 
      valid: true, 
      invitation: {
        id: invitationDTO.id,
        email: invitationDTO.email,
        role: invitationDTO.role,
        invitedBy: invitationDTO.invitedBy,
        createdAt: invitationDTO.createdAt,
        expiresAt: invitationDTO.expiresAt
      }
    });
  } catch (error) {
    console.error('Error validating invitation:', error);
    return res.status(500).json({ valid: false, message: 'Failed to validate invitation' });
  }
});

// Accept an invitation (uses local PostgreSQL storage)
router.post("/accept", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    const invitation = await storage.getActiveRoleInvitation(token);

    if (!invitation) {
      return res.status(404).json({ message: "Invalid or expired invitation" });
    }

    const invitationDTO = mapInvitationToDTO(invitation);
    
    if (invitationDTO.expiresAt && new Date(invitationDTO.expiresAt) < new Date()) {
      return res.status(400).json({ message: "Invitation has expired" });
    }

    // Validate that the invited role is a recognised system role before writing
    const grantedRole = invitationDTO.role;
    if (!(systemRoles as readonly string[]).includes(grantedRole)) {
      return res.status(400).json({ message: `Invalid role on invitation: ${grantedRole}` });
    }
    const typedRole = grantedRole as SystemRole;

    // Grant the invited role FIRST (before marking the invitation as used).
    // This ensures the invitation remains re-tryable if the role write fails.
    const invitedUser = await storage.getUserByEmail(invitationDTO.email);
    if (invitedUser) {
      const existingRoles = await storage.getUserRolesByUserId(invitedUser.id);
      const hasPrimary = existingRoles.some(r => r.isPrimary);
      const hasThisRole = existingRoles.some(
        r => r.role === typedRole && r.schoolId === invitedUser.schoolId
      );
      if (!hasThisRole) {
        await storage.createUserRole({
          userId: invitedUser.id,
          role: typedRole,
          schoolId: invitedUser.schoolId ?? null,
          isPrimary: !hasPrimary,
        });
        console.log(`✅ Granted role ${typedRole} to ${invitationDTO.email} in user_roles`);
      }
      // If user has no existing primary role, update users.role too so legacy checks work
      if (!hasPrimary) {
        await storage.updateUser(invitedUser.id, { role: typedRole });
        console.log(`✅ Updated users.role to ${typedRole} for ${invitationDTO.email}`);
      }
    } else {
      console.warn(`⚠️ Accepted invitation for ${invitationDTO.email} but user not found in DB — role will be applied on registration`);
    }

    // Mark invitation as used only after the role grant succeeded
    await storage.acceptRoleInvitation(token, invitationDTO.email);

    res.status(200).json({
      message: "Invitation accepted successfully",
      role: invitationDTO.role,
      email: invitationDTO.email
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    res.status(500).json({ message: "Error accepting invitation" });
  }
});

export default router;