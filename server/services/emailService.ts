
// Mock email service for development
// In a production environment, we would use Brevo email service

export async function sendWelcomeEmail(email: string, name: string) {
  // Just log the email info instead of actually sending in development
  console.log(`[MOCK EMAIL] Welcome email would be sent via Brevo to: ${email}`);
  console.log(`[MOCK EMAIL] Welcome email content: Hello ${name}, welcome to American Seekers Academy!`);
  
  // Return a mock successful result similar to Brevo response
  return {
    messageId: `mock-brevo-welcome-${Date.now()}`,
    response: 'Mock Brevo email service'
  };
}

export async function sendVerificationEmail(email: string, token: string) {
  // Just log the email info instead of actually sending in development
  console.log(`[MOCK EMAIL] Verification email would be sent via Brevo to: ${email}`);
  console.log(`[MOCK EMAIL] Verification token: ${token}`);
  
  // Return a mock successful result similar to Brevo response
  return {
    messageId: `mock-brevo-verification-${Date.now()}`,
    response: 'Mock Brevo email service'
  };
}

export async function sendPasswordResetEmail(email: string, token: string) {
  // Just log the email info instead of actually sending in development
  console.log(`[MOCK EMAIL] Password reset email would be sent via Brevo to: ${email}`);
  console.log(`[MOCK EMAIL] Reset token: ${token}`);
  
  // Return a mock successful result similar to Brevo response
  return {
    messageId: `mock-brevo-reset-${Date.now()}`,
    response: 'Mock Brevo email service'
  };
}

// New Brevo-style functions
export async function sendStaffInvitationEmail(email: string, firstName: string, lastName: string, role: string, department: string, message?: string) {
  console.log(`[MOCK EMAIL] Staff invitation would be sent via Brevo to: ${email}`);
  console.log(`[MOCK EMAIL] Staff details: ${firstName} ${lastName}, Role: ${role}, Department: ${department}`);
  if (message) console.log(`[MOCK EMAIL] Personal message: ${message}`);
  
  return {
    messageId: `mock-brevo-staff-${Date.now()}`,
    response: 'Mock Brevo email service'
  };
}

export async function sendRoleInvitationEmail(email: string, role: string, token: string) {
  console.log(`[MOCK EMAIL] Role invitation would be sent via Brevo to: ${email}`);
  console.log(`[MOCK EMAIL] Role: ${role}, Token: ${token}`);
  
  return {
    messageId: `mock-brevo-role-${Date.now()}`,
    response: 'Mock Brevo email service'
  };
}
