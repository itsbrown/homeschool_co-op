import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSgSend = jest.fn<() => Promise<[{ statusCode: number }]>>();
const mockSgSetApiKey = jest.fn();

jest.mock('@sendgrid/mail', () => ({
  __esModule: true,
  default: {
    setApiKey: (...args: unknown[]) => mockSgSetApiKey(...args),
    send: (...args: unknown[]) => mockSgSend(...args),
  },
}));

jest.mock('@getbrevo/brevo', () => ({
  TransactionalEmailsApi: jest.fn().mockImplementation(() => ({
    setApiKey: jest.fn(),
    sendTransacEmail: jest.fn(),
  })),
  TransactionalEmailsApiApiKeys: { apiKey: 'apiKey' },
  SendSmtpEmail: jest.fn().mockImplementation(() => ({})),
}));

describe('email-service SendGrid routing', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSgSend.mockReset();
    mockSgSetApiKey.mockReset();
    mockSgSend.mockResolvedValue([{ statusCode: 202 }]);
    delete process.env.BREVO_API_KEY;
    delete process.env.EMAIL_PROVIDER;
  });

  it('uses SendGrid when SENDGRID_API_KEY is set', async () => {
    process.env.SENDGRID_API_KEY = 'SG.test-key';
    process.env.SENDGRID_FROM_EMAIL = 'support@americanseekersacademy.com';
    const { sendEmail } = await import('../lib/email-service');

    const ok = await sendEmail(
      'parent@test.com',
      'Parent',
      'Test subject',
      '<p>Hi</p>',
      'Hi',
      'test_generic',
    );
    expect(ok).toBe(true);
    expect(mockSgSend).toHaveBeenCalledTimes(1);
  });

  it('sendProgressReportEmail attaches PDF via SendGrid path', async () => {
    process.env.SENDGRID_API_KEY = 'SG.test-key';
    const { sendProgressReportEmail } = await import('../lib/email-service');
    const pdf = Buffer.from('%PDF-1.4 test');

    const ok = await sendProgressReportEmail({
      parentEmail: 'parent@test.com',
      parentName: 'Parent',
      childName: 'Mia Tester',
      quarter: 'fall',
      schoolYear: '2025-2026',
      pdfBuffer: pdf,
    });
    expect(ok).toBe(true);
    expect(mockSgSend).toHaveBeenCalledTimes(1);
    const msg = mockSgSend.mock.calls[0][0] as { subject?: string; attachments?: unknown[] };
    expect(msg.subject).toContain('NY | Progress report');
    expect(msg.attachments?.length).toBe(1);
  });

  it('falls back to none when no provider configured', async () => {
    delete process.env.SENDGRID_API_KEY;
    const { sendEmail } = await import('../lib/email-service');
    const ok = await sendEmail('a@b.com', 'A', 'Sub', '<p>x</p>', 'x', 'test');
    expect(ok).toBe(false);
    expect(mockSgSend).not.toHaveBeenCalled();
  });
});
