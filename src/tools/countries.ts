import { z } from "zod";
import { fetchWithRetry } from "../util/fetch.js";

export const CountryInfoInput = z.object({
  country_name: z
    .string()
    .min(1)
    .describe("Country name in English (e.g., 'Brazil', 'United States', 'France')"),
});
export type CountryInfoInput = z.infer<typeof CountryInfoInput>;

export async function getCountryInfo(country_name: string): Promise<string> {
  try {
    const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(country_name)}`;
    const res = await fetchWithRetry(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return `Error fetching information about ${country_name}: API error: ${res.status}`;
    const data = (await res.json()) as any[];
    const country = data?.[0];
    if (!country) return `Error fetching information about ${country_name}: Country not found`;

    const name = country?.name?.common ?? country_name;
    const capital = Array.isArray(country?.capital) ? country.capital[0] ?? "N/A" : "N/A";
    const population = typeof country?.population === "number" ? country.population : 0;
    const region = country?.region ?? "N/A";
    const currency = country?.currencies ? Object.keys(country.currencies)[0] ?? "N/A" : "N/A";
    const languages = country?.languages ? Object.values(country.languages).join(", ") : "N/A";

    return (
      `Information about ${name}:\n` +
      `- Capital: ${capital}\n` +
      `- Population: ${population.toLocaleString("en-US")}\n` +
      `- Region: ${region}\n` +
      `- Currency: ${currency}\n` +
      `- Languages: ${languages || "N/A"}\n`
    );
  } catch (e: any) {
    return `Error fetching information about ${country_name}: Connection error: ${String(e?.message ?? e)}`;
  }
}
