import { useMemo, Fragment, useState } from 'react'
import { useShiftStore } from '../../store/shiftStore'
import { buildMonthDays } from '../../utils/calendar'
import { ShiftCell } from './ShiftCell'
import clsx from 'clsx'
import type { ShiftStatus } from '../../types'

const WEEKDAY_SHORT = ['日', '月', '火', '水', '木', '金', '土']

const STAFF_TYPE_LABEL: Record<string, string> = {
  employee: '社',
  part:     'パ',
  arbeit:   'ア',
}

const DEPT_COLOR: Record<string, { row: string; count: string }> = {
  'dept-meat':    { row: 'bg-orange-100 text-orange-800', count: 'bg-orange-50 text-orange-700' },
  'dept-cashier': { row: 'bg-purple-100 text-purple-800', count: 'bg-purple-50 text-purple-700' },
  'dept-gift':    { row: 'bg-pink-100 text-pink-800',     count: 'bg-pink-50 text-pink-700' },
}
const DEPT_COLOR_DEFAULT = { row: 'bg-gray-200 text-gray-700', count: 'bg-gray-50 text-gray-500' }

type ViewFilter = 'all' | 'regular' | 'arbeit'

export function ShiftTable() {
  const {
    viewYear, viewMonth, staffList, departments,
    currentShift, exceptions,
  } = useShiftStore()

  const [viewFilter, setViewFilter] = useState<ViewFilter>('all')

  const days = useMemo(
    () => buildMonthDays(viewYear, viewMonth, exceptions),
    [viewYear, viewMonth, exceptions],
  )

  if (!currentShift) return null

  const entryMap = useMemo(() => {
    const m = new Map<string, { status: ShiftStatus; isLocked: boolean }>()
    for (const e of currentShift.entries) {
      m.set(`${e.staffId}::${e.date}`, { status: e.status, isLocked: e.isLocked })
    }
    return m
  }, [currentShift.entries])

  // フィルター済みのスタッフ
  const filterStaff = (s: typeof staffList[0]) => {
    if (viewFilter === 'regular') return s.staffType !== 'arbeit'
    if (viewFilter === 'arbeit')  return s.staffType === 'arbeit'
    return true
  }

  // 部署ごとにスタッフをグループ化（フィルター適用）
  const deptGroups = departments.map(dept => ({
    dept,
    staffMembers: staffList.filter(s => s.primaryDeptId === dept.id && s.isActive && filterStaff(s)),
    // 人数表示用: 正社員・パートのみカウント（フィルターに関係なく常に計算）
    regularStaff: staffList.filter(s => s.primaryDeptId === dept.id && s.isActive && s.staffType !== 'arbeit'),
  })).filter(g => g.staffMembers.length > 0)

  // アルバイト全体（全部署合計）
  const allArbeit = staffList.filter(s => s.isActive && s.staffType === 'arbeit')

  const getStatus = (staffId: string, dateStr: string, isBusinessDay: boolean): ShiftStatus => {
    const e = entryMap.get(`${staffId}::${dateStr}`)
    return e?.status ?? (isBusinessDay ? 'work' : 'closed')
  }

  const isWork = (staffId: string, dateStr: string) => {
    const e = entryMap.get(`${staffId}::${dateStr}`)
    return !e || e.status === 'work'
  }

  return (
    <div>
      {/* ─── 表示切り替えフィルター ─── */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border-b border-gray-100 sticky top-[88px] z-20">
        <span className="text-[11px] text-gray-400 mr-1">表示:</span>
        {(
          [
            { id: 'all',     label: '全員' },
            { id: 'regular', label: '社員・パート' },
            { id: 'arbeit',  label: 'アルバイト' },
          ] as const
        ).map(opt => (
          <button
            key={opt.id}
            onClick={() => setViewFilter(opt.id)}
            className={clsx(
              'text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors',
              viewFilter === opt.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ─── シフト表 ─── */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs" style={{ minWidth: `${72 + days.length * 36}px` }}>
          {/* 日付ヘッダ */}
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-gray-100 border border-gray-200 px-2 py-1 text-left min-w-[72px] text-xs font-semibold text-gray-600">
                スタッフ
              </th>
              {days.map(day => (
                <th
                  key={day.dateStr}
                  className={clsx(
                    'border border-gray-200 text-center px-0 py-1 min-w-[34px] w-9',
                    day.weekday === 0 ? 'bg-red-50 text-red-600' :
                    day.weekday === 6 ? 'bg-blue-50 text-blue-600' :
                    day.isHoliday    ? 'bg-red-50 text-red-500' :
                    'bg-gray-50 text-gray-600',
                    !day.isBusinessDay && 'opacity-50',
                  )}
                >
                  <div className="font-bold leading-tight">{day.date.getDate()}</div>
                  <div className="text-[10px] leading-tight">{WEEKDAY_SHORT[day.weekday]}</div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {deptGroups.map(({ dept, staffMembers, regularStaff }) => (
              <Fragment key={dept.id}>
                {/* ─── 部署区切り行（人数表示付き）─── */}
                <tr>
                  <td className={clsx(
                    'sticky left-0 z-10 px-2 py-0.5 text-[11px] font-bold border-y border-gray-200',
                    (DEPT_COLOR[dept.id] ?? DEPT_COLOR_DEFAULT).row,
                  )}>
                    ▍{dept.name}
                  </td>
                  {days.map(day => {
                    if (!day.isBusinessDay) {
                      return (
                        <td key={day.dateStr} className={clsx(
                          'border border-gray-200 opacity-30',
                          (DEPT_COLOR[dept.id] ?? DEPT_COLOR_DEFAULT).count,
                        )} />
                      )
                    }
                    const workCount = regularStaff.filter(s => isWork(s.id, day.dateStr)).length
                    const total = regularStaff.length
                    const isLow = workCount < Math.ceil(total * 0.5)
                    return (
                      <td key={day.dateStr} className={clsx(
                        'text-center text-[10px] font-bold border border-gray-200 py-0.5',
                        isLow ? 'text-red-600 bg-red-50' : (DEPT_COLOR[dept.id] ?? DEPT_COLOR_DEFAULT).count,
                      )}>
                        {workCount}
                      </td>
                    )
                  })}
                </tr>

                {/* ─── スタッフ行 ─── */}
                {staffMembers.map(staff => (
                  <tr key={staff.id} className="hover:bg-yellow-50/30">
                    <td className="sticky left-0 z-10 bg-white border border-gray-200 px-2 py-0.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span className={clsx(
                          'text-[9px] px-1 py-0 rounded font-bold',
                          staff.staffType === 'employee' ? 'bg-blue-100 text-blue-700' :
                          staff.staffType === 'part'     ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-600',
                        )}>
                          {STAFF_TYPE_LABEL[staff.staffType]}
                        </span>
                        <span className="font-medium text-gray-800">{staff.name}</span>
                      </div>
                    </td>
                    {days.map(day => {
                      const key = `${staff.id}::${day.dateStr}`
                      const entry = entryMap.get(key)
                      const status = getStatus(staff.id, day.dateStr, day.isBusinessDay)
                      return (
                        <td key={day.dateStr} className="border border-gray-100 p-0.5">
                          <ShiftCell
                            staffId={staff.id}
                            date={day.dateStr}
                            status={status}
                            isLocked={entry?.isLocked ?? false}
                            isClosed={!day.isBusinessDay}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}

            {/* ─── アルバイト合計行（全員 or アルバイト表示時） ─── */}
            {viewFilter !== 'regular' && allArbeit.length > 0 && (
              <tr>
                <td className="sticky left-0 z-10 px-2 py-0.5 text-[11px] font-bold border-y border-gray-200 bg-amber-100 text-amber-800">
                  ▍バイト計
                </td>
                {days.map(day => {
                  if (!day.isBusinessDay) {
                    return <td key={day.dateStr} className="border border-gray-200 bg-amber-50 opacity-30" />
                  }
                  const count = allArbeit.filter(s => isWork(s.id, day.dateStr)).length
                  return (
                    <td key={day.dateStr} className={clsx(
                      'text-center text-[10px] font-bold border border-gray-200 py-0.5',
                      'bg-amber-50 text-amber-700',
                    )}>
                      {count}
                    </td>
                  )
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
