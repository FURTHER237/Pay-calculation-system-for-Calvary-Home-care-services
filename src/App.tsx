import React, { useEffect, useMemo, useState } from 'react';
import { AuditExportModal } from './components/AuditExportModal';
import { CalendarGrid } from './components/CalendarGrid';
import { DayEditorModal } from './components/DayEditorModal';
import { HeaderBar } from './components/HeaderBar';
import { PayslipDashboard } from './components/PayslipDashboard';
import { PrintablePayslip } from './components/PrintablePayslip';
import { SettingsDrawer } from './components/SettingsDrawer';
import { calculateFortnight } from './engine/calculator';
import { DEFAULT_PAYROLL_CONFIG } from './engine/constants';
import { createDemoTestFortnight } from './engine/demoFortnight';
import { downloadTextFile, generatePayslipCsv } from './engine/exportUtils';
import { parseTimesheetToFortnight } from './engine/timesheetParser';
import { createEmptyFortnight, getMondayOfWeek } from './engine/timeUtils';
import { DayRecord, FortnightPeriod, PayrollConfig } from './types/payroll';

const STORAGE_KEY_FORTNIGHT = 'calvary_payroll_fortnight_v1';
const STORAGE_KEY_SAVED_FORTNIGHTS = 'calvary_payroll_saved_fortnights_v1';
const STORAGE_KEY_CONFIG = 'calvary_payroll_config_v1';

function isValidFortnight(val: unknown): val is FortnightPeriod {
  return Boolean(
    val &&
      typeof val === 'object' &&
      typeof (val as FortnightPeriod).startDate === 'string' &&
      Array.isArray((val as FortnightPeriod).days) &&
      (val as FortnightPeriod).days.length === 14
  );
}

function loadInitialConfig(): PayrollConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_PAYROLL_CONFIG,
        ...parsed,
        allowances: {
          ...DEFAULT_PAYROLL_CONFIG.allowances,
          ...(parsed.allowances ?? {}),
        },
      };
    }
  } catch {
    // ignore corrupted localStorage
  }
  return DEFAULT_PAYROLL_CONFIG;
}

function loadInitialFortnight(): FortnightPeriod {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FORTNIGHT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidFortnight(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore corrupted localStorage
  }
  return createEmptyFortnight(getMondayOfWeek());
}

function loadInitialSavedFortnights(
  active: FortnightPeriod
): Record<string, FortnightPeriod> {
  const result: Record<string, FortnightPeriod> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SAVED_FORTNIGHTS);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        for (const value of Object.values(parsed)) {
          if (isValidFortnight(value)) {
            result[value.startDate] = value;
          }
        }
      }
    }
  } catch {
    // ignore corrupted localStorage
  }
  result[active.startDate] = active;
  return result;
}

export const App: React.FC = () => {
  const [config, setConfig] = useState<PayrollConfig>(loadInitialConfig);
  const [fortnight, setFortnight] = useState<FortnightPeriod>(loadInitialFortnight);
  const [savedFortnights, setSavedFortnights] = useState<Record<string, FortnightPeriod>>(() =>
    loadInitialSavedFortnights(loadInitialFortnight())
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuditExportOpen, setIsAuditExportOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
    } catch {
      // ignore storage quota errors
    }
  }, [config]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_FORTNIGHT, JSON.stringify(fortnight));
    } catch {
      // ignore storage quota errors
    }
    setSavedFortnights((prev) => {
      if (prev[fortnight.startDate] === fortnight) return prev;
      return {
        ...prev,
        [fortnight.startDate]: fortnight,
      };
    });
  }, [fortnight]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SAVED_FORTNIGHTS, JSON.stringify(savedFortnights));
    } catch {
      // ignore storage quota errors
    }
  }, [savedFortnights]);

  const savedFortnightList = useMemo(
    () =>
      Object.values(savedFortnights).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [savedFortnights]
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const payslip = useMemo(() => calculateFortnight(fortnight, config), [fortnight, config]);

  const handleChangeStartDate = (newStartDate: string) => {
    if (newStartDate === fortnight.startDate) return;
    setSelectedDayIndex(null);

    const existing = savedFortnights[newStartDate];
    if (existing) {
      setFortnight(existing);
      showToast(`Loaded saved fortnight (${existing.startDate} to ${existing.endDate}).`);
      return;
    }

    const currentHasData =
      fortnight.days.some((d) => d.workBlocks.length > 0 || d.isPublicHoliday) ||
      (fortnight.cashedOutAnnualLeaveHours ?? 0) > 0;

    if (!currentHasData) {
      // Replace empty placeholder period with the newly chosen start date
      setSavedFortnights((prev) => {
        const next = { ...prev };
        delete next[fortnight.startDate];
        return next;
      });
    }

    const created = createEmptyFortnight(newStartDate);
    setFortnight(created);
    if (currentHasData) {
      showToast(
        `Opened fortnight ${created.startDate} (previous fortnight kept in Saved Pay Periods).`
      );
    }
  };

  const handleSwitchFortnight = (startDate: string) => {
    const target = savedFortnights[startDate];
    if (target) {
      setSelectedDayIndex(null);
      setFortnight(target);
      showToast(`Switched to fortnight ${target.startDate} to ${target.endDate}.`);
    }
  };

  const handleDeleteFortnight = (startDate: string) => {
    const keys = Object.keys(savedFortnights).sort();
    if (keys.length <= 1) return;
    const remainingKeys = keys.filter((k) => k !== startDate);
    const nextMap = { ...savedFortnights };
    delete nextMap[startDate];
    setSavedFortnights(nextMap);
    if (fortnight.startDate === startDate) {
      setSelectedDayIndex(null);
      setFortnight(nextMap[remainingKeys[remainingKeys.length - 1]]);
    }
    showToast(`Removed saved fortnight starting ${startDate}.`);
  };

  const handleUpdateDay = (dayIndex: number, updater: (prev: DayRecord) => DayRecord) => {
    setFortnight((prev) => ({
      ...prev,
      days: prev.days.map((d, idx) => (idx === dayIndex ? updater(d) : d)),
    }));
  };

  const handleTogglePublicHoliday = (dayIndex: number) => {
    handleUpdateDay(dayIndex, (prev) => ({
      ...prev,
      isPublicHoliday: !prev.isPublicHoliday,
    }));
  };

  const handleLoadDemo = () => {
    setFortnight(createDemoTestFortnight(fortnight.startDate));
    showToast('Loaded Demo Test Fortnight (4 award verification scenarios active).');
  };

  const handleClearFortnight = () => {
    setFortnight(createEmptyFortnight(fortnight.startDate));
    setSelectedDayIndex(null);
    showToast('Cleared all shifts in current fortnight.');
  };

  const handleExportJson = () => {
    const payload = JSON.stringify({ config, fortnight }, null, 2);
    downloadTextFile(
      `calvary-payroll-${fortnight.startDate}.json`,
      payload,
      'application/json'
    );
    showToast('Exported fortnight JSON backup.');
  };

  const handleImportFiles = async (files: FileList) => {
    let importedPeriods = 0;
    let lastFortnight: FortnightPeriod | null = null;
    let importedConfig: PayrollConfig | null = null;
    const newlyImported: Record<string, FortnightPeriod> = {};

    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const trimmed = text.trim();
        const isCsvOrTsv =
          /\.(csv|tsv|txt)$/i.test(file.name) ||
          (!trimmed.startsWith('{') && !trimmed.startsWith('['));

        if (isCsvOrTsv) {
          const res = parseTimesheetToFortnight(text);
          newlyImported[res.fortnight.startDate] = res.fortnight;
          lastFortnight = res.fortnight;
          importedPeriods++;
          continue;
        }

        const parsed = JSON.parse(text);
        if (isValidFortnight(parsed.fortnight)) {
          newlyImported[parsed.fortnight.startDate] = parsed.fortnight;
          lastFortnight = parsed.fortnight;
          importedPeriods++;
        } else if (isValidFortnight(parsed)) {
          newlyImported[parsed.startDate] = parsed;
          lastFortnight = parsed;
          importedPeriods++;
        } else if (Array.isArray(parsed.fortnights)) {
          for (const item of parsed.fortnights) {
            if (isValidFortnight(item)) {
              newlyImported[item.startDate] = item;
              lastFortnight = item;
              importedPeriods++;
            }
          }
        }

        if (parsed.config) {
          importedConfig = {
            ...DEFAULT_PAYROLL_CONFIG,
            ...parsed.config,
            allowances: {
              ...DEFAULT_PAYROLL_CONFIG.allowances,
              ...(parsed.config.allowances ?? {}),
            },
          };
        }
      } catch {
        // skip invalid file and report summary below
      }
    }

    if (importedPeriods === 0) {
      showToast('Could not parse imported JSON or CSV/TSV file(s).');
      return;
    }

    setSavedFortnights((prev) => ({ ...prev, ...newlyImported }));
    if (lastFortnight) {
      setSelectedDayIndex(null);
      setFortnight(lastFortnight);
    }
    if (importedConfig) {
      setConfig(importedConfig);
    }
    showToast(
      `Imported ${importedPeriods} pay period${importedPeriods > 1 ? 's' : ''} into Saved Pay Periods.`
    );
  };

  const handleExportCsv = () => {
    const csv = generatePayslipCsv(fortnight, config, payslip);
    downloadTextFile(
      `calvary-payslip-audit-${fortnight.startDate}.csv`,
      csv,
      'text/csv;charset=utf-8;'
    );
    showToast('Exported CSV payslip & audit report.');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <HeaderBar
        startDate={fortnight.startDate}
        config={config}
        savedPeriodCount={savedFortnightList.length}
        onChangeStartDate={handleChangeStartDate}
        onLoadDemo={handleLoadDemo}
        onClearFortnight={handleClearFortnight}
        onExportJson={handleExportJson}
        onImportFiles={handleImportFiles}
        onExportCsv={handleExportCsv}
        onOpenAuditExport={() => setIsAuditExportOpen(true)}
        onPrint={() => window.print()}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {toastMessage && (
        <div className="no-print fixed bottom-5 right-5 z-50 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-lg">
          {toastMessage}
        </div>
      )}

      <main className="no-print mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6">
        <CalendarGrid
          days={fortnight.days}
          payslip={payslip}
          selectedDayIndex={selectedDayIndex}
          onSelectDay={(idx) => setSelectedDayIndex(idx)}
          onTogglePublicHoliday={handleTogglePublicHoliday}
        />

        <PayslipDashboard
          payslip={payslip}
          config={config}
          reassignedMakeUpHours={fortnight.reassignedMakeUpHours ?? 0}
          onChangeReassignedMakeUpHours={(hours) =>
            setFortnight((prev) => ({ ...prev, reassignedMakeUpHours: hours }))
          }
          cashedOutAnnualLeaveHours={fortnight.cashedOutAnnualLeaveHours ?? 0}
          onChangeCashedOutAnnualLeaveHours={(hours) =>
            setFortnight((prev) => ({ ...prev, cashedOutAnnualLeaveHours: hours }))
          }
          onToggleShiftworkerForLeave={(val) =>
            setConfig((prev) => ({ ...prev, isShiftworkerForLeave: val }))
          }
          onToggleTaxFreeThreshold={(val) =>
            setConfig((prev) => ({ ...prev, claimTaxFreeThreshold: val }))
          }
          onSelectDay={(idx) => setSelectedDayIndex(idx)}
          onOpenAuditExport={() => setIsAuditExportOpen(true)}
          savedPeriodCount={savedFortnightList.length}
        />
      </main>

      <PrintablePayslip fortnight={fortnight} config={config} payslip={payslip} />

      {selectedDayIndex !== null && (
        <DayEditorModal
          dayIndex={selectedDayIndex}
          day={fortnight.days[selectedDayIndex]}
          calc={payslip.days[selectedDayIndex]}
          employmentType={config.employmentType}
          onUpdateDay={handleUpdateDay}
          onNavigateDay={(nextIdx) => {
            if (nextIdx >= 0 && nextIdx < 14) setSelectedDayIndex(nextIdx);
          }}
          onClose={() => setSelectedDayIndex(null)}
        />
      )}

      {isSettingsOpen && (
        <SettingsDrawer
          config={config}
          onChangeConfig={setConfig}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {isAuditExportOpen && (
        <AuditExportModal
          savedFortnights={savedFortnightList}
          activeStartDate={fortnight.startDate}
          config={config}
          onSwitchFortnight={handleSwitchFortnight}
          onDeleteFortnight={handleDeleteFortnight}
          onImportFiles={handleImportFiles}
          onExported={(filename, count) => {
            setIsAuditExportOpen(false);
            showToast(
              `Downloaded ${filename} (${count} pay period${count === 1 ? '' : 's'}).`
            );
          }}
          onClose={() => setIsAuditExportOpen(false)}
        />
      )}
    </div>
  );
};

export default App;

