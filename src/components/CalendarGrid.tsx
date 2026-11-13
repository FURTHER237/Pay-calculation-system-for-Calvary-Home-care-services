import React from 'react';
import { AlertTriangle, Car, Clock, Moon, PhoneCall, Plus, Sparkles } from 'lucide-react';
import { DAY_NAMES } from '../engine/constants';
import { formatDisplayDate } from '../engine/timeUtils';
import { DayCalculationResult, DayRecord, PayslipResult } from '../types/payroll';

interface CalendarGridProps {
  days: DayRecord[];
  payslip: PayslipResult;
  selectedDayIndex: number | null;
  onSelectDay: (dayIndex: number) => void;
  onTogglePublicHoliday: (dayIndex: number) => void;
}

function getBadgeClasses(badge: string): string {
  if (badge.includes('Breach') || badge.includes('12h Span')) {
    return 'bg-rose-100 text-rose-800 border-rose-200';
  }
  if (badge.includes('PH 250%')) {
    return 'bg-purple-100 text-purple-800 border-purple-200';
  }
  if (badge.includes('Sun 200%') || badge.includes('Sat 150%')) {
    return 'bg-sky-100 text-sky-800 border-sky-200';
  }
  if (badge.includes('Broken Shift') || badge.includes('Cancelled')) {
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }
  if (badge.includes('OT')) {
    return 'bg-orange-100 text-orange-800 border-orange-200';
  }
  if (badge.includes('Afternoon') || badge.includes('Night')) {
    return 'bg-indigo-100 text-indigo-800 border-indigo-200';
  }
  if (badge.includes('Annual Leave') || badge.includes('PH on Leave')) {
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  }
  if (badge.includes('Sleepover') || badge.includes('24h Care')) {
    return 'bg-teal-100 text-teal-800 border-teal-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function getBlockShortLabel(type: string): string {
  switch (type) {
    case 'REGULAR_CLIENT':
      return 'Client';
    case 'TRAVEL_BETWEEN_CLIENTS':
      return 'Travel';
    case 'SLEEPOVER':
      return 'Sleepover';
    case 'ACTIVE_WORK_DURING_SLEEPOVER':
      return 'Sleep Active';
    case 'CARE_24HR':
      return '24h Care';
    case 'REMOTE_WORK':
      return 'Remote';
    case 'ANNUAL_LEAVE':
      return 'Annual Leave';
    default:
      return type;
  }
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  days,
  payslip,
  selectedDayIndex,
  onSelectDay,
  onTogglePublicHoliday,
}) => {
  const weeks = [
    { label: 'Week 1', start: 0, hours: payslip.week1Hours, gross: payslip.week1Gross },
    { label: 'Week 2', start: 7, hours: payslip.week2Hours, gross: payslip.week2Gross },
  ];

  return (
    <section className="space-y-6">
      {weeks.map((week) => (
        <div
          key={week.label}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">{week.label}</span>
              <span className="text-xs text-slate-500">
                ({formatDisplayDate(days[week.start].date)} –{' '}
                {formatDisplayDate(days[week.start + 6].date)})
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="font-medium text-slate-600">
                Worked: <strong className="text-slate-900">{week.hours.toFixed(2)} hrs</strong>
              </span>
              <span className="font-medium text-slate-600">
                Week Gross:{' '}
                <strong className="text-emerald-700">${week.gross.toFixed(2)}</strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-7">
            {days.slice(week.start, week.start + 7).map((day, offset) => {
              const dayIdx = week.start + offset;
              const calc: DayCalculationResult = payslip.days[dayIdx];
              const isWeekend = day.dayOfWeek === 5 || day.dayOfWeek === 6;
              const isSelected = selectedDayIndex === dayIdx;
              const hasWork = day.workBlocks.length > 0 || calc.grossPay > 0;

              return (
                <div
                  key={day.date}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectDay(dayIdx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectDay(dayIdx);
                    }
                  }}
                  className={`group flex min-h-[188px] cursor-pointer flex-col justify-between p-3 text-left transition ${
                    isSelected
                      ? 'bg-indigo-50/70 ring-2 ring-inset ring-indigo-500'
                      : day.isPublicHoliday
                        ? 'bg-purple-50/40 hover:bg-purple-50/80'
                        : isWeekend
                          ? 'bg-slate-50/60 hover:bg-indigo-50/30'
                          : 'bg-white hover:bg-indigo-50/30'
                  }`}
                >
                  <div>
                    {/* Day Header with PH Toggle */}
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <div className="flex items-center gap-1">
                          <span
                            className={`text-xs font-bold uppercase tracking-wide ${
                              day.isPublicHoliday
                                ? 'text-purple-700'
                                : isWeekend
                                  ? 'text-sky-700'
                                  : 'text-slate-700'
                            }`}
                          >
                            {DAY_NAMES[day.dayOfWeek]}
                          </span>
                          <span className="text-xs font-medium text-slate-500">
                            {formatDisplayDate(day.date)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePublicHoliday(dayIdx);
                        }}
                        title="Toggle Public Holiday (250%)"
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold transition ${
                          day.isPublicHoliday
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-500 hover:bg-purple-100 hover:text-purple-700'
                        }`}
                      >
                        {day.isPublicHoliday ? 'PH ✓' : 'PH'}
                      </button>
                    </div>

                    {/* Work Blocks Preview */}
                    <div className="mt-2 space-y-1">
                      {day.workBlocks.length === 0 ? (
                        <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400 transition group-hover:border-indigo-300 group-hover:text-indigo-500">
                          <Plus className="mr-1 h-3.5 w-3.5" /> Add shift
                        </div>
                      ) : (
                        day.workBlocks.slice(0, 4).map((b) => {
                          const isCancelled = (b.status ?? 'WORKED') === 'CLIENT_CANCELLED';
                          const hasPreTravel =
                            !isCancelled &&
                            ((b.travelMinutes || 0) > 0 || (b.travelSeconds || 0) > 0);
                          return (
                            <div key={b.id} className="space-y-0.5">
                              {hasPreTravel && (
                                <div className="flex items-center justify-between rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                                  <span>
                                    ↳ {b.travelMinutes || 0}m {b.travelSeconds || 0}s travel
                                  </span>
                                  {(b.travelKms || 0) > 0 && <span>{b.travelKms}km</span>}
                                </div>
                              )}
                              <div
                                className={`flex items-center justify-between rounded-md px-1.5 py-1 text-[11px] ${
                                  isCancelled
                                    ? 'border border-amber-200 bg-amber-50 text-amber-900'
                                    : 'bg-slate-100/90 text-slate-700'
                                }`}
                              >
                                <span
                                  className={`font-mono font-semibold ${
                                    isCancelled ? 'line-through text-amber-800' : 'text-slate-800'
                                  }`}
                                >
                                  {b.startTime}–{b.endTime}
                                </span>
                                <span className="truncate pl-1 text-[10px] font-medium">
                                  {isCancelled ? 'Cancelled' : getBlockShortLabel(b.blockType)}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                      {day.workBlocks.length > 4 && (
                        <div className="text-[10px] font-medium text-indigo-600">
                          +{day.workBlocks.length - 4} more block(s)
                        </div>
                      )}
                    </div>

                    {/* Badges */}
                    {calc.badges.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {calc.badges.map((badge) => (
                          <span
                            key={badge}
                            className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${getBadgeClasses(
                              badge
                            )}`}
                          >
                            {(badge.includes('Breach') || badge.includes('Span')) && (
                              <AlertTriangle className="h-2.5 w-2.5" />
                            )}
                            {badge.includes('Sleepover') && <Moon className="h-2.5 w-2.5" />}
                            {badge.includes('On-Call') && <PhoneCall className="h-2.5 w-2.5" />}
                            {badge}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Day Footer Stats */}
                  <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-2">
                    <div className="flex flex-col gap-0.5 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {calc.workedHours.toFixed(2)}h
                      </span>
                      {(() => {
                        const totalKms =
                          (day.interClientKms || 0) +
                          (day.commuteKmsFirstLast || 0) +
                          day.workBlocks.reduce(
                            (s, b) =>
                              (b.status ?? 'WORKED') === 'CLIENT_CANCELLED'
                                ? s
                                : s + (b.travelKms || 0),
                            0
                          );
                        return totalKms > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <Car className="h-2.5 w-2.5" />
                            {totalKms}km
                          </span>
                        ) : null;
                      })()}
                    </div>

                    <div className="text-right">
                      {calc.flags.length > 0 && (
                        <span
                          className="mb-0.5 inline-flex items-center text-[10px] font-semibold text-amber-600"
                          title={calc.flags.map((f) => f.title).join('; ')}
                        >
                          <Sparkles className="mr-0.5 h-2.5 w-2.5" />
                          {calc.flags.length} alert{calc.flags.length > 1 ? 's' : ''}
                        </span>
                      )}
                      <div
                        className={`text-sm font-bold ${
                          hasWork ? 'text-emerald-700' : 'text-slate-300'
                        }`}
                      >
                        ${calc.grossPay.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
};

