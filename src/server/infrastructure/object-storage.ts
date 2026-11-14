import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface StoredObjectResult {
  storageKey: string;
  byteSize: number;
  sha256Hash: string;
}

export interface DetectedFileType {
  valid: boolean;
  mimeType: string;
  extension: string;
  rejectionReason?: string;
}

export interface IObjectStoragePort {
  putObject(storageKey: string, buffer: Buffer): StoredObjectResult;
  getObject(storageKey: string): Buffer;
  exists(storageKey: string): boolean;
  createSignedToken(params: { organizationId: string; documentId: string; storageKey: string; ttlSeconds?: number }): string;
  verifySignedToken(token: string): { organizationId: string; documentId: string; storageKey: string } | null;
}

const SIGNING_SECRET =
  process.env.ERPKIAN_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');

export function detectFileByMagicBytes(buffer: Buffer, originalFilename: string): DetectedFileType {
  if (!buffer || buffer.length === 0) {
    return { valid: false, mimeType: 'application/octet-stream', extension: '', rejectionReason: 'فایل خالی است.' };
  }

  const ext = path.extname(originalFilename || '').toLowerCase();
  const headHex = buffer.subarray(0, 16).toString('hex').toUpperCase();
  const headAscii = buffer.subarray(0, 256).toString('utf8').trimStart();

  // Explicit dangerous binaries & active content blocklist
  if (headHex.startsWith('4D5A')) {
    return { valid: false, mimeType: 'application/x-msdownload', extension: '.exe', rejectionReason: 'فایل اجرایی (PE/EXE) مجاز نیست.' };
  }
  if (headHex.startsWith('7F454C46')) {
    return { valid: false, mimeType: 'application/x-elf', extension: '.elf', rejectionReason: 'فایل باینری اجرایی (ELF) مجاز نیست.' };
  }
  if (headAscii.toLowerCase().startsWith('<svg') || headAscii.toLowerCase().startsWith('<!doctype html') || headAscii.toLowerCase().startsWith('<html') || headAscii.toLowerCase().includes('<script')) {
    return { valid: false, mimeType: 'text/html', extension: ext, rejectionReason: 'محتوای فعال HTML/SVG/Script مجاز نیست.' };
  }

  // Allowed image/document binary signatures
  if (headHex.startsWith('89504E470D0A1A0A')) {
    return { valid: true, mimeType: 'image/png', extension: '.png' };
  }
  if (headHex.startsWith('FFD8FF')) {
    return { valid: true, mimeType: 'image/jpeg', extension: '.jpg' };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { valid: true, mimeType: 'image/webp', extension: '.webp' };
  }
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { valid: true, mimeType: 'application/pdf', extension: '.pdf' };
  }

  // Allow structured JSON / CSV / UTF-8 text invoices (must not contain NUL bytes)
  const hasNullByte = buffer.includes(0);
  if (!hasNullByte && (ext === '.json' || headAscii.startsWith('{') || headAscii.startsWith('['))) {
    try {
      JSON.parse(buffer.toString('utf8'));
      return { valid: true, mimeType: 'application/json', extension: '.json' };
    } catch {
      return { valid: false, mimeType: 'application/json', extension: '.json', rejectionReason: 'ساختار JSON معتبر نیست.' };
    }
  }

  if (!hasNullByte && (ext === '.csv' || ext === '.txt')) {
    return {
      valid: true,
      mimeType: ext === '.csv' ? 'text/csv' : 'text/plain',
      extension: ext,
    };
  }

  return {
    valid: false,
    mimeType: 'application/octet-stream',
    extension: ext,
    rejectionReason: 'فرمت فایل با امضای معتبر (PNG/JPG/WEBP/PDF/JSON/CSV/TXT) مطابقت ندارد.',
  };
}

export class LocalDiskObjectStorage implements IObjectStoragePort {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? process.env.ERPKIAN_STORAGE_DIR ?? path.resolve(process.cwd(), 'storage');
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  private resolveSafePath(storageKey: string): string {
    const clean = storageKey.replace(/^\/+/, '');
    const target = path.resolve(this.rootDir, clean);
    if (!target.startsWith(path.resolve(this.rootDir) + path.sep) && target !== path.resolve(this.rootDir)) {
      throw new Error('INVALID_STORAGE_KEY_PATH_TRAVERSAL');
    }
    return target;
  }

  putObject(storageKey: string, buffer: Buffer): StoredObjectResult {
    const target = this.resolveSafePath(storageKey);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
    const sha256Hash = crypto.createHash('sha256').update(buffer).digest('hex');
    return {
      storageKey,
      byteSize: buffer.length,
      sha256Hash,
    };
  }

  getObject(storageKey: string): Buffer {
    const target = this.resolveSafePath(storageKey);
    return fs.readFileSync(target);
  }

  exists(storageKey: string): boolean {
    const target = this.resolveSafePath(storageKey);
    return fs.existsSync(target);
  }

  createSignedToken(params: { organizationId: string; documentId: string; storageKey: string; ttlSeconds?: number }): string {
    const payload = {
      org: params.organizationId,
      doc: params.documentId,
      key: params.storageKey,
      exp: Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? 120),
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', SIGNING_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  }

  verifySignedToken(token: string): { organizationId: string; documentId: string; storageKey: string } | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SIGNING_SECRET).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
        org: string;
        doc: string;
        key: string;
        exp: number;
      };
      if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
      return { organizationId: parsed.org, documentId: parsed.doc, storageKey: parsed.key };
    } catch {
      return null;
    }
  }
}
