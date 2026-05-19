import { formatFetchErrorMessage } from '../formatFetchError';

describe('formatFetchErrorMessage', () => {
  it('replaces HTML 502 bodies with a short message', () => {
    const html = '502: <!DOCTYPE html><html><body>couldn\'t reach this app</body></html>';
    expect(formatFetchErrorMessage(new Error(html))).toContain('temporarily unavailable');
  });

  it('extracts JSON message from apiRequest errors', () => {
    const err = new Error('400: {"message":"Validation error","errors":[]}');
    expect(formatFetchErrorMessage(err)).toBe('Validation error');
  });

  it('includes hint when present in JSON error', () => {
    const err = new Error(
      '500: {"message":"Failed to create location","hint":"Run migration."}'
    );
    expect(formatFetchErrorMessage(err)).toContain('Run migration');
  });
});
