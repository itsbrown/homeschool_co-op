import {
  formatJobsSubtitle,
  holdsParent,
  holdsParentAndTeaching,
  holdsSchoolAdmin,
  holdsTeaching,
} from '../user-jobs';

describe('user-jobs', () => {
  const parent = { role: 'parent' };
  const mentor = { role: 'Mentor' };
  const educator = { role: 'educator' };
  const lead = { role: 'Lead Mentor' };
  const schoolAdmin = { role: 'schoolAdmin' };

  it('holdsParent is direct membership only (UC-10 hierarchy)', () => {
    expect(holdsParent([parent])).toBe(true);
    expect(holdsParent([schoolAdmin])).toBe(false);
    expect(holdsParent([parent, mentor])).toBe(true);
    expect(holdsParent([])).toBe(false);
  });

  it('holdsTeaching matches system teaching roles and custom titles (UC-05, UC-06)', () => {
    expect(holdsTeaching([educator])).toBe(true);
    expect(holdsTeaching([mentor])).toBe(true);
    expect(holdsTeaching([lead])).toBe(true);
    expect(holdsTeaching([parent])).toBe(false);
    expect(holdsTeaching([schoolAdmin])).toBe(false);
  });

  it('holdsParentAndTeaching is the Phase 1 chrome cohort (UC-03)', () => {
    expect(holdsParentAndTeaching([parent, mentor])).toBe(true);
    expect(holdsParentAndTeaching([parent])).toBe(false);
    expect(holdsParentAndTeaching([educator])).toBe(false);
    expect(holdsParentAndTeaching([parent, schoolAdmin])).toBe(false);
  });

  it('holdsSchoolAdmin does not fire for mentors', () => {
    expect(holdsSchoolAdmin([schoolAdmin])).toBe(true);
    expect(holdsSchoolAdmin([mentor])).toBe(false);
    expect(holdsSchoolAdmin([parent, schoolAdmin])).toBe(true);
  });

  it('formatJobsSubtitle lists held jobs', () => {
    expect(formatJobsSubtitle([parent])).toBe('Parent');
    expect(formatJobsSubtitle([parent, mentor])).toBe('Parent · Mentor');
    expect(formatJobsSubtitle([educator])).toBe('Educator');
  });
});
