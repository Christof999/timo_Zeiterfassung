const { getFirestore } = require('firebase-admin/firestore')

async function writeHeroSyncLog(entry) {
  const db = getFirestore()
  const doc = {
    type: entry.type,
    success: !!entry.success,
    message: entry.message || null,
    stats: entry.stats || null,
    error: entry.error || null,
    createdAt: new Date()
  }
  const ref = await db.collection('heroSyncLogs').add(doc)
  return ref.id
}

async function updateHeroIntegrationConfig(patch) {
  const db = getFirestore()
  await db.collection('integrations').doc('hero').set(
    {
      ...patch,
      updatedAt: new Date()
    },
    { merge: true }
  )
}

module.exports = {
  writeHeroSyncLog,
  updateHeroIntegrationConfig
}
