import { intervalMinutes, retentionDays } from '../shared/targets.mjs'

export type Status = 'up' | 'down' | 'unknown'
export type Reason = 'http' | 'restricted' | 'redirect' | 'rate_limited' | 'timeout' | 'network'

export interface Result {
  id: string
  status: Status
  reason: Reason
  code: number | null
  elapsedMs: number | null
}

export interface Check {
  at: string
  results: Result[]
}

interface Incident {
  start: string
  end?: string
}

const statuses = new Set(['up', 'down', 'unknown'])
const reasons = new Set(['http', 'restricted', 'redirect', 'rate_limited', 'timeout', 'network'])

function isResult(value: unknown): value is Result {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<Result>
  return typeof result.id === 'string' && statuses.has(result.status ?? '') &&
    reasons.has(result.reason ?? '') &&
    (result.code === null || (typeof result.code === 'number' && Number.isInteger(result.code) &&
      result.code >= 100 && result.code <= 599)) &&
    (result.elapsedMs === null || (typeof result.elapsedMs === 'number' &&
      Number.isFinite(result.elapsedMs) && result.elapsedMs >= 0))
}

export function parseFeed(value: unknown): Check[] {
  if (!value || typeof value !== 'object' || !('checks' in value) ||
      !('version' in value) || value.version !== 1 || !Array.isArray(value.checks)) {
    throw new Error('Riwayat tidak dapat dibaca.')
  }
  return value.checks.filter((check): check is Check =>
    typeof check?.at === 'string' && Number.isFinite(Date.parse(check.at)) &&
    Date.parse(check.at) <= Date.now() + 2 * 60_000 &&
    Array.isArray(check.results) && check.results.every(isResult),
  ).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

const localTime = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function formatTime(at: string) {
  return localTime.format(Date.parse(at)) + ' WIB'
}

export function serviceHistory(checks: Check[], id: string, now: number) {
  const since = now - retentionDays * 24 * 60 * 60_000
  const allSamples = checks.flatMap((check) => {
    const reading = check.results.find((result) => result.id === id)
    return reading ? [{ at: check.at, ...reading }] : []
  })
  const samples = allSamples.filter(({ at }) => Date.parse(at) >= since)
  let up = 0
  let down = 0
  const incidents: Incident[] = []
  let active: Incident | undefined

  for (const sample of allSamples) {
    if (sample.status === 'down') {
      if (!active) {
        active = { start: sample.at }
        incidents.push(active)
      }
      if (Date.parse(sample.at) >= since) down += 1
    } else if (sample.status === 'up') {
      if (active) active.end = sample.at
      active = undefined
      if (Date.parse(sample.at) >= since) up += 1
    }
  }

  const slotMs = intervalMinutes * 60_000
  const slotCount = (24 * 60) / intervalMinutes
  const newestSlot = Math.floor(now / slotMs)
  const oldestSlot = newestSlot - slotCount + 1
  const slots = Array<(typeof samples)[number] | undefined>(slotCount).fill(undefined)
  for (const sample of samples) {
    const index = Math.floor(Date.parse(sample.at) / slotMs) - oldestSlot
    if (index >= 0 && index < slotCount) slots[index] = sample
  }

  return {
    latest: allSamples.at(-1),
    samples: samples.length,
    known: up + down,
    uptime: up + down === 0 ? null : up / (up + down),
    incidents: incidents.filter(({ end }) => !end || Date.parse(end) >= since).reverse(),
    slots,
  }
}
