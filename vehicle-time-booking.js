/**
 * Fahrzeugzeitbuchung für eingestempelte Mitarbeiter
 * Ermöglicht das Buchen von Fahrzeugzeiten direkt während der Arbeitszeit
 */

// Globale Variablen
let currentEmployeeId = null;
let currentProjectId = null;
let activeVehicles = [];

/**
 * Initialisiert die Fahrzeugzeitbuchungs-Funktionalität
 */
function initVehicleTimeBooking() {
    console.log('Initialisiere Fahrzeugzeitbuchung...');
    
    // DOM-Elemente
    const bookingButton = document.getElementById('vehicle-time-booking-btn');
    const bookingModal = document.getElementById('vehicle-time-booking-modal');
    const bookingForm = document.getElementById('vehicle-time-booking-form');
    const cancelButton = document.getElementById('cancel-vehicle-booking');
    const closeButton = bookingModal ? bookingModal.querySelector('.close-modal-btn') : null;
    
    if (!bookingButton || !bookingModal || !bookingForm) {
        console.error('Fahrzeugzeitbuchung: Erforderliche DOM-Elemente nicht gefunden');
        return;
    }
    
    // Event-Listener
    bookingButton.addEventListener('click', openVehicleTimeBookingModal);
    bookingForm.addEventListener('submit', submitVehicleTimeBooking);
    
    if (cancelButton) {
        cancelButton.addEventListener('click', closeVehicleTimeBookingModal);
    }
    
    if (closeButton) {
        closeButton.addEventListener('click', closeVehicleTimeBookingModal);
    }
    
    // Schließen beim Klicken außerhalb des Modals
    window.addEventListener('click', (event) => {
        if (event.target === bookingModal) {
            closeVehicleTimeBookingModal();
        }
    });
    
    // ESC-Taste zum Schließen
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && bookingModal.style.display === 'block') {
            closeVehicleTimeBookingModal();
        }
    });
    
    console.log('Fahrzeugzeitbuchung initialisiert');
}

/**
 * Öffnet das Fahrzeugzeitbuchungs-Modal und lädt die verfügbaren Fahrzeuge
 */
async function openVehicleTimeBookingModal() {
    console.log('Öffne Fahrzeugzeitbuchungs-Modal');
    
    const bookingModal = document.getElementById('vehicle-time-booking-modal');
    if (!bookingModal) return;
    
    // Aktuelle Projekt- und Mitarbeiter-IDs laden
    currentProjectId = window.app.currentTimeEntry ? window.app.currentTimeEntry.projectId : null;
    currentEmployeeId = window.app.currentUser ? window.app.currentUser.id : null;
    
    if (!currentProjectId || !currentEmployeeId) {
        showNotification('Fehler: Keine aktive Zeiterfassung oder Benutzer gefunden', 'error');
        return;
    }
    
    // Modal anzeigen
    bookingModal.style.display = 'block';
    
    // Fahrzeuge laden
    await loadVehiclesForBooking();
    
    // Formular zurücksetzen
    resetVehicleBookingForm();
}

/**
 * Schließt das Fahrzeugzeitbuchungs-Modal
 */
function closeVehicleTimeBookingModal() {
    const bookingModal = document.getElementById('vehicle-time-booking-modal');
    if (!bookingModal) return;
    
    bookingModal.style.display = 'none';
}

/**
 * Lädt alle aktiven Fahrzeuge aus der Datenbank
 */
async function loadVehiclesForBooking() {
    try {
        console.log('Starte Laden der Fahrzeuge...');
        const vehicleSelect = document.getElementById('booking-vehicle-select');
        if (!vehicleSelect) {
            console.error('Fahrzeug-Select Element nicht gefunden');
            return;
        }
        
        // Bestehende Optionen löschen, außer der ersten
        console.log(`Lösche bestehende Optionen (aktuell ${vehicleSelect.options.length})`);
        while (vehicleSelect.options.length > 1) {
            vehicleSelect.remove(1);
        }
        
        // Fahrzeuge von Firestore laden
        console.log('Rufe DataService.getAllVehicles auf...');
        const vehicles = await DataService.getAllVehicles();
        console.log('Erhaltene Fahrzeuge:', vehicles);
        
        activeVehicles = vehicles.filter(vehicle => vehicle.isActive);
        console.log(`Aktive Fahrzeuge: ${activeVehicles.length} von ${vehicles.length}`);
        
        if (activeVehicles.length === 0) {
            console.warn('Keine aktiven Fahrzeuge gefunden');
            const option = document.createElement('option');
            option.value = "";
            option.disabled = true;
            option.textContent = "Keine aktiven Fahrzeuge verfügbar";
            vehicleSelect.appendChild(option);
            showNotification('Keine aktiven Fahrzeuge verfügbar', 'warning');
            return;
        }
        
        // Fahrzeuge zum Dropdown hinzufügen
        console.log('Füge Fahrzeuge zum Dropdown hinzu:');
        activeVehicles.forEach(vehicle => {
            console.log(`- ${vehicle.id}: ${vehicle.name} (${vehicle.type}), Rate: ${vehicle.hourlyRate}€/h, Aktiv: ${vehicle.isActive}`);
            const option = document.createElement('option');
            option.value = vehicle.id;
            option.textContent = `${vehicle.name} (${vehicle.type}) - ${vehicle.hourlyRate || 0}€/h`;
            vehicleSelect.appendChild(option);
        });
        
        console.log(`${activeVehicles.length} aktive Fahrzeuge zum Dropdown hinzugefügt`);
    } catch (error) {
        console.error('Fehler beim Laden der Fahrzeuge:', error);
        console.error('Details:', error.message, error.stack);
        showNotification('Fehler beim Laden der verfügbaren Fahrzeuge', 'error');
    }
}

/**
 * Setzt das Fahrzeugbuchungs-Formular zurück
 */
function resetVehicleBookingForm() {
    const form = document.getElementById('vehicle-time-booking-form');
    const vehicleSelect = document.getElementById('booking-vehicle-select');
    const hoursInput = document.getElementById('booking-vehicle-hours');
    const commentInput = document.getElementById('vehicle-booking-comment');
    
    if (form) form.reset();
    if (vehicleSelect) vehicleSelect.selectedIndex = 0;
    if (hoursInput) hoursInput.value = 1;
    if (commentInput) commentInput.value = '';
}

/**
 * Verarbeitet das Absenden des Fahrzeugzeitbuchungs-Formulars
 * @param {Event} event - Das Submit-Event
 */
async function submitVehicleTimeBooking(event) {
    event.preventDefault();
    
    const vehicleSelect = document.getElementById('booking-vehicle-select');
    const hoursInput = document.getElementById('booking-vehicle-hours');
    const commentInput = document.getElementById('vehicle-booking-comment');
    
    if (!vehicleSelect || !hoursInput) return;
    
    const vehicleId = vehicleSelect.value;
    const hours = parseFloat(hoursInput.value);
    const comment = commentInput ? commentInput.value.trim() : '';
    
    // Validierung
    if (!vehicleId) {
        showNotification('Bitte wählen Sie ein Fahrzeug aus', 'warning');
        return;
    }
    
    if (isNaN(hours) || hours <= 0) {
        showNotification('Bitte geben Sie eine gültige Stundenanzahl ein', 'warning');
        return;
    }
    
    // Aktuelle Daten prüfen
    if (!currentProjectId || !currentEmployeeId) {
        showNotification('Fehler: Keine aktive Zeiterfassung oder Benutzer gefunden', 'error');
        return;
    }
    
    try {
        // Fahrzeugnutzung speichern
        const bookingData = {
            vehicleId,
            projectId: currentProjectId,
            employeeId: currentEmployeeId,
            hours,
            date: new Date().toISOString().split('T')[0], // Heutiges Datum im Format YYYY-MM-DD
            comment
        };
        
        console.log('Speichere Fahrzeugbuchung:', bookingData);
        
        // In Firestore speichern
        const result = await DataService.createVehicleTimeBooking(bookingData);
        
        if (result && result.id) {
            showNotification('Fahrzeugzeit erfolgreich gebucht!', 'success');
            closeVehicleTimeBookingModal();
        } else {
            showNotification('Fehler beim Buchen der Fahrzeugzeit', 'error');
        }
    } catch (error) {
        console.error('Fehler beim Speichern der Fahrzeugbuchung:', error);
        showNotification(`Fehler: ${error.message || 'Unbekannter Fehler'}`, 'error');
    }
}

/**
 * Zeigt eine Benachrichtigung an
 * @param {string} message - Die anzuzeigende Nachricht
 * @param {string} type - Der Typ der Benachrichtigung ('success', 'error', 'warning', 'info')
 */
function showNotification(message, type = 'info') {
    if (window.app && window.app.showNotification) {
        window.app.showNotification(message, type);
    } else {
        console.log(`${type.toUpperCase()}: ${message}`);
        alert(`${message}`);
    }
}

// Initialisierung, wenn das Dokument geladen ist
document.addEventListener('DOMContentLoaded', () => {
    // Verzögerung, um sicherzustellen, dass alle anderen Skripte geladen sind
    setTimeout(() => {
        initVehicleTimeBooking();
    }, 1000);
});
