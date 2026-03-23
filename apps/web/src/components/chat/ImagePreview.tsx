// ABOUTME: 图片预览组件，显示缩略图、文件信息和操作按钮
// ABOUTME: 提供发送和取消功能
import { useEffect, useState } from 'react';

interface ImagePreviewProps {
  file: File;
  onSend: () => void;
  onCancel: () => void;
  isSending: boolean;
}

export function ImagePreview({ file, onSend, onCancel, isSending }: ImagePreviewProps) {
  const [preview, setPreview] = useState<string>('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 flex items-center gap-3">
      <img src={preview} alt="预览" className="w-16 h-16 object-cover rounded" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
        <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSend}
          disabled={isSending}
          className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isSending ? '发送中...' : '发送'}
        </button>
        <button
          onClick={onCancel}
          disabled={isSending}
          className="px-4 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          取消
        </button>
      </div>
    </div>
  );
}
