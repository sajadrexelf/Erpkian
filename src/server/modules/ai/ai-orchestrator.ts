import { GoogleGenAI } from '@google/genai';
import type { DeclarativeWidget } from '../../../shared/contracts';
import { normalizePersianText } from '../../../shared/jalali';
import type { ErpkianDb } from '../../db/schema';
import {
  newId,
  recordSecurityEvent,
  type TenantMembershipContext,
} from '../../kernel/context';
import { getDashboardSummary, runAccountsReceivableAgingReport } from '../reporting/reporting-service';

export interface OrchestratorResponse {
  conversation_id: string;
  message_id: string;
  intent_code: string;
  service_code: string;
  rbac_status: 'ALLOWED' | 'DENIED' | 'LOCKED_IN_V1';
  narrative_source: 'DETERMINISTIC_TEMPLATE' | 'GEMINI_GROUNDED';
  text_fa: string;
  widgets: DeclarativeWidget[];
  evidences: Array<Record<string, unknown>>;
}

async function generateGroundedNarrativeIfConfigured(
  fallbackTextFa: string,
  verifiedFactPayload: unknown
): Promise<{ textFa: string; source: 'DETERMINISTIC_TEMPLATE' | 'GEMINI_GROUNDED' }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { textFa: fallbackTextFa, source: 'DETERMINISTIC_TEMPLATE' };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const call = ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `شما دستیار تحلیلی پلتفرم حسابداری Erpkian هستید. فقط و فقط بر اساس داده تاییدشده JSON زیر یک پاسخ کوتاه (حداکثر ۳ جمله)، دقیق و بدون علامت مارک‌داون به فارسی رسمی بنویسید. هیچ عددی را از خودتان نسازید و اگر فیلد هشداری وجود دارد حتماً به آن اشاره کنید.\n\nداده قطعی سرور:\n${JSON.stringify(verifiedFactPayload)}`,
            },
          ],
        },
      ],
    });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
    const resp = await Promise.race([call, timeout]);
    const txt = resp && 'text' in resp ? resp.text?.trim() : '';
    if (txt && txt.length > 10) {
      return { textFa: txt.replaceAll('**', ''), source: 'GEMINI_GROUNDED' };
    }
  } catch {
    // Safe fallback to deterministic verified Persian summary
  }
  return { textFa: fallbackTextFa, source: 'DETERMINISTIC_TEMPLATE' };
}

function logToolInvocation(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  conversationId: string,
  toolName: string,
  serviceCode: string,
  outputStatus: 'SUCCESS' | 'DENIED' | 'MISSING_INPUT' | 'ERROR',
  summary: unknown
) {
  db.prepare(
    `INSERT INTO tool_invocations (id, organization_id, conversation_id, membership_id, tool_name, service_code, output_status, summary_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId('tinv'),
    ctx.organizationId,
    conversationId,
    ctx.membershipId,
    toolName,
    serviceCode,
    outputStatus,
    JSON.stringify(summary),
    new Date().toISOString()
  );
}

export async function runAiOrchestrator(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  promptRaw: string,
  conversationIdInput?: string | null
): Promise<OrchestratorResponse> {
  const prompt = normalizePersianText(promptRaw);
  const now = new Date().toISOString();

  let conversationId = conversationIdInput?.trim() || '';
  if (conversationId) {
    const exists = db
      .prepare('SELECT id FROM conversations WHERE organization_id = ? AND id = ?')
      .get(ctx.organizationId, conversationId);
    if (!exists) conversationId = '';
  }

  if (!conversationId) {
    conversationId = newId('conv');
    db.prepare(
      `INSERT INTO conversations (id, organization_id, membership_id, title_fa, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(conversationId, ctx.organizationId, ctx.membershipId, promptRaw.slice(0, 60) || 'گفتگوی مالی جدید', now);
  }

  db.prepare(
    `INSERT INTO conversation_messages (id, organization_id, conversation_id, sender, text_fa, widgets_json, created_at)
     VALUES (?, ?, ?, 'USER', ?, NULL, ?)`
  ).run(newId('msg'), ctx.organizationId, conversationId, promptRaw, now);

  // 1. Locked Tax Submission Guard (TAX-SUB-MOADIAN-001 / TAX-SUB-RETURN-001)
  if (/مودیان|مالیات.*ارسال|اظهارنامه|گزارش فصلی|سامانه مودیان/i.test(prompt)) {
    const textFa =
      'سرویس ارسال رسمی به سامانه مودیان و ارسال اظهارنامه (TAX-SUB-MOADIAN-001 / TAX-SUB-RETURN-001) در نسخه ۱ پلتفرم Erpkian قفل است (FEATURE_LOCKED_IN_V1) و هیچ ارسال مستقیم یا ساختگی به سامانه‌های حاکمیتی انجام نمی‌شود.';
    const widgets: DeclarativeWidget[] = [
      {
        type: 'ConfidenceAndWarningBanner',
        props: {
          severity: 'HIGH',
          code: 'FEATURE_LOCKED_IN_V1',
          message_fa: textFa,
        },
      },
    ];
    logToolInvocation(db, ctx, conversationId, 'tax_submission_gate', 'TAX-SUB-MOADIAN-001', 'DENIED', {
      reason: 'FEATURE_LOCKED_IN_V1',
    });
    const msgId = newId('msg');
    db.prepare(
      `INSERT INTO conversation_messages (id, organization_id, conversation_id, sender, text_fa, widgets_json, created_at)
       VALUES (?, ?, ?, 'ASSISTANT', ?, ?, ?)`
    ).run(msgId, ctx.organizationId, conversationId, textFa, JSON.stringify(widgets), new Date().toISOString());

    return {
      conversation_id: conversationId,
      message_id: msgId,
      intent_code: 'TAX_SUBMISSION_BLOCKED',
      service_code: 'TAX-SUB-MOADIAN-001',
      rbac_status: 'LOCKED_IN_V1',
      narrative_source: 'DETERMINISTIC_TEMPLATE',
      text_fa: textFa,
      widgets,
      evidences: [],
    };
  }

  // 2. AR Aging / Debtors / Overdue Intent (FIN-AR-AGING-001)
  if (/بدهی|معوق|مطالبات|بدهکار|مشتری|وصول|سنی|aging|چک/i.test(prompt)) {
    if (!ctx.permissions.has('ar:view_aging')) {
      const deniedMsg = `دسترسی نقش فعلی شما (${ctx.roles.join(', ')}) برای مشاهده گزارش مطالبات مشتریان (مجوز ar:view_aging) مجاز نیست.`;
      recordSecurityEvent(db, {
        organizationId: ctx.organizationId,
        eventCode: 'AI_ORCHESTRATOR_RBAC_DENIED',
        severity: 'MEDIUM',
        actorMembershipId: ctx.membershipId,
        details: { service_code: 'FIN-AR-AGING-001', required_permission: 'ar:view_aging', roles: ctx.roles },
      });
      logToolInvocation(db, ctx, conversationId, 'ar_aging_report', 'FIN-AR-AGING-001', 'DENIED', {
        required_permission: 'ar:view_aging',
      });
      const widgets: DeclarativeWidget[] = [
        {
          type: 'ConfidenceAndWarningBanner',
          props: {
            severity: 'HIGH',
            code: 'RBAC_PERMISSION_DENIED',
            message_fa: deniedMsg,
          },
        },
      ];
      const msgId = newId('msg');
      db.prepare(
        `INSERT INTO conversation_messages (id, organization_id, conversation_id, sender, text_fa, widgets_json, created_at)
         VALUES (?, ?, ?, 'ASSISTANT', ?, ?, ?)`
      ).run(msgId, ctx.organizationId, conversationId, deniedMsg, JSON.stringify(widgets), new Date().toISOString());

      return {
        conversation_id: conversationId,
        message_id: msgId,
        intent_code: 'AR_AGING_DENIED',
        service_code: 'FIN-AR-AGING-001',
        rbac_status: 'DENIED',
        narrative_source: 'DETERMINISTIC_TEMPLATE',
        text_fa: deniedMsg,
        widgets,
        evidences: [],
      };
    }

    const report = runAccountsReceivableAgingReport(db, ctx, { asOfJalali: '1405/08/25', saveVersion: true });
    logToolInvocation(db, ctx, conversationId, 'ar_aging_report', 'FIN-AR-AGING-001', 'SUCCESS', {
      report_version_id: report.execution_meta.report_version_id,
      version_number: report.execution_meta.version_number,
      row_count: report.rows.length,
    });

    const topDebtor = report.rows[0];
    const openTotal = report.summary_metrics[0]?.value_irr ?? 0;
    const overdueTotal = report.summary_metrics[1]?.value_irr ?? 0;
    const pendingCheques = report.summary_metrics[2]?.value_irr ?? 0;

    const fallbackText =
      report.rows.length === 0
        ? 'در حال حاضر فاکتور فروش قطعی با مانده باز در تاریخ ۱۴۰۵/۰۸/۲۵ وجود ندارد.'
        : `بر اساس گزارش قطعی سنی مطالبات (نسخه v${report.execution_meta.version_number} تا تاریخ ${report.data_snapshot.as_of_date_jalali})، کل مانده باز مطالبات ${openTotal.toLocaleString('fa-IR')} ریال است که ${overdueTotal.toLocaleString('fa-IR')} ریال آن معوق محسوب می‌شود. بیشترین بدهی باز مربوط به «${topDebtor.contact_name}» با مانده ${topDebtor.open_balance_irr.toLocaleString('fa-IR')} ریال است (چک‌های در جریان وصول: ${pendingCheques.toLocaleString('fa-IR')} ریال که تا وصول قطعی از بدهی کسر نشده‌اند).`;

    const grounded = await generateGroundedNarrativeIfConfigured(fallbackText, {
      as_of_jalali: report.data_snapshot.as_of_date_jalali,
      summary_metrics: report.summary_metrics,
      top_customers: report.rows.slice(0, 5),
      warnings: report.warnings_and_limitations,
    });

    const widgets: DeclarativeWidget[] = [
      {
        type: 'KpiSummaryStrip',
        props: { metrics: report.summary_metrics },
      },
      ...report.warnings_and_limitations.map((w) => ({
        type: 'ConfidenceAndWarningBanner' as const,
        props: { severity: w.severity, code: w.warning_code, message_fa: w.message_fa },
      })),
      {
        type: 'InteractiveDataTable',
        props: {
          title_fa: `بدهکاران بر اساس گزارش سنی مطالبات (مبنا: ${report.data_snapshot.as_of_date_jalali})`,
          columns: [
            { key: 'contact_name', label_fa: 'نام مشتری' },
            { key: 'open_balance_irr', label_fa: 'مانده باز (ریال)', format: 'IRR' },
            { key: 'overdue_irr', label_fa: 'معوق (ریال)', format: 'IRR' },
            { key: 'pending_cheques_irr', label_fa: 'چک در جریان (ریال)', format: 'IRR' },
            { key: 'max_days_past_due', label_fa: 'بیشترین تاخیر (روز)' },
          ],
          rows: report.rows.map((r) => ({
            contact_id: r.contact_id,
            contact_name: r.contact_name,
            open_balance_irr: r.open_balance_irr,
            overdue_irr: r.bucket_1_30_irr + r.bucket_31_60_irr + r.bucket_61_90_irr + r.bucket_90_plus_irr,
            pending_cheques_irr: r.pending_cheques_irr,
            max_days_past_due: r.max_days_past_due,
          })),
        },
      },
      {
        type: 'EvidenceDrawerTrigger',
        props: {
          label_fa: `مشاهده ${report.evidences.length} سند پشتیبان و اسنپ‌شات گزارش`,
          evidences: report.evidences,
          snapshot: report.data_snapshot,
        },
      },
      {
        type: 'NextBestActionChips',
        props: { actions: report.next_best_actions },
      },
    ];

    const msgId = newId('msg');
    db.prepare(
      `INSERT INTO conversation_messages (id, organization_id, conversation_id, sender, text_fa, widgets_json, created_at)
       VALUES (?, ?, ?, 'ASSISTANT', ?, ?, ?)`
    ).run(msgId, ctx.organizationId, conversationId, grounded.textFa, JSON.stringify(widgets), new Date().toISOString());

    return {
      conversation_id: conversationId,
      message_id: msgId,
      intent_code: 'AR_AGING_QUERY',
      service_code: 'FIN-AR-AGING-001',
      rbac_status: 'ALLOWED',
      narrative_source: grounded.source,
      text_fa: grounded.textFa,
      widgets,
      evidences: report.evidences as unknown as Array<Record<string, unknown>>,
    };
  }

  // 3. Pending Docs / Approvals / Dashboard Overview
  if (/اسناد|سند|انتظار|بازبینی|ocr|داشبورد|وضعیت|خلاصه|تایید/i.test(prompt)) {
    const dash = getDashboardSummary(db, ctx);
    logToolInvocation(db, ctx, conversationId, 'dashboard_summary', 'RPT-DASH-001', 'SUCCESS', {
      pending_approvals: dash.pending_approvals_count,
      recent_docs: dash.recent_documents.length,
    });

    const pendingInvs = db
      .prepare(
        `SELECT i.id, i.invoice_number, i.lifecycle_status, i.net_total_irr, c.canonical_name as contact_name
         FROM invoices i JOIN contacts c ON c.id = i.contact_id
         WHERE i.organization_id = ? AND i.lifecycle_status IN ('Needs Review', 'Verified', 'Awaiting Approval')`
      )
      .all(ctx.organizationId) as Array<Record<string, unknown>>;

    const textFa = `در سازمان «${ctx.organizationName}»، هم‌اکنون ${pendingInvs.length} فاکتور در چرخه پیش از ثبت قطعی (Needs Review / Verified / Awaiting Approval) و ${dash.pending_approvals_count} درخواست در کارتابل تایید دوامضایی وجود دارد.`;

    const widgets: DeclarativeWidget[] = [
      {
        type: 'InteractiveDataTable',
        props: {
          title_fa: 'اسناد و فاکتورهای منتظر اقدام',
          columns: [
            { key: 'invoice_number', label_fa: 'شماره فاکتور' },
            { key: 'contact_name', label_fa: 'طرف‌حساب' },
            { key: 'lifecycle_status', label_fa: 'وضعیت' },
            { key: 'net_total_irr', label_fa: 'مبلغ خالص (ریال)', format: 'IRR' },
          ],
          rows: pendingInvs,
        },
      },
      {
        type: 'NextBestActionChips',
        props: {
          actions: [
            { action_code: 'GO_OCR_REVIEW', title_fa: 'باز کردن کارتابل بازبینی OCR', target_service_code: 'DOC-REVIEW-007', target_route: 'ocr-review' },
            { action_code: 'GO_APPROVALS', title_fa: 'مشاهده کارتابل تایید دوامضایی', target_service_code: 'DOC-POST-008', target_route: 'approvals' },
          ],
        },
      },
    ];

    const msgId = newId('msg');
    db.prepare(
      `INSERT INTO conversation_messages (id, organization_id, conversation_id, sender, text_fa, widgets_json, created_at)
       VALUES (?, ?, ?, 'ASSISTANT', ?, ?, ?)`
    ).run(msgId, ctx.organizationId, conversationId, textFa, JSON.stringify(widgets), new Date().toISOString());

    return {
      conversation_id: conversationId,
      message_id: msgId,
      intent_code: 'DASHBOARD_AND_PENDING_WORK',
      service_code: 'RPT-DASH-001',
      rbac_status: 'ALLOWED',
      narrative_source: 'DETERMINISTIC_TEMPLATE',
      text_fa: textFa,
      widgets,
      evidences: [],
    };
  }

  // 4. Ambiguous / Needs Clarification (never hallucinate)
  logToolInvocation(db, ctx, conversationId, 'intent_clarification', 'ORCHESTRATOR', 'MISSING_INPUT', { prompt });
  const clarifyText =
    'درخواست شما به راهنمایی دقیق‌تری نیاز دارد. می‌توانید یکی از تحلیل‌های تاییدشده زیر را انتخاب کنید یا درباره بدهی مشتریان، چک‌های صیادی و اسناد در انتظار بررسی بپرسید.';
  const widgets: DeclarativeWidget[] = [
    {
      type: 'ClarificationPromptCard',
      props: {
        message_fa: clarifyText,
        suggestions: [
          'کدام مشتری‌ها بیشترین بدهی معوق را دارند؟',
          'وضعیت اسناد در انتظار بررسی و تایید دوامضایی چیست؟',
          'ارسال فاکتورها به سامانه مودیان',
        ],
      },
    },
  ];
  const msgId = newId('msg');
  db.prepare(
    `INSERT INTO conversation_messages (id, organization_id, conversation_id, sender, text_fa, widgets_json, created_at)
     VALUES (?, ?, ?, 'ASSISTANT', ?, ?, ?)`
  ).run(msgId, ctx.organizationId, conversationId, clarifyText, JSON.stringify(widgets), new Date().toISOString());

  return {
    conversation_id: conversationId,
    message_id: msgId,
    intent_code: 'CLARIFICATION_REQUIRED',
    service_code: 'ORCHESTRATOR',
    rbac_status: 'ALLOWED',
    narrative_source: 'DETERMINISTIC_TEMPLATE',
    text_fa: clarifyText,
    widgets,
    evidences: [],
  };
}
