/**
 * vacation-requests.js
 * Funktionalität für die Verwaltung von Urlaubsanträgen durch Mitarbeiter
 */

document.addEventListener('DOMContentLoaded', async function() {
    // Elemente
    const vacationForm = document.getElementById('vacation-request-form');
    const startDateInput = document.getElementById('vacation-start-date');
    const endDateInput = document.getElementById('vacation-end-date');
    const vacationTypeSelect = document.getElementById('vacation-type');
    const reasonTextarea = document.getElementById('vacation-reason');
    const workingDaysInfo = document.getElementById('working-days-info');
    const vacationDaysInfo = document.getElementById('vacation-days-info');
    const vacationRequestList = document.getElementById('vacation-request-list');
    const notificationsContainer = document.getElementById('notifications-container');
    
    // Globale Variablen
    let currentEmployee = null;
    let refreshInterval = null;
    
    /**
     * Initialisierung
     */
    async function init() {
        try {
            // Warten bis Firebase Auth bereit ist
            await DataService.authReady;
            
            // Aktuellen Mitarbeiter laden
            await refreshEmployeeData();
            
            // Wenn kein Mitarbeiter eingeloggt ist, Hinweis anzeigen
            if (!currentEmployee) {
                showNotification('Bitte melden Sie sich an, um Urlaubsanträge zu stellen.', 'error');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
                return;
            }
            
            // Urlaubskonto anzeigen
            updateVacationDaysInfo();
            
            // Urlaubsanträge laden
            loadEmployeeLeaveRequests();
            
            // Min/Max-Datum für Datumseingaben setzen
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const todayStr = `${yyyy}-${mm}-${dd}`;
            const maxDate = `${yyyy + 1}-12-31`; // Bis Ende nächstes Jahr
            
            startDateInput.min = todayStr;
            startDateInput.max = maxDate;
            endDateInput.min = todayStr;
            endDateInput.max = maxDate;
            
            // Event Listener für Formular bereits in der Hauptfunktion definiert
            
            // Regelmäßiges Aktualisieren einrichten (alle 30 Sekunden)
            refreshInterval = setInterval(refreshEmployeeData, 30000);
            
        } catch (error) {
            console.error('Fehler bei der Initialisierung:', error);
            showNotification('Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.', 'error');
        }
    }
    
    /**
     * Zeigt das Urlaubskonto des Mitarbeiters an
     */
    function updateVacationDaysInfo() {
        if (!currentEmployee) {
            console.warn('updateVacationDaysInfo: Kein Mitarbeiter angemeldet');
            vacationDaysInfo.innerHTML = '<p class="warning-text">Bitte melden Sie sich an, um Ihr Urlaubskonto zu sehen.</p>';
            return;
        }

        const currentYear = new Date().getFullYear();
        
        // Sicherstellen, dass vacationDays existiert und vollständig ist
        if (!currentEmployee.vacationDays) {
            currentEmployee.vacationDays = {
                total: 30,
                used: 0,
                year: currentYear
            };
        } else {
            // Sicherstellen, dass alle Felder definiert sind
            if (currentEmployee.vacationDays.total === undefined) {
                currentEmployee.vacationDays.total = 30;
            }
            
            if (currentEmployee.vacationDays.used === undefined) {
                currentEmployee.vacationDays.used = 0;
            }
            
            if (currentEmployee.vacationDays.year === undefined) {
                currentEmployee.vacationDays.year = currentYear;
            }
        }
        
        // Standardwerte setzen, falls keine Urlaubstage definiert sind oder das Jahr nicht aktuell ist
        if (currentEmployee.vacationDays.year !== currentYear) {
            currentEmployee.vacationDays = {
                total: 30,
                used: 0,
                year: currentYear
            };
        }
        
        // Explizite Typkonvertierung und Standardwerte für Berechnungen
        const total = Number(currentEmployee.vacationDays.total) || 30;
        const used = Number(currentEmployee.vacationDays.used) || 0;
        const remaining = total - used;
        const percentUsed = (used / total) * 100;
        
        console.log('Urlaubskonto für Anzeige:', {
            total,
            used,
            remaining,
            percentUsed
        });
        
        vacationDaysInfo.innerHTML = `
            <h3>Ihr Urlaubskonto ${currentYear}</h3>
            <p>
                <strong>${remaining} von ${total} Tagen</strong> verfügbar
                (${used} Tage bereits genutzt)
            </p>
            <div class="vacation-days-progress">
                <div class="vacation-days-bar" style="width: ${percentUsed}%"></div>
            </div>
        `;
    }
    
    /**
     * Berechnet die Arbeitstage zwischen zwei Daten und zeigt sie an
     */
    async function calculateWorkingDays() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        
        if (!startDate || !endDate) {
            workingDaysInfo.innerHTML = '';
            return;
        }
        
        if (new Date(endDate) < new Date(startDate)) {
            workingDaysInfo.innerHTML = '<p class="error-text">Das Enddatum muss nach dem Startdatum liegen.</p>';
            return;
        }
        
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            // Arbeitstage berechnen (ohne Wochenenden und Feiertage)
            const workingDays = DataService.calculateWorkingDaysBetweenDates(start, end);
            
            if (workingDays === 0) {
                workingDaysInfo.innerHTML = '<p>Der ausgewählte Zeitraum enthält keine Arbeitstage (nur Wochenenden/Feiertage).</p>';
                return;
            }
            
            // Prüfen, ob genug Urlaubstage verfügbar sind
            const { total, used } = currentEmployee.vacationDays;
            const remaining = total - used;
            
            if (workingDays > remaining) {
                workingDaysInfo.innerHTML = `
                    <p class="notification notification-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        Ihr Antrag umfasst <strong>${workingDays} Arbeitstage</strong>, aber Sie haben nur noch 
                        <strong>${remaining} Urlaubstage</strong> verfügbar.
                    </p>
                `;
            } else {
                workingDaysInfo.innerHTML = `
                    <p class="notification notification-info">
                        <i class="fas fa-info-circle"></i>
                        Ihr Antrag umfasst <strong>${workingDays} Arbeitstage</strong>.
                    </p>
                `;
            }
        } catch (error) {
            console.error('Fehler bei der Berechnung der Arbeitstage:', error);
            workingDaysInfo.innerHTML = '<p class="error-text">Fehler bei der Berechnung der Arbeitstage.</p>';
        }
    }
    
    /**
     * Lädt alle Urlaubsanträge des aktuellen Mitarbeiters
     */
    async function loadEmployeeLeaveRequests() {
        try {
            // Prüfen ob currentEmployee existiert
            if (!currentEmployee || !currentEmployee.id) {
                console.warn('loadEmployeeLeaveRequests: Kein Mitarbeiter angemeldet oder keine ID vorhanden');
                vacationRequestList.innerHTML = `
                    <div class="no-requests-message warning-text">
                        <p>Bitte melden Sie sich an, um Ihre Urlaubsanträge zu sehen.</p>
                    </div>
                `;
                return;
            }
            
            // Urlaubsanträge laden
            console.log('Lade Urlaubsanträge für Mitarbeiter:', currentEmployee.id);
            const leaveRequests = await DataService.getLeaveRequestsByEmployeeId(currentEmployee.id);
            console.log('Geladene Urlaubsanträge:', leaveRequests);
            
            // Liste leeren
            vacationRequestList.innerHTML = '';
            
            if (!leaveRequests || leaveRequests.length === 0) {
                vacationRequestList.innerHTML = `
                    <div class="no-requests-message">
                        <p>Sie haben noch keine Urlaubsanträge gestellt.</p>
                    </div>
                `;
                return;
            }
            
            // Anträge anzeigen
            leaveRequests.forEach(request => {
                try {
                    // Sichere Formatierung der Daten
                    const formatDate = (dateField) => {
                        try {
                            if (!dateField) return 'Datum fehlt';
                            
                            if (dateField.toDate && typeof dateField.toDate === 'function') {
                                return dateField.toDate().toLocaleDateString('de-DE');
                            } else if (dateField instanceof Date) {
                                return dateField.toLocaleDateString('de-DE');
                            } else if (typeof dateField === 'object' && dateField.seconds) {
                                return new Date(dateField.seconds * 1000).toLocaleDateString('de-DE');
                            } else {
                                return new Date(dateField).toLocaleDateString('de-DE');
                            }
                        } catch (err) {
                            console.warn('Fehler bei der Datumsformatierung:', err);
                            return 'Ungültiges Datum';
                        }
                    };
                    
                    // Daten formatieren
                    const formattedStartDate = formatDate(request.startDate);
                    const formattedEndDate = formatDate(request.endDate);
                    const createdAtDate = formatDate(request.createdAt);
                    
                    // Status-Klasse und Text
                    let statusClass = '';
                    let statusText = '';
                    
                    switch (request.status) {
                        case 'pending':
                            statusClass = 'status-pending';
                            statusText = 'Ausstehend';
                            break;
                        case 'approved':
                            statusClass = 'status-approved';
                            statusText = 'Genehmigt';
                            break;
                        case 'rejected':
                            statusClass = 'status-rejected';
                            statusText = 'Abgelehnt';
                            break;
                        default:
                            statusClass = 'status-pending';
                            statusText = 'In Bearbeitung';
                    }
                    
                    // Kommentar anzeigen, falls vorhanden
                    const commentHtml = request.adminComment ? `
                        <p class="request-comment">
                            <strong>Kommentar:</strong> ${request.adminComment}
                        </p>
                    ` : '';
                    
                    // Urlaubstyp formatieren
                    let vacationType = 'Erholungsurlaub';
                    if (request.type === 'sonderurlaub') vacationType = 'Sonderurlaub';
                    if (request.type === 'unbezahlt') vacationType = 'Unbezahlter Urlaub';
                    
                    const requestElement = document.createElement('div');
                    requestElement.className = 'vacation-request';
                    requestElement.innerHTML = `
                        <div class="request-details">
                            <div class="request-period">
                                ${formattedStartDate} bis ${formattedEndDate}
                            </div>
                            <div class="request-type">
                                ${vacationType}
                            </div>
                            ${request.reason ? `<div class="request-reason">Begründung: ${request.reason}</div>` : ''}
                            <div class="request-date">
                                Eingereicht am: ${createdAtDate}
                            </div>
                            ${commentHtml}
                        </div>
                        <span class="request-status ${statusClass}">${statusText}</span>
                    `;
                    
                    vacationRequestList.appendChild(requestElement);
                } catch (itemError) {
                    console.error('Fehler bei der Verarbeitung eines Urlaubsantrags:', itemError, request);
                    // Einzelner Antrag fehlgeschlagen, aber wir machen trotzdem weiter
                }
            });
            
        } catch (error) {
            console.error('Fehler beim Laden der Urlaubsanträge:', error);
            vacationRequestList.innerHTML = `
                <div class="no-requests-message error-text">
                    <p>Fehler beim Laden der Urlaubsanträge.</p>
                    <small>${error.message || 'Unbekannter Fehler'}</small>
                </div>
            `;
        }
    }
    
    /**
     * Event-Listener für das Formular zum Einreichen eines Urlaubsantrags
     */
    vacationForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Formulardaten sammeln
        const startDate = new Date(startDateInput.value);
        const endDate = new Date(endDateInput.value);
        const type = vacationTypeSelect.value;
        const reason = reasonTextarea.value.trim();
        
        // Validierung
        if (endDate < startDate) {
            showNotification('Das Enddatum muss nach dem Startdatum liegen.', 'error');
            return;
        }
        
        // Arbeitstage berechnen
        const workingDays = DataService.calculateWorkingDaysBetweenDates(startDate, endDate);
        
        if (workingDays === 0) {
            showNotification('Der ausgewählte Zeitraum enthält keine Arbeitstage.', 'warning');
            return;
        }
        
        // Verfügbare Urlaubstage prüfen (nur Warnung, keine Blockierung)
        const { total, used } = currentEmployee.vacationDays;
        const remaining = total - used;
        
        if (workingDays > remaining && type === 'urlaub') {
            if (!confirm(`Ihr Antrag umfasst ${workingDays} Arbeitstage, aber Sie haben nur noch ${remaining} Urlaubstage verfügbar. Möchten Sie den Antrag trotzdem stellen?`)) {
                return;
            }
        }
        
        // Anzeigen, dass der Antrag eingereicht wird
        const submitButton = vacationForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Wird eingereicht...';
        
        try {
            // Antrag erstellen
            const leaveRequestData = {
                employeeId: currentEmployee.id,
                startDate: firebase.firestore.Timestamp.fromDate(startDate),
                endDate: firebase.firestore.Timestamp.fromDate(endDate),
                type,
                reason: reason || null,
                workingDays
            };
            
            // In Firestore speichern
            await DataService.createLeaveRequest(leaveRequestData);
            
            // Formular zurücksetzen
            vacationForm.reset();
            workingDaysInfo.innerHTML = '';
            
            // Erfolgsmeldung anzeigen
            showNotification('Ihr Urlaubsantrag wurde erfolgreich eingereicht.', 'success');
            
            // Liste der Anträge aktualisieren
            loadEmployeeLeaveRequests();
            
        } catch (error) {
            console.error('Fehler beim Einreichen des Urlaubsantrags:', error);
            showNotification('Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.', 'error');
        } finally {
            // Button zurücksetzen
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
        }
    });
    
    /**
     * Aktualisiert die Mitarbeiterdaten und das Urlaubskonto
     * @returns {Promise<void>}
     */
    async function refreshEmployeeData() {
        try {
            // Aktuelle Mitarbeiter-ID holen
            const currentEmployeeData = await DataService.getCurrentEmployee();
            
            if (!currentEmployeeData || !currentEmployeeData.id) {
                console.warn('Kein Mitarbeiter angemeldet');
                return;
            }
            
            // Aktuellen Mitarbeiter mit frischen Daten aus der Datenbank laden
            const freshEmployeeData = await DataService.getEmployeeById(currentEmployeeData.id);
            
            if (freshEmployeeData) {
                // Aktualisiere die lokale Variable
                currentEmployee = freshEmployeeData;
                console.log('Mitarbeiterdaten aktualisiert:', currentEmployee);
                
                // Detaillierte Informationen zum Urlaubskonto ausgeben
                if (currentEmployee.vacationDays) {
                    console.log('Urlaubskonto-Details:', {
                        total: currentEmployee.vacationDays.total,
                        used: currentEmployee.vacationDays.used,
                        year: currentEmployee.vacationDays.year,
                        verfügbar: currentEmployee.vacationDays.total - currentEmployee.vacationDays.used
                    });
                } else {
                    console.log('Kein Urlaubskonto definiert!');
                }
                
                // Urlaubskonto aktualisieren
                updateVacationDaysInfo();
                
                // Urlaubsanträge neu laden
                loadEmployeeLeaveRequests();
            }
        } catch (error) {
            console.error('Fehler beim Aktualisieren der Mitarbeiterdaten:', error);
        }
    }
    
    /**
     * Zeigt eine Benachrichtigung an
     * @param {string} message - Die anzuzeigende Nachricht
     * @param {string} type - Der Typ der Nachricht (info, success, warning, error)
     * @param {number} duration - Die Dauer in Millisekunden, wie lange die Nachricht angezeigt werden soll (0 für permanent)
     */
    function showNotification(message, type = 'info', duration = 5000) {
        // Icon basierend auf Typ
        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'warning') icon = 'exclamation-triangle';
        if (type === 'error') icon = 'times-circle';
        
        // Notification-Element erstellen
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${icon}"></i>
            ${message}
            <button class="close-btn"><i class="fas fa-times"></i></button>
        `;
        
        // Schließen-Button
        const closeBtn = notification.querySelector('.close-btn');
        closeBtn.addEventListener('click', () => {
            notification.remove();
        });
        
        // Zur Seite hinzufügen
        notificationsContainer.appendChild(notification);
        
        // Automatisch ausblenden, wenn Dauer > 0
        if (duration > 0) {
            setTimeout(() => {
                notification.remove();
            }, duration);
        }
    }
    
    // Initialisieren
    init();
});
