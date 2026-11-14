import {
  BarChart3,
  Bot,
  CheckSquare,
  FileSearch,
  Files,
  LayoutDashboard,
  Menu,
  ReceiptText,
  Settings,
  WalletCards,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { apiRequest, type ClientAuthSession } from './client/api';
import { EvidenceDrawer } from './client/components/EvidenceDrawer';
import { AgingView } from './client/views/AgingView';
import { AiWorkspaceView } from './client/views/AiWorkspaceView';
import { AdminView, ApprovalsView } from './client/views/ApprovalsAndAdminView';
import { DashboardView } from './client/views/DashboardView';
import { DocumentsView } from './client/views/DocumentsView';
import { InvoicesView } from './client/views/InvoicesView';
import { OcrReviewView } from './client/views/OcrReviewView';
import { PaymentsView } from './client/views/PaymentsView';
import type { CurrencyCode, ReportEvidenceItem } from './shared/contracts';

type NavTab =
  | 'dashboard'
  | 'workspace'
  | 'documents'
  | 'ocr-review'
  | 'invoices'
  | 'payments'
  | 'aging'
  | 'approvals'
  | 'admin';

interface PersonaItem {
  membership_id: string;
  organization_id: string;
  organization_name: string;
  full_name_fa: string;
  role_code: string;
  role_name_fa: string;
}

interface SessionContextPayload {
  current_context: {
    organization_id: string;
    organization_name: string;
    is_demo_synthetic: boolean;
    display_currency_code: CurrencyCode;
    membership_id: string;
    full_name_fa: string;
    roles: string[];
    gemini_ocr_configured: boolean;
  };
  personas: PersonaItem[];
}

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'داشبورد مدیریتی', icon: LayoutDashboard },
  { id: 'workspace', label: 'دستیار هوشمند', icon: Bot },
  { id: 'documents', label: 'مرکز اسناد و آپلود', icon: Files },
  { id: 'ocr-review', label: 'بازبینی انسانی OCR', icon: FileSearch },
  { id: 'invoices', label: 'فاکتورها و ثبت قطعی', icon: ReceiptText },
  { id: 'payments', label: 'دریافت و چک صیادی', icon: WalletCards },
  { id: 'aging', label: 'سنی مطالبات و خروجی', icon: BarChart3 },
  { id: 'approvals', label: 'کارتابل تایید دوامضایی', icon: CheckSquare },
  { id: 'admin', label: 'دوره مالی و ممیزی', icon: Settings },
];

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [session, setSession] = useState<ClientAuthSession>({
    membershipId: 'mem-aria-owner',
    organizationId: 'org-demo-aria',
  });
  const [ctxData, setCtxData] = useState<SessionContextPayload | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>('IRT');
  const [reviewDocumentId, setReviewDocumentId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [evidenceState, setEvidenceState] = useState<{
    open: boolean;
    title: string;
    evidences: ReportEvidenceItem[];
    snapshot: any;
  }>({ open: false, title: '', evidences: [], snapshot: null });

  const loadSessionContext = async (targetSession: ClientAuthSession) => {
    try {
      const data = await apiRequest<SessionContextPayload>('/api/session/context', targetSession);
      setCtxData(data);
      setDisplayCurrency(data.current_context.display_currency_code);
    } catch (err) {
      setToast({ kind: 'error', text: err instanceof Error ? err.message : 'خطا در دریافت نشست کاربر' });
    }
  };

  useEffect(() => {
    loadSessionContext(session);
  }, [session.membershipId, session.organizationId]);

  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
  };

  const navigate = (tab: string, documentId?: string) => {
    if (documentId) setReviewDocumentId(documentId);
    setActiveTab(tab as NavTab);
    setMobileMenuOpen(false);
  };

  const switchPersona = (membershipId: string) => {
    const found = ctxData?.personas.find((p) => p.membership_id === membershipId);
    if (!found) return;
    setReviewDocumentId(null);
    setSession({ membershipId: found.membership_id, organizationId: found.organization_id });
    setToast({
      kind: 'success',
      text: `نشست آزمایشی به «${found.full_name_fa}» (${found.role_name_fa} — ${found.organization_name}) تغییر یافت.`,
    });
  };

  const currentTitle = NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Erpkian';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex" dir="rtl">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* RTL Sidebar */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-60 bg-white border-l border-slate-200 flex flex-col transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-base font-extrabold tracking-tight text-slate-900">ارپکیان (Erpkian)</div>
            <div className="text-[11px] text-teal-700 font-medium">حسابداری و هوش اسناد</div>
          </div>
          <button
            type="button"
            className="lg:hidden p-1 rounded border border-slate-200"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="بستن منو"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="منوی اصلی">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`nav-${item.id}`}
                onClick={() => navigate(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 text-[11px] text-slate-500 space-y-1">
          <div className="font-semibold text-slate-700">
            {ctxData?.current_context.organization_name || 'در حال بارگذاری...'}
          </div>
          <div>
            {ctxData?.current_context.is_demo_synthetic ? 'حالت: داده آزمایشی (Synthetic)' : 'سازمان عملیاتی'}
          </div>
          <div>
            موتور OCR: {ctxData?.current_context.gemini_ocr_configured ? 'Gemini + ساختاریافته' : 'ساختاریافته + ورود دستی'}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (3 zones: Page Title, Currency Toggle, Dev-Mode Persona/Org Switcher) */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden p-1.5 rounded-md border border-slate-200 text-slate-700"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="باز کردن منو"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">{currentTitle}</h1>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Display Currency Toggle */}
            <div className="hidden sm:flex items-center border border-slate-300 rounded-md overflow-hidden text-xs">
              <button
                type="button"
                data-testid="currency-irt-btn"
                onClick={() => setDisplayCurrency('IRT')}
                className={`px-2.5 py-1.5 font-medium ${displayCurrency === 'IRT' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                تومان
              </button>
              <button
                type="button"
                data-testid="currency-irr-btn"
                onClick={() => setDisplayCurrency('IRR')}
                className={`px-2.5 py-1.5 font-medium ${displayCurrency === 'IRR' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                ریال
              </button>
            </div>

            {/* Transparent Dev-Mode Role / Org Switcher */}
            {ctxData && (
              <div className="flex items-center gap-1.5">
                <label htmlFor="persona-switcher" className="sr-only">تغییر نقش یا سازمان آزمایشی</label>
                <select
                  id="persona-switcher"
                  data-testid="persona-switcher"
                  value={session.membershipId}
                  onChange={(e) => switchPersona(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-800 max-w-40 sm:max-w-xs"
                >
                  {ctxData.personas.map((p) => (
                    <option key={p.membership_id} value={p.membership_id}>
                      {p.role_name_fa} — {p.full_name_fa.split('(')[0].trim()} ({p.organization_id === 'org-demo-beta' ? 'سازمان دوم' : 'آریا گستر'})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </header>

        {/* Notification Banner */}
        {toast && (
          <div className="px-4 lg:px-6 pt-3" data-testid="app-toast">
            <div
              className={`rounded-md border px-4 py-2.5 text-xs flex items-center justify-between gap-3 ${
                toast.kind === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <span>{toast.text}</span>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-current opacity-75 hover:opacity-100"
                aria-label="بستن پیام"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Active View Content */}
        <main className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              session={session}
              displayCurrency={displayCurrency}
              onNavigate={navigate}
              onOpenEvidence={(title, evidences, snapshot) =>
                setEvidenceState({ open: true, title, evidences, snapshot })
              }
            />
          )}
          {activeTab === 'workspace' && (
            <AiWorkspaceView
              session={session}
              displayCurrency={displayCurrency}
              onNavigate={(tab) => navigate(tab)}
              onOpenEvidence={(title, evidences, snapshot) =>
                setEvidenceState({ open: true, title, evidences, snapshot })
              }
            />
          )}
          {activeTab === 'documents' && (
            <DocumentsView
              session={session}
              onNotify={notify}
              onOpenReview={(docId) => navigate('ocr-review', docId)}
            />
          )}
          {activeTab === 'ocr-review' && (
            <OcrReviewView
              session={session}
              initialDocumentId={reviewDocumentId}
              onNotify={notify}
              onVerifiedInvoice={() => {}}
            />
          )}
          {activeTab === 'invoices' && (
            <InvoicesView
              session={session}
              displayCurrency={displayCurrency}
              onNotify={notify}
              onOpenDocument={(docId) => navigate('ocr-review', docId)}
            />
          )}
          {activeTab === 'payments' && (
            <PaymentsView
              session={session}
              displayCurrency={displayCurrency}
              onNotify={notify}
            />
          )}
          {activeTab === 'aging' && (
            <AgingView
              session={session}
              displayCurrency={displayCurrency}
              onNotify={notify}
              onOpenEvidence={(title, evidences, snapshot) =>
                setEvidenceState({ open: true, title, evidences, snapshot })
              }
            />
          )}
          {activeTab === 'approvals' && <ApprovalsView session={session} onNotify={notify} />}
          {activeTab === 'admin' && <AdminView session={session} onNotify={notify} />}
        </main>
      </div>

      {/* Evidence Drawer */}
      <EvidenceDrawer
        open={evidenceState.open}
        onClose={() => setEvidenceState((p) => ({ ...p, open: false }))}
        titleFa={evidenceState.title}
        evidences={evidenceState.evidences}
        snapshotMeta={evidenceState.snapshot}
        displayCurrency={displayCurrency}
        onOpenDocument={(docId) => navigate('ocr-review', docId)}
      />
    </div>
  );
}

export default App;
