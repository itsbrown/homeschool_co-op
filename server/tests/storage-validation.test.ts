import { describe, it, expect } from '@jest/globals';

describe('Storage validation', () => {
  it('validates basic FileStorage input guards', async () => {
    const { FileStorage } = await import('../file-storage');
    const storage = new FileStorage();

    await expect(storage.getUser(-1)).rejects.toThrow(/Invalid ID/i);
    await expect(storage.getUserByEmail('invalid-email')).rejects.toThrow(/Invalid email format/i);
    await expect(
      storage.createUser({
        username: '',
        email: 'invalid',
        password: '',
        name: '',
      } as any),
    ).rejects.toThrow(/required|invalid/i);

    await expect(storage.getCurriculum(0)).rejects.toThrow(/Invalid ID/i);
    await expect(
      storage.createCurriculum({
        title: '',
        subject: '',
        gradeLevel: '',
        authorId: -1,
      } as any),
    ).rejects.toThrow(/required|invalid/i);
  });
});
