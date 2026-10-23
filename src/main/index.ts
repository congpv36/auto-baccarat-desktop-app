/* eslint-disable @typescript-eslint/no-explicit-any */
import { join } from 'path'
import { setTimeout as delay } from 'timers/promises'

import {
  Account,
  AuthToken,
  clearAllTables,
  Platform,
  Setting,
  SettingTableView,
  SportsBookProviders
} from '@db/model'
import { SettingSchemaType } from '@db/schema/setting'
import { is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { v4 as uuidv4 } from 'uuid'

import { GAME_TYPES } from '@shared/common/constants'
import { SettingTableViewType } from '@shared/common/types'
import { DEFAULT_ACCOUNT_STATUS, DEFAULT_SETTING } from '@shared/main/constants'

import { handleUserSettingsSync } from './browserWindows/service/handleUserSettingsSync'
import { initSocket } from './browserWindows/service/socket'

import { createInitAppWindow } from '@/browserWindows/initAppWindow'
import { createMainWindow } from '@/browserWindows/mainWindow'
import { fetchDataSystem } from '@/browserWindows/service/fetchDataSystem'
import { systemLogToFile } from '@/worker/lib/systemLogToFile'

let loginWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null

app.setAppUserModelId(import.meta.env.VITE_APP_USER_MODEL_ID)

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
}

function createWindow() {
  const loginWindow = new BrowserWindow({
    width: 456,
    height: 638,
    maximizable: false,
    minimizable: false,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    center: true,
    frame: false,
    titleBarOverlay: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    trafficLightPosition: { x: 15, y: 10 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  ipcMain.on('CloseLoginWindow', () => {
    loginWindow.close()
    app.quit()
  })

  let isLoggingIn = false
  ipcMain.on('AttemptLogin', async (event, { username, password }) => {
    if (isLoggingIn) return

    isLoggingIn = true
    try {
      const payload = { username, password, appType: import.meta.env.VITE_APP_TYPE }

      const response = await fetch(`${import.meta.env.VITE_URL}/user/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        await systemLogToFile('Login: Invalid credentials.', 'Error')
        return event.reply('LoginResult', { success: false, message: 'Invalid credentials.' })
      }
      const responseData = (await response.json()) as {
        data: { accessToken: string; account: any; refreshToken: string; versionLatest: string }
      }

      AuthToken.create({
        accessToken: responseData.data.accessToken,
        refreshToken: responseData.data.refreshToken
      })

      try {
        await systemLogToFile(`[Login] SetupCheckUpdate has been activated`, 'Program')
        setupCheckUpdate(event, loginWindow, responseData)
      } catch (error) {
        console.log('[Login] Error in setupCheckUpdate', error)
        await systemLogToFile(`[Login] CheckUpdateVersion: ${JSON.stringify(error)}`, 'Error')
      }
    } catch (error) {
      if (error instanceof Error) {
        await systemLogToFile(`Login: ${JSON.stringify(error.message)}`, 'Error')
        console.error('Login error:', error)
        event.reply('LoginResult', {
          success: false,
          message: `Login Fail: ${error.message}`
        })
      } else {
        await systemLogToFile('Login: An error occurred during login. Please try again.', 'Error')

        console.error('Login error:', error)
        event.reply('LoginResult', {
          success: false,
          message: 'An error occurred during login. Please try again.'
        })
      }
    } finally {
      isLoggingIn = false
    }
  })

  loginWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    loginWindow.loadURL('http://localhost:5174/#/login')
  } else {
    loginWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'login' })
  }

  loginWindow.webContents.once('did-finish-load', () => {
    loginWindow.show()
  })

  return loginWindow
}

function setupCheckUpdate(
  event: Electron.IpcMainEvent,
  loginWindow: BrowserWindow,
  responseData: {
    data: { accessToken: string; account: any; refreshToken: string; versionLatest: string }
  }
) {
  if (is.dev) {
    autoUpdater.forceDevUpdateConfig = true
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: import.meta.env.VITE_URL_RELEASES
    })
    // Skip update check in dev mode
    proceedToLoadingWindow(event, loginWindow, responseData)
    return
  }

  autoUpdater.checkForUpdates()

  autoUpdater.on('checking-for-update', async () => {
    await systemLogToFile(`[Login] Checking for update...`, 'Program')

    console.log('Login: Checking for update...')
  })

  autoUpdater.on('update-available', async () => {
    await systemLogToFile(`[Login] Update-available...`, 'Program')

    console.log('Login: Update available, downloading...')
    if (loginWindow) {
      loginWindow.webContents.send('show-loading')
    }
    autoUpdater.downloadUpdate()
  })

  autoUpdater.on('update-not-available', async () => {
    await systemLogToFile(`[Login] Update-not-available...`, 'Program')

    console.log('Login: No update available.')
    proceedToLoadingWindow(event, loginWindow, responseData)
  })

  autoUpdater.on('error', async (err) => {
    await systemLogToFile(`[Login] CheckForUpdates: ERR_NAME_NOT_RESOLVED`, 'Program')

    console.log('Login: AutoUpdater error:', err)
    proceedToLoadingWindow(event, loginWindow, responseData)
  })

  autoUpdater.on('download-progress', async (progress) => {
    await systemLogToFile(`[Login] Download-progress: ${Math.round(progress.percent)}%`, 'Program')

    console.log(`Login:  Downloading... ${Math.round(progress.percent)}%`)

    if (loginWindow) {
      loginWindow?.webContents.send('update-download-progress', Math.round(progress.percent))
    }
  })

  autoUpdater.on('update-downloaded', async () => {
    await systemLogToFile(`[Login] Update-downloaded.`, 'Program')

    console.log('Login: Update-downloaded')

    loginWindow?.webContents.send('update-downloaded')
    await new Promise((resolve) => setTimeout(resolve, 4000))
    autoUpdater.quitAndInstall(true, true)
  })
}

async function proceedToLoadingWindow(
  event: Electron.IpcMainEvent,
  loginWindow: BrowserWindow,
  responseData: {
    data: { accessToken: string; account: any; refreshToken: string; versionLatest: string }
  }
) {
  autoUpdater.removeAllListeners()
  await systemLogToFile(`Get /api/v1/user/auth/login: Response 200 OK`, 'Program')
  const { accessToken, account } = responseData.data

  event.reply('LoginResult', { success: true, message: 'success', data: responseData.data })

  loginWindow?.close()
  const initAppWindow = createInitAppWindow()

  await handleUserSettingsSync(accessToken)

  Account.update({}, DEFAULT_ACCOUNT_STATUS)

  const dataSetting = Setting.findAll() as SettingSchemaType[]
  if (!dataSetting.length) {
    Setting.create(DEFAULT_SETTING)
    Account.updateTypeCrawlForRefresh(GAME_TYPES.BIG_SMALL)
  } else {
    Account.updateTypeCrawlForRefresh(dataSetting[0].gameType)
  }

  SportsBookProviders.create({ id: uuidv4(), idSportsBook: 'sports-book1' })

  const settingTableView = SettingTableView.findAll() as unknown as SettingTableViewType[]
  if (!settingTableView.length) {
    SettingTableView.insertMany([{ tab: 'BetHistory', contraStrategy: '', clear: 0, scroll: 0 }])
  } else {
    SettingTableView.update({ tab: 'BetHistory' }, { contraStrategy: '', clear: 0, scroll: 0 })
  }

  await Promise.all([
    fetchDataSystem(`${import.meta.env.VITE_URL}/user/platform`, Platform, accessToken)
  ]).catch(async (error) => {
    console.error('Error in concurrent API calls:', error)
    await systemLogToFile(
      `Concurrent API calls failed: ${error instanceof Error ? error.message || 'Unknown error' : String(error)}`,
      'Error'
    )
  })

  initAppWindow.webContents.send('init-app-done')
  await delay(2000)

  mainWindow = await createMainWindow(account)
  mainWindow.webContents.once('did-finish-load', () => {
    if (account.warningExpired) {
      mainWindow?.webContents.send('show-session-expire-popup', {
        expiredDate: account.expiredDate,
        autoCloseMs: 5000
      })
    }

    initAppWindow.close()
  })

  initSocket(accessToken, 'en', mainWindow)
}

app.on('second-instance', () => {
  if (loginWindow && !loginWindow.isDestroyed()) {
    if (loginWindow.isMinimized()) loginWindow.restore()
    loginWindow.focus()
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  loginWindow = createWindow()

  clearAllTables()
})

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    loginWindow = createWindow()
  }
})

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
