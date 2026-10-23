import { createContext, SetStateAction, useEffect, useState } from 'react'

import { BET_MODES, GAME_TYPES } from '@shared/common/constants'
import { SettingType } from '@shared/common/types'

interface SchedulerContextType {
  gameType: { gameType: string; setGameType: (value: string) => void }
  betMode: { betMode: string; setBetMode: (value: string) => void }

  betAmountRandom: {
    enableRandomizer: number
    setRandomizerEnabled: (value: SetStateAction<number>) => void
    fromRandomizer: string
    setFromValue: (value: string) => void
    toRandomizer: string
    setToValue: (value: string) => void
  }
}

export const SettingContext = createContext<SchedulerContextType | undefined>(undefined)

export const SettingProvider = ({ children }) => {
  const [gameType, setGameType] = useState<string>(GAME_TYPES.BIG_SMALL)
  const [betMode, setBetMode] = useState<string>(BET_MODES.Random)

  const [enableRandomizer, setRandomizerEnabled] = useState<number>(0)
  const [fromRandomizer, setFromValue] = useState<string>('100')
  const [toRandomizer, setToValue] = useState<string>('100')

  useEffect(() => {
    const fetchData = async () => {
      const setting = (await window.electron.ipcRenderer.invoke('GetDataSetting')) as SettingType

      setGameType(setting.gameType)
      setBetMode(setting.betMode)

      setRandomizerEnabled(setting.enableRandomizer)
      setFromValue(setting.fromRandomizer)
      setToValue(setting.toRandomizer)
    }

    fetchData()

    return () => {
      window.electron.ipcRenderer.removeAllListeners('GetDataSetting')
    }
  }, [])

  const contextValue: SchedulerContextType = {
    gameType: { gameType, setGameType },
    betMode: { betMode, setBetMode },

    betAmountRandom: {
      enableRandomizer,
      setRandomizerEnabled,
      fromRandomizer,
      setFromValue,
      toRandomizer,
      setToValue
    }
  }

  return <SettingContext.Provider value={contextValue}>{children}</SettingContext.Provider>
}
