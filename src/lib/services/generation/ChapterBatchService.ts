/**
 * ChapterBatchService - Orchestrates batch chapterization of a pre-existing
 * entry history (e.g. after a SillyTavern import). Never uses analyzeForChapter:
 * boundaries are precomputed deterministically by ChapterBatchPlanner. Chapters
 * are created strictly in sequence (each depends on state written by the last),
 * then, optionally, a single Lore Management session runs over all chapters
 * created in the batch.
 */

import type { Chapter, Entry, StoryEntry, StoryMode, POV, Tense, TimeTracker } from '$lib/types'
import type { ClassificationResult } from '$lib/services/ai/sdk'
import { planChapterBoundaries } from './ChapterBatchPlanner'
import {
  LoreManagementCoordinator,
  type LoreManagementDependencies,
  type LoreManagementCallbacks,
  type LoreManagementUICallbacks,
} from './LoreManagementCoordinator'
import { createLogger } from '$lib/log'

const log = createLogger('ChapterBatchService')

export interface ChapterBatchServiceDependencies {
  buildAndSaveChapter: (startIndex: number, endIndex: number) => Promise<Chapter>
  runLoreManagement: LoreManagementDependencies['runLoreManagement']
  estimateChapterTimeline: (summary: string) => Promise<TimeTracker>
  getTimeTracker: () => TimeTracker
  setTimeTracker: (time: TimeTracker) => Promise<void>
  updateChapterTimes: (
    chapterId: string,
    startTime: TimeTracker,
    endTime: TimeTracker,
  ) => Promise<void>
  getChapterEntries: (chapter: Chapter) => StoryEntry[]
  classifyChapter: (content: string, currentTime: TimeTracker) => Promise<ClassificationResult>
  applyClassificationResult: (result: ClassificationResult) => Promise<void>
}

export interface ChapterBatchInput {
  entries: StoryEntry[]
  startIndex: number
  tokenThreshold: number
  chapterBuffer: number
  includeLorebook: boolean
  includeTimeline: boolean
  includeClassification: boolean
  storyId: string
  currentBranchId: string | null
  lorebookEntries: Entry[]
  mode: StoryMode
  pov: POV
  tense: Tense
}

export interface ChapterBatchCallbacks {
  isCancelled: () => boolean
  onChapterProgress: (current: number, total: number) => void
  loreCallbacks: LoreManagementCallbacks
  loreUICallbacks?: LoreManagementUICallbacks
}

export interface ChapterBatchResult {
  chapters: Chapter[]
  cancelled: boolean
}

export class ChapterBatchService {
  private deps: ChapterBatchServiceDependencies

  constructor(deps: ChapterBatchServiceDependencies) {
    this.deps = deps
  }

  async run(
    input: ChapterBatchInput,
    callbacks: ChapterBatchCallbacks,
  ): Promise<ChapterBatchResult> {
    const boundaries = planChapterBoundaries(
      input.entries,
      input.tokenThreshold,
      input.chapterBuffer,
      input.startIndex,
    )

    log('Batch planned', { boundaryCount: boundaries.length, startIndex: input.startIndex })

    const chapters: Chapter[] = []

    for (const boundary of boundaries) {
      if (callbacks.isCancelled()) {
        log('Batch cancelled', { chaptersCreated: chapters.length, planned: boundaries.length })
        return { chapters, cancelled: true }
      }

      let chapter = await this.deps.buildAndSaveChapter(boundary.startIndex, boundary.endIndex)

      if (input.includeTimeline) {
        chapter = await this.runTimelineStep(chapter)
      }

      if (input.includeClassification) {
        await this.runClassificationStep(chapter)
      }

      chapters.push(chapter)
      callbacks.onChapterProgress(chapters.length, boundaries.length)
    }

    if (input.includeLorebook && chapters.length > 0) {
      log('Running single lore management pass over batch', { chapterCount: chapters.length })
      const coordinator = new LoreManagementCoordinator({
        runLoreManagement: this.deps.runLoreManagement,
      })
      await coordinator.runSession(
        {
          storyId: input.storyId,
          currentBranchId: input.currentBranchId,
          lorebookEntries: input.lorebookEntries,
          chapters,
          mode: input.mode,
          pov: input.pov,
          tense: input.tense,
        },
        callbacks.loreCallbacks,
        callbacks.loreUICallbacks,
      )
    }

    return { chapters, cancelled: false }
  }

  /**
   * Estimate elapsed time from the chapter's summary, advance the running
   * TimeTracker, and persist the resulting bracket onto the chapter.
   * Returns a new chapter object (buildAndSaveChapter's return value isn't
   * the reactive store reference, so the caller must use this one going
   * forward — e.g. for the lore pass, which reads chapter.startTime/endTime).
   */
  private async runTimelineStep(chapter: Chapter): Promise<Chapter> {
    const startTime = this.deps.getTimeTracker()
    const delta = await this.deps.estimateChapterTimeline(chapter.summary)
    await this.deps.setTimeTracker({
      years: startTime.years + delta.years,
      days: startTime.days + delta.days,
      hours: startTime.hours + delta.hours,
      minutes: startTime.minutes + delta.minutes,
    })
    const endTime = this.deps.getTimeTracker() // now normalized by setTimeTracker
    await this.deps.updateChapterTimes(chapter.id, startTime, endTime)
    return { ...chapter, startTime, endTime }
  }

  /**
   * Classify the chapter (summary + full raw content) and apply the result
   * to World Tracking (characters/locations/items/story beats). Suppresses
   * the classifier's own coarse per-turn time progression: Timeline (or
   * nothing) already owns time at chapter granularity here.
   */
  private async runClassificationStep(chapter: Chapter): Promise<void> {
    const rawText = this.deps
      .getChapterEntries(chapter)
      .map((e) => `[${e.type}]: ${e.content}`)
      .join('\n\n')
    const content = `Chapter summary: ${chapter.summary}\n\nFull chapter content:\n${rawText}`
    const result = await this.deps.classifyChapter(content, this.deps.getTimeTracker())
    result.scene.timeProgression = 'none'
    await this.deps.applyClassificationResult(result)
  }
}
