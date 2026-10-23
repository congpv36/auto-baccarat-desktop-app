import { Account, PlatformUrl, SportsBook } from '@db/model'
import { BrowserWindow } from 'electron'

import { AccountType, PlatformUrlType, SportsBookType } from '@shared/common/types'
import { STATUS_ACCOUNT } from '@shared/main/constants'

import { handleGetDataSportsBook } from '@/browserWindows/service/handleGetDataSportsBook'
import { enqueueWorker } from '@/worker'

export function handleAccountLoggedAgain(accountId: string, mainWindow: BrowserWindow) {
  const account = Account.findOne({ id: accountId, statusDelete: 0 }) as AccountType
  if (!account) return

  const platformURL = PlatformUrl.findAll({
    platformName: account.platformName
  }) as PlatformUrlType[]

  const sportsBook = SportsBook.findOne({ platform: account.platformName }) as SportsBookType
  const isLockURL = sportsBook.lockURL

  const nextUrl = isLockURL == 0 ? getNextUrl(account.loginURL, platformURL) : account.loginURL

  const sportsBookNew = SportsBook.update(
    { platform: account.platformName },
    { url: nextUrl }
  ) as SportsBookType

  Account.updateMany(
    { platformName: account.platformName },
    {
      loginURL: nextUrl
    }
  )

  const dataSportsBook = handleGetDataSportsBook(sportsBookNew.name)
  mainWindow.webContents.send('DataSportsBook', dataSportsBook)

  Account.update(
    { id: accountId },
    {
      status: STATUS_ACCOUNT.IN_PROGRESS,
      loginURL: nextUrl
    }
  )
  enqueueWorker(Account.findById(accountId), mainWindow)
}

const getNextUrl = (loginURL: string, platformURL: PlatformUrlType[]) => {
  const index = platformURL.findIndex((item) => item.url === loginURL)

  const nextIndex = (index + 1) % platformURL.length

  return platformURL[nextIndex].url
}
