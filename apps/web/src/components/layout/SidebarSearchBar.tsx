// ABOUTME: 侧边栏搜索框组件
// ABOUTME: 通过 URL 查询参数同步搜索关键词

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export function SidebarSearchBar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [inputValue, setInputValue] = useState(searchParams.get('q') ?? '')

  const handleSearch = (value: string) => {
    setInputValue(value)
    if (value.trim()) {
      setSearchParams({ q: value.trim() })
    } else {
      setSearchParams({})
    }
  }

  const handleClear = () => {
    setInputValue('')
    setSearchParams({})
  }

  return (
    <div className="px-3 py-2 border-b border-gray-200">
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="搜索消息..."
          className="w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {inputValue && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="清空搜索"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {!inputValue && (
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )}
      </div>
    </div>
  )
}
