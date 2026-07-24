/**
 * Email school admins a platform "what's new" update.
 *
 * Usage:
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/send-school-admin-platform-update.ts --dry-run
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/send-school-admin-platform-update.ts --send
 *
 * Optional:
 *   --to email@example.com   (repeatable; overrides DB recipient query)
 */

import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';

function loadEnvProd(): void {
  const envProd = path.join(process.cwd(), '.env.prod');
  if (!fs.existsSync(envProd)) return;
  for (const line of fs.readFileSync(envProd, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

loadEnvProd();

const SUBJECT = 'ASA Platform updates — Grade Placement, Mentor Schedule & more';

function buildHtml(firstName: string): string {
  const name = firstName || 'there';
  return `
<div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937; line-height: 1.5;">
  <div style="background-color: #1e3a5f; padding: 24px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 22px;">ASA Platform updates</h1>
    <p style="color: #cbd5e1; margin: 8px 0 0 0; font-size: 14px;">Grade Placement, Mentor Schedule &amp; more</p>
  </div>
  <div style="padding: 24px;">
    <p>Hi ${name},</p>
    <p>We've shipped several updates that affect how classes, placement, and schedules work. Here's what's new and how to try it.</p>

    <h2 style="font-size: 18px; color: #1e3a5f; margin-top: 28px;">1. Grade Placement (auto-roster by grade)</h2>
    <p>You can turn on <strong>Auto-place by grade</strong> on a class so eligible students are added to the roster automatically.</p>
    <p><strong>Eligibility (all required):</strong></p>
    <ul>
      <li>Student is at the same campus as the class</li>
      <li>Family has paid toward that class's academic session</li>
      <li>Student's grade matches the class grade levels</li>
    </ul>
    <p>Placement seats are <strong>free</strong> (not charged again) and show on the parent's child card under <strong>Class</strong>.</p>
    <p><strong>How to try it:</strong></p>
    <ol>
      <li>Open the class → set <strong>Session</strong> and grade levels → enable <strong>Auto-place by grade</strong></li>
      <li>Use <strong>Preview</strong> on the class to see who would be placed (and why others won't)</li>
      <li>Sync placements when you're ready</li>
    </ol>

    <h2 style="font-size: 18px; color: #1e3a5f; margin-top: 28px;">2. Parent "Class" line shows current seats only</h2>
    <p>Parents now see their child's <strong>current</strong> class placement(s). Past/ended enrollments stay in the system but no longer clutter the Class line or Current Enrollments list.</p>

    <h2 style="font-size: 18px; color: #1e3a5f; margin-top: 28px;">3. Mentor Schedule shows published week plans</h2>
    <p>Educators' <strong>Schedule</strong> calendar now overlays <strong>published</strong> Week Planner blocks (titles, times, colors) and supports print in an ASA-style day table.</p>
    <p><strong>How to try it:</strong></p>
    <ol>
      <li>Publish a week plan for a class in <strong>Week Planner</strong></li>
      <li>As that educator, open <strong>Schedule</strong> (/educator/weekly-calendar)</li>
      <li>Confirm plan blocks appear on the right days; use print if needed</li>
    </ol>

    <h2 style="font-size: 18px; color: #1e3a5f; margin-top: 28px;">4. Other fixes worth knowing</h2>
    <ul>
      <li><strong>Credits-only checkout</strong> — carts fully covered by credits no longer get stuck on "Checkout did not finish loading"</li>
      <li><strong>Students list</strong> — school admin Students page loads much faster</li>
      <li><strong>Class grades</strong> — create/edit class grade selector now goes through <strong>12th grade</strong></li>
      <li><strong>Educator My Classes</strong> — fixed crashes for some multi-role / assignment cases</li>
    </ul>

    <p style="margin-top: 28px;">If anything looks off at your campus, reply to this email or open a support issue in the app and we'll dig in.</p>
    <p>Thanks,<br>ASA Platform Team</p>
  </div>
</div>
`.trim();
}

function buildText(firstName: string): string {
  const name = firstName || 'there';
  return `Hi ${name},

We've shipped several updates that affect how classes, placement, and schedules work.

1) Grade Placement (auto-roster by grade)
Turn on Auto-place by grade on a class so eligible students are added automatically.
Eligibility: same campus + paid toward the class session + matching grade.
Placement seats are free and show on the parent Class line.
Try: open class → set Session + grades → enable Auto-place → Preview → Sync.

2) Parent "Class" line shows current seats only
Past/ended enrollments stay in the system but no longer clutter Current Enrollments.

3) Mentor Schedule shows published week plans
Publish a week plan, then open Schedule (/educator/weekly-calendar) as the educator.

4) Other fixes
- Credits-only checkout no longer stuck loading
- Students list loads faster
- Class grades through 12th
- Educator My Classes crash fixes

If anything looks off, reply or open a support issue in the app.

Thanks,
ASA Platform Team`;
}

type Recipient = { id: number; email: string; firstName: string; name: string };

function parseArgs(argv: string[]) {
  const opts = {
    dryRun: false,
    send: false,
    to: [] as string[],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--send') opts.send = true;
    else if (arg === '--to') opts.to.push(argv[++i] ?? '');
  }
  return opts;
}

async function loadRecipientsFromDb(): Promise<Recipient[]> {
  const { getDb } = await import('../db');
  const db = await getDb();

  const rows = await db.execute(sql`
    SELECT DISTINCT ON (lower(u.email))
      u.id,
      u.email,
      COALESCE(NULLIF(trim(u.first_name), ''), split_part(u.name, ' ', 1), 'there') AS first_name,
      u.name
    FROM users u
    WHERE u.is_active = true
      AND u.email IS NOT NULL
      AND trim(u.email) <> ''
      AND lower(u.email) NOT LIKE '%@test.com'
      AND lower(u.email) NOT LIKE '%.test@%'
      AND (
        u.role = 'schoolAdmin'
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = u.id
            AND lower(ur.role) = 'schooladmin'
        )
      )
    ORDER BY lower(u.email), u.id
  `);

  const list = ((rows as { rows?: unknown[] }).rows ?? rows) as Array<{
    id: number;
    email: string;
    first_name: string;
    name: string;
  }>;

  return list.map((r) => ({
    id: Number(r.id),
    email: String(r.email).trim(),
    firstName: String(r.first_name || 'there'),
    name: String(r.name || ''),
  }));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.dryRun && !opts.send) {
    console.error('Usage: --dry-run | --send [--to email ...]');
    process.exit(2);
  }

  let recipients: Recipient[];
  if (opts.to.length > 0) {
    recipients = opts.to.filter(Boolean).map((email, i) => ({
      id: -1 - i,
      email,
      firstName: 'there',
      name: email,
    }));
  } else {
    recipients = await loadRecipientsFromDb();
  }

  console.log(`Recipients: ${recipients.length}`);
  for (const r of recipients) {
    console.log(`  - ${r.email} (id=${r.id}, ${r.firstName})`);
  }

  if (opts.dryRun || !opts.send) {
    console.log('\nDry run only — no emails sent.');
    console.log(`Subject: ${SUBJECT}`);
    process.exit(0);
  }

  const { sendEmail } = await import('../lib/email-service');
  let ok = 0;
  let fail = 0;
  for (const r of recipients) {
    const sent = await sendEmail(
      r.email,
      r.name || r.firstName,
      SUBJECT,
      buildHtml(r.firstName),
      buildText(r.firstName),
      'platform_update',
    );
    if (sent) {
      ok += 1;
      console.log(`✅ sent ${r.email}`);
    } else {
      fail += 1;
      console.error(`❌ failed ${r.email}`);
    }
  }

  console.log(`\nDone. sent=${ok} failed=${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
