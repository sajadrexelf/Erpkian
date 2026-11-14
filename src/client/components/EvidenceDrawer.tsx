import { FileText, X } from 'lucide-react';
import React from 'react';
import type { CurrencyCode, ReportEvidenceItem } from '../../shared/contracts';
import { formatMoney } from '../format';

interface EvidenceDrawerProps {
  open: boolean;
  onClose: () => void;
  titleFa: string;
  evidences: ReportEvidenceItem[];
  displayCurrency: CurrencyCode;
  snapshotMeta?: {
    data_snapshot_id?: string;
    as_of_date_jalali?: string;
    snapshot_hash?: string;
    confidence_level?: string;
  } | null;
  onOpenDocument?: (documentId: string) => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  open,
  onClose,
  titleFa,
  evidences,
  displayCurrency,
  snapshotMeta,
  onOpenDocument,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" data-testid="evidence-drawer">
      <div className="w-full max-w-xl bg-white h-full shadow-xl border-r border-slate-200 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">{titleFa}</h2>
            {snapshotMeta?.as_of_date_jalali && (
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                مبنای گزارش: {snapshotMeta.as_of_date_jalali} | اطمینان: {snapshotMeta.confidence_level ?? '—'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100"
            aria-label="بستن پنل شواهد"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {snapshotMeta?.snapshot_hash && (
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-600">
              <div>شناسه اسنپ‌شات: <span className="font-mono">{snapshotMeta.data_snapshot_id}</span></div>
              <div className="mt-1">هش یکپارچگی: <span className="font-mono">{snapshotMeta.snapshot_hash.slice(0, 20)}...</span></div>
            </div>
          )}

          {evidences.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">سند پشتیبانی ثبت نشده است.</p>
          ) : (
            evidences.map((ev, idx) => (
              <div key={`${ev.source_entity_id}-${idx}`} className="border border-slate-200 rounded-md p-3.5 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-teal-700 shrink-0" />
                      <span>فاکتور {ev.document_number}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      طرف‌حساب: {ev.contact_name || '—'} | تاریخ صدور: <span className="tabular-nums">{ev.issue_jalali}</span>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-slate-900 tabular-nums">
                    {formatMoney(ev.contribution_amount_irr, displayCurrency)}
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-2">
                  <span className="font-mono">{ev.source_entity_id}</span>
                  {ev.source_document_id && onOpenDocument ? (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenDocument(ev.source_document_id!);
                        onClose();
                      }}
                      className="text-teal-700 hover:underline font-medium"
                    >
                      مشاهده سند مبدا در بازبینی OCR
                    </button>
                  ) : (
                    <span>ثبت مستقیم سیستمی</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
