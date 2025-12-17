const RETRY_DELAY_MS = 1000;

/**
 * Fetch with single retry after 1 second delay.
 * If both attempts fail, throws the last error.
 */
export async function fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return await fetch(url, options);
  }
}

