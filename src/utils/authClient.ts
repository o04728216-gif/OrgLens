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
  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (
    response.status === 401 &&
    token &&
    !input.includes('/api/auth/logout') &&
    typeof window !== 'undefined'
  ) {
    try {
      const cloned = response.clone();
      const body = (await cloned.json()) as {
        error?: string;
        code?: string;
      };
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
