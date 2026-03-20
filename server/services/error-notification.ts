import { storage } from '../storage';
import type { ErrorLog } from '@shared/schema';
import { sendEmailDirect } from '../lib/email-service';

const ERROR_NOTIFICATION_EMAIL = process.env.ERROR_NOTIFICATION_EMAIL || 'errors@americanseekersacademy.com';

class ErrorNotificationService {
  private dailySummaryScheduled = false;

  async sendImmediateNotification(error: ErrorLog): Promise<void> {
    const severityEmoji = error.severity === 'critical' ? '🚨' : '⚠️';
    const subject = `${severityEmoji} [${error.severity.toUpperCase()}] Application Error: ${error.message.substring(0, 50)}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${error.severity === 'critical' ? '#dc2626' : '#f59e0b'};">
          ${severityEmoji} ${error.severity.toUpperCase()} Error Detected
        </h2>
        
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>Error ID:</strong> ${error.id}</p>
          <p><strong>Type:</strong> ${error.errorType}</p>
          <p><strong>Severity:</strong> ${error.severity}</p>
          <p><strong>Time:</strong> ${new Date(error.createdAt).toLocaleString()}</p>
        </div>

        <h3>Error Message</h3>
        <div style="background: #fef2f2; padding: 16px; border-radius: 8px; border-left: 4px solid #dc2626;">
          <code>${error.message}</code>
        </div>

        ${error.url ? `<p><strong>URL:</strong> ${error.url}</p>` : ''}
        ${error.route ? `<p><strong>Route:</strong> ${error.route}</p>` : ''}
        ${error.method ? `<p><strong>Method:</strong> ${error.method}</p>` : ''}
        ${error.userEmail ? `<p><strong>User:</strong> ${error.userEmail}</p>` : ''}
        ${error.errorCode ? `<p><strong>Error Code:</strong> ${error.errorCode}</p>` : ''}

        ${error.stackTrace ? `
          <h3>Stack Trace</h3>
          <pre style="background: #1f2937; color: #f9fafb; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 12px;">
${error.stackTrace.substring(0, 2000)}${error.stackTrace.length > 2000 ? '\n\n... (truncated)' : ''}
          </pre>
        ` : ''}

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            This is an automated notification from the ASA Learning Platform error tracking system.
          </p>
        </div>
      </div>
    `;

    try {
      const sent = await sendEmailDirect(ERROR_NOTIFICATION_EMAIL, 'ASA Error Monitoring', subject, htmlContent);
      if (sent) {
        console.log(`[ErrorNotification] Immediate notification sent for error ID ${error.id}`);
        await storage.markErrorsNotified([error.id]);
      } else {
        console.log(`[ErrorNotification] Email not sent for error ID ${error.id} (Brevo unavailable)`);
      }
    } catch (emailError) {
      console.error('[ErrorNotification] Failed to send email:', emailError);
    }
  }

  async sendDailySummary(): Promise<void> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    try {
      const summary = await storage.getErrorsSummary(startDate, endDate);
      
      if (summary.total === 0) {
        console.log('[ErrorNotification] No errors in the last 24 hours, skipping daily summary');
        return;
      }

      const recentErrors = await storage.getErrorLogs({
        startDate,
        endDate,
        limit: 10,
      });

      const severityColors: Record<string, string> = {
        critical: '#dc2626',
        high: '#f59e0b',
        medium: '#3b82f6',
        low: '#10b981',
      };

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>📊 Daily Error Summary</h2>
          <p>Error report for the past 24 hours (${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()})</p>
          
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <h3 style="margin-top: 0;">Overview</h3>
            <p><strong>Total Errors:</strong> ${summary.total}</p>
          </div>

          <h3>By Severity</h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${Object.entries(summary.bySeverity).map(([severity, count]) => `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
                  <span style="color: ${severityColors[severity] || '#6b7280'}; font-weight: bold;">
                    ${severity.toUpperCase()}
                  </span>
                </td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                  ${count}
                </td>
              </tr>
            `).join('')}
          </table>

          <h3>By Type</h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${Object.entries(summary.byType).map(([type, count]) => `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${type}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${count}</td>
              </tr>
            `).join('')}
          </table>

          <h3>Recent Errors</h3>
          ${recentErrors.map(error => `
            <div style="background: #fef2f2; padding: 12px; border-radius: 8px; margin: 8px 0; border-left: 4px solid ${severityColors[error.severity] || '#6b7280'};">
              <p style="margin: 0 0 4px 0;"><strong>[${error.severity}]</strong> ${error.message.substring(0, 100)}${error.message.length > 100 ? '...' : ''}</p>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">${error.errorType} | ${new Date(error.createdAt).toLocaleString()}</p>
            </div>
          `).join('')}

          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 12px;">
              This is an automated daily summary from the ASA Learning Platform error tracking system.
            </p>
          </div>
        </div>
      `;

      await sendEmailDirect(
        ERROR_NOTIFICATION_EMAIL,
        'ASA Error Monitoring',
        `📊 Daily Error Summary: ${summary.total} error${summary.total !== 1 ? 's' : ''} in the last 24 hours`,
        htmlContent
      );
      console.log('[ErrorNotification] Daily summary sent successfully');
    } catch (error) {
      console.error('[ErrorNotification] Failed to send daily summary:', error);
    }
  }

  scheduleDailySummary(): void {
    if (this.dailySummaryScheduled) return;
    this.dailySummaryScheduled = true;

    const sendDailySummaryAt8AM = () => {
      const now = new Date();
      const next8AM = new Date();
      next8AM.setHours(8, 0, 0, 0);
      
      if (now >= next8AM) {
        next8AM.setDate(next8AM.getDate() + 1);
      }

      const msUntil8AM = next8AM.getTime() - now.getTime();

      setTimeout(() => {
        this.sendDailySummary();
        setInterval(() => this.sendDailySummary(), 24 * 60 * 60 * 1000);
      }, msUntil8AM);

      console.log(`[ErrorNotification] Daily summary scheduled for ${next8AM.toLocaleString()}`);
    };

    sendDailySummaryAt8AM();
  }
}

export const errorNotificationService = new ErrorNotificationService();
