import { useState } from "react";
import Icon from "./Icon";

interface Props {
  value?: string | null;
  onChange: (url: string) => void;
  endpoint?: string; // API path, e.g. "/admin/upload" or "/me/avatar"
  label?: string;
  circle?: boolean;
  hint?: string;
}

const ERR: Record<string, string> = {
  too_large: "La imagen supera 6 MB.",
  unsupported_type: "Formato no soportado (usa JPG, PNG, WEBP o GIF).",
  storage_not_configured: "Almacenamiento no configurado.",
  upload_failed: "No se pudo subir la imagen.",
};

export default function ImageUpload({ value, onChange, endpoint = "/admin/upload", label, circle = false, hint }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(""); setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api${endpoint}`, { method: "POST", credentials: "include", body: fd });
      const d = await res.json().catch(() => null);
      if (!res.ok) setErr(ERR[d?.error] ?? "No se pudo subir la imagen.");
      else onChange(d.url);
    } catch {
      setErr("Error de red al subir.");
    } finally {
      setBusy(false);
    }
  }

  const shape = circle ? "aspect-square w-24 rounded-full" : "aspect-[3/2] w-full rounded-xl";

  return (
    <div>
      {label && <label className="mb-1 block text-xs text-slate-500">{label}</label>}
      <div className="flex items-center gap-3">
        <label className={`relative flex ${shape} cursor-pointer items-center justify-center overflow-hidden border-2 border-dashed border-slate-200 bg-slate-50 transition hover:border-emerald-400`}>
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 px-2 text-center text-xs font-medium text-slate-400">
              <Icon name="plus" className="h-5 w-5" />
              {circle ? "Foto" : "Subir imagen"}
            </span>
          )}
          {busy && <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-xs font-semibold text-slate-600">Subiendo…</div>}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={onFile} className="hidden" disabled={busy} />
        </label>
        <div className="text-xs text-slate-400">
          {hint ?? "JPG, PNG, WEBP o GIF. Máx 6 MB."}
          {value && (
            <button type="button" onClick={() => onChange("")} className="mt-1 block font-semibold text-slate-500 hover:text-red-600">
              Quitar
            </button>
          )}
        </div>
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
