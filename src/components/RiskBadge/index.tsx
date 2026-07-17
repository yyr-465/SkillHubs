interface RiskBadgeProps {
  risk: string | null;
  onClick?: () => void;
}

const RISK_STYLES: Record<string, string> = {
  safe: "bg-green-500/15 text-green-400 border-green-500/30",
  low: "bg-green-500/15 text-green-400 border-green-500/30",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
};

const UNKNOWN_STYLE = "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

export default function RiskBadge({ risk, onClick }: RiskBadgeProps) {
  if (!risk) return null;

  const normalized = risk.toLowerCase();
  const colorClass = RISK_STYLES[normalized] ?? UNKNOWN_STYLE;
  const label = normalized === "safe" ? "safe" : normalized;

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {label}
    </button>
  );
}
