import { useState } from "react";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isReg = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [ref, setRef] = useState(
    typeof window !== "undefined" ? new URLSearchParams(location.search).get("ref") ?? "" : "",
  );
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      const body: any = { email, password };
      if (isReg) {
        body.name = name;
        if (ref) body.ref = ref;
      }
      const res = await fetch(`/api/auth/${isReg ? "register" : "login"}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(
          d.error === "email_taken" ? "Ese correo ya está registrado."
          : d.error === "invalid_credentials" ? "Correo o contraseña incorrectos."
          : "No se pudo completar. Revisa los datos.",
        );
        setLoading(false);
        return;
      }
      window.location.href = "/cuenta";
    } catch {
      setErr("Error de red.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-8 max-w-sm rounded-2xl border border-slate-200 bg-white p-7">
      <h1 className="text-2xl font-bold text-slate-900">{isReg ? "Crear cuenta" : "Entrar"}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {isReg ? "Regístrate para participar en los sorteos." : "Bienvenido de vuelta."}
      </p>

      {isReg && (
        <div className="mt-5">
          <label className="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
        </div>
      )}
      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">Correo</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
      </div>
      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">Contraseña</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={isReg ? 8 : undefined} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
      </div>
      {isReg && (
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">Código de referido (opcional)</label>
          <input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm uppercase" />
        </div>
      )}

      {err && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

      <button disabled={loading} className="mt-6 w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400">
        {loading ? "…" : isReg ? "Crear cuenta" : "Entrar"}
      </button>

      <a href="/api/auth/google" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/></svg>
        Continuar con Google
      </a>

      <p className="mt-5 text-center text-sm text-slate-500">
        {isReg ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
        <a href={isReg ? "/entrar" : "/registro"} className="font-semibold text-emerald-600 hover:underline">
          {isReg ? "Entrar" : "Crear cuenta"}
        </a>
      </p>
    </form>
  );
}
