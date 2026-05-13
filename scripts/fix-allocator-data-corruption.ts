/**
 * scripts/fix-allocator-data-corruption.ts
 *
 * Scans for parents damaged by the March 2026 even-split payment allocator
 * bug and produces either a dry-run investigation report (default) or applies
 * targeted reallocations to heal pure allocator-bug victims.
 *
 * Bug shape: a parent paid a multi-enrollment cart that included at least one
 * already-paid enrollment. The legacy allocator split the payment evenly
 * across all enrollments, leaving overpaid sibling enrollments next to
 * underpaid ones. Pure allocator-bug victims have a per-parent net
 * effective_balance of $0 — overpayment exactly cancels underpayment.
 * Parents with non-zero nets have additional damage from other causes
 * (refunds, manual adjustments, comp changes, etc.) and are NEVER auto-fixed
 * by this script — they appear in the investigation report only.
 *
 * Sara Puccia (parent_id = 55) is the canonical pure-bug case and the only
 * parent this script will mutate when run against the current production
 * dataset. Run with `--parent-id 55 --apply` to heal her account; her
 * expected final state (enrollments 187, 188, 191, 381, 382 → effective
 * balance $0; credit 32 untouched) is asserted at the end of the apply run.
 *
 * Atomicity: every parent's reallocations execute inside a single Postgres
 * transaction in `PaymentReallocationService.reallocateMany`. The service
 * locks the affected enrollment rows with `SELECT ... FOR UPDATE`, performs
 * the drift check against the dry-run snapshot, applies all moves, writes the
 * mandatory audit pairs, and commits — or rolls back the whole batch on any
 * error. There is no path that leaves a parent half-fixed.
 *
 * Algorithm: planning reuses the production balance-aware allocator
 * (`allocatePaymentByBalance` from `server/lib/splitIntegerEvenly`) — the same
 * helper the new payment path uses to spread an incoming amount across
 * sibling enrollments proportionally to their underpayment, with BigInt
 * floor + Hamilton's largest-remainder method for exact integer-cent splits
 * (no dropped cents, per-target caps respected). Each source overpayment is
 * distributed across the *remaining* underpayment of the targets, in
 * deterministic id order. When the parent's per-parent net is exactly zero
 * (the gating precondition), the per-source proportional shares sum to each
 * target's full underpayment, so every enrollment ends at effective_balance
 * $0 with no cents lost or invented.
 *
 * Usage:
 *   tsx scripts/fix-allocator-data-corruption.ts                 # dry-run, all affected parents
 *   tsx scripts/fix-allocator-data-corruption.ts --parent-id 55  # dry-run, Sara only
 *   tsx scripts/fix-allocator-data-corruption.ts --parent-id 55 --apply
 *   tsx scripts/fix-allocator-data-corruption.ts --limit 5       # cap how many parents to process
 */

import pg from 'pg';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getDbSslConfig, getNormalizedDatabaseUrl } from '../server/lib/database-url';
import {
  PaymentReallocationService,
  PaymentReallocationError,
  type MoveSpec,
  type EnrollmentSnapshot,
} from '../server/services/PaymentReallocationService';
import { allocatePaymentByBalance } from '../server/lib/splitIntegerEvenly';
import { storage } from '../server/storage';

const { Pool } = pg;

interface CliOptions {
  apply: boolean;
  parentId: number | null;
  limit: number | null;
  reportDir: string;
}

interface AffectedEnrollmentRow {
  enrollment_id: number;
  child_name: string | null;
  class_name: string | null;
  total_cost: number;
  total_paid: number;
  comp_amount_cents: number | null;
  effective_balance: number;
  status: string | null;
  payment_status: string | null;
}

interface AffectedParentSummary {
  parent_id: number;
  parent_email: string | null;
  enrollments: AffectedEnrollmentRow[];
  overpaymentCents: number;
  underpaymentCents: number;
  netCents: number;
  /** True if every enrollment has a clear bug shape and net is exactly 0. */
  pureAllocatorBugVictim: boolean;
  skipReason?: string;
}

interface ParentPlan {
  parent: AffectedParentSummary;
  moves: MoveSpec[];
  /**
   * Per-enrollment snapshot used to detect drift before writes. Every field is
   * compared against the freshly-locked row inside the service transaction.
   */
  snapshot: Map<number, EnrollmentSnapshot>;
}

interface ParentApplyResult {
  parent: AffectedParentSummary;
  moves: MoveSpec[];
  totalMovedCents: number;
  notificationSent: boolean;
  error?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    apply: false,
    parentId: null,
    limit: null,
    reportDir: 'scripts/reports',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--dry-run') opts.apply = false;
    else if (a === '--parent-id') {
      opts.parentId = parseInt(argv[++i], 10);
      if (!Number.isFinite(opts.parentId)) {
        throw new Error('--parent-id requires a numeric argument');
      }
    } else if (a === '--limit') {
      opts.limit = parseInt(argv[++i], 10);
      if (!Number.isFinite(opts.limit) || opts.limit <= 0) {
        throw new Error('--limit requires a positive integer');
      }
    } else if (a === '--report-dir') {
      opts.reportDir = argv[++i];
    } else if (a === '-h' || a === '--help') {
      console.log(
        'Usage: tsx scripts/fix-allocator-data-corruption.ts [--dry-run|--apply] [--parent-id N] [--limit N] [--report-dir path]',
      );
      process.exit(0);
    }
  }
  return opts;
}

const SCAN_SQL = `
  WITH parent_enrollments AS (
    SELECT
      e.parent_id,
      e.parent_email,
      e.id AS enrollment_id,
      e.child_name,
      e.class_name,
      e.total_cost,
      e.total_paid,
      e.comp_amount_cents,
      e.effective_balance,
      e.status,
      e.payment_status
    FROM program_enrollments e
    WHERE e.parent_id IS NOT NULL
  ),
  affected_parents AS (
    SELECT parent_id
    FROM parent_enrollments
    GROUP BY parent_id
    HAVING SUM(CASE WHEN effective_balance < 0 THEN 1 ELSE 0 END) > 0
       AND SUM(CASE WHEN effective_balance > 0 THEN 1 ELSE 0 END) > 0
  )
  SELECT pe.*
  FROM parent_enrollments pe
  WHERE pe.parent_id IN (SELECT parent_id FROM affected_parents)
  ORDER BY pe.parent_id, pe.enrollment_id
`;

async function scanAffectedParents(pool: pg.Pool): Promise<AffectedParentSummary[]> {
  const { rows } = await pool.query<
    AffectedEnrollmentRow & { parent_id: number; parent_email: string | null }
  >(SCAN_SQL);
  const byParent = new Map<number, AffectedParentSummary>();
  for (const r of rows) {
    if (!byParent.has(r.parent_id)) {
      byParent.set(r.parent_id, {
        parent_id: r.parent_id,
        parent_email: r.parent_email,
        enrollments: [],
        overpaymentCents: 0,
        underpaymentCents: 0,
        netCents: 0,
        pureAllocatorBugVictim: false,
      });
    }
    byParent.get(r.parent_id)!.enrollments.push({
      enrollment_id: r.enrollment_id,
      child_name: r.child_name,
      class_name: r.class_name,
      total_cost: r.total_cost,
      total_paid: r.total_paid,
      comp_amount_cents: r.comp_amount_cents,
      effective_balance: r.effective_balance,
      status: r.status,
      payment_status: r.payment_status,
    });
  }
  for (const p of byParent.values()) {
    let over = 0;
    let under = 0;
    let net = 0;
    let anyCancelled = false;
    for (const e of p.enrollments) {
      net += e.effective_balance;
      if (e.effective_balance < 0) over += -e.effective_balance;
      if (e.effective_balance > 0) under += e.effective_balance;
      if (e.status === 'cancelled' || e.status === 'withdrawn') anyCancelled = true;
    }
    p.overpaymentCents = over;
    p.underpaymentCents = under;
    p.netCents = net;
    p.pureAllocatorBugVictim = net === 0 && over > 0 && under > 0 && !anyCancelled;
    if (net !== 0) {
      p.skipReason =
        'net_nonzero_other_damage_present (parent has additional damage beyond the even-split allocator bug — needs human review, not auto-fix)';
    } else if (anyCancelled) {
      p.skipReason =
        'cancelled_or_withdrawn_enrollment_present (one or more enrollments are cancelled/withdrawn — auto-reallocation would fail)';
    }
  }
  return [...byParent.values()].sort((a, b) => a.parent_id - b.parent_id);
}

/**
 * Reallocation planner — proportional distribution per source.
 *
 * For each over enrollment (sorted deterministically by id) we call the shared
 * production helper `allocatePaymentByBalance(overAmount, remainingUnders)`,
 * which performs a BigInt floor + Hamilton's largest-remainder split bounded
 * by each target's remaining underpayment. This is the same math the live
 * payment path uses to allocate an incoming payment across sibling
 * enrollments, so the remediation script and the production allocator agree
 * on what "fair" means.
 *
 * Gated on `p.pureAllocatorBugVictim` (per-parent net = 0): under that
 * precondition, each target's accumulated proportional shares from every
 * source sum exactly to its underpayment, so every enrollment ends at
 * effective_balance $0 and `sum(moves) == sum(overpayments) ==
 * sum(underpayments)` — no cents are dropped, invented, or stranded.
 */
function computeReallocationPlan(p: AffectedParentSummary): MoveSpec[] {
  if (p.netCents !== 0) return [];
  const overs = p.enrollments
    .filter((e) => e.effective_balance < 0)
    .sort((a, b) => a.enrollment_id - b.enrollment_id)
    .map((e) => ({ id: e.enrollment_id, overCents: -e.effective_balance }));
  const undersOrdered = p.enrollments
    .filter((e) => e.effective_balance > 0)
    .sort((a, b) => a.enrollment_id - b.enrollment_id);
  if (overs.length === 0 || undersOrdered.length === 0) return [];

  const remaining = new Map<number, number>(
    undersOrdered.map((u) => [u.enrollment_id, u.effective_balance]),
  );
  const moves: MoveSpec[] = [];

  for (const src of overs) {
    const targets = undersOrdered
      .map((u) => ({
        enrollmentId: u.enrollment_id,
        effectiveBalanceCents: remaining.get(u.enrollment_id)!,
      }))
      .filter((t) => t.effectiveBalanceCents > 0);
    if (targets.length === 0) break;
    const split = allocatePaymentByBalance(src.overCents, targets);
    for (const s of split) {
      if (s.amountCents <= 0) continue;
      moves.push({
        sourceEnrollmentId: src.id,
        targetEnrollmentId: s.enrollmentId,
        amountCents: s.amountCents,
      });
      remaining.set(s.enrollmentId, (remaining.get(s.enrollmentId) ?? 0) - s.amountCents);
    }
  }
  return moves;
}

function buildSnapshot(p: AffectedParentSummary): Map<number, EnrollmentSnapshot> {
  return new Map(
    p.enrollments.map((e) => [
      e.enrollment_id,
      {
        totalPaid: e.total_paid,
        totalCost: e.total_cost,
        compAmountCents: e.comp_amount_cents,
        status: e.status,
        effectiveBalance: e.effective_balance,
      } satisfies EnrollmentSnapshot,
    ]),
  );
}

function buildPlans(parents: AffectedParentSummary[]): ParentPlan[] {
  return parents.map((p) => ({
    parent: p,
    moves: computeReallocationPlan(p),
    snapshot: buildSnapshot(p),
  }));
}

function fmtUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

interface AggregateTotals {
  totalParents: number;
  eligibleParents: number;
  investigationParents: number;
  totalOverpaymentCents: number;
  totalUnderpaymentCents: number;
  totalAbsoluteMisallocationCents: number;
  totalNetCents: number;
  plannedReallocations: number;
  plannedMovedCents: number;
}

function aggregateTotals(plans: ParentPlan[]): AggregateTotals {
  let eligible = 0;
  let investigation = 0;
  let over = 0;
  let under = 0;
  let net = 0;
  let movedCents = 0;
  let movesCount = 0;
  for (const pp of plans) {
    const p = pp.parent;
    if (p.pureAllocatorBugVictim) {
      eligible += 1;
      movesCount += pp.moves.length;
      movedCents += pp.moves.reduce((s, m) => s + m.amountCents, 0);
    } else {
      investigation += 1;
    }
    over += p.overpaymentCents;
    under += p.underpaymentCents;
    net += p.netCents;
  }
  return {
    totalParents: plans.length,
    eligibleParents: eligible,
    investigationParents: investigation,
    totalOverpaymentCents: over,
    totalUnderpaymentCents: under,
    // Absolute misallocation = total dollars that landed on the wrong enrollment
    // across ALL affected parents (not just eligible). Each over-cent and each
    // under-cent represents one cent that is on the wrong row, so the sum of
    // over + under counts each misplaced cent twice (once at the source it
    // overshoot, once at the target it undershot). We report both halves and
    // their max so admins can see "how big is this problem in dollars" no
    // matter which framing they prefer.
    totalAbsoluteMisallocationCents: Math.max(over, under),
    totalNetCents: net,
    plannedReallocations: movesCount,
    plannedMovedCents: movedCents,
  };
}

function printDryRunTable(plans: ParentPlan[], totals: AggregateTotals): void {
  console.log('\n=== AFFECTED PARENTS — DRY-RUN PLAN ===\n');
  for (const pp of plans) {
    const p = pp.parent;
    const eligible = p.pureAllocatorBugVictim;
    console.log(
      `Parent #${p.parent_id} (${p.parent_email}) — ` +
        `${p.enrollments.length} enrollments, over ${fmtUsd(p.overpaymentCents)}, ` +
        `under ${fmtUsd(p.underpaymentCents)}, net ${fmtUsd(p.netCents)} — ` +
        (eligible ? 'ELIGIBLE for auto-fix' : `SKIP (${p.skipReason})`),
    );
    if (!eligible) continue;
    for (const r of pp.moves) {
      console.log(
        `   move ${fmtUsd(r.amountCents)}: enrollment ${r.sourceEnrollmentId} → ${r.targetEnrollmentId}`,
      );
    }
  }
  console.log(
    `\n=== AGGREGATE ACROSS ALL ${totals.totalParents} AFFECTED PARENT(S) ===` +
      `\n   Total overpayment (cash on enrollments that should not have it): ${fmtUsd(totals.totalOverpaymentCents)}` +
      `\n   Total underpayment (enrollments still owed cash): ${fmtUsd(totals.totalUnderpaymentCents)}` +
      `\n   Total absolute misallocation: ${fmtUsd(totals.totalAbsoluteMisallocationCents)}` +
      `\n   Net family-wide balance (sum of all eff. balances): ${fmtUsd(totals.totalNetCents)}` +
      `\n   Eligible for auto-fix (per-parent net = $0): ${totals.eligibleParents} parent(s)` +
      `\n   Investigation only (per-parent net != $0 or cancelled enrollment present): ${totals.investigationParents} parent(s)` +
      `\n   Reallocations planned across eligible parents: ${totals.plannedReallocations} (total ${fmtUsd(totals.plannedMovedCents)})\n`,
  );
}

/**
 * Re-reads a single parent's enrollment state from the live database. Used
 * immediately before `applyParent` to compare against the dry-run scan
 * snapshot — any field-level drift aborts the parent's batch.
 */
async function freshScanParent(
  pool: pg.Pool,
  parentId: number,
): Promise<AffectedEnrollmentRow[]> {
  const { rows } = await pool.query<AffectedEnrollmentRow>(
    `SELECT id AS enrollment_id, child_name, class_name, total_cost, total_paid,
            comp_amount_cents, effective_balance, status, payment_status
     FROM program_enrollments
     WHERE parent_id = $1
     ORDER BY id`,
    [parentId],
  );
  return rows;
}

interface DriftDiff {
  enrollmentId: number;
  field: string;
  scanned: unknown;
  current: unknown;
}

/**
 * Compares the dry-run scan snapshot against a freshly-read state for the same
 * parent. Returns the list of field-level differences (empty array → no drift).
 * Comparison covers every field that affects reallocation validity:
 * `total_paid`, `total_cost`, `comp_amount_cents`, `effective_balance`, and
 * `status`. Any mismatch means the parent's environment changed since the
 * scan and the planned moves may no longer be safe — caller skips the parent.
 */
function diffSnapshots(
  scanned: AffectedEnrollmentRow[],
  fresh: AffectedEnrollmentRow[],
): DriftDiff[] {
  const diffs: DriftDiff[] = [];
  const freshById = new Map(fresh.map((r) => [r.enrollment_id, r]));
  for (const s of scanned) {
    const f = freshById.get(s.enrollment_id);
    if (!f) {
      diffs.push({ enrollmentId: s.enrollment_id, field: 'existence', scanned: 'present', current: 'missing' });
      continue;
    }
    const fields: (keyof AffectedEnrollmentRow)[] = [
      'total_paid',
      'total_cost',
      'comp_amount_cents',
      'effective_balance',
      'status',
    ];
    for (const k of fields) {
      if (s[k] !== f[k]) {
        diffs.push({ enrollmentId: s.enrollment_id, field: String(k), scanned: s[k], current: f[k] });
      }
    }
  }
  // Also flag any *new* over/under enrollments that appeared since the scan.
  const scannedIds = new Set(scanned.map((s) => s.enrollment_id));
  for (const f of fresh) {
    if (scannedIds.has(f.enrollment_id)) continue;
    if (f.effective_balance !== 0) {
      diffs.push({
        enrollmentId: f.enrollment_id,
        field: 'new_enrollment_with_nonzero_balance',
        scanned: 'absent',
        current: f.effective_balance,
      });
    }
  }
  return diffs;
}

async function applyParent(
  pool: pg.Pool,
  pp: ParentPlan,
  runId: string,
): Promise<ParentApplyResult> {
  const p = pp.parent;
  const result: ParentApplyResult = {
    parent: p,
    moves: pp.moves,
    totalMovedCents: 0,
    notificationSent: false,
  };

  // 1. Per-parent fresh re-read + full-field drift comparison against scan.
  const fresh = await freshScanParent(pool, p.parent_id);
  const diffs = diffSnapshots(p.enrollments, fresh);
  if (diffs.length > 0) {
    const summary = diffs
      .slice(0, 5)
      .map((d) => `enrollment ${d.enrollmentId} ${d.field}: scan=${d.scanned} current=${d.current}`)
      .join('; ');
    result.error = `DRIFT_BEFORE_APPLY: ${diffs.length} field difference(s): ${summary}${diffs.length > 5 ? ` …(+${diffs.length - 5} more)` : ''}`;
    console.error(`   ❌ Parent #${p.parent_id} ${result.error} — skipping (no writes)`);
    return result;
  }

  // 2. Recompute moves from the fresh state (defensive — must match planned moves
  //    exactly because there was no drift; serves as a self-check).
  const freshSummary: AffectedParentSummary = {
    ...p,
    enrollments: fresh,
    overpaymentCents: fresh.reduce((s, e) => s + (e.effective_balance < 0 ? -e.effective_balance : 0), 0),
    underpaymentCents: fresh.reduce((s, e) => s + (e.effective_balance > 0 ? e.effective_balance : 0), 0),
    netCents: fresh.reduce((s, e) => s + e.effective_balance, 0),
    pureAllocatorBugVictim:
      fresh.reduce((s, e) => s + e.effective_balance, 0) === 0 &&
      fresh.some((e) => e.effective_balance < 0) &&
      fresh.some((e) => e.effective_balance > 0) &&
      !fresh.some((e) => e.status === 'cancelled' || e.status === 'withdrawn'),
  };
  const recomputed = computeReallocationPlan(freshSummary);
  const recomputedKey = recomputed.map((m) => `${m.sourceEnrollmentId}->${m.targetEnrollmentId}:${m.amountCents}`).join('|');
  const plannedKey = pp.moves.map((m) => `${m.sourceEnrollmentId}->${m.targetEnrollmentId}:${m.amountCents}`).join('|');
  if (recomputedKey !== plannedKey) {
    result.error = `PLAN_MISMATCH_AFTER_FRESH_RECOMPUTE: planned=[${plannedKey}] fresh=[${recomputedKey}]`;
    console.error(`   ❌ Parent #${p.parent_id} ${result.error} — skipping (no writes)`);
    return result;
  }
  // Snapshot used by the service's in-tx drift check uses the fresh values too.
  // Includes every field the service compares against the locked row.
  const snapshot = buildSnapshot(freshSummary);

  const adminCommentBuilder = (m: MoveSpec) =>
    `Allocator bug remediation, script run ${runId}. Mar 25 2026 even-split bug caused payment to land on already-paid enrollment(s); reallocating from enrollment ${m.sourceEnrollmentId} to enrollment ${m.targetEnrollmentId}. See post-run report for full per-parent diff.`;

  // 3. Pause auto-pay through the canonical typed storage interface.
  const userBefore = await storage.getUser(p.parent_id);
  const priorAutoPay = userBefore?.autoPayEnabled ?? false;
  if (priorAutoPay) {
    await storage.updateUser(p.parent_id, { autoPayEnabled: false });
    console.log(`   ⏸️  Auto-pay paused for parent #${p.parent_id} (will restore: true)`);
  }

  try {
    const results = await PaymentReallocationService.reallocateMany({
      parentId: p.parent_id,
      moves: pp.moves,
      snapshot,
      adminCommentBuilder,
      runId,
      performedBy: 'allocator-fix-script',
      performedById: null,
    });
    result.totalMovedCents = results.reduce((s, r) => s + (r.target.newTotalPaid - r.target.previousTotalPaid), 0);
    for (const r of results) {
      console.log(
        `   ✅ moved ${fmtUsd(r.target.newTotalPaid - r.target.previousTotalPaid)} ` +
          `from enrollment ${r.source.enrollmentId} → ${r.target.enrollmentId} ` +
          `(audit pair ${r.outAllocationId}/${r.inAllocationId} anchor ${r.anchorPaymentHistoryId})`,
      );
    }
  } catch (err) {
    if (err instanceof PaymentReallocationError) {
      result.error = `${err.code}: ${err.message}`;
    } else {
      result.error = err instanceof Error ? err.message : String(err);
    }
    console.error(`   ❌ Parent #${p.parent_id} batch FAILED: ${result.error}`);
  } finally {
    // Restore auto-pay regardless of outcome (typed storage interface).
    if (priorAutoPay) {
      await storage.updateUser(p.parent_id, { autoPayEnabled: true });
      console.log(`   ▶️  Auto-pay restored for parent #${p.parent_id}`);
    }
  }

  // Queue parent notification only if the batch fully succeeded.
  if (!result.error && result.totalMovedCents > 0) {
    try {
      const notification = await storage.createNotification({
        senderId: p.parent_id,
        schoolId: null,
        type: 'in_app',
        priority: 'normal',
        subject: 'We corrected an error in how a payment was applied',
        content:
          'We corrected an error in how a recent payment was applied across your enrollments. Your total paid is unchanged; your balance now reflects the correct amount. No action is needed.',
        targetType: 'individual',
        targetData: { userId: p.parent_id, runId, source: 'allocator-fix-script' },
        scheduledFor: null,
        expiresAt: null,
      });
      await storage.createNotificationRecipient({
        notificationId: notification.id,
        recipientId: p.parent_id,
        deliveryType: 'in_app',
        status: 'pending',
      });
      result.notificationSent = true;
      console.log(`   📧 Notification queued for parent #${p.parent_id}`);
    } catch (notifyErr) {
      console.error(
        `   ⚠️  Failed to queue notification for parent #${p.parent_id}:`,
        notifyErr,
      );
    }
  }

  return result;
}

async function verifySara(pool: pg.Pool): Promise<{ ok: boolean; details: string }> {
  const r = await pool.query<{ id: number; effective_balance: number }>(
    `SELECT id, effective_balance FROM program_enrollments WHERE id IN (187, 188, 191, 381, 382) ORDER BY id`,
  );
  const lines: string[] = [];
  let ok = true;
  for (const row of r.rows) {
    const expectedZero = row.effective_balance === 0;
    if (!expectedZero) ok = false;
    lines.push(
      `   enrollment #${row.id}: effective_balance = ${fmtUsd(row.effective_balance)} ${expectedZero ? '✅' : '❌ (expected $0)'}`,
    );
  }
  const c = await pool.query<{
    id: number;
    credit_amount_cents: number;
    used_amount_cents: number;
    status: string;
  }>(`SELECT id, credit_amount_cents, used_amount_cents, status FROM credits WHERE id = 32`);
  if (c.rows.length > 0) {
    const cr = c.rows[0];
    const untouched = cr.used_amount_cents === 0 && cr.status === 'approved';
    if (!untouched) ok = false;
    lines.push(
      `   credit #32: ${fmtUsd(cr.credit_amount_cents)} (${cr.status}), used ${fmtUsd(cr.used_amount_cents)} ${untouched ? '✅' : '❌ (expected unused & approved)'}`,
    );
  } else {
    ok = false;
    lines.push('   credit #32: NOT FOUND ❌');
  }
  return { ok, details: lines.join('\n') };
}

function buildReportMarkdown(
  runId: string,
  opts: CliOptions,
  scanned: AffectedParentSummary[],
  plans: ParentPlan[],
  totals: AggregateTotals,
  applied: ParentApplyResult[] | null,
  saraVerification: { ok: boolean; details: string } | null,
): string {
  const lines: string[] = [];
  const mode = opts.apply ? 'APPLY' : 'DRY-RUN';
  lines.push(`# Allocator Bug Remediation Report`);
  lines.push('');
  lines.push(`**Run ID:** \`${runId}\`  `);
  lines.push(`**Mode:** ${mode}  `);
  lines.push(`**Generated:** ${new Date().toISOString()}  `);
  lines.push(`**Filters:** parent-id=${opts.parentId ?? 'all'}, limit=${opts.limit ?? 'none'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Parents scanned: **${scanned.length}**`);
  const eligible = scanned.filter((p) => p.pureAllocatorBugVictim);
  const ineligible = scanned.filter((p) => !p.pureAllocatorBugVictim);
  lines.push(`- Pure allocator-bug victims (eligible for auto-fix): **${eligible.length}**`);
  lines.push(`- Investigation-only (non-zero net or other complications): **${ineligible.length}**`);
  lines.push('');
  lines.push('### Aggregate misallocation across **all** affected parents');
  lines.push('');
  lines.push(`- **Total absolute misallocation:** ${fmtUsd(totals.totalAbsoluteMisallocationCents)}`);
  lines.push(`- Total overpayment (cash on enrollments that should not have it): ${fmtUsd(totals.totalOverpaymentCents)}`);
  lines.push(`- Total underpayment (enrollments still owed cash): ${fmtUsd(totals.totalUnderpaymentCents)}`);
  lines.push(`- Net family-wide balance (sum of all eff. balances across all affected parents): ${fmtUsd(totals.totalNetCents)}`);
  lines.push(`- Reallocations planned (across eligible parents only): ${totals.plannedReallocations} totalling ${fmtUsd(totals.plannedMovedCents)}`);
  lines.push('');
  if (applied) {
    const fixed = applied.filter((a) => !a.error && a.totalMovedCents > 0);
    const failed = applied.filter((a) => a.error);
    const totalMoved = applied.reduce((s, a) => s + a.totalMovedCents, 0);
    lines.push(`- Parents fixed in this run: **${fixed.length}**`);
    lines.push(`- Parents failed in this run: **${failed.length}**`);
    lines.push(`- Total moved across all reallocations: **${fmtUsd(totalMoved)}**`);
  }
  lines.push('');

  if (saraVerification) {
    lines.push('## Sara Puccia (parent #55) — Final State Verification');
    lines.push('');
    lines.push(saraVerification.ok ? '✅ All assertions passed.' : '❌ ASSERTIONS FAILED.');
    lines.push('');
    lines.push('```');
    lines.push(saraVerification.details);
    lines.push('```');
    lines.push('');
  }

  lines.push('## Eligible Parents — Reallocation Plan');
  lines.push('');
  if (eligible.length === 0) {
    lines.push('_No eligible parents found in this run._');
    lines.push('');
  } else {
    for (const p of eligible) {
      const pp = plans.find((x) => x.parent.parent_id === p.parent_id)!;
      const a = applied?.find((x) => x.parent.parent_id === p.parent_id);
      lines.push(`### Parent #${p.parent_id} — ${p.parent_email ?? '(no email)'}`);
      lines.push('');
      lines.push(
        `- Enrollments: ${p.enrollments.length}, overpayment ${fmtUsd(p.overpaymentCents)}, underpayment ${fmtUsd(p.underpaymentCents)}, net ${fmtUsd(p.netCents)}`,
      );
      if (a) {
        if (a.error) {
          lines.push(`- **APPLY result:** ❌ batch aborted — \`${a.error}\` (transaction rolled back; no partial state)`);
        } else {
          lines.push(
            `- **APPLY result:** ✅ ${a.moves.length} reallocation(s) committed in a single transaction, total moved ${fmtUsd(a.totalMovedCents)}, notification ${a.notificationSent ? 'queued' : 'NOT sent'}`,
          );
        }
      }
      lines.push('');
      lines.push('| From enrollment | To enrollment | Amount |');
      lines.push('| --- | --- | --- |');
      for (const r of pp.moves) {
        lines.push(`| ${r.sourceEnrollmentId} | ${r.targetEnrollmentId} | ${fmtUsd(r.amountCents)} |`);
      }
      lines.push('');
      lines.push('Enrollment state at scan time:');
      lines.push('');
      lines.push('| Enrollment | Child | Class | Total cost | Total paid | Comp | Eff. balance | Status |');
      lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
      for (const e of p.enrollments) {
        lines.push(
          `| ${e.enrollment_id} | ${e.child_name ?? ''} | ${e.class_name ?? ''} | ${fmtUsd(e.total_cost)} | ${fmtUsd(e.total_paid)} | ${fmtUsd(e.comp_amount_cents ?? 0)} | ${fmtUsd(e.effective_balance)} | ${e.status ?? ''} |`,
        );
      }
      lines.push('');
    }
  }

  lines.push('## Investigation-Only Parents (NOT auto-fixed)');
  lines.push('');
  lines.push(
    'These parents have damage that does **not** match the pure even-split allocator-bug shape (per-parent net effective balance is non-zero, or one of the affected enrollments is cancelled/withdrawn). Auto-reallocation is unsafe — each one needs human investigation to identify the additional cause(s) (refund mishandling, manual admin error, comp change, etc.) before any correction.',
  );
  lines.push('');
  if (ineligible.length === 0) {
    lines.push('_No investigation-only parents in this run._');
    lines.push('');
  } else {
    for (const p of ineligible) {
      lines.push(`### Parent #${p.parent_id} — ${p.parent_email ?? '(no email)'}`);
      lines.push('');
      lines.push(`- **Skip reason:** ${p.skipReason}`);
      lines.push(
        `- Enrollments: ${p.enrollments.length}, overpayment ${fmtUsd(p.overpaymentCents)}, underpayment ${fmtUsd(p.underpaymentCents)}, **net ${fmtUsd(p.netCents)}**`,
      );
      lines.push('');
      lines.push('| Enrollment | Child | Class | Total cost | Total paid | Comp | Eff. balance | Status |');
      lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
      for (const e of p.enrollments) {
        lines.push(
          `| ${e.enrollment_id} | ${e.child_name ?? ''} | ${e.class_name ?? ''} | ${fmtUsd(e.total_cost)} | ${fmtUsd(e.total_paid)} | ${fmtUsd(e.comp_amount_cents ?? 0)} | ${fmtUsd(e.effective_balance)} | ${e.status ?? ''} |`,
        );
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const runId = randomUUID();
  console.log(`🆔 Run ID: ${runId}`);
  console.log(`Mode: ${opts.apply ? 'APPLY (writes will happen)' : 'DRY-RUN (no writes)'}`);

  const connectionString = getNormalizedDatabaseUrl();
  if (!connectionString) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
  }
  const pool = new Pool({ connectionString, ssl: getDbSslConfig(connectionString) });

  try {
    console.log('🔍 Scanning for affected parents…');
    let scanned = await scanAffectedParents(pool);
    console.log(`   Found ${scanned.length} affected parent(s).`);

    if (opts.parentId !== null) {
      scanned = scanned.filter((p) => p.parent_id === opts.parentId);
      console.log(`   After --parent-id ${opts.parentId} filter: ${scanned.length}`);
    }
    if (opts.limit !== null) {
      scanned = scanned.slice(0, opts.limit);
      console.log(`   After --limit ${opts.limit}: ${scanned.length}`);
    }

    const plans = buildPlans(scanned);
    const totals = aggregateTotals(plans);
    printDryRunTable(plans, totals);

    let applied: ParentApplyResult[] | null = null;
    let saraVerification: { ok: boolean; details: string } | null = null;

    if (opts.apply) {
      console.log('\n🚀 APPLY mode — writing reallocations…\n');
      applied = [];
      for (const pp of plans) {
        if (!pp.parent.pureAllocatorBugVictim) {
          console.log(`⏭️  Skipping parent #${pp.parent.parent_id}: ${pp.parent.skipReason}`);
          continue;
        }
        console.log(`\n→ Parent #${pp.parent.parent_id} (${pp.parent.parent_email})`);
        const r = await applyParent(pool, pp, runId);
        applied.push(r);
      }

      if (plans.some((p) => p.parent.parent_id === 55)) {
        console.log('\n🔎 Verifying Sara Puccia final state…');
        saraVerification = await verifySara(pool);
        console.log(saraVerification.details);
        console.log(saraVerification.ok ? '✅ Sara verification passed.' : '❌ SARA VERIFICATION FAILED');
      }
    }

    mkdirSync(opts.reportDir, { recursive: true });
    const reportPath = join(opts.reportDir, `allocator-fix-${runId}.md`);
    const md = buildReportMarkdown(runId, opts, scanned, plans, totals, applied, saraVerification);
    writeFileSync(reportPath, md);
    console.log(`\n📝 Report written: ${reportPath}`);

    if (opts.apply && saraVerification && !saraVerification.ok) {
      process.exit(2);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
