import { AlertTriangle, CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import type { CurrencyCode, InvoiceDirection } from '../../shared/contracts';
import { calculateInvoiceDeterministic } from '../../shared/decimal-math';
import { apiRequest, type ClientAuthSession } from '../api';
import { formatIrrExact, statusBadgeClass, statusLabelFa } from '../format';

interface DocumentDetailPayload {
  document: {
    id: string;
    title_fa: string;
    lifecycle_status: string;
    document_type_code: string;
  };
  pages: Array<{
    id: string;
    page_number: number;
    mime_type: string;
    original_filename: string;
    signed_preview_url: string;
    inline_text_preview: string | null;
  }>;
  latest_attempt: {
    id: string;
    ocr_status: string;
    model_version: string;
    payload?: any;
    raw_payload?: any;
  } | null;
  corrections: Array<{
    id: string;
    field_key: string;
    value_before: string;
    value_after: string;
    occurred_at: string;
  }>;
  linked_invoice: {
    id: string;
    invoice_number: string;
    lifecycle_status: string;
    net_total_irr: number;
  } | null;
}

interface ReviewLine {
  lineNumber: number;
  description: string;
  uomName: string;
  quantity: number;
  unitPriceSource: number;
  discountAmountSource: number;
  taxRatePct: number;
  isPromotionalFreeItem: boolean;
}

interface OcrReviewViewProps {
  session: ClientAuthSession;
  initialDocumentId: string | null;
  onNotify: (kind: 'success' | 'error', text: string) => void;
  onVerifiedInvoice: () => void;
}

export const OcrReviewView: React.FC<OcrReviewViewProps> = ({
  session,
  initialDocumentId,
  onNotify,
  onVerifiedInvoice,
}) => {
  const [docs, setDocs] = useState<Array<{ id: string; title_fa: string; lifecycle_status: string }>>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocumentId || '');
  const [detail, setDetail] = useState<DocumentDetailPayload | null>(null);
  const [contacts, setContacts] = useState<Array<{ id: string; canonical_name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);

  // Editable form state
  const [invoiceDirection, setInvoiceDirection] = useState<InvoiceDirection>('SALE');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [contactId, setContactId] = useState('');
  const [contactName, setContactName] = useState('');
  const [issueJalali, setIssueJalali] = useState('1405/08/25');
  const [dueJalali, setDueJalali] = useState('1405/09/25');
  const [currency, setCurrency] = useState<CurrencyCode>('IRR');
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [lines, setLines] = useState<ReviewLine[]>([
    { lineNumber: 1, description: '', uomName: 'عدد', quantity: 1, unitPriceSource: 0, discountAmountSource: 0, taxRatePct: 10, isPromotionalFreeItem: false },
  ]);

  useEffect(() => {
    if (initialDocumentId) setSelectedDocId(initialDocumentId);
  }, [initialDocumentId]);

  useEffect(() => {
    Promise.all([
      apiRequest<Array<{ id: string; title_fa: string; lifecycle_status: string }>>('/api/documents', session),
      apiRequest<Array<{ id: string; canonical_name: string }>>('/api/contacts', session),
    ])
      .then(([docList, contactList]) => {
        setDocs(docList);
        setContacts(contactList);
        if (!selectedDocId && docList.length > 0) {
          setSelectedDocId(docList[0].id);
        }
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'خطا در دریافت لیست اسناد'));
  }, [session.membershipId, session.organizationId]);

  useEffect(() => {
    if (!selectedDocId) {
      setDetail(null);
      return;
    }
    apiRequest<DocumentDetailPayload>(`/api/documents/${selectedDocId}`, session)
      .then((d) => {
        setDetail(d);
        const payload = d.latest_attempt?.raw_payload;
        if (payload) {
          setInvoiceDirection(payload.invoiceDirection || 'SALE');
          setInvoiceNumber(payload.invoiceNumber || '');
          setContactName(payload.contactName || '');
          setContactId(payload.contact_match?.exact_match?.id || '');
          setIssueJalali(payload.issueJalali || '1405/08/25');
          setDueJalali(payload.dueJalali || '1405/09/25');
          setCurrency(payload.sourceCurrencyCode || 'IRR');
          setInvoiceDiscount(Number(payload.invoiceDiscountSource || 0));
          if (Array.isArray(payload.lines) && payload.lines.length > 0) {
            setLines(
              payload.lines.map((l: any, idx: number) => ({
                lineNumber: idx + 1,
                description: l.description || '',
                uomName: l.uomName || 'عدد',
                quantity: Number(l.quantity || 1),
                unitPriceSource: Number(l.unitPriceSource || 0),
                discountAmountSource: Number(l.discountAmountSource || 0),
                taxRatePct: Number(l.taxRatePct ?? 10),
                isPromotionalFreeItem: Boolean(l.isPromotionalFreeItem),
              }))
            );
          }
        }
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'خطا در دریافت جزییات سند'));
  }, [selectedDocId]);

  const liveMath = useMemo(() => {
    return calculateInvoiceDeterministic({
      sourceCurrencyCode: currency,
      invoiceDiscountSource: invoiceDiscount,
      lines: lines.map((l, i) => ({ ...l, lineNumber: i + 1 })),
    });
  }, [currency, invoiceDiscount, lines]);

  const handleSubmitDecision = async (decision: 'VERIFIED' | 'REJECTED') => {
    if (!selectedDocId) return;
    setSubmitting(true);
    try {
      const res = await apiRequest<{ corrections_count: number; invoice: { invoice_number: string } | null }>(
        `/api/documents/${selectedDocId}/review`,
        session,
        {
          method: 'POST',
          body: {
            decision,
            invoiceDirection,
            invoiceNumber,
            contactId: contactId || null,
            contactName,
            issueJalali,
            dueJalali,
            sourceCurrencyCode: currency,
            invoiceDiscountSource: invoiceDiscount,
            lines: lines.map((l, idx) => ({ ...l, lineNumber: idx + 1 })),
          },
        }
      );

      if (decision === 'VERIFIED') {
        onNotify(
          'success',
          `بازبینی تایید شد (${res.corrections_count} اصلاح ممیزی ثبت شد) و فاکتور «${res.invoice?.invoice_number}» به وضعیت Verified (آماده ثبت قطعی) رسید.`
        );
        onVerifiedInvoice();
      } else {
        onNotify('success', 'سند با موفقیت رد شد.');
      }
      const updated = await apiRequest<DocumentDetailPayload>(`/api/documents/${selectedDocId}`, session);
      setDetail(updated);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در ثبت بازبینی');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="ocr-review-view">
      {/* Document selector header */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label htmlFor="review-doc-select" className="text-sm font-bold text-slate-800">
            سند انتخاب‌شده:
          </label>
          <select
            id="review-doc-select"
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            className="text-sm px-3 py-1.5 border border-slate-300 rounded-md bg-white min-w-64"
          >
            {docs.length === 0 && <option value="">سندی وجود ندارد</option>}
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title_fa} ({statusLabelFa(d.lifecycle_status)})
              </option>
            ))}
          </select>
        </div>

        {detail && (
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded border ${statusBadgeClass(detail.document.lifecycle_status)}`}>
              {statusLabelFa(detail.document.lifecycle_status)}
            </span>
            {detail.linked_invoice && (
              <span className="text-teal-800 font-medium">
                فاکتور متصل: {detail.linked_invoice.invoice_number} ({statusLabelFa(detail.linked_invoice.lifecycle_status)})
              </span>
            )}
          </div>
        )}
      </div>

      {!detail ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          برای شروع بازبینی دوپنجره‌ای، ابتدا یک سند در بخش «مرکز اسناد» بارگذاری کنید.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Pane (5 cols): Source Image/PDF/Text Viewer */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
            <h3 className="text-sm font-bold text-slate-900">پیش‌نمایش سند اصلی ({detail.pages.length} صفحه)</h3>

            {detail.latest_attempt?.ocr_status === 'OCR_ENGINE_UNAVAILABLE' && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{detail.latest_attempt.raw_payload?.reasonFa}</span>
              </div>
            )}

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {detail.pages.map((p) => (
                <div key={p.id} className="border border-slate-200 rounded-md p-2.5 bg-slate-50">
                  <div className="text-xs text-slate-500 mb-2 flex justify-between">
                    <span>صفحه {p.page_number} — {p.original_filename}</span>
                    <span className="font-mono">{p.mime_type}</span>
                  </div>
                  {p.mime_type.startsWith('image/') ? (
                    <img
                      src={p.signed_preview_url}
                      alt={p.original_filename}
                      className="w-full h-auto rounded border border-slate-200 bg-white"
                    />
                  ) : p.mime_type === 'application/pdf' ? (
                    <iframe
                      title={p.original_filename}
                      src={p.signed_preview_url}
                      className="w-full h-96 rounded border border-slate-200 bg-white"
                    />
                  ) : (
                    <pre
                      dir="ltr"
                      className="text-xs bg-slate-900 text-slate-100 p-3 rounded whitespace-pre-wrap break-words max-h-80 overflow-y-auto"
                    >
                      {p.inline_text_preview
                        ? p.mime_type === 'application/json'
                          ? (() => {
                              try {
                                return JSON.stringify(JSON.parse(p.inline_text_preview), null, 2);
                              } catch {
                                return p.inline_text_preview;
                              }
                            })()
                          : p.inline_text_preview
                        : 'پیش‌نمایش متنی در دسترس نیست'}
                    </pre>
                  )}
                </div>
              ))}
            </div>

            {/* Correction History */}
            {detail.corrections.length > 0 && (
              <div className="border-t border-slate-200 pt-3">
                <div className="text-xs font-bold text-slate-700 mb-2">تاریخچه اصلاحات ممیزی‌شده:</div>
                <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
                  {detail.corrections.map((c) => (
                    <div key={c.id} className="bg-slate-50 border border-slate-200 rounded px-2 py-1">
                      <span className="font-mono font-semibold">{c.field_key}:</span>{' '}
                      <span className="text-rose-700 line-through">{c.value_before || '(خالی)'}</span>{' '}
                      ← <span className="text-emerald-700 font-semibold">{c.value_after}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Pane (7 cols): Human Verification & Correction Form */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">فرم تطبیق، اصلاح و تایید انسانی (DOC-REVIEW-007)</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">جهت سند</label>
                <select
                  value={invoiceDirection}
                  onChange={(e) => setInvoiceDirection(e.target.value as InvoiceDirection)}
                  className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md"
                >
                  <option value="SALE">فاکتور فروش</option>
                  <option value="PURCHASE">فاکتور خرید</option>
                  <option value="SALE_RETURN">برگشت از فروش</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">شماره فاکتور</label>
                <input
                  data-testid="review-invoice-number"
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">واحد پول سند</label>
                <select
                  data-testid="review-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md"
                >
                  <option value="IRR">ریال (IRR)</option>
                  <option value="IRT">تومان (IRT × ۱۰)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">طرف‌حساب موجود (اختیاری)</label>
                <select
                  value={contactId}
                  onChange={(e) => {
                    setContactId(e.target.value);
                    const found = contacts.find((c) => c.id === e.target.value);
                    if (found) setContactName(found.canonical_name);
                  }}
                  className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md"
                >
                  <option value="">ایجاد/تطبیق خودکار با نام زیر</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.canonical_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">نام طرف‌حساب</label>
                <input
                  data-testid="review-contact-name"
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">تاریخ صدور (شمسی)</label>
                <input
                  data-testid="review-issue-jalali"
                  type="text"
                  value={issueJalali}
                  onChange={(e) => setIssueJalali(e.target.value)}
                  className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">تاریخ سررسید (شمسی)</label>
                <input
                  data-testid="review-due-jalali"
                  type="text"
                  value={dueJalali}
                  onChange={(e) => setDueJalali(e.target.value)}
                  className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">تخفیف پای فاکتور ({currency})</label>
                <input
                  type="number"
                  min={0}
                  value={invoiceDiscount}
                  onChange={(e) => setInvoiceDiscount(Number(e.target.value || 0))}
                  className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-md tabular-nums"
                />
              </div>
            </div>

            {/* Invoice Lines */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">اقلام فاکتور</span>
                <button
                  type="button"
                  onClick={() =>
                    setLines((prev) => [
                      ...prev,
                      {
                        lineNumber: prev.length + 1,
                        description: '',
                        uomName: 'عدد',
                        quantity: 1,
                        unitPriceSource: 0,
                        discountAmountSource: 0,
                        taxRatePct: 10,
                        isPromotionalFreeItem: false,
                      },
                    ])
                  }
                  className="text-xs px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن ردیف</span>
                </button>
              </div>

              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 border border-slate-200 rounded-md p-2 text-xs">
                    <input
                      type="text"
                      placeholder="شرح کالا"
                      value={line.description}
                      onChange={(e) => setLines((p) => p.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))}
                      className="col-span-4 px-2 py-1 border border-slate-300 rounded bg-white"
                    />
                    <input
                      type="number"
                      min={0.001}
                      step="any"
                      placeholder="تعداد"
                      value={line.quantity}
                      onChange={(e) => setLines((p) => p.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x)))}
                      className="col-span-2 px-2 py-1 border border-slate-300 rounded bg-white tabular-nums"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="فی"
                      disabled={line.isPromotionalFreeItem}
                      value={line.isPromotionalFreeItem ? 0 : line.unitPriceSource}
                      onChange={(e) => setLines((p) => p.map((x, i) => (i === idx ? { ...x, unitPriceSource: Number(e.target.value) } : x)))}
                      className="col-span-3 px-2 py-1 border border-slate-300 rounded bg-white tabular-nums disabled:bg-slate-100"
                    />
                    <label className="col-span-2 flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={line.isPromotionalFreeItem}
                        onChange={(e) =>
                          setLines((p) =>
                            p.map((x, i) =>
                              i === idx ? { ...x, isPromotionalFreeItem: e.target.checked, unitPriceSource: e.target.checked ? 0 : x.unitPriceSource } : x
                            )
                          )
                        }
                      />
                      <span>اشانتیون</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => lines.length > 1 && setLines((p) => p.filter((_, i) => i !== idx))}
                      className="col-span-1 text-rose-600 hover:text-rose-800 flex justify-center"
                      aria-label="حذف ردیف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Deterministic Totals */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span>جمع ناخالص (ریال):</span>
                <span className="tabular-nums font-medium">{formatIrrExact(liveMath.subtotalIrr)}</span>
              </div>
              <div className="flex justify-between">
                <span>مالیات ارزش افزوده (ریال):</span>
                <span className="tabular-nums font-medium">{formatIrrExact(liveMath.taxTotalIrr)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-200 pt-1.5">
                <span>جمع کل خالص (ریال):</span>
                <span className="tabular-nums">{formatIrrExact(liveMath.netTotalIrr)}</span>
              </div>
              {!liveMath.valid && (
                <div className="text-rose-700 font-medium pt-1">
                  خطای اعتبارسنجی: {liveMath.errors[0]?.messageFa}
                </div>
              )}
            </div>

            {/* Decision Actions */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmitDecision('REJECTED')}
                className="px-4 py-2 rounded-md border border-rose-300 text-rose-800 hover:bg-rose-50 text-sm font-medium flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>رد سند</span>
              </button>
              <button
                type="button"
                data-testid="review-verify-btn"
                disabled={submitting || !liveMath.valid}
                onClick={() => handleSubmitDecision('VERIFIED')}
                className="px-4 py-2 rounded-md bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-medium flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تایید بازبینی و ثبت فاکتور Verified</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
