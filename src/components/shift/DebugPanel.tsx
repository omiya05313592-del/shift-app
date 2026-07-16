import { useState } from 'react'
import { Bug, ChevronDown, ChevronRight, Info, Wrench } from 'lucide-react'
import { useShiftStore } from '../../store/shiftStore'
import clsx from 'clsx'
import type { ShiftDebugPhaseLog, ShiftDebugConsecutiveOff, ShiftDebugSaturdayIssue, RepairLogEntry } from '../../types'

const STATUS_LABEL: Record<string, string> = {
  work: '出勤', off: '公休', paid_leave: '有給', closed: '定休', absent: '欠勤',
}

// ─── Phase ログ行 ───────────────────────────────────────────
function PhaseRow({ log }: { log: ShiftDebugPhaseLog }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="text-xs font-medium text-gray-700 flex-1">{log.phase}</span>
        <span className={clsx(
          'text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0',
          log.count > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400',
        )}>
          {log.count}件
        </span>
      </button>
      {open && log.details.length > 0 && (
        <div className="px-8 pb-2 space-y-0.5">
          {log.details.map((d, i) => (
            <div key={i} className="text-[11px] text-gray-500 font-mono">{d}</div>
          ))}
          {log.count > 10 && (
            <div className="text-[11px] text-gray-400">…他 {log.count - 10} 件</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 4連休詳細行 ─────────────────────────────────────────────
function ConsecutiveOffRow({ issue }: { issue: ShiftDebugConsecutiveOff }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-orange-50 text-left"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="text-xs font-bold text-orange-700">{issue.staffName}</span>
        <span className="text-xs text-gray-600 flex-1">
          {issue.start.slice(5)} 〜 {issue.end.slice(5)}
        </span>
        <span className="text-[11px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full shrink-0">
          {issue.length}連休
        </span>
      </button>
      {open && (
        <div className="px-8 pb-2 space-y-1">
          {issue.dayDetails.map((d, i) => (
            <div key={i} className="text-[11px] flex gap-2">
              <span className="text-gray-500 font-mono w-12 shrink-0">{d.date.slice(5)}</span>
              <span className={clsx(
                'font-bold w-6 shrink-0',
                d.status === 'closed' ? 'text-gray-400' :
                d.status === 'off' ? 'text-blue-600' :
                d.status === 'paid_leave' ? 'text-green-600' :
                d.status === 'absent' ? 'text-amber-500' : 'text-gray-700',
              )}>
                {STATUS_LABEL[d.status]}
              </span>
              <span className="text-gray-500">{d.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 土曜詳細行 ───────────────────────────────────────────────
function SaturdayRow({ issue }: { issue: ShiftDebugSaturdayIssue }) {
  const [open, setOpen] = useState(false)
  const isInsufficient = issue.workCount < issue.minCount
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className={clsx('w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-red-50')}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="text-xs text-gray-600 font-mono w-12 shrink-0">{issue.date.slice(5)}</span>
        <span className="text-xs text-gray-600 shrink-0">{issue.deptName}</span>
        <span className="flex-1" />
        <span className={clsx(
          'text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0',
          isInsufficient ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700',
        )}>
          {issue.workCount}人 / 推奨{issue.preferredCount}人{isInsufficient ? `（最低${issue.minCount}）` : ''}
        </span>
      </button>
      {open && issue.offStaff.length > 0 && (
        <div className="px-8 pb-2 space-y-1">
          <div className="text-[11px] text-gray-400 mb-1">休みのスタッフ:</div>
          {issue.offStaff.map((s, i) => (
            <div key={i} className="text-[11px] flex gap-2">
              <span className="text-gray-700 font-bold w-14 shrink-0">{s.name}</span>
              <span className="text-gray-500">{s.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Repair ログ 行 ──────────────────────────────────────────
const CATEGORY_COLOR: Record<string, string> = {
  '①必要人数不足': 'bg-red-100 text-red-700',
  '①代替休み':     'bg-red-50 text-red-500',
  '②同日休みNG':   'bg-orange-100 text-orange-700',
  '②代替休み':     'bg-orange-50 text-orange-500',
  '③基本勤務日':   'bg-blue-100 text-blue-700',
  '③代替休み':     'bg-blue-50 text-blue-500',
  '⑤4連休解消':    'bg-purple-100 text-purple-700',
  '⑤4連休解消代替':'bg-purple-50 text-purple-500',
  '⑥3連休削減':    'bg-indigo-100 text-indigo-700',
  '⑥3連休削減代替':'bg-indigo-50 text-indigo-500',
}

const STATUS_COLOR: Record<string, string> = {
  work: 'text-gray-700', off: 'text-blue-600', paid_leave: 'text-green-600',
  closed: 'text-gray-400', absent: 'text-amber-500',
}
const STATUS_SHORT: Record<string, string> = {
  work: '出', off: '休', paid_leave: '有', closed: '定', absent: '－',
}

function RepairLogRow({ entry, idx }: { entry: RepairLogEntry; idx: number }) {
  const [open, setOpen] = useState(false)
  const catColor = Object.entries(CATEGORY_COLOR).find(([k]) => entry.category.startsWith(k.slice(0,2)))?.[1]
    ?? 'bg-gray-100 text-gray-600'
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="text-[10px] text-gray-400 w-4 shrink-0">{idx + 1}</span>
        <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0', catColor)}>
          {entry.category}
        </span>
        <span className="text-[11px] font-bold text-gray-700 shrink-0">{entry.staffName}</span>
        <span className="text-[11px] text-gray-500 font-mono shrink-0">{entry.date.slice(5)}</span>
        <span className={clsx('text-[11px] font-bold shrink-0', STATUS_COLOR[entry.before])}>
          {STATUS_SHORT[entry.before]}
        </span>
        <span className="text-[10px] text-gray-400 shrink-0">→</span>
        <span className={clsx('text-[11px] font-bold shrink-0', STATUS_COLOR[entry.after])}>
          {STATUS_SHORT[entry.after]}
        </span>
        <span className="text-[10px] text-gray-400 ml-auto shrink-0">Iter {entry.iteration}</span>
      </button>
      {open && (
        <div className="px-8 pb-2">
          <p className="text-[11px] text-gray-500">{entry.detail}</p>
        </div>
      )}
    </div>
  )
}

// ─── メインパネル ─────────────────────────────────────────────
export function DebugPanel() {
  const { debugInfo } = useShiftStore()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'phase' | 'consecutive' | 'saturday' | 'repair'>('consecutive')

  if (!debugInfo) return null

  const { phaseLogs, consecutiveOffIssues, saturdayIssues, repairLog } = debugInfo

  const saturdayInsufficient = saturdayIssues.filter(i => i.workCount < i.minCount).length
  const saturdayUnderPref = saturdayIssues.filter(i => i.workCount < i.preferredCount && i.workCount >= i.minCount).length

  return (
    <div className="mx-2 my-2 rounded-xl border border-purple-200 bg-purple-50 overflow-hidden">
      {/* ヘッダ */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-purple-100 transition-colors"
      >
        <Bug size={14} className="text-purple-600 shrink-0" />
        <span className="text-xs font-bold text-purple-700 flex-1">
          デバッグパネル（開発用）
        </span>
        <div className="flex items-center gap-2 text-[11px]">
          {repairLog.length > 0 && (
            <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
              <Wrench size={10} />
              修正{repairLog.length}件
            </span>
          )}
          {consecutiveOffIssues.length > 0 && (
            <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">
              4連休 {consecutiveOffIssues.length}件
            </span>
          )}
          {saturdayInsufficient > 0 && (
            <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">
              土曜不足 {saturdayInsufficient}件
            </span>
          )}
          {saturdayUnderPref > 0 && (
            <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-bold">
              推奨未達 {saturdayUnderPref}件
            </span>
          )}
        </div>
        {open ? <ChevronDown size={14} className="text-purple-400 shrink-0" /> : <ChevronRight size={14} className="text-purple-400 shrink-0" />}
      </button>

      {open && (
        <div className="bg-white border-t border-purple-200">
          {/* タブ */}
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {(
              [
                { id: 'repair',      label: `Repair（${repairLog.length}件）` },
                { id: 'consecutive', label: `4連休（${consecutiveOffIssues.length}）` },
                { id: 'saturday',    label: `土曜（${saturdayIssues.length}）` },
                { id: 'phase',       label: 'Phase ログ' },
              ] as const
            ).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  'px-3 py-2 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0',
                  tab === t.id
                    ? 'border-purple-500 text-purple-700'
                    : 'border-transparent text-gray-400 hover:text-gray-600',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ─── Phase ログ ─── */}
          {tab === 'phase' && (
            <div className="divide-y divide-gray-100">
              {phaseLogs.map((log, i) => <PhaseRow key={i} log={log} />)}
            </div>
          )}

          {/* ─── 4連休以上 ─── */}
          {tab === 'consecutive' && (
            <div>
              {consecutiveOffIssues.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-4 text-xs text-gray-400">
                  <Info size={14} />
                  4連休以上のスタッフはいません
                </div>
              ) : (
                <>
                  <div className="px-3 py-2 text-[11px] text-gray-400 bg-gray-50 border-b border-gray-100">
                    定休日・公休・有給・欠勤が4日以上連続したスタッフ。タップで内訳を表示。
                  </div>
                  <div className="divide-y divide-gray-100">
                    {consecutiveOffIssues
                      .sort((a, b) => b.length - a.length)
                      .map((issue, i) => <ConsecutiveOffRow key={i} issue={issue} />)
                    }
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── 土曜分析 ─── */}
          {tab === 'saturday' && (
            <div>
              {saturdayIssues.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-4 text-xs text-gray-400">
                  <Info size={14} />
                  土曜の人数不足はありません
                </div>
              ) : (
                <>
                  <div className="px-3 py-2 text-[11px] text-gray-400 bg-gray-50 border-b border-gray-100">
                    推奨人数（preferredCount）に満たない土曜を表示。赤=最低人数割れ、黄=推奨未達。タップで休み理由を確認。
                  </div>
                  <div className="divide-y divide-gray-100">
                    {saturdayIssues.map((issue, i) => <SaturdayRow key={i} issue={issue} />)}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── Repair Engine ─── */}
          {tab === 'repair' && (
            <div>
              {repairLog.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-4 text-xs text-gray-400">
                  <Info size={14} />
                  Repair Engine による修正はありませんでした
                </div>
              ) : (
                <>
                  {/* カテゴリ別集計 */}
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-2">
                    {Object.entries(
                      repairLog.reduce<Record<string, number>>((acc, e) => {
                        acc[e.category] = (acc[e.category] ?? 0) + 1
                        return acc
                      }, {})
                    ).map(([cat, count]) => (
                      <span
                        key={cat}
                        className={clsx(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded',
                          CATEGORY_COLOR[cat] ?? 'bg-gray-100 text-gray-600',
                        )}
                      >
                        {cat}: {count}件
                      </span>
                    ))}
                  </div>
                  {/* イテレーション別ヘッダー付きログ */}
                  {[1, 2, 3].map(iter => {
                    const entries = repairLog.filter(e => e.iteration === iter)
                    if (entries.length === 0) return null
                    return (
                      <div key={iter}>
                        <div className="px-3 py-1 bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-500">
                          Iteration {iter}（{entries.length}件の修正）
                        </div>
                        <div className="divide-y divide-gray-100">
                          {entries.map((entry, i) => (
                            <RepairLogRow key={`${iter}-${i}`} entry={entry} idx={i} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
