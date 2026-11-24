import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarRange,
  CheckCircle2,
  Code2,
  Download,
  FileJson,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { buildAuditExpectedExport } from '../engine/auditExport';
import { downloadTextFile } from '../engine/exportUtils';
import { FortnightPeriod, PayrollConfig } from '../types/payroll';

interface AuditExportModalProps {
  savedFortnights: FortnightPeriod[];
  activeStartDate: string;
  config: PayrollConfig;
  onSwitchFortnight: (startDate: string) => void;
  onDeleteFortnight: (startDate: string) => void;
  onImportFiles: (files: FileList) => void;
  onExported: (filename: string, periodCount: number) => void;
  onClose: () => void;
}

function getLocalIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const AuditExportModal: React.FC<AuditExportModalProps> = ({
  savedFortnights,
  activeStartDate,
  config,
  onSwitchFortnight,
  onDeleteFortnight,
  onImportFiles,
  onExported,
  onClose,
}) => {
  const sortedFortnights = useMemo(
    () => [...savedFortnights].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [savedFortnights]
  );

  const [scope, setScope] = useState<'ALL' | 'RANGE'>('ALL');
  const [rangeStart, setRangeStart] = useState<string>(
    sortedFortnights[0]?.startDate ?? activeStartDate
  );
  const [rangeEnd, setRangeEnd] = useState<string>(
    sortedFortnights[sortedFortnights.length - 1]?.startDate ?? activeStartDate
  );
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (sortedFortnights.length === 0) return;
    if (!sortedFortnights.some((f) => f.startDate === rangeStart)) {
      setRangeStart(sortedFortnights[0].startDate);
    }
    if (!sortedFortnights.some((f) => f.startDate === rangeEnd)) {
      setRangeEnd(sortedFortnights[sortedFortnights.length - 1].startDate);
    }
  }, [sortedFortnights, rangeStart, rangeEnd]);

  const effectiveFrom = scope === 'RANGE' ? (rangeStart <= rangeEnd ? rangeStart : rangeEnd) : undefined;
  const effectiveTo = scope === 'RANGE' ? (rangeStart <= rangeEnd ? rangeEnd : rangeStart) : undefined;

  const auditPayload = useMemo(
    () =>
      buildAuditExpectedExport(sortedFortnights, config, {
        startDateFrom: effectiveFrom,
        startDateTo: effectiveTo,
      }),
    [sortedFortnights, config, effectiveFrom, effectiveTo]
  );

  const totalGross = useMemo(
    () => auditPayload.payPeriods.reduce((s, p) => s + p.summary.expectedGrossTotal, 0),
    [auditPayload]
  );
  const totalSuper = useMemo(
    () => auditPayload.payPeriods.reduce((s, p) => s + p.summary.expectedSuperannuation, 0),
    [auditPayload]
  );
  const totalLineItems = useMemo(
    () => auditPayload.payPeriods.reduce((s, p) => s + p.lineItems.length, 0),
    [auditPayload]
  );

  const filename = `audit_expected_${getLocalIsoDate()}.json`;

  const handleDownload = () => {
    const freshPayload = buildAuditExpectedExport(sortedFortnights, config, {
      exportedAt: new Date().toISOString(),
      startDateFrom: effectiveFrom,
      startDateTo: effectiveTo,
    });
    downloadTextFile(filename, JSON.stringify(freshPayload, null, 2), 'application/json');
    onExported(filename, freshPayload.payPeriods.length);
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <FileJson className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Export Audit Data (Canonical JSON)
              </h2>
              <p className="text-xs text-slate-500">
                Schema v1.0.0 • Dynamic runtime calculations for PDF payslip comparison
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Scope Selector */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-700">
                <CalendarRange className="h-4 w-4 text-indigo-600" />
                Export Period Scope
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <Upload className="h-3.5 w-3.5" />
                Add / Import Fortnights (JSON/CSV)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".json,.csv,.tsv,.txt,application/json,text/csv,text/tab-separated-values"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onImportFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setScope('ALL')}
                className={`rounded-xl border p-3 text-left transition ${
                  scope === 'ALL'
                    ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-bold text-slate-900">
                  All Saved Pay Periods ({sortedFortnights.length})
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Exports all stored fortnights sorted chronologically by start date.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setScope('RANGE')}
                className={`rounded-xl border p-3 text-left transition ${
                  scope === 'RANGE'
                    ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-bold text-slate-900">Selected Pay Period Range</div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Choose start fortnight through end fortnight to include.
                </div>
              </button>
            </div>

            {scope === 'RANGE' && sortedFortnights.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-slate-600">From Fortnight</span>
                  <select
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                  >
                    {sortedFortnights.map((f) => (
                      <option key={f.startDate} value={f.startDate}>
                        {f.startDate} to {f.endDate}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-slate-600">To Fortnight</span>
                  <select
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                  >
                    {sortedFortnights.map((f) => (
                      <option key={f.startDate} value={f.startDate}>
                        {f.startDate} to {f.endDate}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          {/* Export Summary Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Periods</div>
              <div className="mt-1 font-mono text-lg font-bold text-slate-900">
                {auditPayload.payPeriods.length}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-slate-500">
                Total Expected Gross
              </div>
              <div className="mt-1 font-mono text-lg font-bold text-emerald-700">
                ${totalGross.toFixed(2)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-slate-500">
                Total Expected Super
              </div>
              <div className="mt-1 font-mono text-lg font-bold text-teal-700">
                ${totalSuper.toFixed(2)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-slate-500">
                Canonical Line Items
              </div>
              <div className="mt-1 font-mono text-lg font-bold text-indigo-700">
                {totalLineItems}
              </div>
            </div>
          </div>

          {/* Saved Pay Periods List */}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
              Saved Fortnightly Pay Periods ({sortedFortnights.length})
            </div>
            <div className="divide-y divide-slate-100">
              {sortedFortnights.map((f) => {
                const exportedPeriod = auditPayload.payPeriods.find(
                  (p) => p.startDate === f.startDate
                );
                const isSelected = Boolean(exportedPeriod);
                const isActive = f.startDate === activeStartDate;
                const shiftCount = f.days.reduce((sum, d) => sum + d.workBlocks.length, 0);

                return (
                  <div
                    key={f.startDate}
                    className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs ${
                      isSelected ? 'bg-white' : 'bg-slate-50/70 opacity-60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <CheckCircle2
                        className={`h-4 w-4 ${
                          isSelected ? 'text-emerald-600' : 'text-slate-300'
                        }`}
                      />
                      <span className="font-mono font-bold text-slate-900">
                        {f.startDate} → {f.endDate}
                      </span>
                      {isActive && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                          Active
                        </span>
                      )}
                      <span className="text-slate-500">({shiftCount} blocks)</span>
                    </div>

                    <div className="flex items-center gap-3">
                      {exportedPeriod && (
                        <span className="font-mono font-semibold text-emerald-700">
                          ${exportedPeriod.summary.expectedGrossTotal.toFixed(2)} gross
                        </span>
                      )}
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => onSwitchFortnight(f.startDate)}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Open
                        </button>
                      )}
                      {sortedFortnights.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteFortnight(f.startDate)}
                          title="Remove period from saved list"
                          className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Optional JSON Preview */}
          <div>
            <button
              type="button"
              onClick={() => setShowJsonPreview((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
            >
              <Code2 className="h-3.5 w-3.5" />
              {showJsonPreview ? 'Hide Canonical JSON Preview' : 'Inspect Canonical JSON Preview'}
            </button>
            {showJsonPreview && (
              <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] text-emerald-300">
                {JSON.stringify(auditPayload, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          <span className="font-mono text-[11px] text-slate-500">
            Output file: <strong className="text-slate-800">{filename}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={auditPayload.payPeriods.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Download {filename}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
