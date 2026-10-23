import { BrowserWindow } from 'electron'

import { AccountType } from '@shared/common/types'
import { QueueHandler } from '@shared/main/types'

import { createPlatformHandler } from '@/worker/lib/createPlatformHandler'
import { PLATFORM_CONFIG } from '@/worker/platform/platform.config'
import { startWorker } from '@/worker/workerCrawl.manager'

const platformHandlers: Record<string, QueueHandler> = {}
Object.entries(PLATFORM_CONFIG).forEach(([platformKey, { login, crawl }]) => {
  platformHandlers[platformKey] = createPlatformHandler({
    platformKey,
    createWorkerLogin: login,
    createWorkerCrawl: crawl,
    startWorker,
    getHandler: () => platformHandlers
  })
})

export function enqueueWorker(account: AccountType, mainWindow: BrowserWindow) {
  const handler = platformHandlers[account.platformName]
  if (!handler) return

  handler.queue.push(account)
  !handler.isProcessing && handler.processor(mainWindow)
}

export function checkQueuePlatform(namePlatform: string) {
  const handler = platformHandlers[namePlatform]
  handler.queue = []
}
