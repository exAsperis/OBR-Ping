import type { PingType } from "../domain";

export function PingGlyph({ type, className = "" }: { type: PingType; className?: string }) {
  const common = { className: `ping-glyph ${className}`.trim(), viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (type === "message") return <svg {...common}><path d="M4 5.5h16v11H9l-5 3v-14Z" /><path d="M8 10h8M8 13h5" /></svg>;
  if (type === "vote") return <svg {...common}><path d="M5 4h14v16H5z" /><path d="m8 11 2.2 2.2L16 7.5" /></svg>;
  if (type === "quiz") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.5 2.5 0 1 1 3.3 2.37c-.65.27-1 .78-1 1.63M12 17h.01" /></svg>;
  return <svg {...common}><path d="M9 18h6M10 22h4" /><path d="M8.5 14.5A6 6 0 1 1 15.5 14.5c-.86.58-1.5 1.27-1.5 2.5h-4c0-1.23-.64-1.92-1.5-2.5Z" /><path d="M12 2V0M4.9 4.9 3.5 3.5M19.1 4.9l1.4-1.4" /></svg>;
}
