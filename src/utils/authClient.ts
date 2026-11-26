export const AUTH_TOKEN_KEY = 'orglens_auth_token_v1';
export const SESSION_INVALIDATED_EVENT = 'orglens:session-invalidated';
const DEVICE_INSTALL_STORAGE_KEY = 'orglens_hw_install_v2';
const DEVICE_COOKIE_NAME = 'ol_client_did';

export interface SessionInvalidatedDetail {
  code: string;
  message: string;
}

export function getOrCreateClientDeviceId(): string {
  try {
    const existingLs = localStorage.getItem(DEVICE_INSTALL_STORAGE_KEY);
    if (existingLs && existingLs.startsWith('did_')) {
      return existingLs;
    }
  } catch {
    // Ignore storage read failure
  }

  if (typeof document !== 'undefined') {
    const parts = document.cookie.split(';');
    for (const part of parts) {
      const [k, v] = part.trim().split('=');
      if (k === DEVICE_COOKIE_NAME && v && v.startsWith('did_')) {
        const decoded = decodeURIComponent(v);
        try {
          localStorage.setItem(DEVICE_INSTALL_STORAGE_KEY, decoded);
        } catch {
          // Ignore
        }
        return decoded;
      }
    }
  }

  const arr = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i += 1) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  const freshId = `did_${Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;

  try {
    localStorage.setItem(DEVICE_INSTALL_STORAGE_KEY, freshId);
  } catch {
    // Ignore
  }
  if (typeof document !== 'undefined') {
    try {
      document.cookie = `${DEVICE_COOKIE_NAME}=${encodeURIComponent(
        freshId
      )}; Path=/; Max-Age=315360000; SameSite=Lax`;
    } catch {
      // Ignore
    }
  }
  return freshId;
}

export function loadAuthToken(): string {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function saveAuthToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // Ignore private mode storage restriction
  }
}

function isHtmlGatewayResponse(response: Response): boolean {
  const ct = (response.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html')) return true;
  return (
    response.status === 502 ||
    response.status === 503 ||
    response.status === 504
  );
}

/**
 * Safely parses a JSON response from `/api/*`. If the server or reverse proxy
 * transiently returns an HTML page (e.g. `<!DOCTYPE html>...` from a 502/504 gateway
 * or restart), throws a clean user-facing error instead of
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
 */
export async function safeReadJson<T = Record<string, unknown>>(
  response: Response,
  fallbackError = 'The server returned an unexpected response. Please try again.'
): Promise<T> {
  const rawText = await response.text();
  const trimmed = rawText.trim();
  if (!trimmed) {
    if (!response.ok) {
      throw new Error(fallbackError);
    }
    return {} as T;
  }
  if (trimmed.startsWith('<')) {
    if (
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {
      throw new Error(
        'The server is temporarily busy or restarting. Please try again in a few seconds.'
      );
    }
    throw new Error(fallbackError);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(fallbackError);
  }
}

export async function apiFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = loadAuthToken();
  const deviceId =
    typeof window !== 'undefined' ? getOrCreateClientDeviceId() : '';
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (deviceId && !headers.has('X-OrgLens-Device-Id')) {
    headers.set('X-OrgLens-Device-Id', deviceId);
  }

  const method = (init.method || 'GET').toUpperCase();
  let response = await fetch(input, {
    ...init,
    headers,
  });

  // Auto-recover transparently once if an idempotent GET hits a transient 502/503/504 or HTML proxy page
  if (
    method === 'GET' &&
    input.startsWith('/api/') &&
    isHtmlGatewayResponse(response) &&
    !init.signal?.aborted
  ) {
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 900);
      if (init.signal) {
        init.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            resolve();
          },
          { once: true }
        );
      }
    });
    if (!init.signal?.aborted) {
      response = await fetch(input, {
        ...init,
        headers,
      });
    }
  }

  if (
    response.status === 401 &&
    token &&
    !input.includes('/api/auth/logout') &&
    typeof window !== 'undefined'
  ) {
    try {
      const cloned = response.clone();
      const body = await safeReadJson<{
        error?: string;
        code?: string;
      }>(cloned);
      window.dispatchEvent(
        new CustomEvent<SessionInvalidatedDetail>(SESSION_INVALIDATED_EVENT, {
          detail: {
            code: body?.code || 'AUTH_REQUIRED',
            message:
              body?.error ||
              'Your session ended because your account signed in on another device.',
          },
        })
      );
    } catch {
      window.dispatchEvent(
        new CustomEvent<SessionInvalidatedDetail>(SESSION_INVALIDATED_EVENT, {
          detail: {
            code: 'AUTH_REQUIRED',
            message: 'Your session ended. Please sign in again.',
          },
        })
      );
    }
  }

  return response;
}
