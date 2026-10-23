import React, { createContext, useContext, useState } from 'react'

type CountContextType = {
  totalBetHistory: number
  setTotalBetHistory: React.Dispatch<React.SetStateAction<number>>
}

const CountContext = createContext<CountContextType | null>(null)

export const useCount = () => {
  const ctx = useContext(CountContext)
  if (!ctx) throw new Error('useCount must be used within CountProvider')
  return ctx
}

export const CountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [totalBetHistory, setTotalBetHistory] = useState(0)

  return (
    <CountContext.Provider
      value={{
        totalBetHistory,
        setTotalBetHistory
      }}
    >
      {children}
    </CountContext.Provider>
  )
}
