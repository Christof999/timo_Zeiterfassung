/**
 * Hauptanwendungsdatei für die Mitarbeiter-Ansicht der Lauffer Zeiterfassung App
 */

// Splash Screen Control
function initSplashScreen() {
    const splashScreen = document.getElementById('splash-screen');
    
    if (splashScreen) {
        // Mindestzeit für Splash Screen anzeigen (2.5 Sekunden)
        setTimeout(() => {
            splashScreen.classList.add('fade-out');
            
            // Splash Screen nach Fade-Out-Animation entfernen
            setTimeout(() => {
                splashScreen.style.display = 'none';
            }, 500);
        }, 2500);
    }
}

// DOM-Elemente
const loginSection = document.getElementById('login-section');
const timeTrackingSection = document.getElementById('time-tracking-section');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const userNameSpan = document.getElementById('user-name');
const logoutBtn = document.getElementById('logout-btn');
const statusText = document.getElementById('status-text');
const currentTimeSpan = document.getElementById('current-time');
const projectSelect = document.getElementById('project-select');
const clockInBtn = document.getElementById('clock-in-btn');
const clockOutBtn = document.getElementById('clock-out-btn');
const clockInForm = document.getElementById('clock-in-form');
const clockOutForm = document.getElementById('clock-out-form');
const activeProjectSpan = document.getElementById('active-project');
const clockInTimeSpan = document.getElementById('clock-in-time');
const activitiesList = document.getElementById('activities-list');
// Pause-Buttons entfernt - automatische Pausenberechnung
const sitePhotosComments = document.getElementById('site-photos-comments');
const documentPhotosComments = document.getElementById('document-photos-comments');

// Globale Variablen - stattdessen verwenden wir eine globale POJO-Variable, um Scope-Probleme zu vermeiden
window.app = {
    currentUser: null,
    currentTimeEntry: null,
    clockTimer: null,
    isPaused: false,
    pauseStartTime: null,
    pauseTotalTime: 0, // Gesamtzeit der Pausen in Millisekunden
    documentationUsers: ['mdorner', 'plauffer', 'csoergel'] // Benutzer mit Dokumentationsberechtigung
};

// Hilfsfunktionen für den Zugriff auf die globalen Variablen
function getCurrentUser() {
    return window.app.currentUser;
}

function setCurrentUser(user) {
    window.app.currentUser = user;
    console.log('Benutzer in der globalen App-Variable gespeichert:', window.app.currentUser);
}

function getCurrentTimeEntry() {
    return window.app.currentTimeEntry;
}

function setCurrentTimeEntry(entry) {
    window.app.currentTimeEntry = entry;
}

function getClockTimer() {
    return window.app.clockTimer;
}

function setClockTimer(timer) {
    window.app.clockTimer = timer;
}

// App initialisieren
async function initApp() {
    try {
        console.log('App wird initialisiert...');
        
        // Sicherstellen, dass alle Bereiche zu Beginn versteckt sind
        loginSection.classList.add('hidden');
        timeTrackingSection.classList.add('hidden');
        
        // Prüfen, ob ein Benutzer angemeldet ist
        const savedUser = DataService.getCurrentUser();
        console.log('Gespeicherter Benutzer:', savedUser);
        
        if (savedUser && savedUser.id) {
            // Benutzer in die globale Variable speichern
            setCurrentUser(savedUser);
            
            console.log('Benutzer aus Speicher geladen:', getCurrentUser());
            await showTimeTrackingView();
            await checkCurrentTimeEntry();
        } else {
            console.log('Kein Benutzer angemeldet, zeige Login-Ansicht');
            showLoginView();
        }
    } catch (error) {
        console.error('Fehler bei der App-Initialisierung:', error);
        // Bei einem Fehler Benutzer zur Login-Seite weiterleiten
        showLoginView();
    }
    
    // Event-Listener
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    clockInBtn.addEventListener('click', handleClockIn);
    
    // Neue Ausstempel-Buttons und erweitertes Formular
    const simpleClockOutBtn = document.getElementById('simple-clock-out-btn');
    const extendedClockOutBtn = document.getElementById('extended-clock-out-btn');
    const liveDocumentationBtn = document.getElementById('live-documentation-btn');
    const extendedClockOutForm = document.getElementById('extended-clock-out-form');
    const cancelClockOutBtn = document.getElementById('cancel-clock-out');
    const closeModalBtns = document.querySelectorAll('.close-modal-btn');
    
    if (simpleClockOutBtn) {
        simpleClockOutBtn.addEventListener('click', handleSimpleClockOut);
    }
    
    if (extendedClockOutBtn) {
        extendedClockOutBtn.addEventListener('click', showExtendedClockOutModal);
    }
    
    if (liveDocumentationBtn) {
        liveDocumentationBtn.addEventListener('click', showLiveDocumentationModal);
    }
    
    if (extendedClockOutForm) {
        extendedClockOutForm.addEventListener('submit', handleExtendedClockOut);
    }
    
    // Pause-Buttons entfernt - automatische Pausenberechnung beim Ausstempeln
    
    if (cancelClockOutBtn) {
        cancelClockOutBtn.addEventListener('click', function() {
            const modal = document.getElementById('extended-clock-out-modal');
            if (modal) {
                modal.classList.remove('visible');
            }
        });
    }
    
    // Event-Listener für Live-Dokumentations-Modal
    const liveDocumentationForm = document.getElementById('live-documentation-form');
    const cancelLiveDocumentationBtn = document.getElementById('cancel-live-documentation');
    
    if (liveDocumentationForm) {
        liveDocumentationForm.addEventListener('submit', handleLiveDocumentationSave);
    }
    
    if (cancelLiveDocumentationBtn) {
        cancelLiveDocumentationBtn.addEventListener('click', function() {
            const modal = document.getElementById('live-documentation-modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    }
    
    // Modal schließen-Buttons
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                // Unterstützung für beide Modal-Stile
                if (modal.classList.contains('visible')) {
                    modal.classList.remove('visible');
                } else {
                    modal.style.display = 'none';
                }
            }
        });
    });
    
    // Datei-Input-Vorschau-Handler - für doppelte Kamera/Galerie-Inputs
    setupDualFilePreview('site-photos', 'site-photos-preview');
    setupDualFilePreview('document-photos', 'document-photos-preview');
    
    // Aktuelle Uhrzeit anzeigen
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    // Projekte laden
    loadProjects();
}

// Ansichten umschalten
function showLoginView() {
    loginSection.classList.remove('hidden');
    timeTrackingSection.classList.add('hidden');
    loginForm.reset();
}

function showTimeTrackingView() {
    loginSection.classList.add('hidden');
    timeTrackingSection.classList.remove('hidden');
    const user = getCurrentUser();
    userNameSpan.textContent = user.name;
    loadUserActivities();
}

// Anmeldung
async function handleLogin(event) {
    event.preventDefault();
    
    try {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        
        console.log('Anmeldungsversuch für Benutzer:', username);
        
        const user = await DataService.authenticateEmployee(username, password);
        
        if (user && user.id) {
            // Benutzer in die globale Variable speichern
            setCurrentUser(user);
            
            // Benutzer im lokalen Speicher speichern
            DataService.setCurrentUser(user);
            
            console.log('Benutzer erfolgreich angemeldet:', user);
            
            // Ansicht aktualisieren
            showTimeTrackingView();
            await checkCurrentTimeEntry();
        } else {
            console.error('Authentifizierung fehlgeschlagen für:', username);
            alert('Ungültiger Benutzername oder Passwort!');
        }
    } catch (error) {
        console.error('Fehler bei der Anmeldung:', error);
        alert('Bei der Anmeldung ist ein Fehler aufgetreten: ' + error.message);
    }
}

// Abmeldung
function handleLogout() {
    if (getCurrentTimeEntry()) {
        const confirmLogout = confirm('Sie sind noch eingestempelt. Möchten Sie sich wirklich abmelden?');
        if (!confirmLogout) return;
    }
    
    DataService.clearCurrentUser();
    setCurrentUser(null);
    setCurrentTimeEntry(null);
    
    const currentTimer = getClockTimer();
    if (currentTimer) {
        clearInterval(currentTimer);
        setClockTimer(null);
    }
    
    showLoginView();
}

// Zeit aktualisieren
function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('de-DE');
    currentTimeSpan.textContent = timeString;
}

// Projekte laden
async function loadProjects() {
    try {
        console.log('Starte Laden der Projekte...');
        
        // DataService verfügbar prüfen
        if (!DataService || !DataService.getActiveProjects) {
            throw new Error('DataService oder getActiveProjects-Funktion nicht verfügbar');
        }
        
        const projects = await DataService.getActiveProjects();
        console.log('Projekte von DataService erhalten:', projects);
        
        // Projektauswahl leeren
        projectSelect.innerHTML = '<option value="" disabled selected>Bitte wählen</option>';
        
        if (!projects || !Array.isArray(projects)) {
            console.error('Keine Projekte gefunden oder ungültiges Format:', projects);
            projectSelect.innerHTML = '<option value="" disabled>Keine Projekte verfügbar</option>';
            return;
        }
        
        if (projects.length === 0) {
            console.log('Keine Projekte verfügbar');
            projectSelect.innerHTML = '<option value="" disabled>Keine Projekte verfügbar</option>';
            return;
        }
        
        // Projekte hinzufügen
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name || `Projekt ${project.id}`;
            projectSelect.appendChild(option);
        });
        
        console.log(`${projects.length} Projekte erfolgreich geladen`);
    } catch (error) {
        console.error('Fehler beim Laden der Projekte:', error);
        console.error('Error details:', error.message, error.stack);
        projectSelect.innerHTML = '<option value="" disabled>Fehler beim Laden der Projekte</option>';
    }
}

// Prüfen, ob ein aktiver Zeiteintrag existiert
async function checkCurrentTimeEntry() {
    const user = getCurrentUser();
    if (!user || !user.id) {
        console.error('Kein Benutzer angemeldet oder fehlende Benutzer-ID');
        return;
    }
    
    try {
        console.log('Suche nach aktivem Zeiteintrag für Benutzer-ID:', user.id);
        const timeEntry = await DataService.getCurrentTimeEntry(user.id);
        setCurrentTimeEntry(timeEntry);
        
        if (timeEntry && timeEntry.projectId) {
            const project = await DataService.getProjectById(timeEntry.projectId);
            if (project) {
                showClockedInState(project, timeEntry);
            } else {
                console.error('Projekt nicht gefunden für ID:', timeEntry.projectId);
                showClockedOutState();
            }
        } else {
            showClockedOutState();
        }
    } catch (error) {
        console.error('Fehler beim Prüfen des aktuellen Zeiteintrags:', error);
        showClockedOutState();
    }
}

// Einstempeln
async function handleClockIn() {
    try {
        const user = getCurrentUser();
        if (!user || !user.id) {
            console.error('Kein Benutzer angemeldet oder Benutzer-ID fehlt');
            alert('Bitte loggen Sie sich ein, um fortzufahren.');
            return;
        }
        
        const projectId = projectSelect.value; // Als String belassen, nicht zu Int konvertieren
        
        if (!projectId) {
            alert('Bitte wählen Sie ein Projekt aus!');
            return;
        }
        
        console.log('Stempel ein für Projekt-ID:', projectId, 'und Mitarbeiter-ID:', user.id);
        
        // Zeiterfassungseintrag erstellen
        try {
            // Standort abrufen
            const location = await getCurrentLocation();
            
            // Aktuelle Zeit für Einstempeln
            const now = new Date();
            
            // Zeiterfassungseintrag erstellen
            const timeEntry = {
                employeeId: user.id,
                projectId: projectId,
                clockInTime: now,  // Übergabe des Date-Objekts statt ISO-String
                clockOutTime: null,
                clockInLocation: location,
                clockOutLocation: null,
                notes: ''
            };
            
            console.log('Zeiterfassungseintrag erstellt:', timeEntry);
            
            // Zeiterfassungseintrag hinzufügen
            const newTimeEntry = await DataService.addTimeEntry(timeEntry);
            setCurrentTimeEntry(newTimeEntry);
            console.log('Hinzugefügter Zeiterfassungseintrag:', newTimeEntry);
            
            // Projekt abrufen
            const project = await DataService.getProjectById(projectId);
            if (!project) {
                console.error('Projekt nicht gefunden für ID:', projectId);
                alert('Fehler: Das ausgewählte Projekt konnte nicht gefunden werden.');
                return;
            }
            
            // UI aktualisieren
            showClockedInState(project, newTimeEntry);
            await loadUserActivities();
            
            alert('Sie wurden erfolgreich eingestempelt!');
        } catch (error) {
            console.error('Fehler beim Einstempeln:', error);
            // Spezifische Fehlermeldung für Validierungsfehler
            if (error.message && error.message.includes('bereits')) {
                alert(error.message);
            } else {
                alert('Fehler beim Einstempeln: ' + error.message);
            }
        }
    } catch (error) {
        console.error('Fehler beim Einstempeln:', error);
        alert('Fehler beim Einstempeln: ' + error.message);
    }
}

// Einfaches Ausstempeln ohne Dokumentation
async function handleSimpleClockOut() {
    try {
        const user = getCurrentUser();
        if (!user || !user.id) {
            console.error('Kein Benutzer angemeldet oder Benutzer-ID fehlt');
            alert('Bitte loggen Sie sich ein, um fortzufahren.');
            return;
        }
        
        const timeEntry = getCurrentTimeEntry();
        if (!timeEntry || !timeEntry.id) {
            console.error('Kein aktiver Zeiterfassungseintrag vorhanden');
            alert('Es wurde kein aktiver Zeiterfassungseintrag gefunden. Sie sind nicht eingestempelt.');
            return;
        }
        
        console.log('Stempel aus für Eintrag:', timeEntry);
        
        try {
            // Standort abrufen
            const location = await getCurrentLocationForClockOut();
            const now = new Date();
            
            // Mitarbeiter ausstempeln mit automatischer Pausenberechnung
            const result = await DataService.clockOutEmployee(timeEntry.id, timeEntry.notes || '', location);
            
            // UI aktualisieren
            showClockedOutState();
            setCurrentTimeEntry(null);
            await loadUserActivities();
            
            // Benachrichtigung über automatische Pause anzeigen
            if (result.automaticBreak) {
                alert(`Erfolgreich ausgestempelt!\n\n✅ Automatische Pause hinzugefügt: ${result.automaticBreak.duration} Minuten\n(${result.automaticBreak.reason})`);
            } else {
                alert('Sie wurden erfolgreich ausgestempelt!');
            }
        } catch (locationError) {
            console.error('Standortabfrage fehlgeschlagen:', locationError);
            alert('Der Standort konnte nicht abgefragt werden. Bitte erlauben Sie den Zugriff auf Ihren Standort.');
        }
    } catch (error) {
        console.error('Fehler beim Ausstempeln:', error);
        alert('Fehler beim Ausstempeln: ' + error.message);
    }
}

// Erweitertes Ausstempel-Modal anzeigen
function showExtendedClockOutModal() {
    // Prüfen, ob ein aktiver Zeiteintrag existiert
    const timeEntry = getCurrentTimeEntry();
    if (!timeEntry) {
        alert('Es gibt keinen aktiven Zeiteintrag zum Ausstempeln.');
        return;
    }
    
    // Prüfen, ob der Benutzer berechtigt ist, die Dokumentationsfunktion zu verwenden
    const currentUser = getCurrentUser();
    if (!currentUser || !window.app.documentationUsers.includes(currentUser.username)) {
        // Für Benutzer 'martin' einen Hinweis anzeigen, dass er nur Entwürfe erstellen kann
        if (currentUser && currentUser.username === 'martin') {
            alert('Sie erstellen einen Dokumentations-Entwurf, der von mdorner überprüft werden muss.');
        } else {
            alert('Sie haben keine Berechtigung zur Dokumentation. Bitte verwenden Sie die einfache Ausstempelung.');
            return;
        }
    }
    
    // Modal anzeigen
    const modal = document.getElementById('extended-clock-out-modal');
    if (modal) {
        modal.style.display = 'block';
        
        // Formular-Elemente zurücksetzen
        const notesTextarea = document.getElementById('clock-out-notes');
        if (notesTextarea) {
            notesTextarea.value = '';
        }
        
        // Datei-Vorschau zurücksetzen - für doppelte Kamera/Galerie-Inputs
        const sitePhotosCameraInput = document.getElementById('site-photos-camera');
        const sitePhotosGalleryInput = document.getElementById('site-photos-gallery');
        const documentPhotosCameraInput = document.getElementById('document-photos-camera');
        const documentPhotosGalleryInput = document.getElementById('document-photos-gallery');
        
        if (sitePhotosCameraInput && sitePhotosCameraInput.clearPreviews) {
            sitePhotosCameraInput.clearPreviews();
        }
        if (sitePhotosGalleryInput && sitePhotosGalleryInput.clearPreviews) {
            sitePhotosGalleryInput.clearPreviews();
        }
        
        if (documentPhotosCameraInput && documentPhotosCameraInput.clearPreviews) {
            documentPhotosCameraInput.clearPreviews();
        }
        if (documentPhotosGalleryInput && documentPhotosGalleryInput.clearPreviews) {
            documentPhotosGalleryInput.clearPreviews();
        }
        
        // Bildkommentar-Container zurücksetzen
        if (sitePhotosComments) {
            sitePhotosComments.innerHTML = '';
        }
        
        if (documentPhotosComments) {
            documentPhotosComments.innerHTML = '';
        }
        
        // Datei-Vorschau-Funktion für die Formular-Inputs einrichten - für doppelte Kamera/Galerie-Inputs
        setupDualFilePreview('site-photos', 'site-photos-preview');
        setupDualFilePreview('document-photos', 'document-photos-preview');
    }
}

// Live-Dokumentations-Modal anzeigen (während der Arbeitszeit)
function showLiveDocumentationModal() {
    // Prüfen, ob ein aktiver Zeiteintrag existiert
    const timeEntry = getCurrentTimeEntry();
    if (!timeEntry) {
        alert('Es gibt keinen aktiven Zeiteintrag für die Dokumentation.');
        return;
    }
    
    console.log('Öffne Live-Dokumentation für Zeiteintrag:', timeEntry.id);
    
    // Modal anzeigen
    const modal = document.getElementById('live-documentation-modal');
    if (modal) {
        modal.style.display = 'block';
        
        // Formular zurücksetzen
        const notesTextarea = document.getElementById('live-notes');
        if (notesTextarea) {
            notesTextarea.value = '';
        }
        
        // Datei-Vorschau zurücksetzen - für doppelte Kamera/Galerie-Inputs
        const liveSitePhotosCameraInput = document.getElementById('live-site-photos-camera');
        const liveSitePhotosGalleryInput = document.getElementById('live-site-photos-gallery');
        const liveDocumentPhotosCameraInput = document.getElementById('live-document-photos-camera');
        const liveDocumentPhotosGalleryInput = document.getElementById('live-document-photos-gallery');
        
        if (liveSitePhotosCameraInput && liveSitePhotosCameraInput.clearPreviews) {
            liveSitePhotosCameraInput.clearPreviews();
        }
        if (liveSitePhotosGalleryInput && liveSitePhotosGalleryInput.clearPreviews) {
            liveSitePhotosGalleryInput.clearPreviews();
        }
        
        if (liveDocumentPhotosCameraInput && liveDocumentPhotosCameraInput.clearPreviews) {
            liveDocumentPhotosCameraInput.clearPreviews();
        }
        if (liveDocumentPhotosGalleryInput && liveDocumentPhotosGalleryInput.clearPreviews) {
            liveDocumentPhotosGalleryInput.clearPreviews();
        }
        
        // Bildkommentar-Container zurücksetzen
        const liveSitePhotosComments = document.getElementById('live-site-photos-comments');
        const liveDocumentPhotosComments = document.getElementById('live-document-photos-comments');
        
        if (liveSitePhotosComments) {
            liveSitePhotosComments.innerHTML = '';
        }
        
        if (liveDocumentPhotosComments) {
            liveDocumentPhotosComments.innerHTML = '';
        }
        
        // Datei-Vorschau-Funktion für die neuen Inputs einrichten - für doppelte Kamera/Galerie-Inputs
        setupDualFilePreview('live-site-photos', 'live-site-photos-preview');
        setupDualFilePreview('live-document-photos', 'live-document-photos-preview');
    } else {
        console.error('Live-Dokumentations-Modal nicht gefunden');
        alert('Fehler: Modal konnte nicht geöffnet werden.');
    }
}

// Live-Dokumentation speichern
// Flag um doppelte Ausführung zu verhindern
let isSubmittingLiveDocumentation = false;

async function handleLiveDocumentationSave(event) {
    if (event) {
        event.preventDefault();
    }
    
    // Doppelte Ausführung verhindern
    if (isSubmittingLiveDocumentation) {
        console.log('Live-Dokumentation wird bereits verarbeitet, überspringe...');
        return;
    }
    
    isSubmittingLiveDocumentation = true;
    
    try {
        const timeEntry = getCurrentTimeEntry();
        if (!timeEntry) {
            alert('Kein aktiver Zeiteintrag gefunden.');
            return;
        }
        
        const user = getCurrentUser();
        if (!user || !user.id) {
            alert('Bitte loggen Sie sich ein, um fortzufahren.');
            return;
        }
        
        // Firebase-Verbindung prüfen
        if (!firebase || !firebase.firestore || !firebase.storage) {
            throw new Error('Firebase ist nicht verfügbar. Bitte prüfen Sie Ihre Internetverbindung.');
        }
        
        console.log('🔄 Firebase-Verbindung erfolgreich überprüft');
        
        // Hilfsfunktion zum Sammeln aller Dateien aus beiden Inputs (mit Duplikaterkennung und getAllFiles-Support)
        function getAllFilesFromDualInputs(cameraInput, galleryInput) {
            const allFiles = [];
            const seenFiles = new Map(); // Um Duplikate zu erkennen
            
            console.log(`🔍 getAllFilesFromDualInputs aufgerufen:`);
            console.log(`  cameraInput: ${!!cameraInput} (getAllFiles verfügbar: ${!!cameraInput?.getAllFiles})`);
            console.log(`  galleryInput: ${!!galleryInput} (getAllFiles verfügbar: ${!!galleryInput?.getAllFiles})`);
            
            // Dateien aus Kamera-Input sammeln (über setupDualFilePreview)
            if (cameraInput && cameraInput.getAllFiles) {
                const cameraFiles = cameraInput.getAllFiles();
                console.log(`📷 Kamera-Input hat ${cameraFiles.length} Dateien`);
                for (const file of cameraFiles) {
                    const fileKey = `${file.name}_${file.size}_${file.lastModified}`;
                    if (!seenFiles.has(fileKey)) {
                        seenFiles.set(fileKey, true);
                        allFiles.push(file);
                        console.log(`📷 Kamera-Datei hinzugefügt: ${file.name}`);
                    } else {
                        console.log(`⚠️ Duplikat erkannt (Kamera): ${file.name}`);
                    }
                }
            } else if (cameraInput && cameraInput.files && cameraInput.files.length > 0) {
                // Fallback für direkte files-Eigenschaft
                console.log(`📷 Fallback: Kamera-Input hat ${cameraInput.files.length} Dateien (direkt)`);
                for (const file of cameraInput.files) {
                    const fileKey = `${file.name}_${file.size}_${file.lastModified}`;
                    if (!seenFiles.has(fileKey)) {
                        seenFiles.set(fileKey, true);
                        allFiles.push(file);
                        console.log(`📷 Kamera-Datei hinzugefügt (Fallback): ${file.name}`);
                    } else {
                        console.log(`⚠️ Duplikat erkannt (Kamera): ${file.name}`);
                    }
                }
            }
            
            // Dateien aus Galerie-Input sammeln (über setupDualFilePreview)
            if (galleryInput && galleryInput.getAllFiles) {
                const galleryFiles = galleryInput.getAllFiles();
                console.log(`🖼️ Galerie-Input hat ${galleryFiles.length} Dateien`);
                for (const file of galleryFiles) {
                    const fileKey = `${file.name}_${file.size}_${file.lastModified}`;
                    if (!seenFiles.has(fileKey)) {
                        seenFiles.set(fileKey, true);
                        allFiles.push(file);
                        console.log(`🖼️ Galerie-Datei hinzugefügt: ${file.name}`);
                    } else {
                        console.log(`⚠️ Duplikat erkannt (Galerie): ${file.name}`);
                    }
                }
            } else if (galleryInput && galleryInput.files && galleryInput.files.length > 0) {
                // Fallback für direkte files-Eigenschaft
                console.log(`🖼️ Fallback: Galerie-Input hat ${galleryInput.files.length} Dateien (direkt)`);
                for (const file of galleryInput.files) {
                    const fileKey = `${file.name}_${file.size}_${file.lastModified}`;
                    if (!seenFiles.has(fileKey)) {
                        seenFiles.set(fileKey, true);
                        allFiles.push(file);
                        console.log(`🖼️ Galerie-Datei hinzugefügt (Fallback): ${file.name}`);
                    } else {
                        console.log(`⚠️ Duplikat erkannt (Galerie): ${file.name}`);
                    }
                }
            }
            
            console.log(`📊 Insgesamt ${allFiles.length} eindeutige Dateien gesammelt`);
            return allFiles;
        }
        
        // Daten aus dem Formular abrufen - für doppelte Kamera/Galerie-Inputs
        const notes = document.getElementById('live-notes').value;
        const liveSitePhotosCameraInput = document.getElementById('live-site-photos-camera');
        const liveSitePhotosGalleryInput = document.getElementById('live-site-photos-gallery');
        const liveDocumentPhotosCameraInput = document.getElementById('live-document-photos-camera');
        const liveDocumentPhotosGalleryInput = document.getElementById('live-document-photos-gallery');
        
        // Debug: Überprüfe, ob alle Inputs gefunden wurden
        console.log('🔍 Input-Elemente-Check:');
        console.log('  liveSitePhotosCameraInput:', !!liveSitePhotosCameraInput);
        console.log('  liveSitePhotosGalleryInput:', !!liveSitePhotosGalleryInput);
        console.log('  liveDocumentPhotosCameraInput:', !!liveDocumentPhotosCameraInput);
        console.log('  liveDocumentPhotosGalleryInput:', !!liveDocumentPhotosGalleryInput);
        
        // Prüfe auch, ob die getAllFiles-Methoden verfügbar sind
        if (liveSitePhotosCameraInput) {
            console.log('  liveSitePhotosCameraInput.getAllFiles verfügbar:', !!liveSitePhotosCameraInput.getAllFiles);
        }
        if (liveSitePhotosGalleryInput) {
            console.log('  liveSitePhotosGalleryInput.getAllFiles verfügbar:', !!liveSitePhotosGalleryInput.getAllFiles);
        }
        if (liveDocumentPhotosCameraInput) {
            console.log('  liveDocumentPhotosCameraInput.getAllFiles verfügbar:', !!liveDocumentPhotosCameraInput.getAllFiles);
        }
        if (liveDocumentPhotosGalleryInput) {
            console.log('  liveDocumentPhotosGalleryInput.getAllFiles verfügbar:', !!liveDocumentPhotosGalleryInput.getAllFiles);
        }
        
        // Alle Dateien aus beiden Inputs sammeln
        const allLiveSitePhotos = getAllFilesFromDualInputs(liveSitePhotosCameraInput, liveSitePhotosGalleryInput);
        const allLiveDocumentPhotos = getAllFilesFromDualInputs(liveDocumentPhotosCameraInput, liveDocumentPhotosGalleryInput);
        
        console.log('Starte Live-Dokumentation Speicherung:', {
            timeEntryId: timeEntry.id,
            notes,
            sitePhotos: allLiveSitePhotos.length,
            documents: allLiveDocumentPhotos.length
        });
        

        
        // Arrays für die Upload-Objekte
        const sitePhotoObjects = [];
        const documentPhotoObjects = [];
        
        // Baustellenfotos hochladen
        if (allLiveSitePhotos.length > 0) {
            const liveSitePhotoComments = document.querySelectorAll('#live-site-photos-comments .image-comment-item');
            
            console.log(`🔄 Starte Upload von ${allLiveSitePhotos.length} Baustellenfotos...`);
            console.log(`🔍 Verfügbare Dateien:`, allLiveSitePhotos.map((f, idx) => `${idx}: ${f.name}`));
            console.log(`🔍 Dateien-Details:`, allLiveSitePhotos.map((f, idx) => ({ 
                index: idx, 
                name: f.name, 
                size: f.size, 
                type: f.type, 
                lastModified: f.lastModified 
            })));
            
            const seenKeys = new Set();
            for (let i = 0; i < allLiveSitePhotos.length; i++) {
                try {
                    const file = allLiveSitePhotos[i];
                    const key = `${file.name}_${file.size}_${file.lastModified}`;
                    if (seenKeys.has(key)) {
                        console.log(`⏭️ Überspringe doppeltes Bild (Session): ${file.name}`);
                        continue;
                    }
                    seenKeys.add(key);
                    console.log(`📷 Uploade Baustellenfoto ${i + 1}/${allLiveSitePhotos.length}: ${file.name}`);
                    
                    // Kommentar für dieses Bild finden
                    let imageComment = '';
                    const liveCommentItem = liveSitePhotoComments[i];
                    if (liveCommentItem) {
                        const commentTextarea = liveCommentItem.querySelector('textarea');
                        if (commentTextarea) {
                            imageComment = commentTextarea.value;
                        }
                    }
                    
                    // Firebase Storage Check - aber nicht als Fehler behandeln
                    console.log(`🔧 Firebase Storage verfügbar: ${!!firebase.storage}`);
                    
                    console.log(`🚀 Starte DataService.uploadFile für Bild ${i + 1}...`);
                    const upload = await DataService.uploadFile(
                        file,
                        timeEntry.projectId,
                        timeEntry.employeeId,
                        'construction_site',
                        notes,
                        imageComment
                    );
                    
                    console.log(`🎉 DataService.uploadFile abgeschlossen für Bild ${i + 1}:`, upload);
                    console.log(`✅ Baustellenfoto ${i + 1} erfolgreich hochgeladen - ID: ${upload.id}`);
                    
                    // Null-Check für Upload-Ergebnis
                    if (!upload || !upload.id) {
                        throw new Error(`Upload-Ergebnis für Bild ${i + 1} ist leer oder ungültig`);
                    }
                    
                    // Firebase-kompatibles Objekt erstellen - sichere Behandlung
                    const safeUpload = {
                        ...upload,
                        uploadTime: upload.uploadTime || new Date()
                    };
                    
                    // Firestore Timestamp korrekt konvertieren falls vorhanden
                    if (upload.uploadTime && typeof upload.uploadTime.toDate === 'function') {
                        safeUpload.uploadTime = upload.uploadTime.toDate();
                    } else if (upload.uploadTime && upload.uploadTime.seconds) {
                        // Falls es ein Firestore Timestamp-Objekt ist
                        safeUpload.uploadTime = new Date(upload.uploadTime.seconds * 1000);
                    }
                    
                    console.log(`📦 Bereite Upload-Objekt für Bild ${i + 1} vor:`, safeUpload);
                    sitePhotoObjects.push(safeUpload);
                    console.log(`📸 Baustellenfoto ${i + 1} zu Objektliste hinzugefügt - Total: ${sitePhotoObjects.length}`);
                    console.log(`📋 Aktuelle sitePhotoObjects:`, sitePhotoObjects.map(obj => ({ id: obj.id, fileName: obj.fileName })));
                    
                } catch (uploadError) {
                    console.error(`❌ Fehler beim Hochladen des Baustellenfotos ${i + 1}:`, uploadError);
                    console.error(`❌ Fehler-Typ:`, uploadError.constructor.name);
                    console.error(`❌ Fehler-Details:`, uploadError.message);
                    console.error(`❌ Fehler-Stack:`, uploadError.stack);
                    
                    // Upload-Fehler protokollieren aber weitermachen
                    console.log(`⚠️ Setze Upload-Loop fort mit nächstem Bild (${i + 2}/${allLiveSitePhotos.length})...`);
                    console.log(`📊 Aktuelle Anzahl erfolgreich hochgeladener Bilder: ${sitePhotoObjects.length}`);
                }
            }
            
            console.log(`📊 Upload-Schleife für Baustellenfotos beendet`);
            console.log(`🎯 Endergebnis: ${sitePhotoObjects.length}/${allLiveSitePhotos.length} Bilder erfolgreich hochgeladen`);
        }
        
        // Dokumente hochladen
        if (allLiveDocumentPhotos.length > 0) {
            const liveDocumentPhotoComments = document.querySelectorAll('#live-document-photos-comments .image-comment-item');
            
            console.log(`🔄 Starte Upload von ${allLiveDocumentPhotos.length} Dokumenten...`);
            
            const seenDocKeys = new Set();
            for (let i = 0; i < allLiveDocumentPhotos.length; i++) {
                try {
                    const file = allLiveDocumentPhotos[i];
                    const key = `${file.name}_${file.size}_${file.lastModified}`;
                    if (seenDocKeys.has(key)) {
                        console.log(`⏭️ Überspringe doppeltes Dokument (Session): ${file.name}`);
                        continue;
                    }
                    seenDocKeys.add(key);
                    console.log(`📄 Uploade Dokument ${i + 1}/${allLiveDocumentPhotos.length}: ${file.name}`);
                    
                    // Kommentar für dieses Dokument finden
                    let imageComment = '';
                    const commentItem = liveDocumentPhotoComments[i];
                    if (commentItem) {
                        const commentTextarea = commentItem.querySelector('textarea');
                        if (commentTextarea) {
                            imageComment = commentTextarea.value;
                        }
                    }
                    
                    // Dokumenttyp bestimmen
                    const documentType = file.name.toLowerCase().includes('rechnung') ? 'invoice' : 'delivery_note';
                    
                    // Überprüfung der Firebase-Verbindung
                    if (!firebase.storage) {
                        throw new Error('Firebase Storage ist nicht verfügbar');
                    }
                    
                    const upload = await DataService.uploadFile(
                        file,
                        timeEntry.projectId,
                        timeEntry.employeeId,
                        documentType,
                        notes,
                        imageComment
                    );
                    
                    console.log(`✅ Dokument ${i + 1} erfolgreich hochgeladen:`, upload.id);
                    
                    // Firebase-kompatibles Objekt erstellen - sichere Behandlung
                    const safeUpload = {
                        ...upload,
                        uploadTime: upload.uploadTime || new Date()
                    };
                    
                    // Firestore Timestamp korrekt konvertieren falls vorhanden
                    if (upload.uploadTime && typeof upload.uploadTime.toDate === 'function') {
                        safeUpload.uploadTime = upload.uploadTime.toDate();
                    } else if (upload.uploadTime && upload.uploadTime.seconds) {
                        // Falls es ein Firestore Timestamp-Objekt ist
                        safeUpload.uploadTime = new Date(upload.uploadTime.seconds * 1000);
                    }
                    
                    documentPhotoObjects.push(safeUpload);
                    console.log(`📄 Dokument ${i + 1} zu Objektliste hinzugefügt`);
                    
                } catch (uploadError) {
                    console.error(`❌ Fehler beim Hochladen des Dokuments ${i + 1}:`, uploadError);
                    // Weitermachen mit dem nächsten Dokument - aber Upload als fehlgeschlagen markieren
                }
            }
        }
        
        console.log(`📊 Upload-Zusammenfassung:`);
        console.log(`📷 ${sitePhotoObjects.length} Baustellenfotos erfolgreich hochgeladen`);
        console.log(`📄 ${documentPhotoObjects.length} Dokumente erfolgreich hochgeladen`);
        
        // Live-Dokumentation zum Zeiteintrag hinzufügen
        const documentationData = {
            notes: notes,
            images: sitePhotoObjects, // Umbenennung für bessere Klarheit
            documents: documentPhotoObjects,
            photoCount: sitePhotoObjects.length,
            documentCount: documentPhotoObjects.length,
            addedBy: user.id,
            addedByName: user.firstName + ' ' + user.lastName
        };
        
        console.log('💾 Speichere Live-Dokumentation in Firestore...');
        
        try {
            await DataService.addLiveDocumentationToTimeEntry(timeEntry.id, documentationData);
            console.log('✅ Live-Dokumentation erfolgreich in Firestore gespeichert');
        } catch (firestoreError) {
            console.error('❌ Fehler beim Speichern in Firestore:', firestoreError);
            throw new Error(`Fehler beim Speichern der Dokumentation: ${firestoreError.message}`);
        }
        
        // Erfolgsmeldung anzeigen
        let message = '✅ Live-Dokumentation erfolgreich gespeichert!\n\n';
        message += `📝 Notizen: "${notes}"\n`;
        message += `📷 Baustellenfotos: ${sitePhotoObjects.length} hochgeladen\n`;
        message += `📄 Dokumente: ${documentPhotoObjects.length} hochgeladen\n`;
        message += `🕒 Gespeichert um: ${new Date().toLocaleTimeString('de-DE')}`;
        
        alert(message);
        
        // Modal schließen
        const modal = document.getElementById('live-documentation-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        
        console.log('Live-Dokumentation erfolgreich gespeichert:', documentationData);
        
    } catch (error) {
        console.error('Fehler beim Speichern der Live-Dokumentation:', error);
        alert('Fehler beim Speichern: ' + error.message);
    } finally {
        // Flag zurücksetzen
        isSubmittingLiveDocumentation = false;
    }
}

// Erweitertes Ausstempeln mit Dokumentation
let isSubmittingExtendedClockOut = false;
async function handleExtendedClockOut(event) {
    if (event) {
        event.preventDefault();
    }
    if (isSubmittingExtendedClockOut) {
        console.log('Erweitertes Ausstempeln wird bereits verarbeitet, überspringe...');
        return;
    }
    isSubmittingExtendedClockOut = true;
    
    try {
        const user = getCurrentUser();
        if (!user || !user.id) {
            console.error('Kein Benutzer angemeldet oder Benutzer-ID fehlt');
            alert('Bitte loggen Sie sich ein, um fortzufahren.');
            return;
        }
        
        const timeEntry = getCurrentTimeEntry();
        if (!timeEntry || !timeEntry.id) {
            console.error('Kein aktiver Zeiterfassungseintrag vorhanden');
            alert('Es wurde kein aktiver Zeiterfassungseintrag gefunden. Sie sind nicht eingestempelt.');
            return;
        }
        
        // Notizen aus dem Formular abrufen
        const notes = document.getElementById('clock-out-notes').value;
        
        // Standort abrufen
        const location = await getCurrentLocationForClockOut();
        
        // Aktuelle Zeit als Ausstempelzeit verwenden
        const clockOutTime = new Date();
        
        // Dateien aus beiden Input-Feldern abrufen (Kamera und Galerie)
        const sitePhotosCameraInput = document.getElementById('site-photos-camera');
        const sitePhotosGalleryInput = document.getElementById('site-photos-gallery');
        const documentPhotosCameraInput = document.getElementById('document-photos-camera');
        const documentPhotosGalleryInput = document.getElementById('document-photos-gallery');
         // Array für direkte Speicherung der vollständigen Upload-Objekte
        const sitePhotoObjects = [];
        const documentPhotoObjects = [];

        // Hilfsfunktion zum Sammeln aller Dateien aus beiden Inputs (mit Duplikaterkennung und getAllFiles-Support)
        function getAllFilesFromDualInputs(cameraInput, galleryInput) {
            const allFiles = [];
            const seenFiles = new Map(); // Um Duplikate zu erkennen
            
            console.log(`🔍 getAllFilesFromDualInputs aufgerufen:`);
            console.log(`  cameraInput: ${!!cameraInput} (getAllFiles verfügbar: ${!!cameraInput?.getAllFiles})`);
            console.log(`  galleryInput: ${!!galleryInput} (getAllFiles verfügbar: ${!!galleryInput?.getAllFiles})`);
            
            // Dateien aus Kamera-Input sammeln (über setupDualFilePreview)
            if (cameraInput && cameraInput.getAllFiles) {
                const cameraFiles = cameraInput.getAllFiles();
                console.log(`📷 Kamera-Input hat ${cameraFiles.length} Dateien`);
                for (const file of cameraFiles) {
                    const fileKey = `${file.name}_${file.size}_${file.lastModified}`;
                    if (!seenFiles.has(fileKey)) {
                        seenFiles.set(fileKey, true);
                        allFiles.push(file);
                        console.log(`📷 Kamera-Datei hinzugefügt: ${file.name}`);
                    } else {
                        console.log(`⚠️ Duplikat erkannt (Kamera): ${file.name}`);
                    }
                }
            } else if (cameraInput && cameraInput.files && cameraInput.files.length > 0) {
                // Fallback für direkte files-Eigenschaft
                console.log(`📷 Fallback: Kamera-Input hat ${cameraInput.files.length} Dateien (direkt)`);
                for (const file of cameraInput.files) {
                    const fileKey = `${file.name}_${file.size}_${file.lastModified}`;
                    if (!seenFiles.has(fileKey)) {
                        seenFiles.set(fileKey, true);
                        allFiles.push(file);
                        console.log(`📷 Kamera-Datei hinzugefügt (Fallback): ${file.name}`);
                    } else {
                        console.log(`⚠️ Duplikat erkannt (Kamera): ${file.name}`);
                    }
                }
            }
            
            // Dateien aus Galerie-Input sammeln (über setupDualFilePreview)
            if (galleryInput && galleryInput.getAllFiles) {
                const galleryFiles = galleryInput.getAllFiles();
                console.log(`🖼️ Galerie-Input hat ${galleryFiles.length} Dateien`);
                for (const file of galleryFiles) {
                    const fileKey = `${file.name}_${file.size}_${file.lastModified}`;
                    if (!seenFiles.has(fileKey)) {
                        seenFiles.set(fileKey, true);
                        allFiles.push(file);
                        console.log(`🖼️ Galerie-Datei hinzugefügt: ${file.name}`);
                    } else {
                        console.log(`⚠️ Duplikat erkannt (Galerie): ${file.name}`);
                    }
                }
            } else if (galleryInput && galleryInput.files && galleryInput.files.length > 0) {
                // Fallback für direkte files-Eigenschaft
                console.log(`🖼️ Fallback: Galerie-Input hat ${galleryInput.files.length} Dateien (direkt)`);
                for (const file of galleryInput.files) {
                    const fileKey = `${file.name}_${file.size}_${file.lastModified}`;
                    if (!seenFiles.has(fileKey)) {
                        seenFiles.set(fileKey, true);
                        allFiles.push(file);
                        console.log(`🖼️ Galerie-Datei hinzugefügt (Fallback): ${file.name}`);
                    } else {
                        console.log(`⚠️ Duplikat erkannt (Galerie): ${file.name}`);
                    }
                }
            }
            
            console.log(`📊 Insgesamt ${allFiles.length} eindeutige Dateien gesammelt`);
            return allFiles;
        }
        
        // Uploads für Baustellen-Fotos mit Kommentaren
        const sitePhotoUploads = [];
        const allSitePhotos = getAllFilesFromDualInputs(sitePhotosCameraInput, sitePhotosGalleryInput);
        
        if (allSitePhotos.length > 0) {
            const sitePhotoComments = document.querySelectorAll('#site-photos-comments .image-comment-item');
            
            for (let i = 0; i < allSitePhotos.length; i++) {
                try {
                    const file = allSitePhotos[i];
                    // Kommentar für dieses Bild finden
                    let imageComment = '';
                    const commentItem = sitePhotoComments[i];
                    if (commentItem) {
                        const commentTextarea = commentItem.querySelector('textarea');
                        if (commentTextarea) {
                            imageComment = commentTextarea.value;
                        }
                    }
                    
                    const upload = await DataService.uploadFile(
                        file,
                        timeEntry.projectId,
                        timeEntry.employeeId,
                        'construction_site',
                        notes,
                        imageComment // Kommentar zum Bild hinzufügen
                    );
                    sitePhotoUploads.push(upload.id);
                    
                    // Firebase-kompatibles Objekt erstellen (ohne serverTimestamp)
                    const safeUpload = {
                        ...upload,
                        uploadTime: upload.uploadTime ? 
                            (upload.uploadTime.toDate ? new Date(upload.uploadTime.toDate()) : new Date()) : null // Konvertiere Firestore-Zeitstempel
                    };
                    sitePhotoObjects.push(safeUpload); 
                    console.log('Baustellen-Foto hochgeladen:', upload);
                } catch (uploadError) {
                    console.error('Fehler beim Hochladen des Baustellen-Fotos:', uploadError);
                }
            }
        }
        
        // Uploads für Dokument-Fotos mit Kommentaren
        const documentPhotoUploads = [];
        const allDocumentPhotos = getAllFilesFromDualInputs(documentPhotosCameraInput, documentPhotosGalleryInput);
        
        if (allDocumentPhotos.length > 0) {
            const documentPhotoComments = document.querySelectorAll('#document-photos-comments .image-comment-item');
            
            for (let i = 0; i < allDocumentPhotos.length; i++) {
                try {
                    const file = allDocumentPhotos[i];
                    // Kommentar für dieses Bild finden
                    let imageComment = '';
                    const docCommentItem = documentPhotoComments[i];
                    if (docCommentItem) {
                        const commentTextarea = docCommentItem.querySelector('textarea');
                        if (commentTextarea) {
                            imageComment = commentTextarea.value;
                        }
                    }
                    
                    // Bei Dokumenten den Typ genauer spezifizieren (delivery_note statt generic 'document')
                    const documentType = file.name.toLowerCase().includes('rechnung') ? 'invoice' : 'delivery_note';
                    
                    const upload = await DataService.uploadFile(
                        file,
                        timeEntry.projectId,
                        timeEntry.employeeId,
                        documentType,  // Korrekten Dokumenttyp verwenden
                        notes,
                        imageComment // Kommentar zum Dokument hinzufügen
                    );
                    documentPhotoUploads.push(upload.id);
                    
                    // Firebase-kompatibles Objekt erstellen (ohne serverTimestamp)
                    const safeUpload = {
                        ...upload,
                        uploadTime: upload.uploadTime ? 
                            (upload.uploadTime.toDate ? new Date(upload.uploadTime.toDate()) : new Date()) : null // Konvertiere Firestore-Zeitstempel
                    };
                    documentPhotoObjects.push(safeUpload);
                    console.log('Dokument hochgeladen:', upload);
                } catch (uploadError) {
                    console.error('Fehler beim Hochladen des Dokument-Fotos:', uploadError);
                }
            }
        }
        
        // Zeiteintrag aktualisieren mit Ausstempelzeit und Notizen
        const updateData = {
            clockOutTime: clockOutTime,
            notes: notes,
            locationOut: location,
            sitePhotoUploads: sitePhotoUploads,
            documentPhotoUploads: documentPhotoUploads,
            // Zusätzlich die vollständigen Objekte speichern für Kompatibilität älterer Ansichten
            sitePhotos: sitePhotoObjects,
            documents: documentPhotoObjects,
            hasDocumentation: (sitePhotoObjects.length > 0 || documentPhotoObjects.length > 0 || notes.trim() !== '')
        };
        
        // Pausenzeit berücksichtigen, falls vorhanden
        if (window.app.pauseTotalTime > 0) {
            updateData.pauseTotalTime = window.app.pauseTotalTime;
        }
        
        // Pausendetails vom aktuellen Zeiteintrag beibehalten
        if (timeEntry.pauseDetails && timeEntry.pauseDetails.length > 0) {
            updateData.pauseDetails = timeEntry.pauseDetails;
        }
        
        console.log('Aktualisiere Zeiteintrag mit Dokumentation:', updateData);
        
        // Zuerst ausstempeln mit automatischer Pausenberechnung
        const result = await DataService.clockOutEmployee(timeEntry.id, notes, location);
        
        // Dann die Dokumentation hinzufügen
        const docUpdateData = {
            sitePhotoUploads: sitePhotoUploads,
            documentPhotoUploads: documentPhotoUploads,
            sitePhotos: sitePhotoObjects,
            documents: documentPhotoObjects,
            hasDocumentation: (sitePhotoObjects.length > 0 || documentPhotoObjects.length > 0 || notes.trim() !== '')
        };
        
        await DataService.updateTimeEntry(timeEntry.id, docUpdateData);
        
        // Globale Variablen zurücksetzen
        setCurrentTimeEntry(null);
        window.app.pauseTotalTime = 0;
        window.app.pauseStartTime = null;
        window.app.isPaused = false;
        
        // Timer stoppen
        const timer = getClockTimer();
        if (timer) {
            clearInterval(timer);
            setClockTimer(null);
        }
        
        // UI aktualisieren
        showClockedOutState();
        
        // Formular zurücksetzen
        document.getElementById('extended-clock-out-form').reset();
        
        // Vorschaubilder zurücksetzen
        if (typeof setupFilePreview.clearPreviews === 'function') {
            setupFilePreview.clearPreviews();
        }
        
        // Modal schließen
        const modal = document.getElementById('extended-clock-out-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        
        // Benachrichtigung über automatische Pause anzeigen
        if (result.automaticBreak) {
            alert(`Erfolgreich ausgestempelt mit Dokumentation!\n\n✅ Automatische Pause hinzugefügt: ${result.automaticBreak.duration} Minuten\n(${result.automaticBreak.reason})`);
        } else {
            alert('Erfolgreich ausgestempelt mit Dokumentation!');
        }
    } catch (error) {
        console.error('Fehler beim erweiterten Ausstempeln:', error);
        alert('Fehler beim Ausstempeln: ' + error.message);
    } finally {
        isSubmittingExtendedClockOut = false;
    }
}

// Anzeigen des eingestempelten Zustands
function showClockedInState(project, timeEntry) {
    if (!project || !timeEntry) {
        console.error('Fehler: Projekt oder Zeiteintrag fehlt für die Anzeige des eingestempelten Zustands');
        showClockedOutState();
        return;
    }
    
    try {
        // Status-Text aktualisieren
        statusText.textContent = 'Eingestempelt';
        statusText.style.color = '#4CAF50'; // Grün
        
        // Einstempel-Formular ausblenden
        clockInForm.classList.add('hidden');
        
        // Ausstempel-Formular anzeigen
        clockOutForm.classList.remove('hidden');
        
        // Projektname und Einstempelzeit anzeigen
        activeProjectSpan.textContent = project.name;
        
        const clockInTime = timeEntry.clockInTime instanceof firebase.firestore.Timestamp 
            ? timeEntry.clockInTime.toDate() 
            : new Date(timeEntry.clockInTime);
            
        clockInTimeSpan.textContent = clockInTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        
        // Prüfen, ob der Benutzer Dokumentationsberechtigung hat und entsprechenden Button anzeigen/ausblenden
        const currentUser = getCurrentUser();
        const extendedClockOutBtn = document.getElementById('extended-clock-out-btn');
        if (extendedClockOutBtn) {
            if (currentUser && (window.app.documentationUsers.includes(currentUser.username) || currentUser.username === 'martin')) {
                extendedClockOutBtn.classList.remove('hidden');
            } else {
                extendedClockOutBtn.classList.add('hidden');
            }
        }
        
        // Pausenzustand zurücksetzen (nicht mehr benötigt)
        window.app.isPaused = false;
        
        // Timer für die Zeitanzeige aktualisieren
        const currentTimer = getClockTimer();
        if (currentTimer) {
            clearInterval(currentTimer);
        }
        
        const newTimer = setInterval(() => {
            const now = new Date();
            const diffMs = now - clockInTime;
            const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);
            
            const timeStr = `${diffHrs.toString().padStart(2, '0')}:${diffMins.toString().padStart(2, '0')}:${diffSecs.toString().padStart(2, '0')}`;
            currentTimeSpan.textContent = timeStr;
        }, 1000);
        
        setClockTimer(newTimer);
        
        // Benutzeraktivitäten aktualisieren
        loadUserActivities();
        
    } catch (error) {
        console.error('Fehler beim Anzeigen des eingestempelten Zustands:', error);
        showClockedOutState();
    }
}

// Anzeigen des ausgestempelten Zustands
function showClockedOutState() {
    statusText.textContent = 'Nicht eingestempelt';
    statusText.style.color = 'var(--text-color)';
    
    // Formulare umschalten
    clockInForm.classList.remove('hidden');
    clockOutForm.classList.add('hidden');
    
    // Projektauswahl wieder aktivieren
    projectSelect.disabled = false;
    
    // Timer zurücksetzen
    const currentTimer = getClockTimer();
    if (currentTimer) {
        clearInterval(currentTimer);
        setClockTimer(null);
    }
    
    // Uhrzeit zurücksetzen
    updateCurrentTime();
}

// Standort abrufen
function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        console.log('Versuche Standort abzufragen...');
        
        if (!navigator.geolocation) {
            console.error('Geolocation wird von diesem Browser nicht unterstützt');
            resolve({ lat: null, lng: null });
            return;
        }
        
        try {
            navigator.geolocation.getCurrentPosition(
                position => {
                    console.log('Standort erfolgreich abgefragt:', position.coords);
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    });
                },
                error => {
                    console.error('Fehler bei der Standortbestimmung:', error);
                    // Standortfehler nicht als Fehler behandeln - leere Koordinaten zurückgeben
                    resolve({ lat: null, lng: null });
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } catch (error) {
            console.error('Ausnahmefehler bei der Standortabfrage:', error);
            resolve({ lat: null, lng: null });
        }
    });
}

// Aktuellen Standort für Ausstempeln abrufen
async function getCurrentLocationForClockOut() {
    console.log('Rufe Standort für Ausstempeln ab');
    try {
        return await getCurrentLocation();
    } catch (error) {
        console.error('Fehler beim Abrufen des Standorts für Ausstempeln:', error);
        return { lat: null, lng: null };
    }
}

// Benutzeraktivitäten laden
async function loadUserActivities() {
    const user = getCurrentUser();
    if (!user || !user.id) {
        console.error('Kein Benutzer angemeldet oder Benutzer-ID fehlt');
        return;
    }
    
    try {
        console.log('Lade Aktivitäten für Benutzer-ID:', user.id);
        const entries = await DataService.getTimeEntriesByEmployeeId(user.id);
        
        // Prüfen, ob entries ein Array ist
        if (!entries || !Array.isArray(entries)) {
            console.error('Keine Zeiteinträge gefunden oder ungültiges Format:', entries);
            activitiesList.innerHTML = '<li>Keine Aktivitäten vorhanden</li>';
            return;
        }
        
        console.log('Gefundene Aktivitäten:', entries.length);
        
        // Sortieren (neueste zuerst)
        entries.sort((a, b) => {
            const dateA = a.clockInTime instanceof firebase.firestore.Timestamp ? 
                a.clockInTime.toDate() : new Date(a.clockInTime);
            const dateB = b.clockInTime instanceof firebase.firestore.Timestamp ? 
                b.clockInTime.toDate() : new Date(b.clockInTime);
            return dateB - dateA;
        });
        
        // Nur die letzten 5 anzeigen
        const recentEntries = entries.slice(0, 5);
        
        // Liste leeren
        activitiesList.innerHTML = '';
    
        // Aktivitäten hinzufügen
        if (recentEntries.length === 0) {
            activitiesList.innerHTML = '<li>Keine Aktivitäten vorhanden</li>';
            return;
        }
        
        for (const entry of recentEntries) {
            try {
                // Projekt asynchron laden
                const project = await DataService.getProjectById(entry.projectId);
                
                // Korrekte Konvertierung der Firebase Timestamps
                const clockInTime = entry.clockInTime instanceof firebase.firestore.Timestamp ? 
                    entry.clockInTime.toDate() : new Date(entry.clockInTime);
                
                let clockOutTime = null;
                if (entry.clockOutTime) {
                    clockOutTime = entry.clockOutTime instanceof firebase.firestore.Timestamp ? 
                        entry.clockOutTime.toDate() : new Date(entry.clockOutTime);
                }
                
                const listItem = document.createElement('li');
                
                // Formatierung der Datumsanzeige
                const date = clockInTime.toLocaleDateString('de-DE');
                const timeIn = clockInTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                
                let content = `<strong>${entry.isVacationDay ? 'Urlaub' : (project ? project.name : 'Unbekanntes Projekt')}</strong><br>`;
                content += `Datum: ${date}<br>`;
                content += `Eingestempelt: ${timeIn}`;
                
                if (clockOutTime) {
                    const timeOut = clockOutTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                    
                    // Berechnung der Arbeitszeit mit korrekter Pausenzeit
                    const pauseTotalTime = entry.pauseTotalTime || 0;
                    
                    // Direkte Berechnung der Arbeitszeit basierend auf den Zeiten und der Pausenzeit
                    const diffMs = clockOutTime - clockInTime;
                    const actualWorkTime = diffMs - pauseTotalTime;
                    const minutes = Math.floor(actualWorkTime / 60000);
                    const hours = minutes / 60;
                    const formattedHours = hours.toFixed(2).replace('.', ',');
                    
                    content += `<br>Ausgestempelt: ${timeOut}`;
                    
                    // Pausenzeit anzeigen, falls vorhanden
                    if (pauseTotalTime > 0) {
                        const pauseMinutes = Math.floor(pauseTotalTime / 60000);
                        const pauseHours = pauseMinutes / 60;
                        const formattedPauseHours = pauseHours.toFixed(2).replace('.', ',');
                        content += `<br>Pausenzeit: ${formattedPauseHours}h`;
                    }
                    
                    content += `<br>Arbeitsstunden: ${formattedHours}h`;
                    
                    // Falls Pausen gemacht wurden, Details anzeigen
                    if (entry.pauseDetails && entry.pauseDetails.length > 0) {
                        content += `<br><details><summary>Pausendetails</summary><ul>`;
                        for (const pause of entry.pauseDetails) {
                            // Sicherstellen, dass start und end Timestamps oder Datum-Objekte sind
                            let startTime, endTime, pauseDuration;
                            
                            try {
                                // Konvertierung der Zeitstempel in Date-Objekte
                                const startDate = pause.start instanceof firebase.firestore.Timestamp ?
                                    pause.start.toDate() : new Date(pause.start);
                                const endDate = pause.end instanceof firebase.firestore.Timestamp ?
                                    pause.end.toDate() : new Date(pause.end);
                                
                                // Formatierung der Zeiten
                                startTime = startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                endTime = endDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                
                                // Berechnung der Pausendauer
                                pauseDuration = Math.floor((endDate - startDate) / 60000);
                            } catch (e) {
                                console.error('Fehler bei der Verarbeitung einer Pause:', e, pause);
                                startTime = 'Unbekannt';
                                endTime = 'Unbekannt';
                                pauseDuration = 0;
                            }
                            
                            content += `<li>Pause von ${startTime} bis ${endTime} (${pauseDuration} Min.)</li>`;
                        }
                        content += `</ul></details>`;
                    }
                } else {
                    content += `<br><em>Noch eingestempelt</em>`;
                    
                    // Falls aktuell eine Pause läuft, anzeigen
                    if (window.app.isPaused && window.app.pauseStartTime) {
                        const pauseStart = window.app.pauseStartTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                        content += `<br><em>Pause seit ${pauseStart}</em>`;
                    }
                }
                
                listItem.innerHTML = content;
                activitiesList.appendChild(listItem);
            } catch (error) {
                console.error('Fehler beim Anzeigen des Eintrags:', error, entry);
            }
        }
    } catch (error) {
        console.error('Fehler beim Laden der Benutzeraktivitäten:', error);
        activitiesList.innerHTML = '<li>Fehler beim Laden der Aktivitäten</li>';
    }
}

// Datei-Vorschau-Funktion mit Kommentarfunktion
function setupFilePreview(inputId, previewId) {
    const fileInput = document.getElementById(inputId);
    const previewContainer = document.getElementById(previewId);
    const commentsContainer = document.getElementById(inputId + '-comments');
    
    if (!fileInput || !previewContainer) return;
    
    fileInput.addEventListener('change', function() {
        // Anzahl der vorhandenen Vorschaubilder zählen
        const existingPreviews = previewContainer.querySelectorAll('.preview-item').length;
        
        // Prüfen, ob die maximale Anzahl erreicht wurde
        const maxAllowedImages = 10;
        const totalImages = existingPreviews + this.files.length;
        
        if (totalImages > maxAllowedImages) {
            alert(`Sie können maximal ${maxAllowedImages} Bilder hochladen. Bitte wählen Sie weniger Bilder aus.`);
            return;
        }
        
        if (this.files && this.files.length > 0) {
            for (let i = 0; i < this.files.length; i++) {
                const file = this.files[i];
                
                // Nur Bilder zulassen
                if (!file.type.startsWith('image/')) {
                    continue;
                }
                
                // Aktuellen Bild-Index berechnen (für die korrekte Nummerierung)
                const currentImageIndex = existingPreviews + i + 1;
                
                // Vorschau-Container erstellen
                const previewItem = document.createElement('div');
                previewItem.className = 'preview-item';
                previewItem.dataset.fileId = `${inputId}-${Date.now()}-${i}`; // Eindeutige ID für das Bild
                previewItem.dataset.imageIndex = currentImageIndex; // Bild-Index speichern
                
                // Bild-Element erstellen
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.onload = function() {
                    URL.revokeObjectURL(this.src); // Speicher freigeben
                };
                
                // Löschen-Button erstellen
                const removeBtn = document.createElement('span');
                removeBtn.className = 'remove-preview';
                removeBtn.innerHTML = '&times;';
                removeBtn.title = 'Entfernen';
                removeBtn.dataset.index = i;
                
                // Event-Listener für Löschen-Button
                removeBtn.addEventListener('click', function() {
                    const fileId = previewItem.dataset.fileId;
                    // Auch den zugehörigen Kommentar entfernen
                    const commentItem = commentsContainer ? commentsContainer.querySelector(`[data-file-id="${fileId}"]`) : null;
                    if (commentItem) {
                        commentItem.remove();
                    }
                    previewItem.remove();
                    
                    // Aktualisiere die Nummerierung aller nachfolgenden Bilder
                    updateCommentNumbering(commentsContainer);
                });
                
                // Elemente zusammenfügen
                previewItem.appendChild(img);
                previewItem.appendChild(removeBtn);
                previewContainer.appendChild(previewItem);
                
                // Kommentar-Feld für das Bild erstellen
                if (commentsContainer) {
                    const commentItem = document.createElement('div');
                    commentItem.className = 'image-comment-item';
                    commentItem.dataset.fileId = previewItem.dataset.fileId;
                    commentItem.dataset.imageIndex = currentImageIndex; // Bild-Index speichern
                    
                    const commentLabel = document.createElement('label');
                    commentLabel.className = 'comment-label';
                    commentLabel.textContent = `Kommentar zum Bild ${currentImageIndex}:`;
                    
                    const commentTextarea = document.createElement('textarea');
                    commentTextarea.className = 'image-comment';
                    commentTextarea.rows = 2;
                    commentTextarea.placeholder = 'Beschreiben Sie das Bild...';
                    
                    commentItem.appendChild(commentLabel);
                    commentItem.appendChild(commentTextarea);
                    commentsContainer.appendChild(commentItem);
                }
            }
        }
    });
    
    // Hilfsfunktion zum Aktualisieren der Nummerierung nach dem Löschen eines Bildes
    function updateCommentNumbering(container) {
        if (!container) return;
        
        const commentItems = container.querySelectorAll('.image-comment-item');
        commentItems.forEach((item, index) => {
            const label = item.querySelector('.comment-label');
            if (label) {
                label.textContent = `Kommentar zum Bild ${index + 1}:`;
            }
            item.dataset.imageIndex = index + 1;
        });
    }
    
    // Methode zum Löschen aller Vorschaubilder hinzufügen
    fileInput.clearPreviews = function() {
        if (previewContainer) {
            previewContainer.innerHTML = '';
        }
        if (commentsContainer) {
            commentsContainer.innerHTML = '';
        }
    };
}

// Duale Datei-Vorschau-Funktion für Kamera- und Galerie-Inputs
function setupDualFilePreview(baseInputId, previewId) {
    const cameraInput = document.getElementById(baseInputId + '-camera');
    const galleryInput = document.getElementById(baseInputId + '-gallery');
    const previewContainer = document.getElementById(previewId);
    const commentsContainer = document.getElementById(baseInputId + '-comments');
    
    if (!previewContainer) return;
    
    // Event-Handler für beide Input-Felder
    function handleFileChange(event, sourceType) {
        const files = event.target.files;
        
        // Anzahl der vorhandenen Vorschaubilder zählen
        const existingPreviews = previewContainer.querySelectorAll('.preview-item').length;
        
        // Prüfen, ob die maximale Anzahl erreicht wurde
        const maxAllowedImages = 10;
        const totalImages = existingPreviews + files.length;
        
        if (totalImages > maxAllowedImages) {
            alert(`Sie können maximal ${maxAllowedImages} Bilder hochladen. Bitte wählen Sie weniger Bilder aus.`);
            return;
        }
        
        if (files && files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                
                // Nur Bilder zulassen
                if (!file.type.startsWith('image/')) {
                    continue;
                }
                
                // Aktuellen Bild-Index berechnen (für die korrekte Nummerierung)
                const currentImageIndex = existingPreviews + i + 1;
                
                // Vorschau-Container erstellen
                const previewItem = document.createElement('div');
                previewItem.className = 'preview-item';
                previewItem.dataset.fileId = `${baseInputId}-${Date.now()}-${i}`; // Eindeutige ID für das Bild
                previewItem.dataset.imageIndex = currentImageIndex; // Bild-Index speichern
                previewItem.dataset.sourceType = sourceType; // Quelle speichern (camera/gallery)
                
                // Bild-Element erstellen
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.onload = function() {
                    URL.revokeObjectURL(this.src); // Speicher freigeben
                };
                
                // Löschen-Button erstellen
                const removeBtn = document.createElement('span');
                removeBtn.className = 'remove-preview';
                removeBtn.innerHTML = '&times;';
                removeBtn.title = 'Entfernen';
                removeBtn.dataset.index = i;
                
                // Event-Listener für Löschen-Button
                removeBtn.addEventListener('click', function() {
                    const fileId = previewItem.dataset.fileId;
                    // Auch den zugehörigen Kommentar entfernen
                    const commentItem = commentsContainer ? commentsContainer.querySelector(`[data-file-id="${fileId}"]`) : null;
                    if (commentItem) {
                        commentItem.remove();
                    }
                    // Vorschau-Element entfernen
                    previewItem.remove();
                    
                    // Bildindizes neu nummerieren
                    const remainingPreviews = previewContainer.querySelectorAll('.preview-item');
                    remainingPreviews.forEach((item, index) => {
                        item.dataset.imageIndex = index + 1;
                    });
                    
                    // Kommentar-Indizes neu nummerieren
                    if (commentsContainer) {
                        const remainingComments = commentsContainer.querySelectorAll('.image-comment-item');
                        remainingComments.forEach((item, index) => {
                            const label = item.querySelector('label');
                            if (label) {
                                label.textContent = `Kommentar für Bild ${index + 1}:`;
                            }
                        });
                    }
                });
                
                // Elemente zusammenfügen
                previewItem.appendChild(img);
                previewItem.appendChild(removeBtn);
                previewContainer.appendChild(previewItem);
                
                // Datei für späteren Upload speichern
                previewItem.fileData = file;
                
                // Kommentar-Input erstellen (falls Kommentar-Container existiert)
                if (commentsContainer) {
                    const commentDiv = document.createElement('div');
                    commentDiv.className = 'image-comment-item';
                    commentDiv.dataset.fileId = previewItem.dataset.fileId;
                    
                    const label = document.createElement('label');
                    label.textContent = `Kommentar für Bild ${currentImageIndex}:`;
                    
                    const textarea = document.createElement('textarea');
                    textarea.placeholder = 'Optional: Beschreibung für dieses Bild...';
                    textarea.rows = 2;
                    
                    commentDiv.appendChild(label);
                    commentDiv.appendChild(textarea);
                    commentsContainer.appendChild(commentDiv);
                }
            }
        }
        
        // Input-Feld zurücksetzen, damit die gleiche Datei nochmal ausgewählt werden kann
        event.target.value = '';
    }
    
    // Event-Listener für Kamera-Input
    if (cameraInput) {
        cameraInput.addEventListener('change', (e) => handleFileChange(e, 'camera'));
    }
    
    // Event-Listener für Galerie-Input
    if (galleryInput) {
        galleryInput.addEventListener('change', (e) => handleFileChange(e, 'gallery'));
    }
    
    // Funktion zum Abrufen aller Dateien (für Upload-Funktionen)
    function getAllFiles() {
        const allFiles = [];
        const previewItems = previewContainer.querySelectorAll('.preview-item');
        previewItems.forEach(item => {
            if (item.fileData) {
                allFiles.push(item.fileData);
            }
        });
        return allFiles;
    }
    
    // Funktion zum Löschen aller Vorschauen
    function clearPreviews() {
        previewContainer.innerHTML = '';
        if (commentsContainer) {
            commentsContainer.innerHTML = '';
        }
    }
    
    // Funktionen öffentlich verfügbar machen
    if (cameraInput) {
        cameraInput.getAllFiles = getAllFiles;
        cameraInput.clearPreviews = clearPreviews;
    }
    if (galleryInput) {
        galleryInput.getAllFiles = getAllFiles;
        galleryInput.clearPreviews = clearPreviews;
    }
}

// Pause-Funktion
// Pause-Funktionen entfernt - automatische Pausenberechnung nach deutschen Gesetzen
// wird beim Ausstempeln automatisch hinzugefügt

// App starten
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    initSplashScreen(); // Splash Screen initialisieren
});
