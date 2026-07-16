import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useShiftStore } from '../../store/shiftStore'

const PAGE_TITLES: Record<string, string> = {
  shift:    'シフト管理',
  requests: '希望休申請',
  admin:    '管理設定',
}

export function Header() {
  const { currentPage, viewYear, viewMonth, setViewMonth } = useShiftStore()

  const prevMonth = () => {
    if (viewMonth === 1) setViewMonth(viewYear - 1, 12)
    else setViewMonth(viewYear, viewMonth - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 12) setViewMonth(viewYear + 1, 1)
    else setViewMonth(viewYear, viewMonth + 1)
  }

  return (
    <header className="sticky top-0 z-40 bg-blue-600 text-white shadow-md">
      <div className="flex items-center justify-between px-4 h-14">
        <h1 className="text-base font-bold">{PAGE_TITLES[currentPage]}</h1>

        {currentPage === 'shift' && (
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1.5 rounded-full hover:bg-blue-500 active:bg-blue-700">
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-semibold min-w-[80px] text-center">
              {viewYear}年{viewMonth}月
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-full hover:bg-blue-500 active:bg-blue-700">
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
