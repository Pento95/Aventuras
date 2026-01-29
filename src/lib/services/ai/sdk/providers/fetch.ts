/**
 * Tauri Fetch Adapter
 *
 * Wraps @tauri-apps/plugin-http's fetch for use with Vercel AI SDK providers.
 * This is necessary because Tauri apps run in a sandboxed WebView that requires
 * using Tauri's HTTP plugin for external network requests.
 */

import { fetch as tauriHttpFetch } from '@tauri-apps/plugin-http';

/**
 * Tauri-compatible fetch function that wraps the Tauri HTTP plugin.
 * Converts standard fetch parameters to Tauri's expected format.
 * Internal only - used by createTimeoutFetch.
 */
async function tauriFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();

  // Convert headers from Headers object or array to Record if needed
  let headers: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) {
        headers[key] = value;
      }
    } else {
      headers = init.headers as Record<string, string>;
    }
  }

  return tauriHttpFetch(url, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body as string | undefined,
    signal: init?.signal,
  });
}

/**
 * Creates a fetch function with a built-in timeout.
 * Uses AbortController to cancel requests that exceed the timeout.
 *
 * @param timeoutMs - Timeout in milliseconds (default: 180000 = 3 minutes)
 * @returns A fetch function that automatically times out
 */
export function createTimeoutFetch(timeoutMs: number = 180000) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // If the caller provided their own signal, chain it
    if (init?.signal) {
      init.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      return await tauriFetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
