import session from 'express-session';
import { Express } from 'express';

// Test user accounts configuration
export const testUsers = {
  admin: {
    id: 1,
    name: 'Admin User',
    username: 'admin',
    email: 'admin@example.com',
    role: 'admin',
    avatar: null,
    subscription: 'premium',
    createdAt: new Date()
  },
  educator: {
    id: 2,
    name: 'Test Educator',
    username: 'educator',
    email: 'educator@example.com',
    role: 'educator',
    avatar: null,
    subscription: 'educator',
    createdAt: new Date()
  },
  parent: {
    id: 3,
    name: 'Test Parent',
    username: 'parent',
    email: 'parent@example.com',
    role: 'parent',
    avatar: null,
    subscription: 'family',
    createdAt: new Date()
  },
  learner: {
    id: 4,
    name: 'Test Learner',
    username: 'learner',
    email: 'learner@example.com',
    role: 'learner',
    avatar: null,
    subscription: 'free',
    createdAt: new Date()
  },
  schoolAdmin: {
    id: 5,
    name: 'School Administrator',
    username: 'schooladmin',
    email: 'school@example.com',
    role: 'schoolAdmin',
    avatar: null,
    subscription: 'premium',
    createdAt: new Date()
  }
};

export function configureSession(app: Express) {
  // Configure session middleware
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'test-learnsphere-secret-key',
      resave: false,
      saveUninitialized: true,
      cookie: { 
        secure: false, // Allow non-HTTPS for development
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true
      }
    })
  );
  
  console.log('Session middleware configured');
}

// Session data type definition
declare module 'express-session' {
  interface SessionData {
    userId: number;
    userRole: string;
    activeRole?: string;
  }
}