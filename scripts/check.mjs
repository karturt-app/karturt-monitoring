import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { retentionDays, targets } from '../shared/targets.mjs'

const timeoutMs = 10_000

export function classifyResponse(status, headers) {
  const location = status >= 300 && status < 400
    ? URL.parse(headers.get('location') ?? '')
    : null
  const vercelAuth = location && (location.hostname === 'vercel.com' || location.hostname.endsWith('.vercel.com')) &&
    /\b(?:sso|login|auth)\b/.test(location.pathname)
  if ([401, 403].includes(status) || headers.get('x-vercel-mitigated') === 'challenge' || vercelAuth) {
    return { status: 'unknown', reason: 'restricted' }
  }
  if (status >= 300 && status < 400) return { status: 'unknown', reason: 'redirect' }
  if (status === 429) return { status: 'unknown', reason: 'rate_limited' }
  if (status >= 200 && status < 300) return { status: 'up', reason: 'http' }
  return { status: 'down', reason: 'http' }
}

export async function probe(target, fetchHomepage = fetch) {
  const start = performance.now()
  const signal = AbortSignal.timeout(timeoutMs)
  try {
    const response = await fetchHomepage(target.url, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      signal,
    })
    const elapsedMs = Math.round(performance.now() - start)
    await response.body?.cancel().catch(() => {})
    return { id: target.id, ...classifyResponse(response.status, response.headers), code: response.status, elapsedMs }
  } catch {
    return {
      id: target.id,
      status: 'down',
      reason: signal.aborted ? 'timeout' : 'network',
      code: null,
      elapsedMs: null,
    }
  }
}

export function appendCheck(previous, check) {
  const cutoff = Date.parse(check.at) - retentionDays * 24 * 60 * 60_000
  return [...previous.filter((item) => Date.parse(item.at) >= cutoff && item.at !== check.at), check]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

async function main(outputPath) {
  let previous = []
  try {
    const saved = JSON.parse(await readFile(outputPath, 'utf8'))
    if (saved.version !== 1 || !Array.isArray(saved.checks)) throw new Error('Format riwayat tidak dikenal')
    previous = saved.checks
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const results = await Promise.all(targets.map((target) => probe(target)))
  const check = { at: new Date().toISOString(), results }
  const feed = { version: 1, checks: appendCheck(previous, check) }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath + '.tmp', JSON.stringify(feed) + '\n')
  await rename(outputPath + '.tmp', outputPath)
  console.log(JSON.stringify(check))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(resolve(process.argv[2] ?? '.status/status.json'))
}
