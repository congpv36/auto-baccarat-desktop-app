import { Account } from '@db/model'
import { BrowserWindow } from 'electron'

import { AccountType } from '@shared/common/types'
import { STATUS_ACCOUNT } from '@shared/main/constants'

import { handleLoginAccount } from '@/browserWindows/service/handleLoginLogoutAccount'

export function handleMoveAccountToEnd(account: AccountType, mainWindow: BrowserWindow) {
  const currentAccount = Account.findOne<AccountType>({ id: account.id })
  if (!currentAccount) return

  const listAccount = Account.findAll({
    platformName: currentAccount.platformName
  }) as AccountType[]

  if (listAccount.length <= 1) {
    handleLoginAccount(account, mainWindow)
    return
  }

  const otherAccounts = listAccount.filter((acc) => acc.id !== currentAccount.id)

  if (
    currentAccount.orderID === 1 &&
    listAccount.length === 2 &&
    otherAccounts.some((acc) => acc.status === STATUS_ACCOUNT.LOGOUT)
  ) {
    handleLoginAccount(account, mainWindow)
    return
  }

  moveAccountToEnd(account, currentAccount, listAccount, mainWindow)
}

/**
 * Rotates the active (orderID 1) account to the end after its bet session ends
 * (success count or credit reached) and logs in the account moved up to orderID 1.
 * The rotated account is marked logged out so its crawl worker stops.
 */
export function handleSwitchAccount(
  account: AccountType,
  reason: string,
  mainWindow: BrowserWindow
) {
  const currentAccount = Account.findOne<AccountType>({ id: account.id })
  if (!currentAccount) return

  const listAccount = Account.findAll({
    platformName: currentAccount.platformName
  }) as AccountType[]
  if (listAccount.length <= 1) return

  const switchedAccount = Account.update(
    { id: currentAccount.id },
    {
      status: STATUS_ACCOUNT.LOGIN,
      statusLogin: null,
      cookie: null,
      socketUrl: null,
      host: null,
      textLog: reason
    }
  )
  if (!mainWindow.isDestroyed()) mainWindow.webContents.send('DataUpdateAccount', switchedAccount)

  moveAccountToEnd(account, currentAccount, listAccount, mainWindow)
}

function moveAccountToEnd(
  account: AccountType,
  currentAccount: AccountType,
  listAccount: AccountType[],
  mainWindow: BrowserWindow
) {
  const otherAccounts = listAccount.filter((acc) => acc.id !== currentAccount.id)
  const inProgressAccount = otherAccounts.find((acc) => acc.status === STATUS_ACCOUNT.IN_PROGRESS)

  if (!inProgressAccount) {
    moveAccountToEndDefault(account, currentAccount, listAccount, mainWindow)
    return
  }

  moveAccountToEndKeepInProgress(
    account,
    currentAccount,
    otherAccounts,
    listAccount.length,
    mainWindow
  )
}

function moveAccountToEndDefault(
  account: AccountType,
  currentAccount: AccountType,
  listAccount: AccountType[],
  mainWindow: BrowserWindow
) {
  const movingOrderID = currentAccount.orderID
  const lastOrderID = listAccount.length

  const accountsAfter = listAccount.filter(
    (acc) => acc.id !== currentAccount.id && acc.orderID > movingOrderID
  )
  const replacedAccount = accountsAfter.find((acc) => acc.orderID === movingOrderID + 1)

  accountsAfter.forEach((acc) => Account.update({ id: acc.id }, { orderID: acc.orderID - 1 }))
  Account.update({ id: currentAccount.id }, { orderID: lastOrderID })

  handleLoginAccount(replacedAccount ?? account, mainWindow)
}

function moveAccountToEndKeepInProgress(
  account: AccountType,
  currentAccount: AccountType,
  otherAccounts: AccountType[],
  totalAccounts: number,
  mainWindow: BrowserWindow
) {
  const movingOrderID = currentAccount.orderID

  const fixedOrderIDs = new Set(
    otherAccounts
      .filter((acc) => acc.status === STATUS_ACCOUNT.IN_PROGRESS)
      .map((acc) => acc.orderID)
  )

  const movableAccounts = otherAccounts
    .filter((acc) => !fixedOrderIDs.has(acc.orderID))
    .sort((a, b) => a.orderID - b.orderID)
  movableAccounts.push(currentAccount)

  const availableOrderIDs = Array.from({ length: totalAccounts }, (_, index) => index + 1).filter(
    (orderID) => !fixedOrderIDs.has(orderID)
  )

  let replacedAccount: AccountType | undefined

  movableAccounts.forEach((acc, index) => {
    const newOrderID = availableOrderIDs[index]

    if (newOrderID === movingOrderID && acc.id !== currentAccount.id) {
      replacedAccount = acc
    }

    if (acc.orderID !== newOrderID) {
      Account.update({ id: acc.id }, { orderID: newOrderID })
    }
  })

  handleLoginAccount(replacedAccount ?? account, mainWindow)
}
