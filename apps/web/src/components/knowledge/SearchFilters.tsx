interface SearchFiltersProps {
  importantOnly: boolean
  onImportantChange: (checked: boolean) => void
}

export function SearchFilters({
  importantOnly,
  onImportantChange,
}: SearchFiltersProps) {
  return (
    <label className="inline-flex items-center gap-3 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-700">
      <input
        type="checkbox"
        checked={importantOnly}
        onChange={(event) => onImportantChange(event.target.checked)}
        className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400"
      />
      <span>仅重要消息</span>
    </label>
  )
}
