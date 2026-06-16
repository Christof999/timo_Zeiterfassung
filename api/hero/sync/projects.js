const { initFirebaseAdmin } = require('../../../lib/hero/firebaseAdmin')
const { authorizeRequest } = require('../../../lib/hero/auth')
const { assertHeroConfigured } = require('../../../lib/hero/heroConfig')
const {
  syncHeroProjectsToFirestore,
  syncHeroMaterialsToFirestore
} = require('../../../lib/hero/syncProjects')
const { writeHeroSyncLog, updateHeroIntegrationConfig } = require('../../../lib/hero/syncLog')

function getRequestAction(req) {
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = null
    }
  }
  return body && typeof body === 'object' ? body.action : undefined
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
    // action 'materials' importiert HERO-Artikel, sonst Projekte + Kunden.
    if (getRequestAction(req) === 'materials') {
      const materialStats = await syncHeroMaterialsToFirestore()
      return res.status(200).json({ success: true, materialStats })
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

    const isMaterials = getRequestAction(req) === 'materials'
    console.error(`HERO ${isMaterials ? 'Artikel' : 'Projekt'}-Sync Fehler:`, error)

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
