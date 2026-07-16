// =============================================================
// REPAIR ENGINE — Phase 1.5
// =============================================================
// 生成後のシフトを「人が作ったような自然なシフト」に近づけるための修正エンジン。
//
// 修正の優先順位:
//   ① 必要人数不足（insufficient_staff）
//   ② 同日休みNG（same_day_off）
//   ③ 基本勤務日の維持（core work days）
//   ⑤ 4連休以上の解消（4+ consecutive off）
//   ⑥ 3連休の削減（3 consecutive off / 2回目以降のみ）
//   ④ 月2回2連休の確保 → Phase 2 予定（未実装）
//
// 基本方針:
//   - ゼロから再生成しない。最小限の変更のみ。
//   - 変更があれば繰り返す（最大 maxIterations 回）。
//   - 全変更を RepairLogEntry に記録する。
//   - "protected" な日（ロック・固定休ルール・承認済希望休）は変更しない。
// =============================================================

import type {
  Staff, PairConstraint, ShiftEntry, ShiftStatus,
  LeaveRequest, RequiredStaffConfig, Department,
  StaffStatusPeriod, CoreWorkDay, RepairLogEntry, StaffRule,
} from '../types'
import type { DayInfo } from './calendar'

// ──────────────────────────────────────────────────────────────
// 内部ユーティリティ
// ──────────────────────────────────────────────────────────────

const WD = ['日', '月', '火', '水', '木', '金', '土']

function makeKey(staffId: string, dateStr: string): string {
  return `${staffId}::${dateStr}`
}

function isOffStatus(s: ShiftStatus): boolean {
  return s === 'off' || s === 'paid_leave'
}

function isNonWork(s: ShiftStatus): boolean {
  return s !== 'work'
}

function getRequiredCount(
  deptId: string,
  dateStr: string,
  weekday: number,
  configs: RequiredStaffConfig[],
): { min: number; preferred: number } {
  const dc = configs.filter(c => c.deptId === deptId)
  const daily = dc.find(c => c.configType === 'daily' && c.targetDate === dateStr)
  if (daily) return { min: daily.minCount, preferred: daily.preferredCount }
  const range = dc.find(
    c => c.configType === 'range' && c.startDate != null && c.endDate != null &&
      dateStr >= c.startDate! && dateStr <= c.endDate!,
  )
  if (range) return { min: range.minCount, preferred: range.preferredCount }
  const wd = dc.find(c => c.configType === 'weekday' && c.weekday === weekday)
  if (wd) return { min: wd.minCount, preferred: wd.preferredCount }
  return { min: 0, preferred: 0 }
}

// ──────────────────────────────────────────────────────────────
// Protected 判定
// ──────────────────────────────────────────────────────────────

/**
 * この日のこのスタッフの状態を「出勤に変更できない」か判定する。
 * - ロック済み
 * - closed（定休日）
 * - absent（休職・退職期間）
 * - HARDルール固定休（曜日・祝日・日付指定）
 * - 承認済み希望休
 */
function isProtectedOff(
  staffId: string,
  dateStr: string,
  em: Map<string, ShiftEntry>,
  staffRules: StaffRule[],
  leaveRequests: LeaveRequest[],
  allDays: DayInfo[],
): boolean {
  const entry = em.get(makeKey(staffId, dateStr))
  if (entry?.isLocked) return true
  // closed・absent・paid_leave は変更不可。有給は会社の義務なので Repair Engine が取り消せない。
  if (entry?.status === 'closed' || entry?.status === 'absent' || entry?.status === 'paid_leave') return true

  const day = allDays.find(d => d.dateStr === dateStr)
  if (!day) return false

  for (const rule of staffRules.filter(r => r.staffId === staffId && r.isActive)) {
    switch (rule.ruleType) {
      case 'fixed_off_weekday':
        if ((rule.ruleValue.weekdays as number[]).includes(day.weekday)) return true
        break
      case 'fixed_off_holiday':
        if (day.isHoliday) return true
        break
      case 'fixed_off_date':
        if (rule.ruleValue.date === dateStr) return true
        break
    }
  }

  return leaveRequests.some(
    r => r.staffId === staffId && r.date === dateStr && r.status === 'approved',
  )
}

// ──────────────────────────────────────────────────────────────
// 代替休日の探索
// ──────────────────────────────────────────────────────────────

/**
 * スタッフに代替の休みを割り当てられる業務日を探す。
 * 評価スコアが低い日ほど良い候補（基本勤務日・連続休みへの悪影響を避ける）。
 */
function findAltOffDay(
  staffId: string,
  deptId: string,
  excludeDates: Set<string>,
  em: Map<string, ShiftEntry>,
  businessDays: DayInfo[],
  allDays: DayInfo[],
  pairConstraints: PairConstraint[],
  coreWorkDays: CoreWorkDay[],
): DayInfo | null {
  const candidates = businessDays.filter(d => {
    if (excludeDates.has(d.dateStr)) return false
    const e = em.get(makeKey(staffId, d.dateStr))
    if (!e || e.status !== 'work') return false   // 現在出勤の日のみ

    // ペア制約: 代替休みを置いてもOKか
    return pairConstraints
      .filter(p => p.staffId1 === staffId || p.staffId2 === staffId)
      .map(p => (p.staffId1 === staffId ? p.staffId2 : p.staffId1))
      .every(pid => {
        const pe = em.get(makeKey(pid, d.dateStr))
        return !pe || !isOffStatus(pe.status)
      })
  })

  if (candidates.length === 0) return null

  const scored = candidates.map(d => {
    let score = 0
    // 基本勤務日ペナルティ
    const cwd = coreWorkDays.find(c => c.deptId === deptId && c.weekday === d.weekday)
    if (cwd) score += cwd.level === 'must' ? 100 : 30

    // 隣接が非出勤 → 連続休みを悪化させるのでペナルティ
    const idx = allDays.findIndex(a => a.dateStr === d.dateStr)
    if (idx > 0) {
      const pe = em.get(makeKey(staffId, allDays[idx - 1].dateStr))
      if (pe && isNonWork(pe.status)) score += 25
    }
    if (idx < allDays.length - 1) {
      const ne = em.get(makeKey(staffId, allDays[idx + 1].dateStr))
      if (ne && isNonWork(ne.status)) score += 25
    }
    return { day: d, score }
  })

  scored.sort((a, b) => a.score - b.score)
  return scored[0].day
}

// ──────────────────────────────────────────────────────────────
// 変更ヘルパー
// ──────────────────────────────────────────────────────────────

function applyChange(
  em: Map<string, ShiftEntry>,
  staffId: string,
  staffName: string,
  dateStr: string,
  newStatus: ShiftStatus,
  log: RepairLogEntry[],
  iteration: number,
  category: string,
  detail: string,
): boolean {
  const key = makeKey(staffId, dateStr)
  const entry = em.get(key)
  if (!entry) return false
  const before = entry.status
  if (before === newStatus) return false
  entry.status = newStatus
  log.push({ iteration, category, staffId, staffName, date: dateStr, before, after: newStatus, detail })
  return true
}

// ──────────────────────────────────────────────────────────────
// Repair Config 型（公開）
// ──────────────────────────────────────────────────────────────

export type RepairConfig = {
  allDays: DayInfo[]
  businessDays: DayInfo[]
  staffList: Staff[]
  departments: Department[]
  staffRules: StaffRule[]
  leaveRequests: LeaveRequest[]
  statusPeriods: StaffStatusPeriod[]
  pairConstraints: PairConstraint[]
  requiredConfigs: RequiredStaffConfig[]
  coreWorkDays: CoreWorkDay[]
}

// ──────────────────────────────────────────────────────────────
// ① 必要人数不足の修正
// ──────────────────────────────────────────────────────────────
// 部門×日で最低人数を下回る場合、休んでいる（protected でない）スタッフを出勤に変更。
// 代替休みを探して補填する。

function repairInsufficientStaff(
  em: Map<string, ShiftEntry>,
  cfg: RepairConfig,
  log: RepairLogEntry[],
  iter: number,
): boolean {
  let changed = false
  const { allDays, businessDays, staffList, departments,
    pairConstraints, requiredConfigs, staffRules, leaveRequests, coreWorkDays } = cfg

  for (const day of businessDays) {
    for (const dept of departments) {
      const deptStaff = staffList.filter(
        s => s.primaryDeptId === dept.id && s.staffType !== 'arbeit' && s.isActive,
      )
      if (deptStaff.length === 0) continue

      const req = getRequiredCount(dept.id, day.dateStr, day.weekday, requiredConfigs)
      if (req.min === 0) continue

      const workCount = deptStaff.filter(s => {
        const e = em.get(makeKey(s.id, day.dateStr))
        return !e || e.status === 'work'
      }).length

      let shortage = req.min - workCount
      if (shortage <= 0) continue

      // 休んでいて変更可能なスタッフを候補に
      const offCandidates = deptStaff.filter(s => {
        const e = em.get(makeKey(s.id, day.dateStr))
        return e && isOffStatus(e.status) &&
          !isProtectedOff(s.id, day.dateStr, em, staffRules, leaveRequests, allDays)
      })

      for (const cand of offCandidates) {
        if (shortage <= 0) break
        const prev = em.get(makeKey(cand.id, day.dateStr))!.status
        const ok = applyChange(
          em, cand.id, cand.name, day.dateStr, 'work', log, iter, '①必要人数不足',
          `${dept.name} ${day.dateStr}（${WD[day.weekday]}）人数不足 → ${cand.name} を出勤に変更（最低${req.min}人）`,
        )
        if (!ok) continue
        changed = true
        shortage--

        // 代替休みを別日に割り当て
        const alt = findAltOffDay(
          cand.id, cand.primaryDeptId, new Set([day.dateStr]),
          em, businessDays, allDays, pairConstraints, coreWorkDays,
        )
        if (alt) {
          applyChange(
            em, cand.id, cand.name, alt.dateStr, prev, log, iter, '①代替休み',
            `${cand.name} ${alt.dateStr}（${WD[alt.weekday]}）に代替休みを割当`,
          )
        }
      }
    }
  }
  return changed
}

// ──────────────────────────────────────────────────────────────
// ② 同日休みNGの修正
// ──────────────────────────────────────────────────────────────
// ペア制約を違反する日を検出し、基本勤務日を優先的に出勤に戻す。

function repairSameDayOff(
  em: Map<string, ShiftEntry>,
  cfg: RepairConfig,
  log: RepairLogEntry[],
  iter: number,
): boolean {
  let changed = false
  const { allDays, businessDays, staffList, pairConstraints,
    staffRules, leaveRequests, coreWorkDays } = cfg

  for (const pair of pairConstraints) {
    if (pair.constraintType !== 'no_same_day_off') continue
    const s1 = staffList.find(s => s.id === pair.staffId1)
    const s2 = staffList.find(s => s.id === pair.staffId2)
    if (!s1 || !s2) continue

    for (const day of businessDays) {
      const e1 = em.get(makeKey(s1.id, day.dateStr))
      const e2 = em.get(makeKey(s2.id, day.dateStr))
      if (!e1 || !e2 || !isOffStatus(e1.status) || !isOffStatus(e2.status)) continue

      const p1 = isProtectedOff(s1.id, day.dateStr, em, staffRules, leaveRequests, allDays)
      const p2 = isProtectedOff(s2.id, day.dateStr, em, staffRules, leaveRequests, allDays)
      if (p1 && p2) continue  // 両方 protected なので修正不可

      // 基本勤務日の人を優先して出勤に戻す（「本来出勤すべき」から逸脱しているため）
      const core1 = coreWorkDays.some(c => c.deptId === s1.primaryDeptId && c.weekday === day.weekday && c.level === 'must')
      const core2 = coreWorkDays.some(c => c.deptId === s2.primaryDeptId && c.weekday === day.weekday && c.level === 'must')

      let target: Staff | null = null
      if (!p1 && core1) target = s1
      else if (!p2 && core2) target = s2
      else if (!p1) target = s1
      else if (!p2) target = s2
      if (!target) continue

      const prev = em.get(makeKey(target.id, day.dateStr))!.status
      applyChange(
        em, target.id, target.name, day.dateStr, 'work', log, iter, '②同日休みNG',
        `${s1.name}・${s2.name} 同日休みNG（${day.dateStr} ${WD[day.weekday]}）→ ${target.name} を出勤に変更`,
      )
      changed = true

      const alt = findAltOffDay(
        target.id, target.primaryDeptId, new Set([day.dateStr]),
        em, businessDays, allDays, pairConstraints, coreWorkDays,
      )
      if (alt) {
        applyChange(
          em, target.id, target.name, alt.dateStr, prev, log, iter, '②代替休み',
          `${target.name} ${alt.dateStr}（${WD[alt.weekday]}）に代替休みを割当`,
        )
      }
    }
  }
  return changed
}

// ──────────────────────────────────────────────────────────────
// ③ 基本勤務日の維持
// ──────────────────────────────────────────────────────────────
// must レベルの基本勤務日に「休日配分」で入った休みを出勤に戻す。
// protected（固定休ルール・承認済希望休）は変更しない。

function repairCoreWorkDays(
  em: Map<string, ShiftEntry>,
  cfg: RepairConfig,
  log: RepairLogEntry[],
  iter: number,
): boolean {
  let changed = false
  const { allDays, businessDays, staffList, pairConstraints,
    staffRules, leaveRequests, coreWorkDays } = cfg

  for (const staff of staffList.filter(s => s.isActive && s.staffType !== 'arbeit')) {
    for (const cwd of coreWorkDays.filter(c => c.deptId === staff.primaryDeptId && c.level === 'must')) {
      for (const day of businessDays.filter(d => d.weekday === cwd.weekday)) {
        const entry = em.get(makeKey(staff.id, day.dateStr))
        // 出勤・closed・absent はスキップ
        if (!entry || entry.status === 'work' || entry.status === 'closed' || entry.status === 'absent') continue
        // protected（固定休ルール・承認済希望休）はスキップ
        if (isProtectedOff(staff.id, day.dateStr, em, staffRules, leaveRequests, allDays)) continue

        const prev = entry.status
        applyChange(
          em, staff.id, staff.name, day.dateStr, 'work', log, iter, '③基本勤務日',
          `${staff.name} ${day.dateStr}（${WD[day.weekday]}曜）基本勤務日 → 出勤に変更`,
        )
        changed = true

        // 代替休みを別日に割り当て
        const alt = findAltOffDay(
          staff.id, staff.primaryDeptId, new Set([day.dateStr]),
          em, businessDays, allDays, pairConstraints, coreWorkDays,
        )
        if (alt) {
          applyChange(
            em, staff.id, staff.name, alt.dateStr, prev, log, iter, '③代替休み',
            `${staff.name} ${alt.dateStr}（${WD[alt.weekday]}）に代替休みを割当`,
          )
        }
      }
    }
  }
  return changed
}

// ──────────────────────────────────────────────────────────────
// ⑤ N連休以上の解消
// ──────────────────────────────────────────────────────────────
// N日以上連続で非出勤のスタッフを検出し、ストリークを最もうまく分割できる
// 「変更可能な off 日」を選んで出勤に変更する。

function repairConsecutiveOff(
  em: Map<string, ShiftEntry>,
  cfg: RepairConfig,
  log: RepairLogEntry[],
  iter: number,
  threshold: number,
  category: string,
): boolean {
  let changed = false
  const { allDays, businessDays, staffList, pairConstraints,
    staffRules, leaveRequests, coreWorkDays } = cfg

  for (const staff of staffList.filter(s => s.isActive && s.staffType !== 'arbeit')) {
    // 連続非出勤ストリークを収集
    const streaks: DayInfo[][] = []
    let cur: DayInfo[] = []

    for (const day of allDays) {
      const e = em.get(makeKey(staff.id, day.dateStr))
      if (isNonWork(e?.status ?? 'work')) {
        cur.push(day)
      } else {
        if (cur.length >= threshold) streaks.push([...cur])
        cur = []
      }
    }
    if (cur.length >= threshold) streaks.push([...cur])

    for (const streak of streaks) {
      // 変更可能な off 日（closed・absent・protected は変えられない）
      const changeable = streak.filter(d => {
        const e = em.get(makeKey(staff.id, d.dateStr))
        return e && isOffStatus(e.status) &&
          !isProtectedOff(staff.id, d.dateStr, em, staffRules, leaveRequests, allDays)
      })
      if (changeable.length === 0) continue

      // 左右の最大連続長が最小になる日を選ぶ（ストリークを最も均等に分割）
      let bestDay: DayInfo | null = null
      let bestSplit = Infinity
      for (const cand of changeable) {
        const idx = streak.findIndex(d => d.dateStr === cand.dateStr)
        const splitMax = Math.max(idx, streak.length - 1 - idx)
        if (splitMax < bestSplit) {
          bestSplit = splitMax
          bestDay = cand
        }
      }
      if (!bestDay) continue

      const prev = em.get(makeKey(staff.id, bestDay.dateStr))!.status
      const bestIdx = streak.findIndex(d => d.dateStr === bestDay!.dateStr)
      applyChange(
        em, staff.id, staff.name, bestDay.dateStr, 'work', log, iter, category,
        `${staff.name} ${streak.length}連休（${streak[0].dateStr}〜${streak[streak.length - 1].dateStr}）` +
        ` → ${bestDay.dateStr}（${WD[bestDay.weekday]}）を出勤に変更` +
        `（最大${Math.max(bestIdx, streak.length - 1 - bestIdx)}連休に削減）`,
      )
      changed = true

      // 代替休みはストリーク外に割り当て（ストリーク内は除外）
      const excludeSet = new Set(streak.map(d => d.dateStr))
      const alt = findAltOffDay(
        staff.id, staff.primaryDeptId, excludeSet,
        em, businessDays, allDays, pairConstraints, coreWorkDays,
      )
      if (alt) {
        applyChange(
          em, staff.id, staff.name, alt.dateStr, prev, log, iter, `${category}代替`,
          `${staff.name} ${alt.dateStr}（${WD[alt.weekday]}）に代替休みを割当`,
        )
      }
    }
  }
  return changed
}

// ──────────────────────────────────────────────────────────────
// メイン: Repair Engine ループ
// ──────────────────────────────────────────────────────────────

/**
 * entryMap をインプレースで修正し、変更ログを返す。
 * 最大 maxIterations 回ループし、変更がなければ早期終了する。
 */
export function runRepairEngine(
  entryMap: Map<string, ShiftEntry>,
  config: RepairConfig,
  maxIterations = 3,
): RepairLogEntry[] {
  const log: RepairLogEntry[] = []

  for (let iter = 1; iter <= maxIterations; iter++) {
    let anyChanged = false

    // ①②③ は HARD 違反なので毎回実行
    if (repairInsufficientStaff(entryMap, config, log, iter)) anyChanged = true
    if (repairSameDayOff(entryMap, config, log, iter)) anyChanged = true
    if (repairCoreWorkDays(entryMap, config, log, iter)) anyChanged = true

    // ⑤ 4連休以上の解消
    if (repairConsecutiveOff(entryMap, config, log, iter, 4, '⑤4連休解消')) anyChanged = true

    // ⑥ 3連休の削減（2回目以降: ①②③⑤ が落ち着いてから実行）
    if (iter >= 2) {
      if (repairConsecutiveOff(entryMap, config, log, iter, 3, '⑥3連休削減')) anyChanged = true
    }

    if (!anyChanged) break   // 変更なし → 収束済み
  }

  return log
}

// ④ 月2回2連休の確保 → Phase 2 予定
// 孤立した休み日をグループ化して2連休を作る処理は、
// 現状のルール・制約体系では実装が複雑なため次フェーズで対応予定。
