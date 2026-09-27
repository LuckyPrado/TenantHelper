import { describe, expect, it } from 'vitest';
import { RGB_ORDERS, nextOrderAfter, orderForLeaseStart } from './rgb';

describe('RGB orders', () => {
  it('are ordered and non-overlapping', () => {
    for (let i = 1; i < RGB_ORDERS.length; i += 1) {
      expect(RGB_ORDERS[i].startsOn > RGB_ORDERS[i - 1].endsOn).toBe(true);
    }
  });

  it('every order cites a source — these are numbers people sign leases on', () => {
    for (const order of RGB_ORDERS) {
      expect(order.sourceUrl).toMatch(/^https:\/\/rentguidelinesboard\.cityofnewyork\.us\//);
    }
  });
});

describe('orderForLeaseStart', () => {
  it('returns order 57 for a lease starting before the 2026 changeover', () => {
    const order = orderForLeaseStart(new Date('2026-09-26'));

    expect(order?.order).toBe(57);
    expect(order?.oneYearPct).toBe(3);
    expect(order?.twoYearPct).toBe(4.5);
  });

  it('returns the order 58 rent freeze from October 1 2026', () => {
    const order = orderForLeaseStart(new Date('2026-10-01'));

    expect(order?.order).toBe(58);
    expect(order?.oneYearPct).toBe(0);
    expect(order?.twoYearPct).toBe(0);
  });

  it('returns null outside published guidance rather than guessing', () => {
    expect(orderForLeaseStart(new Date('2020-01-01'))).toBeNull();
    expect(orderForLeaseStart(new Date('2030-01-01'))).toBeNull();
  });
});

describe('nextOrderAfter', () => {
  it('surfaces the upcoming freeze while order 57 is still in force', () => {
    expect(nextOrderAfter(new Date('2026-09-26'))?.order).toBe(58);
  });

  it('returns null when nothing further is published', () => {
    expect(nextOrderAfter(new Date('2026-10-02'))).toBeNull();
  });
});
