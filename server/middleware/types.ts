import { Request } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: {
      payload?: {
        [key: string]: any;
        sub: string;
        email: string;
      };
    };
    user?: {
      id: number | string;
      email: string;
      sub: string;
      role?: string;
      schoolId?: number;
      activeRoleId?: number;
    };
    dbUser?: {
      id: number;
      email: string;
      role?: string;
      schoolId?: number;
      activeRoleId?: number;
    };
    schoolId?: string | number;
  }
}
