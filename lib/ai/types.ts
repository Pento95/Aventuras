export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'openrouter'
  | 'nanogpt'
  | 'nvidia-nim'
  | 'openai-compatible'
  | 'stub'

export type ProviderInstance = {
  id: string
  type: ProviderType
  displayName: string
  apiKey: string
  endpoint?: string
  favoriteModelIds: string[]
}
