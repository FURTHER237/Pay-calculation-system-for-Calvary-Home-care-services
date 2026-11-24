import { BlockType, FortnightPeriod, WorkBlock } from '../types/payroll';
import { createEmptyFortnight, formatMinutesToTime, getMondayOfWeek } from './timeUtils';

export interface ParsedTimesheetResult {
  fortnight: FortnightPeriod;
  importedBlockCount: number;
  importedDayCount: number;
  warnings: string[];
}

function splitDelimitedLine(line: string, delimiter: '\t' | ','): string[] {
  if (delimiter === '\t') {
    return line.split('\t').map((c) => c.trim());
  }
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parses DD/MM/YYYY, D/M/YYYY, or YYYY-MM-DD into YYYY-MM-DD.
 */
export function parseFlexibleDateToIso(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}

/**
 * Parses "HH:mm", "H:mm", "7:00 PM", or "19:00:00" into normalized "HH:mm".
 */
export function normalizeClockTime(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;

  const amPmMatch = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/);
  if (amPmMatch) {
    let h = Number(amPmMatch[1]);
    const m = Number(amPmMatch[2]);
    const suffix = amPmMatch[3];
    if (suffix === 'PM' && h < 12) h += 12;
    if (suffix === 'AM' && h === 12) h = 0;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return null;
  }

  const h24Match = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24Match) {
    const h = Number(h24Match[1]);
    const m = Number(h24Match[2]);
    if (h >= 0 && h <= 24 && m >= 0 && m < 60) {
      const clampedH = h === 24 ? 0 : h;
      return `${String(clampedH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Parses a duration cell in "H:mm" (e.g. "2:00") or decimal hours ("2.5") into minutes.
 */
export function parseDurationCellToMinutes(raw: string): number {
  const s = raw.trim();
  if (!s || s === '-' || s === '—') return 0;

  const hmMatch = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    return Number(hmMatch[1]) * 60 + Number(hmMatch[2]);
  }

  const num = Number(s.replace(/[^0-9.]/g, ''));
  if (!Number.isNaN(num) && num > 0) {
    return Math.round(num * 60);
  }
  return 0;
}

/**
 * Parses inter-client travel duration independently:
 * - "MM:SS" (e.g. "08:05" -> 8m 5s)
 * - "HH:MM:SS" (e.g. "00:08:05" -> 8m 5s)
 * - "15m 30s", "15 min", "15" -> 15m 30s / 15m 0s
 */
export function parseTravelDurationCell(raw: string): {
  travelMinutes: number;
  travelSeconds: number;
} {
  const s = raw.trim().toLowerCase();
  if (!s || s === '-' || s === '—') {
    return { travelMinutes: 0, travelSeconds: 0 };
  }

  const hmsMatch = s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (hmsMatch) {
    const h = Number(hmsMatch[1]);
    const m = Number(hmsMatch[2]);
    const sec = Number(hmsMatch[3]);
    const totalSec = h * 3600 + m * 60 + sec;
    return {
      travelMinutes: Math.floor(totalSec / 60),
      travelSeconds: totalSec % 60,
    };
  }

  const msMatch = s.match(/^(\d+):(\d{1,2})$/);
  if (msMatch) {
    const mins = Number(msMatch[1]);
    const secs = Number(msMatch[2]);
    const totalSec = mins * 60 + secs;
    return {
      travelMinutes: Math.floor(totalSec / 60),
      travelSeconds: totalSec % 60,
    };
  }

  const textMatch = s.match(/(?:(\d+)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+)\s*s(?:ec(?:ond)?s?)?)?/);
  if (textMatch && (textMatch[1] || textMatch[2])) {
    const mins = Number(textMatch[1] || 0);
    const secs = Number(textMatch[2] || 0);
    const totalSec = mins * 60 + secs;
    return {
      travelMinutes: Math.floor(totalSec / 60),
      travelSeconds: totalSec % 60,
    };
  }

  const numericMins = Number(s.replace(/[^0-9.]/g, ''));
  if (!Number.isNaN(numericMins) && numericMins > 0) {
    const totalSec = Math.round(numericMins * 60);
    return {
      travelMinutes: Math.floor(totalSec / 60),
      travelSeconds: totalSec % 60,
    };
  }

  return { travelMinutes: 0, travelSeconds: 0 };
}

/**
 * Parses a mileage cell (e.g. "5.72 km", "5.72", "18km") into numeric kilometres.
 */
export function parseMileageCell(raw: string): number {
  const cleaned = raw.trim().replace(/,/g, '').replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const val = Number(cleaned);
  return Number.isNaN(val) || val < 0 ? 0 : val;
}

function inferBlockType(description: string, hasClientHours: boolean): BlockType {
  const lower = description.toLowerCase();
  if (lower.includes('sleepover active') || lower.includes('active sleepover')) {
    return 'ACTIVE_WORK_DURING_SLEEPOVER';
  }
  if (lower.includes('sleepover')) {
    return 'SLEEPOVER';
  }
  if (lower.includes('annual leave')) {
    return 'ANNUAL_LEAVE';
  }
  if (lower.includes('remote')) {
    return 'REMOTE_WORK';
  }
  if (lower.includes('24h') || lower.includes('24 hr') || lower.includes('24-hour')) {
    return 'CARE_24HR';
  }
  if (!hasClientHours && lower.includes('travel')) {
    return 'TRAVEL_BETWEEN_CLIENTS';
  }
  return 'REGULAR_CLIENT';
}

/**
 * Universal CSV/TSV Timesheet Importer (Step 6):
 * Decouples shift duration extraction (across Ordinary, Afternoon, Night, Weekend, PH columns)
 * from travel duration & mileage extraction so travel time + km always attach to the shift record.
 */
export function parseTimesheetToFortnight(
  rawText: string,
  fallbackStartDate?: string
): ParsedTimesheetResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    throw new Error('Timesheet input must include a header row and at least one shift row.');
  }

  const delimiter: '\t' | ',' = lines[0].includes('\t') ? '\t' : ',';
  const headers = splitDelimitedLine(lines[0], delimiter).map(normalizeHeader);

  const findCol = (aliases: string[]): number =>
    headers.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));

  const colIdx = {
    date: findCol(['date', 'shiftdate']),
    client: findCol(['client', 'description', 'activity', 'service', 'shift', 'type']),
    start: findCol(['starttime', 'start', 'from', 'begin']),
    end: findCol(['endtime', 'finish', 'end', 'to']),
    timeRange: findCol(['timerange', 'window']),
    ordinary: findCol(['ordinary', 'ord', 'dayhours']),
    afternoon: findCol(['afternoon', 'aft', 'evening']),
    night: findCol(['night']),
    saturday: findCol(['saturday', 'sat']),
    sunday: findCol(['sunday', 'sun']),
    weekend: findCol(['weekend', 'wknd']),
    publicHoliday: findCol(['publicholiday', 'ph']),
    duration: findCol(['duration', 'hours', 'worked', 'total']),
    unpaidBreak: findCol(['unpaidbreak', 'mealbreak', 'break']),
    travelTime: findCol(['traveltime', 'interclienttravel', 'travelduration', 'travel']),
    travelKms: findCol(['mileage', 'travelkm', 'travelkms', 'kms', 'km', 'distance']),
  };

  if (colIdx.date === -1) {
    throw new Error('Missing Date column in timesheet header.');
  }

  interface PendingRow {
    dateIso: string;
    isPublicHoliday: boolean;
    block: WorkBlock;
  }

  const parsedRows: PendingRow[] = [];
  const warnings: string[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = splitDelimitedLine(lines[r], delimiter);
    const getCell = (idx: number) => (idx >= 0 && idx < cells.length ? cells[idx] : '');

    const dateIso = parseFlexibleDateToIso(getCell(colIdx.date));
    if (!dateIso) {
      warnings.push(`Row ${r + 1}: skipped (unrecognized date "${getCell(colIdx.date)}").`);
      continue;
    }

    let startTime = normalizeClockTime(getCell(colIdx.start));
    let endTime = normalizeClockTime(getCell(colIdx.end));

    if ((!startTime || !endTime) && colIdx.timeRange >= 0) {
      const rangeParts = getCell(colIdx.timeRange).split(/[-–—]/);
      if (rangeParts.length === 2) {
        startTime = startTime ?? normalizeClockTime(rangeParts[0]);
        endTime = endTime ?? normalizeClockTime(rangeParts[1]);
      }
    }

    // Decoupled Shift Duration Extraction: check ALL shift hour columns uniformly
    const ordMins = parseDurationCellToMinutes(getCell(colIdx.ordinary));
    const aftMins = parseDurationCellToMinutes(getCell(colIdx.afternoon));
    const nightMins = parseDurationCellToMinutes(getCell(colIdx.night));
    const satMins = parseDurationCellToMinutes(getCell(colIdx.saturday));
    const sunMins = parseDurationCellToMinutes(getCell(colIdx.sunday));
    const wkdMins = parseDurationCellToMinutes(getCell(colIdx.weekend));
    const phMins = parseDurationCellToMinutes(getCell(colIdx.publicHoliday));
    const genericMins = parseDurationCellToMinutes(getCell(colIdx.duration));

    const bucketWorkMinutes =
      ordMins + aftMins + nightMins + satMins + sunMins + wkdMins + phMins || genericMins;

    if (startTime && !endTime && bucketWorkMinutes > 0) {
      const [h, m] = startTime.split(':').map(Number);
      endTime = formatMinutesToTime(h * 60 + m + bucketWorkMinutes);
    }

    if (!startTime || !endTime) {
      warnings.push(`Row ${r + 1}: skipped (missing valid Start/End time).`);
      continue;
    }

    // Decoupled Travel Time & Mileage Extraction (ALWAYS extracted regardless of shift bucket column!)
    const { travelMinutes, travelSeconds } = parseTravelDurationCell(getCell(colIdx.travelTime));
    const travelKms = parseMileageCell(getCell(colIdx.travelKms));
    const unpaidMealBreakMinutes = parseDurationCellToMinutes(getCell(colIdx.unpaidBreak));
    const description = getCell(colIdx.client);
    const hasClientHours =
      bucketWorkMinutes > 0 || !description.toLowerCase().includes('travel');
    const blockType = inferBlockType(description, hasClientHours);

    const block: WorkBlock = {
      id: `imp-${r}-${Math.random().toString(36).slice(2, 7)}`,
      blockType,
      status: 'WORKED',
      startTime,
      endTime,
      unpaidMealBreakMinutes,
      paidClientMealMinutes: 0,
      hasClinicalAssistance: description.toLowerCase().includes('clinical'),
      isRecallOvertime: description.toLowerCase().includes('recall'),
      remoteContext: 'NOT_ON_CALL',
      rosteredHours: 0,
      travelMinutes,
      travelSeconds,
      travelKms,
    };

    parsedRows.push({
      dateIso,
      isPublicHoliday: phMins > 0,
      block,
    });
  }

  if (parsedRows.length === 0) {
    throw new Error('No valid shift rows found in the timesheet.');
  }

  const sortedDates = Array.from(new Set(parsedRows.map((p) => p.dateIso))).sort();
  const earliest = sortedDates[0];
  const [ey, em, ed] = earliest.split('-').map(Number);
  const startDate =
    fallbackStartDate ?? getMondayOfWeek(new Date(ey, em - 1, ed));
  const fortnight = createEmptyFortnight(startDate);
  const dayByIso = new Map(fortnight.days.map((d) => [d.date, d]));

  let importedBlockCount = 0;
  const touchedDates = new Set<string>();

  for (const row of parsedRows) {
    const day = dayByIso.get(row.dateIso);
    if (!day) {
      warnings.push(
        `Date ${row.dateIso} falls outside the 14-day period (${fortnight.startDate} to ${fortnight.endDate}).`
      );
      continue;
    }
    if (row.isPublicHoliday) {
      day.isPublicHoliday = true;
    }
    day.workBlocks.push(row.block);
    importedBlockCount++;
    touchedDates.add(row.dateIso);
  }

  for (const day of fortnight.days) {
    day.workBlocks.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  return {
    fortnight,
    importedBlockCount,
    importedDayCount: touchedDates.size,
    warnings,
  };
}

