import { Zap, Download } from 'lucide-react'
import { useShiftStore } from '../store/shiftStore'
import { ShiftTable } from '../components/shift/ShiftTable'
import { ViolationPanel } from '../components/shift/ViolationPanel'
import { DebugPanel } from '../components/shift/DebugPanel'

export function ShiftPage() {
  const { currentShift, generateShift, viewYear, viewMonth } = useShiftStore()

  return (
    <div className="flex flex-col gap-0 pb-20">
      {/* 操作バー */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 sticky top-14 z-30">
        <button
          onClick={generateShift}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 active:bg-blue-800 shadow-sm"
        >
          <Zap size={15} />
          {currentShift ? '再生成' : 'シフト生成'}
        </button>

        {currentShift && (
          <>
            <button className="flex items-center gap-1 text-gray-500 text-sm px-2 py-1.5 rounded-lg hover:bg-gray-100 border border-gray-200">
              <Download size={15} />
              Excel
            </button>
            <span className="text-xs text-gray-400 ml-auto">
              {viewYear}年{viewMonth}月 · 下書き
            </span>
          </>
        )}
      </div>

      {/* 違反パネル */}
      <ViolationPanel />

      {/* デバッグパネル（開発用） */}
      <DebugPanel />

      {/* 凡例 */}
      <div className="flex items-center gap-3 px-3 py-2 text-xs text-gray-500 bg-white border-b border-gray-100">
        <div className="flex items-center gap-1"><span className="inline-block w-5 h-4 rounded cell-work text-center text-[10px] leading-4">出</span>出勤</div>
        <div className="flex items-center gap-1"><span className="inline-block w-5 h-4 rounded cell-off text-center text-[10px] leading-4">休</span>公休</div>
        <div className="flex items-center gap-1"><span className="inline-block w-5 h-4 rounded cell-paid text-center text-[10px] leading-4">有</span>有給</div>
        <div className="flex items-center gap-1"><span className="inline-block w-5 h-4 rounded cell-closed text-center text-[10px] leading-4">定</span>定休</div>
        <div className="text-[10px] text-gray-400 ml-auto">タップで変更 / 長押しでロック</div>
      </div>

      {/* シフト表 */}
      {currentShift ? (
        <ShiftTable />
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <Zap size={48} className="mb-4 text-gray-300" />
          <p className="text-sm font-medium">「シフト生成」ボタンを押してください</p>
          <p className="text-xs mt-1">{viewYear}年{viewMonth}月のシフトを自動作成します</p>
        </div>
      )}
    </div>
  )
}
