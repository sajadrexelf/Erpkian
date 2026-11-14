import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysIso,
  diffDaysIso,
  isJalaliLeapYear,
  isoToJalali,
  jalaliToIso,
  normalizeDigits,
  normalizePersianText,
  validateJalaliDate,
} from '../../src/shared/jalali';

test('VR-DATE-01: validates Jalali leap years accurately (1403 leap, 1404 & 1405 non-leap)', () => {
  assert.equal(isJalaliLeapYear(1403), true);
  assert.equal(isJalaliLeapYear(1404), false);
  assert.equal(isJalaliLeapYear(1405), false);

  const leapValid = validateJalaliDate('۱۴۰۳/۱۲/۳۰');
  assert.equal(leapValid.valid, true);
  assert.equal(leapValid.parsed?.formatted, '1403/12/30');

  const nonLeap1404 = validateJalaliDate('1404/12/30');
  assert.equal(nonLeap1404.valid, false);
  assert.equal(nonLeap1404.errorCode, 'INVALID_JALALI_DATE');

  const nonLeap1405 = validateJalaliDate('1405/12/30');
  assert.equal(nonLeap1405.valid, false);
  assert.equal(nonLeap1405.errorCode, 'INVALID_JALALI_DATE');
});

test('VR-DATE-02: Jalali <-> ISO Gregorian conversion round-trips accurately', () => {
  assert.equal(jalaliToIso('1403/12/30'), '2025-03-20');
  assert.equal(jalaliToIso('1404/01/01'), '2025-03-21');
  assert.equal(jalaliToIso('1405/08/24'), '2026-11-15');
  assert.equal(isoToJalali('2025-03-20'), '1403/12/30');
  assert.equal(isoToJalali('2026-11-15'), '1405/08/24');
});

test('Date arithmetic and Persian text normalization work reliably', () => {
  assert.equal(diffDaysIso('2026-11-15', '2026-10-01'), 45);
  assert.equal(addDaysIso('2026-11-15', 30), '2026-12-15');
  assert.equal(normalizeDigits('۱۲۳٤٥٦789'), '123456789');
  assert.equal(normalizePersianText('فروشگاه   بهار ي ك'), 'فروشگاه بهار ی ک');
});
