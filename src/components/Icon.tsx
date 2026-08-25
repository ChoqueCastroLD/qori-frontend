import { ICONS } from "../lib/icons";

export default function Icon({
  name,
  className = "h-4 w-4",
}: {
  name: keyof typeof ICONS | string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name as string] ?? "" }}
    />
  );
}
