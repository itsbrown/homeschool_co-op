import request from 'supertest';
import type { Express } from 'express';
import { getTestApp } from '../../test-app';

export class ApiTestHelper {
  private app: Express | null = null;
  private authToken: string | null = null;
  private cookies: string[] = [];

  async init() {
    if (!this.app) {
      this.app = await getTestApp();
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

  private async ensureApp() {
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

  async loginAsUser(email: string, password: string = 'password123') {
    const response = await this.post('/api/auth/login', { email, password });
    
    if (response.status === 200 && response.body.token) {
      this.setAuthToken(response.body.token);
      
      if (response.headers['set-cookie']) {
        this.setCookies(response.headers['set-cookie']);
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

export const api = new ApiTestHelper();
