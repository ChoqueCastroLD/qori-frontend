import Lingote from "./Lingote";
import { useEffect, useState } from "react";

interface Me {
  id: string;
  nickname: string | null;
  email: string;
  balance: number;
  role: string;
  avatarUrl: string | null;
}

export default function Nav() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMe = () =>
      fetch("/api/auth/me", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setMe(d?.user ?? null))
        .catch(() => setMe(null))
        .finally(() => setLoading(false));
    loadMe();
    // Refresh balance/identity when another island signals a change (buy, topup…).
    const onRefresh = () => loadMe();
    window.addEventListener("qori:refresh", onRefresh);
    return () => window.removeEventListener("qori:refresh", onRefresh);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/";
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      {loading ? null : me ? (
        <>
          <a
            href="/recargar"
            className="hidden items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-100 sm:inline-flex"
            title="Recargar lingotes"
          >
            {new Intl.NumberFormat("es-PE").format(me.balance)} <Lingote />
            <span className="border-l border-emerald-200 pl-1.5 text-emerald-600">Recargar</span>
          </a>
          {me.role === "ADMIN" && (
            <a href="/admin" className="hidden font-medium text-slate-500 hover:text-slate-900 sm:inline">
              Admin
            </a>
          )}
          <a href="/cuenta" className="flex items-center gap-2 font-medium text-slate-700 hover:text-slate-900">
            {me.avatarUrl ? (
              <img src={me.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                {(me.nickname || me.email)[0].toUpperCase()}
              </span>
            )}
            <span className="hidden sm:inline">{me.nickname || "Mi cuenta"}</span>
          </a>
          <button onClick={logout} className="text-slate-400 transition hover:text-slate-700" title="Salir" aria-label="Salir">
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12H4m12 0-4 4m4-4-4-4m3-4h2a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-2" />
            </svg>
          </button>
        </>
      ) : (
        <>
          <a href="/entrar" className="font-medium text-slate-600 hover:text-slate-900">
            Entrar
          </a>
          <a
            href="/registro"
            className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-700"
          >
            Crear cuenta
          </a>
        </>
      )}
    </div>
  );
}
