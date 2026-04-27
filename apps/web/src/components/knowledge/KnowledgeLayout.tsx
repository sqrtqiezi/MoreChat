import type { PropsWithChildren } from 'react'
import { KnowledgeSidebar } from './KnowledgeSidebar'

export function KnowledgeLayout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-stone-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
        <KnowledgeSidebar />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}
