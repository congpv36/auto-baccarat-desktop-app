import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { twMerge } from 'tailwind-merge'

import CheckboxField from '@renderer/components/SportsBook/CheckboxField'
import AccountInfo from '@renderer/components/SportsBook/DetailSportsBook/AccountPlatform/AccountInfo'
import { useAccountUpdate } from '@renderer/context/AccountContext'

import { AccountType } from '@shared/common/types'

interface AccountPlatformProps {
  account: AccountType
  index: number
}

interface AccountState {
  loginID: string
  buttonText: string
  log: string | null

  currency: string | null

  cashBalance: string
  outstanding: string
  givenCredit: string
  betCredit: string

  checkBet: boolean
  checkRefresh: boolean
  checkAutoLogin: boolean
  statusLogin: string | null
}

const ACCOUNT_STATUS = {
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  EXIT: 'Exit',
  IN_PROGRESS: 'In-Progress'
}

const mapAccountToState = (source: AccountType): AccountState => ({
  loginID: source.loginID,
  buttonText: source.status,
  log: source.textLog,
  currency: source.currency,
  cashBalance: source?.cashBalance || '0',
  outstanding: source?.outstanding || '0',
  givenCredit: source?.givenCredit || '0',
  betCredit: source?.credit || '0',
  checkBet: Boolean(source.checkBoxBet),
  checkRefresh: Boolean(source.checkBoxRefresh),
  checkAutoLogin: Boolean(source.checkBoxAutoLogin),
  statusLogin: source.statusLogin
})

const formatBalance = (value: string) =>
  (Math.floor(Number(value.replace(/,/g, '')) * 100) / 100).toFixed(2)

const getBalanceClass = (value: string) => {
  const numberValue = Number(value.replace(/,/g, ''))

  if (numberValue < 0) return 'text-red-color'
  if (numberValue > 0) return 'text-blue-color'

  return ''
}

interface BalanceCellProps {
  value: string
  widthClass: string
  isLoggedOut: boolean
}

const BalanceCell: React.FC<BalanceCellProps> = ({ value, widthClass, isLoggedOut }) => (
  <div className={twMerge('flex justify-center', widthClass)}>
    <p className={twMerge('ml-2 h-full font-bold', !isLoggedOut ? getBalanceClass(value) : '')}>
      {isLoggedOut ? 0 : formatBalance(value)}
    </p>
  </div>
)

const AccountPlatform: React.FC<AccountPlatformProps> = ({ account, index }) => {
  const { t } = useTranslation(['main', 'layout'])
  const updateData = useAccountUpdate()

  const [accountState, setAccountState] = useState<AccountState>(() => mapAccountToState(account))

  const isLoggedOut =
    accountState.buttonText === ACCOUNT_STATUS.LOGIN ||
    accountState.buttonText === ACCOUNT_STATUS.IN_PROGRESS

  useEffect(() => {
    setAccountState(mapAccountToState(account))
  }, [account])

  useEffect(() => {
    if (updateData && updateData.id === account.id) {
      setAccountState(mapAccountToState(updateData))
    }
  }, [updateData, account.id])

  const handleCheckboxChange = useCallback(
    (field: string) => {
      setAccountState((prev) => {
        const fieldMapping: { [key: string]: keyof AccountState } = {
          checkBoxBet: 'checkBet',
          checkBoxRefresh: 'checkRefresh',
          checkBoxAutoLogin: 'checkAutoLogin'
        }

        const stateField = fieldMapping[field]
        const newValue = !prev[stateField]

        window.electron.ipcRenderer.send('UpdateAccount', {
          accountId: account.id,
          field,
          value: newValue ? 1 : 0
        })

        return {
          ...prev,
          [stateField]: newValue
        }
      })
    },
    [account]
  )

  const handleAction = () => {
    if (accountState.buttonText === ACCOUNT_STATUS.LOGIN) {
      window.electron.ipcRenderer.send('LoginAccount', account)

      setAccountState((prev) => ({
        ...prev,
        buttonText: ACCOUNT_STATUS.IN_PROGRESS,
        log: t('waiting_for_login')
      }))
    }

    if (
      accountState.buttonText === ACCOUNT_STATUS.LOGOUT ||
      accountState.buttonText === ACCOUNT_STATUS.EXIT
    ) {
      window.electron.ipcRenderer.send('LogoutAccount', account)

      setAccountState((prev) => ({
        ...prev,
        buttonText: ACCOUNT_STATUS.LOGIN,
        log: null
      }))
    }
  }

  const buttonClass = useMemo(() => {
    switch (accountState.buttonText) {
      case ACCOUNT_STATUS.LOGOUT:
      case ACCOUNT_STATUS.EXIT:
        return 'underline text-red-color hover:cursor-pointer'

      case ACCOUNT_STATUS.IN_PROGRESS:
        return 'text-orange-color'

      default:
        return 'underline text-blue-color hover:cursor-pointer'
    }
  }, [accountState.buttonText])

  const logBoxClass = useMemo(() => {
    const { buttonText, statusLogin, log } = accountState

    if (
      ((buttonText === ACCOUNT_STATUS.LOGOUT || buttonText === ACCOUNT_STATUS.EXIT) &&
        statusLogin === 'Fail') ||
      (buttonText === ACCOUNT_STATUS.IN_PROGRESS && log?.includes('ERROR'))
    ) {
      return 'text-red-color'
    }

    if ([ACCOUNT_STATUS.IN_PROGRESS, ACCOUNT_STATUS.LOGOUT].includes(buttonText)) {
      return 'text-blue-color'
    }

    return 'text-[#FFFF00]'
  }, [accountState])

  const showLog = [ACCOUNT_STATUS.IN_PROGRESS, ACCOUNT_STATUS.LOGOUT, ACCOUNT_STATUS.EXIT].includes(
    accountState.buttonText
  )

  return (
    <div className="flex items-center text-xs">
      <div className="flex items-center w-[114px]">
        <div className="px-1">{index + 1}</div>

        <AccountInfo account={{ ...account, loginID: accountState.loginID }} />
      </div>

      <button
        onClick={account.loginID && account.password ? handleAction : undefined}
        className={twMerge(
          'font-bold w-[71px]',
          account.loginID && account.password ? buttonClass : 'text-gray-600'
        )}
      >
        {accountState.buttonText}
      </button>

      <div className="flex h-6 justify-center items-center">
        <div className="flex justify-center w-[60px]">
          <p className="h-full font-bold text-main-color">{accountState.currency || '-'}</p>
        </div>

        <BalanceCell
          value={accountState.cashBalance}
          widthClass="w-[82px]"
          isLoggedOut={isLoggedOut}
        />
        <BalanceCell
          value={accountState.outstanding}
          widthClass="w-[80px]"
          isLoggedOut={isLoggedOut}
        />
        <BalanceCell
          value={accountState.betCredit}
          widthClass="w-[80px]"
          isLoggedOut={isLoggedOut}
        />
        <BalanceCell
          value={accountState.givenCredit}
          widthClass="w-[75px]"
          isLoggedOut={isLoggedOut}
        />

        <div className="flex h-full">
          <CheckboxField
            key="checkbox_bet"
            id={`${account.id}_checkbox_bet`}
            label={t('bet')}
            checked={accountState.checkBet}
            className={
              account.orderID === 2
                ? 'w-[63px] w-min-[63px] font-semibold'
                : 'w-[48px] w-min-[48px] font-semibold'
            }
            onChange={() => handleCheckboxChange('checkBoxBet')}
          />

          {account.orderID == 1 && (
            <CheckboxField
              key="checkbox_refresh"
              id={`${account.id}_checkbox_refresh`}
              label={t('refresh', { ns: 'layout' })}
              checked={accountState.checkRefresh}
              className={'w-[63px] w-min-[63px] pr-0 font-semibold leading-none'}
              onChange={() => handleCheckboxChange('checkBoxRefresh')}
            />
          )}

          <CheckboxField
            key="checkbox_autoLogin"
            id={`${account.id}_checkbox_autoLogin`}
            label={t('auto_login')}
            checked={accountState.checkAutoLogin}
            className={'font-semibold pr-1'}
            onChange={() => handleCheckboxChange('checkBoxAutoLogin')}
          />
        </div>
      </div>

      <div
        className={twMerge(
          'flex-1 w-1 h-[72px] flex  bg-white items-center justify-start overflow-hidden text-ellipsis mr-1 border border-border-default rounded-md',
          logBoxClass
        )}
      >
        {showLog && (
          <p
            className="px-2 py-[2px] line-clamp-4 break-words whitespace-normal font-medium leading-4"
            title={accountState.log ?? undefined}
          >
            {String(accountState.log ?? '')
              .split('||')
              .map((line, i) => (
                <span key={i} className="block">
                  {line.trim()}
                </span>
              ))}
          </p>
        )}
      </div>
    </div>
  )
}

export default React.memo(AccountPlatform)
