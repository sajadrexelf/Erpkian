import Decimal from 'decimal.js';
import type { AgingBucketCode, CurrencyCode } from './contracts';
import { normalizeDigits } from './jalali';

Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
});

export function roundHalfEvenIrr(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
}

export function roundPct2(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toNumber();
}

/**
 * VR-CURR-01..04: Explicit currency conversion to canonical IRR.
 * Never silently guesses IRT vs IRR.
 */
export function convertToIrr(params: {
  amount: number | string;
  sourceCurrencyCode: CurrencyCode | null | undefined;
  explicitRateToBase?: number | null;
}): { ok: true; amountIrr: number; rateApplied: number } | { ok: false; code: string; messageFa: string } {
  const { amount, sourceCurrencyCode, explicitRateToBase } = params;
  if (!sourceCurrencyCode) {
    return {
      ok: false,
      code: 'CURRENCY_UNIT_AMBIGUOUS',
      messageFa: 'واحد پول سند (ریال یا تومان) مشخص نیست؛ تبدیل ضمنی ممنوع است.',
    };
  }
  const dAmount = new Decimal(amount);
  if (dAmount.isNaN() || dAmount.isNegative()) {
    return {
      ok: false,
      code: 'NEGATIVE_OR_INVALID_AMOUNT',
      messageFa: 'مبلغ نامعتبر یا منفی است.',
    };
  }

  let rate = 1;
  if (sourceCurrencyCode === 'IRR') {
    rate = 1;
  } else if (sourceCurrencyCode === 'IRT') {
    rate = 10;
  } else {
    if (!explicitRateToBase || explicitRateToBase <= 0) {
      return {
        ok: false,
        code: 'EXCHANGE_RATE_MISSING',
        messageFa: `نرخ تبدیل معتبر برای ارز ${sourceCurrencyCode} در تاریخ سند یافت نشد.`,
      };
    }
    rate = explicitRateToBase;
  }

  return {
    ok: true,
    amountIrr: roundHalfEvenIrr(dAmount.times(rate)),
    rateApplied: rate,
  };
}

/**
 * VR-UOM-02: base_quantity = ROUND(quantity * conversion_to_base, scale)
 */
export function convertToBaseQty(quantity: number | string, conversionToBase: number | string, scale = 4): number {
  const q = new Decimal(quantity);
  const c = new Decimal(conversionToBase);
  if (q.lte(0) || c.lte(0)) {
    throw new Error('QUANTITY_AND_CONVERSION_MUST_BE_POSITIVE');
  }
  return q.times(c).toDecimalPlaces(scale, Decimal.ROUND_HALF_EVEN).toNumber();
}

export interface InvoiceLineInput {
  lineNumber: number;
  description: string;
  productId?: string | null;
  uomName?: string;
  conversionToBase?: number;
  quantity: number | string;
  unitPriceSource: number | string;
  discountAmountSource?: number | string | null;
  discountPct?: number | null;
  taxRatePct?: number | null; // e.g., 10 for 10%
  isPromotionalFreeItem?: boolean;
  promoReason?: string | null;
  declaredLineNetSource?: number | string | null; // Used when verifying OCR line math (VR-MATH-01)
}

export interface InvoiceCalculationInput {
  sourceCurrencyCode: CurrencyCode;
  exchangeRateToBase?: number | null;
  invoiceDiscountSource?: number | string | null;
  invoiceDiscountTaxMode?: 'PRE_TAX_PRORATA' | 'POST_TAX_DISCOUNT';
  defaultTaxRatePct?: number;
  lines: InvoiceLineInput[];
}

export interface ComputedInvoiceLine {
  lineNumber: number;
  description: string;
  productId: string | null;
  uomName: string;
  conversionToBase: number;
  quantity: number;
  baseQuantity: number;
  unitPriceIrr: number; // 4-decimal precision
  isPromotionalFreeItem: boolean;
  promoReason: string | null;
  lineGrossIrr: number;
  discountPct: number | null;
  lineDiscountIrr: number;
  allocatedInvoiceDiscountIrr: number;
  taxableBaseIrr: number;
  taxRatePct: number;
  lineTaxIrr: number;
  lineNetIrr: number;
  mathWarningCode: string | null;
}

export interface InvoiceCalculationResult {
  valid: boolean;
  errors: Array<{ code: string; messageFa: string; lineNumber?: number }>;
  warnings: Array<{ code: string; messageFa: string; lineNumber?: number }>;
  rateApplied: number;
  subtotalIrr: number;
  lineDiscountTotalIrr: number;
  invoiceDiscountIrr: number;
  taxTotalIrr: number;
  netTotalIrr: number;
  lines: ComputedInvoiceLine[];
}

/**
 * CF-DOC-INV-01 + VR-MATH-01..05, 08:
 * Deterministic invoice line & header calculation in canonical IRR with Half-to-Even rounding.
 */
export function calculateInvoiceDeterministic(input: InvoiceCalculationInput): InvoiceCalculationResult {
  const errors: Array<{ code: string; messageFa: string; lineNumber?: number }> = [];
  const warnings: Array<{ code: string; messageFa: string; lineNumber?: number }> = [];

  let rate = 1;
  if (input.sourceCurrencyCode === 'IRT') rate = 10;
  else if (input.sourceCurrencyCode === 'IRR') rate = 1;
  else if (input.exchangeRateToBase && input.exchangeRateToBase > 0) rate = input.exchangeRateToBase;
  else {
    errors.push({ code: 'EXCHANGE_RATE_MISSING', messageFa: 'نرخ تبدیل ارز معتبر نیست.' });
  }

  if (!input.lines || input.lines.length === 0) {
    errors.push({ code: 'NO_INVOICE_LINES', messageFa: 'فاکتور باید حداقل یک ردیف داشته باشد.' });
  }

  const rateDec = new Decimal(rate);
  const mode = input.invoiceDiscountTaxMode ?? 'PRE_TAX_PRORATA';
  const defaultTaxPct = input.defaultTaxRatePct ?? 10;

  const stage1 = input.lines.map((line) => {
    const qty = new Decimal(line.quantity || 0);
    const conv = new Decimal(line.conversionToBase ?? 1);
    const unitPriceSrc = new Decimal(line.unitPriceSource || 0);
    const isPromo = Boolean(line.isPromotionalFreeItem);

    if (qty.lte(0)) {
      errors.push({
        code: 'VR_MATH_08_NON_POSITIVE_QTY',
        messageFa: `تعداد در ردیف ${line.lineNumber} باید بزرگتر از صفر باشد (برای مرجوعی از نوع فاکتور برگشتی استفاده کنید).`,
        lineNumber: line.lineNumber,
      });
    }
    if (unitPriceSrc.lt(0)) {
      errors.push({
        code: 'VR_MATH_08_NEGATIVE_PRICE',
        messageFa: `فی واحد در ردیف ${line.lineNumber} نمی‌تواند منفی باشد.`,
        lineNumber: line.lineNumber,
      });
    }
    if (isPromo && !unitPriceSrc.eq(0)) {
      errors.push({
        code: 'VR_MATH_03_PROMO_NON_ZERO_PRICE',
        messageFa: `ردیف اشانتیون (${line.lineNumber}) باید فی واحد صفر داشته باشد.`,
        lineNumber: line.lineNumber,
      });
    }
    if (!isPromo && unitPriceSrc.eq(0) && qty.gt(0)) {
      warnings.push({
        code: 'VR_MATH_03_ZERO_PRICE_UNMARKED',
        messageFa: `فی واحد ردیف ${line.lineNumber} صفر است اما به عنوان اشانتیون علامت‌گذاری نشده است.`,
        lineNumber: line.lineNumber,
      });
    }

    const unitPriceIrrDec = isPromo
      ? new Decimal(0)
      : unitPriceSrc.times(rateDec).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
    const lineGrossIrr = isPromo ? 0 : roundHalfEvenIrr(qty.times(unitPriceIrrDec));

    let lineDiscountIrr = 0;
    if (isPromo) {
      lineDiscountIrr = 0;
    } else if (line.discountAmountSource !== null && line.discountAmountSource !== undefined && String(line.discountAmountSource) !== '') {
      lineDiscountIrr = roundHalfEvenIrr(new Decimal(line.discountAmountSource).times(rateDec));
    } else if (line.discountPct !== null && line.discountPct !== undefined) {
      if (line.discountPct < 0 || line.discountPct > 100) {
        errors.push({ code: 'VR_MATH_04_INVALID_DISCOUNT_PCT', messageFa: `درصد تخفیف ردیف ${line.lineNumber} نامعتبر است.`, lineNumber: line.lineNumber });
      } else {
        lineDiscountIrr = roundHalfEvenIrr(new Decimal(lineGrossIrr).times(line.discountPct).div(100));
      }
    }

    if (lineDiscountIrr > lineGrossIrr) {
      errors.push({
        code: 'VR_MATH_04_DISCOUNT_EXCEEDS_GROSS',
        messageFa: `تخفیف ردیف ${line.lineNumber} (${lineDiscountIrr}) نمی‌تواند بیشتر از مبلغ ناخالص سطر (${lineGrossIrr}) باشد.`,
        lineNumber: line.lineNumber,
      });
    }

    const afterLineDisc = Math.max(0, lineGrossIrr - lineDiscountIrr);
    const taxRatePct = isPromo ? 0 : (line.taxRatePct ?? defaultTaxPct);

    return {
      raw: line,
      qty: qty.toNumber(),
      conv: conv.toNumber(),
      baseQuantity: qty.gt(0) && conv.gt(0) ? qty.times(conv).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN).toNumber() : 0,
      unitPriceIrr: unitPriceIrrDec.toNumber(),
      isPromo,
      lineGrossIrr,
      lineDiscountIrr,
      afterLineDisc,
      taxRatePct,
    };
  });

  const subtotalIrr = stage1.reduce((acc, s) => acc + s.lineGrossIrr, 0);
  const lineDiscountTotalIrr = stage1.reduce((acc, s) => acc + s.lineDiscountIrr, 0);
  const invoiceDiscountIrr = roundHalfEvenIrr(new Decimal(input.invoiceDiscountSource || 0).times(rateDec));
  const netAfterLineDiscount = subtotalIrr - lineDiscountTotalIrr;

  if (invoiceDiscountIrr < 0 || invoiceDiscountIrr > netAfterLineDiscount) {
    errors.push({
      code: 'VR_MATH_04_INVOICE_DISCOUNT_EXCEEDS_SUBTOTAL',
      messageFa: `تخفیف پای فاکتور (${invoiceDiscountIrr}) نمی‌تواند منفی یا بیشتر از جمع پس از تخفیف ردیفی (${netAfterLineDiscount}) باشد.`,
    });
  }

  // Prorate invoiceDiscountIrr across non-promo lines when PRE_TAX_PRORATA using Largest Remainder
  const allocatedDiscounts = new Array<number>(stage1.length).fill(0);
  if (mode === 'PRE_TAX_PRORATA' && invoiceDiscountIrr > 0 && netAfterLineDiscount > 0) {
    const eligibleIndices = stage1
      .map((s, idx) => ({ idx, base: s.afterLineDisc }))
      .filter((x) => x.base > 0);
    let assignedSum = 0;
    const remainders: Array<{ idx: number; rem: Decimal }> = [];
    for (const item of eligibleIndices) {
      const exact = new Decimal(invoiceDiscountIrr).times(item.base).div(netAfterLineDiscount);
      const floored = exact.floor().toNumber();
      allocatedDiscounts[item.idx] = floored;
      assignedSum += floored;
      remainders.push({ idx: item.idx, rem: exact.minus(floored) });
    }
    let leftover = invoiceDiscountIrr - assignedSum;
    remainders.sort((a, b) => b.rem.cmp(a.rem));
    for (let k = 0; k < leftover && k < remainders.length; k++) {
      allocatedDiscounts[remainders[k].idx] += 1;
    }
  }

  let taxTotalIrr = 0;
  const computedLines: ComputedInvoiceLine[] = stage1.map((s, idx) => {
    const allocInvDisc = allocatedDiscounts[idx];
    const taxableBaseIrr = s.isPromo ? 0 : Math.max(0, s.afterLineDisc - allocInvDisc);
    const lineTaxIrr = s.isPromo ? 0 : roundHalfEvenIrr(new Decimal(taxableBaseIrr).times(s.taxRatePct).div(100));
    const lineNetIrr = taxableBaseIrr + lineTaxIrr;
    taxTotalIrr += lineTaxIrr;

    let mathWarningCode: string | null = null;
    if (s.raw.declaredLineNetSource !== null && s.raw.declaredLineNetSource !== undefined) {
      const declaredIrr = roundHalfEvenIrr(new Decimal(s.raw.declaredLineNetSource).times(rateDec));
      if (Math.abs(declaredIrr - lineNetIrr) > 1) {
        mathWarningCode = 'VR_MATH_01_LINE_MISMATCH';
        warnings.push({
          code: 'VR_MATH_01_LINE_MISMATCH',
          messageFa: `مبلغ خالص اعلام‌شده در ردیف ${s.raw.lineNumber} (${declaredIrr.toLocaleString('fa-IR')}) با محاسبه قطعی (${lineNetIrr.toLocaleString('fa-IR')}) همخوانی ندارد.`,
          lineNumber: s.raw.lineNumber,
        });
      }
    }

    return {
      lineNumber: s.raw.lineNumber,
      description: s.raw.description,
      productId: s.raw.productId ?? null,
      uomName: s.raw.uomName ?? 'عدد',
      conversionToBase: s.conv,
      quantity: s.qty,
      baseQuantity: s.baseQuantity,
      unitPriceIrr: s.unitPriceIrr,
      isPromotionalFreeItem: s.isPromo,
      promoReason: s.raw.promoReason ?? null,
      lineGrossIrr: s.lineGrossIrr,
      discountPct: s.raw.discountPct ?? null,
      lineDiscountIrr: s.lineDiscountIrr,
      allocatedInvoiceDiscountIrr: allocInvDisc,
      taxableBaseIrr,
      taxRatePct: s.taxRatePct,
      lineTaxIrr,
      lineNetIrr,
      mathWarningCode,
    };
  });

  const netTotalIrr =
    mode === 'PRE_TAX_PRORATA'
      ? Math.max(0, subtotalIrr - lineDiscountTotalIrr - invoiceDiscountIrr + taxTotalIrr)
      : Math.max(0, subtotalIrr - lineDiscountTotalIrr + taxTotalIrr - invoiceDiscountIrr);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    rateApplied: rate,
    subtotalIrr,
    lineDiscountTotalIrr,
    invoiceDiscountIrr,
    taxTotalIrr,
    netTotalIrr,
    lines: computedLines,
  };
}

/**
 * CF-AR-01: Open Invoice Balance (excluding uncleared cheques from cleared cash!)
 */
export function calculateOpenInvoiceBalance(params: {
  netTotalIrr: number;
  adjustmentsSignedIrr?: number;
  clearedAllocatedPaidIrr: number;
}): { effectiveInvoiceAmountIrr: number; openBalanceIrr: number } {
  const effective = params.netTotalIrr + (params.adjustmentsSignedIrr ?? 0);
  const open = Math.max(0, effective - params.clearedAllocatedPaidIrr);
  return { effectiveInvoiceAmountIrr: effective, openBalanceIrr: open };
}

/**
 * CF-AR-02: Aging Buckets
 */
export function classifyAgingBucket(daysPastDue: number): AgingBucketCode {
  if (daysPastDue <= 0) return 'CURRENT';
  if (daysPastDue <= 30) return 'BUCKET_1_30';
  if (daysPastDue <= 60) return 'BUCKET_31_60';
  if (daysPastDue <= 90) return 'BUCKET_61_90';
  return 'BUCKET_90_PLUS';
}

/**
 * CF-AR-03: FIFO Auto Payment Allocation
 */
export function allocatePaymentFifo(
  paymentAmountIrr: number,
  openInvoicesSortedOldestFirst: Array<{ invoiceId: string; openBalanceIrr: number }>
): {
  allocations: Array<{ invoiceId: string; allocatedAmountIrr: number; remainingInvoiceBalanceIrr: number }>;
  unallocatedCreditIrr: number;
} {
  let remaining = new Decimal(paymentAmountIrr);
  if (remaining.lte(0)) {
    throw new Error('PAYMENT_AMOUNT_MUST_BE_POSITIVE');
  }
  const allocations: Array<{ invoiceId: string; allocatedAmountIrr: number; remainingInvoiceBalanceIrr: number }> = [];
  for (const inv of openInvoicesSortedOldestFirst) {
    if (remaining.lte(0)) break;
    if (inv.openBalanceIrr <= 0) continue;
    const invOpen = new Decimal(inv.openBalanceIrr);
    const alloc = Decimal.min(remaining, invOpen).toNumber();
    remaining = remaining.minus(alloc);
    allocations.push({
      invoiceId: inv.invoiceId,
      allocatedAmountIrr: alloc,
      remainingInvoiceBalanceIrr: invOpen.minus(alloc).toNumber(),
    });
  }
  return {
    allocations,
    unallocatedCreditIrr: remaining.toNumber(),
  };
}

/**
 * CF-PRF-01 & CF-PRF-02 (Audit Fix Section 22):
 * Strictly separates GrossMarginPct from TrueOperatingMarginPct!
 */
export function calculateProfitabilityMargins(params: {
  netSalesIrr: number;
  cogsPaidIrr: number;
  promoFreeGoodsCostIrr: number;
  unrecoveredFreightIrr: number;
  netSalesWithKnownCostIrr: number;
}): {
  grossProfitIrr: number;
  grossMarginPct: number | null;
  trueOperatingMarginIrr: number;
  trueOperatingMarginPct: number | null;
  costCoveragePct: number | null;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
} {
  const netSales = new Decimal(params.netSalesIrr);
  const grossProfit = netSales.minus(params.cogsPaidIrr);
  const trueMargin = netSales
    .minus(params.cogsPaidIrr)
    .minus(params.promoFreeGoodsCostIrr)
    .minus(params.unrecoveredFreightIrr);

  const grossMarginPct = netSales.gt(0) ? roundPct2(grossProfit.div(netSales).times(100)) : null;
  const trueOperatingMarginPct = netSales.gt(0) ? roundPct2(trueMargin.div(netSales).times(100)) : null;
  const costCoveragePct = netSales.gt(0)
    ? roundPct2(new Decimal(params.netSalesWithKnownCostIrr).div(netSales).times(100))
    : null;

  let confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
  if (costCoveragePct === null || costCoveragePct < 80) confidenceLevel = 'LOW';
  else if (costCoveragePct < 100) confidenceLevel = 'MEDIUM';

  return {
    grossProfitIrr: roundHalfEvenIrr(grossProfit),
    grossMarginPct,
    trueOperatingMarginIrr: roundHalfEvenIrr(trueMargin),
    trueOperatingMarginPct,
    costCoveragePct,
    confidenceLevel,
  };
}

/**
 * VR-ENT-01: Iranian National Code (10 digits), Legal National ID (11 digits), Sayad Cheque ID (16 digits), Mobile, IBAN
 */
export function validateIranianNationalCode(raw: string): boolean {
  const code = normalizeDigits(raw).trim();
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(code[i]) * (10 - i);
  }
  const rem = sum % 11;
  const check = Number(code[9]);
  return rem < 2 ? check === rem : check === 11 - rem;
}

export function validateSayadId(raw: string): boolean {
  const id = normalizeDigits(raw).trim();
  return /^\d{16}$/.test(id);
}

export function validateIranianMobile(raw: string): boolean {
  const m = normalizeDigits(raw).trim();
  return /^(\+98|0)9\d{9}$/.test(m);
}

export function validateIranianIban(raw: string): boolean {
  const iban = normalizeDigits(raw).trim().toUpperCase();
  return /^IR\d{24}$/.test(iban);
}
