// =============================================================
// SHIFT GENERATOR — Phase 1.5
// =============================================================
// 処理パイプライン（この順に実行）:
//   Step 1: ロック済みエントリを復元（最高優先度・不変）
//   Step 2: 定休日を 'closed' で埋める
//   Step 2.5: 休職中・退職済スタッフの対象日を 'absent' で埋める
//   Step 3: HARDルール適用（固定休: 曜日・祝日・日付指定）
//   Step 4: 希望休（承認済み）を反映
//   Step 5: 残り休み日数を分散配置（同日休みNG 考慮）
//   Step 6: 空きエントリを 'work' で埋める
//   Step 7: バリデーション（同日休みNG / 月休み未達 / 必要人数不足）
//   Step 8: デバッグ分析（4連休・土曜人数不足）
//
// ルールの追加方法:
//   1. types/index.ts の RuleType に新しいタイプを追加
//   2. Step 3 の switch に case を追加（または新 Step を挿入）
//   3. dummy.ts / Supabase のルールデータに設定を追加
// =============================================================

import type {
  Staff, StaffRule, PairConstraint, ShiftEntry, ShiftStatus,
  LeaveRequest, BusinessDayException, RequiredStaffConfig,
  Department, Violation, StaffStatusPeriod, CoreWorkDay, UnavailableDate, ArbeitAvailability,
  ShiftDebugInfo, ShiftDebugPhaseLog, ShiftDebugConsecutiveOff, ShiftDebugSaturdayIssue,
} from '../types'
import { EXCLUDED_WORK_STATUSES } from '../types'
import { buildMonthDays } from './calendar'
import type { DayInfo } from './calendar'
import { runRepairEngine } from './repairEngine'

// =============================================================
// 入力 / 出力型
// =============================================================

export type ShiftConfig = {
  year: number
  month: number
  staffList: Staff[]
  departments: Department[]
  staffRules: StaffRule[]
  pairConstraints: PairConstraint[]
  requiredConfigs: RequiredStaffConfig[]
  leaveRequests: LeaveRequest[]
  statusPeriods: StaffStatusPeriod[]
  exceptions: BusinessDayException[]
  lockedEntries: ShiftEntry[]
  coreWorkDays: CoreWorkDay[]
  unavailableDates: UnavailableDate[]
  arbeitAvailabilities: ArbeitAvailability[]
  arbeitMaxPerDay: number
}

export type GenerateResult = {
  entries: ShiftEntry[]
  violations: Violation[]
  debugInfo: ShiftDebugInfo
}

// =============================================================
// ユーティリティ
// =============================================================

type EntryMap = Map<string, ShiftEntry>

function makeKey(staffId: string, dateStr: string): string {
  return `${staffId}::${dateStr}`
}

function isOffStatus(status: ShiftStatus): boolean {
  return status === 'off' || status === 'paid_leave'
}

/** ロックされていなければステータスを上書き。変更があれば true を返す */
function setStatus(
  map: EntryMap,
  reasons: Map<string, string>,
  staffId: string,
  dateStr: string,
  status: ShiftStatus,
  reason: string,
): boolean {
  const key = makeKey(staffId, dateStr)
  const existing = map.get(key)
  if (existing?.isLocked) return false
  const changed = !existing || existing.status !== status
  if (existing) {
    existing.status = status
  } else {
    map.set(key, { staffId, date: dateStr, status, isLocked: false })
  }
  if (changed) reasons.set(key, reason)
  return changed
}

/** 指定スタッフが指定日に休めるか（同日休みNG ペアチェック） */
function canTakeOff(
  staffId: string,
  dateStr: string,
  map: EntryMap,
  pairConstraints: PairConstraint[],
): boolean {
  return pairConstraints
    .filter(p => p.staffId1 === staffId || p.staffId2 === staffId)
    .map(p => (p.staffId1 === staffId ? p.staffId2 : p.staffId1))
    .every(partnerId => {
      const entry = map.get(makeKey(partnerId, dateStr))
      return !entry || !isOffStatus(entry.status)
    })
}

/** 業務日の公休（'off'）のみをカウント。有給（'paid_leave'）は別カウントのため含めない */
function countBusinessOff(staffId: string, businessDays: DayInfo[], map: EntryMap): number {
  return businessDays.filter(d => {
    const entry = map.get(makeKey(staffId, d.dateStr))
    return entry && entry.status === 'off'
  }).length
}

/** 指定スタッフが指定日にシフト対象外（休職中・退職済）かどうか */
function isExcludedOnDay(
  staffId: string,
  dateStr: string,
  statusPeriods: StaffStatusPeriod[],
): boolean {
  return statusPeriods.some(
    p =>
      p.staffId === staffId &&
      EXCLUDED_WORK_STATUSES.includes(p.status) &&
      p.startDate <= dateStr &&
      (!p.endDate || p.endDate >= dateStr),
  )
}

/** Fisher-Yates シャッフル（新配列を返す） */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// =============================================================
// 必要人数ヘルパー（優先順: daily > range > weekday）
// =============================================================

export function getRequiredCount(
  deptId: string,
  dateStr: string,
  weekday: number,
  configs: RequiredStaffConfig[],
): { min: number; preferred: number } {
  const dc = configs.filter(c => c.deptId === deptId)

  const daily = dc.find(c => c.configType === 'daily' && c.targetDate === dateStr)
  if (daily) return { min: daily.minCount, preferred: daily.preferredCount }

  const range = dc.find(
    c =>
      c.configType === 'range' &&
      c.startDate != null &&
      c.endDate != null &&
      dateStr >= c.startDate &&
      dateStr <= c.endDate,
  )
  if (range) return { min: range.minCount, preferred: range.preferredCount }

  const weekdayCfg = dc.find(c => c.configType === 'weekday' && c.weekday === weekday)
  if (weekdayCfg) return { min: weekdayCfg.minCount, preferred: weekdayCfg.preferredCount }

  return { min: 0, preferred: 0 }
}

// =============================================================
// デバッグ分析ヘルパー
// =============================================================

const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土']

/** 4連休以上のスタッフを検出（定休・公休・有給・欠勤すべて含む） */
function analyzeConsecutiveOff(
  allDays: DayInfo[],
  targetStaff: Staff[],
  entryMap: EntryMap,
  reasons: Map<string, string>,
  threshold = 4,
): ShiftDebugConsecutiveOff[] {
  const issues: ShiftDebugConsecutiveOff[] = []

  for (const staff of targetStaff) {
    let streak: { date: string; status: ShiftStatus; reason: string }[] = []

    for (const day of allDays) {
      const key = makeKey(staff.id, day.dateStr)
      const entry = entryMap.get(key)
      const status = entry?.status ?? 'work'
      const isNonWork = status !== 'work'

      if (isNonWork) {
        streak.push({
          date: day.dateStr,
          status,
          reason: reasons.get(key) ?? '不明',
        })
      } else {
        if (streak.length >= threshold) {
          issues.push({
            staffId: staff.id,
            staffName: staff.name,
            start: streak[0].date,
            end: streak[streak.length - 1].date,
            length: streak.length,
            dayDetails: streak,
          })
        }
        streak = []
      }
    }
    if (streak.length >= threshold) {
      issues.push({
        staffId: staff.id,
        staffName: staff.name,
        start: streak[0].date,
        end: streak[streak.length - 1].date,
        length: streak.length,
        dayDetails: streak,
      })
    }
  }

  return issues
}

/** 土曜日の人数不足詳細（preferredCount に満たない土曜を全件出力） */
function analyzeSaturdayIssues(
  businessDays: DayInfo[],
  departments: Department[],
  activeStaff: Staff[],
  entryMap: EntryMap,
  requiredConfigs: RequiredStaffConfig[],
  reasons: Map<string, string>,
): ShiftDebugSaturdayIssue[] {
  const issues: ShiftDebugSaturdayIssue[] = []

  const saturdays = businessDays.filter(d => d.weekday === 6)

  for (const day of saturdays) {
    for (const dept of departments) {
      const deptStaff = activeStaff.filter(
        s => s.primaryDeptId === dept.id && s.staffType !== 'arbeit',
      )
      if (deptStaff.length === 0) continue

      const req = getRequiredCount(dept.id, day.dateStr, 6, requiredConfigs)
      if (req.preferred === 0 && req.min === 0) continue

      const offStaff = deptStaff.filter(s => {
        const entry = entryMap.get(makeKey(s.id, day.dateStr))
        return entry && entry.status !== 'work'
      })
      const workCount = deptStaff.length - offStaff.length

      // 推奨人数に満たない、または最低人数に満たない土曜のみ記録
      if (workCount < req.preferred) {
        issues.push({
          date: day.dateStr,
          deptId: dept.id,
          deptName: dept.name,
          workCount,
          minCount: req.min,
          preferredCount: req.preferred,
          offStaff: offStaff.map(s => ({
            staffId: s.id,
            name: s.name,
            reason: reasons.get(makeKey(s.id, day.dateStr)) ?? '不明',
          })),
        })
      }
    }
  }

  return issues
}

// =============================================================
// メイン: シフト生成
// =============================================================

export function generateShift(config: ShiftConfig): GenerateResult {
  const {
    year, month,
    staffList, departments, staffRules, pairConstraints,
    requiredConfigs, leaveRequests, statusPeriods, exceptions, lockedEntries,
    unavailableDates, arbeitAvailabilities, arbeitMaxPerDay,
  } = config

  const activeStaff = staffList.filter(s => s.isActive)

  // カレンダー構築
  const allDays = buildMonthDays(year, month, exceptions)
  const businessDays = allDays.filter(d => d.isBusinessDay)
  const closedDayCount = allDays.length - businessDays.length

  // エントリマップ（staffId::date → ShiftEntry）
  const entryMap: EntryMap = new Map()

  // 理由マップ（staffId::date → 人間が読めるステータスの理由）
  const reasons = new Map<string, string>()

  // Phase ログ
  const phaseLogs: ShiftDebugPhaseLog[] = []

  // ────────────────────────────────────────────────────────
  // Step 1: ロック済みエントリを復元（最高優先度）
  // ────────────────────────────────────────────────────────
  {
    const details: string[] = []
    for (const entry of lockedEntries) {
      entryMap.set(makeKey(entry.staffId, entry.date), { ...entry })
      reasons.set(makeKey(entry.staffId, entry.date), 'ロック済み')
      details.push(`${entry.date} ${staffList.find(s => s.id === entry.staffId)?.name ?? entry.staffId}`)
    }
    phaseLogs.push({
      phase: 'Step 1: ロック復元',
      count: lockedEntries.length,
      details: details.slice(0, 10),
    })
  }

  // ────────────────────────────────────────────────────────
  // Step 2: 定休日を 'closed' で埋める
  // ────────────────────────────────────────────────────────
  {
    let count = 0
    const details: string[] = []
    const closedDays = allDays.filter(d => !d.isBusinessDay)
    for (const day of closedDays) {
      for (const staff of activeStaff) {
        const key = makeKey(staff.id, day.dateStr)
        if (!entryMap.has(key)) {
          entryMap.set(key, { staffId: staff.id, date: day.dateStr, status: 'closed', isLocked: false })
          reasons.set(key, `定休日（${WEEKDAY_JP[day.weekday]}）`)
          count++
        }
      }
      if (details.length < 5) details.push(`${day.dateStr}（${WEEKDAY_JP[day.weekday]}）全スタッフ定休`)
    }
    phaseLogs.push({ phase: 'Step 2: 定休日設定', count, details })
  }

  // ────────────────────────────────────────────────────────
  // Step 2.5: 休職中・退職済スタッフの対象日を 'absent' で埋める
  // ────────────────────────────────────────────────────────
  {
    let count = 0
    const details: string[] = []
    for (const day of allDays) {
      for (const staff of activeStaff) {
        if (!isExcludedOnDay(staff.id, day.dateStr, statusPeriods)) continue
        const key = makeKey(staff.id, day.dateStr)
        if (!entryMap.has(key)) {
          entryMap.set(key, { staffId: staff.id, date: day.dateStr, status: 'absent', isLocked: false })
          const period = statusPeriods.find(
            p => p.staffId === staff.id &&
              EXCLUDED_WORK_STATUSES.includes(p.status) &&
              p.startDate <= day.dateStr &&
              (!p.endDate || p.endDate >= day.dateStr)
          )
          reasons.set(key, `休職/退職期間（${period?.reason ?? '理由未登録'}）`)
          count++
          if (details.length < 5) details.push(`${staff.name}: ${day.dateStr} absent`)
        }
      }
    }
    phaseLogs.push({ phase: 'Step 2.5: 休職/退職期間', count, details })
  }

  // ────────────────────────────────────────────────────────
  // Step 3: HARDルール適用（固定休・固定出勤）
  // ────────────────────────────────────────────────────────
  {
    const activeRules = staffRules.filter(r => r.isActive)
    let count = 0
    const details: string[] = []

    for (const rule of activeRules) {
      const staff = activeStaff.find(s => s.id === rule.staffId)
      if (!staff) continue

      switch (rule.ruleType) {
        case 'fixed_off_weekday': {
          const weekdays = rule.ruleValue.weekdays as number[]
          const wdNames = weekdays.map(w => WEEKDAY_JP[w]).join('・')
          for (const day of businessDays) {
            if (weekdays.includes(day.weekday)) {
              const changed = setStatus(
                entryMap, reasons, staff.id, day.dateStr, 'off',
                `固定休（曜日固定: ${wdNames}曜）`,
              )
              if (changed) {
                count++
                if (details.length < 10)
                  details.push(`${staff.name} ${day.dateStr}（${WEEKDAY_JP[day.weekday]}）→ 曜日固定休`)
              }
            }
          }
          break
        }

        case 'fixed_off_holiday': {
          for (const day of businessDays) {
            if (day.isHoliday) {
              const changed = setStatus(
                entryMap, reasons, staff.id, day.dateStr, 'off',
                '固定休（祝日固定）',
              )
              if (changed) {
                count++
                if (details.length < 10)
                  details.push(`${staff.name} ${day.dateStr} → 祝日固定休`)
              }
            }
          }
          break
        }

        case 'fixed_off_date': {
          const date = rule.ruleValue.date as string
          const changed = setStatus(entryMap, reasons, staff.id, date, 'off', `固定休（日付指定: ${date}）`)
          if (changed) { count++; details.push(`${staff.name} ${date} → 日付固定休`) }
          break
        }

        case 'fixed_work_date': {
          const date = rule.ruleValue.date as string
          const changed = setStatus(entryMap, reasons, staff.id, date, 'work', `固定出勤（日付指定: ${date}）`)
          if (changed) { count++; details.push(`${staff.name} ${date} → 日付固定出勤`) }
          break
        }

        default:
          break
      }
    }
    phaseLogs.push({ phase: 'Step 3: HARDルール（固定休/出勤）', count, details })
  }

  // ────────────────────────────────────────────────────────
  // Step 3.5: アルバイト不可日 / 出勤可能日を 'off' で埋める
  // ────────────────────────────────────────────────────────
  {
    let count = 0
    const details: string[] = []

    // UnavailableDate（直接指定の不可日）
    for (const ud of unavailableDates) {
      const staff = activeStaff.find(s => s.id === ud.staffId && s.staffType === 'arbeit')
      if (!staff) continue
      const day = allDays.find(d => d.dateStr === ud.date)
      if (!day?.isBusinessDay) continue
      const changed = setStatus(entryMap, reasons, ud.staffId, ud.date, 'off', 'アルバイト不可日')
      if (changed) {
        count++
        if (details.length < 10) details.push(`${staff.name} ${ud.date} → 不可日`)
      }
    }

    // ArbeitAvailability（出勤可能日リスト → 含まれない営業日を全て off）
    const monthAvailabilities = arbeitAvailabilities.filter(a => a.year === year && a.month === month)
    for (const avail of monthAvailabilities) {
      const staff = activeStaff.find(s => s.id === avail.staffId && s.staffType === 'arbeit')
      if (!staff) continue
      const availSet = new Set(avail.availableDates)
      for (const day of businessDays) {
        if (availSet.has(day.dateStr)) continue
        const changed = setStatus(entryMap, reasons, avail.staffId, day.dateStr, 'off', '出勤可能日外')
        if (changed) {
          count++
          if (details.length < 10) details.push(`${staff.name} ${day.dateStr} → 出勤可能日外`)
        }
      }
    }

    phaseLogs.push({ phase: 'Step 3.5: アルバイト不可日/出勤可能日', count, details })
  }

  // ────────────────────────────────────────────────────────
  // Step 4: 希望休（承認済み）を反映
  // ────────────────────────────────────────────────────────
  {
    let count = 0
    const details: string[] = []
    for (const req of leaveRequests) {
      if (req.status !== 'approved') continue
      const existing = entryMap.get(makeKey(req.staffId, req.date))
      if (existing?.isLocked) continue
      if (existing?.status === 'closed') continue
      const typeLabel = req.requestType === 'off' ? '公休' : '有給'
      const changed = setStatus(
        entryMap, reasons, req.staffId, req.date, req.requestType,
        `希望休（承認済・${typeLabel}）`,
      )
      // 承認済み希望休は確定なので自動ロック（後から長押しで解除可能）
      const entry = entryMap.get(makeKey(req.staffId, req.date))
      if (entry) entry.isLocked = true
      if (changed) {
        count++
        const name = staffList.find(s => s.id === req.staffId)?.name ?? req.staffId
        details.push(`${name} ${req.date} → ${typeLabel}（承認済希望休・ロック）`)
      }
    }
    phaseLogs.push({ phase: 'Step 4: 希望休（承認済）', count, details })
  }

  // ────────────────────────────────────────────────────────
  // Step 5: 残り休み日数を分散配置
  // ────────────────────────────────────────────────────────
  {
    let count = 0
    const details: string[] = []

    for (const staff of activeStaff) {
      // monthlyOffDays = 0 のアルバイトはスキップ（上限調整で処理）
      if (staff.staffType === 'arbeit' && staff.monthlyOffDays === 0) continue

      const businessOffNeeded = Math.max(0, staff.monthlyOffDays - closedDayCount)
      const currentOff = countBusinessOff(staff.id, businessDays, entryMap)
      const remaining = businessOffNeeded - currentOff

      if (remaining <= 0) continue

      const candidates = businessDays.filter(d => {
        const entry = entryMap.get(makeKey(staff.id, d.dateStr))
        return !entry || entry.status === 'work'
      })

      let placed = 0
      for (const day of shuffle(candidates)) {
        if (placed >= remaining) break
        if (!canTakeOff(staff.id, day.dateStr, entryMap, pairConstraints)) {
          // ペア制約で休めない場合はスキップ
          continue
        }
        const changed = setStatus(
          entryMap, reasons, staff.id, day.dateStr, 'off',
          `休日配分（残${remaining - placed}日 / ${staff.monthlyOffDays}日中）`,
        )
        if (changed) {
          count++
          placed++
          if (details.length < 10)
            details.push(`${staff.name} ${day.dateStr}（${WEEKDAY_JP[day.weekday]}）→ 休日配分`)
        }
      }

      // 配置不足の場合に記録
      if (placed < remaining) {
        details.push(`⚠ ${staff.name}: ${remaining}日必要だが${placed}日しか配置できなかった（ペア制約により）`)
      }
    }
    phaseLogs.push({ phase: 'Step 5: 休日配分（ランダム分散）', count, details })
  }

  // ────────────────────────────────────────────────────────
  // Step 5.5: アルバイト 1日上限調整
  // ────────────────────────────────────────────────────────
  // アルバイトは「何人以上にしない」という上限で管理する。
  // 上限を超えた日はランダムに off にする（monthlyOffDays = 0 のバイトのみ対象）。
  {
    let count = 0
    const details: string[] = []
    const arbeitOnly = activeStaff.filter(s => s.staffType === 'arbeit' && s.monthlyOffDays === 0)

    if (arbeitOnly.length > 0 && arbeitMaxPerDay > 0) {
      for (const day of businessDays) {
        const working = arbeitOnly.filter(s => {
          const e = entryMap.get(makeKey(s.id, day.dateStr))
          return !e || e.status === 'work'
        })
        if (working.length <= arbeitMaxPerDay) continue

        const toOff = shuffle(working).slice(arbeitMaxPerDay)
        for (const staff of toOff) {
          const changed = setStatus(
            entryMap, reasons, staff.id, day.dateStr, 'off',
            `アルバイト上限調整（上限${arbeitMaxPerDay}人）`,
          )
          if (changed) {
            count++
            if (details.length < 10) details.push(`${staff.name} ${day.dateStr}（${WEEKDAY_JP[day.weekday]}）→ 上限調整`)
          }
        }
      }
    }
    phaseLogs.push({ phase: 'Step 5.5: アルバイト上限調整', count, details })
  }

  // ────────────────────────────────────────────────────────
  // Step 6: 空きエントリを 'work' で埋める
  // ────────────────────────────────────────────────────────
  {
    let count = 0
    for (const staff of activeStaff) {
      for (const day of allDays) {
        const key = makeKey(staff.id, day.dateStr)
        if (!entryMap.has(key)) {
          entryMap.set(key, { staffId: staff.id, date: day.dateStr, status: 'work', isLocked: false })
          reasons.set(key, '自動出勤（デフォルト）')
          count++
        }
      }
    }
    phaseLogs.push({ phase: 'Step 6: 空きを出勤で埋める', count, details: [`${count}エントリを出勤に設定`] })
  }

  // ────────────────────────────────────────────────────────
  // Step 7: Repair 前バリデーション（Phase ログ用・参考値）
  // ────────────────────────────────────────────────────────
  // Repair 後の最終バリデーションは Step 8 の後で行う。
  // ここでは Phase ログ記録のみ実施。
  {
    let preRepairViolations = 0

    // 同日休みNGチェック
    for (const pair of pairConstraints) {
      for (const day of businessDays) {
        const e1 = entryMap.get(makeKey(pair.staffId1, day.dateStr))
        const e2 = entryMap.get(makeKey(pair.staffId2, day.dateStr))
        if (e1 && e2 && isOffStatus(e1.status) && isOffStatus(e2.status)) preRepairViolations++
      }
    }
    // 必要人数不足チェック
    for (const day of businessDays) {
      for (const dept of departments) {
        const deptStaff = activeStaff.filter(s => s.primaryDeptId === dept.id && s.staffType !== 'arbeit')
        const workCount = deptStaff.filter(s => {
          const entry = entryMap.get(makeKey(s.id, day.dateStr))
          return !entry || entry.status === 'work'
        }).length
        const req = getRequiredCount(dept.id, day.dateStr, day.weekday, requiredConfigs)
        if (req.min > 0 && workCount < req.min) preRepairViolations++
      }
    }

    phaseLogs.push({
      phase: 'Step 7: Repair前バリデーション',
      count: preRepairViolations,
      details: [`同日休みNG・人数不足 計${preRepairViolations}件 → Repair Engineで修正へ`],
    })
  }

  // ────────────────────────────────────────────────────────
  // Step 8: Repair Engine（最大3回ループ）
  // ────────────────────────────────────────────────────────
  const repairLog = runRepairEngine(entryMap, {
    allDays,
    businessDays,
    staffList: activeStaff,
    departments,
    staffRules,
    leaveRequests,
    statusPeriods,
    pairConstraints,
    requiredConfigs,
    coreWorkDays: config.coreWorkDays,
  })

  // Repair後のエントリを reasons に反映（変更されたエントリの理由を更新）
  for (const entry of repairLog) {
    const key = `${entry.staffId}::${entry.date}`
    reasons.set(key, `[Repair ${entry.iteration}] ${entry.category}: ${entry.detail}`)
  }

  // Repair後のバリデーション（violations を更新）
  const repairedViolations: Violation[] = []

  // 同日休みNGチェック
  for (const pair of pairConstraints) {
    for (const day of businessDays) {
      const e1 = entryMap.get(makeKey(pair.staffId1, day.dateStr))
      const e2 = entryMap.get(makeKey(pair.staffId2, day.dateStr))
      if (e1 && e2 && isOffStatus(e1.status) && isOffStatus(e2.status)) {
        const s1 = staffList.find(s => s.id === pair.staffId1)
        const s2 = staffList.find(s => s.id === pair.staffId2)
        repairedViolations.push({
          type: 'same_day_off',
          date: day.dateStr,
          staffIds: [pair.staffId1, pair.staffId2],
          message: `${s1?.name}・${s2?.name} が同日休み（${day.dateStr}）`,
        })
      }
    }
  }

  // 必要人数不足チェック
  for (const day of businessDays) {
    for (const dept of departments) {
      const deptStaff = activeStaff.filter(
        s => s.primaryDeptId === dept.id && s.staffType !== 'arbeit',
      )
      const workCount = deptStaff.filter(s => {
        const entry = entryMap.get(makeKey(s.id, day.dateStr))
        return !entry || entry.status === 'work'
      }).length
      const req = getRequiredCount(dept.id, day.dateStr, day.weekday, requiredConfigs)
      if (req.min > 0 && workCount < req.min) {
        repairedViolations.push({
          type: 'insufficient_staff',
          date: day.dateStr,
          deptId: dept.id,
          message: `${dept.name} 人数不足（${day.dateStr}：${workCount}人 / 最低${req.min}人）`,
        })
      }
    }
  }

  // 月休み日数未達チェック（Repair後）
  for (const staff of activeStaff) {
    if (staff.staffType === 'arbeit') continue
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEnd = allDays[allDays.length - 1]?.dateStr ?? monthStart
    const hasAbsentPeriod = statusPeriods.some(
      p => p.staffId === staff.id &&
        EXCLUDED_WORK_STATUSES.includes(p.status) &&
        p.startDate <= monthEnd && (!p.endDate || p.endDate >= monthStart),
    )
    if (hasAbsentPeriod) continue
    // 公休（'off'）＋定休（'closed'）のみカウント。有給は別カウントのため除外。
    const totalOff = allDays.filter(d => {
      const entry = entryMap.get(makeKey(staff.id, d.dateStr))
      return entry && (entry.status === 'off' || entry.status === 'closed')
    }).length
    if (totalOff < staff.monthlyOffDays) {
      repairedViolations.push({
        type: 'off_days_unmet',
        staffIds: [staff.id],
        message: `${staff.name} の公休未達（${totalOff}日 / ${staff.monthlyOffDays}日）`,
      })
    }
  }

  // ────────────────────────────────────────────────────────
  // Step 9: デバッグ分析（Repair後の状態で実行）
  // ────────────────────────────────────────────────────────
  const nonArbitStaff = activeStaff.filter(s => s.staffType !== 'arbeit')

  const consecutiveOffIssues = analyzeConsecutiveOff(allDays, nonArbitStaff, entryMap, reasons, 4)
  const saturdayIssues = analyzeSaturdayIssues(businessDays, departments, activeStaff, entryMap, requiredConfigs, reasons)

  const debugInfo: ShiftDebugInfo = {
    phaseLogs,
    consecutiveOffIssues,
    saturdayIssues,
    reasonMap: Object.fromEntries(reasons),
    repairLog,
  }

  return {
    entries: [...entryMap.values()],
    violations: repairedViolations,
    debugInfo,
  }
}
