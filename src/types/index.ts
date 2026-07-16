// =============================================================
// SHIFT APP — 型定義
// =============================================================

// ===== 部署 =====
export type Department = {
  id: string
  name: string
  canDualWithIds: string[]   // 兼任できる部署ID
  displayOrder: number
}

// ===== スタッフ =====
export type StaffType = 'employee' | 'part' | 'arbeit'

export type Staff = {
  id: string
  name: string
  staffType: StaffType
  primaryDeptId: string
  monthlyOffDays: number       // 月の休み日数（定休日含む）
  maxConsecutiveWork: number   // 最大連勤日数
  requireConsecutiveOff: boolean // 月2回2連休必須か（Phase 2で使用）
  isActive: boolean
}

// =============================================================
// スタッフ勤務状態
// =============================================================

export type WorkStatus =
  | 'active'    // 勤務中（通常）
  | 'leave'     // 休職中（病気・育休・産休・研修等）
  | 'retiring'  // 退職予定（在籍中は通常勤務）
  | 'resigned'  // 退職済

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  active:   '勤務中',
  leave:    '休職中',
  retiring: '退職予定',
  resigned: '退職済',
}

// この状態の期間中はシフト生成から除外（retiring は在籍中なので含める）
export const EXCLUDED_WORK_STATUSES: WorkStatus[] = ['leave', 'resigned']

export type StaffStatusPeriod = {
  id: string
  staffId: string
  status: WorkStatus
  startDate: string    // YYYY-MM-DD
  endDate?: string     // YYYY-MM-DD（未設定 = 無期限）
  reason?: string      // 例: '育休', '長期研修', '体調不良'
}

// =============================================================
// ルールエンジン
// =============================================================
// ルールタイプ一覧（Phase別に管理）
//
// Phase 1.5 で処理するもの:
//   fixed_off_weekday  — 曜日固定休 HARD
//   fixed_off_holiday  — 祝日固定休 HARD
//   fixed_off_date     — 日付固定休 HARD  (YYYY-MM-DD)
//   fixed_work_date    — 日付固定出勤 HARD (YYYY-MM-DD)
//
// Phase 2 以降で追加予定（データには持てるが今は無視）:
//   prefer_off_weekday     — 休み優先曜日 SOFT
//   prefer_work_weekday    — 出勤優先曜日 SOFT
//   monthly_weekday_off    — 月N回特定曜日休み
//   consecutive_off_days   — 連休曜日指定
//   require_consecutive_off — 月N回連休必須
// =============================================================

export type RuleType =
  // ── HARD（Phase 1.5 実装済）─────────────────────────
  | 'fixed_off_weekday'       // { weekdays: number[] }  0=日〜6=土
  | 'fixed_off_holiday'       // {}
  | 'fixed_off_date'          // { date: string }  YYYY-MM-DD
  | 'fixed_work_date'         // { date: string }  YYYY-MM-DD
  // ── SOFT（Phase 2 予定）──────────────────────────────
  | 'prefer_off_weekday'      // { weekdays: number[] }
  | 'prefer_work_weekday'     // { weekdays: number[] }
  | 'monthly_weekday_off'     // { weekday: number, count: number }
  | 'consecutive_off_days'    // { weekdays: number[] }
  | 'require_consecutive_off' // { count: number }

export type StaffRule = {
  id: string
  staffId: string
  ruleType: RuleType
  ruleValue: Record<string, unknown>
  priority: number
  isActive: boolean
}

// ===== 同日休みNG制約 =====
export type PairConstraint = {
  id: string
  staffId1: string
  staffId2: string
  constraintType: 'no_same_day_off'
}

// ===== シフトステータス =====
export type ShiftStatus = 'work' | 'off' | 'paid_leave' | 'closed' | 'absent'
// absent = 休職中・退職済のためシフト対象外

export const SHIFT_STATUS_LABEL: Record<ShiftStatus, string> = {
  work:       '出',
  off:        '休',
  paid_leave: '有',
  closed:     '定',
  absent:     '－',
}

export const SHIFT_STATUS_CYCLE: ShiftStatus[] = ['work', 'off', 'paid_leave']

// ===== シフトエントリ =====
export type ShiftEntry = {
  staffId: string
  date: string        // YYYY-MM-DD
  status: ShiftStatus
  isLocked: boolean
  note?: string
}

// ===== 月次シフト =====
export type MonthlyShift = {
  id: string
  year: number
  month: number
  entries: ShiftEntry[]
  status: 'draft' | 'confirmed'
  generatedAt?: string
}

// ===== 必要人数設定 =====
// 優先順位: daily > range > weekday
export type RequiredStaffConfigType = 'daily' | 'range' | 'weekday'

export type RequiredStaffConfig = {
  id: string
  deptId: string
  configType: RequiredStaffConfigType
  targetDate?: string       // daily 用: YYYY-MM-DD
  startDate?: string        // range 用
  endDate?: string          // range 用
  weekday?: number          // weekday 用: 0=日〜6=土
  minCount: number
  preferredCount: number
}

// ===== 希望休 =====
export type LeaveRequestType = 'off' | 'paid_leave'
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected'

export type LeaveRequest = {
  id: string
  staffId: string
  date: string
  requestType: LeaveRequestType
  status: LeaveRequestStatus
}

// ===== アルバイト不可日 =====
export type UnavailableDate = {
  id: string
  staffId: string
  date: string
}

// ===== アルバイト出勤可能日 =====
// availableDates が設定されている月は、リストにない営業日を全て 'off' にする
export type ArbeitAvailability = {
  id: string
  staffId: string
  year: number
  month: number
  availableDates: string[]  // YYYY-MM-DD のリスト（出勤できる日）
}

// ===== 営業日例外 =====
export type BusinessDayException = {
  id: string
  date: string
  exceptionType: 'open' | 'closed'
  note?: string
}

// =============================================================
// 基本勤務日設定
// =============================================================
// 希望休・有給・管理者設定の休日がない限り、この曜日は出勤を前提とする。
// Repair Engine は must レベルの基本勤務日に入った "配分休" を優先的に取り除く。

export type CoreWorkDay = {
  deptId: string
  weekday: number             // 0=日 〜 6=土
  level: 'must' | 'preferred' // must=基本勤務日、preferred=できれば出勤
}

// =============================================================
// Repair Engine
// =============================================================

export type RepairLogEntry = {
  iteration: number
  category: string   // "①必要人数不足" | "②同日休みNG" | "③基本勤務日" | "⑤4連休解消" | "⑥3連休削減" | "*代替休み"
  staffId: string
  staffName: string
  date: string
  before: ShiftStatus
  after: ShiftStatus
  detail: string
}

// =============================================================
// デバッグ情報（generateShift が返す詳細ログ）
// =============================================================

/** 各 Phase で何件の変更が発生したか */
export type ShiftDebugPhaseLog = {
  phase: string     // "Step 1: ロック復元" など
  count: number     // 変更エントリ数
  details: string[] // 主な変更内容（最大10件）
}

/** 4連休以上になったスタッフの詳細 */
export type ShiftDebugConsecutiveOff = {
  staffId: string
  staffName: string
  start: string   // YYYY-MM-DD
  end: string     // YYYY-MM-DD
  length: number
  dayDetails: Array<{
    date: string
    status: ShiftStatus
    reason: string
  }>
}

/** 土曜の人数不足詳細 */
export type ShiftDebugSaturdayIssue = {
  date: string
  deptId: string
  deptName: string
  workCount: number
  minCount: number
  preferredCount: number
  offStaff: Array<{ staffId: string; name: string; reason: string }>
}

export type ShiftDebugInfo = {
  phaseLogs: ShiftDebugPhaseLog[]
  consecutiveOffIssues: ShiftDebugConsecutiveOff[]   // 4連休以上（Repair 後）
  saturdayIssues: ShiftDebugSaturdayIssue[]           // 土曜人数不足（Repair 後）
  reasonMap: Record<string, string>                   // "staffId::date" → 理由
  repairLog: RepairLogEntry[]                         // Repair Engine の変更履歴
}

// ===== バリデーション違反 =====
export type ViolationType =
  | 'insufficient_staff'   // 必要人数不足
  | 'same_day_off'         // 同日休みNG
  | 'over_consecutive'     // 連勤超過
  | 'off_days_unmet'       // 月休み日数未達
  | 'no_consecutive_off'   // 2連休未達

export type Violation = {
  type: ViolationType
  date?: string
  staffIds?: string[]
  deptId?: string
  message: string
}
