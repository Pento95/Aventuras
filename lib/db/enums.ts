export const INJECTION_MODES = ['always', 'auto', 'disabled'] as const
export type InjectionMode = (typeof INJECTION_MODES)[number]
