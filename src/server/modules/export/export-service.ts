import ExcelJS from 'exceljs';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AgingCustomerRow, ErpkianReportEnvelope } from '../../../shared/contracts';
import type { ErpkianDb } from '../../db/schema';
import type { IObjectStoragePort } from '../../infrastructure/object-storage';
import {
  ErpkianAppError,
  newId,
  recordAuditLog,
  requirePermission,
  type TenantMembershipContext,
} from '../../kernel/context';
import { runAccountsReceivableAgingReport } from '../reporting/reporting-service';

const execFileAsync = promisify(execFile);

function findHeadlessChromiumBinary(): string | null {
  const candidates = [
    process.env.ERPKIAN_CHROMIUM_BIN,
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function generateAgingExcelBuffer(envelope: ErpkianReportEnvelope<AgingCustomerRow>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Erpkian Accounting Platform';
  wb.created = new Date();

  // Sheet 1: Executive Summary
  const shSummary = wb.addWorksheet('خلاصه مدیریتی', { views: [{ rightToLeft: true }] });
  shSummary.columns = [
    { header: 'شاخص / عنوان', key: 'label', width: 36 },
    { header: 'مقدار (ریال)', key: 'irr', width: 24 },
    { header: 'فرمول', key: 'formula', width: 18 },
  ];
  for (const m of envelope.summary_metrics) {
    shSummary.addRow({ label: m.label_fa, irr: m.value_irr, formula: m.formula_code });
  }
  shSummary.addRow({ label: 'تاریخ مبنای گزارش (شمسی)', irr: envelope.data_snapshot.as_of_date_jalali, formula: 'META' });
  shSummary.addRow({ label: 'تعداد اسناد در انتظار بررسی', irr: envelope.data_snapshot.pending_document_count, formula: 'WARN' });
  shSummary.getRow(1).font = { bold: true };

  // Sheet 2: Detailed Rows with Real Excel Formulas
  const shRows = wb.addWorksheet('جدول تفصیلی سنی مطالبات', { views: [{ rightToLeft: true }] });
  shRows.columns = [
    { header: 'نام مشتری', key: 'contact_name', width: 32 },
    { header: 'تعداد فاکتور', key: 'invoice_count', width: 14 },
    { header: 'جمع فاکتورها (ریال)', key: 'total_invoiced', width: 20 },
    { header: 'وصول‌شده قطعی (ریال)', key: 'cleared_paid', width: 20 },
    { header: 'چک در جریان (ریال)', key: 'pending_cheques', width: 20 },
    { header: 'مانده باز (ریال)', key: 'open_balance', width: 20 },
    { header: 'جاری (ریال)', key: 'current', width: 18 },
    { header: '۱ تا ۳۰ روز', key: 'b1', width: 18 },
    { header: '۳۱ تا ۶۰ روز', key: 'b2', width: 18 },
    { header: '۶۱ تا ۹۰ روز', key: 'b3', width: 18 },
    { header: 'بالای ۹۰ روز', key: 'b4', width: 18 },
  ];
  shRows.getRow(1).font = { bold: true };

  envelope.rows.forEach((r) => {
    shRows.addRow({
      contact_name: r.contact_name,
      invoice_count: r.invoice_count,
      total_invoiced: r.total_invoiced_irr,
      cleared_paid: r.cleared_paid_irr,
      pending_cheques: r.pending_cheques_irr,
      open_balance: r.open_balance_irr,
      current: r.current_irr,
      b1: r.bucket_1_30_irr,
      b2: r.bucket_31_60_irr,
      b3: r.bucket_61_90_irr,
      b4: r.bucket_90_plus_irr,
    });
  });

  const lastDataRow = envelope.rows.length + 1;
  const totalRowIdx = lastDataRow + 1;
  if (envelope.rows.length > 0) {
    shRows.addRow({
      contact_name: 'جمع کل',
      invoice_count: { formula: `SUM(B2:B${lastDataRow})` },
      total_invoiced: { formula: `SUM(C2:C${lastDataRow})` },
      cleared_paid: { formula: `SUM(D2:D${lastDataRow})` },
      pending_cheques: { formula: `SUM(E2:E${lastDataRow})` },
      open_balance: { formula: `SUM(F2:F${lastDataRow})` },
      current: { formula: `SUM(G2:G${lastDataRow})` },
      b1: { formula: `SUM(H2:H${lastDataRow})` },
      b2: { formula: `SUM(I2:I${lastDataRow})` },
      b3: { formula: `SUM(J2:J${lastDataRow})` },
      b4: { formula: `SUM(K2:K${lastDataRow})` },
    });
    shRows.getRow(totalRowIdx).font = { bold: true };
  }

  // Sheet 3: Evidence & Source Docs
  const shEv = wb.addWorksheet('شواهد و اسناد پشتیبان', { views: [{ rightToLeft: true }] });
  shEv.columns = [
    { header: 'شماره فاکتور', key: 'doc_num', width: 20 },
    { header: 'مشتری', key: 'contact', width: 28 },
    { header: 'تاریخ صدور', key: 'jalali', width: 16 },
    { header: 'مبلغ مانده باز (ریال)', key: 'amount', width: 22 },
    { header: 'شناسه سند مبدا', key: 'source_doc', width: 28 },
  ];
  shEv.getRow(1).font = { bold: true };
  for (const ev of envelope.evidences) {
    shEv.addRow({
      doc_num: ev.document_number,
      contact: ev.contact_name ?? '',
      jalali: ev.issue_jalali,
      amount: ev.contribution_amount_irr,
      source_doc: ev.source_document_id ?? 'ثبت مستقیم',
    });
  }

  // Sheet 4: Methodology & Warnings
  const shMeth = wb.addWorksheet('روش‌شناسی و هشدارها', { views: [{ rightToLeft: true }] });
  shMeth.columns = [
    { header: 'کد', key: 'code', width: 28 },
    { header: 'شرح فارسی', key: 'msg', width: 70 },
  ];
  shMeth.getRow(1).font = { bold: true };
  shMeth.addRow({ code: 'SNAPSHOT_HASH', msg: envelope.data_snapshot.snapshot_hash });
  shMeth.addRow({ code: 'ALGORITHM', msg: `${envelope.service_code} (${envelope.formula_version})` });
  for (const w of envelope.warnings_and_limitations) {
    shMeth.addRow({ code: w.warning_code, msg: w.message_fa });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function generateAgingCsvBuffer(envelope: ErpkianReportEnvelope<AgingCustomerRow>): Buffer {
  const header = [
    'مشتری',
    'تعداد فاکتور',
    'جمع فاکتور (ریال)',
    'وصول قطعی (ریال)',
    'چک در جریان (ریال)',
    'مانده باز (ریال)',
    'جاری (ریال)',
    '۱ تا ۳۰ روز',
    '۳۱ تا ۶۰ روز',
    '۶۱ تا ۹۰ روز',
    'بالای ۹۰ روز',
  ].join(',');

  const lines = envelope.rows.map((r) =>
    [
      `"${r.contact_name.replaceAll('"', '""')}"`,
      r.invoice_count,
      r.total_invoiced_irr,
      r.cleared_paid_irr,
      r.pending_cheques_irr,
      r.open_balance_irr,
      r.current_irr,
      r.bucket_1_30_irr,
      r.bucket_31_60_irr,
      r.bucket_61_90_irr,
      r.bucket_90_plus_irr,
    ].join(',')
  );

  // UTF-8 BOM for clean Persian Excel opening
  return Buffer.from('\uFEFF' + [header, ...lines].join('\r\n'), 'utf8');
}

async function generateAgingPdfBuffer(
  orgName: string,
  envelope: ErpkianReportEnvelope<AgingCustomerRow>
): Promise<Buffer> {
  const bin = findHeadlessChromiumBinary();
  if (!bin) {
    throw new ErpkianAppError(503, 'PDF_RENDERER_UNAVAILABLE', 'موتور رندر PDF در محیط سرور یافت نشد.');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erpkian-pdf-'));
  const htmlPath = path.join(tmpDir, 'report.html');
  const pdfPath = path.join(tmpDir, 'report.pdf');

  const rowsHtml = envelope.rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.contact_name)}</td>
        <td class="num">${r.invoice_count}</td>
        <td class="num">${r.total_invoiced_irr.toLocaleString('fa-IR')}</td>
        <td class="num">${r.cleared_paid_irr.toLocaleString('fa-IR')}</td>
        <td class="num">${r.pending_cheques_irr.toLocaleString('fa-IR')}</td>
        <td class="num bold">${r.open_balance_irr.toLocaleString('fa-IR')}</td>
        <td class="num">${(r.bucket_1_30_irr + r.bucket_31_60_irr + r.bucket_61_90_irr + r.bucket_90_plus_irr).toLocaleString('fa-IR')}</td>
      </tr>`
    )
    .join('');

  const warningsHtml = envelope.warnings_and_limitations
    .map((w) => `<li><strong>${escapeHtml(w.warning_code)}:</strong> ${escapeHtml(w.message_fa)}</li>`)
    .join('');

  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4 landscape; margin: 16mm; }
  body { font-family: "Noto Sans Arabic", "Noto Kufi Arabic", Tahoma, sans-serif; color: #0f172a; font-size: 11px; direction: rtl; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 16px; margin: 0 0 4px 0; color: #0f172a; }
  .meta { font-size: 10px; color: #475569; }
  .cards { display: flex; gap: 12px; margin-bottom: 14px; }
  .card { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
  .card-title { font-size: 10px; color: #475569; }
  .card-val { font-size: 14px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; }
  th { background: #f1f5f9; font-weight: 700; }
  .num { text-align: left; direction: ltr; font-variant-numeric: tabular-nums; }
  .bold { font-weight: 700; }
  .warn { border: 1px solid #f59e0b; background: #fffbeb; border-radius: 6px; padding: 8px 12px; }
  .footer { margin-top: 12px; font-size: 9px; color: #64748b; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>گزارش سنی مطالبات مشتریان (FIN-AR-AGING-001)</h1>
      <div class="meta">سازمان: ${escapeHtml(orgName)} | نسخه گزارش: v${envelope.execution_meta.version_number}</div>
    </div>
    <div class="meta">
      <div>تاریخ مبنا (شمسی): ${escapeHtml(envelope.data_snapshot.as_of_date_jalali)}</div>
      <div>زمان تولید: ${escapeHtml(envelope.execution_meta.generated_at_jalali)}</div>
    </div>
  </div>
  <div class="cards">
    ${envelope.summary_metrics
      .map(
        (m) => `
      <div class="card">
        <div class="card-title">${escapeHtml(m.label_fa)}</div>
        <div class="card-val">${m.value_irr.toLocaleString('fa-IR')} ریال</div>
      </div>`
      )
      .join('')}
  </div>
  <table>
    <thead>
      <tr>
        <th>طرف‌حساب / مشتری</th>
        <th>تعداد فاکتور</th>
        <th>جمع کل (ریال)</th>
        <th>وصول قطعی (ریال)</th>
        <th>چک در جریان (ریال)</th>
        <th>مانده باز (ریال)</th>
        <th>جمع معوق (ریال)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  ${warningsHtml ? `<div class="warn"><strong>هشدارها و محدودیت‌های داده:</strong><ul>${warningsHtml}</ul></div>` : ''}
  <div class="footer">
    شناسه اسنپ‌شات: ${escapeHtml(envelope.data_snapshot.data_snapshot_id)} | هش یکپارچگی: ${escapeHtml(envelope.data_snapshot.snapshot_hash.slice(0, 16))}
  </div>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, 'utf8');
  try {
    await execFileAsync(bin, [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      `--print-to-pdf=${pdfPath}`,
      '--no-pdf-header-footer',
      `file://${htmlPath}`,
    ]);
    return fs.readFileSync(pdfPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function exportAgingReport(
  db: ErpkianDb,
  storage: IObjectStoragePort,
  ctx: TenantMembershipContext,
  format: 'EXCEL' | 'PDF' | 'CSV' | 'JSON',
  asOfJalali?: string
): Promise<{ buffer: Buffer; mimeType: string; filename: string; reportVersionId: string }> {
  requirePermission(db, ctx, 'report:export');

  const envelope = runAccountsReceivableAgingReport(db, ctx, { asOfJalali, saveVersion: true });
  let buffer: Buffer;
  let mimeType: string;
  let ext: string;

  if (format === 'EXCEL') {
    buffer = await generateAgingExcelBuffer(envelope);
    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    ext = 'xlsx';
  } else if (format === 'PDF') {
    buffer = await generateAgingPdfBuffer(ctx.organizationName, envelope);
    mimeType = 'application/pdf';
    ext = 'pdf';
  } else if (format === 'CSV') {
    buffer = generateAgingCsvBuffer(envelope);
    mimeType = 'text/csv; charset=utf-8';
    ext = 'csv';
  } else {
    buffer = Buffer.from(JSON.stringify(envelope, null, 2), 'utf8');
    mimeType = 'application/json; charset=utf-8';
    ext = 'json';
  }

  const outId = newId('rout');
  const storageKey = `exports/${ctx.organizationId}/${envelope.execution_meta.report_version_id}-${outId}.${ext}`;
  storage.putObject(storageKey, buffer);

  db.prepare(
    `INSERT INTO report_outputs (id, organization_id, report_version_id, output_format, storage_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(outId, ctx.organizationId, envelope.execution_meta.report_version_id, format, storageKey, new Date().toISOString());

  recordAuditLog(db, {
    organizationId: ctx.organizationId,
    entityType: 'REPORT_EXPORT',
    entityId: outId,
    action: `RPT_EXPORT_001_${format}`,
    actorMembershipId: ctx.membershipId,
    afterState: {
      report_version_id: envelope.execution_meta.report_version_id,
      format,
      bytes: buffer.length,
    },
  });

  return {
    buffer,
    mimeType,
    filename: `erpkian-ar-aging-${envelope.data_snapshot.as_of_date_jalali.replaceAll('/', '-')}.${ext}`,
    reportVersionId: envelope.execution_meta.report_version_id,
  };
}
