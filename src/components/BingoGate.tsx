import { useEffect } from "react";

// On the raffle page of a BINGO: once the draw STARTS (status DRAWING), send
// everyone into the live 3D room. A FINISHED bingo (DRAWN) stays on the results
// page — you reach the room via the "Ver el bingo" button. Polls lightly.
export default function BingoGate({ slug }: { slug: string }) {
  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (stop) return;
      try {
        const r = await fetch(`/api/raffles/${slug}`).then((x) => (x.ok ? x.json() : null));
        if (r && r.status === "DRAWING") {
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
