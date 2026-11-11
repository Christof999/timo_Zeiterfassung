// Nur lesende HTTP-Prüfungen; löst weder Mailversand noch Datenänderungen aus.
const assert = require('node:assert/strict')

async function check(url, route, api, required) {
  const page = await fetch(new URL(route, url))
  assert.equal(page.status, 200, `${url}${route}`)
  const html = await page.text()
  assert.match(page.headers.get('content-type') || '', /text\/html/)
  const scriptPaths = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((match) => match[1])
  assert.ok(scriptPaths.length)
  let source = ''
  for (const path of scriptPaths) {
    const response = await fetch(new URL(path, url))
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') || '', /javascript/)
    source += await response.text()
  }
  for (const text of required) assert.ok(source.includes(text), `Aktueller Programmstand fehlt: ${text}`)
  if (url.includes('zeiterfassung')) {
    const measurementPath = /(?:\.\/)?assets\/MeasurementsPage-[\w-]+\.js/.exec(source)?.[0]
    assert.ok(measurementPath, 'Aufmaß-Modul fehlt')
    const module = await fetch(new URL(measurementPath, url))
    assert.equal(module.status, 200)
    assert.match(module.headers.get('content-type') || '', /javascript/)
  }
  const endpoint = await fetch(new URL(api, url))
  assert.equal(endpoint.status, 405, `API nicht erreichbar: ${api}`)
  console.log(`OK: ${url}${route} · aktuelle JavaScript-Dateien · ${api}`)
}

Promise.all([
  check('https://timo-zeiterfassung.vercel.app', '/aufmass', '/api/send-report', ['MeasurementsPage', '/aufmass']),
  check('https://timo-rechnungsprogramm.vercel.app', '/angebote', '/api/send-mail', ['info@fliesen-reisloehner.de', 'documentKind', 'Regiebericht-gesamt.pdf']),
]).catch((error) => { console.error(error); process.exitCode = 1 })
