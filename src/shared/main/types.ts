import { Worker, WorkerOptions } from 'worker_threads'

import { BrowserWindow } from 'electron'

import { AccountType } from '@shared/common/types'

export type QueueHandler = {
  queue: AccountType[]
  isProcessing: boolean
  createWorkerLogin: (options: WorkerOptions) => Worker
  createWorkerCrawl: (options: WorkerOptions) => Worker
  processor: (mainWindow: BrowserWindow) => void
}

export type SaveBetFixedAmountValueType = {
  activeSportsBook: string
  platform: string
  data: {
    betFixedAmountValue: string
  }
}
