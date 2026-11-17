export const AUTH_TOKEN_KEY = 'orglens_auth_token_v1';
export const SESSION_INVALIDATED_EVENT = 'orglens:session-invalidated';

export interface SessionInvalidatedDetail {
  code: string;
  message: string;
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
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
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
