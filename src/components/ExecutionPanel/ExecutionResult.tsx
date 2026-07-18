import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import type { ExecutionRecord } from "@/store/skillStore";

interface Props { result: ExecutionRecord; onClose: () => void; }

export default function ExecutionResult({ result, onClose }: Props) {
  const { t } = useTranslation();
  const tone = result.status === "Success" ? "text-emerald-400" : "text-red-400";
  return (
    <div className="space-y-4">
      <div className={`text-sm font-semibold ${tone}`}>{t(`execution.${result.status.toLowerCase()}`)}</div>
      <div className="rounded-md border border-[--color-border] px-3 py-2 text-sm"><span className="text-[--color-muted-foreground]">{t("execution.exitCode")}: </span>{result.exit_code ?? "—"}</div>
      <Output label={t("execution.stdout")} value={result.stdout} />
      <Output label={t("execution.stderr")} value={result.stderr} />
      <div className="flex justify-end"><Button onClick={onClose}>{t("execution.close")}</Button></div>
    </div>
  );
}

function Output({ label, value }: { label: string; value: string }) {
  return <div><p className="mb-1 text-xs font-medium text-[--color-muted-foreground]">{label}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-black/20 p-3 font-mono text-xs leading-relaxed">{value || "—"}</pre></div>;
}
