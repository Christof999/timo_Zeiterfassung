const { createHash, randomUUID } = require('node:crypto')
const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
class ManageError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const objectInput = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const textInput = value => typeof value === 'string' ? value.trim() : ''
const dateFromValue = value => value instanceof Date ? value : value?.toDate?.()
const DEFAULT_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const GAP_MS = 1100;
const LEASE_MS = 15_000;
const CACHE_MS = 30 * 24 * 60 * 60 * 1000;
/** Nur die verwendeten Textfelder der externen Antwort übernehmen. */
function formatGeocodeAddress(value) {
    const data = objectInput(value);
    const a = data.address == null ? {} : objectInput(data.address);
    const street = [textInput(a.road) || textInput(a.pedestrian) || textInput(a.footway), textInput(a.house_number)].filter(Boolean).join(' ');
    const city = [textInput(a.postcode), textInput(a.city) || textInput(a.town) || textInput(a.village) || textInput(a.municipality)].filter(Boolean).join(' ');
    const address = [street, city].filter(Boolean).join(', ') || textInput(data.display_name);
    if (!address)
        throw new Error('Der Adressdienst hat keine Adresse geliefert.');
    return address;
}
/** Gemeinsamer Cache und eine globale Sperre, auch über Serverinstanzen und Vorschauen hinweg. */
async function geocode(app, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new ManageError(422, 'Ungültige Standortangaben.');
    const input = objectInput(value);
    if (typeof input.lat !== 'number' || !Number.isFinite(input.lat) || Math.abs(input.lat) > 90 || typeof input.lng !== 'number' || !Number.isFinite(input.lng) || Math.abs(input.lng) > 180)
        throw new ManageError(422, 'Ungültige Standortkoordinaten.');
    const db = getFirestore(app);
    const root = db.collection('geocoding');
    const config = (await root.doc('config').get()).data();
    const endpoint = config?.endpoint ?? DEFAULT_ENDPOINT;
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://'))
        throw new ManageError(503, 'Adresssuche ist derzeit deaktiviert.');
    const lat = input.lat.toFixed(5), lng = input.lng.toFixed(5);
    const cacheId = createHash('sha256').update(`${endpoint}|${lat},${lng}`).digest('hex');
    const cachedRef = root.doc(cacheId), lockRef = root.doc('lock');
    const owner = randomUUID();
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
        const slot = await db.runTransaction(async (tx) => {
            const [cached, lock] = await Promise.all([tx.get(cachedRef), tx.get(lockRef)]);
            const data = cached.data();
            if (typeof data?.address === 'string' && (dateFromValue(data.expiresAt)?.getTime() ?? 0) > Date.now())
                return { kind: 'cached', address: data.address };
            const availableAt = lock.data()?.availableAt;
            if (typeof availableAt === 'number' && availableAt > Date.now())
                return { kind: 'wait', ms: Math.min(availableAt - Date.now(), GAP_MS) };
            tx.set(lockRef, { owner, availableAt: Date.now() + LEASE_MS });
            return { kind: 'fetch' };
        });
        if (slot.kind === 'cached')
            return { address: slot.address };
        if (slot.kind === 'wait') {
            await new Promise(resolve => setTimeout(resolve, slot.ms));
            continue;
        }
        let cooldown = GAP_MS;
        try {
            const url = new URL(endpoint);
            for (const [key, val] of Object.entries({ format: 'jsonv2', lat, lon: lng, zoom: '18', addressdetails: '1', 'accept-language': 'de' }))
                url.searchParams.set(key, val);
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Timo-Zeit/1.0 (+https://github.com/Christof999/werkbank)', Accept: 'application/json' },
                signal: AbortSignal.timeout(8000),
                redirect: 'error',
            });
            if (response.status === 429 || response.status === 503) {
                const retryAfter = response.headers.get('retry-after') || '';
                const retryMs = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
                cooldown = Math.max(60_000, Number.isFinite(retryMs) ? retryMs : 0);
            }
            if (!response.ok)
                throw new Error('Adressdienst nicht verfügbar.');
            const address = formatGeocodeAddress(await response.json());
            // Im Cache stehen weder Mitarbeiter-/Mandantenkennung noch rohe GPS-Koordinaten.
            await cachedRef.set({ address, expiresAt: new Date(Date.now() + CACHE_MS) });
            return { address };
        }
        catch {
            throw new ManageError(503, 'Die Adresse konnte nicht ermittelt werden. Der GPS-Punkt bleibt verfügbar.');
        }
        finally {
            await db.runTransaction(async (tx) => {
                const lock = await tx.get(lockRef);
                if (lock.data()?.owner === owner)
                    tx.set(lockRef, { owner: null, availableAt: Date.now() + cooldown });
            });
        }
    }
    throw new ManageError(503, 'Die Adresssuche ist ausgelastet. Bitte später erneut versuchen.');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt.' })
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : ''
  if (!token) return res.status(401).json({ error: 'Anmeldung erforderlich.' })
  try {
    if (!getApps().length) initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') }) })
    try { await getAuth().verifyIdToken(token) }
    catch { return res.status(401).json({ error: 'Anmeldung ungültig.' }) }
    return res.status(200).json(await geocode(getApps()[0], req.body))
  } catch (error) {
    return res.status(error instanceof ManageError ? error.status : 503).json({ error: error instanceof ManageError ? error.message : 'Die Adresse konnte nicht ermittelt werden. Der GPS-Punkt bleibt verfügbar.' })
  }
}
