'use client';

export function PagesPreview({
  content,
  isLoading,
  isError,
  actions,
}: {
  content: string | null;
  isLoading: boolean;
  isError: boolean;
  actions?: React.ReactNode;
}) {
  if (isError) {
    return (
      <div className="flex min-h-[200px] items-center justify-center pt-4">
        <p className="text-sm text-destructive">Couldn&apos;t load this page.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center pt-4">
        <p className="font-mono text-[13px] text-muted-soft animate-pulse">Loading…</p>
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="flex min-h-[200px] items-center justify-center pt-4">
        <p className="font-mono text-[13px] text-muted-soft">No content available.</p>
      </div>
    );
  }

  return (
    <div className="bg-canvas-soft border border-hairline rounded-lg overflow-hidden">
      {actions && (
        <div className="flex justify-end items-center px-4 py-2 border-b border-hairline bg-surface-card/40 gap-2">
          {actions}
        </div>
      )}
      <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-body p-4 overflow-auto">
        {content}
      </pre>
    </div>
  );
}
