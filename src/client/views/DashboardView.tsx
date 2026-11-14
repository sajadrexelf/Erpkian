import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, FileCheck2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { AgingCustomerRow, CurrencyCode, ErpkianReportEnvelope } from '../../shared/contracts';
import { apiRequest, type ClientAuthSession } from '../api';
import { formatMoney, statusBadgeClass, statusLabelFa } from '../format';

interface DashboardData {
  organization_id: string;
  organization_name: string;
  is_demo_synthetic_data: boolean;
  display_currency: CurrencyCode;
  generated_at_jalali: string;
  can_view_ar: boolean;
  can_view_cost_profit: boolean;
  document_counts: Array<{ lifecycle_status: string; cnt: number }>;
  invoice_counts: Array<{ lifecycle_status: string; cnt: number; total_irr: number }>;
  pending_approvals_count: number;
  aging: ErpkianReportEnvelope<AgingCustomerRow> | null;
  recent_documents: Array<{
    id: string;
    title_fa: string;
    document_type_code: string;
    lifecycle_status: string;
    uploaded_at: string;
  }>;
}

interface DashboardViewProps {
  session: ClientAuthSession;
  displayCurrency: CurrencyCode;
  onNavigate: (tab: string, documentId?: string) => void;
  onOpenEvidence: (title: string, evidences: AgingCustomerRow[] extends never ? never : any, snapshot?: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  session,
  displayCurrency,
  onNavigate,
  onOpenEvidence,
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiRequest<DashboardData>('/api/dashboard', session)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'خطا در بارگذاری داشبورد');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.membershipId, session.organizationId]);

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">در حال بارگذاری شاخص‌های قطعی مالی...</div>;
  }
  if (error || !data) {
    return <div className="p-4 border border-rose-200 bg-rose-50 text-rose-800 rounded-md text-sm">{error}</div>;
  }

  const postedInv = data.invoice_counts.find((i) => i.lifecycle_status === 'Posted');
  const pendingDocsAndInvs =
    data.document_counts
      .filter((d) => d.lifecycle_status === 'Uploaded' || d.lifecycle_status === 'Needs Review' || d.lifecycle_status === 'Verified')
      .reduce((s, x) => s + x.cnt, 0) +
    data.invoice_counts
      .filter((i) => i.lifecycle_status === 'Needs Review' || i.lifecycle_status === 'Verified')
      .reduce((s, x) => s + x.cnt, 0);

  const openArIrr = data.aging?.summary_metrics.find((m) => m.metric_key === 'total_open_ar_irr')?.value_irr ?? 0;
  const overdueArIrr = data.aging?.summary_metrics.find((m) => m.metric_key === 'total_overdue_ar_irr')?.value_irr ?? 0;
  const pendingChequesIrr = data.aging?.summary_metrics.find((m) => m.metric_key === 'pending_cheques_irr')?.value_irr ?? 0;

  return (
    <div className="space-y-5" data-testid="dashboard-view">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">کل فروش قطعی ثبت‌شده (Posted)</div>
          <div className="text-xl font-bold text-slate-900 mt-1.5 tabular-nums">
            {formatMoney(postedInv?.total_irr ?? 0, displayCurrency)}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">{postedInv?.cnt ?? 0} فاکتور قطعی</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">مانده مطالبات باز مشتریان</div>
          {data.can_view_ar ? (
            <>
              <div className="text-xl font-bold text-slate-900 mt-1.5 tabular-nums">
                {formatMoney(openArIrr, displayCurrency)}
              </div>
              <div className="text-xs text-amber-700 mt-1 tabular-nums">
                معوق: {formatMoney(overdueArIrr, displayCurrency)}
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500 mt-2">محدود به نقش دارای مجوز مطالبات</div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">چک‌های صیادی در جریان وصول</div>
          {data.can_view_ar ? (
            <>
              <div className="text-xl font-bold text-slate-900 mt-1.5 tabular-nums">
                {formatMoney(pendingChequesIrr, displayCurrency)}
              </div>
              <div className="text-xs text-slate-500 mt-1">تا زمان وصول از بدهی کسر نمی‌شود</div>
            </>
          ) : (
            <div className="text-sm text-slate-500 mt-2">محدود به نقش خزانه‌داری/مالی</div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">کارتابل اقدام و تایید</div>
          <div className="text-xl font-bold text-slate-900 mt-1.5 tabular-nums">
            {pendingDocsAndInvs + data.pending_approvals_count} مورد
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {pendingDocsAndInvs} سند/فاکتور منتظر قطعی‌سازی | {data.pending_approvals_count} تایید دوامضایی
          </div>
        </div>
      </div>

      {/* Warnings & Completeness Banner */}
      {data.aging && data.aging.warnings_and_limitations.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>هشدار کامل‌بودن داده و شفافیت محاسبه</span>
          </div>
          <ul className="text-xs text-amber-900 space-y-1 pr-5 list-disc">
            {data.aging.warnings_and_limitations.map((w) => (
              <li key={w.warning_code}>{w.message_fa}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Two-column operational grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">بدهکاران و مانده باز مطالبات</h3>
            {data.aging && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenEvidence('شواهد محاسبه مانده مطالبات', data.aging!.evidences, data.aging!.data_snapshot)}
                  className="text-xs text-teal-700 hover:underline font-medium"
                >
                  مشاهده شواهد ({data.aging.evidences.length})
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('aging')}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1 rounded-md font-medium flex items-center gap-1"
                >
                  <span>گزارش سنی کامل</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {!data.can_view_ar ? (
            <div className="p-6 text-sm text-slate-500">
              نقش فعلی شما دسترسی مشاهده گزارش سنی مطالبات (`ar:view_aging`) را ندارد.
            </div>
          ) : data.aging && data.aging.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 text-right font-semibold">مشتری</th>
                    <th className="py-2.5 px-3 text-right font-semibold">جمع فاکتور</th>
                    <th className="py-2.5 px-3 text-right font-semibold">وصول قطعی</th>
                    <th className="py-2.5 px-3 text-right font-semibold">چک در جریان</th>
                    <th className="py-2.5 px-3 text-right font-semibold">مانده باز</th>
                    <th className="py-2.5 px-3 text-right font-semibold">تاخیر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.aging.rows.map((r) => (
                    <tr key={r.contact_id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-medium text-slate-900">{r.contact_name}</td>
                      <td className="py-2.5 px-3 tabular-nums text-slate-700">{formatMoney(r.total_invoiced_irr, displayCurrency)}</td>
                      <td className="py-2.5 px-3 tabular-nums text-emerald-700">{formatMoney(r.cleared_paid_irr, displayCurrency)}</td>
                      <td className="py-2.5 px-3 tabular-nums text-amber-700">{formatMoney(r.pending_cheques_irr, displayCurrency)}</td>
                      <td className="py-2.5 px-3 tabular-nums font-bold text-slate-900">{formatMoney(r.open_balance_irr, displayCurrency)}</td>
                      <td className="py-2.5 px-3 tabular-nums text-slate-600">{r.max_days_past_due} روز</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-500">هیچ بدهی باز ثبت‌شده‌ای وجود ندارد.</div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">اسناد اخیر بارگذاری‌شده</h3>
            <button
              type="button"
              onClick={() => onNavigate('documents')}
              className="text-xs text-teal-700 hover:underline font-medium"
            >
              آپلود سند جدید
            </button>
          </div>
          <div className="divide-y divide-slate-100 flex-1">
            {data.recent_documents.length === 0 ? (
              <div className="p-6 text-sm text-slate-500 text-center">
                هنوز سندی در این سازمان بارگذاری نشده است.
              </div>
            ) : (
              data.recent_documents.map((doc) => (
                <div key={doc.id} className="p-3.5 flex items-center justify-between gap-2 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{doc.title_fa}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`inline-block text-[11px] px-2 py-0.5 rounded border ${statusBadgeClass(doc.lifecycle_status)}`}>
                        {statusLabelFa(doc.lifecycle_status)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('ocr-review', doc.id)}
                    className="text-xs px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0"
                  >
                    بازبینی
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="p-3 bg-slate-50 border-t border-slate-200 grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => onNavigate('workspace')}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-teal-700 text-white font-medium hover:bg-teal-800"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>پرسش از دستیار AI</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('approvals')}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-md border border-slate-300 bg-white text-slate-800 font-medium hover:bg-slate-100"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>کارتابل تایید ({data.pending_approvals_count})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Lifecycle Summary */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-sm text-slate-700">
          <FileCheck2 className="w-4 h-4 text-teal-700 shrink-0" />
          <span>چرخه الزامی سلامت سند: بارگذاری ← استخراج/ورود ← بازبینی انسانی (Verified) ← تایید دوامضایی (در مبالغ بالا) ← ثبت قطعی (Posted)</span>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('invoices')}
          className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 font-medium"
        >
          مدیریت فاکتورها
        </button>
      </div>
    </div>
  );
};
