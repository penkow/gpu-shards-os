import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()

// Delay /api/state by 3s on initial load
await page.route('**/api/state', async (route) => {
  await new Promise(r => setTimeout(r, 3000))
  await route.continue()
})

await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })

// Snap at t=600ms (modal should be up)
await new Promise(r => setTimeout(r, 600))
await page.screenshot({ path: '/tmp/modal-loading.png' })
const earlyDom = await page.evaluate(() => ({
  modalUp: document.body.textContent.includes('Connecting to backend'),
}))

// Wait for modal to disappear
const settled = await page.waitForFunction(() => !document.body.textContent.includes('Connecting to backend'), { timeout: 10000 }).then(() => true).catch(() => false)
await new Promise(r => setTimeout(r, 400))
await page.screenshot({ path: '/tmp/modal-after.png' })

const afterDom = await page.evaluate(() => ({
  modalUp: document.body.textContent.includes('Connecting to backend'),
  bannerUp: document.body.textContent.includes('Disconnected from Docker'),
  hasConnectedText: document.body.textContent.match(/Connected\s*·/) !== null,
}))

console.log('early:', earlyDom)
console.log('settled:', settled)
console.log('after:', afterDom)
await browser.close()
