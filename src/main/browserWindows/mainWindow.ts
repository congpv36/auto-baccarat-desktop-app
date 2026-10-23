import { join } from 'path'

import {
  Account,
  BetHistory,
  BetListResult,
  clearTable,
  Platform,
  PlatformUrl,
  Setting,
  SettingTableView,
  SportsBook,
  SportsBookProviders
} from '@db/model'
import { SettingSchemaType } from '@db/schema/setting'
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'

import { sortBetHistory } from '@shared/common/betHistory'
import { LanguageType } from '@shared/common/constants'
import { AccountType, BetHistoryType, PlatformType, SportsBookType } from '@shared/common/types'
import { BetListDBType } from '@shared/common/types'
import { DEFAULT_ACCOUNT_STATUS, DEFAULT_SPORTS_BOOK_CONFIG } from '@shared/main/constants'
import { SaveBetFixedAmountValueType } from '@shared/main/types'

import { sendUserSettingsToServer } from './service/sendUserSettingsToServer'

import { handleDeletePlatForm } from '@/browserWindows/service/handleDeletePlatForm'
import { handleGetDataSportsBook } from '@/browserWindows/service/handleGetDataSportsBook'
import { handleListReportFile } from '@/browserWindows/service/handleListReportFile'
import {
  handleLoginAccount,
  handleLogoutAccount
} from '@/browserWindows/service/handleLoginLogoutAccount'
import { refreshAccessToken } from '@/browserWindows/service/refreshAccessToken'
import { setupAutoUpdater } from '@/browserWindows/service/setupAutoUpdater'
import { updateDataAccount } from '@/browserWindows/service/updateDataAccount'
import { updateDataListAccount } from '@/browserWindows/service/updateDataListAccount'
import { systemLogToFile } from '@/worker/lib/systemLogToFile'

export async function createMainWindow(account: {
  id: string
  username: string
  isActive: boolean
  role: string
}) {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 177,
    minHeight: 100,
    show: false,
    autoHideMenuBar: true,
    center: true,
    frame: false,
    titleBarOverlay: false,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    trafficLightPosition: { x: 15, y: 10 },
    icon: 'build/icon.png',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL('http://localhost:5174/#/main')
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'main' })
  }

  mainWindow.webContents.once('did-finish-load', async () => {
    mainWindow.show()

    if (!is.dev) {
      await systemLogToFile(`[Main] SetupAutoCheckUpdate has been activated`, 'Program')
      setupAutoUpdater()
    }
  })

  ipcMain.on('window-control', (event, action: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    switch (action) {
      case 'minimize':
        win.minimize()
        break
      case 'maximize':
        win.isMaximized() ? win.unmaximize() : win.maximize()
        break
      case 'close':
        win.close()
        break
    }
  })
  //************************************** Popup Account *********************************************** */
  const activeSportsBook = 'sports-book1'

  //************************************** SettingWindow *********************************************** */

  ipcMain.handle('GetDataSetting', () => {
    return Setting.findAll()[0] as SettingSchemaType
  })

  ipcMain.on('SaveSettingWindow', async (_, data: SettingSchemaType) => {
    const setting = Setting.findAll()[0] as SettingSchemaType
    Setting.update({ id: setting.id }, data)

    Account.updateMany({ checkBoxRefresh: 1 }, { typeCrawl: data.gameType })

    await sendUserSettingsToServer()
  })

  ipcMain.on('SaveSettingLanguage', async (_, data: { language: LanguageType }) => {
    const setting = Setting.findAll()[0] as SettingSchemaType
    Setting.update({ id: setting.id }, { language: data.language })
  })
  //******************************************************************************************************* */

  //************************************** ProxyServerSettingGeneral *********************************************** */

  ipcMain.on('UpdateDataProxyServerSettingsGeneral', async (_, data) => {
    const setting = Setting.findAll()[0] as SettingSchemaType
    if (!setting) return

    Setting.update(
      { id: setting.id },
      {
        ipAddress: data.ipAddress,
        port: data.port || '0',
        username: data.username,
        password: data.password
      }
    )

    await sendUserSettingsToServer()
  })

  //***************************************************************************************************** */

  //************************************** ListPlatformBookWindow *********************************************** */

  ipcMain.handle('GetListPlatform', () => {
    return Platform.findAll()
  })

  ipcMain.handle('AddPlatForm', (_, data) => {
    const { isTrialAccount, activeSportsBook, platform } = data

    const isPlatform = SportsBook.findOne({ platform: platform.name }) as SportsBookType
    if (isPlatform) {
      return 1
    }

    SportsBook.create({
      id: uuidv4(),
      name: activeSportsBook,
      platform: platform.name,
      url: platform.url,
      ...DEFAULT_SPORTS_BOOK_CONFIG,
      betFixedAmountValue: isTrialAccount ? '50' : '10'
    })

    const dataSportsBook = handleGetDataSportsBook(activeSportsBook)
    mainWindow.webContents.send('DataSportsBook', dataSportsBook)

    return 0
  })

  //************************************************************************************* */
  //************************************** AccountListWindow *********************************************** */

  ipcMain.handle('GetListAccountByPlatform', async (_, platform) => {
    try {
      const [sportBook, platformData] = await Promise.all([
        SportsBook.findOne({ platform }) as SportsBookType,
        Platform.findOne({ name: platform }) as PlatformType
      ])

      if (!sportBook || !platformData) {
        throw new Error('Invalid platform or data not found.')
      }

      const accounts = Account.findAll({ platformName: platform }) as AccountType[]
      const listAccount = accounts ?? []
      listAccount.sort((a, b) => a.orderID - b.orderID)

      return {
        listAccount,
        platform: platformData,
        switchSettings: {
          isSwitchBySuccessCount: sportBook.isSwitchBySuccessCount,
          isSwitchByCredit: sportBook.isSwitchByCredit,
          minSuccessCount: sportBook.minSuccessCount,
          maxSuccessCount: sportBook.maxSuccessCount,
          maxCredit: sportBook.maxCredit
        }
      }
    } catch (error) {
      console.error('GetListAccountByPlatform error:', error)
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.on('SaveAccountListWindow', (_, { platform, listAccount, switchSettings }) => {
    if (!platform) return

    updateDataListAccount(platform, listAccount, mainWindow, activeSportsBook, switchSettings)
  })

  //************************************************************************************* */

  //************************************** mainWindow *********************************************** */
  ipcMain.on('UpdateSportsBookProviders', (_, { activeSportsBook }) => {
    clearTable('SportsBookProviders')
    SportsBookProviders.create({ id: uuidv4(), idSportsBook: activeSportsBook })
  })

  ipcMain.handle('GetUrl', (_, platform) => {
    return PlatformUrl.findAll({ platformName: platform })
  })

  ipcMain.on('Update_LockURL', (_, { platformName, lockURL, sportsBookId }) => {
    SportsBook.update({ name: sportsBookId, platform: platformName }, { lockURL })

    const dataSportsBook = handleGetDataSportsBook(sportsBookId)
    mainWindow.webContents.send('DataSportsBook', dataSportsBook)
  })

  ipcMain.on('UpdateUrlPlatform', (_, { platformName, selectedUrl, sportsBookId }) => {
    SportsBook.update({ name: sportsBookId, platform: platformName }, { url: selectedUrl })
    const accounts = Account.updateMany(
      { platformName },
      { ...DEFAULT_ACCOUNT_STATUS, loginURL: selectedUrl }
    )

    if (accounts.length > 0) {
      for (const acc of accounts) {
        mainWindow.webContents.send('DataUpdateAccount', acc)
      }
    }

    const dataSportsBook = handleGetDataSportsBook(sportsBookId)
    mainWindow.webContents.send('DataSportsBook', dataSportsBook)
  })

  ipcMain.handle('GetDataSportsBook', (_, activeId) => {
    return handleGetDataSportsBook(activeId)
  })

  ipcMain.handle('GetDataSportBookByPlatform', (_, platform) => {
    return SportsBook.findOne({ platform }) as SportsBookType
  })

  ipcMain.on('SaveBetFixedAmountValue', (_, data: SaveBetFixedAmountValueType) => {
    SportsBook.update({ platform: data.platform }, { ...data.data })

    const dataSportsBook = handleGetDataSportsBook(data.activeSportsBook)
    mainWindow.webContents.send('DataSportsBook', dataSportsBook)
  })

  ipcMain.on('DeletePlatform', (_, data) => {
    const { activeId, namePlatform } = data
    handleDeletePlatForm(mainWindow, namePlatform, activeId)
  })

  ipcMain.handle('DataAccount', (_, accountId) => {
    return Account.findById(accountId)
  })

  ipcMain.handle('CheckUserNameAccount', (_, data) => {
    const { username, platform } = data
    const checkAccount = Account.findOne({ loginID: username, platformName: platform })
    return !!checkAccount
  })

  ipcMain.on('Data_AccountLoginForm', (_, data) => {
    const { activeId, account } = data
    updateDataAccount(activeId, account, mainWindow)
  })

  ipcMain.on('UpdateAccount', (_, data) => {
    const validFields = ['checkBoxBet', 'checkBoxRefresh', 'checkBoxAutoLogin', 'checkBoxLockURL']
    if (!validFields.includes(data.field)) return

    if (data.field === 'checkBoxRefresh') {
      if (data.value === 1) {
        const setting = Setting.findAll() as SettingSchemaType[]
        Account.update(
          { id: data.accountId },
          { typeCrawl: setting[0].gameType, [data.field]: data.value }
        )
      } else {
        Account.update({ id: data.accountId }, { [data.field]: data.value })
      }
    } else {
      Account.update({ id: data.accountId }, { [data.field]: data.value })
    }
  })

  ipcMain.on('LoginAccount', (_, account) => {
    handleLoginAccount(account, mainWindow)
  })

  ipcMain.on('LogoutAccount', (_, account) => {
    handleLogoutAccount(account, mainWindow)
  })

  ipcMain.on(
    'UpdateSettingViewTable',
    (
      _,
      {
        tab,
        data
      }: { tab: string; data: { contraStrategy: string; clear: number; scroll: number } }
    ) => {
      SettingTableView.update({ tab }, data)
    }
  )

  ipcMain.handle('GetBetHistory', () => {
    return sortBetHistory(BetHistory.findAll() as BetHistoryType[])
  })

  ipcMain.on('Data_ProxyServerSetting_Platform', (_, data) => {
    const { platformName, formData } = data

    Account.update(
      { platformName },
      {
        proxyIP: formData.ipAddress || null,
        proxyPort: formData.port,
        proxyUsername: formData.username || null,
        proxyPassword: formData.password || null
      }
    )
  })

  ipcMain.handle('ChangePassword', async (_, { currentPassword, newPassword }) => {
    try {
      const newAccessToken = await refreshAccessToken(mainWindow)

      const response = await fetch(`${import.meta.env.VITE_URL}/user/users/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newAccessToken}`
        },
        body: JSON.stringify({
          oldPassword: currentPassword,
          newPassword
        })
      })

      const data = (await response.json()) as { message?: string; statusCode?: number }

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to change password')
      }

      await systemLogToFile('User password changed successfully', 'Program')
      return { success: true, message: 'Password changed successfully' }
    } catch (error) {
      await systemLogToFile(
        `ChangePassword error: ${error instanceof Error ? error.message : String(error)}`,
        'Error'
      )

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to change password'
      }
    }
  })

  //************************************** ConfirmLogoutWindow *********************************************** */

  ipcMain.on('CloseAppByToken', async () => {
    mainWindow.hide()
    const date = new Date()
      .toISOString()
      .replace(/[-T:Z]/g, '')
      .slice(0, 14)

    const betList = BetListResult.findAll() as BetListDBType[]
    if (betList.length > 0) {
      const flattenedDataBetList = betList.flatMap((item) => JSON.parse(item.dataPair))
      handleListReportFile(flattenedDataBetList, 'BetListReport', date)
    }

    await sendUserSettingsToServer()

    app.quit()
  })

  ipcMain.on('setExpiredDate', async (_event, expiredDate) => {
    mainWindow.setTitle(
      `${import.meta.env.VITE_BUILD_TARGET} v${app.getVersion()}         User: ${account.username}/ Expiry Date: ${expiredDate}`
    )
  })

  ipcMain.on('QuitApp', async () => {
    const date = new Date()
      .toISOString()
      .replace(/[-T:Z]/g, '')
      .slice(0, 14)

    const betList = BetListResult.findAll() as BetListDBType[]
    if (betList.length > 0) {
      const flattenedDataBetList = betList.flatMap((item) => JSON.parse(item.dataPair))
      handleListReportFile(flattenedDataBetList, 'BetListReport', date)
    }

    await sendUserSettingsToServer()

    app.quit()
  })

  return mainWindow
}
