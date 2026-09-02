// Referral code shared helper. The visitor's ?ref=CODE is captured on any page
// (see Layout.astro) into localStorage + a cookie; here we read it back so the
// register form and the Google sign-in link can apply it even when the user
// landed on a non-/registro page first.
export function storedRef(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem("qori_ref");
    if (raw) {
      const { code, ts } = JSON.parse(raw) as { code?: string; ts?: number };
      if (code && (!ts || Date.now() - ts < 2_592_000_000)) return String(code).toUpperCase();
    }
  } catch {}
  const m = typeof document !== "undefined" ? document.cookie.match(/(?:^|;\s*)qori_ref=([A-Za-z0-9]+)/) : null;
  return m ? m[1].toUpperCase() : "";
}
