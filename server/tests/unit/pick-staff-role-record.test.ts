/**
 * Staff edit must not rename a parent user_roles row to Mentor.
 */
import { describe, it, expect } from '@jest/globals';
import { fallbackRoleAfterStaffRemoval, pickStaffRoleRecord } from '../../lib/user-labels';

describe('pickStaffRoleRecord', () => {
  const leighAnn = [
    { id: 224, role: 'parent', isPrimary: false },
    { id: 225, role: 'Mentor', isPrimary: true },
  ];

  it('prefers the submitted Mentor row over parent (Leigh Ann save)', () => {
    const picked = pickStaffRoleRecord(leighAnn, {
      preferredRole: 'Mentor',
      staffRoleNames: ['educator', 'teacher', 'schoolAdmin', 'mentor', 'aide'],
    });
    expect(picked?.id).toBe(225);
    expect(picked?.role).toBe('Mentor');
  });

  it('returns Mentor for GET when parent is first', () => {
    const picked = pickStaffRoleRecord(leighAnn, {
      staffRoleNames: ['educator', 'teacher', 'schoolAdmin', 'mentor', 'aide'],
    });
    expect(picked?.id).toBe(225);
  });

  it('does not pick parent when changing Mentor to Aide', () => {
    const picked = pickStaffRoleRecord(leighAnn, {
      preferredRole: 'Aide',
      staffRoleNames: ['educator', 'teacher', 'schoolAdmin', 'mentor', 'aide'],
    });
    expect(picked?.id).toBe(225);
  });

  it('returns undefined for empty list', () => {
    expect(pickStaffRoleRecord([])).toBeUndefined();
  });
});

describe('fallbackRoleAfterStaffRemoval', () => {
  it('returns undefined when Mentor is the only role (Debbie)', () => {
    const debbie = [{ id: 79, role: 'Mentor', isPrimary: true }];
    expect(fallbackRoleAfterStaffRemoval(debbie, 79)).toBeUndefined();
  });

  it('falls back to parent when removing Mentor', () => {
    const rows = [
      { id: 224, role: 'parent', isPrimary: false },
      { id: 225, role: 'Mentor', isPrimary: true },
    ];
    expect(fallbackRoleAfterStaffRemoval(rows, 225)?.id).toBe(224);
  });
});
