// Inline ticket (token) icon, sized to the surrounding text.
export default function TicketIcon({ className = "" }: { className?: string }) {
  return (
    <img
      src="/ticket.png"
      alt="boleto"
      className={`inline-block h-[1.1em] w-[1.1em] shrink-0 align-[-0.2em] ${className}`}
    />
  );
}
