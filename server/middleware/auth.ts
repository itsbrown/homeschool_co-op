import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

/**
 * Middleware to check if a user is authenticated
 */
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

/**
 * Middleware to check if a user has one of the specified roles
 * @param roles Array of permitted roles
 */
export const hasRole = (roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Role is already in session
    if (req.session.userRole && roles.includes(req.session.userRole)) {
      return next();
    }

    // Verify from database as a fallback
    try {
      const user = await storage.getUser(req.session.userId);
      if (user && user.role && roles.includes(user.role)) {
        // Update session with role for faster future checks
        req.session.userRole = user.role;
        return next();
      }
    } catch (error) {
      console.error("Error verifying user role:", error);
    }

    return res.status(403).json({ message: "Forbidden: Insufficient permissions" });
  };
};

/**
 * Role-specific middleware functions
 */
export const isAdmin = hasRole(["admin"]);
export const isEducator = hasRole(["admin", "educator"]);
export const isParent = hasRole(["admin", "parent"]);
export const isLearner = hasRole(["admin", "educator", "parent", "learner"]);

/**
 * Data ownership middleware - checks if the user owns the resource
 * @param getResourceOwnerIdFn Function that returns the owner ID of the resource
 */
export const isResourceOwner = (getResourceOwnerIdFn: (req: Request) => Promise<number>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // Check if user is admin (admins can access any resource)
      if (req.session.userRole === "admin") {
        return next();
      }

      // Get the resource owner ID
      const ownerId = await getResourceOwnerIdFn(req);
      
      // Check if the user is the owner
      if (ownerId === req.session.userId) {
        return next();
      }

      // Check for parent-child relationship for child resources
      if (req.session.userRole === "parent") {
        // If the resource is related to a child, check if the user is the parent
        const children = await storage.getChildrenByParentId(req.session.userId);
        const childIds = children.map(child => child.id);
        
        // This would need more specific implementation depending on resource type
        // For example, if ownerId represents a child ID and it's in the user's children
        if (childIds.includes(ownerId)) {
          return next();
        }
      }

      return res.status(403).json({ message: "Forbidden: You don't have permission to access this resource" });
    } catch (error) {
      console.error("Error checking resource ownership:", error);
      return res.status(500).json({ message: "Error checking resource ownership" });
    }
  };
};