// Lokale UI-Prüfung mit isoliertem Datenspeicher; keine produktiven Schreibzugriffe.
const { build } = require('esbuild')
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')

async function main() {
  if (!process.env.PLAYWRIGHT_MODULE) throw new Error('PLAYWRIGHT_MODULE muss auf eine lokale playwright-core-Installation zeigen.')
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
  const dir = path.join(os.tmpdir(), 'timo-measurements-ui')
  mkdirSync(dir, { recursive: true })
  const mock = `
    import { measurementOfferLines } from '${path.resolve('src/utils/measurementText.ts').replaceAll('\\', '/')}'
    const employee = {id:'employee', name:'Max Mustermann', status:'active'};
    export const getCurrentUser=()=>employee;
    export const getCurrentAdmin=()=>null;
    export const DataService={getActiveCustomers:async()=>[{id:'existing',name:'Bestandskunde',address:'Musterweg 1'}]};
    window.testMeasurements={};window.testCustomers=[];
    export const listMeasurements=async()=>Object.values(window.testMeasurements);
    export const getMeasurement=async(id)=>window.testMeasurements[id];
    export const newMeasurement=(createdBy)=>({id:'new-measurement',title:'',customerId:'',customerName:'',address:'',text:'',positions:[],positionsSourceText:'',createdBy,updatedAt:new Date()});
    export const saveMeasurement=async(m)=>{window.testMeasurements[m.id]=m};
    export const createMeasurementCustomer=async(c)=>{window.testCustomers.push(c)};
    export const createMeasurementOffer=async(m)=>{measurementOfferLines(m.positions);window.testOffer=m;return {id:'draft',number:'AN-2026-0001'}};
  `
  await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';import './src/styles/index.css';import MeasurementsPage from './src/components/measurements/MeasurementsPage';createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/aufmass']}><Routes><Route path="/aufmass" element={<MeasurementsPage/>}/><Route path="/aufmass/:id" element={<MeasurementsPage/>}/></Routes></MemoryRouter>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, outfile: path.join(dir, 'app.js'), jsx: 'automatic',
    plugins: [{ name: 'isolated-data', setup(build) {
      build.onResolve({ filter: /services\/(dataService|data\/session|data\/measurements)$/ }, () => ({ path: 'mock-data', namespace: 'test' }))
      build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: mock, loader: 'ts', resolveDir: process.cwd() }))
    } }]
  })
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><body style="margin:0"><div id="root"></div><script src="app.js"></script></body></html>')
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.route('**/brand-logo.png', (route) => route.fulfill({ contentType: 'image/png', body: readFileSync('public/brand-logo.png') }))
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href)
    await page.getByRole('button', { name: '+ Neues Aufmaß' }).click()
    await page.getByRole('button', { name: '+ Neuer Kunde' }).click()
    await page.getByLabel('Kundenname *', { exact: true }).fill('Franken Wohnheim')
    await page.getByLabel('Straße / Hausnummer', { exact: true }).fill('Oster Howser Straße 7')
    await page.getByRole('button', { name: 'Kunden anlegen', exact: true }).click()
    await page.getByText('Kunde im gemeinsamen Kundenstamm angelegt.', { exact: false }).waitFor()
    assert.equal(await page.evaluate(() => window.testCustomers.length), 1)
    await page.getByLabel('Bezeichnung / Ort', { exact: true }).fill('Franken · Wohnheim · 1. OG links')
    const text = readFileSync('src/utils/measurementText.test.ts', 'utf8').match(/const example = `([\s\S]*?)`/)[1]
    const field = page.getByLabel('Aufmaßtext', { exact: true })
    const before = (await field.boundingBox()).height
    await field.fill(text)
    const after = (await field.boundingBox()).height
    assert.ok(after > before + 300, 'Aufmaßtext muss mit dem Inhalt wachsen')
    await page.getByRole('button', { name: 'Positionen aus Text ableiten' }).click()
    assert.equal(await page.locator('.measurement-position').count(), 17)
    await page.getByRole('button', { name: '+ Position ergänzen' }).click()
    assert.equal(await page.locator('.measurement-position').count(), 18)
    await page.locator('.measurement-position').last().getByLabel('Leistung', { exact: true }).fill('Zusatzarbeit')
    await page.getByRole('button', { name: 'Position Zusatzarbeit entfernen', exact: true }).click()
    assert.equal(await page.locator('.measurement-position').count(), 17)
    for (const position of await page.locator('.measurement-position').all()) {
      const quantity = position.getByLabel('Menge', { exact: true })
      if (!await quantity.inputValue()) {
        await quantity.fill('1')
        await position.getByLabel('Einheit', { exact: true }).fill('pauschal')
      }
    }
    await page.getByRole('button', { name: 'Aufmaß speichern', exact: false }).click()
    await page.getByText('Aufmaß gespeichert.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Angebotsentwurf erstellen' }).click()
    await page.getByText('Angebotsentwurf AN-2026-0001 ist im Rechnungsprogramm verfügbar.', { exact: false }).waitFor()
    assert.equal(await page.evaluate(() => window.testOffer.positions.length), 17)
    assert.equal(await page.evaluate(() => window.testOffer.customerName), 'Franken Wohnheim')
    assert.equal(await page.evaluate(() => window.testOffer.createdBy), 'Max Mustermann')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Kein horizontaler Überlauf auf dem Handy')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: path.join(dir, 'mobile.png') })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('heading', { name: 'Positionen prüfen' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(dir, 'positions.png') })
    await page.getByRole('button', { name: 'Zurück', exact: true }).click()
    await page.getByText('Franken · Wohnheim · 1. OG links', { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    console.log(`UI erfolgreich: Mitarbeiterzugriff, Neukunde, wachsender Beispieltext, 17 Positionen, Speichern und Entwurf. Screenshots: ${dir}`)
  } finally { await browser.close() }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
