interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-8 ${className}`}>
      {icon && <div className="mb-4 text-gray-300">{icon}</div>}
      <h3 className="text-gray-400 text-base font-medium mb-1">{title}</h3>
      {description && (
        <p className="text-gray-300 text-sm">{description}</p>
      )}
    </div>
  );
}
