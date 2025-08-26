/**
 * admin-vacation.js
 * Verwaltung von Urlaubsanträgen durch Administratoren
 */

document.addEventListener('DOMContentLoaded', async function() {
    // Globale Variablen
    let adminId = null;
    let calendar = null;
    let allEmployees = [];
    let allLeaveRequests = [];
    
    // DOM-Elemente
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const pendingRequestsContainer = document.getElementById('pending-requests-container');
    const allRequestsContainer = document.getElementById('all-requests-container');
    const teamVacationStats = document.getElementById('team-vacation-stats');
    const filterStatus = document.getElementById('filter-status');
    const notificationsContainer = document.getElementById('notifications-container');
    
    // Modal-Elemente
    const rejectionModal = document.getElementById('rejection-modal');
    const closeModalBtns = document.querySelectorAll('.close-modal');
    const rejectionReason = document.getElementById('rejection-reason');
    const rejectionRequestId = document.getElementById('rejection-request-id');
    const confirmRejectionBtn = document.getElementById('confirm-rejection');
    
    /**
     * Initialisierung
     */
    async function init() {
        try {
            // Authentifizierung überprüfen
            await DataService.authReady;
            
            // Prüfen, ob Admin angemeldet ist
            let currentAdmin = DataService.getCurrentAdmin();
            
            // Falls kein Admin in DataService, prüfe traditionellen localStorage
            if (!currentAdmin) {
                try {
                    const savedAdmin = localStorage.getItem('lauffer_current_admin');
                    if (savedAdmin) {
                        currentAdmin = JSON.parse(savedAdmin);
                        console.log('Admin aus localStorage geladen:', currentAdmin);
                    }
                } catch (error) {
                    console.error('Fehler beim Laden des Admins aus localStorage:', error);
                }
            }
            
            if (!currentAdmin) {
                console.warn('Kein Admin angemeldet - verwende Fallback-Prüfung');
                const isAdmin = await DataService.isAdmin();
                if (!isAdmin) {
                    showNotification('Sie haben keine Berechtigung, diese Seite aufzurufen.', 'error');
                    setTimeout(() => {
                        window.location.href = 'index.html';
                    }, 2000);
                    return;
                }
            }
            
            // Admin-ID speichern - verwende bereits geladenen currentAdmin
            if (currentAdmin) {
                // Verwende Admin-Username oder UID falls vorhanden
                adminId = currentAdmin.uid || currentAdmin.username || 'admin';
                console.log('Admin ID für Urlaubsanträge:', adminId);
            } else {
                // Fallback für direkte Admin-Session
                const currentUser = await DataService.getCurrentUser();
                if (currentUser) {
                    adminId = currentUser.uid;
                } else {
                    console.warn('Kein Admin angemeldet - verwende Fallback');
                    adminId = 'admin'; // Fallback für lokale Tests
                }
            }
            
            // Alle Mitarbeiter laden
            allEmployees = await DataService.getAllEmployees();
            
            // Tab-Funktionalität initialisieren
            initTabs();
            
            // Urlaubsanträge laden
            loadAllLeaveRequests();
            
            // Kalendar initialisieren
            initCalendar();
            
            // Team-Übersicht laden
            loadTeamOverview();
            
            // Event-Listener für Filter
            filterStatus.addEventListener('change', filterRequests);
            
            // Event-Listener für Modal
            closeModalBtns.forEach(btn => {
                btn.addEventListener('click', closeModal);
            });
            
            confirmRejectionBtn.addEventListener('click', handleRejection);
            
        } catch (error) {
            console.error('Fehler bei der Initialisierung:', error);
            showNotification('Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.', 'error');
        }
    }
    
    /**
     * Initialisiert die Tabs
     */
    function initTabs() {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.getAttribute('data-tab');
                
                // Aktive Klassen entfernen
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(tab => tab.classList.remove('active'));
                
                // Aktive Klassen hinzufügen
                button.classList.add('active');
                document.getElementById(tabName).classList.add('active');
                
                // Wenn Kalender-Tab aktiviert, Kalender neu rendern
                if (tabName === 'calendar-view' && calendar) {
                    calendar.render();
                }
            });
        });
    }
    
    /**
     * Lädt alle Urlaubsanträge
     */
    async function loadAllLeaveRequests() {
        try {
            allLeaveRequests = await DataService.getAllLeaveRequests();
            
            // Offene Anträge anzeigen
            displayPendingRequests();
            
            // Alle Anträge anzeigen (wird gefiltert)
            filterRequests();
            
            // Kalendar aktualisieren
            if (calendar) {
                updateCalendarEvents();
            }
            
        } catch (error) {
            console.error('Fehler beim Laden der Urlaubsanträge:', error);
            showNotification('Fehler beim Laden der Urlaubsanträge.', 'error');
        }
    }
    
    /**
     * Zeigt ausstehende Urlaubsanträge an
     */
    function displayPendingRequests() {
        const pendingRequests = allLeaveRequests.filter(request => request.status === 'pending');
        
        if (pendingRequests.length === 0) {
            pendingRequestsContainer.innerHTML = `
                <div class="notification notification-info" style="width: 100%;">
                    <i class="fas fa-info-circle"></i>
                    Derzeit gibt es keine offenen Urlaubsanträge.
                </div>
            `;
            return;
        }
        
        pendingRequestsContainer.innerHTML = '';
        
        pendingRequests.forEach(request => {
            const requestCard = createRequestCard(request);
            pendingRequestsContainer.appendChild(requestCard);
        });
    }
    
    /**
     * Filtert Urlaubsanträge nach Status
     */
    function filterRequests() {
        const selectedStatus = filterStatus.value;
        
        let filteredRequests = [...allLeaveRequests];
        
        if (selectedStatus !== 'all') {
            filteredRequests = allLeaveRequests.filter(request => request.status === selectedStatus);
        }
        
        displayFilteredRequests(filteredRequests);
    }
    
    /**
     * Zeigt gefilterte Urlaubsanträge an
     * @param {Array} requests - Die anzuzeigenden Urlaubsanträge
     */
    function displayFilteredRequests(requests) {
        if (requests.length === 0) {
            allRequestsContainer.innerHTML = `
                <div class="notification notification-info" style="width: 100%;">
                    <i class="fas fa-info-circle"></i>
                    Keine Urlaubsanträge gefunden.
                </div>
            `;
            return;
        }
        
        allRequestsContainer.innerHTML = '';
        
        requests.forEach(request => {
            const requestCard = createRequestCard(request, true);
            allRequestsContainer.appendChild(requestCard);
        });
    }
    
    /**
     * Erstellt eine Karte für einen Urlaubsantrag
     * @param {Object} request - Der Urlaubsantrag
     * @param {boolean} isHistory - Gibt an, ob es sich um den Verlaufs-Tab handelt
     * @returns {HTMLElement} - Die erstellte Karte
     */
    function createRequestCard(request, isHistory = false) {
        const startDate = request.startDate.toDate ? 
            request.startDate.toDate() : new Date(request.startDate);
        const endDate = request.endDate.toDate ? 
            request.endDate.toDate() : new Date(request.endDate);
        
        // Formatierte Daten
        const formattedStartDate = startDate.toLocaleDateString('de-DE');
        const formattedEndDate = endDate.toLocaleDateString('de-DE');
        
        // Urlaubstyp formatieren
        let vacationType = 'Erholungsurlaub';
        if (request.type === 'sonderurlaub') vacationType = 'Sonderurlaub';
        if (request.type === 'unbezahlt') vacationType = 'Unbezahlter Urlaub';
        
        // Status-Badge erstellen
        let statusBadge = '';
        switch (request.status) {
            case 'pending':
                statusBadge = '<span class="status-badge badge-pending">Ausstehend</span>';
                break;
            case 'approved':
                statusBadge = '<span class="status-badge badge-approved">Genehmigt</span>';
                break;
            case 'rejected':
                statusBadge = '<span class="status-badge badge-rejected">Abgelehnt</span>';
                break;
        }
        
        // Aktionsbuttons nur für ausstehende Anträge
        let actionButtons = '';
        if (request.status === 'pending') {
            actionButtons = `
                <div class="request-actions">
                    <button class="btn-approve" data-id="${request.id}">
                        <i class="fas fa-check"></i> Genehmigen
                    </button>
                    <button class="btn-reject" data-id="${request.id}">
                        <i class="fas fa-times"></i> Ablehnen
                    </button>
                </div>
            `;
        } else {
            // Information über den Bearbeiter anzeigen
            const reviewDate = request.reviewedAt?.toDate ? 
                request.reviewedAt.toDate().toLocaleDateString('de-DE') : 'Unbekannt';
                
            actionButtons = `
                <div class="request-info-footer">
                    <p><small>Bearbeitet am: ${reviewDate}</small></p>
                    ${request.adminComment ? `<p><small>Kommentar: ${request.adminComment}</small></p>` : ''}
                </div>
            `;
        }
        
        // Karte erstellen
        const card = document.createElement('div');
        card.className = 'request-card';
        card.innerHTML = `
            <div class="request-header">
                <span class="employee-name">${request.employeeName}</span>
                ${statusBadge}
            </div>
            <div class="request-dates">
                <i class="fas fa-calendar"></i> ${formattedStartDate} bis ${formattedEndDate}
                <br>
                <small>${vacationType} (${request.workingDays} Arbeitstage)</small>
            </div>
            <div class="request-info">
                <p><small>Eingereicht: ${request.createdAt.toDate().toLocaleDateString('de-DE')}</small></p>
                ${request.reason ? `<p><small>Begründung: ${request.reason}</small></p>` : ''}
            </div>
            ${actionButtons}
        `;
        
        // Event-Listener hinzufügen
        if (request.status === 'pending') {
            const approveButton = card.querySelector('.btn-approve');
            const rejectButton = card.querySelector('.btn-reject');
            
            approveButton.addEventListener('click', () => handleApproval(request.id));
            rejectButton.addEventListener('click', () => openRejectionModal(request.id));
        }
        
        return card;
    }
    
    /**
     * Initialisiert den FullCalendar
     */
    function initCalendar() {
        const calendarEl = document.getElementById('vacation-calendar');
        
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'de',
            height: 600, // Feste Höhe für vollständigen Monatsanzeige
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,listWeek'
            },
            buttonText: {
                today: 'Heute',
                month: 'Monat',
                week: 'Woche',
                list: 'Liste'
            },
            weekNumbers: true,
            firstDay: 1, // Montag
            // aspectRatio entfernt - verwende feste Höhe für vollständigen Monat
            eventTimeFormat: {
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false,
                hour12: false
            },
            // Responsive Verhalten verbessern
            windowResize: function() {
                calendar.updateSize();
            },
            // Event-Darstellung verbessern
            eventDidMount: function(info) {
                // Tooltip für bessere Übersicht hinzufügen
                const request = allLeaveRequests.find(req => req.id === info.event.extendedProps.requestId);
                if (request) {
                    const tooltip = `${request.employeeName}\nStatus: ${getStatusText(request.status)}\nZeitraum: ${request.workingDays} Arbeitstage`;
                    info.el.setAttribute('title', tooltip);
                }
            },
            eventClick: function(info) {
                // Event-Details anzeigen
                const event = info.event;
                const requestId = event.extendedProps.requestId;
                const request = allLeaveRequests.find(req => req.id === requestId);
                
                if (request) {
                    let content = `
                        <strong>${request.employeeName}</strong><br>
                        ${event.title}<br>
                        Status: ${getStatusText(request.status)}<br>
                    `;
                    
                    if (request.reason) {
                        content += `Begründung: ${request.reason}<br>`;
                    }
                    
                    if (request.status === 'pending') {
                        content += `
                            <br>
                            <button class="fc-button fc-button-primary" onclick="handleCalendarApproval('${requestId}')">
                                Genehmigen
                            </button>
                            <button class="fc-button fc-button-danger" style="background: #dc3545;" onclick="handleCalendarRejection('${requestId}')">
                                Ablehnen
                            </button>
                        `;
                    }
                    
                    info.el.querySelector('.fc-event-title').innerHTML = content;
                }
            }
        });
        
        calendar.render();
        
        // Kalendar-Ereignisse hinzufügen
        updateCalendarEvents();
        
        // Globale Funktionen für den Kalender
        window.handleCalendarApproval = handleApproval;
        window.handleCalendarRejection = openRejectionModal;
    }
    
    /**
     * Aktualisiert die Kalenderereignisse
     */
    function updateCalendarEvents() {
        if (!calendar || !allLeaveRequests) return;
        
        // Alle Ereignisse entfernen
        calendar.removeAllEvents();
        
        // Neue Ereignisse hinzufügen
        allLeaveRequests.forEach(request => {
            const startDate = request.startDate.toDate ? 
                request.startDate.toDate() : new Date(request.startDate);
            const endDate = request.endDate.toDate ? 
                request.endDate.toDate() : new Date(request.endDate);
            
            // Enddatum um einen Tag verschieben für die korrekte Anzeige
            const displayEndDate = new Date(endDate);
            displayEndDate.setDate(displayEndDate.getDate() + 1);
            
            let backgroundColor = '#ffc107'; // Pending
            if (request.status === 'approved') backgroundColor = '#28a745';
            if (request.status === 'rejected') backgroundColor = '#dc3545';
            
            // Status-Emojis für bessere visuelle Darstellung
            const statusEmoji = {
                'pending': '⏳',
                'approved': '✅',
                'rejected': '❌'
            }[request.status] || '';
            
            calendar.addEvent({
                title: `${statusEmoji} ${request.employeeName} - Urlaub`,
                start: startDate,
                end: displayEndDate,
                allDay: true,
                backgroundColor: backgroundColor,
                borderColor: backgroundColor,
                className: `status-${request.status}`, // CSS-Klasse für zusätzliches Styling
                extendedProps: {
                    requestId: request.id,
                    status: request.status,
                    employeeName: request.employeeName
                }
            });
        });
    }
    
    /**
     * Lädt die Teamübersicht
     */
    async function loadTeamOverview() {
        try {
            console.log('Lade Teamübersicht...');
            
            // Frische Mitarbeiterdaten direkt vom Server laden
            allEmployees = await DataService.getAllEmployees({ forceRefresh: true });
            console.log('Geladene Mitarbeiter:', allEmployees.length);
            
            if (!allEmployees || allEmployees.length === 0) {
                console.warn('Keine Mitarbeiter gefunden');
                teamVacationStats.innerHTML = '<p>Keine Mitarbeiter gefunden.</p>';
                return;
            }
            
            // Team-Übersicht erstellen
            let html = '<table class="team-table" style="width: 100%;">';
            html += `
                <tr>
                    <th style="text-align: left;">Mitarbeiter</th>
                    <th style="text-align: center;">Urlaubstage</th>
                    <th style="text-align: center;">Genutzt</th>
                    <th style="text-align: center;">Übrig</th>
                    <th style="text-align: right;">Status</th>
                </tr>
            `;
            
            // Sortieren nach Name
            allEmployees.sort((a, b) => a.name.localeCompare(b.name));
            
            // Aktuelles Jahr
            const currentYear = new Date().getFullYear();
            console.log('Aktuelles Jahr für Urlaubsberechnung:', currentYear);
            
            // Mitarbeiter-Zeilen hinzufügen
            allEmployees.forEach(employee => {
                console.log('Verarbeite Mitarbeiter:', employee.name, 'Urlaubsdaten:', employee.vacationDays);
                
                // Urlaubstage verarbeiten mit Fallback-Werten
                let total = 30; // Standardwert
                let used = 0;   // Standardwert
                
                // Wenn vacationDays existiert, Werte übernehmen
                if (employee.vacationDays) {
                    // Sicherstellen, dass alle Felder definiert sind
                    total = employee.vacationDays.total !== undefined ? employee.vacationDays.total : 30;
                    used = employee.vacationDays.used !== undefined ? employee.vacationDays.used : 0;
                    
                    // Bei unterschiedlichem Jahr zurücksetzen
                    const vYear = employee.vacationDays.year !== undefined ? employee.vacationDays.year : currentYear;
                    if (vYear !== currentYear) {
                        total = 30;
                        used = 0;
                    }
                }
                
                const remaining = total - used;
                const percentUsed = (used / total) * 100;
                
                console.log(`${employee.name}: Total=${total}, Used=${used}, Remaining=${remaining}, Percent=${percentUsed}%`);
                
                html += `
                    <tr class="team-member">
                        <td>${employee.name}</td>
                        <td style="text-align: center;">${total}</td>
                        <td style="text-align: center;">${used}</td>
                        <td style="text-align: center;">${remaining}</td>
                        <td style="text-align: right;">
                            <div class="vacation-progress">
                                <div class="vacation-bar" style="width: ${percentUsed}%"></div>
                            </div>
                        </td>
                    </tr>
                `;
            });
            
            html += '</table>';
            teamVacationStats.innerHTML = html;
            console.log('Teamübersicht wurde aktualisiert');
            
        } catch (error) {
            console.error('Fehler beim Laden der Teamübersicht:', error);
            teamVacationStats.innerHTML = `
                <div class="notification notification-error">
                    <i class="fas fa-exclamation-circle"></i>
                    Fehler beim Laden der Teamübersicht: ${error.message}
                </div>
            `;
        }
    }
    
    /**
     * Genehmigt einen Urlaubsantrag
     * @param {string} requestId - Die ID des Antrags
     */
    async function handleApproval(requestId) {
        try {
            await DataService.processLeaveRequest(requestId, 'approved', adminId);
            
            showNotification('Der Urlaubsantrag wurde genehmigt.', 'success');
            
            // Daten neu laden
            await loadAllLeaveRequests();
            await loadTeamOverview();
            
            // Badge im Hauptdashboard aktualisieren
            if (typeof window.updateVacationBadge === 'function') {
                window.updateVacationBadge();
            }
            
        } catch (error) {
            console.error('Fehler bei der Genehmigung des Urlaubsantrags:', error);
            showNotification(
                error.message === 'Nicht genügend Urlaubstage verfügbar' ?
                'Der Mitarbeiter hat nicht genügend Urlaubstage.' :
                'Fehler bei der Genehmigung des Urlaubsantrags.', 
                'error'
            );
        }
    }
    
    /**
     * Öffnet das Modal zur Ablehnung eines Urlaubsantrags
     * @param {string} requestId - Die ID des Antrags
     */
    function openRejectionModal(requestId) {
        rejectionRequestId.value = requestId;
        rejectionReason.value = '';
        rejectionModal.classList.add('active');
    }
    
    /**
     * Schließt das Modal
     */
    function closeModal() {
        rejectionModal.classList.remove('active');
    }
    
    /**
     * Lehnt einen Urlaubsantrag ab
     */
    async function handleRejection() {
        const requestId = rejectionRequestId.value;
        const reason = rejectionReason.value.trim();
        
        if (!requestId) {
            showNotification('Fehler: Keine Antrags-ID gefunden.', 'error');
            closeModal();
            return;
        }
        
        try {
            await DataService.processLeaveRequest(requestId, 'rejected', adminId, reason);
            
            showNotification('Der Urlaubsantrag wurde abgelehnt.', 'success');
            
            closeModal();
            
            // Daten neu laden
            await loadAllLeaveRequests();
            
        } catch (error) {
            console.error('Fehler bei der Ablehnung des Urlaubsantrags:', error);
            showNotification('Fehler bei der Ablehnung des Urlaubsantrags.', 'error');
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
    
    /**
     * Gibt den formatierten Status-Text zurück
     * @param {string} status - Der Status
     * @returns {string} - Der formatierte Text
     */
    function getStatusText(status) {
        switch (status) {
            case 'pending': return 'Ausstehend';
            case 'approved': return 'Genehmigt';
            case 'rejected': return 'Abgelehnt';
            default: return status;
        }
    }
    
    // Initialisieren
    init();
});
