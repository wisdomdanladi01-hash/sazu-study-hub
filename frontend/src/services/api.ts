export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '');
const AUTH_TOKEN_KEY = 'sazu-study-hub.access-token.v1';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAccessToken(token: string | null): void {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  token: string | null = getAccessToken(),
  retries = 1,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    if (retries > 0) {
      // Serverless cold start or momentary network hiccup: wait 1s and retry once
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return apiRequest<T>(path, init, token, retries - 1);
    }
    throw new ApiError('Could not reach the Study Hub service. Check that the backend is running and try again.', 0);
  }

  if (!response.ok) {
    let message = `The request failed (${response.status}).`;
    try {
      const payload = await response.json() as { detail?: unknown };
      if (typeof payload.detail === 'string') message = payload.detail;
      else if (Array.isArray(payload.detail)) {
        message = payload.detail
          .map((item) => typeof item === 'object' && item !== null && 'msg' in item ? String(item.msg) : '')
          .filter(Boolean)
          .join(' ');
      }
    } catch {
      // Keep the HTTP status message when the server does not return JSON.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function downloadResource(resourceId: string): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new ApiError('Sign in to download this learning material.', 401);

  const response = await fetch(`${API_BASE_URL}/resources/${encodeURIComponent(resourceId)}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    let message = `Unable to download this resource (${response.status}).`;
    try {
      const payload = await response.json() as { detail?: unknown };
      if (typeof payload.detail === 'string') message = payload.detail;
    } catch {
      // Keep the HTTP status message when the server does not return JSON.
    }
    throw new ApiError(message, response.status);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1] ?? `resource-${resourceId}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Fetch a binary response (e.g. a rendered page) with the signed-in student's token. */
export async function apiBlob(path: string): Promise<Blob> {
  const token = getAccessToken();
  if (!token) throw new ApiError('Sign in to open this material.', 401);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Could not reach the Study Hub service.', 0);
  }
  if (!response.ok) {
    let message = `The request failed (${response.status}).`;
    try {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload.detail === 'string') message = payload.detail;
    } catch {
      // keep the default message
    }
    throw new ApiError(message, response.status);
  }
  return response.blob();
}
