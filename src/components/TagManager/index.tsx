import { useState } from "react";
import { useTranslation } from "@/i18n";
import TagBadge from "@/components/TagBadge";
import { Trash2 } from "lucide-react";
import { Tag } from "@/store/skillStore";

interface TagManagerProps {
  skillId: string;
  skillTags: Tag[];
  allTags: Tag[];
  onAssign: (tagId: number) => void;
  onRemove: (tagId: number) => void;
  onCreateTag: (name: string, color: string) => void;
  onDeleteTag: (tagId: number) => void;
onClose: () => void;
}

export default function TagManager({
  skillId: _skillId,
  skillTags,
  allTags,
  onAssign,
  onRemove,
  onCreateTag,
  onDeleteTag,
  onClose,
}: TagManagerProps) {
  const { t } = useTranslation();
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  

  const assignedTagIds = new Set(skillTags.map((t) => t.id));
  const unassignedTags = allTags.filter((t) => !assignedTagIds.has(t.id));

  const handleCreate = async () => {
    const name = newTagName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      await onCreateTag(name, newTagColor);
      setNewTagName("");
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="bg-black/40 absolute inset-0" onClick={onClose} />
      <div className="relative z-10 max-h-[70vh] w-full max-w-md overflow-y-auto rounded-lg border border-[--color-border] bg-[--color-card] p-5 shadow-2xl">
        <div className="mb-2 text-[10px] text-[--color-muted-foreground]">
          Debug: {allTags.length} tags total, {skillTags.length} assigned, {unassignedTags.length} available
        </div>
        <h3 className="mb-4 text-sm font-semibold">{t("tagManager.title")}</h3>

        {assignError && (
          <div className="mb-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">{assignError}</div>
        )}

        {skillTags.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs text-[--color-muted-foreground]">{t("tagManager.assigned")}</p>
            <div className="flex flex-wrap gap-1.5">
              {skillTags.map((tag) => (
                <TagBadge key={tag.id} name={tag.name} color={tag.color} size="sm" onRemove={() => onRemove(tag.id)} />
              ))}
            </div>
          </div>
        )}

        {unassignedTags.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs text-[--color-muted-foreground]">{t("tagManager.available")}</p>
            <div className="flex flex-wrap gap-1.5">
              {unassignedTags.map((tag) => (
                <span className="inline-flex items-center gap-0.5 group">
                  <TagBadge
                  key={tag.id}
                  name={tag.name}
                  color={tag.color}
                  size="sm"
                  onClick={async () => {
                    
                    setAssignError(null);
                    try {
                      await onAssign(tag.id);
                    } catch (e) {
                      setAssignError(String(e));
                    }
                  }}
                />
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setAssignError(null);
                      try {
                        await onDeleteTag(tag.id);
                      } catch (e) {
                        setAssignError(String(e));
                      }
                    }}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-[--color-muted-foreground] opacity-0 transition-opacity hover:text-red-400 hover:bg-red-500/10 group-hover:opacity-100"
                    title="Delete tag"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {unassignedTags.length === 0 && skillTags.length > 0 && (
          <p className="mb-4 text-xs text-[--color-muted-foreground]">{t("tagManager.allAssigned")}</p>
        )}

        <hr className="mb-3 border-[--color-border]" />
        {createError && (
          <div className="mb-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">{createError}</div>
        )}
        <p className="mb-2 text-xs text-[--color-muted-foreground]">{t("tagManager.createNew")}</p>
        <div className="flex items-center gap-2">
          <input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder={t("tagManager.newTagPlaceholder")}
            className="flex-1 rounded-md border border-[--color-input] bg-[--color-background] px-3 py-1.5 text-xs text-[--color-foreground] outline-none focus:ring-2 focus:ring-[--color-ring]"
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          />
          <input
            type="color"
            value={newTagColor}
            onChange={(e) => setNewTagColor(e.target.value)}
            className="h-7 w-7 cursor-pointer rounded border border-[--color-border] bg-transparent p-0.5"
          />
          <button
            onClick={handleCreate}
            disabled={!newTagName.trim() || creating}
            className="rounded-md bg-[--color-primary] px-3 py-1.5 text-xs font-medium text-[--color-primary-foreground] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("tagManager.create")}
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs text-[--color-muted-foreground]"
          >
            {t("tagManager.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
