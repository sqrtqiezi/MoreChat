export function KnowledgeEmptyState() {
  return (
    <section className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl rounded-[2rem] border border-stone-200 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_45%),linear-gradient(135deg,_#ffffff,_#f5f5f4)] p-8 shadow-sm sm:p-10">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Search</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
          搜索微信历史消息
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
          先输入关键词，或者切换到语义与混合模式。结果区、专题区和会话联动会在后续任务接上。
        </p>
      </div>
    </section>
  )
}
