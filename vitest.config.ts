import { defineConfig } from 'vitest/config'

// Unit-Tests für die reine Berechnungslogik (Zeitrundung, Rückfahrt, Feiertage, …).
// Kein DOM nötig — die Firestore-gebundenen Services werden hier nicht getestet.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
