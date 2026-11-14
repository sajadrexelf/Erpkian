const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function normalizeDigits(input: string): string {
  let out = String(input ?? '');
  for (let i = 0; i < 10; i++) {
    out = out.replaceAll(PERSIAN_DIGITS[i], String(i)).replaceAll(ARABIC_DIGITS[i], String(i));
  }
  return out;
}

export function normalizePersianText(input: string): string {
  return normalizeDigits(input)
    .replaceAll('ي', 'ی')
    .replaceAll('ك', 'ک')
    .replaceAll('ة', 'ه')
    .replaceAll('\u200c', ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Exact 33-year Birashk / modern Iranian Jalali leap-year check for 1300..1500.
 * Verified: 1403 is leap (1403/12/30 = 2025-03-20); 1404 & 1405 are NOT leap.
 */
const LEAP_MOD_33 = new Set([1, 5, 9, 13, 17, 22, 26, 30]);

export function isJalaliLeapYear(jy: number): boolean {
  if (!Number.isInteger(jy) || jy < 1200 || jy > 1600) return false;
  // Standard Birashk 33-year cycle matches Iranian calendar for 1343..1472:
  // Note: 1403 % 33 = 17 (in LEAP_MOD_33), 1404 % 33 = 18 (not), 1405 % 33 = 19 (not).
  const mod = ((jy % 33) + 33) % 33;
  return LEAP_MOD_33.has(mod);
}

export function getJalaliMonthDays(jy: number, jm: number): number {
  if (jm >= 1 && jm <= 6) return 31;
  if (jm >= 7 && jm <= 11) return 30;
  if (jm === 12) return isJalaliLeapYear(jy) ? 30 : 29;
  return 0;
}

export interface ParsedJalaliDate {
  jy: number;
  jm: number;
  jd: number;
  formatted: string;
}

export function validateJalaliDate(raw: string): { valid: boolean; parsed?: ParsedJalaliDate; errorCode?: string; messageFa?: string } {
  const norm = normalizeDigits(raw).trim().replaceAll('-', '/');
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(norm);
  if (!match) {
    return {
      valid: false,
      errorCode: 'INVALID_JALALI_DATE_FORMAT',
      messageFa: `فرمت تاریخ شمسی نامعتبر است (${raw}). قالب صحیح YYYY/MM/DD است.`,
    };
  }
  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12) {
    return {
      valid: false,
      errorCode: 'INVALID_JALALI_DATE',
      messageFa: `سال یا ماه تاریخ شمسی نامعتبر است (${raw}).`,
    };
  }
  const maxDays = getJalaliMonthDays(jy, jm);
  if (jd < 1 || jd > maxDays) {
    return {
      valid: false,
      errorCode: 'INVALID_JALALI_DATE',
      messageFa: `روز ${jd} برای ماه ${jm} سال ${jy} نامعتبر است (حداکثر ${maxDays} روز).`,
    };
  }
  const formatted = `${String(jy).padStart(4, '0')}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
  return { valid: true, parsed: { jy, jm, jd, formatted } };
}

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

function mod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b;
}

/**
 * Exact Jalali -> Gregorian Julian Day conversion (Kazimierz Borkowski / Jalaali standard).
 */
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jm = 0;
  let jump = 0;

  for (let i = 1; i < bl; i++) {
    jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) {
    leapJ += 1;
  }
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) {
    n = n - jump + div(jump + 4, 33) * 33;
  }
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const g = d2g(jdn);
  let jy = g.gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(g.gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm: number;
  let jd: number;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    } else {
      k -= 186;
    }
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export function jalaliToIso(jalaliDate: string): string {
  const check = validateJalaliDate(jalaliDate);
  if (!check.valid || !check.parsed) {
    throw new Error(check.messageFa ?? 'INVALID_JALALI_DATE');
  }
  const { jy, jm, jd } = check.parsed;
  const { gy, gm, gd } = d2g(j2d(jy, jm, jd));
  return `${String(gy).padStart(4, '0')}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

export function isoToJalali(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  const gy = Number(match[1]);
  const gm = Number(match[2]);
  const gd = Number(match[3]);
  const { jy, jm, jd } = d2j(g2d(gy, gm, gd));
  return `${String(jy).padStart(4, '0')}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

export function diffDaysIso(laterIso: string, earlierIso: string): number {
  const a = Date.parse(`${laterIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${earlierIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((a - b) / 86400000);
}

export function addDaysIso(isoDate: string, days: number): string {
  const dt = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function nowTehranParts(): { utcIso: string; dateIso: string; jalaliDate: string; jalaliDateTime: string } {
  const now = new Date();
  const tehranMs = now.getTime() + 3.5 * 3600 * 1000;
  const tehran = new Date(tehranMs);
  const dateIso = tehran.toISOString().slice(0, 10);
  const hhmm = tehran.toISOString().slice(11, 16);
  const jalaliDate = isoToJalali(dateIso);
  return {
    utcIso: now.toISOString(),
    dateIso,
    jalaliDate,
    jalaliDateTime: `${jalaliDate} ${hhmm}`,
  };
}
