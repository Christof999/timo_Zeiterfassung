/**
 * Projektdetail-Funktionalität für die Lauffer Zeiterfassung
 * Verantwortlich für die Anzeige von Projektdetails, Zeiteinträgen und Bildern
 */

// Globale Variablen
let projectId = null;
let currentProject = null;

// DOM-Elemente
let projectTitle, projectNumber, detailStatus, detailLocation;
let detailStartDate, detailEndDate, detailDescription;
let timeEntriesTable, timeEmployeeFilter, timeDateFilter, clearTimeFilterBtn;

// Event-Listener
document.addEventListener('DOMContentLoaded', function() {
    // DOM-Elemente initialisieren - erst jetzt, wenn das DOM vollständig geladen ist
    projectTitle = document.getElementById('project-title');
    projectNumber = document.getElementById('project-number');
    detailStatus = document.getElementById('detail-status');
    detailLocation = document.getElementById('detail-location');
    detailStartDate = document.getElementById('detail-start-date');
    detailEndDate = document.getElementById('detail-end-date');
    detailDescription = document.getElementById('detail-description');
    timeEntriesTable = document.getElementById('time-entries-table')?.querySelector('tbody');
    timeEmployeeFilter = document.getElementById('time-employee-filter');
    timeDateFilter = document.getElementById('time-date-filter');
    clearTimeFilterBtn = document.getElementById('clear-time-filter');
    
    console.log('DOM-Elemente initialisiert:', {
        timeEntriesTable: !!timeEntriesTable,
        projectTitle: !!projectTitle,
        sitePhotosGallery: !!document.getElementById('site-photos-gallery')
    });
    
    // Projekt-ID aus der URL auslesen mit zusätzlicher Debugging-Information
    const fullUrl = window.location.href;
    console.log('Vollständige URL:', fullUrl);
    
    const urlParams = new URLSearchParams(window.location.search);
    projectId = urlParams.get('id');
    
    console.log('Extrahierte Projekt-ID:', projectId);
    
    if (!projectId) {
        showError('Keine Projekt-ID in der URL gefunden.');
        return;
    }
    
    // DataService initialisieren
    try {
        DataService.init();
        console.log('DataService wurde initialisiert');
    } catch (error) {
        console.error('Fehler bei der Initialisierung des DataService:', error);
        showError('Fehler bei der Initialisierung des DataService.');
        return;
    }
    
    // Projekt laden
    loadProject();
    
    // Event-Listener für Tab-Navigation
    setupTabNavigation();
    
    // Event-Listener für Filter
    setupFilters();
    
    // Logout-Button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            DataService.logout();
            window.location.href = 'index.html';
        });
    }
});

// Hauptfunktionen
async function loadProject() {
    try {
        console.log('Starte Projekt-Ladevorgang für ID:', projectId);
        
        if (!projectId) {
            console.error('Keine gültige Projekt-ID vorhanden');
            showError('Keine gültige Projekt-ID.');
            return;
        }
        
        if (!DataService || !DataService.projectsCollection) {
            console.error('DataService oder projectsCollection nicht initialisiert');
            showError('Datenzugriffsschicht nicht bereit.');
            return;
        }
        
        // Direkter Zugriff auf Firestore für maximale Zuverlässigkeit
        console.log('Versuche direkten Firestore-Zugriff für Projekt mit ID:', projectId);
        
        try {
            const projectDoc = await DataService.projectsCollection.doc(projectId).get();
            
            if (!projectDoc.exists) {
                console.error('Projekt-Dokument existiert nicht in Firestore');
                showError('Projekt nicht gefunden.');
                return;
            }
            
            currentProject = { id: projectDoc.id, ...projectDoc.data() };
            console.log('Projekt erfolgreich geladen:', currentProject);
            
            // Projektdaten anzeigen
            displayProjectDetails(currentProject);
            
            // Zeit-Einträge laden
            await loadTimeEntriesForProject(projectId);
            
            // Bilder laden
            await loadImagesForProject(projectId);
            
        } catch (firestoreError) {
            console.error('Firestore-Fehler beim direkten Zugriff:', firestoreError);
            showError('Datenbankfehler: ' + (firestoreError.message || 'Unbekannter Fehler'));
        }
        
    } catch (error) {
        console.error('Allgemeiner Fehler beim Laden des Projekts:', error);
        showError('Fehler beim Laden des Projekts: ' + (error.message || 'Unbekannter Fehler'));
    }
}

// Neue Funktion für das Laden von Zeiteinträgen
async function loadTimeEntriesForProject(projectId) {
    try {
        console.log('Lade Zeiteinträge für Projekt:', projectId);
        
        const tableBody = document.getElementById('time-entries-table')?.querySelector('tbody');
        if (!tableBody) {
            console.error('Zeiteinträge-Tabellenkörper nicht gefunden');
            return;
        }
        
        // Ladeindikator anzeigen
        tableBody.innerHTML = '<tr><td colspan="7" class="loading-indicator">Zeiteinträge werden geladen...</td></tr>';
        
        // Zeiteinträge direkt aus Firestore abrufen
        const entriesSnapshot = await DataService.timeEntriesCollection
            .where('projectId', '==', projectId)
            .orderBy('clockInTime', 'desc')
            .get();
        
        if (entriesSnapshot.empty) {
            console.log('Keine Zeiteinträge für dieses Projekt gefunden');
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Keine Zeiteinträge vorhanden</td></tr>';
            return;
        }
        
        const entries = entriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`${entries.length} Zeiteinträge gefunden:`, entries[0]);
        
        // Tabelle leeren
        tableBody.innerHTML = '';
        
        // Zeiteinträge anzeigen
        for (const entry of entries) {
            const employeeSnapshot = await DataService.employeesCollection.doc(entry.employeeId).get();
            const employee = employeeSnapshot.exists ? { id: employeeSnapshot.id, ...employeeSnapshot.data() } : { name: 'Unbekannt' };
            
            // Datum formatieren
            const clockInDate = entry.clockInTime instanceof firebase.firestore.Timestamp ? 
                entry.clockInTime.toDate() : new Date(entry.clockInTime);
            
            const date = clockInDate.toLocaleDateString('de-DE');
            
            // Zeiten formatieren
            const clockInTime = formatTime(clockInDate);
            const clockOutTime = entry.clockOutTime ? 
                formatTime(entry.clockOutTime instanceof firebase.firestore.Timestamp ? 
                    entry.clockOutTime.toDate() : new Date(entry.clockOutTime)) : '-';
            
            // Arbeitsstunden berechnen
            let workHours = '-';
            if (entry.clockOutTime) {
                const clockOutDate = entry.clockOutTime instanceof firebase.firestore.Timestamp ? 
                    entry.clockOutTime.toDate() : new Date(entry.clockOutTime);
                
                const durationMs = clockOutDate - clockInDate;
                const durationHours = durationMs / (1000 * 60 * 60);
                workHours = durationHours.toFixed(2) + ' h';
            }
            
            // Zeile erstellen
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${date}</td>
                <td>${employee.name}</td>
                <td>${clockInTime}</td>
                <td>${clockOutTime}</td>
                <td>${workHours}</td>
                <td>${entry.notes || '-'}</td>
                <td>
                    <button class="btn-icon view-entry-btn" data-entry-id="${entry.id}" title="Details anzeigen">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            `;
            
            tableBody.appendChild(row);
        }
        
        // Event-Listener für Buttons hinzufügen
        addTimeEntryButtonListeners();
        
    } catch (error) {
        console.error('Fehler beim Laden der Zeiteinträge:', error);
        const tableBody = document.getElementById('time-entries-table')?.querySelector('tbody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="7" class="error-message">Fehler beim Laden der Zeiteinträge</td></tr>';
        }
    }
}

// Neue Funktion für das Laden von Bildern
async function loadImagesForProject(projectId) {
    try {
        console.log('Lade Bilder für Projekt:', projectId);
        
        // Baustellenfotos laden
        await loadImagesByType(projectId, 'construction_site');
        
        // Dokumente laden
        await loadImagesByType(projectId, 'delivery_note');
        
    } catch (error) {
        console.error('Fehler beim Laden der Bilder:', error);
        showError('Fehler beim Laden der Bilder.');
    }
}

// Neue Funktion für das Laden von Bildern nach Typ
async function loadImagesByType(projectId, type) {
    try {
        const containerId = type === 'construction_site' ? 'site-photos-gallery' : 'documents-gallery';
        const container = document.getElementById(containerId);
        
        if (!container) {
            console.error(`Container für ${type}-Bilder nicht gefunden`);
            return;
        }
        
        // Ladeindikator anzeigen
        container.innerHTML = '<div class="loading-indicator">Bilder werden geladen...</div>';
        
        // Bilder direkt aus Firestore abrufen
        const filesSnapshot = await DataService.fileUploadsCollection
            .where('projectId', '==', projectId)
            .where('type', '==', type)
            .get();
        
        if (filesSnapshot.empty) {
            console.log(`Keine ${type}-Bilder für dieses Projekt gefunden`);
            container.innerHTML = `<div class="no-content-message">Keine ${type === 'construction_site' ? 'Baustellenfotos' : 'Dokumente'} vorhanden</div>`;
            return;
        }
        
        const files = filesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`${files.length} ${type}-Bilder gefunden`);
        
        // Container leeren
        container.innerHTML = '';
        
        // Bilder anzeigen
        for (const file of files) {
            // Mitarbeiterinformationen abrufen
            let employeeName = 'Unbekannt';
            if (file.employeeId) {
                const employeeSnapshot = await DataService.employeesCollection.doc(file.employeeId).get();
                if (employeeSnapshot.exists) {
                    employeeName = employeeSnapshot.data().name || 'Unbekannt';
                }
            }
            
            // Datum formatieren
            let formattedDate = 'Unbekanntes Datum';
            if (file.uploadTime) {
                const date = file.uploadTime instanceof firebase.firestore.Timestamp ? 
                    file.uploadTime.toDate() : new Date(file.uploadTime);
                formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            }
            
            // Galerie-Element erstellen
            const galleryItem = document.createElement('div');
            galleryItem.className = 'gallery-item';
            
            // URL prüfen
            if (!file.url) {
                console.error('Bild ohne URL gefunden:', file);
                continue;
            }
            
            galleryItem.innerHTML = `
                <img src="${file.url}" alt="${type === 'construction_site' ? 'Baustellenfoto' : 'Dokument'}">
                <div class="gallery-item-info">
                    <div>${formattedDate}</div>
                    <div>${employeeName}</div>
                    ${file.comment ? `<div class="image-comment-display"><strong>Kommentar:</strong> ${file.comment}</div>` : ''}
                </div>
            `;
            
            // Event-Listener für Bild-Vorschau
            galleryItem.addEventListener('click', () => {
                showImagePreview(file, employeeName, formattedDate);
            });
            
            container.appendChild(galleryItem);
        }
        
    } catch (error) {
        console.error(`Fehler beim Laden der ${type}-Bilder:`, error);
        const container = document.getElementById(type === 'construction_site' ? 'site-photos-gallery' : 'documents-gallery');
        if (container) {
            container.innerHTML = `<div class="error-message">Fehler beim Laden der Bilder</div>`;
        }
    }
}

function displayProjectDetails(project) {
    try {
        console.log('Zeige Projektdetails an:', project);
        
        if (!project) {
            console.error('Kein Projekt zum Anzeigen vorhanden');
            return;
        }
        
        // Titel und Projektnummer
        if (projectTitle) projectTitle.textContent = project.name || 'Unbenanntes Projekt';
        if (projectNumber) projectNumber.textContent = project.number || '';
        
        // Status
        let statusText = 'Unbekannt';
        let statusClass = '';
        
        if (project.status) {
            switch (project.status) {
                case 'active':
                    statusText = 'Aktiv';
                    statusClass = 'status-active';
                    break;
                case 'completed':
                    statusText = 'Abgeschlossen';
                    statusClass = 'status-completed';
                    break;
                case 'paused':
                    statusText = 'Pausiert';
                    statusClass = 'status-paused';
                    break;
                case 'planned':
                    statusText = 'Geplant';
                    statusClass = 'status-planned';
                    break;
            }
        }
        
        if (detailStatus) {
            detailStatus.textContent = statusText;
            detailStatus.className = 'status-badge ' + statusClass;
        }
        
        // Standort
        if (detailLocation) detailLocation.textContent = project.location || '-';
        
        // Datumsangaben
        if (detailStartDate) {
            if (project.startDate) {
                const startDate = project.startDate instanceof firebase.firestore.Timestamp ?
                    project.startDate.toDate() : new Date(project.startDate);
                detailStartDate.textContent = startDate.toLocaleDateString('de-DE');
            } else {
                detailStartDate.textContent = '-';
            }
        }
        
        if (detailEndDate) {
            if (project.endDate) {
                const endDate = project.endDate instanceof firebase.firestore.Timestamp ?
                    project.endDate.toDate() : new Date(project.endDate);
                detailEndDate.textContent = endDate.toLocaleDateString('de-DE');
            } else {
                detailEndDate.textContent = '-';
            }
        }
        
        // Beschreibung
        if (detailDescription) {
            detailDescription.textContent = project.description || 'Keine Beschreibung vorhanden.';
        }
        
        console.log('Projektdetails erfolgreich angezeigt');
        
    } catch (error) {
        console.error('Fehler beim Anzeigen der Projektdetails:', error);
    }
}

function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.project-tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Aktiven Tab-Button markieren
            tabButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Aktiven Tab-Inhalt anzeigen
            const tabId = this.dataset.tab;
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === tabId) {
                    content.classList.add('active');
                }
            });
        });
    });
}

function setupFilters() {
    // Mitarbeiterfilter
    if (timeEmployeeFilter) {
        timeEmployeeFilter.addEventListener('change', function() {
            applyTimeEntriesFilter();
        });
    }
    
    // Datumsfilter
    if (timeDateFilter) {
        timeDateFilter.addEventListener('change', function() {
            applyTimeEntriesFilter();
        });
    }
    
    // Filter zurücksetzen
    if (clearTimeFilterBtn) {
        clearTimeFilterBtn.addEventListener('click', function() {
            if (timeEmployeeFilter) timeEmployeeFilter.value = 'all';
            if (timeDateFilter) timeDateFilter.value = '';
            applyTimeEntriesFilter();
        });
    }
}

function applyTimeEntriesFilter() {
    // Hier würde die Filterlogik implementiert werden
    // Für die erste Version laden wir einfach alle Zeiteinträge neu
    loadProjectTimeEntries(projectId);
}

function showError(message) {
    console.error('FEHLER:', message);
    
    // Fehlermeldung in der Projektüberschrift anzeigen
    if (projectTitle) {
        projectTitle.innerHTML = `<span style="color: #d9534f;"><i class="fas fa-exclamation-triangle"></i> Fehler</span>`;
    }
    
    // Detaillierte Fehlermeldung in der Beschreibung anzeigen
    if (detailDescription) {
        detailDescription.innerHTML = `<div class="error-message">${message}</div>`;
    }
    
    // Lade-Indikatoren mit Fehlermeldung ersetzen
    document.querySelectorAll('.loading-indicator').forEach(indicator => {
        indicator.textContent = 'Fehler beim Laden der Daten.';
        indicator.classList.add('error');
    });
    
    // Fehlermeldung auch in den Tab-Inhalten anzeigen
    document.querySelectorAll('.project-tab-content').forEach(tab => {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        
        // Vorhandenen Inhalt leeren und Fehlermeldung einfügen
        if (!tab.querySelector('.error-message')) {
            tab.innerHTML = '';
            tab.appendChild(errorElement);
        }
    });
}

// Zeiteinträge laden und anzeigen
async function loadProjectTimeEntries(projectId) {
    try {
        console.log('Lade Zeiteinträge für Projekt', projectId);
        
        // Tabelle direkt aus dem DOM holen, um sicherzustellen, dass wir immer eine aktuelle Referenz haben
        const timeEntriesTable = document.getElementById('time-entries-table');
        const tableBody = timeEntriesTable?.querySelector('tbody');
        
        console.log('DOM-Status beim Laden der Zeiteinträge:', {
            tableBody: tableBody,
            timeEntriesTableEl: timeEntriesTable
        });
        
        if (!tableBody) {
            console.error('FEHLER: Zeiteinträge-Tabellenkörper konnte nicht gefunden werden!');
            // Statt Alert versuchen wir, eine Fehlermeldung auf der Seite anzuzeigen
            const tableContainer = document.querySelector('.time-entries-table-container');
            if (tableContainer) {
                tableContainer.innerHTML = '<div class="error-message">Fehler beim Laden der Zeiteinträge: Tabelle nicht gefunden</div>';
            } else {
                console.error('Auch keine Tabellen-Container gefunden. DOM-Struktur könnte beschädigt sein.');
            }
            return;
        }
        
        // Tabelle leeren und Ladeindikator anzeigen
        tableBody.innerHTML = '<tr><td colspan="7" class="loading-indicator">Zeiteinträge werden geladen...</td></tr>';
        
        // Filter auslesen
        const employeeFilterEl = document.getElementById('time-employee-filter');
        const dateFilterEl = document.getElementById('time-date-filter');
        
        const employeeFilter = employeeFilterEl?.value || 'all';
        const dateFilter = dateFilterEl?.value || null;
        
        // Zeiteinträge laden
        let timeEntries = await DataService.getProjectTimeEntries(projectId);
        console.log(`${timeEntries?.length || 0} Zeiteinträge gefunden`, timeEntries && timeEntries.length > 0 ? timeEntries[0] : 'Keine Einträge');
        
        // Sicherstellen, dass timeEntries ein Array ist
        if (!timeEntries || !Array.isArray(timeEntries)) {
            console.error('Zeiteinträge konnten nicht geladen werden oder sind kein Array');
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Fehler beim Laden der Zeiteinträge</td></tr>';
            return;
        }
        
        // Filter anwenden
        if (employeeFilter !== 'all') {
            timeEntries = timeEntries.filter(entry => entry.employeeId === employeeFilter);
        }
        
        if (dateFilter) {
            const filterDate = new Date(dateFilter);
            // Nur das Datum vergleichen, nicht die Uhrzeit
            timeEntries = timeEntries.filter(entry => {
                const entryDate = new Date(entry.clockInTime);
                return entryDate.toDateString() === filterDate.toDateString();
            });
        }
        
        // Wenn keine Einträge vorhanden sind
        if (timeEntries.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Keine Zeiteinträge vorhanden</td></tr>';
            return;
        }
        
        // Nach Datum sortieren (neueste zuerst)
        timeEntries.sort((a, b) => new Date(b.clockInTime) - new Date(a.clockInTime));
        console.log('Sortierte Zeiteinträge:', timeEntries.length);
        
        // Mitarbeiternamen abrufen
        const employeePromises = timeEntries.map(entry => 
            DataService.getEmployeeById(entry.employeeId)
        );
        
        const employees = await Promise.all(employeePromises);
        console.log('Mitarbeiter geladen:', employees.length);
        
        // Für den Filter alle Mitarbeiter sammeln
        const uniqueEmployees = new Map();
        employees.forEach((employee, index) => {
            if (employee && !uniqueEmployees.has(employee.id)) {
                uniqueEmployees.set(employee.id, employee);
            }
        });
        
        // Mitarbeiter-Filter aktualisieren
        if (employeeFilterEl && uniqueEmployees.size > 0) {
            // Aktuelle Auswahl speichern
            const currentSelection = employeeFilterEl.value;
            
            // Bisherige Optionen entfernen (außer 'Alle Mitarbeiter')
            while (employeeFilterEl.options.length > 1) {
                employeeFilterEl.remove(1);
            }
            
            // Mitarbeiter hinzufügen
            uniqueEmployees.forEach(employee => {
                const option = document.createElement('option');
                option.value = employee.id;
                option.textContent = employee.name;
                employeeFilterEl.appendChild(option);
            });
            
            // Auswahl wiederherstellen, wenn möglich
            if (currentSelection && currentSelection !== 'all') {
                employeeFilterEl.value = currentSelection;
                // Fallback, falls der Mitarbeiter nicht mehr vorhanden ist
                if (employeeFilterEl.value !== currentSelection) {
                    employeeFilterEl.value = 'all';
                }
            }
        }
        
        // Tabelle leeren
        tableBody.innerHTML = '';
        console.log('Tabelle geleert, bereit zum Füllen mit', timeEntries.length, 'Einträgen');
        
        // Zeiteinträge anzeigen
        timeEntries.forEach((entry, index) => {
            const employee = employees[index] || { name: 'Unbekannt' };
            
            // Datum formatieren
            const clockInDate = new Date(entry.clockInTime);
            const date = clockInDate.toLocaleDateString('de-DE', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric' 
            });
            
            // Zeiten formatieren
            const clockInTime = formatTime(clockInDate);
            const clockOutTime = entry.clockOutTime ? formatTime(new Date(entry.clockOutTime)) : '-';
            
            // Arbeitsstunden berechnen mit Berücksichtigung der Pausenzeiten
            let workHours = '-';
            let pauseDetails = '';
            
            if (entry.clockOutTime) {
                // Pausenzeit ermitteln - unterstützt beide Formate (alt und neu)
                let pauseTotalTime = 0;
                if (entry.pauseTotalTime && entry.pauseTotalTime > 0) {
                    pauseTotalTime = entry.pauseTotalTime; // Neues Format: Millisekunden
                } else if (entry.pauseTime && entry.pauseTime > 0) {
                    pauseTotalTime = entry.pauseTime * 60 * 1000; // Altes Format: Minuten → Millisekunden
                }
                const totalTimeMs = new Date(entry.clockOutTime) - new Date(entry.clockInTime);
                const actualWorkTimeMs = totalTimeMs - pauseTotalTime;
                
                // Anzeige in Stunden und Minuten, nicht als Dezimalzahl
                const totalMinutes = Math.floor(actualWorkTimeMs / 60000);
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                workHours = `${hours}h ${minutes}min`;
                
                // Gesonderte Pauseninformationen
                if (pauseTotalTime > 0) {
                    const pauseMinutes = Math.floor(pauseTotalTime / 60000);
                    const pauseHours = Math.floor(pauseMinutes / 60);
                    const remainingMinutes = pauseMinutes % 60;
                    
                    // Pauseninformationen als separate Zeile
                    const pauseTimeFormatted = pauseHours > 0 ? 
                        `${pauseHours}h ${remainingMinutes}min` : 
                        `${remainingMinutes}min`;
                        
                    pauseDetails = `<div class="pause-info">Pause: ${pauseTimeFormatted}</div>`;
                    
                    // Wenn detaillierte Pausendaten vorhanden sind, diese aufbereiten
                    if (entry.pauseDetails && entry.pauseDetails.length > 0) {
                        pauseDetails += '<details class="pause-details"><summary>Pausendetails</summary><ul>';
                        
                        for (const pause of entry.pauseDetails) {
                            try {
                                // Konvertierung der Zeitstempel in Date-Objekte
                                const startDate = pause.start instanceof firebase.firestore.Timestamp ?
                                    pause.start.toDate() : new Date(pause.start);
                                const endDate = pause.end instanceof firebase.firestore.Timestamp ?
                                    pause.end.toDate() : new Date(pause.end);
                                
                                // Formatierung der Zeiten
                                const startTime = startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                const endTime = endDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                
                                // Berechnung der Pausendauer
                                const pauseDuration = Math.floor((endDate - startDate) / 60000);
                                const pauseHours = Math.floor(pauseDuration / 60);
                                const pauseMinutes = pauseDuration % 60;
                                
                                const formattedDuration = pauseHours > 0 ? 
                                    `${pauseHours}h ${pauseMinutes}min` : 
                                    `${pauseMinutes}min`;
                                
                                pauseDetails += `<li>${startTime} - ${endTime} (${formattedDuration})</li>`;
                            } catch (e) {
                                console.error('Fehler bei der Verarbeitung einer Pause:', e, pause);
                                pauseDetails += '<li>Ungültige Pausenzeit</li>';
                            }
                        }
                        
                        pauseDetails += '</ul></details>';
                    }
                }
            }
            
            // Prüfen, ob Bilder angehangen sind
            const hasImages = (entry.sitePhotoUploads && entry.sitePhotoUploads.length > 0) || 
                              (entry.documentPhotoUploads && entry.documentPhotoUploads.length > 0) ||
                              (entry.photos && entry.photos.length > 0) ||
                              (entry.documents && entry.documents.length > 0);
            
            // Standortinformationen formatieren und Debug-Ausgabe
            console.log('Standortdaten für Eintrag:', entry.id, {
                clockInLocation: entry.clockInLocation,
                clockOutLocation: entry.clockOutLocation
            });
            
            let locationInfo = '<div class="location-info">';
            let hasLocationInfo = false;
            
            // Einstempel-Standort
            if (entry.clockInLocation) {
                // Koordinaten extrahieren mit verschiedenen möglichen Datenstrukturen
                let inLat, inLng;
                const inLoc = entry.clockInLocation;
                
                if (inLoc.coords && inLoc.coords.latitude && inLoc.coords.longitude) {
                    inLat = inLoc.coords.latitude;
                    inLng = inLoc.coords.longitude;
                } else if (inLoc.latitude && inLoc.longitude) {
                    inLat = inLoc.latitude;
                    inLng = inLoc.longitude;
                } else if (typeof inLoc === 'object') {
                    // Versuche, Lat/Lng aus anderen möglichen Formaten zu extrahieren
                    const keys = Object.keys(inLoc);
                    console.log('Verfügbare Schlüssel für clockInLocation:', keys);
                    
                    // Mögliche alternative Schlüssel versuchen
                    for (const latKey of ['lat', 'latitude', 'Latitude']) {
                        for (const lngKey of ['lng', 'lon', 'long', 'longitude', 'Longitude']) {
                            if (inLoc[latKey] !== undefined && inLoc[lngKey] !== undefined) {
                                inLat = inLoc[latKey];
                                inLng = inLoc[lngKey];
                                break;
                            }
                        }
                    }
                }
                
                // Wenn Koordinaten gefunden wurden
                if (inLat && inLng) {
                    hasLocationInfo = true;
                    locationInfo += `
                        <div class="location-item">
                            <i class="fas fa-map-marker-alt"></i>
                            <a href="https://maps.google.com/?q=${inLat},${inLng}" target="_blank" class="location-link" title="Einstempel-Standort anzeigen">
                                <span class="location-type">Einstempel-Standort</span>
                                <span class="location-coords">(${inLat.toFixed(5)}, ${inLng.toFixed(5)})</span>
                            </a>
                        </div>`;
                    console.log('Einstempelort gefunden:', inLat, inLng);
                } else {
                    console.warn('Ungültiger Einstempel-Standort Format:', inLoc);
                    locationInfo += '<div class="location-item location-error">Einstempelort: Format nicht erkannt</div>';
                }
            }
            
            // Ausstempel-Standort
            if (entry.clockOutLocation) {
                // Koordinaten extrahieren mit verschiedenen möglichen Datenstrukturen
                let outLat, outLng;
                const outLoc = entry.clockOutLocation;
                
                if (outLoc.coords && outLoc.coords.latitude && outLoc.coords.longitude) {
                    outLat = outLoc.coords.latitude;
                    outLng = outLoc.coords.longitude;
                } else if (outLoc.latitude && outLoc.longitude) {
                    outLat = outLoc.latitude;
                    outLng = outLoc.longitude;
                } else if (typeof outLoc === 'object') {
                    // Versuche, Lat/Lng aus anderen möglichen Formaten zu extrahieren
                    const keys = Object.keys(outLoc);
                    console.log('Verfügbare Schlüssel für clockOutLocation:', keys);
                    
                    // Mögliche alternative Schlüssel versuchen
                    for (const latKey of ['lat', 'latitude', 'Latitude']) {
                        for (const lngKey of ['lng', 'lon', 'long', 'longitude', 'Longitude']) {
                            if (outLoc[latKey] !== undefined && outLoc[lngKey] !== undefined) {
                                outLat = outLoc[latKey];
                                outLng = outLoc[lngKey];
                                break;
                            }
                        }
                    }
                }
                
                // Wenn Koordinaten gefunden wurden
                if (outLat && outLng) {
                    hasLocationInfo = true;
                    locationInfo += `
                        <div class="location-item">
                            <i class="fas fa-map-marker-alt"></i>
                            <a href="https://maps.google.com/?q=${outLat},${outLng}" target="_blank" class="location-link" title="Ausstempel-Standort anzeigen">
                                <span class="location-type">Ausstempel-Standort</span>
                                <span class="location-coords">(${outLat.toFixed(5)}, ${outLng.toFixed(5)})</span>
                            </a>
                        </div>`;
                    console.log('Ausstempelort gefunden:', outLat, outLng);
                } else if (entry.clockOutTime) {
                    console.warn('Ausgecheckt aber kein gültiger Ausstempel-Standort:', outLoc);
                    locationInfo += '<div class="location-item location-error">Ausstempelort: Format nicht erkannt</div>';
                }
            }
            
            locationInfo += '</div>';
            
            // Wenn keine Standortinformationen vorhanden sind
            if (!hasLocationInfo) {
                console.log('Keine Standortdaten für Eintrag:', entry.id);
                locationInfo = '';
            }
            
            const row = document.createElement('tr');
            row.dataset.entryId = entry.id; // Für spätere Referenz
            
            // Bei Klick auf die Zeile Detailansicht öffnen
            row.addEventListener('click', function(e) {
                // Nur wenn nicht auf einen Button geklickt wurde
                if (!e.target.closest('button')) {
                    console.log('Zeiteintrag angeklickt:', entry.id);
                    // Später: Detailansicht implementieren
                }
            });
            
            // Debug-Ausgabe vor dem Einfügen
            console.log('Füge Zeile hinzu für:', employee.name, 'mit ID:', entry.id);
            
            // Statt innerHTML zu verwenden, erstellen wir alle Zellen explizit
            // Mitarbeiterzelle
            const empCell = document.createElement('td');
            empCell.className = 'employee-cell';
            empCell.textContent = employee.name;
            row.appendChild(empCell);
            
            // Datumszelle
            const dateCell = document.createElement('td');
            dateCell.className = 'date-cell';
            dateCell.textContent = date;
            row.appendChild(dateCell);
            
            // Einstempelzeit
            const clockInCell = document.createElement('td');
            clockInCell.className = 'time-cell';
            clockInCell.textContent = clockInTime;
            row.appendChild(clockInCell);
            
            // Ausstempelzeit
            const clockOutCell = document.createElement('td');
            clockOutCell.className = 'time-cell';
            clockOutCell.textContent = clockOutTime;
            row.appendChild(clockOutCell);
            
            // Arbeitszeit mit Pausendetails
            const worktimeCell = document.createElement('td');
            worktimeCell.className = 'worktime-cell';
            
            const worktimePrimary = document.createElement('div');
            worktimePrimary.className = 'worktime-primary';
            worktimePrimary.textContent = workHours;
            worktimeCell.appendChild(worktimePrimary);
            
            if (pauseDetails) {
                worktimeCell.insertAdjacentHTML('beforeend', pauseDetails);
            }
            
            row.appendChild(worktimeCell);
            
            // Notizen & Standort
            const notesCell = document.createElement('td');
            notesCell.className = 'notes-cell';
            
            const noteText = document.createElement('div');
            noteText.className = 'note-text';
            noteText.textContent = entry.notes || '-';
            notesCell.appendChild(noteText);
            
            if (locationInfo) {
                notesCell.insertAdjacentHTML('beforeend', locationInfo);
            }
            
            row.appendChild(notesCell);
            
            // Aktionen
            const actionsCell = document.createElement('td');
            actionsCell.className = 'actions-cell';
            
            const actionButtons = document.createElement('div');
            actionButtons.className = 'action-buttons';
            
            if (hasImages) {
                const viewImagesBtn = document.createElement('button');
                viewImagesBtn.className = 'btn small-btn view-images-btn';
                viewImagesBtn.dataset.entryId = entry.id;
                viewImagesBtn.title = 'Bilder anzeigen';
                viewImagesBtn.innerHTML = '<i class="fas fa-images"></i>';
                actionButtons.appendChild(viewImagesBtn);
            }
            
            const editBtn = document.createElement('button');
            editBtn.className = 'btn small-btn edit-entry-btn';
            editBtn.dataset.entryId = entry.id;
            editBtn.title = 'Bearbeiten';
            editBtn.innerHTML = '<i class="fas fa-edit"></i>';
            actionButtons.appendChild(editBtn);
            
            actionsCell.appendChild(actionButtons);
            row.appendChild(actionsCell);
            
            // Debug-Ausgabe für die erstellte Zeile
            console.log('Zeile erstellt mit ' + row.childNodes.length + ' Zellen, ID: ' + entry.id);
            
            // Zeile zum Tabellenkörper hinzufügen
            tableBody.appendChild(row);
            
            // Debug-Ausgabe nach dem Einfügen
            console.log('Tabellenkörper enthält jetzt ' + tableBody.childNodes.length + ' Zeilen');
        });
        
        // Event-Listener für die Buttons hinzufügen
        setupEntryButtons();
        
    } catch (error) {
        console.error('Fehler beim Laden der Zeiteinträge:', error);
        if (timeEntriesTable) {
            timeEntriesTable.innerHTML = '<tr><td colspan="7" class="text-center error">Fehler beim Laden der Zeiteinträge</td></tr>';
        }
    }
}

// Event-Listener für die Buttons in der Zeiteintrags-Tabelle
function setupEntryButtons() {
    // Bilder anzeigen
    document.querySelectorAll('.view-images-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const entryId = this.dataset.entryId;
            console.log('Bilder anzeigen für Zeiteintrag:', entryId);
            
            // Hier später: Bildanzeige implementieren
        });
    });
    
    // Bearbeiten - immer verfügbar, da nur Admin an dieser Stelle
    document.querySelectorAll('.edit-entry-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const entryId = this.dataset.entryId;
            console.log('Bearbeiten von Zeiteintrag:', entryId);
            
            // Edit-Modal öffnen (Funktion ist in project-simple.html definiert)
            if (typeof openEditTimeEntryModal === 'function') {
                openEditTimeEntryModal(entryId);
            } else {
                console.error('openEditTimeEntryModal Funktion nicht gefunden');
                alert('Edit-Funktion ist nicht verfügbar. Bitte laden Sie die Seite neu.');
            }
        });
    });
}

// Projektbilder laden
async function loadProjectImages(projectId, type = 'construction_site') {
    try {
        console.log(`Lade ${type}-Bilder für Projekt`, projectId);
        
        // Galerie-Container direkt aus dem DOM holen, um sicherzustellen, dass wir immer eine aktuelle Referenz haben
        const containerId = type === 'construction_site' ? 'site-photos-gallery' : 'documents-gallery';
        const container = document.getElementById(containerId);
        
        console.log(`DOM-Status beim Laden der Bilder (${type}):`, {
            containerId: containerId,
            containerExists: !!container
        });
        
        if (!container) {
            console.error(`Container für Galerie (${containerId}) nicht gefunden`);
            return;
        }
        
        // Container leeren und Ladeindikator anzeigen
        container.innerHTML = '<div class="loading-indicator">Bilder werden geladen...</div>';
        
        // Bilder laden
        const files = await DataService.getProjectFiles(projectId, type);
        console.log(`${files?.length || 0} Bilder für ${type} gefunden`, files && files.length > 0 ? files[0] : 'Keine Dateien');
        
        // Wenn keine Bilder vorhanden sind
        if (!files || files.length === 0) {
            container.innerHTML = `<div class="no-content-message">Keine ${type === 'construction_site' ? 'Baustellenfotos' : 'Dokumente'} vorhanden</div>`;
            return;
        }
        
        // Nach Datum sortieren (neueste zuerst)
        files.sort((a, b) => {
            const dateA = a.timestamp instanceof firebase.firestore.Timestamp ? a.timestamp.toDate() : new Date(a.timestamp || a.uploadDate || 0);
            const dateB = b.timestamp instanceof firebase.firestore.Timestamp ? b.timestamp.toDate() : new Date(b.timestamp || b.uploadDate || 0);
            return dateB - dateA;
        });
        
        // Container leeren
        container.innerHTML = '';
        console.log(`Container '${containerId}' geleert, bereit zum Füllen mit ${files.length} Bildern`);
        
        // Mitarbeiternamen abrufen für die Bilder
        const employeePromises = files.map(file => 
            file.employeeId ? DataService.getEmployeeById(file.employeeId) : Promise.resolve(null)
        );
        
        const employees = await Promise.all(employeePromises);
        console.log(`${employees.filter(emp => emp !== null).length} Mitarbeiter für Bilder geladen`);
        
        // Bilder anzeigen - mit zusätzlichen Debug-Ausgaben
        files.forEach((file, index) => {
            console.log(`Erstelle Galerie-Element für Bild ${index+1}/${files.length}, URL: ${file.url ? 'vorhanden' : 'fehlt!'}`);
            
            const galleryItem = document.createElement('div');
            galleryItem.className = 'gallery-item';
            
            // Datum aus verschiedenen möglichen Quellen extrahieren
            let date;
            if (file.timestamp instanceof firebase.firestore.Timestamp) {
                date = file.timestamp.toDate();
            } else if (file.uploadDate instanceof firebase.firestore.Timestamp) {
                date = file.uploadDate.toDate();
            } else if (file.timestamp) {
                date = new Date(file.timestamp);
            } else if (file.uploadDate) {
                date = new Date(file.uploadDate);
            } else {
                date = new Date(); // Fallback
            }
            
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            
            // Mitarbeiter zuordnen
            const employee = employees[index] || { name: 'Unbekannt' };
            
            // Kommentar zum Bild abrufen (falls vorhanden)
            // Wichtig: Verwende nur den Kommentar des Bildes selbst, nicht die Beschreibung des Zeiteintrags
            const comment = file.comment || '';
            
            // Debug-Ausgabe für die Bildkommentare
            console.log(`Bild ${index+1} Kommentar:`, { 
                fileComment: file.comment,
                fileNotes: file.notes,
                verwendeterKommentar: comment,
                alleProperties: Object.keys(file)
            });
            
            // Debug: Ausgabe der vollständigen Datei-Eigenschaften für die Fehlersuche
            console.log(`Datei-Objekt für Bild ${index+1}:`, JSON.stringify(file, null, 2));
            
            galleryItem.innerHTML = `
                <img src="${file.url}" alt="${type === 'construction_site' ? 'Baustellenfoto' : 'Dokument'}">
                <div class="gallery-item-info">
                    <div>${formattedDate}</div>
                    <div>${employee.name}</div>
                    ${comment ? `<div class="image-comment-display"><strong>Kommentar:</strong> ${comment}</div>` : ''}
                </div>
            `;
            
            // Event-Listener für Klick hinzufügen
            galleryItem.addEventListener('click', () => {
                showImagePreview(file, employee.name, formattedDate);
            });
            
            container.appendChild(galleryItem);
        });
        
    } catch (error) {
        console.error(`Fehler beim Laden der ${type === 'construction_site' ? 'Baustellenfotos' : 'Dokumente'}:`, error);
        const container = document.getElementById(type === 'construction_site' ? 'site-photos-gallery' : 'documents-gallery');
        if (container) {
            container.innerHTML = `<div class="error-message">Fehler beim Laden der Bilder</div>`;
        }
    }
}

// Bild-Vorschau anzeigen
function showImagePreview(file, employeeName, formattedDate) {
    // Prüfen, ob bereits ein Vorschau-Modal existiert, falls nicht, erstellen
    let previewModal = document.getElementById('image-preview-modal');
    
    if (!previewModal) {
        previewModal = document.createElement('div');
        previewModal.id = 'image-preview-modal';
        previewModal.className = 'modal';
        
        previewModal.innerHTML = `
            <div class="modal-content fullscreen-modal">
                <div class="modal-header">
                    <h3>Bildvorschau</h3>
                    <div class="modal-controls">
                        <button type="button" class="zoom-in-btn" title="Vergrößern">+</button>
                        <button type="button" class="zoom-out-btn" title="Verkleinern">-</button>
                        <button type="button" class="reset-zoom-btn" title="Zoom zurücksetzen">↺</button>
                        <button type="button" class="close-modal-btn">&times;</button>
                    </div>
                </div>
                <div class="modal-body">
                    <div class="image-preview-container">
                        <div class="image-zoom-container">
                            <img id="preview-image" src="" alt="Bildvorschau">
                        </div>
                    </div>
                    <div class="image-details">
                        <div class="metadata-box">
                            <h4>Bild-Informationen</h4>
                            <p id="preview-date"></p>
                            <p id="preview-employee"></p>
                            <p id="preview-upload-date"></p>
                            <p id="preview-upload-by"></p>
                        </div>
                        <div id="preview-comment-container" class="metadata-box"></div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(previewModal);
        
        // Stylesheet für Vollbild und Zoom-Funktionalität hinzufügen
        if (!document.getElementById('image-preview-styles')) {
            const styleElement = document.createElement('style');
            styleElement.id = 'image-preview-styles';
            styleElement.textContent = `
                .fullscreen-modal {
                    width: 90%;
                    max-width: 1200px;
                    height: 90vh;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                }
                .modal-controls {
                    display: flex;
                    align-items: center;
                }
                .modal-controls button {
                    margin-left: 8px;
                    width: 30px;
                    height: 30px;
                    font-size: 18px;
                    cursor: pointer;
                    border-radius: 4px;
                    border: 1px solid #ccc;
                    background: #f8f8f8;
                }
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .modal-body {
                    display: flex;
                    flex: 1;
                    overflow: hidden;
                }
                .image-preview-container {
                    flex: 3;
                    overflow: auto;
                    position: relative;
                    background-color: #f0f0f0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .image-zoom-container {
                    position: relative;
                    overflow: auto;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                #preview-image {
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                    transition: transform 0.2s ease;
                }
                .image-details {
                    flex: 1;
                    padding: 10px;
                    overflow-y: auto;
                    border-left: 1px solid #ccc;
                }
                .metadata-box {
                    background-color: #f8f8f8;
                    border-radius: 4px;
                    padding: 10px;
                    margin-bottom: 15px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .metadata-box h4 {
                    margin-top: 0;
                    border-bottom: 1px solid #ddd;
                    padding-bottom: 5px;
                    margin-bottom: 10px;
                }
                .image-comment {
                    white-space: pre-wrap;
                }
            `;
            document.head.appendChild(styleElement);
        }
    }
    
    // Modal anzeigen
    previewModal.style.display = 'block';
    
    // Alles innerhalb eines timeouts ausführen, um DOM-Aktualisierungen zu berücksichtigen
    setTimeout(() => {
        // Referenzen zu allen DOM-Elementen holen
        const previewImage = document.getElementById('preview-image');
        const previewDate = document.getElementById('preview-date');
        const previewEmployee = document.getElementById('preview-employee');
        const previewUploadDate = document.getElementById('preview-upload-date');
        const previewUploadBy = document.getElementById('preview-upload-by');
        const previewCommentContainer = document.getElementById('preview-comment-container');
        const closeButton = previewModal.querySelector('.close-modal-btn');
        const zoomInButton = previewModal.querySelector('.zoom-in-btn');
        const zoomOutButton = previewModal.querySelector('.zoom-out-btn');
        const resetZoomButton = previewModal.querySelector('.reset-zoom-btn');
        
        // Aktuelle Zoom-Stufe definieren
        let currentZoom = 1;
        
        // Hilfsfunktion zum Aktualisieren des Zooms
        function updateZoom() {
            if (previewImage) {
                previewImage.style.transform = `scale(${currentZoom})`;
            }
        }
        
        // Bildvorschau aktualisieren
        if (previewImage) {
            previewImage.src = file.url;
            previewImage.style.transform = 'scale(1)';
        }
        
        // Datum und Mitarbeiter anzeigen
        if (previewDate) {
            previewDate.textContent = `Aufnahmedatum: ${formattedDate || 'Unbekannt'}`;
        }
        
        if (previewEmployee) {
            previewEmployee.textContent = `Mitarbeiter: ${employeeName || 'Unbekannt'}`;
        }
        
        // Upload-Informationen anzeigen (wenn verfügbar)
        const uploadDate = file.uploadDate ? new Date(file.uploadDate.seconds * 1000) : null;
        const formattedUploadDate = uploadDate ? uploadDate.toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'Unbekannt';
        
        if (previewUploadDate) {
            previewUploadDate.textContent = `Hochgeladen am: ${formattedUploadDate}`;
        }
        
        if (previewUploadBy) {
            previewUploadBy.textContent = `Hochgeladen von: ${file.uploadedBy || employeeName || 'Unbekannt'}`;
        }
        
        // Kommentar anzeigen, falls vorhanden
        if (previewCommentContainer) {
            if (file.comment || file.notes) {
                previewCommentContainer.innerHTML = `
                    <h4>Kommentar:</h4>
                    <p class="image-comment">${file.comment || file.notes || ''}</p>
                `;
            } else {
                previewCommentContainer.innerHTML = '';
            }
        }
        
        // Event-Listener hinzufügen
        if (closeButton) {
            closeButton.addEventListener('click', function() {
                previewModal.style.display = 'none';
            });
        }
        
        if (zoomInButton) {
            zoomInButton.addEventListener('click', function() {
                currentZoom += 0.25;
                if (currentZoom > 3) currentZoom = 3; // Max Zoom = 300%
                updateZoom();
            });
        }
        
        if (zoomOutButton) {
            zoomOutButton.addEventListener('click', function() {
                currentZoom -= 0.25;
                if (currentZoom < 0.5) currentZoom = 0.5; // Min Zoom = 50%
                updateZoom();
            });
        }
        
        if (resetZoomButton) {
            resetZoomButton.addEventListener('click', function() {
                currentZoom = 1;
                updateZoom();
            });
        }
        
        // Doppelklick auf Bild = Zoom umschalten
        if (previewImage) {
            previewImage.addEventListener('dblclick', function() {
                currentZoom = currentZoom === 1 ? 2 : 1; // Toggle zwischen 100% und 200%
                updateZoom();
            });
        }
    }, 50); // Kurze Verzögerung, um sicherzustellen, dass das DOM aktualisiert wurde
}

// Hilfsfunktion: Zeit formatieren
function formatTime(date) {
    return date.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Hilfsfunktion für Event-Listener der Zeiteinträge
function addTimeEntryButtonListeners() {
    // Details anzeigen
    document.querySelectorAll('.view-entry-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const entryId = this.dataset.entryId;
            console.log('Details anzeigen für Zeiteintrag:', entryId);
            
            // Hier könnte die Detailanzeige implementiert werden
            alert('Detailanzeige für Zeiteintrag ' + entryId + ' ist noch nicht implementiert.');
        });
    });
}
