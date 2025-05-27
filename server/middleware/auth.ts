import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { auth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";

// Initialize Firebase Admin SDK if not already initialized
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS || '{}');
    initializeApp({
      credential: cert(serviceAccount)
    });
  } catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
  }
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    name?: string;
    firebaseUid: string;
  };
}

/**
 * Middleware to check if a user is authenticated via Firebase
 */
export const isAuthenticated = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Verify the Firebase token
    const decodedToken = await auth().verifyIdToken(token);
    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email;

    // Get user from our system
    const users = await storage.getUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) {
      return res.status(401).json({ message: "User not found in system" });
    }

    // Attach user to request
    req.user = {
      id: user.id.toString(),
      email: user.email,
      role: user.role,
      name: user.name || user.email,
      firebaseUid: firebaseUid
    };

    return next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({ message: "Invalid token" });
  }
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