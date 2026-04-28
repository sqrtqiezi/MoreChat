// ABOUTME: 知识库侧边栏，提供各功能区的导航入口。
// ABOUTME: 使用 NavLink 实现激活状态高亮，并嵌入侧边栏预览组件。
import { NavLink } from 'react-router-dom'
import { KnowledgeSidebarPreview } from './KnowledgeSidebarPreview'

const sections = [
  { label: 'Search', to: '/' },
  { label: 'Feed', to: '/feed' },
  { label: 'Topics', to: '/topics' },
  { label: 'Chat', to: '/chat' },
] as const

export function KnowledgeSidebar() {
  return (
    <aside className="w-full border-b border-stone-200 bg-stone-950 text-stone-100 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:flex-none lg:self-start lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col px-4 py-5 sm:px-6 lg:px-5">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-400">Knowledge</p>
          <h1 className="mt-2 text-xl font-semibold text-stone-50">微信知识库</h1>
        </div>

        <nav aria-label="知识库导航" className="flex gap-3 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {sections.map((section) => (
            <NavLink
              key={section.label}
              to={section.to}
              end={section.to === '/'}
              className={({ isActive }) => `rounded-2xl border px-4 py-3 text-left text-sm transition ${
                isActive
                  ? 'border-stone-200 bg-stone-100 text-stone-950 shadow-sm'
                  : 'border-stone-800 bg-stone-900/60 text-stone-300'
              }`}
            >
              {section.label}
            </NavLink>
          ))}
        </nav>

        <KnowledgeSidebarPreview />
      </div>
    </aside>
  )
}
