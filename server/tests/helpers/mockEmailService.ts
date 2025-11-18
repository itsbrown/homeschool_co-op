/**
 * Mock Email Service for Testing
 * Replaces the real email service during tests
 */

export let mockEmailServiceEnabled = false;
export let mockSendWelcomeEmailResponse = true;
export let mockSendWelcomeEmailCalls: any[] = [];

export function enableMockEmailService() {
  mockEmailServiceEnabled = true;
}

export function disableMockEmailService() {
  mockEmailServiceEnabled = false;
}

export function setMockSendWelcomeEmailResponse(value: boolean) {
  mockSendWelcomeEmailResponse = value;
}

export function resetMockEmailService() {
  mockSendWelcomeEmailCalls = [];
  mockSendWelcomeEmailResponse = true;
}

export async function sendWelcomeEmail(params: {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}): Promise<boolean> {
  if (!mockEmailServiceEnabled) {
    // In test mode without mock enabled, throw error
    throw new Error('Mock email service not enabled - call enableMockEmailService() in your test');
  }
  
  mockSendWelcomeEmailCalls.push(params);
  return mockSendWelcomeEmailResponse;
}
