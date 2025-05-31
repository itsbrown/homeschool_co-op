
export function useMockAuth() {
  return {
    user: {
      id: 'mock-user-123',
      name: 'Test User',
      email: 'test@example.com',
      role: 'parent',
      roles: ['parent'],
      avatar: null,
      subscription: 'free'
    },
    isAuthenticated: true,
    isLoading: false,
    login: () => console.log('Mock login'),
    logout: () => console.log('Mock logout'),
    getAccessTokenSilently: async () => 'mock-token-123',
    inspectCurrentToken: async () => 'mock-token-123'
  };
}
