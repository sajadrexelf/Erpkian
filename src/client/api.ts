import type { ApiResponseEnvelope } from '../shared/contracts';

export interface ClientAuthSession {
  membershipId: string;
  organizationId: string;
}

export class ClientApiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, messageFa: string, status: number) {
    super(messageFa);
    this.code = code;
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  session: ClientAuthSession,
  options?: {
    method?: string;
    body?: unknown;
    isFormData?: boolean;
    idempotencyKey?: string;
  }
): Promise<T> {
  const headers: Record<string, string> = {
    'x-membership-id': session.membershipId,
    'x-organization-id': session.organizationId,
  };
  if (options?.idempotencyKey) {
    headers['idempotency-key'] = options.idempotencyKey;
  }
  if (!options?.isFormData && options?.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const resp = await fetch(path, {
    method: options?.method ?? 'GET',
    headers,
    body: options?.isFormData
      ? (options.body as FormData)
      : options?.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });

  const payload = (await resp.json()) as ApiResponseEnvelope<T>;
  if (!resp.ok || !payload.success || payload.data === null) {
    throw new ClientApiError(
      payload.error?.code ?? 'API_ERROR',
      payload.error?.message_fa ?? 'خطا در برقراری ارتباط با سرور',
      resp.status
    );
  }
  return payload.data;
}

export async function apiDownloadFile(
  path: string,
  session: ClientAuthSession,
  fallbackFilename: string
): Promise<void> {
  const resp = await fetch(path, {
    method: 'GET',
    headers: {
      'x-membership-id': session.membershipId,
      'x-organization-id': session.organizationId,
    },
  });
  if (!resp.ok) {
    const errJson = (await resp.json().catch(() => null)) as ApiResponseEnvelope<null> | null;
    throw new ClientApiError(
      errJson?.error?.code ?? 'EXPORT_FAILED',
      errJson?.error?.message_fa ?? 'تولید فایل خروجی با خطا مواجه شد.',
      resp.status
    );
  }

  const blob = await resp.blob();
  const disp = resp.headers.get('content-disposition') || '';
  const match = /filename="([^"]+)"/.exec(disp);
  const filename = match?.[1] || fallbackFilename;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
