import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import type { ExecutionStatus } from "@/store/skillStore";

interface Props {
  executionId: string | null;
  status: ExecutionStatus | null;
  startedAt: number | null;
  onCancel: () => void;
}

export default function ExecutionRunning({ executionId, status, startedAt, onCancel }: Props) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const update = () => setElapsed(startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0);
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-md bg-[--color-primary]/10 px-3 py-3"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[--color-primary]" /><span className="text-sm font-medium">{t("execution.running")}</span></div>
      <div className="grid gap-3 text-sm">
        <Detail label={t("execution.executionId")} value={executionId || "—"} />
        <Detail label={t("execution.status")} value={status || "Running"} />
        <Detail label={t("execution.elapsedTime")} value={`${elapsed}s`} />
      </div>
      <div className="flex justify-end"><Button variant="destructive" onClick={onCancel}>{t("execution.cancel")}</Button></div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-[--color-border] bg-[--color-background] px-3 py-2"><p className="text-xs text-[--color-muted-foreground]">{label}</p><p className="mt-1 break-all font-mono text-xs">{value}</p></div>;
}
