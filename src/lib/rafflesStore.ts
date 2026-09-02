// Shared client-side raffles store. One fetch of /api/raffles, cached on window
// and refreshed on a timer + View Transitions + tab focus, kept live via the
// global "qori:live" WebSocket events. SoonBar and the raffle rail both read
// from here so there are no duplicate fetches and countdowns stay in sync.
export interface RaffleLite {
  slug: string;
  title: string;
  status: string;
  blocked: boolean;
  legacy?: boolean;
  closesAt: string | null;
  opensAt: string | null;
  images: string[];
  ticketPrice: number;
  totalTickets: number;
  ticketsSold: number;
}

type Listener = (raffles: RaffleLite[]) => void;

function ensureStore(): any {
  const w = window as any;
  if (w.__qoriRafflesStore) return w.__qoriRafflesStore;
  const store = {
    raffles: [] as RaffleLite[],
    listeners: new Set<Listener>(),
    started: false,
    emit() {
      for (const l of this.listeners) l(this.raffles);
    },
    async refresh() {
      try {
        const list = await fetch("/api/raffles").then((r) => (r.ok ? r.json() : []));
        this.raffles = Array.isArray(list) ? list : [];
        this.emit();
      } catch {}
    },
    start() {
      if (this.started) return;
      this.started = true;
      this.refresh();
      setInterval(() => this.refresh(), 30000);
      document.addEventListener("astro:page-load", () => this.refresh());
      document.addEventListener("visibilitychange", () => { if (!document.hidden) this.refresh(); });
      window.addEventListener("qori:live", (e: any) => {
        const d = e?.detail;
        if (d?.slug && typeof d.sold === "number") {
          const r = this.raffles.find((x: RaffleLite) => x.slug === d.slug);
          if (r) { r.ticketsSold = Math.max(r.ticketsSold ?? 0, d.sold); this.emit(); }
        }
      });
    },
    subscribe(l: Listener) {
      this.listeners.add(l);
      l(this.raffles);
      this.start();
      return () => { this.listeners.delete(l); };
    },
  };
  w.__qoriRafflesStore = store;
  return store;
}

export function subscribeRaffles(l: Listener): () => void {
  if (typeof window === "undefined") return () => {};
  return ensureStore().subscribe(l);
}

// Open, non-blocked raffles with a close date, soonest-to-close first.
export function openByClosing(raffles: RaffleLite[]): RaffleLite[] {
  return raffles
    .filter((r) => r.status === "OPEN" && !r.blocked && r.closesAt)
    .sort((a, b) => new Date(a.closesAt!).getTime() - new Date(b.closesAt!).getTime());
}

// Open, non-blocked raffles, most-recent-first (by opensAt, fallback closesAt).
export function openByRecent(raffles: RaffleLite[]): RaffleLite[] {
  return raffles
    .filter((r) => r.status === "OPEN" && !r.blocked)
    .sort((a, b) => {
      const ax = new Date(a.opensAt ?? a.closesAt ?? 0).getTime();
      const bx = new Date(b.opensAt ?? b.closesAt ?? 0).getTime();
      return bx - ax;
    });
}
