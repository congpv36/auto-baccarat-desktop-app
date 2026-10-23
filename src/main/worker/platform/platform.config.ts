import createWorkerCrawlViva88 from './Viva88/workerCrawl?nodeWorker'
import createWorkerLoginViva88 from './Viva88/workerLogin?nodeWorker'

const PLATFORM = {
  VIVA88BET: 'Viva88Bet'
}

const PLATFORM_DEFINITIONS: Record<
  string,
  {
    login: unknown
    crawl: unknown
  }
> = {
  [PLATFORM.VIVA88BET]: {
    login: createWorkerLoginViva88,
    crawl: createWorkerCrawlViva88
  }
}

export const PLATFORM_CONFIG = Object.fromEntries(
  Object.entries(PLATFORM_DEFINITIONS).map(([platform, { login, crawl }]) => [
    platform,
    { login, crawl }
  ])
) as Record<
  string,
  {
    login: typeof createWorkerLoginViva88
    crawl: typeof createWorkerCrawlViva88
  }
>
