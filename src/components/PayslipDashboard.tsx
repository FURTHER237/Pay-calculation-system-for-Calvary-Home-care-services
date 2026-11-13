import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  FileText,
  Scale,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { FULL_DAY_NAMES } from '../engine/constants';
import { formatDisplayDate } from '../engine/timeUtils';
import { PayrollConfig, PayslipResult } from '../types/payroll';

interface PayslipDashboardProps {
  payslip: PayslipResult;
  config: PayrollConfig;
  onToggleTaxFreeThreshold: (val: boolean) => void;
  onSelectDay: (dayIndex: number) => void;
}

export const PayslipDashboard: React.FC<PayslipDashboardProps> = ({
  payslip,
  config,
  onToggleTaxFreeThreshold,
  onSelectDay,
}) => {
  const [activeTab, setActiveTab] = useState<'PAYSLIP' | 'CHECKER' | 'AUDIT'>('PAYSLIP');
  const [actualPaidInput, setActualPaidInput] = useState<string>('');

  const guaranteedTarget = config.contractedGuaranteedHours;
  const ordinaryProgressPct =
    guaranteedTarget > 0
      ? Math.min(100, (payslip.totalOrdinaryAndTravelHours / guaranteedTarget) * 100)
      : Math.min(100, (payslip.totalOrdinaryAndTravelHours / 76) * 100);

  const actualPaidNum = actualPaidInput.trim() === '' ? null : Number(actualPaidInput);
  const variance =
    actualPaidNum !== null && !Number.isNaN(actualPaidNum)
      ? payslip.totalGrossPay - actualPaidNum
      : null;

  return (
    <section className="space-y-6">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Worked &amp; Ordinary Hours
            </span>
            <TrendingUp className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {payslip.totalWorkedHours.toFixed(2)}h
            </span>
            <span className="text-xs font-medium text-slate-500">
              ({payslip.totalOvertimeHours.toFixed(2)}h OT)
            </span>
          </div>
          <div className="mt-2.5">
            <div className="flex justify-between text-[11px] font-medium text-slate-600">
              <span>Ord + Travel: {payslip.totalOrdinaryAndTravelHours.toFixed(2)}h</span>
              <span>
                {guaranteedTarget > 0 ? `Min ${guaranteedTarget.toFixed(1)}h` : 'Max 76.0h Ord'}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${
                  guaranteedTarget > 0 && payslip.guaranteedHoursShortfall > 0
                    ? 'bg-amber-500'
                    : 'bg-indigo-600'
                }`}
                style={{ width: `${ordinaryProgressPct}%` }}
              />
            </div>
            {payslip.guaranteedHoursShortfall > 0 && (
              <p className="mt-1 text-[11px] font-semibold text-amber-700">
                +{payslip.guaranteedHoursShortfall.toFixed(2)}h Guaranteed Hours Top-Up added
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Base, Penalties &amp; OT
            </span>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            ${(payslip.grossBaseAndPenaltyPay + payslip.grossOvertimePay).toFixed(2)}
          </div>
          <div className="mt-2 space-y-0.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Base &amp; Penalties:</span>
              <span className="font-semibold text-slate-900">
                ${payslip.grossBaseAndPenaltyPay.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Overtime:</span>
              <span className="font-semibold text-orange-700">
                ${payslip.grossOvertimePay.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Total Allowances &amp; Super
            </span>
            <ShieldCheck className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            ${payslip.totalAllowances.toFixed(2)}
          </div>
          <div className="mt-2 space-y-0.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Non-taxable / Taxable:</span>
              <span className="font-medium text-slate-800">
                ${payslip.nonTaxableAllowances.toFixed(2)} / ${payslip.taxableAllowances.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Super ({(config.superRate * 100).toFixed(1)}% on OTE):</span>
              <span className="font-semibold text-teal-700">
                ${payslip.superannuation.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-600 to-indigo-700 p-4 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-100">
              Gross &amp; Est. Net Pay
            </span>
            <label className="no-print inline-flex cursor-pointer items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold">
              <input
                type="checkbox"
                checked={config.claimTaxFreeThreshold}
                onChange={(e) => onToggleTaxFreeThreshold(e.target.checked)}
                className="h-3 w-3 accent-emerald-400"
              />
              Tax-Free Threshold
            </label>
          </div>
          <div className="mt-2 text-2xl font-bold">${payslip.totalGrossPay.toFixed(2)}</div>
          <div className="mt-2 space-y-0.5 text-xs text-indigo-100">
            <div className="flex justify-between">
              <span>Est. PAYG Tax:</span>
              <span className="font-semibold text-white">
                -${payslip.estimatedTaxWithheld.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between border-t border-white/20 pt-1 text-sm font-bold text-white">
              <span>Est. Net Pay:</span>
              <span>${payslip.estimatedNetPay.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Container */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('PAYSLIP')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'PAYSLIP'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Itemized Payslip ({payslip.groupedRows.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('CHECKER')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'CHECKER'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <Scale className="h-3.5 w-3.5" />
              Discrepancy / Payslip Checker
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('AUDIT')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'AUDIT'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              14-Day Audit Log
            </button>
          </div>
          <span className="text-[11px] text-slate-500">
            OTE Base: <strong>${payslip.oteBase.toFixed(2)}</strong> • Super Rate:{' '}
            <strong>{(config.superRate * 100).toFixed(1)}%</strong>
          </span>
        </div>

        {/* Tab 1: Itemized Payslip */}
        {activeTab === 'PAYSLIP' && (
          <div className="overflow-x-auto">
            {payslip.groupedRows.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No pay items yet. Click any day on the 14-day calendar above or click{' '}
                <strong>Load Demo Test Fortnight</strong> to inspect the itemized payslip.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Pay Code / Description</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Clause</th>
                    <th className="px-4 py-3 text-right">Units</th>
                    <th className="px-4 py-3 text-right">Base Rate</th>
                    <th className="px-4 py-3 text-right">Multiplier</th>
                    <th className="px-4 py-3 text-center">OTE</th>
                    <th className="px-4 py-3 text-right">Total ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payslip.groupedRows.map((row, idx) => (
                    <tr key={`${row.code}-${idx}`} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 font-semibold text-slate-900">{row.label}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            row.category === 'OVERTIME'
                              ? 'bg-orange-100 text-orange-800'
                              : row.category === 'PENALTY'
                                ? 'bg-indigo-100 text-indigo-800'
                                : row.category === 'ALLOWANCE'
                                  ? 'bg-teal-100 text-teal-800'
                                  : row.category === 'TOPUP'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.category}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{row.clauseRef}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                        {row.units.toFixed(2)} {row.unitLabel}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                        ${row.rate.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                        {(row.multiplier * 100).toFixed(1).replace(/\.0$/, '')}%
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {row.isOte ? (
                          <span className="text-emerald-600 font-bold">✓</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                        ${row.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                    <td colSpan={7} className="px-4 py-3 text-right text-sm">
                      Total Fortnightly Gross Pay
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-base text-emerald-700">
                      ${payslip.totalGrossPay.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Discrepancy / Payslip Checker */}
        {activeTab === 'CHECKER' && (
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
                  Actual Paid Gross from Employer Payslip ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="e.g. 1250.00"
                  value={actualPaidInput}
                  onChange={(e) => setActualPaidInput(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base font-bold text-slate-900 outline-none focus:border-indigo-500"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Compare your employer&apos;s payslip gross against the EA calculation ($
                  {payslip.totalGrossPay.toFixed(2)}).
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
                {variance === null ? (
                  <div className="flex h-full items-center text-sm text-slate-500">
                    Enter your employer&apos;s <strong>Actual Paid Gross ($)</strong> on the left
                    to compute exact dollar variance and highlight likely missing award clauses.
                  </div>
                ) : Math.abs(variance) < 0.05 ? (
                  <div className="flex items-start gap-3 text-emerald-800">
                    <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    <div>
                      <div className="text-base font-bold">Exact Match ($0.00 variance)</div>
                      <p className="mt-1 text-xs text-emerald-700">
                        Your employer&apos;s payslip matches the Calvary EA / SCHADS calculation.
                      </p>
                    </div>
                  </div>
                ) : variance > 0 ? (
                  <div className="flex items-start gap-3 text-rose-900">
                    <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
                    <div>
                      <div className="text-base font-bold">
                        Potential Underpayment of ${variance.toFixed(2)}
                      </div>
                      <p className="mt-1 text-xs text-rose-700">
                        Calculated EA Gross (${payslip.totalGrossPay.toFixed(2)}) exceeds Actual
                        Paid (${actualPaidNum?.toFixed(2)}) by{' '}
                        <strong>${variance.toFixed(2)}</strong>. Review the triggered clauses below.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 text-sky-900">
                    <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-sky-600" />
                    <div>
                      <div className="text-base font-bold">
                        Paid Above Award by ${Math.abs(variance).toFixed(2)}
                      </div>
                      <p className="mt-1 text-xs text-sky-700">
                        Actual Paid (${actualPaidNum?.toFixed(2)}) is higher than the minimum EA
                        calculation (${payslip.totalGrossPay.toFixed(2)}).
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                Active Award Clauses Triggered This Fortnight (Common Variance Sources)
              </h4>
              {payslip.discrepancyHints.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No special penalty/allowance clauses triggered in the current fortnight.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {payslip.discrepancyHints.map((hint, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-800">
                          {hint.clauseRef}
                        </span>
                        <span className="font-mono text-sm font-bold text-slate-900">
                          ${hint.estimatedAmount.toFixed(2)}
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs font-bold text-slate-800">{hint.title}</div>
                      <p className="mt-1 text-xs text-slate-600">{hint.explanation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: 14-Day Audit Log */}
        {activeTab === 'AUDIT' && (
          <div className="divide-y divide-slate-100">
            {payslip.days.map((day, idx) => (
              <div
                key={day.date}
                className="flex flex-col justify-between gap-2 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectDay(idx)}
                      className="text-xs font-bold text-indigo-700 hover:underline"
                    >
                      {FULL_DAY_NAMES[day.dayOfWeek]}, {formatDisplayDate(day.date)}
                    </button>
                    {day.badges.map((b) => (
                      <span
                        key={b}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                  {day.autoDetectionMessages.length > 0 && (
                    <div className="space-y-0.5 text-[11px] text-slate-600">
                      {day.autoDetectionMessages.map((m, mi) => (
                        <div key={mi}>• {m}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 text-right text-xs">
                  <div>
                    <div className="text-slate-500">Worked / OT</div>
                    <div className="font-semibold text-slate-800">
                      {day.workedHours.toFixed(2)}h / {day.overtimeHours.toFixed(2)}h
                    </div>
                  </div>
                  <div className="min-w-[80px]">
                    <div className="text-slate-500">Day Gross</div>
                    <div className="font-mono font-bold text-emerald-700">
                      ${day.grossPay.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

