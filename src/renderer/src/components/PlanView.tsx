import { useEffect, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { useTerminalStore } from '../stores/chatStore'
import { formatRelativeTime } from '../utils/time'

interface PlanEntry {
  name: string
  title: string
  modifiedAt: number
}

export function PlanView() {
  const { activeTerminalId, terminals } = useTerminalStore()
  const activeTerminal = terminals.find((t) => t.id === activeTerminalId)

  const [planContent, setPlanContent] = useState<string | null>(null)
  const [planName, setPlanName] = useState<string | null>(null)
  const [allPlans, setAllPlans] = useState<PlanEntry[]>([])
  const [showAllPlans, setShowAllPlans] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadSessionPlan = useCallback(async () => {
    if (!activeTerminal) {
      setPlanContent(null)
      setPlanName(null)
      setLoading(false)
      return
    }

    const plan = await window.api.getSessionPlan(
      activeTerminal.sessionId,
      activeTerminal.workingDirectory
    )

    if (plan) {
      setPlanContent(prev => prev === plan.content ? prev : plan.content)
      setPlanName(prev => prev === plan.name ? prev : plan.name)
      setShowAllPlans(false)
    } else {
      setPlanContent(null)
      setPlanName(null)
      setShowAllPlans(true)
    }
    setLoading(false)
  }, [activeTerminal?.sessionId, activeTerminal?.workingDirectory])

  useEffect(() => {
    setLoading(true)
    loadSessionPlan()
    const interval = setInterval(loadSessionPlan, 3000)
    return () => clearInterval(interval)
  }, [loadSessionPlan])

  useEffect(() => {
    if (!showAllPlans) return
    window.api.listPlans().then(setAllPlans)
  }, [showAllPlans])

  const openPlan = async (name: string) => {
    const content = await window.api.readPlan(name)
    if (content) {
      setPlanContent(content)
      setPlanName(name)
      setShowAllPlans(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0f172a]">
        <div className="text-slate-500 text-sm">Loading plan...</div>
      </div>
    )
  }

  // Show all plans list
  if (showAllPlans || !planContent) {
    return (
      <div className="h-full flex flex-col bg-[#0f172a] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-medium text-slate-300">
            {planContent ? 'All Plans' : 'No plan for this session'}
          </h2>
          {planContent && (
            <button
              onClick={() => setShowAllPlans(false)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Back to session plan
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {allPlans.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              No plans found in ~/.claude/plans/
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {allPlans.map((plan) => (
                <button
                  key={plan.name}
                  onClick={() => openPlan(plan.name)}
                  className="w-full px-5 py-3 text-left hover:bg-slate-800/50 transition-colors"
                >
                  <div className="text-sm text-slate-200 font-medium truncate">
                    {plan.title}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {plan.name} &middot; {formatRelativeTime(plan.modifiedAt)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Render plan as formatted HTML
  return (
    <div className="h-full flex flex-col bg-[#0f172a] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          <span className="text-xs text-slate-400 truncate">{planName}</span>
        </div>
        <button
          onClick={() => setShowAllPlans(true)}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          All plans
        </button>
      </div>

      {/* Markdown content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <article className="plan-content px-6 py-5 max-w-none">
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
            {planContent}
          </ReactMarkdown>
        </article>
      </div>

      <style>{`
        .plan-content {
          color: #e2e8f0;
          font-size: 14px;
          line-height: 1.7;
        }
        .plan-content h1 {
          font-size: 1.5em;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0 0 0.8em 0;
          padding-bottom: 0.4em;
          border-bottom: 1px solid #1e293b;
        }
        .plan-content h2 {
          font-size: 1.2em;
          font-weight: 600;
          color: #e2e8f0;
          margin: 1.4em 0 0.6em 0;
        }
        .plan-content h3 {
          font-size: 1.05em;
          font-weight: 600;
          color: #cbd5e1;
          margin: 1.2em 0 0.4em 0;
        }
        .plan-content p {
          margin: 0.6em 0;
        }
        .plan-content ul, .plan-content ol {
          margin: 0.5em 0;
          padding-left: 1.5em;
        }
        .plan-content li {
          margin: 0.3em 0;
        }
        .plan-content li::marker {
          color: #64748b;
        }
        .plan-content strong {
          color: #f1f5f9;
          font-weight: 600;
        }
        .plan-content code {
          background: #1e293b;
          color: #93c5fd;
          padding: 0.15em 0.4em;
          border-radius: 4px;
          font-size: 0.9em;
          font-family: 'SF Mono', 'Fira Code', Menlo, monospace;
        }
        .plan-content pre {
          background: #0d1117;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 1em;
          margin: 0.8em 0;
          overflow-x: auto;
        }
        .plan-content pre code {
          background: none;
          padding: 0;
          color: #e2e8f0;
          font-size: 13px;
          line-height: 1.5;
        }
        .plan-content blockquote {
          border-left: 3px solid #3b82f6;
          margin: 0.8em 0;
          padding: 0.4em 1em;
          color: #94a3b8;
          background: #1e293b40;
          border-radius: 0 6px 6px 0;
        }
        .plan-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.8em 0;
        }
        .plan-content th, .plan-content td {
          border: 1px solid #1e293b;
          padding: 0.5em 0.8em;
          text-align: left;
        }
        .plan-content th {
          background: #1e293b;
          color: #e2e8f0;
          font-weight: 600;
        }
        .plan-content a {
          color: #60a5fa;
          text-decoration: none;
        }
        .plan-content a:hover {
          text-decoration: underline;
        }
        .plan-content hr {
          border: none;
          border-top: 1px solid #1e293b;
          margin: 1.5em 0;
        }

        /* Scrollbar */
        .plan-content::-webkit-scrollbar {
          width: 6px;
        }
        .plan-content::-webkit-scrollbar-track {
          background: transparent;
        }
        .plan-content::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 3px;
        }
      `}</style>
    </div>
  )
}
