/**
 * Admin-Funktionen für die Erstellung von Zeiteinträgen für Mitarbeiter
 */

// Modal und Button-Elemente
let adminTimeEntryModal = null;
let adminTimeEntryBtn = null;
let adminControlsDiv = null;

// Form-Elemente
let employeeSelect = null;
let entryDateInput = null;
let clockInTimeInput = null;
let clockOutTimeInput = null;
let pauseTimeInput = null;
let entryNotesTextarea = null;
let saveTimeEntryBtn = null;
let cancelTimeEntryBtn = null;

// Projekt-ID
let adminProjectId = null;
let currentProject = null;

// DOM-Initialisierung
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 admin-time-entry.js: DOMContentLoaded Event ausgelöst');
    
    try {
        // Elemente finden
        console.log('🔍 Suche Modal und Button Elemente...');
        adminTimeEntryModal = document.getElementById('admin-time-entry-modal');
        console.log('🔍 adminTimeEntryModal gefunden:', adminTimeEntryModal);
        
        adminTimeEntryBtn = document.getElementById('add-time-entry-btn');
        console.log('🔍 adminTimeEntryBtn gefunden:', adminTimeEntryBtn);
        
        adminControlsDiv = document.getElementById('admin-time-entry-controls');
        console.log('🔍 adminControlsDiv gefunden:', adminControlsDiv);
        
        // Form-Elemente
        console.log('🔍 Suche Form-Elemente...');
        employeeSelect = document.getElementById('employee-select');
        entryDateInput = document.getElementById('entry-date');
        clockInTimeInput = document.getElementById('clock-in-time');
        clockOutTimeInput = document.getElementById('clock-out-time');
        pauseTimeInput = document.getElementById('pause-time');
        entryNotesTextarea = document.getElementById('entry-notes');
        saveTimeEntryBtn = document.getElementById('save-time-entry-btn');
        cancelTimeEntryBtn = document.getElementById('cancel-time-entry-btn');
        console.log('🔍 Form-Elemente gefunden:', {
            employeeSelect,
            entryDateInput,
            clockInTimeInput,
            clockOutTimeInput, 
            pauseTimeInput
        });
        
        // Projekt-ID aus URL abrufen
        let urlParams = new URLSearchParams(window.location.search);
        adminProjectId = urlParams.get('id');
        console.log('🔍 Projekt-ID aus URL:', adminProjectId);
        
        // Event-Listener
        console.log('🔄 Füge Event-Listener hinzu...');
        if (adminTimeEntryBtn) {
            console.log('🔄 Füge Click-Event für adminTimeEntryBtn hinzu');
            adminTimeEntryBtn.addEventListener('click', function(e) {
                console.log('🖱️ Admin-Button wurde geklickt!', e);
                openAdminTimeEntryModal();
            });
            console.log('✅ Click-Event für adminTimeEntryBtn hinzugefügt');
        } else {
            console.warn('⚠️ adminTimeEntryBtn nicht gefunden, kann Event-Listener nicht hinzufügen');
        }
        
        if (cancelTimeEntryBtn) {
            cancelTimeEntryBtn.addEventListener('click', closeAdminTimeEntryModal);
            console.log('✅ Click-Event für cancelTimeEntryBtn hinzugefügt');
        } else {
            console.warn('⚠️ cancelTimeEntryBtn nicht gefunden');
        }
    } catch (error) {
        console.error('❌ Fehler bei der Initialisierung von admin-time-entry.js:', error);
    }
    
    // Schließen-Button im Modal
    const closeButtons = adminTimeEntryModal?.querySelectorAll('.report-modal-close');
    if (closeButtons) {
        closeButtons.forEach(btn => {
            btn.addEventListener('click', closeAdminTimeEntryModal);
        });
    }
    
    // Form-Submit
    const form = document.getElementById('create-time-entry-form');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            saveTimeEntry();
        });
    }
    
    // ESC-Taste schließt das Modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && adminTimeEntryModal?.classList.contains('visible')) {
            closeAdminTimeEntryModal();
        }
    });
    
    // Admin-Status prüfen und ggf. Admin-Steuerelemente anzeigen
    checkAdminAccess();
});

/**
 * Prüft, ob der aktuelle Benutzer Admin-Rechte hat und zeigt entsprechende Steuerelemente an
 */
async function checkAdminAccess() {
    try {
        console.log('🔍 checkAdminAccess wird ausgeführt...');

        // FÜR TESTZWECKE: Immer admin-controls anzeigen ohne die Berechtigungsprüfung
        if (adminControlsDiv) {
            console.log('✅ TESTMODUS: Admin-Controls werden direkt angezeigt');
            adminControlsDiv.style.display = 'block';
            return;
        }

        // Aktuelle User-ID aus DataService abrufen
        console.log('🔍 Rufe getCurrentUser auf...');
        const user = await DataService.getCurrentUser();
        console.log('🔍 getCurrentUser Ergebnis:', user);
        
        if (user) {
            // Admin-Status überprüfen
            console.log('🔍 Prüfe Admin-Status für User:', user.uid);
            const isAdmin = await DataService.isUserAdmin(user.uid);
            console.log('🔍 isUserAdmin Ergebnis:', isAdmin);
            
            if (isAdmin) {
                // Admin-Steuerelemente anzeigen
                if (adminControlsDiv) {
                    console.log('✅ Admin-Steuerelemente werden angezeigt');
                    adminControlsDiv.style.display = 'block';
                } else {
                    console.error('❌ adminControlsDiv nicht gefunden!', document.getElementById('admin-time-entry-controls'));
                }
                console.log('✅ Admin-Zugang bestätigt');
            } else {
                console.log('⛔ Benutzer hat keine Admin-Rechte');
            }
        } else {
            console.log('⛔ Kein angemeldeter Benutzer gefunden');
        }
    } catch (error) {
        console.error('❌ Fehler beim Überprüfen des Admin-Status:', error);
    }
}

/**
 * Öffnet das Modal zum Erstellen eines Zeiteintrags und lädt verfügbare Mitarbeiter
 */
async function openAdminTimeEntryModal() {
    try {
        if (!adminTimeEntryModal) return;
        
        // Aktuelle Projektdaten laden
        if (adminProjectId) {
            currentProject = await DataService.getProjectById(adminProjectId);
        }
        
        if (!currentProject) {
            console.error('Projekt konnte nicht geladen werden');
            return;
        }
        
        // Mitarbeiter laden
        await loadEmployees();
        
        // Heutiges Datum als Standardwert setzen
        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0]; // YYYY-MM-DD
        entryDateInput.value = formattedDate;
        
        // Standardzeiten setzen (8:00 - 16:30)
        clockInTimeInput.value = '08:00';
        clockOutTimeInput.value = '16:30';
        
        // Pausenzeit auf 30 Minuten setzen
        pauseTimeInput.value = '30';
        
        // Modal öffnen
        adminTimeEntryModal.classList.add('visible');
    } catch (error) {
        console.error('Fehler beim Öffnen des Modals:', error);
    }
}

/**
 * Schließt das Modal
 */
function closeAdminTimeEntryModal() {
    if (adminTimeEntryModal) {
        adminTimeEntryModal.classList.remove('visible');
    }
}

/**
 * Lädt Mitarbeiter in das Auswahlfeld
 */
async function loadEmployees() {
    try {
        if (!employeeSelect) return;
        
        // Aktuelle Auswahl speichern
        const currentSelection = employeeSelect.value;
        
        // Bisherige Optionen entfernen (außer die erste)
        while (employeeSelect.options.length > 1) {
            employeeSelect.remove(1);
        }
        
        // Mitarbeiter von Firebase laden
        const employees = await DataService.getAllEmployees();
        
        if (!employees || !Array.isArray(employees)) {
            console.error('Keine Mitarbeiter gefunden oder ungültiges Format');
            return;
        }
        
        // Mitarbeiter alphabetisch sortieren
        employees.sort((a, b) => a.name.localeCompare(b.name));
        
        // Als Optionen hinzufügen
        employees.forEach(employee => {
            const option = document.createElement('option');
            option.value = employee.id;
            option.textContent = employee.name;
            employeeSelect.appendChild(option);
        });
        
        // Vorherige Auswahl wiederherstellen, falls vorhanden
        if (currentSelection && currentSelection !== '') {
            employeeSelect.value = currentSelection;
        }
        
    } catch (error) {
        console.error('Fehler beim Laden der Mitarbeiter:', error);
    }
}

/**
 * Speichert den Zeiteintrag in der Datenbank
 */
async function saveTimeEntry() {
    try {
        // Form-Daten auslesen
        const employeeId = employeeSelect.value;
        const entryDate = entryDateInput.value;
        const clockInTime = clockInTimeInput.value;
        const clockOutTime = clockOutTimeInput.value;
        const pauseTime = parseInt(pauseTimeInput.value, 10) || 0;
        const notes = entryNotesTextarea.value;
        
        if (!employeeId || !entryDate || !clockInTime || !clockOutTime) {
            alert('Bitte alle Pflichtfelder ausfüllen');
            return;
        }
        
        // Speicherbutton deaktivieren um Doppelklicks zu verhindern
        if (saveTimeEntryBtn) {
            saveTimeEntryBtn.disabled = true;
            saveTimeEntryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Speichern...';
        }
        
        // Datumsformate für Firebase erstellen
        const clockInDateTime = new Date(`${entryDate}T${clockInTime}`);
        const clockOutDateTime = new Date(`${entryDate}T${clockOutTime}`);
        
        // Pausenzeit in Millisekunden konvertieren
        const pauseTotalTime = pauseTime * 60 * 1000; // Minuten zu Millisekunden
        
        // Neuen Zeiteintrag erstellen
        const timeEntry = {
            employeeId: employeeId,
            projectId: adminProjectId,
            clockInTime: clockInDateTime.toISOString(),
            clockOutTime: clockOutDateTime.toISOString(),
            pauseTotalTime: pauseTotalTime,
            notes: notes,
            createdBy: 'admin', // Markierung, dass dies von einem Admin erstellt wurde
            createdAt: new Date().toISOString()
        };
        
        // In Firestore speichern
        await DataService.createTimeEntry(timeEntry);
        
        console.log('Zeiteintrag erfolgreich gespeichert');
        
        // Modal schließen
        closeAdminTimeEntryModal();
        
        // Zeiteinträge neu laden, um den neuen Eintrag anzuzeigen
        if (typeof loadTimeEntries === 'function') {
            loadTimeEntries();
        }
        
        // Feedback anzeigen
        alert('Zeiteintrag wurde erfolgreich gespeichert');
    } catch (error) {
        console.error('Fehler beim Speichern des Zeiteintrags:', error);
        alert(`Fehler beim Speichern: ${error.message}`);
    } finally {
        // Speicherbutton zurücksetzen
        if (saveTimeEntryBtn) {
            saveTimeEntryBtn.disabled = false;
            saveTimeEntryBtn.innerHTML = 'Speichern';
        }
    }
}
