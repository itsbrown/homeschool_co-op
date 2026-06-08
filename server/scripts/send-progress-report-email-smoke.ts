/**
 * Live SendGrid smoke: NY | Progress report with PDF attachment.
 *
 *   RUN_LIVE_EMAIL=1 npx tsx server/scripts/send-progress-report-email-smoke.ts you@example.com
 *
 * Loads .env.prod for SENDGRID_API_KEY before email-service initializes (never log secrets).
 */
import fs from 'node:fs';
import path from 'node:path';

function loadEnvProd(): void {
  const envProd = path.join(process.cwd(), '.env.prod');
  if (!fs.existsSync(envProd)) return;
  for (const line of fs.readFileSync(envProd, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function main() {
  loadEnvProd();

  if (process.env.RUN_LIVE_EMAIL !== '1') {
    console.error('Set RUN_LIVE_EMAIL=1 to run this live SendGrid smoke test.');
    process.exit(1);
  }
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: RUN_LIVE_EMAIL=1 npx tsx server/scripts/send-progress-report-email-smoke.ts recipient@example.com');
    process.exit(1);
  }
  if (!process.env.SENDGRID_API_KEY) {
    console.error('SENDGRID_API_KEY missing (add to .env.prod or environment)');
    process.exit(1);
  }

  const { buildStudentProgressReport } = await import('../lib/build-student-progress-report');
  const { generateProgressReportPdf } = await import('../services/progressReportPdf');
  const { sendProgressReportEmail } = await import('../lib/email-service');
  type Child = import('../../shared/schema').Child;

  const child = {
    id: 0,
    firstName: 'Smoke',
    lastName: 'Test',
    gradeLevel: 'Kindergarten',
    schoolId: 1,
    parentId: 1,
  } as Child;

  const report = buildStudentProgressReport(child, {
    schoolYear: '2025-2026',
    quarter: 'fall',
    current: [],
    logs: [],
    assessments: [],
    meta: {
      approvedNarrative: 'Smoke test: phonics and counting covered this quarter.',
      asaCoopHours: 12,
      homeInstructionHours: 45,
      phonogramCount: 10,
    },
    skillChecks: {},
  });

  const pdf = await generateProgressReportPdf(report, { includeGuide: true });
  const ok = await sendProgressReportEmail({
    parentEmail: to,
    parentName: 'Smoke Tester',
    childName: 'Smoke Test',
    quarter: 'fall',
    schoolYear: '2025-2026',
    pdfBuffer: pdf,
  });

  if (ok) {
    console.log(`✅ NY | Progress report smoke email sent to ${to}`);
    process.exit(0);
  }
  console.error('❌ SendGrid send returned false — check email_log / SendGrid activity');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
