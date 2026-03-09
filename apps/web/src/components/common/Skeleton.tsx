interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-gray-200';

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const style: React.CSSProperties = {
    width: width || '100%',
    height: height || (variant === 'text' ? '1em' : '100%'),
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );
}

// Preset skeleton components for common use cases
export function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton variant="circular" width={48} height={48} />
      <div className="flex-1 space-y-2">
        <Skeleton variant="text" width="60%" height={16} />
        <Skeleton variant="text" width="80%" height={14} />
      </div>
    </div>
  );
}

export function MessageSkeleton({ isMine = false }: { isMine?: boolean }) {
  return (
    <div className={`flex items-start gap-3 px-6 py-3 ${isMine ? 'justify-end' : 'justify-start'}`}>
      {!isMine && <Skeleton variant="circular" width={40} height={40} />}
      <div className="space-y-2 max-w-[70%]">
        <Skeleton variant="text" width={isMine ? 100 : 120} height={12} />
        <Skeleton variant="rectangular" width={isMine ? 200 : 250} height={60} className="rounded-2xl" />
      </div>
      {isMine && <Skeleton variant="circular" width={40} height={40} />}
    </div>
  );
}
