# Integration mit dem Rechnungsprogramm

Das Rechnungsprogramm (separates Projekt/Repo) bindet sich an diese
Zeiterfassungsapp an, um aus angenommenen Angeboten automatisch Projekte
anzulegen und nach der Archivierung einen Rechnungsentwurf mit den echten
Verbräuchen zu erstellen.

> **Wichtig für den Live-Betrieb:** Diese App benötigt dafür **keine
> Code-Änderung**. Sie unterstützt die nötige Struktur (`projects.offerPositions`)
> bereits – dieselbe, die für die HERO-Anbindung gebaut wurde. Dieses Dokument
> beschreibt nur den Vertrag, damit beide Seiten dokumentiert sind.

## Was das Rechnungsprogramm schreibt

Beim Setzen eines Angebots auf „Angenommen" legt das Rechnungsprogramm ein
Dokument in der Collection `projects` an – client-seitig, **anonym angemeldet**
(wie diese App selbst). Felder:

| Feld | Bedeutung |
|------|-----------|
| `name` | `<Angebotsnummer> – <Kundenname>` |
| `customerName` | Kundenname (denormalisiert) |
| `status` | `active` |
| `isActive` | `true` |
| `offerPositions[]` | Soll-Positionen; `kind: 'material'` wird Mitarbeitern beim Ausstempeln als wählbares Material angezeigt (Restmenge = Soll − Verbrauch), `kind: 'labor'` bleibt der Nachkalkulation vorbehalten |
| `offerMeta` | `{ nr, date, value, positionCount, materialCount, importedAt }` |
| `invoiceOfferId` | Rück-Verknüpfung auf das Angebot im Rechnungsprogramm |
| `invoiceOfferNumber` | Angebotsnummer |
| `syncSource` | `'rechnungsprogramm'` |

Das Projekt erscheint danach wie ein normales Projekt in den aktiven Projekten;
`ClockOutForm` zeigt die Angebots-Materialien automatisch an.

## Was das Rechnungsprogramm liest

Nach dem **Archivieren** des Projekts (Status `archived`) liest das
Rechnungsprogramm:

- `timeEntries` (where `projectId ==` Projekt) → gebuchte Arbeitszeit +
  `materialUsages` / `materialCreditUsages`
- `materialCredits` (where `projectId ==` Projekt) → separate Gutschriften /
  Nachträge

Daraus entsteht der Rechnungsentwurf. Diese App wird dabei nur gelesen.

## Voraussetzung im Firebase-Projekt

- **Anonyme Anmeldung** aktiv (Authentication → Sign-in method → Anonymous) –
  bereits der Fall, da die App sie selbst nutzt.
- Firestore-Regeln: Zugriff für angemeldete Clients (`request.auth != null`) –
  bereits gegeben.

## Deaktivierung

Die Integration wird ausschließlich **im Rechnungsprogramm** über
`VITE_ZEITERFASSUNG_SYNC_ENABLED` geschaltet. Diese App muss dafür nicht
angefasst oder neu deployt werden.
