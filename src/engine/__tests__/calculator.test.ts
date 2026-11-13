import { describe, expect, it } from 'vitest';
import { calculateFortnight } from '../calculator';
import { DEFAULT_PAYROLL_CONFIG } from '../constants';
import { createDemoTestFortnight } from '../demoFortnight';
import { createEmptyFortnight } from '../timeUtils';
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

describe('Calvary Home Care Award Payroll Engine', () => {
  it('Verification Case 1: Broken Shift + Afternoon Penalty (Mon)', () => {
    const fortnight = createEmptyFortnight('2026-11-09');
    fortnight.days[0].workBlocks = [
      makeBlock({ startTime: '09:00', endTime: '11:30' }),
      makeBlock({ startTime: '17:30', endTime: '20:30' }),
    ];

    const res = calculateFortnight(fortnight, DEFAULT_PAYROLL_CONFIG);
    const mon = res.days[0];

    expect(mon.brokenShiftPeriods).toBe(2);
    expect(mon.brokenShiftUnpaidBreaks).toBe(1);

    const ord = mon.lineItems.find((i) => i.code === 'BASE_ORDINARY');
    const aft = mon.lineItems.find((i) => i.code === 'AFTERNOON_SHIFT');
    const bs = mon.lineItems.find((i) => i.code === 'ALLOWANCE_BROKEN_1');

    expect(ord?.units).toBe(2.5);
    expect(ord?.multiplier).toBe(1.0);
    expect(aft?.units).toBe(3.0);
    expect(aft?.multiplier).toBe(1.125);
    expect(bs?.amount).toBe(18.34);
  });

  it('Verification Case 2: Broken Shift >12h Span (Tue)', () => {
    const fortnight = createEmptyFortnight('2026-11-09');
    fortnight.days[1].workBlocks = [
      makeBlock({ startTime: '07:00', endTime: '09:00' }),
      makeBlock({ startTime: '18:00', endTime: '20:30' }),
    ];

    const res = calculateFortnight(fortnight, DEFAULT_PAYROLL_CONFIG);
    const tue = res.days[1];

    const ord = tue.lineItems.find((i) => i.code === 'BASE_ORDINARY');
    const aft = tue.lineItems.find((i) => i.code === 'AFTERNOON_SHIFT');
    const span200 = tue.lineItems.find((i) => i.code === 'BROKEN_SHIFT_SPAN_200');
    const bs = tue.lineItems.find((i) => i.code === 'ALLOWANCE_BROKEN_1');

    expect(ord?.units).toBe(2.0);
    expect(aft?.units).toBe(1.0);
    expect(aft?.multiplier).toBe(1.125);
    expect(span200?.units).toBe(1.5);
    expect(span200?.multiplier).toBe(2.0);
    expect(bs?.amount).toBe(18.34);
  });

  it('Verification Case 3: 10-Hour Rest Breach (Tue 22:30 -> Wed 07:00)', () => {
    const fortnight = createEmptyFortnight('2026-11-09');
    fortnight.days[1].workBlocks = [makeBlock({ startTime: '14:30', endTime: '22:30' })];
    fortnight.days[2].workBlocks = [makeBlock({ startTime: '07:00', endTime: '11:00' })];

    const res = calculateFortnight(fortnight, DEFAULT_PAYROLL_CONFIG);
    const wed = res.days[2];

    expect(wed.hasRestBreakBreach).toBe(true);
    expect(wed.restGapHours).toBe(8.5);
    const rb = wed.lineItems.find((i) => i.code === 'REST_BREAK_BREACH_200');
    expect(rb?.units).toBe(4.0);
    expect(rb?.multiplier).toBe(2.0);
  });

  it('Verification Case 4: Daily Overtime + Travel Exemption (Thu)', () => {
    const fortnight = createEmptyFortnight('2026-11-09');
    fortnight.days[3].workBlocks = [
      makeBlock({ startTime: '07:00', endTime: '17:30', unpaidMealBreakMinutes: 30 }),
      makeBlock({
        blockType: 'TRAVEL_BETWEEN_CLIENTS',
        startTime: '17:30',
        endTime: '18:00',
      }),
      makeBlock({ startTime: '18:00', endTime: '19:30' }),
    ];

    const res = calculateFortnight(fortnight, DEFAULT_PAYROLL_CONFIG);
    const thu = res.days[3];

    expect(thu.ordinaryNonTravelHours).toBe(10.0);
    expect(thu.travelHours).toBe(0.5);
    expect(thu.overtimeHours).toBe(1.5);

    const ot150 = thu.lineItems.find((i) => i.code === 'OVERTIME_150');
    const meal = thu.lineItems.find((i) => i.code === 'ALLOWANCE_OT_MEAL');
    const travel = thu.lineItems.find((i) => i.code === 'TRAVEL_ORDINARY');

    expect(ot150?.units).toBe(1.5);
    expect(ot150?.multiplier).toBe(1.5);
    expect(meal?.amount).toBe(14.1);
    expect(travel?.units).toBe(0.5);
    expect(travel?.category).not.toBe('OVERTIME');
  });

  it('Runs all 4 Demo Test Fortnight scenarios cleanly without interference', () => {
    const demo = createDemoTestFortnight('2026-11-09');
    const res = calculateFortnight(demo, DEFAULT_PAYROLL_CONFIG);

    // Day 0 (W1 Mon): Test Case 1
    expect(res.days[0].lineItems.find((i) => i.code === 'AFTERNOON_SHIFT')?.units).toBe(3.0);
    expect(res.days[0].lineItems.find((i) => i.code === 'ALLOWANCE_BROKEN_1')?.amount).toBe(18.34);

    // Day 1 (W1 Tue): Test Case 2
    expect(res.days[1].lineItems.find((i) => i.code === 'BROKEN_SHIFT_SPAN_200')?.units).toBe(1.5);

    // Day 3 (W1 Thu): Test Case 4 (uses pre-shift travelMinutes/Seconds + travelKms)
    expect(res.days[3].overtimeHours).toBe(1.5);
    expect(res.days[3].travelHours).toBe(0.5);
    expect(res.days[3].lineItems.find((i) => i.code === 'ALLOWANCE_OT_MEAL')?.amount).toBe(14.1);
    expect(res.days[3].lineItems.find((i) => i.code === 'ALLOWANCE_MILEAGE')?.units).toBe(18);

    // Day 9 (W2 Wed): Test Case 3
    expect(res.days[9].hasRestBreakBreach).toBe(true);
    expect(res.days[9].lineItems.find((i) => i.code === 'REST_BREAK_BREACH_200')?.units).toBe(4.0);
  });

  it('Calculates pre-shift travel in minutes + seconds and travelKms attached to the next shift', () => {
    const fortnight = createEmptyFortnight('2026-11-09');
    fortnight.days[0].workBlocks = [
      makeBlock({ startTime: '09:00', endTime: '11:00' }),
      makeBlock({
        startTime: '11:15',
        endTime: '13:15',
        travelMinutes: 15,
        travelSeconds: 30,
        travelKms: 12.5,
      }),
    ];

    const res = calculateFortnight(fortnight, DEFAULT_PAYROLL_CONFIG);
    const mon = res.days[0];
    // 15m 30s = 15.5 / 60 = 0.2583 hrs
    expect(mon.travelHours).toBeCloseTo(15.5 / 60, 4);
    expect(mon.brokenShiftPeriods).toBe(0);
    expect(mon.lineItems.find((i) => i.code === 'ALLOWANCE_MILEAGE')?.units).toBe(12.5);
  });

  it('Enforces PT 2h minimum engagement only when not contiguous with another block', () => {
    const fortnight = createEmptyFortnight('2026-11-09');
    // Day 0: standalone 1h block -> padded by 1h to 2.0h
    fortnight.days[0].workBlocks = [makeBlock({ startTime: '09:00', endTime: '10:00' })];
    // Day 1: 1h + 0.5h travel + 1h client contiguous -> 2.5h total, NO top-up
    fortnight.days[1].workBlocks = [
      makeBlock({ startTime: '09:00', endTime: '10:00' }),
      makeBlock({ blockType: 'TRAVEL_BETWEEN_CLIENTS', startTime: '10:00', endTime: '10:30' }),
      makeBlock({ startTime: '10:30', endTime: '11:30' }),
    ];

    const res = calculateFortnight(fortnight, DEFAULT_PAYROLL_CONFIG);
    expect(res.days[0].lineItems.find((i) => i.code === 'MIN_ENGAGEMENT_TOPUP')?.units).toBe(1.0);
    expect(res.days[1].lineItems.find((i) => i.code === 'MIN_ENGAGEMENT_TOPUP')).toBeUndefined();
  });

  it('Does NOT classify a 30-60 min meal break gap as a Broken Shift, but classifies 3 periods as 2 breaks', () => {
    const fortnight = createEmptyFortnight('2026-11-09');
    // Day 0: 45 min lunch gap -> NOT broken shift
    fortnight.days[0].workBlocks = [
      makeBlock({ startTime: '08:00', endTime: '12:00' }),
      makeBlock({ startTime: '12:45', endTime: '16:00' }),
    ];
    // Day 1: 3 periods separated by >60m gaps -> 2 unpaid breaks ($24.27)
    fortnight.days[1].workBlocks = [
      makeBlock({ startTime: '07:30', endTime: '09:30' }),
      makeBlock({ startTime: '11:30', endTime: '13:30' }),
      makeBlock({ startTime: '15:30', endTime: '17:30' }),
    ];

    const res = calculateFortnight(fortnight, DEFAULT_PAYROLL_CONFIG);
    expect(res.days[0].brokenShiftPeriods).toBe(0);
    expect(res.days[0].lineItems.find((i) => i.code === 'ALLOWANCE_BROKEN_1')).toBeUndefined();

    expect(res.days[1].brokenShiftPeriods).toBe(3);
    expect(res.days[1].brokenShiftUnpaidBreaks).toBe(2);
    expect(res.days[1].lineItems.find((i) => i.code === 'ALLOWANCE_BROKEN_2')?.amount).toBe(24.27);
  });

  it('Splits cross-midnight shifts at 00:00 for Weekend/PH boundaries while keeping Mon-Fri Night Shift (115%)', () => {
    const fortnight = createEmptyFortnight('2026-11-09');
    // Mon 22:00 - Tue 02:00 (both Mon & Tue ordinary weekdays) -> all 4h at 115% Night Shift
    fortnight.days[0].workBlocks = [makeBlock({ startTime: '22:00', endTime: '02:00' })];
    // Fri (day 4) 22:00 - Sat (day 5) 02:00 -> 2h Night 115% on Fri + 2h Sat 150% on Sat
    fortnight.days[4].workBlocks = [makeBlock({ startTime: '22:00', endTime: '02:00' })];

    const res = calculateFortnight(fortnight, DEFAULT_PAYROLL_CONFIG);
    const monNightTotal = res.days[0].lineItems
      .filter((i) => i.code === 'NIGHT_SHIFT')
      .reduce((s, i) => s + i.units, 0);
    expect(monNightTotal).toBe(4.0);

    const friNight = res.days[4].lineItems.find((i) => i.code === 'NIGHT_SHIFT');
    const sat150 = res.days[4].lineItems.find((i) => i.code === 'SATURDAY');
    expect(friNight?.units).toBe(2.0);
    expect(sat150?.units).toBe(2.0);
  });

  it('Triggers Fortnightly >76h Overtime while excluding Travel Time from >76h count', () => {
    const fortnight = createEmptyFortnight('2026-11-09');
    // 8 days x 9.5h client = 76.0h + Day 8 has 1.0h travel + 3.0h client -> 3.0h OT (2h @ 150%, 1h @ 200%)
    for (let d = 0; d < 8; d++) {
      fortnight.days[d].workBlocks = [makeBlock({ startTime: '08:00', endTime: '17:30' })];
    }
    fortnight.days[8].workBlocks = [
      makeBlock({ blockType: 'TRAVEL_BETWEEN_CLIENTS', startTime: '08:00', endTime: '09:00' }),
      makeBlock({ startTime: '09:00', endTime: '12:00' }),
    ];

    const res = calculateFortnight(fortnight, DEFAULT_PAYROLL_CONFIG);
    const day8 = res.days[8];
    expect(day8.travelHours).toBe(1.0);
    expect(day8.overtimeHours).toBe(3.0);
    expect(day8.lineItems.find((i) => i.code === 'TRAVEL_ORDINARY')?.units).toBe(1.0);
    expect(day8.lineItems.find((i) => i.code === 'OVERTIME_150')?.units).toBe(2.0);
    expect(day8.lineItems.find((i) => i.code === 'OVERTIME_200')?.units).toBe(1.0);
  });

  it('Handles Sleepover 4h minimum top-up, Night coupling (115%), 8h rest exception, and Active Work OT', () => {
    const fortnight = createEmptyFortnight('2026-11-09');
    // Day 0: 20:00-22:00 client (2h) + 22:00-06:00 Sleepover + 01:00-01:20 Active Work (min 1h OT)
    // Day 1: 06:00-07:00 client (1h) -> total contiguous = 3h -> +1.0h top-up; both sides coupled at 115%; 8h sleepover gap (no rest breach!)
    fortnight.days[0].workBlocks = [
      makeBlock({ startTime: '20:00', endTime: '22:00' }),
      makeBlock({ blockType: 'SLEEPOVER', startTime: '22:00', endTime: '06:00' }),
      makeBlock({ blockType: 'ACTIVE_WORK_DURING_SLEEPOVER', startTime: '01:00', endTime: '01:20' }),
    ];
    fortnight.days[1].workBlocks = [makeBlock({ startTime: '06:00', endTime: '07:00' })];

    const res = calculateFortnight(fortnight, DEFAULT_PAYROLL_CONFIG);
    const d0 = res.days[0];
    const d1 = res.days[1];

    expect(d0.lineItems.find((i) => i.code === 'ALLOWANCE_SLEEPOVER')?.amount).toBe(52.86);
    expect(d0.lineItems.find((i) => i.code === 'SLEEPOVER_4H_TOPUP')?.units).toBe(1.0);
    expect(d0.lineItems.find((i) => i.code === 'NIGHT_SHIFT')?.units).toBe(2.0);
    expect(d0.lineItems.find((i) => i.code === 'OVERTIME_150')?.units).toBe(1.0); // min 1h active work

    expect(d1.hasRestBreakBreach).toBe(false); // 8h gap between 22:00 and 06:00 meets sleepover 8h rule
    expect(d1.lineItems.find((i) => i.code === 'NIGHT_SHIFT')?.units).toBe(1.0);
  });

  it('Handles 24-Hour Care, Remote Work rounding/minimums, Commute >25km, Weekly Caps, and Guaranteed Hours Top-Up', () => {
    const config: PayrollConfig = {
      ...DEFAULT_PAYROLL_CONFIG,
      contractedGuaranteedHours: 30,
      firstAidEnabled: true,
    };
    const fortnight = createEmptyFortnight('2026-11-09');

    // Day 0: 24hr care with 9.5h active care (8h @ 155% + 1.5h OT @ 150%)
    fortnight.days[0].workBlocks = [
      makeBlock({
        blockType: 'CARE_24HR',
        startTime: '08:00',
        endTime: '08:00',
        care24ActiveHours: 9.5,
      }),
    ];

    // Day 2: Remote Work On-Call Day 10 mins (min 0.25h @ 100%) + Remote Night 20 mins (min 0.50h @ 150%)
    fortnight.days[2].workBlocks = [
      makeBlock({
        blockType: 'REMOTE_WORK',
        startTime: '10:00',
        endTime: '10:10',
        remoteContext: 'ON_CALL_DAY_6AM_10PM',
      }),
      makeBlock({
        blockType: 'REMOTE_WORK',
        startTime: '23:00',
        endTime: '23:20',
        remoteContext: 'ON_CALL_NIGHT_10PM_6AM',
      }),
    ];

    // Day 3: 2h shift (<3h) with 40km commute (>25km -> 15km * 0.92 = $13.80)
    fortnight.days[3].commuteKmsFirstLast = 40;
    fortnight.days[3].workBlocks = [makeBlock({ startTime: '09:00', endTime: '11:00' })];

    // Days 4, 5, 6: shifts to trigger 6 uniform/laundry days in Week 1 -> capped at $6.24 and $1.49
    for (const d of [4, 5, 6]) {
      fortnight.days[d].workBlocks = [makeBlock({ startTime: '09:00', endTime: '11:00' })];
    }

    const res = calculateFortnight(fortnight, config);

    expect(res.days[0].lineItems.find((i) => i.code === 'CARE_24HR_155')?.units).toBe(8.0);
    expect(res.days[0].lineItems.find((i) => i.code === 'OVERTIME_150')?.units).toBe(1.5);

    expect(res.days[2].lineItems.find((i) => i.code === 'REMOTE_WORK')?.units).toBe(0.25);
    expect(res.days[2].lineItems.find((i) => i.code === 'OVERTIME_150')?.units).toBe(0.5);

    expect(res.days[3].lineItems.find((i) => i.code === 'ALLOWANCE_MILEAGE')?.units).toBe(15);

    const uniRow = res.groupedRows.find((r) => r.code === 'ALLOWANCE_UNIFORM');
    const lauRow = res.groupedRows.find((r) => r.code === 'ALLOWANCE_LAUNDRY');
    expect(uniRow?.amount).toBe(6.24);
    expect(lauRow?.amount).toBe(1.49);

    // Total ordinary/travel = 8.0 (care24) + 0.25 (remote) + 2*4 (days 3..6) = 16.25h -> shortfall 13.75h
    expect(res.guaranteedHoursShortfall).toBe(13.75);
    expect(res.groupedRows.find((r) => r.code === 'GUARANTEED_HOURS_TOPUP')?.units).toBe(13.75);
    expect(res.groupedRows.find((r) => r.code === 'ALLOWANCE_FIRST_AID')).toBeDefined();
  });

  it('Enforces Broken Shift Min 2h Period Top-Up (Cl 18(e)(ii)(C)) independently for BOTH FT & PT', () => {
    const ftConfig: PayrollConfig = {
      ...DEFAULT_PAYROLL_CONFIG,
      employmentType: 'FT',
    };
    const fortnight = createEmptyFortnight('2026-11-09');
    // Day 0: Broken shift with Period 1 = 1.0h (09:00-10:00 @ 100%) and Period 2 = 1.0h (19:30-20:30 @ 112.5% Afternoon, within 21:00 12h span)
    fortnight.days[0].workBlocks = [
      makeBlock({ startTime: '09:00', endTime: '10:00' }),
      makeBlock({ startTime: '19:30', endTime: '20:30' }),
    ];
    // Day 1: Single continuous 1.0h shift in FT mode -> NO PT daily top-up
    fortnight.days[1].workBlocks = [makeBlock({ startTime: '09:00', endTime: '10:00' })];

    const res = calculateFortnight(fortnight, ftConfig);
    const brokenTopUps = res.days[0].lineItems.filter(
      (i) => i.code === 'BROKEN_MIN_PERIOD_TOPUP'
    );
    expect(brokenTopUps).toHaveLength(2);
    expect(brokenTopUps[0].units).toBe(1.0);
    expect(brokenTopUps[0].multiplier).toBe(1.0);
    expect(brokenTopUps[1].units).toBe(1.0);
    expect(brokenTopUps[1].multiplier).toBe(1.125);
    expect(res.days[0].autoDetectionMessages.some((m) => m.includes('Cl 18(e)(ii)(C)'))).toBe(
      true
    );

    // Day 1 FT single shift should NOT receive PT Cl 13(e) top-up
    expect(res.days[1].lineItems.find((i) => i.code === 'MIN_ENGAGEMENT_TOPUP')).toBeUndefined();
  });

  it('Handles CLIENT_CANCELLED protection (Cl 19(c)), Make-Up Hours Balance, and Guaranteed Hours Top-Up (Cl 13(c))', () => {
    const config: PayrollConfig = {
      ...DEFAULT_PAYROLL_CONFIG,
      employmentType: 'PT',
      contractedGuaranteedHours: 20,
    };
    const fortnight = createEmptyFortnight('2026-11-09');
    // Day 0: 8.0h worked + 4.0h client cancelled (no broken shift triggered by cancelled block!)
    fortnight.days[0].workBlocks = [
      makeBlock({ startTime: '08:00', endTime: '16:00', status: 'WORKED' }),
      makeBlock({
        startTime: '17:30',
        endTime: '21:30',
        status: 'CLIENT_CANCELLED',
        travelMinutes: 20,
        travelKms: 10,
      }),
    ];

    const res = calculateFortnight(fortnight, config);
    expect(res.days[0].brokenShiftPeriods).toBe(0); // Cancelled shift didn't cause physical broken shift
    expect(res.days[0].lineItems.find((i) => i.code === 'ALLOWANCE_MILEAGE')).toBeUndefined();
    expect(res.totalCancelledHours).toBe(4.0);
    expect(res.makeUpHoursBalance).toBe(4.0);
    expect(res.days[0].lineItems.find((i) => i.code === 'CLIENT_CANCELLED_ORDINARY')?.units).toBe(
      4.0
    );
    // Guaranteed = 20h; Worked 8h + Un-reassigned Cancelled 4h = 12h -> Shortfall Top-Up = 8.0h
    expect(res.guaranteedHoursShortfall).toBe(8.0);
    expect(res.groupedRows.find((r) => r.code === 'GUARANTEED_HOURS_TOPUP')?.units).toBe(8.0);

    // Now test with 2.0h of the cancelled hours reassigned as make-up work within the fortnight
    fortnight.days[1].workBlocks = [makeBlock({ startTime: '09:00', endTime: '11:00' })];
    fortnight.reassignedMakeUpHours = 2.0;
    const resReassigned = calculateFortnight(fortnight, config);
    expect(resReassigned.makeUpHoursBalance).toBe(2.0);
    // Worked (8 + 2 = 10h) + Un-reassigned Cancelled (2h) = 12h -> Shortfall still 8.0h
    expect(resReassigned.guaranteedHoursShortfall).toBe(8.0);
  });
});
