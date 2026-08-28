/**
 * Export Fall 2026 class rosters (enrolled + pending-in-band) to CSV.
 *
 * Overwrites `docs/audit/fall-2026-class-rosters.csv`. After 2026-09-21
 * (America/New_York) the script no-ops unless `--force`.
 *
 * Daily CI: `.github/workflows/fall-2026-roster-snapshot.yml`
 *
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/export-fall-2026-class-rosters.ts
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/export-fall-2026-class-rosters.ts --force
 */

import fs from 'node:fs';
import path from 'node:path';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db';
import {
  children,
  classes,
  locations,
  programEnrollments,
  schoolStudents,
  sessions,
  users,
} from '../../shared/schema';
import { gradesMatch } from '../../shared/grade-levels';

const FALL_SESSION_ID = 2;
const SCHOOL_ID = 2;
const LAST_SNAPSHOT_DAY = '2026-09-21';
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const OUT = path.resolve(process.cwd(), 'docs/audit/fall-2026-class-rosters.csv');
const TRANSITIONS_OUT = path.resolve(
  process.cwd(),
  'docs/audit/fall-2026-class-rosters-transitions.csv',
);

function todayNyDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const AS_OF_DAY = todayNyDate();
const AS_OF = new Date(`${AS_OF_DAY}T12:00:00`);

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQ = !inQ;
      }
    } else if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

type PriorRow = {
  classTitle: string;
  child: string;
  childId: string;
  seat: string;
  classStatus: string;
  pending: string;
  parent: string;
  email: string;
};

function loadPriorRoster(filePath: string): PriorRow[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const idx = (name: string) => headers.indexOf(name);
  const classI = idx('class');
  const childI = idx('child');
  const childIdI = idx('child_id');
  const seatI = idx('seat');
  const statusI = idx('class_status');
  const pendingI = idx('pending');
  const parentI = idx('parent');
  const emailI = idx('email');
  if (classI < 0 || childIdI < 0) return [];
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return {
      classTitle: cols[classI] || '',
      child: cols[childI] || '',
      childId: cols[childIdI] || '',
      seat: cols[seatI] || '',
      classStatus: cols[statusI] || '',
      pending: cols[pendingI] || '',
      parent: cols[parentI] || '',
      email: cols[emailI] || '',
    };
  });
}

function rowKey(classTitle: string, childId: string | number): string {
  return `${classTitle}::${childId}`;
}

type Row = {
  classTitle: string;
  campus: string;
  child: string;
  dayType: string;
  grade: string;
  pending: string;
  parent: string;
  email: string;
  phone: string;
  seat: string;
  classStatus: string;
  age: string;
  birthdate: string;
  childId: number;
  parentId: number;
  classEnrollmentId: string;
  sessionEnrollmentId: string;
  classId: number;
  sortName: string;
};

function appendTransitions(prior: PriorRow[], next: Row[], asOf: string) {
  const priorByKey = new Map(prior.map((r) => [rowKey(r.classTitle, r.childId), r]));
  const nextByKey = new Map(next.map((r) => [rowKey(r.classTitle, String(r.childId)), r]));
  const events: string[][] = [];

  for (const [key, now] of nextByKey) {
    const was = priorByKey.get(key);
    if (!was) {
      if (now.seat === 'not on roster') {
        events.push([
          asOf,
          'pending_added',
          now.classTitle,
          now.child,
          String(now.childId),
          '',
          now.seat,
          '',
          now.classStatus,
          '',
          now.pending,
          now.parent,
          now.email,
        ]);
      }
      continue;
    }
    const wasPendingSeat = was.seat === 'not on roster';
    const nowOnRoster = now.seat !== 'not on roster';
    if (wasPendingSeat && nowOnRoster) {
      events.push([
        asOf,
        'pending_to_enrolled',
        now.classTitle,
        now.child,
        String(now.childId),
        was.seat,
        now.seat,
        was.classStatus,
        now.classStatus,
        was.pending,
        now.pending,
        now.parent,
        now.email,
      ]);
    }
  }

  for (const [key, was] of priorByKey) {
    if (nextByKey.has(key)) continue;
    if (was.seat !== 'not on roster') continue;
    events.push([
      asOf,
      'pending_removed',
      was.classTitle,
      was.child,
      was.childId,
      was.seat,
      '',
      was.classStatus,
      '',
      was.pending,
      '',
      was.parent,
      was.email,
    ]);
  }

  if (events.length === 0) {
    console.log('No pending→enrolled (or pending add/remove) changes since last snapshot');
    return;
  }

  const header = [
    'as_of',
    'change',
    'class',
    'child',
    'child_id',
    'from_seat',
    'to_seat',
    'from_status',
    'to_status',
    'from_pending',
    'to_pending',
    'parent',
    'email',
  ];
  const existed = fs.existsSync(TRANSITIONS_OUT) && fs.statSync(TRANSITIONS_OUT).size > 0;
  const lines = events.map((cols) => cols.map(csvEscape).join(','));
  if (!existed) {
    fs.writeFileSync(TRANSITIONS_OUT, `${header.join(',')}\n${lines.join('\n')}\n`);
  } else {
    fs.appendFileSync(TRANSITIONS_OUT, `${lines.join('\n')}\n`);
  }
  console.log(`Appended ${events.length} transition(s) → ${TRANSITIONS_OUT}`);
  for (const e of events) {
    console.log(`  ${e[1]} ${e[3]} (${e[2]})`);
  }
}

function formatPhone(raw: string | null | undefined): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return String(raw || '').trim();
}

function formatAge(birthdate: string | Date | null | undefined): string {
  if (!birthdate) return '';
  const birth =
    typeof birthdate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(birthdate)
      ? new Date(`${birthdate.slice(0, 10)}T12:00:00`)
      : new Date(birthdate);
  if (Number.isNaN(birth.getTime())) return '';
  let months =
    (AS_OF.getFullYear() - birth.getFullYear()) * 12 +
    (AS_OF.getMonth() - birth.getMonth());
  if (AS_OF.getDate() < birth.getDate()) months -= 1;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y}y ${m}m`;
}

function dayTypeLabel(dayType: string | null | undefined, className: string | null | undefined): string {
  const fromName = String(className || '');
  if (/mon\/fri|2 full days/i.test(fromName)) return 'full day (Mon/Fri)';
  if (dayType === 'full_day') return 'full day';
  if (dayType === 'half_day') return 'half day';
  return '';
}

function pendingLabel(balanceCents: number | null | undefined): string {
  const cents = balanceCents ?? 0;
  if (cents > 0) {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} unpaid`;
  }
  return '—';
}

function parentName(u: {
  firstName: string | null;
  lastName: string | null;
  name: string;
}): string {
  const first = (u.firstName || '').trim();
  const last = (u.lastName || '').trim();
  if (first || last) return `${first} ${last}`.trim();
  return (u.name || '').trim();
}

async function main() {
  if (AS_OF_DAY > LAST_SNAPSHOT_DAY && !FORCE) {
    console.log(
      `Past snapshot window (${AS_OF_DAY} > ${LAST_SNAPSHOT_DAY}). Skipping. Use --force to override.`,
    );
    process.exit(0);
  }

  const db = await getDb();
  if (!db) throw new Error('DATABASE_URL required');

  const [session] = await db.select().from(sessions).where(eq(sessions.id, FALL_SESSION_ID)).limit(1);
  if (!session || session.name !== 'Fall 2026') {
    throw new Error(`Expected Fall 2026 session #${FALL_SESSION_ID}`);
  }

  const classRows = await db
    .select()
    .from(classes)
    .where(and(eq(classes.sessionId, FALL_SESSION_ID), eq(classes.schoolId, SCHOOL_ID)));

  const locRows = await db.select().from(locations).where(eq(locations.schoolId, SCHOOL_ID));
  const locById = new Map(locRows.map((l) => [l.id, l.name]));

  const fallClasses = classRows
    .filter((c) => c.status !== 'cancelled')
    .sort((a, b) => {
      const loc = (a.locationId ?? 0) - (b.locationId ?? 0);
      if (loc !== 0) return loc;
      return a.title.localeCompare(b.title);
    });

  const classIds = fallClasses.map((c) => c.id);
  const rosterEnrsRaw =
    classIds.length === 0
      ? []
      : await db
          .select()
          .from(programEnrollments)
          .where(
            and(
              inArray(programEnrollments.marketplaceClassId, classIds),
              sql`${programEnrollments.status} NOT IN ('cancelled','withdrawn','failed','completed')`,
            ),
          );

  const seenSeat = new Map<string, number>();
  const rosterEnrs = [...rosterEnrsRaw].sort((a, b) => a.id - b.id).filter((e) => {
    const key = `${e.marketplaceClassId}:${e.childId}`;
    const first = seenSeat.get(key);
    if (first != null) {
      console.log(
        `  skip duplicate class seat #${e.id} (keep #${first}) child ${e.childId} class ${e.marketplaceClassId}`,
      );
      return false;
    }
    seenSeat.set(key, e.id);
    return true;
  });

  const sessionEnrs = await db
    .select()
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.sessionId, FALL_SESSION_ID),
        isNull(programEnrollments.marketplaceClassId),
        isNull(programEnrollments.classId),
        sql`${programEnrollments.status} NOT IN ('cancelled','withdrawn','failed')`,
      ),
    );

  const childIds = [
    ...new Set([
      ...rosterEnrs.map((e) => e.childId),
      ...sessionEnrs.map((e) => e.childId),
    ]),
  ];
  const kids =
    childIds.length === 0
      ? []
      : await db.select().from(children).where(inArray(children.id, childIds));
  const kidById = new Map(kids.map((k) => [k.id, k]));

  const parentIds = [
    ...new Set([
      ...rosterEnrs.map((e) => e.parentId),
      ...sessionEnrs.map((e) => e.parentId),
      ...kids.map((k) => k.parentId),
    ]),
  ];
  const parents =
    parentIds.length === 0
      ? []
      : await db.select().from(users).where(inArray(users.id, parentIds));
  const parentById = new Map(parents.map((p) => [p.id, p]));

  const affiliations =
    childIds.length === 0
      ? []
      : await db
          .select()
          .from(schoolStudents)
          .where(
            and(inArray(schoolStudents.childId, childIds), eq(schoolStudents.schoolId, SCHOOL_ID)),
          );
  const affByChild = new Map<number, (typeof affiliations)[number]>();
  for (const a of affiliations) {
    const prev = affByChild.get(a.childId);
    if (!prev || (prev.status !== 'active' && a.status === 'active')) {
      affByChild.set(a.childId, a);
    }
  }

  const sessionByChild = new Map<number, (typeof sessionEnrs)[number]>();
  for (const e of sessionEnrs) {
    const prev = sessionByChild.get(e.childId);
    if (!prev || e.id > prev.id) sessionByChild.set(e.childId, e);
  }

  const onRosterChildIds = new Set(
    rosterEnrs
      .filter((e) => ['enrolled', 'pending_admin_approval', 'waitlist'].includes(e.status))
      .map((e) => e.childId),
  );

  function resolvedCampus(childId: number, parentId: number): number | null {
    const kid = kidById.get(childId);
    const aff = affByChild.get(childId);
    const parent = parentById.get(parentId);
    return aff?.locationId ?? kid?.locationId ?? parent?.locationId ?? null;
  }

  function resolvedGrade(childId: number): string {
    const kid = kidById.get(childId);
    const aff = affByChild.get(childId);
    return (aff?.status === 'active' && aff.grade) || kid?.gradeLevel || '';
  }

  const rows: Row[] = [];

  for (const enr of rosterEnrs) {
    const cls = fallClasses.find((c) => c.id === enr.marketplaceClassId);
    if (!cls) continue;
    const kid = kidById.get(enr.childId);
    const parent = parentById.get(enr.parentId);
    const sess = sessionByChild.get(enr.childId);
    const seat =
      enr.placementSource === 'grade' ? 'grade' : enr.placementSource ? enr.placementSource : 'manual';
    rows.push({
      classTitle: cls.title,
      campus: locById.get(cls.locationId ?? -1) || '',
      child: `${(kid?.firstName || '').trim()} ${(kid?.lastName || '').trim()}`.trim() || enr.childName,
      dayType: dayTypeLabel(sess?.dayType, sess?.className),
      grade: resolvedGrade(enr.childId) || kid?.gradeLevel || '',
      pending: pendingLabel(sess?.effectiveBalance ?? sess?.remainingBalance),
      parent: parent ? parentName(parent) : '',
      email: parent?.email || enr.parentEmail,
      phone: formatPhone(parent?.phone),
      seat,
      classStatus: enr.status,
      age: formatAge(kid?.birthdate),
      birthdate: kid?.birthdate ? String(kid.birthdate).slice(0, 10) : '',
      childId: enr.childId,
      parentId: enr.parentId,
      classEnrollmentId: String(enr.id),
      sessionEnrollmentId: sess ? String(sess.id) : '',
      classId: cls.id,
      sortName: `${(kid?.lastName || '').trim()} ${(kid?.firstName || '').trim()}`.toLowerCase(),
    });
  }

  const autoPlaceClasses = fallClasses.filter((c) => c.autoPlaceByGrade && c.locationId);

  for (const sess of sessionEnrs) {
    if (sess.status !== 'pending_payment') continue;
    const due = sess.effectiveBalance ?? sess.remainingBalance ?? 0;
    if (due <= 0) continue;
    if (onRosterChildIds.has(sess.childId)) continue;

    const kid = kidById.get(sess.childId);
    const parent = parentById.get(sess.parentId);
    const campusId = resolvedCampus(sess.childId, sess.parentId);
    const grade = resolvedGrade(sess.childId);
    const matches = autoPlaceClasses.filter(
      (c) => c.locationId === campusId && gradesMatch(grade, c.gradeLevels),
    );
    if (matches.length === 0) continue;

    matches.sort((a, b) => (a.gradeLevels?.length ?? 99) - (b.gradeLevels?.length ?? 99));
    const cls = matches[0];

    rows.push({
      classTitle: cls.title,
      campus: locById.get(cls.locationId ?? -1) || '',
      child: `${(kid?.firstName || '').trim()} ${(kid?.lastName || '').trim()}`.trim() || sess.childName,
      dayType: dayTypeLabel(sess.dayType, sess.className),
      grade,
      pending: pendingLabel(due),
      parent: parent ? parentName(parent) : '',
      email: parent?.email || sess.parentEmail,
      phone: formatPhone(parent?.phone),
      seat: 'not on roster',
      classStatus: 'pending_payment',
      age: formatAge(kid?.birthdate),
      birthdate: kid?.birthdate ? String(kid.birthdate).slice(0, 10) : '',
      childId: sess.childId,
      parentId: sess.parentId,
      classEnrollmentId: '',
      sessionEnrollmentId: String(sess.id),
      classId: cls.id,
      sortName: `${(kid?.lastName || '').trim()} ${(kid?.firstName || '').trim()}`.toLowerCase(),
    });
  }

  const classOrder = new Map(fallClasses.map((c, i) => [c.id, i]));
  rows.sort((a, b) => {
    const ca = classOrder.get(a.classId) ?? 999;
    const cb = classOrder.get(b.classId) ?? 999;
    if (ca !== cb) return ca - cb;
    const seatRank = (s: string) => (s === 'not on roster' ? 1 : 0);
    if (seatRank(a.seat) !== seatRank(b.seat)) return seatRank(a.seat) - seatRank(b.seat);
    return a.sortName.localeCompare(b.sortName);
  });

  const header = [
    'as_of',
    'class',
    'campus',
    'child',
    'day_type',
    'grade',
    'pending',
    'parent',
    'email',
    'phone',
    'seat',
    'class_status',
    'age',
    'birthdate',
    'child_id',
    'parent_id',
    'class_enrollment_id',
    'session_enrollment_id',
  ];

  const prior = loadPriorRoster(OUT);

  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        AS_OF_DAY,
        r.classTitle,
        r.campus,
        r.child,
        r.dayType,
        r.grade,
        r.pending,
        r.parent,
        r.email,
        r.phone,
        r.seat,
        r.classStatus,
        r.age,
        r.birthdate,
        r.childId,
        r.parentId,
        r.classEnrollmentId,
        r.sessionEnrollmentId,
      ]
        .map(csvEscape)
        .join(','),
    ),
  ];

  if (DRY_RUN) {
    console.log(`DRY RUN — would write ${rows.length} rows to ${OUT}`);
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${lines.join('\n')}\n`);
    appendTransitions(prior, rows, AS_OF_DAY);
  }

  const byClass = new Map<string, { enrolled: number; pending: number; full: number; half: number }>();
  for (const r of rows) {
    const key = r.classTitle;
    const cur = byClass.get(key) || { enrolled: 0, pending: 0, full: 0, half: 0 };
    if (r.seat === 'not on roster') cur.pending += 1;
    else cur.enrolled += 1;
    if (r.dayType.startsWith('full')) cur.full += 1;
    if (r.dayType.startsWith('half')) cur.half += 1;
    byClass.set(key, cur);
  }

  console.log(`Wrote ${rows.length} rows → ${OUT} (as_of=${AS_OF_DAY})`);
  for (const [title, n] of byClass) {
    console.log(
      `  ${title}: on roster ${n.enrolled} | pending ${n.pending} | full ${n.full} | half ${n.half}`,
    );
  }

  const unmatchedPending = sessionEnrs.filter((s) => {
    if (s.status !== 'pending_payment') return false;
    const due = s.effectiveBalance ?? s.remainingBalance ?? 0;
    if (due <= 0) return false;
    if (onRosterChildIds.has(s.childId)) return false;
    return !rows.some((r) => r.sessionEnrollmentId === String(s.id) && r.seat === 'not on roster');
  });
  if (unmatchedPending.length) {
    console.log('\nPending session seats with no matching auto-place class:');
    for (const s of unmatchedPending) {
      const grade = resolvedGrade(s.childId);
      const campusId = resolvedCampus(s.childId, s.parentId);
      console.log(
        `  #${s.id} ${s.childName} grade=${grade} campus=${locById.get(campusId ?? -1) || campusId} due=${s.effectiveBalance}`,
      );
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
