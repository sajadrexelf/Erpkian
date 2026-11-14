import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocatePaymentFifo,
  calculateInvoiceDeterministic,
  calculateOpenInvoiceBalance,
  calculateProfitabilityMargins,
  classifyAgingBucket,
  convertToBaseQty,
  convertToIrr,
  roundHalfEvenIrr,
  validateIranianIban,
  validateIranianMobile,
  validateIranianNationalCode,
  validateSayadId,
} from '../../src/shared/decimal-math';

test('GTC-01 (CF-DOC-INV-01): Invoice with promo free item, line discount %, and VAT 10%', () => {
  const res = calculateInvoiceDeterministic({
    sourceCurrencyCode: 'IRR',
    invoiceDiscountSource: 0,
    defaultTaxRatePct: 10,
    lines: [
      {
        lineNumber: 1,
        description: 'روغن سرخ‌کردنی ۵ لیتری',
        uomName: 'کارتن',
        conversionToBase: 4,
        quantity: 10,
        unitPriceSource: 1_200_000,
        discountPct: 5,
        taxRatePct: 10,
      },
      {
        lineNumber: 2,
        description: 'اشانتیون روغن',
        uomName: 'کارتن',
        conversionToBase: 4,
        quantity: 1,
        unitPriceSource: 0,
        isPromotionalFreeItem: true,
        promoReason: 'جشنواره فروش پاییز',
      },
    ],
  });

  assert.equal(res.valid, true);
  assert.equal(res.subtotalIrr, 12_000_000);
  assert.equal(res.lineDiscountTotalIrr, 600_000);
  assert.equal(res.taxTotalIrr, 1_140_000);
  assert.equal(res.netTotalIrr, 12_540_000);
  assert.equal(res.lines[0].baseQuantity, 40);
  assert.equal(res.lines[1].lineNetIrr, 0);
  assert.equal(res.lines[1].baseQuantity, 4);
});

test('GTC-02: Zero float precision drift and PRE_TAX_PRORATA invoice discount', () => {
  const res = calculateInvoiceDeterministic({
    sourceCurrencyCode: 'IRR',
    invoiceDiscountSource: 100_000,
    invoiceDiscountTaxMode: 'PRE_TAX_PRORATA',
    defaultTaxRatePct: 10,
    lines: [
      {
        lineNumber: 1,
        description: 'کالای دقیق',
        quantity: 3,
        unitPriceSource: 333333.3333,
      },
    ],
  });

  assert.equal(res.valid, true);
  assert.equal(res.subtotalIrr, 1_000_000);
  assert.equal(res.lines[0].taxableBaseIrr, 900_000);
  assert.equal(res.taxTotalIrr, 90_000);
  assert.equal(res.netTotalIrr, 990_000);
});

test('GTC-03: Half-to-Even banker rounding in IRR', () => {
  assert.equal(roundHalfEvenIrr(10.5), 10);
  assert.equal(roundHalfEvenIrr(11.5), 12);
  assert.equal(roundHalfEvenIrr(12.5), 12);
});

test('VR-CURR & VR-UOM: Explicit IRT->IRR conversion and ambiguous currency rejection', () => {
  const irt = convertToIrr({ amount: 150_000, sourceCurrencyCode: 'IRT' });
  assert.equal(irt.ok, true);
  if (irt.ok) assert.equal(irt.amountIrr, 1_500_000);

  const missing = convertToIrr({ amount: 150_000, sourceCurrencyCode: null });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, 'CURRENCY_UNIT_AMBIGUOUS');

  assert.equal(convertToBaseQty(2, 24), 48);
});

test('VR-MATH-03 & VR-MATH-08: Blocks negative qty and warns on unmarked zero-price item', () => {
  const neg = calculateInvoiceDeterministic({
    sourceCurrencyCode: 'IRR',
    lines: [{ lineNumber: 1, description: 'A', quantity: -2, unitPriceSource: 1000 }],
  });
  assert.equal(neg.valid, false);
  assert.equal(neg.errors[0].code, 'VR_MATH_08_NON_POSITIVE_QTY');

  const unmarkedPromo = calculateInvoiceDeterministic({
    sourceCurrencyCode: 'IRR',
    lines: [{ lineNumber: 1, description: 'اشانتیون نامشخص', quantity: 1, unitPriceSource: 0 }],
  });
  assert.equal(unmarkedPromo.valid, true);
  assert.equal(unmarkedPromo.warnings[0].code, 'VR_MATH_03_ZERO_PRICE_UNMARKED');
});

test('GTC-05 & GTC-06 (CF-AR-01..03): Open balance, aging buckets, and FIFO auto allocation', () => {
  const bal = calculateOpenInvoiceBalance({ netTotalIrr: 90_000_000, clearedAllocatedPaidIrr: 50_000_000 });
  assert.equal(bal.openBalanceIrr, 40_000_000);

  assert.equal(classifyAgingBucket(0), 'CURRENT');
  assert.equal(classifyAgingBucket(5), 'BUCKET_1_30');
  assert.equal(classifyAgingBucket(45), 'BUCKET_31_60');
  assert.equal(classifyAgingBucket(75), 'BUCKET_61_90');
  assert.equal(classifyAgingBucket(120), 'BUCKET_90_PLUS');

  const fifo = allocatePaymentFifo(100_000_000, [
    { invoiceId: 'inv-1', openBalanceIrr: 40_000_000 },
    { invoiceId: 'inv-2', openBalanceIrr: 50_000_000 },
  ]);
  assert.equal(fifo.allocations.length, 2);
  assert.equal(fifo.allocations[0].allocatedAmountIrr, 40_000_000);
  assert.equal(fifo.allocations[1].allocatedAmountIrr, 50_000_000);
  assert.equal(fifo.unallocatedCreditIrr, 10_000_000);
});

test('GTC-09 & GTC-10 (CF-PRF-01/02): GrossMarginPct strictly separated from TrueOperatingMarginPct', () => {
  const prof = calculateProfitabilityMargins({
    netSalesIrr: 20_000_000,
    cogsPaidIrr: 12_000_000,
    promoFreeGoodsCostIrr: 1_500_000,
    unrecoveredFreightIrr: 500_000,
    netSalesWithKnownCostIrr: 17_000_000,
  });
  assert.equal(prof.grossProfitIrr, 8_000_000);
  assert.equal(prof.grossMarginPct, 40);
  assert.equal(prof.trueOperatingMarginIrr, 6_000_000);
  assert.equal(prof.trueOperatingMarginPct, 30);
  assert.equal(prof.costCoveragePct, 85);
  assert.equal(prof.confidenceLevel, 'MEDIUM');
});

test('VR-ENT-01: Iranian National ID, Sayad 16-digit, Mobile, and IBAN validation', () => {
  assert.equal(validateIranianNationalCode('0013520841') || validateIranianNationalCode('0499370899'), true);
  assert.equal(validateIranianNationalCode('1111111111'), false);
  assert.equal(validateSayadId('1234567890123456'), true);
  assert.equal(validateSayadId('12345'), false);
  assert.equal(validateIranianMobile('09123456789'), true);
  assert.equal(validateIranianIban('IR120170000000123456789012'), true);
});
