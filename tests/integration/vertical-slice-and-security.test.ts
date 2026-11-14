import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import ExcelJS from 'exceljs';
import { createErpkianServer, type ErpkianServerInstance } from '../../src/server/app';

let tmpDir = '';
let serverInst: ErpkianServerInstance;
let httpServer: http.Server;
let baseUrl = '';

const OWNER_HEADERS = { 'x-membership-id': 'mem-aria-owner', 'x-organization-id': 'org-demo-aria' };
const CFO_HEADERS = { 'x-membership-id': 'mem-aria-cfo', 'x-organization-id': 'org-demo-aria' };
const ACC_HEADERS = { 'x-membership-id': 'mem-aria-acc', 'x-organization-id': 'org-demo-aria' };
const INV_HEADERS = { 'x-membership-id': 'mem-aria-inv', 'x-organization-id': 'org-demo-aria' };
const BETA_HEADERS = { 'x-membership-id': 'mem-beta-owner', 'x-organization-id': 'org-demo-beta' };

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erpkian-it-'));
  const dbPath = path.join(tmpDir, 'test.sqlite');
  const storageDir = path.join(tmpDir, 'storage');
  serverInst = createErpkianServer({ dbPath, storageDir });
  httpServer = http.createServer(serverInst.app);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = httpServer.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  serverInst.db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function apiJson(
  urlPath: string,
  headers: Record<string, string>,
  init?: Omit<RequestInit, 'body'> & { body?: unknown }
) {
  const isForm = init?.body instanceof FormData;
  const resp = await fetch(`${baseUrl}${urlPath}`, {
    ...init,
    body: init?.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
    headers: {
      ...headers,
      ...(init?.body && !isForm ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = (await resp.json()) as any;
  return { status: resp.status, json };
}

test('Document Ingestion, Magic Bytes Security Block, SHA-256 Duplicate, Multi-page Merge, and OCR Review', async () => {
  // 1. Malicious .exe file (MZ header) must be blocked and logged in security_events
  const badFd = new FormData();
  badFd.append('files', new Blob([Buffer.from([0x4d, 0x5a, 0x90, 0x00])], { type: 'image/png' }), 'fake-invoice.png');
  const badRes = await apiJson('/api/documents/upload', ACC_HEADERS, { method: 'POST', body: badFd });
  assert.equal(badRes.status, 400);
  assert.equal(badRes.json.error.code, 'INVALID_FILE_TYPE');

  // 2. Upload valid structured JSON invoice + duplicate detection
  const sampleInvoiceJson = JSON.stringify({
    invoice_direction: 'SALE',
    invoice_number: 'S-1405-7701',
    contact_name: 'پخش مواد غذایی البرز (نمونه)',
    issue_jalali: '1405/08/25',
    due_jalali: '1405/09/25',
    currency: 'IRT',
    lines: [
      { line_number: 1, description: 'روغن سرخ‌کردنی ۵ لیتری (نمونه)', uom_name: 'بطری', quantity: 10, unit_price: 350000, tax_rate_pct: 10 },
    ],
  });

  const fd1 = new FormData();
  fd1.append('files', new Blob([sampleInvoiceJson], { type: 'application/json' }), 'inv-7701.json');
  const up1 = await apiJson('/api/documents/upload', ACC_HEADERS, { method: 'POST', body: fd1 });
  assert.equal(up1.status, 201);
  assert.equal(up1.json.data.documents[0].is_duplicate, false);
  const docId1 = up1.json.data.documents[0].id;

  const fdDup = new FormData();
  fdDup.append('files', new Blob([sampleInvoiceJson], { type: 'application/json' }), 'inv-7701-copy.json');
  const upDup = await apiJson('/api/documents/upload', ACC_HEADERS, { method: 'POST', body: fdDup });
  assert.equal(upDup.status, 201);
  assert.equal(upDup.json.data.documents[0].is_duplicate, true);
  assert.equal(upDup.json.data.documents[0].duplicate_of_document_id, docId1);

  // 3. Upload a 1x1 PNG image (without GEMINI_API_KEY) and verify honest OCR_ENGINE_UNAVAILABLE (no fake text!)
  const png1x1 = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
  );
  const fdPng = new FormData();
  fdPng.append('files', new Blob([png1x1], { type: 'image/png' }), 'scan-page-1.png');
  const upPng = await apiJson('/api/documents/upload', ACC_HEADERS, { method: 'POST', body: fdPng });
  assert.equal(upPng.status, 201);
  const pngDocId = upPng.json.data.documents[0].id;

  const origGemini = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const pngOcr = await apiJson(`/api/documents/${pngDocId}/ocr`, ACC_HEADERS, { method: 'POST' });
  if (origGemini) process.env.GEMINI_API_KEY = origGemini;
  assert.equal(pngOcr.status, 200);
  assert.equal(pngOcr.json.data.ocr_status, 'OCR_ENGINE_UNAVAILABLE');
  assert.equal(pngOcr.json.data.lifecycle_status, 'Needs Review');

  // 4. Multi-page merge (DOC-MERGE-002)
  const mergeRes = await apiJson('/api/documents/merge', ACC_HEADERS, {
    method: 'POST',
    body: { document_ids: [docId1, pngDocId], title_fa: 'سند ادغام‌شده تستی' },
  });
  assert.equal(mergeRes.status, 201);
  assert.equal(mergeRes.json.data.page_count, 2);

  // 5. Run OCR on structured JSON doc & submit human correction review -> Verified (NOT auto-Posted!)
  const ocrRes = await apiJson(`/api/documents/${docId1}/ocr`, ACC_HEADERS, { method: 'POST' });
  assert.equal(ocrRes.status, 200);
  assert.equal(ocrRes.json.data.ocr_status, 'EXTRACTED');
  assert.equal(ocrRes.json.data.lifecycle_status, 'Needs Review');

  const reviewRes = await apiJson(`/api/documents/${docId1}/review`, ACC_HEADERS, {
    method: 'POST',
    body: {
      decision: 'VERIFIED',
      invoiceDirection: 'SALE',
      invoiceNumber: 'S-1405-7701-REV',
      contactName: 'پخش مواد غذایی البرز (نمونه)',
      issueJalali: '1405/08/25',
      dueJalali: '1405/09/25',
      sourceCurrencyCode: 'IRR',
      lines: [
        { lineNumber: 1, description: 'روغن سرخ‌کردنی ۵ لیتری (نمونه)', uomName: 'بطری', quantity: 10, unitPriceSource: 3500000, taxRatePct: 10 },
      ],
    },
  });
  assert.equal(reviewRes.status, 200);
  assert.equal(reviewRes.json.data.lifecycle_status, 'Verified');
  assert.equal(reviewRes.json.data.invoice.lifecycle_status, 'Verified');
  assert.ok(reviewRes.json.data.corrections_count >= 1);
});

test('Posting Gate: Closed Period Block, Dual Approval & Self-Approval Forbidden, and CFO Final Post', async () => {
  // 1. Closed period invoice (1405/02/15 is CLOSED in seed) must be blocked at Posting Gate
  const closedInv = await apiJson('/api/invoices', ACC_HEADERS, {
    method: 'POST',
    body: {
      invoiceDirection: 'SALE',
      invoiceNumber: 'S-CLOSED-1',
      contactId: 'cnt-aria-bahar',
      issueJalali: '1405/02/15',
      dueJalali: '1405/03/15',
      sourceCurrencyCode: 'IRR',
      lines: [{ lineNumber: 1, description: 'کالای تست', quantity: 1, unitPriceSource: 1000000, taxRatePct: 10 }],
    },
  });
  assert.equal(closedInv.status, 201);
  await apiJson(`/api/invoices/${closedInv.json.data.id}/verify`, ACC_HEADERS, { method: 'POST' });
  const closedPost = await apiJson(`/api/invoices/${closedInv.json.data.id}/post`, ACC_HEADERS, { method: 'POST' });
  assert.equal(closedPost.status, 409);
  assert.equal(closedPost.json.error.code, 'FISCAL_PERIOD_LOCKED');

  // 2. High-value invoice >= 500,000,000 IRR triggers Dual Approval
  const hvInv = await apiJson('/api/invoices', ACC_HEADERS, {
    method: 'POST',
    body: {
      invoiceDirection: 'SALE',
      invoiceNumber: 'S-HV-9001',
      contactId: 'cnt-aria-bahar',
      issueJalali: '1405/08/25',
      dueJalali: '1405/09/25',
      sourceCurrencyCode: 'IRR',
      lines: [{ lineNumber: 1, productId: 'prd-aria-rice', description: 'برنج هاشمی ۱۰ کیلویی (نمونه)', uomName: 'کیسه', quantity: 40, unitPriceSource: 14500000, taxRatePct: 10 }],
    },
  });
  assert.equal(hvInv.status, 201);
  const hvId = hvInv.json.data.id;
  await apiJson(`/api/invoices/${hvId}/verify`, ACC_HEADERS, { method: 'POST' });

  const postReq = await apiJson(`/api/invoices/${hvId}/post`, ACC_HEADERS, { method: 'POST' });
  assert.equal(postReq.status, 200);
  assert.equal(postReq.json.data.lifecycle_status, 'Awaiting Approval');
  const approvalId = postReq.json.data.approval_request_id;

  // Same user (SENIOR_ACCOUNTANT) cannot approve their own request!
  const selfApp = await apiJson(`/api/approvals/${approvalId}/decide`, ACC_HEADERS, {
    method: 'POST',
    body: { decision: 'APPROVE' },
  });
  assert.equal(selfApp.status, 403);
  assert.equal(selfApp.json.error.code, 'SELF_APPROVAL_FORBIDDEN');

  // CFO approves -> Posted!
  const cfoApp = await apiJson(`/api/approvals/${approvalId}/decide`, CFO_HEADERS, {
    method: 'POST',
    body: { decision: 'APPROVE', noteFa: 'تایید مدیر مالی' },
  });
  assert.equal(cfoApp.status, 200);
  assert.equal(cfoApp.json.data.invoice_lifecycle_status, 'Posted');
});

test('AR Aging v1 -> v2 Snapshots, Sayad Check Clearing, Payment Overflow Block, and Real XLSX/PDF/CSV Exports', async () => {
  // Run Aging v1
  const ag1 = await apiJson('/api/reports/ar-aging?as_of_jalali=1405/08/25&save=true', OWNER_HEADERS);
  assert.equal(ag1.status, 200);
  const v1Number = ag1.json.data.execution_meta.version_number;

  // Payment allocation overflow must fail
  const overPay = await apiJson('/api/payments', ACC_HEADERS, {
    method: 'POST',
    body: {
      contactId: 'cnt-aria-alborz',
      method: 'TRANSFER',
      sourceCurrencyCode: 'IRR',
      amountSource: 500000000,
      paymentJalali: '1405/08/25',
      allocationMode: 'EXPLICIT',
      explicitAllocations: [{ invoiceId: 'inv-demo-1', allocatedAmountIrr: 450000000 }],
    },
  });
  assert.equal(overPay.status, 409);
  assert.equal(overPay.json.error.code, 'ALLOCATION_EXCEEDS_INVOICE_OPEN_BALANCE');

  // Clear pending Sayad check chk-demo-1 (IN_HAND -> DEPOSITED -> CLEARED) and run Aging v2
  const depRes = await apiJson('/api/checks/chk-demo-1/transition', ACC_HEADERS, {
    method: 'POST',
    body: { to_status: 'DEPOSITED' },
  });
  assert.equal(depRes.status, 200);
  const clrRes = await apiJson('/api/checks/chk-demo-1/transition', ACC_HEADERS, {
    method: 'POST',
    body: { to_status: 'CLEARED' },
  });
  assert.equal(clrRes.status, 200);

  const ag2 = await apiJson('/api/reports/ar-aging?as_of_jalali=1405/08/25&save=true', OWNER_HEADERS);
  assert.equal(ag2.status, 200);
  assert.ok(ag2.json.data.execution_meta.version_number > v1Number);

  // Verify real XLSX export (4 RTL sheets)
  const xlsxResp = await fetch(`${baseUrl}/api/reports/export?format=EXCEL&as_of_jalali=1405/08/25`, {
    headers: OWNER_HEADERS,
  });
  assert.equal(xlsxResp.status, 200);
  const xlsxBuf = Buffer.from(await xlsxResp.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsxBuf as any);
  assert.equal(wb.worksheets.length, 4);

  // Verify real PDF export (%PDF- signature)
  const pdfResp = await fetch(`${baseUrl}/api/reports/export?format=PDF&as_of_jalali=1405/08/25`, {
    headers: OWNER_HEADERS,
  });
  assert.equal(pdfResp.status, 200);
  const pdfBuf = Buffer.from(await pdfResp.arrayBuffer());
  assert.equal(pdfBuf.subarray(0, 5).toString('ascii'), '%PDF-');

  // Verify CSV UTF-8 BOM
  const csvResp = await fetch(`${baseUrl}/api/reports/export?format=CSV&as_of_jalali=1405/08/25`, {
    headers: OWNER_HEADERS,
  });
  assert.equal(csvResp.status, 200);
  const csvBuf = Buffer.from(await csvResp.arrayBuffer());
  assert.deepEqual(Array.from(csvBuf.subarray(0, 3)), [0xef, 0xbb, 0xbf]);
});

test('AI Orchestrator RBAC Gate, Cross-Tenant Isolation, Audit Log Immutability, and Locked V1 Tax Service', async () => {
  // 1. OWNER gets AR aging via AI Orchestrator
  const aiOk = await apiJson('/api/ai/orchestrate', OWNER_HEADERS, {
    method: 'POST',
    body: { prompt: 'کدام مشتری‌ها بیشترین بدهی معوق را دارند؟' },
  });
  assert.equal(aiOk.status, 200);
  assert.equal(aiOk.json.data.rbac_status, 'ALLOWED');
  assert.equal(aiOk.json.data.service_code, 'FIN-AR-AGING-001');
  assert.ok(aiOk.json.data.widgets.length >= 2);

  // 2. INVENTORY_MANAGER blocked from AR aging via AI Orchestrator
  const aiDeny = await apiJson('/api/ai/orchestrate', INV_HEADERS, {
    method: 'POST',
    body: { prompt: 'بدهی مشتریان چقدر است؟' },
  });
  assert.equal(aiDeny.status, 200);
  assert.equal(aiDeny.json.data.rbac_status, 'DENIED');

  // 3. Cross-Tenant Isolation: Org B cannot read Org A invoices, and header spoofing is blocked
  const betaInvoices = await apiJson('/api/invoices', BETA_HEADERS);
  assert.equal(betaInvoices.status, 200);
  const betaIds = betaInvoices.json.data.map((i: any) => i.id);
  assert.ok(betaIds.includes('inv-beta-secret'));
  assert.ok(!betaIds.includes('inv-demo-1'));

  const spoofAttempt = await apiJson('/api/invoices', {
    'x-membership-id': 'mem-aria-owner',
    'x-organization-id': 'org-demo-beta',
  });
  assert.equal(spoofAttempt.status, 403);
  assert.equal(spoofAttempt.json.error.code, 'CROSS_TENANT_ACCESS_DENIED');

  // 4. V1 Locked Tax submission endpoint returns 403 FEATURE_LOCKED_IN_V1
  const taxRes = await apiJson('/api/tax/moadian/submit', OWNER_HEADERS, { method: 'POST', body: {} });
  assert.equal(taxRes.status, 403);
  assert.equal(taxRes.json.error.code, 'FEATURE_LOCKED_IN_V1');

  // 5. Append-only audit_logs trigger prevents UPDATE/DELETE
  assert.throws(() => {
    serverInst.db.prepare('DELETE FROM audit_logs').run();
  }, /AUDIT_LOGS_IMMUTABLE/);
});
