import { Account, SportsBook } from '@db/model'
import { BrowserWindow } from 'electron'

import { handleGetDataSportsBook } from '@/browserWindows/service/handleGetDataSportsBook'
import { checkQueuePlatform } from '@/worker'

export function handleDeletePlatForm(
  mainWindow: BrowserWindow,
  namePlatform: string,
  activeSportsBook: string
) {
  Account.deleteMany({ platformName: namePlatform })
  SportsBook.delete({ platform: namePlatform })

  checkQueuePlatform(namePlatform)
  mainWindow.webContents.send('DataSportsBook', handleGetDataSportsBook(activeSportsBook))
}
