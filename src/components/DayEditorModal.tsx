import React, { useEffect } from 'react';
import {
  AlertTriangle,
  Car,
  ChevronLeft,
  ChevronRight,
  Info,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  BLOCK_TYPE_LABELS,
  FULL_DAY_NAMES,
  REMOTE_CONTEXT_LABELS,
} from '../engine/constants';
import { formatDisplayDate, resolveShiftMinutes } from '../engine/timeUtils';
import {
  BlockType,
  DayCalculationResult,
  DayRecord,
  EmploymentType,
  OnCallType,
  RemoteContext,
  WorkBlock,
  WorkBlockStatus,
} from '../types/payroll';

interface DayEditorModalProps {
  dayIndex: number;
  day: DayRecord;
  calc: DayCalculationResult;
  employmentType: EmploymentType;
  onUpdateDay: (dayIndex: number, updater: (prev: DayRecord) => DayRecord) => void;
  onNavigateDay: (nextIndex: number) => void;
  onClose: () => void;
}

function createNewBlock(blockType: BlockType, existingBlocks: WorkBlock[]): WorkBlock {
  const lastBlock = existingBlocks[existingBlocks.length - 1];
  let startTime = '09:00';
  let endTime = '11:00';

  if (blockType === 'SLEEPOVER') {
    startTime = '22:00';
    endTime = '06:00';
  } else if (blockType === 'ACTIVE_WORK_DURING_SLEEPOVER') {
    startTime = '02:00';
    endTime = '02:30';
  } else if (blockType === 'CARE_24HR') {
    startTime = '08:00';
    endTime = '08:00';
  } else if (blockType === 'TRAVEL_BETWEEN_CLIENTS') {
    startTime = lastBlock ? lastBlock.endTime : '10:30';
    const [h, m] = startTime.split(':').map(Number);
    const totalM = (h * 60 + m + 30) % 1440;
    endTime = `${String(Math.floor(totalM / 60)).padStart(2, '0')}:${String(totalM % 60).padStart(
      2,
      '0'
    )}`;
  } else if (blockType === 'REMOTE_WORK') {
    startTime = '18:00';
    endTime = '18:15';
  } else if (lastBlock) {
    startTime = lastBlock.endTime;
    const [h, m] = startTime.split(':').map(Number);
    const totalM = (h * 60 + m + 120) % 1440;
    endTime = `${String(Math.floor(totalM / 60)).padStart(2, '0')}:${String(totalM % 60).padStart(
      2,
      '0'
    )}`;
  }

  return {
    id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    blockType,
    status: 'WORKED',
    startTime,
    endTime,
    unpaidMealBreakMinutes: 0,
    paidClientMealMinutes: 0,
    hasClinicalAssistance: false,
    isRecallOvertime: false,
    remoteContext: 'ON_CALL_DAY_6AM_10PM',
    rosteredHours: 0,
    care24ActiveHours: blockType === 'CARE_24HR' ? 8 : undefined,
    travelMinutes: 0,
    travelSeconds: 0,
    travelKms: 0,
  };
}

export const DayEditorModal: React.FC<DayEditorModalProps> = ({
  dayIndex,
  day,
  calc,
  employmentType,
  onUpdateDay,
  onNavigateDay,
  onClose,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const addBlock = (blockType: BlockType = 'REGULAR_CLIENT') => {
    onUpdateDay(dayIndex, (prev) => ({
      ...prev,
      workBlocks: [...prev.workBlocks, createNewBlock(blockType, prev.workBlocks)],
    }));
  };

  const updateBlock = (blockId: string, patch: Partial<WorkBlock>) => {
    onUpdateDay(dayIndex, (prev) => ({
      ...prev,
      workBlocks: prev.workBlocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    }));
  };

  const removeBlock = (blockId: string) => {
    onUpdateDay(dayIndex, (prev) => {
      const remaining = prev.workBlocks.filter((b) => b.id !== blockId);
      let seenFirstClient = false;
      const normalized = remaining.map((b) => {
        if (b.blockType === 'REGULAR_CLIENT' && !seenFirstClient) {
          seenFirstClient = true;
          return { ...b, travelMinutes: 0, travelSeconds: 0, travelKms: 0 };
        }
        return b;
      });
      return {
        ...prev,
        workBlocks: normalized,
      };
    });
  };

  const shiftTravelKmsTotal = day.workBlocks.reduce(
    (s, b) => s + Math.max(0, b.travelKms || 0),
    0
  );

  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={dayIndex === 0}
                onClick={() => onNavigateDay(dayIndex - 1)}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                title="Previous Day"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={dayIndex === 13}
                onClick={() => onNavigateDay(dayIndex + 1)}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                title="Next Day"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {FULL_DAY_NAMES[day.dayOfWeek]}, {formatDisplayDate(day.date)}
                <span className="ml-2 text-xs font-medium text-slate-500">
                  (Week {dayIndex < 7 ? 1 : 2})
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Worked: <strong>{calc.workedHours.toFixed(2)}h</strong> • Daily Gross:{' '}
                <strong className="text-emerald-700">${calc.grossPay.toFixed(2)}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Auto-Detection Banner */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-800">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Award Engine Live Interpretation
            </div>

            {calc.flags.length === 0 && calc.autoDetectionMessages.length === 0 ? (
              <p className="mt-1.5 text-xs text-indigo-900/80">
                {day.workBlocks.length === 0
                  ? 'No shifts entered on this day yet. Add a work block below to inspect award rules.'
                  : 'Standard shift structure detected with no overtime, broken shift, or rest-break penalties.'}
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {calc.flags.map((flag, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${
                      flag.severity === 'alert'
                        ? 'border-rose-200 bg-rose-50 text-rose-900'
                        : flag.severity === 'warning'
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : 'border-sky-200 bg-sky-50 text-sky-900'
                    }`}
                  >
                    {flag.severity === 'info' ? (
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    )}
                    <div>
                      <span className="font-bold">{flag.title}</span>{' '}
                      <span className="opacity-75">({flag.clauseRef})</span>: {flag.detail}
                    </div>
                  </div>
                ))}
                {calc.autoDetectionMessages.map((msg, i) => (
                  <div key={i} className="text-xs font-medium text-indigo-950">
                    • {msg}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Day-Level Controls */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-700">
              Day-Level Settings &amp; Allowances
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800">
                <span>Public Holiday (250%)</span>
                <input
                  type="checkbox"
                  checked={day.isPublicHoliday}
                  onChange={(e) =>
                    onUpdateDay(dayIndex, (prev) => ({
                      ...prev,
                      isPublicHoliday: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-purple-600"
                />
              </label>

              <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800">
                <span className="text-slate-500">On-Call Allowance (24h)</span>
                <select
                  value={day.onCallType}
                  onChange={(e) =>
                    onUpdateDay(dayIndex, (prev) => ({
                      ...prev,
                      onCallType: e.target.value as OnCallType,
                    }))
                  }
                  className="bg-transparent font-semibold text-slate-900 outline-none"
                >
                  <option value="NONE">None</option>
                  <option value="WEEKDAY">Weekday ($21.57)</option>
                  <option value="WEEKEND_PH">Weekend / PH ($42.72)</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800">
                <span className="text-slate-500">
                  Extra Inter-Client KM
                  {shiftTravelKmsTotal > 0 && (
                    <span className="ml-1 text-[10px] font-semibold text-indigo-600">
                      (+{shiftTravelKmsTotal}km from shifts)
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={day.interClientKms || ''}
                  placeholder="0"
                  onChange={(e) =>
                    onUpdateDay(dayIndex, (prev) => ({
                      ...prev,
                      interClientKms: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="bg-transparent font-semibold text-slate-900 outline-none"
                />
              </label>

              <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800">
                <span className="text-slate-500">
                  Home–First / Last–Home Commute (km)
                  <span className="ml-1 text-[10px] text-slate-400">(&gt;25km if &lt;3h work)</span>
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={day.commuteKmsFirstLast || ''}
                  placeholder="0"
                  onChange={(e) =>
                    onUpdateDay(dayIndex, (prev) => ({
                      ...prev,
                      commuteKmsFirstLast: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="bg-transparent font-semibold text-slate-900 outline-none"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-200 pt-3 text-xs">
              <label className="inline-flex items-center gap-2 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={calc.effectiveUniformClaimed}
                  onChange={(e) =>
                    onUpdateDay(dayIndex, (prev) => ({
                      ...prev,
                      uniformClaimed: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-indigo-600"
                />
                Uniform ($1.23/shift, wk cap $6.24)
              </label>

              <label className="inline-flex items-center gap-2 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={calc.effectiveLaundryClaimed}
                  onChange={(e) =>
                    onUpdateDay(dayIndex, (prev) => ({
                      ...prev,
                      laundryClaimed: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-indigo-600"
                />
                Laundry ($0.32/shift, wk cap $1.49)
              </label>

              <label className="inline-flex items-center gap-2 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(day.waiveOtMealAllowance)}
                  onChange={(e) =>
                    onUpdateDay(dayIndex, (prev) => ({
                      ...prev,
                      waiveOtMealAllowance: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-amber-600"
                />
                Waive OT Meal Allowance (could reasonably return home)
              </label>
            </div>
          </div>

          {/* Work Blocks Section */}
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Work Blocks ({day.workBlocks.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => addBlock('REGULAR_CLIENT')}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Client Shift
                </button>
                <button
                  type="button"
                  onClick={() => addBlock('SLEEPOVER')}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  + Sleepover
                </button>
                <button
                  type="button"
                  onClick={() => addBlock('REMOTE_WORK')}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  + Remote
                </button>
              </div>
            </div>

            {day.workBlocks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No work blocks on this day. Click <strong>Add Client Shift</strong> above to log a
                shift (travel time in min/sec &amp; km appears before each subsequent shift).
              </div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const clientBlockIds = day.workBlocks
                    .filter(
                      (b) =>
                        b.blockType === 'REGULAR_CLIENT' && (b.status ?? 'WORKED') === 'WORKED'
                    )
                    .map((b) => b.id);

                  return day.workBlocks.map((block, idx) => {
                    const isCancelled = (block.status ?? 'WORKED') === 'CLIENT_CANCELLED';
                    const { startMin, endMin, crossesMidnight } = resolveShiftMinutes(
                      block.startTime,
                      block.endTime
                    );
                    const rawHours = (endMin - startMin) / 60;
                    const netHours = Math.max(
                      0,
                      rawHours - (block.unpaidMealBreakMinutes || 0) / 60
                    );
                    const clientShiftIndex = clientBlockIds.indexOf(block.id);
                    const showPreShiftTravel =
                      !isCancelled &&
                      block.blockType === 'REGULAR_CLIENT' &&
                      clientShiftIndex >= 1;

                    return (
                      <div
                        key={block.id}
                        className={`rounded-xl border p-3.5 shadow-xs ${
                          isCancelled
                            ? 'border-amber-300 bg-amber-50/50'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        {showPreShiftTravel && (
                          <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50/70 p-2.5">
                            <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-sky-900">
                              <span className="inline-flex items-center gap-1.5">
                                <Car className="h-3.5 w-3.5 text-sky-600" />
                                Travel Before Shift {clientShiftIndex + 1} (from previous client)
                              </span>
                              <span className="font-mono text-[10px] font-semibold text-sky-700">
                                {block.travelMinutes || 0}m {block.travelSeconds || 0}s •{' '}
                                {block.travelKms || 0} km
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <label className="flex flex-col gap-0.5 text-[11px]">
                                <span className="text-sky-800">Minutes</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={block.travelMinutes ?? 0}
                                  onChange={(e) =>
                                    updateBlock(block.id, {
                                      travelMinutes: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                    })
                                  }
                                  className="rounded border border-sky-200 bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-900"
                                />
                              </label>
                              <label className="flex flex-col gap-0.5 text-[11px]">
                                <span className="text-sky-800">Seconds (0–59)</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={59}
                                  step={1}
                                  value={block.travelSeconds ?? 0}
                                  onChange={(e) =>
                                    updateBlock(block.id, {
                                      travelSeconds: Math.min(
                                        59,
                                        Math.max(0, Math.floor(Number(e.target.value) || 0))
                                      ),
                                    })
                                  }
                                  className="rounded border border-sky-200 bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-900"
                                />
                              </label>
                              <label className="flex flex-col gap-0.5 text-[11px]">
                                <span className="text-sky-800">Travel KM</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  value={block.travelKms ?? 0}
                                  onChange={(e) =>
                                    updateBlock(block.id, {
                                      travelKms: Math.max(0, Number(e.target.value) || 0),
                                    })
                                  }
                                  className="rounded border border-sky-200 bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-900"
                                />
                              </label>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-700">
                              {idx + 1}
                            </span>
                            <select
                              value={block.blockType}
                              onChange={(e) => {
                                const nextType = e.target.value as BlockType;
                                updateBlock(block.id, {
                                  blockType: nextType,
                                  care24ActiveHours:
                                    nextType === 'CARE_24HR'
                                      ? block.care24ActiveHours ?? 8
                                      : block.care24ActiveHours,
                                });
                              }}
                              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500"
                            >
                              {Object.entries(BLOCK_TYPE_LABELS)
                                .filter(
                                  ([val]) =>
                                    val !== 'TRAVEL_BETWEEN_CLIENTS' ||
                                    block.blockType === 'TRAVEL_BETWEEN_CLIENTS'
                                )
                                .map(([val, label]) => (
                                  <option key={val} value={val}>
                                    {label}
                                  </option>
                                ))}
                            </select>
                            {crossesMidnight && (
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800">
                                Crosses Midnight
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value={block.status ?? 'WORKED'}
                              onChange={(e) =>
                                updateBlock(block.id, {
                                  status: e.target.value as WorkBlockStatus,
                                })
                              }
                              title="Shift attendance status (Clause 19(c) Client Cancellation)"
                              className={`rounded-md border px-2 py-0.5 text-[11px] font-bold outline-none ${
                                isCancelled
                                  ? 'border-amber-300 bg-amber-100 text-amber-900'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              }`}
                            >
                              <option value="WORKED">Worked</option>
                              <option value="CLIENT_CANCELLED">Client Cancelled</option>
                            </select>
                            <span className="text-xs font-semibold text-slate-600">
                              Net: {netHours.toFixed(2)}h
                            </span>
                            <button
                              type="button"
                              onClick={() => removeBlock(block.id)}
                              className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                              title="Delete block"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="text-slate-500">Start Time</span>
                          <input
                            type="time"
                            value={block.startTime}
                            onChange={(e) =>
                              updateBlock(block.id, { startTime: e.target.value })
                            }
                            className="rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs font-semibold text-slate-900"
                          />
                        </label>

                        <label className="flex flex-col gap-1 text-xs">
                          <span className="text-slate-500">End Time</span>
                          <input
                            type="time"
                            value={block.endTime}
                            onChange={(e) =>
                              updateBlock(block.id, { endTime: e.target.value })
                            }
                            className="rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs font-semibold text-slate-900"
                          />
                        </label>

                        {block.blockType === 'REGULAR_CLIENT' && (
                          <>
                            <label className="flex flex-col gap-1 text-xs">
                              <span className="text-slate-500">Unpaid Break (min)</span>
                              <input
                                type="number"
                                min={0}
                                step={5}
                                value={block.unpaidMealBreakMinutes || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateBlock(block.id, {
                                    unpaidMealBreakMinutes: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-900"
                              />
                            </label>

                            <label className="flex flex-col gap-1 text-xs">
                              <span className="text-slate-500">Paid Meal (min)</span>
                              <input
                                type="number"
                                min={0}
                                step={5}
                                value={block.paidClientMealMinutes || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateBlock(block.id, {
                                    paidClientMealMinutes: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-900"
                              />
                            </label>
                          </>
                        )}

                        {block.blockType === 'REMOTE_WORK' && (
                          <label className="col-span-2 flex flex-col gap-1 text-xs">
                            <span className="text-slate-500">Remote Context</span>
                            <select
                              value={block.remoteContext}
                              onChange={(e) =>
                                updateBlock(block.id, {
                                  remoteContext: e.target.value as RemoteContext,
                                })
                              }
                              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-900"
                            >
                              {Object.entries(REMOTE_CONTEXT_LABELS).map(([val, label]) => (
                                <option key={val} value={val}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}

                        {block.blockType === 'CARE_24HR' && (
                          <label className="col-span-2 flex flex-col gap-1 text-xs">
                            <span className="text-slate-500">
                              Approved Active Care Hours (8h @ 155%, &gt;8h OT)
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={24}
                              step={0.25}
                              value={block.care24ActiveHours ?? 8}
                              onChange={(e) =>
                                updateBlock(block.id, {
                                  care24ActiveHours: Math.max(0, Number(e.target.value) || 8),
                                })
                              }
                              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-900"
                            />
                          </label>
                        )}
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs">
                        {block.blockType !== 'SLEEPOVER' &&
                          block.blockType !== 'REMOTE_WORK' && (
                            <label className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={block.hasClinicalAssistance}
                                onChange={(e) =>
                                  updateBlock(block.id, {
                                    hasClinicalAssistance: e.target.checked,
                                  })
                                }
                                className="h-3.5 w-3.5 accent-indigo-600"
                              />
                              Clinical Assistance (+$1.85/hr)
                            </label>
                          )}

                        {block.blockType === 'REGULAR_CLIENT' && (
                          <label className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={block.isRecallOvertime}
                              onChange={(e) =>
                                updateBlock(block.id, { isRecallOvertime: e.target.checked })
                              }
                              className="h-3.5 w-3.5 accent-orange-600"
                            />
                            Recall Overtime (min 2h OT)
                          </label>
                        )}

                        {employmentType === 'FT' && block.blockType === 'REGULAR_CLIENT' && (
                          <label className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                            <span>FT Rostered Hrs:</span>
                            <input
                              type="number"
                              min={0}
                              max={12}
                              step={0.1}
                              value={block.rosteredHours || ''}
                              placeholder="10 max"
                              onChange={(e) =>
                                updateBlock(block.id, {
                                  rosteredHours: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-xs font-semibold"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* Day Calculated Line Items Breakdown */}
          {calc.lineItems.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                Daily Line-Item Breakdown
              </div>
              <div className="divide-y divide-slate-100">
                {calc.lineItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-3.5 py-2 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">{item.label}</div>
                      {item.notes && <div className="text-[11px] text-slate-500">{item.notes}</div>}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-900">${item.amount.toFixed(2)}</div>
                      <div className="text-[11px] text-slate-500">
                        {item.units.toFixed(2)} {item.unitLabel} × ${item.rate.toFixed(2)} ×{' '}
                        {(item.multiplier * 100).toFixed(1).replace(/\.0$/, '')}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

