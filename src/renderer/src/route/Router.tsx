import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import BetHistory from '@renderer/pages/BetHistory'
import ProgramSetting from '@renderer/pages/ProgramSetting'
import SportsBook from '@renderer/pages/SportsBook'
import { Path } from '@renderer/route/Path'
import InitApp from '@renderer/windows/InitApp'
import Login from '@renderer/windows/Login'
import Main from '@renderer/windows/Main'

import GeneralSetting from '@renderer/components/ProgramSetting/GeneralSetting'
import Language from '@renderer/components/ProgramSetting/Language'
import ProxyServerSettingsGeneral from '@renderer/components/ProgramSetting/ProxyServerSettingsGeneral'
import { SportsBookTab } from '@renderer/components/SportsBook/SportsBookTab'
import { SettingProvider } from '@renderer/context/SettingContext'

function Router() {
  return (
    <HashRouter>
      <Routes>
        <Route path={Path.main} element={<Main />}>
          <Route index element={<Navigate to="sports-book/sports-book1" replace />} />
          <Route path="sports-book" element={<SportsBook />}>
            <Route index element={<Navigate to="sports-book1" replace />} />
            <Route path=":id" element={<SportsBookTab />} />
          </Route>
          <Route path="bet-history" element={<BetHistory />} />

          <Route path="program-settings" element={<ProgramSetting />}>
            <Route index element={<Navigate to="general-setting" replace />} />
            <Route
              path="general-setting"
              element={
                <SettingProvider>
                  <GeneralSetting />
                </SettingProvider>
              }
            />

            <Route path="proxy-setting" element={<ProxyServerSettingsGeneral />} />
            <Route path="language" element={<Language />} />
          </Route>
        </Route>

        <Route path={Path.login} element={<Login />} />
        <Route path={Path.initApp} element={<InitApp />} />
      </Routes>
    </HashRouter>
  )
}

export default Router
