import type { APIRoute } from "astro";
import { ssrGet, type Raffle } from "../lib/api";

const SITE = "https://qori.cc";

export const GET: APIRoute = async () => {
  const staticPages = ["/", "/sorteos", "/ganadores", "/como-funciona", "/verificar", "/legal/terminos", "/legal/bases", "/legal/privacidad"];
  const raffles = await ssrGet<Raffle[]>("/raffles", []);

  const urls: string[] = [];
  for (const p of staticPages) {
    urls.push(`<url><loc>${SITE}${p}</loc><changefreq>${p === "/" || p === "/sorteos" ? "hourly" : "weekly"}</changefreq><priority>${p === "/" ? "1.0" : "0.7"}</priority></url>`);
  }
  for (const r of raffles) {
    urls.push(`<url><loc>${SITE}/sorteos/${r.slug}</loc><changefreq>${r.status === "OPEN" ? "hourly" : "monthly"}</changefreq><priority>0.8</priority></url>`);
    if (r.status === "DRAWN") {
      urls.push(`<url><loc>${SITE}/sorteos/${r.slug}/show</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
