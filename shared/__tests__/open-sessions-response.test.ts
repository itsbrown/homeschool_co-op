import { parseOpenSessionsResponse } from '../open-sessions-response';

describe('parseOpenSessionsResponse', () => {
  it('accepts legacy array shape', () => {
    const parsed = parseOpenSessionsResponse([{ id: 1, name: 'Fall 2026' }]);
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.closedNotices).toEqual([]);
  });

  it('accepts object shape with closed notices', () => {
    const parsed = parseOpenSessionsResponse({
      sessions: [],
      closedNotices: [{ sessionId: 2, name: 'Fall 2026', message: 'Contact us' }],
    });
    expect(parsed.sessions).toEqual([]);
    expect(parsed.closedNotices[0].message).toBe('Contact us');
  });
});
