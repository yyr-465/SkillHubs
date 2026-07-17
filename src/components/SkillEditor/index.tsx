import { useState, useEffect } from "react";
import { useTranslation } from "@/i18n";
import { useSkillStore, type Skill, type FilterOptionWithCount } from "@/store/skillStore";
import { X, Loader2, Check, Pencil } from "lucide-react";

interface SkillEditorProps {
  skill: Skill;
  open: boolean;
  onClose: () => void;
}

const RISK_OPTIONS = ["low", "medium", "high", "critical"];

export default function SkillEditor({ skill, open, onClose }: SkillEditorProps) {
  const { t } = useTranslation();
  const { updateSkill, filterOptions, fetchFilters } = useSkillStore();

  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description);
  const [category, setCategory] = useState(skill.category ?? "");
  const [risk, setRisk] = useState(skill.risk ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch fresh filters when opening
  useEffect(() => {
    if (open) {
      fetchFilters();
      setName(skill.name);
      setDescription(skill.description);
      setCategory(skill.category ?? "");
      setRisk(skill.risk ?? "");
      setSaving(false);
      setSaved(false);
    }
  }, [open, skill, fetchFilters]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await updateSkill({
      id: skill.id,
      name: name !== skill.name ? name : undefined,
      description: description !== skill.description ? description : undefined,
      category: category !== (skill.category ?? "") ? category || undefined : undefined,
      risk: risk !== (skill.risk ?? "") ? risk || undefined : undefined,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-white/60 backdrop-blur-[15px] dark:bg-black/60"
        onClick={onClose}
      />
      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-[--color-border] bg-[--color-card]/95 backdrop-blur-md p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-[--color-primary]" />
            <h2 className="text-lg font-bold tracking-tight">{t("skillEditor.title")}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[--color-muted-foreground] transition-colors hover:text-[--color-foreground]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[--color-muted-foreground]">
              {t("skillEditor.name")}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-[--color-input] bg-[--color-background] px-3 py-2 text-sm text-[--color-foreground] outline-none focus:ring-2 focus:ring-[--color-ring]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[--color-muted-foreground]">
              {t("skillEditor.description")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[--color-input] bg-[--color-background] px-3 py-2 text-sm text-[--color-foreground] outline-none focus:ring-2 focus:ring-[--color-ring] resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[--color-muted-foreground]">
              {t("skillEditor.category")}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-[--color-input] bg-[--color-background] px-3 py-2 text-sm text-[--color-foreground] outline-none focus:ring-2 focus:ring-[--color-ring]"
            >
              <option value="">{t("skillEditor.selectCategory")}</option>
              {filterOptions.categories.map((cat: FilterOptionWithCount) => (
                <option key={cat.value} value={cat.value}>
                  {cat.value}
                </option>
              ))}
            </select>
          </div>

          {/* Risk */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[--color-muted-foreground]">
              {t("skillEditor.risk")}
            </label>
            <select
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
              className="w-full rounded-md border border-[--color-input] bg-[--color-background] px-3 py-2 text-sm text-[--color-foreground] outline-none focus:ring-2 focus:ring-[--color-ring]"
            >
              <option value="">{t("skillEditor.selectRisk")}</option>
              {RISK_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-500">
              <Check className="h-4 w-4" />
              {t("skillEditor.saved")}
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-md border border-[--color-border] px-4 py-2 text-sm text-[--color-muted-foreground] transition-colors hover:text-[--color-foreground]"
            >
              {t("skillEditor.cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-[--color-primary] px-4 py-2 text-sm font-medium text-[--color-primary-foreground] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("skillEditor.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


