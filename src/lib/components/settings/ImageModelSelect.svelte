<script lang="ts">
	import type { ImageModelInfo } from '$lib/services/ai/image/providers/base';
	import * as Select from '$lib/components/ui/select';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { RefreshCw, Loader2 } from 'lucide-svelte';
	import { DEFAULT_AVG_PROMPT_TOKENS, DEFAULT_AVG_IMAGE_TOKENS } from '$lib/services/ai/image/constants';

	interface Props {
		models: ImageModelInfo[];
		selectedModelId: string;
		onModelChange: (modelId: string) => void;

		// Optional features
		filterFunc?: (model: ImageModelInfo) => boolean;
		showCost?: boolean;
		showImg2ImgIndicator?: boolean;
		showDescription?: boolean;
		showModalities?: boolean;

		// Loading state
		isLoading?: boolean;
		errorMessage?: string | null;
		showRefreshButton?: boolean;
		onRefresh?: () => void;

		// Styling
		placeholder?: string;
		disabled?: boolean;
	}

	let {
		models,
		selectedModelId = $bindable(),
		onModelChange,
		filterFunc,
		showCost = false,
		showImg2ImgIndicator = false,
		showDescription = false,
		showModalities = false,
		isLoading = false,
		errorMessage = null,
		showRefreshButton = false,
		onRefresh,
		placeholder = 'Select a model',
		disabled = false,
	}: Props = $props();

	// Apply filter if provided
	const filteredModels = $derived(
		filterFunc ? models.filter(filterFunc) : models
	);

	// Format cost as "images per day" (1 pollen = 1000 credits, daily allowance)
	function formatCost(model: ImageModelInfo): string {
		if (!model.costPerImage) return '';

		const costPerTextToken = model.costPerTextToken ?? 0;
		const costPerImageToken = model.costPerImageToken ?? 0;

		const totalCost =
			model.costPerImage +
			costPerTextToken * DEFAULT_AVG_PROMPT_TOKENS +
			costPerImageToken * DEFAULT_AVG_IMAGE_TOKENS;

		const imagesPerPollen = 1 / totalCost;

		return imagesPerPollen >= 1000
			? `${(imagesPerPollen / 1000).toFixed(1)}k/day`
			: `${Math.round(imagesPerPollen)}/day`;
	}

	// Generate label with optional cost and img2img indicator
	function getModelLabel(model: ImageModelInfo): string {
		let label = model.name;

		if (showCost && model.costPerImage) {
			label += ` (${formatCost(model)})`;
		}

		if (showImg2ImgIndicator && model.supportsImg2Img) {
			label += ' 🖼️';
		}

		return label;
	}

	// Handle model selection
	function handleChange(value: string | undefined) {
		if (value) {
			onModelChange(value);
		}
	}
</script>

<div class="w-full space-y-2">
	{#if isLoading}
		<div class="flex items-center gap-2 text-sm text-muted-foreground">
			<Loader2 class="h-4 w-4 animate-spin" />
			Loading models...
		</div>
	{:else if errorMessage}
		<div class="flex items-center justify-between gap-2">
			<p class="text-sm text-destructive">{errorMessage}</p>
			{#if showRefreshButton && onRefresh}
				<Button variant="ghost" size="sm" onclick={onRefresh}>
					<RefreshCw class="h-4 w-4" />
				</Button>
			{/if}
		</div>
	{:else if filteredModels.length === 0}
		<p class="text-sm text-muted-foreground">No models available</p>
	{:else}
		<div class="flex items-center gap-2">
			<div class="flex-1">
				<Select.Root
					type="single"
					value={selectedModelId}
					onValueChange={handleChange}
					{disabled}
				>
					<Select.Trigger class="w-full">
						<Select.Value {placeholder} />
					</Select.Trigger>
					<Select.Content>
						{#each filteredModels as model (model.id)}
							<Select.Item value={model.id}>
								<div class="flex flex-col items-start gap-1">
									<span>{getModelLabel(model)}</span>
									{#if showDescription && model.description}
										<span class="text-xs text-muted-foreground">
											{model.description}
										</span>
									{/if}
									{#if showModalities && (model.inputModalities || model.outputModalities)}
										<span class="text-xs text-muted-foreground">
											{#if model.inputModalities}
												In: {model.inputModalities.join(', ')}
											{/if}
											{#if model.outputModalities}
												→ Out: {model.outputModalities.join(', ')}
											{/if}
										</span>
									{/if}
								</div>
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			{#if showRefreshButton && onRefresh}
				<Button variant="ghost" size="icon" onclick={onRefresh} disabled={isLoading}>
					<RefreshCw class="h-4 w-4 {isLoading ? 'animate-spin' : ''}" />
				</Button>
			{/if}
		</div>
	{/if}
</div>
