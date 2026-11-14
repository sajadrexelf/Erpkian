import { AlertCircle, Eye, Send, ShieldAlert, Sparkles } from 'lucide-react';
import React, { useState } from 'react';
import type { CurrencyCode, DeclarativeWidget } from '../../shared/contracts';
import { apiRequest, type ClientAuthSession } from '../api';
import { formatMoney } from '../format';

interface OrchestratorMessage {
  id: string;
  sender: 'USER' | 'ASSISTANT';
  text_fa: string;
  service_code?: string;
  rbac_status?: string;
  narrative_source?: string;
  widgets?: DeclarativeWidget[];
  evidences?: Array<Record<string, unknown>>;
}

interface AiWorkspaceViewProps {
  session: ClientAuthSession;
  displayCurrency: CurrencyCode;
  onNavigate: (tab: string) => void;
  onOpenEvidence: (title: string, evidences: any[], snapshot?: any) => void;
}

const QUICK_PROMPTS = [
  'کدام مشتری‌ها بیشترین بدهی معوق را دارند؟',
  'وضعیت اسناد در انتظار بررسی و تایید دوامضایی چیست؟',
  'ارسال فاکتورها به سامانه مودیان',
];

export const AiWorkspaceView: React.FC<AiWorkspaceViewProps> = ({
  session,
  displayCurrency,
  onNavigate,
  onOpenEvidence,
}) => {
  const [prompt, setPrompt] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<OrchestratorMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const sessionEpochRef = React.useRef(0);

  React.useEffect(() => {
    sessionEpochRef.current += 1;
    setMessages([]);
    setConversationId(null);
    setPrompt('');
    setLoading(false);
  }, [session.membershipId, session.organizationId]);

  const sendPrompt = async (textToSend: string) => {
    const clean = textToSend.trim();
    if (!clean || loading) return;

    const myEpoch = sessionEpochRef.current;
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, sender: 'USER', text_fa: clean }]);
    setPrompt('');
    setLoading(true);
    try {
      const resp = await apiRequest<{
        conversation_id: string;
        message_id: string;
        service_code: string;
        rbac_status: string;
        narrative_source: string;
        text_fa: string;
        widgets: DeclarativeWidget[];
        evidences: Array<Record<string, unknown>>;
      }>('/api/ai/orchestrate', session, {
        method: 'POST',
        body: { prompt: clean, conversation_id: conversationId },
      });

      if (sessionEpochRef.current !== myEpoch) return;
      setConversationId(resp.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: resp.message_id,
          sender: 'ASSISTANT',
          text_fa: resp.text_fa,
          service_code: resp.service_code,
          rbac_status: resp.rbac_status,
          narrative_source: resp.narrative_source,
          widgets: resp.widgets,
          evidences: resp.evidences,
        },
      ]);
    } catch (err) {
      if (sessionEpochRef.current !== myEpoch) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ASSISTANT',
          text_fa: err instanceof Error ? err.message : 'خطا در اجرای ارکستراتور',
          rbac_status: 'ERROR',
        },
      ]);
    } finally {
      if (sessionEpochRef.current === myEpoch) setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="ai-workspace-view">
      {/* Quick prompts header */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Sparkles className="w-4 h-4 text-teal-700" />
          <span>دستیار مکالمه‌ای ارکستراتور Erpkian (کنترل RBAC + شواهد قطعی)</span>
        </div>
        <p className="text-xs text-slate-600 mt-1">
          تمام ارقام مستقیماً از موتورهای قطعی سرور محاسبه می‌شوند. اگر نقش فعلی مجوز سرویس را نداشته باشد یا سرویس در نسخه ۱ قفل باشد، اجرا پیش از دسترسی به داده متوقف می‌شود.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => sendPrompt(q)}
              className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 font-medium"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation feed */}
      <div className="space-y-4">
        {messages.length === 0 && (
          <div className="bg-white border border-dashed border-slate-300 rounded-lg p-8 text-center text-sm text-slate-500">
            یکی از پرسش‌های آماده بالا را انتخاب کنید یا سوال مالی خود را به فارسی بنویسید.
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg border p-4 ${
              m.sender === 'USER'
                ? 'bg-slate-800 text-white border-slate-800 mr-auto max-w-2xl'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {m.sender === 'ASSISTANT' && (
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2.5 border-b border-slate-100 text-xs text-slate-500">
                <span className="font-mono font-semibold text-teal-800">سرویس: {m.service_code}</span>
                <span>
                  {m.rbac_status === 'DENIED' || m.rbac_status === 'LOCKED_IN_V1'
                    ? 'مسدودشده توسط کنترل دسترسی/نسخه'
                    : m.narrative_source === 'GEMINI_GROUNDED'
                      ? 'روایت تاییدشده با Gemini'
                      : 'خلاصه قطعی سرور'}
                </span>
              </div>
            )}

            <p className="text-sm leading-7 whitespace-pre-wrap">{m.text_fa}</p>

            {/* Declarative Widgets */}
            {m.widgets && m.widgets.length > 0 && (
              <div className="mt-4 space-y-3">
                {m.widgets.map((w, idx) => {
                  if (w.type === 'KpiSummaryStrip') {
                    const metrics = (w.props.metrics as Array<{ metric_key: string; label_fa: string; value_irr: number }>) ?? [];
                    return (
                      <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {metrics.map((met) => (
                          <div key={met.metric_key} className="bg-slate-50 border border-slate-200 rounded-md p-3">
                            <div className="text-xs text-slate-500">{met.label_fa}</div>
                            <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                              {formatMoney(met.value_irr, displayCurrency)}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }

                  if (w.type === 'ConfidenceAndWarningBanner') {
                    const isHigh = w.props.severity === 'HIGH';
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-md border text-xs flex items-start gap-2 ${
                          isHigh
                            ? 'bg-rose-50 border-rose-200 text-rose-900'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}
                      >
                        {isHigh ? <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                        <div>
                          <span className="font-mono font-bold ml-1.5">[{String(w.props.code)}]</span>
                          <span>{String(w.props.message_fa)}</span>
                        </div>
                      </div>
                    );
                  }

                  if (w.type === 'InteractiveDataTable') {
                    const cols = (w.props.columns as Array<{ key: string; label_fa: string; format?: string }>) ?? [];
                    const rows = (w.props.rows as Array<Record<string, unknown>>) ?? [];
                    return (
                      <div key={idx} className="border border-slate-200 rounded-md overflow-hidden">
                        <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 border-b border-slate-200">
                          {String(w.props.title_fa)}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                              <tr>
                                {cols.map((c) => (
                                  <th key={c.key} className="py-2 px-3 text-right font-semibold">{c.label_fa}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {rows.length === 0 ? (
                                <tr>
                                  <td colSpan={cols.length} className="py-4 px-3 text-center text-slate-500">
                                    موردی یافت نشد.
                                  </td>
                                </tr>
                              ) : (
                                rows.map((row, rIdx) => (
                                  <tr key={rIdx}>
                                    {cols.map((c) => (
                                      <td key={c.key} className="py-2 px-3 tabular-nums text-slate-800">
                                        {c.format === 'IRR'
                                          ? formatMoney(Number(row[c.key] ?? 0), displayCurrency)
                                          : String(row[c.key] ?? '—')}
                                      </td>
                                    ))}
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  }

                  if (w.type === 'EvidenceDrawerTrigger') {
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onOpenEvidence('شواهد محاسبه ارکستراتور', w.props.evidences as any[], w.props.snapshot)}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-teal-300 bg-teal-50 text-teal-800 font-medium hover:bg-teal-100"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{String(w.props.label_fa)}</span>
                      </button>
                    );
                  }

                  if (w.type === 'NextBestActionChips') {
                    const actions = (w.props.actions as Array<{ action_code: string; title_fa: string; target_route?: string }>) ?? [];
                    return (
                      <div key={idx} className="flex flex-wrap gap-2 pt-1">
                        {actions.map((act) => (
                          <button
                            key={act.action_code}
                            type="button"
                            onClick={() => onNavigate(act.target_route || 'aging')}
                            className="text-xs px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-medium"
                          >
                            {act.title_fa}
                          </button>
                        ))}
                      </div>
                    );
                  }

                  if (w.type === 'ClarificationPromptCard') {
                    const sugs = (w.props.suggestions as string[]) ?? [];
                    return (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2">
                        <div className="text-xs font-semibold text-slate-700">پیشنهادهای دقیق‌تر:</div>
                        <div className="flex flex-wrap gap-2">
                          {sugs.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => sendPrompt(s)}
                              className="text-xs px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-800"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Prompt Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendPrompt(prompt);
        }}
        className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-2 sticky bottom-2 shadow-sm"
      >
        <label htmlFor="ai-prompt-input" className="sr-only">پرسش مالی از دستیار هوشمند</label>
        <input
          id="ai-prompt-input"
          data-testid="ai-prompt-input"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="سوال مالی بپرسید؛ مثلاً: کدام مشتری‌ها بیشترین بدهی معوق را دارند؟"
          className="flex-1 text-sm px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
        <button
          type="submit"
          data-testid="ai-send-btn"
          disabled={loading || !prompt.trim()}
          className="px-4 py-2 rounded-md bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-medium flex items-center gap-1.5"
        >
          <Send className="w-4 h-4" />
          <span>{loading ? 'در حال تحلیل...' : 'ارسال'}</span>
        </button>
      </form>
    </div>
  );
};
