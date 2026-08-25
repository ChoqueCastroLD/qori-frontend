import Icon from "./Icon";
import { useEffect, useState } from "react";

interface Me { role: string; nickname: string | null; email: string }

export default function BottomNav() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [path, setPath] = useState("");
  const [more, setMore] = useState(false);

  useEffect(() => {
    setPath(window.location.pathname);
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => setMe(null))
      .finally(() => setReady(true));
  }, []);

  // Lock background scroll while the "Más" sheet is open.
  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", more);
    return () => document.body.classList.remove("overflow-hidden");
  }, [more]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/";
  }

  const isActive = (href: string) => path === href || (href !== "/" && path.startsWith(href + "/"));

  const tabs = [
    { href: "/sorteos", label: "Sorteos", icon: "ticket" },
    { href: "/ganadores", label: "Ganadores", icon: "trophy" },
    { href: "/recargar", label: "Recargar", icon: "plus", primary: true },
    { href: me ? "/cuenta" : "/entrar", label: me ? "Cuenta" : "Entrar", icon: "user" },
  ] as const;

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Navegación"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around px-1">
          {tabs.map((t) => (
            <a
              key={t.href}
              href={t.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                isActive(t.href) ? "text-emerald-600" : (t as any).primary ? "text-emerald-600" : "text-slate-500"
              }`}
            >
              {(t as any).primary ? (
                <span className="-mt-4 mb-0.5 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
                  <Icon name={t.icon} className="h-6 w-6" />
                </span>
              ) : (
                <Icon name={t.icon} className="h-6 w-6" />
              )}
              {t.label}
            </a>
          ))}
          <button
            onClick={() => setMore(true)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"
          >
            <Icon name="dots" className="h-6 w-6" />
            Más
          </button>
        </div>
      </nav>

      {more && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto my-2 h-1 w-10 rounded-full bg-slate-200" />
            <SheetLink href="/" icon="home" label="Inicio" />
            <SheetLink href="/como-funciona" icon="info" label="Cómo funciona" />
            <SheetLink href="/verificar" icon="lock" label="Verificar un sorteo" />
            {ready && me?.role === "ADMIN" && <SheetLink href="/admin" icon="chart" label="Panel de administración" />}
            {ready && me ? (
              <button onClick={logout} className="mt-1 flex w-full items-center gap-3 rounded-xl border-t border-slate-100 px-4 py-3.5 text-left text-base font-medium text-red-600">
                <Icon name="logout" className="h-5 w-5" /> Cerrar sesión
              </button>
            ) : ready ? (
              <div className="mt-1 flex gap-2 border-t border-slate-100 px-2 pt-3">
                <a href="/entrar" className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700">Entrar</a>
                <a href="/registro" className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white">Crear cuenta</a>
              </div>
            ) : null}
            <button onClick={() => setMore(false)} className="mt-2 w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600">Cerrar</button>
          </div>
        </div>
      )}
    </>
  );
}

function SheetLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a href={href} className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-base font-medium text-slate-700 hover:bg-slate-50">
      <Icon name={icon} className="h-5 w-5 text-slate-400" /> {label}
    </a>
  );
}
