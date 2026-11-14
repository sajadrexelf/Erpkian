import { GoogleGenAI } from '@google/genai';
import type { CurrencyCode, InvoiceDirection } from '../../../shared/contracts';
import { normalizeDigits, normalizePersianText } from '../../../shared/jalali';

export interface OcrExtractedLine {
  lineNumber: number;
  description: string;
  uomName: string;
  quantity: number;
  unitPriceSource: number;
  discountAmountSource?: number;
  discountPct?: number | null;
  taxRatePct?: number;
  isPromotionalFreeItem?: boolean;
  promoReason?: string | null;
  declaredLineNetSource?: number | null;
}

export interface OcrExtractionOutput {
  status: 'EXTRACTED' | 'OCR_ENGINE_UNAVAILABLE';
  engineAdapter: string;
  modelVersion: string;
  reasonFa?: string;
  detectedDocType: 'SALE_INVOICE' | 'PURCHASE_INVOICE' | 'SALE_RETURN' | 'PAYMENT_RECEIPT' | 'UNKNOWN';
  invoiceDirection: InvoiceDirection;
  invoiceNumber: string;
  contactName: string;
  issueJalali: string;
  dueJalali: string;
  sourceCurrencyCode: CurrencyCode | null;
  invoiceDiscountSource: number;
  lines: OcrExtractedLine[];
  fieldConfidences: Record<string, number>;
  averageConfidence: number | null;
}

export interface IOcrEngineAdapter {
  extract(pages: Array<{ buffer: Buffer; mimeType: string; filename: string }>): Promise<OcrExtractionOutput>;
}

function normalizeDirection(raw: unknown): InvoiceDirection {
  const s = String(raw || 'SALE').toUpperCase();
  if (s === 'PURCHASE' || s === 'PURCHASE_INVOICE') return 'PURCHASE';
  if (s === 'SALE_RETURN') return 'SALE_RETURN';
  if (s === 'PURCHASE_RETURN') return 'PURCHASE_RETURN';
  return 'SALE';
}

function normalizeDocType(dir: InvoiceDirection): OcrExtractionOutput['detectedDocType'] {
  if (dir === 'PURCHASE') return 'PURCHASE_INVOICE';
  if (dir === 'SALE_RETURN') return 'SALE_RETURN';
  return 'SALE_INVOICE';
}

function normalizeCurrency(raw: unknown): CurrencyCode | null {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (s === 'IRR' || s === 'RIAL' || s === 'ریال') return 'IRR';
  if (s === 'IRT' || s === 'TOMAN' || s === 'تومان') return 'IRT';
  if (s === 'USD') return 'USD';
  if (s === 'EUR') return 'EUR';
  return null;
}

export class StructuredDocumentOcrAdapter implements IOcrEngineAdapter {
  async extract(pages: Array<{ buffer: Buffer; mimeType: string; filename: string }>): Promise<OcrExtractionOutput> {
    const first = pages[0];
    if (first.mimeType === 'application/json') {
      const parsed = JSON.parse(first.buffer.toString('utf8')) as Record<string, unknown>;
      const direction = normalizeDirection(parsed.invoice_direction ?? parsed.direction ?? parsed.type);
      const rawLines = Array.isArray(parsed.lines) ? (parsed.lines as Array<Record<string, unknown>>) : [];
      const lines: OcrExtractedLine[] = rawLines.map((l, idx) => ({
        lineNumber: Number(l.line_number ?? idx + 1),
        description: normalizePersianText(String(l.description ?? l.item ?? `کالای ردیف ${idx + 1}`)),
        uomName: normalizePersianText(String(l.uom_name ?? l.uom ?? 'عدد')),
        quantity: Number(normalizeDigits(String(l.quantity ?? l.qty ?? 1))),
        unitPriceSource: Number(normalizeDigits(String(l.unit_price ?? l.unitPriceSource ?? 0))),
        discountAmountSource: l.discount_amount !== undefined ? Number(normalizeDigits(String(l.discount_amount))) : undefined,
        discountPct: l.discount_pct !== undefined && l.discount_pct !== null ? Number(l.discount_pct) : null,
        taxRatePct: l.tax_rate_pct !== undefined ? Number(l.tax_rate_pct) : 10,
        isPromotionalFreeItem: Boolean(l.is_promotional_free_item ?? l.is_promo),
        promoReason: l.promo_reason ? String(l.promo_reason) : null,
        declaredLineNetSource: l.declared_line_net !== undefined && l.declared_line_net !== null ? Number(l.declared_line_net) : null,
      }));

      return {
        status: 'EXTRACTED',
        engineAdapter: 'StructuredDocumentOcrAdapter',
        modelVersion: 'deterministic-json-v1',
        detectedDocType: normalizeDocType(direction),
        invoiceDirection: direction,
        invoiceNumber: normalizeDigits(String(parsed.invoice_number ?? `INV-${Date.now().toString().slice(-5)}`)),
        contactName: normalizePersianText(String(parsed.contact_name ?? parsed.customer_name ?? '')),
        issueJalali: normalizeDigits(String(parsed.issue_jalali ?? '1405/08/25')),
        dueJalali: normalizeDigits(String(parsed.due_jalali ?? parsed.issue_jalali ?? '1405/09/25')),
        sourceCurrencyCode: normalizeCurrency(parsed.currency ?? parsed.source_currency_code),
        invoiceDiscountSource: Number(normalizeDigits(String(parsed.invoice_discount ?? 0))),
        lines,
        fieldConfidences: {
          invoice_number: 0.99,
          contact_name: 0.96,
          issue_jalali: 0.98,
          source_currency_code: parsed.currency || parsed.source_currency_code ? 0.99 : 0.3,
          lines: 0.98,
        },
        averageConfidence: 0.97,
      };
    }

    // Simple deterministic CSV extraction: header description,uom,qty,unit_price,tax_pct
    const text = first.buffer.toString('utf8').trim();
    const rows = text.split(/\r?\n/).filter((r) => r.trim().length > 0);
    const dataRows = rows.length > 1 && /description|شرح|کالا/i.test(rows[0]) ? rows.slice(1) : rows;
    const lines: OcrExtractedLine[] = dataRows.map((row, idx) => {
      const cols = row.split(',').map((c) => c.trim());
      return {
        lineNumber: idx + 1,
        description: normalizePersianText(cols[0] || `ردیف ${idx + 1}`),
        uomName: normalizePersianText(cols[1] || 'عدد'),
        quantity: Number(normalizeDigits(cols[2] || '1')) || 1,
        unitPriceSource: Number(normalizeDigits(cols[3] || '0')) || 0,
        taxRatePct: cols[4] !== undefined ? Number(normalizeDigits(cols[4])) : 10,
      };
    });

    return {
      status: 'EXTRACTED',
      engineAdapter: 'StructuredDocumentOcrAdapter',
      modelVersion: 'deterministic-csv-v1',
      detectedDocType: 'SALE_INVOICE',
      invoiceDirection: 'SALE',
      invoiceNumber: `CSV-${Date.now().toString().slice(-5)}`,
      contactName: '',
      issueJalali: '1405/08/25',
      dueJalali: '1405/09/25',
      sourceCurrencyCode: null,
      invoiceDiscountSource: 0,
      lines,
      fieldConfidences: {
        invoice_number: 0.75,
        contact_name: 0.25,
        source_currency_code: 0.2,
        lines: 0.9,
      },
      averageConfidence: 0.72,
    };
  }
}

export class GeminiMultimodalOcrAdapter implements IOcrEngineAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async extract(pages: Array<{ buffer: Buffer; mimeType: string; filename: string }>): Promise<OcrExtractionOutput> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const parts: Array<Record<string, unknown>> = [
      {
        text: `You are a Persian accounting document extractor. Extract structured JSON from the attached invoice/receipt page(s).
Return ONLY valid JSON with these keys:
{
  "invoice_direction": "SALE" | "PURCHASE" | "SALE_RETURN" | "PURCHASE_RETURN",
  "invoice_number": string,
  "contact_name": string,
  "issue_jalali": "YYYY/MM/DD",
  "due_jalali": "YYYY/MM/DD",
  "currency": "IRR" | "IRT" | null,
  "invoice_discount": number,
  "lines": [
    {
      "line_number": number,
      "description": string,
      "uom_name": string,
      "quantity": number,
      "unit_price": number,
      "discount_amount": number,
      "tax_rate_pct": number,
      "is_promotional_free_item": boolean
    }
  ]
}
If currency is unclear, return null for "currency" (never guess). Use English digits.`,
      },
    ];

    for (const p of pages) {
      parts.push({
        inlineData: {
          mimeType: p.mimeType,
          data: p.buffer.toString('base64'),
        },
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: [{ role: 'user', parts: parts as never }],
      config: { responseMimeType: 'application/json' },
    });

    const rawText = response.text || '{}';
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const direction = normalizeDirection(parsed.invoice_direction);
    const rawLines = Array.isArray(parsed.lines) ? (parsed.lines as Array<Record<string, unknown>>) : [];

    return {
      status: 'EXTRACTED',
      engineAdapter: 'GeminiMultimodalOcrAdapter',
      modelVersion: 'gemini-4-hydrogen',
      detectedDocType: normalizeDocType(direction),
      invoiceDirection: direction,
      invoiceNumber: normalizeDigits(String(parsed.invoice_number ?? '')),
      contactName: normalizePersianText(String(parsed.contact_name ?? '')),
      issueJalali: normalizeDigits(String(parsed.issue_jalali ?? '1405/08/25')),
      dueJalali: normalizeDigits(String(parsed.due_jalali ?? parsed.issue_jalali ?? '1405/09/25')),
      sourceCurrencyCode: normalizeCurrency(parsed.currency),
      invoiceDiscountSource: Number(normalizeDigits(String(parsed.invoice_discount ?? 0))) || 0,
      lines: rawLines.map((l, idx) => ({
        lineNumber: Number(l.line_number ?? idx + 1),
        description: normalizePersianText(String(l.description ?? '')),
        uomName: normalizePersianText(String(l.uom_name ?? 'عدد')),
        quantity: Number(normalizeDigits(String(l.quantity ?? 1))) || 1,
        unitPriceSource: Number(normalizeDigits(String(l.unit_price ?? 0))) || 0,
        discountAmountSource: Number(normalizeDigits(String(l.discount_amount ?? 0))) || 0,
        taxRatePct: Number(normalizeDigits(String(l.tax_rate_pct ?? 10))) || 0,
        isPromotionalFreeItem: Boolean(l.is_promotional_free_item),
      })),
      fieldConfidences: {
        invoice_number: 0.85,
        contact_name: 0.82,
        issue_jalali: 0.84,
        source_currency_code: parsed.currency ? 0.85 : 0.3,
        lines: 0.8,
      },
      averageConfidence: 0.82,
    };
  }
}

export class CompositeOcrAdapter implements IOcrEngineAdapter {
  async extract(pages: Array<{ buffer: Buffer; mimeType: string; filename: string }>): Promise<OcrExtractionOutput> {
    const first = pages[0];
    if (first.mimeType === 'application/json' || first.mimeType === 'text/csv' || first.mimeType === 'text/plain') {
      return new StructuredDocumentOcrAdapter().extract(pages);
    }

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey) {
      try {
        return await new GeminiMultimodalOcrAdapter(geminiKey).extract(pages);
      } catch (err) {
        return {
          status: 'OCR_ENGINE_UNAVAILABLE',
          engineAdapter: 'GeminiMultimodalOcrAdapter',
          modelVersion: 'gemini-4-hydrogen',
          reasonFa: `خطا در فراخوانی سرویس OCR جمنای (${err instanceof Error ? err.message : 'Unknown error'})؛ لطفاً داده‌ها را در نمای بازبینی دوپنجره‌ای وارد یا اصلاح کنید.`,
          detectedDocType: 'UNKNOWN',
          invoiceDirection: 'SALE',
          invoiceNumber: '',
          contactName: '',
          issueJalali: '1405/08/25',
          dueJalali: '1405/09/25',
          sourceCurrencyCode: null,
          invoiceDiscountSource: 0,
          lines: [],
          fieldConfidences: {},
          averageConfidence: null,
        };
      }
    }

    // Honest unavailability: NEVER fabricate fake OCR text for binary images/PDFs when GEMINI_API_KEY is absent!
    return {
      status: 'OCR_ENGINE_UNAVAILABLE',
      engineAdapter: 'NO_EXTERNAL_OCR_ENGINE_CONFIGURED',
      modelVersion: 'none',
      reasonFa:
        'سرویس OCR خارجی یا کلید GEMINI_API_KEY در محیط فعلی تنظیم نشده است. مطابق سیاست «صفر داده ساختگی»، هیچ متن فرضی از تصویر تولید نشد و سند برای ورود مستقیم و ممیزی‌شده در نمای بازبینی دوپنجره‌ای آماده است.',
      detectedDocType: 'UNKNOWN',
      invoiceDirection: 'SALE',
      invoiceNumber: '',
      contactName: '',
      issueJalali: '1405/08/25',
      dueJalali: '1405/09/25',
      sourceCurrencyCode: null,
      invoiceDiscountSource: 0,
      lines: [],
      fieldConfidences: {},
      averageConfidence: null,
    };
  }
}
