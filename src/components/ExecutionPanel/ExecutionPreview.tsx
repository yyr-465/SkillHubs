import { Button } from "@/components/ui/button";
import type { ExecutionPreview as ExecutionPreviewData } from "@/store/skillStore";
import { useTranslation } from "@/i18n";

interface Props {
  preview: ExecutionPreviewData;
  onExecute: () => void;
  onCancel: () => void;
}

export default function ExecutionPreview({ preview, onExecute, onCancel }: Props) {
  const { t } = useTranslation();
  const { spec } = preview;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 text-sm">
        <Detail label={t("execution.executable")} value={spec.command} />
        <Detail label={t("execution.arguments")} value={spec.args.length ? spec.args.join(" ") : "—"} />
        <Detail label={t("execution.workingDirectory")} value={spec.working_dir || "—"} />
        <Detail label={t("execution.timeoutSeconds")} value={String(spec.timeout_seconds)} />
        <Detail label={t("execution.permissionScope")} value={t("execution.skillDirectoryOnly")} />
      </div>
      {preview.reason && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">{preview.reason}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>{t("execution.cancel")}</Button>
        <Button onClick={onExecute} disabled={!preview.executable}>{t("execution.execute")}</Button>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-[--color-border] bg-[--color-background] px-3 py-2"><p className="text-xs text-[--color-muted-foreground]">{label}</p><p className="mt-1 break-all font-mono text-xs">{value}</p></div>;
}
