import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { fetchWithRetry } from "../src/util/fetch.js";

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("returns response on first successful attempt", async () => {
    const mockResponse = new Response(JSON.stringify({ data: "test" }), { status: 200 });
    vi.spyOn(global, "fetch").mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry("https://example.com");

    expect(result).toBe(mockResponse);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("retries once after 1 second on first failure", async () => {
    const mockResponse = new Response(JSON.stringify({ data: "test" }), { status: 200 });
    vi.spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(mockResponse);

    const promise = fetchWithRetry("https://example.com");

    // First call fails immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    // Wait for retry delay
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toBe(mockResponse);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("throws error if both attempts fail", async () => {
    vi.useRealTimers(); // Use real timers for this test to avoid unhandled rejection issues
    
    vi.spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("First error"))
      .mockRejectedValueOnce(new Error("Second error"));

    await expect(fetchWithRetry("https://example.com")).rejects.toThrow("Second error");
    expect(fetch).toHaveBeenCalledTimes(2);
  }, 5000);

  test("passes options to fetch", async () => {
    const mockResponse = new Response("", { status: 200 });
    vi.spyOn(global, "fetch").mockResolvedValueOnce(mockResponse);

    const options = { method: "POST", body: "test" };
    await fetchWithRetry("https://example.com", options);

    expect(fetch).toHaveBeenCalledWith("https://example.com", options);
  });

  test("passes options on retry attempt", async () => {
    const mockResponse = new Response("", { status: 200 });
    vi.spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(mockResponse);

    const options = { method: "POST", body: "test" };
    const promise = fetchWithRetry("https://example.com", options);

    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(1, "https://example.com", options);
    expect(fetch).toHaveBeenNthCalledWith(2, "https://example.com", options);
  });
});

