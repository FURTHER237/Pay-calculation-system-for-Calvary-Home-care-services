import {
  AuditFlag,
  BlockType,
  DayCalculationResult,
  DayRecord,
  DiscrepancyClauseHint,
  FortnightPeriod,
  PayCode,
  PayLineItem,
  PayrollConfig,
  PayslipResult,
  PayslipSummaryRow,
  WorkBlock,
} from '../types/payroll';
import { estimateFortnightlyPaygTax } from './tax';
import {
  formatDurationMinutes,
  formatMinutesToTime,
  resolveShiftMinutes,
  roundCurrency,
  roundHours,
} from './timeUtils';

interface AbsBlock {
  block: WorkBlock;
  dayIndex: number;
  startAbs: number;
  endAbs: number;
  rawHours: number;
  workedHours: number;
}

interface WorkPeriod {
  dayIndex: number;
  blocks: AbsBlock[];
  startAbs: number;
  endAbs: number;
  isBrokenShift: boolean;
  brokenSpanLimitAbs: number | null;
  inRestBreach: boolean;
  coupledSleepoverNightShift: boolean;
  isContiguousWithSleepover: boolean;
}

const PAY_CODE_META: Record<
  PayCode,
  {
    label: string;
    category: PayLineItem['category'];
    clauseRef: string;
    unitLabel: PayLineItem['unitLabel'];
    isOte: boolean;
    isTaxable: boolean;
  }
> = {
  BASE_ORDINARY: {
    label: 'Base Ordinary (100%)',
    category: 'ORDINARY',
    clauseRef: 'Clause 14 / 21(a)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  TRAVEL_ORDINARY: {
    label: 'Travel Time - Ordinary (100%)',
    category: 'ORDINARY',
    clauseRef: 'Clause 28(a)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  TRAVEL_AFTERNOON: {
    label: 'Travel Time - Afternoon (112.5%)',
    category: 'PENALTY',
    clauseRef: 'Clause 28(a) & 21(b)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  TRAVEL_NIGHT: {
    label: 'Travel Time - Night (115%)',
    category: 'PENALTY',
    clauseRef: 'Clause 28(a) & 21(b)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  TRAVEL_SATURDAY: {
    label: 'Travel Time - Saturday (150%)',
    category: 'PENALTY',
    clauseRef: 'Clause 28(a) & 22',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  TRAVEL_SUNDAY: {
    label: 'Travel Time - Sunday (200%)',
    category: 'PENALTY',
    clauseRef: 'Clause 28(a) & 22',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  TRAVEL_PH: {
    label: 'Travel Time - Public Holiday (250%)',
    category: 'PENALTY',
    clauseRef: 'Clause 28(a) & 29',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  AFTERNOON_SHIFT: {
    label: 'Afternoon Shift (112.5%)',
    category: 'PENALTY',
    clauseRef: 'Clause 21(b)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  NIGHT_SHIFT: {
    label: 'Night Shift (115%)',
    category: 'PENALTY',
    clauseRef: 'Clause 21(b)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  SATURDAY: {
    label: 'Saturday (150%)',
    category: 'PENALTY',
    clauseRef: 'Clause 22(a)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  SUNDAY: {
    label: 'Sunday (200%)',
    category: 'PENALTY',
    clauseRef: 'Clause 22(b)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  PUBLIC_HOLIDAY: {
    label: 'Public Holiday (250%)',
    category: 'PENALTY',
    clauseRef: 'Clause 29',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  OVERTIME_150: {
    label: 'Overtime T1.5 (150%)',
    category: 'OVERTIME',
    clauseRef: 'Clause 24',
    unitLabel: 'hrs',
    isOte: false,
    isTaxable: true,
  },
  OVERTIME_200: {
    label: 'Overtime T2.0 (200%)',
    category: 'OVERTIME',
    clauseRef: 'Clause 24',
    unitLabel: 'hrs',
    isOte: false,
    isTaxable: true,
  },
  OVERTIME_250: {
    label: 'Overtime Public Holiday (250%)',
    category: 'OVERTIME',
    clauseRef: 'Clause 24 & 29',
    unitLabel: 'hrs',
    isOte: false,
    isTaxable: true,
  },
  BROKEN_SHIFT_SPAN_200: {
    label: 'Broken Shift Outside 12h Span (200%)',
    category: 'PENALTY',
    clauseRef: 'Clause 18(e)(iv)',
    unitLabel: 'hrs',
    isOte: false,
    isTaxable: true,
  },
  BROKEN_SHIFT_SPAN_250: {
    label: 'Broken Shift >12h Span on PH (250%)',
    category: 'PENALTY',
    clauseRef: 'Clause 18(e)(iv) & 29',
    unitLabel: 'hrs',
    isOte: false,
    isTaxable: true,
  },
  REST_BREAK_BREACH_200: {
    label: '10-Hr Rest Breach (200%)',
    category: 'PENALTY',
    clauseRef: 'Clause 23',
    unitLabel: 'hrs',
    isOte: false,
    isTaxable: true,
  },
  REST_BREAK_BREACH_250: {
    label: '10-Hr Rest Breach on PH (250%)',
    category: 'PENALTY',
    clauseRef: 'Clause 23 & 29',
    unitLabel: 'hrs',
    isOte: false,
    isTaxable: true,
  },
  CARE_24HR_155: {
    label: '24-Hour Care Shift (8h @ 155%)',
    category: 'PENALTY',
    clauseRef: 'Clause 25(b)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  REMOTE_WORK: {
    label: 'Remote Work / Phone Response',
    category: 'ORDINARY',
    clauseRef: 'Clause 24(j) / Remote',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  MIN_ENGAGEMENT_TOPUP: {
    label: 'PT Min 2h Daily Engagement Top-Up (Cl 13(e))',
    category: 'TOPUP',
    clauseRef: 'Clause 13(e)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  BROKEN_MIN_PERIOD_TOPUP: {
    label: 'Broken Shift Min 2h Period Top-Up (Cl 18(e)(ii)(C))',
    category: 'TOPUP',
    clauseRef: 'Clause 18(e)(ii)(C)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  CLIENT_CANCELLED_ORDINARY: {
    label: 'Client Cancellation Protection (Cl 19(c))',
    category: 'TOPUP',
    clauseRef: 'Clause 19(c)(i)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  SLEEPOVER_4H_TOPUP: {
    label: 'Sleepover 4h Min Contiguous Top-Up',
    category: 'TOPUP',
    clauseRef: 'Clause 25(a)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  GUARANTEED_HOURS_TOPUP: {
    label: 'Guaranteed Hours Shortfall Top-Up (Cl 13(c))',
    category: 'TOPUP',
    clauseRef: 'Clause 13(c)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  PH_NOT_WORKED_ORDINARY: {
    label: 'Public Holiday Not Worked (Ordinary Rate 100%)',
    category: 'ORDINARY',
    clauseRef: 'Clause 29(f) & 30(b)(i)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  ANNUAL_LEAVE_BASE: {
    label: 'Annual Leave (Base 100%)',
    category: 'ORDINARY',
    clauseRef: 'Clause 29(h)(i)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  ANNUAL_LEAVE_LOADING_175: {
    label: 'Annual Leave Loading (17.5%)',
    category: 'PENALTY',
    clauseRef: 'Clause 29(h)(ii)',
    unitLabel: 'hrs',
    isOte: false,
    isTaxable: true,
  },
  ANNUAL_LEAVE_LOADING_PENALTY: {
    label: 'Annual Leave Loading (Shift/Weekend Penalty Equivalent - Higher Of Rule)',
    category: 'PENALTY',
    clauseRef: 'Clause 29(h)(ii)',
    unitLabel: 'hrs',
    isOte: false,
    isTaxable: true,
  },
  ANNUAL_LEAVE_CASHED_OUT_BASE: {
    label: 'Cashed Out Annual Leave (Base 100%)',
    category: 'TOPUP',
    clauseRef: 'Clause 29(j)',
    unitLabel: 'hrs',
    isOte: false,
    isTaxable: true,
  },
  ANNUAL_LEAVE_CASHED_OUT_LOADING: {
    label: 'Cashed Out Annual Leave Loading (17.5%)',
    category: 'PENALTY',
    clauseRef: 'Clause 29(j)',
    unitLabel: 'hrs',
    isOte: false,
    isTaxable: true,
  },
  ALLOWANCE_BROKEN_1: {
    label: 'Broken Shift Allowance (1 Unpaid Break)',
    category: 'ALLOWANCE',
    clauseRef: 'Clause 18(e)(ii)',
    unitLabel: 'shift',
    isOte: false,
    isTaxable: true,
  },
  ALLOWANCE_BROKEN_2: {
    label: 'Broken Shift Allowance (2 Unpaid Breaks)',
    category: 'ALLOWANCE',
    clauseRef: 'Clause 18(e)(iii)',
    unitLabel: 'shift',
    isOte: false,
    isTaxable: true,
  },
  ALLOWANCE_SLEEPOVER: {
    label: 'Sleepover Allowance',
    category: 'ALLOWANCE',
    clauseRef: 'Clause 25(a)',
    unitLabel: 'night',
    isOte: false,
    isTaxable: true,
  },
  ALLOWANCE_MILEAGE: {
    label: 'Vehicle / Mileage Allowance',
    category: 'ALLOWANCE',
    clauseRef: 'Clause 28(a)',
    unitLabel: 'km',
    isOte: false,
    isTaxable: false,
  },
  ALLOWANCE_ONCALL_WEEKDAY: {
    label: 'On-Call Allowance (Weekday)',
    category: 'ALLOWANCE',
    clauseRef: 'Clause 24(h)',
    unitLabel: 'day',
    isOte: false,
    isTaxable: true,
  },
  ALLOWANCE_ONCALL_WEEKEND_PH: {
    label: 'On-Call Allowance (Weekend / PH)',
    category: 'ALLOWANCE',
    clauseRef: 'Clause 24(h)',
    unitLabel: 'day',
    isOte: false,
    isTaxable: true,
  },
  ALLOWANCE_OT_MEAL: {
    label: 'Overtime Meal Allowance',
    category: 'ALLOWANCE',
    clauseRef: 'Clause 24(f)',
    unitLabel: 'meal',
    isOte: false,
    isTaxable: false,
  },
  ALLOWANCE_CLINICAL: {
    label: 'Clinical Assistance Allowance',
    category: 'ALLOWANCE',
    clauseRef: 'Clause 18(c)',
    unitLabel: 'hrs',
    isOte: true,
    isTaxable: true,
  },
  ALLOWANCE_UNIFORM: {
    label: 'Uniform Allowance (Weekly Capped)',
    category: 'ALLOWANCE',
    clauseRef: 'Clause 18(a)',
    unitLabel: 'shift',
    isOte: false,
    isTaxable: false,
  },
  ALLOWANCE_LAUNDRY: {
    label: 'Laundry Allowance (Weekly Capped)',
    category: 'ALLOWANCE',
    clauseRef: 'Clause 18(a)',
    unitLabel: 'shift',
    isOte: false,
    isTaxable: false,
  },
  ALLOWANCE_FIRST_AID: {
    label: 'First Aid Allowance',
    category: 'ALLOWANCE',
    clauseRef: 'Clause 18(b)',
    unitLabel: 'wk',
    isOte: true,
    isTaxable: true,
  },
};

function makeLineItem(
  id: string,
  code: PayCode,
  units: number,
  rate: number,
  multiplier: number,
  dayDate?: string,
  notes?: string,
  overrideLabel?: string
): PayLineItem {
  const meta = PAY_CODE_META[code];
  const roundedUnits = roundHours(units);
  const amount = roundCurrency(roundedUnits * rate * multiplier);
  return {
    id,
    code,
    label: overrideLabel ?? meta.label,
    category: meta.category,
    clauseRef: meta.clauseRef,
    units: roundedUnits,
    unitLabel: meta.unitLabel,
    rate,
    multiplier,
    amount,
    isOte: meta.isOte,
    isTaxable: meta.isTaxable,
    dayDate,
    notes,
  };
}

function isShiftOrTravel(blockType: BlockType): boolean {
  return blockType === 'REGULAR_CLIENT' || blockType === 'TRAVEL_BETWEEN_CLIENTS';
}

function isRestRelevant(blockType: BlockType): boolean {
  return (
    blockType === 'REGULAR_CLIENT' ||
    blockType === 'TRAVEL_BETWEEN_CLIENTS' ||
    blockType === 'CARE_24HR'
  );
}

/**
 * Splits [startAbs, endAbs] at every midnight (multiples of 1440) and optional spanLimitAbs.
 */
function splitInterval(
  startAbs: number,
  endAbs: number,
  extraSplitAbs?: number | null
): Array<{ startAbs: number; endAbs: number }> {
  const points = new Set<number>([startAbs, endAbs]);
  const firstMidnight = Math.floor(startAbs / 1440) * 1440 + 1440;
  for (let m = firstMidnight; m < endAbs; m += 1440) {
    points.add(m);
  }
  if (extraSplitAbs != null && extraSplitAbs > startAbs && extraSplitAbs < endAbs) {
    points.add(extraSplitAbs);
  }
  const sorted = Array.from(points).sort((a, b) => a - b);
  const slices: Array<{ startAbs: number; endAbs: number }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1] > sorted[i]) {
      slices.push({ startAbs: sorted[i], endAbs: sorted[i + 1] });
    }
  }
  return slices;
}

function getSliceDayInfo(
  sliceStartAbs: number,
  days: DayRecord[]
): { dayIndex: number; dayOfWeek: number; isPublicHoliday: boolean } {
  const dayIndex = Math.floor(sliceStartAbs / 1440);
  const clamped = Math.max(0, Math.min(days.length - 1, dayIndex));
  if (dayIndex >= 0 && dayIndex < days.length) {
    return {
      dayIndex,
      dayOfWeek: days[dayIndex].dayOfWeek,
      isPublicHoliday: days[dayIndex].isPublicHoliday,
    };
  }
  return {
    dayIndex: clamped,
    dayOfWeek: ((dayIndex % 7) + 7) % 7,
    isPublicHoliday: false,
  };
}

function getWeekdayShiftKind(period: WorkPeriod): 'ORDINARY' | 'AFTERNOON' | 'NIGHT' {
  if (period.coupledSleepoverNightShift) {
    return 'NIGHT';
  }
  const dayOrigin = period.dayIndex * 1440;
  const startInDay = period.startAbs - dayOrigin;
  const endInDay = period.endAbs - dayOrigin;

  const commencesBefore6am = startInDay < 360;
  const finishesAfterMidnight = endInDay > 1440;
  const finishesAfter8pm = endInDay > 1200 && endInDay <= 1440;

  // Rule 4.4 exception: broken shift pre-6am not contiguous with sleepover does NOT get 115%
  if (commencesBefore6am && period.isBrokenShift && !period.isContiguousWithSleepover) {
    if (finishesAfterMidnight) return 'NIGHT';
    if (finishesAfter8pm) return 'AFTERNOON';
    return 'ORDINARY';
  }

  if (finishesAfterMidnight || commencesBefore6am) {
    return 'NIGHT';
  }
  if (finishesAfter8pm) {
    return 'AFTERNOON';
  }
  return 'ORDINARY';
}

export function calculateFortnight(
  fortnight: FortnightPeriod,
  config: PayrollConfig
): PayslipResult {
  const days = fortnight.days;
  const allAbsBlocks: AbsBlock[] = [];
  const cancelledBlocksByDay = new Map<
    number,
    Array<{ block: WorkBlock; hours: number }>
  >();
  const annualLeaveBlocksByDay = new Map<number, AbsBlock[]>();
  let qualifying24HrShiftsCount = 0;

  for (let d = 0; d < days.length; d++) {
    const dayOrigin = d * 1440;
    for (const block of days[d].workBlocks) {
      const { startMin, endMin } = resolveShiftMinutes(block.startTime, block.endTime);
      const startAbs = dayOrigin + startMin;
      const endAbs = dayOrigin + endMin;
      const rawHours = (endAbs - startAbs) / 60;
      const unpaidBreakHours = (block.unpaidMealBreakMinutes || 0) / 60;
      const workedHours = Math.max(0, rawHours - unpaidBreakHours);

      if ((block.status ?? 'WORKED') === 'CLIENT_CANCELLED') {
        if (workedHours > 0) {
          const list = cancelledBlocksByDay.get(d) ?? [];
          list.push({ block, hours: workedHours });
          cancelledBlocksByDay.set(d, list);
        }
        continue;
      }

      if (block.blockType === 'ANNUAL_LEAVE') {
        if (workedHours > 0) {
          const list = annualLeaveBlocksByDay.get(d) ?? [];
          list.push({
            block,
            dayIndex: d,
            startAbs,
            endAbs,
            rawHours,
            workedHours,
          });
          annualLeaveBlocksByDay.set(d, list);
        }
        continue;
      }

      if (block.blockType === 'CARE_24HR') {
        qualifying24HrShiftsCount += 1;
      }

      allAbsBlocks.push({
        block,
        dayIndex: d,
        startAbs,
        endAbs,
        rawHours,
        workedHours,
      });

      // Pre-shift travel (minutes + seconds) occurring immediately before this shift
      const travelMins =
        Math.max(0, block.travelMinutes || 0) + Math.max(0, block.travelSeconds || 0) / 60;
      if (block.blockType === 'REGULAR_CLIENT' && travelMins > 0) {
        const travelStartAbs = Math.max(0, startAbs - travelMins);
        const travelRawHours = (startAbs - travelStartAbs) / 60;
        if (travelRawHours > 0) {
          allAbsBlocks.push({
            block: {
              ...block,
              id: `${block.id}__pretravel`,
              blockType: 'TRAVEL_BETWEEN_CLIENTS',
              startTime: formatMinutesToTime(travelStartAbs - dayOrigin),
              endTime: block.startTime,
              unpaidMealBreakMinutes: 0,
              paidClientMealMinutes: 0,
              hasClinicalAssistance: false,
              isRecallOvertime: false,
            },
            dayIndex: d,
            startAbs: travelStartAbs,
            endAbs: startAbs,
            rawHours: travelRawHours,
            workedHours: travelRawHours,
          });
        }
      }
    }
  }

  allAbsBlocks.sort((a, b) => a.startAbs - b.startAbs);

  // Step 1: Identify Sleepovers, contiguous pre/post work, 4h min rule, and Night Shift coupling
  const sleepoverBlocks = allAbsBlocks.filter((b) => b.block.blockType === 'SLEEPOVER');
  const shiftTravelBlocks = allAbsBlocks.filter((b) => isShiftOrTravel(b.block.blockType));

  const sleepoverCoupledIds = new Set<string>();
  const sleepoverContiguousIds = new Set<string>();
  const sleepoverTopUpsByDay = new Map<
    number,
    { topUpHours: number; preHours: number; postHours: number; sleepoverTime: string }
  >();

  for (const so of sleepoverBlocks) {
    // Chain backward contiguous blocks ending at so.startAbs (<= 5 min gap)
    const preChain: AbsBlock[] = [];
    let cursorStart = so.startAbs;
    for (let i = shiftTravelBlocks.length - 1; i >= 0; i--) {
      const candidate = shiftTravelBlocks[i];
      if (candidate.endAbs <= cursorStart && cursorStart - candidate.endAbs <= 5) {
        preChain.unshift(candidate);
        cursorStart = candidate.startAbs;
      }
    }

    // Chain forward contiguous blocks starting at so.endAbs (<= 5 min gap)
    const postChain: AbsBlock[] = [];
    let cursorEnd = so.endAbs;
    for (let i = 0; i < shiftTravelBlocks.length; i++) {
      const candidate = shiftTravelBlocks[i];
      if (candidate.startAbs >= cursorEnd && candidate.startAbs - cursorEnd <= 5) {
        postChain.push(candidate);
        cursorEnd = candidate.endAbs;
      }
    }

    for (const b of [...preChain, ...postChain]) {
      sleepoverContiguousIds.add(b.block.id);
    }

    const hasPre = preChain.some((b) => b.block.blockType === 'REGULAR_CLIENT');
    const hasPost = postChain.some((b) => b.block.blockType === 'REGULAR_CLIENT');

    if (hasPre && hasPost) {
      for (const b of [...preChain, ...postChain]) {
        sleepoverCoupledIds.add(b.block.id);
      }
    }

    const preHours = preChain
      .filter((b) => b.block.blockType === 'REGULAR_CLIENT')
      .reduce((sum, b) => sum + b.workedHours, 0);
    const postHours = postChain
      .filter((b) => b.block.blockType === 'REGULAR_CLIENT')
      .reduce((sum, b) => sum + b.workedHours, 0);
    const totalContiguous = preHours + postHours;

    if (totalContiguous < 4.0) {
      const existing = sleepoverTopUpsByDay.get(so.dayIndex);
      const topUp = 4.0 - totalContiguous;
      sleepoverTopUpsByDay.set(so.dayIndex, {
        topUpHours: (existing?.topUpHours ?? 0) + topUp,
        preHours,
        postHours,
        sleepoverTime: `${so.block.startTime}–${so.block.endTime}`,
      });
    }
  }

  // Step 2: Build Work Periods per day & Detect Broken Shifts (Rule 2) & Min 2h Engagement (Rule 1)
  const periodsByDay = new Map<number, WorkPeriod[]>();
  const minEngagementTopUpsByDay = new Map<
    number,
    Array<{
      kind: 'PT_DAILY' | 'BROKEN_PERIOD';
      topUpHours: number;
      startAbs: number;
      endAbs: number;
      period: WorkPeriod;
    }>
  >();

  for (let d = 0; d < days.length; d++) {
    const dayShiftBlocks = shiftTravelBlocks
      .filter((b) => b.dayIndex === d)
      .sort((a, b) => a.startAbs - b.startAbs);

    if (dayShiftBlocks.length === 0) {
      periodsByDay.set(d, []);
      continue;
    }

    // Group into distinct periods (gaps > 60 mins split into broken shift periods)
    const rawGroups: AbsBlock[][] = [[dayShiftBlocks[0]]];
    for (let i = 1; i < dayShiftBlocks.length; i++) {
      const prev = dayShiftBlocks[i - 1];
      const curr = dayShiftBlocks[i];
      const gapMins = curr.startAbs - prev.endAbs;
      if (gapMins > 60) {
        rawGroups.push([curr]);
      } else {
        rawGroups[rawGroups.length - 1].push(curr);
      }
    }

    const isBrokenShift = rawGroups.length >= 2;
    const firstStartAbs = rawGroups[0][0].startAbs;
    const brokenSpanLimitAbs = isBrokenShift ? firstStartAbs + 12 * 60 : null;

    const periods: WorkPeriod[] = rawGroups.map((group) => ({
      dayIndex: d,
      blocks: group,
      startAbs: group[0].startAbs,
      endAbs: Math.max(...group.map((b) => b.endAbs)),
      isBrokenShift,
      brokenSpanLimitAbs,
      inRestBreach: false,
      coupledSleepoverNightShift: group.some((b) => sleepoverCoupledIds.has(b.block.id)),
      isContiguousWithSleepover: group.some((b) => sleepoverContiguousIds.has(b.block.id)),
    }));

    periodsByDay.set(d, periods);

    const dayTopUps: Array<{
      kind: 'PT_DAILY' | 'BROKEN_PERIOD';
      topUpHours: number;
      startAbs: number;
      endAbs: number;
      period: WorkPeriod;
    }> = [];

    if (isBrokenShift) {
      // Rule 1.2 (Clause 18(e)(ii)(C)): Applies to BOTH FT & PT — each distinct period MUST be >= 2.0 hours
      for (const period of periods) {
        const hasRegular = period.blocks.some(
          (b) => b.block.blockType === 'REGULAR_CLIENT' && !b.block.isRecallOvertime
        );
        if (!hasRegular || period.isContiguousWithSleepover) continue;
        const periodWorked = period.blocks.reduce((s, b) => s + b.workedHours, 0);
        if (periodWorked > 0 && periodWorked < 2.0) {
          const lastBlock = period.blocks[period.blocks.length - 1];
          dayTopUps.push({
            kind: 'BROKEN_PERIOD',
            topUpHours: 2.0 - periodWorked,
            startAbs: lastBlock.startAbs,
            endAbs: lastBlock.endAbs,
            period,
          });
        }
      }
    } else if (config.employmentType === 'PT' && periods.length === 1) {
      // Rule 1.1 (Clause 13(e)): PT single continuous period < 2.0 hours
      const period = periods[0];
      const hasRegular = period.blocks.some(
        (b) => b.block.blockType === 'REGULAR_CLIENT' && !b.block.isRecallOvertime
      );
      if (hasRegular && !period.isContiguousWithSleepover) {
        const periodWorked = period.blocks.reduce((s, b) => s + b.workedHours, 0);
        if (periodWorked > 0 && periodWorked < 2.0) {
          const lastBlock = period.blocks[period.blocks.length - 1];
          dayTopUps.push({
            kind: 'PT_DAILY',
            topUpHours: 2.0 - periodWorked,
            startAbs: lastBlock.startAbs,
            endAbs: lastBlock.endAbs,
            period,
          });
        }
      }
    }

    if (dayTopUps.length > 0) {
      minEngagementTopUpsByDay.set(d, dayTopUps);
    }
  }

  // Step 3: 10-Hour Rest Break Between Shifts (Rule 3)
  const restBreachGapByDay = new Map<number, { gapHours: number; requiredHours: number }>();
  let prevRestEndAbs: number | null = null;
  let prevDayHadSleepover = false;

  for (let d = 0; d < days.length; d++) {
    const dayRelevant = allAbsBlocks.filter(
      (b) => b.dayIndex === d && isRestRelevant(b.block.blockType)
    );
    const dayHasSleepover = allAbsBlocks.some(
      (b) => b.dayIndex === d && b.block.blockType === 'SLEEPOVER'
    );

    if (dayRelevant.length > 0 && prevRestEndAbs !== null) {
      const firstStartAbs = dayRelevant[0].startAbs;
      const gapMins = firstStartAbs - prevRestEndAbs;
      const requiredMins = prevDayHadSleepover || dayHasSleepover ? 480 : 600;

      if (gapMins >= 0 && gapMins < requiredMins) {
        restBreachGapByDay.set(d, {
          gapHours: roundHours(gapMins / 60),
          requiredHours: requiredMins / 60,
        });

        // Mark periods on Day d as inRestBreach until a >=10h (600m) release gap occurs
        const dayPeriods = periodsByDay.get(d) ?? [];
        let released = false;
        for (let i = 0; i < dayPeriods.length; i++) {
          if (i > 0) {
            const internalGap = dayPeriods[i].startAbs - dayPeriods[i - 1].endAbs;
            if (internalGap >= 600) {
              released = true;
            }
          }
          if (!released) {
            dayPeriods[i].inRestBreach = true;
          }
        }
      }
    }

    if (dayRelevant.length > 0) {
      prevRestEndAbs = Math.max(...dayRelevant.map((b) => b.endAbs));
      prevDayHadSleepover = dayHasSleepover;
    } else if (dayHasSleepover) {
      prevDayHadSleepover = true;
    }
  }

  // Step 4: Chronological Evaluation across Days 0..13
  let fortnightlyOrdinaryAccumulator = 0;
  let totalOrdinaryAndTravelHours = 0;
  let totalWorkedHours = 0;
  let totalOvertimeHours = 0;
  let totalCancelledHours = 0;
  let remainingReassignedMakeUp = Math.max(0, fortnight.reassignedMakeUpHours || 0);
  let annualLeaveHoursTaken = 0;
  let annualLeaveHoursSavedByPh = 0;
  let annualLeaveLoadingOption2Raw = 0;

  const dailyOvertimeUsed = new Array<number>(14).fill(0);
  const dailyClientOrdinaryUsed = new Array<number>(14).fill(0);

  const dayResults: DayCalculationResult[] = [];
  const allLineItems: PayLineItem[] = [];

  // Track weekly totals for Uniform, Laundry, First Aid caps
  const weekWorkedHours = [0, 0];
  const weekHasAnnualLeave = [false, false];
  const weekHasPhysicalWorked = [false, false];
  const weekUniformClaims: Array<{ dayIndex: number; date: string; week: number }> = [];
  const weekLaundryClaims: Array<{ dayIndex: number; date: string; week: number }> = [];

  let lineSeq = 0;
  const nextId = (prefix: string) => `${prefix}-${++lineSeq}`;

  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    const weekIdx = d < 7 ? 0 : 1;
    const dayLineItems: PayLineItem[] = [];
    const badges: string[] = [];
    const autoDetectionMessages: string[] = [];
    const flags: AuditFlag[] = [];

    const dayPeriods = periodsByDay.get(d) ?? [];

    // Daily FT rostered ordinary hours cap
    const ftRosteredSum = day.workBlocks
      .filter((b) => b.blockType === 'REGULAR_CLIENT')
      .reduce((s, b) => s + (b.rosteredHours || 0), 0);
    const dailyOrdinaryCap =
      config.employmentType === 'FT' && ftRosteredSum > 0 ? Math.min(10.0, ftRosteredSum) : 10.0;

    let dayWorkedHours = 0;
    let dayOrdinaryNonTravelHours = 0;
    let dayTravelHours = 0;
    let dayOvertimeHours = 0;

    // Broken Shift badge & allowance
    let brokenShiftPeriods = 0;
    let brokenShiftUnpaidBreaks = 0;
    let brokenShiftSpanHours = 0;

    if (dayPeriods.length >= 2) {
      brokenShiftPeriods = dayPeriods.length;
      brokenShiftUnpaidBreaks = Math.min(2, dayPeriods.length - 1);
      const firstStart = dayPeriods[0].startAbs;
      const lastEnd = dayPeriods[dayPeriods.length - 1].endAbs;
      brokenShiftSpanHours = roundHours((lastEnd - firstStart) / 60);

      badges.push(
        brokenShiftUnpaidBreaks === 1 ? 'Broken Shift (1 Break)' : 'Broken Shift (2 Breaks)'
      );

      const totalGapMins = dayPeriods.reduce((acc, p, idx) => {
        if (idx === 0) return 0;
        return acc + (p.startAbs - dayPeriods[idx - 1].endAbs);
      }, 0);

      const allowanceCode: PayCode =
        brokenShiftUnpaidBreaks === 1 ? 'ALLOWANCE_BROKEN_1' : 'ALLOWANCE_BROKEN_2';
      const allowanceRate =
        brokenShiftUnpaidBreaks === 1
          ? config.allowances.brokenShift1Break
          : config.allowances.brokenShift2Breaks;

      dayLineItems.push(
        makeLineItem(nextId('bs'), allowanceCode, 1, allowanceRate, 1, day.date)
      );
      autoDetectionMessages.push(
        `Broken Shift detected (${brokenShiftPeriods} work periods, ${brokenShiftUnpaidBreaks} unpaid break${
          brokenShiftUnpaidBreaks > 1 ? 's' : ''
        } totalling ${formatDurationMinutes(totalGapMins)}) -> +$${allowanceRate.toFixed(2)} allowance.`
      );

      if (brokenShiftSpanHours > 12.0) {
        badges.push('>12h Span (200%)');
        flags.push({
          severity: 'warning',
          title: 'Broken Shift >12-Hour Span Exceeded',
          detail: `Total span is ${brokenShiftSpanHours.toFixed(
            2
          )}h (from ${formatMinutesToTime(firstStart - d * 1440)}). Work beyond 12 hours (${formatMinutesToTime(
            firstStart + 720 - d * 1440
          )}) is paid at ${day.isPublicHoliday ? '250%' : '200%'}.`,
          clauseRef: 'Clause 18(e)(iv)',
        });
      }
    }

    // Rest break breach banner
    const restBreach = restBreachGapByDay.get(d);
    if (restBreach) {
      badges.push('10h Rest Breach');
      flags.push({
        severity: 'alert',
        title: `${restBreach.requiredHours}-Hour Rest Break Breach`,
        detail: `Only ${restBreach.gapHours.toFixed(
          2
        )}h rest after previous day's shift (required ${restBreach.requiredHours}h). Ordinary shifts paid at ${
          day.isPublicHoliday ? '250%' : '200%'
        } until released for 10h rest.`,
        clauseRef: 'Clause 23',
      });
      autoDetectionMessages.push(
        `Rest Break Breach: ${restBreach.gapHours.toFixed(
          1
        )}h gap (< ${restBreach.requiredHours}h required) -> shift paid at ${
          day.isPublicHoliday ? '250%' : '200%'
        }.`
      );
    }

    // Helper to add Overtime hours for a specific sliceDayIndex using daily 2h T1.5 / T2.0 progression
    const pushOvertimeSlice = (sliceDayIndex: number, hours: number, note?: string) => {
      if (hours <= 0) return;
      const sliceDay = days[Math.max(0, Math.min(days.length - 1, sliceDayIndex))];
      const sliceDate = sliceDay?.date ?? day.date;
      const isPh = sliceDay?.isPublicHoliday ?? false;
      const dow = sliceDay ? sliceDay.dayOfWeek : ((sliceDayIndex % 7) + 7) % 7;

      if (isPh) {
        dayLineItems.push(
          makeLineItem(nextId('ot'), 'OVERTIME_250', hours, config.ordinaryRate, 2.5, sliceDate, note)
        );
      } else if (dow === 6) {
        dayLineItems.push(
          makeLineItem(nextId('ot'), 'OVERTIME_200', hours, config.ordinaryRate, 2.0, sliceDate, note)
        );
      } else {
        const usedOt = dailyOvertimeUsed[Math.min(13, Math.max(0, sliceDayIndex))];
        const remT15 = Math.max(0, 2.0 - usedOt);
        const t15Hours = Math.min(hours, remT15);
        const t20Hours = hours - t15Hours;
        if (t15Hours > 0) {
          dayLineItems.push(
            makeLineItem(
              nextId('ot15'),
              'OVERTIME_150',
              t15Hours,
              config.ordinaryRate,
              1.5,
              sliceDate,
              note
            )
          );
        }
        if (t20Hours > 0) {
          dayLineItems.push(
            makeLineItem(
              nextId('ot20'),
              'OVERTIME_200',
              t20Hours,
              config.ordinaryRate,
              2.0,
              sliceDate,
              note
            )
          );
        }
      }

      const idxClamped = Math.min(13, Math.max(0, sliceDayIndex));
      dailyOvertimeUsed[idxClamped] += hours;
      dayOvertimeHours += hours;
      totalOvertimeHours += hours;
    };

    // Process REGULAR_CLIENT & TRAVEL_BETWEEN_CLIENTS via periods
    for (const period of dayPeriods) {
      const weekdayShiftKind = getWeekdayShiftKind(period);
      const dayOrigin = d * 1440;
      const periodPre6amBrokenCutoff =
        period.isBrokenShift &&
        !period.isContiguousWithSleepover &&
        period.startAbs - dayOrigin < 360
          ? dayOrigin + 360
          : null;

      for (const absBlock of period.blocks) {
        const { block, startAbs, endAbs, workedHours, rawHours } = absBlock;
        if (workedHours <= 0) continue;

        dayWorkedHours += workedHours;
        totalWorkedHours += workedHours;
        weekWorkedHours[weekIdx] += workedHours;

        // Clinical Assistance Allowance ($1.85/hr)
        if (block.hasClinicalAssistance) {
          dayLineItems.push(
            makeLineItem(
              nextId('clin'),
              'ALLOWANCE_CLINICAL',
              workedHours,
              config.allowances.clinicalAssistanceAllowance,
              1,
              day.date,
              `${block.startTime}–${block.endTime}`
            )
          );
        }

        // Recall Overtime override on REGULAR_CLIENT
        if (block.blockType === 'REGULAR_CLIENT' && block.isRecallOvertime) {
          const paidHours = Math.max(2.0, workedHours);
          if (paidHours > workedHours) {
            badges.push('Recall Min 2h');
            autoDetectionMessages.push(
              `Recall Overtime (${block.startTime}–${block.endTime}): minimum 2.0h OT applied.`
            );
          }
          pushOvertimeSlice(d, paidHours, 'Recall Overtime');
          continue;
        }

        // Split interval across midnight and 12h span cap (and pre-6am broken shift cutoff if any)
        const baseSlices = splitInterval(startAbs, endAbs, period.brokenSpanLimitAbs);
        const slices: Array<{ startAbs: number; endAbs: number }> = [];
        for (const s of baseSlices) {
          if (
            periodPre6amBrokenCutoff != null &&
            periodPre6amBrokenCutoff > s.startAbs &&
            periodPre6amBrokenCutoff < s.endAbs
          ) {
            slices.push({ startAbs: s.startAbs, endAbs: periodPre6amBrokenCutoff });
            slices.push({ startAbs: periodPre6amBrokenCutoff, endAbs: s.endAbs });
          } else {
            slices.push(s);
          }
        }

        // Conserve exact workedHours across slices proportionally
        let remainingPaidClientMeal =
          block.blockType === 'REGULAR_CLIENT'
            ? Math.min(workedHours, (block.paidClientMealMinutes || 0) / 60)
            : 0;

        for (const slice of slices) {
          const sliceRawHours = (slice.endAbs - slice.startAbs) / 60;
          const sliceHours = rawHours > 0 ? (sliceRawHours / rawHours) * workedHours : 0;
          if (sliceHours <= 0) continue;

          const { dayIndex: sliceDayIdx, dayOfWeek: sliceDow, isPublicHoliday: slicePh } =
            getSliceDayInfo(slice.startAbs, days);
          const sliceDate = days[sliceDayIdx]?.date ?? day.date;

          // Paid Client Meal Break portion at 100% Ordinary Rate (counts toward ordinary hours)
          let workingSliceHours = sliceHours;
          if (remainingPaidClientMeal > 0) {
            const mealPart = Math.min(workingSliceHours, remainingPaidClientMeal);
            remainingPaidClientMeal -= mealPart;
            workingSliceHours -= mealPart;

            dayLineItems.push(
              makeLineItem(
                nextId('pmeal'),
                'BASE_ORDINARY',
                mealPart,
                config.ordinaryRate,
                1.0,
                sliceDate,
                'Paid client meal period'
              )
            );
            dayOrdinaryNonTravelHours += mealPart;
            fortnightlyOrdinaryAccumulator += mealPart;
            totalOrdinaryAndTravelHours += mealPart;
            dailyClientOrdinaryUsed[d] += mealPart;
          }

          if (workingSliceHours <= 0) continue;

          // Travel Between Clients (Exempt from OT!)
          if (block.blockType === 'TRAVEL_BETWEEN_CLIENTS') {
            dayTravelHours += workingSliceHours;
            totalOrdinaryAndTravelHours += workingSliceHours;

            // If in rest breach, pay 200%/250%
            if (period.inRestBreach) {
              dayLineItems.push(
                makeLineItem(
                  nextId('trvrb'),
                  slicePh ? 'REST_BREAK_BREACH_250' : 'REST_BREAK_BREACH_200',
                  workingSliceHours,
                  config.ordinaryRate,
                  slicePh ? 2.5 : 2.0,
                  sliceDate,
                  'Travel during rest breach'
                )
              );
              continue;
            }

            let code: PayCode = 'TRAVEL_ORDINARY';
            let mult = 1.0;
            if (slicePh) {
              code = 'TRAVEL_PH';
              mult = 2.5;
            } else if (sliceDow === 6) {
              code = 'TRAVEL_SUNDAY';
              mult = 2.0;
            } else if (sliceDow === 5) {
              code = 'TRAVEL_SATURDAY';
              mult = 1.5;
            } else if (weekdayShiftKind === 'NIGHT') {
              code = 'TRAVEL_NIGHT';
              mult = 1.15;
            } else if (weekdayShiftKind === 'AFTERNOON') {
              code = 'TRAVEL_AFTERNOON';
              mult = 1.125;
            }
            dayLineItems.push(
              makeLineItem(
                nextId('trv'),
                code,
                workingSliceHours,
                config.ordinaryRate,
                mult,
                sliceDate,
                `${block.startTime}–${block.endTime}`
              )
            );
            continue;
          }

          // Regular Client: Pre-6am non-sleepover broken shift segment -> OT
          if (periodPre6amBrokenCutoff != null && slice.endAbs <= periodPre6amBrokenCutoff) {
            pushOvertimeSlice(sliceDayIdx, workingSliceHours, 'Broken shift pre-06:00 outside span');
            continue;
          }

          // Regular Client: Outside 12h Broken Shift Span -> 200% (or 250% PH)
          if (
            period.brokenSpanLimitAbs != null &&
            slice.startAbs >= period.brokenSpanLimitAbs
          ) {
            dayLineItems.push(
              makeLineItem(
                nextId('span'),
                slicePh ? 'BROKEN_SHIFT_SPAN_250' : 'BROKEN_SHIFT_SPAN_200',
                workingSliceHours,
                config.ordinaryRate,
                slicePh ? 2.5 : 2.0,
                sliceDate,
                `${formatMinutesToTime(slice.startAbs - d * 1440)}–${formatMinutesToTime(
                  slice.endAbs - d * 1440
                )}`
              )
            );
            continue;
          }

          // Regular Client: 10-Hour Rest Break Breach -> 200% (or 250% PH)
          if (period.inRestBreach) {
            dayLineItems.push(
              makeLineItem(
                nextId('rb'),
                slicePh ? 'REST_BREAK_BREACH_250' : 'REST_BREAK_BREACH_200',
                workingSliceHours,
                config.ordinaryRate,
                slicePh ? 2.5 : 2.0,
                sliceDate,
                `${block.startTime}–${block.endTime}`
              )
            );
            continue;
          }

          // Split between Ordinary (within daily <=10h/rostered and fortnightly <=76h) and Overtime
          const dailyOrdRem = Math.max(0, dailyOrdinaryCap - dailyClientOrdinaryUsed[d]);
          const fortOrdRem = Math.max(0, 76.0 - fortnightlyOrdinaryAccumulator);
          const ordPart = Math.min(workingSliceHours, dailyOrdRem, fortOrdRem);
          const otPart = workingSliceHours - ordPart;

          if (ordPart > 0) {
            dailyClientOrdinaryUsed[d] += ordPart;
            fortnightlyOrdinaryAccumulator += ordPart;
            dayOrdinaryNonTravelHours += ordPart;
            totalOrdinaryAndTravelHours += ordPart;

            let code: PayCode = 'BASE_ORDINARY';
            let mult = 1.0;
            if (slicePh) {
              code = 'PUBLIC_HOLIDAY';
              mult = 2.5;
            } else if (sliceDow === 6) {
              code = 'SUNDAY';
              mult = 2.0;
            } else if (sliceDow === 5) {
              code = 'SATURDAY';
              mult = 1.5;
            } else if (weekdayShiftKind === 'NIGHT') {
              code = 'NIGHT_SHIFT';
              mult = 1.15;
            } else if (weekdayShiftKind === 'AFTERNOON') {
              code = 'AFTERNOON_SHIFT';
              mult = 1.125;
            }

            dayLineItems.push(
              makeLineItem(
                nextId('ord'),
                code,
                ordPart,
                config.ordinaryRate,
                mult,
                sliceDate,
                `${block.startTime}–${block.endTime}`
              )
            );
          }

          if (otPart > 0) {
            const isFortnightlyOt = dailyOrdRem > otPart && fortOrdRem < workingSliceHours;
            pushOvertimeSlice(
              sliceDayIdx,
              otPart,
              isFortnightlyOt ? 'Fortnightly >76h OT' : 'Daily >10h/rostered OT'
            );
          }
        }
      }
    }

    // Min 2-Hour Engagement Top-Ups (Rule 1.1 PT Cl 13(e) & Rule 1.2 Broken Shift Period Cl 18(e)(ii)(C))
    const dayMinTopUps = minEngagementTopUpsByDay.get(d) ?? [];
    for (const topUp of dayMinTopUps) {
      const topUpHours = topUp.topUpHours;
      const { dayOfWeek: dow, isPublicHoliday: isPh } = getSliceDayInfo(topUp.startAbs, days);
      const weekdayShiftKind = getWeekdayShiftKind(topUp.period);
      const outsideBrokenSpan =
        topUp.period.brokenSpanLimitAbs != null &&
        topUp.endAbs >= topUp.period.brokenSpanLimitAbs;

      let mult = 1.0;
      if (isPh) mult = 2.5;
      else if (topUp.period.inRestBreach || outsideBrokenSpan) mult = 2.0;
      else if (dow === 6) mult = 2.0;
      else if (dow === 5) mult = 1.5;
      else if (weekdayShiftKind === 'NIGHT') mult = 1.15;
      else if (weekdayShiftKind === 'AFTERNOON') mult = 1.125;

      const isBrokenPeriodTopUp = topUp.kind === 'BROKEN_PERIOD';
      const topUpCode: PayCode = isBrokenPeriodTopUp
        ? 'BROKEN_MIN_PERIOD_TOPUP'
        : 'MIN_ENGAGEMENT_TOPUP';
      const topUpFlag = isBrokenPeriodTopUp
        ? 'Broken Shift Min 2h Period Top-Up (Cl 18(e)(ii)(C))'
        : 'PT Min 2h Daily Engagement Top-Up (Cl 13(e))';

      dayLineItems.push(
        makeLineItem(
          nextId('min2h'),
          topUpCode,
          topUpHours,
          config.ordinaryRate,
          mult,
          day.date,
          topUpFlag
        )
      );
      dayWorkedHours += topUpHours;
      totalWorkedHours += topUpHours;
      weekWorkedHours[weekIdx] += topUpHours;
      if (!topUp.period.inRestBreach && !outsideBrokenSpan) {
        dayOrdinaryNonTravelHours += topUpHours;
        fortnightlyOrdinaryAccumulator += topUpHours;
        totalOrdinaryAndTravelHours += topUpHours;
      }
      badges.push(isBrokenPeriodTopUp ? 'Broken Min 2h' : 'PT Min 2h');
      autoDetectionMessages.push(
        `${topUpFlag}: +${topUpHours.toFixed(2)}h added at ${(mult * 100)
          .toFixed(1)
          .replace(/\.0$/, '')}% rate.`
      );
    }

    // Rule 9.1–9.2: Client Cancellation Protection (Clause 19(c)(i))
    const dayCancelled = cancelledBlocksByDay.get(d) ?? [];
    for (const c of dayCancelled) {
      totalCancelledHours += c.hours;
      const reassignedOffset = Math.min(c.hours, remainingReassignedMakeUp);
      remainingReassignedMakeUp -= reassignedOffset;
      const protectedHours = roundHours(c.hours - reassignedOffset);

      if (protectedHours > 0) {
        dayLineItems.push(
          makeLineItem(
            nextId('canc'),
            'CLIENT_CANCELLED_ORDINARY',
            protectedHours,
            config.ordinaryRate,
            1.0,
            day.date,
            `${c.block.startTime}–${c.block.endTime} client cancelled (Make-Up Hours Balance)`
          )
        );
      }
      badges.push('Client Cancelled');
      autoDetectionMessages.push(
        `Client Cancellation (${c.block.startTime}–${c.block.endTime}, ${c.hours.toFixed(
          2
        )}h): counts toward Guaranteed Hours at 100% Ordinary Rate (Cl 19(c)(i))${
          reassignedOffset > 0 ? ` — ${reassignedOffset.toFixed(2)}h reassigned` : ''
        }.`
      );
    }

    // Rule A & Rule B: Annual Leave (Clause 29) & Public Holiday Override (Clause 29(f) & 30(b)(i))
    const dayAnnualLeaveBlocks = annualLeaveBlocksByDay.get(d) ?? [];
    for (const al of dayAnnualLeaveBlocks) {
      weekHasAnnualLeave[weekIdx] = true;
      const dayOrigin = d * 1440;
      const startInDay = al.startAbs - dayOrigin;
      const endInDay = al.endAbs - dayOrigin;
      const alSlices = splitInterval(al.startAbs, al.endAbs);

      for (const slice of alSlices) {
        const sliceHours =
          al.rawHours > 0
            ? (((slice.endAbs - slice.startAbs) / 60) / al.rawHours) * al.workedHours
            : 0;
        if (sliceHours <= 0) continue;

        const { dayOfWeek: sliceDow, isPublicHoliday: slicePh } = getSliceDayInfo(
          slice.startAbs,
          days
        );

        if (slicePh) {
          // Rule A: Public Holiday on Annual Leave -> 100% Ordinary Rate, 0h Leave Deducted
          dayLineItems.push(
            makeLineItem(
              nextId('phnl'),
              'PH_NOT_WORKED_ORDINARY',
              sliceHours,
              config.ordinaryRate,
              1.0,
              day.date,
              `Public Holiday on Annual Leave (${al.block.startTime}–${al.block.endTime}) — 0h Leave Deducted`
            )
          );
          annualLeaveHoursSavedByPh += sliceHours;
          totalOrdinaryAndTravelHours += sliceHours;
          badges.push('PH on Leave -> 100% Ord (0h Deducted)');
          autoDetectionMessages.push(
            `Public Holiday on Annual Leave -> Paid at 100% Ordinary Rate (0h Leave Deducted)`
          );
        } else {
          // Rule B: Valid Annual Leave Base (100%) + accumulate Option 2 Penalty Equivalent
          dayLineItems.push(
            makeLineItem(
              nextId('alb'),
              'ANNUAL_LEAVE_BASE',
              sliceHours,
              config.ordinaryRate,
              1.0,
              day.date,
              `Annual Leave (${al.block.startTime}–${al.block.endTime})`
            )
          );
          annualLeaveHoursTaken += sliceHours;
          totalOrdinaryAndTravelHours += sliceHours;

          let penaltyAdder = 0;
          if (sliceDow === 6) {
            penaltyAdder = 1.0; // Sunday +100%
          } else if (sliceDow === 5) {
            penaltyAdder = 0.5; // Saturday +50%
          } else if (endInDay > 1440 || startInDay < 360) {
            penaltyAdder = 0.15; // Mon-Fri Night +15%
          } else if (endInDay > 1200 && endInDay <= 1440) {
            penaltyAdder = 0.125; // Mon-Fri Afternoon +12.5%
          }
          annualLeaveLoadingOption2Raw += sliceHours * config.ordinaryRate * penaltyAdder;
          badges.push('Annual Leave');
        }
      }
    }

    // Sleepover Allowances & 4-Hour Top-Up
    const daySleepovers = allAbsBlocks.filter(
      (b) => b.dayIndex === d && b.block.blockType === 'SLEEPOVER'
    );
    for (const so of daySleepovers) {
      badges.push('Sleepover');
      dayLineItems.push(
        makeLineItem(
          nextId('so'),
          'ALLOWANCE_SLEEPOVER',
          1,
          config.allowances.sleepoverAllowance,
          1,
          day.date,
          `${so.block.startTime}–${so.block.endTime}`
        )
      );
      if (sleepoverCoupledIds.size > 0) {
        const hasCoupledPreOrPost = dayPeriods.some((p) => p.coupledSleepoverNightShift);
        if (hasCoupledPreOrPost) {
          autoDetectionMessages.push(
            `Sleepover coupling: work on both sides of sleepover treated as continuous Night Shift (115% Mon–Fri).`
          );
        }
      }
    }

    const soTopUp = sleepoverTopUpsByDay.get(d);
    if (soTopUp && soTopUp.topUpHours > 0) {
      dayLineItems.push(
        makeLineItem(
          nextId('so4h'),
          'SLEEPOVER_4H_TOPUP',
          soTopUp.topUpHours,
          config.ordinaryRate,
          1.0,
          day.date,
          `Contiguous work ${roundHours(soTopUp.preHours + soTopUp.postHours)}h < 4.0h`
        )
      );
      dayOrdinaryNonTravelHours += soTopUp.topUpHours;
      fortnightlyOrdinaryAccumulator += soTopUp.topUpHours;
      totalOrdinaryAndTravelHours += soTopUp.topUpHours;
      badges.push('Sleepover 4h Top-Up');
      autoDetectionMessages.push(
        `Sleepover 4h Rule (${soTopUp.sleepoverTime}): contiguous client work was ${(
          soTopUp.preHours + soTopUp.postHours
        ).toFixed(2)}h (< 4.0h) -> +${soTopUp.topUpHours.toFixed(2)}h top-up added.`
      );
    }

    // Active Work During Sleepover (min 1.0h OT, no 10h rest breach)
    const activeSleepoverBlocks = allAbsBlocks.filter(
      (b) => b.dayIndex === d && b.block.blockType === 'ACTIVE_WORK_DURING_SLEEPOVER'
    );
    for (const active of activeSleepoverBlocks) {
      const paidHours = Math.max(1.0, active.workedHours);
      dayWorkedHours += paidHours;
      totalWorkedHours += paidHours;
      weekWorkedHours[weekIdx] += paidHours;
      if (active.block.hasClinicalAssistance) {
        dayLineItems.push(
          makeLineItem(
            nextId('clin'),
            'ALLOWANCE_CLINICAL',
            paidHours,
            config.allowances.clinicalAssistanceAllowance,
            1,
            day.date
          )
        );
      }
      const { dayIndex: activeDayIdx } = getSliceDayInfo(active.startAbs, days);
      pushOvertimeSlice(
        activeDayIdx,
        paidHours,
        `Active work during sleepover (min 1.0h; actual ${active.workedHours.toFixed(2)}h)`
      );
      badges.push('Sleepover Active OT');
      autoDetectionMessages.push(
        `Active Work During Sleepover (${active.block.startTime}–${active.block.endTime}): paid ${paidHours.toFixed(
          2
        )}h at Overtime rate (min 1.0h floor).`
      );
    }

    // 24-Hour Care Shift (8h @ 155%, excess active hours > 8h as OT)
    const care24Blocks = allAbsBlocks.filter(
      (b) => b.dayIndex === d && b.block.blockType === 'CARE_24HR'
    );
    for (const c24 of care24Blocks) {
      const activeHours = c24.block.care24ActiveHours ?? 8.0;
      const baseHours = 8.0;
      const excessOt = Math.max(0, activeHours - 8.0);
      dayWorkedHours += activeHours;
      totalWorkedHours += activeHours;
      weekWorkedHours[weekIdx] += activeHours;
      dayOrdinaryNonTravelHours += baseHours;
      totalOrdinaryAndTravelHours += baseHours;
      fortnightlyOrdinaryAccumulator += baseHours;

      dayLineItems.push(
        makeLineItem(
          nextId('c24'),
          'CARE_24HR_155',
          baseHours,
          config.ordinaryRate,
          1.55,
          day.date,
          `${c24.block.startTime}–${c24.block.endTime} (8h @ 155%)`
        )
      );
      if (c24.block.hasClinicalAssistance) {
        dayLineItems.push(
          makeLineItem(
            nextId('clin'),
            'ALLOWANCE_CLINICAL',
            activeHours,
            config.allowances.clinicalAssistanceAllowance,
            1,
            day.date
          )
        );
      }
      if (excessOt > 0) {
        pushOvertimeSlice(d, excessOt, '24-Hour Care excess >8h active care');
      }
      badges.push('24h Care (155%)');
      autoDetectionMessages.push(
        `24-Hour Care Shift: 8.0h paid at 155%${
          excessOt > 0 ? ` + ${excessOt.toFixed(2)}h excess active care at Overtime` : ''
        }.`
      );
    }

    // Remote Work (min floors + 15m rounding + outside 06:00-20:00 or >10h/76h OT)
    const remoteBlocks = allAbsBlocks.filter(
      (b) => b.dayIndex === d && b.block.blockType === 'REMOTE_WORK'
    );
    for (const rem of remoteBlocks) {
      const ctx = rem.block.remoteContext;
      const minHours =
        ctx === 'ON_CALL_DAY_6AM_10PM' ? 0.25 : ctx === 'ON_CALL_NIGHT_10PM_6AM' ? 0.5 : 1.0;
      const roundedHours = Math.max(minHours, Math.ceil(rem.workedHours * 4) / 4);
      dayWorkedHours += roundedHours;
      totalWorkedHours += roundedHours;
      weekWorkedHours[weekIdx] += roundedHours;

      const dayOrigin = d * 1440;
      const startInDay = rem.startAbs - dayOrigin;
      const endInDay = rem.endAbs - dayOrigin;
      const withinDaySpan = startInDay >= 360 && endInDay <= 1200;

      if (day.isPublicHoliday) {
        dayLineItems.push(
          makeLineItem(
            nextId('rem'),
            'PUBLIC_HOLIDAY',
            roundedHours,
            config.ordinaryRate,
            2.5,
            day.date,
            `Remote Work (${roundedHours}h @ 250% PH)`
          )
        );
      } else if (day.dayOfWeek === 6) {
        dayLineItems.push(
          makeLineItem(
            nextId('rem'),
            'SUNDAY',
            roundedHours,
            config.ordinaryRate,
            2.0,
            day.date,
            `Remote Work (${roundedHours}h @ 200% Sun)`
          )
        );
      } else if (day.dayOfWeek === 5) {
        dayLineItems.push(
          makeLineItem(
            nextId('rem'),
            'SATURDAY',
            roundedHours,
            config.ordinaryRate,
            1.5,
            day.date,
            `Remote Work (${roundedHours}h @ 150% Sat)`
          )
        );
      } else {
        const dailyRem = Math.max(0, dailyOrdinaryCap - dailyClientOrdinaryUsed[d]);
        const fortRem = Math.max(0, 76.0 - fortnightlyOrdinaryAccumulator);
        if (withinDaySpan && dailyRem > 0 && fortRem > 0) {
          const ordPart = Math.min(roundedHours, dailyRem, fortRem);
          const otPart = roundedHours - ordPart;
          if (ordPart > 0) {
            dailyClientOrdinaryUsed[d] += ordPart;
            fortnightlyOrdinaryAccumulator += ordPart;
            dayOrdinaryNonTravelHours += ordPart;
            totalOrdinaryAndTravelHours += ordPart;
            dayLineItems.push(
              makeLineItem(
                nextId('rem'),
                'REMOTE_WORK',
                ordPart,
                config.ordinaryRate,
                1.0,
                day.date,
                `Remote Work (${ctx})`
              )
            );
          }
          if (otPart > 0) {
            pushOvertimeSlice(d, otPart, 'Remote Work >10h/76h OT');
          }
        } else {
          pushOvertimeSlice(d, roundedHours, 'Remote Work outside 06:00–20:00 or OT');
        }
      }
      badges.push('Remote Work');
      autoDetectionMessages.push(
        `Remote Work (${rem.block.startTime}–${rem.block.endTime}): paid ${roundedHours.toFixed(
          2
        )}h (min ${(minHours * 60).toFixed(0)}m, rounded up to 15m).`
      );
    }

    // Penalty / Weekend / PH badges
    if (day.isPublicHoliday && day.workBlocks.length > 0) {
      badges.push('PH 250%');
    } else if (day.dayOfWeek === 6 && day.workBlocks.length > 0) {
      badges.push('Sun 200%');
    } else if (day.dayOfWeek === 5 && day.workBlocks.length > 0) {
      badges.push('Sat 150%');
    } else if (
      dayLineItems.some((l) => l.code === 'AFTERNOON_SHIFT' || l.code === 'TRAVEL_AFTERNOON')
    ) {
      badges.push('Afternoon 112.5%');
    } else if (dayLineItems.some((l) => l.code === 'NIGHT_SHIFT' || l.code === 'TRAVEL_NIGHT')) {
      badges.push('Night 115%');
    }

    if (dayOvertimeHours > 0) {
      badges.push(`OT ${roundHours(dayOvertimeHours).toFixed(1)}h`);
    }

    // Rule 6.4: Overtime Meal Allowance (>1h -> 1x, >4h -> 2x + 20m paid rest break flag)
    let hasPaid20MinOtRestBreak = false;
    if (dayOvertimeHours > 1.0 && !day.waiveOtMealAllowance) {
      const mealCount = dayOvertimeHours > 4.0 ? 2 : 1;
      dayLineItems.push(
        makeLineItem(
          nextId('otmeal'),
          'ALLOWANCE_OT_MEAL',
          mealCount,
          config.allowances.overtimeMealAllowance,
          1,
          day.date,
          dayOvertimeHours > 4.0
            ? 'OT >4.0h: 2x meal allowance + paid 20m OT rest break'
            : 'OT >1.0h: 1x meal allowance'
        )
      );
      if (dayOvertimeHours > 4.0) {
        hasPaid20MinOtRestBreak = true;
        flags.push({
          severity: 'info',
          title: 'Paid 20-Minute OT Rest Break Entitled',
          detail: `Daily overtime (${dayOvertimeHours.toFixed(
            2
          )}h) exceeded 4.0 hours -> 2nd Overtime Meal Allowance (+$${config.allowances.overtimeMealAllowance.toFixed(
            2
          )}) and paid 20-minute OT rest break triggered.`,
          clauseRef: 'Clause 24(f)',
        });
      }
      autoDetectionMessages.push(
        `Overtime (${dayOvertimeHours.toFixed(2)}h) -> +${mealCount}x Overtime Meal Allowance ($${(
          mealCount * config.allowances.overtimeMealAllowance
        ).toFixed(2)}).`
      );
    }

    // On-Call Allowance
    if (day.onCallType === 'WEEKDAY') {
      badges.push('On-Call Wkday');
      dayLineItems.push(
        makeLineItem(
          nextId('oc'),
          'ALLOWANCE_ONCALL_WEEKDAY',
          1,
          config.allowances.onCallWeekday,
          1,
          day.date
        )
      );
    } else if (day.onCallType === 'WEEKEND_PH') {
      badges.push('On-Call Wkend/PH');
      dayLineItems.push(
        makeLineItem(
          nextId('oc'),
          'ALLOWANCE_ONCALL_WEEKEND_PH',
          1,
          config.allowances.onCallWeekendPh,
          1,
          day.date
        )
      );
    }

    // Mileage & Commute >25km Rule (Rule 8)
    const blockTravelKms = day.workBlocks.reduce(
      (sum, b) =>
        (b.status ?? 'WORKED') === 'CLIENT_CANCELLED'
          ? sum
          : sum + Math.max(0, b.travelKms || 0),
      0
    );
    const totalInterClientKms = Math.max(0, day.interClientKms || 0) + blockTravelKms;
    let eligibleMileageKms = totalInterClientKms;
    let commuteEligibleKms = 0;
    if ((day.commuteKmsFirstLast || 0) > 25 && dayWorkedHours > 0 && dayWorkedHours < 3.0) {
      commuteEligibleKms = day.commuteKmsFirstLast - 25;
      eligibleMileageKms += commuteEligibleKms;
      autoDetectionMessages.push(
        `Commute >25km Rule: total engagement (${dayWorkedHours.toFixed(
          2
        )}h < 3.0h) -> ${commuteEligibleKms.toFixed(1)} km excess reimbursed.`
      );
    } else if ((day.commuteKmsFirstLast || 0) > 25 && dayWorkedHours >= 3.0) {
      flags.push({
        severity: 'info',
        title: 'Commute >25km Not Eligible',
        detail: `Total engagement on this day is ${dayWorkedHours.toFixed(
          2
        )}h (>= 3.0h), so first/last client commute kms are not reimbursed under Clause 28(a)(iv)(B).`,
        clauseRef: 'Clause 28(a)(iv)(B)',
      });
    }

    if (eligibleMileageKms > 0) {
      dayLineItems.push(
        makeLineItem(
          nextId('km'),
          'ALLOWANCE_MILEAGE',
          eligibleMileageKms,
          config.allowances.mileageRate,
          1,
          day.date,
          commuteEligibleKms > 0
            ? `${totalInterClientKms}km inter-client + ${commuteEligibleKms}km commute (>25km rule)`
            : `${totalInterClientKms}km inter-client`
        )
      );
    }

    // Track Uniform / Laundry claims (Rule D: Uniform payable on Annual Leave, Laundry excluded)
    const hasPhysicalWorkedOnDay = day.workBlocks.some(
      (b) => (b.status ?? 'WORKED') === 'WORKED' && b.blockType !== 'ANNUAL_LEAVE'
    );
    const hasUniformEligibleOnDay = day.workBlocks.some(
      (b) => (b.status ?? 'WORKED') === 'WORKED'
    );
    if (hasPhysicalWorkedOnDay) {
      weekHasPhysicalWorked[weekIdx] = true;
    }

    const effectiveUniformClaimed =
      day.uniformClaimed !== undefined ? day.uniformClaimed : hasUniformEligibleOnDay;
    const effectiveLaundryClaimed =
      day.laundryClaimed !== undefined ? day.laundryClaimed : hasPhysicalWorkedOnDay;

    if (effectiveUniformClaimed) {
      weekUniformClaims.push({ dayIndex: d, date: day.date, week: weekIdx });
    }
    if (effectiveLaundryClaimed) {
      weekLaundryClaims.push({ dayIndex: d, date: day.date, week: weekIdx });
    }

    // Deduplicate badges cleanly
    const uniqueBadges = Array.from(new Set(badges));

    dayResults.push({
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      workedHours: roundHours(dayWorkedHours),
      ordinaryNonTravelHours: roundHours(dayOrdinaryNonTravelHours),
      travelHours: roundHours(dayTravelHours),
      overtimeHours: roundHours(dayOvertimeHours),
      brokenShiftPeriods,
      brokenShiftUnpaidBreaks,
      brokenShiftSpanHours,
      hasRestBreakBreach: Boolean(restBreach),
      restGapHours: restBreach ? restBreach.gapHours : null,
      hasPaid20MinOtRestBreak,
      badges: uniqueBadges,
      autoDetectionMessages,
      flags,
      lineItems: dayLineItems,
      grossPay: roundCurrency(dayLineItems.reduce((s, l) => s + l.amount, 0)),
      effectiveUniformClaimed,
      effectiveLaundryClaimed,
    });

    allLineItems.push(...dayLineItems);
  }

  // Step 5: Weekly Uniform & Laundry Caps + First Aid Allowance
  for (const wk of [0, 1]) {
    const uClaims = weekUniformClaims.filter((c) => c.week === wk);
    const usePrior4WeekAvg =
      config.prior4WeekAverageUniformAllowance > 0 &&
      weekHasAnnualLeave[wk] &&
      !weekHasPhysicalWorked[wk];

    if (usePrior4WeekAvg) {
      const avgAmt = roundCurrency(
        Math.min(config.allowances.uniformWeeklyCap, config.prior4WeekAverageUniformAllowance)
      );
      if (avgAmt > 0) {
        const targetDayIndex = uClaims[0]?.dayIndex ?? wk * 7;
        const item = makeLineItem(
          nextId('uni'),
          'ALLOWANCE_UNIFORM',
          1,
          avgAmt,
          1,
          days[targetDayIndex]?.date,
          `Week ${wk + 1} 4-week preceding average during Annual Leave (Cl 28(c)(ii))`
        );
        dayResults[targetDayIndex].lineItems.push(item);
        dayResults[targetDayIndex].grossPay = roundCurrency(
          dayResults[targetDayIndex].grossPay + item.amount
        );
        allLineItems.push(item);
      }
    } else if (uClaims.length > 0 && config.allowances.uniformPerShift > 0) {
      const rawTotal = uClaims.length * config.allowances.uniformPerShift;
      const cappedTotal = Math.min(config.allowances.uniformWeeklyCap, rawTotal);
      const effectivePerShift = cappedTotal / uClaims.length;
      for (const claim of uClaims) {
        const item = makeLineItem(
          nextId('uni'),
          'ALLOWANCE_UNIFORM',
          1,
          roundCurrency(effectivePerShift),
          1,
          claim.date,
          rawTotal > config.allowances.uniformWeeklyCap
            ? `Week ${wk + 1} capped at $${config.allowances.uniformWeeklyCap.toFixed(2)}`
            : undefined
        );
        // Ensure exact weekly sum matches cap when capped
        dayResults[claim.dayIndex].lineItems.push(item);
        dayResults[claim.dayIndex].grossPay = roundCurrency(
          dayResults[claim.dayIndex].grossPay + item.amount
        );
        allLineItems.push(item);
      }
      // Adjust rounding cent on last day of week if capped
      if (rawTotal > config.allowances.uniformWeeklyCap) {
        const weekUniItems = allLineItems.filter(
          (i) => i.code === 'ALLOWANCE_UNIFORM' && uClaims.some((c) => c.date === i.dayDate)
        );
        const sumUni = roundCurrency(weekUniItems.reduce((s, i) => s + i.amount, 0));
        const diff = roundCurrency(config.allowances.uniformWeeklyCap - sumUni);
        if (diff !== 0 && weekUniItems.length > 0) {
          const lastItem = weekUniItems[weekUniItems.length - 1];
          lastItem.amount = roundCurrency(lastItem.amount + diff);
          const lastClaim = uClaims[uClaims.length - 1];
          dayResults[lastClaim.dayIndex].grossPay = roundCurrency(
            dayResults[lastClaim.dayIndex].grossPay + diff
          );
        }
      }
    }

    const lClaims = weekLaundryClaims.filter((c) => c.week === wk);
    if (lClaims.length > 0 && config.allowances.laundryPerShift > 0) {
      const rawTotal = lClaims.length * config.allowances.laundryPerShift;
      const cappedTotal = Math.min(config.allowances.laundryWeeklyCap, rawTotal);
      const effectivePerShift = cappedTotal / lClaims.length;
      for (const claim of lClaims) {
        const item = makeLineItem(
          nextId('lau'),
          'ALLOWANCE_LAUNDRY',
          1,
          roundCurrency(effectivePerShift),
          1,
          claim.date,
          rawTotal > config.allowances.laundryWeeklyCap
            ? `Week ${wk + 1} capped at $${config.allowances.laundryWeeklyCap.toFixed(2)}`
            : undefined
        );
        dayResults[claim.dayIndex].lineItems.push(item);
        dayResults[claim.dayIndex].grossPay = roundCurrency(
          dayResults[claim.dayIndex].grossPay + item.amount
        );
        allLineItems.push(item);
      }
      if (rawTotal > config.allowances.laundryWeeklyCap) {
        const weekLauItems = allLineItems.filter(
          (i) => i.code === 'ALLOWANCE_LAUNDRY' && lClaims.some((c) => c.date === i.dayDate)
        );
        const sumLau = roundCurrency(weekLauItems.reduce((s, i) => s + i.amount, 0));
        const diff = roundCurrency(config.allowances.laundryWeeklyCap - sumLau);
        if (diff !== 0 && weekLauItems.length > 0) {
          const lastItem = weekLauItems[weekLauItems.length - 1];
          lastItem.amount = roundCurrency(lastItem.amount + diff);
          const lastClaim = lClaims[lClaims.length - 1];
          dayResults[lastClaim.dayIndex].grossPay = roundCurrency(
            dayResults[lastClaim.dayIndex].grossPay + diff
          );
        }
      }
    }

    // First Aid Weekly Allowance
    if (config.firstAidEnabled && weekWorkedHours[wk] > 0) {
      const units =
        config.employmentType === 'FT' ? 1.0 : Math.min(1.0, weekWorkedHours[wk] / 38.0);
      allLineItems.push(
        makeLineItem(
          nextId('fa'),
          'ALLOWANCE_FIRST_AID',
          units,
          config.allowances.firstAidWeekly,
          1,
          days[wk * 7]?.date,
          config.employmentType === 'FT'
            ? `Week ${wk + 1} Full-Time flat`
            : `Week ${wk + 1} pro-rata (${weekWorkedHours[wk].toFixed(2)} / 38h)`
        )
      );
    }
  }

  // Step 5b: Annual Leave Loading ("Higher Of" Rule - Clause 29(h)) & Cashing Out (Clause 29(j))
  const annualLeaveLoadingOption1Amount = roundCurrency(
    annualLeaveHoursTaken * config.ordinaryRate * 0.175
  );
  const annualLeaveLoadingOption2Amount = roundCurrency(annualLeaveLoadingOption2Raw);
  let annualLeaveLoadingWinner: 'NONE' | 'LOADING_175' | 'PENALTY_EQUIVALENT' = 'NONE';

  if (annualLeaveHoursTaken > 0) {
    if (annualLeaveLoadingOption2Amount > annualLeaveLoadingOption1Amount) {
      annualLeaveLoadingWinner = 'PENALTY_EQUIVALENT';
      const effMult = roundHours(
        annualLeaveLoadingOption2Amount / (annualLeaveHoursTaken * config.ordinaryRate)
      );
      const loadingItem = makeLineItem(
        nextId('alload'),
        'ANNUAL_LEAVE_LOADING_PENALTY',
        annualLeaveHoursTaken,
        config.ordinaryRate,
        effMult,
        undefined,
        `Higher Of Rule: Shift/Weekend Penalties ($${annualLeaveLoadingOption2Amount.toFixed(
          2
        )}) > 17.5% Loading ($${annualLeaveLoadingOption1Amount.toFixed(2)})`
      );
      loadingItem.amount = annualLeaveLoadingOption2Amount;
      allLineItems.push(loadingItem);
    } else {
      annualLeaveLoadingWinner = 'LOADING_175';
      const loadingItem = makeLineItem(
        nextId('alload'),
        'ANNUAL_LEAVE_LOADING_175',
        annualLeaveHoursTaken,
        config.ordinaryRate,
        0.175,
        undefined,
        `Higher Of Rule: 17.5% Loading ($${annualLeaveLoadingOption1Amount.toFixed(
          2
        )}) >= Shift/Weekend Penalties ($${annualLeaveLoadingOption2Amount.toFixed(2)})`
      );
      loadingItem.amount = annualLeaveLoadingOption1Amount;
      allLineItems.push(loadingItem);
    }
  }

  const cashedOutAnnualLeaveHours = roundHours(
    Math.max(0, fortnight.cashedOutAnnualLeaveHours || 0)
  );
  if (cashedOutAnnualLeaveHours > 0) {
    allLineItems.push(
      makeLineItem(
        nextId('cashb'),
        'ANNUAL_LEAVE_CASHED_OUT_BASE',
        cashedOutAnnualLeaveHours,
        config.ordinaryRate,
        1.0,
        undefined,
        'Clause 29(j) Cashed Out Annual Leave (Base 100%)'
      )
    );
    allLineItems.push(
      makeLineItem(
        nextId('cashl'),
        'ANNUAL_LEAVE_CASHED_OUT_LOADING',
        cashedOutAnnualLeaveHours,
        config.ordinaryRate,
        0.175,
        undefined,
        'Clause 29(j) Cashed Out Annual Leave Loading (17.5%)'
      )
    );
  }

  // Step 6: Rule 9 - Guaranteed Hours Shortfall Top-Up (Clause 13(c) & 19(c))
  const reassignedMakeUpHours = roundHours(
    Math.min(totalCancelledHours, Math.max(0, fortnight.reassignedMakeUpHours || 0))
  );
  const makeUpHoursBalance = roundHours(Math.max(0, totalCancelledHours - reassignedMakeUpHours));
  const totalCountedTowardGuaranteed = roundHours(
    totalOrdinaryAndTravelHours + makeUpHoursBalance
  );
  const guaranteedTarget = Math.max(0, Math.min(76.0, config.contractedGuaranteedHours || 0));
  const guaranteedHoursShortfall = roundHours(
    Math.max(0, guaranteedTarget - totalCountedTowardGuaranteed)
  );
  if (guaranteedHoursShortfall > 0) {
    allLineItems.push(
      makeLineItem(
        nextId('guar'),
        'GUARANTEED_HOURS_TOPUP',
        guaranteedHoursShortfall,
        config.ordinaryRate,
        1.0,
        undefined,
        `Contracted ${guaranteedTarget.toFixed(2)}h - (Ord/Travel ${totalOrdinaryAndTravelHours.toFixed(
          2
        )}h + Un-reassigned Cancelled ${makeUpHoursBalance.toFixed(2)}h)`
      )
    );
  }

  // Step 7: Group Payslip Rows by PayCode + Multiplier + Rate
  const groupedMap = new Map<string, PayslipSummaryRow>();
  for (const item of allLineItems) {
    const key = `${item.code}|${item.multiplier}|${
      item.code === 'ALLOWANCE_UNIFORM' || item.code === 'ALLOWANCE_LAUNDRY'
        ? 'CAPPED'
        : item.rate
    }`;
    const existing = groupedMap.get(key);
    if (existing) {
      existing.units = roundHours(existing.units + item.units);
      existing.amount = roundCurrency(existing.amount + item.amount);
      if (existing.units > 0 && (item.code === 'ALLOWANCE_UNIFORM' || item.code === 'ALLOWANCE_LAUNDRY')) {
        existing.rate = roundCurrency(existing.amount / existing.units);
      }
    } else {
      groupedMap.set(key, {
        code: item.code,
        label: item.label,
        category: item.category,
        clauseRef: item.clauseRef,
        units: item.units,
        unitLabel: item.unitLabel,
        rate: item.rate,
        multiplier: item.multiplier,
        amount: item.amount,
        isOte: item.isOte,
        notes: item.notes,
      });
    }
  }

  const categoryOrder: Record<PayLineItem['category'], number> = {
    ORDINARY: 1,
    PENALTY: 2,
    OVERTIME: 3,
    TOPUP: 4,
    ALLOWANCE: 5,
  };

  const groupedRows = Array.from(groupedMap.values()).sort((a, b) => {
    const cDiff = categoryOrder[a.category] - categoryOrder[b.category];
    if (cDiff !== 0) return cDiff;
    return a.label.localeCompare(b.label);
  });

  // Totals
  const grossBaseAndPenaltyPay = roundCurrency(
    allLineItems
      .filter((i) => i.category === 'ORDINARY' || i.category === 'PENALTY' || i.category === 'TOPUP')
      .reduce((s, i) => s + i.amount, 0)
  );
  const grossOvertimePay = roundCurrency(
    allLineItems.filter((i) => i.category === 'OVERTIME').reduce((s, i) => s + i.amount, 0)
  );
  const totalAllowances = roundCurrency(
    allLineItems.filter((i) => i.category === 'ALLOWANCE').reduce((s, i) => s + i.amount, 0)
  );
  const taxableAllowances = roundCurrency(
    allLineItems
      .filter((i) => i.category === 'ALLOWANCE' && i.isTaxable)
      .reduce((s, i) => s + i.amount, 0)
  );
  const nonTaxableAllowances = roundCurrency(
    allLineItems
      .filter((i) => i.category === 'ALLOWANCE' && !i.isTaxable)
      .reduce((s, i) => s + i.amount, 0)
  );

  const totalGrossPay = roundCurrency(grossBaseAndPenaltyPay + grossOvertimePay + totalAllowances);
  const oteBase = roundCurrency(
    allLineItems.filter((i) => i.isOte).reduce((s, i) => s + i.amount, 0)
  );
  const superannuation = roundCurrency(oteBase * config.superRate);

  const taxableGross = roundCurrency(
    allLineItems.filter((i) => i.isTaxable).reduce((s, i) => s + i.amount, 0)
  );
  const estimatedTaxWithheld = estimateFortnightlyPaygTax(
    taxableGross,
    config.claimTaxFreeThreshold
  );
  const estimatedNetPay = roundCurrency(totalGrossPay - estimatedTaxWithheld);

  const week1Gross = roundCurrency(dayResults.slice(0, 7).reduce((s, r) => s + r.grossPay, 0));
  const week2Gross = roundCurrency(dayResults.slice(7, 14).reduce((s, r) => s + r.grossPay, 0));

  // Build Discrepancy Checker Hints (key EA clauses triggered in this fortnight)
  const discrepancyHints: DiscrepancyClauseHint[] = [];
  const sumByCodes = (codes: PayCode[]) =>
    roundCurrency(
      allLineItems.filter((i) => codes.includes(i.code)).reduce((s, i) => s + i.amount, 0)
    );

  const brokenAllowAmt = sumByCodes(['ALLOWANCE_BROKEN_1', 'ALLOWANCE_BROKEN_2']);
  const brokenSpanAmt = sumByCodes(['BROKEN_SHIFT_SPAN_200', 'BROKEN_SHIFT_SPAN_250']);
  if (brokenAllowAmt + brokenSpanAmt > 0) {
    discrepancyHints.push({
      clauseRef: 'Clause 18(e)',
      title: 'Broken Shift Allowance & >12h Span Penalty',
      estimatedAmount: roundCurrency(brokenAllowAmt + brokenSpanAmt),
      explanation: `Includes $${brokenAllowAmt.toFixed(2)} broken shift allowances and $${brokenSpanAmt.toFixed(
        2
      )} for hours outside the 12-hour span.`,
    });
  }

  const restBreachAmt = sumByCodes(['REST_BREAK_BREACH_200', 'REST_BREAK_BREACH_250']);
  if (restBreachAmt > 0) {
    // Delta vs 100% ordinary rate is ~50% of the 200% payment
    const halfDelta = roundCurrency(restBreachAmt * 0.5);
    discrepancyHints.push({
      clauseRef: 'Clause 23',
      title: '10-Hour Rest Break Breach (200% vs 100%)',
      estimatedAmount: halfDelta,
      explanation: `Employer systems often pay rest-breaching shifts at 100% instead of 200% Double Time (variance ~$${halfDelta.toFixed(
        2
      )}).`,
    });
  }

  const travelAmt = sumByCodes([
    'TRAVEL_ORDINARY',
    'TRAVEL_AFTERNOON',
    'TRAVEL_NIGHT',
    'TRAVEL_SATURDAY',
    'TRAVEL_SUNDAY',
    'TRAVEL_PH',
  ]);
  const mileageAmt = sumByCodes(['ALLOWANCE_MILEAGE']);
  if (travelAmt + mileageAmt > 0) {
    discrepancyHints.push({
      clauseRef: 'Clause 28(a)',
      title: 'Inter-Client Travel Time & Kilometre Allowance',
      estimatedAmount: roundCurrency(travelAmt + mileageAmt),
      explanation: `Paid travel time ($${travelAmt.toFixed(2)}) and vehicle allowance ($${mileageAmt.toFixed(
        2
      )}) are commonly omitted or misclassified.`,
    });
  }

  const shiftPenaltyAmt = sumByCodes(['AFTERNOON_SHIFT', 'NIGHT_SHIFT']);
  if (shiftPenaltyAmt > 0) {
    discrepancyHints.push({
      clauseRef: 'Clause 21(b)',
      title: 'Afternoon (112.5%) & Night (115%) Shift Penalties',
      estimatedAmount: shiftPenaltyAmt,
      explanation: `Applies to the entire shift/broken period when finishing after 20:00 (112.5%) or past midnight / starting before 06:00 (115%).`,
    });
  }

  if (grossOvertimePay > 0) {
    const otMealAmt = sumByCodes(['ALLOWANCE_OT_MEAL']);
    discrepancyHints.push({
      clauseRef: 'Clause 24',
      title: 'Daily/Fortnightly Overtime & Meal Allowances',
      estimatedAmount: roundCurrency(grossOvertimePay + otMealAmt),
      explanation: `Overtime pay ($${grossOvertimePay.toFixed(2)}) and OT meal allowances ($${otMealAmt.toFixed(
        2
      )}) triggered for >10h/day or >76h/fortnight.`,
    });
  }

  const topUpAmt = sumByCodes([
    'MIN_ENGAGEMENT_TOPUP',
    'BROKEN_MIN_PERIOD_TOPUP',
    'CLIENT_CANCELLED_ORDINARY',
    'SLEEPOVER_4H_TOPUP',
    'GUARANTEED_HOURS_TOPUP',
  ]);
  if (topUpAmt > 0) {
    discrepancyHints.push({
      clauseRef: 'Clause 13, 18(e), 19(c) & 25(a)',
      title: 'Minimum Engagement / Client Cancellation / Guaranteed Hours Top-Ups',
      estimatedAmount: topUpAmt,
      explanation: `Automatic floor top-ups & cancellation protection totalling $${topUpAmt.toFixed(2)}.`,
    });
  }

  // Rule F: Fortnightly Leave Accruals & Weekend Shiftworker Qualifier Tracker
  const ACCRUAL_ORD_CODES = new Set<PayCode>([
    'BASE_ORDINARY',
    'AFTERNOON_SHIFT',
    'NIGHT_SHIFT',
    'SATURDAY',
    'SUNDAY',
    'PUBLIC_HOLIDAY',
    'TRAVEL_ORDINARY',
    'TRAVEL_AFTERNOON',
    'TRAVEL_NIGHT',
    'TRAVEL_SATURDAY',
    'TRAVEL_SUNDAY',
    'TRAVEL_PH',
    'MIN_ENGAGEMENT_TOPUP',
    'BROKEN_MIN_PERIOD_TOPUP',
    'SLEEPOVER_4H_TOPUP',
    'CARE_24HR_155',
    'REMOTE_WORK',
    'ANNUAL_LEAVE_BASE',
    'PH_NOT_WORKED_ORDINARY',
  ]);

  const ordinaryTimeWorkedForAccrual = roundHours(
    allLineItems
      .filter((i) => ACCRUAL_ORD_CODES.has(i.code))
      .reduce((s, i) => s + i.units, 0)
  );

  const accrualStandardHours = roundHours(ordinaryTimeWorkedForAccrual * (152 / 1976));
  const accrualShiftworkerHours = roundHours(ordinaryTimeWorkedForAccrual * (190 / 1976));
  const accrualPersonalLeaveHours = roundHours(ordinaryTimeWorkedForAccrual * (76 / 1976));

  const WEEKEND_WORKED_CODES = new Set<PayCode>([
    'BASE_ORDINARY',
    'AFTERNOON_SHIFT',
    'NIGHT_SHIFT',
    'SATURDAY',
    'SUNDAY',
    'PUBLIC_HOLIDAY',
    'TRAVEL_ORDINARY',
    'TRAVEL_AFTERNOON',
    'TRAVEL_NIGHT',
    'TRAVEL_SATURDAY',
    'TRAVEL_SUNDAY',
    'TRAVEL_PH',
    'CARE_24HR_155',
    'MIN_ENGAGEMENT_TOPUP',
    'BROKEN_MIN_PERIOD_TOPUP',
  ]);
  const w1Dates = new Set([days[5]?.date, days[6]?.date]);
  const w2Dates = new Set([days[12]?.date, days[13]?.date]);
  let w1WeekendOrd = 0;
  let w2WeekendOrd = 0;
  for (const item of allLineItems) {
    if (!WEEKEND_WORKED_CODES.has(item.code) || !item.dayDate) continue;
    if (w1Dates.has(item.dayDate)) w1WeekendOrd += item.units;
    else if (w2Dates.has(item.dayDate)) w2WeekendOrd += item.units;
  }
  const qualifyingWeekendsWorked = (w1WeekendOrd > 4.0 ? 1 : 0) + (w2WeekendOrd > 4.0 ? 1 : 0);

  return {
    days: dayResults,
    lineItems: allLineItems,
    groupedRows,
    totalWorkedHours: roundHours(totalWorkedHours),
    totalOrdinaryAndTravelHours: roundHours(totalOrdinaryAndTravelHours),
    totalCancelledHours: roundHours(totalCancelledHours),
    reassignedMakeUpHours,
    makeUpHoursBalance,
    guaranteedHoursShortfall,
    totalOvertimeHours: roundHours(totalOvertimeHours),
    grossBaseAndPenaltyPay,
    grossOvertimePay,
    totalAllowances,
    taxableAllowances,
    nonTaxableAllowances,
    totalGrossPay,
    oteBase,
    superannuation,
    estimatedTaxWithheld,
    estimatedNetPay,
    week1Hours: roundHours(weekWorkedHours[0]),
    week2Hours: roundHours(weekWorkedHours[1]),
    week1Gross,
    week2Gross,
    annualLeaveHoursTaken: roundHours(annualLeaveHoursTaken),
    annualLeaveHoursSavedByPh: roundHours(annualLeaveHoursSavedByPh),
    annualLeaveLoadingOption1Amount,
    annualLeaveLoadingOption2Amount,
    annualLeaveLoadingWinner,
    cashedOutAnnualLeaveHours,
    ordinaryTimeWorkedForAccrual,
    accrualStandardHours,
    accrualShiftworkerHours,
    accrualPersonalLeaveHours,
    qualifyingWeekendsWorked,
    qualifying24HrShiftsCount,
    discrepancyHints,
  };
}

