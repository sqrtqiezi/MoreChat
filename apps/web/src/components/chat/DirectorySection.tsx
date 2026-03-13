import type { ReactNode } from 'react';

interface DirectorySectionProps {
  title: string;
  expanded: boolean;
  count: number;
  onToggle: () => void;
  children: ReactNode;
}

export function DirectorySection({
  title,
  expanded,
  count,
  onToggle,
  children,
}: DirectorySectionProps) {
  return (
    <section className="border-b border-gray-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700"
      >
        <span>{title}</span>
        <span className="text-xs text-gray-500">{expanded ? '−' : '+'} {count}</span>
      </button>
      {expanded ? <div>{children}</div> : null}
    </section>
  );
}
