/**
 * Unit tests for X-Active-Role trust resolution (no DB).
 */
import { describe, it, expect } from '@jest/globals';
import { resolveTrustedActiveRole } from '../../lib/resolve-trusted-active-role';

describe('resolveTrustedActiveRole', () => {
  it('honors header only when held', () => {
    expect(
      resolveTrustedActiveRole('schoolAdmin', ['parent', 'schoolAdmin'], 'parent'),
    ).toBe('schoolAdmin');
  });

  it('ignores spoofed bypass header when not held', () => {
    expect(
      resolveTrustedActiveRole('schoolAdmin', ['parent'], 'parent'),
    ).toBe('parent');
  });

  it('falls back when header missing', () => {
    expect(resolveTrustedActiveRole(undefined, ['educator', 'parent'], 'educator')).toBe(
      'educator',
    );
  });

  it('fail-closes to first held role when fallback also invalid', () => {
    expect(resolveTrustedActiveRole('schoolAdmin', ['teacher'], 'admin')).toBe('teacher');
  });

  it('returns empty when no held roles', () => {
    expect(resolveTrustedActiveRole('schoolAdmin', [], 'parent')).toBe('');
  });
});
