import { describe, expect, it } from 'vitest';
import { buildAuditExpectedExport } from '../auditExport';
import { DEFAULT_PAYROLL_CONFIG } from '../constants';
import { createEmptyFortnight, roundCurrency, roundHours } from '../timeUtils';
import { PayrollConfig, WorkBlock } from '../../types/payroll';

function makeBlock(partial: Partial<WorkBlock> & { startTime: string; endTime: string }): WorkBlock {
  return {
    id: Math.random().toString(36).slice(2),
    blockType: 'REGULAR_CLIENT',
    unpaidMealBreakMinutes: 0,
    paidClientMealMinutes: 0,
    hasClinicalAssistance: false,
    isRecallOvertime: false,
    remoteContext: 'NOT_ON_CALL',
    rosteredHours: 0,
    ...partial,
  };
}

describe('Dynamic Multi-Period Payroll Audit Export (audit_expected.json)', () => {
  it('Dynamically derives all values from Settings & calendar shifts with zero hardcoded rates and exact mathematical integrity', () => {
    const customConfig: PayrollConfig = {
      ...DEFAULT_PAYROLL_CONFIG,
      classification: 'SW Level 3 Pay Point 1',
      employmentType: 'FT',
      contractedGuaranteedHours: 76,
      ordinaryRate: 41.25,
      superRate: 0.125,
      allowances: {
        ...DEFAULT_PAYROLL_CONFIG.allowances,
        brokenShift2Breaks: 26.5,
        mileageRate: 0.99,
        overtimeMealAllowance: 15.25,
      },
    };

    // Period 2 (passed first out-of-order to test chronological sorting)
    const p2 = createEmptyFortnight('2026-10-19');
    p2.cashedOutAnnualLeaveHours = 8;
    p2.days[0].workBlocks = [
      makeBlock({ blockType: 'ANNUAL_LEAVE', startTime: '09:00', endTime: '17:00' }), // 8h AL + 17.5% loading
    ];
    p2.days[1].workBlocks = [
      makeBlock({ startTime: '07:00', endTime: '19:00', unpaidMealBreakMinutes: 30 }), // 10h ord + 1.5h OT + OT meal
    ];

    // Period 1 (3-period broken shift with travel & mileage + afternoon shift + 2h min period top-ups)
    const p1 = createEmptyFortnight('2026-10-05');
    p1.days[1].workBlocks = [
      makeBlock({ startTime: '09:00', endTime: '10:00' }), // Period 1: 1h + 1h topup @ 100%
      makeBlock({ startTime: '12:15', endTime: '13:15' }), // Period 2: 1h + 1h topup @ 100%
      makeBlock({ startTime: '16:30', endTime: '17:30' }), // Period 3 start
      makeBlock({
        startTime: '17:45',
        endTime: '18:45',
        travelMinutes: 15,
        travelKms: 9.1,
      }),
      makeBlock({
        startTime: '19:00',
        endTime: '21:00',
        travelMinutes: 8,
        travelSeconds: 5,
        travelKms: 5.72,
      }),
    ];

    const exported = buildAuditExpectedExport([p2, p1], customConfig, {
      exportedAt: '2026-11-23T08:00:00.000Z',
    });

    expect(exported.schemaVersion).toBe('1.0.0');
    expect(exported.exportedAt).toBe('2026-11-23T08:00:00.000Z');
    expect(exported.employeeProfile).toEqual({
      classification: 'SW Level 3 Pay Point 1',
      employmentType: 'FT',
      contractedFortnightHours: 76,
      baseHourlyRate: 41.25,
      superannuationRate: 0.125,
    });

    // Sorted chronologically by startDate ascending
    expect(exported.payPeriods.map((p) => p.periodId)).toEqual([
      '2026-10-05_to_2026-10-18',
      '2026-10-19_to_2026-11-01',
    ]);

    for (const period of exported.payPeriods) {
      // Zero-dollar / zero-unit rows must NEVER be emitted
      for (const item of period.lineItems) {
        expect(item.units > 0 || item.totalAmount > 0).toBe(true);
        expect(item.dailyBreakdown.length).toBeGreaterThan(0);

        const sumDailyAmt = roundCurrency(
          item.dailyBreakdown.reduce((s, d) => s + d.amount, 0)
        );
        const sumDailyUnits = roundHours(
          item.dailyBreakdown.reduce((s, d) => s + d.units, 0)
        );
        expect(item.totalAmount).toBe(sumDailyAmt);
        expect(item.units).toBe(sumDailyUnits);
        for (const bd of item.dailyBreakdown) {
          expect(bd.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(bd.auditNote.length).toBeGreaterThan(5);
        }
      }

      // Section 5 Mathematical Integrity
      const earnings = period.lineItems.filter((i) => i.categoryCode !== 'SUPERANNUATION');
      const expectedTaxable = roundCurrency(
        earnings.filter((i) => i.isTaxable).reduce((s, i) => s + i.totalAmount, 0)
      );
      const expectedNonTaxable = roundCurrency(
        earnings.filter((i) => !i.isTaxable).reduce((s, i) => s + i.totalAmount, 0)
      );
      const expectedSuper = roundCurrency(
        earnings.filter((i) => i.attractsSuper).reduce((s, i) => s + i.totalAmount, 0) *
          customConfig.superRate
      );

      expect(period.summary.expectedTaxableGross).toBe(expectedTaxable);
      expect(period.summary.expectedNonTaxableAllowances).toBe(expectedNonTaxable);
      expect(period.summary.expectedGrossTotal).toBe(
        roundCurrency(expectedTaxable + expectedNonTaxable)
      );
      expect(period.summary.expectedSuperannuation).toBe(expectedSuper);

      const superItem = period.lineItems.find((i) => i.categoryCode === 'SUPERANNUATION');
      expect(superItem?.totalAmount).toBe(expectedSuper);
      expect(superItem?.multiplier).toBe(0.125);
    }

    // Verify Period 1 canonical codes & dynamic custom rates
    const period1 = exported.payPeriods[0];
    const broken2 = period1.lineItems.find((i) => i.categoryCode === 'BROKEN_SHIFT_2_BREAKS');
    expect(broken2?.rate).toBe(26.5);
    expect(broken2?.totalAmount).toBe(26.5);
    expect(broken2?.isTaxable).toBe(true);
    expect(broken2?.unitType).toBe('SHIFTS');

    const mileage = period1.lineItems.find((i) => i.categoryCode === 'MILEAGE_KM');
    expect(mileage?.isTaxable).toBe(false);
    expect(mileage?.unitType).toBe('KMS');
    expect(mileage?.rate).toBe(0.99);
    expect(mileage?.units).toBeCloseTo(14.82, 2);
    expect(mileage?.totalAmount).toBe(roundCurrency(14.82 * 0.99));

    const aftTravel = period1.lineItems.find((i) => i.categoryCode === 'TRAVEL_TIME_AFTERNOON');
    expect(aftTravel?.rate).toBe(41.25);
    expect(aftTravel?.multiplier).toBe(1.125);

    // Verify Period 2 canonical leave cash-out doesn't double-count hours + OT meal is non-taxable
    const period2 = exported.payPeriods[1];
    const cashOut = period2.lineItems.find((i) => i.categoryCode === 'ANNUAL_LEAVE_CASHED_OUT');
    expect(cashOut?.units).toBe(8);
    expect(cashOut?.multiplier).toBe(1.175);
    expect(cashOut?.totalAmount).toBe(roundCurrency(8 * 41.25 * 1.175));
    expect(period2.summary.expectedLeaveHours).toBe(16); // 8h AL base + 8h cashed out (loading not double-counted)

    const otMeal = period2.lineItems.find((i) => i.categoryCode === 'OT_MEAL_ALLOWANCE');
    expect(otMeal?.isTaxable).toBe(false);
    expect(otMeal?.unitType).toBe('MEALS');
    expect(otMeal?.totalAmount).toBe(15.25);
  });

  it('Filters exported pay periods accurately by Selected Pay Period Range', () => {
    const p1 = createEmptyFortnight('2026-09-21');
    const p2 = createEmptyFortnight('2026-10-05');
    const p3 = createEmptyFortnight('2026-10-19');

    const filtered = buildAuditExpectedExport([p3, p1, p2], DEFAULT_PAYROLL_CONFIG, {
      startDateFrom: '2026-10-05',
      startDateTo: '2026-10-19',
    });

    expect(filtered.payPeriods.map((p) => p.startDate)).toEqual(['2026-10-05', '2026-10-19']);
  });
});
