import { useState, useMemo } from 'react'
import { Check, X, ChevronLeft, ChevronRight, User, Trash2 } from 'lucide-react'
import { useShiftStore } from '../store/shiftStore'
import { buildMonthDays } from '../utils/calendar'
import clsx from 'clsx'
import type { LeaveRequestType } from '../types'

const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']
const STATUS_LABEL = { pending: '申請中', approved: '承認済', rejected: '却下' }
const STATUS_COLOR = {
  pending:  'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
}

// 選択状態: undefined=未選択, 'off'=公休, 'paid_leave'=有給
type SelectionMap = Map<string, LeaveRequestType>

// タップするたびに none → off → paid_leave → none と循環
function cycleType(current: LeaveRequestType | undefined): LeaveRequestType | undefined {
  if (current === undefined) return 'off'
  if (current === 'off') return 'paid_leave'
  return undefined
}

export function RequestsPage() {
  const {
    staffList, leaveRequests, viewYear, viewMonth,
    addLeaveRequest, approveLeave, rejectLeave, exceptions,
  } = useShiftStore()

  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [selection, setSelection] = useState<SelectionMap>(new Map())
  const [calYear, setCalYear] = useState(viewYear)
  const [calMonth, setCalMonth] = useState(viewMonth)
  const [tab, setTab] = useState<'input' | 'list'>('input')

  const allDays = useMemo(
    () => buildMonthDays(calYear, calMonth, exceptions),
    [calYear, calMonth, exceptions]
  )

  const regularStaff = staffList.filter(s => s.staffType !== 'arbeit' && s.isActive)

  const prevMonth = () => {
    setSelection(new Map())
    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    setSelection(new Map())
    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1) }
    else setCalMonth(m => m + 1)
  }

  const handleSelectStaff = (id: string) => {
    setSelectedStaffId(id)
    setSelection(new Map())
  }

  const handleTapDate = (dateStr: string, isBusinessDay: boolean) => {
    if (!isBusinessDay || !selectedStaffId) return
    setSelection(prev => {
      const next = new Map(prev)
      const next_type = cycleType(next.get(dateStr))
      if (next_type === undefined) next.delete(dateStr)
      else next.set(dateStr, next_type)
      return next
    })
  }

  const handleClearAll = () => setSelection(new Map())

  const handleSubmit = () => {
    if (!selectedStaffId || selection.size === 0) return
    for (const [date, requestType] of selection) {
      addLeaveRequest({ staffId: selectedStaffId, date, requestType, status: 'pending' })
    }
    setSelection(new Map())
  }

  // カレンダー用グリッド（日曜始まり、前埋め）
  const firstWeekday = allDays[0]?.weekday ?? 0
  const calGrid: (typeof allDays[0] | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...allDays,
  ]
  while (calGrid.length % 7 !== 0) calGrid.push(null)

  // 選択スタッフの既存申請日セット
  const existingRequests = useMemo(() => {
    if (!selectedStaffId) return new Map<string, LeaveRequestType>()
    const m = new Map<string, LeaveRequestType>()
    leaveRequests
      .filter(r =>
        r.staffId === selectedStaffId &&
        r.date.startsWith(`${calYear}-${String(calMonth).padStart(2, '0')}`)
      )
      .forEach(r => m.set(r.date, r.requestType))
    return m
  }, [leaveRequests, selectedStaffId, calYear, calMonth])

  const monthRequests = leaveRequests.filter(r =>
    r.date.startsWith(`${viewYear}-${String(viewMonth).padStart(2, '0')}`)
  )

  const offCount = [...selection.values()].filter(v => v === 'off').length
  const paidCount = [...selection.values()].filter(v => v === 'paid_leave').length

  return (
    <div className="pb-20">
      {/* タブ */}
      <div className="flex border-b border-gray-200 bg-white sticky top-14 z-30">
        {(['input', 'list'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex-1 py-3 text-sm font-semibold border-b-2 transition-colors',
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400'
            )}
          >
            {t === 'input' ? '希望を入力' : `申請一覧（${monthRequests.length}）`}
          </button>
        ))}
      </div>

      {/* ===== 入力タブ ===== */}
      {tab === 'input' && (
        <div className="p-3 space-y-3">

          {/* スタッフ選択 */}
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-2">スタッフを選択</label>
            <div className="flex flex-wrap gap-2">
              {regularStaff.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleSelectStaff(s.id)}
                  className={clsx(
                    'flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                    selectedStaffId === s.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  )}
                >
                  <User size={13} />
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* 凡例 */}
          <div className="flex items-center gap-3 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
            <span className="font-medium text-gray-600">タップ操作:</span>
            <span className="flex items-center gap-1">
              <span className="inline-flex items-center justify-center w-7 h-6 rounded-lg bg-blue-100 text-blue-700 font-bold text-[11px]">公</span>
              1回=公休
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-flex items-center justify-center w-7 h-6 rounded-lg bg-green-100 text-green-700 font-bold text-[11px]">有</span>
              2回=有給
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-flex items-center justify-center w-7 h-6 rounded-lg bg-gray-100 text-gray-400 font-bold text-[11px]">×</span>
              3回=取消
            </span>
          </div>

          {/* カレンダー */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {/* ヘッダ */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <button onClick={prevMonth} className="p-1.5 rounded-full hover:bg-gray-200 active:bg-gray-300">
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-bold text-gray-800">{calYear}年{calMonth}月</span>
              <button onClick={nextMonth} className="p-1.5 rounded-full hover:bg-gray-200 active:bg-gray-300">
                <ChevronRight size={18} />
              </button>
            </div>

            {/* 曜日ヘッダ */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {WEEKDAY_NAMES.map((w, i) => (
                <div
                  key={w}
                  className={clsx(
                    'text-center text-xs font-bold py-2',
                    i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
                  )}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* 日付グリッド */}
            <div className="grid grid-cols-7 p-2 gap-1">
              {calGrid.map((day, idx) => {
                if (!day) return <div key={idx} />

                const selType = selection.get(day.dateStr)
                const existingType = existingRequests.get(day.dateStr)
                const canSelect = day.isBusinessDay && !!selectedStaffId

                // セルの表示状態を決定
                let cellClass = ''
                let label = String(day.date.getDate())
                let subLabel = ''

                if (selType === 'off') {
                  cellClass = 'bg-blue-500 text-white'
                  subLabel = '公休'
                } else if (selType === 'paid_leave') {
                  cellClass = 'bg-green-500 text-white'
                  subLabel = '有給'
                } else if (existingType) {
                  cellClass = existingType === 'off'
                    ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                    : 'bg-green-100 text-green-700 ring-1 ring-green-300'
                  subLabel = existingType === 'off' ? '申請中' : '申請中'
                } else if (!day.isBusinessDay) {
                  cellClass = 'opacity-25 cursor-default'
                } else {
                  cellClass = clsx(
                    'hover:bg-gray-100',
                    day.weekday === 0 ? 'text-red-500' :
                    day.weekday === 6 ? 'text-blue-500' :
                    day.isHoliday    ? 'text-red-400' :
                    'text-gray-800'
                  )
                }

                return (
                  <button
                    key={day.dateStr}
                    onClick={() => handleTapDate(day.dateStr, day.isBusinessDay)}
                    disabled={!canSelect}
                    className={clsx(
                      'flex flex-col items-center justify-center rounded-xl h-12 transition-all select-none',
                      cellClass,
                    )}
                  >
                    <span className="text-sm font-bold leading-none">{label}</span>
                    <span className="text-[9px] leading-tight mt-0.5 font-medium">{subLabel}</span>
                  </button>
                )
              })}
            </div>

            {/* 選択サマリ & 一括クリア */}
            {(selection.size > 0 || true) && (
              <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  {selection.size > 0 ? (
                    <>
                      {offCount > 0 && (
                        <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                          公休 {offCount}日
                        </span>
                      )}
                      {paidCount > 0 && (
                        <span className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          有給 {paidCount}日
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400">日付をタップして選択</span>
                  )}
                </div>
                {selection.size > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 size={12} />
                    全クリア
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 申請ボタン */}
          <button
            onClick={handleSubmit}
            disabled={!selectedStaffId || selection.size === 0}
            className="w-full bg-blue-600 text-white py-3 rounded-2xl text-sm font-bold disabled:opacity-40 shadow-sm active:bg-blue-700 transition-colors"
          >
            {selection.size > 0
              ? `${selection.size}日分を申請する（公休${offCount}・有給${paidCount}）`
              : selectedStaffId ? '日付を選択してください' : 'スタッフを選択してください'
            }
          </button>
        </div>
      )}

      {/* ===== 一覧タブ ===== */}
      {tab === 'list' && (
        <div className="p-3 space-y-2">
          <p className="text-xs text-gray-400">{viewYear}年{viewMonth}月の申請一覧</p>
          {monthRequests.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">申請はありません</div>
          ) : (
            [...monthRequests]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(req => {
                const staff = staffList.find(s => s.id === req.staffId)
                const dayObj = allDays.find(d => d.dateStr === req.date)
                return (
                  <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800">{staff?.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{req.date.slice(5).replace('-', '/')}（{dayObj?.weekdayName ?? ''}）</span>
                        <span className={clsx(
                          'px-1.5 py-0.5 rounded text-[10px] font-bold',
                          req.requestType === 'paid_leave' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        )}>
                          {req.requestType === 'paid_leave' ? '有給' : '公休'}
                        </span>
                      </div>
                    </div>
                    <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0', STATUS_COLOR[req.status])}>
                      {STATUS_LABEL[req.status]}
                    </span>
                    {req.status === 'pending' && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => approveLeave(req.id)} className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">
                          <Check size={14} />
                        </button>
                        <button onClick={() => rejectLeave(req.id)} className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
          )}
        </div>
      )}
    </div>
  )
}
