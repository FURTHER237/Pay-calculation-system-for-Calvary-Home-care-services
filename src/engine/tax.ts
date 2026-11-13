import { roundCurrency } from './timeUtils';

/**
 * Estimates Australian Resident PAYG Fortnightly Tax Withholding
 * (using 2024-25 / Stage 3 resident income tax rates + 2% Medicare Levy).
 * Note: This is an estimator for payslip budgeting, not official ATO payroll advice.
 */
export function estimateFortnightlyPaygTax(
  taxableFortnightlyIncome: number,
  claimTaxFreeThreshold: boolean
): number {
  if (taxableFortnightlyIncome <= 0) return 0;

  const annualized = taxableFortnightlyIncome * 26;
  let annualTax = 0;

  if (claimTaxFreeThreshold) {
    // Stage 3 Resident Tax Brackets (with $18,200 tax-free threshold)
    if (annualized <= 18200) {
      annualTax = 0;
    } else if (annualized <= 45000) {
      annualTax = (annualized - 18200) * 0.16;
    } else if (annualized <= 135000) {
      annualTax = 4288 + (annualized - 45000) * 0.30;
    } else if (annualized <= 190000) {
      annualTax = 31288 + (annualized - 135000) * 0.37;
    } else {
      annualTax = 51638 + (annualized - 190000) * 0.45;
    }

    // Approximate Low Income Tax Offset (LITO) for realistic take-home estimate
    if (annualized <= 37500) {
      annualTax = Math.max(0, annualTax - 700);
    } else if (annualized <= 45000) {
      annualTax = Math.max(0, annualTax - (700 - (annualized - 37500) * 0.05));
    } else if (annualized <= 66667) {
      annualTax = Math.max(0, annualTax - (325 - (annualized - 45000) * 0.015));
    }

    // Medicare Levy (2%, phased in above ~$26,000)
    let medicare = 0;
    if (annualized > 32500) {
      medicare = annualized * 0.02;
    } else if (annualized > 26000) {
      medicare = (annualized - 26000) * 0.10;
    }
    annualTax += medicare;
  } else {
    // Scale 1 (No Tax-Free Threshold claimed): tax starts from first dollar + 2% Medicare
    if (annualized <= 26800) {
      annualTax = annualized * 0.16;
    } else if (annualized <= 116800) {
      annualTax = 4288 + (annualized - 26800) * 0.30;
    } else if (annualized <= 171800) {
      annualTax = 31288 + (annualized - 116800) * 0.37;
    } else {
      annualTax = 51638 + (annualized - 171800) * 0.45;
    }
    annualTax += annualized * 0.02;
  }

  return roundCurrency(annualTax / 26);
}

