# Lauffer Zeiterfassung - React Version

Moderne React-Version der Zeiterfassungs-App, optimiert für mobile Geräte.

## Technologie-Stack

- **React 19** mit TypeScript
- **Vite** als Build-Tool
- **React Router** für Navigation
- **Firebase** (Firestore, Storage, Auth)
- **Mobile-First Design** mit responsivem CSS

## Installation

```bash
npm install
```

## Entwicklung

```bash
npm run dev
```

Die App läuft dann auf `http://localhost:3000`

## Build für Produktion

```bash
npm run build
```

Die gebauten Dateien befinden sich im `dist` Ordner.

## Features

- ✅ Login/Authentifizierung
- ✅ Einstempeln/Ausstempeln mit Projektauswahl
- ✅ Live-Dokumentation während der Arbeitszeit
- ✅ Erweiterte Dokumentation beim Ausstempeln (Fotos, Notizen)
- ✅ Fahrzeugbuchungen
- ✅ Automatische Pausenberechnung nach deutschem Arbeitszeitgesetz
- ✅ Standortverfolgung
- ✅ Mobile-optimiertes Design
- ✅ Toast-Notifications statt Alerts

## Projektstruktur

```
src/
├── components/          # React-Komponenten
│   ├── Login.tsx
│   ├── TimeTracking.tsx
│   ├── ClockInForm.tsx
│   ├── ClockOutForm.tsx
│   ├── ExtendedClockOutModal.tsx
│   ├── LiveDocumentationModal.tsx
│   ├── VehicleBookingModal.tsx
│   ├── PhotoUpload.tsx
│   ├── NavigationMenu.tsx
│   ├── RecentActivities.tsx
│   └── VacationRequests.tsx
├── services/           # Firebase-Services
│   ├── firebaseConfig.ts
│   └── dataService.ts
├── types/              # TypeScript-Typen
│   └── index.ts
└── styles/             # CSS-Dateien
    ├── index.css
    └── ...
```

## Mobile-Optimierungen

- Touch-Targets mindestens 44x44px
- Safe Area Support für iOS (Notch, Dynamic Island)
- Responsive Typografie mit `clamp()`
- Bottom-Sheet Modals auf Mobile
- Smooth Animations und Transitions
- Toast-Notifications statt blockierender Alerts

## Deployment

1. Build erstellen: `npm run build`
2. `dist` Ordner auf den Server hochladen
3. Server konfigurieren, um `index.html` aus dem `dist` Ordner zu servieren

## Hinweise

- Die Firebase-Konfiguration ist identisch zur ursprünglichen Version
- Alle Daten werden in der gleichen Firebase-Datenbank gespeichert
- Die App ist vollständig kompatibel mit den bestehenden Datenstrukturen

