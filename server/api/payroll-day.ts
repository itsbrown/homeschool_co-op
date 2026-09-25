import { Router } from "express";
import { z } from "zod";
import { isSchoolAdminBypassRole } from "@shared/permissions";
import { supabaseAuth } from "../middleware/supabase-auth";
import { storage } from "../storage";
import { isSchoolFeatureEnabled } from "../lib/school-features";
import { resolveSchoolIdForUser } from "../lib/resolve-school-id";
import {
  addJob,
  grantChecklistAccess,
  listActiveJobs,
  listChecklistFillers,
  listSavedDaySummaries,
  loadSavedDay,
  revokeChecklistAccess,
  saveDay,
  searchSchoolPeople,
  updateJob,
  deactivateJob,
  userCanFillChecklist,
} from "../lib/payroll-day-db";
import {
  classDayListWindow,
  classDayOnOrAfter,
  hoursToMinutes,
  isClassDay,
  listClassDays,
  minutesToHours,
  paidMinutes,
  payCents,
  weekdayOf,
  type PayrollPresent,
} from "@shared/payroll-day";

const router = Router();
router.use(supabaseAuth);

async function actor(req: { user?: { id?: number; role?: string } }) {
  const userId = req.user?.id;
  if (!userId) return null;
  const user = await storage.getUser(userId);
  if (!user) return null;
  const schoolId = await resolveSchoolIdForUser(user);
  if (!schoolId) return null;
  const features = await storage.getSchoolFeatures(schoolId);
  const featureEnabled = isSchoolFeatureEnabled(features, "dailyHours");
  const roles = await storage.getUserRolesByUserId(user.id);
  const bypass = [user.role, req.user?.role, ...roles.map((role) => role.role)].some((role) =>
    isSchoolAdminBypassRole(role),
  );
  const schoolGrant = bypass
    ? null
    : await storage.getUserSchoolPermissionByUserAndSchool(user.id, schoolId);
  const grantedRates = Boolean(
    schoolGrant && (schoolGrant.accessLevel === "admin" || schoolGrant.canManageHourlyRates),
  );
  const manageRates = featureEnabled && (bypass || grantedRates);
  const checklist = featureEnabled && (await userCanFillChecklist(schoolId, user.id));
  return { user, schoolId, featureEnabled, manageRates, checklist };
}

function checklistPayload(jobs: Awaited<ReturnType<typeof listActiveJobs>>, saved: Awaited<ReturnType<typeof loadSavedDay>>, workDate: string) {
  const savedByJob = new Map(saved?.lines.map((line) => [line.jobId, line]) ?? []);
  const lines = jobs.map((job) => {
    const savedLine = savedByJob.get(job.id);
    return {
      jobId: job.id,
      personName: savedLine?.personName ?? job.personName,
      jobLabel: savedLine?.jobLabel ?? job.jobLabel,
      present: savedLine?.present ?? "here",
      differentHours: savedLine?.differentMinutes == null ? null : minutesToHours(savedLine.differentMinutes),
      note: savedLine?.note ?? "",
      sortOrder: job.sortOrder,
    };
  });
  return {
    date: workDate,
    saved: Boolean(saved),
    note: saved?.note ?? "",
    lines,
  };
}

router.get("/access", async (req, res) => {
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "No access" });
  res.json({
    featureEnabled: who.featureEnabled,
    checklist: who.checklist,
    manageRates: who.manageRates,
  });
});

router.get("/days", async (req, res) => {
  try {
    const who = await actor(req);
    if (!who?.checklist) return res.status(403).json({ error: "You do not have access to daily hours." });
    const today = new Date().toISOString().slice(0, 10);
    const focus = isClassDay(today) ? today : classDayOnOrAfter(today);
    const window = classDayListWindow(focus);
    const jobs = await listActiveJobs(who.schoolId);
    const saved = await listSavedDaySummaries(who.schoolId, window.from, window.to);
    const byDate = new Map(saved.map((row) => [row.workDate, row]));
    const days = listClassDays(window.from, window.to).map((date) => {
      const row = byDate.get(date);
      const approved = Boolean(row);
      return {
        date,
        status: approved ? "approved" : "needs_review",
        isFocus: date === focus,
        jobCount: row?.jobCount ?? jobs.length,
        hereCount: row?.hereCount ?? (approved ? 0 : jobs.length),
        awayCount: row?.awayCount ?? 0,
        hasNote: row?.hasNote ?? false,
      };
    });
    res.json({ focus, from: window.from, to: window.to, days });
  } catch (error) {
    console.error("[payroll-day] days", error);
    res.status(500).json({ error: "Could not load class days" });
  }
});

router.get("/", async (req, res) => {
  try {
    const who = await actor(req);
    if (!who?.checklist) return res.status(403).json({ error: "You do not have access to daily hours." });
    const requested = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
    const workDate = isClassDay(requested) ? requested : classDayOnOrAfter(requested);
    const jobs = await listActiveJobs(who.schoolId);
    const saved = await loadSavedDay(who.schoolId, workDate);
    res.json(checklistPayload(jobs, saved, workDate));
  } catch (error) {
    console.error("[payroll-day] load", error);
    res.status(500).json({ error: "Could not open today" });
  }
});

const approveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post("/approve", async (req, res) => {
  try {
    const who = await actor(req);
    if (!who?.checklist) return res.status(403).json({ error: "You do not have access to daily hours." });
    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success || !isClassDay(parsed.data.date)) {
      return res.status(400).json({ error: "Pick a Monday, Wednesday, or Friday." });
    }
    const jobs = await listActiveJobs(who.schoolId);
    const existing = await loadSavedDay(who.schoolId, parsed.data.date);
    if (existing) {
      return res.json({ saved: true, alreadyApproved: true });
    }
    await saveDay({
      schoolId: who.schoolId,
      workDate: parsed.data.date,
      note: null,
      savedBy: who.user.id,
      lines: jobs.map((job) => ({
        jobId: job.id,
        personName: job.personName,
        jobLabel: job.jobLabel,
        present: "here" as const,
        differentMinutes: null,
        note: null,
        rateCentsSnapshot: job.rateCents,
        weeklyMinutesSnapshot: job.weeklyMinutes,
        sortOrder: job.sortOrder,
      })),
    });
    res.json({ saved: true, alreadyApproved: false });
  } catch (error) {
    console.error("[payroll-day] approve", error);
    res.status(500).json({ error: "Could not approve the day" });
  }
});

const saveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(2000).optional().nullable(),
  lines: z.array(z.object({
    jobId: z.number().int(),
    present: z.enum(["here", "away"]),
    differentHours: z.number().min(0).max(24).nullable().optional(),
    note: z.string().max(500).optional().nullable(),
  })),
});

router.post("/", async (req, res) => {
  try {
    const who = await actor(req);
    if (!who?.checklist) return res.status(403).json({ error: "You do not have access to daily hours." });
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success || !isClassDay(parsed.data.date)) {
      return res.status(400).json({ error: "Pick a Monday, Wednesday, or Friday." });
    }
    const jobs = await listActiveJobs(who.schoolId);
    const existing = await loadSavedDay(who.schoolId, parsed.data.date);
    const existingByJob = new Map(existing?.lines.map((line) => [line.jobId, line]) ?? []);
    const incoming = new Map(parsed.data.lines.map((line) => [line.jobId, line]));
    const weekday = weekdayOf(parsed.data.date);
    const lines = jobs.map((job) => {
      const prior = existingByJob.get(job.id);
      const next = incoming.get(job.id);
      const present: PayrollPresent = next?.present ?? prior?.present ?? "here";
      const differentMinutes = next
        ? next.differentHours == null ? null : hoursToMinutes(next.differentHours)
        : prior?.differentMinutes ?? null;
      return {
        jobId: job.id,
        personName: job.personName,
        jobLabel: job.jobLabel,
        present,
        differentMinutes,
        note: (next?.note ?? prior?.note ?? "").trim() || null,
        rateCentsSnapshot: prior?.rateCentsSnapshot ?? job.rateCents,
        weeklyMinutesSnapshot: prior?.weeklyMinutesSnapshot ?? job.weeklyMinutes,
        sortOrder: job.sortOrder,
        paidMinutes: paidMinutes({
          weeklyMinutes: prior?.weeklyMinutesSnapshot ?? job.weeklyMinutes,
          weekday,
          present,
          differentMinutes,
        }),
      };
    });
    await saveDay({
      schoolId: who.schoolId,
      workDate: parsed.data.date,
      note: (parsed.data.note ?? "").trim() || null,
      savedBy: who.user.id,
      lines,
    });
    res.json({ saved: true });
  } catch (error) {
    console.error("[payroll-day] save", error);
    res.status(500).json({ error: "Could not save" });
  }
});

router.get("/rates", async (req, res) => {
  try {
    const who = await actor(req);
    if (!who?.manageRates) return res.status(403).json({ error: "You do not have access to hourly rates." });
    const jobs = await listActiveJobs(who.schoolId);
    res.json({
      jobs: jobs.map((job) => ({
        id: job.id,
        personName: job.personName,
        jobLabel: job.jobLabel,
        hourlyRate: job.rateCents / 100,
        usualHours: minutesToHours(job.weeklyMinutes),
      })),
    });
  } catch (error) {
    console.error("[payroll-day] rates", error);
    res.status(500).json({ error: "Could not load rates" });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const who = await actor(req);
    if (!who?.manageRates) return res.status(403).json({ error: "You do not have access to hourly rates." });
    const requested = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
    const workDate = isClassDay(requested) ? requested : classDayOnOrAfter(requested);
    const saved = await loadSavedDay(who.schoolId, workDate);
    const weekday = weekdayOf(workDate);
    const lines = (saved?.lines ?? []).map((line) => {
      const minutes = paidMinutes({
        weeklyMinutes: line.weeklyMinutesSnapshot,
        weekday,
        present: line.present,
        differentMinutes: line.differentMinutes,
      });
      return {
        personName: line.personName,
        jobLabel: line.jobLabel,
        present: line.present,
        paidHours: minutesToHours(minutes),
        pay: payCents(minutes, line.rateCentsSnapshot) / 100,
      };
    });
    const pay = lines.reduce((sum, line) => sum + line.pay, 0);
    res.json({ date: workDate, saved: Boolean(saved), note: saved?.note ?? "", pay, lines });
  } catch (error) {
    console.error("[payroll-day] summary", error);
    res.status(500).json({ error: "Could not load the day" });
  }
});

const jobUpdateSchema = z.object({
  personName: z.string().min(1).max(80),
  jobLabel: z.string().min(1).max(80),
  hourlyRate: z.number().positive().max(500),
  usualHours: z.number().min(0).max(80),
});

router.patch("/jobs/:id", async (req, res) => {
  try {
    const who = await actor(req);
    if (!who?.manageRates) return res.status(403).json({ error: "You do not have access to hourly rates." });
    const parsed = jobUpdateSchema.safeParse(req.body);
    const jobId = parseInt(req.params.id, 10);
    if (!parsed.success || !Number.isFinite(jobId)) {
      return res.status(400).json({ error: "Check the person, the job, the rate, and the hours." });
    }
    const ok = await updateJob({
      schoolId: who.schoolId,
      jobId,
      personName: parsed.data.personName.trim(),
      jobLabel: parsed.data.jobLabel.trim(),
      rateCents: Math.round(parsed.data.hourlyRate * 100),
      weeklyMinutes: hoursToMinutes(parsed.data.usualHours),
    });
    if (!ok) return res.status(404).json({ error: "Job not found" });
    res.json({ saved: true });
  } catch (error) {
    console.error("[payroll-day] update job", error);
    res.status(500).json({ error: "Could not save the job" });
  }
});

router.delete("/jobs/:id", async (req, res) => {
  try {
    const who = await actor(req);
    if (!who?.manageRates) return res.status(403).json({ error: "You do not have access to hourly rates." });
    const jobId = parseInt(req.params.id, 10);
    if (!Number.isFinite(jobId)) return res.status(400).json({ error: "Pick a job" });
    const ok = await deactivateJob(who.schoolId, jobId);
    if (!ok) return res.status(404).json({ error: "Job not found" });
    res.json({ saved: true });
  } catch (error) {
    console.error("[payroll-day] deactivate job", error);
    res.status(500).json({ error: "Could not remove the job" });
  }
});

const addSchema = z.object({
  personName: z.string().min(1).max(80),
  jobLabel: z.string().min(1).max(80),
  hourlyRate: z.number().positive().max(500),
  usualHours: z.number().min(0).max(80),
});

router.post("/jobs", async (req, res) => {
  try {
    const who = await actor(req);
    if (!who?.manageRates) return res.status(403).json({ error: "You do not have access to hourly rates." });
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Fill in the person, the job, the rate, and the usual hours." });
    const id = await addJob({
      schoolId: who.schoolId,
      personName: parsed.data.personName.trim(),
      jobLabel: parsed.data.jobLabel.trim(),
      rateCents: Math.round(parsed.data.hourlyRate * 100),
      weeklyMinutes: hoursToMinutes(parsed.data.usualHours),
    });
    res.json({ id });
  } catch (error) {
    console.error("[payroll-day] add job", error);
    res.status(500).json({ error: "Could not add the job" });
  }
});

router.get("/fillers", async (req, res) => {
  try {
    const who = await actor(req);
    if (!who?.manageRates) return res.status(403).json({ error: "You do not have access to hourly rates." });
    res.json({ people: await listChecklistFillers(who.schoolId) });
  } catch (error) {
    console.error("[payroll-day] fillers", error);
    res.status(500).json({ error: "Could not load who can fill hours" });
  }
});

router.get("/people", async (req, res) => {
  try {
    const who = await actor(req);
    if (!who?.manageRates) return res.status(403).json({ error: "You do not have access to hourly rates." });
    const q = typeof req.query.q === "string" ? req.query.q : "";
    res.json({ people: await searchSchoolPeople(who.schoolId, q) });
  } catch (error) {
    console.error("[payroll-day] people", error);
    res.status(500).json({ error: "Could not search people" });
  }
});

router.post("/fillers", async (req, res) => {
  try {
    const who = await actor(req);
    if (!who?.manageRates) return res.status(403).json({ error: "You do not have access to hourly rates." });
    const userId = Number(req.body?.userId);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: "Pick a person" });
    const granted = await grantChecklistAccess(who.schoolId, userId);
    if (!granted) return res.status(404).json({ error: "That person is not at this school" });
    res.json({ saved: true });
  } catch (error) {
    console.error("[payroll-day] grant filler", error);
    res.status(500).json({ error: "Could not grant access" });
  }
});

router.delete("/fillers/:userId", async (req, res) => {
  try {
    const who = await actor(req);
    if (!who?.manageRates) return res.status(403).json({ error: "You do not have access to hourly rates." });
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: "Pick a person" });
    await revokeChecklistAccess(who.schoolId, userId);
    res.json({ saved: true });
  } catch (error) {
    console.error("[payroll-day] revoke filler", error);
    res.status(500).json({ error: "Could not remove access" });
  }
});

export default router;
