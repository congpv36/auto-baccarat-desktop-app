import { HttpsProxyAgent } from 'https-proxy-agent'
import { Response } from 'node-fetch'

import { AccountType } from '@shared/common/types'

import { fetchWithTimeout } from '@/worker/lib/fetchWithTimeout'

// Evolution live casino in the Viva88 3rd-party game list; the table is picked by /config
const EVO_VENDOR_ID = 92
const EVO_SPORT_TYPE_ID = 142
// /entry may first redirect to itself (e.g. adding cc=1) before setting EVOSESSIONID
const MAX_ENTRY_REDIRECTS = 5
// /entry redirects here when Evolution refuses to serve the account's (or proxy's) region
const GEO_RESTRICTED_PATH = '/prohibited-geo-location'

/** Evolution does not offer games in the region the request comes from. */
export class EvoGeoRestrictedError extends Error {}

// Version of the Evolution web client the requests pretend to come from
const EVO_CLIENT_VERSION = '6.20261013.73616.66352-7cee8b959e-r2'
export const EVO_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'

type EvoSession = {
  host: string
  // Full wss:// URL of the game socket, including instance and client_version
  socketUrl: string
  // Cookie header (EVOSESSIONID + Akamai cookies) sent with the socket upgrade
  cookie: string
  sessionId: string
  playerId: string
  tableId: string
  // Chip values the table accepts, ascending; a bet is sent as a sequence of these chips
  chipAmounts: number[]
  // Open3rdPartyGame + /entry redirects, logged to diagnose which game the session was opened for
  entryHops: string[]
  // Set when the table only accepts an encrypted socket (encrypted=true&nonce=...), e.g. "1:3"
  wsEncryption?: string
}

type EvoConfig = {
  table_id?: string
  playerId?: string
  serverHost?: string
  wsUrl?: string
  chipAmounts?: string
  ws_encryption?: string
}

/** Merges the Set-Cookie headers of a response into the jar (name -> value). */
function storeCookies(jar: Map<string, string>, res: Response): void {
  for (const header of res.headers.raw()['set-cookie'] ?? []) {
    const pair = header.split(';')[0]
    const index = pair.indexOf('=')
    if (index <= 0) continue
    const name = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    // An empty value is the server clearing the cookie (e.g. a stale EVOSESSIONID)
    if (value) jar.set(name, value)
    else jar.delete(name)
  }
}

function toCookieHeader(jar: Map<string, string>): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
}

const DEFAULT_CHIP_AMOUNTS = [0.5, 1, 2, 5, 25, 100, 500, 1000]

/** Parses the config chipAmounts ("0.5,1,2,...") into ascending numbers. */
function parseChipAmounts(value: string | undefined): number[] {
  const chips = (value ?? '')
    .split(',')
    .map(Number)
    .filter((chip) => Number.isFinite(chip) && chip > 0)
    .sort((a, b) => a - b)
  return chips.length ? chips : DEFAULT_CHIP_AMOUNTS
}

function randomInstanceId(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  return Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * letters.length)]).join(
    ''
  )
}

/**
 * Step 1: Viva88 Open3rdPartyGame responds 302 to <evo host>/entry?params=...&JSESSIONID=...
 * The params are one-time, so call this before every socket (re)connect.
 */
async function getEvoEntryUrl(
  account: AccountType,
  proxyAgent?: HttpsProxyAgent<string>
): Promise<URL> {
  const res = await fetchWithTimeout(
    `${account.host}/VendorGame/Open3rdPartyGame?deviceType=1&vendorId=${EVO_VENDOR_ID}&sportTypeId=${EVO_SPORT_TYPE_ID}&gmt=7`,
    {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Referer: `${account.host}/Sports/`,
        Cookie: account.cookie,
        'User-Agent': EVO_USER_AGENT
      },
      redirect: 'manual',
      ...(proxyAgent && { agent: proxyAgent })
    }
  )

  const location = res.headers.get('location')
  if (!location) {
    throw new Error(
      `Open3rdPartyGame did not redirect (HTTP ${res.status}); session may have expired`
    )
  }

  const entryUrl = new URL(location, account.host)
  if (!entryUrl.pathname.endsWith('/entry')) {
    throw new Error(`Open3rdPartyGame redirected to an unexpected URL: ${entryUrl.pathname}`)
  }
  return entryUrl
}

/**
 * Step 2: /entry responds 302 to /frontend/evo/r2/ and sets EVOSESSIONID.
 * Step 3: /config returns the player id and the socket path (wsUrl) for the table.
 */
export async function getEvoSession(
  account: AccountType,
  tableId: string,
  proxyAgent?: HttpsProxyAgent<string>
): Promise<EvoSession> {
  const entryUrl = await getEvoEntryUrl(account, proxyAgent)
  const origin = entryUrl.origin
  const jar = new Map<string, string>()

  // Redirects are followed by hand so the cookies of every hop are kept
  let nextUrl: URL | null = entryUrl
  // Status and redirect of every hop, reported when EVOSESSIONID never shows up
  const hops: string[] = [`Open3rdPartyGame -> ${entryUrl.toString()}`]
  for (let hop = 0; nextUrl && hop < MAX_ENTRY_REDIRECTS && !jar.has('EVOSESSIONID'); hop++) {
    const entryRes = await fetchWithTimeout(nextUrl.toString(), {
      method: 'GET',
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Referer: `${account.host}/`,
        ...(jar.size && { Cookie: toCookieHeader(jar) }),
        'User-Agent': EVO_USER_AGENT
      },
      redirect: 'manual',
      ...(proxyAgent && { agent: proxyAgent })
    })
    storeCookies(jar, entryRes)
    const location = entryRes.headers.get('location')
    hops.push(`${entryRes.status}${location ? ` -> ${location}` : ''}`)

    nextUrl = location ? new URL(location, origin) : null
    if (nextUrl && nextUrl.origin !== origin) nextUrl = null
  }

  const sessionId = jar.get('EVOSESSIONID')
  if (!sessionId && hops.some((hop) => hop.includes(GEO_RESTRICTED_PATH))) {
    throw new EvoGeoRestrictedError(`Evolution region restriction (${hops.join(' | ')})`)
  }
  if (!sessionId) {
    throw new Error(`Evolution entry did not set EVOSESSIONID (${hops.join(' | ')})`)
  }

  const configRes = await fetchWithTimeout(
    `${origin}/config?table_id=${tableId}&client_version=${EVO_CLIENT_VERSION}`,
    {
      method: 'GET',
      headers: {
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Referer: `${origin}/frontend/evo/r2/`,
        Cookie: toCookieHeader(jar),
        'User-Agent': EVO_USER_AGENT
      },
      ...(proxyAgent && { agent: proxyAgent })
    }
  )
  if (!configRes.ok) throw new Error(`Evolution config failed (HTTP ${configRes.status})`)
  storeCookies(jar, configRes)

  const config = (await configRes.json()) as EvoConfig
  if (!config.wsUrl || !config.playerId) {
    throw new Error('Evolution config has no wsUrl/playerId')
  }

  const host = config.serverHost || entryUrl.host
  const instance = `${randomInstanceId()}-${config.playerId}-${config.table_id || tableId}`
  const socketUrl =
    `wss://${host}${config.wsUrl}` +
    `&instance=${encodeURIComponent(instance)}&client_version=${EVO_CLIENT_VERSION}`

  return {
    host,
    socketUrl,
    cookie: toCookieHeader(jar),
    sessionId,
    playerId: config.playerId,
    tableId: config.table_id || tableId,
    chipAmounts: parseChipAmounts(config.chipAmounts),
    entryHops: hops,
    wsEncryption: config.ws_encryption
  }
}
