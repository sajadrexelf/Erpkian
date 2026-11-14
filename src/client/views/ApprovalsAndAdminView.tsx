import { CheckCircle2, Lock, ShieldAlert, XCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { apiRequest, type ClientAuthSession } from '../api';
import { formatIrrExact, statusBadgeClass, statusLabelFa } from '../format';

interface ApprovalsViewProps {
  session: ClientAuthSession;
  onNotify: (kind: 'success' | 'error', text: string) => void;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({ session, onNotify }) => {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setApprovals(await apiRequest<any[]>('/api/approvals', session));
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در دریافت کارتابل تایید');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [session.membershipId, session.organizationId]);

  const decide = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      await apiRequest(`/api/approvals/${id}/decide`, session, {
        method: 'POST',
        body: { decision },
      });
      onNotify('success', decision === 'APPROVE' ? 'درخواست تایید و فاکتور با موفقیت قطعی (Posted) شد.' : 'درخواست رد شد.');
      await load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در ثبت تصمیم تایید');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" data-testid="approvals-view">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-bold text-slate-900">کارتابل کنترل دوامضایی (Dual Approval)</h2>
        <p className="text-xs text-slate-500 mt-1">
          برای فاکتورهای بالاتر از آستانه سازمانی، تاییدکننده دوم باید شخص دیگری با مجوز `invoice:post` (مثلاً CFO) باشد؛ خودتاییدی مسدود می‌شود.
        </p>
      </div>
      {loading ? (
        <div className="p-6 text-sm text-slate-500">در حال بارگذاری...</div>
      ) : approvals.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">درخواست تایید دوامضایی فعالی وجود ندارد.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {approvals.map((a) => (
            <div key={a.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">فاکتور {a.invoice_number || a.target_entity_id}</span>
                  <span className={`text-xs px-2 py-0.5 rounded border ${statusBadgeClass(a.status)}`}>
                    {statusLabelFa(a.status)}
                  </span>
                </div>
                <div className="text-xs text-slate-600">{a.reason_fa}</div>
                <div className="text-xs text-slate-500">
                  درخواست‌دهنده: {a.requested_by_name} | مبلغ: <span className="tabular-nums font-semibold">{formatIrrExact(a.amount_irr)}</span>
                </div>
              </div>
              {a.status === 'PENDING' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => decide(a.id, 'APPROVE')}
                    className="text-xs px-3 py-1.5 rounded-md bg-teal-700 hover:bg-teal-800 text-white font-medium flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>تایید و ثبت قطعی</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(a.id, 'REJECT')}
                    className="text-xs px-3 py-1.5 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50 font-medium flex items-center gap-1"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>رد درخواست</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AdminView: React.FC<ApprovalsViewProps> = ({ session, onNotify }) => {
  const [periods, setPeriods] = useState<any[]>([]);
  const [logs, setLogs] = useState<{ audit_logs: any[]; security_events: any[]; services: any[] } | null>(null);
  const [allowNegStock, setAllowNegStock] = useState(false);
  const [dualThreshold, setDualThreshold] = useState(500000000);

  const load = async () => {
    try {
      const [fp, lg, st] = await Promise.all([
        apiRequest<any[]>('/api/admin/fiscal-periods', session),
        apiRequest<any>('/api/admin/audit-logs', session),
        apiRequest<{ settings: any }>('/api/admin/settings', session),
      ]);
      setPeriods(fp);
      setLogs(lg);
      setAllowNegStock(st.settings?.allow_negative_stock === 1);
      setDualThreshold(Number(st.settings?.require_dual_approval_above_irr ?? 500000000));
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'خطا در دریافت اطلاعات مدیریتی');
    }
  };

  useEffect(() => {
    load();
  }, [session.membershipId, session.organizationId]);

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/settings', session, {
        method: 'PUT',
        body: {
          allow_negative_stock: allowNegStock,
          require_dual_approval_above_irr: dualThreshold,
        },
      });
      onNotify('success', 'تنظیمات کنترلی سازمان ذخیره شد.');
      await load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'ذخیره تنظیمات مجاز نیست');
    }
  };

  const transitionPeriod = async (periodId: string, action: 'CLOSE' | 'REOPEN') => {
    try {
      await apiRequest(`/api/admin/fiscal-periods/${periodId}/transition`, session, {
        method: 'POST',
        body: { action, reason_fa: `تغییر وضعیت دوره مالی از پنل مدیریت` },
      });
      onNotify('success', action === 'CLOSE' ? 'دوره مالی بسته شد.' : 'دوره مالی بازگشایی شد.');
      await load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تغییر وضعیت دوره مالی مجاز نیست');
    }
  };

  const testLockedTax = async () => {
    try {
      await apiRequest('/api/tax/moadian/submit', session, { method: 'POST', body: {} });
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'سرویس قفل است');
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-view">
      {/* Settings + V1 Locked Tax Services */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <form onSubmit={saveSettings} className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">تنظیمات کنترلی سازمان</h3>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">آستانه تایید دوامضایی فاکتور (ریال)</label>
            <input
              type="number"
              min={0}
              value={dualThreshold}
              onChange={(e) => setDualThreshold(Number(e.target.value || 0))}
              className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-md tabular-nums"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
            <input type="checkbox" checked={allowNegStock} onChange={(e) => setAllowNegStock(e.target.checked)} />
            <span>اجازه فروش با موجودی منفی (توصیه نمی‌شود)</span>
          </label>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-md bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium"
          >
            ذخیره تنظیمات
          </button>
        </form>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Lock className="w-4 h-4 text-rose-700" />
            <span>سرویس‌های قفل‌شده در نسخه ۱ (V1 Locked Scope)</span>
          </div>
          <p className="text-xs text-slate-600 leading-6">
            ارسال رسمی به سامانه مودیان (`TAX-SUB-MOADIAN-001`) و ارسال اظهارنامه (`TAX-SUB-RETURN-001`) عمداً در نسخه ۱ غیرفعال هستند تا هیچ ارسال نامعتبر حاکمیتی انجام نشود.
          </p>
          <button
            type="button"
            data-testid="test-locked-tax-btn"
            onClick={testLockedTax}
            className="text-xs px-3 py-1.5 rounded-md border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 font-medium"
          >
            آزمایش گیت قفل سامانه مودیان (انتظار 403)
          </button>
        </div>
      </div>

      {/* Fiscal Periods */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">دوره‌های مالی شمسی (۱۴۰۵)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2 px-3 text-right font-semibold">دوره</th>
                <th className="py-2 px-3 text-right font-semibold">بازه شمسی</th>
                <th className="py-2 px-3 text-right font-semibold">وضعیت</th>
                <th className="py-2 px-3 text-right font-semibold">اقدام</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {periods.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 px-3 font-medium text-slate-900">{p.name_fa}</td>
                  <td className="py-2 px-3 tabular-nums">{p.start_jalali} تا {p.end_jalali}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded border ${statusBadgeClass(p.status)}`}>
                      {statusLabelFa(p.status)}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    {p.status === 'OPEN' ? (
                      <button
                        type="button"
                        onClick={() => transitionPeriod(p.id, 'CLOSE')}
                        className="px-2.5 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                      >
                        بستن دوره
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => transitionPeriod(p.id, 'REOPEN')}
                        className="px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                      >
                        بازگشایی دوره
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit & Security Logs */}
      {logs && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">گزارش ممیزی تغییرناپذیر (Audit Logs)</h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto text-xs">
              {logs.audit_logs.map((a) => (
                <div key={a.id} className="px-4 py-2.5">
                  <div className="flex justify-between font-semibold text-slate-900">
                    <span className="font-mono">{a.action}</span>
                    <span>{a.actor_name || a.actor_membership_id}</span>
                  </div>
                  <div className="text-slate-500 mt-0.5 font-mono">{a.entity_type} / {a.entity_id}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700" />
              <h3 className="text-sm font-bold text-slate-900">رویدادهای امنیتی و دسترسی (Security Events)</h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto text-xs">
              {logs.security_events.length === 0 ? (
                <div className="p-4 text-slate-500">رویداد امنیتی مسدودشده‌ای ثبت نشده است.</div>
              ) : (
                logs.security_events.map((s) => (
                  <div key={s.id} className="px-4 py-2.5">
                    <div className="flex justify-between font-semibold text-rose-800">
                      <span className="font-mono">{s.event_code}</span>
                      <span>{s.severity}</span>
                    </div>
                    <div className="text-slate-600 mt-0.5 font-mono truncate">{s.details_json}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
