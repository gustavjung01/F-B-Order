export class FetchTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = "FetchTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs?: number;
  timeoutMessage?: string;
};

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 10_000,
    timeoutMessage = "Yêu cầu backend phản hồi quá chậm, vui lòng thử lại.",
    signal,
    ...init
  } = options;

  if (typeof AbortController === "undefined") {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const abortIfNeeded = () => {
    if (!controller.signal.aborted) controller.abort();
  };

  if (signal) {
    if (signal.aborted) {
      abortIfNeeded();
    } else {
      signal.addEventListener("abort", abortIfNeeded, { once: true });
    }
  }

  const timeout = setTimeout(() => {
    abortIfNeeded();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new FetchTimeoutError(timeoutMessage, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
