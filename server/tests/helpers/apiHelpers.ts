import request from 'supertest';
import type { Application } from 'express';
import { getSimpleTestApp } from '../../simple-test-app';

export class ApiTestHelper {
  private app: Application | null = null;
  private authToken: string | null = null;
  private cookies: string[] = [];

  async init() {
    if (!this.app) {
      this.app = await getSimpleTestApp();
    }
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  setCookies(cookies: string[]) {
    this.cookies = cookies;
  }

  clearAuth() {
    this.authToken = null;
    this.cookies = [];
  }

  private async ensureApp(): Promise<Application> {
    if (!this.app) {
      await this.init();
    }
    return this.app!;
  }

  async get(url: string, query?: Record<string, any>) {
    const app = await this.ensureApp();
    let req = request(app).get(url);
    
    if (this.authToken) {
      req = req.set('Authorization', `Bearer ${this.authToken}`);
    }
    
    if (this.cookies.length > 0) {
      req = req.set('Cookie', this.cookies);
    }

    if (query) {
      req = req.query(query);
    }

    return req;
  }

  async post(url: string, data?: any) {
    const app = await this.ensureApp();
    let req = request(app).post(url);
    
    if (this.authToken) {
      req = req.set('Authorization', `Bearer ${this.authToken}`);
    }
    
    if (this.cookies.length > 0) {
      req = req.set('Cookie', this.cookies);
    }

    if (data) {
      req = req.send(data);
    }

    return req;
  }

  async put(url: string, data?: any) {
    const app = await this.ensureApp();
    let req = request(app).put(url);
    
    if (this.authToken) {
      req = req.set('Authorization', `Bearer ${this.authToken}`);
    }
    
    if (this.cookies.length > 0) {
      req = req.set('Cookie', this.cookies);
    }

    if (data) {
      req = req.send(data);
    }

    return req;
  }

  async patch(url: string, data?: any) {
    const app = await this.ensureApp();
    let req = request(app).patch(url);
    
    if (this.authToken) {
      req = req.set('Authorization', `Bearer ${this.authToken}`);
    }
    
    if (this.cookies.length > 0) {
      req = req.set('Cookie', this.cookies);
    }

    if (data) {
      req = req.send(data);
    }

    return req;
  }

  async delete(url: string) {
    const app = await this.ensureApp();
    let req = request(app).delete(url);
    
    if (this.authToken) {
      req = req.set('Authorization', `Bearer ${this.authToken}`);
    }
    
    if (this.cookies.length > 0) {
      req = req.set('Cookie', this.cookies);
    }

    return req;
  }

  async uploadFile(url: string, fieldName: string, filePath: string, data?: any) {
    const app = await this.ensureApp();
    let req = request(app)
      .post(url)
      .attach(fieldName, filePath);
    
    if (this.authToken) {
      req = req.set('Authorization', `Bearer ${this.authToken}`);
    }
    
    if (this.cookies.length > 0) {
      req = req.set('Cookie', this.cookies);
    }

    if (data) {
      Object.keys(data).forEach(key => {
        req = req.field(key, data[key]);
      });
    }

    return req;
  }

  async loginAsUser(email: string, password: string = 'password') {
    const response = await this.post('/api/auth/login', { email, password });
    
    // Session-based authentication - save cookies
    if (response.status === 200) {
      if (response.headers['set-cookie']) {
        // Normalize set-cookie header to string array
        const cookies = Array.isArray(response.headers['set-cookie'])
          ? response.headers['set-cookie']
          : [response.headers['set-cookie']];
        this.setCookies(cookies);
      }
      
      // Also handle token-based auth if present
      if (response.body.token) {
        this.setAuthToken(response.body.token);
      }
    }

    return response;
  }

  expectSuccess(response: any, expectedStatus: number = 200) {
    expect(response.status).toBe(expectedStatus);
    return response;
  }

  expectError(response: any, expectedStatus: number = 400) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('error');
    return response;
  }

  expectValidationError(response: any) {
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    return response;
  }

  expectUnauthorized(response: any) {
    expect(response.status).toBe(401);
    return response;
  }

  expectForbidden(response: any) {
    expect(response.status).toBe(403);
    return response;
  }

  expectNotFound(response: any) {
    expect(response.status).toBe(404);
    return response;
  }
}

// Lazy initialization singleton
let apiInstance: ApiTestHelper | null = null;

export function getApi(): ApiTestHelper {
  if (!apiInstance) {
    apiInstance = new ApiTestHelper();
  }
  return apiInstance;
}

// Reset the singleton for test isolation
export function resetApi(): void {
  apiInstance = null;
}

// Export api object with getter for backward compatibility
export const api = {
  get instance(): ApiTestHelper {
    return getApi();
  },
  // Proxy all methods to the singleton instance
  async init() { return getApi().init(); },
  setAuthToken(token: string) { return getApi().setAuthToken(token); },
  setCookies(cookies: string[]) { return getApi().setCookies(cookies); },
  clearAuth() { return getApi().clearAuth(); },
  async get(url: string, query?: Record<string, any>) { return getApi().get(url, query); },
  async post(url: string, data?: any) { return getApi().post(url, data); },
  async put(url: string, data?: any) { return getApi().put(url, data); },
  async patch(url: string, data?: any) { return getApi().patch(url, data); },
  async delete(url: string) { return getApi().delete(url); },
  async uploadFile(url: string, fieldName: string, filePath: string, data?: any) { 
    return getApi().uploadFile(url, fieldName, filePath, data); 
  },
  async loginAsUser(email: string, password?: string) { return getApi().loginAsUser(email, password); },
  expectSuccess(response: any, expectedStatus?: number) { return getApi().expectSuccess(response, expectedStatus); },
  expectError(response: any, expectedStatus?: number) { return getApi().expectError(response, expectedStatus); },
  expectValidationError(response: any) { return getApi().expectValidationError(response); },
  expectUnauthorized(response: any) { return getApi().expectUnauthorized(response); },
  expectForbidden(response: any) { return getApi().expectForbidden(response); },
  expectNotFound(response: any) { return getApi().expectNotFound(response); },
};
