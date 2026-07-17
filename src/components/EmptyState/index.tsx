import { FileQuestion } from "lucide-react";

interface EmptyStateProps {
  message: string;
}

export default function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-[--color-border] py-16">
      <FileQuestion className="h-10 w-10 text-[--color-muted-foreground]" />
      <p className="max-w-md text-center text-sm text-[--color-muted-foreground]">{message}</p>
    </div>
  );
}
