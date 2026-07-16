import { useState } from 'react'
import {
  Users, Building2, Settings2, CalendarClock, Calendar,
  Plus, Trash2, ChevronLeft, ChevronRight, CheckCircle2, Circle,
} from 'lucide-react'
import { useShiftStore } from '../store/shiftStore'
import {
  WORK_STATUS_LABEL, EXCLUDED_WORK_STATUSES,
} from '../types'
import type { RuleType, StaffRule, BusinessDayException, WorkStatus } from '../types'
import clsx from 'clsx'

// ─────────────────────────────────────
// 定数
// ─────────────────────────────────────
const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

const STAFF_TYPE_LABEL: Record<string, string> = {
  employee: '社', part: 'パ', arbeit: 'ア',
}
const STAFF_TYPE_COLOR: Record<string, string> = {
  employee: 'bg-blue-100 text-blue-700',
  part:     'bg-green-100 text-green-700',
  arbeit:   'bg-gray-100 text-gray-600',
}

// Phase 1.5 で追加できるルールタイプ
const PHASE1_RULE_TYPES: {
  value: RuleType; label: string; desc: string
}[] = [
  { value: 'fixed_off_weekday', label: '曜日固定休',   desc: '指定した曜日を必ず休みにする' },
  { value: 'fixed_off_holiday', label: '祝日固定休',   desc: '祝日を必ず休みにする' },
  { value: 'fixed_off_date',    label: '日付固定休',   desc: '特定の日付を必ず休みにする' },
  { value: 'fixed_work_date',   label: '日付固定出勤', desc: '特定の日付を必ず出勤にする' },
]

const PHASE2_RULE_TYPES: RuleType[] = [
  'prefer_off_weekday', 'prefer_work_weekday',
  'monthly_weekday_off', 'consecutive_off_days', 'require_consecutive_off',
]

// ─────────────────────────────────────
// ルール説明テキスト
// ─────────────────────────────────────
function describeRule(rule: StaffRule): string {
  switch (rule.ruleType) {
    case 'fixed_off_weekday': {
      const days = (rule.ruleValue.weekdays as number[] ?? []).map(w => WEEKDAY_NAMES[w]).join('・')
      return `${days}曜 固定休`
    }
    case 'fixed_off_holiday': return '祝日 固定休'
    case 'fixed_off_date':    return `${rule.ruleValue.date ?? ''} 固定休`
    case 'fixed_work_date':   return `${rule.ruleValue.date ?? ''} 固定出勤`
    case 'prefer_off_weekday': {
      const days = (rule.ruleValue.weekdays as number[] ?? []).map(w => WEEKDAY_NAMES[w]).join('・')
      return `${days}曜 休み優先`
    }
    case 'monthly_weekday_off':
      return `月1回 ${WEEKDAY_NAMES[rule.ruleValue.weekday as number ?? 0]}曜 休み`
    case 'consecutive_off_days': {
      const days = (rule.ruleValue.weekdays as number[] ?? []).map(w => WEEKDAY_NAMES[w]).join('・')
      return `連休は ${days}曜ペア`
    }
    case 'require_consecutive_off': return '月2回 連休必須'
    default: return rule.ruleType
  }
}

// ─────────────────────────────────────
// スタッフタブ
// ─────────────────────────────────────
function StaffTab() {
  const {
    staffList, departments, statusPeriods, updateStaff,
    addStatusPeriod, removeStatusPeriod, addStaff, removeStaff,
    arbeitMaxPerDay, setArbeitMaxPerDay,
    arbeitAvailabilities, setArbeitAvailability, clearArbeitAvailability,
    viewYear, viewMonth,
  } = useShiftStore()
  const today = new Date().toISOString().slice(0, 10)

  const regularStaff = staffList.filter(s => s.staffType !== 'arbeit')
  const arbeitStaff = staffList.filter(s => s.staffType === 'arbeit' && s.isActive)
  const [selectedStaffId, setSelectedStaffId] = useState(regularStaff[0]?.id ?? '')
  const [addingStatus, setAddingStatus] = useState(false)
  const [newStatus, setNewStatus] = useState<WorkStatus>('leave')
  const [newStartDate, setNewStartDate] = useState(today)
  const [newEndDate, setNewEndDate] = useState('')
  const [newReason, setNewReason] = useState('')

  // ─── 削除確認 ───
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ─── 出勤可能日管理 ───
  const [availStaffId, setAvailStaffId] = useState(arbeitStaff[0]?.id ?? '')
  const currentAvail = arbeitAvailabilities.find(
    a => a.staffId === availStaffId && a.year === viewYear && a.month === viewMonth
  )
  // 編集中の選択日付セット（null = まだ編集開始していない → currentAvail から初期化）
  const [editingDates, setEditingDates] = useState<Set<string> | null>(null)
  const activeDates = editingDates ?? new Set(currentAvail?.availableDates ?? [])

  // 月のカレンダー（日曜始まり）を簡易生成
  const calDays = (() => {
    const days: { dateStr: string; weekday: number; isWeekend: boolean }[] = []
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(viewYear, viewMonth - 1, d)
      const wd = dt.getDay()
      days.push({
        dateStr: `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        weekday: wd,
        isWeekend: wd === 0 || wd === 6,
      })
    }
    return days
  })()

  const toggleDate = (dateStr: string) => {
    const next = new Set(activeDates)
    if (next.has(dateStr)) next.delete(dateStr)
    else next.add(dateStr)
    setEditingDates(next)
  }

  const saveAvailability = () => {
    if (!availStaffId) return
    setArbeitAvailability(availStaffId, viewYear, viewMonth, [...activeDates])
    setEditingDates(null)
  }

  const clearAvailability = () => {
    if (!availStaffId) return
    clearArbeitAvailability(availStaffId, viewYear, viewMonth)
    setEditingDates(null)
  }

  // ─── スタッフ追加フォーム状態 ───
  const [addingStaff, setAddingStaff] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStaffType, setNewStaffType] = useState<'employee' | 'part' | 'arbeit'>('part')
  const [newDeptId, setNewDeptId] = useState(departments[0]?.id ?? '')
  const [newMonthlyOff, setNewMonthlyOff] = useState(9)
  const [newMaxWork, setNewMaxWork] = useState(6)

  const handleAddStaff = () => {
    if (!newName.trim() || !newDeptId) return
    addStaff({
      name: newName.trim(),
      staffType: newStaffType,
      primaryDeptId: newDeptId,
      monthlyOffDays: newStaffType === 'arbeit' ? 0 : newMonthlyOff,
      maxConsecutiveWork: newMaxWork,
      requireConsecutiveOff: newStaffType !== 'arbeit',
      isActive: true,
    })
    setAddingStaff(false)
    setNewName('')
    setNewStaffType('part')
    setNewDeptId(departments[0]?.id ?? '')
    setNewMonthlyOff(9)
    setNewMaxWork(6)
  }

  const selectedPeriods = statusPeriods.filter(p => p.staffId === selectedStaffId)

  const handleAddStatus = () => {
    if (!newStartDate || !selectedStaffId) return
    addStatusPeriod({
      staffId: selectedStaffId,
      status: newStatus,
      startDate: newStartDate,
      endDate: newEndDate || undefined,
      reason: newReason || undefined,
    })
    setAddingStatus(false)
    setNewStatus('leave')
    setNewStartDate(today)
    setNewEndDate('')
    setNewReason('')
  }

  return (
    <div className="space-y-4">
      {/* ─── スタッフ追加 ─── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-bold text-gray-600">スタッフ追加</span>
          {!addingStaff && (
            <button
              onClick={() => setAddingStaff(true)}
              className="flex items-center gap-1 text-blue-600 text-xs font-medium px-2 py-1 rounded-lg hover:bg-blue-50"
            >
              <Plus size={13} /> 新規追加
            </button>
          )}
        </div>
        {addingStaff ? (
          <div className="p-3 space-y-2.5 bg-white">
            <div>
              <div className="text-xs text-gray-400 mb-1">名前</div>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="例：さくら"
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">雇用形態</div>
              <div className="flex gap-2">
                {(['employee', 'part', 'arbeit'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      setNewStaffType(t)
                      setNewMonthlyOff(t === 'arbeit' ? 0 : 9)
                      setNewMaxWork(t === 'arbeit' ? 99 : 6)
                    }}
                    className={clsx(
                      'px-3 py-1 rounded-full text-xs font-bold border transition-colors',
                      newStaffType === t
                        ? STAFF_TYPE_COLOR[t] + ' border-transparent'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300',
                    )}
                  >
                    {{ employee: '社員', part: 'パート', arbeit: 'アルバイト' }[t]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">所属部署</div>
              <select
                value={newDeptId}
                onChange={e => setNewDeptId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            {newStaffType !== 'arbeit' && (
              <div className="flex gap-4">
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  月公休:
                  <input
                    type="number" min={0} max={20}
                    value={newMonthlyOff}
                    onChange={e => setNewMonthlyOff(Number(e.target.value))}
                    className="w-12 border border-gray-200 rounded px-1 py-0.5 text-center text-xs"
                  />
                  日
                </label>
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  最大連勤:
                  <input
                    type="number" min={1} max={14}
                    value={newMaxWork}
                    onChange={e => setNewMaxWork(Number(e.target.value))}
                    className="w-12 border border-gray-200 rounded px-1 py-0.5 text-center text-xs"
                  />
                  日
                </label>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAddStaff}
                disabled={!newName.trim()}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-40"
              >
                追加
              </button>
              <button
                onClick={() => setAddingStaff(false)}
                className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold"
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <div className="px-3 py-2 text-xs text-gray-400">
            {staffList.length}名 登録中
          </div>
        )}
      </div>

      {/* ─── アルバイト設定 ─── */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="text-xs font-bold text-gray-600 mb-2">アルバイト設定</div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          1日の最大出勤人数（monthlyOffDays=0 のバイト対象）:
          <input
            type="number" min={1} max={20}
            value={arbeitMaxPerDay}
            onChange={e => setArbeitMaxPerDay(Number(e.target.value))}
            className="w-12 border border-gray-200 rounded px-1 py-0.5 text-center text-xs"
          />
          人
        </label>
      </div>

      {/* 基本設定 */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500">有効/無効・月休み日数・最大連勤を変更できます。</p>
        {departments.map(dept => {
          const deptStaff = staffList.filter(s => s.primaryDeptId === dept.id)
          if (deptStaff.length === 0) return null
          return (
            <div key={dept.id}>
              <div className="text-xs font-bold text-gray-500 px-1 py-1 mt-3">{dept.name}</div>
              <div className="space-y-2">
                {deptStaff.map(staff => {
                  const activePeriod = statusPeriods.find(
                    p => p.staffId === staff.id && p.startDate <= today && (!p.endDate || p.endDate >= today)
                  )
                  const isExcluded = activePeriod && EXCLUDED_WORK_STATUSES.includes(activePeriod.status)
                  return (
                    <div
                      key={staff.id}
                      className={clsx(
                        'rounded-xl border p-3',
                        isExcluded ? 'border-amber-300 bg-amber-50' : 'bg-white border-gray-200',
                      )}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-bold', STAFF_TYPE_COLOR[staff.staffType])}>
                          {STAFF_TYPE_LABEL[staff.staffType]}
                        </span>
                        <span className="font-semibold text-sm text-gray-800">{staff.name}</span>
                        {/* 常にレンダリング → DOM 安定（removeChild エラー防止） */}
                        <span className={clsx(
                          'text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                          activePeriod
                            ? (isExcluded ? 'bg-amber-200 text-amber-800' : 'bg-blue-100 text-blue-700')
                            : 'hidden',
                        )}>
                          {activePeriod
                            ? `${WORK_STATUS_LABEL[activePeriod.status]}${activePeriod.reason ? `（${activePeriod.reason}）` : ''}`
                            : '　'}
                        </span>
                        <div className="flex items-center gap-2 ml-auto">
                          <label className="flex items-center gap-1 text-xs text-gray-500">
                            <input
                              type="checkbox"
                              checked={staff.isActive}
                              onChange={e => updateStaff(staff.id, { isActive: e.target.checked })}
                              className="rounded"
                            />
                            有効
                          </label>
                          {confirmDeleteId === staff.id ? (
                            <span className="flex items-center gap-1">
                              <button
                                onClick={() => { removeStaff(staff.id); setConfirmDeleteId(null) }}
                                className="text-[10px] px-2 py-0.5 bg-red-500 text-white rounded font-bold"
                              >
                                削除確定
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-bold"
                              >
                                ×
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(staff.id)}
                              className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
                        <label className="flex items-center gap-1">
                          月休み:
                          <input
                            type="number" min={0} max={20}
                            value={staff.monthlyOffDays}
                            onChange={e => updateStaff(staff.id, { monthlyOffDays: Number(e.target.value) })}
                            className="w-10 border border-gray-200 rounded px-1 py-0.5 text-center text-xs"
                          />
                          日
                        </label>
                        <label className="flex items-center gap-1">
                          最大連勤:
                          <input
                            type="number" min={1} max={14}
                            value={staff.maxConsecutiveWork}
                            onChange={e => updateStaff(staff.id, { maxConsecutiveWork: Number(e.target.value) })}
                            className="w-10 border border-gray-200 rounded px-1 py-0.5 text-center text-xs"
                          />
                          日
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── バイト出勤可能日 ─── */}
      {arbeitStaff.length > 0 && (
        <div className="border-t border-gray-200 pt-4 space-y-3">
          <div className="text-xs font-bold text-gray-600">
            バイト出勤可能日（{viewYear}/{viewMonth}月）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {arbeitStaff.map(s => (
              <button
                key={s.id}
                onClick={() => { setAvailStaffId(s.id); setEditingDates(null) }}
                className={clsx(
                  'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                  availStaffId === s.id
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300',
                )}
              >
                {s.name}
              </button>
            ))}
          </div>

          {availStaffId && (
            <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
              {currentAvail && !editingDates && (
                <div className="text-[11px] text-amber-600 font-medium">
                  登録済み: {currentAvail.availableDates.length}日
                </div>
              )}
              {!currentAvail && !editingDates && (
                <div className="text-[11px] text-gray-400">
                  出勤可能日未登録（全日出勤可能として扱います）
                </div>
              )}

              {/* カレンダーグリッド */}
              <div>
                <div className="grid grid-cols-7 gap-0.5 mb-1">
                  {['日','月','火','水','木','金','土'].map(d => (
                    <div key={d} className={clsx(
                      'text-center text-[10px] font-bold py-0.5',
                      d === '日' ? 'text-red-400' : d === '土' ? 'text-blue-400' : 'text-gray-400',
                    )}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {/* 月初の空白 */}
                  {Array.from({ length: calDays[0]?.weekday ?? 0 }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  {calDays.map(({ dateStr, isWeekend }) => {
                    const isSelected = activeDates.has(dateStr)
                    const day = Number(dateStr.slice(8))
                    return (
                      <button
                        key={dateStr}
                        onClick={() => toggleDate(dateStr)}
                        className={clsx(
                          'rounded text-[11px] font-bold py-1 transition-colors',
                          isSelected
                            ? 'bg-amber-400 text-white'
                            : isWeekend
                              ? 'bg-gray-50 text-gray-300'
                              : 'bg-gray-100 text-gray-400 hover:bg-amber-100',
                        )}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveAvailability}
                  disabled={activeDates.size === 0}
                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold disabled:opacity-40"
                >
                  <CheckCircle2 size={12} /> 保存
                </button>
                {currentAvail && (
                  <button
                    onClick={clearAvailability}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold"
                  >
                    <Circle size={12} /> 登録解除
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 勤務状態管理 */}
      <div className="border-t border-gray-200 pt-4 space-y-3">
        <div className="text-xs font-bold text-gray-600">勤務状態管理（休職・退職予定など）</div>

        {/* スタッフ選択 */}
        <div className="flex flex-wrap gap-1.5">
          {regularStaff.map(s => (
            <button
              key={s.id}
              onClick={() => { setSelectedStaffId(s.id); setAddingStatus(false) }}
              className={clsx(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                selectedStaffId === s.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* 期間一覧 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {selectedPeriods.length === 0 && (
            <div className="px-3 py-4 text-xs text-gray-400 text-center">勤務状態設定なし</div>
          )}
          {selectedPeriods.map(period => (
            <div key={period.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0">
              <span className={clsx(
                'text-xs px-2 py-0.5 rounded-full font-bold shrink-0',
                EXCLUDED_WORK_STATUSES.includes(period.status)
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-blue-100 text-blue-700',
              )}>
                {WORK_STATUS_LABEL[period.status]}
              </span>
              <span className="text-xs text-gray-600 flex-1 min-w-0 truncate">
                {period.startDate}〜{period.endDate ?? '（終了日未定）'}
                {period.reason ? ` ／ ${period.reason}` : ''}
              </span>
              <button
                onClick={() => removeStatusPeriod(period.id)}
                className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* 追加フォーム */}
        {!addingStatus ? (
          <button
            onClick={() => setAddingStatus(true)}
            disabled={!selectedStaffId}
            className="flex items-center gap-1.5 text-blue-600 text-sm font-medium px-2 py-1 rounded-lg hover:bg-blue-50 disabled:opacity-40"
          >
            <Plus size={14} /> 勤務状態を追加
          </button>
        ) : (
          <div className="bg-white rounded-xl border border-blue-200 p-3 space-y-2">
            <div className="text-xs font-bold text-gray-700">勤務状態を追加</div>
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value as WorkStatus)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="leave">休職中</option>
              <option value="retiring">退職予定（在籍中）</option>
              <option value="resigned">退職済</option>
            </select>
            <div>
              <div className="text-xs text-gray-400 mb-1">開始日</div>
              <input
                type="date"
                value={newStartDate}
                onChange={e => setNewStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">終了日（省略可）</div>
              <input
                type="date"
                value={newEndDate}
                onChange={e => setNewEndDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">理由（省略可）</div>
              <input
                type="text"
                value={newReason}
                onChange={e => setNewReason(e.target.value)}
                placeholder="例：育児休業"
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAddStatus}
                disabled={!newStartDate}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-40"
              >
                追加
              </button>
              <button
                onClick={() => setAddingStatus(false)}
                className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// 部署タブ
// ─────────────────────────────────────
function DeptTab() {
  const { staffList, departments } = useShiftStore()
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">部署情報を確認できます。編集はPhase 3で対応予定です。</p>
      {departments.map(dept => (
        <div key={dept.id} className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="font-semibold text-sm text-gray-800">{dept.name}</div>
          <div className="text-xs text-gray-500 mt-1">
            兼任可能: {dept.canDualWithIds.length > 0
              ? dept.canDualWithIds.map(id => departments.find(d => d.id === id)?.name).join(', ')
              : 'なし'}
          </div>
          <div className="text-xs text-gray-500">
            スタッフ: {staffList.filter(s => s.primaryDeptId === dept.id).length}名
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────
// 必要人数タブ
// ─────────────────────────────────────
function RequiredTab() {
  const {
    departments, requiredConfigs,
    addRequiredConfig, updateRequiredConfig, removeRequiredConfig,
  } = useShiftStore()

  const [activeDeptId, setActiveDeptId] = useState(departments[0]?.id ?? '')
  const [addingWd, setAddingWd] = useState<number | null>(null)
  const [addMin, setAddMin] = useState(1)
  const [addPref, setAddPref] = useState(2)

  const deptCfgs = requiredConfigs.filter(
    c => c.deptId === activeDeptId && c.configType === 'weekday',
  )

  const handleAdd = () => {
    if (addingWd === null) return
    addRequiredConfig({
      deptId: activeDeptId,
      configType: 'weekday',
      weekday: addingWd,
      minCount: addMin,
      preferredCount: addPref,
    })
    setAddingWd(null)
    setAddMin(1)
    setAddPref(2)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">業務日ごとの最低・推奨人数を設定します。</p>

      {/* 部署選択 */}
      <div className="flex gap-2 flex-wrap">
        {departments.map(d => (
          <button
            key={d.id}
            onClick={() => { setActiveDeptId(d.id); setAddingWd(null) }}
            className={clsx(
              'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
              activeDeptId === d.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300',
            )}
          >
            {d.name}
          </button>
        ))}
      </div>

      {/* 設定一覧 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {deptCfgs.length === 0 && (
          <div className="px-3 py-4 text-xs text-gray-400 text-center">設定なし</div>
        )}
        {[0, 1, 2, 3, 4, 5, 6].map(wd => {
          const cfg = deptCfgs.find(c => c.weekday === wd)
          if (!cfg) return null
          return (
            <div key={wd} className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0">
              <span className={clsx(
                'w-7 text-center text-sm font-bold shrink-0',
                wd === 0 ? 'text-red-500' : wd === 6 ? 'text-blue-500' : 'text-gray-700',
              )}>
                {WEEKDAY_NAMES[wd]}
              </span>
              <span className="text-xs text-gray-400 shrink-0">最低</span>
              <input
                type="number" min={0} max={20}
                value={cfg.minCount}
                onChange={e => updateRequiredConfig(cfg.id, { minCount: Number(e.target.value) })}
                className="w-10 border border-gray-200 rounded px-1 py-0.5 text-center text-sm"
              />
              <span className="text-xs text-gray-400 shrink-0">推奨</span>
              <input
                type="number" min={0} max={20}
                value={cfg.preferredCount}
                onChange={e => updateRequiredConfig(cfg.id, { preferredCount: Number(e.target.value) })}
                className="w-10 border border-gray-200 rounded px-1 py-0.5 text-center text-sm"
              />
              <button
                onClick={() => removeRequiredConfig(cfg.id)}
                className="ml-auto p-1.5 text-red-400 hover:bg-red-50 rounded-lg"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>

      {/* 追加フォーム */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
        <div className="text-xs font-bold text-gray-600">曜日設定を追加</div>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_NAMES.map((name, wd) => {
            const alreadySet = deptCfgs.some(c => c.weekday === wd)
            return (
              <button
                key={wd}
                disabled={alreadySet}
                onClick={() => setAddingWd(addingWd === wd ? null : wd)}
                className={clsx(
                  'h-8 rounded text-xs font-bold transition-colors',
                  alreadySet
                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : addingWd === wd
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                )}
              >
                {name}
              </button>
            )
          })}
        </div>

        {addingWd !== null && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-sm font-bold text-gray-700 w-7 text-center">
              {WEEKDAY_NAMES[addingWd]}
            </span>
            <span className="text-xs text-gray-400">最低</span>
            <input
              type="number" min={0} max={20}
              value={addMin}
              onChange={e => setAddMin(Number(e.target.value))}
              className="w-10 border border-gray-200 rounded px-1 py-0.5 text-center text-sm"
            />
            <span className="text-xs text-gray-400">推奨</span>
            <input
              type="number" min={0} max={20}
              value={addPref}
              onChange={e => setAddPref(Number(e.target.value))}
              className="w-10 border border-gray-200 rounded px-1 py-0.5 text-center text-sm"
            />
            <button
              onClick={handleAdd}
              className="ml-auto px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold"
            >
              追加
            </button>
          </div>
        )}
        {addingWd === null && (
          <p className="text-xs text-gray-400">曜日をタップして選択</p>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
        日ごと・期間指定の必要人数はPhase 3で対応予定です。
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// ルールタブ
// ─────────────────────────────────────
function RulesTab() {
  const {
    staffList, staffRules, pairConstraints,
    addStaffRule, updateStaffRule, removeStaffRule,
    addPairConstraint, removePairConstraint,
  } = useShiftStore()

  const regularStaff = staffList.filter(s => s.staffType !== 'arbeit' && s.isActive)

  const [subTab, setSubTab] = useState<'staff' | 'pairs'>('staff')
  const [selectedStaffId, setSelectedStaffId] = useState(regularStaff[0]?.id ?? '')

  // ルール追加フォームの状態
  const [addingRule, setAddingRule] = useState(false)
  const [newRuleType, setNewRuleType] = useState<RuleType>('fixed_off_weekday')
  const [newWeekdays, setNewWeekdays] = useState<number[]>([])
  const [newDate, setNewDate] = useState('')

  // ペア追加フォームの状態
  const [addingPair, setAddingPair] = useState(false)
  const [pairStaff1, setPairStaff1] = useState('')
  const [pairStaff2, setPairStaff2] = useState('')

  const selectedRules = staffRules.filter(r => r.staffId === selectedStaffId)

  const resetRuleForm = () => {
    setAddingRule(false)
    setNewRuleType('fixed_off_weekday')
    setNewWeekdays([])
    setNewDate('')
  }

  const handleAddRule = () => {
    let ruleValue: Record<string, unknown> = {}
    if (newRuleType === 'fixed_off_weekday') {
      if (newWeekdays.length === 0) return
      ruleValue = { weekdays: [...newWeekdays].sort() }
    } else if (newRuleType === 'fixed_off_holiday') {
      ruleValue = {}
    } else if (newRuleType === 'fixed_off_date' || newRuleType === 'fixed_work_date') {
      if (!newDate) return
      ruleValue = { date: newDate }
    }
    addStaffRule({ staffId: selectedStaffId, ruleType: newRuleType, ruleValue, priority: 1, isActive: true })
    resetRuleForm()
  }

  const handleAddPair = () => {
    if (!pairStaff1 || !pairStaff2 || pairStaff1 === pairStaff2) return
    addPairConstraint({ staffId1: pairStaff1, staffId2: pairStaff2, constraintType: 'no_same_day_off' })
    setAddingPair(false)
    setPairStaff1('')
    setPairStaff2('')
  }

  return (
    <div className="space-y-3">
      {/* サブタブ */}
      <div className="flex border-b border-gray-200 -mx-3 px-3">
        {(['staff', 'pairs'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={clsx(
              'flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors',
              subTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400',
            )}
          >
            {t === 'staff' ? 'スタッフルール' : '同日休みNG'}
          </button>
        ))}
      </div>

      {/* ===== スタッフルール ===== */}
      {subTab === 'staff' && (
        <>
          {/* スタッフ選択 */}
          <div className="flex flex-wrap gap-1.5">
            {regularStaff.map(s => (
              <button
                key={s.id}
                onClick={() => { setSelectedStaffId(s.id); resetRuleForm() }}
                className={clsx(
                  'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                  selectedStaffId === s.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300',
                )}
              >
                {s.name}
              </button>
            ))}
          </div>

          {/* ルール一覧 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {selectedRules.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">ルールなし</div>
            )}
            {selectedRules.map(rule => {
              const isPhase2 = PHASE2_RULE_TYPES.includes(rule.ruleType)
              return (
                <div
                  key={rule.id}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0',
                    (!rule.isActive || isPhase2) && 'opacity-50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={rule.isActive}
                    onChange={e => updateStaffRule(rule.id, { isActive: e.target.checked })}
                    disabled={isPhase2}
                    className="rounded shrink-0"
                  />
                  <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">
                    {describeRule(rule)}
                  </span>
                  {isPhase2 && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">
                      Phase 2
                    </span>
                  )}
                  {!isPhase2 && (
                    <button
                      onClick={() => removeStaffRule(rule.id)}
                      className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* ルール追加 */}
          {!addingRule ? (
            <button
              onClick={() => setAddingRule(true)}
              disabled={!selectedStaffId}
              className="flex items-center gap-1.5 text-blue-600 text-sm font-medium px-2 py-1 rounded-lg hover:bg-blue-50 disabled:opacity-40"
            >
              <Plus size={14} /> ルールを追加
            </button>
          ) : (
            <div className="bg-white rounded-xl border border-blue-200 p-3 space-y-3">
              <div className="text-xs font-bold text-gray-700">新しいルールを追加</div>

              {/* ルールタイプ選択 */}
              <div className="space-y-1.5">
                {PHASE1_RULE_TYPES.map(rt => (
                  <label
                    key={rt.value}
                    className={clsx(
                      'flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors',
                      newRuleType === rt.value ? 'border-blue-300 bg-blue-50' : 'border-gray-200',
                    )}
                  >
                    <input
                      type="radio"
                      name="ruleType"
                      value={rt.value}
                      checked={newRuleType === rt.value}
                      onChange={() => { setNewRuleType(rt.value); setNewWeekdays([]); setNewDate('') }}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-800">{rt.label}</div>
                      <div className="text-xs text-gray-500">{rt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              {/* 曜日選択 */}
              {newRuleType === 'fixed_off_weekday' && (
                <div>
                  <div className="text-xs text-gray-500 mb-1.5">対象曜日（複数可）</div>
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAY_NAMES.map((name, wd) => (
                      <button
                        key={wd}
                        onClick={() => setNewWeekdays(prev =>
                          prev.includes(wd) ? prev.filter(w => w !== wd) : [...prev, wd]
                        )}
                        className={clsx(
                          'h-8 rounded text-xs font-bold transition-colors',
                          newWeekdays.includes(wd) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                        )}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {newRuleType === 'fixed_off_holiday' && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                  追加設定不要です。祝日を自動的に休みにします。
                </p>
              )}

              {(newRuleType === 'fixed_off_date' || newRuleType === 'fixed_work_date') && (
                <div>
                  <div className="text-xs text-gray-500 mb-1.5">対象日</div>
                  <input
                    type="date"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAddRule}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold"
                >
                  追加
                </button>
                <button
                  onClick={resetRuleForm}
                  className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== 同日休みNG ===== */}
      {subTab === 'pairs' && (
        <>
          <p className="text-xs text-gray-500">同じ日に休んではいけないペアを設定します。</p>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {pairConstraints.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">設定なし</div>
            )}
            {pairConstraints.map(pair => {
              const s1 = staffList.find(s => s.id === pair.staffId1)
              const s2 = staffList.find(s => s.id === pair.staffId2)
              return (
                <div key={pair.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0">
                  <span className="text-sm">🚫</span>
                  <span className="text-sm font-medium text-gray-800">{s1?.name}</span>
                  <span className="text-xs text-gray-400">と</span>
                  <span className="text-sm font-medium text-gray-800">{s2?.name}</span>
                  <button
                    onClick={() => removePairConstraint(pair.id)}
                    className="ml-auto p-1.5 text-red-400 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>

          {!addingPair ? (
            <button
              onClick={() => setAddingPair(true)}
              className="flex items-center gap-1.5 text-blue-600 text-sm font-medium px-2 py-1 rounded-lg hover:bg-blue-50"
            >
              <Plus size={14} /> ペアを追加
            </button>
          ) : (
            <div className="bg-white rounded-xl border border-blue-200 p-3 space-y-2">
              <div className="text-xs font-bold text-gray-700">同日休みNG ペアを追加</div>
              <select
                value={pairStaff1}
                onChange={e => setPairStaff1(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="">スタッフ1を選択</option>
                {regularStaff.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select
                value={pairStaff2}
                onChange={e => setPairStaff2(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="">スタッフ2を選択</option>
                {regularStaff.filter(s => s.id !== pairStaff1).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAddPair}
                  disabled={!pairStaff1 || !pairStaff2}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-40"
                >
                  追加
                </button>
                <button
                  onClick={() => { setAddingPair(false); setPairStaff1(''); setPairStaff2('') }}
                  className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────
// 営業日タブ
// ─────────────────────────────────────
function CalendarTab() {
  const { viewYear, viewMonth, exceptions, addException, removeException } = useShiftStore()
  const [year, setYear] = useState(viewYear)
  const [month, setMonth] = useState(viewMonth)
  const [newDate, setNewDate] = useState('')
  const [newType, setNewType] = useState<BusinessDayException['exceptionType']>('closed')

  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const monthExceptions = exceptions
    .filter(e => e.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date))

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1)
  }

  const handleAdd = () => {
    if (!newDate) return
    if (exceptions.some(e => e.date === newDate)) return  // 重複防止
    addException({ date: newDate, exceptionType: newType })
    setNewDate('')
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        毎週火曜は定休日（システム設定）。<br />
        臨時休業・臨時営業の例外をここで設定します。
      </p>

      {/* 月選択 */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-3 py-2">
        <button onClick={prevMonth} className="p-1.5 rounded-full hover:bg-gray-100">
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-bold text-gray-800">{year}年{month}月</span>
        <button onClick={nextMonth} className="p-1.5 rounded-full hover:bg-gray-100">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* 例外一覧 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500">
          {year}年{month}月の例外設定
        </div>
        {monthExceptions.length === 0 && (
          <div className="px-3 py-4 text-xs text-gray-400 text-center">例外設定なし</div>
        )}
        {monthExceptions.map(exc => {
          const d = new Date(exc.date + 'T00:00:00')
          const wd = d.getDay()
          return (
            <div key={exc.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0">
              <span className={clsx(
                'text-sm font-bold shrink-0',
                wd === 0 ? 'text-red-500' : wd === 6 ? 'text-blue-500' : 'text-gray-700',
              )}>
                {exc.date.slice(5).replace('-', '/')}（{WEEKDAY_NAMES[wd]}）
              </span>
              <span className={clsx(
                'text-xs px-2 py-0.5 rounded-full font-bold shrink-0',
                exc.exceptionType === 'closed'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-green-100 text-green-700',
              )}>
                {exc.exceptionType === 'closed' ? '臨時休業' : '臨時営業'}
              </span>
              <button
                onClick={() => removeException(exc.id)}
                className="ml-auto p-1.5 text-red-400 hover:bg-red-50 rounded-lg"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>

      {/* 追加フォーム */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
        <div className="text-xs font-bold text-gray-700">例外を追加</div>
        <div>
          <div className="text-xs text-gray-400 mb-1">日付</div>
          <input
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full"
          />
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-1">種類</div>
          <div className="flex gap-2">
            <button
              onClick={() => setNewType('closed')}
              className={clsx(
                'flex-1 py-2 rounded-lg text-sm font-bold border transition-colors',
                newType === 'closed'
                  ? 'bg-red-500 text-white border-red-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-red-200',
              )}
            >
              臨時休業
            </button>
            <button
              onClick={() => setNewType('open')}
              className={clsx(
                'flex-1 py-2 rounded-lg text-sm font-bold border transition-colors',
                newType === 'open'
                  ? 'bg-green-500 text-white border-green-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-200',
              )}
            >
              臨時営業
            </button>
          </div>
        </div>
        <button
          onClick={handleAdd}
          disabled={!newDate}
          className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-40"
        >
          追加
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// AdminPage（メイン）
// ─────────────────────────────────────
type Tab = 'staff' | 'dept' | 'required' | 'rules' | 'calendar'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'staff',    label: 'スタッフ', icon: Users },
  { id: 'dept',     label: '部署',     icon: Building2 },
  { id: 'required', label: '必要人数', icon: CalendarClock },
  { id: 'rules',    label: 'ルール',   icon: Settings2 },
  { id: 'calendar', label: '営業日',   icon: Calendar },
]

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('staff')

  return (
    <div className="pb-20">
      {/* タブ */}
      <div className="flex border-b border-gray-200 bg-white sticky top-14 z-30 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'flex items-center gap-1 px-3 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0',
              activeTab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="p-3">
        {activeTab === 'staff'    && <StaffTab />}
        {activeTab === 'dept'     && <DeptTab />}
        {activeTab === 'required' && <RequiredTab />}
        {activeTab === 'rules'    && <RulesTab />}
        {activeTab === 'calendar' && <CalendarTab />}
      </div>
    </div>
  )
}
