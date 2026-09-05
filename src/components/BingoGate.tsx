import { useEffect } from "react";

// On the raffle page of a BINGO: once the draw starts (status DRAWING/DRAWN),
// send everyone into the live 3D room. Polls lightly; harmless if it never fires.
export default function BingoGate({ slug }: { slug: string }) {
  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (stop) return;
      try {
        const r = await fetch(`/api/raffles/${slug}`).then((x) => (x.ok ? x.json() : null));
        if (r && (r.status === "DRAWING" || r.status === "DRAWN")) {
          window.location.href = `/bingo/${slug}`;
          return;
        }
      } catch { /* retry */ }
      if (!stop) setTimeout(check, 4000);
    };
    check();
    return () => { stop = true; };
  }, [slug]);
  return null;
}
