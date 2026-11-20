import { TOOLS } from "@/lib/tools";

export default function ToolHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  // The tool's short Japanese label (manga style). Page titles are worded a little differently
  // from the tool names ("PDF cover images", "Phone formatter"), so match loosely.
  const lower = title.toLowerCase();
  const jp = TOOLS.find((t) => lower.startsWith(t.name.toLowerCase()))?.jp;
  return (
    <header>
      <h1 className="text-2xl tracking-tight">
        {title}
        {jp && <span className="manga-jp ml-2 align-middle text-[13px]">{jp}</span>}
      </h1>
      {children && <p className="mt-1 text-sm text-zinc-600">{children}</p>}
    </header>
  );
}
