import { Router } from 'express';
import { storage } from '../storage';
import { supabaseAuth } from '../middleware/supabase-auth';
import { z } from 'zod';

const router = Router();

const validRoles: readonly string[] = [
  "student",
  "parent",
  "learner",
  "educator",
  "mentor",
  "teacher",
  "schoolAdmin",
  "director",
  "admin",
  "superAdmin",
];

const searchQuerySchema = z.object({
  query: z.string().optional().default(''),
  role: z.string().optional(),
  schoolId: z.union([z.string(), z.number()]).optional(),
  limit: z.union([z.string(), z.number()]).optional().default(20),
  offset: z.union([z.string(), z.number()]).optional().default(0),
});

router.get('/search', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const currentUser = await storage.getUserByEmail(userEmail);
    if (!currentUser) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    if (!['schoolAdmin', 'admin', 'superAdmin', 'director'].includes(String(currentUser.role))) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions - admin access required' });
    }

    const params = searchQuerySchema.parse(req.query);
    const limit = Math.min(parseInt(String(params.limit)), 100);
    const offset = parseInt(String(params.offset));

    let effectiveSchoolId: number | null = null;

    if (currentUser.role === 'superAdmin' || currentUser.role === 'admin') {
      const requestedSchoolId = params.schoolId ? parseInt(String(params.schoolId)) : null;
      effectiveSchoolId = requestedSchoolId;
    } else if (String(currentUser.role) === 'schoolAdmin' || String(currentUser.role) === 'director') {
      if (!currentUser.schoolId) {
        return res.status(403).json({ success: false, error: 'A school must be assigned to search users for this role.' });
      }
      effectiveSchoolId = currentUser.schoolId;
    }

    const roleFilter = params.role && validRoles.includes(params.role) ? params.role : undefined;

    const { users: matchedUsers, total } = await storage.searchUsers({
      schoolId: effectiveSchoolId,
      query: params.query,
      role: roleFilter,
      limit,
      offset,
    });

    const sanitizedUsers = matchedUsers.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      schoolId: user.schoolId,
      phone: user.phone,
      avatar: user.avatar,
    }));

    res.json({
      success: true,
      users: sanitizedUsers,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error: any) {
    console.error('Error searching users:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid query parameters', details: error.errors });
    }
    res.status(500).json({ success: false, error: 'Failed to search users' });
  }
});

router.get('/roles', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const currentUser = await storage.getUserByEmail(userEmail);
    if (!currentUser) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    if (!['schoolAdmin', 'admin', 'superAdmin', 'director'].includes(String(currentUser.role))) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    const roles = [
      { value: 'parent', label: 'Parent' },
      { value: 'educator', label: 'Educator' },
      { value: 'schoolAdmin', label: 'School Admin' },
    ];

    if (currentUser.role === 'superAdmin' || currentUser.role === 'admin') {
      roles.push({ value: 'admin', label: 'Admin' });
      roles.push({ value: 'superAdmin', label: 'Super Admin' });
    }

    res.json({ success: true, roles });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch roles' });
  }
});

export default router;
