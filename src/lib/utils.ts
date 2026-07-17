import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Escape special HTML characters for safe rendering.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Highlight occurrences of `query` terms in `text` by wrapping matches in <mark> tags.
 * Returns HTML-safe string suitable for dangerouslySetInnerHTML.
 * Case-insensitive matching.
 */
export function highlightText(text: string, query?: string): string {
  if (!query || query.trim().length === 0) return escapeHtml(text);
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return escapeHtml(text);

  const escaped = escapeHtml(text);
  let result = escaped;
  for (const term of terms) {
    const escapedTerm = escapeHtml(term);
    const regex = new RegExp(`(${escapedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    result = result.replace(regex, "<mark class=\"rounded-sm bg-yellow-400/30 px-0.5 text-inherit\">$1</mark>");
  }
  return result;
}
