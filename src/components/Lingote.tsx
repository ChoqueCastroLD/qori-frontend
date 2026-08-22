// Inline lingote (emerald) icon, sized to the surrounding text.
export default function Lingote({ className = "" }: { className?: string }) {
  return (
    <img
      src="/lingote.svg"
      alt="lingotes"
      className={`inline-block h-[0.95em] w-[0.95em] shrink-0 align-[-0.12em] ${className}`}
    />
  );
}
