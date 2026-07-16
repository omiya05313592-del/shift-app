import {
  getDaysInMonth, getDay, format, parseISO,
  addDays, isSameDay, startOfMonth,
} from 'date-fns'
import type { BusinessDayException } from '../types'

export const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

// 日本の祝日（簡易版 — 2025〜2026年固定）
const JP_HOLIDAYS_2025 = [
  '2025-01-01','2025-01-13','2025-02-11','2025-02-23','2025-02-24',
  '2025-03-20','2025-04-29','2025-05-03','2025-05-04','2025-05-05','2025-05-06',
  '2025-07-21','2025-08-11','2025-09-15','2025-09-23','2025-10-13',
  '2025-11-03','2025-11-23','2025-11-24','2025-12-23',
]
const JP_HOLIDAYS_2026 = [
  '2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20',
  '2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06',
  '2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12',
  '2026-11-03','2026-11-23',
]
const JP_HOLIDAYS = new Set([...JP_HOLIDAYS_2025, ...JP_HOLIDAYS_2026])

export function isHoliday(dateStr: string): boolean {
  return JP_HOLIDAYS.has(dateStr)
}

export type DayInfo = {
  dateStr: string      // YYYY-MM-DD
  date: Date
  weekday: number      // 0=日 ... 6=土
  weekdayName: string
  isHoliday: boolean
  isRegularClosed: boolean  // 火曜定休
  isBusinessDay: boolean    // 営業日かどうか
}

/** 指定年月の全日情報を生成 */
export function buildMonthDays(
  year: number,
  month: number,
  exceptions: BusinessDayException[] = [],
): DayInfo[] {
  const daysInMonth = getDaysInMonth(new Date(year, month - 1))
  const result: DayInfo[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    const dateStr = format(date, 'yyyy-MM-dd')
    const weekday = getDay(date)
    const holiday = isHoliday(dateStr)
    const isRegularClosed = weekday === 2  // 火曜

    const exception = exceptions.find(e => e.date === dateStr)
    let isBusinessDay: boolean

    if (exception) {
      isBusinessDay = exception.exceptionType === 'open'
    } else {
      isBusinessDay = !isRegularClosed
    }

    result.push({
      dateStr,
      date,
      weekday,
      weekdayName: WEEKDAY_NAMES[weekday],
      isHoliday: holiday,
      isRegularClosed,
      isBusinessDay,
    })
  }

  return result
}

/** 週ごとにグループ化（7列カレンダー） */
export function groupByWeek(days: DayInfo[]): DayInfo[][] {
  const weeks: DayInfo[][] = []
  let week: DayInfo[] = []

  // 先頭の曜日に合わせて空白埋め
  const firstWeekday = days[0].weekday
  for (let i = 0; i < firstWeekday; i++) {
    week.push(null as unknown as DayInfo)
  }

  for (const day of days) {
    week.push(day)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null as unknown as DayInfo)
    weeks.push(week)
  }
  return weeks
}

export { format, getDaysInMonth, getDay, addDays, isSameDay, startOfMonth, parseISO }
