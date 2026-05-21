import { rowsFromExecute } from '../lib/db-execute-rows';

describe('rowsFromExecute', () => {
  it('reads { rows: [] } shape', () => {
    expect(rowsFromExecute({ rows: [{ id: 1 }] })).toEqual([{ id: 1 }]);
  });

  it('reads array shape', () => {
    expect(rowsFromExecute([{ id: 2 }])).toEqual([{ id: 2 }]);
  });

  it('returns empty for null/undefined', () => {
    expect(rowsFromExecute(null)).toEqual([]);
    expect(rowsFromExecute(undefined)).toEqual([]);
  });
});
