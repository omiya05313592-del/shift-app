import { useMemo, Fragment, useState } from 'react'
import { Lock } from 'lucide-react'
import { useShiftStore } from '../../store/shiftStore'
import { buildMonthDays } from '../../utils/calendar'
import { getRequiredCount } from '../../utils/shiftGenerator'
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
    currentShift, exceptions, leaveRequests, requiredConfigs, arbeitMaxPerDay,
    zoom, lockStaffMonth,
  } = useShiftStore()

  const [viewFilter, setViewFilter] = useState<ViewFilter>('all')

  const days = useMemo(
    () => buildMonthDays(viewYear, viewMonth, exceptions),
    [viewYear, viewMonth, exceptions],
  )

  // フックはすべて早期リターンより前で呼ぶ（フックルール順守）
  const entryMap = useMemo(() => {
    const m = new Map<string, { status: ShiftStatus; isLocked: boolean }>()
    for (const e of currentShift?.entries ?? []) {
      m.set(`${e.staffId}::${e.date}`, { status: e.status, isLocked: e.isLocked })
    }
    return m
  }, [currentShift?.entries])

  // 承認済み希望休のキーセット（申請由来の休みを色分けするため）
  const requestedKeys = useMemo(() => {
    const s = new Set<string>()
    for (const r of leaveRequests) {
      if (r.status === 'approved') s.add(`${r.staffId}::${r.date}`)
    }
    return s
  }, [leaveRequests])

  if (!currentShift) return null

  // 部署ごとにスタッフをグループ化（社員・パートのみ。アルバイトは別カテゴリ）
  const deptGroups = departments.map(dept => {
    const members = staffList.filter(s => s.primaryDeptId === dept.id && s.isActive && s.staffType !== 'arbeit')
    return { dept, staffMembers: members, regularStaff: members }
  }).filter(g => g.staffMembers.length > 0)

  // アルバイト全体（部署に関係なく independent なカテゴリとして表示）
  const allArbeit = staffList.filter(s => s.isActive && s.staffType === 'arbeit')

  // 全アクティブスタッフ（総計行に使用）
  const allActive = staffList.filter(s => s.isActive)

  // 表示フィルター
  const showRegular = viewFilter !== 'arbeit'
  const showArbeit  = viewFilter !== 'regular'

  const getStatus = (staffId: string, dateStr: string, isBusinessDay: boolean): ShiftStatus => {
    const e = entryMap.get(`${staffId}::${dateStr}`)
    return e?.status ?? (isBusinessDay ? 'work' : 'closed')
  }

  const isWork = (staffId: string, dateStr: string) => {
    const e = entryMap.get(`${staffId}::${dateStr}`)
    return !e || e.status === 'work'
  }

  // その従業員の当月（営業日・定休/在籍外を除く）が全てロック済みか
  const isRowLocked = (staffId: string) => {
    const targets = days
      .filter(d => d.isBusinessDay)
      .map(d => entryMap.get(`${staffId}::${d.dateStr}`))
      .filter((e): e is { status: ShiftStatus; isLocked: boolean } =>
        !!e && e.status !== 'closed' && e.status !== 'absent')
    return targets.length > 0 && targets.every(e => e.isLocked)
  }

  // 日付ヘッダのセル群（theadとアルバイト欄上の再掲で共用）
  const renderDayCells = () => days.map(day => (
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
  ))

  // スタッフ名セル（行ロックボタン付き）
  const renderNameCell = (staff: typeof staffList[0]) => {
    const rowLocked = isRowLocked(staff.id)
    return (
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
          <button
            onClick={() => lockStaffMonth(staff.id)}
            title={rowLocked ? 'この人の月間ロックを解除' : 'この人を今月まるごとロック'}
            className={clsx(
              'ml-auto p-0.5 rounded transition-colors',
              rowLocked ? 'text-amber-500 bg-amber-50' : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50',
            )}
          >
            <Lock size={11} />
          </button>
        </div>
      </td>
    )
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

      {/* ─── シフト表（ズーム適用）─── */}
      <div className="overflow-x-auto" style={{ zoom }}>
        <table className="border-collapse text-xs" style={{ minWidth: `${72 + days.length * 36}px` }}>
          {/* 日付ヘッダ */}
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-gray-100 border border-gray-200 px-2 py-1 text-left min-w-[72px] text-xs font-semibold text-gray-600">
                スタッフ
              </th>
              {renderDayCells()}
            </tr>
          </thead>

          <tbody>
            {showRegular && deptGroups.map(({ dept, staffMembers, regularStaff }) => (
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
                    // 必要人数（設定があれば）と比較して3段階に色分け
                    const req = getRequiredCount(dept.id, day.dateStr, day.weekday, requiredConfigs)
                    const hasReq = req.preferred > 0 || req.min > 0
                    let cellColor = (DEPT_COLOR[dept.id] ?? DEPT_COLOR_DEFAULT).count
                    let title = ''
                    if (hasReq) {
                      title = `必要 最低${req.min}・理想${req.preferred}／出勤${workCount}`
                      if (workCount < req.min) {
                        cellColor = 'text-red-700 bg-red-100'        // 最低未達（深刻）
                      } else if (workCount < req.preferred) {
                        cellColor = 'text-amber-700 bg-amber-100'     // 理想未達（注意）
                      }
                    }
                    return (
                      <td
                        key={day.dateStr}
                        title={title}
                        className={clsx(
                          'text-center text-[10px] font-bold border border-gray-200 py-0.5',
                          cellColor,
                        )}
                      >
                        {workCount}
                      </td>
                    )
                  })}
                </tr>

                {/* ─── スタッフ行 ─── */}
                {staffMembers.map(staff => (
                  <tr key={staff.id} className="hover:bg-yellow-50/30">
                    {renderNameCell(staff)}
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
                            isRequested={requestedKeys.has(`${staff.id}::${day.dateStr}`)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}

            {/* ─── アルバイト カテゴリ（独立セクション）─── */}
            {showArbeit && allArbeit.length > 0 && (
              <Fragment>
                {/* 日付ヘッダ再掲（アルバイト欄の視認性向上）*/}
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-100 border border-gray-200 px-2 py-1 text-left min-w-[72px] text-[11px] font-semibold text-gray-500">
                    日付
                  </th>
                  {renderDayCells()}
                </tr>
                {/* 区切り行（人数表示付き。他部署と統一）*/}
                <tr>
                  <td className="sticky left-0 z-10 px-2 py-0.5 text-[11px] font-bold border-y border-gray-200 bg-amber-100 text-amber-800">
                    ▍アルバイト
                  </td>
                  {days.map(day => {
                    if (!day.isBusinessDay) {
                      return <td key={day.dateStr} className="border border-gray-200 bg-amber-50 opacity-30" />
                    }
                    const count = allArbeit.filter(s => isWork(s.id, day.dateStr)).length
                    // 上限（arbeitMaxPerDay）超過は注意色
                    const over = count > arbeitMaxPerDay
                    return (
                      <td
                        key={day.dateStr}
                        title={`上限${arbeitMaxPerDay}／出勤${count}`}
                        className={clsx(
                          'text-center text-[10px] font-bold border border-gray-200 py-0.5',
                          over ? 'text-red-700 bg-red-100' : 'bg-amber-50 text-amber-700',
                        )}
                      >
                        {count}
                      </td>
                    )
                  })}
                </tr>
                {/* アルバイト各人の行 */}
                {allArbeit.map(staff => (
                  <tr key={staff.id} className="hover:bg-yellow-50/30">
                    {renderNameCell(staff)}
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
                            isRequested={requestedKeys.has(`${staff.id}::${day.dateStr}`)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            )}

            {/* ─── 総計行（その日の全出勤者数）─── */}
            <tr>
              <td className="sticky left-0 z-10 px-2 py-0.5 text-[11px] font-bold border-y border-gray-300 bg-slate-200 text-slate-700">
                ▍総計
              </td>
              {days.map(day => {
                if (!day.isBusinessDay) {
                  return <td key={day.dateStr} className="border border-gray-200 bg-slate-50 opacity-30" />
                }
                const total = allActive.filter(s => isWork(s.id, day.dateStr)).length
                return (
                  <td key={day.dateStr} className={clsx(
                    'text-center text-[10px] font-bold border border-gray-300 py-0.5',
                    'bg-slate-100 text-slate-700',
                  )}>
                    {total}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
