import {
  normalizeRegistrationCode,
} from '../lib/school-registration-code';

describe('school-registration-code', () => {
  it('normalizeRegistrationCode trims whitespace', () => {
    expect(normalizeRegistrationCode('  X8BMC1JE  ')).toBe('X8BMC1JE');
  });
});
