// API client. Server-side (SSR) uses an internal/absolute base; client-side uses
// same-origin "/api" so the session cookie flows automatically.
const SERVER_BASE =
  import.meta.env.API_INTERNAL || import.meta.env.PUBLIC_API_URL || "http://localhost:3010/api";
const CLIENT_BASE = import.meta.env.PUBLIC_API_URL_CLIENT || "/api";

export const API_BASE = import.meta.env.SSR ? SERVER_BASE : CLIENT_BASE;

async function req(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw Object.assign(new Error(data?.error || res.statusText), { status: res.status, data });
  return data;
}

export const api = {
  get: (p: string) => req(p),
  post: (p: string, body?: unknown) => req(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: (p: string, body?: unknown) => req(p, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
};

// Server-safe fetch that never throws (returns fallback) - for SSR pages.
export async function ssrGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${SERVER_BASE}${path}`);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export interface Raffle {
  id: string;
  slug: string;
  title: string;
  description: string;
  images: string[];
  prizeValue: number; // USD cents
  ticketPrice: number; // lingotes
  totalTickets: number;
  minTickets: number;
  maxTicketsPerUser: number | null;
  winnersCount: number;
  games: string[];
  finale: string | null;
  status: "OPEN" | "CLOSED" | "DRAWING" | "DRAWN" | "CANCELLED";
  legacy?: boolean;
  opensAt: string | null;
  closesAt: string | null;
  drawnAt: string | null;
  extensionCount?: number;
  extensions?: { at: string; ticketCount: number; minTickets: number; from: string | null; to: string }[];
  ticketsSold?: number;
  fairness: {
    commitment: string;
    entropySource: string;
    serverSeed: string | null;
    drandRound: string | null;
    drandValue: string | null;
    ticketsRoot: string | null;
    drawDigest: string | null;
  };
  winners?: { position: number; ticketNumber: number; nickname: string | null; avatarUrl: string | null }[];
}
