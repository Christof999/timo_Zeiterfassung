/**
 * report-direct.js
 * Eine vereinfachte und direkte Implementierung der Berichtsfunktionalität
 * für die Zeiterfassungs-App von Lauffer Gartenbau
 */

// Globale Variable, um den aktuellen Zeiteintrag zu speichern
let currentReportEntry = null;

// Hauptfunktion: Zeigt den Bericht für einen bestimmten Zeiteintrag an
window.showDirectReport = async function(entryId, projectId, employeeId) {
    console.log('Direkter Bericht angefordert für:', entryId, projectId, employeeId);
    
    try {
        // 1. Zeiteintrag direkt laden mit der neuen Hilfsfunktion
        const timeEntry = await window.getTimeEntryById(entryId);
        if (!timeEntry) {
            console.error('Zeiteintrag nicht gefunden:', entryId);
            alert('Zeiteintrag konnte nicht gefunden werden.');
            return;
        }
        
        // Speichere den aktuellen Zeiteintrag für spätere Verwendung
        currentReportEntry = timeEntry;
        console.log('Zeiteintrag geladen:', timeEntry);
        
        // 2. Zugehöriges Projekt laden
        const project = await DataService.getProjectById(timeEntry.projectId || projectId);
        if (!project) {
            console.error('Projekt nicht gefunden:', timeEntry.projectId || projectId);
            alert('Projekt konnte nicht gefunden werden.');
            return;
        }
        console.log('Projekt geladen:', project);
        
        // 3. Zugehörigen Mitarbeiter laden
        const employee = await DataService.getEmployeeById(timeEntry.employeeId || employeeId);
        if (!employee) {
            console.error('Mitarbeiter nicht gefunden:', timeEntry.employeeId || employeeId);
            alert('Mitarbeiter konnte nicht gefunden werden.');
            return;
        }
        console.log('Mitarbeiter geladen:', employee);
        
        // 4. Bericht-Modal anzeigen
        showReportModal(timeEntry, project, employee);
        
    } catch (error) {
        console.error('Fehler beim Anzeigen des Berichts:', error);
        alert('Fehler beim Anzeigen des Berichts: ' + error.message);
    }
};

// Hilfsfunktion: Zeigt das Bericht-Modal mit den Daten an
function showReportModal(timeEntry, project, employee) {
    // 1. Modal erstellen oder bestehenden finden
    let modal = document.getElementById('direct-report-modal');
    if (!modal) {
        modal = createReportModal();
    }
    
    // 2. Modal-Titel setzen
    const modalTitle = document.getElementById('direct-report-modal-title');
    if (modalTitle) {
        modalTitle.textContent = `Zeiterfassungsbericht: ${project.name}`;
    }
    
    // 3. Basisdaten anzeigen
    updateReportData(timeEntry, project, employee);
    
    // 4. Bilder laden und anzeigen
    loadAndDisplayImages(timeEntry);
    
    // 5. Modal anzeigen
    modal.style.display = 'block';
}

// Hilfsfunktion: Erstellt das Bericht-Modal, falls es noch nicht existiert
function createReportModal() {
    const existingModal = document.getElementById('direct-report-modal');
    if (existingModal) {
        return existingModal;
    }
    
    console.log('Erstelle neues direktes Report-Modal');
    
    const modal = document.createElement('div');
    modal.id = 'direct-report-modal';
    modal.className = 'modal';
    
    modal.innerHTML = `
        <div class="modal-content large-modal">
            <div class="modal-header">
                <h3 id="direct-report-modal-title">Zeiterfassungsbericht</h3>
                <button type="button" class="close-modal-btn" id="direct-report-close-btn">&times;</button>
            </div>
            <div class="modal-body report-modal-body">
                <div class="report-header">
                    <div class="report-info-grid">
                        <div class="report-info-item">
                            <strong>Datum:</strong>
                            <span id="direct-report-date"></span>
                        </div>
                        <div class="report-info-item">
                            <strong>Projekt:</strong>
                            <span id="direct-report-project"></span>
                        </div>
                        <div class="report-info-item">
                            <strong>Mitarbeiter:</strong>
                            <span id="direct-report-employee"></span>
                        </div>
                        <div class="report-info-item">
                            <strong>Einstempelzeit:</strong>
                            <span id="direct-report-time-in"></span>
                        </div>
                        <div class="report-info-item">
                            <strong>Ausstempelzeit:</strong>
                            <span id="direct-report-time-out"></span>
                        </div>
                        <div class="report-info-item">
                            <strong>Arbeitsstunden:</strong>
                            <span id="direct-report-work-hours"></span>
                        </div>
                    </div>
                </div>
                
                <div class="report-notes-section">
                    <h4>Notizen:</h4>
                    <p id="direct-report-notes"></p>
                </div>
                
                <div class="report-pause-section">
                    <h4>Pausendetails:</h4>
                    <div id="direct-report-pause-details"></div>
                </div>
                
                <div class="report-gallery-section">
                    <h4>Baustellenfotos</h4>
                    <div id="direct-report-site-photos" class="report-gallery"></div>
                </div>
                
                <div class="report-gallery-section">
                    <h4>Lieferscheine & Rechnungen</h4>
                    <div id="direct-report-delivery-notes" class="report-gallery"></div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event-Listener für den Schließen-Button
    const closeButton = modal.querySelector('#direct-report-close-btn');
    if (closeButton) {
        closeButton.addEventListener('click', function() {
            modal.style.display = 'none';
        });
    }
    
    // Klick außerhalb des Modals schließt es
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // ESC-Taste schließt das Modal
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modal.style.display === 'block') {
            modal.style.display = 'none';
        }
    });
    
    return modal;
}

// Hilfsfunktion: Aktualisiert die Berichtsdaten im Modal
function updateReportData(timeEntry, project, employee) {
    // Elementreferenzen
    const reportDate = document.getElementById('direct-report-date');
    const reportProject = document.getElementById('direct-report-project');
    const reportEmployee = document.getElementById('direct-report-employee');
    const reportTimeIn = document.getElementById('direct-report-time-in');
    const reportTimeOut = document.getElementById('direct-report-time-out');
    const reportWorkHours = document.getElementById('direct-report-work-hours');
    const reportNotes = document.getElementById('direct-report-notes');
    const reportPauseDetails = document.getElementById('direct-report-pause-details');
    
    if (reportDate && reportProject && reportEmployee && reportTimeIn && 
        reportTimeOut && reportWorkHours && reportNotes && reportPauseDetails) {
        
        // Datum formatieren
        let clockInDate = formatFirebaseDate(timeEntry.clockInTime);
        const date = clockInDate.toLocaleDateString('de-DE');
        
        // Zeiten formatieren
        const clockInTime = formatTime(clockInDate);
        
        // Ausstempelzeit extrahieren und formatieren
        let clockOutDate = null;
        let clockOutTime = '--:--';
        
        if (timeEntry.clockOutTime) {
            clockOutDate = formatFirebaseDate(timeEntry.clockOutTime);
            if (isValidDate(clockOutDate)) {
                clockOutTime = formatTime(clockOutDate);
            }
        }
        
        // Arbeitsstunden berechnen
        let workHours = 'NaNh';
        const pauseTotalTime = timeEntry.pauseTotalTime || 0;
        
        if (clockOutDate && isValidDate(clockOutDate)) {
            try {
                const totalTimeMs = clockOutDate.getTime() - clockInDate.getTime();
                
                if (totalTimeMs > 0) {
                    const actualWorkTimeMs = totalTimeMs - pauseTotalTime;
                    const hours = actualWorkTimeMs / (1000 * 60 * 60);
                    workHours = hours.toFixed(2) + 'h';
                    
                    // Wenn Pausenzeit vorhanden, diese auch anzeigen
                    if (pauseTotalTime > 0) {
                        const pauseMinutes = Math.floor(pauseTotalTime / 60000);
                        const pauseHours = Math.floor(pauseMinutes / 60);
                        const remainingMinutes = pauseMinutes % 60;
                        workHours += ` (inkl. ${pauseHours}h ${remainingMinutes}min Pause)`;
                    }
                }
            } catch (error) {
                console.error('Fehler bei der Berechnung der Arbeitsstunden:', error);
            }
        }
        
        // Daten in das Modal schreiben
        reportDate.textContent = date;
        reportProject.textContent = project.name;
        reportEmployee.textContent = employee.name;
        reportTimeIn.textContent = clockInTime;
        reportTimeOut.textContent = clockOutTime;
        reportWorkHours.textContent = workHours;
        reportNotes.textContent = timeEntry.notes || '-';
        
        // Pausendetails anzeigen
        updatePauseDetails(timeEntry, reportPauseDetails);
    }
}

// Hilfsfunktion: Aktualisiert die Pausendetails
function updatePauseDetails(timeEntry, reportPauseDetails) {
    if (timeEntry.pauseDetails && timeEntry.pauseDetails.length > 0) {
        let pauseDetailsHtml = '<ul class="pause-list">';
        
        for (const pause of timeEntry.pauseDetails) {
            try {
                // Konvertierung der Zeitstempel in Date-Objekte
                let startDate = formatFirebaseDate(pause.start);
                let endDate = formatFirebaseDate(pause.end);
                
                if (!isValidDate(startDate) || !isValidDate(endDate)) {
                    throw new Error('Ungültige Datumswerte');
                }
                
                // Formatierung der Zeiten
                const startTime = startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                const endTime = endDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                
                // Berechnung der Pausendauer
                const pauseDuration = Math.floor((endDate - startDate) / 60000);
                
                pauseDetailsHtml += `<li>Pause von ${startTime} bis ${endTime} (${pauseDuration} Min.)</li>`;
            } catch (e) {
                console.error('Fehler bei der Verarbeitung einer Pause:', e, pause);
                pauseDetailsHtml += '<li>Ungültige Pausenzeit</li>';
            }
        }
        
        pauseDetailsHtml += '</ul>';
        reportPauseDetails.innerHTML = pauseDetailsHtml;
    } else {
        reportPauseDetails.innerHTML = '<p>Keine Pausen eingetragen</p>';
    }
}

// Hilfsfunktion: Lädt und zeigt die Bilder an
function loadAndDisplayImages(timeEntry) {
    // Baustellenfotos
    const sitePhotosGallery = document.getElementById('direct-report-site-photos');
    if (sitePhotosGallery) {
        sitePhotosGallery.innerHTML = '<p>Baustellenfotos werden geladen...</p>';
        
        try {
            // Alle Bildquellen sammeln
            let allImages = [];
            
            // Direkte sitePhotos durchsuchen
            if (timeEntry.sitePhotos && Array.isArray(timeEntry.sitePhotos)) {
                timeEntry.sitePhotos.forEach(photo => {
                    if (photo && (photo.url || photo.src)) {
                        allImages.push({
                            url: photo.url || photo.src,
                            comment: photo.comment || photo.description || ''
                        });
                    }
                });
                console.log(`${timeEntry.sitePhotos.length} Baustellenfotos im sitePhotos-Feld gefunden`);
            }
            
            // Allgemeines photos-Feld durchsuchen
            if (timeEntry.photos && Array.isArray(timeEntry.photos)) {
                timeEntry.photos.forEach(photo => {
                    if (photo && (photo.url || photo.src)) {
                        const photoUrl = photo.url || photo.src;
                        // Prüfen, ob das Bild bereits hinzugefügt wurde
                        if (!allImages.some(img => img.url === photoUrl)) {
                            allImages.push({
                                url: photoUrl,
                                comment: photo.comment || photo.description || ''
                            });
                        }
                    }
                });
                console.log(`${timeEntry.photos.length} Fotos im photos-Feld gefunden`);
            }
            
            // Bilder anzeigen
            if (allImages.length > 0) {
                let galleryHtml = '';
                
                allImages.forEach(photo => {
                    galleryHtml += `
                    <div class="report-gallery-item">
                        <img src="${photo.url}" alt="Baustellenfoto" class="report-gallery-image" onclick="openFullscreenImage('${photo.url}')">
                        ${photo.comment ? `<p class="photo-comment">${photo.comment}</p>` : ''}
                    </div>`;
                });
                
                sitePhotosGallery.innerHTML = galleryHtml;
                console.log(`${allImages.length} Baustellenfotos angezeigt`);
            } else {
                sitePhotosGallery.innerHTML = '<p>Keine Baustellenfotos vorhanden</p>';
            }
        } catch (error) {
            console.error('Fehler beim Laden der Baustellenfotos:', error);
            sitePhotosGallery.innerHTML = '<p>Fehler beim Laden der Baustellenfotos</p>';
        }
    }
    
    // Lieferscheine und Dokumente
    const deliveryNotesGallery = document.getElementById('direct-report-delivery-notes');
    if (deliveryNotesGallery) {
        deliveryNotesGallery.innerHTML = '<p>Lieferscheine werden geladen...</p>';
        
        try {
            // Alle Dokumentquellen sammeln
            let allDocs = [];
            
            // deliveryNotes durchsuchen
            if (timeEntry.deliveryNotes && Array.isArray(timeEntry.deliveryNotes)) {
                timeEntry.deliveryNotes.forEach(doc => {
                    if (doc && (doc.url || doc.src)) {
                        allDocs.push({
                            url: doc.url || doc.src,
                            comment: doc.comment || doc.description || ''
                        });
                    }
                });
                console.log(`${timeEntry.deliveryNotes.length} Lieferscheine im deliveryNotes-Feld gefunden`);
            }
            
            // Allgemeines documents-Feld durchsuchen
            if (timeEntry.documents && Array.isArray(timeEntry.documents)) {
                timeEntry.documents.forEach(doc => {
                    if (doc && (doc.url || doc.src)) {
                        const docUrl = doc.url || doc.src;
                        // Prüfen, ob das Dokument bereits hinzugefügt wurde
                        if (!allDocs.some(d => d.url === docUrl)) {
                            allDocs.push({
                                url: docUrl,
                                comment: doc.comment || doc.description || ''
                            });
                        }
                    }
                });
                console.log(`${timeEntry.documents.length} Dokumente im documents-Feld gefunden`);
            }
            
            // Dokumente anzeigen
            if (allDocs.length > 0) {
                let galleryHtml = '';
                
                allDocs.forEach(doc => {
                    galleryHtml += `
                    <div class="report-gallery-item">
                        <img src="${doc.url}" alt="Lieferschein" class="report-gallery-image" onclick="openFullscreenImage('${doc.url}')">
                        ${doc.comment ? `<p class="photo-comment">${doc.comment}</p>` : ''}
                    </div>`;
                });
                
                deliveryNotesGallery.innerHTML = galleryHtml;
                console.log(`${allDocs.length} Lieferscheine/Dokumente angezeigt`);
            } else {
                deliveryNotesGallery.innerHTML = '<p>Keine Lieferscheine vorhanden</p>';
            }
        } catch (error) {
            console.error('Fehler beim Laden der Lieferscheine:', error);
            deliveryNotesGallery.innerHTML = '<p>Fehler beim Laden der Lieferscheine</p>';
        }
    }
}

// Hilfsfunktion: Öffnet die Vollbildanzeige eines Bildes
window.openFullscreenImage = function(imageUrl) {
    let modal = document.getElementById('fullscreen-image-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'fullscreen-image-modal';
        modal.className = 'fullscreen-modal';
        
        modal.innerHTML = `
            <button class="close-fullscreen-btn">&times;</button>
            <div class="fullscreen-image-container">
                <img class="fullscreen-image" src="" alt="Vollbildansicht">
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Event-Listener für den Schließen-Button
        const closeButton = modal.querySelector('.close-fullscreen-btn');
        closeButton.addEventListener('click', function() {
            modal.style.display = 'none';
        });
        
        // Klick auf Modal schließt es
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
        
        // ESC-Taste schließt Modal
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && modal.style.display === 'block') {
                modal.style.display = 'none';
            }
        });
    }
    
    const fullscreenImage = modal.querySelector('.fullscreen-image');
    if (fullscreenImage) {
        fullscreenImage.src = imageUrl;
    }
    
    modal.style.display = 'block';
};

// Hilfsfunktion: Formatiert ein Firebase-Datum in ein JavaScript-Date-Objekt
function formatFirebaseDate(dateValue) {
    if (!dateValue) return new Date();
    
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
        console.error('Fehler beim Formatieren des Datums:', error, dateValue);
        return new Date();
    }
}

// Hilfsfunktion: Formatiert die Zeit
function formatTime(date) {
    if (!date || !isValidDate(date)) {
        return '--:--';
    }
    
    try {
        return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        console.error('Fehler beim Formatieren der Zeit:', error);
        return '--:--';
    }
}

// Hilfsfunktion: Prüft, ob ein Datum gültig ist
function isValidDate(date) {
    return date instanceof Date && !isNaN(date.getTime());
}

// Styles für die Berichtsanzeige hinzufügen
function addReportStyles() {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        /* Direktes Report-Modal */
        #direct-report-modal .modal-content {
            max-width: 900px;
        }
        
        /* Report-Informationen */
        .report-info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 1rem;
            margin-bottom: 1.5rem;
        }
        
        .report-info-item {
            margin-bottom: 0.5rem;
        }
        
        /* Report-Abschnitte */
        .report-notes-section,
        .report-pause-section,
        .report-gallery-section {
            margin-bottom: 2rem;
            border-top: 1px solid #ddd;
            padding-top: 1rem;
        }
        
        /* Galerie */
        .report-gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 1rem;
            margin-top: 1rem;
        }
        
        .report-gallery-item {
            border: 1px solid #ddd;
            border-radius: 4px;
            overflow: hidden;
            padding: 0.5rem;
        }
        
        .report-gallery-image {
            width: 100%;
            height: auto;
            max-height: 200px;
            object-fit: contain;
            cursor: pointer;
            transition: transform 0.2s;
        }
        
        .report-gallery-image:hover {
            transform: scale(1.03);
        }
        
        .photo-comment {
            font-size: 0.85rem;
            margin-top: 0.5rem;
            color: #555;
        }
        
        /* Vollbildanzeige */
        .fullscreen-modal {
            display: none;
            position: fixed;
            z-index: 10000;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.9);
            overflow: auto;
        }
        
        .fullscreen-image-container {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100%;
            width: 100%;
        }
        
        .fullscreen-image {
            max-width: 90%;
            max-height: 90%;
            object-fit: contain;
        }
        
        .close-fullscreen-btn {
            position: absolute;
            top: 15px;
            right: 35px;
            color: #f1f1f1;
            font-size: 40px;
            font-weight: bold;
            transition: 0.3s;
            background: none;
            border: none;
            cursor: pointer;
            z-index: 10001;
        }
        
        .close-fullscreen-btn:hover,
        .close-fullscreen-btn:focus {
            color: #bbb;
            text-decoration: none;
            cursor: pointer;
        }
    `;
    
    document.head.appendChild(styleElement);
}

// Event-Listener hinzufügen, um die direkte Berichtsfunktionalität zu aktivieren
window.addEventListener('DOMContentLoaded', function() {
    console.log('Direkte Berichtsfunktionalität wird initialisiert...');
    
    // Styles hinzufügen
    addReportStyles();
    
    // Buttons für direkte Berichte einrichten
    setupDirectReportButtons();
});

// Eine Flagge, um zu verhindern, dass Buttons mehrfach verarbeitet werden
let processingButtons = false;

// Aktualisiert die Bericht-Buttons für die direkte Funktionalität
function setupDirectReportButtons() {
    // Direkter einmaliger Ansatz, kein Observer
    console.log('Richte direkte Berichtsfunktionalität ein...');
    
    // Warten auf das vollständige Laden der Seite
    setTimeout(() => {
        // Buttons direkt in der Tabelle einrichten, wo sie garantiert existieren
        const timeEntriesTable = document.getElementById('time-entries-table');
        
        if (timeEntriesTable) {
            // Event-Delegation nutzen statt individuelle Listeners
            timeEntriesTable.addEventListener('click', function(event) {
                // Wenn ein Bericht-Button geklickt wurde
                if (event.target && event.target.classList.contains('report-btn')) {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    const btn = event.target;
                    const entryId = btn.dataset.entryId;
                    const projectId = btn.dataset.projectId;
                    const employeeId = btn.dataset.employeeId;
                    
                    console.log('Bericht-Button direkt geklickt:', entryId, projectId, employeeId);
                    
                    // Rufe die direkte Berichtsfunktion auf
                    window.showDirectReport(entryId, projectId, employeeId);
                }
            });
            
            console.log('Event-Delegation für Bericht-Buttons eingerichtet');
        } else {
            console.warn('Tabelle für Zeiteinträge nicht gefunden');
        }
    }, 1000); // Kurze Verzögerung, um sicherzustellen, dass die Seite geladen ist
}

// In dieser Version verwenden wir Event-Delegation statt individueller Button-Updates
// Die alte updateReportButtons-Funktion wird nicht mehr benötigt

console.log('report-direct.js geladen - Direkte Berichtsfunktionalität bereit');
