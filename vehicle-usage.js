/**
 * Fahrzeugnutzung für Mitarbeiter
 * Ermöglicht das Hinzufügen von Fahrzeugen während der Dokumentation
 */

// Globales Objekt zur Verwaltung der Fahrzeugnutzungen
window.vehicleUsage = {
    selectedVehicles: [],
    availableVehicles: []
};

/**
 * Initialisiert die Fahrzeugnutzungsfunktionen
 */
function initVehicleUsage() {
    // DOM-Elemente
    const vehicleSelect = document.getElementById('vehicle-select');
    const addVehicleBtn = document.getElementById('add-vehicle-usage');
    const vehicleUsageList = document.getElementById('vehicle-usage-list');
    
    if (!vehicleSelect || !addVehicleBtn || !vehicleUsageList) {
        console.log('Fahrzeugnutzung DOM-Elemente nicht gefunden');
        return;
    }
    
    // Event-Listener für das Hinzufügen eines Fahrzeugs
    addVehicleBtn.addEventListener('click', addVehicleToUsageList);
    
    // Fahrzeuge laden und Dropdown füllen
    loadAvailableVehicles();
}

/**
 * Lädt alle verfügbaren Fahrzeuge aus der Datenbank und füllt das Dropdown
 */
async function loadAvailableVehicles() {
    try {
        const vehicles = await DataService.getAllVehicles();
        window.vehicleUsage.availableVehicles = vehicles;
        
        const vehicleSelect = document.getElementById('vehicle-select');
        if (!vehicleSelect) return;
        
        // Bestehende Optionen löschen, außer der ersten
        while (vehicleSelect.options.length > 1) {
            vehicleSelect.remove(1);
        }
        
        // Fahrzeuge zum Dropdown hinzufügen
        vehicles.forEach(vehicle => {
            const option = document.createElement('option');
            option.value = vehicle.id;
            option.textContent = `${vehicle.name} (${vehicle.type})`;
            vehicleSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Fehler beim Laden der Fahrzeuge:', error);
        showNotification('Fehler beim Laden der verfügbaren Fahrzeuge', 'error');
    }
}

/**
 * Fügt ein ausgewähltes Fahrzeug zur Nutzungsliste hinzu
 */
function addVehicleToUsageList() {
    const vehicleSelect = document.getElementById('vehicle-select');
    const vehicleHoursInput = document.getElementById('vehicle-hours');
    const vehicleUsageList = document.getElementById('vehicle-usage-list');
    
    if (!vehicleSelect || !vehicleHoursInput || !vehicleUsageList) return;
    
    const vehicleId = vehicleSelect.value;
    const hours = parseFloat(vehicleHoursInput.value) || 0;
    
    // Validierung
    if (!vehicleId) {
        showNotification('Bitte wählen Sie ein Fahrzeug aus', 'warning');
        return;
    }
    
    if (hours <= 0) {
        showNotification('Bitte geben Sie eine gültige Stundenanzahl ein', 'warning');
        return;
    }
    
    // Prüfen, ob das Fahrzeug bereits hinzugefügt wurde
    const existingIndex = window.vehicleUsage.selectedVehicles.findIndex(v => v.vehicleId === vehicleId);
    if (existingIndex !== -1) {
        // Fahrzeug bereits hinzugefügt, Stunden aktualisieren
        window.vehicleUsage.selectedVehicles[existingIndex].hours = hours;
        updateVehicleUsageList();
        showNotification('Fahrzeugnutzung aktualisiert', 'success');
        return;
    }
    
    // Fahrzeugdaten finden
    const selectedVehicle = window.vehicleUsage.availableVehicles.find(v => v.id === vehicleId);
    if (!selectedVehicle) {
        showNotification('Fehler: Fahrzeug nicht gefunden', 'error');
        return;
    }
    
    // Zur Liste hinzufügen
    window.vehicleUsage.selectedVehicles.push({
        vehicleId: vehicleId,
        name: selectedVehicle.name,
        type: selectedVehicle.type,
        hours: hours,
        hourlyRate: selectedVehicle.hourlyRate || 0
    });
    
    // UI aktualisieren
    updateVehicleUsageList();
    showNotification('Fahrzeug hinzugefügt', 'success');
    
    // Felder zurücksetzen
    vehicleSelect.selectedIndex = 0;
    vehicleHoursInput.value = 1;
}

/**
 * Aktualisiert die Liste der ausgewählten Fahrzeuge in der UI
 */
function updateVehicleUsageList() {
    const vehicleUsageList = document.getElementById('vehicle-usage-list');
    if (!vehicleUsageList) return;
    
    vehicleUsageList.innerHTML = '';
    
    if (window.vehicleUsage.selectedVehicles.length === 0) {
        vehicleUsageList.innerHTML = '<p class="no-vehicles">Keine Fahrzeuge hinzugefügt</p>';
        return;
    }
    
    window.vehicleUsage.selectedVehicles.forEach((vehicle, index) => {
        const vehicleItem = document.createElement('div');
        vehicleItem.className = 'vehicle-usage-item';
        
        vehicleItem.innerHTML = `
            <div class="vehicle-info">
                <div class="vehicle-name">${escapeHTML(vehicle.name)} (${escapeHTML(vehicle.type)})</div>
                <div class="vehicle-hours">${vehicle.hours} Stunden</div>
            </div>
            <button type="button" class="remove-vehicle" data-index="${index}">
                &times;
            </button>
        `;
        
        vehicleUsageList.appendChild(vehicleItem);
        
        // Event-Listener zum Entfernen
        const removeBtn = vehicleItem.querySelector('.remove-vehicle');
        removeBtn.addEventListener('click', () => removeVehicleFromList(index));
    });
}

/**
 * Entfernt ein Fahrzeug aus der Liste
 * @param {number} index - Der Index des zu entfernenden Fahrzeugs
 */
function removeVehicleFromList(index) {
    window.vehicleUsage.selectedVehicles.splice(index, 1);
    updateVehicleUsageList();
    showNotification('Fahrzeug entfernt', 'success');
}

/**
 * Bereitet die Fahrzeugdaten für das Speichern vor
 * @returns {Array} Ein Array mit den Fahrzeugnutzungsdaten
 */
function getVehicleUsageData() {
    return window.vehicleUsage.selectedVehicles.map(vehicle => ({
        vehicleId: vehicle.vehicleId,
        hours: vehicle.hours,
        hourlyRate: vehicle.hourlyRate
    }));
}

/**
 * Setzt die Fahrzeugauswahl zurück
 */
function resetVehicleUsage() {
    window.vehicleUsage.selectedVehicles = [];
    updateVehicleUsageList();
}

/**
 * Hilfsfunktion zum Escapen von HTML
 * @param {string} text - Der zu escapende Text
 * @returns {string} Der escapte Text
 */
function escapeHTML(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Hilfsfunktion zur Anzeige von Benachrichtigungen
 * @param {string} message - Die Nachricht
 * @param {string} type - Typ der Nachricht (success, error, warning)
 */
function showNotification(message, type = 'info') {
    if (typeof window !== 'undefined' && typeof window.notify === 'function') {
        window.notify(message, type);
        return;
    }
    if (window.app && window.app.showNotification) {
        window.app.showNotification(message, type);
    } else {
        console.log(`${type.toUpperCase()}: ${message}`);
    }
}

// Initialisieren, wenn das DOM vollständig geladen ist
document.addEventListener('DOMContentLoaded', () => {
    // Verzögerung, um sicherzustellen, dass die Modal-Elemente bereits existieren
    setTimeout(() => {
        if (document.getElementById('vehicle-usage-section')) {
            initVehicleUsage();
        }
    }, 1000);
});
