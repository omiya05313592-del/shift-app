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
}

const STATUS_CLASS: Record<ShiftStatus, string> = {
  work:      'cell-work',
  off:       'cell-off',
  paid_leave:'cell-paid',
  closed:    'cell-closed',
  absent:    'cell-absent',
}

export function ShiftCell({ staffId, date, status, isLocked, isClosed }: Props) {
  const { updateEntry, toggleLock } = useShiftStore()

  const isAbsent = status === 'absent'

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
      )}
      title={isLocked ? 'ロック中（長押しで解除）' : '長押しでロック'}
    >
      {SHIFT_STATUS_LABEL[status]}
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
