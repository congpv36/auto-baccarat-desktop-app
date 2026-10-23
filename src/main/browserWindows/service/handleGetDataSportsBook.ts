import { Account, SportsBook } from '@db/model'

import { AccountType, SportsBookType } from '@shared/common/types'

export function handleGetDataSportsBook(activeSportsBook: string) {
  const listPlatformBySportsBook = SportsBook.findAll({
    name: activeSportsBook
  }) as SportsBookType[]

  const listAccount = Account.findAll({ statusDelete: 0 }) as AccountType[]

  const dataSportsBook = listPlatformBySportsBook.map((sportBook) => {
    const accounts = listAccount
      .filter((account) => account.platformName === sportBook.platform)
      .sort((a, b) => a.orderID - b.orderID)
      .slice(0, 1)
    return { ...sportBook, accounts }
  })

  return dataSportsBook
}
