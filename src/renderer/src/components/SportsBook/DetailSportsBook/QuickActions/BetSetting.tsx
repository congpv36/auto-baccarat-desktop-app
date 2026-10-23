import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { AlertDialog, AlertDialogContent } from '@renderer/components/ui/alert-dialog'
import { DropdownMenuItem } from '@renderer/components/ui/dropdown-menu'

import { SportsBookType } from '@shared/common/types'

export default function BetSetting({ sportsBook }: { sportsBook: SportsBookType }) {
  const { id: activeId } = useParams()
  const { t } = useTranslation(['main', 'layout'])
  const profile = localStorage.getItem('profile')
  const isTrialAccount = profile ? JSON.parse(profile)?.isTrialAccount : false

  const [openModalSetting, setOpenModalSetting] = useState(false)

  const [betFixedAmountValue, setBetFixedAmountValue] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      const data = (await window.electron.ipcRenderer.invoke(
        'GetDataSportBookByPlatform',
        sportsBook.platform
      )) as SportsBookType
      setBetFixedAmountValue(data.betFixedAmountValue)
    }
    fetchData()

    return () => {
      window.electron.ipcRenderer.removeAllListeners('GetDataSportBookByPlatform')
    }
  }, [])

  const handleSave = () => {
    const numericValue = Number(betFixedAmountValue)

    if (!isNaN(numericValue)) {
      const cleanedValue = String(numericValue)

      window.electron.ipcRenderer.send('SaveBetFixedAmountValue', {
        activeSportsBook: activeId,
        platform: sportsBook.platform,
        data: {
          betFixedAmountValue: cleanedValue == '0' ? '10' : cleanedValue
        }
      })
    }

    setOpenModalSetting(false)
  }

  return (
    <>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault()
          setOpenModalSetting(true)
        }}
        className=" cursor-pointer focus:bg-hover-default focus:font-semibold px-[4px] py-[4px] rounded-[4px]"
        onClick={() => setOpenModalSetting(true)}
      >
        {t('bet_amount')}
      </DropdownMenuItem>
      <AlertDialog open={openModalSetting}>
        <AlertDialogContent className="p-0 rounded-[12px] w-[307px] bg-white flex flex-col gap-0">
          <header>
            <div className="flex p-[10px]">
              <div className="flex justify-between">
                <p className="text-base font-semibold">{t('bet_amount')}</p>
                <button
                  className="absolute top-[6px] right-[6px] font-normal block w-9 h-9 leading-none  hover:bg-gray-200 hover:rounded-full"
                  onClick={() => setOpenModalSetting(false)}
                >
                  ✕
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-[24px] pt-3 flex flex-col">
            <div className="flex pb-6">
              <input
                className={`flex-1 bg-transparent border border-border-default  w-24 rounded-lg py-[4px] pl-[14px] pr-[5px] focus:border-gray-500 
                          ${isTrialAccount ? 'cursor-not-allowed' : 'cursor-text'}`}
                type="number"
                id="quantity"
                min={'0'}
                pattern="[0-9]*"
                onKeyDown={(e) => {
                  if (['e', 'E', '+', ',', '-', '.'].includes(e.key)) {
                    e.preventDefault()
                  }
                  const allowedKeys = ['Backspace', 'ArrowLeft', 'ArrowRight', 'Delete', 'Tab']
                  if (!/^[0-9]$/.test(e.key) && !allowedKeys.includes(e.key)) {
                    e.preventDefault()
                  }
                }}
                name="quantity"
                step={1}
                disabled={isTrialAccount}
                value={betFixedAmountValue}
                onChange={(event) => {
                  const val = event.target.value
                  if (/^\d*$/.test(val)) {
                    setBetFixedAmountValue(val)
                  }
                }}
              />
            </div>
          </main>

          <footer className="flex gap-[20px] px-[24px] pb-[24px]">
            <button
              className="flex-1 outline-none border border-border-default hover:border-gray-700 block h-[30px] text-sm font-semibold rounded-[8px]"
              onClick={() => setOpenModalSetting(false)}
            >
              {t('cancel', { ns: 'layout' })}
            </button>
            <button
              className={`bg-main-color text-white flex-1 border-none block h-[30px] text-sm font-semibold  hover:bg-opacity-90 rounded-[8px]`}
              onClick={handleSave}
            >
              {t('save', { ns: 'layout' })}
            </button>
          </footer>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
