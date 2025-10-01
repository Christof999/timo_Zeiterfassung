/**
 * Zeiterfassung - Zeiteintrag-Report Funktionen
 * Diese Datei enthält alle Funktionen für die Anzeige von Zeiteintrags-Berichten in einem Modal
 */

// Globale Variablen für das Caching und die Zuordnung von Zeiteinträgen
const timeEntryCache = {};
let currentProjectId = null;
// Set zur Nachverfolgung bereits verarbeiteter Zeilen
const processedRows = new Set();
// Für Re-Inject von außerhalb zugreifbar machen
window.processedRows = processedRows;


// Hilfsfunktion für Formatierung von Standortdaten
function formatLocationInfo(location) {
    if (!location) {
        return 'Nicht verfügbar';
    }
    
    let formattedLocation = '';
    
    // Fall 1: Location ist ein String (alte Daten oder einfache Adresse)
    if (typeof location === 'string') {
        if (location.trim()) {
            formattedLocation = `<span>${location}</span>`;
            // Versuch zu erkennen, ob es Koordinaten sind
            if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(location.trim())) {
                const [lat, lng] = location.split(',').map(c => parseFloat(c.trim()));
                formattedLocation += ` <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" class="location-link"><i class="fas fa-map-marker-alt"></i> Auf Karte zeigen</a>`;
            }
        } else {
            return 'Nicht verfügbar';
        }
    }
    // Fall 2: Location ist ein Objekt mit lat/lng oder latitude/longitude
    else if (typeof location === 'object') {
        console.log('Standort-Objekt:', location);
        let lat = null;
        let lng = null;
        
        // Verschiedene Formate versuchen
        if (location.lat !== undefined && location.lng !== undefined) {
            lat = location.lat;
            lng = location.lng;
        } else if (location.latitude !== undefined && location.longitude !== undefined) {
            lat = location.latitude;
            lng = location.longitude;
        } else if (location._lat !== undefined && location._long !== undefined) {
            lat = location._lat;
            lng = location._long;
        } else if (location.coordinates && Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
            lat = location.coordinates[0];
            lng = location.coordinates[1];
        }
        
        if (lat !== null && lng !== null) {
            formattedLocation = `<span>Lat: ${lat}, Lng: ${lng}</span> `;
            formattedLocation += `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" class="location-link"><i class="fas fa-map-marker-alt"></i> Auf Karte zeigen</a>`;
        } else {
            formattedLocation = 'Format nicht erkannt';
        }
    } else {
        formattedLocation = 'Format nicht erkannt';
    }
    
    return formattedLocation;
}

// Fügt Bericht-Buttons zu den Tabellen-Zeilen hinzufügen
async function injectReportButtons(projectId) {
    // Sofortige Prüfung auf employee-mode CSS-Klasse
    if (document.body.classList.contains('employee-mode')) {
        console.log('⛔ Employee-Mode erkannt - keine Bericht-Buttons für normale Mitarbeiter');
        return;
    }
    
    // Admin-Prüfung: Nur Administratoren dürfen Berichts-Buttons sehen
    const isAdmin = await DataService.isAdmin();
    console.log('🔐 DataService.isAdmin() Ergebnis:', isAdmin);
    
    if (!isAdmin) {
        console.log('Berichts-Buttons werden für normale Mitarbeiter ausgeblendet');
        // Setze employee-mode falls noch nicht gesetzt
        document.body.classList.add('employee-mode');
        return;
    }

    // Fallback: falls keine projectId übergeben wurde, versuche global / URL
    if (!projectId) {
        projectId = currentProjectId || new URLSearchParams(window.location.search).get('id');
    }
    if (!projectId) {
        console.error('Keine Projekt-ID für Zeiteinträge vorhanden.');
        return;
    }
    
    console.log('injectReportButtons aufgerufen für Projekt:', projectId);
    currentProjectId = projectId;
    window.currentProjectId = currentProjectId; // global verfügbar
    
    // Tabelle finden
    const timeTable = document.querySelector('table.time-entries');
    if (!timeTable) {
        console.log('Zeiteinträge-Tabelle noch nicht verfügbar.');
        return;
    }
    
    // Direkt alle Zeiteinträge für die Tabelle vom DataService laden
    console.log('Lade Zeiteinträge für Projekt:', projectId);
    
    // Wir versuchen eine Direktzuordnung ohne komplexes Mapping
    DataService.getProjectTimeEntries(projectId).then(allTimeEntries => {
        // Cache alle Zeiteinträge nach ID für späteren Zugriff
        allTimeEntries.forEach(entry => {
            timeEntryCache[entry.id] = entry;
        });
        
        console.log(`${allTimeEntries.length} Zeiteinträge vom DataService geladen`);
        
        // Tabellen-Zeilen identifizieren
        const rows = timeTable.querySelectorAll('tbody tr:not(.no-data)');
        console.log(`${rows.length} Tabellenzeilen gefunden`);
        
        // Debug-Log für die ersten paar Zeilen
        Array.from(rows).slice(0, 5).forEach((row, idx) => {
            const firstCell = row.querySelector('td');
            const cellText = firstCell ? firstCell.textContent.trim().substring(0, 30) : 'Keine Zelle';
            console.log(`Zeile ${idx}: ${cellText}...`);
        });
        
        let updatedRows = 0;
        
        // Direktzuordnung der IDs zu jeder Zeile, ohne komplizierte Logik
        rows.forEach((row, rowIndex) => {
            // Eindeutige ID für die Zeile generieren
            const rowId = `time-entry-row-${rowIndex}`;
            row.id = rowId;
            
            // Verarbeite nur neue Zeilen ohne bereits vorhandenen Button
            if (processedRows.has(rowId)) {
                return;
            }
            
            const cells = row.querySelectorAll('td');
            if (cells.length <= 2 || cells[0].getAttribute('colspan')) {
                processedRows.add(rowId);
                return;
            }
            
            // ID aus Edit-Button extrahieren (robuster als Index-Mapping)
            const editBtn = row.querySelector('.edit-entry-btn');
            let entryId = null;
            if (editBtn) {
                entryId = editBtn.getAttribute('data-entry-id');
                console.log(`ID aus Edit-Button extrahiert: ${entryId} für Zeile ${rowIndex}`);
            }
            
            // Fallback: Index-Mapping wenn Edit-Button keine ID hat
            if (!entryId && rowIndex < allTimeEntries.length) {
                entryId = allTimeEntries[rowIndex].id;
                console.log(`Fallback Index-Mapping: Zeiteintrag[${rowIndex}].id = ${entryId}`);
            }
            
            // Wenn keine ID gefunden wurde, überspringe diese Zeile
            if (!entryId) {
                console.warn(`Keine Zeiteintrag-ID für Zeile ${rowIndex} (${rowId}) gefunden.`);
                processedRows.add(rowId);
                return;
            }
            
            // Sicherstellen, dass Row die ID auch als Attribut hat
            row.setAttribute('data-entry-id', entryId);
            
            // Neue Tabellenstruktur: Bearbeitung (erste Spalte) enthält Edit-Button
            let actionsCell = row.querySelector('td .edit-entry-btn')?.parentElement || cells[0];
            if (!actionsCell) {
                console.warn('Keine Aktionszelle gefunden für Zeile', rowIndex);
                processedRows.add(rowId);
                return;
            }
            
            // Korrekten Zeiteintrag über ID finden statt Index
            const timeEntry = allTimeEntries.find(entry => entry.id === entryId) || allTimeEntries[rowIndex];
            if (!timeEntry) {
                console.warn(`Zeiteintrag mit ID ${entryId} nicht in allTimeEntries gefunden`);
                processedRows.add(rowId);
                return;
            }
            
            console.log(`Füge Bericht-Button für Zeiteintrag hinzu: ${entryId} (Zeile ${rowIndex})`);
            
            // Bericht-Button erstellen mit eindeutiger Kennung und direktem Zugriff auf den Zeiteintrag
            const reportBtn = document.createElement('button');
            reportBtn.className = 'report-btn';
            reportBtn.innerHTML = '<i class="fas fa-file-alt"></i> Bericht';
            reportBtn.setAttribute('data-entry-id', entryId); 
            reportBtn.setAttribute('data-row-index', rowIndex);
            
            // Setze einen eindeutigen Button-ID, damit wir den Button identifizieren können
            const buttonId = `report-btn-${rowIndex}-${entryId}`;
            reportBtn.id = buttonId;
            
            // Event-Listener für Bericht-Button hinzufügen mit verbesserter Fehlerbehandlung
            reportBtn.addEventListener('click', function(event) {
                event.preventDefault(); // Verhindert Seitenneuladen
                event.stopPropagation(); // Verhindert Bubbling
                
                // Verwende die direkte ID aus dem Button-Attribut
                const clickedEntryId = this.getAttribute('data-entry-id'); 
                const clickedRowIndex = this.getAttribute('data-row-index');
                
                console.log(`=== REPORT BUTTON CLICKED ===`);
                console.log(`Button ID: ${this.id}`);
                console.log(`Zeile: ${clickedRowIndex}`);
                console.log(`Zeiteintrag-ID: ${clickedEntryId}`);
                
                // Verwende direkt den in diesem Event-Listener gespeicherten Zeiteintrag
                showTimeEntryReport(clickedEntryId, projectId);
                return false;
            });
            
            // Button einfügen ohne zusätzliche überzählige Spalte zu erzeugen
            const existingReportBtn = actionsCell.querySelector('.report-btn');
            if (existingReportBtn) {
                console.log('Report-Button bereits vorhanden in Zeile', rowIndex);
                processedRows.add(rowId);
                return;
            }
            const existingEditBtn = actionsCell.querySelector('.edit-entry-btn');
            // Container herstellen
            let container = actionsCell.querySelector('.action-btns');
            if (!container) {
                container = document.createElement('div');
                container.className = 'action-btns';
                container.style.display = 'flex';
                container.style.gap = '4px';
                container.style.alignItems = 'center';
                container.style.justifyContent = 'flex-start';
                // vorhandene Inhalte sichern
                if (existingEditBtn && existingEditBtn.parentElement === actionsCell) {
                    actionsCell.replaceChildren(container);
                    container.appendChild(existingEditBtn);
                } else if (existingEditBtn && existingEditBtn.parentElement !== actionsCell) {
                    container.appendChild(existingEditBtn);
                    actionsCell.innerHTML = '';
                    actionsCell.appendChild(container);
                } else {
                    // Inhalt leeren und Container setzen
                    actionsCell.innerHTML = '';
                    actionsCell.appendChild(container);
                }
            }
            // Report-Button vor dem Edit-Button platzieren
            if (existingEditBtn && existingEditBtn.previousSibling !== reportBtn) {
                container.insertBefore(reportBtn, existingEditBtn);
            } else if (!existingEditBtn) {
                container.appendChild(reportBtn);
            }
            processedRows.add(rowId);
            updatedRows++;
        });
        
        console.log(`${updatedRows} Bericht-Buttons hinzugefügt`);
        
        // Wenn keine Buttons hinzugefügt wurden und Zeilen vorhanden sind, erneut versuchen
        if (updatedRows === 0 && rows.length > 0) {
            console.log('Keine Bericht-Buttons hinzugefügt trotz vorhandener Zeilen - versuche erneuten Reset in 2s');
            // processedRows zurücksetzen damit erneuter Versuch nicht sofort abbricht
            setTimeout(async () => {
                processedRows.clear();
                await injectReportButtons(projectId);
            }, 2000);
        }
    }).catch(err => {
        console.error('Fehler beim Laden der Zeiteinträge:', err);
    });
}

// Modal-Funktionen initialisieren
function initReportModalListeners() {
    const modal = document.getElementById('time-entry-report-modal');
    if (!modal) {
        console.error('Modal-Element nicht gefunden!');
        return;
    }
    
    const closeBtn = modal.querySelector('.report-modal-close');
    if (closeBtn) {
        // Schließen des Modals bei Klick auf X
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('visible');
            document.body.classList.remove('modal-open');
        });
    }
    
    // Schließen des Modals bei Klick außerhalb
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('visible');
            document.body.classList.remove('modal-open');
        }
    });
}

// Hinweis: timeEntryCache ist bereits global definiert

// Zeiteintrag-Bericht im Modal anzeigen
function showTimeEntryReport(entryId, projectId) {
    console.log('\n\n==== ZEIGE BERICHT ====');
    console.log('Angeforderte Zeiteintrag-ID:', entryId);
    console.log('Projekt-ID:', projectId);
    
    // Überprüfe auf ungültige ID
    if (!entryId || entryId.trim() === '') {
        console.error('FEHLER: Ungültige Zeiteintrag-ID:', entryId);
        alert('Fehler: Keine gültige Zeiteintrag-ID vorhanden.');
        return;
    }
    
    // Alle Zeiteinträge im Cache prüfen und protokollieren
    console.log('Zeiteinträge im Cache:', Object.keys(timeEntryCache));
    
    // Prüfe zuerst, ob der Eintrag im Cache ist
    if (timeEntryCache[entryId]) {
        console.log('Verwende Cache für Zeiteintrag:', entryId);
        renderTimeEntryReport(timeEntryCache[entryId], projectId);
        return;
    }
    
    // Zeiteinträge durchsuchen mit robuster ID-Behandlung
    console.log('Lade Zeiteintrag vom DataService:', entryId);
    DataService.getTimeEntryById(entryId)
        .then(entry => {
            if (!entry) {
                console.error('FEHLER: Zeiteintrag nicht gefunden. ID:', entryId);
                alert(`Zeiteintrag mit ID ${entryId} konnte nicht gefunden werden.`);
                return;
            }
            
            console.log('Zeiteintragsdaten erfolgreich geladen:', entry);
            
            // Eintrag im Cache speichern
            timeEntryCache[entryId] = entry;
            
            // Debugging der Standortdaten
            console.log('Clock-In-Standort:', entry.clockInLocation);
            console.log('Clock-Out-Standort:', entry.clockOutLocation);
            
            // Rendering an separate Funktion delegieren
            renderTimeEntryReport(entry, projectId);
        })
        .catch(error => {
            console.error('FEHLER beim Laden des Zeiteintrags:', error);
            alert(`Fehler beim Laden des Zeiteintrags: ${error.message}`);
        });
}

// Separate Funktion für das Rendering des Reports
async function renderTimeEntryReport(entry, projectId) {
    try {
        console.log('Rendere Zeiteintragsbericht für:', entry.id);
        
        // Modal-Elemente finden
        const modal = document.getElementById('time-entry-report-modal');
        const contentContainer = document.getElementById('time-entry-report-content');
        
        if (!modal || !contentContainer) {
            console.error('Modal-Elemente nicht gefunden!');
            alert('Fehler: Modal-Elemente nicht gefunden.');
            return;
        }
        
        // Mitarbeiter- und Projektdaten parallel laden für bessere Performance
        const [employeeDoc, projectDoc] = await Promise.all([
            DataService.employeesCollection.doc(entry.employeeId).get(),
            DataService.projectsCollection.doc(projectId).get()
        ]);
        
        const employee = employeeDoc.exists ? employeeDoc.data() : { name: 'Unbekannt' };
        const project = projectDoc.exists ? projectDoc.data() : { name: 'Unbekannt' };
        
        console.log('Daten geladen:', { employee, project });
        
        // Zeiten formatieren
        const clockInDate = entry.clockInTime ? 
            (entry.clockInTime.seconds ? new Date(entry.clockInTime.seconds * 1000) : new Date(entry.clockInTime)) : null;
            
        const clockOutDate = entry.clockOutTime ? 
            (entry.clockOutTime.seconds ? new Date(entry.clockOutTime.seconds * 1000) : new Date(entry.clockOutTime)) : null;
        
        console.log('Zeiten:', { clockInDate, clockOutDate });
        
        // Arbeitszeit berechnen
        let workHours = '-';
        let pauseTime = '-';
        
        if (clockInDate && clockOutDate) {
            // Gesamtzeit in Millisekunden
            const totalTime = clockOutDate - clockInDate;
            
            // Pause berechnen, falls vorhanden
            let pauseMinutes = 0;
            if (entry.pauseTime !== undefined && entry.pauseTime !== null) {
                if (typeof entry.pauseTime === 'number') {
                    pauseMinutes = entry.pauseTime;
                } else if (typeof entry.pauseTime === 'string') {
                    pauseMinutes = parseInt(entry.pauseTime, 10) || 0;
                }
            }
            
            // Effektive Arbeitszeit (abzüglich Pause)
            const effectiveTimeMs = totalTime - (pauseMinutes * 60 * 1000);
            
            // Stunden und Minuten berechnen
            const hours = Math.floor(effectiveTimeMs / (1000 * 60 * 60));
            const minutes = Math.floor((effectiveTimeMs % (1000 * 60 * 60)) / (1000 * 60));
            
            // Formatierte Arbeitszeit
            workHours = `${hours}h ${minutes}min`;
            console.log(`Arbeitszeit: ${workHours} (${effectiveTimeMs}ms)`);
            
            // Pausenzeit formatieren, falls vorhanden
            if (pauseMinutes > 0) {
                pauseTime = `${Math.floor(pauseMinutes / 60)}h ${pauseMinutes % 60}min`;
                console.log(`Pausenzeit: ${pauseTime} (${pauseMinutes} min)`);
            } else {
                pauseTime = '0min';
            }
        }
        
        // Inhalte vorbereiten
        let htmlContent = `
            <div class="report">
                <div class="report-header">
                    <h2>Zeiteintrag-Bericht</h2>
                </div>
                
                <div class="report-section">
                    <h3>Projektinformationen</h3>
                    <div class="report-detail">
                        <span class="report-label">Projekt:</span>
                        <span class="report-value">${project.name || 'Unbekannt'}</span>
                    </div>
                    <div class="report-detail">
                        <span class="report-label">Kunde:</span>
                        <span class="report-value">${project.customer || 'Unbekannt'}</span>
                    </div>
                </div>
                
                <div class="report-section">
                    <h3>Mitarbeiter</h3>
                    <div class="report-detail">
                        <span class="report-label">Name:</span>
                        <span class="report-value">${employee.name || 'Unbekannt'}</span>
                    </div>
                </div>
                
                <div class="report-section">
                    <h3>Zeiterfassung</h3>
                    <div class="report-detail">
                        <span class="report-label">Datum:</span>
                        <span class="report-value">${clockInDate ? clockInDate.toLocaleDateString('de-DE') : '-'}</span>
                    </div>
                    <div class="report-detail">
                        <span class="report-label">Einstempelzeit:</span>
                        <span class="report-value">${clockInDate ? clockInDate.toLocaleTimeString('de-DE') : '-'}</span>
                    </div>
                    <div class="report-detail">
                        <span class="report-label">Einstempel-Standort:</span>
                        <span class="report-value">${formatLocationInfo(entry.clockInLocation)}</span>
                    </div>
                    <div class="report-detail">
                        <span class="report-label">Ausstempelzeit:</span>
                        <span class="report-value">${clockOutDate ? clockOutDate.toLocaleTimeString('de-DE') : '-'}</span>
                    </div>
                    <div class="report-detail">
                        <span class="report-label">Ausstempel-Standort:</span>
                        <span class="report-value">${formatLocationInfo(entry.clockOutLocation)}</span>
                    </div>
                    <div class="report-detail">
                        <span class="report-label">Arbeitszeit:</span>
                        <span class="report-value">${workHours}</span>
                    </div>
                </div>
                
                <div class="report-section">
                    <h3>Notizen</h3>
                    <div class="report-detail">
                        <span class="report-value">${entry.notes || 'Keine Notizen vorhanden'}</span>
                    </div>
                </div>
            </div>
        `;
        
        // Bilder laden, falls vorhanden
        if (entry.images && entry.images.length > 0) {
            htmlContent += `
                <div class="report-section">
                    <h3>Fotos</h3>
                    <div class="report-gallery">
            `;
            
            for (const imageUrl of entry.images) {
                htmlContent += `
                    <div class="report-image-container">
                        <img src="${imageUrl}" alt="Zeiteintragsbild" class="report-image">
                    </div>
                `;
            }
            
            htmlContent += `
                    </div>
                </div>
            `;
        }
        
        // Lieferschein-Informationen, falls vorhanden
        if (entry.deliveryNotes && entry.deliveryNotes.length > 0) {
            htmlContent += `
                <div class="report-section">
                    <h3>Lieferscheine</h3>
            `;
            
            entry.deliveryNotes.forEach(note => {
                htmlContent += `
                    <div class="report-detail">
                        <span class="report-label">Lieferschein:</span>
                        <span class="report-value">${note.number || '-'}</span>
                    </div>
                    <div class="report-detail">
                        <span class="report-label">Beschreibung:</span>
                        <span class="report-value">${note.description || '-'}</span>
                    </div>
                `;
            });
            
            htmlContent += `</div>`;
        }
        
        // Modal-Inhalt aktualisieren und anzeigen
        console.log('Report HTML-Content wird eingefügt:', htmlContent.substring(0, 500) + '...');
        console.log('Edit-Button im HTML vorhanden:', htmlContent.includes('edit-time-entry-btn'));
        
        contentContainer.innerHTML = htmlContent;

        // Bearbeiten-Button wurde entfernt (auf Wunsch)
        // Der Bericht zeigt nur noch Informationen an, keine Bearbeitungsoption mehr
        modal.classList.add('visible');
        document.body.classList.add('modal-open');
        
        // Nach dem Einfügen prüfen, ob der Edit-Button sichtbar ist
        setTimeout(() => {
            const editBtn = contentContainer.querySelector('.edit-time-entry-btn');
            if (editBtn) {
                console.log('✅ Edit-Button im DOM gefunden:', editBtn);
                console.log('Edit-Button CSS:', window.getComputedStyle(editBtn));
            } else {
                console.error('❌ Edit-Button nicht im DOM gefunden!');
            }
        }, 100);
        
    } catch (error) {
        console.error('Fehler beim Rendering des Zeiteintragsberichts:', error);
        alert(`Fehler beim Anzeigen des Berichts: ${error.message}`);
    }
}

// Robuste Funktion zum Warten auf die Tabelle und Einfügen der Buttons
async function waitForTimeEntriesTableAndInjectButtons(projectId, maxAttempts = 10, currentAttempt = 0, interval = 1000) {
    // Tabelle suchen mit korrekten Selektoren basierend auf der Tabellenstruktur in project-simple.html
    const timeTable = document.querySelector('#time-entries-table') || 
                     document.querySelector('table#time-entries-table') || 
                     document.querySelector('table tbody#time-entries-body')?.closest('table') ||
                     document.querySelector('table');
    
    if (timeTable) {
        console.log('✅ Zeiteinträge-Tabelle gefunden, füge Buttons hinzu...');
        await injectReportButtons(projectId);
        return true;
    } else {
        if (currentAttempt < maxAttempts) {
            console.log(`⏳ Zeiteinträge-Tabelle noch nicht geladen (Versuch ${currentAttempt + 1}/${maxAttempts}), warte...`);
            setTimeout(() => waitForTimeEntriesTableAndInjectButtons(projectId, maxAttempts, currentAttempt + 1, interval), interval);
        } else {
            console.warn(`❌ Zeiteinträge-Tabelle nach ${maxAttempts} Versuchen nicht gefunden!`);
        }
        return false;
    }
}

// Initialisierungsfunktion mit verbesserten Sicherheits- und Timing-Checks
function initTimeEntryReportSystem() {
    console.log('⚙️ time-entry-report.js Initialisierung gestartet');
    
    // Modal-Event-Listener initialisieren
    initReportModalListeners();
    
    // Projekt-ID aus der URL extrahieren
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('id');
    
    if (!projectId) {
        console.warn('⚠️ Keine Projekt-ID in der URL gefunden!');
        return;
    }
    
    console.log('🆔 Projekt-ID aus URL extrahiert:', projectId);

    // Warten auf vollständiges Laden der Seite und Daten
    waitForTimeEntriesTableAndInjectButtons(projectId);
}

// Verschiedene Event-Listener für robusteren Start
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 time-entry-report.js wurde geladen (DOMContentLoaded)');
    
    // Kurze Verzögerung für sicherere DOM-Verfügbarkeit
    setTimeout(initTimeEntryReportSystem, 500);
});

// Fallback: Window load kann später als DOMContentLoaded sein, aber zuverlässiger
window.addEventListener('load', function() {
    console.log('🔄 time-entry-report.js Window-Load Event');
    
    // Starten mit etwas längerer Verzögerung, falls noch nicht gestartet
    setTimeout(initTimeEntryReportSystem, 1000);
});

// Extra Absicherung für komplexe Seiten mit Ajax-Inhalten
setTimeout(function checkLateInit() {
    console.log('🔍 time-entry-report.js prüft auf spätes Tabellen-Rendering');
    
    const timeTable = document.querySelector('table.time-entries');
    if (timeTable && !timeTable.querySelector('.report-button')) {
        console.log('🔄 Tabelle gefunden aber keine Buttons - füge nachträglich hinzu');
        
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('id');
        
        if (projectId) {
            injectReportButtons(projectId);
        }
    }
}, 5000); // Überprüfung nach 5 Sekunden
