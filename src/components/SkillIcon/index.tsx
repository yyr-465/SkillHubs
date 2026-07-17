import { FileText } from "lucide-react";

interface SkillIconProps {
  icon?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { container: "h-7 w-7", icon: "h-4 w-4 text-xl" },
  md: { container: "h-10 w-10", icon: "h-6 w-6 text-2xl" },
  lg: { container: "h-16 w-16", icon: "h-10 w-10 text-4xl" },
};

export default function SkillIcon({ icon, size = "md", className = "" }: SkillIconProps) {
  const dims = sizeMap[size];

  // No icon or null/empty
  if (!icon || icon.trim() === "") {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-md bg-[--color-primary]/10 ${dims.container} ${className}`}
      >
        <FileText className={`${dims.icon} text-[--color-primary]`} />
      </div>
    );
  }

  // Emoji (single character or short text that looks like emoji)
  if (isEmoji(icon.trim())) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-md bg-[--color-card] ${dims.container} ${className}`}
        title={icon.trim()}
      >
        <span className={dims.icon}>{icon.trim()}</span>
      </div>
    );
  }

  // URL (http:// or https://)
  if (icon.startsWith("http://") || icon.startsWith("https://")) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-md overflow-hidden bg-[--color-card] ${dims.container} ${className}`}
      >
        <img
          src={icon.trim()}
          alt=""
          className="h-full w-full object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
            (e.target as HTMLImageElement).parentElement!.innerHTML =
              '<div class="flex h-full w-full items-center justify-center"><svg class="h-4 w-4 text-[--color-muted-foreground]" ...></svg></div>';
          }}
        />
      </div>
    );
  }

  // SVG (starts with <svg)
  if (icon.trim().startsWith("<svg")) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-md overflow-hidden bg-[--color-card] ${dims.container} ${className}`}
        dangerouslySetInnerHTML={{ __html: icon.trim() }}
      />
    );
  }

  // Fallback: render as text
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-md bg-[--color-card] ${dims.container} ${className}`}
      title={icon.trim()}
    >
      <span className={dims.icon}>{icon.trim()}</span>
    </div>
  );
}

function isEmoji(str: string): boolean {
  // Single Unicode character or short sequences that are likely emojis
  if (str.length > 8) return false;
  // Check if it contains emoji-like characters
  const emojiRegex =
    /[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2B50}]|[\u{2702}-\u{27B0}]|[\u{1F300}-\u{1F5FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{200D}]|[\u{FE0F}]/u;
  return emojiRegex.test(str) || /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]$/u.test(str);
}
