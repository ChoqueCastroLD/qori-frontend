import Icon from "./Icon";
import { useEffect } from "react";

// Lightweight in-app modal (no native alert/prompt). Click the backdrop or the
// X, or press Escape, to close.
export default function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: any }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 transition hover:text-slate-700"><Icon name="x" className="h-5 w-5" /></button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
