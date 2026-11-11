// Standardmäßig nur lesen; --apply schreibt ausschließlich das Feld notes.
// node --env-file=.env.cleanup.local scripts/clean-retroactive-notes.mjs
// Alternativ öffentliche App-Konfiguration: --app-url=https://timo-zeiterfassung.vercel.app
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { transformSync } from 'esbuild'
const { code } = transformSync(readFileSync(new URL('../src/utils/manualEntryNotes.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' })
const { cleanManualEntryNotes } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

const apply = process.argv.includes('--apply')
const appUrl = process.argv.find((arg) => arg.startsWith('--app-url='))?.slice(10)
const backupPath = resolve(process.argv.find((arg) => arg.startsWith('--backup='))?.slice(9)
  || `tmp/retroactive-notes-${Date.now()}.local`)

async function publicAppConfig(url) {
  const htmlResponse = await fetch(url)
  if (!htmlResponse.ok) throw new Error(`App konnte nicht gelesen werden: ${htmlResponse.status}`)
  const html = await htmlResponse.text()
  const scripts = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((match) => new URL(match[1], url))
  for (const script of scripts) {
    if (script.origin !== new URL(url).origin) continue
    const response = await fetch(script)
    if (!response.ok) continue
    const source = await response.text()
    // Der Web-App-Konfigurationsblock ist öffentlich; keine Server-Schlüssel.
    const blocks = source.matchAll(/\{apiKey:"([^"]+)"(?:\.trim\(\))?,authDomain:"([^"]+)"(?:\.trim\(\))?,projectId:"([^"]+)"/g)
    for (const match of blocks) {
      if (match[2].includes('rechnung')) continue
      return { apiKey: match[1], authDomain: match[2], projectId: match[3] }
    }
  }
  throw new Error('Öffentliche Firebase-Konfiguration nicht gefunden.')
}

async function connect() {
  if (appUrl) {
    const config = await publicAppConfig(appUrl)
    const { initializeApp } = await import('firebase/app')
    const { getAuth, signInAnonymously } = await import('firebase/auth')
    const { getFirestore, collection, getDocs, doc, runTransaction, terminate } = await import('firebase/firestore')
    const app = initializeApp(config)
    const auth = getAuth(app)
    await signInAnonymously(auth)
    const db = getFirestore(app)
    return {
      projectId: config.projectId,
      read: async () => (await getDocs(collection(db, 'timeEntries'))).docs.map((d) => ({ id: d.id, data: d.data() })),
      update: async (change) => runTransaction(db, async (tx) => {
        const ref = doc(db, 'timeEntries', change.id)
        const snap = await tx.get(ref)
        if (!snap.exists() || snap.data().notes !== change.before) throw new Error(`Buchung zwischenzeitlich geändert: ${change.id}`)
        tx.update(ref, { notes: change.after })
      }),
      close: async () => { await terminate(db); await auth.signOut() }
    }
  }
  for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
    if (!process.env[key] || process.env[key].includes('[SENSITIVE]')) throw new Error(`Nicht verfügbar: ${key}`)
  }
  const { initializeApp, cert } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  const projectId = process.env.FIREBASE_PROJECT_ID
  initializeApp({ credential: cert({ projectId, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }) })
  const db = getFirestore()
  return {
    projectId,
    read: async () => (await db.collection('timeEntries').get()).docs.map((d) => ({ id: d.id, data: d.data() })),
    update: async (change) => db.runTransaction(async (tx) => {
      const ref = db.collection('timeEntries').doc(change.id)
      const snap = await tx.get(ref)
      if (!snap.exists || snap.data().notes !== change.before) throw new Error(`Buchung zwischenzeitlich geändert: ${change.id}`)
      tx.update(ref, { notes: change.after })
    }),
    close: () => db.terminate()
  }
}

const connection = await connect()
try {
  const entries = await connection.read()
  const changes = entries.filter(({ data }) => typeof data.notes === 'string')
    .map(({ id, data }) => ({ id, before: data.notes, after: cleanManualEntryNotes(data) }))
    .filter((change) => change.before !== change.after)
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', projectId: connection.projectId, checked: entries.length, matching: changes.length, commentsRetained: changes.filter((c) => c.after).length }))
  if (apply && changes.length) {
    mkdirSync(dirname(backupPath), { recursive: true })
    writeFileSync(backupPath, JSON.stringify({ projectId: connection.projectId, createdAt: new Date().toISOString(), changes }, null, 2), { flag: 'wx', mode: 0o600 })
    console.log(`Sicherung: ${backupPath}`)
    for (const change of changes) await connection.update(change)
    const remaining = (await connection.read()).filter(({ data }) => typeof data.notes === 'string' && cleanManualEntryNotes(data) !== data.notes)
    if (remaining.length) throw new Error(`Nachprüfung: ${remaining.length} Buchungen sind noch zu bereinigen.`)
    console.log(JSON.stringify({ updated: changes.length, remaining: 0 }))
  }
} finally {
  await connection.close()
}
