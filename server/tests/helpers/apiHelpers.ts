import request from 'supertest';

// Note: The app needs to be exported from server/index.ts for testing
// For now, we'll use a type-safe approach that works with the existing setup
export type Response = any;

export class ApiTestHelper {
  private authToken: string | null = null;
  private cookies: string[] = [];

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

  // Mock implementations for now - these would be updated to use actual server instance
  async get(url: string, query?: Record<string, any>): Promise<Response> {
    // This is a placeholder - actual implementation would use supertest with real server
    return Promise.resolve({ status: 200, body: {}, headers: {} });
  }

  async post(url: string, data?: any): Promise<Response> {
    return Promise.resolve({ status: 200, body: {}, headers: {} });
  }

  async put(url: string, data?: any): Promise<Response> {
    return Promise.resolve({ status: 200, body: {}, headers: {} });
  }

  async patch(url: string, data?: any): Promise<Response> {
    return Promise.resolve({ status: 200, body: {}, headers: {} });
  }

  async delete(url: string): Promise<Response> {
    return Promise.resolve({ status: 200, body: {}, headers: {} });
  }

  async uploadFile(url: string, fieldName: string, filePath: string, data?: any): Promise<Response> {
    return Promise.resolve({ status: 200, body: {}, headers: {} });
  }

  async loginAsUser(email: string, password: string = 'password123'): Promise<Response> {
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
