// Fixed rate: 1 USD = 10 lingotes.
export const LINGOTES_PER_USD = 10;

export function usd(cents: number): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "USD" }).format(cents / 100);
}

// Formatted lingote amount (number only). Render the emerald icon alongside it
// in the UI (e.g. the <Lingote /> component or /lingote.png).
export function lingotes(n: number): string {
  return new Intl.NumberFormat("es-PE").format(n);
}

export function lingotesToUsd(l: number): string {
  return usd((l / LINGOTES_PER_USD) * 100);
}

// Approximate local-currency conversion for display only (indicative rates).
const RATES: Record<string, { code: string; rate: number; locale: string }> = {
  PE: { code: "PEN", rate: 3.75, locale: "es-PE" },
  MX: { code: "MXN", rate: 18.5, locale: "es-MX" },
  CO: { code: "COP", rate: 4000, locale: "es-CO" },
  CL: { code: "CLP", rate: 950, locale: "es-CL" },
  AR: { code: "ARS", rate: 1300, locale: "es-AR" },
};

export function localFromUsdCents(cents: number, country = "PE"): string | null {
  const r = RATES[country];
  if (!r) return null;
  const val = (cents / 100) * r.rate;
  return new Intl.NumberFormat(r.locale, { style: "currency", currency: r.code, maximumFractionDigits: 0 }).format(val);
}

export function pct(sold: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((sold / total) * 100));
}

export const GAME_LABEL: Record<string, string> = {
  ELIMINATION: "Eliminación",
  DIGIT_REVEAL: "Revelado de dígitos",
  BOMBS: "Bombas",
  SQUID: "Luz roja, luz verde",
  HORSE_RACE: "Carrera",
};

export function timeLeft(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Cerrado";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
