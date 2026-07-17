import { Star } from "lucide-react";
import { useSkillStore } from "@/store/skillStore";

interface FavoriteButtonProps {
  skillId: string;
  favorite: boolean | null;
  size?: "sm" | "md";
}

export default function FavoriteButton({ skillId, favorite, size = "sm" }: FavoriteButtonProps) {
  const { toggleFavorite } = useSkillStore();
  const isFav = favorite === true;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleFavorite(skillId, !isFav);
  };

  const sizeClass = size === "md" ? "h-5 w-5" : "h-3.5 w-3.5";

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center justify-center rounded-md p-1 transition-colors ${
        isFav
          ? "text-yellow-400 hover:text-yellow-300"
          : "text-[--color-muted-foreground] opacity-40 hover:opacity-100 hover:text-yellow-400"
      }`}
      aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
    >
      <Star className={sizeClass} fill={isFav ? "currentColor" : "none"} />
    </button>
  );
}
