import React, { useEffect, useMemo, useState } from 'react';
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
import { addDaysIso, createEmptyFortnight, getMondayOfWeek } from './engine/timeUtils';
import { DayRecord, FortnightPeriod, PayrollConfig } from './types/payroll';

const STORAGE_KEY_FORTNIGHT = 'calvary_payroll_fortnight_v1';
const STORAGE_KEY_CONFIG = 'calvary_payroll_config_v1';

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
      const parsed = JSON.parse(raw) as FortnightPeriod;
      if (parsed && Array.isArray(parsed.days) && parsed.days.length === 14) {
        return parsed;
      }
    }
  } catch {
    // ignore corrupted localStorage
  }
  return createEmptyFortnight(getMondayOfWeek());
}

export const App: React.FC = () => {
  const [config, setConfig] = useState<PayrollConfig>(loadInitialConfig);
  const [fortnight, setFortnight] = useState<FortnightPeriod>(loadInitialFortnight);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
  }, [fortnight]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const payslip = useMemo(() => calculateFortnight(fortnight, config), [fortnight, config]);

  const handleChangeStartDate = (newStartDate: string) => {
    setFortnight((prev) => ({
      startDate: newStartDate,
      endDate: addDaysIso(newStartDate, 13),
      days: prev.days.map((d, idx) => ({
        ...d,
        date: addDaysIso(newStartDate, idx),
        dayOfWeek: idx % 7,
      })),
    }));
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

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.fortnight && Array.isArray(parsed.fortnight.days) && parsed.fortnight.days.length === 14) {
        setFortnight(parsed.fortnight);
      } else if (Array.isArray(parsed.days) && parsed.days.length === 14) {
        setFortnight(parsed);
      } else {
        showToast('Invalid JSON format: expected 14-day fortnight data.');
        return;
      }
      if (parsed.config) {
        setConfig({
          ...DEFAULT_PAYROLL_CONFIG,
          ...parsed.config,
          allowances: {
            ...DEFAULT_PAYROLL_CONFIG.allowances,
            ...(parsed.config.allowances ?? {}),
          },
        });
      }
      showToast('Imported fortnight & settings from JSON.');
    } catch {
      showToast('Could not parse JSON file.');
    }
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
        onChangeStartDate={handleChangeStartDate}
        onLoadDemo={handleLoadDemo}
        onClearFortnight={handleClearFortnight}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onExportCsv={handleExportCsv}
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
    </div>
  );
};

export default App;

