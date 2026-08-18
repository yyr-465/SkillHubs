import { useEffect } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useSkillStore } from "@/store/skillStore";
import ExecutionPreview from "./ExecutionPreview";
import ExecutionRunning from "./ExecutionRunning";
import ExecutionResult from "./ExecutionResult";
import type { ExecutionPanelProps } from "./types";

export default function ExecutionPanel({ skillId, onClose }: ExecutionPanelProps) {
  const { t } = useTranslation();
  const state = useSkillStore((store) => store.executionUIState);
  const preview = useSkillStore((store) => store.executionPreview);
  const executionId = useSkillStore((store) => store.executionId);
  const executionStatus = useSkillStore((store) => store.executionStatus);
  const executionResult = useSkillStore((store) => store.executionResult);
  const executionError = useSkillStore((store) => store.executionError);
  const executionStartedAt = useSkillStore((store) => store.executionStartedAt);
  const prepareExecution = useSkillStore((store) => store.prepareExecution);
  const startExecution = useSkillStore((store) => store.startExecution);
  const refreshExecutionStatus = useSkillStore((store) => store.refreshExecutionStatus);
  const cancelExecution = useSkillStore((store) => store.cancelExecution);
  const resetExecution = useSkillStore((store) => store.resetExecution);

  useEffect(() => {
    if (state !== "running") return;
    const timer = window.setInterval(() => { void refreshExecutionStatus(); }, 1000);
    return () => window.clearInterval(timer);
  }, [state, refreshExecutionStatus]);

  const close = () => { resetExecution(); onClose(); };
  const execute = () => { void startExecution(skillId); };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-white/60 backdrop-blur-[15px] dark:bg-black/60" onClick={state === "running" ? undefined : close} />
      <div className="relative z-10 max-h-[85vh] w-full min-w-0 max-w-2xl overflow-y-auto overflow-x-hidden rounded-lg border border-[--color-border] bg-[--color-card]/95 p-4 shadow-2xl backdrop-blur-md sm:p-5">
        <div className="mb-5 flex items-center justify-between"><h2 className="text-base font-semibold">{t("execution.title")}</h2><button className="rounded-md p-1.5 text-[--color-muted-foreground] hover:bg-[--color-accent]" onClick={close} disabled={state === "running"}><X className="h-4 w-4" /></button></div>
        {state === "preview" && preview && <ExecutionPreview preview={preview} onExecute={execute} onCancel={close} />}
        {state === "running" && <ExecutionRunning executionId={executionId} status={executionStatus} startedAt={executionStartedAt} onCancel={() => { void cancelExecution(); }} />}
        {state === "result" && executionResult && <ExecutionResult result={executionResult} onClose={close} onRetry={() => { void prepareExecution(skillId); }} />}
        {state === "error" && <div className="space-y-4"><p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">{executionError}</p><div className="flex justify-end"><button className="rounded-md border border-[--color-border] px-3 py-2 text-sm" onClick={() => { void prepareExecution(skillId); }}>{t("execution.retry")}</button></div></div>}
        {state === "idle" && <div className="text-sm text-[--color-muted-foreground]">{t("execution.loading")}</div>}
      </div>
    </div>
  );
}
