import { FilePlus2, Layers, Play, SearchCheck, Upload } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { apiRequest, type ClientAuthSession } from '../api';
import { statusBadgeClass, statusLabelFa } from '../format';

interface DocItem {
  id: string;
  title_fa: string;
  document_type_code: string;
  lifecycle_status: string;
  duplicate_of_document_id: string | null;
  uploaded_at: string;
  uploaded_by_name: string;
  page_count: number;
  primary_mime_type: string;
  sha256_hash: string;
  latest_ocr_status: string | null;
  linked_invoice_id: string | null;
}

interface DocumentsViewProps {
  session: ClientAuthSession;
  onNotify: (kind: 'success' | 'error', text: string) => void;
  onOpenReview: (documentId: string) => void;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  session,
  onNotify,
  onOpenReview,
}) => {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [titleFa, setTitleFa] = useState('');
  const [mergeOnUpload, setMergeOnUpload] = useState(false);
  const [selectedIdsForMerge, setSelectedIdsForMerge] = useState<string[]>([]);
  const [runningOcrId, setRunningOcrId] = useState<string | null>(null);

  const loadDocs = async () => {
    setLoading(true);
    try {
      const list = await apiRequest<DocItem[]>('/api/documents', session);
      setDocs(list);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در دریافت لیست اسناد');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, [session.membershipId, session.organizationId]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFiles || selectedFiles.length === 0) {
      onNotify('error', 'لطفاً حداقل یک فایل انتخاب کنید.');
      return;
    }
    const fd = new FormData();
    Array.from(selectedFiles).forEach((f) => fd.append('files', f));
    if (titleFa.trim()) fd.append('title_fa', titleFa.trim());
    fd.append('merge_into_single', String(mergeOnUpload));

    setUploading(true);
    try {
      const res = await apiRequest<{ documents: Array<{ id: string; is_duplicate: boolean; duplicate_of_document_id: string | null }>; merged: boolean }>(
        '/api/documents/upload',
        session,
        { method: 'POST', body: fd, isFormData: true }
      );
      const dupCount = res.documents.filter((d) => d.is_duplicate).length;
      if (dupCount > 0) {
        onNotify('error', `سند بارگذاری شد اما ${dupCount} مورد تکراری (SHA-256 مشابه سند قبلی) شناسایی شد.`);
      } else {
        onNotify('success', `${res.documents.length} سند با موفقیت بارگذاری و با هش SHA-256 ذخیره شد.`);
      }
      setSelectedFiles(null);
      setTitleFa('');
      await loadDocs();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در بارگذاری سند');
    } finally {
      setUploading(false);
    }
  };

  const handleRunOcr = async (docId: string) => {
    setRunningOcrId(docId);
    try {
      const res = await apiRequest<{ ocr_status: string; reason_fa: string | null }>(`/api/documents/${docId}/ocr`, session, {
        method: 'POST',
      });
      if (res.ocr_status === 'OCR_ENGINE_UNAVAILABLE') {
        onNotify('error', res.reason_fa || 'موتور OCR خارجی در دسترس نیست؛ سند به نمای ورود/بازبینی منتقل شد.');
      } else {
        onNotify('success', 'استخراج اولیه و کنترل ریاضی انجام شد؛ سند در انتظار بازبینی انسانی است.');
      }
      await loadDocs();
      onOpenReview(docId);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در اجرای استخراج سند');
    } finally {
      setRunningOcrId(null);
    }
  };

  const handleMergeSelected = async () => {
    if (selectedIdsForMerge.length < 2) return;
    try {
      await apiRequest('/api/documents/merge', session, {
        method: 'POST',
        body: { document_ids: selectedIdsForMerge },
      });
      onNotify('success', 'اسناد انتخاب‌شده در یک سند چندصفحه‌ای (نسخه ۲ ادغام‌شده) تجمیع شدند.');
      setSelectedIdsForMerge([]);
      await loadDocs();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در ادغام اسناد');
    }
  };

  return (
    <div className="space-y-5" data-testid="documents-view">
      {/* Upload Form */}
      <form onSubmit={handleUpload} className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FilePlus2 className="w-4 h-4 text-teal-700" />
              <span>بارگذاری سند مالی (DOC-INGEST-001)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              فرمت‌های مجاز با بررسی امضای باینری (Magic Bytes): PNG, JPG, WEBP, PDF, JSON, CSV. فایل‌های اجرایی/HTML مسدود می‌شوند.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label htmlFor="doc-file-input" className="block text-xs font-medium text-slate-700 mb-1">
              انتخاب فایل (تکی یا چندصفحه‌ای)
            </label>
            <input
              id="doc-file-input"
              data-testid="doc-file-input"
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.webp,.pdf,.json,.csv,.txt"
              onChange={(e) => setSelectedFiles(e.target.files)}
              className="block w-full text-xs text-slate-700 file:ml-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"
            />
          </div>

          <div>
            <label htmlFor="doc-title-input" className="block text-xs font-medium text-slate-700 mb-1">
              عنوان سند (اختیاری)
            </label>
            <input
              id="doc-title-input"
              data-testid="doc-title-input"
              type="text"
              value={titleFa}
              onChange={(e) => setTitleFa(e.target.value)}
              placeholder="مثلاً: فاکتور فروش آبان فروشگاه بهار"
              className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-md"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={mergeOnUpload}
                onChange={(e) => setMergeOnUpload(e.target.checked)}
                className="rounded border-slate-300 text-teal-700"
              />
              <span>ادغام صفحات همزمان</span>
            </label>
            <button
              type="submit"
              data-testid="doc-upload-btn"
              disabled={uploading}
              className="px-4 py-2 rounded-md bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-medium flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              <span>{uploading ? 'در حال آپلود...' : 'بارگذاری'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Documents List */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">فهرست اسناد سازمان ({docs.length})</h3>
          {selectedIdsForMerge.length >= 2 && (
            <button
              type="button"
              onClick={handleMergeSelected}
              className="text-xs px-3 py-1.5 rounded-md bg-slate-800 text-white font-medium flex items-center gap-1.5 hover:bg-slate-900"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>ادغام {selectedIdsForMerge.length} سند انتخاب‌شده (DOC-MERGE-002)</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">در حال بارگذاری...</div>
        ) : docs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">هنوز هیچ سندی در این سازمان بارگذاری نشده است.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 text-right font-semibold">ادغام</th>
                  <th className="py-2.5 px-3 text-right font-semibold">عنوان سند</th>
                  <th className="py-2.5 px-3 text-right font-semibold">صفحات / نوع</th>
                  <th className="py-2.5 px-3 text-right font-semibold">وضعیت</th>
                  <th className="py-2.5 px-3 text-right font-semibold">کنترل تکراری (SHA-256)</th>
                  <th className="py-2.5 px-3 text-right font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {docs.map((doc) => {
                  const checked = selectedIdsForMerge.includes(doc.id);
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={`انتخاب ${doc.title_fa} برای ادغام`}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIdsForMerge((p) => [...p, doc.id]);
                            else setSelectedIdsForMerge((p) => p.filter((x) => x !== doc.id));
                          }}
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{doc.title_fa}</div>
                        <div className="text-xs text-slate-500">بارگذاری توسط: {doc.uploaded_by_name}</div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-600 tabular-nums">
                        {doc.page_count} صفحه | <span className="font-mono">{doc.primary_mime_type}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded border ${statusBadgeClass(doc.lifecycle_status)}`}>
                          {statusLabelFa(doc.lifecycle_status)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        {doc.duplicate_of_document_id ? (
                          <span className="text-rose-700 font-medium">تکراریِ {doc.duplicate_of_document_id.slice(0, 12)}</span>
                        ) : (
                          <span className="font-mono text-slate-500">{doc.sha256_hash?.slice(0, 12)}...</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRunOcr(doc.id)}
                            disabled={runningOcrId === doc.id}
                            className="text-xs px-2.5 py-1.5 rounded-md bg-teal-700 hover:bg-teal-800 text-white font-medium flex items-center gap-1"
                          >
                            <Play className="w-3 h-3" />
                            <span>{runningOcrId === doc.id ? 'پردازش...' : 'اجرای OCR'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenReview(doc.id)}
                            className="text-xs px-2.5 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 text-slate-800 font-medium flex items-center gap-1"
                          >
                            <SearchCheck className="w-3 h-3" />
                            <span>بازبینی دوپنجره‌ای</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
