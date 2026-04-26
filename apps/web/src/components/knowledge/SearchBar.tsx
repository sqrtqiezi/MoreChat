import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import type { SearchMode } from '../../types'
import { SearchFilters } from './SearchFilters'

interface SearchBarProps {
  query: string
  mode: SearchMode
  importantOnly: boolean
  onSubmit: (query: string) => void
  onModeChange: (mode: SearchMode) => void
  onImportantChange: (checked: boolean) => void
}

const modeOptions: Array<{ value: SearchMode; label: string }> = [
  { value: 'keyword', label: '关键词' },
  { value: 'semantic', label: '语义' },
  { value: 'hybrid', label: '混合' },
]

export function SearchBar({
  query,
  mode,
  importantOnly,
  onSubmit,
  onModeChange,
  onImportantChange,
}: SearchBarProps) {
  const [draftQuery, setDraftQuery] = useState(query)

  useEffect(() => {
    setDraftQuery(query)
  }, [query])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit(draftQuery)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 border-b border-stone-200 bg-white px-5 py-5 sm:px-6"
    >
      <div className="flex flex-col gap-3 xl:flex-row">
        <input
          aria-label="搜索消息"
          type="text"
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          placeholder="搜索微信历史消息"
          className="min-w-0 flex-1 rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-base text-slate-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500 focus:bg-white"
        />
        <button
          type="submit"
          className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-stone-50 transition hover:bg-stone-800"
        >
          搜索
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {modeOptions.map((option) => {
            const isActive = option.value === mode

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => onModeChange(option.value)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  isActive
                    ? 'bg-stone-900 text-stone-50'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <SearchFilters
          importantOnly={importantOnly}
          onImportantChange={onImportantChange}
        />
      </div>
    </form>
  )
}
