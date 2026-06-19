import { storage } from '../storage';
import { sendEmail } from './email-service';
import type { TechnicalIssue } from './ai-technical-support';

export type SupportIssueCategory = 'platform' | 'school_policy';

const PLATFORM_ADMIN_ROLES = new Set(['admin', 'superAdmin']);
const SCHOOL_STAFF_ROLES = new Set(['schoolAdmin', 'director', 'admin', 'superAdmin']);

export async function getPlatformAdminUsers() {
  const allUsers = await storage.getAllUsers();
  const adminIds = new Set<number>();

  for (const user of allUsers) {
    if (PLATFORM_ADMIN_ROLES.has(user.role)) {
      adminIds.add(user.id);
      continue;
    }
    const roles = await storage.getUserRolesByUserId(user.id);
    if (roles.some((r) => PLATFORM_ADMIN_ROLES.has(r.role))) {
      adminIds.add(user.id);
    }
  }

  return allUsers.filter((u) => adminIds.has(u.id));
}

export async function getSchoolAdminUsers(schoolId: number) {
  const allUsers = await storage.getAllUsers();
  const adminIds = new Set<number>();

  for (const user of allUsers) {
    const roles = await storage.getUserRolesByUserId(user.id);
    const schoolRole = roles.find(
      (r) => r.schoolId === schoolId && SCHOOL_STAFF_ROLES.has(r.role),
    );
    const primaryMatch =
      user.schoolId === schoolId && SCHOOL_STAFF_ROLES.has(user.role);

    if (schoolRole || primaryMatch) {
      adminIds.add(user.id);
    }
  }

  const school = await storage.getSchool(schoolId);
  if (school?.adminId) {
    adminIds.add(school.adminId);
  }

  return allUsers.filter((u) => adminIds.has(u.id));
}

function adminDisplayName(user: { email: string; name?: string | null; firstName?: string | null; lastName?: string | null }) {
  return (
    user.name ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    user.email
  );
}

function issueEmailHtml(issue: TechnicalIssue & { issueCategory?: string; screenshotObjectPath?: string }, schoolName?: string) {
  const categoryLabel =
    issue.issueCategory === 'school_policy' ? 'School question / policy' : 'Platform / technical';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <h2 style="color: #1e40af;">New support issue reported</h2>
      <p><strong>Issue ID:</strong> ${issue.id}</p>
      <p><strong>Category:</strong> ${categoryLabel}${schoolName ? ` (${schoolName})` : ''}</p>
      <p><strong>Severity:</strong> ${issue.severity}</p>
      <p><strong>From:</strong> ${issue.userEmail} (${issue.userRole})</p>
      <p><strong>Page:</strong> ${issue.url || 'N/A'}</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0 0 8px;"><strong>Description</strong></p>
        <p style="margin: 0; white-space: pre-wrap;">${issue.description}</p>
      </div>
      ${issue.screenshotObjectPath ? '<p><strong>Screenshot:</strong> attached in admin dashboard</p>' : ''}
      <p style="color: #6b7280; font-size: 12px;">Review and respond in the Technical Support dashboard.</p>
    </div>
  `;
}

export async function notifySupportIssueRecipients(params: {
  issue: TechnicalIssue & { issueCategory?: string; screenshotObjectPath?: string };
  issueCategory: SupportIssueCategory;
  schoolId?: number | null;
}) {
  const { issue, issueCategory, schoolId } = params;
  const schoolName = schoolId ? (await storage.getSchool(schoolId))?.name : undefined;

  const recipients =
    issueCategory === 'school_policy' && schoolId
      ? await getSchoolAdminUsers(schoolId)
      : await getPlatformAdminUsers();

  if (recipients.length === 0) {
    console.warn(`⚠️ No recipients for support issue ${issue.id} (${issueCategory})`);
    return { notifiedCount: 0, notificationId: null as number | null };
  }

  const senderId = recipients[0]?.id ?? 1;
  const categoryLabel =
    issueCategory === 'school_policy' ? 'School support' : 'Platform support';

  const notification = await storage.createNotification({
    senderId,
    type: 'in_app',
    priority: issue.severity === 'critical' ? 'high' : 'normal',
    subject: `${categoryLabel}: ${issue.issueType}`,
    content: `${issue.userEmail} reported: ${issue.description.substring(0, 200)}${issue.description.length > 200 ? '...' : ''}`,
    targetType: 'role',
    targetData: {
      role: issueCategory === 'school_policy' ? 'schoolAdmin' : 'admin',
      issueId: issue.id,
      issueCategory,
      schoolId: schoolId ?? undefined,
    },
    scheduledFor: null,
    expiresAt: null,
  });

  for (const admin of recipients) {
    try {
      await storage.createNotificationRecipient({
        notificationId: notification.id,
        recipientId: admin.id,
        deliveryType: 'in_app',
        status: 'pending',
      });
    } catch (err) {
      console.error(`Failed to create notification recipient for admin ${admin.id}:`, err);
    }
  }

  for (const admin of recipients) {
    try {
      await sendEmail(
        admin.email,
        adminDisplayName(admin),
        `[${categoryLabel}] Issue #${issue.id.slice(-6)} — ${issue.severity} priority`,
        issueEmailHtml(issue, schoolName),
        undefined,
        'support_issue',
      );
    } catch (err) {
      console.error(`Failed to email admin ${admin.email} about issue ${issue.id}:`, err);
    }
  }

  console.log(`📬 Notified ${recipients.length} admin(s) about support issue ${issue.id}`);
  return { notifiedCount: recipients.length, notificationId: notification.id };
}
