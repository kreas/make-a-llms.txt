export function StatCard({
  label,
  value,
  meta,
  children,
}: {
  label: string;
  value: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative rounded-xl border border-hairline bg-surface-card p-5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-strong">{label}</p>
      <p className="mt-2 text-[34px] font-normal leading-none tracking-tight text-ink">{value}</p>
      {meta && <p className="mt-2 text-[12.5px] text-muted-strong">{meta}</p>}
      {children && <div className="absolute bottom-4 right-4">{children}</div>}
    </div>
  );
}
