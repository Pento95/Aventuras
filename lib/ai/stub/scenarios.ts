export type StubScenario =
  | 'happy'
  | 'malformed-json'
  | 'mid-stream-timeout'
  | 'refusal'
  | 'cancellation-respects'

function anthropicJson(text: string, stopReason = 'end_turn'): Response {
  return new Response(
    JSON.stringify({
      type: 'message',
      id: 'msg_stub',
      role: 'assistant',
      model: 'claude-3-haiku-20240307',
      content: [{ type: 'text', text }],
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function hangUntilAbort(signal: AbortSignal | null): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const fail = () => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    if (signal?.aborted) {
      fail()
      return
    }
    signal?.addEventListener('abort', fail, { once: true })
  })
}

// Bodies are Anthropic-shaped so the real createAnthropic parse path runs.
export function makeScenarioFetch(scenario: StubScenario): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    switch (scenario) {
      case 'happy':
        return anthropicJson('{"reply":"hi"}')
      case 'malformed-json':
        return anthropicJson('{ not valid json')
      case 'refusal':
        return anthropicJson('{"refusal":true}', 'refusal')
      case 'mid-stream-timeout':
        return Promise.reject(new DOMException('stub provider timed out', 'TimeoutError'))
      case 'cancellation-respects':
        return hangUntilAbort(request.signal)
      default:
        throw new Error(`Unknown stub scenario: ${String(scenario)}`)
    }
  }
}
