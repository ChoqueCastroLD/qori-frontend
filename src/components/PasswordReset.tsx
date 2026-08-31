import { useState } from "react";

// /recuperar: without ?token asks for the email and sends the reset link;
// with ?token lets the user choose a new password.
export default function PasswordReset() {
  const [token] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(location.search).get("token") : null,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const inp = "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm";
  const card = "mx-auto mt-8 max-w-sm rounded-2xl border border-slate-200 bg-white p-7";
  const btn = "mt-6 w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-400";

  async function requestLink(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErr("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d?.error === "too_soon" ? "Ya te enviamos un enlace hace poco. Espera un minuto antes de pedir otro." : "No se pudo enviar el enlace. Intenta de nuevo.");
        return;
      }
      setDone(true);
    } catch {
      setErr("Error de red. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (password !== password2) { setErr("Las contraseñas no coinciden."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d?.error === "invalid_token" ? "El enlace no es válido o ya venció. Pide uno nuevo." : "No se pudo cambiar la contraseña. Intenta de nuevo.");
        return;
      }
      setDone(true);
    } catch {
      setErr("Error de red. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  // Success states
  if (done && token) {
    return (
      <div className={`${card} text-center`}>
        <h1 className="text-2xl font-bold text-slate-900">Contraseña actualizada</h1>
        <p className="mt-2 text-sm text-slate-500">Tu contraseña se cambió correctamente. Vuelve a entrar con la nueva.</p>
        <a href="/entrar" className="mt-6 inline-block w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700">Entrar</a>
      </div>
    );
  }
  if (done) {
    return (
      <div className={`${card} text-center`}>
        <h1 className="text-2xl font-bold text-slate-900">Revisa tu correo</h1>
        <p className="mt-2 text-sm text-slate-500">
          Si <strong>{email}</strong> tiene una cuenta en qori, te enviamos un enlace para elegir una nueva contraseña. Revisa también la carpeta de spam.
        </p>
        <a href="/entrar" className="mt-6 inline-block text-sm font-semibold text-emerald-700 hover:underline">Volver a entrar</a>
      </div>
    );
  }

  // Reset form (with token)
  if (token) {
    return (
      <form onSubmit={reset} className={card}>
        <h1 className="text-2xl font-bold text-slate-900">Nueva contraseña</h1>
        <p className="mt-1 text-sm text-slate-500">Elige la nueva contraseña de tu cuenta.</p>
        <div className="mt-5"><label className="mb-1 block text-sm font-medium text-slate-700">Nueva contraseña</label>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            onInvalid={(e) => e.currentTarget.setCustomValidity("La contraseña debe tener al menos 8 caracteres.")}
            onInput={(e) => e.currentTarget.setCustomValidity("")} className={inp} /></div>
        <div className="mt-4"><label className="mb-1 block text-sm font-medium text-slate-700">Repítela</label>
          <input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required className={inp} /></div>
        {err && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
        <button disabled={loading} className={btn}>{loading ? "Guardando…" : "Cambiar contraseña"}</button>
      </form>
    );
  }

  // Request form (no token)
  return (
    <form onSubmit={requestLink} className={card}>
      <h1 className="text-2xl font-bold text-slate-900">Recuperar contraseña</h1>
      <p className="mt-1 text-sm text-slate-500">Te enviamos un enlace a tu correo para elegir una nueva.</p>
      <div className="mt-5"><label className="mb-1 block text-sm font-medium text-slate-700">Correo</label>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="tucorreo@gmail.com" className={inp} /></div>
      {err && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
      <button disabled={loading} className={btn}>{loading ? "Enviando…" : "Enviar enlace"}</button>
      <p className="mt-5 text-center text-sm text-slate-500">¿La recordaste? <a href="/entrar" className="font-semibold text-emerald-700 hover:underline">Entrar</a></p>
    </form>
  );
}
