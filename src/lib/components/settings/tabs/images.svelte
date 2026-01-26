<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import * as Select from "$lib/components/ui/select";
  import { Slider } from "$lib/components/ui/slider";
  import { RotateCcw } from "lucide-svelte";

  const imageProviders = [
    { value: "nanogpt", label: "NanoGPT" },
    { value: "chutes", label: "Chutes" },
  ] as const;

  const imageStyles = [
    { value: "image-style-soft-anime", label: "Soft Anime" },
    { value: "image-style-semi-realistic", label: "Semi-realistic Anime" },
    { value: "image-style-photorealistic", label: "Photorealistic" },
  ] as const;

  const imageSizes = [
    { value: "512x512", label: "512x512 (Faster)" },
    { value: "1024x1024", label: "1024x1024 (Higher Quality)" },
  ] as const;
</script>

<div class="space-y-4">
  <!-- Image Provider Selection -->
  <div>
    <Label class="mb-2 block">Image Provider</Label>
    <Select.Root
      type="single"
      value={settings.systemServicesSettings.imageGeneration.imageProvider ??
        "nanogpt"}
      onValueChange={(v) => {
        const provider = v as "nanogpt" | "chutes";
        settings.systemServicesSettings.imageGeneration.imageProvider =
          provider;
        if (provider === "chutes") {
          settings.systemServicesSettings.imageGeneration.referenceModel =
            "qwen-image-edit-2511";
        } else {
          settings.systemServicesSettings.imageGeneration.referenceModel =
            "qwen-image";
        }
        settings.saveSystemServicesSettings();
      }}
    >
      <Select.Trigger class="h-10 w-full">
        {imageProviders.find(
          (p) =>
            p.value ===
            settings.systemServicesSettings.imageGeneration.imageProvider,
        )?.label ?? "Select provider"}
      </Select.Trigger>
      <Select.Content>
        {#each imageProviders as provider}
          <Select.Item value={provider.value} label={provider.label}>
            {provider.label}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    <p class="mt-1 text-xs text-muted-foreground">
      Configure your image generation service. Enable image generation for
      specific stories in the Writing Style settings.
    </p>
  </div>

  <!-- NanoGPT API Key -->
  {#if (settings.systemServicesSettings.imageGeneration.imageProvider ?? "nanogpt") === "nanogpt"}
    <div>
      <Label class="mb-2 block">NanoGPT API Key</Label>
      <div class="flex gap-2">
        <Input
          type="password"
          class="flex-1"
          value={settings.systemServicesSettings.imageGeneration.nanoGptApiKey}
          oninput={(e) => {
            settings.systemServicesSettings.imageGeneration.nanoGptApiKey =
              e.currentTarget.value;
            settings.saveSystemServicesSettings();
          }}
          placeholder="Enter your NanoGPT API key"
        />
        {#if settings.apiSettings.profiles.some((p) => p.baseUrl?.includes("nano-gpt.com") && p.apiKey)}
          <Button
            variant="outline"
            onclick={() => {
              const nanoProfile = settings.apiSettings.profiles.find(
                (p) => p.baseUrl?.includes("nano-gpt.com") && p.apiKey,
              );
              if (nanoProfile?.apiKey) {
                settings.systemServicesSettings.imageGeneration.nanoGptApiKey =
                  nanoProfile.apiKey;
                settings.saveSystemServicesSettings();
              }
            }}
          >
            Autofill
          </Button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Chutes API Key -->
  {#if settings.systemServicesSettings.imageGeneration.imageProvider === "chutes"}
    <div>
      <Label class="mb-2 block">Chutes API Key</Label>
      <Input
        type="password"
        class="w-full"
        value={settings.systemServicesSettings.imageGeneration.chutesApiKey}
        oninput={(e) => {
          settings.systemServicesSettings.imageGeneration.chutesApiKey =
            e.currentTarget.value;
          settings.saveSystemServicesSettings();
        }}
        placeholder="Enter your Chutes API key"
      />
    </div>
  {/if}

  <!-- Image Model -->
  {#if !settings.systemServicesSettings.imageGeneration.portraitMode}
    <div>
      <Label class="mb-2 block">Image Model</Label>
      <Input
        type="text"
        class="w-full"
        value={settings.systemServicesSettings.imageGeneration.model}
        oninput={(e) => {
          settings.systemServicesSettings.imageGeneration.model =
            e.currentTarget.value;
          settings.saveSystemServicesSettings();
        }}
        placeholder="z-image-turbo"
      />
      <p class="mt-1 text-xs text-muted-foreground">
        The image model to use for generation.
      </p>
    </div>
  {/if}

  <!-- Image Style -->
  <div>
    <Label class="mb-2 block">Image Style</Label>
    <Select.Root
      type="single"
      value={settings.systemServicesSettings.imageGeneration.styleId}
      onValueChange={(v) => {
        settings.systemServicesSettings.imageGeneration.styleId = v;
        settings.saveSystemServicesSettings();
      }}
    >
      <Select.Trigger class="h-10 w-full">
        {imageStyles.find(
          (s) =>
            s.value === settings.systemServicesSettings.imageGeneration.styleId,
        )?.label ?? "Select style"}
      </Select.Trigger>
      <Select.Content>
        {#each imageStyles as style}
          <Select.Item value={style.value} label={style.label}>
            {style.label}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    <p class="mt-1 text-xs text-muted-foreground">
      Visual style for generated images. Edit styles in the Prompts tab.
    </p>
  </div>

  <!-- Image Size -->
  <div>
    <Label class="mb-2 block">Image Size</Label>
    <Select.Root
      type="single"
      value={settings.systemServicesSettings.imageGeneration.size}
      onValueChange={(v) => {
        settings.systemServicesSettings.imageGeneration.size = v as
          | "512x512"
          | "1024x1024";
        settings.saveSystemServicesSettings();
      }}
    >
      <Select.Trigger class="h-10 w-full">
        {imageSizes.find(
          (s) =>
            s.value === settings.systemServicesSettings.imageGeneration.size,
        )?.label ?? "Select size"}
      </Select.Trigger>
      <Select.Content>
        {#each imageSizes as size}
          <Select.Item value={size.value} label={size.label}>
            {size.label}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <!-- Max Images Per Message -->
  <div>
    <Label class="mb-2 block">
      Max Images Per Message: {settings.systemServicesSettings.imageGeneration
        .maxImagesPerMessage === 0
        ? "Unlimited"
        : settings.systemServicesSettings.imageGeneration.maxImagesPerMessage}
    </Label>
    <Slider
      value={[
        settings.systemServicesSettings.imageGeneration.maxImagesPerMessage,
      ]}
      onValueChange={(v) => {
        settings.systemServicesSettings.imageGeneration.maxImagesPerMessage =
          v[0];
        settings.saveSystemServicesSettings();
      }}
      min={0}
      max={5}
      step={1}
      class="w-full"
    />
    <p class="mt-1 text-xs text-muted-foreground">
      Maximum images per narrative (0 = unlimited).
    </p>
  </div>

  <!-- Portrait Reference Mode -->
  <div class="flex items-center justify-between">
    <div>
      <Label>Portrait Reference Mode</Label>
      <p class="text-xs text-muted-foreground">
        Use character portraits as reference images when generating story
        images.
      </p>
    </div>
    <Switch
      checked={settings.systemServicesSettings.imageGeneration.portraitMode}
      onCheckedChange={(v) => {
        settings.systemServicesSettings.imageGeneration.portraitMode = v;
        settings.saveSystemServicesSettings();
      }}
    />
  </div>

  {#if settings.systemServicesSettings.imageGeneration.portraitMode}
    <!-- Portrait Generation Model -->
    <div>
      <Label class="mb-2 block">Portrait Generation Model</Label>
      <Input
        type="text"
        class="w-full"
        value={settings.systemServicesSettings.imageGeneration.portraitModel}
        oninput={(e) => {
          settings.systemServicesSettings.imageGeneration.portraitModel =
            e.currentTarget.value;
          settings.saveSystemServicesSettings();
        }}
        placeholder="z-image-turbo"
      />
      <p class="mt-1 text-xs text-muted-foreground">
        Model used when generating character portraits from visual descriptors.
      </p>
    </div>

    <!-- Reference Image Model -->
    <div>
      <Label class="mb-2 block">Reference Image Model</Label>
      <Input
        type="text"
        class="w-full"
        value={settings.systemServicesSettings.imageGeneration.referenceModel}
        oninput={(e) => {
          settings.systemServicesSettings.imageGeneration.referenceModel =
            e.currentTarget.value;
          settings.saveSystemServicesSettings();
        }}
        placeholder="qwen-image"
      />
      <p class="mt-1 text-xs text-muted-foreground">
        Model used for story images when a character portrait is attached as
        reference.
      </p>
    </div>
  {/if}

  <!-- Reset Button -->
  <Button
    variant="outline"
    size="sm"
    onclick={() => settings.resetImageGenerationSettings()}
  >
    <RotateCcw class="h-3 w-3 mr-1" />
    Reset to Defaults
  </Button>
</div>
