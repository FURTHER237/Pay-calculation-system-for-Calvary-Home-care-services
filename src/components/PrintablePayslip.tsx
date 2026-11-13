import React from 'react';
import { FortnightPeriod, PayrollConfig, PayslipResult } from '../types/payroll';

interface PrintablePayslipProps {
  fortnight: FortnightPeriod;
  config: PayrollConfig;
  payslip: PayslipResult;
}

export const PrintablePayslip: React.FC<PrintablePayslipProps> = ({
  fortnight,
  config,
  payslip,
}) => {
  return (
    <div className="print-only hidden p-6 text-black">
      <div className="border-b-2 border-slate-800 pb-3">
        <h1 className="text-xl font-bold">
          Calvary Home Care Services — Award Payroll &amp; Audit Report
        </h1>
        <div className="mt-1 flex flex-wrap gap-6 text-xs">
          <span>
            <strong>Classification:</strong> SW Level 2B, Pay Point 2 ({config.employmentType})
          </span>
          <span>
            <strong>Fortnight Period:</strong> {fortnight.startDate} to {fortnight.endDate}
          </span>
          <span>
            <strong>Ordinary Rate:</strong> ${config.ordinaryRate.toFixed(2)}/hr
          </span>
          <span>
            <strong>Guaranteed Hours:</strong> {config.contractedGuaranteedHours.toFixed(2)}h
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3 border border-slate-300 p-3 text-xs">
        <div>
          <div className="text-slate-600">Total Worked Hours</div>
          <div className="text-sm font-bold">{payslip.totalWorkedHours.toFixed(2)} hrs</div>
        </div>
        <div>
          <div className="text-slate-600">Total Gross Pay</div>
          <div className="text-sm font-bold">${payslip.totalGrossPay.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-slate-600">Superannuation ({(config.superRate * 100).toFixed(1)}%)</div>
          <div className="text-sm font-bold">${payslip.superannuation.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-slate-600">Est. Net Pay</div>
          <div className="text-sm font-bold">${payslip.estimatedNetPay.toFixed(2)}</div>
        </div>
      </div>

      <h2 className="mt-5 mb-2 text-sm font-bold uppercase">Itemized Payslip Breakdown</h2>
      <table className="w-full border-collapse border border-slate-300 text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-1.5 text-left">Description</th>
            <th className="border border-slate-300 px-2 py-1.5 text-left">Clause</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Units</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Rate</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Mult</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Total ($)</th>
          </tr>
        </thead>
        <tbody>
          {payslip.groupedRows.map((row, i) => (
            <tr key={`${row.code}-${i}`}>
              <td className="border border-slate-300 px-2 py-1">{row.label}</td>
              <td className="border border-slate-300 px-2 py-1">{row.clauseRef}</td>
              <td className="border border-slate-300 px-2 py-1 text-right">
                {row.units.toFixed(2)} {row.unitLabel}
              </td>
              <td className="border border-slate-300 px-2 py-1 text-right">
                ${row.rate.toFixed(2)}
              </td>
              <td className="border border-slate-300 px-2 py-1 text-right">
                {(row.multiplier * 100).toFixed(1).replace(/\.0$/, '')}%
              </td>
              <td className="border border-slate-300 px-2 py-1 text-right font-bold">
                ${row.amount.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

