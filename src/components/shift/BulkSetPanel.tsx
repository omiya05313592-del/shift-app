import { useState } from 'react'
import { X, ListChecks, Lock } from 'lucide-react'
import { useShiftStore } from '../../store/shiftStore'
import clsx from 'clsx'
import type { ShiftStatus } from '../../types'

const pad = (n: number) => String(n).padStart(2, '0')

const STATUS_OPTIONS: { value: ShiftStatus; label: string; color: string }[] = [
  { value: 'work',       label: '出勤', color: 'bg-sky-500' },
  { value: 'off',        label: '公休', color: 'bg-blue-500' },
  { value: 'paid_leave', label: '有給', color: 'bg-green-500' },
]

const STAFF_TYPE_LABEL: Record<string, string> = { employee: '社', part: 'パ', arbeit: 'ア' }

type Props = { onClose: () => void }

export function BulkSetPanel({ onClose }: Props) {
  const { staffList, departments, viewYear, viewMonth, bulkSetEntries } = useShiftStore()

  const activeStaff = staffList.filter(s => s.isActive)

  // 期間デフォルト = 表示中の月の1日〜末日
  const firstDay = `${viewYear}-${pad(viewMonth)}-01`
  const lastDate = new Date(viewYear, viewMonth, 0).getDate()
  const lastDay = `${viewYear}-${pad(viewMonth)}-${pad(lastDate)}`

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [startDate, setStartDate] = useState(firstDay)
  const [endDate, setEndDate] = useState(lastDay)
  const [status, setStatus] = useState<ShiftStatus>('work')
  const [lock, setLock] = useState(true)

  const toggleStaff = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectByType = (pred: (t: string) => boolean) => {
    setSelected(new Set(activeStaff.filter(s => pred(s.staffType)).map(s => s.id)))
  }

  const canApply = selected.size > 0 && startDate && endDate && startDate <= endDate

  const handleApply = () => {
    if (!canApply) return
    bulkSetEntries({ staffIds: [...selected], startDate, endDate, status, lock })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダ */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2 font-bold text-gray-800">
            <ListChecks size={18} className="text-indigo-600" />
            一括設定
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 対象スタッフ */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-600">対象スタッフ（{selected.size}名選択中）</label>
              <div className="flex gap-1">
                <button onClick={() => selectByType(() => true)} className="text-[11px] px-2 py-0.5 bg-gray-100 rounded-full hover:bg-gray-200">全員</button>
                <button onClick={() => selectByType(t => t !== 'arbeit')} className="text-[11px] px-2 py-0.5 bg-gray-100 rounded-full hover:bg-gray-200">社員パ</button>
                <button onClick={() => selectByType(t => t === 'arbeit')} className="text-[11px] px-2 py-0.5 bg-gray-100 rounded-full hover:bg-gray-200">バイト</button>
                <button onClick={() => setSelected(new Set())} className="text-[11px] px-2 py-0.5 bg-gray-100 rounded-full hover:bg-gray-200">解除</button>
              </div>
            </div>
            <div className="space-y-2 max-h-52 overflow-y-auto border border-gray-100 rounded-lg p-2 bg-gray-50/50">
              {departments.map(dept => {
                const members = activeStaff.filter(s => s.primaryDeptId === dept.id && s.staffType !== 'arbeit')
                if (members.length === 0) return null
                return (
                  <div key={dept.id}>
                    <div className="text-[10px] font-bold text-gray-400 mb-1">{dept.name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {members.map(s => (
                        <StaffChip key={s.id} name={s.name} type={s.staffType} on={selected.has(s.id)} onClick={() => toggleStaff(s.id)} />
                      ))}
                    </div>
                  </div>
                )
              })}
              {/* アルバイト */}
              {(() => {
                const arb = activeStaff.filter(s => s.staffType === 'arbeit')
                if (arb.length === 0) return null
                return (
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 mb-1">アルバイト</div>
                    <div className="flex flex-wrap gap-1.5">
                      {arb.map(s => (
                        <StaffChip key={s.id} name={s.name} type={s.staffType} on={selected.has(s.id)} onClick={() => toggleStaff(s.id)} />
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* 期間 */}
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-2">期間</label>
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm flex-1" />
              <span className="text-gray-400">〜</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm flex-1" />
            </div>
          </div>

          {/* 内容 */}
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-2">設定内容</label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={clsx(
                    'flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition-colors',
                    status === opt.value
                      ? `${opt.color} text-white border-transparent shadow-sm`
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ロック */}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={lock} onChange={e => setLock(e.target.checked)} className="rounded" />
            <Lock size={14} className="text-amber-500" />
            設定した箇所をロックする（再生成しても固定・繁忙期の「絶対出勤」など）
          </label>
        </div>

        {/* フッタ */}
        <div className="flex gap-2 p-4 border-t border-gray-200 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold">
            キャンセル
          </button>
          <button
            onClick={handleApply}
            disabled={!canApply}
            className="flex-[2] py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-40"
          >
            適用する
          </button>
        </div>
      </div>
    </div>
  )
}

function StaffChip({ name, type, on, onClick }: { name: string; type: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
        on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300',
      )}
    >
      <span className={clsx('text-[9px] px-1 rounded font-bold', on ? 'bg-white/20' : 'bg-gray-100 text-gray-500')}>
        {STAFF_TYPE_LABEL[type]}
      </span>
      {name}
    </button>
  )
}
