import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

// Enhanced authentication interface for location-aware requests
interface LocationAuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    supabaseId: string;
    email: string;
    role: string;
    isActive: boolean;
    payload: {
      email: string;
      role: string;
    };
  };
  locationAccess?: {
    accessibleLocationIds: number[];
    permissions: {
      canViewReports: boolean;
      canManageStaff: boolean;
      canManageClasses: boolean;
      canManageStudents: boolean;
      canSendNotifications: boolean;
    };
    isMultiLocationAdmin: boolean;
  };
}

const DATA_DIR = path.join(process.cwd(), 'data');
const USER_LOCATIONS_FILE = path.join(DATA_DIR, 'user-locations.json');
const LOCATIONS_FILE = path.join(DATA_DIR, 'locations.json');

interface UserLocationData {
  id: number;
  userId: number;
  locationId: number;
  accessLevel: "view" | "manage" | "admin";
  canViewReports: boolean;
  canManageStaff: boolean;
  canManageClasses: boolean;
  canManageStudents: boolean;
  canSendNotifications: boolean;
  isActive: boolean;
  assignedAt: string;
  createdAt: string;
  updatedAt: string;
}

function loadUserLocations(): UserLocationData[] {
  if (!fs.existsSync(USER_LOCATIONS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(USER_LOCATIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading user locations:', error);
    return [];
  }
}

function loadLocations(): any[] {
  if (!fs.existsSync(LOCATIONS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(LOCATIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading locations:', error);
    return [];
  }
}

/**
 * Middleware to check location access for users
 * Adds location permissions to request object
 */
export const requireLocationAccess = (minAccessLevel: 'view' | 'manage' | 'admin' = 'view') => {
  return async (req: LocationAuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Skip location checks for super admins/platform admins
      if (req.auth?.role === 'platform_admin') {
        req.locationAccess = {
          accessibleLocationIds: [], // All locations accessible
          permissions: {
            canViewReports: true,
            canManageStaff: true,
            canManageClasses: true,
            canManageStudents: true,
            canSendNotifications: true,
          },
          isMultiLocationAdmin: true,
        };
        return next();
      }

      if (!req.auth?.userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const userId = parseInt(req.auth.userId);
      const userLocations = loadUserLocations();
      const locations = loadLocations();

      // Get user's location access
      const userLocationAccess = userLocations.filter(ul => 
        ul.userId === userId && ul.isActive
      );

      if (userLocationAccess.length === 0) {
        return res.status(403).json({ 
          message: 'No location access assigned to user',
          code: 'NO_LOCATION_ACCESS'
        });
      }

      // Check if user has required access level
      const hasRequiredAccess = userLocationAccess.some(access => {
        const levels = ['view', 'manage', 'admin'];
        const userLevel = levels.indexOf(access.accessLevel);
        const requiredLevel = levels.indexOf(minAccessLevel);
        return userLevel >= requiredLevel;
      });

      if (!hasRequiredAccess) {
        return res.status(403).json({ 
          message: `Insufficient access level. Required: ${minAccessLevel}`,
          code: 'INSUFFICIENT_ACCESS_LEVEL'
        });
      }

      // Calculate aggregated permissions
      const aggregatedPermissions = userLocationAccess.reduce((acc, access) => ({
        canViewReports: acc.canViewReports || access.canViewReports,
        canManageStaff: acc.canManageStaff || access.canManageStaff,
        canManageClasses: acc.canManageClasses || access.canManageClasses,
        canManageStudents: acc.canManageStudents || access.canManageStudents,
        canSendNotifications: acc.canSendNotifications || access.canSendNotifications,
      }), {
        canViewReports: false,
        canManageStaff: false,
        canManageClasses: false,
        canManageStudents: false,
        canSendNotifications: false,
      });

      req.locationAccess = {
        accessibleLocationIds: userLocationAccess.map(access => access.locationId),
        permissions: aggregatedPermissions,
        isMultiLocationAdmin: userLocationAccess.some(access => access.accessLevel === 'admin'),
      };

      next();
    } catch (error) {
      console.error('Location access middleware error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
};

/**
 * Middleware to require specific permission
 */
export const requirePermission = (permission: keyof LocationAuthenticatedRequest['locationAccess']['permissions']) => {
  return (req: LocationAuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.locationAccess) {
      return res.status(500).json({ message: 'Location access not initialized' });
    }

    // Platform admins have all permissions
    if (req.auth?.role === 'platform_admin') {
      return next();
    }

    if (!req.locationAccess.permissions[permission]) {
      return res.status(403).json({ 
        message: `Missing required permission: ${permission}`,
        code: 'MISSING_PERMISSION'
      });
    }

    next();
  };
};

/**
 * Middleware to filter data by accessible locations
 */
export const filterByLocation = (locationIdField: string = 'locationId') => {
  return (req: LocationAuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.locationAccess) {
      return res.status(500).json({ message: 'Location access not initialized' });
    }

    // Platform admins can access all locations
    if (req.auth?.role === 'platform_admin') {
      return next();
    }

    // Add location filter to query parameters
    req.query.locationFilter = req.locationAccess.accessibleLocationIds.join(',');
    req.query.locationIdField = locationIdField;

    next();
  };
};

/**
 * Utility function to check if user can access specific location
 */
export const canAccessLocation = (req: LocationAuthenticatedRequest, locationId: number): boolean => {
  if (req.auth?.role === 'platform_admin') {
    return true;
  }

  if (!req.locationAccess) {
    return false;
  }

  return req.locationAccess.accessibleLocationIds.includes(locationId);
};

/**
 * Utility function to get accessible location IDs for queries
 */
export const getAccessibleLocationIds = (req: LocationAuthenticatedRequest): number[] | null => {
  if (req.auth?.role === 'platform_admin') {
    return null; // null means all locations accessible
  }

  return req.locationAccess?.accessibleLocationIds || [];
};

export type { LocationAuthenticatedRequest };