// Mock external services for testing

export const mockStripeService = {
  customers: {
    create: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
    retrieve: jest.fn().mockResolvedValue({ id: 'cus_test123', email: 'test@example.com' }),
    update: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
  },
  paymentIntents: {
    create: jest.fn().mockResolvedValue({ 
      id: 'pi_test123', 
      client_secret: 'secret_test123',
      status: 'succeeded'
    }),
    retrieve: jest.fn().mockResolvedValue({ 
      id: 'pi_test123', 
      status: 'succeeded'
    }),
  },
  subscriptions: {
    create: jest.fn().mockResolvedValue({ 
      id: 'sub_test123',
      status: 'active'
    }),
    retrieve: jest.fn().mockResolvedValue({ 
      id: 'sub_test123',
      status: 'active'
    }),
    update: jest.fn().mockResolvedValue({ 
      id: 'sub_test123',
      status: 'active'
    }),
    cancel: jest.fn().mockResolvedValue({ 
      id: 'sub_test123',
      status: 'canceled'
    }),
  },
  webhooks: {
    constructEvent: jest.fn().mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test123' } }
    }),
  },
};

export const mockBrevoService = {
  sendTransacEmail: jest.fn().mockResolvedValue({ 
    messageId: 'msg_test123',
    response: { statusCode: 201 }
  }),
};

export const mockTwilioService = {
  messages: {
    create: jest.fn().mockResolvedValue({ 
      sid: 'SM_test123',
      status: 'sent'
    }),
  },
};

export const mockOpenAIService = {
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue({
        id: 'chatcmpl-test123',
        choices: [{
          message: {
            content: 'This is a test AI response for lesson generation.',
            role: 'assistant'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      }),
    },
  },
  images: {
    generate: jest.fn().mockResolvedValue({
      data: [{
        url: 'https://example.com/generated-image.png'
      }]
    }),
  },
};

export const mockSupabaseStorage = {
  from: jest.fn().mockReturnValue({
    upload: jest.fn().mockResolvedValue({ 
      data: { path: 'test-file.pdf' },
      error: null
    }),
    download: jest.fn().mockResolvedValue({ 
      data: Buffer.from('test file content'),
      error: null
    }),
    remove: jest.fn().mockResolvedValue({ 
      data: true,
      error: null
    }),
    getPublicUrl: jest.fn().mockReturnValue({
      data: { publicUrl: 'https://storage.example.com/test-file.pdf' }
    }),
  }),
};

export const mockWebSocketService = {
  connections: new Map(),
  
  mockConnection(userId: number) {
    const mockSocket = {
      id: `socket_${userId}`,
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1, // OPEN
    };
    this.connections.set(userId, mockSocket);
    return mockSocket;
  },

  broadcast: jest.fn(),
  sendToUser: jest.fn(),
  sendToRole: jest.fn(),
  sendToSchool: jest.fn(),
  
  cleanup() {
    this.connections.clear();
    this.broadcast.mockClear();
    this.sendToUser.mockClear();
    this.sendToRole.mockClear();
    this.sendToSchool.mockClear();
  },
};

// Helper to reset all mocks
export function resetAllMocks() {
  mockStripeService.customers.create.mockClear();
  mockStripeService.customers.retrieve.mockClear();
  mockStripeService.customers.update.mockClear();
  mockStripeService.paymentIntents.create.mockClear();
  mockStripeService.paymentIntents.retrieve.mockClear();
  mockStripeService.subscriptions.create.mockClear();
  mockStripeService.subscriptions.retrieve.mockClear();
  mockStripeService.subscriptions.update.mockClear();
  mockStripeService.subscriptions.cancel.mockClear();
  mockStripeService.webhooks.constructEvent.mockClear();
  
  mockBrevoService.sendTransacEmail.mockClear();
  mockTwilioService.messages.create.mockClear();
  mockOpenAIService.chat.completions.create.mockClear();
  mockOpenAIService.images.generate.mockClear();
  
  mockWebSocketService.cleanup();
}

export function configureMockResponses(config: {
  stripe?: Partial<typeof mockStripeService>;
  brevo?: Partial<typeof mockBrevoService>;
  twilio?: Partial<typeof mockTwilioService>;
  openai?: Partial<typeof mockOpenAIService>;
}) {
  if (config.stripe) {
    Object.assign(mockStripeService, config.stripe);
  }
  if (config.brevo) {
    Object.assign(mockBrevoService, config.brevo);
  }
  if (config.twilio) {
    Object.assign(mockTwilioService, config.twilio);
  }
  if (config.openai) {
    Object.assign(mockOpenAIService, config.openai);
  }
}
