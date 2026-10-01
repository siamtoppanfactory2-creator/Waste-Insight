import { Component, useState } from 'react'
import type { ReactNode } from 'react'
import { ReplanPage }    from './pages/ReplanPage'
import { AddpaperPage }  from './pages/AddpaperPage'
import { CombinedPage }  from './pages/CombinedPage'
import { InsightsPage }  from './pages/InsightsPage'
import { useActionedJobs } from './hooks/useActionedJobs'
import type { UseActionedJobsResult } from './hooks/useActionedJobs'
import { useSalesData }   from './hooks/useSalesData'
import type { SalesMap }  from './hooks/useSalesData'
import { useProductionJobs } from './hooks/useProductionJobs'
import { useTheme } from './hooks/useTheme'

// ── Error Boundary ─────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error
      return (
        <div style={{ padding:32, fontFamily:'monospace', color:'#dc2626', background:'#fff1f2', minHeight:'100vh' }}>
          <h2 style={{ marginBottom:12 }}>⚠ Runtime Error</h2>
          <pre style={{ background:'#fff', padding:16, borderRadius:8, fontSize:12, border:'1px solid #fecaca', overflowX:'auto' }}>
            {err.message}{'\n\n'}{err.stack}
          </pre>
          <button onClick={() => this.setState({ error:null })}
            style={{ marginTop:16, padding:'8px 16px', background:'#dc2626', color:'#fff', border:'none', borderRadius:6, cursor:'pointer' }}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── App ────────────────────────────────────────────────────────
type Tab = 'Replan' | 'Addpaper' | 'Combined' | 'Insights'
const TAB_LABEL: Record<Tab, string> = { Replan: 'Replan', Addpaper: 'Addpaper', Combined: 'Combined', Insights: 'วิเคราะห์' }

// Export type so pages can receive it as prop
export type { UseActionedJobsResult }
export type { SalesMap }

export function App() {
  const [tab, setTab] = useState<Tab>('Replan')
  // ── shared state — โหลดครั้งเดียว ไม่ reset เมื่อ switch tab ──
  const actioned = useActionedJobs()
  const salesMap = useSalesData()
  const prodJobs = useProductionJobs()
  const { theme, toggleTheme } = useTheme()

  return (
    <ErrorBoundary>
      <div className="min-h-screen" style={{ background:'var(--bg)' }}>
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
          <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center gap-6">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
              </div>
              <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Waste Insight</span>
            </div>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700"/>
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 gap-1">
              {(['Replan','Addpaper','Combined','Insights'] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                    tab===t ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}>
                  {TAB_LABEL[t]}
                </button>
              ))}
            </div>
            <button onClick={toggleTheme}
              className="ml-auto w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
              title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="4" strokeWidth={2}/>
                  <path strokeLinecap="round" strokeWidth={2}
                    d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
                </svg>
              )}
            </button>
          </div>
        </header>

        <main className="max-w-screen-2xl mx-auto px-6 py-5">
          <ErrorBoundary>
            {tab==='Replan'   && <ReplanPage   actioned={actioned} salesMap={salesMap} prodJobs={prodJobs}/>}
            {tab==='Addpaper' && <AddpaperPage actioned={actioned} salesMap={salesMap} prodJobs={prodJobs}/>}
            {tab==='Combined' && <CombinedPage salesMap={salesMap} prodJobs={prodJobs}/>}
            {tab==='Insights' && <InsightsPage salesMap={salesMap} prodJobs={prodJobs}/>}
          </ErrorBoundary>
        </main>
      </div>
    </ErrorBoundary>
  )
}
