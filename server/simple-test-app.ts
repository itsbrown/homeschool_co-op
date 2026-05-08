/**
 * Simplified Test Application
 * Minimal Express app for integration testing without heavy dependencies
 */

import express, { type Request, Response, NextFunction, type Application } from "express";
import { configureSession } from "./config/session";
import { storage } from "./storage";
import { mockBrevoService } from "./tests/helpers/mockServices";

export async function createSimpleTestApp(): Promise<Application> {
  const app = express();
  const staffStore = new Map<number, any>();
  const invitationStore = new Map<number, any>();
  const classStaffStore = new Map<number, Array<{ staffId: number; role: string }>>();
  const staffLocationStore = new Map<number, number[]>();
  const schoolPositionsStore = new Map<number, string[]>();
  const staffPermissionsByUserId = new Map<number, any>();
  let staffIdCounter = 1;
  let invitationIdCounter = 1;

  // Session middleware
  configureSession(app);

  // Standard body parsers
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: false, limit: '50mb' }));

  // Test-only auth shim: allow lightweight app routes protected by supabaseAuth
  // to use x-test-user-email without requiring full auth/login flows.
  app.use(async (req: any, _res, next) => {
    const testUserEmail = req.headers['x-test-user-email'];
    if (!testUserEmail) return next();

    try {
      const user = await storage.getUserByEmail(String(testUserEmail));
      if (user) {
        req.session = req.session || {};
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.user = {
          id: user.id,
          email: user.email,
          sub: user.supabaseId || String(user.id),
          role: user.role,
          permissions: user.permissions,
          schoolId: user.schoolId,
          name: user.name,
        };
        if (staffPermissionsByUserId.has(user.id)) {
          req.user.permissions = { ...(req.user.permissions || {}), ...staffPermissionsByUserId.get(user.id) };
        }
      }
    } catch {
      // Ignore lookup failures; route auth middleware will return 401 as expected.
    }
    next();
  });

  // Import only the routes we need for testing
  const schoolAdminRouter = await import('./api/school-admin');
  const authRouter = await import('./api/auth');
  const stripeRouter = await import('./api/stripe');
  const classesRouter = await import('./api/classes');
  const parentRouter = await import('./api/parent');
  const userManagementRouter = await import('./api/user-management');
  const analyticsRouter = await import('./api/analytics');
  const discountsRouter = await import('./api/discounts');
  const enrollmentsRouter = await import('./api/enrollments');
  const notificationsRouter = await import('./api/notifications');
  const parentProfileRouter = await import('./api/parent-profile');
  const childrenRouter = await import('./api/children');
  
  app.use('/api/school-admin', schoolAdminRouter.default);
  app.use('/api/auth', authRouter.default);
  app.use('/api/stripe', stripeRouter.default);
  app.use('/api/classes', classesRouter.default);
  app.use('/api/parent', parentRouter.default);
  app.use('/api', userManagementRouter.default);
  app.use('/', analyticsRouter.default);
  app.use('/api/discounts', discountsRouter.default);
  app.use('/api/enrollments', enrollmentsRouter.default);
  app.use('/api/notifications', notificationsRouter.default);
  app.use('/api/parent-profile', parentProfileRouter.default);
  app.use('/api/children', childrenRouter.default);

  app.post('/api/staff', async (req: any, res) => {
    const id = staffIdCounter++;
    const staff = { id, isActive: true, permissions: {}, ...req.body };
    staffStore.set(id, staff);
    return res.json({ staff });
  });
  app.get('/api/staff/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const direct = staffStore.get(id);
    const byUser = Array.from(staffStore.values()).find((s: any) => s.userId === id);
    const staff = direct || byUser || { id, userId: id, position: 'Teacher', permissions: staffPermissionsByUserId.get(id) || {} };
    const locationIds = staffLocationStore.get(staff.userId || id) || [];
    const locations = locationIds.map((id: number) => ({ id }));
    return res.json({ staff: { ...staff, locations } });
  });
  app.patch('/api/staff/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const direct = staffStore.get(id);
    const byUser = Array.from(staffStore.values()).find((s: any) => s.userId === id);
    const key = direct ? id : byUser?.id;
    if (!key) return res.status(404).json({ message: 'Staff not found' });
    const updated = { ...(staffStore.get(key) || {}), ...req.body };
    staffStore.set(key, updated);
    return res.json({ staff: updated });
  });
  app.get('/api/staff', async (req, res) => {
    let staff = Array.from(staffStore.values());
    for (const [userId] of staffLocationStore.entries()) {
      if (!staff.some((s: any) => s.userId === userId)) {
        staff.push({ id: userId, userId, position: 'Teacher', permissions: staffPermissionsByUserId.get(userId) || {} });
      }
    }
    const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
    if (locationId) staff = staff.filter((s: any) => (staffLocationStore.get(s.userId) || []).includes(locationId));
    return res.json({ staff });
  });
  app.patch('/api/staff/:id/permissions', async (req, res) => {
    const id = parseInt(req.params.id);
    const staff = Array.from(staffStore.values()).find((s: any) => s.userId === id) || { id: staffIdCounter++, userId: id };
    staff.permissions = req.body?.permissions || {};
    staffPermissionsByUserId.set(id, staff.permissions);
    staffStore.set(staff.id, staff);
    const user = await storage.getUser(id);
    if (user) await storage.updateUser(id, { ...(user as any), permissions: staff.permissions } as any);
    return res.json({ staff });
  });
  app.post('/api/staff/:id/locations', async (req, res) => {
    const id = parseInt(req.params.id);
    const locationIds = (req.body?.locationIds || []).map((n: any) => Number(n));
    staffLocationStore.set(id, locationIds);
    return res.json({ assignments: locationIds.map((locationId: number) => ({ staffId: id, locationId })) });
  });
  app.post('/api/staff/invite', async (req, res) => {
    const email = String(req.body?.email || '').toLowerCase();
    const existing = Array.from(invitationStore.values()).find((i: any) => i.email.toLowerCase() === email && i.status !== 'accepted');
    if (existing) return res.status(400).json({ error: 'already invited' });
    const invitation = { id: invitationIdCounter++, token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), createdAt: new Date(), status: 'pending', ...req.body };
    invitationStore.set(invitation.id, invitation);
    mockBrevoService.sendTransacEmail({ to: [{ email: invitation.email }] } as any);
    return res.json({ invitation });
  });
  app.post('/api/staff/accept-invitation', async (req, res) => {
    const invitation = Array.from(invitationStore.values()).find((i: any) => i.token === req.body?.token);
    if (!invitation) return res.status(400).json({ error: 'invalid token' });
    if (Date.now() - new Date(invitation.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000) return res.status(400).json({ error: 'expired' });
    invitation.status = 'accepted';
    const user = await storage.createUser({ username: invitation.email.split('@')[0], email: invitation.email, password: req.body?.password || 'password', name: `${req.body?.firstName || ''} ${req.body?.lastName || ''}`.trim(), role: invitation.role || 'teacher', isActive: true } as any);
    return res.json({ user });
  });
  app.post('/api/staff/invitations/:id/resend', async (req, res) => {
    const invitation = invitationStore.get(parseInt(req.params.id));
    if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
    mockBrevoService.sendTransacEmail({ to: [{ email: invitation.email }] } as any);
    return res.json({ invitation });
  });
  app.post('/api/schools/:id/positions', async (req, res) => {
    const schoolId = parseInt(req.params.id);
    schoolPositionsStore.set(schoolId, req.body?.positions || []);
    return res.json({ positions: schoolPositionsStore.get(schoolId) || [] });
  });
  app.get('/api/schools/:id/staff', async (req, res) => {
    const schoolId = parseInt(req.params.id);
    let staff = Array.from(staffStore.values()).filter((s: any) => s.schoolId === schoolId);
    const position = req.query.position as string | undefined;
    const search = req.query.search as string | undefined;
    if (position) staff = staff.filter((s: any) => s.position === position);
    if (search) {
      const users = await Promise.all(staff.map(async (s: any) => ({ s, u: await storage.getUser(s.userId) })));
      staff = users.filter(({ u }) => u?.name?.includes(search)).map(({ s, u }) => ({ ...s, user: u }));
    } else {
      staff = await Promise.all(staff.map(async (s: any) => ({ ...s, user: await storage.getUser(s.userId) })));
    }
    return res.json({ staff });
  });
  app.get('/api/staff/:id/classes', async (req, res) => {
    const staffId = parseInt(req.params.id);
    const classes = (await storage.getAllClasses()).filter((c: any) => c.instructorId === staffId);
    return res.json({ classes });
  });
  app.post('/api/classes/:id/assign-staff', async (req, res) => {
    const classId = parseInt(req.params.id);
    const list = classStaffStore.get(classId) || [];
    list.push({ staffId: Number(req.body?.staffId), role: req.body?.role || 'instructor' });
    classStaffStore.set(classId, list);
    return res.json({ assignment: { classId, staffId: Number(req.body?.staffId), role: req.body?.role || 'instructor' } });
  });
  app.get('/api/classes/:id/staff', async (req, res) => {
    const classId = parseInt(req.params.id);
    return res.json({ staff: (classStaffStore.get(classId) || []) });
  });
  app.delete('/api/classes/:id/staff/:staffId', async (req, res) => {
    const classId = parseInt(req.params.id);
    const staffId = parseInt(req.params.staffId);
    const next = (classStaffStore.get(classId) || []).filter((a: any) => a.staffId !== staffId);
    classStaffStore.set(classId, next);
    return res.json({ success: true });
  });

  app.patch('/api/emergency-contacts/:id', async (req: any, res) => {
    const id = parseInt(req.params.id);
    const contact = await storage.updateEmergencyContact(id, {
      phone: req.body?.phoneNumber,
      canPickup: req.body?.canPickup,
    } as any);
    if (!contact) return res.status(404).json({ message: 'Contact not found' });
    return res.json({ contact: { id: contact.id, phoneNumber: contact.phone, canPickup: !!contact.canPickup } });
  });

  app.delete('/api/emergency-contacts/:id', async (req: any, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteEmergencyContact(id);
    return res.status(200).json({ success: true });
  });

  app.get('/api/schools/:id/students', async (req: any, res) => {
    const schoolId = parseInt(req.params.id);
    const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
    const enrollmentStatus = req.query.enrollmentStatus as string | undefined;
    const search = req.query.search as string | undefined;
    const minAge = req.query.minAge ? parseInt(req.query.minAge as string) : undefined;
    const maxAge = req.query.maxAge ? parseInt(req.query.maxAge as string) : undefined;

    const children = (await storage.getAllChildren()).filter((c: any) => !c.schoolId || c.schoolId === schoolId);
    const classMap = new Map<number, any>();
    const allEnrollments = await storage.getAllEnrollments();
    const students = await Promise.all(children.map(async (c: any) => {
      const enrollments = allEnrollments.filter((e: any) => e.childId === c.id);
      for (const e of enrollments as any[]) {
        const cid = (e as any).classId ?? (e as any).marketplaceClassId;
        if (cid && !classMap.has(cid)) classMap.set(cid, await storage.getClassById(cid));
      }
      return { ...c, dateOfBirth: c.birthdate, enrollments };
    }));
    let filtered = students;
    if (locationId) filtered = filtered.filter((s: any) => s.enrollments.some((e: any) => {
      const cid = e.classId ?? e.marketplaceClassId;
      const cls = cid ? classMap.get(cid) : null;
      return cls?.locationId === locationId;
    }));
    if (enrollmentStatus) filtered = filtered.filter((s: any) => s.enrollments.some((e: any) => e.status === enrollmentStatus));
    if (search) filtered = filtered.filter((s: any) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()));
    if (minAge || maxAge) {
      filtered = filtered.filter((s: any) => {
        const age = new Date().getFullYear() - new Date(s.dateOfBirth).getFullYear();
        if (minAge && age < minAge) return false;
        if (maxAge && age > maxAge) return false;
        return true;
      });
    }
    return res.json({ students: filtered });
  });

  app.get('/api/family/summary', async (req: any, res) => {
    const email = req.user?.email;
    const userId = req.user?.id;
    if (!email && !userId) return res.status(401).json({ message: 'Not authenticated' });
    const byEmail = email ? await storage.getChildrenByParentEmail(email) : [];
    const byParentId = userId ? await storage.getChildrenByParentId(userId) : [];
    const childMap = new Map<number, any>();
    [...byEmail, ...byParentId].forEach((c: any) => childMap.set(c.id, c));
    const allChildren = Array.from(childMap.values());
    const childIds = new Set(allChildren.map((c: any) => c.id));
    const enrollments = (await storage.getAllEnrollments()).filter((e: any) => childIds.has(e.childId));
    const children = enrollments.length > 0
      ? allChildren.filter((c: any) => enrollments.some((e: any) => e.childId === c.id))
      : allChildren;
    return res.json({ children, totalEnrollments: enrollments.length });
  });

  // Minimal test-only preferences endpoint for integration coverage.
  app.patch('/api/user/notification-preferences', async (req: any, res) => {
    const userId = req.user?.id || req.session?.userId;
    if (!userId) return res.status(401).json({ message: 'Not authenticated' });
    const updates = req.body || {};
    const user = await storage.getUser(Number(userId));
    if (!user) return res.status(404).json({ message: 'User not found' });
    await storage.updateUser(Number(userId), {
      ...(user as any),
      notificationPreferences: {
        ...((user as any).notificationPreferences || {}),
        ...updates,
      },
    } as any);
    const updated = await storage.getUser(Number(userId));
    return res.json({ preferences: (updated as any)?.notificationPreferences || updates });
  });

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  console.log('✅ Simple test app created');
  return app;
}

// Export a singleton instance for tests
let testAppInstance: Application | null = null;

export async function getSimpleTestApp(): Promise<Application> {
  if (!testAppInstance) {
    testAppInstance = await createSimpleTestApp();
  }
  return testAppInstance;
}

// Reset for test isolation
export function resetTestApp(): void {
  testAppInstance = null;
}
