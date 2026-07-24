import type {
  Department, Staff, StaffRule, PairConstraint,
  RequiredStaffConfig, BusinessDayException, StaffStatusPeriod, CoreWorkDay,
} from '../types'

// ===== 部署 =====
export const DEPARTMENTS: Department[] = [
  { id: 'dept-meat',    name: '精肉',  canDualWithIds: [],               displayOrder: 1 },
  { id: 'dept-cashier', name: '接客',  canDualWithIds: ['dept-gift'],    displayOrder: 2 },
  { id: 'dept-gift',    name: 'ギフト', canDualWithIds: ['dept-cashier'], displayOrder: 3 },
]

// ===== スタッフ =====
// requireConsecutiveOff: 月2回2連休必須かどうか
//   false = 固定休で自然に連休が生まれるため免除（あゆみ・ともみ）
export const STAFF_LIST: Staff[] = [
  // 精肉 社員
  { id: 's-takeshi', name: 'たけし', staffType: 'employee', primaryDeptId: 'dept-meat',    monthlyOffDays: 9, maxConsecutiveWork: 6, requireConsecutiveOff: true,  isActive: true },
  { id: 's-taku',    name: 'たく',   staffType: 'employee', primaryDeptId: 'dept-meat',    monthlyOffDays: 9, maxConsecutiveWork: 6, requireConsecutiveOff: true,  isActive: true },
  // 精肉 パート
  { id: 's-adachi',  name: '安達',   staffType: 'part',     primaryDeptId: 'dept-meat',    monthlyOffDays: 9, maxConsecutiveWork: 6, requireConsecutiveOff: true,  isActive: true },
  // レジ・ギフト 社員
  { id: 's-yuu',     name: 'ゆう',   staffType: 'employee', primaryDeptId: 'dept-cashier', monthlyOffDays: 9, maxConsecutiveWork: 6, requireConsecutiveOff: true,  isActive: true },
  { id: 's-yocchi',  name: 'よっち', staffType: 'employee', primaryDeptId: 'dept-cashier', monthlyOffDays: 9, maxConsecutiveWork: 6, requireConsecutiveOff: true,  isActive: true },
  // レジ・ギフト パート
  // ともみ: 日・祝固定休 → 自然に週末連休が生まれるため連休必須免除、月木優先
  { id: 's-tomomi',  name: 'ともみ', staffType: 'part',     primaryDeptId: 'dept-cashier', monthlyOffDays: 9, maxConsecutiveWork: 6, requireConsecutiveOff: false, isActive: true },
  // あゆみ: 土固定休 → 免除、月木優先
  { id: 's-ayumi',   name: 'あゆみ', staffType: 'part',     primaryDeptId: 'dept-cashier', monthlyOffDays: 9, maxConsecutiveWork: 6, requireConsecutiveOff: false, isActive: true },
  { id: 's-rie',     name: 'りえ',   staffType: 'part',     primaryDeptId: 'dept-cashier', monthlyOffDays: 9, maxConsecutiveWork: 6, requireConsecutiveOff: true,  isActive: true },
  // アルバイト
  { id: 's-ryochin', name: 'りょうちん', staffType: 'arbeit', primaryDeptId: 'dept-cashier', monthlyOffDays: 0, maxConsecutiveWork: 99, requireConsecutiveOff: false, isActive: true },
  { id: 's-yuuka',   name: 'ゆうか',     staffType: 'arbeit', primaryDeptId: 'dept-cashier', monthlyOffDays: 0, maxConsecutiveWork: 99, requireConsecutiveOff: false, isActive: true },
  { id: 's-kokone',  name: 'ここね',     staffType: 'arbeit', primaryDeptId: 'dept-cashier', monthlyOffDays: 0, maxConsecutiveWork: 99, requireConsecutiveOff: false, isActive: true },
  { id: 's-aoi',     name: 'あおい',     staffType: 'arbeit', primaryDeptId: 'dept-cashier', monthlyOffDays: 0, maxConsecutiveWork: 99, requireConsecutiveOff: false, isActive: true },
  { id: 's-momo',    name: 'モモ',       staffType: 'arbeit', primaryDeptId: 'dept-cashier', monthlyOffDays: 0, maxConsecutiveWork: 99, requireConsecutiveOff: false, isActive: true },
]

// ===== 個別ルール =====
// isActive: false にすることで管理画面からルールを一時停止できる（Phase 3 実装予定）
// Phase 1.5 で処理: fixed_off_weekday / fixed_off_holiday / fixed_off_date / fixed_work_date
// Phase 1.5 では無視（データは持つ）: monthly_weekday_off / consecutive_off_days / prefer_off_weekday
export const STAFF_RULES: StaffRule[] = [
  // たけし: 月1回日曜休み（Phase 2 で実装）
  { id: 'rule-1', staffId: 's-takeshi', ruleType: 'monthly_weekday_off',  ruleValue: { weekday: 0 },        priority: 1, isActive: true },
  // 安達: 連休は月・火ペア（Phase 2 で実装）
  { id: 'rule-2', staffId: 's-adachi',  ruleType: 'consecutive_off_days', ruleValue: { weekdays: [1, 2] },  priority: 1, isActive: true },
  // ともみ: 日・祝固定休（Phase 1.5 実装済）＋ 月・木優先（Phase 2）
  { id: 'rule-3', staffId: 's-tomomi',  ruleType: 'fixed_off_weekday',    ruleValue: { weekdays: [0] },     priority: 1, isActive: true },
  { id: 'rule-4', staffId: 's-tomomi',  ruleType: 'fixed_off_holiday',    ruleValue: {},                    priority: 1, isActive: true },
  { id: 'rule-5', staffId: 's-tomomi',  ruleType: 'prefer_off_weekday',   ruleValue: { weekdays: [1, 4] },  priority: 2, isActive: true },
  // あゆみ: 土曜固定休（Phase 1.5 実装済）＋ 月・木優先（Phase 2）
  { id: 'rule-6', staffId: 's-ayumi',   ruleType: 'fixed_off_weekday',    ruleValue: { weekdays: [6] },     priority: 1, isActive: true },
  { id: 'rule-7', staffId: 's-ayumi',   ruleType: 'prefer_off_weekday',   ruleValue: { weekdays: [1, 4] },  priority: 2, isActive: true },
  // りえ: 月1回日曜休み（Phase 2 で実装）
  { id: 'rule-8', staffId: 's-rie',     ruleType: 'monthly_weekday_off',  ruleValue: { weekday: 0 },        priority: 1, isActive: true },
]

// ===== 同日休みNGペア =====
export const PAIR_CONSTRAINTS: PairConstraint[] = [
  { id: 'pair-1', staffId1: 's-takeshi', staffId2: 's-taku',   constraintType: 'no_same_day_off' },
  { id: 'pair-2', staffId1: 's-yuu',     staffId2: 's-yocchi', constraintType: 'no_same_day_off' },
  { id: 'pair-3', staffId1: 's-ayumi',   staffId2: 's-rie',    constraintType: 'no_same_day_off' },
]

// ===== 必要人数設定（基本）=====
export const REQUIRED_STAFF_CONFIGS: RequiredStaffConfig[] = [
  { id: 'req-1', deptId: 'dept-meat',    configType: 'weekday', weekday: 3, minCount: 2, preferredCount: 2 },
  { id: 'req-2', deptId: 'dept-meat',    configType: 'weekday', weekday: 6, minCount: 1, preferredCount: 2 },
  { id: 'req-3', deptId: 'dept-cashier', configType: 'weekday', weekday: 0, minCount: 2, preferredCount: 3 },
  { id: 'req-4', deptId: 'dept-cashier', configType: 'weekday', weekday: 6, minCount: 2, preferredCount: 3 },
]

// ===== 営業日例外 =====
export const BUSINESS_DAY_EXCEPTIONS: BusinessDayException[] = []

// ===== スタッフ勤務状態期間 =====
// 管理画面（Phase 3）から追加・編集できるようにする予定
// 例: { id: 'sp-1', staffId: 's-xxx', status: 'leave', startDate: '2026-07-01', endDate: '2026-09-30', reason: '育休' }
export const STAFF_STATUS_PERIODS: StaffStatusPeriod[] = []

// ===== アルバイト設定 =====
// 1日に出勤できるアルバイトの最大人数（monthlyOffDays=0 のバイトが対象）
export const ARBEIT_MAX_PER_DAY = 2

// ===== 基本勤務日設定 =====
// 希望休・有給・管理者設定の特別休日がない限り、この曜日は出勤を前提とする。
// Repair Engine が "休日配分（Step 5）" でこの日に入った休みを優先的に修正する。
//   精肉: 金・土 = 必須出勤、水 = できれば出勤
//   レジ・ギフト (dept-cashier): 土 = 必須出勤
export const CORE_WORK_DAYS: CoreWorkDay[] = [
  { deptId: 'dept-meat',    weekday: 5, level: 'must' },      // 金曜
  { deptId: 'dept-meat',    weekday: 6, level: 'must' },      // 土曜
  { deptId: 'dept-meat',    weekday: 3, level: 'preferred' }, // 水曜
  { deptId: 'dept-cashier', weekday: 6, level: 'must' },      // 土曜
]
