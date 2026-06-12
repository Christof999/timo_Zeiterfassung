const { initFirebaseAdmin } = require('../lib/firebaseAdmin')
const { authorizeRequest } = require('../lib/auth')
const { assertHeroConfigured } = require('../lib/heroConfig')
const { syncHeroProjectsToFirestore } = require('../lib/syncProjects')
const { writeHeroSyncLog, updateHeroIntegrationConfig } = require('../lib/syncLog')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' })
  }

  try {
    initFirebaseAdmin()
    await authorizeRequest(req)
    assertHeroConfigured()

    const stats = await syncHeroProjectsToFirestore()

    return res.status(200).json({
      success: true,
      stats
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

    console.error('HERO Projekt-Sync Fehler:', error)

    try {
      initFirebaseAdmin()
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
    } catch (logError) {
      console.error('HERO Sync-Log Fehler:', logError)
    }

    return res.status(500).json({
      success: false,
      error: error?.message || 'Interner Serverfehler'
    })
  }
}
