import { useEffect, useState } from 'react'
import AppLayout from '@renderer/layouts/AppLayout'

import DialogWithCountdown from '@renderer/components/Dialog/DialogWithCountdownProps'
import SabaUnauthorizedPopup, {
  SabaUnauthorizedInfo
} from '@renderer/components/Dialog/SabaUnauthorizedPopup'
import SessionExpirePopup from '@renderer/components/Dialog/SessionExpirePopup'
import { useCount } from '@renderer/context/CountContext'
export default function Main() {
  const { setTotalBetHistory } = useCount()

  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    window.electron.ipcRenderer
      .invoke('GetBetHistory')
      .then((rows: unknown[]) => setTotalBetHistory(rows.length))

    const removeNewBetHistory = window.electron.ipcRenderer.on(
      'NewBetHistory',
      (_event, rows: unknown[]) => {
        setTotalBetHistory((prev) => prev + rows.length)
      }
    )

    return () => {
      removeNewBetHistory()
    }
  }, [])
  useEffect(() => {
    window.electron.onForceLogout((_event, data) => {
      if (data.message) {
        setMessage(data.message)

        setOpen(true)

        setTimeout(() => {
          window.electron.ipcRenderer.send('CloseAppByToken')
        }, 3000)
      }
    })
  }, [])

  useEffect(() => {
    window.electron.syncExpiredDate((_event, data) => {
      const expiredDate = new Date(data?.expiredDate)

      const formattedDate =
        expiredDate.getUTCFullYear() +
        '-' +
        String(expiredDate.getUTCMonth() + 1).padStart(2, '0') +
        '-' +
        String(expiredDate.getUTCDate()).padStart(2, '0') +
        ' ' +
        String(expiredDate.getUTCHours()).padStart(2, '0') +
        ':' +
        String(expiredDate.getUTCMinutes()).padStart(2, '0') +
        ':' +
        String(expiredDate.getUTCSeconds()).padStart(2, '0')

      window.electron.ipcRenderer.send('setExpiredDate', formattedDate, data?.versionLatest)
    })
  }, [])

  const [sessionPopup, setSessionPopup] = useState<{
    expiredDate: string
    autoCloseMs: number
  } | null>()

  useEffect(() => {
    window.electron.ipcRenderer.on('show-session-expire-popup', (_event, payload) => {
      setSessionPopup(payload)
    })
    return () => {
      window.electron.ipcRenderer.removeAllListeners('show-session-expire-popup')
    }
  }, [])

  const [sabaUnauthorized, setSabaUnauthorized] = useState<SabaUnauthorizedInfo | null>(null)

  useEffect(() => {
    window.electron.ipcRenderer.on('SabaUnauthorized', (_event, payload: SabaUnauthorizedInfo) => {
      setSabaUnauthorized(payload)
    })
    window.electron.ipcRenderer.on('RegionRestricted', (_event, payload: SabaUnauthorizedInfo) => {
      setSabaUnauthorized({
        ...payload,
        titleKey: 'region_restricted_title',
        messageKey: 'region_restricted_message'
      })
    })
    return () => {
      window.electron.ipcRenderer.removeAllListeners('SabaUnauthorized')
      window.electron.ipcRenderer.removeAllListeners('RegionRestricted')
    }
  }, [])

  return (
    <>
      <AppLayout />
      {sabaUnauthorized && (
        <SabaUnauthorizedPopup {...sabaUnauthorized} onClose={() => setSabaUnauthorized(null)} />
      )}
      {sessionPopup && (
        <SessionExpirePopup
          expiredDate={sessionPopup.expiredDate}
          autoCloseMs={sessionPopup.autoCloseMs}
          onClose={() => setSessionPopup(null)}
        />
      )}
      {open && (
        <DialogWithCountdown
          open={open}
          setOpen={() => setOpen(false)}
          message={message || 'Your session has expired, please login again.'}
        />
      )}
    </>
  )
}
