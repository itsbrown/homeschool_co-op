// Mock email service for testing
const mockSendWelcomeEmail = jest.fn().mockResolvedValue(true);

module.exports = {
  sendWelcomeEmail: mockSendWelcomeEmail,
  __mockSendWelcomeEmail: mockSendWelcomeEmail, // Export for test access
};
