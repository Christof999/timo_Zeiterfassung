/**
 * Admin-Fahrzeugbuchung-Funktionen
 * Ermöglicht das Hinzufügen von Fahrzeugbuchungen durch Administratoren
 */

// Globale Variablen
let adminVehicleProjectId = null;
let adminVehicleModal = null;
let adminVehicleEmployeeSelect = null;
let adminVehicleSelect = null;
let adminVehicleDate = null;
let adminStartKm = null;
let adminEndKm = null;
let adminVehicleNotes = null;
let adminVehicleForm = null;
let adminVehicleCancelButton = null;
let adminVehicleSaveButton = null;
let adminVehicleCloseButton = null;

// DOM geladen
document.addEventListener('DOMContentLoaded', initAdminVehicleUsage);

/**
 * Initialisiert die Admin-Fahrzeugbuchung-Funktionalität
 */
async function initAdminVehicleUsage() {
    console.log('=== INITIALISIERE ADMIN FAHRZEUGBUCHUNG ===');
    
    // Projekt-ID aus URL abrufen
    const urlParams = new URLSearchParams(window.location.search);
    adminVehicleProjectId = urlParams.get('id');
    
    if (!adminVehicleProjectId) {
        console.error('Keine Projekt-ID in der URL gefunden');
        return;
    }
    
    // DOM-Elemente finden
    const addVehicleUsageBtn = document.getElementById('add-vehicle-usage-btn');
    adminVehicleModal = document.getElementById('admin-vehicle-usage-modal');
    adminVehicleEmployeeSelect = document.getElementById('vehicle-usage-employee-select');
    adminVehicleSelect = document.getElementById('vehicle-select');
    adminVehicleDate = document.getElementById('vehicle-usage-date');
    adminStartKm = document.getElementById('start-km');
    adminEndKm = document.getElementById('end-km');
    adminVehicleNotes = document.getElementById('vehicle-usage-notes');
    adminVehicleForm = document.getElementById('admin-vehicle-usage-form');
    adminVehicleCancelButton = document.getElementById('cancel-vehicle-usage-btn');
    adminVehicleSaveButton = document.getElementById('save-vehicle-usage-btn');
    
    // Finde den Close-Button
    if (adminVehicleModal) {
        adminVehicleCloseButton = adminVehicleModal.querySelector('.modal-close');
    }
    
    // Debug: DOM-Elemente prüfen
    console.log('=== ADMIN FAHRZEUGBUCHUNG DOM-ELEMENTE PRÜFUNG ===');
    console.log('addVehicleUsageBtn:', addVehicleUsageBtn ? 'gefunden' : 'NICHT GEFUNDEN');
    console.log('adminVehicleModal:', adminVehicleModal ? 'gefunden' : 'NICHT GEFUNDEN');
    console.log('adminVehicleEmployeeSelect:', adminVehicleEmployeeSelect ? 'gefunden' : 'NICHT GEFUNDEN');
    console.log('adminVehicleSelect:', adminVehicleSelect ? 'gefunden' : 'NICHT GEFUNDEN');
    console.log('adminVehicleDate:', adminVehicleDate ? 'gefunden' : 'NICHT GEFUNDEN');
    console.log('adminStartKm:', adminStartKm ? 'gefunden' : 'NICHT GEFUNDEN');
    console.log('adminEndKm:', adminEndKm ? 'gefunden' : 'NICHT GEFUNDEN');
    console.log('adminVehicleNotes:', adminVehicleNotes ? 'gefunden' : 'NICHT GEFUNDEN');
    console.log('adminVehicleForm:', adminVehicleForm ? 'gefunden' : 'NICHT GEFUNDEN');
    console.log('adminVehicleCancelButton:', adminVehicleCancelButton ? 'gefunden' : 'NICHT GEFUNDEN');
    console.log('adminVehicleSaveButton:', adminVehicleSaveButton ? 'gefunden' : 'NICHT GEFUNDEN');
    console.log('adminVehicleCloseButton:', adminVehicleCloseButton ? 'gefunden' : 'NICHT GEFUNDEN');
    
    // Event-Listener hinzufügen, nur wenn die Elemente existieren
    if (addVehicleUsageBtn) {
        addVehicleUsageBtn.addEventListener('click', openAdminVehicleUsageModal);
        
        // Anfangs ausblenden, bis Admin-Status überprüft ist
        addVehicleUsageBtn.style.display = 'none';
        
        // Admin-Berechtigungen prüfen
        const isAdmin = await DataService.isUserAdmin();
        if (isAdmin) {
            addVehicleUsageBtn.style.display = 'inline-block';
            console.log('Admin-Kontrollelemente werden angezeigt');
        } else {
            console.log('Keine Admin-Berechtigung, Kontrollelemente bleiben versteckt');
        }
    } else {
        console.error('Button zum Hinzufügen von Fahrzeugbuchungen nicht gefunden');
    }
    
    if (adminVehicleModal && adminVehicleCloseButton) {
        adminVehicleCloseButton.addEventListener('click', closeAdminVehicleUsageModal);
    }
    
    if (adminVehicleCancelButton) {
        adminVehicleCancelButton.addEventListener('click', closeAdminVehicleUsageModal);
    }
    
    if (adminVehicleForm) {
        adminVehicleForm.addEventListener('submit', saveAdminVehicleUsage);
    }
    
    // Wenn außerhalb des Modals geklickt wird, Modal schließen
    window.addEventListener('click', function(event) {
        if (adminVehicleModal && event.target === adminVehicleModal) {
            closeAdminVehicleUsageModal();
        }
    });
}

/**
 * Öffnet das Modal zum Hinzufügen von Fahrzeugbuchungen
 */
async function openAdminVehicleUsageModal() {
    console.log('Öffne Admin-Fahrzeugbuchung-Modal');
    
    try {
        // Formular zurücksetzen
        if (adminVehicleForm) adminVehicleForm.reset();
        
        // Mitarbeiter und Fahrzeuge laden
        await loadAdminEmployees();
        await loadAdminVehicles();
        
        // Aktuelles Datum vorausfüllen
        const today = new Date().toISOString().split('T')[0];
        if (adminVehicleDate) adminVehicleDate.value = today;
        
        // Modal anzeigen
        if (adminVehicleModal) adminVehicleModal.style.display = 'block';
    } catch (error) {
        console.error('Fehler beim Öffnen des Fahrzeugbuchung-Modals:', error);
        alert('Fehler beim Laden der Daten: ' + error.message);
    }
}

/**
 * Schließt das Modal zum Hinzufügen von Fahrzeugbuchungen
 */
function closeAdminVehicleUsageModal() {
    console.log('Schließe Admin-Fahrzeugbuchung-Modal');
    if (adminVehicleModal) adminVehicleModal.style.display = 'none';
}

/**
 * Lädt alle aktiven Mitarbeiter und füllt das Dropdown
 */
async function loadAdminEmployees() {
    try {
        if (!adminVehicleEmployeeSelect) {
            console.error('Mitarbeiter-Dropdown nicht gefunden');
            return;
        }
        
        // Bestehende Optionen löschen
        adminVehicleEmployeeSelect.innerHTML = '<option value="">-- Mitarbeiter auswählen --</option>';
        
        // Alle aktiven Mitarbeiter laden
        const employees = await DataService.getAllActiveEmployees();
        
        // Nach Namen sortieren
        employees.sort((a, b) => a.name.localeCompare(b.name));
        
        // Dropdown-Optionen erstellen
        employees.forEach(employee => {
            const option = document.createElement('option');
            option.value = employee.id;
            option.textContent = employee.name;
            adminVehicleEmployeeSelect.appendChild(option);
        });
        
        console.log(`${employees.length} Mitarbeiter in Dropdown geladen`);
    } catch (error) {
        console.error('Fehler beim Laden der Mitarbeiter:', error);
        throw error;
    }
}

/**
 * Lädt alle aktiven Fahrzeuge und füllt das Dropdown
 */
async function loadAdminVehicles() {
    try {
        if (!adminVehicleSelect) {
            console.error('Fahrzeug-Dropdown nicht gefunden');
            return;
        }
        
        // Bestehende Optionen löschen
        adminVehicleSelect.innerHTML = '<option value="">-- Fahrzeug auswählen --</option>';
        
        // Alle aktiven Fahrzeuge laden
        const vehicles = await DataService.getAllVehicles();
        
        // Nach Namen sortieren
        vehicles.sort((a, b) => a.name.localeCompare(b.name));
        
        // Dropdown-Optionen erstellen
        vehicles.forEach(vehicle => {
            const option = document.createElement('option');
            option.value = vehicle.id;
            option.textContent = vehicle.name;
            adminVehicleSelect.appendChild(option);
        });
        
        console.log(`${vehicles.length} Fahrzeuge in Dropdown geladen`);
    } catch (error) {
        console.error('Fehler beim Laden der Fahrzeuge:', error);
        throw error;
    }
}

/**
 * Speichert die Fahrzeugbuchung und schließt das Modal
 * @param {Event} event - Das Submit-Event
 */
async function saveAdminVehicleUsage(event) {
    event.preventDefault();
    console.log('Speichere Admin-Fahrzeugbuchung');
    
    try {
        // Formularfelder prüfen
        if (!adminVehicleEmployeeSelect || !adminVehicleSelect || !adminVehicleDate || 
            !adminStartKm || !adminEndKm) {
            throw new Error('Formularfelder konnten nicht gefunden werden');
        }
        
        const employeeId = adminVehicleEmployeeSelect.value;
        const vehicleId = adminVehicleSelect.value;
        const date = adminVehicleDate.value;
        const startKm = parseInt(adminStartKm.value, 10);
        const endKm = parseInt(adminEndKm.value, 10);
        const notes = adminVehicleNotes ? adminVehicleNotes.value : '';
        
        // Validierungen
        if (!employeeId) throw new Error('Bitte wählen Sie einen Mitarbeiter aus');
        if (!vehicleId) throw new Error('Bitte wählen Sie ein Fahrzeug aus');
        if (!date) throw new Error('Bitte geben Sie ein Datum ein');
        if (isNaN(startKm)) throw new Error('Bitte geben Sie einen gültigen Startkilometerstand ein');
        if (isNaN(endKm)) throw new Error('Bitte geben Sie einen gültigen Endkilometerstand ein');
        if (endKm < startKm) throw new Error('Der Endkilometerstand muss größer oder gleich dem Startkilometerstand sein');
        
        // Speicherung vorbereiten
        const vehicleUsageData = {
            employeeId,
            vehicleId,
            projectId: adminVehicleProjectId,
            date: new Date(date),
            startKm,
            endKm,
            notes
        };
        
        console.log('Fahrzeugbuchungsdaten zum Speichern:', vehicleUsageData);
        
        // Fahrzeugbuchung speichern
        await DataService.createVehicleUsage(vehicleUsageData);
        
        // Modal schließen
        closeAdminVehicleUsageModal();
        
        // Tabelle aktualisieren
        loadVehicleUsages();
        
        console.log('Fahrzeugbuchung erfolgreich gespeichert');
    } catch (error) {
        console.error('Fehler beim Speichern der Fahrzeugbuchung:', error);
        alert('Fehler beim Speichern: ' + error.message);
    }
}
