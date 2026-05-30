import { describe, expect, it } from 'vitest'

import { makeScenarioFetch } from './scenarios'

async function payloadText(res: Response): Promise<string> {
  const body = (await res.json()) as { content: { text: string }[] }
  return body.content[0].text
}

describe('makeScenarioFetch', () => {
  it('happy returns a parseable reply payload', async () => {
    const res = await makeScenarioFetch('happy')('https://stub.test')
    expect(res.status).toBe(200)
    expect(JSON.parse(await payloadText(res))).toEqual({ reply: 'hi' })
  })

  it('malformed-json returns an unparseable text payload', async () => {
    const res = await makeScenarioFetch('malformed-json')('https://stub.test')
    const text = await payloadText(res)
    expect(() => JSON.parse(text)).toThrow()
  })

  it('refusal returns a refusal-flagged payload', async () => {
    const res = await makeScenarioFetch('refusal')('https://stub.test')
    expect(JSON.parse(await payloadText(res))).toEqual({ refusal: true })
  })

  it('cancellation-respects rejects when the request signal aborts', async () => {
    const ctrl = new AbortController()
    const promise = makeScenarioFetch('cancellation-respects')('https://stub.test', {
      signal: ctrl.signal,
    })
    ctrl.abort()
    await expect(promise).rejects.toThrow()
  })

  it('mid-stream-timeout rejects immediately with a timeout error', async () => {
    await expect(makeScenarioFetch('mid-stream-timeout')('https://stub.test')).rejects.toThrow()
  })

  it('throws on an unknown scenario (bad cast guard)', async () => {
    await expect(
      makeScenarioFetch('bogus' as Parameters<typeof makeScenarioFetch>[0])('https://stub.test'),
    ).rejects.toThrow('Unknown stub scenario')
  })
})
