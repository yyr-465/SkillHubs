/* Category badges with distinct colours per category name */

const CATEGORY_COLORS: Record<string, string> = {
  development: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  dev: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  security: "bg-red-500/15 text-red-400 border-red-500/30",
  andruia: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "api-integration": "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  seo: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  design: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  testing: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  devops: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  writing: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  marketing: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  data: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  database: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  cloud: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  mobile: "bg-green-500/15 text-green-400 border-green-500/30",
  "product-management": "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
};

const FALLBACK_COLOR = "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

interface CategoryBadgeProps {
  category: string | null;
  onClick?: () => void;
}

export default function CategoryBadge({ category, onClick }: CategoryBadgeProps) {
  if (!category) return null;

  const colorClass = CATEGORY_COLORS[category.toLowerCase()] ?? FALLBACK_COLOR;

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {category}
    </button>
  );
}
