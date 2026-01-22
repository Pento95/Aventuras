<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Drawer from "$lib/components/ui/drawer";
	import { getResponsiveModalContext } from "./context";
	import { cn } from "$lib/utils/cn";
	import { X } from "lucide-svelte";

	let { children, class: className, ...props } = $props();
	const { isMobile } = getResponsiveModalContext();
</script>

{#if isMobile.current}
	<Drawer.Header class={cn("text-left", className)} {...props}>
		{@render children?.()}
	</Drawer.Header>
{:else}
	<div class={cn("flex items-center justify-between p-4 border-b border-border shadow-sm relative z-10 bg-background sm:rounded-t-lg", className)}>
		<Dialog.Header class="flex-1" {...props}>
			{@render children?.()}
		</Dialog.Header>
		<Dialog.Close
			class="rounded-sm opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
		>
			<X class="size-5" />
			<span class="sr-only">Close</span>
		</Dialog.Close>
	</div>
{/if}
