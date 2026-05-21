import request from 'supertest';
import type { Application } from 'express';
import { getProductionPathApp } from './productionPathApp';

export class ProductionPathHttp {
  private app: Application | null = null;
  private testUserEmail: string | null = null;

  async init(): Promise<void> {
    if (!this.app) {
      this.app = await getProductionPathApp();
    }
  }

  setTestUserEmail(email: string | null): void {
    this.testUserEmail = email;
  }

  private applyAuth(req: request.Test): request.Test {
    if (this.testUserEmail) {
      return req.set('x-test-user-email', this.testUserEmail);
    }
    return req;
  }

  private async ensureApp(): Promise<Application> {
    await this.init();
    return this.app!;
  }

  async get(url: string, query?: Record<string, string | number>): Promise<request.Response> {
    const app = await this.ensureApp();
    let req = this.applyAuth(request(app).get(url));
    if (query) {
      req = req.query(query);
    }
    return req;
  }

  async post(url: string, data?: unknown): Promise<request.Response> {
    const app = await this.ensureApp();
    let req = this.applyAuth(request(app).post(url));
    if (data !== undefined) {
      req = req.send(data);
    }
    return req;
  }
}

let sharedHttp: ProductionPathHttp | null = null;

export function getProductionPathHttp(): ProductionPathHttp {
  if (!sharedHttp) {
    sharedHttp = new ProductionPathHttp();
  }
  return sharedHttp;
}
