import { HttpsProxyAgent } from 'https-proxy-agent'

import { AccountType } from '@shared/common/types'

import { fetchWithTimeout } from '@/worker/lib/fetchWithTimeout'

const SABA_GAME_ID = 1612
const SABA_ORIGIN = 'https://www.sabagame.com'
const SABA_SSO_URL = 'https://proxy.sabagame.com/user/auth/sso'
const SABA_SIGN_NAME_URL = 'https://proxy.sabagame.com/user/auth/signName'
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'

export type SabaSession = {
  username: string
  ss: string
  language: string
}

/**
 * Step 1: Viva88 OpenSabaClub responds 302 to www.sabagame.com/?token=...
 * The token is one-time, so call this before every socket (re)connect.
 */
async function getSabaToken(
  account: AccountType,
  proxyAgent?: HttpsProxyAgent<string>
): Promise<string> {
  const res = await fetchWithTimeout(
    `${account.host}/VendorGame/OpenSabaClub?deviceType=1&GameID=${SABA_GAME_ID}`,
    {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Referer: `${account.host}/Sports/`,
        Cookie: account.cookie,
        'User-Agent': USER_AGENT
      },
      redirect: 'manual',
      ...(proxyAgent && { agent: proxyAgent })
    }
  )

  const location = res.headers.get('location')
  if (!location) {
    throw new Error(`OpenSabaClub did not redirect (HTTP ${res.status}); session may have expired`)
  }

  const token = new URL(location, SABA_ORIGIN).searchParams.get('token')
  if (!token) throw new Error('OpenSabaClub redirect has no token')
  return token
}

/**
 * Step 2: exchange the token for the SABA session (username + ss) used by socket signin.
 */
export async function getSabaSession(
  account: AccountType,
  proxyAgent?: HttpsProxyAgent<string>
): Promise<SabaSession> {
  const token = await getSabaToken(account, proxyAgent)

  const res = await fetchWithTimeout(
    `${SABA_SSO_URL}?token=${encodeURIComponent(token)}&system=1`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Origin: SABA_ORIGIN,
        Referer: `${SABA_ORIGIN}/`,
        'User-Agent': USER_AGENT
      },
      ...(proxyAgent && { agent: proxyAgent })
    }
  )

  if (!res.ok) throw new Error(`SABA SSO failed (HTTP ${res.status})`)

  const data = (await res.json()) as {
    isAuthenticated?: boolean
    username?: string
    ss?: string
    language?: string
  }

  if (!data.isAuthenticated || !data.username || !data.ss) {
    throw new Error('SABA SSO returned an unauthenticated session')
  }

  return { username: data.username, ss: data.ss, language: data.language || 'en-US' }
}

/**
 * Sets the SABA lobby nickname; without one the socket answers signin with `unauthorized`.
 * Returns the nickname the server saved.
 */
export async function signSabaName(
  session: SabaSession,
  nickname: string,
  proxyAgent?: HttpsProxyAgent<string>
): Promise<string> {
  const res = await fetchWithTimeout(SABA_SIGN_NAME_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Content-Type': 'application/json',
      Origin: SABA_ORIGIN,
      Referer: `${SABA_ORIGIN}/`,
      'User-Agent': USER_AGENT
    },
    body: JSON.stringify({
      session: session.ss,
      username: session.username,
      nickname,
      browserUserAgent: USER_AGENT,
      avatar: 0
    }),
    ...(proxyAgent && { agent: proxyAgent })
  })

  // Success is HTTP 201 with `authorized: true` and the full user profile (~17KB)
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`SABA signName failed (HTTP ${res.status}): ${text.slice(0, 300)}`)
  }

  let data: { authorized?: boolean; user?: { name?: string } }
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`SABA signName returned non-JSON: ${text.slice(0, 300)}`)
  }

  if (!data.authorized || !data.user?.name) {
    throw new Error(`SABA signName was not authorized: ${text.slice(0, 300)}`)
  }

  return data.user.name
}
