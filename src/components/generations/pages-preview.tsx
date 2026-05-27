'use client';

export function PagesPreview({
  content,
  isLoading,
  isError,
}: {
  content: string | null;
  isLoading: boolean;
  isError: boolean;
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
    <div className="pt-4">
      <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-body bg-canvas-soft border border-hairline p-4 rounded-lg overflow-auto">
        {content}
      </pre>
    </div>
  );
}
