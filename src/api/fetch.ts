export const REQUEST_TIMEOUT_MS = 15_000;

export async function fetchWithTimeoutAndRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const attempt = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onParentAbort = () => controller.abort();
    init?.signal?.addEventListener("abort", onParentAbort);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      init?.signal?.removeEventListener("abort", onParentAbort);
    }
  };

  try {
    return await attempt();
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    return await attempt();
  }
}
