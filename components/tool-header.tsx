export default function ToolHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{children}</p>
      )}
    </header>
  );
}
