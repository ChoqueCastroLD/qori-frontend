import Lingote from "./Lingote";
import Icon from "./Icon";
import { useEffect, useRef, useState } from "react";

interface Me {
  id: string;
  nickname: string | null;
  username: string | null;
  email: string;
  balance: number;
  ticketCount: number;
  role: string;
  avatarUrl: string | null;
  referralCode?: string | null;
}

const nf = (n: number) => new Intl.NumberFormat("es-PE").format(n ?? 0);

export default function Nav() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [promo, setPromo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/topups/packages").then((r) => (r.ok ? r.json() : null)).then((d) => setPromo(!!d?.promo)).catch(() => {});
  }, []);

  // Referral link built from the CURRENT page, so sharing from /sorteos yields
  // https://qori.cc/sorteos?ref=CODE (not a fixed /registro link).
  function copyRefLink() {
    if (!me?.referralCode) return;
    const link = `${location.origin}${location.pathname}?ref=${me.referralCode}`;
    navigator.clipboard?.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  useEffect(() => {
    const loadMe = () =>
      fetch("/api/auth/me", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setMe(d?.user ?? null))
        .catch(() => setMe(null))
        .finally(() => setLoading(false));
    loadMe();
    const onRefresh = () => loadMe();
    // Persisted across View Transitions: refresh auth + close the menu on nav.
    const onLoad = () => { loadMe(); setOpen(false); };
    window.addEventListener("qori:refresh", onRefresh);
    document.addEventListener("astro:page-load", onLoad);
    return () => {
      window.removeEventListener("qori:refresh", onRefresh);
      document.removeEventListener("astro:page-load", onLoad);
    };
  }, []);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/";
  }

  if (loading) return <div className="h-9 w-9" />;

  if (!me) {
    return (
      <div className="flex items-center gap-2 text-sm sm:gap-3">
        <a href="/entrar" className="font-medium text-slate-600 hover:text-slate-900">Entrar</a>
        <a href="/registro" className="rounded-lg bg-slate-900 px-3.5 py-2 font-semibold text-white transition hover:bg-slate-700 sm:px-4">Crear cuenta</a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm sm:gap-2.5">
      <a
        href="/recargar"
        className="relative inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-100"
        title={promo ? "Promo 2x1 activa: recarga y recibe el doble" : "Recargar lingotes"}
      >
        {promo && (
          <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
        )}
        {nf(me.balance)} <Lingote />
        <span className="hidden border-l border-emerald-200 pl-1.5 text-emerald-700 sm:inline">Recargar</span>
      </a>

      <a
        href="/cuenta"
        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-200"
        title="Mis tickets"
      >
        <img src="/ticket.png" alt="tickets" className="inline-block h-[0.95em] w-[0.95em] shrink-0 align-[-0.12em]" />
        {nf(me.ticketCount ?? 0)}
      </a>

      <div className="relative hidden md:block" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-1 rounded-full pr-1 transition hover:opacity-90"
          title="Mi cuenta"
        >
          {me.avatarUrl ? (
            <img src={me.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              {(me.nickname || me.email)[0].toUpperCase()}
            </span>
          )}
          <Icon name="chevron-down" className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div role="menu" className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-200/70">
            <div className="border-b border-slate-100 px-4 py-2.5">
              <div className="truncate text-sm font-semibold text-slate-900">{me.nickname || "Mi cuenta"}</div>
              <div className="truncate text-xs text-slate-400">{me.email}</div>
            </div>
            <a href={me.username ? `/u/${me.username}` : "/cuenta"} role="menuitem" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <Icon name="user" className="h-4 w-4 text-slate-400" /> Mi perfil
            </a>
            <a href="/cuenta" role="menuitem" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <Icon name="ticket" className="h-4 w-4 text-slate-400" /> Mis tickets
            </a>
            {me.role === "ADMIN" && (
              <a href="/admin" role="menuitem" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                <Icon name="chart" className="h-4 w-4 text-slate-400" /> Admin
              </a>
            )}
            {me.referralCode && (
              <div className="border-t border-slate-100 px-4 py-3">
                <p className="text-[11px] leading-snug text-slate-500">Comparte tu enlace. Ganas <strong className="text-slate-700">+10 lingotes</strong> cuando un referido hace su primera compra.</p>
                <button
                  onClick={copyRefLink}
                  className={`mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${copied ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                >
                  <Icon name={copied ? "check" : "copy"} className="h-4 w-4" /> {copied ? "¡Enlace copiado!" : "Copiar mi link de referidos"}
                </button>
              </div>
            )}
            <button onClick={logout} role="menuitem" className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
              <Icon name="logout" className="h-4 w-4" /> Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
