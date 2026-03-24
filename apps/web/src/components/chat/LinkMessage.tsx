interface LinkInfo {
  title: string
  url: string
  des: string
}

interface LinkMessageProps {
  displayContent: string
}

function parseLinkContent(displayContent: string): LinkInfo {
  try {
    const parsed = JSON.parse(displayContent)
    return {
      title: parsed.title || '[链接]',
      url: parsed.url || '',
      des: parsed.des || '',
    }
  } catch {
    // Fallback for old data: plain text title, no url
    return { title: displayContent || '[链接]', url: '', des: '' }
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

export function LinkMessage({ displayContent }: LinkMessageProps) {
  const { title, url } = parseLinkContent(displayContent)
  const domain = extractDomain(url)

  const handleClick = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div
      className={`border border-gray-200 rounded-lg p-3 max-w-xs bg-white ${url ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}`}
      onClick={url ? handleClick : undefined}
      role={url ? 'link' : undefined}
    >
      <p className="text-sm font-medium text-gray-900 line-clamp-2">{title}</p>
      {domain && (
        <p className="text-xs text-gray-400 mt-1">{domain}</p>
      )}
    </div>
  )
}
