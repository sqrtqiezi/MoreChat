interface DirectoryItemProps {
  name: string;
  avatar?: string;
  subtitle?: string;
  onClick: () => void;
}

export function DirectoryItem({ name, avatar, subtitle, onClick }: DirectoryItemProps) {
  const firstLetter = name.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white"
    >
      {avatar ? (
        <img src={avatar} alt={name} className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-300 text-sm font-semibold text-gray-700">
          {firstLetter}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-gray-900">{name}</div>
        {subtitle ? <div className="truncate text-xs text-gray-500">{subtitle}</div> : null}
      </div>
    </button>
  );
}
