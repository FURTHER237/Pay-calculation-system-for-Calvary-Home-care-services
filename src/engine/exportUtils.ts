import { FortnightPeriod, PayrollConfig, PayslipResult } from '../types/payroll';

function csvEscape(val: string | number): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function generatePayslipCsv(
  fortnight: FortnightPeriod,
  config: PayrollConfig,
  payslip: PayslipResult
): string {
  const lines: string[] = [];
  lines.push('Calvary Home Care Services - Fortnightly Award Payroll & Audit Report');
  lines.push(`Classification,SW Level 2B Pay Point 2 (${config.employmentType})`);
  lines.push(`Period,${fortnight.startDate} to ${fortnight.endDate}`);
  lines.push(`Ordinary Hourly Rate,$${config.ordinaryRate.toFixed(2)}`);
  lines.push(`Contracted Guaranteed Hours,${config.contractedGuaranteedHours.toFixed(2)}`);
  lines.push('');

  lines.push('SUMMARY');
  lines.push(`Total Worked Hours,${payslip.totalWorkedHours.toFixed(2)}`);
  lines.push(`Total Ordinary + Travel Hours,${payslip.totalOrdinaryAndTravelHours.toFixed(2)}`);
  lines.push(`Total Overtime Hours,${payslip.totalOvertimeHours.toFixed(2)}`);
  lines.push(`Gross Base & Penalties,$${payslip.grossBaseAndPenaltyPay.toFixed(2)}`);
  lines.push(`Gross Overtime,$${payslip.grossOvertimePay.toFixed(2)}`);
  lines.push(`Total Allowances,$${payslip.totalAllowances.toFixed(2)}`);
  lines.push(`Total Gross Pay,$${payslip.totalGrossPay.toFixed(2)}`);
  lines.push(`OTE Base,$${payslip.oteBase.toFixed(2)}`);
  lines.push(`Superannuation (${(config.superRate * 100).toFixed(1)}%),$${payslip.superannuation.toFixed(2)}`);
  lines.push(`Estimated PAYG Tax Withheld,$${payslip.estimatedTaxWithheld.toFixed(2)}`);
  lines.push(`Estimated Net Pay,$${payslip.estimatedNetPay.toFixed(2)}`);
  lines.push('');

  lines.push('ITEMIZED PAYSLIP BREAKDOWN');
  lines.push('Pay Code,Description,Category,Clause,Units,Unit,Base Rate,Multiplier,Total ($)');
  for (const row of payslip.groupedRows) {
    lines.push(
      [
        row.code,
        row.label,
        row.category,
        row.clauseRef,
        row.units.toFixed(2),
        row.unitLabel,
        row.rate.toFixed(2),
        `${(row.multiplier * 100).toFixed(1)}%`,
        row.amount.toFixed(2),
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  lines.push('');

  lines.push('DAILY SHIFT & AUDIT LOG');
  lines.push('Date,Worked Hrs,Ordinary Hrs,Travel Hrs,OT Hrs,Daily Gross ($),Triggers & Flags');
  for (const day of payslip.days) {
    const notes = [...day.badges, ...day.autoDetectionMessages].join(' | ');
    lines.push(
      [
        day.date,
        day.workedHours.toFixed(2),
        day.ordinaryNonTravelHours.toFixed(2),
        day.travelHours.toFixed(2),
        day.overtimeHours.toFixed(2),
        day.grossPay.toFixed(2),
        notes,
      ]
        .map(csvEscape)
        .join(',')
    );
  }

  return lines.join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

