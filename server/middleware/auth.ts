import { Request, Response, NextFunction } from "express";

/**
 * Middleware to check if the user is authenticated
 */
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  // Check if session exists and has userId
  if (req.session && req.session.userId) {
    return next();
  }
  
  // If not authenticated, return 401 Unauthorized
  return res.status(401).json({ message: "Unauthorized" });
}

/**
 * Middleware to check if the user is an admin
 */
export function isAdmin(req: Request, res: Response, next: NextFunction) {
  // Check if session exists and has userRole = admin
  if (req.session && req.session.userId && req.session.userRole === "admin") {
    return next();
  }
  
  // If not admin, return 403 Forbidden
  return res.status(403).json({ message: "Forbidden: Admin access required" });
}

/**
 * Middleware to check if the user is an instructor
 */
export function isInstructor(req: Request, res: Response, next: NextFunction) {
  // Check if session exists and has userRole = instructor or admin
  if (req.session && req.session.userId && 
      (req.session.userRole === "instructor" || req.session.userRole === "admin")) {
    return next();
  }
  
  // If not instructor or admin, return 403 Forbidden
  return res.status(403).json({ message: "Forbidden: Instructor access required" });
}

/**
 * Custom middleware type extending Express Request
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
  };
}

/**
 * Enhanced authentication middleware that loads user info
 */
export function loadUser(req: Request, res: Response, next: NextFunction) {
  // Check if session exists and has userId
  if (req.session && req.session.userId) {
    // Add user object to request
    (req as AuthenticatedRequest).user = {
      id: req.session.userId,
      role: req.session.userRole || "user"
    };
  }
  
  return next();
}