import { useEffect, useState } from "react";

const ERR: Record<string, string> = {
  email_domain_not_allowed: "Usa un correo de un proveedor conocido (Gmail, Outlook, Hotmail, Yahoo, iCloud…). No aceptamos dominios personalizados.",
  email_taken: "Ese correo ya está registrado. Inicia sesión.",
  too_soon: "Espera unos segundos antes de pedir otro código.",
  invalid_code: "Código incorrecto. Revísalo e intenta de nuevo.",
  code_expired: "El código venció. Pide uno nuevo.",
  too_many_attempts: "Demasiados intentos. Pide un código nuevo.",
  invalid_credentials: "Correo o contraseña incorrectos.",
};

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isReg = mode === "register";
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [ref, setRef] = useState(
    typeof window !== "undefined" ? new URLSearchParams(location.search).get("ref") ?? "" : "",
  );
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(location.search).get("oauth") === "unavailable") {
      setNotice("El acceso con Google estará disponible pronto. Usa tu correo por ahora.");
    }
    // Already logged in: go straight to the account page.
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.user) window.location.href = "/cuenta"; })
      .catch(() => {});
  }, []);

  async function post(path: string, body: any) {
    const res = await fetch(`/api/auth/${path}`, {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    return { ok: res.ok, d };
  }

  // Login
  async function login(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErr("");
    const { ok, d } = await post("login", { email, password });
    if (!ok) {
      setErr(
        d.error === "too_many_attempts"
          ? "Demasiados intentos fallidos. Espera unos minutos o recupera tu contraseña."
          : ERR[d.error] ?? "No se pudo entrar.",
      );
      setLoading(false);
      return;
    }
    window.location.href = "/cuenta";
  }

  // Register step 1: request code
  async function requestCode(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErr(""); setNotice("");
    const { ok, d } = await post("request-code", { email });
    setLoading(false);
    if (!ok) { setErr(ERR[d.error] ?? "No se pudo enviar el código."); return; }
    setStep("code");
    setNotice(`Te enviamos un código de 6 dígitos a ${email}. Revisa tu correo (y la carpeta de spam). Puede tardar unos minutos en llegar, no te preocupes.`);
  }

  // Register step 2: create account
  async function register(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErr("");
    const { ok, d } = await post("register", { email, code, password, name, ref: ref || undefined });
    if (!ok) { setErr(ERR[d.error] ?? "No se pudo crear la cuenta."); setLoading(false); return; }
    window.location.href = "/cuenta";
  }

  const inp = "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm";
  const card = "mx-auto mt-8 max-w-sm rounded-2xl border border-slate-200 bg-white p-7";

  const googleBtn = (
    <a href="/api/auth/google" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
      <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/></svg>
      Continuar con Google
    </a>
  );

  // ---- LOGIN ----
  if (!isReg) {
    return (
      <form onSubmit={login} className={card}>
        <h1 className="text-2xl font-bold text-slate-900">Entrar</h1>
        <p className="mt-1 text-sm text-slate-500">Bienvenido de vuelta.</p>
        <div className="mt-5"><label className="mb-1 block text-sm font-medium text-slate-700">Correo</label>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inp} /></div>
        <div className="mt-4"><label className="mb-1 block text-sm font-medium text-slate-700">Contraseña</label>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className={inp} />
          <p className="mt-1.5 text-right"><a href="/recuperar" className="text-xs font-semibold text-slate-500 hover:text-slate-900">¿Olvidaste tu contraseña?</a></p></div>
        {notice && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{notice}</p>}
        {err && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
        <button disabled={loading} className="mt-6 w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400">{loading ? "…" : "Entrar"}</button>
        {googleBtn}
        <p className="mt-5 text-center text-sm text-slate-500">¿No tienes cuenta? <a href="/registro" className="font-semibold text-emerald-700 hover:underline">Crear cuenta</a></p>
      </form>
    );
  }

  // ---- REGISTER: step 1 (email) ----
  if (step === "email") {
    return (
      <form onSubmit={requestCode} className={card}>
        <h1 className="text-2xl font-bold text-slate-900">Crear cuenta</h1>
        <p className="mt-1 text-sm text-slate-500">Verificamos tu correo antes de crear la cuenta.</p>
        <div className="mt-5"><label className="mb-1 block text-sm font-medium text-slate-700">Correo</label>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="tucorreo@gmail.com" className={inp} /></div>
        <p className="mt-2 text-xs text-slate-400">Solo correos conocidos (Gmail, Outlook, Hotmail, Yahoo, iCloud…).</p>
        {notice && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{notice}</p>}
        {err && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
        <button disabled={loading} className="mt-6 w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400">{loading ? "Enviando…" : "Enviar código"}</button>
        {googleBtn}
        <p className="mt-5 text-center text-sm text-slate-500">¿Ya tienes cuenta? <a href="/entrar" className="font-semibold text-emerald-700 hover:underline">Entrar</a></p>
      </form>
    );
  }

  // ---- REGISTER: step 2 (code + details) ----
  return (
    <form onSubmit={register} className={card}>
      <h1 className="text-2xl font-bold text-slate-900">Confirma tu correo</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enviamos un código a <strong>{email}</strong>.{" "}
        <button type="button" onClick={() => { setStep("email"); setErr(""); setNotice(""); setCode(""); }} className="font-semibold text-emerald-700 hover:underline">Cambiar</button>
      </p>
      {notice && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{notice}</p>}
      <div className="mt-5"><label className="mb-1 block text-sm font-medium text-slate-700">Código de 6 dígitos</label>
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required placeholder="123456" className={`${inp} text-center text-lg font-bold tracking-[0.4em]`} /></div>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={requestCode as any} disabled={loading} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Reenviar código</button>
        <span className="text-xs text-slate-400">El correo puede tardar unos minutos.</span>
      </div>
      <div className="mt-4"><label className="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
        <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required className={inp} /></div>
      <div className="mt-4"><label className="mb-1 block text-sm font-medium text-slate-700">Contraseña</label>
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
          onInvalid={(e) => e.currentTarget.setCustomValidity("La contraseña debe tener al menos 8 caracteres.")}
          onInput={(e) => e.currentTarget.setCustomValidity("")} className={inp} /></div>
      <div className="mt-4"><label className="mb-1 block text-sm font-medium text-slate-700">Código de referido (opcional)</label>
        <input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} className={`${inp} uppercase`} /></div>
      {err && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
      <button disabled={loading} className="mt-6 w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400">{loading ? "Creando…" : "Crear cuenta"}</button>
    </form>
  );
}
