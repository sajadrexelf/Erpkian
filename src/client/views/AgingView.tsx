import { Download, Eye, History, RefreshCw } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { AgingCustomerRow, CurrencyCode, ErpkianReportEnvelope } from '../../shared/contracts';
import { apiDownloadFile, apiRequest, type ClientAuthSession } from '../api';
import { formatMoney } from '../format';

interface AgingViewProps {
  session: ClientAuthSession;
  displayCurrency: CurrencyCode;
  onNotify: (kind: 'success' | 'error', text: string) => void;
  onOpenEvidence: (title: string, evidences: any[], snapshot?: any) => void;
}

export const AgingView: React.FC<AgingViewProps> = ({
  session,
  displayCurrency,
  onNotify,
  onOpenEvidence,
}) => {
  const [asOfJalali, setAsOfJalali] = useState('1405/08/25');
  const [report, setReport] = useState<ErpkianReportEnvelope<AgingCustomerRow> | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const loadReport = async (save = true) => {
    setLoading(true);
    try {
      const rep = await apiRequest<ErpkianReportEnvelope<AgingCustomerRow>>(
        `/api/reports/ar-aging?as_of_jalali=${encodeURIComponent(asOfJalali)}&currency=${displayCurrency}&save=${save}`,
        session
      );
      setReport(rep);
      const hist = await apiRequest<any[]>('/api/reports/ar-aging/versions', session);
      setVersions(hist);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در اجرای گزارش سنی مطالبات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport(false);
  }, [session.membershipId, session.organizationId, displayCurrency]);

  const handleExport = async (format: 'EXCEL' | 'PDF' | 'CSV' | 'JSON') => {
    setExporting(format);
    try {
      const ext = format === 'EXCEL' ? 'xlsx' : format.toLowerCase();
      await apiDownloadFile(
        `/api/reports/export?format=${format}&as_of_jalali=${encodeURIComponent(asOfJalali)}`,
        session,
        `erpkian-ar-aging.${ext}`
      );
      onNotify('success', `فایل خروجی رسمی ${format} تولید و دانلود شد.`);
      const hist = await apiRequest<any[]>('/api/reports/ar-aging/versions', session);
      setVersions(hist);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در تولید فایل خروجی');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-5" data-testid="aging-view">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="aging-asof" className="block text-xs font-medium text-slate-700 mb-1">
              تاریخ مبنای گزارش (شمسی)
            </label>
            <input
              id="aging-asof"
              type="text"
              value={asOfJalali}
              onChange={(e) => setAsOfJalali(e.target.value)}
              className="text-sm px-3 py-1.5 border border-slate-300 rounded-md tabular-nums w-36"
            />
          </div>
          <button
            type="button"
            data-testid="run-aging-btn"
            onClick={() => loadReport(true)}
            className="px-3.5 py-1.5 rounded-md bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            <span>محاسبه و ثبت نسخه جدید</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['EXCEL', 'PDF', 'CSV', 'JSON'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              data-testid={`export-${fmt.toLowerCase()}-btn`}
              disabled={exporting !== null}
              onClick={() => handleExport(fmt)}
              className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-medium flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exporting === fmt ? '...' : `دانلود ${fmt}`}</span>
            </button>
          ))}
        </div>
      </div>

      {loading || !report ? (
        <div className="p-6 text-sm text-slate-500">در حال محاسبه سنی مطالبات...</div>
      ) : (
        <>
          {/* Summary Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {report.summary_metrics.map((m) => (
              <div key={m.metric_key} className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs text-slate-500">{m.label_fa}</div>
                <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
                  {formatMoney(m.value_irr, displayCurrency)}
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-1">{m.formula_code}</div>
              </div>
            ))}
          </div>

          {/* Customer Buckets Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">جدول تفصیلی سنی مطالبات (نسخه v{report.execution_meta.version_number})</h3>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  مبنا: {report.data_snapshot.as_of_date_jalali} | سطح اطمینان: {report.data_snapshot.confidence_level}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenEvidence('شواهد گزارش سنی مطالبات', report.evidences, report.data_snapshot)}
                className="text-xs px-3 py-1.5 rounded-md border border-teal-300 bg-teal-50 text-teal-800 font-medium flex items-center gap-1.5 hover:bg-teal-100"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>شواهد ({report.evidences.length})</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 text-right font-semibold">مشتری</th>
                    <th className="py-2.5 px-2 text-right font-semibold">مانده باز</th>
                    <th className="py-2.5 px-2 text-right font-semibold">چک در جریان</th>
                    <th className="py-2.5 px-2 text-right font-semibold">جاری</th>
                    <th className="py-2.5 px-2 text-right font-semibold">۱–۳۰ روز</th>
                    <th className="py-2.5 px-2 text-right font-semibold">۳۱–۶۰ روز</th>
                    <th className="py-2.5 px-2 text-right font-semibold">۶۱–۹۰ روز</th>
                    <th className="py-2.5 px-2 text-right font-semibold">+۹۰ روز</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.rows.map((r) => (
                    <tr key={r.contact_id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-medium text-slate-900">{r.contact_name}</td>
                      <td className="py-2.5 px-2 tabular-nums font-bold text-slate-900">{formatMoney(r.open_balance_irr, displayCurrency)}</td>
                      <td className="py-2.5 px-2 tabular-nums text-amber-700">{formatMoney(r.pending_cheques_irr, displayCurrency)}</td>
                      <td className="py-2.5 px-2 tabular-nums">{formatMoney(r.current_irr, displayCurrency)}</td>
                      <td className="py-2.5 px-2 tabular-nums">{formatMoney(r.bucket_1_30_irr, displayCurrency)}</td>
                      <td className="py-2.5 px-2 tabular-nums">{formatMoney(r.bucket_31_60_irr, displayCurrency)}</td>
                      <td className="py-2.5 px-2 tabular-nums">{formatMoney(r.bucket_61_90_irr, displayCurrency)}</td>
                      <td className="py-2.5 px-2 tabular-nums text-rose-700">{formatMoney(r.bucket_90_plus_irr, displayCurrency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Snapshot Version History */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-600" />
              <h3 className="text-sm font-bold text-slate-900">تاریخچه اسنپ‌شات‌ها و نسخه‌های تغییرناپذیر گزارش</h3>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {versions.length === 0 ? (
                <div className="p-4 text-slate-500">برای ثبت اولین نسخه رسمی، دکمه «محاسبه و ثبت نسخه جدید» یا یکی از خروجی‌ها را بزنید.</div>
              ) : (
                versions.map((v) => (
                  <div key={v.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-teal-800">v{v.version_number}</span>
                      <span className="tabular-nums">مبنا: {v.as_of_date_jalali}</span>
                      <span>اسناد قطعی: {v.included_document_count} | معلق: {v.pending_document_count}</span>
                    </div>
                    <span className="font-mono text-slate-500">هش: {String(v.snapshot_hash).slice(0, 14)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
