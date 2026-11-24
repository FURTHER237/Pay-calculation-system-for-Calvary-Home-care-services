import {
  AuditCategoryCode,
  AuditDailyBreakdown,
  AuditExpectedExport,
  AuditLineItem,
  AuditPayPeriod,
  AuditUnitType,
  DayCalculationResult,
  FortnightPeriod,
  PayCode,
  PayLineItem,
  PayrollConfig,
} from '../types/payroll';
import { calculateFortnight } from './calculator';
import { DEFAULT_PAYROLL_CONFIG } from './constants';
import { roundCurrency, roundHours } from './timeUtils';

interface CanonicalCategoryMeta {
  categoryCode: AuditCategoryCode;
  label: string;
  eaClause: string;
  isTaxable: boolean;
  attractsSuper: boolean;
  unitType: AuditUnitType;
  order: number;
}

const CANONICAL_META: Record<AuditCategoryCode, CanonicalCategoryMeta> = {
  // A. Ordinary, Shift & Weekend Penalty Hours
  ORDINARY_100: {
    categoryCode: 'ORDINARY_100',
    label: 'Base Ordinary Hours (1.0x)',
    eaClause: 'Clause 13 / Clause 23',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 1,
  },
  TRAVEL_TIME_ORDINARY: {
    categoryCode: 'TRAVEL_TIME_ORDINARY',
    label: 'Inter-Client Travel Time at Base Rate (1.0x)',
    eaClause: 'Clause 28(a)(i)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 2,
  },
  TRAVEL_TIME_AFTERNOON: {
    categoryCode: 'TRAVEL_TIME_AFTERNOON',
    label: 'Inter-Client Travel Time on Afternoon Shift (1.125x)',
    eaClause: 'Clause 28(a)(i) & 21(b)(i)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 3,
  },
  TRAVEL_TIME_NIGHT: {
    categoryCode: 'TRAVEL_TIME_NIGHT',
    label: 'Inter-Client Travel Time on Night Shift (1.15x)',
    eaClause: 'Clause 28(a)(i) & 21(b)(ii)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 4,
  },
  TRAVEL_TIME_SATURDAY: {
    categoryCode: 'TRAVEL_TIME_SATURDAY',
    label: 'Inter-Client Travel Time on Saturday (1.5x)',
    eaClause: 'Clause 28(a)(i) & 21(c)(i)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 5,
  },
  TRAVEL_TIME_SUNDAY: {
    categoryCode: 'TRAVEL_TIME_SUNDAY',
    label: 'Inter-Client Travel Time on Sunday (2.0x)',
    eaClause: 'Clause 28(a)(i) & 21(c)(ii)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 6,
  },
  TRAVEL_TIME_PUBLIC_HOLIDAY: {
    categoryCode: 'TRAVEL_TIME_PUBLIC_HOLIDAY',
    label: 'Inter-Client Travel Time on Public Holiday (2.5x)',
    eaClause: 'Clause 28(a)(i) & 30(b)(ii)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 7,
  },
  AFTERNOON_112_5: {
    categoryCode: 'AFTERNOON_112_5',
    label: 'Afternoon Shift Ordinary Hours (1.125x)',
    eaClause: 'Clause 21(b)(i) / Clause 18(e)(ii)(E)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 8,
  },
  NIGHT_115: {
    categoryCode: 'NIGHT_115',
    label: 'Night Shift Ordinary Hours (1.15x)',
    eaClause: 'Clause 21(b)(ii)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 9,
  },
  SATURDAY_150: {
    categoryCode: 'SATURDAY_150',
    label: 'Saturday Ordinary Hours (1.5x)',
    eaClause: 'Clause 21(c)(i)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 10,
  },
  SUNDAY_200: {
    categoryCode: 'SUNDAY_200',
    label: 'Sunday Ordinary Hours (2.0x)',
    eaClause: 'Clause 21(c)(ii)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 11,
  },
  PUBLIC_HOLIDAY_250: {
    categoryCode: 'PUBLIC_HOLIDAY_250',
    label: 'Public Holiday Worked Hours (2.5x)',
    eaClause: 'Clause 30(b)(ii)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 12,
  },
  PUBLIC_HOLIDAY_NOT_WORKED_100: {
    categoryCode: 'PUBLIC_HOLIDAY_NOT_WORKED_100',
    label: 'Public Holiday Not Worked / Paid Absence (1.0x)',
    eaClause: 'Clause 30(b)(i)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 13,
  },
  MIN_ENGAGEMENT_TOPUP_2H: {
    categoryCode: 'MIN_ENGAGEMENT_TOPUP_2H',
    label: 'Minimum 2-Hour Engagement / Broken Shift Period Top-Up',
    eaClause: 'Clause 13(e) / Clause 18(e)(ii)(C)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 14,
  },
  GUARANTEED_HOURS_TOPUP: {
    categoryCode: 'GUARANTEED_HOURS_TOPUP',
    label: 'Contracted Fortnightly Guaranteed Hours Shortfall Top-Up',
    eaClause: 'Clause 13(c) / Clause 19(c)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 15,
  },
  CARE_24HR_155: {
    categoryCode: 'CARE_24HR_155',
    label: '24-Hour Care Shift (8h @ 1.55x)',
    eaClause: 'Clause 18(h)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 16,
  },

  // B. Overtime & Breach Penalties
  OVERTIME_150: {
    categoryCode: 'OVERTIME_150',
    label: 'Overtime First 2 Hours Mon–Sat (1.5x)',
    eaClause: 'Clause 20(b)',
    isTaxable: true,
    attractsSuper: false,
    unitType: 'HOURS',
    order: 17,
  },
  OVERTIME_200: {
    categoryCode: 'OVERTIME_200',
    label: 'Overtime After 2 Hours Mon–Sat / All Sunday OT (2.0x)',
    eaClause: 'Clause 20(b)',
    isTaxable: true,
    attractsSuper: false,
    unitType: 'HOURS',
    order: 18,
  },
  PUBLIC_HOLIDAY_OT_250: {
    categoryCode: 'PUBLIC_HOLIDAY_OT_250',
    label: 'Public Holiday Overtime (2.5x)',
    eaClause: 'Clause 20(b)',
    isTaxable: true,
    attractsSuper: false,
    unitType: 'HOURS',
    order: 19,
  },
  BROKEN_SHIFT_OUTSIDE_12H_200: {
    categoryCode: 'BROKEN_SHIFT_OUTSIDE_12H_200',
    label: 'Broken Shift Work Beyond 12-Hour Span (2.0x / 2.5x PH)',
    eaClause: 'Clause 18(e)(ii)(F)',
    isTaxable: true,
    attractsSuper: false,
    unitType: 'HOURS',
    order: 20,
  },
  REST_BREACH_200: {
    categoryCode: 'REST_BREACH_200',
    label: '10-Hour / 8-Hour Rest Break Breach Penalty (2.0x / 2.5x PH)',
    eaClause: 'Clause 18(f)(iv) / Clause 20(e)(iii)',
    isTaxable: true,
    attractsSuper: false,
    unitType: 'HOURS',
    order: 21,
  },

  // C. Leave
  ANNUAL_LEAVE_BASE: {
    categoryCode: 'ANNUAL_LEAVE_BASE',
    label: 'Annual Leave Base Ordinary Pay (1.0x)',
    eaClause: 'Clause 29(h)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 22,
  },
  ANNUAL_LEAVE_LOADING: {
    categoryCode: 'ANNUAL_LEAVE_LOADING',
    label: 'Annual Leave Loading (17.5% or Higher-Of Rostered Shift Penalties)',
    eaClause: 'Clause 29(h)(i)–(ii)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 23,
  },
  ANNUAL_LEAVE_CASHED_OUT: {
    categoryCode: 'ANNUAL_LEAVE_CASHED_OUT',
    label: 'Cashed Out Annual Leave (Base + Loading)',
    eaClause: 'Clause 29(j)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 24,
  },

  // D. Allowances & Reimbursements
  BROKEN_SHIFT_1_BREAK: {
    categoryCode: 'BROKEN_SHIFT_1_BREAK',
    label: 'Broken Shift Allowance (1 Unpaid Break)',
    eaClause: 'Clause 18(e)(ii)(A)',
    isTaxable: true,
    attractsSuper: false,
    unitType: 'SHIFTS',
    order: 25,
  },
  BROKEN_SHIFT_2_BREAKS: {
    categoryCode: 'BROKEN_SHIFT_2_BREAKS',
    label: 'Broken Shift Allowance (2 Unpaid Breaks)',
    eaClause: 'Clause 18(e)(ii)(B)',
    isTaxable: true,
    attractsSuper: false,
    unitType: 'SHIFTS',
    order: 26,
  },
  SLEEPOVER_ALLOWANCE: {
    categoryCode: 'SLEEPOVER_ALLOWANCE',
    label: 'Sleepover Allowance',
    eaClause: 'Clause 18(g)',
    isTaxable: true,
    attractsSuper: false,
    unitType: 'NIGHTS',
    order: 27,
  },
  MILEAGE_KM: {
    categoryCode: 'MILEAGE_KM',
    label: 'Private Vehicle Kilometre Reimbursement',
    eaClause: 'Clause 28(a)(iii)–(iv)',
    isTaxable: false,
    attractsSuper: false,
    unitType: 'KMS',
    order: 28,
  },
  ON_CALL_WEEKDAY: {
    categoryCode: 'ON_CALL_WEEKDAY',
    label: 'On-Call Allowance Mon–Fri',
    eaClause: 'Clause 28(b)(i)',
    isTaxable: true,
    attractsSuper: false,
    unitType: 'SHIFTS',
    order: 29,
  },
  ON_CALL_WEEKEND_PH: {
    categoryCode: 'ON_CALL_WEEKEND_PH',
    label: 'On-Call Allowance Sat/Sun/PH',
    eaClause: 'Clause 28(b)(ii)',
    isTaxable: true,
    attractsSuper: false,
    unitType: 'SHIFTS',
    order: 30,
  },
  UNIFORM_ALLOWANCE: {
    categoryCode: 'UNIFORM_ALLOWANCE',
    label: 'Uniform Allowance',
    eaClause: 'Clause 28(c)',
    isTaxable: true,
    attractsSuper: false,
    unitType: 'SHIFTS',
    order: 31,
  },
  LAUNDRY_ALLOWANCE: {
    categoryCode: 'LAUNDRY_ALLOWANCE',
    label: 'Laundry Allowance',
    eaClause: 'Clause 28(c)',
    isTaxable: true,
    attractsSuper: false,
    unitType: 'SHIFTS',
    order: 32,
  },
  FIRST_AID_ALLOWANCE: {
    categoryCode: 'FIRST_AID_ALLOWANCE',
    label: 'First Aid Allowance',
    eaClause: 'Clause 28(d)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'WEEKS',
    order: 33,
  },
  OT_MEAL_ALLOWANCE: {
    categoryCode: 'OT_MEAL_ALLOWANCE',
    label: 'Overtime Meal Allowance',
    eaClause: 'Clause 28(e)',
    isTaxable: false,
    attractsSuper: false,
    unitType: 'MEALS',
    order: 34,
  },
  CLINICAL_ASSISTANCE_ALLOWANCE: {
    categoryCode: 'CLINICAL_ASSISTANCE_ALLOWANCE',
    label: 'Clinical Assistance Allowance',
    eaClause: 'Clause 28(f)',
    isTaxable: true,
    attractsSuper: true,
    unitType: 'HOURS',
    order: 35,
  },

  // E. Superannuation
  SUPERANNUATION: {
    categoryCode: 'SUPERANNUATION',
    label: 'Employer Superannuation Guarantee Contribution',
    eaClause: 'Clause 26',
    isTaxable: false,
    attractsSuper: false,
    unitType: 'WEEKS',
    order: 36,
  },
};

const PAY_CODE_TO_CANONICAL: Record<PayCode, AuditCategoryCode> = {
  BASE_ORDINARY: 'ORDINARY_100',
  REMOTE_WORK: 'ORDINARY_100',
  CLIENT_CANCELLED_ORDINARY: 'ORDINARY_100',
  SLEEPOVER_4H_TOPUP: 'ORDINARY_100',
  TRAVEL_ORDINARY: 'TRAVEL_TIME_ORDINARY',
  TRAVEL_AFTERNOON: 'TRAVEL_TIME_AFTERNOON',
  TRAVEL_NIGHT: 'TRAVEL_TIME_NIGHT',
  TRAVEL_SATURDAY: 'TRAVEL_TIME_SATURDAY',
  TRAVEL_SUNDAY: 'TRAVEL_TIME_SUNDAY',
  TRAVEL_PH: 'TRAVEL_TIME_PUBLIC_HOLIDAY',
  AFTERNOON_SHIFT: 'AFTERNOON_112_5',
  NIGHT_SHIFT: 'NIGHT_115',
  SATURDAY: 'SATURDAY_150',
  SUNDAY: 'SUNDAY_200',
  PUBLIC_HOLIDAY: 'PUBLIC_HOLIDAY_250',
  PH_NOT_WORKED_ORDINARY: 'PUBLIC_HOLIDAY_NOT_WORKED_100',
  MIN_ENGAGEMENT_TOPUP: 'MIN_ENGAGEMENT_TOPUP_2H',
  BROKEN_MIN_PERIOD_TOPUP: 'MIN_ENGAGEMENT_TOPUP_2H',
  GUARANTEED_HOURS_TOPUP: 'GUARANTEED_HOURS_TOPUP',
  CARE_24HR_155: 'CARE_24HR_155',
  OVERTIME_150: 'OVERTIME_150',
  OVERTIME_200: 'OVERTIME_200',
  OVERTIME_250: 'PUBLIC_HOLIDAY_OT_250',
  BROKEN_SHIFT_SPAN_200: 'BROKEN_SHIFT_OUTSIDE_12H_200',
  BROKEN_SHIFT_SPAN_250: 'BROKEN_SHIFT_OUTSIDE_12H_200',
  REST_BREAK_BREACH_200: 'REST_BREACH_200',
  REST_BREAK_BREACH_250: 'REST_BREACH_200',
  ANNUAL_LEAVE_BASE: 'ANNUAL_LEAVE_BASE',
  ANNUAL_LEAVE_LOADING_175: 'ANNUAL_LEAVE_LOADING',
  ANNUAL_LEAVE_LOADING_PENALTY: 'ANNUAL_LEAVE_LOADING',
  ANNUAL_LEAVE_CASHED_OUT_BASE: 'ANNUAL_LEAVE_CASHED_OUT',
  ANNUAL_LEAVE_CASHED_OUT_LOADING: 'ANNUAL_LEAVE_CASHED_OUT',
  ALLOWANCE_BROKEN_1: 'BROKEN_SHIFT_1_BREAK',
  ALLOWANCE_BROKEN_2: 'BROKEN_SHIFT_2_BREAKS',
  ALLOWANCE_SLEEPOVER: 'SLEEPOVER_ALLOWANCE',
  ALLOWANCE_MILEAGE: 'MILEAGE_KM',
  ALLOWANCE_ONCALL_WEEKDAY: 'ON_CALL_WEEKDAY',
  ALLOWANCE_ONCALL_WEEKEND_PH: 'ON_CALL_WEEKEND_PH',
  ALLOWANCE_UNIFORM: 'UNIFORM_ALLOWANCE',
  ALLOWANCE_LAUNDRY: 'LAUNDRY_ALLOWANCE',
  ALLOWANCE_FIRST_AID: 'FIRST_AID_ALLOWANCE',
  ALLOWANCE_OT_MEAL: 'OT_MEAL_ALLOWANCE',
  ALLOWANCE_CLINICAL: 'CLINICAL_ASSISTANCE_ALLOWANCE',
};

const ORDINARY_HOUR_CATEGORIES = new Set<AuditCategoryCode>([
  'ORDINARY_100',
  'AFTERNOON_112_5',
  'NIGHT_115',
  'SATURDAY_150',
  'SUNDAY_200',
  'PUBLIC_HOLIDAY_250',
  'PUBLIC_HOLIDAY_NOT_WORKED_100',
  'MIN_ENGAGEMENT_TOPUP_2H',
  'GUARANTEED_HOURS_TOPUP',
  'CARE_24HR_155',
]);

const TRAVEL_HOUR_CATEGORIES = new Set<AuditCategoryCode>([
  'TRAVEL_TIME_ORDINARY',
  'TRAVEL_TIME_AFTERNOON',
  'TRAVEL_TIME_NIGHT',
  'TRAVEL_TIME_SATURDAY',
  'TRAVEL_TIME_SUNDAY',
  'TRAVEL_TIME_PUBLIC_HOLIDAY',
]);

const OVERTIME_HOUR_CATEGORIES = new Set<AuditCategoryCode>([
  'OVERTIME_150',
  'OVERTIME_200',
  'PUBLIC_HOLIDAY_OT_250',
  'BROKEN_SHIFT_OUTSIDE_12H_200',
  'REST_BREACH_200',
]);

const LEAVE_HOUR_CATEGORIES = new Set<AuditCategoryCode>([
  'ANNUAL_LEAVE_BASE',
  'ANNUAL_LEAVE_CASHED_OUT',
]);

function buildDynamicAuditNote(
  date: string,
  item: PayLineItem,
  dayCalc?: DayCalculationResult
): string {
  if (item.code === 'ALLOWANCE_BROKEN_1' || item.code === 'ALLOWANCE_BROKEN_2') {
    const brokenMsg = dayCalc?.autoDetectionMessages.find((m) =>
      m.toLowerCase().includes('broken shift detected')
    );
    if (brokenMsg) {
      return `${date}: ${brokenMsg}`;
    }
  }

  if (item.code === 'REST_BREAK_BREACH_200' || item.code === 'REST_BREAK_BREACH_250') {
    const restMsg = dayCalc?.autoDetectionMessages.find((m) =>
      m.toLowerCase().includes('rest break breach')
    );
    if (restMsg) {
      return `${date}: ${item.notes ? `${item.notes} — ` : ''}${restMsg}`;
    }
  }

  if (item.notes && item.notes.trim().length > 0) {
    return `${date}: ${item.label} (${item.notes.trim()})`;
  }

  return `${date}: ${item.label} (${roundHours(item.units)} ${item.unitLabel} @ $${item.rate.toFixed(
    2
  )} x ${item.multiplier})`;
}

function buildAuditPayPeriod(
  period: FortnightPeriod,
  config: PayrollConfig
): AuditPayPeriod {
  const payslip = calculateFortnight(period, config);
  const dayCalcByDate = new Map<string, DayCalculationResult>(
    payslip.days.map((d) => [d.date, d])
  );

  // Bucket raw PayLineItems by canonical categoryCode
  const itemsByCategory = new Map<AuditCategoryCode, PayLineItem[]>();
  for (const item of payslip.lineItems) {
    if (item.units <= 0 && item.amount <= 0) continue;
    const canonicalCode = PAY_CODE_TO_CANONICAL[item.code];
    const list = itemsByCategory.get(canonicalCode) ?? [];
    list.push(item);
    itemsByCategory.set(canonicalCode, list);
  }

  const earningsLineItems: AuditLineItem[] = [];

  for (const [categoryCode, rawItems] of itemsByCategory.entries()) {
    const meta = CANONICAL_META[categoryCode];

    // Special combination for Cashed Out Annual Leave (Base + Loading without double-counting hours)
    if (categoryCode === 'ANNUAL_LEAVE_CASHED_OUT') {
      const baseItems = rawItems.filter((i) => i.code === 'ANNUAL_LEAVE_CASHED_OUT_BASE');
      const loadItems = rawItems.filter((i) => i.code === 'ANNUAL_LEAVE_CASHED_OUT_LOADING');
      const units = roundHours(baseItems.reduce((s, i) => s + i.units, 0));
      const baseAmt = roundCurrency(baseItems.reduce((s, i) => s + i.amount, 0));
      const loadAmt = roundCurrency(loadItems.reduce((s, i) => s + i.amount, 0));
      const totalAmount = roundCurrency(baseAmt + loadAmt);
      if (units <= 0 && totalAmount <= 0) continue;

      const rate = config.ordinaryRate;
      const multiplier =
        units > 0 && rate > 0 ? roundHours(totalAmount / (units * rate)) : 1.175;
      const breakdownDate = period.endDate;
      const dailyBreakdown: AuditDailyBreakdown[] = [
        {
          date: breakdownDate,
          units,
          amount: totalAmount,
          auditNote: `${breakdownDate}: Cashed out ${units.toFixed(2)}h Annual Leave (Base 100% $${baseAmt.toFixed(
            2
          )} + 17.5% Loading $${loadAmt.toFixed(2)}) under Clause 29(j).`,
        },
      ];

      earningsLineItems.push({
        categoryCode,
        label: meta.label,
        eaClause: meta.eaClause,
        isTaxable: meta.isTaxable,
        attractsSuper: meta.attractsSuper,
        units,
        unitType: meta.unitType,
        rate,
        multiplier,
        totalAmount,
        dailyBreakdown,
      });
      continue;
    }

    // Group raw items by date for traceable dailyBreakdown
    const dailyMap = new Map<
      string,
      { units: number; amount: number; notes: string[] }
    >();

    for (const item of rawItems) {
      const date = item.dayDate ?? period.endDate;
      const note = buildDynamicAuditNote(date, item, dayCalcByDate.get(date));
      const entry = dailyMap.get(date);
      if (entry) {
        entry.units = roundHours(entry.units + item.units);
        entry.amount = roundCurrency(entry.amount + item.amount);
        if (!entry.notes.includes(note)) {
          entry.notes.push(note);
        }
      } else {
        dailyMap.set(date, {
          units: roundHours(item.units),
          amount: roundCurrency(item.amount),
          notes: [note],
        });
      }
    }

    const dailyBreakdown: AuditDailyBreakdown[] = Array.from(dailyMap.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, data]) => ({
        date,
        units: roundHours(data.units),
        amount: roundCurrency(data.amount),
        auditNote: data.notes.join(' | '),
      }));

    const units = roundHours(dailyBreakdown.reduce((s, d) => s + d.units, 0));
    const totalAmount = roundCurrency(dailyBreakdown.reduce((s, d) => s + d.amount, 0));
    if (units <= 0 && totalAmount <= 0) continue;

    // Determine dynamic unitType for Uniform/Laundry when weekly-average leave override applies
    let unitType: AuditUnitType = meta.unitType;
    if (
      categoryCode === 'UNIFORM_ALLOWANCE' &&
      rawItems.every((i) => i.notes?.toLowerCase().includes('4-week avg'))
    ) {
      unitType = 'WEEKS';
    }

    // Determine dynamic rate & multiplier preserving mathematical consistency
    const distinctRates = Array.from(new Set(rawItems.map((i) => i.rate)));
    const distinctMultipliers = Array.from(new Set(rawItems.map((i) => i.multiplier)));

    let rate: number;
    let multiplier: number;

    if (categoryCode === 'UNIFORM_ALLOWANCE' || categoryCode === 'LAUNDRY_ALLOWANCE') {
      rate = units > 0 ? roundCurrency(totalAmount / units) : rawItems[0].rate;
      multiplier = 1.0;
    } else if (distinctRates.length === 1 && distinctMultipliers.length === 1) {
      rate = distinctRates[0];
      multiplier = distinctMultipliers[0];
    } else if (distinctRates.length === 1) {
      rate = distinctRates[0];
      multiplier =
        units > 0 && rate > 0 ? roundHours(totalAmount / (units * rate)) : rawItems[0].multiplier;
    } else {
      rate = units > 0 ? roundCurrency(totalAmount / units) : rawItems[0].rate;
      multiplier = 1.0;
    }

    earningsLineItems.push({
      categoryCode,
      label: meta.label,
      eaClause: meta.eaClause,
      isTaxable: meta.isTaxable,
      attractsSuper: meta.attractsSuper,
      units,
      unitType,
      rate,
      multiplier,
      totalAmount,
      dailyBreakdown,
    });
  }

  // Sort earnings lineItems deterministically in canonical dictionary order
  earningsLineItems.sort(
    (a, b) => CANONICAL_META[a.categoryCode].order - CANONICAL_META[b.categoryCode].order
  );

  // Mathematical Integrity (Section 5): derive summary totals strictly from canonical lineItems
  const expectedTaxableGross = roundCurrency(
    earningsLineItems
      .filter((i) => i.isTaxable)
      .reduce((s, i) => s + i.totalAmount, 0)
  );
  const expectedNonTaxableAllowances = roundCurrency(
    earningsLineItems
      .filter((i) => !i.isTaxable)
      .reduce((s, i) => s + i.totalAmount, 0)
  );
  const expectedGrossTotal = roundCurrency(
    expectedTaxableGross + expectedNonTaxableAllowances
  );

  const superEligibleTotal = roundCurrency(
    earningsLineItems
      .filter((i) => i.attractsSuper)
      .reduce((s, i) => s + i.totalAmount, 0)
  );
  const expectedSuperannuation = roundCurrency(superEligibleTotal * config.superRate);

  const lineItems: AuditLineItem[] = [...earningsLineItems];

  // Emit canonical SUPERANNUATION lineItem dynamically if > 0
  if (expectedSuperannuation > 0) {
    const superMeta = CANONICAL_META.SUPERANNUATION;
    lineItems.push({
      categoryCode: 'SUPERANNUATION',
      label: superMeta.label,
      eaClause: superMeta.eaClause,
      isTaxable: superMeta.isTaxable,
      attractsSuper: superMeta.attractsSuper,
      units: 1,
      unitType: superMeta.unitType,
      rate: superEligibleTotal,
      multiplier: config.superRate,
      totalAmount: expectedSuperannuation,
      dailyBreakdown: [
        {
          date: period.endDate,
          units: 1,
          amount: expectedSuperannuation,
          auditNote: `${period.startDate} to ${period.endDate}: ${(
            config.superRate * 100
          ).toFixed(2)}% Superannuation Guarantee on $${superEligibleTotal.toFixed(
            2
          )} OTE eligible earnings.`,
        },
      ],
    });
  }

  const expectedOrdinaryHours = roundHours(
    earningsLineItems
      .filter((i) => ORDINARY_HOUR_CATEGORIES.has(i.categoryCode))
      .reduce((s, i) => s + i.units, 0)
  );
  const expectedTravelHours = roundHours(
    earningsLineItems
      .filter((i) => TRAVEL_HOUR_CATEGORIES.has(i.categoryCode))
      .reduce((s, i) => s + i.units, 0)
  );
  const expectedOvertimeHours = roundHours(
    earningsLineItems
      .filter((i) => OVERTIME_HOUR_CATEGORIES.has(i.categoryCode))
      .reduce((s, i) => s + i.units, 0)
  );
  const expectedLeaveHours = roundHours(
    earningsLineItems
      .filter((i) => LEAVE_HOUR_CATEGORIES.has(i.categoryCode))
      .reduce((s, i) => s + i.units, 0)
  );

  return {
    periodId: `${period.startDate}_to_${period.endDate}`,
    startDate: period.startDate,
    endDate: period.endDate,
    summary: {
      expectedGrossTotal,
      expectedTaxableGross,
      expectedNonTaxableAllowances,
      expectedSuperannuation,
      expectedOrdinaryHours,
      expectedTravelHours,
      expectedOvertimeHours,
      expectedLeaveHours,
    },
    lineItems,
  };
}

export interface BuildAuditExportOptions {
  exportedAt?: string;
  startDateFrom?: string;
  startDateTo?: string;
}

/**
 * Dynamically builds the canonical multi-period `audit_expected.json` payload
 * from stored FortnightPeriods and the active PayrollConfig.
 */
export function buildAuditExpectedExport(
  periods: FortnightPeriod[],
  config: PayrollConfig,
  options: BuildAuditExportOptions = {}
): AuditExpectedExport {
  // Deduplicate by startDate and sort chronologically ascending
  const byStart = new Map<string, FortnightPeriod>();
  for (const p of periods) {
    if (p && p.startDate && Array.isArray(p.days) && p.days.length === 14) {
      byStart.set(p.startDate, p);
    }
  }

  let sortedPeriods = Array.from(byStart.values()).sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );

  if (options.startDateFrom) {
    sortedPeriods = sortedPeriods.filter((p) => p.startDate >= options.startDateFrom!);
  }
  if (options.startDateTo) {
    sortedPeriods = sortedPeriods.filter((p) => p.startDate <= options.startDateTo!);
  }

  const classification =
    config.classification?.trim() ||
    DEFAULT_PAYROLL_CONFIG.classification ||
    'SW Level 2B Pay Point 2';

  return {
    schemaVersion: '1.0.0',
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    employeeProfile: {
      classification,
      employmentType: config.employmentType,
      contractedFortnightHours: roundHours(config.contractedGuaranteedHours),
      baseHourlyRate: roundCurrency(config.ordinaryRate),
      superannuationRate: config.superRate,
    },
    payPeriods: sortedPeriods.map((period) => buildAuditPayPeriod(period, config)),
  };
}
