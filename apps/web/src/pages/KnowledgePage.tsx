export function KnowledgePage() {
  return (
    <main className="flex h-screen flex-1 items-center justify-center">
      <section className="w-full max-w-2xl px-6">
        <label className="sr-only" htmlFor="knowledge-search">
          搜索
        </label>
        <input
          id="knowledge-search"
          type="text"
          aria-label="搜索"
          placeholder="搜索知识库"
          className="w-full rounded-full border border-slate-300 px-5 py-4 text-base outline-none"
        />
      </section>
    </main>
  )
}
