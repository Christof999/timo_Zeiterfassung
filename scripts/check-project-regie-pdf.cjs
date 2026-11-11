const { buildSync } = require('esbuild')
const { mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const dir = path.join(os.tmpdir(), 'timo-project-regie-check')
mkdirSync(dir, { recursive: true })
const bundle = path.join(dir, 'regie.cjs')
buildSync({ entryPoints: ['src/utils/projectRegiePdf.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: bundle })
const { projectRegiePdf } = require(bundle)
const quantities = [{ key: 'labor:h', name: 'Arbeitszeit', quantity: 24.5, unit: 'h' }, { key: 'tile', name: 'Wandfliesen weiß', quantity: 36, unit: 'm²' }]
projectRegiePdf({
  projectId: 'example', projectName: 'Badsanierung Musterstraße 12', customerName: 'Familie Müller', address: 'Musterstraße 12, 91792 Ellingen',
  quantities, sourceQuantities: quantities, corrected: true, signatures: [],
  days: Array.from({ length: 18 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, employee: 'Max Mustermann', hours: 4.5, notes: ['Untergrund vorbereitet, Wandfliesen zugeschnitten und verlegt. Anschlussfugen fachgerecht ausgeführt.'] })),
  materialBookings: [{ date: '2026-10-01', name: 'Wandfliesen weiß', unit: 'm²', quantity: 36, note: 'Material auf der Baustelle verbraucht.' }]
}).then((bytes) => { const output = path.join(dir, 'Regiebericht-gesamt.pdf'); writeFileSync(output, bytes); console.log(output) })
