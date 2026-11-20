import assert from 'node:assert/strict'
import test from 'node:test'
import { appendCheck, classifyResponse, probe } from './check.mjs'

test('HTTP protection and redirects are inconclusive', () => {
  const auth = new Headers({ location: 'https://vercel.com/sso?example=1' })
  assert.deepEqual(classifyResponse(302, auth), { status: 'unknown', reason: 'restricted' })
  assert.deepEqual(classifyResponse(302, new Headers({ location: '/login' })), {
    status: 'unknown', reason: 'redirect',
  })
  const challenge = new Headers({ 'x-vercel-mitigated': 'challenge' })
  assert.equal(classifyResponse(200, challenge).status, 'unknown')
  for (const code of [401, 403, 429]) assert.equal(classifyResponse(code, new Headers()).status, 'unknown')
  for (const code of [404, 503]) assert.equal(classifyResponse(code, new Headers()).status, 'down')
  assert.equal(classifyResponse(200, new Headers()).status, 'up')
})

test('probe requests only GET homepage without credentials or redirect following', async () => {
  const target = { id: 'uat', url: 'https://example.test/' }
  let cancelled = false
  const body = new ReadableStream({ cancel() { cancelled = true } })
  const result = await probe(target, async (url, options) => {
    assert.equal(url, target.url)
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'manual')
    assert.equal(options.credentials, 'omit')
    return new Response(body, { status: 403 })
  })
  assert.equal(result.status, 'unknown')
  assert.equal(result.code, 403)
  assert.ok(cancelled)
  const unavailable = await probe(target, () => { throw new TypeError('Network unavailable') })
  assert.equal(unavailable.status, 'down')
  assert.equal(unavailable.code, null)
})

test('history retains seven days without duplicate entries for the same check time', () => {
  const entry = (at) => ({ at, results: [] })
  const next = entry('2026-11-20T16:00:00.000Z')
  const retained = entry('2026-11-13T16:00:00.000Z')
  const expired = entry('2026-11-13T15:59:59.999Z')
  assert.deepEqual(appendCheck([expired, retained, next], next), [retained, next])
})
