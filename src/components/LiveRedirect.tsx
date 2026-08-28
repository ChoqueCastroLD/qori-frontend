import { useEffect } from "react";

// The raffle just drew and the show is still playing. Send viewers into the live
// animation instead of showing the winner (no spoiler). After it ends, reload to
// reveal the winners.
export default function LiveRedirect({ slug, endsAt }: { slug: string; endsAt: string }) {
  useEffect(() => {
    if (Date.now() < new Date(endsAt).getTime()) window.location.href = `/sorteos/${slug}/show`;
    else window.location.reload();
  }, [slug, endsAt]);

  return (
    <div className="rounded-2xl border border-slate-900 bg-slate-900 p-6 text-center text-white">
      <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      <div className="text-lg font-bold">Sorteo EN VIVO</div>
      <div className="mt-1 text-sm text-white/60">Entrando al show…</div>
    </div>
  );
}
