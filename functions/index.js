'use strict'

/**
 * Cloud Functions für die sichere, admin-verwaltete Benutzerverwaltung.
 *
 * Hintergrund: Der Firebase-Client (auch der Admin-Browser) darf das Passwort
 * eines ANDEREN Nutzers nicht setzen/zurücksetzen – das geht nur serverseitig
 * mit dem Admin SDK. Diese Functions sind dieser vertrauenswürdige Server.
 *
 * Login bleibt „Username + Passwort": Der Username wird intern auf eine
 * synthetische E-Mail abgebildet (siehe usernameToEmail). Echte Postfächer
 * sind nicht nötig.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

initializeApp()
const auth = getAuth()
const db = getFirestore()

// Einmal-Secret, um die Migration ohne bereits existierenden Admin auszulösen.
// Setzen via:  firebase functions:secrets:set SETUP_SECRET
const SETUP_SECRET = defineSecret('SETUP_SECRET')

/**
 * Interne Domain für die synthetische Login-E-Mail. MUSS exakt mit
 * src/utils/authIdentity.ts im Frontend übereinstimmen.
 */
const AUTH_EMAIL_DOMAIN = 'mitarbeiter.zeiterfassung-intern.de'

function usernameToEmail(username) {
  const normalized = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'Username fehlt oder ist ungültig.')
  }
  return `${normalized}@${AUTH_EMAIL_DOMAIN}`
}

function assertAdmin(request) {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Nur Administratoren dürfen das.')
  }
}

/** Mitarbeiter anlegen: Auth-Nutzer + Firestore-Dokument (Doc-ID = uid). */
exports.adminCreateEmployee = onCall(async (request) => {
  assertAdmin(request)
  const { username, password, profile = {}, isAdmin = false } = request.data || {}
  if (!username || !password) {
    throw new HttpsError('invalid-argument', 'username und password sind erforderlich.')
  }
  if (String(password).length < 6) {
    throw new HttpsError('invalid-argument', 'Passwort muss mindestens 6 Zeichen haben.')
  }

  const email = usernameToEmail(username)
  let user
  try {
    user = await auth.createUser({ email, password: String(password), displayName: profile.name })
  } catch (err) {
    if (err && err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Dieser Username ist bereits vergeben.')
    }
    throw new HttpsError('internal', 'Konnte Auth-Nutzer nicht anlegen: ' + (err && err.message))
  }

  if (isAdmin === true) {
    await auth.setCustomUserClaims(user.uid, { admin: true })
  }

  // Passwort wird NICHT in Firestore gespeichert – es liegt sicher bei Firebase Auth.
  const { password: _ignore, ...safeProfile } = profile
  await db
    .collection('employees')
    .doc(user.uid)
    .set(
      {
        ...safeProfile,
        username,
        isAdmin: isAdmin === true,
        status: safeProfile.status || 'active',
        createdAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    )

  return { uid: user.uid }
})

/** Passwort eines Mitarbeiters setzen/zurücksetzen. */
exports.adminSetPassword = onCall(async (request) => {
  assertAdmin(request)
  const { uid, newPassword } = request.data || {}
  if (!uid || !newPassword) {
    throw new HttpsError('invalid-argument', 'uid und newPassword sind erforderlich.')
  }
  if (String(newPassword).length < 6) {
    throw new HttpsError('invalid-argument', 'Passwort muss mindestens 6 Zeichen haben.')
  }
  await auth.updateUser(uid, { password: String(newPassword) })
  return { ok: true }
})

/** Admin-Rolle eines Mitarbeiters setzen/entfernen (Custom Claim + Firestore). */
exports.adminSetRole = onCall(async (request) => {
  assertAdmin(request)
  const { uid, isAdmin } = request.data || {}
  if (!uid) throw new HttpsError('invalid-argument', 'uid ist erforderlich.')
  await auth.setCustomUserClaims(uid, { admin: isAdmin === true })
  await db.collection('employees').doc(uid).set({ isAdmin: isAdmin === true }, { merge: true })
  return { ok: true }
})

/**
 * EINMALIGE Migration: legt für alle bestehenden Mitarbeiter (mit username +
 * password) einen Firebase-Auth-Nutzer an – mit uid = bisherige Dokument-ID,
 * damit alle Verweise (timeEntries.employeeId etc.) unverändert gültig bleiben.
 * Admin-Mitarbeiter erhalten den admin-Claim.
 *
 * Geschützt per Setup-Secret, damit sie auch ohne bereits existierenden Admin
 * ausgelöst werden kann (Bootstrap). Nach erfolgreicher Migration neu deployen
 * ODER diese Function wieder entfernen.
 */
exports.migrateExistingEmployees = onCall({ secrets: [SETUP_SECRET] }, async (request) => {
  const provided = request.data && request.data.secret
  if (!SETUP_SECRET.value() || provided !== SETUP_SECRET.value()) {
    throw new HttpsError('permission-denied', 'Falsches oder fehlendes Setup-Secret.')
  }

  // Optionales temporäres Passwort für Mitarbeiter, deren bisheriges Passwort
  // kürzer als 6 Zeichen ist (Firebase-Mindestlänge). Diese müssen anschließend
  // ein richtiges Passwort gesetzt bekommen.
  const defaultPassword = request.data && request.data.defaultPassword
  const hasValidDefault = typeof defaultPassword === 'string' && defaultPassword.length >= 6

  const snapshot = await db.collection('employees').get()
  let created = 0
  let skipped = 0
  let failed = 0
  const tempUsers = []

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() || {}
    const uid = docSnap.id
    if (!data.username || !data.password) {
      skipped += 1
      continue
    }
    try {
      // Existiert der Auth-Nutzer schon? Dann überspringen.
      try {
        await auth.getUser(uid)
        skipped += 1
        continue
      } catch (_) {
        // nicht vorhanden -> anlegen
      }

      // Passwort bestimmen: altes übernehmen, falls lang genug; sonst Temp-Passwort.
      let password = String(data.password)
      let usedTemp = false
      if (password.length < 6) {
        if (!hasValidDefault) {
          console.error('Migration: Passwort zu kurz und kein gültiges defaultPassword für', uid)
          failed += 1
          continue
        }
        password = String(defaultPassword)
        usedTemp = true
      }

      await auth.createUser({
        uid,
        email: usernameToEmail(data.username),
        password,
        displayName: data.name
      })
      if (data.isAdmin === true) {
        await auth.setCustomUserClaims(uid, { admin: true })
      }
      if (usedTemp) {
        tempUsers.push(data.username)
      }
      created += 1
    } catch (err) {
      console.error('Migration fehlgeschlagen für', uid, err)
      failed += 1
    }
  }

  return { created, skipped, failed, tempUsers }
})
