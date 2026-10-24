import { useState } from 'react'
import { Zap, Download, Check, Save, ZoomIn, ZoomOut, RotateCcw, ListChecks, Eraser } from 'lucide-react'
import { useShiftStore } from '../store/shiftStore'
import { ShiftTable } from '../components/shift/ShiftTable'
import { ViolationPanel } from '../components/shift/ViolationPanel'
import { DebugPanel } from '../components/shift/DebugPanel'
import { BulkSetPanel } from '../components/shift/BulkSetPanel'

export function ShiftPage() {
  const { currentShift, generateShift, clearShift, viewYear, viewMonth, zoom, setZoom } = useShiftStore()
  const [savedToast, setSavedToast] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  // データは常時自動保存されているので、ボタンは「保存済み」を明示するだけ
  const handleSave = () => {
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2000)
  }

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
            <button
              onClick={() => setBulkOpen(true)}
              className="flex items-center gap-1 text-white bg-indigo-600 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-indigo-700"
            >
              <ListChecks size={15} />
              一括設定
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1 text-gray-600 text-sm px-2 py-1.5 rounded-lg hover:bg-gray-100 border border-gray-200"
            >
              <Save size={15} />
              保存
            </button>
            <button className="flex items-center gap-1 text-gray-500 text-sm px-2 py-1.5 rounded-lg hover:bg-gray-100 border border-gray-200">
              <Download size={15} />
              Excel
            </button>
            {confirmClear ? (
              <span className="flex items-center gap-1">
                <span className="text-xs text-gray-500">初期化する？</span>
                <button
                  onClick={() => { clearShift(); setConfirmClear(false) }}
                  className="text-sm font-bold text-white bg-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-600"
                >
                  はい
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="text-sm text-gray-600 bg-gray-100 px-2.5 py-1.5 rounded-lg hover:bg-gray-200"
                >
                  やめる
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1 text-red-500 text-sm px-2 py-1.5 rounded-lg hover:bg-red-50 border border-red-200"
              >
                <Eraser size={15} />
                初期化
              </button>
            )}

            {/* ズーム操作 */}
            <div className="flex items-center gap-0.5 ml-auto border border-gray-200 rounded-lg px-1 py-0.5">
              <button onClick={() => setZoom(zoom - 0.1)} title="縮小" className="p-1 text-gray-500 hover:bg-gray-100 rounded">
                <ZoomOut size={15} />
              </button>
              <span className="text-xs text-gray-500 font-medium w-9 text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={() => setZoom(zoom + 0.1)} title="拡大" className="p-1 text-gray-500 hover:bg-gray-100 rounded">
                <ZoomIn size={15} />
              </button>
              <button onClick={() => setZoom(1)} title="等倍に戻す" className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                <RotateCcw size={13} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* 一括設定パネル */}
      {bulkOpen && <BulkSetPanel onClose={() => setBulkOpen(false)} />}

      {/* 保存トースト */}
      {savedToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg">
          <Check size={16} />
          保存しました
        </div>
      )}

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
        <div className="flex items-center gap-1"><span className="inline-block w-5 h-4 rounded bg-red-100 text-red-700 text-center text-[10px] leading-4 font-bold">3</span>人数が赤=上限超過</div>
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
