import { X } from "lucide-react";

interface TagBadgeProps {
  name: string;
  color?: string;
  onRemove?: () => void;
  onClick?: () => void;
  size?: "sm" | "md";
}

export default function TagBadge({ name, color = "#6366f1", onRemove, onClick, size = "sm" }: TagBadgeProps) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors
        ${onClick ? "cursor-pointer hover:opacity-80" : ""}
        ${size === "md" ? "px-2.5 py-1 text-sm" : ""}`}
      style={{
        backgroundColor: `${color}20`,
        color: color,
        border: `1px solid ${color}40`,
      }}
    >
      {name}
      {onRemove && (
        <X className="h-3 w-3 cursor-pointer hover:opacity-70"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        />
      )}
    </span>
  );
}
