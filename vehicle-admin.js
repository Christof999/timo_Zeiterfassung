/**
 * Fahrzeugverwaltung für die Admin-Oberfläche
 * Ermöglicht das Anzeigen, Erstellen, Bearbeiten und Löschen von Fahrzeugen
 */

document.addEventListener('DOMContentLoaded', () => {
    // Wenn der DOM vollständig geladen ist, initialisieren wir die Fahrzeugverwaltung
    if (document.getElementById('vehicles-tab')) {
        initVehicleAdmin();
    }
});

/**
 * Initialisiert die Fahrzeugverwaltung
 */
function initVehicleAdmin() {
    // Referenzen auf DOM-Elemente
    const addVehicleBtn = document.getElementById('add-vehicle-btn');
    const vehicleForm = document.getElementById('vehicle-form');
    const vehicleFormModal = document.getElementById('vehicle-form-modal');
    const closeModal = vehicleFormModal.querySelector('.close-modal');
    const cancelBtn = vehicleFormModal.querySelector('.cancel-btn');
    
    // Event-Listener für das Hinzufügen eines neuen Fahrzeugs
    addVehicleBtn.addEventListener('click', () => {
        resetVehicleForm();
        document.getElementById('vehicle-form-title').textContent = 'Fahrzeug hinzufügen';
        showModal(vehicleFormModal);
    });
    
    // Event-Listener für das Schließen des Modals
    closeModal.addEventListener('click', () => hideModal(vehicleFormModal));
    cancelBtn.addEventListener('click', () => hideModal(vehicleFormModal));
    
    // Event-Listener für das Absenden des Formulars
    vehicleForm.addEventListener('submit', handleVehicleFormSubmit);
    
    // Initial alle Fahrzeuge laden
    loadVehicles();
    
    // Schließen des Modals bei Klick außerhalb
    window.addEventListener('click', (event) => {
        if (event.target === vehicleFormModal) {
            hideModal(vehicleFormModal);
        }
    });
}

/**
 * Lädt alle Fahrzeuge aus der Datenbank und zeigt sie in der Tabelle an
 */
async function loadVehicles() {
    try {
        const vehicles = await DataService.getAllVehicles();
        const tbody = document.querySelector('#vehicles-table tbody');
        tbody.innerHTML = '';
        
        if (vehicles.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="5" class="no-data">Keine Fahrzeuge vorhanden</td>';
            tbody.appendChild(tr);
            return;
        }
        
        vehicles.forEach(vehicle => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHTML(vehicle.name)}</td>
                <td>${escapeHTML(vehicle.type)}</td>
                <td>${escapeHTML(vehicle.licensePlate || '')}</td>
                <td>${vehicle.hourlyRate ? vehicle.hourlyRate.toFixed(2) : '0.00'} €</td>
                <td>
                    <button class="btn icon-btn edit-vehicle" data-id="${vehicle.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn icon-btn delete-vehicle" data-id="${vehicle.id}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
            
            // Event-Listener für Bearbeiten und Löschen hinzufügen
            tr.querySelector('.edit-vehicle').addEventListener('click', () => editVehicle(vehicle.id));
            tr.querySelector('.delete-vehicle').addEventListener('click', () => deleteVehicle(vehicle.id));
        });
    } catch (error) {
        console.error('Fehler beim Laden der Fahrzeuge:', error);
        showNotification('Fehler beim Laden der Fahrzeuge', 'error');
    }
}

/**
 * Lädt die Daten eines Fahrzeugs zum Bearbeiten
 * @param {string} id - Die ID des zu bearbeitenden Fahrzeugs
 */
async function editVehicle(id) {
    try {
        const vehicle = await DataService.getVehicleById(id);
        if (!vehicle) {
            throw new Error('Fahrzeug nicht gefunden');
        }
        
        // Formular ausfüllen
        document.getElementById('vehicle-id').value = vehicle.id;
        document.getElementById('vehicle-name').value = vehicle.name || '';
        document.getElementById('vehicle-type').value = vehicle.type || '';
        document.getElementById('vehicle-license').value = vehicle.licensePlate || '';
        document.getElementById('vehicle-hourly-rate').value = vehicle.hourlyRate || '0.00';
        
        // Modal-Titel und Modal anzeigen
        document.getElementById('vehicle-form-title').textContent = 'Fahrzeug bearbeiten';
        showModal(document.getElementById('vehicle-form-modal'));
    } catch (error) {
        console.error('Fehler beim Laden des Fahrzeugs:', error);
        showNotification('Fehler beim Laden des Fahrzeugs', 'error');
    }
}

/**
 * Löscht ein Fahrzeug nach Bestätigung
 * @param {string} id - Die ID des zu löschenden Fahrzeugs
 */
async function deleteVehicle(id) {
    if (confirm('Sind Sie sicher, dass Sie dieses Fahrzeug löschen möchten?')) {
        try {
            await DataService.deleteVehicle(id);
            showNotification('Fahrzeug erfolgreich gelöscht', 'success');
            loadVehicles(); // Tabelle aktualisieren
        } catch (error) {
            console.error('Fehler beim Löschen des Fahrzeugs:', error);
            showNotification('Fehler beim Löschen des Fahrzeugs', 'error');
        }
    }
}

/**
 * Behandelt das Absenden des Fahrzeug-Formulars (Erstellen oder Aktualisieren)
 * @param {Event} event - Das Submit-Event
 */
async function handleVehicleFormSubmit(event) {
    event.preventDefault();
    
    // Debug: Formular-Elemente prüfen
    console.log('Formular-Elemente:', {
        'vehicle-name': document.getElementById('vehicle-name'),
        'vehicle-type': document.getElementById('vehicle-type'),
        'vehicle-license': document.getElementById('vehicle-license'),
        'vehicle-hourly-rate': document.getElementById('vehicle-hourly-rate')
    });
    
    // Formularfelder auslesen
    const vehicleId = document.getElementById('vehicle-id').value.trim();
    const vehicleData = {
        name: document.getElementById('vehicle-name').value.trim(),
        type: document.getElementById('vehicle-type').value.trim(),
        licensePlate: document.getElementById('vehicle-license').value.trim(),
        hourlyRate: parseFloat(document.getElementById('vehicle-hourly-rate').value) || 0
    };
    
    // Debug: Gesammelte Daten anzeigen
    console.log('Fahrzeug-Daten zum Speichern:', vehicleData);
    
    try {
        let message;
        if (vehicleId) {
            // Bestehendes Fahrzeug aktualisieren
            console.log('Aktualisiere Fahrzeug mit ID:', vehicleId);
            await DataService.updateVehicle(vehicleId, vehicleData);
            message = 'Fahrzeug erfolgreich aktualisiert';
        } else {
            // Neues Fahrzeug erstellen
            console.log('Erstelle neues Fahrzeug mit Daten:', JSON.stringify(vehicleData));
            const result = await DataService.createVehicle(vehicleData);
            console.log('Erstelltes Fahrzeug:', result);
            message = 'Fahrzeug erfolgreich hinzugefügt';
        }
        
        // Modal schließen und Tabelle aktualisieren
        hideModal(document.getElementById('vehicle-form-modal'));
        loadVehicles();
        showNotification(message, 'success');
    } catch (error) {
        console.error('Fehler beim Speichern des Fahrzeugs:', error);
        showNotification('Fehler beim Speichern des Fahrzeugs', 'error');
    }
}

/**
 * Setzt das Fahrzeug-Formular zurück
 */
function resetVehicleForm() {
    document.getElementById('vehicle-form').reset();
    document.getElementById('vehicle-id').value = '';
}

/**
 * Zeigt ein Modal an
 * @param {HTMLElement} modal - Das Modal-Element
 */
function showModal(modal) {
    modal.style.display = 'block';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}

/**
 * Verbirgt ein Modal
 * @param {HTMLElement} modal - Das Modal-Element
 */
function hideModal(modal) {
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
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
 * Zeigt eine Benachrichtigung an
 * @param {string} message - Die Nachricht, die angezeigt werden soll
 * @param {string} type - Der Typ der Benachrichtigung (success, error, warning, info)
 */
function showNotification(message, type = 'info') {
    // Prüfen ob ein Toast-Container existiert, wenn nicht, erstellen
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.position = 'fixed';
        toastContainer.style.top = '20px';
        toastContainer.style.right = '20px';
        toastContainer.style.zIndex = '9999';
        document.body.appendChild(toastContainer);
    }
    
    // Toast erstellen
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.padding = '10px 15px';
    toast.style.marginBottom = '10px';
    toast.style.borderRadius = '4px';
    toast.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    toast.style.minWidth = '250px';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    
    // Hintergrundfarbe basierend auf Typ
    switch(type) {
        case 'success':
            toast.style.backgroundColor = '#4CAF50';
            toast.style.color = 'white';
            break;
        case 'error':
            toast.style.backgroundColor = '#F44336';
            toast.style.color = 'white';
            break;
        case 'warning':
            toast.style.backgroundColor = '#FF9800';
            toast.style.color = 'white';
            break;
        default:
            toast.style.backgroundColor = '#2196F3';
            toast.style.color = 'white';
    }
    
    // Nachricht setzen
    toast.textContent = message;
    
    // Toast zum Container hinzufügen
    toastContainer.appendChild(toast);
    
    // Toast einblenden
    setTimeout(() => {
        toast.style.opacity = '1';
    }, 10);
    
    // Toast nach 3 Sekunden ausblenden und entfernen
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, 3000);
}
