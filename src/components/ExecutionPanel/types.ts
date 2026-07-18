import type { ExecutionPreview, ExecutionRecord, ExecutionStatus, ExecutionUIState } from "@/store/skillStore";

export interface ExecutionPanelProps {
  skillId: string;
  onClose: () => void;
}

export interface ExecutionViewState {
  uiState: ExecutionUIState;
  preview: ExecutionPreview | null;
  executionId: string | null;
  status: ExecutionStatus | null;
  result: ExecutionRecord | null;
  error: string | null;
  startedAt: number | null;
}
