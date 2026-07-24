import clsx from 'clsx'
import { Lock } from 'lucide-react'
import type { ShiftStatus } from '../../types'
import { SHIFT_STATUS_LABEL, SHIFT_STATUS_CYCLE } from '../../types'
import { useShiftStore } from '../../store/shiftStore'

type Props = {
  staffId: string
  date: string
  status: ShiftStatus
  isLocked: boolean
  isClosed: boolean      // 定休日（店が休み）
  isRequested?: boolean  // 承認済み希望休（申請由来）の休み
}

const STATUS_CLASS: Record<ShiftStatus, string> = {
  work:      'cell-work',
  off:       'cell-off',
  paid_leave:'cell-paid',
  closed:    'cell-closed',
  absent:    'cell-absent',
}

export function ShiftCell({ staffId, date, status, isLocked, isClosed, isRequested }: Props) {
  const { updateEntry, toggleLock } = useShiftStore()

  const isAbsent = status === 'absent'
  // 申請由来かつ実際に休み（公休/有給）のときだけマーカー表示
  const showRequestMark = !!isRequested && (status === 'off' || status === 'paid_leave')

  const handleClick = () => {
    if (isClosed || isLocked || isAbsent) return
    const idx = SHIFT_STATUS_CYCLE.indexOf(status)
    const next = SHIFT_STATUS_CYCLE[(idx + 1) % SHIFT_STATUS_CYCLE.length]
    updateEntry(staffId, date, next)
  }

  const handleLongPress = (() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    return {
      onPointerDown: () => {
        timer = setTimeout(() => {
          toggleLock(staffId, date)
        }, 600)
      },
      onPointerUp: () => { if (timer) clearTimeout(timer) },
      onPointerLeave: () => { if (timer) clearTimeout(timer) },
    }
  })()

  return (
    <button
      onClick={handleClick}
      {...handleLongPress}
      className={clsx(
        'relative w-full h-9 rounded text-xs font-medium select-none',
        'transition-opacity active:opacity-70',
        STATUS_CLASS[status],
        (isClosed || isAbsent) && 'opacity-50 cursor-default',
        isLocked && 'ring-1 ring-amber-400 ring-inset',
        showRequestMark && 'ring-2 ring-rose-400 ring-inset',
      )}
      title={
        showRequestMark ? '申請由来の休み'
          : isLocked ? 'ロック中（長押しで解除）'
          : '長押しでロック'
      }
    >
      {SHIFT_STATUS_LABEL[status]}
      {/* 申請由来マーカー（左下の三角） */}
      <span
        className={clsx(
          'absolute bottom-0 left-0 w-0 h-0 border-l-[6px] border-b-[6px] border-l-transparent border-b-rose-500',
          showRequestMark ? 'opacity-100' : 'opacity-0',
        )}
      />
      <Lock
        size={8}
        className={clsx(
          'absolute top-0.5 right-0.5 text-amber-500',
          isLocked ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      />
    </button>
  )
}
