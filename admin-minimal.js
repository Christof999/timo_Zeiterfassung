/**
 * Admin-Bereich der Lauffer Zeiterfassung App
 */

// Die Datei wird nicht richtig neu geladen oder es gibt Caching-Probleme

// Globales Objekt für die Admin-App
window.adminMinimalApp = {
    dashboardRefreshInterval: null,
    projectMap: null,
    projectMarker: null,
    geocoder: null
};

// Hilfsfunktionen für globale Variablen
function setDashboardRefreshInterval(interval) {
    window.adminMinimalApp.dashboardRefreshInterval = interval;
}

function getDashboardRefreshInterval() {
    return window.adminMinimalApp.dashboardRefreshInterval;
}

// Urlaubsanträge-Badge aktualisieren
async function updateVacationBadge() {
    try {
        console.log('🔄 Badge wird aktualisiert...');
        const pendingCount = await DataService.getPendingLeaveRequestsCount();
        console.log('📊 Anzahl ausstehender Urlaubsanträge:', pendingCount);
        
        const badge = document.getElementById('vacation-badge');
        const tabBtn = document.getElementById('vacation-tab-btn');
        
        console.log('🎯 Badge Element gefunden:', !!badge);
        console.log('🎯 Tab Button Element gefunden:', !!tabBtn);
        
        if (!badge || !tabBtn) {
            console.warn('❌ Vacation badge oder tab button nicht gefunden');
            console.warn('Badge element:', badge);
            console.warn('Tab button element:', tabBtn);
            return;
        }
        
        if (pendingCount > 0) {
            console.log('✅ Badge wird angezeigt mit Anzahl:', pendingCount);
            // Badge anzeigen und Anzahl setzen
            badge.textContent = pendingCount.toString();
            badge.style.display = 'block';
            
            // Tab rot hinterlegen
            tabBtn.classList.add('has-pending');
        } else {
            console.log('🔄 Badge wird versteckt (keine ausstehenden Anträge)');
            // Badge verstecken
            badge.style.display = 'none';
            
            // Rote Hinterlegung entfernen
            tabBtn.classList.remove('has-pending');
        }
    } catch (error) {
        console.error('❌ Fehler beim Aktualisieren des Urlaubsanträge-Badges:', error);
    }
}

// Globale Funktion für externe Aufrufe
window.updateVacationBadge = updateVacationBadge;

// DOMContentLoaded Event
document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin Minimal JS geladen');
    
    // Splash Screen ausblenden nach dem Laden
    setTimeout(() => {
        const splashScreen = document.getElementById('splash-screen');
        if (splashScreen) {
            splashScreen.style.opacity = '0';
            splashScreen.style.transition = 'opacity 0.5s ease-out';
            setTimeout(() => {
                splashScreen.style.display = 'none';
            }, 500);
        }
    }, 2000); // 2 Sekunden warten (Zeit für Lade-Animation)
    
    // DOM-Elemente
    const adminLoginForm = document.getElementById('admin-login-form');
    const adminLoginSection = document.getElementById('admin-login-section');
    const adminDashboard = document.getElementById('admin-dashboard');
    const adminLogoutBtn = document.getElementById('admin-logout-btn');
    const adminNameSpan = document.getElementById('admin-name');
    
    // Tab-Elemente
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Globale Event-Delegation für Projekt-Buttons (Fallback)
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('edit-project-btn') || e.target.closest('.edit-project-btn')) {
            const btn = e.target.classList.contains('edit-project-btn') ? e.target : e.target.closest('.edit-project-btn');
            const id = btn.dataset.id;
            console.log('🔧 Global event delegation: Edit project clicked:', id);
            if (id) {
                e.preventDefault();
                e.stopPropagation();
                showProjectForm(id);
            }
        }
    });
    
    // Dashboard-Elemente
    const activeEmployeesCount = document.getElementById('active-employees-count');
    const activeProjectsCount = document.getElementById('active-projects-count');
    const todayHours = document.getElementById('today-hours');
    const liveActivityTable = document.getElementById('live-activity-table')?.querySelector('tbody');
    
    // Mitarbeiter-Tab-Elemente
    const employeesTable = document.getElementById('employees-table')?.querySelector('tbody');
    const addEmployeeBtn = document.getElementById('add-employee-btn');
    const employeeFormModal = document.getElementById('employee-form-modal');
    const employeeForm = document.getElementById('employee-form');
    
    // Projekt-Tab-Elemente
    const projectsTable = document.getElementById('projects-table')?.querySelector('tbody');
    const addProjectBtn = document.getElementById('add-project-btn');
    const projectFormModal = document.getElementById('project-form-modal');
    const projectForm = document.getElementById('project-form');
    
    // Bericht-Tab-Elemente
    const reportFilterSelect = document.getElementById('report-filter');
    
    // Prüfen, ob ein Admin bereits angemeldet ist
    const savedAdmin = localStorage.getItem('lauffer_admin_user');
    
    // DataService initialisieren
    DataService.init();
    
    if (savedAdmin) {
        try {
            const admin = JSON.parse(savedAdmin);
            console.log('Admin bereits angemeldet:', admin);
            
            
            adminLoginSection.classList.add('hidden');
            adminDashboard.classList.remove('hidden');
            adminNameSpan.textContent = admin.name || 'Administrator';
            
            // Dashboard-Daten laden
            loadDashboardData();
            loadEmployeesTable();
            loadProjectsTable();
            loadVehiclesTable();
            loadReportFilters();
            
            // Badge für Urlaubsanträge aktualisieren
            setTimeout(() => {
                updateVacationBadge();
            }, 3000);
            
            // Dashboard-Daten regelmäßig aktualisieren
            const newInterval = setInterval(() => {
                loadDashboardData();
                updateVacationBadge(); // Badge auch regelmäßig aktualisieren
            }, 30000); // Alle 30 Sekunden
            setDashboardRefreshInterval(newInterval);
        } catch (error) {
            console.error('Fehler beim Parsen des gespeicherten Admins:', error);
        }
    } else {
        console.log('Kein Admin angemeldet, zeige Login-Formular');
        adminLoginSection.classList.remove('hidden');
        adminDashboard.classList.add('hidden');
    }
    
    // Event-Listener für Hinzufügen-Buttons
    if (addEmployeeBtn) {
        addEmployeeBtn.addEventListener('click', function() {
            showEmployeeForm();
        });
    }
    
    const addVehicleBtn = document.getElementById('add-vehicle-btn');
    if (addVehicleBtn) {
        addVehicleBtn.addEventListener('click', function() {
            showVehicleForm();
        });
    }
    
    if (addProjectBtn) {
        addProjectBtn.addEventListener('click', function() {
            showProjectForm();
        });
    }
    
    // Event-Listener für Formulare
    if (employeeForm) {
        employeeForm.addEventListener('submit', handleEmployeeFormSubmit);
    }
    
    if (projectForm) {
        projectForm.addEventListener('submit', handleProjectFormSubmit);
    }
    
    // Event-Listener für Schließen-Buttons bei Modals
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.classList.remove('visible');
            }
        });
    });
    
    // Login-Formular Event-Listener
    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            
            const username = document.getElementById('admin-username').value.trim();
            const password = document.getElementById('admin-password').value;
            
            console.log('Admin-Login-Versuch mit:', username);
            
            // Admin-Authentifizierung prüfen (lokale Methode)
            if (username === 'admin' && password === 'admin123') {
                console.log('Admin-Login erfolgreich!');
                
                // Admin-Objekt speichern
                const admin = { username: username, name: 'Administrator', isAdmin: true };
                localStorage.setItem('lauffer_admin_user', JSON.stringify(admin));
                
                try {
                    // Hiermit sicherstellen, dass der Admin-Status in Firestore gesetzt ist
                    // (Falls der Nutzer bereits anonym oder als Admin angemeldet ist)
                    const currentUser = firebase.auth().currentUser;
                    console.log('Aktueller Firebase-Benutzer:', currentUser ? 
                            currentUser.uid + (currentUser.isAnonymous ? ' (anonym)' : '') : 'keiner');
                    
                    if (currentUser) {
                        const db = firebase.firestore();
                        await db.collection('employees').doc(currentUser.uid).set({
                            name: 'Administrator',
                            username: 'admin',
                            isAdmin: true,
                            email: 'admin@lauffer-zeiterfassung.de'
                        }, { merge: true });
                        console.log('Admin-Status in employees-Collection gesetzt für UID:', currentUser.uid);
                    }
                } catch (error) {
                    console.warn('Firebase-Operation nicht möglich:', error.message);
                    console.log('Fahren fort mit lokaler Admin-Authentifizierung...');
                }
                
                // UI aktualisieren
                adminLoginSection.classList.add('hidden');
                adminDashboard.classList.remove('hidden');
                adminNameSpan.textContent = 'Administrator';
                
                // Warte einen Moment, damit DataService vollständig initialisiert werden kann
                console.log('Warte kurz auf Initialisierung des DataService...');
                
                setTimeout(async () => {
                    console.log('DataService Status:', DataService._authReadyPromise ? 'Auth-Promise existiert' : 'Kein Auth-Promise');
                    console.log('Firebase Auth Status:', firebase.auth().currentUser ? 
                                 `Angemeldet als ${firebase.auth().currentUser.uid} (${firebase.auth().currentUser.isAnonymous ? 'anonym' : 'nicht anonym'})` : 
                                 'Kein Benutzer');
                    
                    // Explizit DataService.init() erneut aufrufen, um sicherzustellen, dass alles richtig initialisiert ist
                    await DataService.init();
                    
                    // Dashboard-Daten laden
                    console.log('Starte Laden der Dashboard-Daten...');
                    loadDashboardData();
                    loadEmployeesTable();
                    loadProjectsTable();
                    loadVehiclesTable();
                    
                    // Badge für Urlaubsanträge nach Login aktualisieren
                    setTimeout(() => {
                        updateVacationBadge();
                    }, 2000);
                    loadReportFilters();
                }, 1000);
                
                // Dashboard-Daten regelmäßig aktualisieren
                const newInterval = setInterval(loadDashboardData, 30000);
                setDashboardRefreshInterval(newInterval);
            } else {
                console.error('Ungültige Admin-Zugangsdaten!');
                alert('Ungültige Admin-Zugangsdaten! Bitte nutzen Sie admin/admin123');
            }
        });
    } else {
        console.error('Login-Formular nicht gefunden!');
    }
    
    // Logout-Button Event-Listener
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', async function() {
            try {
                // Firebase-Abmeldung
                if (firebase.auth().currentUser) {
                    console.log('Firebase-Abmeldung für Benutzer:', firebase.auth().currentUser.uid);
                    await firebase.auth().signOut();
                    console.log('Firebase-Abmeldung erfolgreich');
                }

                // Nach kurzer Verzögerung anonym anmelden (falls für Anwendung erforderlich)
                setTimeout(async () => {
                    try {
                        await firebase.auth().signInAnonymously();
                        console.log('Anonyme Anmeldung nach Admin-Logout erfolgreich');
                    } catch (error) {
                        console.warn('Anonyme Anmeldung nach Admin-Logout fehlgeschlagen:', error);
                    }
                }, 1000);
                
                // Lokale Daten und UI zurücksetzen
                localStorage.removeItem('lauffer_admin_user');
                const currentInterval = getDashboardRefreshInterval();
                if (currentInterval) {
                    clearInterval(currentInterval);
                    setDashboardRefreshInterval(null);
                }
                adminDashboard.classList.add('hidden');
                adminLoginSection.classList.remove('hidden');
                document.getElementById('admin-username').value = '';
                document.getElementById('admin-password').value = '';
                console.log('Admin ausgeloggt');
            } catch (error) {
                console.error('Fehler beim Logout:', error);
            }
        });
    }
    
    // Tab-Wechsel Event-Listener
    if (tabButtons) {
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                const tabName = this.dataset.tab;
                handleTabChange(tabName);
            });
        });
    }
    
    // Schließen-Buttons für Modals
    document.querySelectorAll('.close-modal, .cancel-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // Clock-Out-Formular Event-Listener
    const clockOutForm = document.getElementById('clock-out-employee-form');
    if (clockOutForm) {
        clockOutForm.addEventListener('submit', handleClockOutEmployee);
    }
    
    // Fahrzeug-Formular Event-Listener
    const vehicleForm = document.getElementById('vehicle-form');
    if (vehicleForm) {
        vehicleForm.addEventListener('submit', handleVehicleFormSubmit);
    }
});

// Funktion zum Öffnen des Ausstempel-Modals
async function showClockOutModal(timeEntryId) {
    try {
        console.log('Öffne Ausstempel-Modal für Eintrag:', timeEntryId);
        
        // Modal referenzieren
        const modal = document.getElementById('clock-out-employee-modal');
        if (!modal) {
            console.error('Ausstempel-Modal nicht gefunden');
            return;
        }
        
        // Zeiteintrag laden
        const entry = await DataService.getTimeEntryById(timeEntryId);
        if (!entry) {
            console.error('Zeiteintrag nicht gefunden:', timeEntryId);
            alert('Der Zeiteintrag konnte nicht geladen werden.');
            return;
        }
        
        // Mitarbeiter laden
        const employee = await DataService.getEmployeeById(entry.employeeId);
        if (!employee) {
            console.error('Mitarbeiter nicht gefunden:', entry.employeeId);
            alert('Der zugehörige Mitarbeiter konnte nicht geladen werden.');
            return;
        }
        
        // Projekt laden
        const project = await DataService.getProjectById(entry.projectId);
        
        // Modal-Felder befüllen
        document.getElementById('clock-out-employee-id').value = timeEntryId;
        document.getElementById('clock-out-employee-name').value = employee.name;
        document.getElementById('clock-out-project').value = project ? project.name : 'Unbekanntes Projekt';
        
        // Notizen zurücksetzen
        document.getElementById('clock-out-notes').value = '';
        
        // Karte initialisieren, wenn Google Maps vorhanden ist
        if (window.google && window.google.maps) {
            setTimeout(() => {
                const mapElement = document.getElementById('clock-out-map');
                if (mapElement) {
                    const map = new google.maps.Map(mapElement, {
                        center: { lat: 48.7758, lng: 9.1829 }, // Stuttgart als Standard
                        zoom: 13
                    });
                    
                    // Marker für die Karte
                    const marker = new google.maps.Marker({
                        position: { lat: 48.7758, lng: 9.1829 },
                        map: map,
                        draggable: true
                    });
                    
                    // Event-Listener für den Marker
                    google.maps.event.addListener(marker, 'dragend', function() {
                        const pos = marker.getPosition();
                        document.getElementById('clock-out-latitude').value = pos.lat();
                        document.getElementById('clock-out-longitude').value = pos.lng();
                    });
                    
                    // Button für aktuellen Standort
                    document.getElementById('locate-clock-out-btn').addEventListener('click', function() {
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(
                                function(position) {
                                    const pos = {
                                        lat: position.coords.latitude,
                                        lng: position.coords.longitude
                                    };
                                    
                                    map.setCenter(pos);
                                    marker.setPosition(pos);
                                    
                                    document.getElementById('clock-out-latitude').value = pos.lat;
                                    document.getElementById('clock-out-longitude').value = pos.lng;
                                },
                                function(error) {
                                    console.error('Fehler bei der Standortbestimmung:', error);
                                    alert('Standort konnte nicht ermittelt werden: ' + error.message);
                                }
                            );
                        } else {
                            alert('Ihr Browser unterstützt keine Standortbestimmung.');
                        }
                    });
                }
            }, 500);
        }
        
        // Modal anzeigen
        modal.style.display = 'block';
        
    } catch (error) {
        console.error('Fehler beim Öffnen des Ausstempel-Modals:', error);
        alert('Beim Öffnen des Ausstempel-Modals ist ein Fehler aufgetreten.');
    }
}

// Handler für das Ausstempel-Formular
async function handleClockOutEmployee(event) {
    event.preventDefault();
    
    try {
        const timeEntryId = document.getElementById('clock-out-employee-id').value;
        const notes = document.getElementById('clock-out-notes').value;
        
        // Standort aus den Feldern holen
        const latitude = parseFloat(document.getElementById('clock-out-latitude').value);
        const longitude = parseFloat(document.getElementById('clock-out-longitude').value);
        
        // Standortdaten vorbereiten
        const location = {
            latitude: latitude || null,
            longitude: longitude || null,
            timestamp: new Date().toISOString()
        };
        
        console.log('Stempele Mitarbeiter aus:', timeEntryId);
        console.log('Notizen:', notes);
        console.log('Standort:', location);
        
        // Zeiteintrag aktualisieren
        await DataService.clockOutEmployee(timeEntryId, notes, location);
        
        // Modal schließen
        const modal = document.getElementById('clock-out-employee-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        
        // Dashboard aktualisieren
        loadDashboardData();
        
        alert('Mitarbeiter wurde erfolgreich ausgestempelt.');
        
    } catch (error) {
        console.error('Fehler beim Ausstempeln:', error);
        alert('Beim Ausstempeln ist ein Fehler aufgetreten: ' + error.message);
    }
}

// Dashboard-Daten laden
async function loadDashboardData() {
    console.log('Lade Dashboard-Daten...');
    try {
        // DOM-Elemente erneut abrufen
        const activeEmployeesCount = document.getElementById('active-employees-count');
        const activeProjectsCount = document.getElementById('active-projects-count');
        const todayHours = document.getElementById('today-hours');
        
        // Eingestempelte Mitarbeiter zählen
        const currentTimeEntries = await DataService.getCurrentTimeEntries();
        // Eindeutige employeeId's zählen (falls ein Mitarbeiter mehrfach eingestempelt ist)
        const uniqueClockedInEmployees = new Set(currentTimeEntries.map(entry => entry.employeeId));
        if (activeEmployeesCount) {
            activeEmployeesCount.textContent = uniqueClockedInEmployees.size;
        }
        
        // Aktive Projekte zählen
        const projects = await DataService.getAllProjects();
        const activeProjects = projects.filter(proj => proj.status === 'active');
        if (activeProjectsCount) {
            activeProjectsCount.textContent = activeProjects.length;
        }
        
        // Heutige Stunden berechnen
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        try {
            console.log('Suche Zeiteinträge zwischen', todayStart, 'und', new Date());
            // Verwende DataService.timeEntriesCollection statt direkt db
            const entriesSnapshot = await DataService.timeEntriesCollection
                .where('clockInTime', '>=', firebase.firestore.Timestamp.fromDate(todayStart))
                .get();
            
            const entries = entriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log('Gefundene Zeiteinträge:', entries);
            
            let totalHours = 0;
            
            if (entries && entries.length > 0) {
                entries.forEach(entry => {
                    console.log('Verarbeite Eintrag:', entry);
                    if (entry.clockOutTime) {
                        // Beide Datumswerte sicher konvertieren
                        let start, end;
                        
                        if (entry.clockInTime && entry.clockInTime.toDate) {
                            start = entry.clockInTime.toDate();
                        } else {
                            start = new Date(entry.clockInTime);
                        }
                        
                        if (entry.clockOutTime && entry.clockOutTime.toDate) {
                            end = entry.clockOutTime.toDate();
                        } else {
                            end = new Date(entry.clockOutTime);
                        }
                        
                        console.log('Start:', start, 'End:', end);
                        if (start && end) {
                            const hours = (end - start) / (1000 * 60 * 60);
                            console.log('Berechnete Stunden:', hours);
                            if (!isNaN(hours)) {
                                totalHours += hours;
                            }
                        }
                    }
                });
            } else {
                console.log('Keine Zeiteinträge für heute gefunden');
            }
            
            if (todayHours) {
                todayHours.textContent = totalHours.toFixed(2);
                console.log('Gesamtstunden heute:', totalHours.toFixed(2));
            }
        } catch (timeError) {
            console.error('Fehler bei der Berechnung der heutigen Stunden:', timeError);
            if (todayHours) {
                todayHours.textContent = '0.00';
            }
        }
        
        // Live-Aktivitäten anzeigen
        await loadLiveActivities();
        
    } catch (error) {
        console.error('Fehler beim Laden der Dashboard-Daten:', error);
    }
}

// Live-Aktivitäten laden
async function loadLiveActivities() {
    // DOM-Element erneut abrufen
    const liveActivityTable = document.getElementById('live-activity-table')?.querySelector('tbody');
    if (!liveActivityTable) return;
    
    try {
        liveActivityTable.innerHTML = '';
        
        // Aktuelle Zeiteinträge (ohne clockOutTime) abrufen
        const currentEntries = await DataService.getCurrentTimeEntries();
        const employees = await DataService.getAllActiveEmployees();
        const projects = await DataService.getAllProjects();
        
        // Mitarbeiter- und Projekt-Maps erstellen für schnellen Zugriff
        const employeeMap = {};
        employees.forEach(emp => employeeMap[emp.id] = emp);
        
        const projectMap = {};
        projects.forEach(proj => projectMap[proj.id] = proj);
        
        if (currentEntries.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="4" class="text-center">Keine aktiven Zeiteinträge</td>';
            liveActivityTable.appendChild(row);
            return;
        }
        
        // Einträge sortieren (neueste zuerst)
        currentEntries.sort((a, b) => {
            const dateA = a.clockInTime instanceof firebase.firestore.Timestamp ? 
                a.clockInTime.toDate() : new Date(a.clockInTime);
            const dateB = b.clockInTime instanceof firebase.firestore.Timestamp ? 
                b.clockInTime.toDate() : new Date(b.clockInTime);
            return dateB - dateA;
        });
        
        // Einträge zum DOM hinzufügen
        currentEntries.forEach(entry => {
            const employee = employeeMap[entry.employeeId];
            const project = projectMap[entry.projectId];
            
            if (employee) {
                const row = document.createElement('tr');
                
                // Korrekte Konvertierung des Timestamps
                const startTime = entry.clockInTime instanceof firebase.firestore.Timestamp ? 
                    entry.clockInTime.toDate() : new Date(entry.clockInTime);
                
                // Zeitdifferenz berechnen
                const now = new Date();
                const diffMs = now - startTime;
                // Sicherstellen, dass wir keine negativen Stunden haben
                const hours = Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(2).replace('.', ',');
                
                // Standortdaten für die Anzeige formatieren
                let locationInfo = '-';
                if (entry.clockInLocation) {
                    // Prüfen, ob lat/lng oder latitude/longitude verwendet wird
                    const lat = entry.clockInLocation.lat !== undefined ? entry.clockInLocation.lat : entry.clockInLocation.latitude;
                    const lng = entry.clockInLocation.lng !== undefined ? entry.clockInLocation.lng : entry.clockInLocation.longitude;
                    
                    if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
                        locationInfo = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" title="Standort anzeigen">
                            <i class="fas fa-map-marker-alt"></i>
                        </a>`;
                    }
                }
                
                row.innerHTML = `
                    <td>${employee.name || 'Unbekannt'}</td>
                    <td>${project ? project.name : 'Unbekannt'}</td>
                    <td>${formatDateTime(startTime)}</td>
                    <td>${hours} h</td>
                    <td>${locationInfo}</td>
                    <td>
                        <button class="btn small-btn clock-out-btn" data-id="${entry.id}" title="Mitarbeiter ausstempeln">
                            <i class="fas fa-sign-out-alt"></i> Ausstempeln
                        </button>
                    </td>
                `;
                
                liveActivityTable.appendChild(row);
            }
        });
        
        // Event-Listener für die Ausstempel-Buttons hinzufügen
        document.querySelectorAll('.clock-out-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const entryId = this.dataset.id;
                showClockOutModal(entryId);
            });
        });
        
    } catch (error) {
        console.error('Fehler beim Laden der Live-Aktivitäten:', error);
        liveActivityTable.innerHTML = '<tr><td colspan="4" class="text-center">Fehler beim Laden der Daten</td></tr>';
    }
}

// Mitarbeiter-Tabelle laden
async function loadEmployeesTable() {
    // DOM-Element erneut abrufen
    const employeesTable = document.getElementById('employees-table')?.querySelector('tbody');
    if (!employeesTable) return;
    
    try {
        employeesTable.innerHTML = '';
        
        const employees = await DataService.getAllActiveEmployees();
        
        if (employees.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="5" class="text-center">Keine aktiven Mitarbeiter gefunden</td>';
            employeesTable.appendChild(row);
            return;
        }
        
        // Mitarbeiter nach Namen sortieren
        employees.sort((a, b) => a.name.localeCompare(b.name));
        
        employees.forEach(employee => {
            const row = document.createElement('tr');
            row.dataset.id = employee.id;
            
            // Formatiere den Stundensatz mit 2 Dezimalstellen und Euro-Zeichen
            const hourlyRateDisplay = employee.hourlyRate != null ? 
                `${parseFloat(employee.hourlyRate).toFixed(2)} €` : '-';
                
            row.innerHTML = `
                <td>${employee.name}</td>
                <td>${employee.position || '-'}</td>
                <td>${employee.username}</td>
                <td>${hourlyRateDisplay}</td>
                <td><span class="status-badge ${employee.status}">${employee.status === 'active' ? 'Aktiv' : 'Inaktiv'}</span></td>
                <td class="actions-container">
                    <button class="action-btn edit-btn edit-employee-btn" data-id="${employee.id}">
                        <i class="fas fa-edit"></i> Bearbeiten
                    </button>
                    <button class="action-btn delete-btn delete-employee-btn" data-id="${employee.id}">
                        <i class="fas fa-trash-alt"></i> Löschen
                    </button>
                </td>
            `;
            
            employeesTable.appendChild(row);
        });
        
        // Event-Listener für Bearbeiten- und Löschen-Buttons
        document.querySelectorAll('.edit-employee-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                showEmployeeForm(id);
            });
        });
        
        document.querySelectorAll('.delete-employee-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                deleteEmployee(id);
            });
        });
        
    } catch (error) {
        console.error('Fehler beim Laden der Mitarbeiter:', error);
        employeesTable.innerHTML = '<tr><td colspan="5" class="text-center">Fehler beim Laden der Daten</td></tr>';
    }
}

// Projekte-Tabelle laden
async function loadProjectsTable() {
    // DOM-Element erneut abrufen
    const projectsTable = document.getElementById('projects-table')?.querySelector('tbody');
    if (!projectsTable) return;
    
    try {
        projectsTable.innerHTML = '';
        
        const projects = await DataService.getAllProjects();
        
        if (projects.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="6" class="text-center">Keine Projekte gefunden</td>';
            projectsTable.appendChild(row);
            return;
        }
        
        // Projekte nach Namen sortieren
        projects.sort((a, b) => a.name.localeCompare(b.name));
        
        projects.forEach(project => {
            const row = document.createElement('tr');
            row.dataset.id = project.id;
            
            const startDate = project.startDate ? formatDate(project.startDate) : '-';
            const endDate = project.endDate ? formatDate(project.endDate) : '-';
            
            row.innerHTML = `
                <td>${project.name}</td>
                <td>${project.client || '-'}</td>
                <td>${startDate}</td>
                <td>${endDate}</td>
                <td><span class="status-badge ${project.status}">${project.status === 'active' ? 'Aktiv' : 'Abgeschlossen'}</span></td>
                <td class="actions-container">
                    <button class="action-btn edit-btn edit-project-btn" data-id="${project.id}">
                        <i class="fas fa-edit"></i> Bearbeiten
                    </button>
                    <button class="action-btn view-btn view-details-btn" data-id="${project.id}">
                        <i class="fas fa-eye"></i> Details
                    </button>
                    <button class="action-btn delete-btn delete-project-btn" data-id="${project.id}">
                        <i class="fas fa-trash-alt"></i> Löschen
                    </button>
                </td>
            `;
            
            projectsTable.appendChild(row);
        });
        
        // Event-Listener für Bearbeiten- und Löschen-Buttons nur für die neue Tabelle
        const editButtons = projectsTable.querySelectorAll('.edit-project-btn');
        console.log(`🔧 Füge Event-Listener für ${editButtons.length} Edit-Buttons hinzu`);
        
        editButtons.forEach((btn, index) => {
            const id = btn.dataset.id;
            console.log(`🔧 Button ${index}: ID = ${id}`);
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const id = this.dataset.id;
                console.log('🔧 Edit project clicked:', id, this);
                if (id) {
                    showProjectForm(id);
                } else {
                    console.error('Keine Projekt-ID gefunden');
                }
            });
        });
        
        projectsTable.querySelectorAll('.delete-project-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                deleteProject(id);
            });
        });
        
        // Event-Listener für Details-Button
        projectsTable.querySelectorAll('.view-details-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                showProjectDetails(id);
            });
        });
        
    } catch (error) {
        console.error('Fehler beim Laden der Projekte:', error);
        projectsTable.innerHTML = '<tr><td colspan="6" class="text-center">Fehler beim Laden der Daten</td></tr>';
    }
}

// Fahrzeug-Tabelle laden
async function loadVehiclesTable() {
    // DOM-Element erneut abrufen
    const vehiclesTable = document.getElementById('vehicles-table')?.querySelector('tbody');
    if (!vehiclesTable) return;
    
    try {
        vehiclesTable.innerHTML = '';
        
        const vehicles = await DataService.getAllVehicles();
        
        if (vehicles.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="6" class="text-center">Keine Fahrzeuge gefunden</td>';
            vehiclesTable.appendChild(row);
            return;
        }
        
        // Fahrzeuge nach Namen sortieren
        vehicles.sort((a, b) => a.name.localeCompare(b.name));
        
        vehicles.forEach(vehicle => {
            const row = document.createElement('tr');
            row.dataset.id = vehicle.id;
            
            // Formatiere den Stundensatz mit 2 Dezimalstellen und Euro-Zeichen
            const hourlyRateDisplay = vehicle.hourlyRate != null ? 
                `${parseFloat(vehicle.hourlyRate).toFixed(2)} €` : '-';
            
            const statusBadge = vehicle.isActive !== false 
                ? '<span class="status-badge active">Aktiv</span>' 
                : '<span class="status-badge inactive">Inaktiv</span>';
                
            row.innerHTML = `
                <td>${escapeHTML(vehicle.name)}</td>
                <td>${escapeHTML(vehicle.type)}</td>
                <td>${escapeHTML(vehicle.licensePlate || '-')}</td>
                <td>${hourlyRateDisplay}</td>
                <td>${statusBadge}</td>
                <td class="actions-container">
                    <button class="action-btn edit-btn edit-vehicle-btn" data-id="${vehicle.id}">
                        <i class="fas fa-edit"></i> Bearbeiten
                    </button>
                    <button class="action-btn delete-btn delete-vehicle-btn" data-id="${vehicle.id}">
                        <i class="fas fa-trash-alt"></i> Löschen
                    </button>
                </td>
            `;
            
            vehiclesTable.appendChild(row);
        });
        
        // Event-Listener für Bearbeiten- und Löschen-Buttons
        document.querySelectorAll('.edit-vehicle-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                showVehicleForm(id);
            });
        });
        
        document.querySelectorAll('.delete-vehicle-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                deleteVehicle(id);
            });
        });
        
    } catch (error) {
        console.error('Fehler beim Laden der Fahrzeuge:', error);
        vehiclesTable.innerHTML = '<tr><td colspan="6" class="text-center">Fehler beim Laden der Fahrzeuge. Bitte versuchen Sie es später erneut.</td></tr>';
    }
}

// Fahrzeug-Formular anzeigen (für Hinzufügen oder Bearbeiten)
function showVehicleForm(vehicleId = null) {
    const modal = document.getElementById('vehicle-form-modal');
    const form = document.getElementById('vehicle-form');
    const title = document.getElementById('vehicle-form-title');
    
    if (!modal || !form) return;
    
    // Formular zurücksetzen
    form.reset();
    
    if (vehicleId) {
        // Fahrzeug bearbeiten
        title.textContent = 'Fahrzeug bearbeiten';
        document.getElementById('vehicle-id').value = vehicleId;
        
        // Fahrzeugdaten laden und ins Formular einfüllen
        DataService.getVehicleById(vehicleId).then(vehicle => {
            if (vehicle) {
                document.getElementById('vehicle-name').value = vehicle.name || '';
                document.getElementById('vehicle-type').value = vehicle.type || '';
                document.getElementById('vehicle-license').value = vehicle.licensePlate || '';
                document.getElementById('vehicle-hourly-rate').value = vehicle.hourlyRate || '';
            }
        }).catch(error => {
            console.error('Fehler beim Laden des Fahrzeugs:', error);
            notify('Fehler beim Laden des Fahrzeugs', 'error');
        });
    } else {
        // Neues Fahrzeug hinzufügen
        title.textContent = 'Fahrzeug hinzufügen';
        document.getElementById('vehicle-id').value = '';
    }
    
    // Modal anzeigen
    showModal(modal);
}

// Fahrzeug löschen
async function deleteVehicle(vehicleId) {
    if (!confirm('Sind Sie sicher, dass Sie dieses Fahrzeug löschen möchten?')) {
        return;
    }
    
    try {
        await DataService.deleteVehicle(vehicleId);
        notify('Fahrzeug erfolgreich gelöscht!', 'success');
        loadVehiclesTable();
    } catch (error) {
        console.error('Fehler beim Löschen des Fahrzeugs:', error);
        notify('Fehler beim Löschen: ' + error.message, 'error');
    }
}

// Hilfsfunktion zum Escapen von HTML
function escapeHTML(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Modal anzeigen
function showModal(modal) {
    modal.style.display = 'block';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}

// Modal verbergen
function hideModal(modal) {
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

// Fahrzeug-Formular abschicken
async function handleVehicleFormSubmit(event) {
    event.preventDefault();
    
    try {
        const vehicleId = document.getElementById('vehicle-id').value.trim() || null;
        
        const vehicleData = {
            name: document.getElementById('vehicle-name').value.trim(),
            type: document.getElementById('vehicle-type').value.trim(),
            licensePlate: document.getElementById('vehicle-license').value.trim(),
            hourlyRate: parseFloat(document.getElementById('vehicle-hourly-rate').value) || 0
        };
        
        if (vehicleId) {
            // Fahrzeug aktualisieren
            await DataService.updateVehicle(vehicleId, vehicleData);
            notify('Fahrzeug erfolgreich aktualisiert!', 'success');
        } else {
            // Neues Fahrzeug hinzufügen
            await DataService.createVehicle(vehicleData);
            notify('Fahrzeug erfolgreich hinzugefügt!', 'success');
        }
        
        hideModal(document.getElementById('vehicle-form-modal'));
        loadVehiclesTable();
    } catch (error) {
        console.error('Fehler beim Speichern des Fahrzeugs:', error);
        notify('Fehler beim Speichern: ' + error.message, 'error');
    }
}

// Projektdetails anzeigen - Umleitung zur neuen Detailseite
async function showProjectDetails(projectId) {
    try {
        console.log('Navigiere zur Projektdetailseite für:', projectId);
        
        // Zur Projektdetailseite navigieren und Projekt-ID als Parameter mitgeben
        window.location.href = `project-simple.html?id=${projectId}`;
        
    } catch (error) {
        console.error('Fehler beim Navigieren zur Projektdetailseite:', error);
        alert('Es ist ein Fehler beim Öffnen der Projektdetails aufgetreten.');
    }
}

// Projektbilder laden
async function loadProjectImages(projectId, type = 'construction_site') {
    try {
        console.log(`Lade ${type}-Bilder für Projekt`, projectId);
        
        // Galerie-Container referenzieren
        const container = document.getElementById(type === 'construction_site' ? 'site-photos-gallery' : 'documents-gallery');
        if (!container) {
            console.error('Container für Galerie nicht gefunden');
            return;
        }
        
        // Container leeren
        container.innerHTML = '';
        
        // Bilder laden
        const files = await DataService.getProjectFiles(projectId, type);
        console.log(`${files.length} Dateien gefunden vom Typ ${type}`);
        
        // Wenn keine Bilder vorhanden sind
        if (files.length === 0) {
            container.innerHTML = `<div class="no-data-message">Keine ${type === 'construction_site' ? 'Baustellenfotos' : 'Dokumente'} vorhanden</div>`;
            return;
        }
        
        // Nach Datum sortieren (neueste zuerst)
        files.sort((a, b) => new Date(b.timestamp || b.uploadTime) - new Date(a.timestamp || a.uploadTime));
        
        // Mitarbeiternamen abrufen
        const employeePromises = files.map(file => 
            DataService.getEmployeeById(file.employeeId)
        );
        
        const employees = await Promise.all(employeePromises);
        
        // Bilder anzeigen
        files.forEach((file, index) => {
            const galleryItem = document.createElement('div');
            galleryItem.className = 'gallery-item';
            galleryItem.dataset.fileId = file.id;
            
            // Datum formatieren
            const date = new Date(file.timestamp || file.uploadTime);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            
            // Mitarbeiter zuordnen
            const employee = employees[index] || { name: 'Unbekannt' };
            
            // Kommentar zum Bild abrufen (falls vorhanden)
            const comment = file.comment || '';
            
            galleryItem.innerHTML = `
                <img src="${file.url}" alt="${type === 'construction_site' ? 'Baustellenfoto' : 'Dokument'}">
                <div class="gallery-item-info">
                    <div>${formattedDate}</div>
                    <div>${employee.name}</div>
                    ${comment ? `<div class="image-comment-display">${comment}</div>` : ''}
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

// Zeiteinträge für ein Projekt laden
async function loadProjectTimeEntries(projectId) {
    try {
        console.log('Lade Zeiteinträge für Projekt', projectId);
        
        // Tabelle referenzieren
        const timeEntriesTable = document.getElementById('time-entries-table')?.querySelector('tbody');
        if (!timeEntriesTable) {
            console.error('Zeiteinträge-Tabelle nicht gefunden');
            return;
        }
        
        // Event-Listener für Report-Buttons später hinzufügen
        const setupReportButtons = () => {
            const reportButtons = document.querySelectorAll('.report-btn');
            reportButtons.forEach(btn => {
                // Klone den Button, um alte Event-Listener zu entfernen
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                
                // Neuen Event-Listener hinzufügen mit verbesserter Datenzuordnung
                newBtn.addEventListener('click', function(event) {
                    // Standardaktion verhindern
                    event.preventDefault();
                    event.stopPropagation();
                    
                    // Daten aus dem Button-Dataset extrahieren
                    const entryId = this.dataset.entryId;
                    const projectId = this.dataset.projectId;
                    const employeeId = this.dataset.employeeId;
                    
                    console.log('Bericht-Button geklickt:', entryId, projectId, employeeId);
                    
                    // Stellen sicher, dass wir direkt die Funktion aus report-functions.js aufrufen
                    // und nicht eine möglicherweise überschriebene Version
                    if (typeof window.showTimeEntryReport === 'function') {
                        window.showTimeEntryReport(entryId, projectId, employeeId);
                    } else {
                        showTimeEntryReport(entryId, projectId, employeeId);
                    }
                });
            });
        };
        
        // Tabelle leeren
        timeEntriesTable.innerHTML = '';
        
        // Zeiteinträge laden
        const timeEntries = await DataService.getProjectTimeEntries(projectId);
        console.log(`${timeEntries.length} Zeiteinträge gefunden`);
        
        // Wenn keine Einträge vorhanden sind
        if (timeEntries.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="7" class="text-center">Keine Zeiteinträge vorhanden</td>';
            timeEntriesTable.appendChild(row);
            return;
        }
        
        // Nach Datum sortieren (neueste zuerst)
        timeEntries.sort((a, b) => new Date(b.clockInTime) - new Date(a.clockInTime));
        
        // Mitarbeiternamen abrufen
        const employeePromises = timeEntries.map(entry => 
            DataService.getEmployeeById(entry.employeeId)
        );
        
        const employees = await Promise.all(employeePromises);
        
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
            
            // Standortinformationen formatieren
            let locationInfo = '';
            if (entry.clockInLocation) {
                const coords = entry.clockInLocation.coords || entry.clockInLocation;
                if (coords && coords.latitude && coords.longitude) {
                    locationInfo = `<div class="location-info">
                        <i class="fas fa-map-marker-alt"></i> 
                        <a href="https://maps.google.com/?q=${coords.latitude},${coords.longitude}" target="_blank">
                            Standort anzeigen
                        </a>
                    </div>`;
                }
            }
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="employee-cell">${employee.name}</td>
                <td class="date-cell">${date}</td>
                <td class="time-cell">${clockInTime}</td>
                <td class="time-cell">${clockOutTime}</td>
                <td class="worktime-cell">
                    <div class="worktime-primary">${workHours}</div>
                    ${pauseDetails}
                </td>
                <td class="notes-cell">
                    <div class="note-text">${entry.notes || '-'}</div>
                    ${locationInfo}
                </td>
                <td class="actions-cell">
                    <div class="action-buttons">
                        ${hasImages ? `<button class="btn small-btn view-images-btn" data-entry-id="${entry.id}" data-project-id="${projectId}" title="Bilder anzeigen"><i class="fas fa-images"></i></button>` : ''}
                        <button class="btn small-btn edit-entry-btn" data-entry-id="${entry.id}" title="Bearbeiten"><i class="fas fa-edit"></i></button>
                    </div>
                </td>
            `;
        
            timeEntriesTable.appendChild(row);
        });
        
        // Debug-Ausgabe für Zeiteinträge
        console.log('Zeiteinträge geladen:', timeEntries.length);
        
    } catch (error) {
        console.error('Fehler beim Laden der Zeiteinträge:', error);
        const timeEntriesTable = document.getElementById('time-entries-table')?.querySelector('tbody');
        if (timeEntriesTable) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="7" class="text-center">Fehler beim Laden der Zeiteinträge</td>';
            timeEntriesTable.appendChild(row);
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

// Projektdetail-Modal erstellen, falls es nicht existiert
function createProjectDetailModal() {
    // Prüfen, ob Modal bereits existiert
    let modal = document.getElementById('project-detail-modal');
    if (modal) {
        return modal;
    }
    
    console.log('Erstelle Projektdetail-Modal');
    
    // Modal erstellen
    modal = document.createElement('div');
    modal.id = 'project-detail-modal';
    modal.className = 'modal';
    
    modal.innerHTML = `
        <div class="modal-content large-modal">
            <div class="modal-header">
                <h3 id="project-detail-title">Projektdetails</h3>
                <button type="button" class="close-modal-btn">&times;</button>
            </div>
            <div class="modal-body">
                <div class="project-info-container">
                    <h4>Projektinformationen</h4>
                    <div class="project-info-grid">
                        <div class="info-item">
                            <strong>Kunde:</strong>
                            <span id="detail-client"></span>
                        </div>
                        <div class="info-item">
                            <strong>Zeitraum:</strong>
                            <span id="detail-timeframe"></span>
                        </div>
                        <div class="info-item">
                            <strong>Status:</strong>
                            <span id="detail-status"></span>
                        </div>
                        <div class="info-item">
                            <strong>Standort:</strong>
                            <span id="detail-location"></span>
                        </div>
                    </div>
                    <div class="info-description">
                        <strong>Beschreibung:</strong>
                        <p id="detail-description"></p>
                    </div>
                </div>
                
                <div class="project-tabs">
                    <button class="project-tab-btn active" data-tab="construction-site">Baustellenfotos</button>
                    <button class="project-tab-btn" data-tab="documents">Lieferscheine & Rechnungen</button>
                    <button class="project-tab-btn" data-tab="timeentries">Zeiteinträge</button>
                </div>
                
                <div class="project-tab-content active" id="construction-site-tab">
                    <div class="filter-controls">
                        <input type="date" id="site-photos-date-filter" placeholder="Nach Datum filtern">
                        <select id="site-photos-employee-filter">
                            <option value="all">Alle Mitarbeiter</option>
                        </select>
                        <button id="clear-site-photos-filter" class="btn secondary-btn">Filter zurücksetzen</button>
                    </div>
                    <div class="gallery-container" id="site-photos-gallery">
                        <!-- Wird per JavaScript gefüllt -->
                    </div>
                </div>
                
                <div class="project-tab-content" id="documents-tab">
                    <div class="filter-controls">
                        <input type="date" id="docs-date-filter" placeholder="Nach Datum filtern">
                        <select id="docs-employee-filter">
                            <option value="all">Alle Mitarbeiter</option>
                        </select>
                        <button id="clear-docs-filter" class="btn secondary-btn">Filter zurücksetzen</button>
                    </div>
                    <div class="gallery-container" id="documents-gallery">
                        <!-- Wird per JavaScript gefüllt -->
                    </div>
                </div>
                
                <div class="project-tab-content" id="timeentries-tab">
                    <div class="filter-controls">
                        <input type="date" id="time-date-filter" placeholder="Nach Datum filtern">
                        <select id="time-employee-filter">
                            <option value="all">Alle Mitarbeiter</option>
                        </select>
                        <button id="clear-time-filter" class="btn secondary-btn">Filter zurücksetzen</button>
                    </div>
                    <div class="time-entries-table-container">
                        <table id="time-entries-table" class="data-table">
                            <thead>
                                <tr>
                                    <th>Mitarbeiter</th>
                                    <th>Datum</th>
                                    <th>Einstempelzeit</th>
                                    <th>Ausstempelzeit</th>
                                    <th>Arbeitsstunden</th>
                                    <th>Notizen</th>
                                    <th>Aktionen</th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- Wird per JavaScript gefüllt -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Modal zum Body hinzufügen
    document.body.appendChild(modal);
    
    // Event-Listener für Schließen-Button
    modal.querySelector('.close-modal-btn').addEventListener('click', function() {
        modal.classList.remove('visible');
    });
    
    // Tab-Navigation einrichten
    setupProjectTabNavigation(modal);
    
    return modal;
}

// Funktion zur Einrichtung der Tab-Navigation in der Projektdetailansicht
function setupProjectTabNavigation(modalElement) {
    const modal = modalElement || document.getElementById('project-detail-modal');
    if (!modal) {
        console.error('Projektdetail-Modal nicht gefunden');
        return;
    }
    
    console.log('Richte Tab-Navigation ein');
    
    const tabBtns = modal.querySelectorAll('.project-tab-btn');
    const tabContents = modal.querySelectorAll('.project-tab-content');
    
    console.log(`${tabBtns.length} Tab-Buttons gefunden, ${tabContents.length} Tab-Inhalte gefunden`);
    
    // Alle Event-Listener entfernen und neu hinzufügen (um Dopplung zu verhindern)
    tabBtns.forEach(btn => {
        // Alten Button durch Klon ersetzen, um alle bestehenden Event-Listener zu entfernen
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        // Neuen Event-Listener hinzufügen
        newBtn.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            console.log('Tab-Button geklickt:', tabName);
            
            // Aktive Klasse von allen Buttons entfernen
            tabBtns.forEach(b => b.classList.remove('active'));
            
            // Aktive Klasse zum geklickten Button hinzufügen
            this.classList.add('active');
            
            // Alle Tab-Inhalte ausblenden
            tabContents.forEach(content => {
                content.style.display = 'none';
                content.classList.remove('active');
            });
            
            // Tab-Inhalt entsprechend dem geklickten Button anzeigen
            const tabContent = document.getElementById(`${tabName}-tab`);
            if (tabContent) {
                tabContent.style.display = 'block';
                tabContent.classList.add('active');
                console.log(`Tab-Inhalt ${tabName}-tab aktiviert`);
            } else {
                console.error(`Tab-Inhalt ${tabName}-tab nicht gefunden`);
            }
        });
    });
    
    // Initial den ersten Tab aktivieren
    if (tabBtns.length > 0 && tabContents.length > 0) {
        // Zuerst alle Tab-Inhalte ausblenden
        tabContents.forEach(content => {
            content.style.display = 'none';
            content.classList.remove('active');
        });
        
        // Dann den ersten Tab aktivieren
        tabBtns[0].classList.add('active');
        const firstTabName = tabBtns[0].dataset.tab;
        const firstTabContent = document.getElementById(`${firstTabName}-tab`);
        if (firstTabContent) {
            firstTabContent.style.display = 'block';
            firstTabContent.classList.add('active');
        }
    }
    const clearSitePhotosFilterBtn = document.getElementById('clear-site-photos-filter');
    const clearDocsFilterBtn = document.getElementById('clear-docs-filter');
    const clearTimeFilterBtn = document.getElementById('clear-time-filter');
    
    const sitePhotosDateFilter = document.getElementById('site-photos-date-filter');
    const sitePhotosEmployeeFilter = document.getElementById('site-photos-employee-filter');
    const docsDateFilter = document.getElementById('docs-date-filter');
    const docsEmployeeFilter = document.getElementById('docs-employee-filter');
    const timeDateFilter = document.getElementById('time-date-filter');
    const timeEmployeeFilter = document.getElementById('time-employee-filter');
    
    // Filter-Event-Listener für Baustellenfotos
    if (sitePhotosDateFilter && sitePhotosEmployeeFilter && clearSitePhotosFilterBtn) {
        sitePhotosDateFilter.addEventListener('change', function() {
            const projectId = document.getElementById('project-detail-title').dataset.projectId;
            loadProjectImages(projectId, 'construction_site');
        });
        
        sitePhotosEmployeeFilter.addEventListener('change', function() {
            const projectId = document.getElementById('project-detail-title').dataset.projectId;
            loadProjectImages(projectId, 'construction_site');
        });
        
        clearSitePhotosFilterBtn.addEventListener('click', function() {
            sitePhotosDateFilter.value = '';
            sitePhotosEmployeeFilter.value = 'all';
            const projectId = document.getElementById('project-detail-title').dataset.projectId;
            loadProjectImages(projectId, 'construction_site');
        });
    }
    
    // Filter-Event-Listener für Dokumente
    if (docsDateFilter && docsEmployeeFilter && clearDocsFilterBtn) {
        docsDateFilter.addEventListener('change', function() {
            const projectId = document.getElementById('project-detail-title').dataset.projectId;
            loadProjectImages(projectId, 'document');
        });
        
        docsEmployeeFilter.addEventListener('change', function() {
            const projectId = document.getElementById('project-detail-title').dataset.projectId;
            loadProjectImages(projectId, 'document');
        });
        
        clearDocsFilterBtn.addEventListener('click', function() {
            docsDateFilter.value = '';
            docsEmployeeFilter.value = 'all';
            const projectId = document.getElementById('project-detail-title').dataset.projectId;
            loadProjectImages(projectId, 'document');
        });
    }
    
    // Filter-Event-Listener für Zeiteinträge
    if (timeDateFilter && timeEmployeeFilter && clearTimeFilterBtn) {
        timeDateFilter.addEventListener('change', function() {
            const projectId = document.getElementById('project-detail-title').dataset.projectId;
            loadProjectTimeEntries(projectId);
        });

        timeEmployeeFilter.addEventListener('change', function() {
            const projectId = document.getElementById('project-detail-title').dataset.projectId;
            loadProjectTimeEntries(projectId);
        });

        if (clearTimeFilterBtn) {
            clearTimeFilterBtn.addEventListener('click', function() {
                // Filter zurücksetzen
                document.getElementById('time-date-filter').value = '';
                document.getElementById('time-employee-filter').value = 'all';

                // Daten neu laden
                const projectId = document.getElementById('project-detail-title').dataset.projectId;
                loadProjectTimeEntries(projectId);
            });
        }
    }
}

// Formatierungsfunktion für Uhrzeit
function formatTime(date) {
    if (!date) return '-';
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// Detaillierten Bericht für einen Zeiteintrag anzeigen
async function showTimeEntryReport(entryId, projectId, employeeId) {
    try {
        console.log('Zeige Bericht für Zeiteintrag:', entryId);

        // Daten laden
        const timeEntry = await DataService.getTimeEntryById(entryId);
        const project = await DataService.getProjectById(projectId);
        const employee = await DataService.getEmployeeById(employeeId);

        if (!timeEntry) {
            console.error('Zeiteintrag nicht gefunden:', entryId);
            alert('Der Zeiteintrag konnte nicht gefunden werden.');
            return;
        }

        // Modal erstellen oder abrufen
        let reportModal = document.getElementById('time-entry-report-modal');
        if (!reportModal) {
            reportModal = document.createElement('div');
            reportModal.id = 'time-entry-report-modal';
            reportModal.className = 'modal';
            document.body.appendChild(reportModal);
        }

        // Zeitstempel korrekt formatieren
        const clockInTime = timeEntry.clockInTime instanceof firebase.firestore.Timestamp ?
            timeEntry.clockInTime.toDate() : new Date(timeEntry.clockInTime);

        let clockOutTime = null;
        if (timeEntry.clockOutTime) {
            clockOutTime = timeEntry.clockOutTime instanceof firebase.firestore.Timestamp ?
                timeEntry.clockOutTime.toDate() : new Date(timeEntry.clockOutTime);
        }

        // Datum und Zeit formatieren
        const date = formatDate(clockInTime);
        const timeIn = formatTime(clockInTime);
        const timeOut = clockOutTime ? formatTime(clockOutTime) : '-';

        // Arbeitszeit und Pausenzeit berechnen
        let workHoursDisplay = '-';
        let pauseDetailsHTML = '';
        let totalTimeDisplay = '-';

        if (clockOutTime) {
            // Gesamtzeit berechnen
            const totalTimeMs = clockOutTime - clockInTime;
            const totalHours = Math.floor(totalTimeMs / (1000 * 60 * 60));
            const totalMinutes = Math.floor((totalTimeMs % (1000 * 60 * 60)) / (1000 * 60));
            totalTimeDisplay = `${totalHours}h ${totalMinutes}min`;
            
            // Pausenzeit berücksichtigen
            const pauseTotalTime = timeEntry.pauseTotalTime || 0;
            const actualWorkTimeMs = totalTimeMs - pauseTotalTime;
            
            // Debug-Log für Zeitberechnungen
            console.log('📊 Zeitberechnung im Bericht:');
            console.log('  Einstempelzeit:', clockInTime);
            console.log('  Ausstempelzeit:', clockOutTime);
            console.log('  Gesamtzeit (ms):', totalTimeMs);
            console.log('  Pausenzeit (ms):', pauseTotalTime);
            console.log('  Pausenzeit (min):', Math.floor(pauseTotalTime / 60000));
            console.log('  Arbeitszeit (ms):', actualWorkTimeMs);
            console.log('  Breaks-Array:', timeEntry.breaks);
            
            // Arbeitszeit in Stunden und Minuten
            const workHours = Math.floor(actualWorkTimeMs / (1000 * 60 * 60));
            const workMinutes = Math.floor((actualWorkTimeMs % (1000 * 60 * 60)) / (1000 * 60));
            workHoursDisplay = `${workHours}h ${workMinutes}min`;

            // Moderne Pausendetails aufbereiten
            if (pauseTotalTime > 0) {
                const pauseMinutes = Math.floor(pauseTotalTime / 60000);
                const pauseHours = Math.floor(pauseMinutes / 60);
                const remainingMinutes = pauseMinutes % 60;

                pauseDetailsHTML = `
                    <div class="report-section">
                        <h4><i class="fas fa-pause-circle"></i> Pauseninformationen</h4>
                        <div class="pause-info-card">
                            <h5>Gesamtpausenzeit</h5>
                            <div class="pause-total">${pauseHours}h ${remainingMinutes}min</div>
                `;

                // Breaks-Array statt pauseDetails verwenden
                if (timeEntry.breaks && timeEntry.breaks.length > 0) {
                    pauseDetailsHTML += '<ul class="pause-list">';

                    for (const breakItem of timeEntry.breaks) {
                        try {
                            if (breakItem.start && breakItem.end) {
                                // Konvertierung der Zeitstempel
                                const startDate = breakItem.start instanceof firebase.firestore.Timestamp ?
                                    breakItem.start.toDate() : new Date(breakItem.start);
                                const endDate = breakItem.end instanceof firebase.firestore.Timestamp ?
                                    breakItem.end.toDate() : new Date(breakItem.end);

                                // Formatierung
                                const startTime = startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                const endTime = endDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                const pauseDuration = Math.floor((endDate - startDate) / 60000);

                                pauseDetailsHTML += `<li>${startTime} - ${endTime} (${pauseDuration} Min.)${breakItem.reason ? ' - ' + breakItem.reason : ''}</li>`;
                            } else if (breakItem.duration) {
                                // Für automatische Pausen ohne Start/End
                                const durationMinutes = Math.floor(breakItem.duration / (1000 * 60));
                                pauseDetailsHTML += `<li>Automatische Pause: ${durationMinutes} Min.${breakItem.reason ? ' - ' + breakItem.reason : ''}</li>`;
                            }
                        } catch (e) {
                            console.error('Fehler beim Verarbeiten der Pause:', e);
                        }
                    }

                    pauseDetailsHTML += '</ul>';
                }

                pauseDetailsHTML += '</div></div>';
            }
        }

        // Bilder laden
        const constructionSitePhotos = await DataService.getTimeEntryFiles(entryId, 'construction_site');
        const documentPhotos = await DataService.getTimeEntryFiles(entryId, 'delivery_note');

        // Baustellenfotos-HTML generieren mit modernem Design
        let constructionSitePhotosHTML = '';
        if (constructionSitePhotos && constructionSitePhotos.length > 0) {
            constructionSitePhotosHTML = `
                <div class="report-section">
                    <h4><i class="fas fa-camera"></i> Baustellenfotos (${constructionSitePhotos.length})</h4>
                    <div class="report-gallery">
            `;

            for (const photo of constructionSitePhotos) {
                const comment = photo.comment ? `<p class="photo-comment"><i class="fas fa-comment-dots"></i> ${photo.comment}</p>` : '';
                constructionSitePhotosHTML += `
                    <div class="report-gallery-item">
                        <img src="${photo.url}" alt="Baustellenfoto" class="report-image" data-url="${photo.url}" loading="lazy">
                        ${comment}
                    </div>
                `;
            }

            constructionSitePhotosHTML += '</div></div>';
        }

        // Lieferscheine/Rechnungen-HTML generieren mit modernem Design
        let documentPhotosHTML = '';
        if (documentPhotos && documentPhotos.length > 0) {
            documentPhotosHTML = `
                <div class="report-section">
                    <h4><i class="fas fa-file-invoice"></i> Lieferscheine & Rechnungen (${documentPhotos.length})</h4>
                    <div class="report-gallery">
            `;

            for (const doc of documentPhotos) {
                const comment = doc.comment ? `<p class="photo-comment"><i class="fas fa-comment-dots"></i> ${doc.comment}</p>` : '';
                documentPhotosHTML += `
                    <div class="report-gallery-item">
                        <img src="${doc.url}" alt="Dokument" class="report-image" data-url="${doc.url}" loading="lazy">
                        ${comment}
                    </div>
                `;
            }

            documentPhotosHTML += '</div></div>';
        }

        // Modal-Inhalt zusammenstellen mit modernem Design
        reportModal.innerHTML = `
            <div class="modal-content large-modal">
                <div class="modal-header">
                    <h3><i class="fas fa-clipboard-list"></i> Detaillierter Arbeitsbericht</h3>
                    <button type="button" class="close-modal-btn">&times;</button>
                </div>
                <div class="modal-body report-modal-body">
                    <div class="report-header">
                        <div class="report-info-grid">
                            <div class="report-info-item">
                                <strong><i class="fas fa-project-diagram"></i> Projekt</strong>
                                <span>${timeEntry.isVacationDay ? '🏖️ Urlaub' : (project ? project.name : 'Unbekanntes Projekt')}</span>
                            </div>
                            <div class="report-info-item">
                                <strong><i class="fas fa-user"></i> Mitarbeiter</strong>
                                <span>${employee ? employee.name : 'Unbekannt'}</span>
                            </div>
                            <div class="report-info-item">
                                <strong><i class="fas fa-calendar-day"></i> Datum</strong>
                                <span>${date}</span>
                            </div>
                            <div class="report-info-item">
                                <strong><i class="fas fa-sign-in-alt"></i> Eingestempelt</strong>
                                <span>${timeIn} Uhr</span>
                            </div>
                            <div class="report-info-item">
                                <strong><i class="fas fa-sign-out-alt"></i> Ausgestempelt</strong>
                                <span>${timeOut}${timeOut !== '-' ? ' Uhr' : ''}</span>
                            </div>
                            <div class="report-info-item">
                                <strong><i class="fas fa-clock"></i> Gesamtzeit</strong>
                                <span>${totalTimeDisplay}</span>
                            </div>
                        </div>
                        <div class="work-hours-highlight">
                            <i class="fas fa-business-time"></i> Arbeitszeit: ${workHoursDisplay}
                        </div>
                    </div>

                    ${pauseDetailsHTML}

                    <div class="report-section">
                        <h4><i class="fas fa-sticky-note"></i> Notizen</h4>
                        <p>${timeEntry.notes || '<em class="empty-state">Keine Notizen vorhanden</em>'}</p>
                    </div>

                    ${constructionSitePhotosHTML}
                    ${documentPhotosHTML}
                </div>
            </div>
        `;

        // Event-Listener für Schließen-Button
        reportModal.querySelector('.close-modal-btn').addEventListener('click', function() {
            reportModal.style.display = 'none';
        });

        // Event-Listener für Bildvergrößerung
        const reportImages = reportModal.querySelectorAll('.report-image');
        reportImages.forEach(img => {
            img.addEventListener('click', function() {
                const imageUrl = this.dataset.url;
                showFullScreenImage(imageUrl);
            });
        });

        // Modal anzeigen
        reportModal.style.display = 'block';

    } catch (error) {
        console.error('Fehler beim Anzeigen des Berichts:', error);
        alert('Beim Laden des Berichts ist ein Fehler aufgetreten.');
    }
}

// Hilfsfunktion für Vollbild-Anzeige eines Bildes
function showFullScreenImage(imageUrl) {
    let fullscreenModal = document.getElementById('fullscreen-image-modal');

    if (!fullscreenModal) {
        fullscreenModal = document.createElement('div');
        fullscreenModal.id = 'fullscreen-image-modal';
        fullscreenModal.className = 'modal fullscreen-modal';
        document.body.appendChild(fullscreenModal);
    }

    fullscreenModal.innerHTML = `
        <div class="fullscreen-image-container">
            <button type="button" class="close-fullscreen-btn">&times;</button>
            <img src="${imageUrl}" alt="Vollbild" class="fullscreen-image">
        </div>
    `;

    // Event-Listener für Schließen-Button
    fullscreenModal.querySelector('.close-fullscreen-btn').addEventListener('click', function() {
        fullscreenModal.style.display = 'none';
    });

    // Modal per Klick schließen
    fullscreenModal.addEventListener('click', function(event) {
        if (event.target === fullscreenModal) {
            fullscreenModal.style.display = 'none';
        }
    });

    // Modal anzeigen
    fullscreenModal.style.display = 'block';
}

// Schließen der Modals bei ESC-Taste
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        // Alle Modals schließen
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
        
        // Auch die Vollbildansicht schließen
        closeFullscreenImage();
    }
});

// Bericht zu einem Zeiteintrag anzeigen
async function showTimeEntryReport(timeEntryId, projectId, employeeId) {
    try {
        // Daten laden
        const timeEntry = await DataService.getTimeEntryById(timeEntryId);
        const project = await DataService.getProjectById(projectId);
        const employee = await DataService.getEmployeeById(employeeId);
        
        if (!timeEntry || !project || !employee) {
            alert('Daten konnten nicht geladen werden');
            return;
        }
        
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
        // Neue Elemente für Standorte
        const reportLocationIn = document.getElementById('report-location-in');
        const reportLocationOut = document.getElementById('report-location-out');
        
        if (reportDate && reportProject && reportEmployee && reportTimeIn && 
            reportTimeOut && reportWorkHours && reportNotes && reportPauseDetails &&
            reportLocationIn && reportLocationOut) {
            
            // Datum formatieren
            const clockInDate = new Date(timeEntry.clockInTime);
            const date = clockInDate.toLocaleDateString('de-DE');
            
            // Zeiten formatieren
            const clockInTime = formatTime(clockInDate);
            const clockOutTime = timeEntry.clockOutTime ? formatTime(new Date(timeEntry.clockOutTime)) : '-';
            
            // Arbeitsstunden berechnen mit Berücksichtigung der Pausenzeiten
            let workHours = '-';
            
            if (timeEntry.clockOutTime) {
                // Pausenzeit berücksichtigen (in Millisekunden)
                const pauseTotalTime = timeEntry.pauseTotalTime || 0;
                const totalTimeMs = new Date(timeEntry.clockOutTime) - new Date(timeEntry.clockInTime);
                const actualWorkTimeMs = totalTimeMs - pauseTotalTime;
                const hours = actualWorkTimeMs / (1000 * 60 * 60);
                workHours = hours.toFixed(2) + 'h';
                
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
            
            // Debug-Info für Standorte ausgeben
            console.log('Zeiteintrags-Bericht - Standortdaten:', {
                entryId: timeEntryId,
                clockInLocation: timeEntry.clockInLocation,
                clockOutLocation: timeEntry.clockOutLocation
            });

            // Standortinformationen vorbereiten
            let clockInLocationText = '-';
            let clockOutLocationText = '-';
            let clockInLocationHtml = null;
            let clockOutLocationHtml = null;
            
            // Einstempel-Standort formatieren, verschiedene Formate berücksichtigen
            if (timeEntry.clockInLocation) {
                const inLoc = timeEntry.clockInLocation;
                let inLat, inLng;
                
                // Erst versuchen, die Adresse zu verwenden, wenn vorhanden
                if (inLoc.address) {
                    clockInLocationText = inLoc.address;
                } 
                // Sonst nach Koordinaten in verschiedenen Formaten suchen
                else {
                    // Mögliche Formate prüfen
                    if (inLoc.coords && inLoc.coords.latitude && inLoc.coords.longitude) {
                        inLat = inLoc.coords.latitude;
                        inLng = inLoc.coords.longitude;
                    } else if (inLoc.latitude && inLoc.longitude) {
                        inLat = inLoc.latitude;
                        inLng = inLoc.longitude;
                    } else if (typeof inLoc === 'object') {
                        // Verfügbare Schlüssel protokollieren
                        const keys = Object.keys(inLoc);
                        console.log('Verfügbare clockInLocation Schlüssel:', keys);
                        
                        // Alternative Schlüsselbezeichnungen prüfen
                        for (const latKey of ['lat', 'latitude', 'Latitude']) {
                            for (const lngKey of ['lng', 'lon', 'long', 'longitude', 'Longitude']) {
                                if (inLoc[latKey] !== undefined && inLoc[lngKey] !== undefined) {
                                    inLat = inLoc[latKey];
                                    inLng = inLoc[lngKey];
                                    console.log(`Alternativer Standort gefunden mit Schlüsseln: ${latKey}, ${lngKey}`);
                                    break;
                                }
                            }
                            if (inLat) break;
                        }
                    }
                    
                    // Wenn Koordinaten gefunden wurden, formatieren
                    if (inLat && inLng) {
                        clockInLocationText = `Lat: ${inLat.toFixed(5)}, Long: ${inLng.toFixed(5)}`;
                        
                        // Google Maps Link
                        clockInLocationHtml = `
                            <span>${clockInLocationText}</span>
                            <a href="https://maps.google.com/?q=${inLat},${inLng}" target="_blank" class="location-link">
                                <i class="fas fa-map-marker-alt"></i> Karte öffnen
                            </a>
                        `;
                    } else {
                        console.warn('Einstempelort-Format nicht erkannt:', inLoc);
                        clockInLocationText = 'Format nicht erkannt';
                    }
                }
            }
            
            // Ausstempel-Standort formatieren, falls vorhanden
            if (timeEntry.clockOutLocation) {
                const outLoc = timeEntry.clockOutLocation;
                let outLat, outLng;
                
                // Erst versuchen, die Adresse zu verwenden, wenn vorhanden
                if (outLoc.address) {
                    clockOutLocationText = outLoc.address;
                } 
                // Sonst nach Koordinaten in verschiedenen Formaten suchen
                else {
                    // Mögliche Formate prüfen
                    if (outLoc.coords && outLoc.coords.latitude && outLoc.coords.longitude) {
                        outLat = outLoc.coords.latitude;
                        outLng = outLoc.coords.longitude;
                    } else if (outLoc.latitude && outLoc.longitude) {
                        outLat = outLoc.latitude;
                        outLng = outLoc.longitude;
                    } else if (typeof outLoc === 'object') {
                        // Verfügbare Schlüssel protokollieren
                        const keys = Object.keys(outLoc);
                        console.log('Verfügbare clockOutLocation Schlüssel:', keys);
                        
                        // Alternative Schlüsselbezeichnungen prüfen
                        for (const latKey of ['lat', 'latitude', 'Latitude']) {
                            for (const lngKey of ['lng', 'lon', 'long', 'longitude', 'Longitude']) {
                                if (outLoc[latKey] !== undefined && outLoc[lngKey] !== undefined) {
                                    outLat = outLoc[latKey];
                                    outLng = outLoc[lngKey];
                                    console.log(`Alternativer Standort gefunden mit Schlüsseln: ${latKey}, ${lngKey}`);
                                    break;
                                }
                            }
                            if (outLat) break;
                        }
                    }
                    
                    // Wenn Koordinaten gefunden wurden, formatieren
                    if (outLat && outLng) {
                        clockOutLocationText = `Lat: ${outLat.toFixed(5)}, Long: ${outLng.toFixed(5)}`;
                        
                        // Google Maps Link
                        clockOutLocationHtml = `
                            <span>${clockOutLocationText}</span>
                            <a href="https://maps.google.com/?q=${outLat},${outLng}" target="_blank" class="location-link">
                                <i class="fas fa-map-marker-alt"></i> Karte öffnen
                            </a>
                        `;
                    } else {
                        console.warn('Ausstempelort-Format nicht erkannt:', outLoc);
                        clockOutLocationText = 'Format nicht erkannt';
                    }
                }
            } else if (!timeEntry.clockOutTime) {
                clockOutLocationText = 'Noch nicht ausgestempelt';
            }
            
            // Standortinformationen in das Modal schreiben
            reportLocationIn.innerHTML = clockInLocationHtml || clockInLocationText;
            reportLocationOut.innerHTML = clockOutLocationHtml || clockOutLocationText;
            
            // Pausendetails anzeigen, falls vorhanden
            if (timeEntry.pauseDetails && timeEntry.pauseDetails.length > 0) {
                let pauseDetailsHtml = '<ul class="pause-list">';
                
                for (const pause of timeEntry.pauseDetails) {
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
            
            const sitePhotos = await DataService.getTimeEntryFiles(timeEntryId, 'construction_site');
            
            if (sitePhotos.length > 0) {
                let galleryHtml = '';
                
                sitePhotos.forEach(photo => {
                    galleryHtml += `
                    <div class="report-gallery-item">
                        <img src="${photo.url}" alt="Baustellenfoto" class="report-gallery-image" data-fullscreen="true">
                        ${photo.comment ? `<p class="photo-comment">${photo.comment}</p>` : ''}
                    </div>`;
                });
                
                sitePhotosGallery.innerHTML = galleryHtml;
                
                // Direkte Event-Listener für die Bilder hinzufügen
                sitePhotosGallery.querySelectorAll('.report-gallery-image').forEach(img => {
                    img.addEventListener('click', function() {
                        console.log('Bild geklickt:', this.src);
                        openFullscreenImage(this.src);
                    });
                });
            } else {
                sitePhotosGallery.innerHTML = '<p>Keine Baustellenfotos vorhanden</p>';
            }
        }
        
        // Lieferscheine laden und anzeigen
        const deliveryNotesGallery = document.getElementById('report-delivery-notes');
        if (deliveryNotesGallery) {
            deliveryNotesGallery.innerHTML = '<p>Lieferscheine werden geladen...</p>';
            
            const deliveryNotes = await DataService.getTimeEntryFiles(timeEntryId, 'delivery_note');
            
            if (deliveryNotes.length > 0) {
                let galleryHtml = '';
                
                deliveryNotes.forEach(doc => {
                    galleryHtml += `
                    <div class="report-gallery-item">
                        <img src="${doc.url}" alt="Lieferschein" class="report-gallery-image" data-fullscreen="true">
                        ${doc.comment ? `<p class="photo-comment">${doc.comment}</p>` : ''}
                    </div>`;
                });
                
                deliveryNotesGallery.innerHTML = galleryHtml;
                
                // Direkte Event-Listener für die Bilder hinzufügen
                deliveryNotesGallery.querySelectorAll('.report-gallery-image').forEach(img => {
                    img.addEventListener('click', function() {
                        console.log('Lieferschein geklickt:', this.src);
                        openFullscreenImage(this.src);
                    });
                });
            } else {
                deliveryNotesGallery.innerHTML = '<p>Keine Lieferscheine vorhanden</p>';
            }
        }
        
        // Modal anzeigen
        modal.style.display = 'block';
        
    } catch (error) {
        console.error('Fehler beim Anzeigen des Berichts:', error);
        alert('Fehler beim Anzeigen des Berichts');
    }
}

// Report-Modal erstellen
function createReportModal() {
    // Prüfen, ob Modal bereits existiert
    let modal = document.getElementById('time-entry-report-modal');
    if (modal) {
        return modal;
    }
    
    // Modal erstellen
    modal = document.createElement('div');
    modal.id = 'time-entry-report-modal';
    modal.className = 'modal';
    
    modal.innerHTML = `
        <div class="modal-content large-modal">
            <div class="modal-header">
                <h3 id="report-modal-title">Zeiterfassungsbericht</h3>
                <button type="button" class="close-modal-btn">&times;</button>
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
                        <div class="report-info-item">
                            <strong>Einstempel-Standort:</strong>
                            <span id="report-location-in"></span>
                        </div>
                        <div class="report-info-item">
                            <strong>Ausstempel-Standort:</strong>
                            <span id="report-location-out"></span>
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
    return modal;
}

function openFullscreenImage(imageUrl) {
    const modal = createFullscreenModal();
    const image = modal.querySelector('.fullscreen-image');
    image.src = imageUrl;
    modal.style.display = 'flex';
}

function closeFullscreenImage() {
    const modal = document.getElementById('fullscreen-image-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Berichtsfilter laden
async function loadReportFilters() {
    // DOM-Element erneut abrufen
    const reportFilterSelect = document.getElementById('report-filter');
    if (!reportFilterSelect) return;
    
    try {
        // Berichtsfilter zurücksetzen
        reportFilterSelect.innerHTML = '<option value="all">Alle</option>';
        
        // Berichtstyp-abhängige Filter laden
        const reportType = document.getElementById('report-type');
        if (reportType) {
            const selectedType = reportType.value;
            
            if (selectedType === 'employee') {
                // Mitarbeiter laden
                const employees = await DataService.getAllActiveEmployees();
                
                employees.sort((a, b) => a.name.localeCompare(b.name));
                
                employees.forEach(employee => {
                    const option = document.createElement('option');
                    option.value = employee.id;
                    option.textContent = employee.name;
                    reportFilterSelect.appendChild(option);
                });
            } else if (selectedType === 'project') {
                // Projekte laden
                const projects = await DataService.getAllProjects();
                
                projects.sort((a, b) => a.name.localeCompare(b.name));
                
                projects.forEach(project => {
                    const option = document.createElement('option');
                    option.value = project.id;
                    option.textContent = project.name;
                    reportFilterSelect.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Fehler beim Laden der Berichtsfilter:', error);
    }
}

// Tab-Wechsel-Handler
async function handleTabChange(tabName) {
    // Alle Tabs und Inhalte deaktivieren
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Ausgewählten Tab und Inhalt aktivieren
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`)?.classList.add('active');
    document.getElementById(`${tabName}-tab`)?.classList.add('active');
    
    // Bei Tab-Wechsel Daten aktualisieren
    try {
        if (tabName === 'employees') {
            await loadEmployeesTable();
        } else if (tabName === 'projects') {
            await loadProjectsTable();
        } else if (tabName === 'vehicles') {
            await loadVehiclesTable();
        } else if (tabName === 'reports') {
            await loadReportFilters();
            // Zeiteinträge-Übersicht laden
            await showTimeEntriesDetails();
        }
    } catch (error) {
        console.error(`Fehler beim Laden der Daten für Tab '${tabName}':`, error);
    }
}

// Hilfsfunktion: Datum formatieren
function formatDate(date) {
    if (!date) return '-';
    
    // Firebase kann Timestamps oder Strings zurückgeben
    let d;
    if (typeof date === 'object' && date.toDate && typeof date.toDate === 'function') {
        // Firebase Timestamp
        d = date.toDate();
    } else if (date instanceof Date) {
        // Bereits ein Date-Objekt
        d = date;
    } else {
        // String oder anderes Format
        d = new Date(date);
    }
    
    return d.toLocaleDateString('de-DE');
}

// Hilfsfunktion: Datum und Uhrzeit formatieren
function formatDateTime(date) {
    if (!date) return '-';
    
    // Firebase kann Timestamps oder Strings zurückgeben
    let d;
    if (typeof date === 'object' && date.toDate && typeof date.toDate === 'function') {
        // Firebase Timestamp
        d = date.toDate();
    } else if (date instanceof Date) {
        // Bereits ein Date-Objekt
        d = date;
    } else {
        // String oder anderes Format
        d = new Date(date);
    }
    
    return `${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit'})}`;
}

// Hilfsfunktion: Stunden formatieren
function formatHours(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

// Mitarbeiter-Formular anzeigen (für Hinzufügen oder Bearbeiten)
function showEmployeeForm(employeeId = null) {
    const modal = document.getElementById('employee-form-modal');
    const form = document.getElementById('employee-form');
    const title = document.getElementById('employee-form-title');
    
    if (!modal || !form) return;
    
    // Formular zurücksetzen
    form.reset();
    
    if (employeeId) {
        // Mitarbeiter bearbeiten
        title.textContent = 'Mitarbeiter bearbeiten';
        document.getElementById('employee-id').value = employeeId;
        
        // Mitarbeiterdaten laden und ins Formular einfüllen
        DataService.getEmployeeById(employeeId).then(employee => {
            if (employee) {
                document.getElementById('employee-name').value = employee.name || '';
                document.getElementById('employee-username').value = employee.username || '';
                document.getElementById('employee-password').value = employee.password || '';
                document.getElementById('employee-position').value = employee.position || '';
                document.getElementById('employee-hourly-rate').value = employee.hourlyRate || '';
                document.getElementById('employee-status').value = employee.status || 'active';
            }
        }).catch(error => {
            console.error('Fehler beim Laden des Mitarbeiters:', error);
        });
    } else {
        // Neuen Mitarbeiter hinzufügen
        title.textContent = 'Neuen Mitarbeiter hinzufügen';
        document.getElementById('employee-id').value = '';
    }
    
    // Modal anzeigen
    modal.classList.add('visible');
}

// Mitarbeiter-Formular absenden
async function handleEmployeeFormSubmit(event) {
    event.preventDefault();
    
    // Formular und ID-Feld direkt abrufen
    const form = document.getElementById('employee-form');
    const employeeIdField = document.getElementById('employee-id');
    const employeeId = employeeIdField ? employeeIdField.value.trim() : '';
    
    console.log('Verarbeite Mitarbeiterformular mit ID:', employeeId);
    
    // Daten aus dem Formular sammeln
    const hourlyRateField = document.getElementById('employee-hourly-rate');
    const hourlyRateValue = hourlyRateField ? hourlyRateField.value.trim() : '';
    
    const employeeData = {
        name: document.getElementById('employee-name').value.trim(),
        username: document.getElementById('employee-username').value.trim(),
        password: document.getElementById('employee-password').value,
        position: document.getElementById('employee-position').value.trim(),
        hourlyRate: hourlyRateValue !== '' ? parseFloat(hourlyRateValue) : null,
        status: document.getElementById('employee-status').value
    };
    
    console.log('Gesammelte Mitarbeiterdaten:', employeeData);
    
    try {
        if (employeeId && employeeId !== '') {
            console.log('Aktualisiere vorhandenen Mitarbeiter mit ID:', employeeId);
            // Mitarbeiter aktualisieren
            await DataService.updateEmployee(employeeId, employeeData);
            alert('Mitarbeiter erfolgreich aktualisiert!');
        } else {
            console.log('Erstelle neuen Mitarbeiter');
            // Neuen Mitarbeiter erstellen
            await DataService.createEmployee(employeeData);
            alert('Mitarbeiter erfolgreich hinzugefügt!');
        }
        
        // Modal schließen und Tabelle aktualisieren
        document.getElementById('employee-form-modal').classList.remove('visible');
        loadEmployeesTable();
    } catch (error) {
        console.error(`Fehler beim ${employeeId ? 'Aktualisieren' : 'Erstellen'} des Mitarbeiters mit ID ${employeeId}:`, error);
        alert('Fehler beim Speichern: ' + error.message);
    }
}

// Mitarbeiter löschen
async function deleteEmployee(employeeId) {
    if (!confirm('Sind Sie sicher, dass Sie diesen Mitarbeiter löschen möchten?')) {
        return;
    }
    
    try {
        await DataService.deleteEmployee(employeeId);
        alert('Mitarbeiter erfolgreich gelöscht!');
        loadEmployeesTable();
    } catch (error) {
        console.error('Fehler beim Löschen des Mitarbeiters:', error);
        alert('Fehler beim Löschen: ' + error.message);
    }
}

// Projekt-Formular anzeigen (für Hinzufügen oder Bearbeiten)
function showProjectForm(projectId = null) {
    const modal = document.getElementById('project-form-modal');
    const form = document.getElementById('project-form');
    const title = document.getElementById('project-form-title');
    
    if (!modal || !form) {
        console.error('Modal oder Form nicht gefunden');
        return;
    }
    
    // Modal vorbereiten
    modal.classList.remove('visible');
    
    // Formular zurücksetzen
    form.reset();
    
    if (projectId) {
        // Projekt bearbeiten
        title.textContent = 'Projekt bearbeiten';
        document.getElementById('project-id').value = projectId;
        
        // Projektdaten laden und ins Formular einfüllen
        DataService.getProjectById(projectId).then(project => {
            if (project) {
                console.log('Projekt gefunden:', project);
                console.log('StartDate:', project.startDate, 'Type:', typeof project.startDate);
                console.log('EndDate:', project.endDate, 'Type:', typeof project.endDate);
                
                document.getElementById('project-name').value = project.name || '';
                document.getElementById('project-client').value = project.client || '';
                document.getElementById('project-description').value = project.description || '';
                document.getElementById('project-status').value = project.status || 'active';
                
                if (project.startDate) {
                    console.log('Formatiere StartDate:', project.startDate);
                    const startDate = formatDateForInput(project.startDate);
                    console.log('Formatiertes StartDate:', startDate);
                    document.getElementById('project-start-date').value = startDate;
                }
                
                if (project.endDate) {
                    console.log('Formatiere EndDate:', project.endDate);
                    const endDate = formatDateForInput(project.endDate);
                    console.log('Formatiertes EndDate:', endDate);
                    document.getElementById('project-end-date').value = endDate;
                }
                
                // Standortdaten einfügen (mit Fehlerbehandlung)
                const addressField = document.getElementById('project-address');
                const latField = document.getElementById('project-latitude');
                const lngField = document.getElementById('project-longitude');
                
                if (addressField) addressField.value = project.address || '';
                if (latField) latField.value = project.latitude || '';
                if (lngField) lngField.value = project.longitude || '';
                
                // Wenn Koordinaten vorhanden sind, Karte initialisieren
                if (project.latitude && project.longitude) {
                    setTimeout(() => {
                        if (typeof initializeMap === 'function') {
                            initializeMap('project-map', project.latitude, project.longitude);
                        }
                    }, 500);
                }
            } else {
                console.error('Projekt nicht gefunden:', projectId);
                notify('Projekt nicht gefunden', 'error');
            }
        }).catch(error => {
            console.error('Fehler beim Laden des Projekts:', error);
            notify('Fehler beim Laden des Projekts: ' + error.message, 'error');
            
            // Modal trotzdem anzeigen, aber mit leeren Feldern
            console.log('Zeige Modal trotz Fehler mit leeren Feldern');
        });
    } else {
        // Neues Projekt hinzufügen
        title.textContent = 'Neues Projekt hinzufügen';
        document.getElementById('project-id').value = '';
    }
    
    // Modal anzeigen
        console.log('🔧 Zeige Projekt-Modal für Projekt-ID:', projectId);
    modal.classList.add('visible');
    
    // Zusätzliche Überprüfung
    setTimeout(() => {
        if (modal.classList.contains('visible')) {
            console.log('✅ Modal ist sichtbar');
        } else {
            console.error('❌ Modal ist nicht sichtbar');
        }
    }, 100);
}

// Projekt-Formular absenden
async function handleProjectFormSubmit(event) {
    event.preventDefault();
    
    // Formular und ID-Feld direkt abrufen
    const form = document.getElementById('project-form');
    const projectIdField = document.getElementById('project-id');
    const projectId = projectIdField ? projectIdField.value.trim() : '';
    
    console.log('Verarbeite Projektformular mit ID:', projectId);
    
    // Daten aus dem Formular sammeln
    const projectData = {
        name: document.getElementById('project-name').value.trim(),
        client: document.getElementById('project-client').value.trim(),
        startDate: document.getElementById('project-start-date').value,
        endDate: document.getElementById('project-end-date').value,
        description: document.getElementById('project-description').value.trim(),
        status: document.getElementById('project-status').value,
        address: document.getElementById('project-address').value.trim(),
        latitude: document.getElementById('project-latitude').value || null,
        longitude: document.getElementById('project-longitude').value || null
    };
    
    console.log('Gesammelte Projektdaten:', projectData);
    
    try {
        if (projectId && projectId !== '') {
            console.log('Aktualisiere vorhandenes Projekt mit ID:', projectId);
            // Projekt aktualisieren
            await DataService.updateProject(projectId, projectData);
            alert('Projekt erfolgreich aktualisiert!');
        } else {
            console.log('Erstelle neues Projekt');
            // Neues Projekt erstellen
            await DataService.createProject(projectData);
            alert('Projekt erfolgreich hinzugefügt!');
        }
        
        // Modal schließen und Tabelle aktualisieren
        document.getElementById('project-form-modal').classList.remove('visible');
        loadProjectsTable();
    } catch (error) {
        console.error(`Fehler beim ${projectId ? 'Aktualisieren' : 'Erstellen'} des Projekts mit ID ${projectId}:`, error);
        alert('Fehler beim Speichern: ' + error.message);
    }
}

// Projekt löschen
async function deleteProject(projectId) {
    if (!confirm('Sind Sie sicher, dass Sie dieses Projekt löschen möchten?')) {
        return;
    }
    
    try {
        await DataService.deleteProject(projectId);
        alert('Projekt erfolgreich gelöscht!');
        loadProjectsTable();
    } catch (error) {
        console.error('Fehler beim Löschen des Projekts:', error);
        alert('Fehler beim Löschen: ' + error.message);
    }
}

// Hilfsfunktion: Datum für Input-Feld formatieren (YYYY-MM-DD)
function formatDateForInput(date) {
    if (!date) {
        console.warn('formatDateForInput: Kein Datum übergeben');
        return '';
    }
    
    let d;
    try {
        if (typeof date === 'object' && date.toDate && typeof date.toDate === 'function') {
            // Firebase Timestamp mit toDate() Methode
            d = date.toDate();
        } else if (typeof date === 'object' && date.seconds !== undefined) {
            // Firebase Timestamp Objekt {seconds: ..., nanoseconds: ...}
            d = new Date(date.seconds * 1000);
            console.log('Firebase Timestamp konvertiert:', date, '→', d);
        } else if (date instanceof Date) {
            // JavaScript Date Objekt
            d = date;
        } else if (typeof date === 'string' || typeof date === 'number') {
            // String oder Timestamp
            d = new Date(date);
        } else {
            console.error('formatDateForInput: Unbekannter Datumstyp:', typeof date, date);
            return '';
        }
        
        // Überprüfen ob das Datum gültig ist
        if (isNaN(d.getTime())) {
            console.error('formatDateForInput: Ungültiges Datum:', date);
            return '';
        }
        
        return d.toISOString().split('T')[0];
    } catch (error) {
        console.error('formatDateForInput: Fehler beim Formatieren des Datums:', error, date);
        return '';
    }
}

// Funktion zum Anzeigen der detaillierten Zeiteinträge mit Standortinformationen
async function showTimeEntriesDetails() {
    // Neue Tab-Funktion für detaillierte Zeiteinträge
    const tabContent = document.getElementById('reports-tab');
    if (!tabContent) return;
    
    // Erstelle Container für die Zeiteinträge-Übersicht
    let timeEntriesSection = document.getElementById('time-entries-details');
    
    if (!timeEntriesSection) {
        timeEntriesSection = document.createElement('div');
        timeEntriesSection.id = 'time-entries-details';
        timeEntriesSection.className = 'report-section';
        
        const heading = document.createElement('h3');
        heading.textContent = 'Detaillierte Zeiteinträge';
        timeEntriesSection.appendChild(heading);
        
        // Filter für Zeiteinträge
        const filterContainer = document.createElement('div');
        filterContainer.className = 'filter-container';
        
        const employeeFilter = document.createElement('select');
        employeeFilter.id = 'time-entries-employee-filter';
        employeeFilter.innerHTML = '<option value="all">Alle Mitarbeiter</option>';
        
        const dateRangeContainer = document.createElement('div');
        dateRangeContainer.className = 'date-range-container';
        dateRangeContainer.innerHTML = `
            <label for="time-entries-start-date">Von:</label>
            <input type="date" id="time-entries-start-date">
            <label for="time-entries-end-date">Bis:</label>
            <input type="date" id="time-entries-end-date">
        `;
        
        const filterButton = document.createElement('button');
        filterButton.className = 'btn primary-btn';
        filterButton.textContent = 'Filtern';
        filterButton.onclick = loadTimeEntriesDetails;
        
        filterContainer.appendChild(employeeFilter);
        filterContainer.appendChild(dateRangeContainer);
        filterContainer.appendChild(filterButton);
        
        timeEntriesSection.appendChild(filterContainer);
        
        // Tabelle für Zeiteinträge
        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';
        tableContainer.innerHTML = `
            <table id="time-entries-table" class="data-table">
                <thead>
                    <tr>
                        <th>Mitarbeiter</th>
                        <th>Projekt</th>
                        <th>Einstempelzeit</th>
                        <th>Ausstempelzeit</th>
                        <th>Dauer</th>
                        <th>Einstempelort</th>
                        <th>Ausstempelort</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `;
        
        timeEntriesSection.appendChild(tableContainer);
        tabContent.appendChild(timeEntriesSection);
        
        // Mitarbeiter für Filter laden
        try {
            const employees = await DataService.getAllActiveEmployees();
            employees.sort((a, b) => a.name.localeCompare(b.name));
            
            employees.forEach(employee => {
                const option = document.createElement('option');
                option.value = employee.id;
                option.textContent = employee.name;
                employeeFilter.appendChild(option);
            });
        } catch (error) {
            console.error('Fehler beim Laden der Mitarbeiter für Filter:', error);
        }
        
        // Standarddaten laden
        loadTimeEntriesDetails();
    }
}

// Funktion zum Laden der detaillierten Zeiteinträge
async function loadTimeEntriesDetails() {
    const table = document.getElementById('time-entries-table')?.querySelector('tbody');
    if (!table) return;
    
    table.innerHTML = '<tr><td colspan="7" class="text-center">Lade Daten...</td></tr>';
    
    try {
        // Filter-Werte abrufen
        const employeeFilter = document.getElementById('time-entries-employee-filter')?.value || 'all';
        const startDateInput = document.getElementById('time-entries-start-date')?.value;
        const endDateInput = document.getElementById('time-entries-end-date')?.value;
        
        // Datum setzen (standardmäßig letzte 7 Tage)
        let startDate = startDateInput ? new Date(startDateInput) : new Date();
        let endDate = endDateInput ? new Date(endDateInput) : new Date();
        
        if (!startDateInput) {
            startDate.setDate(startDate.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
        }
        
        if (!endDateInput) {
            endDate.setHours(23, 59, 59, 999);
        }
        
        // Daten für die Datumsfelder setzen
        if (!startDateInput) {
            document.getElementById('time-entries-start-date').value = formatDateForInput(startDate);
        }
        
        if (!endDateInput) {
            document.getElementById('time-entries-end-date').value = formatDateForInput(endDate);
        }
        
        // Zeiteinträge abfragen
        let query = db.collection('timeEntries')
            .where('clockInTime', '>=', firebase.firestore.Timestamp.fromDate(startDate))
            .where('clockInTime', '<=', firebase.firestore.Timestamp.fromDate(endDate));

        if (employeeFilter !== 'all') {
            query = query.where('employeeId', '==', employeeFilter);
        }

        const snapshot = await query.get();
        const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Wenn keine Einträge gefunden wurden
        if (entries.length === 0) {
            table.innerHTML = '<tr><td colspan="7" class="text-center">Keine Zeiteinträge gefunden</td></tr>';
            return;
        }

        // Zusätzliche Daten laden
        const employees = await DataService.getAllActiveEmployees();
        const projects = await DataService.getAllProjects();

        // Maps für schnellen Zugriff erstellen
        const employeeMap = {};
        employees.forEach(emp => employeeMap[emp.id] = emp);

        const projectMap = {};
        projects.forEach(proj => projectMap[proj.id] = proj);

        // Tabelle leeren
        table.innerHTML = '';

        // Einträge nach Datum sortieren (neueste zuerst)
        entries.sort((a, b) => {
            const dateA = a.clockInTime && a.clockInTime.toDate ? a.clockInTime.toDate() : new Date(a.clockInTime);
            const dateB = b.clockInTime && b.clockInTime.toDate ? b.clockInTime.toDate() : new Date(b.clockInTime);
            return dateB - dateA;
        });

        // Einträge in Tabelle anzeigen
        entries.forEach(entry => {
            const employee = employeeMap[entry.employeeId] || { name: 'Unbekannt' };
            const project = projectMap[entry.projectId] || { name: 'Unbekannt' };

            const row = document.createElement('tr');

            // Datumswerte konvertieren
            const clockInTime = entry.clockInTime && entry.clockInTime.toDate ? entry.clockInTime.toDate() : new Date(entry.clockInTime);
            let clockOutTime = entry.clockOutTime ? (entry.clockOutTime.toDate ? entry.clockOutTime.toDate() : new Date(entry.clockOutTime)) : null;

            // Dauer berechnen
            let duration = '-';
            if (clockOutTime) {
                const durationHours = (clockOutTime - clockInTime) / (1000 * 60 * 60);
                duration = durationHours.toFixed(2) + ' h';
            }

            // Standortlinks erstellen
            let clockInLocation = '-';
            if (entry.clockInLocation) {
                // Prüfen, ob lat/lng oder latitude/longitude verwendet wird
                const lat = entry.clockInLocation.lat !== undefined ? entry.clockInLocation.lat : entry.clockInLocation.latitude;
                const lng = entry.clockInLocation.lng !== undefined ? entry.clockInLocation.lng : entry.clockInLocation.longitude;

                if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
                    clockInLocation = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" title="Standort anzeigen">
                        <i class="fas fa-map-marker-alt"></i> Anzeigen
                    </a>`;
                }
            }

            let clockOutLocation = '-';
            if (entry.clockOutLocation) {
                // Prüfen, ob lat/lng oder latitude/longitude verwendet wird
                const lat = entry.clockOutLocation.lat !== undefined ? entry.clockOutLocation.lat : entry.clockOutLocation.latitude;
                const lng = entry.clockOutLocation.lng !== undefined ? entry.clockOutLocation.lng : entry.clockOutLocation.longitude;

                if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
                    clockOutLocation = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" title="Standort anzeigen">
                        <i class="fas fa-map-marker-alt"></i> Anzeigen
                    </a>`;
                }
            }

            row.innerHTML = `
                <td>${employee.name}</td>
                <td>${project.name}</td>
                <td>${formatDateTime(clockInTime)}</td>
                <td>${clockOutTime ? formatDateTime(clockOutTime) : '-'}</td>
                <td>${duration}</td>
                <td>${clockInLocation}</td>
                <td>${clockOutLocation}</td>
            `;

            table.appendChild(row);
        });

    } catch (error) {
        console.error('Fehler beim Laden der detaillierten Zeiteinträge:', error);
        table.innerHTML = '<tr><td colspan="7" class="text-center">Fehler beim Laden der Daten</td></tr>';
    }
}

// Zeiteinträge für ein Projekt laden
async function loadProjectTimeEntries(projectId) {
    const table = document.getElementById('time-entries-table')?.querySelector('tbody');

    if (!table) {
        console.error('Zeiteintrags-Tabelle nicht gefunden');
        return;
    }

    try {
        console.log('Lade Zeiteinträge für Projekt:', projectId);

        // Zeiteinträge für das Projekt laden
        const entries = await DataService.getProjectTimeEntries(projectId);
        const employees = await DataService.getAllActiveEmployees();
        const projects = await DataService.getAllProjects();

        // Maps für schnellen Zugriff erstellen
        const employeeMap = {};
        employees.forEach(emp => employeeMap[emp.id] = emp);

        const projectMap = {};
        projects.forEach(proj => projectMap[proj.id] = proj);

        // Tabelle leeren
        table.innerHTML = '';

        // Einträge nach Datum sortieren (neueste zuerst)
        entries.sort((a, b) => {
            const dateA = a.clockInTime && a.clockInTime.toDate ? a.clockInTime.toDate() : new Date(a.clockInTime);
            const dateB = b.clockInTime && b.clockInTime.toDate ? b.clockInTime.toDate() : new Date(b.clockInTime);
            return dateB - dateA;
        });

        // Einträge in Tabelle anzeigen
        entries.forEach(entry => {
            const employee = employeeMap[entry.employeeId] || { name: 'Unbekannt' };

            const row = document.createElement('tr');

            // Datumswerte konvertieren
            const clockInTime = entry.clockInTime && entry.clockInTime.toDate ? entry.clockInTime.toDate() : new Date(entry.clockInTime);
            let clockOutTime = entry.clockOutTime ? (entry.clockOutTime.toDate ? entry.clockOutTime.toDate() : new Date(entry.clockOutTime)) : null;

            // Dauer berechnen
            let duration = '-';
            if (clockOutTime) {
                const durationHours = (clockOutTime - clockInTime) / (1000 * 60 * 60);
                duration = durationHours.toFixed(2) + ' h';
            }

            // Standortlinks erstellen
            let clockInLocation = '-';
            if (entry.clockInLocation) {
                // Prüfen, ob lat/lng oder latitude/longitude verwendet wird
                const lat = entry.clockInLocation.lat !== undefined ? entry.clockInLocation.lat : entry.clockInLocation.latitude;
                const lng = entry.clockInLocation.lng !== undefined ? entry.clockInLocation.lng : entry.clockInLocation.longitude;

                if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
                    clockInLocation = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" title="Standort anzeigen">
                        <i class="fas fa-map-marker-alt"></i> Anzeigen
                    </a>`;
                }
            }

            let clockOutLocation = '-';
            if (entry.clockOutLocation) {
                // Prüfen, ob lat/lng oder latitude/longitude verwendet wird
                const lat = entry.clockOutLocation.lat !== undefined ? entry.clockOutLocation.lat : entry.clockOutLocation.latitude;
                const lng = entry.clockOutLocation.lng !== undefined ? entry.clockOutLocation.lng : entry.clockOutLocation.longitude;

                if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
                    clockOutLocation = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" title="Standort anzeigen">
                        <i class="fas fa-map-marker-alt"></i> Anzeigen
                    </a>`;
                }
            }

            // Notizen formatieren
            const notes = entry.notes || '-';

            // Datum formatieren
            const date = formatDate(clockInTime);

            row.innerHTML = `
                <td>${employee.name}</td>
                <td>${date}</td>
                <td>${formatTime(clockInTime)}</td>
                <td>${clockOutTime ? formatTime(clockOutTime) : '-'}</td>
                <td>${duration}</td>
                <td>${clockInLocation}</td>
                <td>${clockOutLocation}</td>
                <td>${notes}</td>
            `;

            table.appendChild(row);
        });

    } catch (error) {
        console.error('Fehler beim Laden der detaillierten Zeiteinträge:', error);
        table.innerHTML = '<tr><td colspan="8" class="text-center">Fehler beim Laden der Daten</td></tr>';
    }
}

