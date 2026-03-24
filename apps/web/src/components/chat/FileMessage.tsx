import { useState } from 'react';
import { chatApi } from '../../api/chat';

interface FileMessageProps {
  msgId: string;
  displayContent: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(ext: string): string {
  const icons: Record<string, string> = {
    pdf: 'PDF', doc: 'DOC', docx: 'DOC', xls: 'XLS', xlsx: 'XLS',
    ppt: 'PPT', pptx: 'PPT', zip: 'ZIP', rar: 'RAR', txt: 'TXT',
    csv: 'CSV', mp3: 'MP3', mp4: 'MP4', png: 'PNG', jpg: 'JPG',
  };
  return icons[ext.toLowerCase()] || ext.toUpperCase().slice(0, 4);
}

export function FileMessage({ msgId, displayContent }: FileMessageProps) {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'error'>('idle');

  let fileName = '未知文件';
  let fileExt = '';
  let fileSize = 0;

  try {
    const parsed = JSON.parse(displayContent);
    fileName = parsed.fileName || '未知文件';
    fileExt = parsed.fileExt || '';
    fileSize = parsed.fileSize || 0;
  } catch {
    fileName = displayContent;
  }

  const handleClick = async () => {
    if (status === 'downloading') return;

    setStatus('downloading');
    try {
      const result = await chatApi.getFileUrl(msgId);
      const a = document.createElement('a');
      a.href = result.ossUrl;
      a.download = result.fileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={status === 'downloading'}
      className="flex items-center gap-3 p-2 -m-1 rounded-lg hover:bg-black/5 transition-colors cursor-pointer text-left min-w-[200px]"
    >
      <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
        {status === 'downloading' ? (
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          getFileIcon(fileExt)
        )}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-sm truncate max-w-[180px]">{fileName}</span>
        <span className="text-xs text-gray-500">
          {status === 'downloading' ? '下载中...' : status === 'error' ? '下载失败，点击重试' : formatFileSize(fileSize)}
        </span>
      </div>
    </button>
  );
}
