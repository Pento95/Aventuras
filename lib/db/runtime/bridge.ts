import { type DbProxyMethod, type DbProxyResult } from '@/types/db-bridge'

export function resolveBridge() {
  const bridge = globalThis.window?.aventurasDb
  if (!bridge) throw new Error('Database bridge unavailable — Electron preload not loaded.')
  return bridge
}

export async function bridgeQuery(
  sqlText: string,
  params: unknown[],
  method: DbProxyMethod,
): Promise<DbProxyResult> {
  return resolveBridge().query(sqlText, params, method)
}
