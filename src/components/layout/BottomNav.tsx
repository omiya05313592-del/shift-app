import { CalendarDays, ClipboardList, Settings } from 'lucide-react'
import { useShiftStore } from '../../store/shiftStore'
import clsx from 'clsx'

const NAV_ITEMS = [
  { page: 'shift',    label: 'シフト',   icon: CalendarDays },
  { page: 'requests', label: '希望休',   icon: ClipboardList },
  { page: 'admin',    label: '管理',     icon: Settings },
] as const

export function BottomNav() {
  const { currentPage, setPage } = useShiftStore()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-pb">
      <div className="flex">
        {NAV_ITEMS.map(({ page, label, icon: Icon }) => (
          <button
            key={page}
            onClick={() => setPage(page)}
            className={clsx(
              'flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors',
              currentPage === page
                ? 'text-blue-600 bg-blue-50'
                : 'text-gray-400 hover:text-gray-600'
            )}
          >
            <Icon size={22} strokeWidth={currentPage === page ? 2.5 : 1.5} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
