// ABOUTME: 日期格式化工具，固定使用 Asia/Shanghai 时区
// ABOUTME: 提供 YYYY-MM-DD 和 YYYY-MM 格式的日期字符串

const TIMEZONE = 'Asia/Shanghai'

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const monthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
})

export function formatLocalDate(date: Date): string {
  return dateFormatter.format(date)
}

export function formatLocalMonth(date: Date): string {
  const parts = monthFormatter.formatToParts(date)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  return `${y}-${m}`
}
