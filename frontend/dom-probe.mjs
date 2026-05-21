import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

page.on('console', (msg) => {
  if (msg.type() === 'error' && msg.text().includes('webpack-hmr')) return
  console.log(`[console ${msg.type()}]`, msg.text().slice(0, 300))
})
page.on('pageerror', (err) => console.log('[pageerror]', err.message))

await page.goto('http://127.0.0.1:3000/editor', { waitUntil: 'domcontentloaded' })

await new Promise(r => setTimeout(r, 8000))

const result = await page.evaluate(() => {
  const sections = Array.from(document.querySelectorAll('section')).map((s, i) => ({
    i,
    classes: s.className,
    childCount: s.children.length,
    text: s.textContent.slice(0, 80),
    style: s.getAttribute('style'),
  }))
  return {
    sections,
    monacoCount: document.querySelectorAll('.monaco-editor').length,
    loadingText: !!document.body.textContent.includes('Loading editor'),
    runBtn: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Run')),
    artifactsTxt: !!document.body.textContent.includes('ML Artifacts'),
    headChildrenWithMonaco: Array.from(document.head.querySelectorAll('*')).filter(el => el.outerHTML.toLowerCase().includes('monaco')).length,
  }
})
console.log('result:', JSON.stringify(result, null, 2))

await browser.close()
