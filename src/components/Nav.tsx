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
            className="hidden rounded-lg bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 sm:inline-block"
            title="Tu saldo de lingotes"
          >
            {new Intl.NumberFormat("es-PE").format(me.balance)} ⧉
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
          <button onClick={logout} className="text-slate-400 hover:text-slate-700" title="Salir">
            Salir
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
