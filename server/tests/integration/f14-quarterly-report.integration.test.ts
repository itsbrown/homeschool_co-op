import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { nanoid } from 'nanoid';
import progressRouter from '../../api/progress';
import assessmentsRouter from '../../api/assessments';
import { storage } from '../../storage';
import { testDb } from '../helpers/testDatabase';
import { buildStaffTestApp } from '../helpers/staffTestApp';
import {
  buildFullSkillChecksForBand,
  currentSchoolYearLabel,
} from '../helpers/quarterlyReportTestHelpers';
import { resolveProgressReportBand } from '../../lib/resolve-progress-report-band';
import { ensureQuarterlyReportTables } from '../helpers/ensureQuarterlyReportTables';

const mockSendProgressReportEmail = jest.fn<() => Promise<boolean>>();

jest.mock('../../lib/email-service', () => ({
  sendProgressReportEmail: (...args: unknown[]) => mockSendProgressReportEmail(...args),
}));

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb('Integration: F-14 NY | Progress report', () => {
  let progressApp: express.Application;
  let assessmentsApp: express.Application;
  let schoolId: number;
  let adminEmail: string;
  let educatorEmail: string;
  let parentEmail: string;
  let childId: number;
  const schoolYear = currentSchoolYearLabel();
  const quarter = 'fall';

  beforeAll(async () => {
    await testDb.cleanup();
    await ensureQuarterlyReportTables();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    mockSendProgressReportEmail.mockReset();
    mockSendProgressReportEmail.mockResolvedValue(true);
    jest.restoreAllMocks();

    progressApp = buildStaffTestApp([{ path: '/api/progress', router: progressRouter }]);
    assessmentsApp = buildStaffTestApp([{ path: '/api/assessments', router: assessmentsRouter }]);

    await testDb.cleanup();
    const uid = nanoid(8).toLowerCase();

    adminEmail = `f14_admin_${uid}@test.com`;
    const admin = await testDb.createTestUser({
      username: `f14_admin_${uid}`,
      email: adminEmail,
      role: 'schoolAdmin',
      name: 'F14 Admin',
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: `F14 School ${uid}`,
      registrationCode: `F14${uid.toUpperCase().slice(0, 4)}`,
    });
    schoolId = school.id;
    await storage.updateUser(admin.id, { ...(admin as any), schoolId } as any);

    educatorEmail = `f14_ed_${uid}@test.com`;
    const educator = await testDb.createTestUser({
      username: `f14_ed_${uid}`,
      email: educatorEmail,
      role: 'educator',
      name: 'F14 Educator',
    });
    await storage.updateUser(educator.id, { ...(educator as any), schoolId } as any);

    parentEmail = `f14_parent_${uid}@test.com`;
    const parent = await testDb.createTestUser({
      username: `f14_parent_${uid}`,
      email: parentEmail,
      role: 'parent',
      name: 'F14 Parent',
      schoolId,
    });

    const child = await testDb.createTestChild(parent.id, {
      firstName: 'Mia',
      lastName: 'Tester',
      gradeLevel: 'Kindergarten',
      schoolId,
      parentEmail,
    });
    childId = child.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function saveCompleteRubric() {
    const band = resolveProgressReportBand('Kindergarten');
    const skillChecks = buildFullSkillChecksForBand(band);
    const res = await request(progressApp)
      .put(`/api/progress/quarterly-rubric/${childId}`)
      .set('x-test-user-email', educatorEmail)
      .send({
        schoolYear,
        quarter,
        quarterLabel: `Fall ${schoolYear}`,
        asaCoopHours: 48,
        homeInstructionHours: 180,
        phonogramCount: 14,
        approvedNarrative: 'Covered phonics, counting, and handwriting strokes this quarter.',
        notesObservations: 'Strong participation in co-op sessions.',
        skillChecks,
      });
    if (res.status !== 200) {
      throw new Error(`saveCompleteRubric failed ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }

  it('GET /tracks/catalog returns school progress tracks after subjects load', async () => {
    const subjectsRes = await request(progressApp)
      .get('/api/progress/subjects')
      .set('x-test-user-email', educatorEmail);
    expect(subjectsRes.status).toBe(200);

    const catalogRes = await request(progressApp)
      .get('/api/progress/tracks/catalog')
      .set('x-test-user-email', educatorEmail);
    expect(catalogRes.status).toBe(200);
    expect(Array.isArray(catalogRes.body)).toBe(true);
  });

  it('GET report draft returns ny-ihip-quarterly template and completeness', async () => {
    await saveCompleteRubric();
    const res = await request(progressApp)
      .get(`/api/progress/report/${childId}?schoolYear=${schoolYear}&quarter=${quarter}&draft=true`)
      .set('x-test-user-email', educatorEmail);
    expect(res.status).toBe(200);
    expect(res.body.template).toBe('ny-ihip-quarterly');
    expect(res.body.band).toBe('early');
    expect(res.body.header.studentName).toContain('Mia');
    expect(res.body.completeness.percent).toBeGreaterThanOrEqual(50);
    expect(res.body.isDraft).toBe(true);
  });

  it('POST /generate rejects without approved narrative', async () => {
    const res = await request(progressApp)
      .post(`/api/progress/report/${childId}/generate`)
      .set('x-test-user-email', educatorEmail)
      .send({ schoolYear, quarter });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Approve the quarterly narrative/i);
  });

  it('POST /generate creates snapshot and GET pdf returns application/pdf', async () => {
    await saveCompleteRubric();

    const gen = await request(progressApp)
      .post(`/api/progress/report/${childId}/generate`)
      .set('x-test-user-email', educatorEmail)
      .send({ schoolYear, quarter, includeGuide: true });
    expect(gen.status).toBe(201);
    expect(gen.body.snapshotId).toBeGreaterThan(0);
    expect(gen.body.band).toBe('early');

    const pdf = await request(progressApp)
      .get(`/api/progress/report/${childId}?format=pdf&snapshotId=${gen.body.snapshotId}`)
      .set('x-test-user-email', educatorEmail);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.headers['content-disposition']).toMatch(/NY-Progress-Report/);
  });

  it('GET /snapshots lists finalized reports for parent and blocks draft pdf', async () => {
    await saveCompleteRubric();
    const gen = await request(progressApp)
      .post(`/api/progress/report/${childId}/generate`)
      .set('x-test-user-email', educatorEmail)
      .send({ schoolYear, quarter });
    expect(gen.status).toBe(201);

    const list = await request(progressApp)
      .get(`/api/progress/report/${childId}/snapshots`)
      .set('x-test-user-email', parentEmail);
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].quarter).toBe(quarter);

    const parentPdf = await request(progressApp)
      .get(`/api/progress/report/${childId}?format=pdf&snapshotId=${gen.body.snapshotId}`)
      .set('x-test-user-email', parentEmail);
    expect(parentPdf.status).toBe(200);

    const draftBlocked = await request(progressApp)
      .get(`/api/progress/report/${childId}?format=pdf&schoolYear=${schoolYear}&quarter=${quarter}&draft=true`)
      .set('x-test-user-email', parentEmail);
    expect(draftBlocked.status).toBe(403);
  });

  it('POST /email sends NY | Progress report via email service', async () => {
    await saveCompleteRubric();
    const gen = await request(progressApp)
      .post(`/api/progress/report/${childId}/generate`)
      .set('x-test-user-email', educatorEmail)
      .send({ schoolYear, quarter });
    expect(gen.status).toBe(201);

    const emailRes = await request(progressApp)
      .post(`/api/progress/report/${childId}/email`)
      .set('x-test-user-email', educatorEmail)
      .send({ snapshotId: gen.body.snapshotId });
    expect(emailRes.status).toBe(200);
    expect(emailRes.body.sentTo).toBe(parentEmail);
    expect(mockSendProgressReportEmail).toHaveBeenCalledTimes(1);
    const call = mockSendProgressReportEmail.mock.calls[0][0] as {
      parentEmail: string;
      childName: string;
      quarter: string;
      pdfBuffer: Buffer;
    };
    expect(call.parentEmail).toBe(parentEmail);
    expect(call.childName).toContain('Mia');
    expect(call.pdfBuffer?.length).toBeGreaterThan(100);
  });

  it('POST book rejects invalid progressTrackId and accepts valid track link', async () => {
    const typeRes = await request(assessmentsApp)
      .post('/api/assessments/types')
      .set('x-test-user-email', adminEmail)
      .send({
        name: 'Reading Assess',
        category: 'reading',
        scoreFormat: 'numeric',
        hasCurriculumBooks: true,
      });
    expect(typeRes.status).toBe(201);
    const typeId = typeRes.body.id;

    const badBook = await request(assessmentsApp)
      .post(`/api/assessments/types/${typeId}/books`)
      .set('x-test-user-email', adminEmail)
      .send({ name: 'Bad Book', progressTrackId: 999999 });
    expect(badBook.status).toBe(400);

    const subjectsRes = await request(progressApp)
      .get('/api/progress/subjects')
      .set('x-test-user-email', educatorEmail);
    const reading = subjectsRes.body.find((s: { key: string }) => s.key === 'reading');
    expect(reading).toBeTruthy();

    const trackRes = await request(progressApp)
      .post('/api/progress/tracks')
      .set('x-test-user-email', educatorEmail)
      .send({ subjectId: reading.id, name: 'McCall-Crabbs A', trackKind: 'book_series' });
    expect(trackRes.status).toBe(201);

    const goodBook = await request(assessmentsApp)
      .post(`/api/assessments/types/${typeId}/books`)
      .set('x-test-user-email', adminEmail)
      .send({ name: 'Linked Book', progressTrackId: trackRes.body.id });
    expect(goodBook.status).toBe(201);
    expect(goodBook.body.progressTrackId).toBe(trackRes.body.id);
  });
});
