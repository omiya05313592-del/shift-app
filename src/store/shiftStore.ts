import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Department, Staff, StaffRule, PairConstraint,
  ShiftStatus, MonthlyShift,
  LeaveRequest, UnavailableDate, ArbeitAvailability, BusinessDayException,
  RequiredStaffConfig, StaffStatusPeriod, Violation, ShiftDebugInfo, CoreWorkDay,
} from '../types'
import {
  DEPARTMENTS, STAFF_LIST, STAFF_RULES, PAIR_CONSTRAINTS,
  REQUIRED_STAFF_CONFIGS, BUSINESS_DAY_EXCEPTIONS, STAFF_STATUS_PERIODS,
  CORE_WORK_DAYS, ARBEIT_MAX_PER_DAY,
} from '../data/dummy'
import { generateShift } from '../utils/shiftGenerator'

// 一意なIDを生成（同一ミリ秒での重複を防ぐ）
let uidCounter = 0
function uid(prefix: string): string {
  uidCounter += 1
  return `${prefix}-${Date.now()}-${uidCounter}`
}

type Page = 'shift' | 'requests' | 'admin'

type ShiftStore = {
  // ===== マスタデータ =====
  departments: Department[]
  staffList: Staff[]
  staffRules: StaffRule[]
  pairConstraints: PairConstraint[]
  requiredConfigs: RequiredStaffConfig[]
  exceptions: BusinessDayException[]
  statusPeriods: StaffStatusPeriod[]
  coreWorkDays: CoreWorkDay[]
  arbeitMaxPerDay: number

  // ===== 表示中の月 =====
  viewYear: number
  viewMonth: number
  setViewMonth: (year: number, month: number) => void

  // ===== シフトデータ =====
  currentShift: MonthlyShift | null
  violations: Violation[]
  debugInfo: ShiftDebugInfo | null

  // ===== 希望休 =====
  leaveRequests: LeaveRequest[]
  unavailableDates: UnavailableDate[]
  arbeitAvailabilities: ArbeitAvailability[]

  // ===== ページ =====
  currentPage: Page
  setPage: (page: Page) => void

  // ===== シフト操作 =====
  generateShift: () => void
  updateEntry: (staffId: string, date: string, status: ShiftStatus) => void
  toggleLock: (staffId: string, date: string) => void

  // ===== 希望休操作 =====
  addLeaveRequest: (req: Omit<LeaveRequest, 'id'>) => void
  approveLeave: (id: string) => void
  rejectLeave: (id: string) => void
  removeLeaveRequest: (id: string) => void

  // ===== 勤務状態操作 =====
  addStatusPeriod: (period: Omit<StaffStatusPeriod, 'id'>) => void
  updateStatusPeriod: (id: string, data: Partial<StaffStatusPeriod>) => void
  removeStatusPeriod: (id: string) => void

  // ===== アルバイト設定 =====
  setArbeitMaxPerDay: (n: number) => void
  setArbeitAvailability: (staffId: string, year: number, month: number, availableDates: string[]) => void
  clearArbeitAvailability: (staffId: string, year: number, month: number) => void

  // ===== マスタ管理 =====
  addStaff: (staff: Omit<Staff, 'id'>) => void
  updateStaff: (id: string, data: Partial<Staff>) => void
  removeStaff: (id: string) => void
  addDepartment: (dept: Omit<Department, 'id'>) => void

  // ===== 必要人数設定 =====
  addRequiredConfig: (config: Omit<RequiredStaffConfig, 'id'>) => void
  updateRequiredConfig: (id: string, data: Partial<RequiredStaffConfig>) => void
  removeRequiredConfig: (id: string) => void

  // ===== スタッフルール =====
  addStaffRule: (rule: Omit<StaffRule, 'id'>) => void
  updateStaffRule: (id: string, data: Partial<StaffRule>) => void
  removeStaffRule: (id: string) => void

  // ===== 同日休みNG制約 =====
  addPairConstraint: (pair: Omit<PairConstraint, 'id'>) => void
  removePairConstraint: (id: string) => void

  // ===== 営業日例外 =====
  addException: (exc: Omit<BusinessDayException, 'id'>) => void
  removeException: (id: string) => void
}

const now = new Date()

export const useShiftStore = create<ShiftStore>()(
  persist(
    (set, get) => ({
  departments: DEPARTMENTS,
  staffList: STAFF_LIST,
  staffRules: STAFF_RULES,
  pairConstraints: PAIR_CONSTRAINTS,
  requiredConfigs: REQUIRED_STAFF_CONFIGS,
  exceptions: BUSINESS_DAY_EXCEPTIONS,
  statusPeriods: STAFF_STATUS_PERIODS,
  coreWorkDays: CORE_WORK_DAYS,
  arbeitMaxPerDay: ARBEIT_MAX_PER_DAY,

  viewYear: now.getFullYear(),
  viewMonth: now.getMonth() + 1,
  setViewMonth: (year, month) => set({ viewYear: year, viewMonth: month }),

  currentShift: null,
  violations: [],
  debugInfo: null,

  leaveRequests: [],
  unavailableDates: [],
  arbeitAvailabilities: [],

  currentPage: 'shift',
  setPage: (page) => set({ currentPage: page }),

  generateShift: () => {
    const s = get()
    const lockedEntries = s.currentShift?.entries.filter(e => e.isLocked) ?? []

    const result = generateShift({
      year: s.viewYear,
      month: s.viewMonth,
      staffList: s.staffList,
      departments: s.departments,
      staffRules: s.staffRules,
      pairConstraints: s.pairConstraints,
      requiredConfigs: s.requiredConfigs,
      leaveRequests: s.leaveRequests,
      statusPeriods: s.statusPeriods,
      exceptions: s.exceptions,
      lockedEntries,
      coreWorkDays: s.coreWorkDays,
      unavailableDates: s.unavailableDates,
      arbeitAvailabilities: s.arbeitAvailabilities,
      arbeitMaxPerDay: s.arbeitMaxPerDay,
    })

    const shift: MonthlyShift = {
      id: `shift-${s.viewYear}-${s.viewMonth}`,
      year: s.viewYear,
      month: s.viewMonth,
      entries: result.entries,
      status: 'draft',
      generatedAt: new Date().toISOString(),
    }

    set({ currentShift: shift, violations: result.violations, debugInfo: result.debugInfo })
  },

  updateEntry: (staffId, date, status) => {
    set(state => {
      if (!state.currentShift) return state
      const entries = state.currentShift.entries.map(e =>
        e.staffId === staffId && e.date === date && !e.isLocked
          ? { ...e, status }
          : e
      )
      return { currentShift: { ...state.currentShift, entries } }
    })
  },

  toggleLock: (staffId, date) => {
    set(state => {
      if (!state.currentShift) return state
      const entries = state.currentShift.entries.map(e =>
        e.staffId === staffId && e.date === date
          ? { ...e, isLocked: !e.isLocked }
          : e
      )
      return { currentShift: { ...state.currentShift, entries } }
    })
  },

  addLeaveRequest: (req) => {
    const id = uid('leave')
    set(state => ({
      leaveRequests: [...state.leaveRequests, { ...req, id }],
    }))
  },

  approveLeave: (id) => {
    set(state => ({
      leaveRequests: state.leaveRequests.map(r =>
        r.id === id ? { ...r, status: 'approved' } : r
      ),
    }))
  },

  rejectLeave: (id) => {
    set(state => ({
      leaveRequests: state.leaveRequests.map(r =>
        r.id === id ? { ...r, status: 'rejected' } : r
      ),
    }))
  },

  removeLeaveRequest: (id) => {
    set(state => ({
      leaveRequests: state.leaveRequests.filter(r => r.id !== id),
    }))
  },

  addStatusPeriod: (period) => {
    const id = uid('sp')
    set(state => ({ statusPeriods: [...state.statusPeriods, { ...period, id }] }))
  },

  updateStatusPeriod: (id, data) => {
    set(state => ({
      statusPeriods: state.statusPeriods.map(p => p.id === id ? { ...p, ...data } : p),
    }))
  },

  removeStatusPeriod: (id) => {
    set(state => ({
      statusPeriods: state.statusPeriods.filter(p => p.id !== id),
    }))
  },

  setArbeitMaxPerDay: (n) => set({ arbeitMaxPerDay: n }),

  setArbeitAvailability: (staffId, year, month, availableDates) => {
    set(state => {
      const filtered = state.arbeitAvailabilities.filter(
        a => !(a.staffId === staffId && a.year === year && a.month === month)
      )
      const id = `avail-${staffId}-${year}-${month}`
      return { arbeitAvailabilities: [...filtered, { id, staffId, year, month, availableDates }] }
    })
  },

  clearArbeitAvailability: (staffId, year, month) => {
    set(state => ({
      arbeitAvailabilities: state.arbeitAvailabilities.filter(
        a => !(a.staffId === staffId && a.year === year && a.month === month)
      ),
    }))
  },

  addStaff: (staff) => {
    const id = uid('s')
    set(state => ({ staffList: [...state.staffList, { ...staff, id }] }))
  },

  updateStaff: (id, data) => {
    set(state => ({
      staffList: state.staffList.map(s => s.id === id ? { ...s, ...data } : s),
    }))
  },

  removeStaff: (id) => {
    set(state => ({ staffList: state.staffList.filter(s => s.id !== id) }))
  },

  addDepartment: (dept) => {
    const id = uid('dept')
    set(state => ({ departments: [...state.departments, { ...dept, id }] }))
  },

  addRequiredConfig: (config) => {
    const id = uid('req')
    set(state => ({ requiredConfigs: [...state.requiredConfigs, { ...config, id }] }))
  },
  updateRequiredConfig: (id, data) => {
    set(state => ({
      requiredConfigs: state.requiredConfigs.map(c => c.id === id ? { ...c, ...data } : c),
    }))
  },
  removeRequiredConfig: (id) => {
    set(state => ({ requiredConfigs: state.requiredConfigs.filter(c => c.id !== id) }))
  },

  addStaffRule: (rule) => {
    const id = uid('rule')
    set(state => ({ staffRules: [...state.staffRules, { ...rule, id }] }))
  },
  updateStaffRule: (id, data) => {
    set(state => ({
      staffRules: state.staffRules.map(r => r.id === id ? { ...r, ...data } : r),
    }))
  },
  removeStaffRule: (id) => {
    set(state => ({ staffRules: state.staffRules.filter(r => r.id !== id) }))
  },

  addPairConstraint: (pair) => {
    const id = uid('pair')
    set(state => ({ pairConstraints: [...state.pairConstraints, { ...pair, id }] }))
  },
  removePairConstraint: (id) => {
    set(state => ({ pairConstraints: state.pairConstraints.filter(p => p.id !== id) }))
  },

  addException: (exc) => {
    const id = uid('exc')
    set(state => ({ exceptions: [...state.exceptions, { ...exc, id }] }))
  },
  removeException: (id) => {
    set(state => ({ exceptions: state.exceptions.filter(e => e.id !== id) }))
  },
    }),
    {
      name: 'shift-app-store',   // localStorage のキー
      version: 2,                // スキーマ変更時に上げる（migrate で移行）
      // 旧バージョンの保存データを新スキーマへ移行
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Partial<ShiftStore>
        // v2: 部署名「レジ」→「接客」
        if (version < 2 && Array.isArray(state.departments)) {
          state.departments = state.departments.map(d =>
            d.id === 'dept-cashier' && d.name === 'レジ' ? { ...d, name: '接客' } : d
          )
        }
        return state as ShiftStore
      },
      // 保存対象を明示（currentPage などの一時的なUI状態は保存しない）
      partialize: (state) => ({
        departments: state.departments,
        staffList: state.staffList,
        staffRules: state.staffRules,
        pairConstraints: state.pairConstraints,
        requiredConfigs: state.requiredConfigs,
        exceptions: state.exceptions,
        statusPeriods: state.statusPeriods,
        coreWorkDays: state.coreWorkDays,
        arbeitMaxPerDay: state.arbeitMaxPerDay,
        viewYear: state.viewYear,
        viewMonth: state.viewMonth,
        currentShift: state.currentShift,
        violations: state.violations,
        leaveRequests: state.leaveRequests,
        unavailableDates: state.unavailableDates,
        arbeitAvailabilities: state.arbeitAvailabilities,
      }),
    },
  ),
)
