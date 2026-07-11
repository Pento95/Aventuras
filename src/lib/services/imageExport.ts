import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import type { EmbeddedImageMeta } from '$lib/types'

/**
 * ImageExportService — exports embedded images to disk.
 *
 * All decoding/writing runs natively (`export_images_zip` / `export_single_image`): Rust reads
 * each image's base64 from SQLite and writes the decoded PNG straight to disk, so no image
 * bytes cross the IPC bridge or accumulate in the JS heap (which caused Android OOM crashes).
 * The multi-image path streams one row at a time, so peak memory is a single image.
 */
class ImageExportService {
  private filterImages(
    images: EmbeddedImageMeta[],
    selectedIds?: Set<string>,
  ): EmbeddedImageMeta[] {
    return selectedIds ? images.filter((img) => selectedIds.has(img.id)) : images
  }

  async exportSingleImage(storyTitle: string, image: EmbeddedImageMeta): Promise<boolean> {
    try {
      const selectedPath = await save({
        defaultPath: `${storyTitle}-image.png`,
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
      })

      if (!selectedPath) return false

      await invoke('export_single_image', { imageId: image.id, destPath: selectedPath })

      console.log(`[ImageExport] Exported to ${selectedPath}`)
      return true
    } catch (error) {
      console.error('[ImageExport] Single image export failed:', error)
      throw error
    }
  }

  async exportImagesToZip(
    storyTitle: string,
    images: EmbeddedImageMeta[],
    selectedImageIds?: Set<string>,
  ): Promise<boolean> {
    const imagesToExport = this.filterImages(images, selectedImageIds)

    if (imagesToExport.length === 0) {
      throw new Error('No images to export')
    }

    try {
      const selectedPath = await save({
        defaultPath: `${storyTitle}-images.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      })

      if (!selectedPath) return false

      // Rust reads the base64 from SQLite and streams PNGs into the ZIP; only ids cross IPC.
      const storyId = imagesToExport[0].storyId
      const ids = imagesToExport.map((img) => img.id)
      const written = await invoke<number>('export_images_zip', {
        storyId,
        destPath: selectedPath,
        selectedIds: ids,
      })

      console.log(`[ImageExport] Exported ${written}/${imagesToExport.length} images`)
      return true
    } catch (error) {
      console.error('[ImageExport] ZIP export failed:', error)
      throw error
    }
  }

  async exportImages(
    storyTitle: string,
    images: EmbeddedImageMeta[],
    selectedImageIds?: Set<string>,
  ): Promise<boolean> {
    const imagesToExport = this.filterImages(images, selectedImageIds)

    if (imagesToExport.length === 0) {
      throw new Error('No images to export')
    }

    return imagesToExport.length === 1
      ? this.exportSingleImage(storyTitle, imagesToExport[0])
      : this.exportImagesToZip(storyTitle, images, selectedImageIds)
  }
}

export const imageExportService = new ImageExportService()
