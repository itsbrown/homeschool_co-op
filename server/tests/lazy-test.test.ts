import { describe, it, expect } from '@jest/globals';

describe('Lazy Initialization Test', () => {
  it('should import helpers without hanging', async () => {
    // This will test if just importing causes the hang
    const { api } = await import('../helpers/apiHelpers');
    const { testDb } = await import('../helpers/testDatabase');
    
    expect(api).toBeDefined();
    expect(testDb).toBeDefined();
  });
  
  it('should create API instance only when needed', async () => {
    const { getApi } = await import('../helpers/apiHelpers');
    const apiInstance = getApi();
    expect(apiInstance).toBeDefined();
  });
});
