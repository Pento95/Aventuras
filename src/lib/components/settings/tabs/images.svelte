<script lang="ts">
  import { settings } from '$lib/stores/settings.svelte'
  import { Switch } from '$lib/components/ui/switch'
  import { Label } from '$lib/components/ui/label'
  import { Button } from '$lib/components/ui/button'
  import * as Select from '$lib/components/ui/select'
  import { Slider } from '$lib/components/ui/slider'
  import { RotateCcw, Info } from 'lucide-svelte'
  import {
    listImageModels,
    clearModelsCache,
    type ImageModelInfo,
  } from '$lib/services/ai/image/modelListing'
  import { PROVIDERS } from '$lib/services/ai/sdk/providers/config'
  import ImageModelSelect from '$lib/components/settings/ImageModelSelect.svelte'
  import type { APIProfile } from '$lib/types'
  import * as Tabs from '$lib/components/ui/tabs'
  import * as Alert from '$lib/components/ui/alert'

  const imageStyles = [
    { value: 'image-style-soft-anime', label: 'Soft Anime' },
    { value: 'image-style-semi-realistic', label: 'Semi-realistic Anime' },
    { value: 'image-style-photorealistic', label: 'Photorealistic' },
  ] as const

  const imageSizes = [
    { value: '512x512', label: '512x512 (Faster)' },
    { value: '1024x1024', label: '1024x1024 (Higher Quality)' },
    { value: '2048x2048', label: '2048x2048 (Highest Quality)' },
  ] as const

  const backgroundSizes = [
    { value: '1280x720', label: '1280x720 (Widescreen)' },
    { value: '720x1280', label: '720x1280 (Portrait)' },
  ] as const

  // Tab state
  let activeTab = $state<'general' | 'characters' | 'backgrounds'>('general')

  // Get profiles that support image generation
  function getImageCapableProfiles(): APIProfile[] {
    return settings.apiSettings.profiles.filter(
      (p) => PROVIDERS[p.providerType]?.capabilities.imageGeneration,
    )
  }

  // Models state for each profile type
  let standardModels = $state<ImageModelInfo[]>([])
  let isLoadingStandardModels = $state(false)
  let standardModelsError = $state<string | null>(null)

  let portraitModels = $state<ImageModelInfo[]>([])
  let isLoadingPortraitModels = $state(false)
  let portraitModelsError = $state<string | null>(null)

  let referenceModels = $state<ImageModelInfo[]>([])
  let isLoadingReferenceModels = $state(false)
  let referenceModelsError = $state<string | null>(null)

  let backgroundModels = $state<ImageModelInfo[]>([])
  let isLoadingBackgroundModels = $state(false)
  let backgroundModelsError = $state<string | null>(null)

  // Filtered models for img2img (reference)
  const referenceImg2ImgModels = $derived(referenceModels.filter((m) => m.supportsImg2Img))

  // Load models for a profile
  async function loadModelsForProfile(
    profileId: string | null,
    setModels: (models: ImageModelInfo[]) => void,
    setLoading: (loading: boolean) => void,
    setError: (error: string | null) => void,
    forceRefresh = false,
  ) {
    if (!profileId) {
      setModels([])
      return
    }

    const profile = settings.getProfile(profileId)
    if (!profile) {
      setModels([])
      return
    }

    if (forceRefresh) {
      clearModelsCache(profile.providerType)
    }

    setLoading(true)
    setError(null)

    try {
      const models = await listImageModels(profile.providerType, profile.apiKey)
      setModels(models)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }

  // Auto-select first image-capable profile if enabled but no profile selected
  $effect(() => {
    const imgSettings = settings.systemServicesSettings.imageGeneration
    if (imgSettings.enabled && !imgSettings.profileId) {
      const profiles = getImageCapableProfiles()
      if (profiles.length > 0) {
        settings.systemServicesSettings.imageGeneration.profileId = profiles[0].id
        settings.saveSystemServicesSettings()
      }
    }
  })

  // Load standard models when profile changes
  $effect(() => {
    const profileId = settings.systemServicesSettings.imageGeneration.profileId
    if (profileId && standardModels.length === 0 && !isLoadingStandardModels) {
      loadModelsForProfile(
        profileId,
        (m) => (standardModels = m),
        (l) => (isLoadingStandardModels = l),
        (e) => (standardModelsError = e),
      )
    }
  })

  // Load portrait models when profile changes (only if portrait mode enabled)
  $effect(() => {
    const profileId = settings.systemServicesSettings.imageGeneration.portraitProfileId
    const portraitMode = settings.systemServicesSettings.imageGeneration.portraitMode
    if (portraitMode && profileId && portraitModels.length === 0 && !isLoadingPortraitModels) {
      loadModelsForProfile(
        profileId,
        (m) => (portraitModels = m),
        (l) => (isLoadingPortraitModels = l),
        (e) => (portraitModelsError = e),
      )
    }
  })

  // Load reference models when profile changes (only if portrait mode enabled)
  $effect(() => {
    const profileId = settings.systemServicesSettings.imageGeneration.referenceProfileId
    const portraitMode = settings.systemServicesSettings.imageGeneration.portraitMode
    if (portraitMode && profileId && referenceModels.length === 0 && !isLoadingReferenceModels) {
      loadModelsForProfile(
        profileId,
        (m) => (referenceModels = m),
        (l) => (isLoadingReferenceModels = l),
        (e) => (referenceModelsError = e),
      )
    }
  })

  // Load background models when profile changes (only if background mode enabled)
  $effect(() => {
    const profileId = settings.systemServicesSettings.imageGeneration.backgroundProfileId
    const backgroundMode = settings.systemServicesSettings.imageGeneration.backgroundImagesEnabled
    if (
      backgroundMode &&
      profileId &&
      backgroundModels.length === 0 &&
      !isLoadingBackgroundModels
    ) {
      loadModelsForProfile(
        profileId,
        (m) => (backgroundModels = m),
        (l) => (isLoadingBackgroundModels = l),
        (e) => (backgroundModelsError = e),
      )
    }
  })

  // Handle profile change - reload models
  function onProfileChange(
    profileId: string,
    type: 'standard' | 'portrait' | 'reference' | 'background',
  ) {
    const profile = settings.getProfile(profileId)
    if (!profile) return

    switch (type) {
      case 'standard':
        settings.systemServicesSettings.imageGeneration.profileId = profileId
        standardModels = []
        loadModelsForProfile(
          profileId,
          (m) => (standardModels = m),
          (l) => (isLoadingStandardModels = l),
          (e) => (standardModelsError = e),
        )
        break
      case 'portrait':
        settings.systemServicesSettings.imageGeneration.portraitProfileId = profileId
        portraitModels = []
        loadModelsForProfile(
          profileId,
          (m) => (portraitModels = m),
          (l) => (isLoadingPortraitModels = l),
          (e) => (portraitModelsError = e),
        )
        break
      case 'reference':
        settings.systemServicesSettings.imageGeneration.referenceProfileId = profileId
        referenceModels = []
        loadModelsForProfile(
          profileId,
          (m) => (referenceModels = m),
          (l) => (isLoadingReferenceModels = l),
          (e) => (referenceModelsError = e),
        )
        break
      case 'background':
        settings.systemServicesSettings.imageGeneration.backgroundProfileId = profileId
        backgroundModels = []
        loadModelsForProfile(
          profileId,
          (m) => (backgroundModels = m),
          (l) => (isLoadingBackgroundModels = l),
          (e) => (backgroundModelsError = e),
        )
        break
    }

    settings.saveSystemServicesSettings()
  }

  // Get the currently selected profile for a type
  function getSelectedProfile(
    type: 'standard' | 'portrait' | 'reference' | 'background',
  ): APIProfile | undefined {
    const profileId =
      type === 'standard'
        ? settings.systemServicesSettings.imageGeneration.profileId
        : type === 'portrait'
          ? settings.systemServicesSettings.imageGeneration.portraitProfileId
          : type === 'reference'
            ? settings.systemServicesSettings.imageGeneration.referenceProfileId
            : settings.systemServicesSettings.imageGeneration.backgroundProfileId
    return profileId ? settings.getProfile(profileId) : undefined
  }

  const imageCapableProfiles = $derived(getImageCapableProfiles())
</script>

<div class="space-y-4">
  <div class="flex items-center justify-end">
    <Button variant="ghost" size="sm" onclick={() => settings.resetImageGenerationSettings()}>
      <RotateCcw class="mr-1 h-3 w-3" />
      Reset to Defaults
    </Button>
  </div>

  <Tabs.Root value={activeTab} onValueChange={(v) => (activeTab = v as any)}>
    <Tabs.List class="grid w-full grid-cols-3">
      <Tabs.Trigger value="general">Story Images</Tabs.Trigger>
      <Tabs.Trigger value="characters">Characters</Tabs.Trigger>
      <Tabs.Trigger value="backgrounds">Backgrounds</Tabs.Trigger>
    </Tabs.List>

    <div class="mt-4 min-h-[400px]">
      <!-- General Tab -->
      <Tabs.Content value="general" class="space-y-6">
        <section class="space-y-6">
          <div class="bg-muted/10 space-y-6 rounded-lg border p-4">
            <div class="space-y-3">
              <Alert.Root>
                <Info class="h-4 w-4" />
                <Alert.Title>Story Image Model Selection</Alert.Title>
                <Alert.Description class="text-xs">
                  <ul class="mt-2 list-inside list-disc space-y-1">
                    <li>
                      <strong>Reference Model</strong>: Used when "Portrait Mode" is enabled in your
                      current story. Generates images based on the character portraits.
                    </li>
                    <li>
                      <strong>Regular Image Model</strong>: Used when "Portrait Mode" is disabled in
                      your current story.
                    </li>
                  </ul>
                </Alert.Description>
              </Alert.Root>
            </div>

            <div class="grid gap-6 md:grid-cols-2">
              <!-- Standard Image Configuration -->
              <div class="space-y-4">
                <div class="space-y-2">
                  <Label>Regular Image Profile</Label>
                  <Select.Root
                    type="single"
                    value={settings.systemServicesSettings.imageGeneration.profileId ?? ''}
                    onValueChange={(v) => onProfileChange(v, 'standard')}
                  >
                    <Select.Trigger class="h-10 w-full">
                      {#if getSelectedProfile('standard')}
                        {getSelectedProfile('standard')?.name} ({getSelectedProfile('standard')
                          ?.providerType})
                      {:else}
                        Select a profile
                      {/if}
                    </Select.Trigger>
                    <Select.Content>
                      {#each imageCapableProfiles as profile (profile.id)}
                        <Select.Item
                          value={profile.id}
                          label={`${profile.name} (${profile.providerType})`}
                        >
                          {profile.name}
                          <span class="text-muted-foreground">({profile.providerType})</span>
                        </Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>

                {#if settings.systemServicesSettings.imageGeneration.profileId}
                  <div class="space-y-2">
                    <Label>Regular Image Model</Label>
                    <ImageModelSelect
                      models={standardModels}
                      selectedModelId={settings.systemServicesSettings.imageGeneration.model}
                      onModelChange={(id) => {
                        settings.systemServicesSettings.imageGeneration.model = id
                        settings.saveSystemServicesSettings()
                      }}
                      showCost={true}
                      showImg2ImgIndicator={true}
                      showDescription={false}
                      isLoading={isLoadingStandardModels}
                      errorMessage={standardModelsError}
                      showRefreshButton={true}
                      onRefresh={() =>
                        loadModelsForProfile(
                          settings.systemServicesSettings.imageGeneration.profileId,
                          (m) => (standardModels = m),
                          (l) => (isLoadingStandardModels = l),
                          (e) => (standardModelsError = e),
                          true,
                        )}
                    />
                  </div>
                  <div class="space-y-2">
                    <Label>Regular Image Size</Label>
                    <Select.Root
                      type="single"
                      value={settings.systemServicesSettings.imageGeneration.size}
                      onValueChange={(v) => {
                        settings.systemServicesSettings.imageGeneration.size = v as any
                        settings.saveSystemServicesSettings()
                      }}
                    >
                      <Select.Trigger class="h-10 w-full">
                        {imageSizes.find(
                          (s) => s.value === settings.systemServicesSettings.imageGeneration.size,
                        )?.label ?? 'Select size'}
                      </Select.Trigger>
                      <Select.Content>
                        {#each imageSizes as size (size.value)}
                          <Select.Item value={size.value} label={size.label}>
                            {size.label}
                          </Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </div>
                {/if}
              </div>

              <!-- Reference Image Configuration -->
              <div class="space-y-4">
                <div class="space-y-2">
                  <Label>Reference (Img2Img) Profile</Label>
                  <Select.Root
                    type="single"
                    value={settings.systemServicesSettings.imageGeneration.referenceProfileId ??
                      settings.systemServicesSettings.imageGeneration.profileId ??
                      ''}
                    onValueChange={(v) => onProfileChange(v, 'reference')}
                  >
                    <Select.Trigger class="h-10 w-full">
                      {#if getSelectedProfile('reference') || getSelectedProfile('standard')}
                        {(getSelectedProfile('reference') || getSelectedProfile('standard'))?.name}
                        ({(getSelectedProfile('reference') || getSelectedProfile('standard'))
                          ?.providerType})
                      {:else}
                        Select a profile
                      {/if}
                    </Select.Trigger>
                    <Select.Content>
                      {#each imageCapableProfiles as profile (profile.id)}
                        <Select.Item
                          value={profile.id}
                          label={`${profile.name} (${profile.providerType})`}
                        >
                          {profile.name}
                          <span class="text-muted-foreground">({profile.providerType})</span>
                        </Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>

                {#if settings.systemServicesSettings.imageGeneration.referenceProfileId || settings.systemServicesSettings.imageGeneration.profileId}
                  <div class="space-y-2">
                    <Label>Reference Model</Label>
                    <ImageModelSelect
                      models={referenceImg2ImgModels.length > 0
                        ? referenceImg2ImgModels
                        : referenceModels.length > 0
                          ? referenceModels
                          : standardModels.filter((m) => m.supportsImg2Img)}
                      selectedModelId={settings.systemServicesSettings.imageGeneration
                        .referenceModel}
                      onModelChange={(id) => {
                        settings.systemServicesSettings.imageGeneration.referenceModel = id
                        settings.saveSystemServicesSettings()
                      }}
                      showCost={true}
                      showImg2ImgIndicator={false}
                      isLoading={isLoadingReferenceModels || isLoadingStandardModels}
                      errorMessage={referenceModelsError || standardModelsError}
                      showRefreshButton={true}
                      onRefresh={() => {
                        const profileId =
                          settings.systemServicesSettings.imageGeneration.referenceProfileId ||
                          settings.systemServicesSettings.imageGeneration.profileId
                        loadModelsForProfile(
                          profileId,
                          (m) => (referenceModels = m),
                          (l) => (isLoadingReferenceModels = l),
                          (e) => (referenceModelsError = e),
                          true,
                        )
                      }}
                    />
                  </div>
                  <div class="space-y-2">
                    <Label>Reference Image Size</Label>
                    <Select.Root
                      type="single"
                      value={settings.systemServicesSettings.imageGeneration.referenceSize}
                      onValueChange={(v) => {
                        settings.systemServicesSettings.imageGeneration.referenceSize = v as any
                        settings.saveSystemServicesSettings()
                      }}
                    >
                      <Select.Trigger class="h-10 w-full">
                        {imageSizes.find(
                          (s) =>
                            s.value ===
                            settings.systemServicesSettings.imageGeneration.referenceSize,
                        )?.label ?? 'Select size'}
                      </Select.Trigger>
                      <Select.Content>
                        {#each imageSizes as size (size.value)}
                          <Select.Item value={size.value} label={size.label}>
                            {size.label}
                          </Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <!-- Image Style -->
          <div class="space-y-2">
            <Label>Story Image Style</Label>
            <Select.Root
              type="single"
              value={settings.systemServicesSettings.imageGeneration.styleId}
              onValueChange={(v) => {
                settings.systemServicesSettings.imageGeneration.styleId = v
                settings.saveSystemServicesSettings()
              }}
            >
              <Select.Trigger class="h-10 w-full">
                {imageStyles.find(
                  (s) => s.value === settings.systemServicesSettings.imageGeneration.styleId,
                )?.label ?? 'Select style'}
              </Select.Trigger>
              <Select.Content>
                {#each imageStyles as style (style.value)}
                  <Select.Item value={style.value} label={style.label}>
                    {style.label}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <p class="text-muted-foreground mt-1 text-xs">
              Visual style for generated story images. Edit styles in the Prompts tab.
            </p>
          </div>

          <!-- Max Images Per Message -->
          <div class="space-y-2">
            <Label>
              Max Images Per Message: {settings.systemServicesSettings.imageGeneration
                .maxImagesPerMessage === 0
                ? 'Unlimited'
                : settings.systemServicesSettings.imageGeneration.maxImagesPerMessage}
            </Label>
            <Slider
              type="multiple"
              value={[settings.systemServicesSettings.imageGeneration.maxImagesPerMessage]}
              onValueChange={(v) => {
                settings.systemServicesSettings.imageGeneration.maxImagesPerMessage = v[0]
                settings.saveSystemServicesSettings()
              }}
              min={0}
              max={5}
              step={1}
            />
          </div>
        </section>
      </Tabs.Content>

      <!-- Characters Tab -->
      <Tabs.Content value="characters" class="space-y-6">
        <section class="space-y-4">
          <!-- Portrait Profile -->
          <div class="space-y-2">
            <Label>Character Portrait Profile</Label>
            <Select.Root
              type="single"
              value={settings.systemServicesSettings.imageGeneration.portraitProfileId ??
                settings.systemServicesSettings.imageGeneration.profileId ??
                ''}
              onValueChange={(v) => onProfileChange(v, 'portrait')}
            >
              <Select.Trigger class="h-10 w-full">
                {#if getSelectedProfile('portrait') || getSelectedProfile('standard')}
                  {(getSelectedProfile('portrait') || getSelectedProfile('standard'))?.name}
                  ({(getSelectedProfile('portrait') || getSelectedProfile('standard'))
                    ?.providerType})
                {:else}
                  Select a profile
                {/if}
              </Select.Trigger>
              <Select.Content>
                {#each imageCapableProfiles as profile (profile.id)}
                  <Select.Item
                    value={profile.id}
                    label={`${profile.name} (${profile.providerType})`}
                  >
                    {profile.name}
                    <span class="text-muted-foreground">({profile.providerType})</span>
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <p class="text-muted-foreground mt-1 text-xs">
              Profile used for generating character portraits.
            </p>
          </div>

          <!-- Portrait Model -->
          {#if settings.systemServicesSettings.imageGeneration.portraitProfileId || settings.systemServicesSettings.imageGeneration.profileId}
            <div class="space-y-2">
              <Label>Character Portrait Model</Label>
              <ImageModelSelect
                models={portraitModels.length > 0 ? portraitModels : standardModels}
                selectedModelId={settings.systemServicesSettings.imageGeneration.portraitModel}
                onModelChange={(id) => {
                  settings.systemServicesSettings.imageGeneration.portraitModel = id
                  settings.saveSystemServicesSettings()
                }}
                showCost={true}
                showImg2ImgIndicator={true}
                isLoading={isLoadingPortraitModels || isLoadingStandardModels}
                errorMessage={portraitModelsError || standardModelsError}
                showRefreshButton={true}
                onRefresh={() => {
                  const profileId =
                    settings.systemServicesSettings.imageGeneration.portraitProfileId ||
                    settings.systemServicesSettings.imageGeneration.profileId
                  loadModelsForProfile(
                    profileId,
                    (m) => (portraitModels = m),
                    (l) => (isLoadingPortraitModels = l),
                    (e) => (portraitModelsError = e),
                    true,
                  )
                }}
              />
              <p class="text-muted-foreground mt-1 text-xs">
                Model used when generating character portraits from visual descriptors.
              </p>
            </div>
            <div class="space-y-2">
              <Label>Character Portrait Size</Label>
              <Select.Root
                type="single"
                value={settings.systemServicesSettings.imageGeneration.portraitSize}
                onValueChange={(v) => {
                  settings.systemServicesSettings.imageGeneration.portraitSize = v as any
                  settings.saveSystemServicesSettings()
                }}
              >
                <Select.Trigger class="h-10 w-full">
                  {imageSizes.find(
                    (s) => s.value === settings.systemServicesSettings.imageGeneration.portraitSize,
                  )?.label ?? 'Select size'}
                </Select.Trigger>
                <Select.Content>
                  {#each imageSizes as size (size.value)}
                    <Select.Item value={size.value} label={size.label}>
                      {size.label}
                    </Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          {/if}

          <!-- Portrait Style -->
          <div class="space-y-2">
            <Label>Character Portrait Style</Label>
            <Select.Root
              type="single"
              value={settings.systemServicesSettings.imageGeneration.portraitStyleId}
              onValueChange={(v) => {
                settings.systemServicesSettings.imageGeneration.portraitStyleId = v
                settings.saveSystemServicesSettings()
              }}
            >
              <Select.Trigger class="h-10 w-full">
                {imageStyles.find(
                  (s) =>
                    s.value === settings.systemServicesSettings.imageGeneration.portraitStyleId,
                )?.label ?? 'Select style'}
              </Select.Trigger>
              <Select.Content>
                {#each imageStyles as style (style.value)}
                  <Select.Item value={style.value} label={style.label}>
                    {style.label}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <p class="text-muted-foreground mt-1 text-xs">
              Visual style for character portraits. Edit styles in the Prompts tab.
            </p>
          </div>
        </section>
      </Tabs.Content>

      <!-- Backgrounds Tab -->
      <Tabs.Content value="backgrounds" class="space-y-6">
        <section class="space-y-4">
          <!-- Background Profile -->
          <div class="space-y-2">
            <Label>Background Profile</Label>
            <Select.Root
              type="single"
              value={settings.systemServicesSettings.imageGeneration.backgroundProfileId ??
                settings.systemServicesSettings.imageGeneration.profileId ??
                ''}
              onValueChange={(v) => onProfileChange(v, 'background')}
            >
              <Select.Trigger class="h-10 w-full">
                {#if getSelectedProfile('background') || getSelectedProfile('standard')}
                  {(getSelectedProfile('background') || getSelectedProfile('standard'))?.name}
                  ({(getSelectedProfile('background') || getSelectedProfile('standard'))
                    ?.providerType})
                {:else}
                  Select a profile
                {/if}
              </Select.Trigger>
              <Select.Content>
                {#each imageCapableProfiles as profile (profile.id)}
                  <Select.Item
                    value={profile.id}
                    label={`${profile.name} (${profile.providerType})`}
                  >
                    {profile.name}
                    <span class="text-muted-foreground">({profile.providerType})</span>
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <p class="text-muted-foreground mt-1 text-xs">
              Profile used for generating background scenes.
            </p>
          </div>

          <!-- Background Model -->
          {#if settings.systemServicesSettings.imageGeneration.backgroundProfileId || settings.systemServicesSettings.imageGeneration.profileId}
            <div class="space-y-2">
              <Label>Background Model</Label>
              <ImageModelSelect
                models={backgroundModels.length > 0 ? backgroundModels : standardModels}
                selectedModelId={settings.systemServicesSettings.imageGeneration.backgroundModel}
                onModelChange={(id) => {
                  settings.systemServicesSettings.imageGeneration.backgroundModel = id
                  settings.saveSystemServicesSettings()
                }}
                showCost={true}
                showImg2ImgIndicator={false}
                isLoading={isLoadingBackgroundModels || isLoadingStandardModels}
                errorMessage={backgroundModelsError || standardModelsError}
                showRefreshButton={true}
                onRefresh={() => {
                  const profileId =
                    settings.systemServicesSettings.imageGeneration.backgroundProfileId ||
                    settings.systemServicesSettings.imageGeneration.profileId
                  loadModelsForProfile(
                    profileId,
                    (m) => (backgroundModels = m),
                    (l) => (isLoadingBackgroundModels = l),
                    (e) => (backgroundModelsError = e),
                    true,
                  )
                }}
              />
              <p class="text-muted-foreground mt-1 text-xs">
                Model used for generating background scenes.
              </p>
            </div>
          {/if}

          <!-- Background Size -->
          <div class="space-y-2">
            <Label>Background Size</Label>
            <Select.Root
              type="single"
              value={settings.systemServicesSettings.imageGeneration.backgroundSize}
              onValueChange={(v) => {
                settings.systemServicesSettings.imageGeneration.backgroundSize = v as any
                settings.saveSystemServicesSettings()
              }}
            >
              <Select.Trigger class="h-10 w-full">
                {backgroundSizes.find(
                  (s) => s.value === settings.systemServicesSettings.imageGeneration.backgroundSize,
                )?.label ?? 'Select size'}
              </Select.Trigger>
              <Select.Content>
                {#each backgroundSizes as size (size.value)}
                  <Select.Item value={size.value} label={size.label}>
                    {size.label}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <!-- Background Blur -->
          <div class="space-y-2">
            <Label>
              Background Blur: {settings.systemServicesSettings.imageGeneration.backgroundBlur}px
            </Label>
            <Slider
              type="multiple"
              value={[settings.systemServicesSettings.imageGeneration.backgroundBlur]}
              onValueChange={(v: number[]) => {
                settings.systemServicesSettings.imageGeneration.backgroundBlur = v[0]
                settings.saveSystemServicesSettings()
              }}
              min={0}
              max={20}
              step={1}
            />
            <p class="text-muted-foreground mt-1 text-xs">Blur amount for the background image.</p>
          </div>
        </section>
      </Tabs.Content>
    </div>
  </Tabs.Root>
</div>
