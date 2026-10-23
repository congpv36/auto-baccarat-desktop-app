import React, { createContext, useContext, useEffect, useState } from 'react'

import { AccountType } from '@shared/common/types'

const AccountContext = createContext<AccountType | null>(null)

export const useAccountUpdate = () => useContext(AccountContext)

export const AccountUpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [updateData, setUpdateData] = useState<AccountType | null>(null)

  useEffect(() => {
    const handleUpdate = (_: unknown, data: AccountType) => {
      setUpdateData(data)
    }

    window.electron.ipcRenderer.on('DataUpdateAccount', handleUpdate)

    return () => {
      window.electron.ipcRenderer.removeAllListeners('DataUpdateAccount')
    }
  }, [])

  return <AccountContext.Provider value={updateData}>{children}</AccountContext.Provider>
}
