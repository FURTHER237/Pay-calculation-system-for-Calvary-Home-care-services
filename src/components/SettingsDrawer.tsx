import React, { useEffect } from 'react';
import { RotateCcw, Settings, X } from 'lucide-react';
import { DEFAULT_PAYROLL_CONFIG, RATE_PRESETS } from '../engine/constants';
import { EmploymentType, PayrollConfig } from '../types/payroll';

interface SettingsDrawerProps {
  config: PayrollConfig;
  onChangeConfig: (next: PayrollConfig) => void;
  onClose: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  config,
  onChangeConfig,
  onClose,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const updateAllowance = (key: keyof PayrollConfig['allowances'], value: number) => {
    onChangeConfig({
      ...config,
      allowances: {
        ...config.allowances,
        [key]: Math.max(0, value),
      },
    });
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Award &amp; Allowance Settings</h2>
              <p className="text-xs text-slate-500">
                SW Level 2B Pay Point 2 • Calvary EA / SCHADS Indexation
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

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Employment & Rate */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
              Employment &amp; Base Rate
            </h3>

            <div className="grid grid-cols-2 gap-2">
              {(['PT', 'FT'] as EmploymentType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    onChangeConfig({
                      ...config,
                      employmentType: type,
                      contractedGuaranteedHours:
                        type === 'FT' && config.contractedGuaranteedHours === 0
                          ? 76
                          : config.contractedGuaranteedHours,
                    })
                  }
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                    config.employmentType === type
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {type === 'PT' ? 'Part-Time (PT)' : 'Full-Time (FT)'}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Ordinary Hourly Rate ($)
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {RATE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => onChangeConfig({ ...config, ordinaryRate: preset.value })}
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                      Math.abs(config.ordinaryRate - preset.value) < 0.005
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    ${preset.value.toFixed(2)}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={0}
                step={0.01}
                value={config.ordinaryRate}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    ordinaryRate: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-bold text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-slate-600">Guaranteed Hrs (Fortnight)</span>
                <input
                  type="number"
                  min={0}
                  max={76}
                  step={0.5}
                  value={config.contractedGuaranteedHours}
                  onChange={(e) =>
                    onChangeConfig({
                      ...config,
                      contractedGuaranteedHours: Math.min(
                        76,
                        Math.max(0, Number(e.target.value) || 0)
                      ),
                    })
                  }
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-900"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-slate-600">Superannuation Rate (%)</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={0.5}
                  value={Number((config.superRate * 100).toFixed(2))}
                  onChange={(e) =>
                    onChangeConfig({
                      ...config,
                      superRate: Math.max(0, (Number(e.target.value) || 0) / 100),
                    })
                  }
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-900"
                />
              </label>
            </div>

            <div className="flex flex-col gap-2 pt-1 text-xs">
              <label className="inline-flex items-center gap-2 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={config.firstAidEnabled}
                  onChange={(e) =>
                    onChangeConfig({ ...config, firstAidEnabled: e.target.checked })
                  }
                  className="h-4 w-4 accent-indigo-600"
                />
                First Aid Allowance Eligible (${config.allowances.firstAidWeekly.toFixed(2)}/wk FT,
                pro-rata /38h PT)
              </label>
              <label className="inline-flex items-center gap-2 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={config.claimTaxFreeThreshold}
                  onChange={(e) =>
                    onChangeConfig({ ...config, claimTaxFreeThreshold: e.target.checked })
                  }
                  className="h-4 w-4 accent-indigo-600"
                />
                Claim Australian Tax-Free Threshold ($18,200)
              </label>
              <label className="inline-flex items-center gap-2 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={config.isShiftworkerForLeave}
                  onChange={(e) =>
                    onChangeConfig({ ...config, isShiftworkerForLeave: e.target.checked })
                  }
                  className="h-4 w-4 accent-indigo-600"
                />
                Shiftworker for 5-Wk Annual Leave (Cl 29(c): &gt;4h on ≥10 wkends OR ≥8×24h care)
              </label>
              <label className="flex flex-col gap-1 pt-1 text-xs">
                <span className="font-medium text-slate-600">
                  Prior 4-Week Avg Uniform Allowance on Leave-Only Weeks ($0 = $1.23/shift, max $
                  {config.allowances.uniformWeeklyCap.toFixed(2)}/wk)
                </span>
                <input
                  type="number"
                  min={0}
                  max={config.allowances.uniformWeeklyCap}
                  step={0.01}
                  value={config.prior4WeekAverageUniformAllowance}
                  onChange={(e) =>
                    onChangeConfig({
                      ...config,
                      prior4WeekAverageUniformAllowance: Math.min(
                        config.allowances.uniformWeeklyCap,
                        Math.max(0, Number(e.target.value) || 0)
                      ),
                    })
                  }
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-900"
                />
              </label>
            </div>
          </div>

          {/* Allowance Rates */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                EA / SCHADS Allowance Rates
              </h3>
              <button
                type="button"
                onClick={() => onChangeConfig(DEFAULT_PAYROLL_CONFIG)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
              >
                <RotateCcw className="h-3 w-3" /> Reset Defaults
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {(
                [
                  ['brokenShift1Break', 'Broken Shift (1 Break) $'],
                  ['brokenShift2Breaks', 'Broken Shift (2 Breaks) $'],
                  ['sleepoverAllowance', 'Sleepover (per night) $'],
                  ['mileageRate', 'Mileage Rate ($/km)'],
                  ['onCallWeekday', 'On-Call Weekday (24h) $'],
                  ['onCallWeekendPh', 'On-Call Weekend/PH (24h) $'],
                  ['overtimeMealAllowance', 'OT Meal Allowance $'],
                  ['clinicalAssistanceAllowance', 'Clinical Assist ($/hr)'],
                  ['uniformPerShift', 'Uniform (per shift) $'],
                  ['uniformWeeklyCap', 'Uniform Weekly Cap $'],
                  ['laundryPerShift', 'Laundry (per shift) $'],
                  ['laundryWeeklyCap', 'Laundry Weekly Cap $'],
                  ['firstAidWeekly', 'First Aid Weekly $'],
                ] as Array<[keyof PayrollConfig['allowances'], string]>
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-slate-600">{label}</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={config.allowances[key]}
                    onChange={(e) => updateAllowance(key, Number(e.target.value) || 0)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

