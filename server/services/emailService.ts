// Mock email service for development
// In a production environment, we would use a real email service

export async function sendWelcomeEmail(email: string, name: string) {
  // Just log the email info instead of actually sending in development
  console.log(`[MOCK EMAIL] Welcome email would be sent to: ${email}`);
  console.log(`[MOCK EMAIL] Welcome email content: Hello ${name}, welcome to LearnSphere!`);
  
  // Return a mock successful result
  return {
    messageId: `mock-welcome-${Date.now()}`,
    response: 'Mock email service'
  };
}

export async function sendVerificationEmail(email: string, token: string) {
  // Just log the email info instead of actually sending in development
  console.log(`[MOCK EMAIL] Verification email would be sent to: ${email}`);
  console.log(`[MOCK EMAIL] Verification token: ${token}`);
  
  // Return a mock successful result
  return {
    messageId: `mock-verification-${Date.now()}`,
    response: 'Mock email service'
  };
}

export async function sendPasswordResetEmail(email: string, token: string) {
  // Just log the email info instead of actually sending in development
  console.log(`[MOCK EMAIL] Password reset email would be sent to: ${email}`);
  console.log(`[MOCK EMAIL] Reset token: ${token}`);
  
  // Return a mock successful result
  return {
    messageId: `mock-reset-${Date.now()}`,
    response: 'Mock email service'
  };
}
