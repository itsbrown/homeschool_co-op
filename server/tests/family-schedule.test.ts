import { describe, expect, it } from '@jest/globals';
import { extractFamilyScheduleTiming } from '../utils/family-schedule';

describe('extractFamilyScheduleTiming', () => {
  it('parses jsonb variants (Yankee-style)', () => {
    const timing = extractFamilyScheduleTiming({
      variants: [
        {
          id: 'default-variant',
          name: 'Half Day',
          startTime: '9:00 AM',
          endTime: '12:00 PM',
          days: ['Monday', 'Wednesday', 'Friday'],
        },
        {
          id: 'variant-full',
          name: 'Full Day',
          startTime: '9:00 AM',
          endTime: '03:00 PM',
          days: ['Monday', 'Wednesday', 'Friday'],
        },
      ],
    });

    expect(timing.scheduleDays).toEqual([1, 3, 5]);
    expect(timing.startTime).toBe('09:00');
    expect(timing.endTime).toBe('12:00');
    expect(timing.scheduleLabel).toBe('Half Day');
  });

  it('selects variant by id when provided', () => {
    const timing = extractFamilyScheduleTiming(
      {
        variants: [
          {
            id: 'default-variant',
            name: 'Half Day',
            startTime: '9:00 AM',
            endTime: '12:00 PM',
            days: ['Monday'],
          },
          {
            id: 'variant-full',
            name: 'Full Day',
            startTime: '9:00 AM',
            endTime: '3:00 PM',
            days: ['Tuesday'],
          },
        ],
      },
      'variant-full',
    );

    expect(timing.scheduleDays).toEqual([2]);
    expect(timing.endTime).toBe('15:00');
    expect(timing.scheduleLabel).toBe('Full Day');
  });

  it('parses legacy free-text schedule strings', () => {
    const timing = extractFamilyScheduleTiming('Monday, Wednesday, Friday 9am-12pm');
    expect(timing.scheduleDays).toEqual([1, 3, 5]);
    expect(timing.startTime).toBe('09:00');
    expect(timing.endTime).toBe('12:00');
  });

  it('does not throw when schedule is a non-string object without match()', () => {
    expect(() => extractFamilyScheduleTiming({ variants: [] })).not.toThrow();
    expect(extractFamilyScheduleTiming({ variants: [] }).scheduleDays).toEqual([]);
  });

  it('parses JSON string payloads the same as objects (driver sometimes stringifies jsonb)', () => {
    const timing = extractFamilyScheduleTiming(
      JSON.stringify({
        variants: [
          {
            id: 'v1',
            name: 'AM',
            startTime: '10:00 AM',
            endTime: '1:00 PM',
            days: ['Tuesday', 'Thursday'],
          },
        ],
      }),
    );
    expect(timing.scheduleDays).toEqual([2, 4]);
    expect(timing.startTime).toBe('10:00');
    expect(timing.endTime).toBe('13:00');
  });
});
