/* eslint-disable no-constant-condition */

import { setTimeout as delay } from 'timers/promises'
import { MessagePort, parentPort } from 'worker_threads'

import { Account, BetHistory, Setting, SportsBook } from '@db/model'
import { SettingSchemaType } from '@db/schema/setting'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { io, Socket } from 'socket.io-client'
import msgpackParser from 'socket.io-msgpack-parser'
import WebSocket from 'ws'

import { BET_MODES, GAME_TYPES } from '@shared/common/constants'
import { AccountType, BetHistoryType, SportsBookType } from '@shared/common/types'
import { OPTIONS_PROXY, STATUS_ACCOUNT, STATUS_LOGIN } from '@shared/main/constants'

import { accountLogToFile } from '@/worker/lib/accountLogToFile'
import { isAccountActive } from '@/worker/lib/checkAccount'
import { logAndNotify, logAndTriggerRelogin } from '@/worker/lib/exitAccountWithLog'
import { getBetAmount } from '@/worker/lib/getBetAmount'
import { isProxyConfigValid } from '@/worker/lib/isProxyConfigValid'
import { getBalanceViva88bet } from '@/worker/platform/Viva88/actions/getBalance'
import {
  EVO_USER_AGENT,
  EvoGeoRestrictedError,
  getEvoSession
} from '@/worker/platform/Viva88/actions/getEvoSession'
import {
  getSabaSession,
  SabaSession,
  signSabaName
} from '@/worker/platform/Viva88/actions/getSabaSession'

/**
 * SABA mini-game Socket.IO worker (Big Small / Se Die).
 *
 * The game is picked from Setting.gameType: Big Small connects to /user/bigsmall,
 * Se Die to /user/sedie. The setting is re-checked on every event and heartbeat;
 * when it changes the socket is rebuilt for the new game.
 * On every connect it fetches a fresh SABA session (Viva88 OpenSabaClub token
 * -> /user/auth/sso) and emits signin with the returned username + ss.
 *
 * Dragon Tiger is an Evolution table instead: a plain JSON WebSocket
 * opened with the EVOSESSIONID from the Evolution entry/config requests (see EVO_TABLES).
 */

const SOCKET_ORIGIN = 'https://proxy.sabagame.com'

type SabaGameConfig = {
  name: string
  socketPath: string
  namespace: string
  // Bet choices for the two-sided bet; Random picks one of them
  choices: [string, string]
  betChoiceByMode: Record<string, string>
  // Builds the payload of the `bet` emit
  buildBetPayload: (bet: { amount: number; betChoice: string; now: number }) => unknown
  parseBetLog: (betLog: unknown) => SettledBet
}

/** Bet log normalized across games; `win` is the profit, 0 on a lost bet. */
type SettledBet = {
  roundId: number
  time: Date | string
  choice: string
  result: string
  stake: number
  refund: number
  win: number
}

type BigSmallBetLog = {
  roundId: number
  choice: string
  time: Date | string
  totalAmount: number
  refund: number
  betwin: number
  result?: { dice1: number; dice2: number; dice3: number }
  settlementResult?: { big: boolean; small: boolean }
}

// Bet amount per choice is a field of the log; result holds the colour of the 4 coins
const SE_DIE_BET_FIELDS = ['odd', 'even', 'red2', 'red3', 'red4', 'white3', 'white4'] as const

type SeDieBetLog = {
  roundId: number
  time: Date | string
  betwin: number
  result?: Record<string, boolean>
  settlementResult?: Record<string, boolean>
} & Partial<Record<(typeof SE_DIE_BET_FIELDS)[number], number>>

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function parseBigSmallBetLog(raw: unknown): SettledBet {
  const betLog = raw as BigSmallBetLog
  const dice = betLog.result
    ? `${betLog.result.dice1}-${betLog.result.dice2}-${betLog.result.dice3}`
    : ''
  const side = betLog.settlementResult?.big ? 'big' : betLog.settlementResult?.small ? 'small' : ''
  return {
    roundId: betLog.roundId,
    time: betLog.time,
    choice: betLog.choice,
    result: `${dice} ${side}`.trim(),
    stake: Number(betLog.totalAmount) || 0,
    refund: Number(betLog.refund) || 0,
    win: Number(betLog.betwin) || 0
  }
}

function parseSeDieBetLog(raw: unknown): SettledBet {
  const betLog = raw as SeDieBetLog
  const placed = SE_DIE_BET_FIELDS.filter((field) => Number(betLog[field]) > 0)
  const stake = placed.reduce((sum, field) => sum + Number(betLog[field]), 0)

  const coins = betLog.result ? Object.values(betLog.result) : []
  const red = coins.filter(Boolean).length
  const coinText = coins.length ? `${red}R-${coins.length - red}W` : ''
  const side = betLog.settlementResult?.odd ? 'odd' : betLog.settlementResult?.even ? 'even' : ''

  // SeDie `betwin` is the full payout (stake x odds), not the profit like Big Small
  const payout = Number(betLog.betwin) || 0
  return {
    roundId: betLog.roundId,
    time: betLog.time,
    choice: placed.join(','),
    result: `${coinText} ${side}`.trim(),
    stake: roundMoney(stake),
    refund: 0,
    win: payout > 0 ? roundMoney(payout - stake) : 0
  }
}

const SABA_GAMES: Record<string, SabaGameConfig> = {
  [GAME_TYPES.BIG_SMALL]: {
    name: 'BigSmall',
    socketPath: '/bigsmall/socket.io/',
    namespace: '/user/bigsmall',
    choices: ['big', 'small'],
    betChoiceByMode: { [BET_MODES.Big]: 'big', [BET_MODES.Small]: 'small' },
    buildBetPayload: ({ amount, betChoice, now }) => ({ amount, betChoice, clientSentTime: now }),
    parseBetLog: parseBigSmallBetLog
  },
  [GAME_TYPES.SE_DIE]: {
    name: 'SeDie',
    socketPath: '/sedie/socket.io/',
    namespace: '/user/sedie',
    choices: ['odd', 'even'],
    betChoiceByMode: { [BET_MODES.Odd]: 'odd', [BET_MODES.Even]: 'even' },
    buildBetPayload: ({ amount, betChoice, now }) => ({
      amount,
      username: sabaUsername,
      clientSentTime: now,
      freeBet: false,
      betChoice
    }),
    parseBetLog: parseSeDieBetLog
  }
}

// Server events that are not game events of the joined namespace
const NON_GAME_EVENTS = new Set(['message', 'signedIn'])
// Betting is driven by round phase events (snr -> spb -> epb -> finish); this tick
// only re-checks whether a bet can be sent now.
const BET_TICK_MS = 1000
// Bets sent in the same instant as `spb` are rejected (SB1906), so wait a little.
const BET_DELAY_AFTER_OPEN_MS = 3000
// `epb` arrives ~5s before `finish`; stop sending bets well before that.
const BET_CLOSE_MARGIN_MS = 8000
// A rejected or unanswered bet is retried within the same round.
const BET_RETRY_DELAY_MS = 2000
const BET_ACK_TIMEOUT_MS = 5000
const MAX_BET_ATTEMPTS_PER_ROUND = 3
// While waiting for the previous bet to settle, history page 1 is polled this often.
const HISTORY_POLL_MS = 3000
// Fallback unlock when the confirmed bet never shows up in history
const ROUND_LOCK_TIMEOUT_MS = 90000
// Settlement may lag behind the round `finish` event, so history is fetched a bit later
const HISTORY_AFTER_FINISH_DELAY_MS = 5000

const port = parentPort as MessagePort
if (!port) throw new Error('IllegalState')

let socket: Socket | null = null
let evoSocket: WebSocket | null = null
let evoReconnectTimeoutId: NodeJS.Timeout | null = null
let currentAccount: AccountType | null = null
let gameType: string | null = null
// Config of the game the socket is connected to; set from gameType before connecting.
let game: SabaGameConfig | null = null
// SABA username from the latest signin; SeDie bets carry it.
let sabaUsername = ''
let pingIntervalId: NodeJS.Timeout | null = null
let betIntervalId: NodeJS.Timeout | null = null
let historyTimeoutId: NodeJS.Timeout | null = null
let timerStartedForAccountId: string | number | null = null
let stopping = false
// History only contains settled rounds, so the latest settled roundId is used to
// detect that the round we bet on has finished before allowing the next bet.
let lastSettledRoundId: number | null = null
// Round whose bet was confirmed by the server and is waiting to show up settled in history.
let lockedAtRoundId: number | null = null
let lockedAt = 0
// Round phase tracked from socket events.
let currentRoundId: number | null = null
let bettingOpen = false
let betOpenAt = 0
let roundEndsAt = 0
// Per-round bet attempts; a bet is pending until the server answers with `endBet`.
let betAttemptRoundId: number | null = null
let betAttempts = 0
let betPendingSince = 0
let nextBetAttemptAt = 0
let lastHistoryPollAt = 0
// Page awaited by the sequential history sync started on signin; null when not syncing.
// The sync stops at the first page holding an already-saved round.
let historySyncPage: number | null = null
// Each login runs in a fresh worker, so the session starts when the account arrives.
// Only bets placed from this moment on are saved to BetHistory.
let sessionStartedAt: number | null = null
// Bets of this session found settled in history, win or lose; drives account switching.
let sessionBetCount = 0
// Random target in [minSuccessCount, maxSuccessCount], picked once per session.
let targetBetCount: number | null = null
// Set while the post-bet switch check runs, and kept once betting must stop for good.
let switchCheckRunning = false
let betStopped = false
// Set once the lobby nickname was registered; a second `unauthorized` stops the worker.
let nicknameAttempted = false

port.on('message', (account: AccountType) => {
  currentAccount = account
  stopping = false
  sessionStartedAt ??= Date.now()
  void startTimer(account)
  void handleCrawlData(account)
})

/** Name of the connected game, used in log prefixes and log file names. */
function getGameName(): string {
  return EVO_TABLES[gameType ?? '']?.name ?? game?.name ?? 'Saba'
}

function log(...args: unknown[]): void {
  console.log(`[${new Date().toISOString()}][${getGameName()}]`, ...args)
}

function logData(eventName: string, args: unknown[]): void {
  console.log(`\n========== SABA EVENT: ${eventName} ==========`)
  console.dir(args, {
    depth: null,
    colors: true,
    maxArrayLength: null,
    maxStringLength: null
  })
  console.log(`========== END EVENT: ${eventName} ==========\n`)
  if (currentAccount) {
    void accountLogToFile(
      currentAccount.platformName,
      currentAccount.loginID,
      `[${eventName}] ${JSON.stringify(args)}`,
      getGameName()
    )
  }
}

// Amount per bet choice, e.g. { big, small } or { odd, even }
type GameStats = Record<string, number>

type SabaFinish = {
  roundId: number
  result?: Record<string, unknown>
  settlementResult?: Record<string, boolean>
}

// Signals shown in the account view. totalBets and betPercentage arrive in separate
// events, so the latest of each is kept and combined; both reset when a round finishes.
let lastTotalBets: GameStats | null = null
let lastBetPercentage: GameStats | null = null
let betStatus: string | null = null
// Round phase / last result, shown before the bet status (Evolution tables)
let roundStatus: string | null = null
let lastTextLog: string | null = null

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Shows only the two-sided choices of the game (e.g. SeDie also reports red/white side bets). */
function formatStats(stats: GameStats, unit = ''): string {
  const choices = game?.choices ?? Object.keys(stats)
  return choices
    .filter((choice) => stats[choice] !== undefined)
    .map((choice) => `${capitalize(choice)}: ${stats[choice]}${unit}`)
    .join(' | ')
}

/** Updates signal state from a game event; returns true when it carried a signal. */
function applyGameSignal(payload: unknown): boolean {
  const data = payload as
    | { totalBets?: GameStats; betPercentage?: GameStats; finish?: SabaFinish }
    | undefined
  if (data?.finish) {
    lastTotalBets = null
    lastBetPercentage = null
  }
  if (data?.totalBets) lastTotalBets = data.totalBets
  if (data?.betPercentage) lastBetPercentage = data.betPercentage
  return Boolean(data?.finish || data?.totalBets || data?.betPercentage)
}

function buildSignalTextLog(): string | null {
  const parts: string[] = []
  if (lastTotalBets) parts.push(`Total bets - ${formatStats(lastTotalBets)}`)
  if (lastBetPercentage) parts.push(`Bet percentage - ${formatStats(lastBetPercentage, '%')}`)
  if (roundStatus) parts.push(roundStatus)
  if (betStatus) parts.push(betStatus)

  const textLog = parts.join(' || ')
  // Empty text is still published so stale stats are cleared once a round finishes
  if (textLog === (lastTextLog ?? '')) return null
  lastTextLog = textLog
  return textLog
}

function publishSignalTextLog(accountId: string | number): void {
  const textLog = buildSignalTextLog()
  if (textLog === null) return
  port.postMessage({
    type: 'DataUpdateAccount',
    data: Account.update({ id: accountId }, { textLog })
  })
}

function setBetStatus(status: string): void {
  betStatus = status
  if (currentAccount) publishSignalTextLog(currentAccount.id)
}

function isInSession(betLog: SettledBet): boolean {
  return sessionStartedAt !== null && new Date(betLog.time).getTime() >= sessionStartedAt
}

function formatBetTime(value: Date | string): string {
  const date = new Date(value)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

/**
 * Saves new bet logs placed in this session; returns true when the page reached
 * an already-saved round or a bet from before the session.
 */
function saveBetHistory(loginID: string, betLogs: SettledBet[]): boolean {
  const created: BetHistoryType[] = []
  let hasSavedRound = false

  for (const betLog of betLogs) {
    if (!isInSession(betLog)) {
      hasSavedRound = true
      continue
    }
    const round = String(betLog.roundId)
    if (BetHistory.findOne({ loginID, round })) {
      hasSavedRound = true
      continue
    }

    const record = BetHistory.create({
      gameType,
      loginID,
      time: formatBetTime(betLog.time),
      round,
      betChoice: betLog.choice,
      result: betLog.result,
      stake: String(betLog.stake),
      refund: String(betLog.refund),
      win: String(betLog.win)
    }) as BetHistoryType
    if (record) created.push(record)
  }

  if (created.length) port.postMessage({ type: 'NewBetHistory', data: created })
  sessionBetCount += created.length
  return hasSavedRound
}

function clearHeartbeat(): void {
  if (pingIntervalId) {
    clearInterval(pingIntervalId)
    pingIntervalId = null
  }
}

function emitWithLog(client: Socket, eventName: string, payload: unknown): void {
  console.log(`\n========== SABA CLIENT EMIT: ${eventName} ==========`)
  console.dir(payload, { depth: null, colors: true })
  console.log(`========== END CLIENT EMIT: ${eventName} ==========\n`)
  client.emit(eventName, payload)
}

function clearBetLoop(): void {
  if (betIntervalId) {
    clearInterval(betIntervalId)
    betIntervalId = null
  }
  if (historyTimeoutId) {
    clearTimeout(historyTimeoutId)
    historyTimeoutId = null
  }
}

function scheduleHistoryFetch(client: Socket): void {
  if (historyTimeoutId) clearTimeout(historyTimeoutId)
  historyTimeoutId = setTimeout(() => {
    historyTimeoutId = null
    if (!stopping && client.connected) emitWithLog(client, 'getHistory', { page: 1 })
  }, HISTORY_AFTER_FINISH_DELAY_MS)
}

function getBetChoice(config: SabaGameConfig): string {
  const betMode = (Setting.findAll() as SettingSchemaType[])[0]?.betMode
  return config.betChoiceByMode[betMode] ?? config.choices[Math.random() < 0.5 ? 0 : 1]
}

function updateSettledRound(betLogs: SettledBet[]): void {
  const maxRoundId = betLogs.reduce((max, betLog) => Math.max(max, betLog.roundId), 0)
  lastSettledRoundId = Math.max(lastSettledRoundId ?? 0, maxRoundId)

  if (lockedAtRoundId !== null && lastSettledRoundId >= lockedAtRoundId) {
    log(`Round ${lastSettledRoundId} settled; bet unlocked.`)
    lockedAtRoundId = null
    const settled = betLogs.find((betLog) => betLog.roundId === lastSettledRoundId)
    const outcome = settled
      ? settled.win > 0
        ? `WIN ${settled.win}`
        : settled.refund > 0
          ? `REFUND ${settled.refund}`
          : `LOSE ${settled.stake}`
      : 'settled'
    setBetStatus(`Bet round ${lastSettledRoundId}: ${outcome} - ready for next bet`)
  }
}

/** True while the previous confirmed bet has not shown up settled in history. */
function isBetLocked(): boolean {
  if (betStopped || switchCheckRunning) return true
  if (lastSettledRoundId === null) return true
  if (lockedAtRoundId === null) return false
  if (Date.now() - lockedAt >= ROUND_LOCK_TIMEOUT_MS) {
    log('Bet lock timed out; unlocking.')
    lockedAtRoundId = null
    setBetStatus('Bet result not found (timeout) - ready for next bet')
    return false
  }
  return true
}

function getRandomInt(from: number, to: number): number {
  const min = Math.min(from, to)
  const max = Math.max(from, to)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function getTargetBetCount(sportsBook: SportsBookType): number | null {
  const min = Number(sportsBook.minSuccessCount)
  const max = Number(sportsBook.maxSuccessCount)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  targetBetCount ??= getRandomInt(min, max)
  return targetBetCount
}

// Shared by the history refresh and the switch check so balance calls never overlap
let creditRefresh: Promise<number | null> | null = null

/** Fetches and saves the latest credit; returns null when the balance call fails. */
function refreshCredit(accountId: string | number): Promise<number | null> {
  creditRefresh ??= fetchCredit(accountId).finally(() => {
    creditRefresh = null
  })
  return creditRefresh
}

async function fetchCredit(accountId: string | number): Promise<number | null> {
  const account = Account.findById(accountId) as AccountType | null
  if (!account) return null

  const { ErrorCode, Message, credit, cashBalance, outstanding, givenCredit, currency } =
    await getBalanceViva88bet(account)
  if (ErrorCode !== 0) {
    log('Failed to refresh credit:', Message)
    return null
  }

  Account.update({ id: accountId }, { credit, cashBalance, outstanding, givenCredit, currency })
  port.postMessage({ type: 'DataUpdateAccount' })
  const value = Number(credit)
  return Number.isFinite(value) ? value : null
}

/** Returns why the account should switch after its latest bet, or null to keep betting. */
async function getSwitchReason(account: AccountType): Promise<string | null> {
  const sportsBook = SportsBook.findOne<SportsBookType>({ platform: account.platformName })
  if (!sportsBook) return null

  if (Number(sportsBook.isSwitchBySuccessCount) === 1) {
    const target = getTargetBetCount(sportsBook)
    if (target !== null && sessionBetCount >= target) {
      return `Reached ${sessionBetCount}/${target} bets`
    }
  }

  if (Number(sportsBook.isSwitchByCredit) === 1) {
    const maxCredit = Number(sportsBook.maxCredit)
    const credit = await refreshCredit(account.id)
    if (credit !== null && Number.isFinite(maxCredit) && credit <= maxCredit) {
      return `Credit ${credit} <= ${maxCredit}`
    }
  }

  return null
}

async function checkSwitchAccount(account: AccountType): Promise<void> {
  if (switchCheckRunning || betStopped) return
  switchCheckRunning = true
  try {
    const reason = await getSwitchReason(account)
    if (!reason || stopping) return

    const accountCount = Account.findAll({ platformName: account.platformName }).length
    if (accountCount <= 1) {
      betStopped = true
      log(`${reason}; only one account, betting stopped.`)
      setBetStatus(`${reason} - betting stopped (no other account to switch)`)
      return
    }

    log(`${reason}; switching account.`)
    await accountLogToFile(
      account.platformName,
      account.loginID,
      `${reason}, switching account.`,
      'Program'
    )
    port.postMessage({ type: 'SwitchAccount', data: `${reason} - switched account` })
    stopping = true
    disconnectSocket()
    process.exit(0)
  } catch (error) {
    log('Switch check failed:', error instanceof Error ? error.message : String(error))
  } finally {
    switchCheckRunning = false
  }
}

function emitSignin(client: Socket, session: SabaSession): void {
  const { username, ss, language } = session
  const signinPayload = {
    username,
    language,
    ss,
    time: new Date().toISOString(),
    isAuthenticated: true,
    options: { compress: true }
  }

  log('Emitting signin for username:', username)
  client.emit('signin', signinPayload)
}

/**
 * SABA answers signin with `unauthorized` when the account has no lobby nickname.
 * Registers the loginID as nickname once and signs in again; stops the worker otherwise.
 */
async function registerSabaNickname(
  client: Socket,
  account: AccountType,
  session: SabaSession | null,
  proxyAgent?: HttpsProxyAgent<string>
): Promise<void> {
  if (stopping) return
  if (nicknameAttempted || !session) {
    await handleSabaUnauthorized(account)
    return
  }
  nicknameAttempted = true

  log('SABA unauthorized: registering lobby nickname', account.loginID)
  try {
    const nickname = await signSabaName(session, account.loginID, proxyAgent)
    log('SABA nickname registered:', nickname)
    await accountLogToFile(
      account.platformName,
      account.loginID,
      `SABA nickname registered: ${nickname}`,
      'Program'
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log('SABA signName failed:', message)
    await accountLogToFile(
      account.platformName,
      account.loginID,
      `[ERROR] SABA signName: ${message}`,
      'Program'
    )
    await handleSabaUnauthorized(account)
    return
  }

  if (stopping || !client.connected) return
  emitSignin(client, session)
}

/** SABA rejects accounts without a lobby nickname; betting cannot continue until one is set. */
async function handleSabaUnauthorized(account: AccountType): Promise<void> {
  if (stopping) return
  stopping = true
  disconnectSocket()
  log('SABA unauthorized: lobby nickname is missing; stopping worker.')

  // The manager resets the account to DEFAULT_ACCOUNT_STATUS and re-renders it
  port.postMessage({
    type: 'SabaUnauthorized',
    data: { platformName: account.platformName, loginID: account.loginID }
  })
  await accountLogToFile(
    account.platformName,
    account.loginID,
    'SABA unauthorized: create a SABA.games lobby nickname on the website.',
    'Program'
  )

  process.exit(0)
}

/** Evolution refuses the account's region; retrying cannot help, so stop and reset the account. */
async function handleRegionRestricted(account: AccountType, message: string): Promise<void> {
  if (stopping) return
  stopping = true
  disconnectSocket()
  log('Evolution region restriction; stopping worker.')

  // The manager resets the account to DEFAULT_ACCOUNT_STATUS and re-renders it
  port.postMessage({
    type: 'RegionRestricted',
    data: { platformName: account.platformName, loginID: account.loginID }
  })
  await accountLogToFile(account.platformName, account.loginID, `[ERROR] ${message}`, 'Program')

  process.exit(0)
}

type SabaHistory = { betLogs?: unknown[]; page?: number; pageSize?: number; total?: number }

function continueHistorySync(client: Socket, history: SabaHistory, hasSavedRound: boolean): void {
  if (historySyncPage === null || history.page !== historySyncPage) return

  const pageSize = history.pageSize || history.betLogs?.length || 0
  const totalPages = pageSize && history.total ? Math.ceil(history.total / pageSize) : 0
  if (hasSavedRound || historySyncPage >= totalPages) {
    log(`Bet history synced up to page ${historySyncPage}/${totalPages}.`)
    historySyncPage = null
    return
  }

  historySyncPage += 1
  emitWithLog(client, 'getHistory', { page: historySyncPage })
}

function resetRoundState(): void {
  currentRoundId = null
  bettingOpen = false
  betOpenAt = 0
  roundEndsAt = 0
  betAttemptRoundId = null
  betAttempts = 0
  betPendingSince = 0
  nextBetAttemptAt = 0
}

type SabaRoundEvent = {
  roundId?: number
  remainingTime?: number
  um?: boolean
  snr?: boolean
  spb?: boolean
  epb?: boolean
  finish?: SabaFinish
  endBet?: number
  ownBets?: GameStats
  notice?: { errorCode?: string }
}

/** Tracks the round phase and bet acknowledgements from game events. */
function handleRoundEvent(payload: unknown): void {
  const data = payload as SabaRoundEvent | undefined
  if (!data) return
  const now = Date.now()

  if (typeof data.remainingTime === 'number') {
    roundEndsAt = now + data.remainingTime * 1000
    if (data.snr) {
      // New round: a short pre-bet phase runs until `spb`
      if (currentRoundId !== null) currentRoundId += 1
      bettingOpen = false
    } else if (data.um === false) {
      // Snapshot sent on joining mid-round while betting is open
      bettingOpen = true
      betOpenAt = now
    } else if (data.um) {
      bettingOpen = false
    }
  }
  if (typeof data.roundId === 'number') currentRoundId = data.roundId
  if (data.spb) {
    bettingOpen = true
    betOpenAt = now
  }
  if (data.epb) bettingOpen = false
  if (data.finish) {
    bettingOpen = false
    currentRoundId = data.finish.roundId
  }

  // A late answer after the ack timeout still counts, so a confirmed bet is never repeated
  if (typeof data.endBet === 'number' && betAttemptRoundId !== null) {
    betPendingSince = 0
    if (data.endBet > 0 || data.ownBets) {
      lockedAtRoundId = betAttemptRoundId
      lockedAt = now
      setBetStatus(
        `Bet round ${betAttemptRoundId} confirmed (${data.endBet}) - waiting for round result`
      )
    } else {
      const errorCode = data.notice?.errorCode ?? 'unknown'
      log(`Bet rejected (${errorCode}) on attempt ${betAttempts}.`)
      nextBetAttemptAt = now + BET_RETRY_DELAY_MS
      setBetStatus(
        `Bet round ${betAttemptRoundId} rejected (${errorCode}), attempt ${betAttempts}/${MAX_BET_ATTEMPTS_PER_ROUND}`
      )
    }
  }
}

function pollHistory(client: Socket): void {
  const now = Date.now()
  if (now - lastHistoryPollAt < HISTORY_POLL_MS) return
  lastHistoryPollAt = now
  emitWithLog(client, 'getHistory', { page: 1 })
}

function tryPlaceBet(client: Socket): void {
  const now = Date.now()

  // Unlocking is driven by the round `finish` event, which requests history.
  // While waiting on a confirmed bet, page 1 is also polled in case that fetch was too early.
  if (isBetLocked()) {
    if (lockedAtRoundId !== null) pollHistory(client)
    return
  }
  if (!bettingOpen || currentRoundId === null) return
  if (now < betOpenAt + BET_DELAY_AFTER_OPEN_MS) return
  if (now > roundEndsAt - BET_CLOSE_MARGIN_MS) return

  if (betAttemptRoundId !== currentRoundId) {
    betAttemptRoundId = currentRoundId
    betAttempts = 0
    betPendingSince = 0
    nextBetAttemptAt = 0
  }
  if (betPendingSince) {
    if (now - betPendingSince < BET_ACK_TIMEOUT_MS) return
    log('Bet acknowledgement timed out; retrying.')
    betPendingSince = 0
  }
  if (betAttempts >= MAX_BET_ATTEMPTS_PER_ROUND || now < nextBetAttemptAt) return
  if (!game) return

  const amount = currentAccount ? getBetAmount(currentAccount.platformName) : 0
  if (amount <= 0) {
    setBetStatus('Invalid bet amount - check Fixed Amount in SportsBook setting')
    return
  }

  const betChoice = getBetChoice(game)
  emitWithLog(client, 'bet', game.buildBetPayload({ amount, betChoice, now }))
  betAttempts += 1
  betPendingSince = now
  setBetStatus(
    `Bet ${betChoice.toUpperCase()} ${amount} sent for round ${currentRoundId} - waiting for confirmation`
  )
}

/** Clears per-game state so a socket for another game starts from scratch. */
function resetGameState(): void {
  resetRoundState()
  lastSettledRoundId = null
  lockedAtRoundId = null
  lockedAt = 0
  lastHistoryPollAt = 0
  historySyncPage = null
  lastTotalBets = null
  lastBetPercentage = null
  betStatus = null
  roundStatus = null
  evoPendingBet = null
}

/**
 * Re-checks Setting.gameType; when it differs from the connected game the socket is
 * dropped and the crawl restarts for the new game. Returns true when it changed.
 */
function checkGameTypeChange(account: AccountType): boolean {
  const settingGameType = (Setting.findAll() as SettingSchemaType[])[0]?.gameType
  if (!settingGameType || settingGameType === gameType) return false

  log(`Game type changed (${gameType} -> ${settingGameType}); restarting crawl.`)
  disconnectSocket()
  resetGameState()
  void handleCrawlData(account)
  return true
}

function startBetLoop(client: Socket): void {
  clearBetLoop()
  resetRoundState()
  historySyncPage = 1
  emitWithLog(client, 'getHistory', { page: 1 })
  betIntervalId = setInterval(() => {
    if (stopping || !client.connected) return
    tryPlaceBet(client)
  }, BET_TICK_MS)
}

function disconnectSocket(): void {
  clearHeartbeat()
  clearBetLoop()
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
  clearEvoBetTimeout()
  if (evoReconnectTimeoutId) {
    clearTimeout(evoReconnectTimeoutId)
    evoReconnectTimeoutId = null
  }
  if (evoSocket) {
    evoSocket.removeAllListeners()
    // Errors after close (e.g. closing while still connecting) must not crash the worker
    evoSocket.on('error', () => {})
    evoSocket.terminate()
    evoSocket = null
  }
}

function findActiveAccount(account: AccountType): AccountType | null {
  return (
    (Account.findOne({
      id: account.id,
      status: STATUS_ACCOUNT.LOGOUT,
      statusLogin: STATUS_LOGIN.SUCCESS,
      orderID: 1
    }) as AccountType) ?? null
  )
}

async function handleCrawlData(account: AccountType): Promise<void> {
  while (!stopping) {
    const settings = Setting.findAll() as SettingSchemaType[]
    if (!settings.length) {
      await delay(1000)
      continue
    }

    gameType = settings[0].gameType
    if (!gameType) {
      await delay(1000)
      continue
    }

    const checkAccount = findActiveAccount(account)
    if (!checkAccount) {
      log('Account is no longer active; stopping worker.')
      stopping = true
      disconnectSocket()
      process.exit(0)
    }

    if (checkAccount.typeCrawl !== gameType) {
      await accountLogToFile(
        checkAccount.platformName,
        checkAccount.loginID,
        'GameType changed, refresh to sync.',
        'Program'
      )

      await logAndNotify(port, checkAccount, 'GameType changed, check box refresh to sync.', {
        fields: { status: STATUS_ACCOUNT.EXIT }
      })

      stopping = true
      disconnectSocket()
      return
    }

    const table = EVO_TABLES[gameType]
    if (table) {
      game = null
      await initializeEvoSocket(checkAccount, table)
      return
    }

    game = SABA_GAMES[gameType] ?? null
    if (!game) {
      await logAndNotify(port, checkAccount, `GameType ${gameType} is not supported on SABA.`, {
        fields: { status: STATUS_ACCOUNT.EXIT }
      })
      stopping = true
      disconnectSocket()
      return
    }

    await initializeSocket(checkAccount, game)
    return
  }
}

async function initializeSocket(account: AccountType, config: SabaGameConfig): Promise<void> {
  disconnectSocket()
  currentAccount = account

  const { status, data } = isProxyConfigValid(account)
  const { newIpAddress, newPort, newUsername, newPassword } = data
  const proxyUrl =
    status && account.proxyScope !== OPTIONS_PROXY.NONE
      ? `http://${newUsername}:${newPassword}@${newIpAddress}:${newPort}`
      : undefined
  const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined

  log(`Connecting to SABA ${config.name}...`)
  log('Socket origin:', SOCKET_ORIGIN)
  log('Socket path:', config.socketPath)
  log('Namespace:', config.namespace)
  log('Proxy enabled:', Boolean(proxyAgent))

  const client = io(`${SOCKET_ORIGIN}${config.namespace}`, {
    path: config.socketPath,
    transports: ['websocket'],
    parser: msgpackParser,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    ...(proxyAgent ? { agent: proxyAgent as unknown as string } : {}),
    extraHeaders: {
      Origin: 'https://www.sabagame.com',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
    }
  })

  socket = client
  // Session of the latest signin, reused to register the lobby nickname
  let sabaSession: SabaSession | null = null

  client.on('connect', async () => {
    log('Connected. Socket ID:', client.id)

    const activeAccount = findActiveAccount(account)
    if (!activeAccount || !isAccountActive(account.id)) {
      log('Account is inactive after socket connect; disconnecting.')
      stopping = true
      disconnectSocket()
      process.exit(0)
    }

    let session: Awaited<ReturnType<typeof getSabaSession>>
    try {
      session = await getSabaSession(activeAccount, proxyAgent)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log('Failed to get SABA session:', message)
      await logAndTriggerRelogin(port, activeAccount, `[ERROR] Get SABA session: ${message}`)
      stopping = true
      disconnectSocket()
      process.exit(0)
    }

    sabaSession = session
    sabaUsername = session.username
    emitSignin(client, session)
  })

  client.onAny((eventName: string, ...args: unknown[]) => {
    const history = (args[0] as { history?: SabaHistory } | undefined)?.history
    if (!history) logData(eventName, args)
    if (history) {
      void accountLogToFile(
        account.platformName,
        account.loginID,
        JSON.stringify(args),
        `${config.name}_History`
      )
      const betLogs = (history.betLogs ?? []).map(config.parseBetLog)
      const betCountBefore = sessionBetCount
      const hasSavedRound = saveBetHistory(account.loginID, betLogs)
      updateSettledRound(betLogs)
      continueHistorySync(client, history, hasSavedRound)
      void refreshCredit(account.id)
      if (sessionBetCount > betCountBefore) void checkSwitchAccount(account)
      // History replies are fully handled here; nothing downstream consumes them
      return
    }

    if (eventName === 'message' && (args[0] as { unauthorized?: boolean })?.unauthorized) {
      void registerSabaNickname(client, account, sabaSession, proxyAgent)
      return
    }

    if (eventName === 'signedIn') {
      log('Server sent signedIn; emitting inGame.')
      client.emit('inGame', null)
      log('Starting round-driven bet loop.')
      startBetLoop(client)
    }

    const activeAccount = findActiveAccount(account)
    if (!activeAccount || !isAccountActive(account.id)) {
      log('Account inactive while receiving data; disconnecting.')
      stopping = true
      disconnectSocket()
      process.exit(0)
    }

    if (checkGameTypeChange(activeAccount)) return

    // Each namespace has its own game event name (BigSmall, SeDie...), so game events
    // are recognised by their payload rather than by name
    const isGameEvent = !NON_GAME_EVENTS.has(eventName)
    if (isGameEvent) handleRoundEvent(args[0])

    if (isGameEvent && applyGameSignal(args[0])) {
      // A finished round may have settled our bet; fetch history to unlock the next bet
      if ((args[0] as { finish?: SabaFinish }).finish && client.connected) {
        scheduleHistoryFetch(client)
      }
      publishSignalTextLog(activeAccount.id)
    }

    port.postMessage({
      type: 'DataSabaBigSmall',
      eventName,
      data: args
    })
    port.postMessage({
      type: 'CrawlDone',
      platformName: activeAccount.platformName
    })
  })

  client.on('connect_error', async (error: Error) => {
    log('Connect error:', error.message)
    if (error.stack) log(error.stack)
  })

  client.on('disconnect', async (reason: string) => {
    log('Disconnected:', reason)
    clearBetLoop()
    if (stopping) return

    const checkAccount = findActiveAccount(account)
    if (!checkAccount) {
      stopping = true
      process.exit(0)
    }

    await accountLogToFile(
      checkAccount.platformName,
      checkAccount.loginID,
      `SABA Socket.IO disconnected: ${reason} [${gameType}]`,
      'Program'
    )

    if (reason === 'io server disconnect' && !stopping) {
      setTimeout(() => client.connect(), 1000)
    }
  })

  client.on('error', (error: unknown) => {
    log('Socket error:')
    console.dir(error, { depth: null })
  })

  client.io.on('reconnect_attempt', (attempt: number) => {
    log(`Reconnect attempt #${attempt}`)
  })

  client.io.on('reconnect', (attempt: number) => {
    log(`Reconnected after ${attempt} attempt(s)`)
  })

  client.io.on('reconnect_error', (error: Error) => {
    log('Reconnect error:', error.message)
  })

  client.io.on('reconnect_failed', () => {
    log('Reconnect failed')
  })

  startHeartbeat()
}

function startHeartbeat(): void {
  clearHeartbeat()
  pingIntervalId = setInterval(() => {
    if (!currentAccount || stopping) return

    const activeAccount = findActiveAccount(currentAccount)
    if (!activeAccount || !isAccountActive(currentAccount.id)) {
      log('Account inactive during heartbeat; stopping worker.')
      stopping = true
      disconnectSocket()
      process.exit(0)
    }

    // Also checked here so a change is caught while the socket is quiet or disconnected
    if (checkGameTypeChange(activeAccount)) return

    port.postMessage({
      type: 'CrawlDone',
      platformName: activeAccount.platformName
    })
  }, 6000)
}

const EVO_RECONNECT_DELAY_MS = 3000
// Connections in a row that close before any game message arrives; the worker then gives up
const EVO_MAX_FAILED_CONNECTIONS = 5
// bettingStats arrives every ~200ms; the account view is refreshed at most this often
const EVO_STATS_PUBLISH_MS = 1000

type EvoResult = { winner?: string } & Record<string, unknown>

/** Evolution table played for a game type; messages are typed `<prefix>.<event>`. */
type EvoTableConfig = {
  // Used in log prefixes and log file names
  name: string
  tableId: string
  prefix: string
  // Spots shown in the betting stats, in display order
  statSides: string[]
  // Spot for each bet mode; Random picks one of them
  spotByBetMode: Record<string, string>
  // Short result text saved in the bet history
  formatResult: (result: EvoResult) => string
}

const EVO_TABLES: Record<string, EvoTableConfig> = {
  [GAME_TYPES.DRAGON_TIGER]: {
    name: 'DragonTiger',
    tableId: 'DragonTiger00001',
    prefix: 'dragontiger',
    statSides: ['Dragon', 'Tiger', 'Tie'],
    spotByBetMode: { [BET_MODES.Dragon]: 'Dragon', [BET_MODES.Tiger]: 'Tiger' },
    formatResult: (result) => `${result.winner} (D ${result.dragonScore} - T ${result.tigerScore})`
  }
}

// Table of the open Evolution socket
let evoTable: EvoTableConfig | null = null
// Connections in a row that received no game message; reset by the first one
let evoFailedConnections = 0
// Reason of the last connection.kickout, reported when the worker gives up
let evoKickoutReason: string | null = null

/** Event name of a message of the current table (e.g. `baccarat.betsOpen` -> `betsOpen`). */
function getEvoEvent(message: EvoMessage): string | null {
  const prefix = `${evoTable?.prefix}.`
  return evoTable && message.type?.startsWith(prefix) ? message.type.slice(prefix.length) : null
}

type EvoBets = {
  status?: string
  chips?: Record<string, number>
  totalAmount?: number
  acceptedBets?: Record<string, { amount: number; payoff?: number }>
}

type EvoMessage = {
  type?: string
  time?: number
  args?: {
    gameId?: string
    timeRemaining?: number
    bets?: EvoBets
    gameNumber?: string
    stats?: Record<string, { amount: number; players: number; percentage: number }>
    result?: EvoResult
  }
}

let lastEvoStatsPublishAt = 0

/**
 * Updates the account view signal from an Evolution message:
 * newGame/betsOpen/betsClosed/resolved drive the round status, bettingStats the totals.
 */
function applyEvoSignal(message: EvoMessage, accountId: string | number): void {
  const args = message.args ?? {}
  const gameNumber = args.gameNumber ? `Game ${args.gameNumber}` : 'Game'

  switch (getEvoEvent(message)) {
    case 'newGame':
      lastTotalBets = null
      lastBetPercentage = null
      roundStatus = `${gameNumber} - New game`
      break
    case 'betsOpen':
      roundStatus = `${gameNumber} - Betting open`
      break
    case 'betsClosed':
      roundStatus = `${gameNumber} - Betting closed`
      break
    case 'resolved': {
      const result = args.result
      roundStatus =
        result && evoTable
          ? `${gameNumber} - Result: ${evoTable.formatResult(result).toUpperCase()}`
          : `${gameNumber} - Resolved`
      break
    }
    case 'bettingStats': {
      if (!args.stats) return
      const totals: GameStats = {}
      const percentages: GameStats = {}
      for (const side of evoTable?.statSides ?? []) {
        const stat = args.stats[side]
        if (!stat) continue
        totals[side] = stat.amount
        percentages[side] = stat.percentage
      }
      lastTotalBets = totals
      lastBetPercentage = percentages

      const now = Date.now()
      if (now - lastEvoStatsPublishAt < EVO_STATS_PUBLISH_MS) return
      lastEvoStatsPublishAt = now
      break
    }
    default:
      return
  }

  publishSignalTextLog(accountId)
}

// Bets sent right as betting opens may be rejected, so wait a little (same as SABA).
const EVO_BET_DELAY_AFTER_OPEN_MS = 3000
// Do not start sending chips when less than this is left before betsClosed.
const EVO_BET_CLOSE_MARGIN_MS = 4000
// Gap between the chips of one bet, like separate clicks
const EVO_CHIP_GAP_MS = 250

/** Bet sent for one game; confirmed by `<prefix>.bets`, settled by `<prefix>.resolved`. */
type EvoPendingBet = {
  gameId: string
  gameNumber: string
  spot: string
  amount: number
  sentAt: number
  confirmed: boolean
}

// Chip values of the table, from /config
let evoChipAmounts: number[] = []
let evoBetTimeoutId: NodeJS.Timeout | null = null
let evoPendingBet: EvoPendingBet | null = null

function clearEvoBetTimeout(): void {
  if (evoBetTimeoutId) {
    clearTimeout(evoBetTimeoutId)
    evoBetTimeoutId = null
  }
}

function getEvoSpot(table: EvoTableConfig): string {
  const betMode = (Setting.findAll() as SettingSchemaType[])[0]?.betMode
  const spot = betMode ? table.spotByBetMode[betMode] : undefined
  if (spot) return spot
  const spots = Object.values(table.spotByBetMode)
  return spots[Math.floor(Math.random() * spots.length)]
}

/**
 * Splits an amount into table chips, largest first. Works in cents to avoid float drift;
 * the part no chip can cover (e.g. below the smallest chip) is dropped.
 */
function splitIntoChips(amount: number, chipAmounts: number[]): number[] {
  const chips: number[] = []
  let rest = Math.round(amount * 100)
  for (const chip of [...chipAmounts].sort((a, b) => b - a)) {
    const chipCents = Math.round(chip * 100)
    while (chipCents > 0 && rest >= chipCents) {
      chips.push(chip)
      rest -= chipCents
    }
  }
  return chips
}

function randomEvoId(): string {
  return Math.random().toString(36).slice(2, 12).padEnd(10, '0')
}

function sendEvoChip(
  client: WebSocket,
  table: EvoTableConfig,
  gameId: string,
  spot: string,
  amount: number
): void {
  const now = Date.now()
  const type = `${table.prefix}.bet`
  const payload = {
    id: randomEvoId(),
    type,
    args: {
      gameId,
      replyId: `${type}-${Math.floor(Math.random() * 1e9)}-${now}`,
      timestamp: now,
      betTags: { openMwTables: 1, mwLayout: 8, btTableView: '0', orientation: 'landscape' },
      action: { name: 'Chip', chip: { spot, amount } }
    }
  }
  console.log(`\n========== EVO CLIENT SEND: ${type} ==========`)
  console.dir(payload, { depth: null, colors: true })
  client.send(JSON.stringify(payload))
}

/** True while a sent bet has not been settled, or betting is stopped. */
function isEvoBetLocked(): boolean {
  if (betStopped || switchCheckRunning) return true
  if (!evoPendingBet) return false
  if (Date.now() - evoPendingBet.sentAt >= ROUND_LOCK_TIMEOUT_MS) {
    log(`Bet on game ${evoPendingBet.gameNumber} never settled; unlocking.`)
    evoPendingBet = null
    setBetStatus('Bet result not found (timeout) - ready for next bet')
    return false
  }
  return true
}

/** Schedules the bet of a game when betting opens; one bet per game. */
function scheduleEvoBet(
  client: WebSocket,
  gameId: string,
  gameNumber: string,
  timeRemaining: number
): void {
  clearEvoBetTimeout()
  if (isEvoBetLocked()) return
  if (timeRemaining < EVO_BET_DELAY_AFTER_OPEN_MS + EVO_BET_CLOSE_MARGIN_MS) return

  evoBetTimeoutId = setTimeout(() => {
    evoBetTimeoutId = null
    void placeEvoBet(client, gameId, gameNumber)
  }, EVO_BET_DELAY_AFTER_OPEN_MS)
}

async function placeEvoBet(client: WebSocket, gameId: string, gameNumber: string): Promise<void> {
  const table = evoTable
  if (!table || stopping || client.readyState !== WebSocket.OPEN || isEvoBetLocked()) return

  const amount = currentAccount ? getBetAmount(currentAccount.platformName) : 0
  const chips = splitIntoChips(amount, evoChipAmounts)
  const total = roundMoney(chips.reduce((sum, chip) => sum + chip, 0))
  if (!chips.length) {
    setBetStatus(
      `Invalid bet amount ${amount} - must be at least ${evoChipAmounts[0] ?? 0.5} (check Fixed Amount in SportsBook setting)`
    )
    return
  }
  if (total !== amount)
    log(`Bet amount ${amount} rounded to ${total} to fit chips ${chips.join('+')}.`)

  const spot = getEvoSpot(table)
  evoPendingBet = { gameId, gameNumber, spot, amount: total, sentAt: Date.now(), confirmed: false }
  for (const [index, chip] of chips.entries()) {
    if (index > 0) await delay(EVO_CHIP_GAP_MS)
    // Stop if the socket dropped or another game started while chips were being sent
    if (stopping || client.readyState !== WebSocket.OPEN || evoPendingBet?.gameId !== gameId) return
    sendEvoChip(client, table, gameId, spot, chip)
  }
  setBetStatus(
    `Bet ${spot.toUpperCase()} ${total} sent for game ${gameNumber} - waiting for confirmation`
  )
}

/** `<prefix>.bets` arrives once betting closes with the bets the server accepted. */
function handleEvoBetsAccepted(gameId: string | undefined, bets: EvoBets | undefined): void {
  if (!evoPendingBet || evoPendingBet.gameId !== gameId) return

  const accepted = Object.entries(bets?.acceptedBets ?? {})
    .filter(([, bet]) => Number(bet?.amount) > 0)
    .map(([spot, bet]) => `${spot} ${bet?.amount}`)
  if (bets?.status === 'BetsAccepted' && accepted.length) {
    evoPendingBet.confirmed = true
    setBetStatus(
      `Bet game ${evoPendingBet.gameNumber} confirmed (${accepted.join(', ')}) - waiting for result`
    )
    return
  }

  log(`Bet on game ${evoPendingBet.gameNumber} not accepted (${bets?.status ?? 'unknown'}).`)
  setBetStatus(
    `Bet game ${evoPendingBet.gameNumber} not accepted (${bets?.status ?? 'unknown'}) - retry next game`
  )
  evoPendingBet = null
}

/** Saves the settled bet of `<prefix>.resolved`; returns true when a record was created. */
function saveEvoBetHistory(loginID: string, message: EvoMessage): boolean {
  const args = message.args ?? {}
  const acceptedBets = Object.entries(args.bets?.acceptedBets ?? {}).filter(
    ([, bet]) => Number(bet?.amount) > 0
  )
  if (!args.gameId || !acceptedBets.length) return false

  const round = args.gameNumber ? `${args.gameNumber} (${args.gameId})` : args.gameId
  if (BetHistory.findOne({ loginID, round })) return false

  const stake = roundMoney(acceptedBets.reduce((sum, [, bet]) => sum + Number(bet?.amount), 0))
  // payoff is what comes back for the spot, stake included (0 when lost)
  const payoff = roundMoney(
    acceptedBets.reduce((sum, [, bet]) => sum + (Number(bet?.payoff) || 0), 0)
  )
  const win = payoff > stake ? roundMoney(payoff - stake) : 0
  const refund = payoff > 0 && payoff <= stake ? payoff : 0
  const result = args.result && evoTable ? evoTable.formatResult(args.result) : ''

  const record = BetHistory.create({
    gameType,
    loginID,
    time: formatBetTime(new Date(message.time ?? Date.now())),
    round,
    betChoice: acceptedBets.map(([spot]) => spot).join(','),
    result,
    stake: String(stake),
    refund: String(refund),
    win: String(win)
  }) as BetHistoryType
  if (!record) return false

  port.postMessage({ type: 'NewBetHistory', data: [record] })
  const outcome = win > 0 ? `WIN ${win}` : refund > 0 ? `REFUND ${refund}` : `LOSE ${stake}`
  log(`Game ${args.gameNumber} settled: ${outcome} (payoff ${payoff}).`)
  setBetStatus(`Bet game ${args.gameNumber}: ${outcome} - ready for next bet`)
  return true
}

/** Drives the bet of each game from the round messages of the Evolution socket. */
function handleEvoBetFlow(client: WebSocket, message: EvoMessage, account: AccountType): void {
  const args = message.args ?? {}

  switch (getEvoEvent(message)) {
    case 'betsOpen':
      if (args.gameId) {
        scheduleEvoBet(client, args.gameId, args.gameNumber ?? '', Number(args.timeRemaining) || 0)
      }
      break
    case 'betsClosed':
      clearEvoBetTimeout()
      break
    case 'bets':
      handleEvoBetsAccepted(args.gameId, args.bets)
      break
    case 'resolved': {
      const ownGame = evoPendingBet?.gameId === args.gameId
      if (args.bets?.status === 'Settled' && saveEvoBetHistory(account.loginID, message)) {
        sessionBetCount += 1
        if (ownGame) evoPendingBet = null
        void refreshCredit(account.id)
        void checkSwitchAccount(account)
      } else if (ownGame) {
        // Sent but never settled (e.g. NoBets): nothing to save, bet again next game
        log(`Game ${args.gameNumber} resolved without our bet (${args.bets?.status}).`)
        setBetStatus(
          `Bet game ${args.gameNumber} not placed (${args.bets?.status}) - retry next game`
        )
        evoPendingBet = null
      }
      break
    }
  }
}

/** Opens the Evolution socket of the table and bets one game at a time. */
async function initializeEvoSocket(account: AccountType, table: EvoTableConfig): Promise<void> {
  disconnectSocket()
  currentAccount = account
  evoTable = table
  evoFailedConnections = 0
  evoKickoutReason = null

  const { status, data } = isProxyConfigValid(account)
  const { newIpAddress, newPort, newUsername, newPassword } = data
  const proxyUrl =
    status && account.proxyScope !== OPTIONS_PROXY.NONE
      ? `http://${newUsername}:${newPassword}@${newIpAddress}:${newPort}`
      : undefined
  const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined

  log(`Connecting to Evolution ${table.name} (${table.tableId})...`)
  log('Proxy enabled:', Boolean(proxyAgent))
  startHeartbeat()
  await openEvoConnection(account, table, proxyAgent, 0)
}

/**
 * Fetches a fresh Evolution session and opens the socket with it. Every (re)connect needs a
 * new session: once the server kicks a connection out, its EVOSESSIONID is notAuthorised.
 */
async function openEvoConnection(
  account: AccountType,
  table: EvoTableConfig,
  proxyAgent: HttpsProxyAgent<string> | undefined,
  reconnectionCount: number
): Promise<void> {
  let session: Awaited<ReturnType<typeof getEvoSession>>
  try {
    session = await getEvoSession(account, table.tableId, proxyAgent)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log('Failed to get Evolution session:', message)
    if (error instanceof EvoGeoRestrictedError) return handleRegionRestricted(account, message)
    await logAndTriggerRelogin(port, account, `[ERROR] Get Evolution session: ${message}`)
    stopping = true
    disconnectSocket()
    process.exit(0)
  }
  if (stopping || evoTable !== table) return

  log('Entry:', session.entryHops.join(' | '))
  log('Socket URL:', session.socketUrl)
  await accountLogToFile(
    account.platformName,
    account.loginID,
    `Evolution session for ${table.tableId}: ${session.entryHops.join(' | ')} || socket ${session.socketUrl} || ws_encryption ${session.wsEncryption ?? 'none'}`,
    'Program'
  )

  // Tables with ws_encryption only accept an encrypted socket (encrypted=true&nonce=...);
  // the plain JSON socket is kicked out at once (reason "other"), so do not connect
  if (session.wsEncryption) {
    await logAndNotify(
      port,
      account,
      `Evolution table ${table.name} requires an encrypted socket (ws_encryption ${session.wsEncryption}), which is not supported.`,
      { fields: { status: STATUS_ACCOUNT.EXIT } }
    )
    stopping = true
    disconnectSocket()
    return
  }

  evoChipAmounts = session.chipAmounts
  connectEvoSocket(account, session, proxyAgent, reconnectionCount)
}

function connectEvoSocket(
  account: AccountType,
  session: Awaited<ReturnType<typeof getEvoSession>>,
  proxyAgent: HttpsProxyAgent<string> | undefined,
  reconnectionCount: number
): void {
  const client = new WebSocket(session.socketUrl, {
    headers: {
      Origin: `https://${session.host}`,
      Cookie: session.cookie,
      'User-Agent': EVO_USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9'
    },
    handshakeTimeout: 20000,
    ...(proxyAgent && { agent: proxyAgent })
  })
  evoSocket = client

  client.on('open', () => {
    log('Evolution socket connected.')
    const established = {
      log: {
        type: 'CLIENT_SOCKET_CONNECTION_ESTABLISHED',
        value: {
          reconnectionCount,
          compression: 'none',
          encryption: 'none',
          channel: 'PCMac',
          orientation: 'landscape',
          gameDimensions: { width: 1600, height: 900 },
          gameId: ''
        }
      }
    }
    console.log('\n========== EVO CLIENT SEND ==========')
    console.dir(established, { depth: null, colors: true })
    client.send(JSON.stringify(established))
  })

  client.on('message', (raw: WebSocket.RawData) => {
    let message: unknown = raw.toString()
    try {
      message = JSON.parse(message as string)
    } catch {
      // Keep non-JSON frames as text
    }
    const eventName = (message as { type?: string } | null)?.type ?? 'message'
    logData(`EVO ${eventName}`, [message])

    if (eventName === 'connection.kickout') {
      evoKickoutReason = String(
        (message as EvoMessage & { args?: { reason?: string } }).args?.reason
      )
      log(`Kicked out by Evolution: ${evoKickoutReason}`)
    } else if (getEvoEvent(message as EvoMessage)) {
      // The table is streaming, so this session works
      evoFailedConnections = 0
      evoKickoutReason = null
    }

    const activeAccount = findActiveAccount(account)
    if (!activeAccount || !isAccountActive(account.id)) {
      log('Account inactive while receiving data; disconnecting.')
      stopping = true
      disconnectSocket()
      process.exit(0)
    }
    if (checkGameTypeChange(activeAccount)) return

    applyEvoSignal(message as EvoMessage, activeAccount.id)
    handleEvoBetFlow(client, message as EvoMessage, activeAccount)

    port.postMessage({
      type: 'CrawlDone',
      platformName: activeAccount.platformName
    })
  })

  client.on('unexpected-response', (_request, response) => {
    log(`Evolution socket rejected: HTTP ${response.statusCode}`)
  })

  client.on('error', (error: Error) => {
    log('Evolution socket error:', error.message)
  })

  client.on('close', async (code: number, reason: Buffer) => {
    log(`Evolution socket closed: ${code} ${reason.toString()}`)
    if (stopping || evoSocket !== client) return
    evoSocket = null

    const checkAccount = findActiveAccount(account)
    if (!checkAccount) {
      stopping = true
      process.exit(0)
    }
    await accountLogToFile(
      checkAccount.platformName,
      checkAccount.loginID,
      `Evolution socket closed: ${code} ${reason.toString()} [${gameType}]`,
      'Program'
    )

    evoFailedConnections += 1
    if (evoFailedConnections >= EVO_MAX_FAILED_CONNECTIONS) {
      const reason = evoKickoutReason ? `kickout: ${evoKickoutReason}` : `close ${code}`
      await logAndNotify(
        port,
        checkAccount,
        `Evolution ${evoTable?.name} kept disconnecting (${reason}); stopped after ${evoFailedConnections} attempts.`,
        { fields: { status: STATUS_ACCOUNT.EXIT } }
      )
      stopping = true
      disconnectSocket()
      return
    }

    const table = evoTable
    evoReconnectTimeoutId = setTimeout(() => {
      evoReconnectTimeoutId = null
      if (stopping || !table) return
      log(`Reconnect attempt #${reconnectionCount + 1} with a new session`)
      void openEvoConnection(account, table, proxyAgent, reconnectionCount + 1)
    }, EVO_RECONNECT_DELAY_MS)
  })
}

async function startTimer(account: AccountType): Promise<void> {
  const accountKey = String(account.id)
  if (timerStartedForAccountId === accountKey) return
  timerStartedForAccountId = accountKey

  const min = 120
  const max = 180
  const randomMinutes = Math.floor(Math.random() * (max - min + 1)) + min
  const ms = randomMinutes * 60 * 1000

  log(`Session timer started; relogin check in ${randomMinutes} minutes.`)
  await delay(ms)

  if (stopping || !currentAccount || String(currentAccount.id) !== accountKey) return
  await logAndTriggerRelogin(port, account, 'Session timer expired, forcing re-login.')
  stopping = true
  disconnectSocket()
  process.exit(0)
}

process.on('SIGINT', () => {
  stopping = true
  disconnectSocket()
  process.exit(0)
})

process.on('SIGTERM', () => {
  stopping = true
  disconnectSocket()
  process.exit(0)
})
