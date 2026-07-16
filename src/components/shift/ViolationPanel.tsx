import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'
import { useShiftStore } from '../../store/shiftStore'

export function ViolationPanel() {
  const { violations } = useShiftStore()
  const [open, setOpen] = useState(true)

  if (violations.length === 0 || !open) return null

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg mx-3 mt-3 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-red-700 font-bold text-sm">
          <AlertTriangle size={16} />
          条件違反 {violations.length}件
        </div>
        <button onClick={() => setOpen(false)} className="text-red-400 hover:text-red-600">
          <X size={16} />
        </button>
      </div>
      <ul className="space-y-1">
        {violations.map((v, i) => (
          <li key={i} className="text-xs text-red-600 flex items-start gap-1">
            <span className="mt-0.5">•</span>
            <span>{v.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
