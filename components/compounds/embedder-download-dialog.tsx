import * as React from 'react'
import { Pressable, ScrollView, View } from 'react-native'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'

import {
  type DialogState,
  type ExecutionProvider,
  type FailReason,
  type FileProgress,
} from './embedder-download-dialog-machine'

type EmbedderDownloadDialogViewProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: DialogState
  onAcceptLicense: () => void
  onDeclineLicense: () => void
  onSubmitHfInput: (id: string) => void
  onPickEp: (ep: ExecutionProvider) => void
  onConfirmImport: () => void
  onCancel: () => void
  onRetry: () => void
  onClose: () => void
}

export function EmbedderDownloadDialogView(props: EmbedderDownloadDialogViewProps) {
  const { open, onOpenChange, state } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <Header state={state} onCancel={props.onCancel} />
        <Body {...props} />
        <Footer {...props} />
      </DialogContent>
    </Dialog>
  )
}

export type { EmbedderDownloadDialogViewProps }

function Header({ state, onCancel }: { state: DialogState; onCancel: () => void }) {
  const title = titleFor(state)
  const downloadingCancel = state.kind === 'downloading'
  return (
    <DialogHeader>
      <View className="flex-row items-center justify-between gap-2">
        <DialogTitle>{title}</DialogTitle>
        {downloadingCancel ? (
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text variant="secondary" size="sm">
              Cancel
            </Text>
          </Pressable>
        ) : null}
      </View>
    </DialogHeader>
  )
}

function titleFor(state: DialogState): string {
  switch (state.kind) {
    case 'hf-input':
      return 'Install from HuggingFace'
    case 'resolving':
      return 'Resolving model…'
    case 'card-fetch':
      return `Install ${state.meta.displayName}`
    case 'license':
      return `Install ${state.meta.displayName}`
    case 'ep-picker':
      return `Pick execution provider — ${state.meta.displayName}`
    case 'import-confirm':
      return 'Import custom embedding model'
    case 'downloading':
      return `Downloading ${state.meta.displayName}`
    case 'verifying':
      return `Verifying ${state.meta.displayName}`
    case 'done':
      return `Installed ${state.meta.displayName}`
    case 'failed':
      return failedTitle(state.reason)
  }
}

// FailReason variants — sync with embedder-download-dialog-machine.ts.
function failedTitle(reason: FailReason): string {
  switch (reason.kind) {
    case 'cancelled':
      return 'Install cancelled'
    case 'card-fetch-failed':
      return '⚠ Couldn’t reach the model source'
    case 'resolve-failed':
      return '⚠ Couldn’t resolve model'
    case 'validation-failed':
      return '⚠ Missing required files'
    case 'hash-mismatch':
      return '⚠ Verification failed'
    case 'smoke-test-failed':
      return '⚠ Execution provider not supported'
  }
}

function Body(props: EmbedderDownloadDialogViewProps) {
  const { state } = props
  switch (state.kind) {
    case 'hf-input':
      return <HfInputBody onSubmit={props.onSubmitHfInput} />
    case 'resolving':
      return <ResolvingBody />
    case 'card-fetch':
      return <CardFetchBody source={state.meta.source} />
    case 'license':
      return (
        <LicenseBody
          meta={state.meta}
          licenseText={state.licenseText}
          licenseName={state.licenseName}
        />
      )
    case 'ep-picker':
      return <EpPickerBody pickedEp={state.pickedEp} onPick={props.onPickEp} />
    case 'import-confirm':
      return (
        <ImportConfirmBody
          bundle={state.bundle}
          pickedEp={state.pickedEp}
          onPick={props.onPickEp}
        />
      )
    case 'downloading':
      return <DownloadingBody progressByFile={state.progressByFile} />
    case 'verifying':
      return <VerifyingBody verifyByFile={state.verifyByFile} />
    case 'done':
      return <DoneBody />
    case 'failed':
      return <FailedBody reason={state.reason} />
  }
}

function HfInputBody({ onSubmit }: { onSubmit: (id: string) => void }) {
  const [value, setValue] = React.useState('')
  return (
    <View className="gap-3">
      <Text variant="secondary" size="sm">
        Enter a HuggingFace model id (e.g. `namespace/model`) or paste a model URL.
      </Text>
      <Input
        placeholder="namespace/model"
        value={value}
        onChangeText={setValue}
        onSubmitEditing={() => onSubmit(value)}
      />
    </View>
  )
}

function ResolvingBody() {
  return (
    <View className="items-center gap-3 py-6">
      <Spinner />
      <Text variant="muted">Resolving model card and file listing…</Text>
    </View>
  )
}

function CardFetchBody({ source }: { source: string }) {
  return (
    <View className="items-center gap-3 py-6">
      <Spinner />
      <Text variant="muted">Fetching model card from {source}…</Text>
    </View>
  )
}

function LicenseBody({
  meta,
  licenseText,
  licenseName,
}: {
  meta: { source: string; revision: string; sizeBytes: number; fileCount: number }
  licenseText: string
  licenseName: string
}) {
  const sizeMb = (meta.sizeBytes / 1_000_000).toFixed(0)
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text size="sm">
          <Text variant="muted">Source: </Text>
          {meta.source}
        </Text>
        <Text size="sm">
          <Text variant="muted">Revision: </Text>
          {meta.revision}
        </Text>
        <Text size="sm">
          <Text variant="muted">Size: </Text>
          {sizeMb} MB · {meta.fileCount} files
        </Text>
      </View>
      <Text size="sm" className="font-semibold">
        License — {licenseName || 'no license specified'}
      </Text>
      <ScrollView
        accessibilityLabel="License text"
        className="max-h-[40vh] rounded-md border border-border bg-bg-sunken p-3"
      >
        <Text size="sm" className="font-mono">
          {licenseText}
        </Text>
      </ScrollView>
      {!licenseName ? (
        <Text size="sm" variant="muted">
          ⚠ No license specified by the model author. Proceed at your own risk.
        </Text>
      ) : null}
    </View>
  )
}

function EpPickerBody({
  pickedEp,
  onPick,
}: {
  pickedEp: ExecutionProvider
  onPick: (ep: ExecutionProvider) => void
}) {
  return (
    <View className="gap-3">
      <Text variant="secondary" size="sm">
        Pick the execution provider this model will run under.
      </Text>
      <Pressable
        onPress={() => onPick(pickedEp === 'cpu' ? 'webgpu' : 'cpu')}
        className="self-start rounded-md border border-border px-3 py-2"
      >
        <Text>{pickedEp}</Text>
      </Pressable>
      <Text size="sm" variant="muted">
        ⚠ Wrong choice may crash the app on next embed.
      </Text>
    </View>
  )
}

function ImportConfirmBody({
  bundle,
  pickedEp,
  onPick,
}: {
  bundle: { modelId: string; files: readonly { name: string; sizeBytes: number }[] }
  pickedEp: ExecutionProvider
  onPick: (ep: ExecutionProvider) => void
}) {
  return (
    <View className="gap-3">
      <Text variant="secondary" size="sm">
        {
          "You're importing a custom model. By using it, you assert that you have a license to do so."
        }
      </Text>
      <View className="gap-1">
        <Text size="sm">
          <Text variant="muted">Model id: </Text>
          {bundle.modelId}
        </Text>
        <Text size="sm" variant="muted">
          Files:
        </Text>
        {bundle.files.map((f) => (
          <Text key={f.name} size="sm">
            · {f.name} ({(f.sizeBytes / 1_000_000).toFixed(1)} MB)
          </Text>
        ))}
      </View>
      <Pressable
        onPress={() => onPick(pickedEp === 'cpu' ? 'webgpu' : 'cpu')}
        className="self-start rounded-md border border-border px-3 py-2"
      >
        <Text>Execution provider: {pickedEp}</Text>
      </Pressable>
    </View>
  )
}

function DownloadingBody({ progressByFile }: { progressByFile: Record<string, FileProgress> }) {
  const entries = Object.entries(progressByFile)
  const total = entries.reduce(
    (acc, [, p]) => {
      if (p.kind === 'downloading')
        return { received: acc.received + p.bytesReceived, total: acc.total + p.bytesTotal }
      return acc
    },
    { received: 0, total: 0 },
  )
  return (
    <View className="gap-3">
      {entries.map(([file, progress]) => (
        <View key={file} className="gap-1">
          <View className="flex-row justify-between">
            <Text size="sm">{file}</Text>
            <Text size="sm" variant="muted">
              {progress.kind === 'waiting' && 'waiting…'}
              {progress.kind === 'downloading' &&
                `${Math.round((progress.bytesReceived / progress.bytesTotal) * 100)}%`}
              {progress.kind === 'done' && 'done'}
            </Text>
          </View>
          <View className="h-1 rounded-full bg-bg-sunken">
            <View
              className="h-1 rounded-full bg-accent"
              style={{
                width:
                  progress.kind === 'downloading'
                    ? `${(progress.bytesReceived / progress.bytesTotal) * 100}%`
                    : progress.kind === 'done'
                      ? '100%'
                      : '0%',
              }}
            />
          </View>
        </View>
      ))}
      {total.total > 0 ? (
        <Text size="sm" variant="muted">
          Total: {(total.received / 1_000_000).toFixed(1)} / {(total.total / 1_000_000).toFixed(1)}{' '}
          MB
        </Text>
      ) : null}
    </View>
  )
}

function VerifyingBody({
  verifyByFile,
}: {
  verifyByFile: Record<string, 'pending' | 'ok' | 'fail'>
}) {
  const entries = Object.entries(verifyByFile)
  return (
    <View className="gap-2">
      {entries.map(([file, status]) => (
        <View key={file} className="flex-row items-center gap-2">
          <Text>
            {status === 'ok' && '✓ '}
            {status === 'fail' && '✗ '}
            {status === 'pending' && '… '}
            {file}
          </Text>
          <Text variant="muted" size="sm">
            {status === 'ok' && 'hash matches'}
            {status === 'fail' && 'sha256 mismatch'}
            {status === 'pending' && 'verifying…'}
          </Text>
        </View>
      ))}
    </View>
  )
}

function DoneBody() {
  return (
    <View className="items-center gap-2 py-4">
      <Text>Done.</Text>
    </View>
  )
}

// FailReason → body copy. Cancelled is its own variant per the
// state-machine refactor; no more sentinel string check.
function FailedBody({ reason }: { reason: FailReason }) {
  switch (reason.kind) {
    case 'cancelled':
      return <Text variant="muted">The install was cancelled. No files were written to disk.</Text>
    case 'card-fetch-failed':
      return (
        <View className="gap-2">
          <Text>The model-card fetch failed:</Text>
          <Text className="font-mono" size="sm">
            {reason.message}
          </Text>
          <Text variant="muted" size="sm">
            {
              "The license is fetched live to defend against post-curation edits — we can't proceed with a cached copy. Check your connection and try again."
            }
          </Text>
        </View>
      )
    case 'resolve-failed':
      return (
        <View className="gap-2">
          <Text>{"Couldn't resolve the HF model:"}</Text>
          <Text className="font-mono" size="sm">
            {reason.message}
          </Text>
        </View>
      )
    case 'validation-failed':
      return (
        <View className="gap-2">
          <Text>{"This model doesn't have the required ONNX exports."}</Text>
          <Text variant="muted" size="sm">
            Missing: {reason.missingFiles.join(', ')}
          </Text>
          <Text variant="muted" size="sm">
            Some HF models ship in Python-only formats (PyTorch / safetensors). Check the model card
            for ONNX export instructions, or try the curated catalog.
          </Text>
        </View>
      )
    case 'hash-mismatch':
      return (
        <View className="gap-2">
          <Text>{"One of the downloaded files doesn't match the expected hash:"}</Text>
          <Text size="sm">✗ {reason.failingFile} sha256 mismatch</Text>
          <Text variant="muted" size="sm">
            {
              "This may indicate a corrupted download or an upstream change the bundled catalog hasn't caught up to. The partial install has been deleted."
            }
          </Text>
        </View>
      )
    case 'smoke-test-failed':
      return (
        <View className="gap-2">
          <Text>The smoke-test embed crashed under {reason.ep}.</Text>
          <Text variant="muted" size="sm">
            Try a different execution provider, or check the model card for EP support notes.
          </Text>
        </View>
      )
  }
}

// 'cancelled' reason is its own FailReason variant (not a sentinel
// on card-fetch-failed.message anymore); retry only applies to
// the network/resolve failure paths that are actually retryable.
function Footer(props: EmbedderDownloadDialogViewProps) {
  const { state } = props
  switch (state.kind) {
    case 'hf-input':
      return (
        <DialogFooter>
          <Button variant="secondary" onPress={props.onCancel}>
            <Text>Cancel</Text>
          </Button>
          <Button variant="primary" onPress={() => props.onSubmitHfInput('')}>
            <Text>Resolve</Text>
          </Button>
        </DialogFooter>
      )
    case 'resolving':
    case 'card-fetch':
      return (
        <DialogFooter>
          <Button variant="secondary" onPress={props.onCancel}>
            <Text>Cancel</Text>
          </Button>
        </DialogFooter>
      )
    case 'license':
      return (
        <DialogFooter>
          <Button variant="secondary" onPress={props.onDeclineLicense}>
            <Text>Decline</Text>
          </Button>
          <Button variant="primary" onPress={props.onAcceptLicense}>
            <Text>Accept & download</Text>
          </Button>
        </DialogFooter>
      )
    case 'ep-picker':
      return (
        <DialogFooter>
          <Button variant="secondary" onPress={props.onCancel}>
            <Text>Cancel</Text>
          </Button>
          <Button variant="primary" onPress={() => props.onPickEp(state.pickedEp)}>
            <Text>Continue</Text>
          </Button>
        </DialogFooter>
      )
    case 'import-confirm':
      return (
        <DialogFooter>
          <Button variant="secondary" onPress={props.onCancel}>
            <Text>Cancel</Text>
          </Button>
          <Button variant="primary" onPress={props.onConfirmImport}>
            <Text>Import</Text>
          </Button>
        </DialogFooter>
      )
    case 'downloading':
    case 'verifying':
    case 'done':
      return null
    case 'failed': {
      const retryable =
        state.reason.kind === 'card-fetch-failed' || state.reason.kind === 'resolve-failed'
      if (retryable) {
        return (
          <DialogFooter>
            <Button variant="secondary" onPress={props.onCancel}>
              <Text>Cancel</Text>
            </Button>
            <Button variant="primary" onPress={props.onRetry}>
              <Text>Retry</Text>
            </Button>
          </DialogFooter>
        )
      }
      return (
        <DialogFooter>
          <Button variant="primary" onPress={props.onClose}>
            <Text>Close</Text>
          </Button>
        </DialogFooter>
      )
    }
  }
}
