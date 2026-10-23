import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { NotificationError } from '@renderer/components/NotificationPopup/NotificationError'
import CountryIpSelector from '@renderer/components/SportsBook/DetailSportsBook/AccountPlatform/CountryIpSelector'
import { AlertDialog, AlertDialogContent } from '@renderer/components/ui/alert-dialog'
import { validateAndUpdateData } from '@renderer/lib/validateAndUpdateData'
import ExclamationTriangle from '@renderer/icons/exclamation-triangle'
import Eye from '@renderer/icons/eye'
import EyeSlash from '@renderer/icons/eye-slash'

import { AccountType } from '@shared/common/types'

interface AccountInfoProps {
  account: AccountType
}

function AccountInfo({ account }: AccountInfoProps) {
  const { id: activeId } = useParams()
  const { t } = useTranslation(['main', 'layout'])
  const [openModalSetting, setOpenModalSetting] = useState(false)
  const [customIP, setCustomIP] = useState(account.customIP || '')

  const [formData, setFormData] = useState({
    loginID: '',
    password: ''
  })
  const [loginID, setUsername] = useState('')
  const [platform, setPlatform] = useState('')

  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    visible: false
  })

  const firstInputRef = useRef<HTMLInputElement>(null)

  const [isPasswordVisible, setIsPasswordVisible] = useState(false)

  useEffect(() => {
    if (!openModalSetting) return

    const fetchAccount = async () => {
      const data = (await window.electron.ipcRenderer.invoke(
        'DataAccount',
        account.id
      )) as AccountType
      setPlatform(data.platformName)
      setFormData({
        loginID: data.loginID || '',
        password: data.password || ''
      })
      setUsername(data.loginID)
    }
    fetchAccount()
  }, [openModalSetting, account.id])

  useEffect(() => {
    if (firstInputRef.current) {
      firstInputRef.current.focus()
    }
  }, [])

  const handleInputChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    if (formData.loginID && formData.loginID !== loginID) {
      const isDuplicate = await window.electron.ipcRenderer.invoke('CheckUserNameAccount', {
        username: formData.loginID,
        platform
      })
      if (isDuplicate) {
        setAlertConfig({
          title: t('notification', { ns: 'layout' }),
          message: t('this_account_already_exists'),
          visible: true
        })
        return
      }
    }
    const validateFormData = validateAndUpdateData(formData)

    window.electron.ipcRenderer.send('Data_AccountLoginForm', {
      activeId,
      account: {
        id: account.id,
        customIP,
        ...validateFormData
      }
    })
    setOpenModalSetting(false)
  }

  return (
    <>
      <div
        className=" font-bold underline decoration-blue-color text-blue-color hover:decoration-blue-500 cursor-pointer truncate w-[140px]"
        onClick={() => setOpenModalSetting(true)}
      >
        {account.loginID}
      </div>
      <AlertDialog open={openModalSetting}>
        <AlertDialogContent className="p-0 rounded-[12px]  bg-white flex flex-col gap-0">
          <header className="flex p-[16px] border-b border-border-default">
            <div className="ml-[10px] flex flex-col">
              <div className="flex justify-between">
                <p className="text-lg font-semibold ">{t('account_information')}</p>
                <button
                  className="absolute top-[6px] right-[6px] font-normal block w-9 h-9 leading-none hover:bg-gray-200 hover:rounded-full"
                  onClick={() => setOpenModalSetting(false)}
                >
                  ✕
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 gap-[16px] px-[24px] text-sm">
            <div className="flex-1 py-[20px] flex">
              <div className="flex-1">
                <div className="flex mb-[8px]">
                  <p className="w-28 mb-[6px] leading-none">{t('username')}</p>
                  <input
                    className="flex-1 block bg-transparent border border-border-default rounded-lg py-[6px] px-[14px] focus-within:border-gray-500"
                    ref={firstInputRef}
                    type="text"
                    value={formData.loginID}
                    onChange={(e) => handleInputChange('loginID', e.target.value)}
                    spellCheck={false}
                    maxLength={20}
                  />
                </div>
                <div className="flex">
                  <p className="w-28 mb-[6px] leading-none">{t('password')}</p>
                  <div className="flex flex-1 bg-transparent border border-border-default rounded-lg py-[6px] px-[14px] focus-within:border-gray-500">
                    <input
                      type={isPasswordVisible ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      className="flex-1 outline-none bg-transparent"
                      spellCheck={false}
                      maxLength={20}
                    />
                    <button
                      type="button"
                      className="text-gray-400 w-4 mr-1"
                      onClick={() => setIsPasswordVisible((prev) => !prev)}
                    >
                      {isPasswordVisible ? <Eye /> : <EyeSlash />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <CountryIpSelector account={account} setCustomIP={setCustomIP} />
            <div className=" pt-2" />
          </main>

          <footer className="flex gap-[16px]  p-[24px] ">
            <button
              className="flex-1 outline-none border border-border-default hover:border-gray-700 block h-[40px] font-semibold rounded-[8px]"
              onClick={() => setOpenModalSetting(false)}
            >
              {t('cancel', { ns: 'layout' })}
            </button>
            <button
              className="bg-main-color text-white flex-1 border-none block h-[40px] font-semibold  hover:bg-opacity-90 rounded-[8px]"
              onClick={save}
            >
              {t('save', { ns: 'layout' })}
            </button>
          </footer>
        </AlertDialogContent>
      </AlertDialog>
      <NotificationError
        showAlertDialog={alertConfig.visible}
        setShowAlertDialog={(visible) => setAlertConfig((prev) => ({ ...prev, visible }))}
        title={alertConfig.title}
        messageError={alertConfig.message}
        ReactElement={<ExclamationTriangle className="text-[#FF8C00] mr-1 size-11" />}
      />
    </>
  )
}

export default AccountInfo
