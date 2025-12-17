import { z } from "zod";
import { fetchWithRetry } from "../util/fetch.js";

export const ExchangeRateInput = z.object({
  base_currency: z.string().min(3).max(3).describe("Base currency code (e.g., 'USD', 'BRL', 'EUR')"),
  target_currency: z.string().min(3).max(3).describe("Target currency code (e.g., 'BRL', 'USD', 'EUR')"),
});
export type ExchangeRateInput = z.infer<typeof ExchangeRateInput>;

export async function getExchangeRate(base_currency: string, target_currency: string): Promise<string> {
  const base = base_currency.toUpperCase();
  const target = target_currency.toUpperCase();
  try {
    const url = `https://api.exchangerate-api.com/v4/latest/${encodeURIComponent(base)}`;
    const res = await fetchWithRetry(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return `Error fetching exchange rate: API error: ${res.status}`;
    const data = (await res.json()) as any;
    const rate = data?.rates?.[target];
    if (typeof rate !== "number") return `Error fetching exchange rate: Currency ${target} not found`;

    const date = data?.date ?? "N/A";
    return (
      `Exchange rate:\n` +
      `- ${base} → ${target}\n` +
      `- Rate: 1 ${base} = ${rate.toFixed(4)} ${target}\n` +
      `- Date: ${date}\n`
    );
  } catch (e: any) {
    return `Error fetching exchange rate: Connection error: ${String(e?.message ?? e)}`;
  }
}


