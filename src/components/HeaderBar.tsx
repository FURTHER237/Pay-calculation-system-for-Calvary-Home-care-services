import React, { useRef } from 'react';
import {
  Calendar,
  Download,
  FileJson,
  FileSpreadsheet,
  FlaskConical,
  Printer,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import { PayrollConfig } from '../types/payroll';

interface HeaderBarProps {
  startDate: string;
  config: PayrollConfig;
  savedPeriodCount: number;
  onChangeStartDate: (newStartDate: string) => void;
  onLoadDemo: () => void;
  onClearFortnight: () => void;
  onExportJson: () => void;
  onImportFiles: (files: FileList) => void;
  onExportCsv: () => void;
  onOpenAuditExport: () => void;
  onPrint: () => void;
  onOpenSettings: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  startDate,
  config,
  savedPeriodCount,
  onChangeStartDate,
  onLoadDemo,
  onClearFortnight,
  onExportJson,
  onImportFiles,
  onExportCsv,
  onOpenAuditExport,
  onPrint,
  onOpenSettings,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                Calvary Home Care Payroll Engine
              </h1>
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-600/15">
                SW L2B PP2 • {config.employmentType === 'PT' ? 'Part-Time' : 'Full-Time'}
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/15">
                ${config.ordinaryRate.toFixed(2)}/hr
              </span>
            </div>
            <p className="text-xs text-slate-500">
              EA &amp; SCHADS Award Calculator • 14-Day Fortnight Roster &amp; Payslip Auditor
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700">
            <span className="text-slate-500">Fortnight Mon:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                if (e.target.value) onChangeStartDate(e.target.value);
              }}
              className="bg-transparent font-semibold text-slate-800 outline-none"
            />
          </label>

          <button
            type="button"
            onClick={onLoadDemo}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            title="Populates all 4 award verification test cases across the fortnight"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Load Demo Test Fortnight
          </button>

          <button
            type="button"
            onClick={onClearFortnight}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            title="Clear all shifts in this fortnight"
          >
            <Trash2 className="h-3.5 w-3.5 text-slate-500" />
            Clear
          </button>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            title="Import JSON backup or CSV/TSV timesheet"
          >
            <Upload className="h-3.5 w-3.5 text-slate-500" />
            Import
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

          <button
            type="button"
            onClick={onExportJson}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            title="Export JSON backup"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            JSON
          </button>

          <button
            type="button"
            onClick={onOpenAuditExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
            title="Export Audit Data (audit_expected.json)"
          >
            <FileJson className="h-3.5 w-3.5 text-emerald-600" />
            Audit JSON
            {savedPeriodCount > 1 && (
              <span className="rounded-full bg-emerald-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {savedPeriodCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            title="Export CSV Audit Report"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            CSV
          </button>

          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            title="Print Printable Payslip / Audit View"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            Print
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </button>
        </div>
      </div>
    </header>
  );
};

