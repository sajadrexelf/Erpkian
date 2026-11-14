import type { CurrencyCode } from '../shared/contracts';

export function formatMoney(amountIrr: number, displayCurrency: CurrencyCode = 'IRT'): string {
  const val = displayCurrency === 'IRT' ? Math.round(amountIrr / 10) : Math.round(amountIrr);
  const unit = displayCurrency === 'IRT' ? 'تومان' : 'ریال';
  return `${val.toLocaleString('fa-IR')} ${unit}`;
}

export function formatIrrExact(amountIrr: number): string {
  return `${Math.round(amountIrr).toLocaleString('fa-IR')} ریال`;
}

export function statusLabelFa(status: string): string {
  const map: Record<string, string> = {
    Uploaded: 'بارگذاری‌شده',
    Processing: 'در حال پردازش',
    'Needs Review': 'نیازمند بازبینی',
    Verified: 'تایید و تطبیق‌شده',
    'Eligible for Posting': 'آماده ثبت قطعی',
    'Awaiting Approval': 'در انتظار تایید دوامضایی',
    Posted: 'ثبت قطعی (Posted)',
    Reversed: 'برگشت‌خورده (معکوس)',
    Rejected: 'رد شده',
    Cancelled: 'ابطال‌شده',
    IN_HAND: 'در صندوق',
    DEPOSITED: 'واگذار به بانک',
    CLEARED: 'وصول قطعی',
    BOUNCED: 'برگشت‌خورده',
    OPEN: 'باز',
    SOFT_LOCKED: 'قفل موقت',
    CLOSED: 'بسته‌شده',
    PENDING: 'در انتظار تایید',
    APPROVED: 'تایید شده',
  };
  return map[status] ?? status;
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'Posted':
    case 'CLEARED':
    case 'APPROVED':
    case 'OPEN':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'Verified':
    case 'DEPOSITED':
      return 'bg-teal-50 text-teal-800 border-teal-200';
    case 'Needs Review':
    case 'Awaiting Approval':
    case 'PENDING':
    case 'IN_HAND':
    case 'SOFT_LOCKED':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Rejected':
    case 'BOUNCED':
    case 'Reversed':
    case 'CLOSED':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}
