/* eslint-disable @typescript-eslint/no-explicit-any */
import db from '@db/config/database'
import Model, { clearTable, Platform, PlatformUrl } from '@db/model'
import { v4 as uuidv4 } from 'uuid'

import { ensureTrailingSlash } from '@/browserWindows/service/ensureTrailingSlash'
import { systemLogToFile } from '@/worker/lib/systemLogToFile'

export const fetchDataSystem = async (url: string, model: Model, accessToken: string) => {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (!response.ok) {
    await systemLogToFile(`Get ${url}: ${JSON.stringify(response.statusText)}`, 'Error')
    console.error(`Error fetching ${url}:`, response.statusText)
    return
  }

  const responseData = (await response.json()) as { data: { rows: any[] } }
  await systemLogToFile(`Get ${new URL(url).pathname}: Response 200 OK`, 'Program')

  const { rows } = responseData.data

  const transaction = db.transaction(() => {
    if (model === Platform) {
      clearTable('PlatformUrl')
      clearTable('Platform')

      for (const platform of rows) {
        if (platform.urls.length !== 0) {
          for (const urlOption of platform.urls) {
            PlatformUrl.create({
              id: uuidv4(),
              url: ensureTrailingSlash(urlOption),
              platformName: platform.platformName
            })
          }
        }

        const existingRecord = Platform.findOne({ uuid: platform.id })

        if (!existingRecord) {
          Platform.create({
            uuid: platform.id,
            name: platform.platformName,
            url: platform.url
          })
        }
      }
    }
  })
  transaction()
}
