import { Check, LockKeyhole, Plus, RotateCcw } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { CurrencyCode } from '../../shared/contracts';
import { apiRequest, type ClientAuthSession } from '../api';
import { formatMoney, statusBadgeClass, statusLabelFa } from '../format';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_direction: string;
  contact_name: string;
  issue_jalali: string;
  due_jalali: string;
  net_total_irr: number;
  cleared_paid_irr: number;
  open_balance_irr: number;
  lifecycle_status: string;
  fiscal_period_name: string | null;
  fiscal_period_status: string | null;
  primary_document_id: string | null;
}

interface InvoicesViewProps {
  session: ClientAuthSession;
  displayCurrency: CurrencyCode;
  onNotify: (kind: 'success' | 'error', text: string) => void;
  onOpenDocument?: (docId: string) => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  session,
  displayCurrency,
  onNotify,
  onOpenDocument,
}) => {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; canonical_name: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; canonical_name: string; default_sale_price_irr: number; stock_on_hand_base: number; units: Array<{ uom_name: string; conversion_to_base: number }> }>>([]);
  const [loading, setLoading] = useState(true);

  // Create invoice state
  const [contactId, setContactId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState(`S-1405-${Math.floor(2000 + Math.random() * 7000)}`);
  const [issueJalali, setIssueJalali] = useState('1405/08/25');
  const [dueJalali, setDueJalali] = useState('1405/09/25');
  const [productId, setProductId] = useState('');
  const [uomName, setUomName] = useState('کارتن');
  const [qty, setQty] = useState(5);
  const [unitPriceIrr, setUnitPriceIrr] = useState(14000000);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invList, cntList, prdList] = await Promise.all([
        apiRequest<InvoiceRow[]>('/api/invoices', session),
        apiRequest<Array<{ id: string; canonical_name: string }>>('/api/contacts', session),
        apiRequest<any[]>('/api/products', session),
      ]);
      setInvoices(invList);
      setContacts(cntList);
      setProducts(prdList);
      if (!contactId && cntList.length > 0) setContactId(cntList[0].id);
      if (!productId && prdList.length > 0) {
        setProductId(prdList[0].id);
        setUomName(prdList[0].units[0]?.uom_name || 'عدد');
        setUnitPriceIrr(prdList[0].default_sale_price_irr || 1000000);
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در بارگذاری فاکتورها');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [session.membershipId, session.organizationId]);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = products.find((p) => p.id === productId);
    const unitInfo = prod?.units.find((u) => u.uom_name === uomName);
    try {
      await apiRequest('/api/invoices', session, {
        method: 'POST',
        idempotencyKey: `ui-inv-${Date.now()}`,
        body: {
          invoiceDirection: 'SALE',
          invoiceNumber,
          contactId,
          issueJalali,
          dueJalali,
          sourceCurrencyCode: 'IRR',
          lines: [
            {
              lineNumber: 1,
              productId: prod?.id || null,
              description: prod?.canonical_name || 'کالای فروش',
              uomName,
              conversionToBase: unitInfo?.conversion_to_base ?? 1,
              quantity: qty,
              unitPriceSource: unitPriceIrr,
              taxRatePct: 10,
            },
          ],
        },
      });
      onNotify('success', `فاکتور «${invoiceNumber}» با وضعیت Needs Review ایجاد شد.`);
      setInvoiceNumber(`S-1405-${Math.floor(2000 + Math.random() * 7000)}`);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در ثبت فاکتور');
    }
  };

  const handleAction = async (invId: string, action: 'verify' | 'post' | 'reverse') => {
    try {
      const res = await apiRequest<{ lifecycle_status: string; message_fa?: string }>(
        `/api/invoices/${invId}/${action}`,
        session,
        { method: 'POST', body: action === 'reverse' ? { reasonFa: 'اصلاح از کارتابل فاکتورها' } : {} }
      );
      if (res.lifecycle_status === 'Awaiting Approval') {
        onNotify('error', res.message_fa || 'فاکتور نیازمند تایید دوم در کارتابل دوامضایی است.');
      } else {
        onNotify('success', `وضعیت فاکتور با موفقیت به ${statusLabelFa(res.lifecycle_status)} تغییر یافت.`);
      }
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'عملیات مجاز نیست');
    }
  };

  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <div className="space-y-5" data-testid="invoices-view">
      {/* Create Invoice Form */}
      <form onSubmit={handleCreateInvoice} className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <h2 className="text-base font-bold text-slate-900">ثبت فاکتور فروش جدید (FIN-AR-INV-001)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
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
            <label className="block text-xs font-medium text-slate-700 mb-1">شماره فاکتور</label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">تاریخ صدور</label>
            <input
              type="text"
              value={issueJalali}
              onChange={(e) => setIssueJalali(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">کالا (موجودی پایه)</label>
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                const p = products.find((x) => x.id === e.target.value);
                if (p) {
                  setUomName(p.units[0]?.uom_name || 'عدد');
                  setUnitPriceIrr(p.default_sale_price_irr);
                }
              }}
              className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.canonical_name} ({p.stock_on_hand_base})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">واحد و تعداد</label>
            <div className="flex gap-1.5">
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value || 1))}
                className="w-20 text-sm px-2 py-1.5 border border-slate-300 rounded-md tabular-nums"
              />
              <select
                value={uomName}
                onChange={(e) => setUomName(e.target.value)}
                className="flex-1 text-sm px-2 py-1.5 border border-slate-300 rounded-md"
              >
                {(selectedProduct?.units ?? [{ uom_name: 'عدد', conversion_to_base: 1 }]).map((u) => (
                  <option key={u.uom_name} value={u.uom_name}>{u.uom_name} (×{u.conversion_to_base})</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <button
              type="submit"
              data-testid="create-invoice-btn"
              className="w-full px-3 py-2 rounded-md bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>ثبت پیش‌نویس</span>
            </button>
          </div>
        </div>
      </form>

      {/* Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">فهرست فاکتورها و چرخه ثبت قطعی (DOC-POST-008)</h3>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-slate-500">در حال بارگذاری...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 text-right font-semibold">شماره</th>
                  <th className="py-2.5 px-3 text-right font-semibold">طرف‌حساب</th>
                  <th className="py-2.5 px-3 text-right font-semibold">صدور / سررسید</th>
                  <th className="py-2.5 px-3 text-right font-semibold">جمع کل</th>
                  <th className="py-2.5 px-3 text-right font-semibold">مانده باز</th>
                  <th className="py-2.5 px-3 text-right font-semibold">وضعیت</th>
                  <th className="py-2.5 px-3 text-right font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      <div>{inv.invoice_number}</div>
                      {inv.primary_document_id && onOpenDocument && (
                        <button
                          type="button"
                          onClick={() => onOpenDocument(inv.primary_document_id!)}
                          className="text-[11px] text-teal-700 hover:underline"
                        >
                          سند پیوست
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-800">{inv.contact_name}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-600 tabular-nums">
                      <div>{inv.issue_jalali}</div>
                      <div>سررسید: {inv.due_jalali}</div>
                    </td>
                    <td className="py-2.5 px-3 tabular-nums font-medium">{formatMoney(inv.net_total_irr, displayCurrency)}</td>
                    <td className="py-2.5 px-3 tabular-nums font-bold text-slate-900">
                      {inv.lifecycle_status === 'Posted' ? formatMoney(inv.open_balance_irr, displayCurrency) : '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded border ${statusBadgeClass(inv.lifecycle_status)}`}>
                        {statusLabelFa(inv.lifecycle_status)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {inv.lifecycle_status === 'Needs Review' && (
                          <button
                            type="button"
                            onClick={() => handleAction(inv.id, 'verify')}
                            className="text-xs px-2.5 py-1 rounded border border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100 flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            <span>تایید (Verify)</span>
                          </button>
                        )}
                        {inv.lifecycle_status === 'Verified' && (
                          <button
                            type="button"
                            onClick={() => handleAction(inv.id, 'post')}
                            className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-900 text-white flex items-center gap-1"
                          >
                            <LockKeyhole className="w-3 h-3" />
                            <span>ثبت قطعی (Post)</span>
                          </button>
                        )}
                        {inv.lifecycle_status === 'Posted' && (
                          <button
                            type="button"
                            onClick={() => handleAction(inv.id, 'reverse')}
                            className="text-xs px-2.5 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>معکوس</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
