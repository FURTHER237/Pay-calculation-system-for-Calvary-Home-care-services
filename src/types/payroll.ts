export type EmploymentType = 'PT' | 'FT';

export type OnCallType = 'NONE' | 'WEEKDAY' | 'WEEKEND_PH';

export type BlockType =
  | 'REGULAR_CLIENT'
  | 'TRAVEL_BETWEEN_CLIENTS'
  | 'SLEEPOVER'
  | 'ACTIVE_WORK_DURING_SLEEPOVER'
  | 'CARE_24HR'
  | 'REMOTE_WORK'
  | 'ANNUAL_LEAVE';

export type RemoteContext =
  | 'NOT_ON_CALL'
  | 'ON_CALL_DAY_6AM_10PM'
  | 'ON_CALL_NIGHT_10PM_6AM'
  | 'TRAINING_MEETING';

export type WorkBlockStatus = 'WORKED' | 'CLIENT_CANCELLED';

export interface PayrollConfig {
  employmentType: EmploymentType;
  contractedGuaranteedHours: number; // 0 to 76.0
  ordinaryRate: number; // default $37.73
  superRate: number; // default 0.12 (12%)
  claimTaxFreeThreshold: boolean;
  firstAidEnabled: boolean;
  isShiftworkerForLeave: boolean;
  prior4WeekAverageUniformAllowance: number;
  allowances: {
    brokenShift1Break: number; // $18.34
    brokenShift2Breaks: number; // $24.27
    sleepoverAllowance: number; // $52.86
    mileageRate: number; // $0.92
    onCallWeekday: number; // $21.57
    onCallWeekendPh: number; // $42.72
    overtimeMealAllowance: number; // $14.10
    clinicalAssistanceAllowance: number; // $1.85/hr
    uniformPerShift: number; // $1.23 (cap $6.24/wk)
    uniformWeeklyCap: number; // $6.24
    laundryPerShift: number; // $0.32 (cap $1.49/wk)
    laundryWeeklyCap: number; // $1.49
    firstAidWeekly: number; // $18.01 FT or pro-rata hours/38 PT
  };
}

export interface WorkBlock {
  id: string;
  blockType: BlockType;
  status?: WorkBlockStatus; // defaults to 'WORKED'
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  unpaidMealBreakMinutes: number;
  paidClientMealMinutes: number;
  hasClinicalAssistance: boolean;
  isRecallOvertime: boolean;
  remoteContext: RemoteContext;
  rosteredHours: number; // For FT users
  care24ActiveHours?: number; // For CARE_24HR, defaults to 8.0
  travelMinutes?: number; // Pre-shift travel from previous client (mins)
  travelSeconds?: number; // Pre-shift travel from previous client (secs, 0-59)
  travelKms?: number; // Pre-shift travel distance from previous client (km)
}

export interface DayRecord {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 (Mon) .. 6 (Sun)
  isPublicHoliday: boolean;
  onCallType: OnCallType;
  commuteKmsFirstLast: number;
  interClientKms: number;
  uniformClaimed?: boolean;
  laundryClaimed?: boolean;
  waiveOtMealAllowance?: boolean;
  workBlocks: WorkBlock[];
}

export interface FortnightPeriod {
  startDate: string; // YYYY-MM-DD (Monday of Week 1)
  endDate: string; // YYYY-MM-DD (Sunday of Week 2)
  days: DayRecord[]; // 14 items
  reassignedMakeUpHours?: number; // Cancelled hours reassigned within current fortnight
  cashedOutAnnualLeaveHours?: number; // Hours of annual leave cashed out (Clause 29(j))
}

export type PayCode =
  | 'BASE_ORDINARY'
  | 'TRAVEL_ORDINARY'
  | 'TRAVEL_AFTERNOON'
  | 'TRAVEL_NIGHT'
  | 'TRAVEL_SATURDAY'
  | 'TRAVEL_SUNDAY'
  | 'TRAVEL_PH'
  | 'AFTERNOON_SHIFT'
  | 'NIGHT_SHIFT'
  | 'SATURDAY'
  | 'SUNDAY'
  | 'PUBLIC_HOLIDAY'
  | 'OVERTIME_150'
  | 'OVERTIME_200'
  | 'OVERTIME_250'
  | 'BROKEN_SHIFT_SPAN_200'
  | 'BROKEN_SHIFT_SPAN_250'
  | 'REST_BREAK_BREACH_200'
  | 'REST_BREAK_BREACH_250'
  | 'CARE_24HR_155'
  | 'REMOTE_WORK'
  | 'MIN_ENGAGEMENT_TOPUP'
  | 'BROKEN_MIN_PERIOD_TOPUP'
  | 'CLIENT_CANCELLED_ORDINARY'
  | 'SLEEPOVER_4H_TOPUP'
  | 'GUARANTEED_HOURS_TOPUP'
  | 'PH_NOT_WORKED_ORDINARY'
  | 'ANNUAL_LEAVE_BASE'
  | 'ANNUAL_LEAVE_LOADING_175'
  | 'ANNUAL_LEAVE_LOADING_PENALTY'
  | 'ANNUAL_LEAVE_CASHED_OUT_BASE'
  | 'ANNUAL_LEAVE_CASHED_OUT_LOADING'
  | 'ALLOWANCE_BROKEN_1'
  | 'ALLOWANCE_BROKEN_2'
  | 'ALLOWANCE_SLEEPOVER'
  | 'ALLOWANCE_MILEAGE'
  | 'ALLOWANCE_ONCALL_WEEKDAY'
  | 'ALLOWANCE_ONCALL_WEEKEND_PH'
  | 'ALLOWANCE_OT_MEAL'
  | 'ALLOWANCE_CLINICAL'
  | 'ALLOWANCE_UNIFORM'
  | 'ALLOWANCE_LAUNDRY'
  | 'ALLOWANCE_FIRST_AID';

export interface PayLineItem {
  id: string;
  code: PayCode;
  label: string;
  category: 'ORDINARY' | 'PENALTY' | 'OVERTIME' | 'ALLOWANCE' | 'TOPUP';
  clauseRef: string;
  units: number;
  unitLabel: 'hrs' | 'km' | 'shift' | 'night' | 'day' | 'meal' | 'wk';
  rate: number;
  multiplier: number;
  amount: number;
  isOte: boolean;
  isTaxable: boolean;
  dayDate?: string;
  notes?: string;
}

export interface AuditFlag {
  severity: 'info' | 'warning' | 'alert';
  title: string;
  detail: string;
  clauseRef: string;
}

export interface DayCalculationResult {
  date: string;
  dayOfWeek: number;
  workedHours: number; // total actual + padded worked hours (excl sleepover inactive)
  ordinaryNonTravelHours: number;
  travelHours: number;
  overtimeHours: number;
  brokenShiftPeriods: number; // 0 if not broken, 2 or 3 if broken
  brokenShiftUnpaidBreaks: number;
  brokenShiftSpanHours: number;
  hasRestBreakBreach: boolean;
  restGapHours: number | null;
  hasPaid20MinOtRestBreak: boolean;
  badges: string[];
  autoDetectionMessages: string[];
  flags: AuditFlag[];
  lineItems: PayLineItem[];
  grossPay: number;
  effectiveUniformClaimed: boolean;
  effectiveLaundryClaimed: boolean;
}

export interface PayslipSummaryRow {
  code: PayCode;
  label: string;
  category: PayLineItem['category'];
  clauseRef: string;
  units: number;
  unitLabel: PayLineItem['unitLabel'];
  rate: number;
  multiplier: number;
  amount: number;
  isOte: boolean;
  notes?: string;
}

export interface DiscrepancyClauseHint {
  clauseRef: string;
  title: string;
  estimatedAmount: number;
  explanation: string;
}

export interface PayslipResult {
  days: DayCalculationResult[];
  lineItems: PayLineItem[];
  groupedRows: PayslipSummaryRow[];
  totalWorkedHours: number;
  totalOrdinaryAndTravelHours: number;
  totalCancelledHours: number;
  reassignedMakeUpHours: number;
  makeUpHoursBalance: number;
  guaranteedHoursShortfall: number;
  totalOvertimeHours: number;
  grossBaseAndPenaltyPay: number;
  grossOvertimePay: number;
  totalAllowances: number;
  taxableAllowances: number;
  nonTaxableAllowances: number;
  totalGrossPay: number;
  oteBase: number;
  superannuation: number;
  estimatedTaxWithheld: number;
  estimatedNetPay: number;
  week1Hours: number;
  week2Hours: number;
  week1Gross: number;
  week2Gross: number;
  annualLeaveHoursTaken: number;
  annualLeaveHoursSavedByPh: number;
  annualLeaveLoadingOption1Amount: number;
  annualLeaveLoadingOption2Amount: number;
  annualLeaveLoadingWinner: 'NONE' | 'LOADING_175' | 'PENALTY_EQUIVALENT';
  cashedOutAnnualLeaveHours: number;
  ordinaryTimeWorkedForAccrual: number;
  accrualStandardHours: number;
  accrualShiftworkerHours: number;
  accrualPersonalLeaveHours: number;
  qualifyingWeekendsWorked: number;
  qualifying24HrShiftsCount: number;
  discrepancyHints: DiscrepancyClauseHint[];
}

