import { type ProviderInstance } from '../db'

export type ProviderInstanceWithStub = Omit<ProviderInstance, 'type'> & {
  type: ProviderInstance['type'] | 'stub'
}
