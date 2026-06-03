import type { Tier } from '@/hooks/use-tier'

import type { DensitySetting, DensityValue } from '../types'

// Tier-default rule: desktop → compact, phone+tablet → regular.
export function resolveDensity(setting: DensitySetting, tier: Tier): DensityValue {
  if (setting === 'default') {
    return tier === 'desktop' ? 'compact' : 'regular'
  }
  return setting
}
