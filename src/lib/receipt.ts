import { jsPDF } from "jspdf";

export interface TopUp {
  id: string;
  amountUsd: number; // cents
  lingotes: number;
  method: string;
  status: string;
  providerRef?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  MERCADOPAGO: "MercadoPago",
  PAYPAL: "PayPal",
  YAPE: "Yape",
  PLIN: "Plin",
  TRANSFER: "Transferencia bancaria",
  CRYPTO: "Cripto",
};

const usd = (cents: number) => `USD ${(cents / 100).toFixed(2)}`;
const dt = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

/**
 * Build and download a branded PDF receipt for a confirmed lingote top-up.
 * States clearly that lingotes were credited to the account (no physical good).
 */
export function downloadReceipt(t: TopUp, user: { email: string; nickname?: string | null }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  const emerald: [number, number, number] = [16, 185, 129];
  const slate: [number, number, number] = [51, 65, 85];
  const gray: [number, number, number] = [148, 163, 184];

  // Header band
  doc.setFillColor(...emerald);
  doc.rect(0, 0, W, 96, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("qori", M, 56);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Recibo de recarga de lingotes", M, 76);

  const bonus = Math.max(0, t.lingotes - Math.round((t.amountUsd / 100) * 10));

  // Meta
  let y = 140;
  doc.setTextColor(...gray);
  doc.setFontSize(10);
  doc.text(`Recibo N.° ${t.id.slice(-10).toUpperCase()}`, M, y);
  doc.text(`Emitido: ${dt(t.confirmedAt || t.createdAt)}`, W - M, y, { align: "right" });

  y += 26;
  doc.setDrawColor(226, 232, 240);
  doc.line(M, y, W - M, y);

  // Intro line
  y += 32;
  doc.setTextColor(...slate);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(
    `Se acreditaron ${new Intl.NumberFormat("es-PE").format(t.lingotes)} lingotes en tu cuenta qori.`,
    M, y,
  );

  // Detail rows
  const rows: [string, string][] = [
    ["Cuenta", user.nickname ? `${user.nickname} (${user.email})` : user.email],
    ["Fecha y hora", dt(t.confirmedAt || t.createdAt)],
    ["Medio de pago", METHOD_LABEL[t.method] ?? t.method],
    ["Monto pagado", usd(t.amountUsd)],
    ["Lingotes acreditados", new Intl.NumberFormat("es-PE").format(t.lingotes)],
  ];
  if (bonus > 0) rows.push(["Lingotes de bono incluidos", `+${new Intl.NumberFormat("es-PE").format(bonus)}`]);
  rows.push(["Referencia de pago", t.providerRef || "no disponible"]);
  rows.push(["Estado", t.status === "PAID" ? "Pagado y acreditado" : t.status]);

  y += 24;
  doc.setFontSize(11);
  for (const [k, v] of rows) {
    doc.setTextColor(...gray);
    doc.setFont("helvetica", "normal");
    doc.text(k, M, y);
    doc.setTextColor(...slate);
    doc.setFont("helvetica", "bold");
    doc.text(String(v), W - M, y, { align: "right" });
    y += 24;
  }

  y += 10;
  doc.setDrawColor(226, 232, 240);
  doc.line(M, y, W - M, y);

  // Footer note
  y += 26;
  doc.setTextColor(...gray);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const note =
    "Los lingotes son saldo interno de qori.cc (10 lingotes = 1 USD) y se usan para participar en sorteos. " +
    "Este comprobante certifica la acreditacion de lingotes en tu cuenta; no es una factura fiscal. " +
    "Si un sorteo se cancela, los lingotes usados vuelven a tu saldo. Soporte: support@qori.cc";
  doc.text(doc.splitTextToSize(note, W - M * 2), M, y);

  y += 60;
  doc.setTextColor(...gray);
  doc.text("qori.cc · Sorteos en vivo para toda Latinoamerica", M, y);

  doc.save(`recibo-qori-${t.id.slice(-8)}.pdf`);
}
