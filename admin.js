/**
 * JavaScript für den Admin-Bereich der Lauffer Zeiterfassung App
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
const adminLoginSection = document.getElementById('admin-login-section');
const adminDashboard = document.getElementById('admin-dashboard');
const adminLoginForm = document.getElementById('admin-login-form');
const adminUsernameInput = document.getElementById('admin-username');
const adminPasswordInput = document.getElementById('admin-password');
const adminNameSpan = document.getElementById('admin-name');
const adminLogoutBtn = document.getElementById('admin-logout-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Dashboard-Elemente
const activeEmployeesCount = document.getElementById('active-employees-count');
const activeProjectsCount = document.getElementById('active-projects-count');
const todayHours = document.getElementById('today-hours');
const liveActivityTable = document.getElementById('live-activity-table').querySelector('tbody');

// Mitarbeiter-Tab-Elemente
const employeesTable = document.getElementById('employees-table').querySelector('tbody');
const addEmployeeBtn = document.getElementById('add-employee-btn');
const employeeFormModal = document.getElementById('employee-form-modal');
const employeeForm = document.getElementById('employee-form');
const employeeFormTitle = document.getElementById('employee-form-title');
const employeeIdInput = document.getElementById('employee-id');
const employeeNameInput = document.getElementById('employee-name');
const employeeUsernameInput = document.getElementById('employee-username');
const employeePasswordInput = document.getElementById('employee-password');
const employeePositionInput = document.getElementById('employee-position');
const employeeStatusInput = document.getElementById('employee-status');

// Projekt-Tab-Elemente
const projectsTable = document.getElementById('projects-table').querySelector('tbody');
const addProjectBtn = document.getElementById('add-project-btn');
const projectFormModal = document.getElementById('project-form-modal');
const projectForm = document.getElementById('project-form');
const projectFormTitle = document.getElementById('project-form-title');
const projectIdInput = document.getElementById('project-id');
const projectNameInput = document.getElementById('project-name');
const projectClientInput = document.getElementById('project-client');
const projectStartDateInput = document.getElementById('project-start-date');
const projectEndDateInput = document.getElementById('project-end-date');
const projectDescriptionInput = document.getElementById('project-description');
const projectStatusInput = document.getElementById('project-status');

// Berichte-Tab-Elemente
const reportTypeSelect = document.getElementById('report-type');
const reportFilter = document.getElementById('report-filter');

// Projektdetail-Modal-Elemente
const projectDetailModal = document.getElementById('project-detail-modal');
const projectDetailTitle = document.getElementById('project-detail-title');
const detailClient = document.getElementById('detail-client');
const detailTimeframe = document.getElementById('detail-timeframe');
const detailStatus = document.getElementById('detail-status');
const detailLocation = document.getElementById('detail-location');
const detailDescription = document.getElementById('detail-description');
const projectTabButtons = document.querySelectorAll('.project-tab-btn');
const projectTabContents = document.querySelectorAll('.project-tab-content');

// Galerie-Elemente
const sitePhotosGallery = document.getElementById('site-photos-gallery');
const documentsGallery = document.getElementById('documents-gallery');
const timeEntriesTable = document.getElementById('time-entries-table').querySelector('tbody');
const imagePreviewModal = document.getElementById('image-preview-modal');
const previewImage = document.getElementById('preview-image');
const previewDate = document.getElementById('preview-date');
const previewEmployee = document.getElementById('preview-employee');
const previewNotes = document.getElementById('preview-notes');

// Filter-Elemente
const sitePhotosDateFilter = document.getElementById('site-photos-date-filter');
const sitePhotosEmployeeFilter = document.getElementById('site-photos-employee-filter');
const docsDateFilter = document.getElementById('docs-date-filter');
const docsEmployeeFilter = document.getElementById('docs-employee-filter');
const timeDateFilter = document.getElementById('time-date-filter');
const timeEmployeeFilter = document.getElementById('time-employee-filter');
const clearSitePhotosFilterBtn = document.getElementById('clear-site-photos-filter');
const clearDocsFilterBtn = document.getElementById('clear-docs-filter');
const clearTimeFilterBtn = document.getElementById('clear-time-filter');
const reportStartDateInput = document.getElementById('report-start-date');
const reportEndDateInput = document.getElementById('report-end-date');
const generateReportButton = document.getElementById('generate-report-btn');
const exportReportButton = document.getElementById('export-report-btn');
const reportTable = document.getElementById('report-table');

// Globale Variablen - stattdessen verwenden wir eine globale POJO-Variable, um Scope-Probleme zu vermeiden
window.adminApp = {
    currentAdmin: null,
    dashboardRefreshInterval: null,
    projectMap: null,
    projectMarker: null,
    geocoder: null
};

// Hilfsfunktionen für den Zugriff auf die globalen Variablen
function getCurrentAdmin() {
    return window.adminApp.currentAdmin;
}

function setCurrentAdmin(admin) {
    window.adminApp.currentAdmin = admin;
    console.log('Admin in der globalen Admin-App-Variable gespeichert:', admin);
}

function getDashboardRefreshInterval() {
    return window.adminApp.dashboardRefreshInterval;
}

function setDashboardRefreshInterval(interval) {
    window.adminApp.dashboardRefreshInterval = interval;
}

// Admin-App initialisieren
function initAdminApp() {
    console.log('Admin-App wird initialisiert - vereinfachte Version');
    
    // Direktes Event-Listener-Setup ohne asynchrone Operationen
    document.getElementById('admin-login-form').addEventListener('submit', function(event) {
        event.preventDefault();
        
        const username = document.getElementById('admin-username').value.trim();
        const password = document.getElementById('admin-password').value;
        
        console.log('Admin-Login-Versuch mit:', username);
        
        // Einfache direkte Prüfung
        if (username === 'admin' && password === 'admin123') {
            console.log('Admin-Login erfolgreich!');
            
            // Admin speichern
            const admin = { username: username, name: 'Administrator' };
            localStorage.setItem('lauffer_current_admin', JSON.stringify(admin));
            
            // Dashboard anzeigen
            document.getElementById('admin-login-section').classList.add('hidden');
            document.getElementById('admin-dashboard').classList.remove('hidden');
            document.getElementById('admin-name').textContent = 'Administrator';
            
            // Daten laden
            loadDashboardData();
            loadEmployeesTable();
            loadProjectsTable();
        } else {
            alert('Ungültige Zugangsdaten! Bitte verwenden Sie admin/admin123');
        }
    });
    
    // Logout-Button
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', function() {
            localStorage.removeItem('lauffer_current_admin');
            document.getElementById('admin-dashboard').classList.add('hidden');
            document.getElementById('admin-login-section').classList.remove('hidden');
        });
    }
    
    // Prüfen, ob bereits ein Admin angemeldet ist
    try {
        const savedAdmin = localStorage.getItem('lauffer_current_admin');
        if (savedAdmin) {
            const admin = JSON.parse(savedAdmin);
            document.getElementById('admin-login-section').classList.add('hidden');
            document.getElementById('admin-dashboard').classList.remove('hidden');
            document.getElementById('admin-name').textContent = admin.name || 'Administrator';
            
            // Daten laden
            loadDashboardData();
            loadEmployeesTable();
            loadProjectsTable();
        }
    } catch (error) {
        console.error('Fehler beim Laden des gespeicherten Admins:', error);
    }
    
    // Tab-Wechsel
    if (tabButtons) {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.getAttribute('data-tab');
                switchTab(tabName);
            });
        });
    }
    
    // Hinzufügen-Buttons für Mitarbeiter und Projekte
    if (addEmployeeBtn) {
        addEmployeeBtn.addEventListener('click', () => {
            hideAllModals();
            showAddEmployeeForm();
        });
    }
    
    if (addProjectBtn) {
        addProjectBtn.addEventListener('click', () => {
            hideAllModals();
            showAddProjectForm();
        });
    }
    
    // Formular-Submits für Mitarbeiter und Projekte
    if (employeeForm) {
        employeeForm.addEventListener('submit', handleEmployeeFormSubmit);
    }
    
    if (projectForm) {
        projectForm.addEventListener('submit', handleProjectFormSubmit);
    }
    
    // Ein- und Ausstempel-Formular-Submits
    const clockInEmpForm = document.getElementById('clock-in-employee-form');
    if (clockInEmpForm) {
        clockInEmpForm.addEventListener('submit', handleClockInEmployeeForm);
    }
    
    const clockOutEmployeeForm = document.getElementById('clock-out-employee-form');
    if (clockOutEmployeeForm) {
        clockOutEmployeeForm.addEventListener('submit', handleClockOutEmployeeForm);
    }
    
    // Modal-Schließen-Buttons
    document.querySelectorAll('.close-modal, .cancel-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.classList.remove('visible');
            } else {
                hideAllModals();
            }
        });
    });
    
    // Berichtsfilter initialisieren
    if (reportTypeSelect) {
        reportTypeSelect.addEventListener('change', loadReportFilters);
    }
    
    // Bericht erstellen
    if (generateReportButton) {
        generateReportButton.addEventListener('click', generateReport);
    }
    
    if (exportReportButton) {
        exportReportButton.addEventListener('click', exportReportToCsv);
    }
    
    // Standarddatum für Berichtsfilter setzen
    if (reportStartDateInput && reportEndDateInput) {
        const today = new Date().toISOString().split('T')[0];
        reportStartDateInput.value = today;
        reportEndDateInput.value = today;
    }
}

// Admin-App initialisieren
async function initAdminApp() {
    try {
        // Sicherstellen, dass alle Modals zu Beginn versteckt sind
        hideAllModals();
        
        // Prüfen, ob ein Admin angemeldet ist
        const currentAdmin = DataService.getCurrentAdmin();
        
        if (currentAdmin) {
            await showAdminDashboard();
            await loadDashboardData();
        } else {
            showAdminLogin();
        }
    } catch (error) {
        console.error('Fehler bei der Initialisierung der Admin-App:', error);
        alert('Fehler beim Laden der Admin-App. Bitte versuchen Sie es später erneut.');
    }
}

// Hilfsfunktion zum Verstecken aller Modals
function hideAllModals() {
    employeeFormModal.classList.remove('visible');
    projectFormModal.classList.remove('visible');
}

// Ansichten umschalten
function showAdminLogin() {
    adminLoginSection.classList.remove('hidden');
    adminDashboard.classList.add('hidden');
    adminLoginForm.reset();
    
    // Dashboard-Intervall stoppen
    const currentInterval = getDashboardRefreshInterval();
    if (currentInterval) {
        clearInterval(currentInterval);
        setDashboardRefreshInterval(null);
    }
}

async function showAdminDashboard() {
    adminLoginSection.classList.add('hidden');
    adminDashboard.classList.remove('hidden');
    
    const admin = getCurrentAdmin();
    if (admin && admin.username) {
        adminNameSpan.textContent = admin.username;
    } else {
        adminNameSpan.textContent = 'Administrator';
    }
    
    // Dashboard-Daten laden
    await loadEmployeesTable();
    await loadProjectsTable();
    await loadReportFilters();
    
    // Dashboard-Daten regelmäßig aktualisieren
    const currentInterval = getDashboardRefreshInterval();
    if (currentInterval) {
        clearInterval(currentInterval);
    }
    
    const newInterval = setInterval(() => loadDashboardData(), 30000); // Alle 30 Sekunden
    setDashboardRefreshInterval(newInterval);
}

// Tab-Wechsel
async function switchTab(tabName) {
    // Alle offenen Modals schließen
    employeeFormModal.classList.add('hidden');
    projectFormModal.classList.add('hidden');
    
    tabButtons.forEach(button => {
        if (button.getAttribute('data-tab') === tabName) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
    
    tabContents.forEach(content => {
        if (content.id === tabName + '-tab') {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    // Bei Tab-Wechsel Daten aktualisieren
    try {
        if (tabName === 'employees') {
            await loadEmployeesTable();
        } else if (tabName === 'projects') {
            await loadProjectsTable();
        } else if (tabName === 'reports') {
            await loadReportFilters();
        }
    } catch (error) {
        console.error(`Fehler beim Laden der Daten für Tab '${tabName}':`, error);
    }
}

// Admin-Anmeldung
async function handleAdminLogin(event) {
    event.preventDefault();
    
    try {
        const username = adminUsernameInput.value.trim();
        const password = adminPasswordInput.value;
        
        console.log('Versuche Admin-Login mit:', username);
        
        // Admin-Authentifizierung prüfen (für Demo-Zwecke)
        if (username === 'admin' && password === 'admin123') {
            try {
                // Persistenz auf LOCAL setzen, damit die Session nach Neuladen erhalten bleibt
                await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
                console.log('Firebase Auth Persistenz auf LOCAL gesetzt');
                
                // Prüfen, ob ein Benutzer angemeldet ist
                const currentUser = firebase.auth().currentUser;
                
                // Nur abmelden, wenn ein anonymer Benutzer angemeldet ist
                if (currentUser && currentUser.isAnonymous) {
                    console.log('Abmelden des anonymen Benutzers...');
                    await firebase.auth().signOut();
                }
                
                // Mit E-Mail und Passwort anmelden (für Admin-Authentifizierung)
                let adminUser = null;
                try {
                    console.log('Versuche Admin-Login mit Firebase Auth...');
                    const userCredential = await firebase.auth().signInWithEmailAndPassword('admin@lauffer-zeiterfassung.de', password);
                    adminUser = userCredential.user;
                    console.log('Firebase Auth erfolgreich für Admin');
                } catch (authError) {
                    if (authError.code === 'auth/user-not-found') {
                        console.log('Admin existiert noch nicht, wird einmalig erstellt');
                        // Falls der Benutzer nicht existiert, erstellen wir ihn (nur einmalig!)
                        try {
                            const userCredential = await firebase.auth().createUserWithEmailAndPassword('admin@lauffer-zeiterfassung.de', password);
                            adminUser = userCredential.user;
                            console.log('Admin-Benutzer in Firebase erstellt:', adminUser.uid);
                        } catch (createError) {
                            console.error('Konnte Admin-Benutzer nicht erstellen:', createError);
                            alert('Fehler bei der Admin-Benutzeranmeldung: ' + createError.message);
                            return; // Beende die Funktion, wenn die Authentifizierung fehlschlägt
                        }
                    } else {
                        console.error('Authentifizierung fehlgeschlagen:', authError);
                        alert('Authentifizierung fehlgeschlagen: ' + authError.message);
                        return;
                    }
                }
                
                // Admin-Metadaten für die App
                const admin = { 
                    username: username, 
                    name: 'Administrator',
                    uid: adminUser ? adminUser.uid : null,
                    email: adminUser ? adminUser.email : 'admin@lauffer-zeiterfassung.de',
                    isAdmin: true
                };
                
                // Admin in globaler Variable und im lokalen Speicher speichern
                setCurrentAdmin(admin);
                DataService.setCurrentAdmin(admin);
                
                // Aktueller Firebase-Nutzer nach dem Login
                const finalUser = firebase.auth().currentUser;
                
                if (finalUser && !finalUser.isAnonymous) {
                    console.log('Admin erfolgreich angemeldet. UID:', finalUser.uid);
                    
                    // Prüfen, ob der Admin bereits in der employees-Collection existiert
                    try {
                        const db = firebase.firestore();
                        const employeeRef = db.collection('employees').doc(finalUser.uid);
                        const employeeDoc = await employeeRef.get();
                        
                        if (!employeeDoc.exists) {
                            console.log('Admin-Eintrag in employees existiert nicht, wird erstellt.');
                            // Nur erstellen, wenn der Eintrag noch nicht existiert
                            await employeeRef.set({
                                name: 'Administrator',
                                username: 'admin',
                                isAdmin: true,
                                email: finalUser.email || 'admin@lauffer-zeiterfassung.de'
                            });
                            console.log('Admin-Eintrag in employees-Collection erstellt.');
                        } else {
                            console.log('Admin-Eintrag existiert bereits in employees-Collection.');
                            // Optional: Sicherstellen, dass das isAdmin-Flag gesetzt ist
                            if (!employeeDoc.data().isAdmin) {
                                await employeeRef.update({ isAdmin: true });
                                console.log('Admin-Flag in vorhandenem Eintrag gesetzt.');
                            }
                        }
                    } catch (dbError) {
                        console.error('Fehler bei der Überprüfung/Erstellung des Admin-Eintrags:', dbError);
                        // Trotz DB-Fehler fortfahren, damit die Anmeldung funktioniert
                    }
                    
                    // Hauptansicht anzeigen ohne Seite neu zu laden
                    console.log('Admin-Dashboard wird angezeigt...');
                    showAdminDashboard();
                    loadDashboardData();
                } else {
                    console.error('Kein gültiger Firebase-Benutzer nach dem Login!');
                    alert('Fehler: Kein gültiger Firebase-Benutzer nach der Anmeldung!');
                }
            } catch (firebaseError) {
                console.error('Firebase Auth Fehler:', firebaseError);
                alert('Fehler bei der Firebase-Authentifizierung: ' + firebaseError.message);
            }
        } else {
            console.error('Ungültige Admin-Zugangsdaten!', username);
            alert('Ungültige Admin-Zugangsdaten! Bitte nutzen Sie admin/admin123');
        }
    } catch (error) {
        console.error('Fehler bei der Admin-Anmeldung:', error);
        alert('Fehler bei der Anmeldung: ' + (error.message || 'Unbekannter Fehler'));
    }
}

// Admin-Abmeldung
function handleAdminLogout() {
    // Admin aus dem lokalen Speicher entfernen
    DataService.clearCurrentAdmin();

    // Admin aus der globalen Variable entfernen
    setCurrentAdmin(null);

    // Dashboard-Intervall stoppen
    const currentInterval = getDashboardRefreshInterval();
    if (currentInterval) {
        clearInterval(currentInterval);
        setDashboardRefreshInterval(null);
    }

    // Login-Ansicht anzeigen
    showAdminLogin();
}

// Dashboard-Daten laden
async function loadDashboardData() {
    try {
        // Eingestempelte Mitarbeiter zählen
        const currentTimeEntries = await DataService.getCurrentTimeEntries();
        // Eindeutige employeeId's zählen (falls ein Mitarbeiter mehrfach eingestempelt ist)
        const uniqueClockedInEmployees = new Set(currentTimeEntries.map(entry => entry.employeeId));
        activeEmployeesCount.textContent = uniqueClockedInEmployees.size;
        
        // Aktive Projekte zählen
        const projects = await DataService.getProjects();
        const activeProjects = projects.filter(project => project.status === 'active');
        activeProjectsCount.textContent = activeProjects.length;
        
        // Heutige Arbeitsstunden berechnen
        const todaysEntries = await DataService.getTodaysTimeEntries();
        const totalHours = DataService.calculateTotalWorkHours(todaysEntries);
        todayHours.textContent = totalHours.toFixed(2) + 'h';
    } catch (error) {
        console.error('Fehler beim Laden der Dashboard-Daten:', error);
        activeEmployeesCount.textContent = '0';
        activeProjectsCount.textContent = '0';
        todayHours.textContent = '0.00h';
    }
    
    // Live-Aktivitäten anzeigen
    loadLiveActivity();
}

// Live-Aktivitäten laden
async function loadLiveActivity() {
    try {
        // Sicherstellen, dass die Tabelle existiert
        const liveActivityTable = document.getElementById('live-activity-table');
        if (!liveActivityTable) {
            console.error('Live-Aktivitäten-Tabelle nicht gefunden');
            return;
        }
        
        const activeEmployees = await DataService.getCurrentlyActiveEmployees();
        const inactiveEmployees = await DataService.getInactiveEmployees();
        
        // Tabelle leeren
        liveActivityTable.innerHTML = '';
        
        // Prüfen, ob Mitarbeiter vorhanden sind
        if (activeEmployees.length === 0 && inactiveEmployees.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="5" class="text-center">Keine Mitarbeiter vorhanden</td>';
            liveActivityTable.appendChild(row);
            return;
        }
        
        // Aktive Mitarbeiter anzeigen
        activeEmployees.forEach(data => {
            const employee = data.employee;
            const project = data.project;
            // Sicherer Zugriff auf clockInTime
            const clockInTime = new Date(data.clockInTime);
            
            const row = document.createElement('tr');
            row.classList.add('active-employee');
            
            const formattedTime = formatTime(clockInTime);
            const duration = calculateDuration(clockInTime, new Date());
            
            row.innerHTML = `
                <td>${employee.name}</td>
                <td>${project.name}</td>
                <td>${formattedTime}</td>
                <td>${duration}</td>
                <td>
                    <span class="status active">Aktiv</span>
                    <button class="action-btn clock-out-btn" data-id="${employee.id}"><i class="fas fa-sign-out-alt"></i> Ausstempeln</button>
                </td>
            `;
            
            liveActivityTable.appendChild(row);
        });
        
        // Inaktive Mitarbeiter anzeigen
        if (inactiveEmployees.length > 0) {
            const divider = document.createElement('tr');
            divider.innerHTML = '<td colspan="5" class="divider">Nicht aktive Mitarbeiter</td>';
            liveActivityTable.appendChild(divider);
            
            inactiveEmployees.forEach(employee => {
                const row = document.createElement('tr');
                row.classList.add('inactive-employee');
                
                row.innerHTML = `
                    <td>${employee.name}</td>
                    <td colspan="3">Nicht eingestempelt</td>
                    <td>
                        <button class="action-btn clock-in-btn" data-id="${employee.id}"><i class="fas fa-sign-in-alt"></i> Einstempeln</button>
                    </td>
                `;
                
                liveActivityTable.appendChild(row);
            });
        }
        
        // Event-Listener für Aktions-Buttons
        liveActivityTable.querySelectorAll('.clock-out-btn').forEach(button => {
            button.addEventListener('click', () => {
                const id = button.getAttribute('data-id');
                showClockOutModal(id);
            });
        });
        
        liveActivityTable.querySelectorAll('.clock-in-btn').forEach(button => {
            button.addEventListener('click', () => {
                const id = button.getAttribute('data-id');
                showClockInModal(id);
            });
        });
    } catch (error) {
        console.error('Fehler beim Laden der Live-Aktivitäten:', error);
        const liveActivityTable = document.getElementById('live-activity-table');
        if (liveActivityTable) {
            liveActivityTable.innerHTML = '<tr><td colspan="5" class="text-center">Fehler beim Laden der Aktivitäten. Bitte versuchen Sie es später erneut.</td></tr>';
        }
    }
}

// Modal zum Einstempeln eines Mitarbeiters anzeigen
async function showClockInModal(employeeId) {
    try {
        // Mitarbeiter-Daten laden
        const employee = await DataService.getEmployeeById(employeeId);
        if (!employee) {
            alert('Mitarbeiter nicht gefunden');
            return;
        }
        
        // Modal-Felder füllen
        document.getElementById('clock-in-employee-id').value = employee.id;
        document.getElementById('clock-in-employee-name').value = employee.name;
        
        // Projekt-Dropdown füllen
        const clockInProject = document.getElementById('clock-in-project');
        clockInProject.innerHTML = '<option value="">Projekt auswählen</option>';
        
        const projects = await DataService.getActiveProjects();
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            clockInProject.appendChild(option);
        });
        
        // Google Maps Karte initialisieren
        setTimeout(() => {
            initClockInMap();
        }, 300);
        
        // Modal anzeigen
        document.getElementById('clock-in-employee-modal').classList.add('visible');
    } catch (error) {
        console.error('Fehler beim Anzeigen des Einstempel-Modals:', error);
        alert('Fehler beim Laden der Mitarbeiterdaten. Bitte versuchen Sie es später erneut.');
    }
}

// Modal zum Ausstempeln eines Mitarbeiters anzeigen
async function showClockOutModal(employeeId) {
    try {
        // Aktiven Zeiteintrag des Mitarbeiters laden
        const activeEmployees = await DataService.getCurrentlyActiveEmployees();
        const activeEntry = activeEmployees.find(entry => entry.employee.id === employeeId);
        
        if (!activeEntry) {
            alert('Kein aktiver Zeiteintrag für diesen Mitarbeiter gefunden');
            return;
        }
        
        // Modal-Felder füllen
        document.getElementById('clock-out-employee-id').value = activeEntry.employee.id;
        document.getElementById('clock-out-employee-name').value = activeEntry.employee.name;
        document.getElementById('clock-out-project').value = activeEntry.project.name;
        
        // Google Maps Karte initialisieren
        setTimeout(() => {
            initClockOutMap();
        }, 300);
        
        // Modal anzeigen
        document.getElementById('clock-out-employee-modal').classList.add('visible');
    } catch (error) {
        console.error('Fehler beim Anzeigen des Ausstempel-Modals:', error);
        alert('Fehler beim Laden der Mitarbeiterdaten. Bitte versuchen Sie es später erneut.');
    }
}

// Einstempel-Modal ausblenden
function hideClockInEmployeeModal() {
    document.getElementById('clock-in-employee-modal').classList.remove('visible');
    document.getElementById('clock-in-employee-form').reset();
}

// Ausstempel-Modal ausblenden
function hideClockOutEmployeeModal() {
    document.getElementById('clock-out-employee-modal').classList.remove('visible');
    document.getElementById('clock-out-employee-form').reset();
}

// Google Maps-Karte für Einstempeln initialisieren
let clockInMap;
let clockInMarker;
let clockInGeocoder;

function initClockInMap() {
    if (!google || !google.maps) {
        console.error('Google Maps ist nicht geladen');
        return;
    }
    
    clockInGeocoder = new google.maps.Geocoder();
    
    clockInMap = new google.maps.Map(document.getElementById('clock-in-map'), {
        center: { lat: 49.3992, lng: 10.6840 }, // Standard: Merkendorf
        zoom: 14
    });
    
    // Klick-Event für Kartenposition
    clockInMap.addListener('click', (event) => {
        const position = event.latLng;
        setClockInMarker(position);
    });
    
    // Event-Listener für Standort-Button
    document.getElementById('locate-current-btn').addEventListener('click', getCurrentLocation);
}

// Google Maps-Karte für Ausstempeln initialisieren
let clockOutMap;
let clockOutMarker;
let clockOutGeocoder;

function initClockOutMap() {
    if (!google || !google.maps) {
        console.error('Google Maps ist nicht geladen');
        return;
    }
    
    clockOutGeocoder = new google.maps.Geocoder();
    
    clockOutMap = new google.maps.Map(document.getElementById('clock-out-map'), {
        center: { lat: 49.3992, lng: 10.6840 }, // Standard: Merkendorf
        zoom: 14
    });
    
    // Klick-Event für Kartenposition
    clockOutMap.addListener('click', (event) => {
        const position = event.latLng;
        setClockOutMarker(position);
    });
    
    // Event-Listener für Standort-Button
    document.getElementById('locate-clock-out-btn').addEventListener('click', getCurrentLocationForClockOut);
}

// Aktuellen Standort für Einstempeln abrufen
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                clockInMap.setCenter(pos);
                setClockInMarker(pos);
            },
            (error) => {
                console.error('Fehler bei der Standortermittlung:', error);
                alert('Standort konnte nicht ermittelt werden. Bitte klicken Sie auf die Karte, um den Standort manuell festzulegen.');
            }
        );
    } else {
        alert('Ihr Browser unterstützt keine Standortermittlung. Bitte klicken Sie auf die Karte, um den Standort manuell festzulegen.');
    }
}

// Aktuellen Standort für Ausstempeln abrufen
function getCurrentLocationForClockOut() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                clockOutMap.setCenter(pos);
                setClockOutMarker(pos);
            },
            (error) => {
                console.error('Fehler bei der Standortermittlung:', error);
                alert('Standort konnte nicht ermittelt werden. Bitte klicken Sie auf die Karte, um den Standort manuell festzulegen.');
            }
        );
    } else {
        alert('Ihr Browser unterstützt keine Standortermittlung. Bitte klicken Sie auf die Karte, um den Standort manuell festzulegen.');
    }
}

// Marker für Einstempel-Position setzen
function setClockInMarker(position) {
    // Position in korrektes Format umwandeln
    let latLngPosition;
    
    // Prüfen, ob es sich um ein Google Maps LatLng-Objekt oder ein einfaches {lat, lng}-Objekt handelt
    if (typeof position.lat === 'function') {
        // Es ist bereits ein Google Maps LatLng-Objekt
        latLngPosition = position;
    } else {
        // Es ist ein einfaches Objekt, konvertieren wir es in ein LatLng-Objekt
        latLngPosition = new google.maps.LatLng(parseFloat(position.lat), parseFloat(position.lng));
    }
    
    // Bestehenden Marker entfernen, wenn vorhanden
    if (clockInMarker) {
        clockInMarker.setMap(null);
    }
    
    // Neuen Marker erstellen
    clockInMarker = new google.maps.Marker({
        position: latLngPosition,
        map: clockInMap,
        draggable: true
    });
    
    // Event-Listener für Drag-Ende
    clockInMarker.addListener('dragend', () => {
        const newPosition = clockInMarker.getPosition();
        // Koordinaten in versteckte Felder schreiben
        document.getElementById('clock-in-latitude').value = newPosition.lat();
        document.getElementById('clock-in-longitude').value = newPosition.lng();
    });
    
    // Koordinaten in versteckte Felder schreiben
    const lat = typeof latLngPosition.lat === 'function' ? latLngPosition.lat() : latLngPosition.lat;
    const lng = typeof latLngPosition.lng === 'function' ? latLngPosition.lng() : latLngPosition.lng;
    
    document.getElementById('clock-in-latitude').value = lat;
    document.getElementById('clock-in-longitude').value = lng;
}

// Marker für Ausstempel-Position setzen
function setClockOutMarker(position) {
    // Position in korrektes Format umwandeln
    let latLngPosition;
    
    // Prüfen, ob es sich um ein Google Maps LatLng-Objekt oder ein einfaches {lat, lng}-Objekt handelt
    if (typeof position.lat === 'function') {
        // Es ist bereits ein Google Maps LatLng-Objekt
        latLngPosition = position;
    } else {
        // Es ist ein einfaches Objekt, konvertieren wir es in ein LatLng-Objekt
        latLngPosition = new google.maps.LatLng(parseFloat(position.lat), parseFloat(position.lng));
    }
    
    // Bestehenden Marker entfernen, wenn vorhanden
    if (clockOutMarker) {
        clockOutMarker.setMap(null);
    }
    
    // Neuen Marker erstellen
    clockOutMarker = new google.maps.Marker({
        position: latLngPosition,
        map: clockOutMap,
        draggable: true
    });
    
    // Event-Listener für Drag-Ende
    clockOutMarker.addListener('dragend', () => {
        const newPosition = clockOutMarker.getPosition();
        // Koordinaten in versteckte Felder schreiben
        document.getElementById('clock-out-latitude').value = newPosition.lat();
        document.getElementById('clock-out-longitude').value = newPosition.lng();
    });
    
    // Koordinaten in versteckte Felder schreiben
    const lat = typeof latLngPosition.lat === 'function' ? latLngPosition.lat() : latLngPosition.lat;
    const lng = typeof latLngPosition.lng === 'function' ? latLngPosition.lng() : latLngPosition.lng;
    
    document.getElementById('clock-out-latitude').value = lat;
    document.getElementById('clock-out-longitude').value = lng;
}

// Mitarbeiter einstempeln
async function handleClockInEmployeeForm(event) {
    event.preventDefault();
    
    try {
        const employeeId = document.getElementById('clock-in-employee-id').value;
        const projectId = document.getElementById('clock-in-project').value;
        const notes = document.getElementById('clock-in-notes').value;
        
        // Standortdaten abrufen
        const latitude = document.getElementById('clock-in-latitude').value;
        const longitude = document.getElementById('clock-in-longitude').value;
        
        if (!employeeId || !projectId) {
            alert('Bitte wählen Sie einen Mitarbeiter und ein Projekt aus.');
            return;
        }
        
        // Standort validieren
        if (!latitude || !longitude) {
            alert('Bitte wählen Sie einen Standort aus oder verwenden Sie Ihren aktuellen Standort.');
            return;
        }
        
        // Aktuelles Datum und Uhrzeit
        const now = new Date();
        
        // Zeiteintrags-Daten zusammenstellen
        const timeEntry = {
            employeeId,
            projectId,
            clockInTime: now.toISOString(),
            clockOutTime: null,
            clockInLocation: {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude)
            },
            clockOutLocation: null,
            notes
        };
        
        // Zeiteintrag speichern
        await DataService.addTimeEntry(timeEntry);
        
        // Modal ausblenden
        hideClockInEmployeeModal();
        
        // Dashboard aktualisieren
        await loadDashboardData();
        
        // Erfolgsmeldung
        alert('Mitarbeiter erfolgreich eingestempelt.');
    } catch (error) {
        console.error('Fehler beim Einstempeln des Mitarbeiters:', error);
        // Spezifische Fehlermeldung für Validierungsfehler
        if (error.message && (error.message.includes('bereits') || error.message.includes('überlappen'))) {
            alert(error.message);
        } else {
            alert('Fehler beim Einstempeln. Bitte versuchen Sie es später erneut.');
        }
    }
}

// Mitarbeiter ausstempeln
async function handleClockOutEmployeeForm(event) {
    event.preventDefault();
    
    try {
        const employeeId = document.getElementById('clock-out-employee-id').value;
        const notes = document.getElementById('clock-out-notes').value;
        
        // Standortdaten abrufen
        const latitude = document.getElementById('clock-out-latitude').value;
        const longitude = document.getElementById('clock-out-longitude').value;
        
        if (!employeeId) {
            alert('Mitarbeiter-ID fehlt.');
            return;
        }
        
        // Standort validieren
        if (!latitude || !longitude) {
            alert('Bitte wählen Sie einen Standort aus oder verwenden Sie Ihren aktuellen Standort.');
            return;
        }
        
        // Aktuelles Datum und Uhrzeit
        const now = new Date();
        
        // Aktiven Zeiteintrag des Mitarbeiters laden
        const activeEmployees = await DataService.getCurrentlyActiveEmployees();
        const activeEntry = activeEmployees.find(entry => entry.employee.id === employeeId);
        
        if (!activeEntry || !activeEntry.activeEntry) {
            alert('Kein aktiver Zeiteintrag für diesen Mitarbeiter gefunden.');
            return;
        }
        
        // Zeiteintrag aktualisieren
        const updatedEntry = {
            id: activeEntry.activeEntry.id,
            clockOutTime: now.toISOString(),
            clockOutLocation: {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude)
            }
        };
        
        // Notizen hinzufügen, wenn vorhanden
        if (notes) {
            const existingNotes = activeEntry.activeEntry.notes || '';
            updatedEntry.notes = existingNotes + (existingNotes ? '\n' : '') + `[Ausstempeln] ${notes}`;
        }
        
        // Zeiteintrag aktualisieren
        await DataService.updateTimeEntry(updatedEntry);
        
        // Modal ausblenden
        hideClockOutEmployeeModal();
        
        // Dashboard aktualisieren
        await loadDashboardData();
        
        // Erfolgsmeldung
        alert('Mitarbeiter erfolgreich ausgestempelt.');
    } catch (error) {
        console.error('Fehler beim Ausstempeln des Mitarbeiters:', error);
        alert('Fehler beim Ausstempeln. Bitte versuchen Sie es später erneut.');
    }
}

// Mitarbeiter-Standort anzeigen
function showEmployeeLocation(employeeId) {
    const timeEntry = DataService.getCurrentTimeEntry(employeeId);
    
    if (!timeEntry || !timeEntry.clockInLocation) {
        alert('Standortdaten nicht verfügbar');
        return;
    }
    
    const { latitude, longitude } = timeEntry.clockInLocation;
    const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    
    // In neuem Tab öffnen
    window.open(mapUrl, '_blank');
}

// Mitarbeiter ausstempeln (Admin-Funktion)
function clockOutEmployee(entryId) {
    const timeEntry = DataService.getTimeEntryById(entryId);
    
    if (!timeEntry) {
        alert('Zeiteintrag nicht gefunden!');
        return;
    }
    
    const employee = DataService.getEmployeeById(timeEntry.employeeId);
    const project = DataService.getProjectById(timeEntry.projectId);
    
    if (confirm(`Möchten Sie ${employee.name} von Projekt "${project.name}" ausstempeln?`)) {
        // Aktuelle Zeit setzen
        const now = new Date();
        timeEntry.clockOutTime = now.toISOString();
        
        // Standort des Projekts als Ausstempelort verwenden (falls vorhanden)
        if (project.location) {
            timeEntry.clockOutLocation = {
                latitude: project.location.latitude,
                longitude: project.location.longitude
            };
        } else {
            // Fallback: Gleicher Standort wie Einstempelort
            timeEntry.clockOutLocation = timeEntry.clockInLocation;
        }
        
        // Zeiteintrag aktualisieren
        DataService.updateTimeEntry(timeEntry);
        
        // Dashboard aktualisieren
        loadDashboardData();
    }
}

// Modal für das Admin-Einstempeln von Mitarbeitern
let clockInEmployeeModal = null;
let clockInEmployeeForm = null;
let clockInEmployeeId = null;

// Formular zum Einstempeln eines Mitarbeiters durch den Admin anzeigen
function showClockInEmployeeForm(employeeId) {
    // Mitarbeiter abrufen
    const employee = DataService.getEmployeeById(employeeId);
    
    if (!employee) {
        alert('Mitarbeiter nicht gefunden!');
        return;
    }
    
    // Wenn das Modal-Element noch nicht existiert, erstellen wir es
    if (!clockInEmployeeModal) {
        // Modal erstellen
        clockInEmployeeModal = document.createElement('div');
        clockInEmployeeModal.id = 'clock-in-employee-modal';
        clockInEmployeeModal.className = 'modal';
        
        // Modal-Inhalt erstellen
        clockInEmployeeModal.innerHTML = `
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h3>Mitarbeiter einstempeln</h3>
                <form id="clock-in-employee-form">
                    <div class="form-group">
                        <label for="admin-employee-name">Mitarbeiter:</label>
                        <input type="text" id="admin-employee-name" readonly>
                        <input type="hidden" id="admin-employee-id">
                    </div>
                    <div class="form-group">
                        <label for="admin-project-select">Projekt auswählen:</label>
                        <select id="admin-project-select" required>
                            <option value="" disabled selected>Bitte wählen</option>
                            <!-- Projekte werden per JavaScript hinzugefügt -->
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="admin-clock-in-notes">Notizen:</label>
                        <textarea id="admin-clock-in-notes" rows="2"></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn secondary-btn cancel-admin-clock-in-btn">Abbrechen</button>
                        <button type="submit" class="btn primary-btn">Einstempeln</button>
                    </div>
                </form>
            </div>
        `;
        
        // Modal zum DOM hinzufügen
        document.body.appendChild(clockInEmployeeModal);
        
        // Formular-Referenz speichern
        clockInEmployeeForm = document.getElementById('clock-in-employee-form');
        
        // Event-Listener für Formular
        clockInEmployeeForm.addEventListener('submit', handleAdminClockIn);
        
        // Event-Listener für Modal schließen
        document.querySelector('#clock-in-employee-modal .close-modal').addEventListener('click', hideClockInEmployeeModal);
        document.querySelector('.cancel-admin-clock-in-btn').addEventListener('click', hideClockInEmployeeModal);
    }
    
    // Mitarbeiterdaten setzen
    document.getElementById('admin-employee-name').value = employee.name;
    document.getElementById('admin-employee-id').value = employee.id;
    
    // Projekte laden
    const projectSelect = document.getElementById('admin-project-select');
    projectSelect.innerHTML = '<option value="" disabled selected>Bitte wählen</option>';
    
    const projects = DataService.getActiveProjects();
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        projectSelect.appendChild(option);
    });
    
    // Modal anzeigen
    clockInEmployeeModal.classList.add('visible');
}

// Modal zum Einstempeln ausblenden
function hideClockInEmployeeModal() {
    clockInEmployeeModal.classList.remove('visible');
}

// Mitarbeiter einstempeln (Admin-Funktion)
async function handleAdminClockIn(event) {
    event.preventDefault();
    
    const employeeId = parseInt(document.getElementById('admin-employee-id').value);
    const projectId = parseInt(document.getElementById('admin-project-select').value);
    const notes = document.getElementById('admin-clock-in-notes').value.trim();
    
    if (!projectId) {
        alert('Bitte wählen Sie ein Projekt aus!');
        return;
    }
    
    // Projekt abrufen, um dessen Standort zu verwenden
    const project = DataService.getProjectById(projectId);
    
    // Aktueller Zeitpunkt
    const now = new Date();
    
    // Standort des Projekts als Einstempelort verwenden
    const location = project.location ? {
        latitude: project.location.latitude,
        longitude: project.location.longitude
    } : { latitude: 0, longitude: 0 }; // Fallback, wenn kein Projektstandort vorhanden
    
    // Zeiteintrag erstellen
    const timeEntry = {
        employeeId: employeeId,
        projectId: projectId,
        clockInTime: now.toISOString(),
        clockOutTime: null,
        clockInLocation: location,
        clockOutLocation: null,
        notes: notes
    };
    
    try {
        // Zeiteintrag speichern
        await DataService.addTimeEntry(timeEntry);
        
        // Modal ausblenden
        hideClockInEmployeeModal();
        
        // Dashboard aktualisieren
        loadDashboardData();
        
        // Erfolgsmeldung
        alert('Mitarbeiter erfolgreich eingestempelt.');
    } catch (error) {
        console.error('Fehler beim Einstempeln des Mitarbeiters:', error);
        // Spezifische Fehlermeldung für Validierungsfehler
        if (error.message && (error.message.includes('bereits') || error.message.includes('überlappen'))) {
            alert(error.message);
        } else {
            alert('Fehler beim Einstempeln. Bitte versuchen Sie es später erneut.');
        }
    }
}

// Mitarbeitertabelle laden
async function loadEmployeesTable() {
    try {
        const employees = await DataService.getAllActiveEmployees();
        
        // Tabelle leeren
        employeesTable.innerHTML = '';
        
        if (employees.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="6" class="text-center">Keine aktiven Mitarbeiter vorhanden</td>';
            employeesTable.appendChild(row);
            return;
        }
        
        employees.forEach(employee => {
            const row = document.createElement('tr');
            
            const statusBadge = employee.status === 'active' 
                ? '<span class="status-badge active">Aktiv</span>' 
                : '<span class="status-badge inactive">Inaktiv</span>';
            
            row.innerHTML = `
                <td>${employee.name}</td>
                <td>${employee.username}</td>
                <td>${employee.position}</td>
                <td>${statusBadge}</td>
                <td class="action-buttons">
                    <button class="action-btn edit-btn" data-id="${employee.id}"><i class="fas fa-edit"></i></button>
                    <button class="action-btn delete-btn" data-id="${employee.id}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            
            employeesTable.appendChild(row);
        });
        
        // Event-Listener für Aktionsbuttons hinzufügen
        addEmployeeActionListeners();
    } catch (error) {
        console.error('Fehler beim Laden der Mitarbeitertabelle:', error);
        employeesTable.innerHTML = '<tr><td colspan="6" class="text-center">Fehler beim Laden der Mitarbeiter. Bitte versuchen Sie es später erneut.</td></tr>';
    }
}

function addEmployeeActionListeners() {
    employeesTable.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', () => {
            const id = button.getAttribute('data-id'); // ID als String belassen
            showEditEmployeeForm(id);
        });
    });

    
    employeesTable.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', () => {
            const id = button.getAttribute('data-id'); // ID als String belassen
            confirmDeleteEmployee(id);
        });
    });
}

// Formular zum Hinzufügen eines Mitarbeiters anzeigen
function showAddEmployeeForm() {
    employeeFormTitle.textContent = 'Mitarbeiter hinzufügen';
    employeeForm.reset();
    employeeIdInput.value = '';
    employeePasswordInput.required = true;
    employeeFormModal.classList.add('visible');
}

// Formular zum Bearbeiten eines Mitarbeiters anzeigen
async function showEditEmployeeForm(id) {
    try {
        const employee = await DataService.getEmployeeById(id);
        
        if (!employee) {
            alert('Mitarbeiter nicht gefunden');
            return;
        }
        
        employeeFormTitle.textContent = 'Mitarbeiter bearbeiten';
        employeeIdInput.value = employee.id;
        employeeNameInput.value = employee.name;
        employeeUsernameInput.value = employee.username;
        employeePasswordInput.value = '';
        employeePasswordInput.required = false;
        employeePositionInput.value = employee.position;
        employeeStatusInput.value = employee.status;
        
        employeeFormModal.classList.add('visible');
    } catch (error) {
        console.error('Fehler beim Laden des Mitarbeiters:', error);
        alert('Der Mitarbeiter konnte nicht geladen werden. Bitte versuchen Sie es erneut.');
    }
}

// Mitarbeiterformular abschicken
async function handleEmployeeFormSubmit(event) {
    event.preventDefault();
    
    try {
        const id = employeeIdInput.value ? employeeIdInput.value : null; // ID ist jetzt ein String in Firebase
        
        const employeeData = {
            name: employeeNameInput.value.trim(),
            username: employeeUsernameInput.value.trim(),
            position: employeePositionInput.value.trim(),
            status: employeeStatusInput.value
        };
        
        // Passwort nur hinzufügen, wenn angegeben oder neuer Mitarbeiter
        if (employeePasswordInput.value || !id) {
            employeeData.password = employeePasswordInput.value;
        } else if (id) {
            // Bestehendes Passwort beibehalten
            const existingEmployee = await DataService.getEmployeeById(id);
            if (existingEmployee) {
                employeeData.password = existingEmployee.password;
            } else {
                throw new Error('Mitarbeiter konnte nicht gefunden werden');
            }
        }
        
        if (id) {
            // Mitarbeiter aktualisieren
            employeeData.id = id;
            await DataService.updateEmployee(employeeData);
            console.log('Mitarbeiter aktualisiert:', employeeData.name);
        } else {
            // Neuen Mitarbeiter hinzufügen
            const newEmployee = await DataService.addEmployee(employeeData);
            console.log('Neuer Mitarbeiter hinzugefügt:', newEmployee.name);
        }
        
        hideAllModals();
        await loadEmployeesTable();
        await loadDashboardData();
    } catch (error) {
        console.error('Fehler beim Speichern des Mitarbeiters:', error);
        alert(`Fehler beim Speichern: ${error.message}`);
    }
}

// Mitarbeiter löschen bestätigen
async function confirmDeleteEmployee(id) {
    try {
        const employee = await DataService.getEmployeeById(id);
        
        if (!employee) {
            alert('Mitarbeiter nicht gefunden');
            return;
        }
        
        const confirmDelete = confirm(`Möchten Sie den Mitarbeiter "${employee.name}" wirklich löschen?`);
        
        if (confirmDelete) {
            await DataService.deleteEmployee(id);
            await loadEmployeesTable();
            await loadDashboardData();
        }
    } catch (error) {
        console.error('Fehler beim Löschen des Mitarbeiters:', error);
        alert('Der Mitarbeiter konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.');
    }
}

// Projekttabelle laden
async function loadProjectsTable() {
    try {
        const projects = await DataService.getProjects();
        
        // Tabelle leeren
        projectsTable.innerHTML = '';
        
        if (projects.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="7" class="text-center">Keine Projekte vorhanden</td>';
            projectsTable.appendChild(row);
            return;
        }
        
        projects.forEach(project => {
            const row = document.createElement('tr');
            
            let statusBadge = '';
            switch (project.status) {
                case 'planned':
                    statusBadge = '<span class="status-badge planned">Geplant</span>';
                    break;
                case 'active':
                    statusBadge = '<span class="status-badge active">Aktiv</span>';
                    break;
                case 'completed':
                    statusBadge = '<span class="status-badge completed">Abgeschlossen</span>';
                    break;
                case 'archived':
                    statusBadge = '<span class="status-badge archived">Archiviert</span>';
                    break;
                default:
                    statusBadge = '<span class="status-badge">Unbekannt</span>';
            }
            
            // Formatiere die Adresse, wenn vorhanden
            const location = project.location ? project.location.address : 'Keine Angabe';
            
            row.innerHTML = `
                <td>${project.name}</td>
                <td>${project.client}</td>
                <td>${project.startDate}</td>
                <td>${project.endDate || '-'}</td>
                <td>${location}</td>
                <td>${statusBadge}</td>
                <td class="action-buttons">
                    <button class="action-btn edit-btn" data-id="${project.id}"><i class="fas fa-edit"></i></button>
                    <button class="action-btn delete-btn" data-id="${project.id}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            
            projectsTable.appendChild(row);
        });
        
        // Event-Listener für Aktionsbuttons hinzufügen
        addProjectActionListeners();
    } catch (error) {
        console.error('Fehler beim Laden der Projekttabelle:', error);
        projectsTable.innerHTML = '<tr><td colspan="7" class="text-center">Fehler beim Laden der Projekte. Bitte versuchen Sie es später erneut.</td></tr>';
    }
}
    
// Event-Listener für Projektaktionen hinzufügen
function addProjectActionListeners() {
    projectsTable.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', () => {
            const id = button.getAttribute('data-id');
            showEditProjectForm(id);
        });
    });
    
    projectsTable.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', () => {
            const id = button.getAttribute('data-id');
            confirmDeleteProject(id);
        });
    });
}

// Formular zum Hinzufügen eines Projekts anzeigen
function showAddProjectForm() {
    projectFormTitle.textContent = 'Projekt hinzufügen';
    projectForm.reset();
    projectIdInput.value = '';
    
    // Aktuelles Datum als Standard für Startdatum
    const today = new Date().toISOString().split('T')[0];
    projectStartDateInput.value = today;
    
    projectFormModal.classList.add('visible');
    
    // Google Maps initialisieren (verzögert, um sicherzustellen, dass das Modal vollständig geladen ist)
    setTimeout(() => {
        initProjectMap();
    }, 300);
}

// Formular zum Bearbeiten eines Projekts anzeigen
async function showEditProjectForm(id) {
    try {
        const project = await DataService.getProjectById(id);
        
        if (!project) {
            alert('Projekt nicht gefunden');
            return;
        }
        
        projectFormTitle.textContent = 'Projekt bearbeiten';
        projectIdInput.value = project.id;
        projectNameInput.value = project.name;
        projectClientInput.value = project.client;
        projectStartDateInput.value = project.startDate;
        projectEndDateInput.value = project.endDate || '';
        projectDescriptionInput.value = project.description || '';
        projectStatusInput.value = project.status;
        
        // Adresse aus dem direkten address-Feld oder aus location laden
        const addressValue = project.address || (project.location && project.location.address) || '';
        document.getElementById('project-address').value = addressValue;
        
        // Wenn ein location-Objekt mit Koordinaten vorhanden ist, diese laden
        if (project.location && project.location.latitude && project.location.longitude) {
            document.getElementById('project-latitude').value = project.location.latitude || '';
            document.getElementById('project-longitude').value = project.location.longitude || '';
            
            selectedLocation = {
                address: addressValue,
                latitude: project.location.latitude,
                longitude: project.location.longitude
            };
            
            // Karte initialisieren und Marker setzen
            initProjectMap();
            if (selectedLocation.latitude && selectedLocation.longitude) {
                const position = { lat: selectedLocation.latitude, lng: selectedLocation.longitude };
                setProjectMarker(position);
                projectMap.setCenter(position);
            }
        } else {
            // Keine GPS-Koordinaten, nur Adresse vorhanden
            document.getElementById('project-latitude').value = '';
            document.getElementById('project-longitude').value = '';
            selectedLocation = null;
            initProjectMap();
        }
        
        projectFormModal.classList.add('visible');
    } catch (error) {
        console.error('Fehler beim Laden des Projekts:', error);
        alert('Das Projekt konnte nicht geladen werden. Bitte versuchen Sie es erneut.');
    }
}

// Projektformular abschicken
// Globale Variable für die ausgewählte Position
let selectedLocation = null;

async function handleProjectFormSubmit(event) {
    event.preventDefault();
    
    try {
        const id = projectIdInput.value ? projectIdInput.value : null; // ID ist jetzt ein String in Firebase
        
        const projectData = {
            name: projectNameInput.value.trim(),
            client: projectClientInput.value.trim(),
            startDate: projectStartDateInput.value,
            endDate: projectEndDateInput.value || null,
            description: projectDescriptionInput.value.trim(),
            status: projectStatusInput.value
        };
        
        // Standortdaten aus den Formularfeldern extrahieren
        const latitude = document.getElementById('project-latitude').value;
        const longitude = document.getElementById('project-longitude').value;
        const address = document.getElementById('project-address').value;
        
        // Adresse als separates Feld speichern (auch ohne GPS-Koordinaten)
        if (address && address.trim() !== '') {
            projectData.address = address.trim();
        }
        
        // Location-Objekt nur speichern, wenn GPS-Koordinaten vorhanden sind
        if (latitude && longitude) {
            projectData.location = {
                address: address || '',
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude)
            };
        }
        
        if (id) {
            // Projekt aktualisieren
            projectData.id = id;
            await DataService.updateProject(projectData);
            console.log('Projekt aktualisiert:', projectData.name);
        } else {
            // Neues Projekt hinzufügen
            const newProject = await DataService.addProject(projectData);
            console.log('Neues Projekt hinzugefügt:', newProject.name);
        }
        
        hideAllModals();
        await loadProjectsTable();
        await loadDashboardData();
    } catch (error) {
        console.error('Fehler beim Speichern des Projekts:', error);
        alert(`Fehler beim Speichern: ${error.message}`);
    }
}

// Projekt löschen bestätigen
async function confirmDeleteProject(id) {
    try {
        const project = await DataService.getProjectById(id);
        
        if (!project) {
            alert('Projekt nicht gefunden');
            return;
        }
        
        const confirmDelete = confirm(`Möchten Sie das Projekt "${project.name}" wirklich löschen?`);
        
        if (confirmDelete) {
            await DataService.deleteProject(id);
            await loadProjectsTable();
            await loadDashboardData();
        }
    } catch (error) {
        console.error('Fehler beim Löschen des Projekts:', error);
        alert('Das Projekt konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.');
    }
}

// Berichtsfilter laden
async function loadReportFilters() {
    try {
        const reportType = document.getElementById('report-type');
        const reportFilter = document.getElementById('report-filter');
        
        // Filtertyp ermitteln
        const type = reportType.value;
        
        // Report-Filter leeren
        reportFilter.innerHTML = '';
        
        if (type === 'employee') {
            // Mitarbeiter für Filter laden
            const employees = await DataService.getAllActiveEmployees();
            reportFilter.innerHTML = '<option value="all">Alle aktiven Mitarbeiter</option>';
            
            employees.forEach(employee => {
                const option = document.createElement('option');
                option.value = employee.id;
                option.textContent = employee.name;
                reportFilter.appendChild(option);
            });
        } else if (type === 'project') {
            // Projekte für Filter laden
            const projects = await DataService.getProjects();
            reportFilter.innerHTML = '<option value="all">Alle Projekte</option>';
            
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                reportFilter.appendChild(option);
            });
        } else if (type === 'date') {
            // Datumsfilter laden
            reportFilter.innerHTML = `
                <option value="today">Heute</option>
                <option value="yesterday">Gestern</option>
                <option value="thisWeek">Diese Woche</option>
                <option value="lastWeek">Letzte Woche</option>
                <option value="thisMonth">Dieser Monat</option>
                <option value="lastMonth">Letzter Monat</option>
                <option value="custom" selected>Benutzerdefiniert</option>
            `;
        }
        
        // Event-Listener für Report-Typ
        reportType.addEventListener('change', () => loadReportFilters());
        
    } catch (error) {
        console.error('Fehler beim Laden der Report-Filter:', error);
        document.getElementById('report-filter').innerHTML = '<option value="">Fehler beim Laden</option>';
    }
}

// Bericht generieren
function generateReport() {
    const type = reportType.value;
    const filter = reportFilter.value;
    const startDate = new Date(reportStartDate.value);
    const endDate = new Date(reportEndDate.value);
    
    // Setze Endzeit auf Ende des Tages
    endDate.setHours(23, 59, 59, 999);
    
    // Alle Zeiteinträge holen
    let timeEntries = DataService.getTimeEntries();
    
    // Nach Datum filtern
    timeEntries = timeEntries.filter(entry => {
        const entryDate = new Date(entry.clockInTime);
        return entryDate >= startDate && entryDate <= endDate;
    });
    
    // Nach weiteren Kriterien filtern
    if (type === 'employee' && filter !== 'all') {
        const employeeId = parseInt(filter);
        timeEntries = timeEntries.filter(entry => entry.employeeId === employeeId);
    } else if (type === 'project' && filter !== 'all') {
        const projectId = parseInt(filter);
        timeEntries = timeEntries.filter(entry => entry.projectId === projectId);
    }
    
    // Zeiteinträge nach Datum sortieren
    timeEntries.sort((a, b) => new Date(a.clockInTime) - new Date(b.clockInTime));
    
    // Bericht anzeigen
    displayReport(timeEntries, type);
}

// Bericht anzeigen
function displayReport(timeEntries, reportType) {
    // Tabellenköpfe und -inhalte generieren
    const tableHeader = reportTable.querySelector('thead tr');
    const tableBody = reportTable.querySelector('tbody');
    const tableFooter = reportTable.querySelector('tfoot tr');
    
    // Tabelle leeren
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';
    tableFooter.innerHTML = '';
    
    // Spalten je nach Berichtstyp
    if (reportType === 'employee') {
        tableHeader.innerHTML = `
            <th>Datum</th>
            <th>Mitarbeiter</th>
            <th>Projekt</th>
            <th>Von</th>
            <th>Bis</th>
            <th>Stunden</th>
            <th>Notizen</th>
        `;
    } else if (reportType === 'project') {
        tableHeader.innerHTML = `
            <th>Datum</th>
            <th>Projekt</th>
            <th>Mitarbeiter</th>
            <th>Von</th>
            <th>Bis</th>
            <th>Stunden</th>
            <th>Notizen</th>
        `;
    } else {
        tableHeader.innerHTML = `
            <th>Datum</th>
            <th>Mitarbeiter</th>
            <th>Projekt</th>
            <th>Von</th>
            <th>Bis</th>
            <th>Stunden</th>
            <th>Notizen</th>
        `;
    }
    
    // Wenn keine Einträge
    if (timeEntries.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="7" class="text-center">Keine Einträge für den ausgewählten Zeitraum</td>';
        tableBody.appendChild(row);
        return;
    }
    
    // Summe der Stunden
    let totalHours = 0;
    
    // Einträge zur Tabelle hinzufügen
    timeEntries.forEach(entry => {
        const employee = DataService.getEmployeeById(entry.employeeId);
        const project = DataService.getProjectById(entry.projectId);
        
        const clockInTime = new Date(entry.clockInTime);
        const clockOutTime = entry.clockOutTime ? new Date(entry.clockOutTime) : null;
        
        const date = clockInTime.toLocaleDateString('de-DE');
        const timeIn = clockInTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const timeOut = clockOutTime ? clockOutTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '-';
        
        const hours = DataService.calculateWorkHours(entry);
        totalHours += hours;
        
        const row = document.createElement('tr');
        
        if (reportType === 'employee') {
            row.innerHTML = `
                <td>${date}</td>
                <td>${employee.name}</td>
                <td>${project.name}</td>
                <td>${timeIn}</td>
                <td>${timeOut}</td>
                <td>${hours.toFixed(2)}h</td>
                <td>${entry.notes || '-'}</td>
            `;
        } else if (reportType === 'project') {
            row.innerHTML = `
                <td>${date}</td>
                <td>${project.name}</td>
                <td>${employee.name}</td>
                <td>${timeIn}</td>
                <td>${timeOut}</td>
                <td>${hours.toFixed(2)}h</td>
                <td>${entry.notes || '-'}</td>
            `;
        } else {
            row.innerHTML = `
                <td>${date}</td>
                <td>${employee.name}</td>
                <td>${project.name}</td>
                <td>${timeIn}</td>
                <td>${timeOut}</td>
                <td>${hours.toFixed(2)}h</td>
                <td>${entry.notes || '-'}</td>
            `;
        }
        
        tableBody.appendChild(row);
    });
    
    // Fußzeile mit Summe
    tableFooter.innerHTML = `
        <td colspan="${reportType === 'project' ? 5 : 5}" class="text-right"><strong>Gesamt:</strong></td>
        <td><strong>${totalHours.toFixed(2)}h</strong></td>
        <td></td>
    `;
}

// Bericht als CSV exportieren
function exportReportToCsv() {
    const table = reportTable;
    const rows = table.querySelectorAll('tr');
    
    if (rows.length <= 1) {
        alert('Keine Daten zum Exportieren');
        return;
    }
    
    let csvContent = 'data:text/csv;charset=utf-8,';
    
    rows.forEach(row => {
        const rowData = [];
        row.querySelectorAll('th, td').forEach(cell => {
            // Text bereinigen und in Anführungszeichen setzen
            let text = cell.textContent.trim().replace(/"/g, '""');
            rowData.push(`"${text}"`);
        });
        csvContent += rowData.join(';') + '\r\n';
    });
    
    // CSV-Datei herunterladen
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    
    // Dateiname generieren
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `lauffer_zeiterfassung_bericht_${today}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Google Maps für Projektstandort initialisieren
function initProjectMap() {
    if (!projectMap) {
        const mapElement = document.getElementById('project-map');
        
        // Standardposition (Deutschland)
        const defaultPosition = { lat: 51.1657, lng: 10.4515 };
        
        // Map erstellen
        projectMap = new google.maps.Map(mapElement, {
            center: defaultPosition,
            zoom: 6,
            mapTypeControl: false,
            streetViewControl: false
        });
        
        // Geocoder für Adresssuche initialisieren
        geocoder = new google.maps.Geocoder();
        
        // Event-Listener für Klick auf Karte
        projectMap.addListener('click', (event) => {
            setProjectMarker(event.latLng);
            reverseGeocode(event.latLng);
        });
        
        // Event-Listener für den Standort-Suchen-Button
        document.getElementById('locate-project-btn').addEventListener('click', () => {
            const address = document.getElementById('project-address').value;
            if (address) {
                geocodeAddress(address);
            }
        });
        
        // Event-Listener für Adressfeld (Enter-Taste)
        document.getElementById('project-address').addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                const address = document.getElementById('project-address').value;
                if (address) {
                    geocodeAddress(address);
                }
            }
        });
    }
}

// Google Maps-Marker für Projekte setzen
function setProjectMarker(position) {
    // Bestehenden Marker entfernen, wenn vorhanden
    if (projectMarker) {
        projectMarker.setMap(null);
    }
    
    // Position in korrektes Format umwandeln
    let latLngPosition;
    
    // Prüfen, ob es sich um ein Google Maps LatLng-Objekt oder ein einfaches {lat, lng}-Objekt handelt
    if (typeof position.lat === 'function') {
        // Es ist bereits ein Google Maps LatLng-Objekt
        latLngPosition = position;
    } else {
        // Es ist ein einfaches Objekt, konvertieren wir es in ein LatLng-Objekt
        latLngPosition = new google.maps.LatLng(parseFloat(position.lat), parseFloat(position.lng));
    }
    
    // Neuen Marker erstellen
    projectMarker = new google.maps.Marker({
        position: latLngPosition,
        map: projectMap,
        draggable: true
    });
    
    // Event-Listener für Drag-Ende
    projectMarker.addListener('dragend', () => {
        const newPosition = projectMarker.getPosition();
        reverseGeocode(newPosition);
    });
    
    // Koordinaten in versteckten Feldern speichern
    // Sicherstellen, dass wir die Werte korrekt erhalten, unabhängig vom Typ
    const lat = typeof latLngPosition.lat === 'function' ? latLngPosition.lat() : latLngPosition.lat;
    const lng = typeof latLngPosition.lng === 'function' ? latLngPosition.lng() : latLngPosition.lng;
    
    document.getElementById('project-latitude').value = lat;
    document.getElementById('project-longitude').value = lng;
}

// Adresse zu Koordinaten umwandeln
function geocodeAddress(address) {
    geocoder.geocode({ 'address': address }, (results, status) => {
        if (status === 'OK') {
            const position = results[0].geometry.location;
            projectMap.setCenter(position);
            projectMap.setZoom(15);
            setProjectMarker(position);
            
            // Formatierte Adresse ins Adressfeld schreiben
            document.getElementById('project-address').value = results[0].formatted_address;
        } else {
            alert('Adresse konnte nicht gefunden werden: ' + status);
        }
    });
}

// Koordinaten zu Adresse umwandeln (Reverse Geocoding)
function reverseGeocode(position) {
    geocoder.geocode({ 'location': position }, (results, status) => {
        if (status === 'OK' && results[0]) {
            document.getElementById('project-address').value = results[0].formatted_address;
        }
    });
}

// Projektdetail-Ansicht anzeigen
async function showProjectDetails(projectId) {
    try {
        // Projekt-Daten laden
        const project = await DataService.getProjectById(projectId);
        if (!project) {
            console.error('Projekt nicht gefunden');
            return;
        }
        
        // Projekttitel setzen
        projectDetailTitle.textContent = project.name;
        
        // Projektdetails anzeigen
        detailClient.textContent = project.client || 'Nicht angegeben';
        
        // Zeitraum formatieren
        const startDate = project.startDate ? new Date(project.startDate).toLocaleDateString() : 'Nicht angegeben';
        const endDate = project.endDate ? new Date(project.endDate).toLocaleDateString() : 'Offen';
        detailTimeframe.textContent = `${startDate} - ${endDate}`;
        
        // Status formatieren
        const statusMap = {
            'planned': 'Geplant',
            'active': 'Aktiv',
            'completed': 'Abgeschlossen',
            'archived': 'Archiviert'
        };
        detailStatus.textContent = statusMap[project.status] || project.status;
        
        // Standort anzeigen - prüfe verschiedene Speicherorte der Adresse
        let locationText = 'Nicht angegeben';
        
        // Adresse aus project.address oder project.location.address holen
        const addressText = project.address || (project.location && project.location.address);
        
        if (project.location && project.location.latitude && project.location.longitude) {
            // Wenn GPS-Koordinaten vorhanden sind
            locationText = `${project.location.latitude.toFixed(6)}, ${project.location.longitude.toFixed(6)}`;
            if (addressText) {
                locationText = `${addressText} (${locationText})`;
            }
        } else if (addressText) {
            // Nur Adresse ohne GPS-Koordinaten
            locationText = addressText;
        }
        detailLocation.textContent = locationText;
        
        // Beschreibung anzeigen
        detailDescription.textContent = project.description || 'Keine Beschreibung vorhanden';
        
        // Mitarbeiter-Dropdown für Filter füllen
        const employees = await DataService.getAllActiveEmployees();
        const employeeOptions = '<option value="all">Alle aktiven Mitarbeiter</option>' + 
            employees.map(emp => `<option value="${emp.id}">${emp.name}</option>`).join('');
        
        sitePhotosEmployeeFilter.innerHTML = employeeOptions;
        docsEmployeeFilter.innerHTML = employeeOptions;
        timeEmployeeFilter.innerHTML = employeeOptions;
        
        // Baustellenbilder laden
        await loadProjectImages(projectId, 'construction_site');
        
        // Dokumentenbilder laden
        await loadProjectImages(projectId, 'document');
        
        // Zeiteinträge laden
        await loadProjectTimeEntries(projectId);
        
        // Modal anzeigen
        projectDetailModal.classList.add('visible');
        
        // Event-Listener für Bildergalerie hinzufügen
        setupGalleryEventListeners();
        
    } catch (error) {
        console.error('Fehler beim Laden der Projektdetails:', error);
        alert('Fehler beim Laden der Projektdetails. Bitte versuchen Sie es später erneut.');
    }
}

// Projektbilder laden
async function loadProjectImages(projectId, type = 'construction_site', employeeId = null, date = null) {
    try {
        // Bilder laden
        const files = await DataService.getProjectFiles(projectId, type);
        
        // Container für die entsprechende Galerie
        const container = type === 'construction_site' ? sitePhotosGallery : documentsGallery;
        
        // Container leeren
        container.innerHTML = '';
        
        // Filterung anwenden
        let filteredFiles = files;
        
        if (employeeId && employeeId !== 'all') {
            filteredFiles = filteredFiles.filter(file => file.employeeId === employeeId);
        }
        
        if (date) {
            const filterDate = new Date(date);
            filterDate.setHours(0, 0, 0, 0);
            
            filteredFiles = filteredFiles.filter(file => {
                const fileDate = new Date(file.timestamp);
                fileDate.setHours(0, 0, 0, 0);
                return fileDate.getTime() === filterDate.getTime();
            });
        }
        
        // Wenn keine Bilder vorhanden sind
        if (filteredFiles.length === 0) {
            container.innerHTML = `<div class="no-data-message">Keine ${type === 'construction_site' ? 'Baustellenfotos' : 'Dokumente'} vorhanden</div>`;
            return;
        }
        
        // Nach Datum sortieren (neueste zuerst)
        filteredFiles.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Mitarbeiternamen abrufen
        const employeePromises = filteredFiles.map(file => 
            DataService.getEmployeeById(file.employeeId)
        );
        
        const employees = await Promise.all(employeePromises);
        
        // Bilder anzeigen
        filteredFiles.forEach((file, index) => {
            const galleryItem = document.createElement('div');
            galleryItem.className = 'gallery-item';
            galleryItem.dataset.fileId = file.id;
            
            // Datum formatieren
            const date = new Date(file.timestamp);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            
            // Mitarbeiter zuordnen
            const employee = employees[index] || { name: 'Unbekannt' };
            
            galleryItem.innerHTML = `
                <img src="${file.url}" alt="${type === 'construction_site' ? 'Baustellenfoto' : 'Dokument'}">
                <div class="gallery-item-info">
                    <div>${formattedDate}</div>
                    <div>${employee.name}</div>
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
        const container = type === 'construction_site' ? sitePhotosGallery : documentsGallery;
        container.innerHTML = `<div class="error-message">Fehler beim Laden der Bilder</div>`;
    }
}

// Zeiteinträge für ein Projekt laden
async function loadProjectTimeEntries(projectId, employeeId = null, date = null) {
    try {
        // Zeiteinträge laden
        const timeEntries = await DataService.getProjectTimeEntries(projectId);
        
        // Container leeren
        timeEntriesTable.innerHTML = '';
        
        // Filterung anwenden
        let filteredEntries = timeEntries;
        
        if (employeeId && employeeId !== 'all') {
            filteredEntries = filteredEntries.filter(entry => entry.employeeId === employeeId);
        }
        
        if (date) {
            const filterDate = new Date(date);
            filterDate.setHours(0, 0, 0, 0);
            
            filteredEntries = filteredEntries.filter(entry => {
                const entryDate = new Date(entry.clockInTime);
                entryDate.setHours(0, 0, 0, 0);
                return entryDate.getTime() === filterDate.getTime();
            });
        }
        
        // Nach Datum sortieren (neueste zuerst)
        filteredEntries.sort((a, b) => new Date(b.clockInTime) - new Date(a.clockInTime));
        
        // Wenn keine Einträge vorhanden sind
        if (filteredEntries.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="6" class="text-center">Keine Zeiteinträge vorhanden</td>';
            timeEntriesTable.appendChild(row);
            return;
        }
        
        // Mitarbeiternamen abrufen
        const employeePromises = filteredEntries.map(entry => 
            DataService.getEmployeeById(entry.employeeId)
        );
        
        const employees = await Promise.all(employeePromises);
        
        // Zeiteinträge anzeigen
        filteredEntries.forEach((entry, index) => {
            const employee = employees[index] || { name: 'Unbekannt' };
            
            // Datum formatieren
            const date = new Date(entry.clockInTime).toLocaleDateString();
            
            // Zeiten formatieren
            const clockInTime = formatTime(new Date(entry.clockInTime));
            const clockOutTime = entry.clockOutTime ? formatTime(new Date(entry.clockOutTime)) : '-';
            
            // Arbeitsstunden berechnen
            let workHours = '-';
            if (entry.clockOutTime) {
                const hours = (new Date(entry.clockOutTime) - new Date(entry.clockInTime)) / (1000 * 60 * 60);
                workHours = hours.toFixed(2) + 'h';
            }
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${employee.name}</td>
                <td>${date}</td>
                <td>${clockInTime}</td>
                <td>${clockOutTime}</td>
                <td>${workHours}</td>
                <td>${entry.notes || '-'}</td>
            `;
            
            timeEntriesTable.appendChild(row);
        });
        
    } catch (error) {
        console.error('Fehler beim Laden der Zeiteinträge:', error);
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="6" class="text-center">Fehler beim Laden der Zeiteinträge</td>';
        timeEntriesTable.appendChild(row);
    }
}

// Bild-Vorschau anzeigen
function showImagePreview(file, employeeName, formattedDate) {
    // Bild setzen
    previewImage.src = file.url;
    
    // Metadaten setzen
    previewDate.textContent = formattedDate;
    previewEmployee.textContent = employeeName;
    previewNotes.textContent = file.notes || 'Keine Notizen';
    
    // Modal anzeigen
    imagePreviewModal.classList.add('visible');
}

// Event-Listener für die Projektdetail-Tabs
function setupGalleryEventListeners() {
    // Tab-Umschaltung
    projectTabButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Aktiven Tab-Button setzen
            projectTabButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Aktiven Tab-Inhalt setzen
            const tabId = this.dataset.tab;
            projectTabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
    
    // Filter-Event-Listener
    setupFilterEventListeners();
}

// Event-Listener für Filter
function setupFilterEventListeners() {
    // Baustellenfotos-Filter
    sitePhotosDateFilter.addEventListener('change', function() {
        const projectId = projectDetailTitle.dataset.projectId;
        const employeeId = sitePhotosEmployeeFilter.value;
        loadProjectImages(projectId, 'construction_site', employeeId, this.value);
    });
    
    sitePhotosEmployeeFilter.addEventListener('change', function() {
        const projectId = projectDetailTitle.dataset.projectId;
        const date = sitePhotosDateFilter.value;
        loadProjectImages(projectId, 'construction_site', this.value, date);
    });
    
    clearSitePhotosFilterBtn.addEventListener('click', function() {
        sitePhotosDateFilter.value = '';
        sitePhotosEmployeeFilter.value = 'all';
        const projectId = projectDetailTitle.dataset.projectId;
        loadProjectImages(projectId, 'construction_site');
    });
    
    // Dokumente-Filter
    docsDateFilter.addEventListener('change', function() {
        const projectId = projectDetailTitle.dataset.projectId;
        const employeeId = docsEmployeeFilter.value;
        loadProjectImages(projectId, 'document', employeeId, this.value);
    });
    
    docsEmployeeFilter.addEventListener('change', function() {
        const projectId = projectDetailTitle.dataset.projectId;
        const date = docsDateFilter.value;
        loadProjectImages(projectId, 'document', this.value, date);
    });
    
    clearDocsFilterBtn.addEventListener('click', function() {
        docsDateFilter.value = '';
        docsEmployeeFilter.value = 'all';
        const projectId = projectDetailTitle.dataset.projectId;
        loadProjectImages(projectId, 'document');
    });
    
    // Zeiteinträge-Filter
    timeDateFilter.addEventListener('change', function() {
        const projectId = projectDetailTitle.dataset.projectId;
        const employeeId = timeEmployeeFilter.value;
        loadProjectTimeEntries(projectId, employeeId, this.value);
    });
    
    timeEmployeeFilter.addEventListener('change', function() {
        const projectId = projectDetailTitle.dataset.projectId;
        const date = timeDateFilter.value;
        loadProjectTimeEntries(projectId, this.value, date);
    });
    
    clearTimeFilterBtn.addEventListener('click', function() {
        timeDateFilter.value = '';
        timeEmployeeFilter.value = 'all';
        const projectId = projectDetailTitle.dataset.projectId;
        loadProjectTimeEntries(projectId);
    });
}

// 'Details anzeigen'-Button für Projekte hinzufügen
function addProjectDetailsButton(row, project) {
    const detailsBtn = document.createElement('button');
    detailsBtn.className = 'action-btn view-details-btn';
    detailsBtn.innerHTML = '<i class="fas fa-images"></i> Details';
    detailsBtn.addEventListener('click', () => {
        projectDetailTitle.dataset.projectId = project.id;
        showProjectDetails(project.id);
    });
    
    // Zum Aktionen-Container hinzufügen
    const actionsContainer = row.querySelector('.actions-container');
    if (actionsContainer) {
        actionsContainer.appendChild(detailsBtn);
    }
}

// Überschreiben der Funktion zum Laden der Projekte
async function loadProjects() {
    try {
        const projects = await DataService.getProjects();
        
        // Projekttabelle leeren
        projectsTable.innerHTML = '';
        
        // Prüfen, ob Projekte vorhanden sind
        if (projects.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="6" class="text-center">Keine Projekte vorhanden</td>';
            projectsTable.appendChild(row);
            return;
        }
        
        // Projekte nach Status und Name sortieren
        projects.sort((a, b) => {
            // Nach Status sortieren (aktiv zuerst)
            const statusOrder = { active: 0, planned: 1, completed: 2, archived: 3 };
            const statusComp = (statusOrder[a.status] || 999) - (statusOrder[b.status] || 999);
            
            if (statusComp !== 0) return statusComp;
            
            // Bei gleichem Status nach Name sortieren
            return a.name.localeCompare(b.name);
        });
        
        // Projekte in Tabelle anzeigen
        projects.forEach(project => {
            const row = document.createElement('tr');
            row.dataset.id = project.id;
            
            // Status-Klasse für Zeilenfarbe
            row.classList.add(`status-${project.status}`);
            
            // Datumsformatierung
            const startDate = project.startDate ? new Date(project.startDate).toLocaleDateString() : '-';
            const endDate = project.endDate ? new Date(project.endDate).toLocaleDateString() : '-';
            
            // Status in lesbares Format umwandeln
            const statusMap = {
                'planned': 'Geplant',
                'active': 'Aktiv',
                'completed': 'Abgeschlossen',
                'archived': 'Archiviert'
            };
            
            const statusText = statusMap[project.status] || project.status;
            
            row.innerHTML = `
                <td>${project.name}</td>
                <td>${project.client || '-'}</td>
                <td>${startDate}</td>
                <td>${endDate}</td>
                <td><span class="status ${project.status}">${statusText}</span></td>
                <td class="actions-container">
                    <button class="action-btn edit-btn" data-id="${project.id}">
                        <i class="fas fa-edit"></i> Bearbeiten
                    </button>
                    <button class="action-btn delete-btn" data-id="${project.id}">
                        <i class="fas fa-trash-alt"></i> Löschen
                    </button>
                </td>
            `;
            
            // Details-Button hinzufügen
            addProjectDetailsButton(row, project);
            
            projectsTable.appendChild(row);
        });
        
        // Event-Listener für Projekt-Aktionen hinzufügen
        addProjectActionListeners();
        
    } catch (error) {
        console.error('Fehler beim Laden der Projekte:', error);
        projectsTable.innerHTML = '<tr><td colspan="6" class="text-center">Fehler beim Laden der Projekte</td></tr>';
    }
}

// App initialisieren
document.addEventListener('DOMContentLoaded', () => {
    initAdminApp();
    initSplashScreen();
});
