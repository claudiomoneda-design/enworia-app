export function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
      <div className="bg-[#1C2B28] px-5 py-3">
        <h2 className="text-white font-semibold text-sm tracking-wide">
          {title}
        </h2>
      </div>
      <div className="px-5 py-5 space-y-4">{children}</div>
    </div>
  );
}
