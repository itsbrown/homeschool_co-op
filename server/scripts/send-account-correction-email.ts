/**
 * Send an account correction email to a parent after billing audit fixes.
 *
 * Usage:
 *   npx tsx server/scripts/send-account-correction-email.ts --parent-id 12 --summary "Fixed membership duplicate." --summary "Synced cash payment."
 *   npx tsx server/scripts/send-account-correction-email.ts --parent-id 12 --summary-file docs/audit/denise-summary.json
 *   npx tsx server/scripts/send-account-correction-email.ts --parent-id 12 --summary "..." --dry-run
 *
 * Production:
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/send-account-correction-email.ts --parent-id 12 --summary "..."
 */

import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import {
  buildAccountCorrectionEmailPreview,
  sendAccountCorrectionEmail,
} from '../lib/account-correction-email';
import { buildFamilyBalanceEmailPayload } from '../lib/family-balance-email';

function usage(): never {
  console.error(`
Usage:
  npx tsx server/scripts/send-account-correction-email.ts --parent-id <id> [--school-id <id>] [--summary "..."] [--summary-file path.json] [--sent-by <userId>] [--dry-run]

Options:
  --parent-id       Required. Parent user id.
  --school-id       Optional. Defaults to user.school_id.
  --summary         Repeatable. One paragraph per flag (parent-friendly language).
  --summary-file    JSON array of strings or { "summary": string[] }.
  --sent-by         Optional admin user id for payment_reminder_logs.sent_by.
  --dry-run         Print subject/HTML/text and verified balance; do not send email.
`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const opts: {
    parentId?: number;
    schoolId?: number;
    summaries: string[];
    summaryFile?: string;
    sentBy?: number;
    dryRun: boolean;
  } = { summaries: [], dryRun: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--parent-id') {
      opts.parentId = Number(argv[++i]);
    } else if (arg === '--school-id') {
      opts.schoolId = Number(argv[++i]);
    } else if (arg === '--summary') {
      opts.summaries.push(argv[++i] ?? '');
    } else if (arg === '--summary-file') {
      opts.summaryFile = argv[++i];
    } else if (arg === '--sent-by') {
      opts.sentBy = Number(argv[++i]);
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    }
  }

  if (opts.summaryFile) {
    const raw = fs.readFileSync(path.resolve(opts.summaryFile), 'utf8');
    const parsed = JSON.parse(raw) as string[] | { summary: string[] };
    const fromFile = Array.isArray(parsed) ? parsed : parsed.summary;
    if (!Array.isArray(fromFile) || fromFile.length === 0) {
      console.error('--summary-file must contain a non-empty JSON array of strings');
      process.exit(2);
    }
    opts.summaries.push(...fromFile);
  }

  if (!opts.parentId || Number.isNaN(opts.parentId)) {
    console.error('--parent-id is required');
    usage();
  }
  if (opts.summaries.length === 0) {
    console.error('Provide at least one --summary or --summary-file');
    usage();
  }

  return opts;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const db = await getDb();

  const [parent] = await db.select().from(users).where(eq(users.id, opts.parentId!)).limit(1);
  if (!parent?.email) {
    console.error(`Parent user ${opts.parentId} not found or has no email`);
    process.exit(1);
  }

  const schoolId = opts.schoolId ?? parent.schoolId;
  if (!schoolId) {
    console.error(`Parent ${opts.parentId} has no school_id; pass --school-id`);
    process.exit(1);
  }

  const parentName = parent.name || parent.email.split('@')[0];
  const emailOptions = {
    schoolId,
    parentEmail: parent.email,
    parentName,
    correctionSummary: opts.summaries,
    sentByUserId: opts.sentBy,
  };

  console.log('='.repeat(70));
  console.log(`Account correction email — ${parentName} (${parent.email})`);
  console.log(`School ID: ${schoolId} | Mode: ${opts.dryRun ? 'DRY RUN' : 'SEND'}`);
  console.log('='.repeat(70));

  const balancePayload = await buildFamilyBalanceEmailPayload(schoolId, parent.email);
  if (balancePayload) {
    console.log('\nVerified current balance (from prod DB logic):');
    for (const item of balancePayload.lineItems) {
      console.log(
        `  - ${item.childName} | ${item.className} | ${formatCents(item.amountCents)}`,
      );
    }
    console.log(`  Total due: ${formatCents(balancePayload.totalAmountCents)}`);
    if (balancePayload.membershipTotalCents > 0) {
      console.log(`  (includes membership: ${formatCents(balancePayload.membershipTotalCents)})`);
    }
  } else {
    console.log('\nVerified current balance: $0.00 (no outstanding items)');
  }

  console.log('\nCorrection summary paragraphs:');
  opts.summaries.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

  const preview = await buildAccountCorrectionEmailPreview(emailOptions);
  console.log(`\nSubject: ${preview.subject}`);

  if (opts.dryRun) {
    console.log('\n--- TEXT PREVIEW ---\n');
    console.log(preview.textContent);
    console.log('\n--- HTML PREVIEW (first 2000 chars) ---\n');
    console.log(preview.htmlContent.slice(0, 2000));
    if (preview.htmlContent.length > 2000) {
      console.log('\n... [truncated] ...');
    }
    if (!process.env.SENDGRID_API_KEY && !process.env.BREVO_API_KEY) {
      console.log('\nNote: SENDGRID_API_KEY / BREVO_API_KEY not set — use dry-run or configure email in .env.prod.');
    }
    return;
  }

  if (!process.env.SENDGRID_API_KEY && !process.env.BREVO_API_KEY) {
    console.error('\nSENDGRID_API_KEY or BREVO_API_KEY is required. Re-run with --dry-run or add keys to .env.prod.');
    process.exit(1);
  }

  const result = await sendAccountCorrectionEmail(emailOptions);
  if (!result.success) {
    console.error(`\nFailed to send: ${result.error ?? 'unknown error'}`);
    process.exit(1);
  }

  console.log(`\nEmail sent successfully. Subject: ${result.subject}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
