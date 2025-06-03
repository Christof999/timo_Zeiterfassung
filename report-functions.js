/**
 * Zeiteintragsberichte und Bildanzeige für Lauffer Zeiterfassung
 * Bereinigt und vereinfacht für zuverlässiges Verhalten
 */

// Globale Variablen für Modals und Event-Listener
let reportModal = null;
let fullscreenModal = null;

// Nach dem Laden der Seite initialisieren
document.addEventListener('DOMContentLoaded', function() {
    console.log('Report-Funktionen werden initialisiert...');
    
    // Besucht bereits bearbeitete Zeilen, um Doppelarbeit zu vermeiden
    const processedRows = new Set();
    
    // WICHTIG: Tabellenzellen prüfen und Report-Buttons hinzufügen
    function injectReportButtons() {
        const timeTable = document.getElementById('time-entries-table');
        if (!timeTable) {
            // Tabelle noch nicht geladen - nichts tun
            return;
        }
        
        const rows = timeTable.querySelectorAll('tbody tr');
        let updatedRows = 0;
        
        rows.forEach(row => {
            // Bereits verarbeitete Zeilen überspringen
            const rowId = row.id || Math.random().toString(36).substring(2);
            if (!row.id) row.id = rowId;
            
            if (processedRows.has(rowId) || row.querySelector('.report-btn')) {
                return; // Diese Zeile wurde bereits verarbeitet
            }
            
            // Prüfen, ob es sich um eine Datenspalte oder Meldung handelt
            const cells = row.querySelectorAll('td');
            if (cells.length <= 2 || cells[0].getAttribute('colspan')) {
                processedRows.add(rowId);
                return; // Keine reguläre Datenzeile
            }
            
            // Prüfen, ob es bereits eine Aktionen-Spalte gibt
            let actionsCell;
            if (cells.length >= 7) {
                actionsCell = cells[6]; // Nutze vorhandene Aktionen-Spalte
            } else {
                // Erstelle neue Aktionen-Spalte
                actionsCell = document.createElement('td');
                row.appendChild(actionsCell);
            }
            
            // Zeiteintrags-ID extrahieren (falls möglich)
            const rowData = row.dataset;
            let entryId = rowData.entryId || '';
            let projectId = rowData.projectId || '';
            let employeeId = rowData.employeeId || '';
            
            // Versuche, die IDs aus dem DOM oder den Datenattributen zu extrahieren
            if (!entryId || !projectId) {
                // Versuche, die Informationen aus den Zelleninhalten zu extrahieren
                const dateCell = cells[1] ? cells[1].textContent.trim() : '';
                const nameCell = cells[0] ? cells[0].textContent.trim() : '';
                
                // Erstelle eine eindeutige ID basierend auf dem Datum und Namen
                entryId = entryId || `entry-${dateCell}-${nameCell}`.replace(/[^a-z0-9]/gi, '-');
                projectId = projectId || document.querySelector('#project-detail-title')?.textContent?.trim() || 'current-project';
                employeeId = employeeId || nameCell.replace(/[^a-z0-9]/gi, '-');
            }
            
            // Button erstellen
            const reportButton = document.createElement('button');
            reportButton.className = 'btn primary-btn report-btn';
            reportButton.textContent = 'Bericht';
            reportButton.dataset.entryId = entryId;
            reportButton.dataset.projectId = projectId;
            reportButton.dataset.employeeId = employeeId;
            
            // Button-Stil anpassen
            reportButton.style.backgroundColor = '#ff6b00';
            reportButton.style.color = 'white';
            reportButton.style.fontWeight = 'bold';
            reportButton.style.padding = '8px 12px';
            reportButton.style.display = 'inline-block';
            reportButton.style.margin = '0 auto';
            reportButton.style.cursor = 'pointer';
            reportButton.style.borderRadius = '4px';
            reportButton.style.border = 'none';
            reportButton.style.textAlign = 'center';
            
            // Alte Inhalte entfernen und Button hinzufügen
            actionsCell.innerHTML = '';
            actionsCell.appendChild(reportButton);
            
            // Event-Listener hinzufügen
            reportButton.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                
                console.log('Bericht-Button geklickt', this.dataset);
                
                const entryId = this.dataset.entryId;
                const projectId = this.dataset.projectId;
                const employeeId = this.dataset.employeeId;
                
                if (entryId && projectId) {
                    showTimeEntryReport(entryId, projectId, employeeId);
                } else {
                    console.error('Fehlende Daten für den Bericht', this.dataset);
                }
            });
            
            // Als verarbeitet markieren
            processedRows.add(rowId);
            updatedRows++;
        });
        
        if (updatedRows > 0) {
            console.log(`${updatedRows} neue Report-Buttons hinzugefügt`);
        }
    }
    
    // Erste Ausführung
    setTimeout(injectReportButtons, 500);
    
    // Periodische Überprüfung (alle 3 Sekunden, weniger oft als vorher)
    const intervalId = setInterval(injectReportButtons, 3000);
    
    // Nach 30 Sekunden Intervall stoppen, um Ressourcen zu sparen
    setTimeout(() => {
        clearInterval(intervalId);
        console.log('Automatisches Hinzufügen von Report-Buttons beendet');
    }, 30000);
    
    // Beobachte nur die Tabelle auf Änderungen, nicht den gesamten DOM
    setTimeout(() => {
        const timeTable = document.getElementById('time-entries-table');
        if (timeTable) {
            const observer = new MutationObserver(injectReportButtons);
            observer.observe(timeTable, { childList: true, subtree: true });
            console.log('MutationObserver für Zeiteinträge-Tabelle aktiviert');
        }
    }, 1000);
    
    // Event-Delegation für die gesamte Seite
    document.addEventListener('click', function(event) {
        // Bericht-Button geklickt wird über die direkten Event-Listener verarbeitet
        
        // Bildvergrößerung - für ALLE Bilder in der Anwendung
        if (event.target.tagName === 'IMG') {
            // Nur auf Bilder reagieren, die vergrößerbar sein sollen
            if (event.target.classList.contains('report-gallery-image') || 
                event.target.classList.contains('gallery-preview-image') || 
                event.target.hasAttribute('data-fullscreen') ||
                event.target.closest('.gallery-item') ||
                event.target.closest('.report-gallery-item')) {
                
                event.preventDefault();
                console.log('Bild geklickt, zeige Vollbildansicht:', event.target.src);
                event.stopPropagation();
                
                // Öffne das Bild in Vollbildansicht
                openFullscreenImage(event.target.src);
                
                // Schließe alle anderen Modals
                const otherModals = document.querySelectorAll('.modal');
                otherModals.forEach(modal => {
                    if (modal.style.display === 'block') {
                        modal.style.display = 'none';
                    }
                });
            }
        }
        
        // Schließen der Vollbildansicht
        if (event.target.classList.contains('close-fullscreen-btn') || 
            event.target.classList.contains('fullscreen-modal')) {
            event.preventDefault();
            closeFullscreenImage();
        }
    });
});

/**
 * Zeigt einen Bericht für einen Zeiteintrag an
 * @param {string} timeEntryId - ID des Zeiteintrags
 * @param {string} projectId - ID des Projekts
 * @param {string} employeeId - ID des Mitarbeiters
 */
async function showTimeEntryReport(timeEntryId, projectId, employeeId) {
    try {
        console.log('Zeige Bericht für:', timeEntryId, projectId, employeeId);
        
        // Variablen initialisieren
        let timeEntry = null;
        let project = null;
        let employee = null;
        
        // Verwende die neue Funktion aus report-simple-fix.js
        if (typeof showSimpleReport === 'function') {
            return showSimpleReport(timeEntryId, projectId, employeeId);
        }
        
        // DIREKT den Zeiteintrag über die ID laden
        
        try {
            // Direkter Zugriff auf Firestore
            const timeEntryDoc = await firebase.firestore()
                .collection('timeEntries')
                .doc(timeEntryId)
                .get();
            
            if (timeEntryDoc.exists) {
                timeEntry = {
                    id: timeEntryDoc.id,
                    ...timeEntryDoc.data()
                };
                console.log('Zeiteintrag direkt aus Firestore geladen:', timeEntry);
            } else {
                console.error('Zeiteintrag nicht in Firestore gefunden:', timeEntryId);
            }
        } catch (firestoreError) {
            console.error('Fehler beim direkten Zugriff auf Firestore:', firestoreError);
        }
        
        // Wenn keine direkte ID-Suche erfolgreich war und wir einen generierten Namen haben
        if (!timeEntry && timeEntryId && timeEntryId.startsWith('entry-')) {
            // Format: entry-26-5-2025-Michael-Dorner - wir extrahieren Datum und Namen
            const parts = timeEntryId.split('-');
            
            if (parts.length >= 5) {
                // Datum im Format 26-5-2025 extrahieren
                const dateStr = `${parts[1]}.${parts[2]}.${parts[3]}`;
                
                // Mitarbeitername extrahieren und Bindestriche durch Leerzeichen ersetzen
                let employeeName = parts.slice(4).join(' ').replace(/-/g, ' ');
                
                console.log(`Versuche Zeiteintrag anhand von Datum ${dateStr} und Mitarbeiter ${employeeName} zu finden`);
                
                // WICHTIG: Füge die ursprüngliche ID als Parameter hinzu, um exakten Eintrag zu finden
                timeEntry = await DataService.getTimeEntryByDateAndName(dateStr, employeeName, projectId, timeEntryId);
                
                if (timeEntry) {
                    // Wenn der Zeiteintrag gefunden wurde, können wir die richtigen IDs verwenden
                    timeEntryId = timeEntry.id;
                    projectId = timeEntry.projectId;
                    employeeId = timeEntry.employeeId;
                    
                    console.log('Zeiteintrag gefunden:', timeEntry);
                    console.log('Verwende die richtigen IDs:', timeEntryId, projectId, employeeId);
                }
            }
        }
        
        // Versuche die Daten mit den IDs zu laden
        if (!timeEntry) timeEntry = await DataService.getTimeEntryById(timeEntryId);
        if (!project) project = await DataService.getProjectById(projectId);
        if (!employee) employee = await DataService.getEmployeeById(employeeId);
        
        // Wenn die Daten immer noch nicht geladen werden konnten, versuchen wir es mit der kompletten Projektliste
        if (!project) {
            const allProjects = await DataService.getAllProjects();
            if (allProjects && allProjects.length > 0) {
                // Suche nach einem Projekt mit ähnlichem Namen
                const matchingProject = allProjects.find(p => 
                    p.name && p.name.toLowerCase().includes(projectId.toLowerCase()));
                
                if (matchingProject) {
                    project = matchingProject;
                    console.log('Projekt anhand des Namens gefunden:', project);
                }
            }
        }
        
        // Wenn der Mitarbeiter nicht gefunden wurde, versuche alle Mitarbeiter zu laden
        if (!employee) {
            const allEmployees = await DataService.getAllEmployees();
            if (allEmployees && allEmployees.length > 0) {
                // Suche nach einem Mitarbeiter mit ähnlichem Namen
                const matchingEmployee = allEmployees.find(e => 
                    e.name && (e.name.toLowerCase().includes(employeeId.toLowerCase()) || 
                    employeeId.toLowerCase().includes(e.name.toLowerCase())));
                
                if (matchingEmployee) {
                    employee = matchingEmployee;
                    console.log('Mitarbeiter anhand des Namens gefunden:', employee);
                }
            }
        }
        
        if (!timeEntry) {
            console.error('Zeiteintrag konnte nicht geladen werden');
            alert('Zeiteintrag konnte nicht gefunden werden. Es wird ein Demo-Bericht mit den verfügbaren Daten angezeigt.');
            
            // Erstelle einen Demo-Zeiteintrag mit den verfügbaren Daten
            const today = new Date();
            timeEntry = {
                id: 'demo-entry',
                clockInTime: today.setHours(today.getHours() - 8),
                clockOutTime: new Date(),
                notes: 'Demo-Zeiteintrag mit unvollständigen Daten'
            };
        }
        
        if (!project) {
            console.error('Projekt konnte nicht geladen werden');
            // Erstelle ein Demo-Projekt, wenn keines gefunden wurde
            project = {
                id: 'demo-project',
                name: projectId || 'Unbekanntes Projekt'
            };
        }
        
        if (!employee) {
            console.error('Mitarbeiter konnte nicht geladen werden');
            // Erstelle einen Demo-Mitarbeiter, wenn keiner gefunden wurde
            employee = {
                id: 'demo-employee',
                name: employeeId || 'Unbekannter Mitarbeiter'
            };
        }
        
        console.log('Daten geladen:', timeEntry, project, employee);
        
        // Report-Modal erstellen/aktualisieren
        const modal = createReportModal();
        
        // Modal-Titel setzen
        const modalTitle = document.getElementById('report-modal-title');
        if (modalTitle) {
            modalTitle.textContent = `Zeiterfassungsbericht: ${project.name}`;
        }
        
        // Basisdaten anzeigen
        const reportDate = document.getElementById('report-date');
        const reportProject = document.getElementById('report-project');
        const reportEmployee = document.getElementById('report-employee');
        const reportTimeIn = document.getElementById('report-time-in');
        const reportTimeOut = document.getElementById('report-time-out');
        const reportWorkHours = document.getElementById('report-work-hours');
        const reportNotes = document.getElementById('report-notes');
        const reportPauseDetails = document.getElementById('report-pause-details');
        
        if (reportDate && reportProject && reportEmployee && reportTimeIn && 
            reportTimeOut && reportWorkHours && reportNotes && reportPauseDetails) {
            
            // Datum formatieren
            let clockInDate;
            
            if (timeEntry.clockInTime instanceof firebase.firestore.Timestamp) {
                clockInDate = timeEntry.clockInTime.toDate();
            } else if (typeof timeEntry.clockInTime === 'object' && timeEntry.clockInTime.seconds) {
                // Firebase Timestamp in anderem Format
                clockInDate = new Date(timeEntry.clockInTime.seconds * 1000);
            } else {
                // String oder Number
                clockInDate = new Date(timeEntry.clockInTime);
            }
            
            // Sicherstellen, dass wir ein gültiges Datum haben
            if (!isValidDate(clockInDate)) {
                console.log('Ungültiges Datum gefunden, verwende aktuelles Datum');
                clockInDate = new Date(); // Fallback zum aktuellen Datum
            }
            
            const date = clockInDate.toLocaleDateString('de-DE');
            
            // Zeiten formatieren
            const clockInTime = formatTime(clockInDate);
            
            // Ausstempelzeit extrahieren und konvertieren
            let clockOutDate;
            if (timeEntry.clockOutTime) {
                if (timeEntry.clockOutTime instanceof firebase.firestore.Timestamp) {
                    clockOutDate = timeEntry.clockOutTime.toDate();
                } else if (typeof timeEntry.clockOutTime === 'object' && timeEntry.clockOutTime.seconds) {
                    clockOutDate = new Date(timeEntry.clockOutTime.seconds * 1000);
                } else {
                    clockOutDate = new Date(timeEntry.clockOutTime);
                }
            }
            
            const clockOutTime = clockOutDate && isValidDate(clockOutDate) ? formatTime(clockOutDate) : '--:--';
            
            // Arbeitsstunden berechnen mit Berücksichtigung der Pausenzeiten
            let workHours = 'NaNh';
            
            // Pausenzeit außerhalb des try-Blocks definieren, damit sie später verfügbar ist
            const pauseTotalTime = timeEntry.pauseTotalTime || 0;
            
            if (clockOutDate && isValidDate(clockOutDate)) {
                try {
                    // Arbeitsstunden berechnen
                    const totalTimeMs = clockOutDate.getTime() - clockInDate.getTime();
                    
                    if (totalTimeMs > 0) {
                        const actualWorkTimeMs = totalTimeMs - pauseTotalTime;
                        const hours = actualWorkTimeMs / (1000 * 60 * 60);
                        workHours = hours.toFixed(2) + 'h';
                    }
                } catch (error) {
                    console.error('Fehler bei der Berechnung der Arbeitsstunden:', error);
                }
                
                // Wenn Pausenzeit vorhanden, diese auch anzeigen
                if (pauseTotalTime > 0) {
                    const pauseMinutes = Math.floor(pauseTotalTime / 60000);
                    const pauseHours = Math.floor(pauseMinutes / 60);
                    const remainingMinutes = pauseMinutes % 60;
                    workHours += ` (inkl. ${pauseHours}h ${remainingMinutes}min Pause)`;
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
            
            // Pausendetails anzeigen, falls vorhanden
            if (timeEntry.pauseDetails && timeEntry.pauseDetails.length > 0) {
                let pauseDetailsHtml = '<ul class="pause-list">';
                
                for (const pause of timeEntry.pauseDetails) {
                    try {
                        // Konvertierung der Zeitstempel in Date-Objekte
                        let startDate, endDate;
                        
                        if (pause.start instanceof firebase.firestore.Timestamp) {
                            startDate = pause.start.toDate();
                        } else if (typeof pause.start === 'string') {
                            startDate = new Date(pause.start);
                        } else if (pause.start && typeof pause.start === 'object') {
                            // Für Firebase-Timestamps in verschiedenen Formaten
                            startDate = pause.start.seconds ? 
                                new Date(pause.start.seconds * 1000) : new Date();
                        }
                        
                        if (pause.end instanceof firebase.firestore.Timestamp) {
                            endDate = pause.end.toDate();
                        } else if (typeof pause.end === 'string') {
                            endDate = new Date(pause.end);
                        } else if (pause.end && typeof pause.end === 'object') {
                            // Für Firebase-Timestamps in verschiedenen Formaten
                            endDate = pause.end.seconds ? 
                                new Date(pause.end.seconds * 1000) : new Date();
                        }
                        
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
        
        // Baustellenfotos laden und anzeigen
        const sitePhotosGallery = document.getElementById('report-site-photos');
        if (sitePhotosGallery) {
            sitePhotosGallery.innerHTML = '<p>Baustellenfotos werden geladen...</p>';
            
            try {
                // WICHTIG: Verbesserte Bildersuche im Zeiteintrag
                let sitePhotos = [];
                
                console.log('Zeiteintrag für Bildsuche:', timeEntry);
                
                // Direkte Firestore-Abfrage für Bilder dieses Zeiteintrags
                try {
                    const filesRef = firebase.firestore().collection('files');
                    const filesQuery = await filesRef
                        .where('timeEntryId', '==', timeEntry.id)
                        .where('type', '==', 'construction_site')
                        .get();
                    
                    if (!filesQuery.empty) {
                        console.log(`${filesQuery.size} Baustellenfotos direkt aus Firestore gefunden`);
                        
                        filesQuery.forEach(doc => {
                            const fileData = doc.data();
                            if (fileData && fileData.url) {
                                sitePhotos.push({
                                    url: fileData.url,
                                    comment: fileData.comment || fileData.description || ''
                                });
                            }
                        });
                    }
                } catch (firestoreError) {
                    console.error('Fehler bei der Firestore-Abfrage für Bilder:', firestoreError);
                }
                
                // 1. Suche nach direkten sitePhotos-Feldern
                if (timeEntry.sitePhotos && Array.isArray(timeEntry.sitePhotos) && timeEntry.sitePhotos.length > 0) {
                    console.log(`${timeEntry.sitePhotos.length} Baustellenfotos im sitePhotos-Feld gefunden`);
                    // Fotos zum Array hinzufügen
                    timeEntry.sitePhotos.forEach(photo => {
                        if (photo) {
                            // Verschiedene mögliche Strukturen abdecken
                            let photoUrl = '';
                            let photoComment = '';
                            
                            if (typeof photo === 'string') {
                                photoUrl = photo;
                            } else if (photo.url || photo.src) {
                                photoUrl = photo.url || photo.src;
                                photoComment = photo.comment || photo.description || '';
                            } else if (photo.path) {
                                photoUrl = photo.path;
                                photoComment = photo.comment || photo.description || '';
                            } else if (photo.data && photo.data.url) {
                                photoUrl = photo.data.url;
                                photoComment = photo.data.comment || photo.data.description || '';
                            }
                            
                            if (photoUrl && !sitePhotos.some(p => p.url === photoUrl)) {
                                sitePhotos.push({
                                    url: photoUrl,
                                    comment: photoComment
                                });
                            }
                        }
                    });
                }
                
                // 2. Suche nach einem generischen photos-Feld
                if (timeEntry.photos && Array.isArray(timeEntry.photos) && timeEntry.photos.length > 0) {
                    console.log(`${timeEntry.photos.length} Fotos im photos-Feld gefunden`);
                    // Fotos zum Array hinzufügen, die noch nicht vorhanden sind
                    timeEntry.photos.forEach(photo => {
                        if (photo) {
                            // Verschiedene mögliche Strukturen abdecken
                            let photoUrl = '';
                            let photoComment = '';
                            
                            if (typeof photo === 'string') {
                                photoUrl = photo;
                            } else if (photo.url || photo.src) {
                                photoUrl = photo.url || photo.src;
                                photoComment = photo.comment || photo.description || '';
                            } else if (photo.path) {
                                photoUrl = photo.path;
                                photoComment = photo.comment || photo.description || '';
                            } else if (photo.data && photo.data.url) {
                                photoUrl = photo.data.url;
                                photoComment = photo.data.comment || photo.data.description || '';
                            }
                            
                            if (photoUrl && !sitePhotos.some(p => p.url === photoUrl)) {
                                sitePhotos.push({
                                    url: photoUrl,
                                    comment: photoComment
                                });
                            }
                        }
                    });
                }
                
                // 3. Suche nach constructionSitePhotos-Feld
                if (timeEntry.constructionSitePhotos && Array.isArray(timeEntry.constructionSitePhotos) && timeEntry.constructionSitePhotos.length > 0) {
                    console.log(`${timeEntry.constructionSitePhotos.length} Fotos im constructionSitePhotos-Feld gefunden`);
                    // Fotos zum Array hinzufügen, die noch nicht vorhanden sind
                    timeEntry.constructionSitePhotos.forEach(photo => {
                        if (photo) {
                            // Verschiedene mögliche Strukturen abdecken
                            let photoUrl = '';
                            let photoComment = '';
                            
                            if (typeof photo === 'string') {
                                photoUrl = photo;
                            } else if (photo.url || photo.src) {
                                photoUrl = photo.url || photo.src;
                                photoComment = photo.comment || photo.description || '';
                            } else if (photo.path) {
                                photoUrl = photo.path;
                                photoComment = photo.comment || photo.description || '';
                            } else if (photo.data && photo.data.url) {
                                photoUrl = photo.data.url;
                                photoComment = photo.data.comment || photo.data.description || '';
                            }
                            
                            if (photoUrl && !sitePhotos.some(p => p.url === photoUrl)) {
                                sitePhotos.push({
                                    url: photoUrl,
                                    comment: photoComment
                                });
                            }
                        }
                    });
                }
                
                // 4. Suche nach images-Feld
                if (timeEntry.images && Array.isArray(timeEntry.images) && timeEntry.images.length > 0) {
                    console.log(`${timeEntry.images.length} Fotos im images-Feld gefunden`);
                    timeEntry.images.forEach(photo => {
                        if (photo) {
                            // Verschiedene mögliche Strukturen abdecken
                            let photoUrl = '';
                            let photoComment = '';
                            
                            if (typeof photo === 'string') {
                                photoUrl = photo;
                            } else if (photo.url || photo.src) {
                                photoUrl = photo.url || photo.src;
                                photoComment = photo.comment || photo.description || '';
                            } else if (photo.path) {
                                photoUrl = photo.path;
                                photoComment = photo.comment || photo.description || '';
                            } else if (photo.data && photo.data.url) {
                                photoUrl = photo.data.url;
                                photoComment = photo.data.comment || photo.data.description || '';
                            }
                            
                            if (photoUrl && !sitePhotos.some(p => p.url === photoUrl)) {
                                sitePhotos.push({
                                    url: photoUrl,
                                    comment: photoComment
                                });
                            }
                        }
                    });
                }
                
                // 5. Suche nach files-Feld
                if (timeEntry.files && Array.isArray(timeEntry.files) && timeEntry.files.length > 0) {
                    console.log(`${timeEntry.files.length} Dateien im files-Feld gefunden`);
                    timeEntry.files.forEach(file => {
                        if (file && (file.type === 'image' || file.type === 'construction_site' || !file.type)) {
                            // Verschiedene mögliche Strukturen abdecken
                            let fileUrl = '';
                            let fileComment = '';
                            
                            if (typeof file === 'string') {
                                fileUrl = file;
                            } else if (file.url || file.src) {
                                fileUrl = file.url || file.src;
                                fileComment = file.comment || file.description || '';
                            } else if (file.path) {
                                fileUrl = file.path;
                                fileComment = file.comment || file.description || '';
                            } else if (file.data && file.data.url) {
                                fileUrl = file.data.url;
                                fileComment = file.data.comment || file.data.description || '';
                            }
                            
                            if (fileUrl && !sitePhotos.some(p => p.url === fileUrl)) {
                                sitePhotos.push({
                                    url: fileUrl,
                                    comment: fileComment
                                });
                            }
                        }
                    });
                }
                
                console.log(`Insgesamt ${sitePhotos.length} Baustellenfotos gefunden`);
                
                if (sitePhotos && sitePhotos.length > 0) {
                    let galleryHtml = '';
                    
                    sitePhotos.forEach(photo => {
                        galleryHtml += `
                        <div class="report-gallery-item">
                            <img src="${photo.url}" alt="Baustellenfoto" class="report-gallery-image">
                            ${photo.comment ? `<p class="photo-comment">${photo.comment}</p>` : ''}
                        </div>`;
                    });
                    
                    sitePhotosGallery.innerHTML = galleryHtml;
                } else {
                    sitePhotosGallery.innerHTML = '<p>Keine Baustellenfotos vorhanden</p>';
                }
            } catch (error) {
                console.error('Fehler beim Laden der Baustellenfotos:', error);
                sitePhotosGallery.innerHTML = '<p>Fehler beim Laden der Baustellenfotos</p>';
            }
        }
        
        // Lieferscheine laden und anzeigen
        const deliveryNotesGallery = document.getElementById('report-delivery-notes');
        if (deliveryNotesGallery) {
            deliveryNotesGallery.innerHTML = '<p>Lieferscheine werden geladen...</p>';
            
            try {
                // WICHTIG: Direkter Zugriff auf Dokumente im Zeiteintrag
                let deliveryNotes = [];
                
                console.log('Zeiteintrag für Dokumentensuche:', timeEntry);
                
                // 1. Suche nach direkten deliveryNotes-Feldern
                if (timeEntry.deliveryNotes && Array.isArray(timeEntry.deliveryNotes) && timeEntry.deliveryNotes.length > 0) {
                    console.log(`${timeEntry.deliveryNotes.length} Lieferscheine im deliveryNotes-Feld gefunden`);
                    // Dokumente zum Array hinzufügen
                    timeEntry.deliveryNotes.forEach(doc => {
                        if (doc && (doc.url || doc.src)) {
                            deliveryNotes.push({
                                url: doc.url || doc.src,
                                comment: doc.comment || doc.description || ''
                            });
                        }
                    });
                }
                
                // 2. Suche nach einem generischen documents-Feld
                if (timeEntry.documents && Array.isArray(timeEntry.documents) && timeEntry.documents.length > 0) {
                    console.log(`${timeEntry.documents.length} Dokumente im documents-Feld gefunden`);
                    // Dokumente zum Array hinzufügen, die noch nicht vorhanden sind
                    timeEntry.documents.forEach(doc => {
                        if (doc && (doc.url || doc.src)) {
                            // Prüfen, ob das Dokument bereits vorhanden ist
                            const docUrl = doc.url || doc.src;
                            if (!deliveryNotes.some(d => d.url === docUrl)) {
                                deliveryNotes.push({
                                    url: docUrl,
                                    comment: doc.comment || doc.description || ''
                                });
                            }
                        }
                    });
                }
                
                // 3. Suche nach invoices/receipts-Feld
                if (timeEntry.invoices && Array.isArray(timeEntry.invoices) && timeEntry.invoices.length > 0) {
                    console.log(`${timeEntry.invoices.length} Rechnungen im invoices-Feld gefunden`);
                    // Dokumente zum Array hinzufügen, die noch nicht vorhanden sind
                    timeEntry.invoices.forEach(doc => {
                        if (doc && (doc.url || doc.src)) {
                            // Prüfen, ob das Dokument bereits vorhanden ist
                            const docUrl = doc.url || doc.src;
                            if (!deliveryNotes.some(d => d.url === docUrl)) {
                                deliveryNotes.push({
                                    url: docUrl,
                                    comment: doc.comment || doc.description || ''
                                });
                            }
                        }
                    });
                }
                
                // 4. Suche nach receipts-Feld
                if (timeEntry.receipts && Array.isArray(timeEntry.receipts) && timeEntry.receipts.length > 0) {
                    console.log(`${timeEntry.receipts.length} Belege im receipts-Feld gefunden`);
                    // Dokumente zum Array hinzufügen, die noch nicht vorhanden sind
                    timeEntry.receipts.forEach(doc => {
                        if (doc && (doc.url || doc.src)) {
                            // Prüfen, ob das Dokument bereits vorhanden ist
                            const docUrl = doc.url || doc.src;
                            if (!deliveryNotes.some(d => d.url === docUrl)) {
                                deliveryNotes.push({
                                    url: docUrl,
                                    comment: doc.comment || doc.description || ''
                                });
                            }
                        }
                    });
                }
                
                console.log(`Insgesamt ${deliveryNotes.length} Lieferscheine/Dokumente gefunden`);
                
                if (deliveryNotes && deliveryNotes.length > 0) {
                    let galleryHtml = '';
                    
                    deliveryNotes.forEach(doc => {
                        galleryHtml += `
                        <div class="report-gallery-item">
                            <img src="${doc.url}" alt="Lieferschein" class="report-gallery-image">
                            ${doc.comment ? `<p class="photo-comment">${doc.comment}</p>` : ''}
                        </div>`;
                    });
                    
                    deliveryNotesGallery.innerHTML = galleryHtml;
                } else {
                    deliveryNotesGallery.innerHTML = '<p>Keine Lieferscheine vorhanden</p>';
                }
            } catch (error) {
                console.error('Fehler beim Laden der Lieferscheine:', error);
                deliveryNotesGallery.innerHTML = '<p>Fehler beim Laden der Lieferscheine</p>';
            }
        }
        
        // Exportieren-Button nur hinzufügen, wenn das Modal existiert
        if (modal) {
            // Exportieren-Button zum Modal hinzufügen
            const exportBtn = document.createElement('button');
            exportBtn.className = 'btn primary-btn export-report-btn';
            exportBtn.textContent = 'Bericht exportieren';
            exportBtn.style.marginTop = '20px';
            exportBtn.style.display = 'block';
            exportBtn.style.marginLeft = 'auto';
            exportBtn.style.marginRight = 'auto';
            
            // Zum Modal hinzufügen
            const modalBody = modal.querySelector('.modal-body');
            if (modalBody) {
                // Entfernen des alten Export-Buttons, falls vorhanden
                const oldExportBtn = modalBody.querySelector('.export-report-btn');
                if (oldExportBtn) {
                    oldExportBtn.remove();
                }
                
                modalBody.appendChild(exportBtn);
                
                // Event-Listener für den Export-Button
                exportBtn.addEventListener('click', function() {
                    exportTimeEntryReport(timeEntry, project, employee);
                });
            }
        }
        
        // Modal anzeigen
        modal.style.display = 'block';
        
        // Bericht-Daten global speichern für erweiterte Funktionen
        currentReportData = {
            timeEntry,
            project,
            employee
        };
    } catch (error) {
        console.error('Fehler beim Anzeigen des Berichts:', error);
        alert('Fehler beim Anzeigen des Berichts: ' + error.message);
    }
}

/**
 * Exportiert den Zeiteintragsbericht als PDF oder HTML
 */
async function exportTimeEntryReport(timeEntry, project, employee) {
    try {
        console.log('Exportiere Bericht für:', timeEntry.id);
        
        // Erstelle ein neues Fenster für den Ausdruck
        const printWindow = window.open('', '_blank');
        
        if (!printWindow) {
            alert('Bitte erlauben Sie Popups für diese Webseite, um den Bericht zu exportieren.');
            return;
        }
        
        // Basisinformationen
        const dateStr = formatDate(timeEntry.clockInTime);
        const clockInStr = formatTime(timeEntry.clockInTime);
        const clockOutStr = timeEntry.clockOutTime ? formatTime(timeEntry.clockOutTime) : '-';
        
        // Arbeitsstunden mit Pausenzeiten
        let workHours = '-';
        let pauseTimeStr = '';
        
        if (timeEntry.clockOutTime) {
            const clockInDate = parseDate(timeEntry.clockInTime);
            const clockOutDate = parseDate(timeEntry.clockOutTime);
            const pauseTotalTime = timeEntry.pauseTotalTime || 0;
            
            if (clockInDate && clockOutDate) {
                const totalTimeMs = clockOutDate - clockInDate;
                const workTimeMs = totalTimeMs - pauseTotalTime;
                
                if (workTimeMs > 0) {
                    const hours = workTimeMs / (1000 * 60 * 60);
                    workHours = hours.toFixed(2) + 'h';
                    
                    if (pauseTotalTime > 0) {
                        const pauseMinutes = Math.floor(pauseTotalTime / 60000);
                        pauseTimeStr = ` (inkl. ${pauseMinutes} Min. Pause)`;
                    }
                }
            }
        }
        
        // Baustellenfotos sammeln
        let sitePhotos = [];
        
        // 1. Suche nach direkten sitePhotos-Feldern
        if (timeEntry.sitePhotos && Array.isArray(timeEntry.sitePhotos)) {
            timeEntry.sitePhotos.forEach(photo => {
                if (photo && (photo.url || photo.src)) {
                    sitePhotos.push({
                        url: photo.url || photo.src,
                        comment: photo.comment || photo.description || ''
                    });
                }
            });
        }
        
        // 2. Suche nach einem generischen photos-Feld
        if (timeEntry.photos && Array.isArray(timeEntry.photos)) {
            timeEntry.photos.forEach(photo => {
                if (photo && (photo.url || photo.src)) {
                    const photoUrl = photo.url || photo.src;
                    if (!sitePhotos.some(p => p.url === photoUrl)) {
                        sitePhotos.push({
                            url: photoUrl,
                            comment: photo.comment || photo.description || ''
                        });
                    }
                }
            });
        }
        
        // Lieferscheine sammeln
        let deliveryNotes = [];
        
        // 1. Suche nach direkten deliveryNotes-Feldern
        if (timeEntry.deliveryNotes && Array.isArray(timeEntry.deliveryNotes)) {
            timeEntry.deliveryNotes.forEach(doc => {
                if (doc && (doc.url || doc.src)) {
                    deliveryNotes.push({
                        url: doc.url || doc.src,
                        comment: doc.comment || doc.description || ''
                    });
                }
            });
        }
        
        // 2. Suche nach einem generischen documents-Feld
        if (timeEntry.documents && Array.isArray(timeEntry.documents)) {
            timeEntry.documents.forEach(doc => {
                if (doc && (doc.url || doc.src)) {
                    const docUrl = doc.url || doc.src;
                    if (!deliveryNotes.some(d => d.url === docUrl)) {
                        deliveryNotes.push({
                            url: docUrl,
                            comment: doc.comment || doc.description || ''
                        });
                    }
                }
            });
        }
        
        // Pausendetails
        let pauseDetailsHtml = '';
        if (timeEntry.pauseDetails && timeEntry.pauseDetails.length > 0) {
            pauseDetailsHtml = '<h3>Pausendetails</h3><ul>';
            
            for (const pause of timeEntry.pauseDetails) {
                try {
                    // Konvertierung der Zeitstempel
                    let startDate = parseDate(pause.start);
                    let endDate = parseDate(pause.end);
                    
                    if (startDate && endDate) {
                        const startTime = formatTime(startDate);
                        const endTime = formatTime(endDate);
                        const pauseDuration = Math.floor((endDate - startDate) / 60000);
                        
                        pauseDetailsHtml += `<li>Pause von ${startTime} bis ${endTime} (${pauseDuration} Min.)</li>`;
                    }
                } catch (e) {
                    console.error('Fehler bei Pausendetails:', e);
                }
            }
            
            pauseDetailsHtml += '</ul>';
        }
        
        // HTML für den Ausdruck erstellen
        let photosHtml = '';
        if (sitePhotos.length > 0) {
            photosHtml = '<h3>Baustellenfotos</h3><div class="report-photos">';
            
            sitePhotos.forEach(photo => {
                photosHtml += `
                    <div class="photo-item">
                        <img src="${photo.url}" style="max-width: 100%; max-height: 300px;">
                        ${photo.comment ? `<p>${photo.comment}</p>` : ''}
                    </div>
                `;
            });
            
            photosHtml += '</div>';
        }
        
        let documentsHtml = '';
        if (deliveryNotes.length > 0) {
            documentsHtml = '<h3>Lieferscheine/Dokumente</h3><div class="report-documents">';
            
            deliveryNotes.forEach(doc => {
                documentsHtml += `
                    <div class="document-item">
                        <img src="${doc.url}" style="max-width: 100%; max-height: 300px;">
                        ${doc.comment ? `<p>${doc.comment}</p>` : ''}
                    </div>
                `;
            });
            
            documentsHtml += '</div>';
        }
        
        // Das vollständige HTML für das Druckfenster
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Zeiterfassungsbericht - ${project.name || 'Projekt'} - ${dateStr}</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1, h2, h3 { color: #333; }
                .report-header { margin-bottom: 20px; }
                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
                .notes { background-color: #f5f5f5; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
                .photo-item, .document-item { margin-bottom: 15px; }
                .report-photos, .report-documents { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; }
                @media print {
                    .no-print { display: none; }
                    body { margin: 0; }
                    .page-break { page-break-before: always; }
                }
            </style>
        </head>
        <body>
            <div class="report-header">
                <h1>Zeiterfassungsbericht</h1>
                <button class="no-print" onclick="window.print()" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Drucken</button>
            </div>
            
            <h2>Grundinformationen</h2>
            <div class="info-grid">
                <div><strong>Projekt:</strong> ${project.name || 'Unbekanntes Projekt'}</div>
                <div><strong>Mitarbeiter:</strong> ${employee.name || 'Unbekannter Mitarbeiter'}</div>
                <div><strong>Datum:</strong> ${dateStr}</div>
                <div><strong>Einstempelzeit:</strong> ${clockInStr}</div>
                <div><strong>Ausstempelzeit:</strong> ${clockOutStr}</div>
                <div><strong>Arbeitsstunden:</strong> ${workHours}${pauseTimeStr}</div>
            </div>
            
            <h2>Notizen</h2>
            <div class="notes">${timeEntry.notes || 'Keine Notizen vorhanden'}</div>
            
            ${pauseDetailsHtml}
            
            ${photosHtml}
            
            ${documentsHtml}
            
            <div class="report-footer">
                <p>Erstellt am ${new Date().toLocaleDateString('de-DE')} um ${new Date().toLocaleTimeString('de-DE')}</p>
            </div>
        </body>
        </html>
        `;
        
        // HTML in das neue Fenster schreiben
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        
        // Nach dem Laden des Fensters fokussieren
        printWindow.onload = function() {
            printWindow.focus();
        };
        
    } catch (error) {
        console.error('Fehler beim Exportieren des Berichts:', error);
        alert('Fehler beim Exportieren: ' + error.message);
    }
}

// Report-Modal erstellen
function createReportModal() {
    // Prüfen, ob Modal bereits existiert
    let modal = document.getElementById('time-entry-report-modal');
    if (modal) {
        return modal;
    }
    
    console.log('Erstelle Report-Modal');
    
    // Modal erstellen
    modal = document.createElement('div');
    modal.id = 'time-entry-report-modal';
    modal.className = 'modal';
    
    // Event-Listener zum Schließen des Modals beim ESC-Taste
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modal.style.display === 'block') {
            modal.style.display = 'none';
        }
    });
    
    modal.innerHTML = `
        <div class="modal-content large-modal">
            <div class="modal-header">
                <h3 id="report-modal-title">Zeiterfassungsbericht</h3>
                <button type="button" class="close-modal-btn" id="report-close-btn">&times;</button>
            </div>
            <div class="modal-body report-modal-body">
                <div class="report-header">
                    <div class="report-info-grid">
                        <div class="report-info-item">
                            <strong>Datum:</strong>
                            <span id="report-date"></span>
                        </div>
                        <div class="report-info-item">
                            <strong>Projekt:</strong>
                            <span id="report-project"></span>
                        </div>
                        <div class="report-info-item">
                            <strong>Mitarbeiter:</strong>
                            <span id="report-employee"></span>
                        </div>
                        <div class="report-info-item">
                            <strong>Einstempelzeit:</strong>
                            <span id="report-time-in"></span>
                        </div>
                        <div class="report-info-item">
                            <strong>Ausstempelzeit:</strong>
                            <span id="report-time-out"></span>
                        </div>
                        <div class="report-info-item">
                            <strong>Arbeitsstunden:</strong>
                            <span id="report-work-hours"></span>
                        </div>
                    </div>
                    <div class="report-info-item">
                        <strong>Notizen:</strong>
                        <span id="report-notes"></span>
                    </div>
                    <div class="report-info-item">
                        <strong>Pausendetails:</strong>
                        <div id="report-pause-details"></div>
                    </div>
                </div>
                
                <div class="report-section">
                    <h4>Baustellenfotos</h4>
                    <div class="report-gallery" id="report-site-photos">
                        <!-- Wird per JavaScript gefüllt -->
                    </div>
                </div>
                
                <div class="report-section">
                    <h4>Lieferscheine & Rechnungen</h4>
                    <div class="report-gallery" id="report-delivery-notes">
                        <!-- Wird per JavaScript gefüllt -->
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event-Listener für Schließen-Button
    const closeButton = modal.querySelector('.close-modal-btn');
    closeButton.addEventListener('click', function() {
        modal.style.display = 'none';
    });
    
    return modal;
}

// Fullscreen-Bildanzeige
function createFullscreenModal() {
    let modal = document.getElementById('fullscreen-image-modal');
    if (modal) {
        return modal;
    }
    
    console.log('Erstelle Fullscreen-Modal');
    
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
    if (closeButton) {
        closeButton.addEventListener('click', function() {
            modal.style.display = 'none';
            // Report-Modal wieder anzeigen, wenn es vorher geöffnet war
            const reportModal = document.getElementById('time-entry-report-modal');
            if (reportModal && reportModal.dataset.wasOpen === 'true') {
                reportModal.style.display = 'block';
                reportModal.dataset.wasOpen = 'false';
            }
        });
    }
    
    // Klick auf Modal schließt es
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
            // Report-Modal wieder anzeigen, wenn es vorher geöffnet war
            const reportModal = document.getElementById('time-entry-report-modal');
            if (reportModal && reportModal.dataset.wasOpen === 'true') {
                reportModal.style.display = 'block';
                reportModal.dataset.wasOpen = 'false';
            }
        }
    });
    
    // ESC-Taste schließt Modal
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modal.style.display === 'block') {
            modal.style.display = 'none';
            // Report-Modal wieder anzeigen, wenn es vorher geöffnet war
            const reportModal = document.getElementById('time-entry-report-modal');
            if (reportModal && reportModal.dataset.wasOpen === 'true') {
                reportModal.style.display = 'block';
                reportModal.dataset.wasOpen = 'false';
            }
        }
    });
    
    return modal;
}

// Vollbildansicht eines Bildes öffnen
function openFullscreenImage(imageUrl) {
    const modal = document.getElementById('fullscreen-image-modal');
    const fullscreenImage = document.querySelector('.fullscreen-image');
    
    if (modal && fullscreenImage) {
        fullscreenImage.src = imageUrl;
        
        // Speichern, ob das Report-Modal geöffnet war
        const reportModal = document.getElementById('time-entry-report-modal');
        if (reportModal && reportModal.style.display === 'block') {
            reportModal.dataset.wasOpen = 'true';
            reportModal.style.display = 'none';
        }
        
        modal.style.display = 'block';
    } else {
        console.error('Fullscreen-Modal oder Bild nicht gefunden');
        alert('Vollbildansicht konnte nicht geöffnet werden');
    }
}
// Hilfsfunktion zum Parsen von Datumswerten aus verschiedenen Formaten
function parseDate(dateValue) {
    if (!dateValue) return null;
    
    try {
        // Wenn es bereits ein Date-Objekt ist
        if (dateValue instanceof Date) {
            return isValidDate(dateValue) ? dateValue : null;
        }
        
        // Wenn es ein Firebase Timestamp ist
        if (dateValue instanceof firebase.firestore.Timestamp) {
            return dateValue.toDate();
        }
        
        // Wenn es ein Objekt mit seconds-Eigenschaft ist (Firebase Timestamp)
        if (typeof dateValue === 'object' && dateValue.seconds) {
            return new Date(dateValue.seconds * 1000);
        }
        
        // Wenn es ein Unix-Timestamp als Zahl ist
        if (typeof dateValue === 'number') {
            return new Date(dateValue);
        }
        
        // Wenn es ein String ist
        if (typeof dateValue === 'string') {
            return new Date(dateValue);
        }
        
        console.error('Unbekanntes Datumsformat:', dateValue);
        return null;
    } catch (error) {
        console.error('Fehler beim Parsen des Datums:', error, dateValue);
        return null;
    }
}

// Hilfsfunktion für die Datumsformatierung
function formatDate(dateValue) {
    const date = parseDate(dateValue);
    if (!date) {
        console.error('Ungültiges Datum beim Formatieren:', dateValue);
        return 'Unbekanntes Datum';
    }
    
    try {
        return date.toLocaleDateString('de-DE');
    } catch (error) {
        console.error('Fehler beim Formatieren des Datums:', error);
        return 'Fehler beim Formatieren';
    }
}

// Hilfsfunktion für die Zeitformatierung
function formatTime(dateValue) {
    const date = parseDate(dateValue);
    if (!date) {
        console.error('Ungültiges Datum beim Formatieren der Zeit:', dateValue);
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

// Füge CSS-Styles hinzu
function addStyles() {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        /* Styles für den Bericht-Button */
        .report-btn {
            padding: 8px 12px;
            font-size: 14px;
            white-space: nowrap;
            background-color: #ff6b00 !important;
            color: white !important;
            border: none;
            border-radius: 4px;
            margin: 0 auto;
            display: inline-block;
            font-weight: bold;
            cursor: pointer;
            text-align: center;
            min-width: 80px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        /* Styles für die detaillierte Berichtsansicht */
        .report-modal-body {
            max-height: 80vh;
            overflow-y: auto;
        }

        .report-header {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #ddd;
        }

        .report-info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 15px;
        }

        .report-info-item {
            margin-bottom: 10px;
        }

        .report-info-item strong {
            display: block;
            margin-bottom: 5px;
            color: #333;
            font-size: 14px;
        }

        .report-section {
            margin-bottom: 25px;
            padding: 15px;
            background-color: #f9f9f9;
            border-radius: 4px;
        }

        .report-section h4 {
            margin-top: 0;
            margin-bottom: 15px;
            color: #555;
            font-size: 16px;
        }

        .report-gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 15px;
        }

        .report-gallery-item {
            border: 1px solid #ddd;
            border-radius: 4px;
            overflow: hidden;
            background-color: white;
        }

        .report-gallery-item img {
            width: 100%;
            height: 150px;
            object-fit: cover;
            cursor: pointer;
            transition: transform 0.2s ease;
        }

        .report-gallery-item img:hover {
            transform: scale(1.05);
        }

        .photo-comment {
            padding: 10px;
            margin: 0;
            font-size: 13px;
            border-top: 1px solid #eee;
        }

        /* Vollbildansicht für Bilder */
        .fullscreen-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.9);
            z-index: 9999;
            overflow: hidden;
        }

        .fullscreen-image-container {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            height: 100%;
            position: relative;
        }

        .fullscreen-image {
            max-width: 90%;
            max-height: 90%;
            object-fit: contain;
        }

        .close-fullscreen-btn {
            position: absolute;
            top: 20px;
            right: 20px;
            background: transparent;
            color: white;
            border: none;
            font-size: 30px;
            cursor: pointer;
            z-index: 10000;
        }

        .pause-list {
            margin-top: 10px;
            padding-left: 20px;
        }
    `;
    document.head.appendChild(styleElement);
}

// Styles beim Laden der Seite hinzufügen
addStyles();

// Fullscreen-Modal erst erstellen, wenn DOM geladen ist
document.addEventListener('DOMContentLoaded', function() {
    // Fullscreen-Modal erstellen und einfügen
    setTimeout(function() {
        try {
            createSingletonFullscreenModal();
        } catch (err) {
            console.warn('Fehler beim Erstellen des Fullscreen-Modals:', err);
        }
    }, 500); // Kurze Verzögerung für sicheres DOM-Rendering
});

// Erstellt ein Fullscreen-Modal, falls es noch nicht existiert
function createSingletonFullscreenModal() {
    if (document.getElementById('fullscreen-image-modal')) {
        return; // Modal existiert bereits
    }
    
    console.log('Erstelle globales Fullscreen-Modal');
    
    const modal = document.createElement('div');
    modal.id = 'fullscreen-image-modal';
    modal.className = 'fullscreen-modal';
    
    modal.innerHTML = `
        <button class="close-fullscreen-btn">&times;</button>
        <div class="fullscreen-image-container">
            <img class="fullscreen-image" src="" alt="Vollbildansicht">
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event-Listener für Schließen-Button
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
        if (event.key === 'Escape') {
            modal.style.display = 'none';
        }
    });
}

console.log('report-functions.js vollständig geladen');
