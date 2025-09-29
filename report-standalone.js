/**
 * Eigenständige Berichtsanzeige ohne Abhängigkeiten zu anderen Dateien
 * Zeigt alle Daten direkt an, ohne komplexe Logik
 */

// Die ID der aktuell geladenen Zeiteintrags für Debug-Zwecke
let currentEntryId = null;

// Globale Funktion zum Öffnen des Berichts - direkt im Button aufgerufen
window.showReport = async function(entryId) {
    console.log('🔍 REPORT: Bericht-Funktion aufgerufen mit ID:', entryId);
    
    if (!entryId) {
        console.error('⚠️ REPORT: Keine ID übergeben');
        alert('Fehler: Keine gültige ID für den Zeiteintrag vorhanden.');
        return;
    }
    
    // ID für spätere Referenz speichern
    currentEntryId = entryId;
    
    try {
        // 1. Zeiteintrag direkt laden
        console.log('🔍 REPORT: Lade Zeiteintrag direkt aus Firestore...');
        const timeEntryDoc = await firebase.firestore()
            .collection('timeEntries')
            .doc(entryId)
            .get();
        
        // Prüfen, ob der Eintrag existiert
        if (!timeEntryDoc.exists) {
            console.error('⚠️ REPORT: Zeiteintrag nicht gefunden:', entryId);
            alert(`Zeiteintrag mit ID ${entryId} wurde nicht gefunden.`);
            return;
        }
        
        // Daten extrahieren und mit ID anreichern
        const timeEntry = {
            id: timeEntryDoc.id,
            ...timeEntryDoc.data()
        };
        
        console.log('✅ REPORT: Zeiteintrag geladen:', timeEntry);
        
        // 2. Zugehöriges Projekt laden
        let project = { name: timeEntry.isVacationDay ? 'Urlaub' : 'Unbekanntes Projekt', id: timeEntry.projectId || 'unknown' };
        
        if (timeEntry.projectId) {
            try {
                const projectDoc = await firebase.firestore()
                    .collection('projects')
                    .doc(timeEntry.projectId)
                    .get();
                
                if (projectDoc.exists) {
                    project = {
                        id: projectDoc.id,
                        ...projectDoc.data()
                    };
                    console.log('✅ REPORT: Projekt geladen:', project);
                } else {
                    console.warn('⚠️ REPORT: Projekt nicht gefunden:', timeEntry.projectId);
                }
            } catch (err) {
                console.error('⚠️ REPORT: Fehler beim Laden des Projekts:', err);
            }
        }
        
        // 3. Zugehörigen Mitarbeiter laden
        let employee = { name: 'Unbekannter Mitarbeiter', id: timeEntry.employeeId || 'unknown' };
        
        if (timeEntry.employeeId) {
            try {
                const employeeDoc = await firebase.firestore()
                    .collection('employees')
                    .doc(timeEntry.employeeId)
                    .get();
                
                if (employeeDoc.exists) {
                    employee = {
                        id: employeeDoc.id,
                        ...employeeDoc.data()
                    };
                    console.log('✅ REPORT: Mitarbeiter geladen:', employee);
                } else {
                    console.warn('⚠️ REPORT: Mitarbeiter nicht gefunden:', timeEntry.employeeId);
                }
            } catch (err) {
                console.error('⚠️ REPORT: Fehler beim Laden des Mitarbeiters:', err);
            }
        }
        
        // 4. Bericht anzeigen
        displayReport(timeEntry, project, employee);
        
    } catch (error) {
        console.error('⚠️ REPORT: Allgemeiner Fehler:', error);
        alert('Fehler beim Laden der Daten: ' + error.message);
    }
};

// Zeigt den Bericht in einem Modal an
function displayReport(timeEntry, project, employee) {
    console.log('🔍 REPORT: Zeige Bericht an für:', timeEntry.id);
    
    // Bestehendes Modal entfernen, falls vorhanden
    const existingModal = document.getElementById('standalone-report-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Neues Modal erstellen
    const modal = document.createElement('div');
    modal.id = 'standalone-report-modal';
    modal.className = 'modal';
    
    // Formatierte Daten vorbereiten
    const dateStr = formatDate(timeEntry.clockInTime);
    const clockInStr = formatTime(timeEntry.clockInTime);
    const clockOutStr = timeEntry.clockOutTime ? formatTime(timeEntry.clockOutTime) : 'Nicht ausgestempelt';
    
    // Berechnung der Arbeitsstunden
    let workHoursStr = 'Nicht berechenbar';
    let pauseTimeStr = '';
    
    if (timeEntry.clockOutTime) {
        try {
            const clockInDate = extractDate(timeEntry.clockInTime);
            const clockOutDate = extractDate(timeEntry.clockOutTime);
            const pauseMs = timeEntry.pauseTotalTime || 0;
            
            if (clockInDate && clockOutDate) {
                const totalMs = clockOutDate.getTime() - clockInDate.getTime();
                const workMs = totalMs - pauseMs;
                
                if (workMs > 0) {
                    const hours = workMs / (1000 * 60 * 60);
                    workHoursStr = hours.toFixed(2) + ' Stunden';
                    
                    if (pauseMs > 0) {
                        const pauseMin = Math.round(pauseMs / 60000);
                        pauseTimeStr = ` (inkl. ${pauseMin} Min. Pause)`;
                    }
                }
            }
        } catch (err) {
            console.error('⚠️ REPORT: Fehler bei der Stundenberechnung:', err);
        }
    }
    
    // Modal-Inhalt erstellen
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Zeiterfassungsbericht</h3>
                <button type="button" class="close-modal-btn">&times;</button>
            </div>
            <div class="modal-body">
                <!-- Basisdaten -->
                <div class="report-section">
                    <h4>Grundinformationen</h4>
                    <div class="info-grid">
                        <div class="info-item">
                            <strong>Projekt:</strong> ${project.name || project.id}
                        </div>
                        <div class="info-item">
                            <strong>Mitarbeiter:</strong> ${employee.name || employee.id}
                        </div>
                        <div class="info-item">
                            <strong>Datum:</strong> ${dateStr}
                        </div>
                        <div class="info-item">
                            <strong>Einstempelzeit:</strong> ${clockInStr}
                        </div>
                        <div class="info-item">
                            <strong>Ausstempelzeit:</strong> ${clockOutStr}
                        </div>
                        <div class="info-item">
                            <strong>Arbeitsstunden:</strong> ${workHoursStr}${pauseTimeStr}
                        </div>
                    </div>
                </div>
                
                <!-- Notizen -->
                <div class="report-section">
                    <h4>Notizen</h4>
                    <div class="notes-box">
                        ${timeEntry.notes ? timeEntry.notes : 'Keine Notizen vorhanden'}
                    </div>
                </div>
                
                <!-- Pausendetails -->
                <div class="report-section">
                    <h4>Pausendetails</h4>
                    <div id="pause-details"></div>
                </div>
                
                <!-- Bilder -->
                <div class="report-section">
                    <h4>Baustellenfotos</h4>
                    <div id="site-photos" class="photos-container"></div>
                </div>
                
                <div class="report-section">
                    <h4>Lieferscheine</h4>
                    <div id="delivery-notes" class="photos-container"></div>
                </div>
                
                <!-- Debug-Informationen -->
                <div class="report-section debug-section">
                    <h4>Debug-Informationen</h4>
                    <details>
                        <summary>Rohdaten anzeigen</summary>
                        <pre>${JSON.stringify({timeEntry, project, employee}, null, 2)}</pre>
                    </details>
                </div>
            </div>
        </div>
    `;
    
    // Modal zum DOM hinzufügen
    document.body.appendChild(modal);
    
    // Schließen-Button einrichten
    const closeBtn = modal.querySelector('.close-modal-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            modal.style.display = 'none';
        });
    }
    
    // Pausendetails anzeigen
    displayPauseDetails(timeEntry);
    
    // Bilder anzeigen
    displayImages(timeEntry);
    
    // Modal anzeigen
    modal.style.display = 'block';
    console.log('✅ REPORT: Bericht-Modal wurde angezeigt');
}

// Zeigt die Pausendetails an
function displayPauseDetails(timeEntry) {
    const pauseDetailsContainer = document.getElementById('pause-details');
    if (!pauseDetailsContainer) return;
    
    // Prüfen, ob Pausendetails vorhanden sind
    if (timeEntry.pauseDetails && Array.isArray(timeEntry.pauseDetails) && timeEntry.pauseDetails.length > 0) {
        let html = '<ul class="pause-list">';
        
        timeEntry.pauseDetails.forEach(pause => {
            try {
                const startDate = extractDate(pause.start);
                const endDate = extractDate(pause.end);
                
                if (startDate && endDate) {
                    const startTimeStr = formatTime(startDate);
                    const endTimeStr = formatTime(endDate);
                    const durationMin = Math.round((endDate - startDate) / 60000);
                    
                    html += `<li>Pause von ${startTimeStr} bis ${endTimeStr} (${durationMin} Minuten)</li>`;
                }
            } catch (err) {
                console.error('⚠️ REPORT: Fehler beim Verarbeiten einer Pause:', err);
            }
        });
        
        html += '</ul>';
        pauseDetailsContainer.innerHTML = html;
    } else {
        pauseDetailsContainer.innerHTML = '<p>Keine Pausen eingetragen</p>';
    }
}

// Zeigt alle Bilder an
function displayImages(timeEntry) {
    // Baustellenfotos
    displayImageCollection(timeEntry, 'site-photos', [
        { field: 'sitePhotos', label: 'Baustellenfotos' },
        { field: 'photos', label: 'Fotos' }
    ]);
    
    // Lieferscheine
    displayImageCollection(timeEntry, 'delivery-notes', [
        { field: 'deliveryNotes', label: 'Lieferscheine' },
        { field: 'documents', label: 'Dokumente' }
    ]);
}

// Hilfsfunktion zum Anzeigen einer Bildsammlung
function displayImageCollection(timeEntry, containerId, sources) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let imagesFound = false;
    let allImageUrls = [];
    
    // Alle möglichen Quellen durchsuchen
    sources.forEach(source => {
        if (timeEntry[source.field]) {
            // Je nach Datenstruktur verarbeiten
            if (Array.isArray(timeEntry[source.field])) {
                timeEntry[source.field].forEach(item => {
                    // URL extrahieren
                    let url = null;
                    let comment = '';
                    
                    if (typeof item === 'string') {
                        // Direkter String
                        url = item;
                    } else if (item && typeof item === 'object') {
                        // Objekt mit url/src und eventuell comment/description
                        url = item.url || item.src || item.downloadURL || null;
                        comment = item.comment || item.description || '';
                    }
                    
                    // URL verarbeiten, wenn vorhanden und noch nicht hinzugefügt
                    if (url && !allImageUrls.includes(url)) {
                        allImageUrls.push(url);
                        container.innerHTML += `
                            <div class="image-item">
                                <img src="${url}" alt="${source.label}" class="report-image" onclick="showFullscreen('${url}')">
                                ${comment ? `<p class="image-comment">${comment}</p>` : ''}
                            </div>
                        `;
                        imagesFound = true;
                    }
                });
                
                console.log(`🔍 REPORT: ${allImageUrls.length} Bilder gefunden in ${source.field}`);
            } else if (typeof timeEntry[source.field] === 'object') {
                // Einzelnes Objekt-Format
                console.log(`🔍 REPORT: ${source.field} ist ein Objekt:`, timeEntry[source.field]);
                
                // Versuchen, URLs aus verschiedenen Objektstrukturen zu extrahieren
                Object.entries(timeEntry[source.field]).forEach(([key, value]) => {
                    let url = null;
                    
                    if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('data:'))) {
                        url = value;
                    } else if (value && typeof value === 'object' && (value.url || value.src || value.downloadURL)) {
                        url = value.url || value.src || value.downloadURL;
                    }
                    
                    if (url && !allImageUrls.includes(url)) {
                        allImageUrls.push(url);
                        container.innerHTML += `
                            <div class="image-item">
                                <img src="${url}" alt="${source.label}" class="report-image" onclick="showFullscreen('${url}')">
                            </div>
                        `;
                        imagesFound = true;
                    }
                });
            }
        }
    });
    
    // Spezialfall: sitePhotoUploads
    if (timeEntry.sitePhotoUploads && Array.isArray(timeEntry.sitePhotoUploads)) {
        timeEntry.sitePhotoUploads.forEach(upload => {
            if (upload && typeof upload === 'object') {
                const url = upload.downloadURL || upload.url || null;
                if (url && !allImageUrls.includes(url)) {
                    allImageUrls.push(url);
                    container.innerHTML += `
                        <div class="image-item">
                            <img src="${url}" alt="Foto" class="report-image" onclick="showFullscreen('${url}')">
                        </div>
                    `;
                    imagesFound = true;
                }
            }
        });
        console.log(`🔍 REPORT: ${allImageUrls.length} Bilder gefunden in sitePhotoUploads`);
    }
    
    // Wenn keine Bilder gefunden wurden
    if (!imagesFound) {
        container.innerHTML = '<p>Keine Bilder vorhanden</p>';
    }
}

// Vollbildanzeige für Bilder
window.showFullscreen = function(imageUrl) {
    let modal = document.getElementById('fullscreen-image-modal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'fullscreen-image-modal';
        modal.className = 'fullscreen-modal';
        
        modal.innerHTML = `
            <span class="close-fullscreen">&times;</span>
            <img class="fullscreen-content" id="fullscreen-image">
        `;
        
        document.body.appendChild(modal);
        
        // Schließen-Button einrichten
        const closeBtn = modal.querySelector('.close-fullscreen');
        closeBtn.addEventListener('click', function() {
            modal.style.display = 'none';
        });
        
        // Klick außerhalb des Bildes schließt Modal
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
    
    // Bild setzen und anzeigen
    const img = document.getElementById('fullscreen-image');
    img.src = imageUrl;
    modal.style.display = 'block';
};

// Hilfsfunktionen zur Datumsverarbeitung
function extractDate(dateValue) {
    if (!dateValue) return null;
    
    try {
        // Firebase Timestamp
        if (dateValue instanceof firebase.firestore.Timestamp) {
            return dateValue.toDate();
        }
        // Firebase Timestamp als Objekt {seconds, nanoseconds}
        else if (typeof dateValue === 'object' && dateValue.seconds) {
            return new Date(dateValue.seconds * 1000);
        }
        // String oder Number
        else {
            return new Date(dateValue);
        }
    } catch (error) {
        console.error('⚠️ REPORT: Fehler beim Extrahieren des Datums:', error);
        return null;
    }
}

function formatDate(dateValue) {
    const date = extractDate(dateValue);
    if (!date) return 'Ungültiges Datum';
    
    try {
        return date.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch (error) {
        console.error('⚠️ REPORT: Fehler beim Formatieren des Datums:', error);
        return 'Ungültiges Datum';
    }
}

function formatTime(dateValue) {
    const date = extractDate(dateValue);
    if (!date) return '--:--';
    
    try {
        return date.toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        console.error('⚠️ REPORT: Fehler beim Formatieren der Zeit:', error);
        return '--:--';
    }
}

// Styles für den Bericht
function addReportStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Modal-Grundstile */
        #standalone-report-modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0, 0, 0, 0.4);
            padding-top: 30px;
        }
        
        #standalone-report-modal .modal-content {
            position: relative;
            background-color: #fefefe;
            margin: auto;
            padding: 0;
            width: 90%;
            max-width: 900px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }
        
        #standalone-report-modal .modal-header {
            padding: 15px 20px;
            background-color: #f7f7f7;
            border-bottom: 1px solid #e0e0e0;
            border-radius: 8px 8px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        #standalone-report-modal .modal-header h3 {
            margin: 0;
            color: #333;
        }
        
        #standalone-report-modal .close-modal-btn {
            color: #777;
            float: right;
            font-size: 28px;
            font-weight: bold;
            background: none;
            border: none;
            cursor: pointer;
        }
        
        #standalone-report-modal .close-modal-btn:hover,
        #standalone-report-modal .close-modal-btn:focus {
            color: #000;
            text-decoration: none;
        }
        
        #standalone-report-modal .modal-body {
            padding: 20px;
            max-height: 80vh;
            overflow-y: auto;
        }
        
        /* Berichtssektionen */
        .report-section {
            margin-bottom: 30px;
            border-bottom: 1px solid #e0e0e0;
            padding-bottom: 20px;
        }
        
        .report-section:last-child {
            border-bottom: none;
        }
        
        .report-section h4 {
            margin-top: 0;
            margin-bottom: 15px;
            color: #444;
            font-size: 18px;
        }
        
        /* Info-Grid */
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 15px;
        }
        
        .info-item {
            margin-bottom: 8px;
        }
        
        /* Notizen */
        .notes-box {
            background-color: #f9f9f9;
            padding: 15px;
            border-radius: 5px;
            white-space: pre-line;
            min-height: 80px;
        }
        
        /* Pausenliste */
        .pause-list {
            margin: 0;
            padding-left: 20px;
        }
        
        .pause-list li {
            margin-bottom: 8px;
        }
        
        /* Bildergalerie */
        .photos-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        
        .image-item {
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 8px;
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            transition: transform 0.2s;
        }
        
        .image-item:hover {
            transform: scale(1.03);
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        
        .report-image {
            width: 100%;
            height: 150px;
            object-fit: cover;
            border-radius: 3px;
            cursor: pointer;
        }
        
        .image-comment {
            margin-top: 8px;
            font-size: 12px;
            color: #666;
        }
        
        /* Vollbild-Modal */
        .fullscreen-modal {
            display: none;
            position: fixed;
            z-index: 2000;
            padding-top: 50px;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0, 0, 0, 0.9);
        }
        
        .fullscreen-content {
            margin: auto;
            display: block;
            max-width: 90%;
            max-height: 90%;
        }
        
        .close-fullscreen {
            position: absolute;
            top: 15px;
            right: 35px;
            color: #f1f1f1;
            font-size: 40px;
            font-weight: bold;
            transition: 0.3s;
            cursor: pointer;
        }
        
        .close-fullscreen:hover,
        .close-fullscreen:focus {
            color: #bbb;
            text-decoration: none;
        }
        
        /* Debug-Sektion */
        .debug-section {
            margin-top: 30px;
            background-color: #f5f5f5;
            padding: 10px;
            border-radius: 5px;
        }
        
        .debug-section pre {
            background-color: #eee;
            padding: 10px;
            border-radius: 3px;
            overflow: auto;
            font-family: monospace;
            font-size: 12px;
            max-height: 300px;
        }
    `;
    
    document.head.appendChild(style);
}

// Initialisierung
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 REPORT: Eigenständige Berichtsfunktionalität wird initialisiert...');
    
    // Styles hinzufügen
    addReportStyles();
    
    console.log('✅ REPORT: Initialisierung abgeschlossen. showReport-Funktion ist verfügbar.');
});
