export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

const CSRF_HEADER_NAME = 'x-csrf-token';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get('content-type');

  if (contentType?.includes('application/json')) {
    const payload: unknown = await response.json();
    if (isRecord(payload) && typeof payload.success === 'boolean') {
      return payload as ApiResponse<T>;
    }
  }

  if (response.ok) {
    return { success: true };
  }

  return {
    success: false,
    error: `HTTP_${response.status}`,
  };
}

export async function fetchCsrfToken(): Promise<string> {
  const response = await fetch('/auth/csrf', {
    credentials: 'include',
  });

  const parsed = await parseApiResponse<{ csrfToken: string }>(response);
  const token = parsed.data?.csrfToken;

  if (!parsed.success || !token) {
    throw new Error(parsed.error ?? 'CSRF_TOKEN_UNAVAILABLE');
  }

  return token;
}

export async function postAuthJson<T>(
  path: string,
  payload: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  try {
    const csrfToken = await fetchCsrfToken();
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        [CSRF_HEADER_NAME]: csrfToken,
      },
      body: JSON.stringify(payload),
    });

    return await parseApiResponse<T>(response);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'NETWORK_ERROR',
    };
  }
}
