/**
 * Soft event reads for educator week calendar.
 * Events table has no schoolId in current schema — return [] rather than 500.
 * When school-scoped events exist later, replace this with a real query.
 */
export async function getEventsBySchoolAndDateRange(
  _schoolId: number,
  _startDate: Date,
  _endDate: Date,
): Promise<any[]> {
  return [];
}

export async function getEventsBySchool(_schoolId: number): Promise<any[]> {
  return [];
}
