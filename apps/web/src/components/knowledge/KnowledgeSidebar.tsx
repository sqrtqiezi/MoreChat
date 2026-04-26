const sections = ['Search', 'Topics', 'Chat'] as const

export function KnowledgeSidebar() {
  return (
    <aside className="w-full border-b border-stone-200 bg-stone-950 text-stone-100 lg:min-h-screen lg:w-64 lg:flex-none lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col px-4 py-5 sm:px-6 lg:px-5">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-400">Knowledge</p>
          <h1 className="mt-2 text-xl font-semibold text-stone-50">微信知识库</h1>
        </div>

        <nav
          aria-label="知识库导航"
          className="flex gap-3 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible"
        >
          {sections.map((section, index) => {
            const isActive = index === 0

            return (
              <button
                key={section}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                  isActive
                    ? 'border-stone-200 bg-stone-100 text-stone-950 shadow-sm'
                    : 'border-stone-800 bg-stone-900/60 text-stone-300'
                }`}
              >
                {section}
              </button>
            )
          })}
        </nav>

        <div className="mt-5 rounded-3xl border border-stone-800 bg-stone-900/60 p-4 text-sm text-stone-400">
          从搜索开始，后续会在这里接入专题与会话视图。
        </div>
      </div>
    </aside>
  )
}
