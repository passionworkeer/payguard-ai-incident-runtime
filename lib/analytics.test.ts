import { describe, expect, it } from 'vitest';
import {
  calculateClassification,
  calculateCtr,
  calculateFunnelRates,
  calculateStageDuration,
} from './analytics';

describe('dashboard analytics', () => {
  it('calculates precision, recall, f1, and accuracy', () => {
    expect(
      calculateClassification({ tp: 80, fp: 20, fn: 10, tn: 90 }),
    ).toEqual({
      precision: 0.8,
      recall: 80 / 90,
      f1: 0.8421052631578948,
      accuracy: 0.85,
    });
  });

  it('returns zero instead of NaN when a classification denominator is zero', () => {
    expect(
      calculateClassification({ tp: 0, fp: 0, fn: 0, tn: 0 }),
    ).toEqual({ precision: 0, recall: 0, f1: 0, accuracy: 0 });
  });

  it('calculates delivered-message click through rate', () => {
    expect(calculateCtr({ delivered: 250, clicked: 162 })).toBeCloseTo(0.648);
  });

  it('calculates conversion from the previous funnel stage', () => {
    expect(calculateFunnelRates([100, 40, 20])).toEqual([1, 0.4, 0.5]);
  });

  it('calculates a completed AI stage duration in milliseconds', () => {
    expect(
      calculateStageDuration({
        startedAt: '2026-08-25T10:00:00.000Z',
        completedAt: '2026-08-25T10:00:03.240Z',
      }),
    ).toBe(3240);
  });
});
