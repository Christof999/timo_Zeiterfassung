const { initFirebaseAdmin } = require('../../../lib/hero/firebaseAdmin')
const { authorizeRequest } = require('../../../lib/hero/auth')
const { assertHeroConfigured } = require('../../../lib/hero/heroConfig')
const {
  syncHeroProjectsToFirestore,
  syncHeroMaterialsToFirestore,
  probeProjectOffers,
  syncProjectOfferToFirestore
} = require('../../../lib/hero/syncProjects')
const { writeHeroSyncLog, updateHeroIntegrationConfig } = require('../../../lib/hero/syncLog')

function getRequestBody(req) {
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = null
    }
  }
  return body && typeof body === 'object' ? body : {}
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' })
  }

  try {
    initFirebaseAdmin()
    await authorizeRequest(req)
    assertHeroConfigured()

    // Gemeinsamer Sync-Endpunkt (spart Serverless-Function-Slots auf dem Hobby-Plan):
    // action 'materials' importiert HERO-Artikel, 'offer-probe' liest ein echtes
    // Angebot zur Strukturanalyse, sonst Projekte + Kunden.
    const body = getRequestBody(req)
    if (body.action === 'materials') {
      const materialStats = await syncHeroMaterialsToFirestore()
      return res.status(200).json({ success: true, materialStats })
    }
    if (body.action === 'offer-probe') {
      if (body.projectMatchId == null || body.projectMatchId === '') {
        return res.status(400).json({ success: false, error: 'projectMatchId fehlt' })
      }
      const probe = await probeProjectOffers(body.projectMatchId)
      return res.status(200).json({ success: true, probe })
    }
    if (body.action === 'offer-sync') {
      if (body.projectMatchId == null || body.projectMatchId === '') {
        return res.status(400).json({ success: false, error: 'projectMatchId fehlt' })
      }
      const offerResult = await syncProjectOfferToFirestore(body.projectMatchId)
      return res.status(200).json({ success: true, offerResult })
    }

    const { stats, customerStats } = await syncHeroProjectsToFirestore()

    return res.status(200).json({
      success: true,
      stats,
      customerStats
    })
  } catch (error) {
    if (error?.message === 'Unauthorized') {
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }

    if (error?.code === 'HERO_SYNC_DISABLED') {
      return res.status(503).json({ success: false, error: error.message, code: error.code })
    }

    if (error?.code === 'HERO_API_KEY_MISSING') {
      return res.status(503).json({ success: false, error: error.message, code: error.code })
    }

    const requestAction = getRequestBody(req).action
    const isMaterials = requestAction === 'materials'
    const isProbe = requestAction === 'offer-probe'
    const isOfferSync = requestAction === 'offer-sync'
    console.error(
      `HERO ${isProbe ? 'Angebots-Probe' : isOfferSync ? 'Angebots-Import' : isMaterials ? 'Artikel' : 'Projekt'}-Fehler:`,
      error
    )

    // Angebots-Probe/-Import schreiben keine Projekt-Sync-Logs
    if (isProbe || isOfferSync) {
      return res.status(500).json({ success: false, error: error?.message || 'Interner Serverfehler' })
    }

    try {
      initFirebaseAdmin()
      if (isMaterials) {
        await writeHeroSyncLog({
          type: 'materials',
          success: false,
          message: 'Artikel-Import fehlgeschlagen',
          error: error?.message || 'Unbekannter Fehler'
        })
      } else {
        await updateHeroIntegrationConfig({
          lastProjectSyncError: error?.message || 'Unbekannter Fehler',
          lastProjectSyncAt: new Date()
        })
        await writeHeroSyncLog({
          type: 'projects',
          success: false,
          message: 'Projekt-Sync fehlgeschlagen',
          error: error?.message || 'Unbekannter Fehler'
        })
      }
    } catch (logError) {
      console.error('HERO Sync-Log Fehler:', logError)
    }

    return res.status(500).json({
      success: false,
      error: error?.message || 'Interner Serverfehler'
    })
  }
}
