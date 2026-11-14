import { ArrowRightLeft, Landmark, Wallet } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { CurrencyCode } from '../../shared/contracts';
import { apiRequest, type ClientAuthSession } from '../api';
import { formatMoney, statusBadgeClass, statusLabelFa } from '../format';

interface PaymentsViewProps {
  session: ClientAuthSession;
  displayCurrency: CurrencyCode;
  onNotify: (kind: 'success' | 'error', text: string) => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  session,
  displayCurrency,
  onNotify,
}) => {
  const [payments, setPayments] = useState<any[]>([]);
  const [checks, setChecks] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; canonical_name: string }>>([]);

  // Payment form
  const [contactId, setContactId] = useState('');
  const [method, setMethod] = useState<'TRANSFER' | 'CASH' | 'POS' | 'CHEQUE'>('TRANSFER');
  const [amountIrr, setAmountIrr] = useState(20000000);
  const [paymentJalali, setPaymentJalali] = useState('1405/08/25');
  const [allocationMode, setAllocationMode] = useState<'FIFO_AUTO' | 'NONE'>('FIFO_AUTO');
  const [sayadId, setSayadId] = useState('4009876543210123');
  const [checkDueJalali, setCheckDueJalali] = useState('1405/09/20');

  const loadData = async () => {
    try {
      const [pc, cnt] = await Promise.all([
        apiRequest<{ payments: any[]; checks: any[] }>('/api/payments', session),
        apiRequest<Array<{ id: string; canonical_name: string }>>('/api/contacts', session),
      ]);
      setPayments(pc.payments);
      setChecks(pc.checks);
      setContacts(cnt);
      if (!contactId && cnt.length > 0) setContactId(cnt[0].id);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در بارگذاری پرداخت‌ها و چک‌ها');
    }
  };

  useEffect(() => {
    loadData();
  }, [session.membershipId, session.organizationId]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ allocations: Array<{ allocatedAmountIrr: number }>; unallocated_credit_irr: number }>(
        '/api/payments',
        session,
        {
          method: 'POST',
          idempotencyKey: `ui-pay-${Date.now()}`,
          body: {
            contactId,
            direction: 'RECEIPT_IN',
            method,
            sourceCurrencyCode: 'IRR',
            amountSource: amountIrr,
            paymentJalali,
            allocationMode: method === 'CHEQUE' ? 'NONE' : allocationMode,
            ...(method === 'CHEQUE' ? { cheque: { sayadId, dueJalali: checkDueJalali } } : {}),
          },
        }
      );
      onNotify(
        'success',
        method === 'CHEQUE'
          ? 'چک صیادی دریافتی ثبت شد (در وضعیت در صندوق؛ تا زمان وصول قطعی مانده مشتری کاهش نمی‌یابد).'
          : `دریافت وجه ثبت و به ${res.allocations.length} فاکتور تخصیص داده شد.`
      );
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در ثبت دریافت وجه');
    }
  };

  const handleCheckTransition = async (checkId: string, toStatus: string) => {
    try {
      await apiRequest(`/api/checks/${checkId}/transition`, session, {
        method: 'POST',
        body: { to_status: toStatus, note_fa: `تغییر وضعیت به ${statusLabelFa(toStatus)}` },
      });
      onNotify('success', `وضعیت چک صیادی به ${statusLabelFa(toStatus)} تغییر یافت.`);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در تغییر وضعیت چک');
    }
  };

  return (
    <div className="space-y-5" data-testid="payments-view">
      {/* Record Receipt Form */}
      <form onSubmit={handleRecordPayment} className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-teal-700" />
          <span>ثبت دریافت وجه و تخصیص FIFO (FIN-AR-PAY-002 / FIN-AR-ALLOC-003)</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">مشتری</label>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md"
            >
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.canonical_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">روش دریافت</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
              className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md"
            >
              <option value="TRANSFER">حواله بانکی</option>
              <option value="POS">کارت‌خوان (POS)</option>
              <option value="CASH">نقدی</option>
              <option value="CHEQUE">چک صیادی</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">مبلغ (ریال)</label>
            <input
              type="number"
              min={1}
              value={amountIrr}
              onChange={(e) => setAmountIrr(Number(e.target.value || 0))}
              className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">تاریخ دریافت (شمسی)</label>
            <input
              type="text"
              value={paymentJalali}
              onChange={(e) => setPaymentJalali(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">نحوه تخصیص</label>
            <select
              disabled={method === 'CHEQUE'}
              value={method === 'CHEQUE' ? 'NONE' : allocationMode}
              onChange={(e) => setAllocationMode(e.target.value as any)}
              className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md disabled:bg-slate-100"
            >
              <option value="FIFO_AUTO">خودکار به قدیمی‌ترین فاکتور (FIFO)</option>
              <option value="NONE">بستانکار بدون تخصیص</option>
            </select>
          </div>
        </div>

        {method === 'CHEQUE' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-amber-50 border border-amber-200 rounded-md p-3">
            <div>
              <label className="block text-xs font-medium text-amber-900 mb-1">شناسه صیادی (دقیقاً ۱۶ رقم)</label>
              <input
                type="text"
                maxLength={16}
                value={sayadId}
                onChange={(e) => setSayadId(e.target.value)}
                className="w-full text-sm px-2.5 py-1.5 border border-amber-300 rounded-md bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-amber-900 mb-1">تاریخ سررسید چک (شمسی)</label>
              <input
                type="text"
                value={checkDueJalali}
                onChange={(e) => setCheckDueJalali(e.target.value)}
                className="w-full text-sm px-2.5 py-1.5 border border-amber-300 rounded-md bg-white tabular-nums"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            data-testid="record-payment-btn"
            className="px-4 py-2 rounded-md bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium flex items-center gap-1.5"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>ثبت دریافت وجه</span>
          </button>
        </div>
      </form>

      {/* Sayad Cheques Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <Landmark className="w-4 h-4 text-teal-700" />
          <h3 className="text-sm font-bold text-slate-900">چک‌های صیادی (TRS-CHK-001)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 text-right font-semibold">شناسه صیادی</th>
                <th className="py-2.5 px-3 text-right font-semibold">مشتری</th>
                <th className="py-2.5 px-3 text-right font-semibold">سررسید</th>
                <th className="py-2.5 px-3 text-right font-semibold">مبلغ</th>
                <th className="py-2.5 px-3 text-right font-semibold">وضعیت</th>
                <th className="py-2.5 px-3 text-right font-semibold">تغییر وضعیت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {checks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">چکی ثبت نشده است.</td>
                </tr>
              ) : (
                checks.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono text-xs">{c.sayad_id}</td>
                    <td className="py-2.5 px-3">{c.contact_name}</td>
                    <td className="py-2.5 px-3 tabular-nums text-xs">{c.due_jalali}</td>
                    <td className="py-2.5 px-3 tabular-nums font-semibold">{formatMoney(c.amount_irr, displayCurrency)}</td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded border ${statusBadgeClass(c.current_status)}`}>
                        {statusLabelFa(c.current_status)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {c.current_status === 'IN_HAND' && (
                          <button
                            type="button"
                            onClick={() => handleCheckTransition(c.id, 'DEPOSITED')}
                            className="text-xs px-2.5 py-1 rounded border border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100"
                          >
                            واگذاری به بانک
                          </button>
                        )}
                        {c.current_status === 'DEPOSITED' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCheckTransition(c.id, 'CLEARED')}
                              className="text-xs px-2.5 py-1 rounded bg-emerald-700 text-white hover:bg-emerald-800"
                            >
                              وصول قطعی
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCheckTransition(c.id, 'BOUNCED')}
                              className="text-xs px-2.5 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                            >
                              برگشت چک
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">تاریخچه دریافت‌ها و تخصیص به فاکتورها</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 text-right font-semibold">تاریخ</th>
                <th className="py-2.5 px-3 text-right font-semibold">مشتری</th>
                <th className="py-2.5 px-3 text-right font-semibold">روش</th>
                <th className="py-2.5 px-3 text-right font-semibold">مبلغ کل</th>
                <th className="py-2.5 px-3 text-right font-semibold">تخصیص به فاکتورها</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="py-2.5 px-3 tabular-nums text-xs">{p.payment_jalali}</td>
                  <td className="py-2.5 px-3">{p.contact_name}</td>
                  <td className="py-2.5 px-3 text-xs font-mono">{p.method}</td>
                  <td className="py-2.5 px-3 tabular-nums font-semibold">{formatMoney(p.amount_irr, displayCurrency)}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-600">
                    {p.allocations && p.allocations.length > 0
                      ? p.allocations.map((a: any) => `${a.invoice_number}: ${formatMoney(a.allocated_amount_irr, displayCurrency)}`).join(' | ')
                      : 'تخصیص‌نشده / در جریان'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
