import { PayrollConfig } from '../types/payroll';

export const RATE_PRESETS = [
  { label: 'Previous EA ($34.23)', value: 34.23 },
  { label: 'Prior Step ($35.26)', value: 35.26 },
  { label: 'Prior Step ($36.31)', value: 36.31 },
  { label: 'SW L2B PP2 ($37.73)', value: 37.73 },
] as const;

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  classification: 'SW Level 2B Pay Point 2',
  employmentType: 'PT',
  contractedGuaranteedHours: 0,
  ordinaryRate: 37.73,
  superRate: 0.12,
  claimTaxFreeThreshold: true,
  firstAidEnabled: false,
  isShiftworkerForLeave: false,
  prior4WeekAverageUniformAllowance: 0,
  allowances: {
    brokenShift1Break: 18.34,
    brokenShift2Breaks: 24.27,
    sleepoverAllowance: 52.86,
    mileageRate: 0.92,
    onCallWeekday: 21.57,
    onCallWeekendPh: 42.72,
    overtimeMealAllowance: 14.10,
    clinicalAssistanceAllowance: 1.85,
    uniformPerShift: 1.23,
    uniformWeeklyCap: 6.24,
    laundryPerShift: 0.32,
    laundryWeeklyCap: 1.49,
    firstAidWeekly: 18.01,
  },
};

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const FULL_DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const BLOCK_TYPE_LABELS: Record<string, string> = {
  REGULAR_CLIENT: 'Regular Client Shift',
  TRAVEL_BETWEEN_CLIENTS: 'Travel Between Clients',
  SLEEPOVER: 'Sleepover (8h Inactive)',
  ACTIVE_WORK_DURING_SLEEPOVER: 'Active Work During Sleepover',
  CARE_24HR: '24-Hour Care Shift',
  REMOTE_WORK: 'Remote / Phone Work',
  ANNUAL_LEAVE: 'Annual Leave (Paid)',
};

export const REMOTE_CONTEXT_LABELS: Record<string, string> = {
  NOT_ON_CALL: 'Not On-Call (Min 60m)',
  ON_CALL_DAY_6AM_10PM: 'On-Call Day 06:00–22:00 (Min 15m)',
  ON_CALL_NIGHT_10PM_6AM: 'On-Call Night 22:00–06:00 (Min 30m)',
  TRAINING_MEETING: 'Remote Training / Meeting (Min 60m)',
};

