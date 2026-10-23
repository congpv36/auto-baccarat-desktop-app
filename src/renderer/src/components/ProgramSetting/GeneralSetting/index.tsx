import { useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle } from 'lucide-react'

import BettingConfig from '@renderer/components/ProgramSetting/GeneralSetting/BettingConfig'
import OddsAndGameConfiguration from '@renderer/components/ProgramSetting/GeneralSetting/OddsAndGameConfiguration'
import { Button } from '@renderer/components/ui/button'
import { SettingContext } from '@renderer/context/SettingContext'

import { BET_MODES, GAME_TYPES } from '@shared/common/constants'

import BetMode from './BetMode'

export default function Setting() {
  const context = useContext(SettingContext)
  if (!context) return null

  const { t } = useTranslation(['main', 'layout'])

  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [messageSuccess, setMessageSuccess] = useState<string | null>(null)
  const {
    enableRandomizer,
    setRandomizerEnabled,
    fromRandomizer,
    setFromValue,
    toRandomizer,
    setToValue
  } = context.betAmountRandom

  const handleSaveSetting = () => {
    window.electron.ipcRenderer.send('SaveSettingWindow', {
      gameType: context.gameType.gameType,
      betMode: context.betMode.betMode,
      enableRandomizer,
      fromRandomizer,
      toRandomizer
    })

    setShowSaveSuccess(true)
    setMessageSuccess(t('save_successful', { ns: 'layout' }))
    setTimeout(() => {
      setShowSaveSuccess(false)
    }, 1500)
  }

  const handleResetAllChanges = () => {
    setRandomizerEnabled(0)
    setFromValue('50')
    setToValue('200')

    context.gameType.setGameType(GAME_TYPES.BIG_SMALL)
    context.betMode.setBetMode(BET_MODES.Random)
  }

  const handleCancel = () => {
    window.history.back()
  }

  return (
    <div className="bg-layout-color h-full flex flex-col">
      <div className="flex-1 overflow-auto px-4">
        <div className="min-w-[800px]">
          <OddsAndGameConfiguration />
          <BetMode />
          <BettingConfig />
        </div>
      </div>

      <div className="flex justify-end space-x-2 pt-3 pb-2 px-5 flex-shrink-0 border-t border-border-default bg-layout-color">
        <Button
          variant="bordered-white"
          className="text-text-default bg-white whitespace-nowrap border-border-default hover:border-gray-600"
          onClick={handleResetAllChanges}
        >
          {t('reset_all_changes', { ns: 'layout' })}
        </Button>
        <Button
          variant="bordered-white"
          className="whitespace-nowrap text-text-default bg-white flex-shrink-0 border-border-default hover:border-gray-600 w-32"
          onClick={handleCancel}
        >
          {t('cancel', { ns: 'layout' })}
        </Button>

        <Button
          onClick={handleSaveSetting}
          className="whitespace-nowrap flex-shrink-0 text-white w-32"
        >
          {t('save', { ns: 'layout' })}
        </Button>
      </div>

      {showSaveSuccess && (
        <div className="fixed top-[5%] right-[2%] bg-green-500 text-white px-4 py-2 rounded-md shadow-lg flex items-center z-50 animate-pulse">
          <CheckCircle className="w-5 h-5 mr-2" />
          <span>{messageSuccess}</span>
        </div>
      )}
    </div>
  )
}
