/* eslint-disable @typescript-eslint/no-explicit-any */
import { Worker, WorkerOptions } from 'worker_threads'

import { Account } from '@db/model'
import { BrowserWindow } from 'electron/main'

import { AccountType } from '@shared/common/types'
import { DEFAULT_ACCOUNT_STATUS, STATUS_ACCOUNT } from '@shared/main/constants'
import { QueueHandler } from '@shared/main/types'

import { handleMoveAccountToEnd, handleSwitchAccount } from './lib/handleMoveAccountToEnd'
import createWorkerCrawlViva88 from './platform/Viva88/workerCrawl?nodeWorker'
import createWorkerAutoLogin from './workerAutoLogin?nodeWorker'

import { enqueueWorker } from '@/worker'
import { handleAccountLoggedAgain } from '@/worker/lib/handleAccountLoggedAgain'
import { sendAccountUpdate } from '@/worker/lib/sendAccountUpdate'

const crawlWorkers = new Map<string, Worker>()

let workerAutoLogin: Worker | null = null

export async function startWorker(
  account: AccountType,
  mainWindow: BrowserWindow,
  platformHandlers: Record<string, QueueHandler>
) {
  const handler = platformHandlers[account.platformName]
  if (!handler) return

  initLoginWorker(account, handler, mainWindow, platformHandlers)
  initCrawlWorkers(account.platformName, handler, mainWindow)
  initAutoLoginWorker(mainWindow)
}

function initLoginWorker(
  account: AccountType,
  handler: QueueHandler,
  mainWindow: BrowserWindow,
  platformHandlers: Record<string, QueueHandler>
) {
  const worker = handler.createWorkerLogin({ workerData: 'worker' })
  worker.postMessage({ account })
  attachLoginWorkerEvents(worker, account, mainWindow, platformHandlers)
}

function attachLoginWorkerEvents(
  worker: Worker,
  account: AccountType,
  mainWindow: BrowserWindow,
  platformHandlers: Record<string, QueueHandler>
) {
  worker.on('message', ({ type, data }) => {
    switch (type) {
      case 'TooManyRequests':
        sendAccountUpdate(account.id, mainWindow)
        setTimeout(() => startWorker(account, mainWindow, platformHandlers), 8000)
        break

      case 'DataUpdateAccount':
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('DataUpdateAccount', data)
        }
        break

      case 'LoginSuccess':
        handleLoginSuccess(account, data, mainWindow)
        break

      case 'MoveAccountToEnd':
        handleMoveAccountToEnd(account, mainWindow)
        break
    }
  })

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Login worker exit with code ${code}`)
    }

    const handler = platformHandlers[account.platformName]
    handler.isProcessing = false
    handler.processor(mainWindow)

    console.log(`Worker Login Exit: [${account.loginID}]`)
  })

  worker.on('error', console.error)
}

function handleLoginSuccess(account: AccountType, payload: string, mainWindow: BrowserWindow) {
  console.log(`LoginSuccess to Crawl Viva88: [${account.loginID}]`)

  const worker = createCrawlWorkerByOrder(account.orderID)
  if (!worker) return

  worker.postMessage(payload)
  attachCrawlAfterLoginEvents(worker, account, mainWindow)
}

function createCrawlWorkerByOrder(orderID: number): Worker | null {
  switch (orderID) {
    case 1:
      return createWorkerCrawlViva88({ workerData: 'worker' })

    default:
      console.warn(`Unsupported orderID: ${orderID}`)
      return null
  }
}

function attachCrawlAfterLoginEvents(
  worker: Worker,
  account: AccountType,
  mainWindow: BrowserWindow
) {
  worker.on('message', ({ type, data }) => {
    switch (type) {
      case 'DataUpdateAccount':
        sendAccountUpdate(account.id, mainWindow)
        break

      case 'LoggedAgain':
        handleAccountLoggedAgain(account.id, mainWindow)
        break

      case 'NewBetHistory':
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('NewBetHistory', data)
        }
        break

      case 'SwitchAccount':
        handleSwitchAccount(account, data, mainWindow)
        break

      case 'SabaUnauthorized': {
        // Sent directly: sendAccountUpdate skips accounts whose status is LOGIN
        const resetAccount = Account.update(
          { id: account.id },
          {
            ...DEFAULT_ACCOUNT_STATUS,
            textLog: 'SABA unauthorized: please create a SABA.games nickname.'
          }
        )
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('DataUpdateAccount', resetAccount)
          mainWindow.webContents.send('SabaUnauthorized', data)
        }
        break
      }

      case 'RegionRestricted': {
        // Sent directly: sendAccountUpdate skips accounts whose status is LOGIN
        const resetAccount = Account.update(
          { id: account.id },
          {
            ...DEFAULT_ACCOUNT_STATUS,
            textLog: 'Regional restriction: we are not allowed to offer games in your region.'
          }
        )
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('DataUpdateAccount', resetAccount)
          mainWindow.webContents.send('RegionRestricted', data)
        }
        break
      }
    }
  })

  worker.on('exit', () => {
    console.log(`Worker Crawl Viva88 Exit: [${account.loginID}]`)
  })

  worker.on('error', console.error)
}

function initCrawlWorkers(platformName: string, handler: QueueHandler, mainWindow: BrowserWindow) {
  startCrawlWorker(platformName, handler.createWorkerCrawl, crawlWorkers, mainWindow)
}

function startCrawlWorker(
  platformName: string,
  createWorkerFn: (options: WorkerOptions) => Worker,
  workerMap: Map<string, Worker>,
  mainWindow: BrowserWindow
) {
  if (workerMap.has(platformName)) return

  const worker = createWorkerFn({ workerData: 'worker' })
  workerMap.set(platformName, worker)

  worker.postMessage('Start')
  attachCrawlWorkerEvents(worker, platformName, workerMap, mainWindow)
}

function attachCrawlWorkerEvents(
  worker: Worker,
  platformName: string,
  workerMap: Map<string, Worker>,
  mainWindow: BrowserWindow
) {
  worker.on('message', ({ type, idAccount }) => {
    switch (type) {
      case 'DataUpdateAccount':
        sendAccountUpdate(idAccount, mainWindow)
        break

      case 'LoggedAgain':
        handleAccountLoggedAgain(idAccount, mainWindow)
        break
    }
  })

  worker.on('exit', () => {
    console.log(`Worker Crawl ${platformName} Exit`)
    workerMap.delete(platformName)
  })

  worker.on('error', console.error)
}

function initAutoLoginWorker(mainWindow: BrowserWindow) {
  if (workerAutoLogin) return

  workerAutoLogin = createWorkerAutoLogin({ workerData: 'worker' })

  workerAutoLogin.on('message', async (accounts: AccountType[]) => {
    for (const acc of accounts) {
      Account.update(
        { id: acc.id },
        {
          status: STATUS_ACCOUNT.IN_PROGRESS,
          textLog: 'Waiting for login...'
        }
      )

      sendAccountUpdate(acc.id, mainWindow)
      enqueueWorker(acc, mainWindow)
    }
  })

  workerAutoLogin.on('exit', (code) => console.log('Exit WorkerAutoLogin...', code))

  workerAutoLogin.on('error', console.error)
}
