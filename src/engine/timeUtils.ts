import { DayRecord, FortnightPeriod } from '../types/payroll';

/**
 * Parses "HH:mm" into minutes from 00:00 (0..1439).
 */
export function parseTimeToMinutes(time: string): number {
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Formats minutes from midnight (can exceed 1440) back into "HH:mm".
 */
export function formatMinutesToTime(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Formats duration in minutes to e.g. "4h 30m".
 */
export function formatDurationMinutes(minutes: number): string {
  const mins = Math.max(0, Math.round(minutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Resolves start and end in minutes relative to the start of the day.
 * If end <= start, end is treated as crossing midnight (+1440).
 */
export function resolveShiftMinutes(startTime: string, endTime: string): {
  startMin: number;
  endMin: number;
  crossesMidnight: boolean;
} {
  const startMin = parseTimeToMinutes(startTime);
  let endMin = parseTimeToMinutes(endTime);
  const crossesMidnight = endMin <= startMin;
  if (crossesMidnight) {
    endMin += 1440;
  }
  return { startMin, endMin, crossesMidnight };
}

/**
 * Adds `days` to an ISO YYYY-MM-DD date safely without timezone drift.
 */
export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Returns the Monday (YYYY-MM-DD) of the week containing `date`.
 */
export function getMondayOfWeek(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const utc = new Date(Date.UTC(y, m, d));
  const jsDay = utc.getUTCDay(); // 0 = Sun, 1 = Mon .. 6 = Sat
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  utc.setUTCDate(utc.getUTCDate() + diffToMonday);
  return utc.toISOString().slice(0, 10);
}

/**
 * Formats YYYY-MM-DD as "Mon 16 Nov".
 */
export function formatDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Creates a clean 14-day FortnightPeriod starting on a Monday ISO date.
 */
export function createEmptyFortnight(startDate: string): FortnightPeriod {
  const days: DayRecord[] = [];
  for (let i = 0; i < 14; i++) {
    const date = addDaysIso(startDate, i);
    days.push({
      date,
      dayOfWeek: i % 7,
      isPublicHoliday: false,
      onCallType: 'NONE',
      commuteKmsFirstLast: 0,
      interClientKms: 0,
      uniformClaimed: undefined,
      laundryClaimed: undefined,
      waiveOtMealAllowance: false,
      workBlocks: [],
    });
  }
  return {
    startDate,
    endDate: addDaysIso(startDate, 13),
    days,
  };
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundHours(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

