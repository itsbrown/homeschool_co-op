
import { Router } from "express";
import { jwtCheck, requireRole } from "../middleware/auth0-auth";
import { UserSyncService } from "../services/userSyncService";

const router = Router();

// Get all users (admin only)
router.get('/users', jwtCheck, requireRole(['admin', 'superAdmin']), async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const users = await UserSyncService.getUsers(offset, limit);

    res.json({
      success: true,
      users,
      pagination: {
        page,
        limit,
        hasMore: users.length === limit
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching users' 
    });
  }
});

// Get specific user by ID (admin only)
router.get('/users/:id', jwtCheck, requireRole(['admin', 'superAdmin']), async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await UserSyncService.getUserByAuth0Id(userId);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching user' 
    });
  }
});

// Update user role (admin only)
router.put('/users/:id/role', jwtCheck, requireRole(['admin', 'superAdmin']), async (req, res) => {
  try {
    const userId = req.params.id;
    const { role, schoolId } = req.body;

    if (!role) {
      return res.status(400).json({ 
        success: false, 
        message: 'Role is required' 
      });
    }

    const validRoles = ['superAdmin', 'admin', 'schoolAdmin', 'educator', 'teacher', 'parent', 'student', 'learner'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role' 
      });
    }

    const updatedUser = await UserSyncService.updateUserRole(userId, role, schoolId);

    res.json({
      success: true,
      message: 'User role updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating user role' 
    });
  }
});

// Deactivate user (admin only)
router.put('/users/:id/deactivate', jwtCheck, requireRole(['admin', 'superAdmin']), async (req, res) => {
  try {
    const userId = req.params.id;
    const deactivatedUser = await UserSyncService.deactivateUser(userId);

    res.json({
      success: true,
      message: 'User deactivated successfully',
      user: deactivatedUser
    });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deactivating user' 
    });
  }
});

// Get current user profile (authenticated users)
router.get('/profile', jwtCheck, async (req, res) => {
  try {
    const auth0Id = req.user?.sub || req.user?.id;
    const dbUser = await UserSyncService.getUserByAuth0Id(auth0Id);

    if (!dbUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'User profile not found' 
      });
    }

    // Remove sensitive information
    const { password, ...userProfile } = dbUser;

    res.json({
      success: true,
      profile: userProfile
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching user profile' 
    });
  }
});

// Update current user profile (authenticated users)
router.put('/profile', jwtCheck, async (req, res) => {
  try {
    const auth0Id = req.user?.sub || req.user?.id;
    const { name, username, phone } = req.body;

    // Only allow updating specific fields
    const updateData: any = {};
    if (name) updateData.name = name;
    if (username) updateData.username = username;
    if (phone) updateData.phone = phone;
    updateData.updatedAt = new Date();

    const updatedUser = await db
      .update(users)
      .set(updateData)
      .where(eq(users.auth0Id, auth0Id))
      .returning();

    if (!updatedUser.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const { password, ...userProfile } = updatedUser[0];

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: userProfile
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating user profile' 
    });
  }
});

export default router;
