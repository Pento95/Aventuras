/**
 * Comfy UI Image Provider
 *
 * Direct HTTP calls to Comfy UI API.
 *
 */

import type {
  ImageProvider,
  ImageProviderConfig,
  ImageGenerateOptions,
  ImageGenerateResult,
  ImageModelInfo,
  ComfySamplerInfo,
} from './types'
import { ComfyApi, PromptBuilder, CallWrapper } from '@saintno/comfyui-sdk'
import BasicTxt2ImgWorkflow from './comfyWorkflows/basic-txt2img-workflow.json'
import { parseImageSize } from '../imageUtils'

const DEFAULT_BASE_URL = 'http://localhost:8188'

export enum ComfyMode {
  BasicTxt2Img = 'basic-txt2img',
}

export const ComfyModes: Record<ComfyMode, any> = {
  [ComfyMode.BasicTxt2Img]: BasicTxt2ImgWorkflow,
}

export function createComfyProvider(config: ImageProviderConfig): ImageProvider {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL

  const api = new ComfyApi(baseUrl).init()

  return {
    id: 'comfyui',
    name: 'Comfy UI',

    async generate(options: ImageGenerateOptions): Promise<ImageGenerateResult> {
      const { model, prompt, size, providerOptions } = options
      if (!model) {
        throw new Error('No ComfyUI model selected.')
      }

      const step = providerOptions?.step ?? 6
      const cfg = providerOptions?.cfg ?? 1
      const sampler = (providerOptions?.sampler as string) ?? 'dpmpp_2m_sde_gpu'
      const scheduler = (providerOptions?.scheduler as string) ?? 'sgm_uniform'
      const sizeToUse = parseImageSize(size)
      const seed = Number(
        crypto.getRandomValues(new BigUint64Array(1))[0] % BigInt(Number.MAX_SAFE_INTEGER),
      )
      const modeToUse = (providerOptions?.mode as ComfyMode) || ComfyMode.BasicTxt2Img
      const workflowBase = ComfyModes[modeToUse]
      const positiveTags = (providerOptions?.positivePrompt as string) || ''
      const negativeTags = (providerOptions?.negativePrompt as string) || ''

      const finalPositivePrompt = positiveTags ? `${prompt}, ${positiveTags}` : prompt
      const finalNegativePrompt = negativeTags

      const workflow = new PromptBuilder(
        workflowBase,
        [
          'positive',
          'negative',
          'checkpoint',
          'seed',
          'batch',
          'step',
          'cfg',
          'sampler',
          'scheduler',
          'width',
          'height',
        ],
        ['images'],
      )
        .setInputNode('checkpoint', '4.inputs.ckpt_name')
        .setInputNode('seed', '3.inputs.seed')
        .setInputNode('batch', '5.inputs.batch_size')
        .setInputNode('negative', '7.inputs.text')
        .setInputNode('positive', '6.inputs.text')
        .setInputNode('cfg', '3.inputs.cfg')
        .setInputNode('sampler', '3.inputs.sampler_name')
        .setInputNode('scheduler', '3.inputs.scheduler')
        .setInputNode('step', '3.inputs.steps')
        .setInputNode('width', '5.inputs.width')
        .setInputNode('height', '5.inputs.height')
        .setOutputNode('images', '9')
        .input('checkpoint', model, api.osType)
        .input('seed', seed)
        .input('step', step)
        .input('cfg', cfg)
        .input<string>('sampler', sampler)
        .input<string>('scheduler', scheduler)
        .input('width', sizeToUse.width)
        .input('height', sizeToUse.height)
        .input('batch', 1)
        .input('positive', finalPositivePrompt)
        .input('negative', finalNegativePrompt)

      return new Promise((resolve, reject) => {
        console.log('workflow :>> ', workflow)
        new CallWrapper(api, workflow)
          .onFinished(async (data) => {
            try {
              const imageInfos = data.images?.images || []
              if (imageInfos.length === 0) {
                return reject(new Error('ComfyUI produced no images'))
              }

              // Retrieve the first image as a Blob
              const blob = await api.getImage(imageInfos[0])
              const base64 = await blobToBase64(blob)

              resolve({
                base64,
              })
            } catch (error) {
              console.error('Failed to process ComfyUI output:', error)
              reject(new Error(`Failed to process image output: ${error}`))
            }
          })
          .onFailed((error) => {
            console.error('ComfyUI Generation Failed:', error)
            let message = error.message || 'Failed to queue prompt'
            if ((error as any).node_errors) {
              const nodeErrors = (error as any).node_errors
              const details = Object.entries(nodeErrors)
                .map(([node, err]: [string, any]) => {
                  const nodeMsgs = err.errors.map((e: any) => e.message).join(', ')
                  return `Node ${node}: ${nodeMsgs}`
                })
                .join('; ')
              message = `ComfyUI Validation Error: ${details}`
            }
            reject(new Error(message))
          })
          .run()
      })
    },

    async listModels(): Promise<ImageModelInfo[]> {
      console.log('listModels')
      try {
        const imageModels = await api.getCheckpoints()
        const sampler = await api.getSamplerInfo()
        console.log('sampler :>> ', sampler)
        console.log(imageModels)

        return imageModels.map((m) => {
          return {
            id: m,
            name: m,
            description: '',
            supportsSizes: ['512x512', '1024x1024'],
            supportsImg2Img: false,
            costPerImage: 0,
          }
        })
      } catch {
        return []
      }
    },

    async getSamplerInfo(): Promise<ComfySamplerInfo> {
      const sampler = await api.getSamplerInfo()
      const samplerList = sampler.sampler?.[0]
      const schedulerList = sampler.scheduler?.[0]

      return {
        samplers: Array.isArray(samplerList)
          ? samplerList
          : typeof samplerList === 'string'
            ? [samplerList]
            : [],
        schedulers: Array.isArray(schedulerList)
          ? schedulerList
          : typeof schedulerList === 'string'
            ? [schedulerList]
            : [],
      }
    },

    supportsImg2Img(_modelId: string): boolean {
      return true
    },
  }
}

/**
 * Converts a Blob to a base64 string (raw, no data URL prefix).
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Remove data:image/png;base64, prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
