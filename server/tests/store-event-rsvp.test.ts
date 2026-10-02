import { describe, expect, it } from '@jest/globals';
import {
  emptyStoreEventRsvp,
  eventStripeLineItems,
  isBelowStripeMinimum,
  priceEventRsvp,
  type StoreEventRsvp,
} from '@shared/store-event-rsvp';

function banquet(): StoreEventRsvp {
  const rsvp = emptyStoreEventRsvp('2026-11-01');
  rsvp.location = 'Brighton campus';
  rsvp.startTime = '17:00';
  rsvp.endTime = '19:00';
  rsvp.closeOn = '2026-10-20';
  rsvp.attendees = [
    { type: 'adult', enabled: true, priceCents: 2500, capacity: 2 },
    { type: 'children', enabled: true, priceCents: 0, capacity: null },
    { type: 'guests', enabled: false, priceCents: 1000, capacity: null },
  ];
  rsvp.meals = [
    { type: 'gluten_free', enabled: true },
    { type: 'vegan', enabled: false },
    { type: 'dairy_free', enabled: false },
    { type: 'other', enabled: true },
  ];
  return rsvp;
}

describe('priceEventRsvp', () => {
  it('charges only paid attendees and keeps free counts on the receipt', () => {
    const priced = priceEventRsvp({
      config: banquet(),
      today: '2026-10-01',
      answer: {
        attendees: [
          { type: 'adult', quantity: 2 },
          { type: 'children', quantity: 1 },
          { type: 'guests', quantity: 0 },
        ],
        meals: [
          { type: 'gluten_free', quantity: 3 },
          { type: 'other', quantity: 1 },
        ],
        otherNote: 'sesame',
      },
    });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(priced.lineTotalCents).toBe(5000);
    expect(priced.headcount).toBe(3);
    expect(eventStripeLineItems(priced.eventRsvp, 'Fall dinner')).toEqual([
      { name: 'Fall dinner — Adult', unitAmountCents: 2500, quantity: 2 },
    ]);
    expect(priced.eventRsvp.meals.map((meal) => meal.type)).toEqual(['gluten_free', 'other']);
    expect(priced.eventRsvp.otherNote).toBe('sesame');
    expect(priced.eventRsvp.location).toBe('Brighton campus');
  });

  it('allows an all-free RSVP', () => {
    const config = banquet();
    config.attendees[0].priceCents = 0;
    const priced = priceEventRsvp({
      config,
      today: '2026-10-01',
      answer: {
        attendees: [{ type: 'children', quantity: 2 }],
        meals: [],
        otherNote: null,
      },
    });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(priced.lineTotalCents).toBe(0);
    expect(eventStripeLineItems(priced.eventRsvp, 'Fall dinner')).toEqual([]);
  });

  it('rejects a total between 1 and 49 cents at the order gate', () => {
    expect(isBelowStripeMinimum(25)).toBe(true);
    expect(isBelowStripeMinimum(0)).toBe(false);
    expect(isBelowStripeMinimum(50)).toBe(false);
  });

  it('rejects RSVPs after the close date', () => {
    const priced = priceEventRsvp({
      config: banquet(),
      today: '2026-10-21',
      answer: {
        attendees: [{ type: 'adult', quantity: 1 }],
        meals: [],
        otherNote: null,
      },
    });
    expect(priced).toEqual({ ok: false, unavailableReason: 'RSVP is closed' });
  });

  it('rejects an attendee type that would pass the paid cap', () => {
    const priced = priceEventRsvp({
      config: banquet(),
      today: '2026-10-01',
      soldByType: { adult: 2 },
      answer: {
        attendees: [{ type: 'adult', quantity: 1 }],
        meals: [],
        otherNote: null,
      },
    });
    expect(priced).toEqual({ ok: false, unavailableReason: 'Adult is full' });
  });

  it('requires a note when other meals are counted', () => {
    const priced = priceEventRsvp({
      config: banquet(),
      today: '2026-10-01',
      answer: {
        attendees: [{ type: 'adult', quantity: 1 }],
        meals: [{ type: 'other', quantity: 1 }],
        otherNote: '  ',
      },
    });
    expect(priced).toEqual({ ok: false, unavailableReason: 'Describe the other allergy' });
  });
});
