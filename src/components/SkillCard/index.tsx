import { useNavigate } from "react-router-dom";
import { useSkillStore } from "@/store/skillStore";
import type { Skill } from "@/store/skillStore";
import CategoryBadge from "@/components/CategoryBadge";
import RiskBadge from "@/components/RiskBadge";
import FavoriteButton from "@/components/FavoriteButton";
import SkillIcon from "@/components/SkillIcon";
import { Calendar, Pencil, CheckSquare, Square } from "lucide-react";
import SkillEditor from "@/components/SkillEditor";
import { highlightText } from "@/lib/utils";
import { IS_TAURI } from "@/lib/runtime";

interface SkillCardProps {
  skill: Skill;
}

export default function SkillCard({ skill }: SkillCardProps) {
  const navigate = useNavigate();
  const {
    viewMode,
    skillQuery,
    selectionMode,
    selectedIds,
    toggleSelection,
    openEditDialog,
    editSkill,
    editDialogOpen,
    closeEditDialog,
  } = useSkillStore();

  const isSortByDate = skillQuery.sort_field === "DateAdded";
  const isSelected = selectedIds.has(skill.id);
  const searchTerm = skillQuery.search;

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    openEditDialog(skill);
  };

  const handleCheckbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSelection(skill.id);
  };

  if (viewMode === "list") {
    return (
      <>
        <div
          onClick={() => !selectionMode && navigate(`/skills/${skill.id}`)}
          className={`group flex cursor-pointer items-center gap-3 rounded-lg border bg-[--color-card] px-4 py-2.5 transition-colors hover:border-[--color-primary]/40 hover:bg-[--color-card]/80 ${
            isSelected
              ? "border-[--color-primary]/60"
              : "border-[--color-border]"
          }`}
        >
          {selectionMode ? (
            <div onClick={handleCheckbox} className="shrink-0 cursor-pointer">
              {isSelected ? (
                <CheckSquare className="h-4 w-4 text-[--color-primary]" />
              ) : (
                <Square className="h-4 w-4 text-[--color-muted-foreground]" />
              )}
            </div>
          ) : (
            <FavoriteButton skillId={skill.id} favorite={skill.favorite} />
          )}
          <SkillIcon icon={skill.icon} size="sm" />
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium text-[--color-foreground]"
            dangerouslySetInnerHTML={{ __html: highlightText(skill.name, searchTerm) }}
          />
          {isSortByDate && skill.date_added && (
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-[--color-muted-foreground]">
              <Calendar className="h-3 w-3" />
              {skill.date_added}
            </span>
          )}
          <CategoryBadge category={skill.category} />
          <RiskBadge risk={skill.risk} />
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-[--color-muted-foreground]">
            {skill.source}
          </span>
          {IS_TAURI && !selectionMode && (
            <button
              onClick={handleEdit}
              className="shrink-0 rounded p-1 text-[--color-muted-foreground] opacity-0 transition-opacity hover:text-[--color-foreground] group-hover:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {IS_TAURI && editSkill?.id === skill.id && (
          <SkillEditor
            skill={editSkill}
            open={editDialogOpen}
            onClose={closeEditDialog}
          />
        )}
      </>
    );
  }

  // -- Grid view (default) --
  const maxDescriptionLength = 120;
  const truncated =
    skill.description.length > maxDescriptionLength
      ? skill.description.slice(0, maxDescriptionLength) + "..."
      : skill.description;

  return (
    <>
      <div
        onClick={() => !selectionMode && navigate(`/skills/${skill.id}`)}
        className={`group relative cursor-pointer rounded-lg border bg-[--color-card] p-4 transition-colors hover:border-[--color-primary]/40 hover:bg-[--color-card]/80 ${
          isSelected
            ? "border-[--color-primary]/60"
            : "border-[--color-border]"
        }`}
      >
        {selectionMode && (
          <div
            onClick={handleCheckbox}
            className="absolute left-2 top-2 z-10 cursor-pointer"
          >
            {isSelected ? (
              <CheckSquare className="h-4 w-4 text-[--color-primary]" />
            ) : (
              <Square className="h-4 w-4 text-[--color-muted-foreground]" />
            )}
          </div>
        )}

        {IS_TAURI && !selectionMode && (
          <button
            onClick={handleEdit}
            className="absolute right-2 top-2 z-10 rounded p-1 text-[--color-muted-foreground] opacity-0 transition-opacity hover:text-[--color-foreground] group-hover:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="flex items-start gap-3">
          {selectionMode ? null : (
            <SkillIcon icon={skill.icon} size="md" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between">
              <h3
                className="truncate text-sm font-medium text-[--color-foreground]"
                dangerouslySetInnerHTML={{ __html: highlightText(skill.name, searchTerm) }}
              />
              <FavoriteButton skillId={skill.id} favorite={skill.favorite} />
            </div>
            {truncated && (
              <p
                className="mt-1 text-xs leading-relaxed text-[--color-muted-foreground]"
                dangerouslySetInnerHTML={{ __html: highlightText(truncated, searchTerm) }}
              />
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CategoryBadge category={skill.category} />
          <RiskBadge risk={skill.risk} />
          {isSortByDate && skill.date_added && (
            <span className="flex items-center gap-1 text-[11px] text-[--color-muted-foreground]">
              <Calendar className="h-3 w-3" />
              {skill.date_added}
            </span>
          )}
          <span className="ml-auto text-[10px] uppercase tracking-wider text-[--color-muted-foreground]">
            {skill.source}
          </span>
        </div>
      </div>
      {editSkill?.id === skill.id && (
        <SkillEditor
          skill={editSkill}
          open={editDialogOpen}
          onClose={closeEditDialog}
        />
      )}
    </>
  );
}
