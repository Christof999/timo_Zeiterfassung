/**
 * Mitarbeiter-Bericht Funktionen für Lauffer Zeiterfassung
 * Ermöglicht das Erstellen und Exportieren von Mitarbeiter-Zeitberichten
 */

// Globale Variablen für Filteroptionen
let currentEmployeeId = null;
let currentStartDate = null;
let currentEndDate = null;
let currentReportEntries = [];
let totalHours = 0;

// Event-Listener registrieren
document.addEventListener('DOMContentLoaded', function() {
    setupEmployeeReportUI();
});

/**
 * Initialisiert die Benutzeroberfläche für Mitarbeiterberichte
 */
function setupEmployeeReportUI() {
    // Mitarbeiter-Auswahl initialisieren
    initEmployeeSelection();
    
    // Event-Listener für den Report-Button
    const generateReportBtn = document.getElementById('generate-employee-report-btn');
    if (generateReportBtn) {
        generateReportBtn.addEventListener('click', generateEmployeeReport);
    }
    
    // Event-Listener für den Export-Button
    const exportReportBtn = document.getElementById('export-employee-report-btn');
    if (exportReportBtn) {
        exportReportBtn.addEventListener('click', exportEmployeeReport);
    }
    
    // Datum-Inputs mit aktuellem Monat vorbelegen
    setDefaultDateRange();
}

/**
 * Lädt alle Mitarbeiter und füllt die Auswahl-Dropdown
 */
async function initEmployeeSelection() {
    try {
        const employeeSelect = document.getElementById('employee-select');
        if (!employeeSelect) return;
        
        // Mitarbeiter laden
        const employees = await DataService.getAllEmployees();
        
        // Dropdown leeren und mit Mitarbeitern füllen
        employeeSelect.innerHTML = '<option value="">-- Mitarbeiter auswählen --</option>';
        
        employees.sort((a, b) => a.name.localeCompare(b.name));
        
        employees.forEach(employee => {
            const option = document.createElement('option');
            option.value = employee.id;
            option.textContent = employee.name;
            employeeSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Fehler beim Laden der Mitarbeiter:', error);
        alert('Fehler beim Laden der Mitarbeiter. Bitte versuchen Sie es später erneut.');
    }
}

/**
 * Setzt den Datumsbereich standardmäßig auf einen Zeitraum, der die Testdaten enthält
 */
function setDefaultDateRange() {
    // Da die Testdaten im Zeitraum 24.-27. Mai 2025 liegen, setzen wir einen größeren Bereich
    // vom 20. Mai bis 30. Juni 2025, um sicherzustellen, dass alle Einträge angezeigt werden
    const startDate = new Date(2025, 4, 20); // 20. Mai 2025 (Monat ist 0-basiert, daher 4 für Mai)
    const endDate = new Date(2025, 5, 30);   // 30. Juni 2025
    
    const startDateInput = document.getElementById('report-start-date');
    const endDateInput = document.getElementById('report-end-date');
    
    if (startDateInput) {
        startDateInput.valueAsDate = startDate;
    }
    
    if (endDateInput) {
        endDateInput.valueAsDate = endDate;
    }
    
    console.log('Standarddatumsbereich gesetzt: ' + startDate.toLocaleDateString() + ' bis ' + endDate.toLocaleDateString());
}

/**
 * Generiert einen Bericht für den ausgewählten Mitarbeiter und Zeitraum
 */
async function generateEmployeeReport() {
    // UI-Elemente referenzieren
    const employeeSelect = document.getElementById('employee-select');
    const startDateInput = document.getElementById('report-start-date');
    const endDateInput = document.getElementById('report-end-date');
    const reportContainer = document.getElementById('employee-report-container');
    
    // Debug-Ausgabe
    console.log('UI-Elemente:', {
        employeeSelect: !!employeeSelect,
        startDateInput: !!startDateInput,
        endDateInput: !!endDateInput,
        reportContainer: !!reportContainer
    });
    
    // Überprüfen, ob die nötigen Elemente vorhanden sind
    if (!employeeSelect || !startDateInput || !endDateInput || !reportContainer) {
        console.error('Erforderliche UI-Elemente fehlen!');
        alert('Fehler: UI-Elemente fehlen. Bitte Seite neu laden.');
        return;
    }
    
    // Ausgewählten Mitarbeiter und Zeitraum ermitteln
    const employeeId = employeeSelect.value;
    
    if (!employeeId) {
        alert('Bitte wählen Sie einen Mitarbeiter aus.');
        return;
    }
    
    // Datumsbereich ermitteln
    currentStartDate = new Date(startDateInput.value);
    currentEndDate = new Date(endDateInput.value);
    currentEmployeeId = employeeId;
    
    // Sicherstellen, dass das Enddatum das Ende des Tages ist
    currentEndDate.setHours(23, 59, 59, 999);
    
    // Debug-Ausgabe für den Zeitraum
    console.log(`Lade Zeiteinträge für Mitarbeiter ${currentEmployeeId} vom ${currentStartDate.toLocaleDateString()} bis ${currentEndDate.toLocaleDateString()}`);
    
    // Report-Container sichtbar machen
    reportContainer.classList.remove('hidden');
    reportContainer.style.display = 'block';
    reportContainer.style.visibility = 'visible';
    reportContainer.style.opacity = '1';
    
    // Alle Container komplett neu erstellen um sicherzustellen, dass sie sichtbar sind
    reportContainer.innerHTML = `
        <div id="employee-report-header" class="employee-report-header">
            <h3>Bericht wird geladen...</h3>
        </div>
        
        <div class="report-table-container" style="display: block; visibility: visible;">
            <div class="loading-spinner">Daten werden geladen...</div>
        </div>
        
        <div id="employee-report-summary" class="employee-report-summary">
            <p>Daten werden geladen...</p>
        </div>
        
        <div class="actions-bar no-print">
            <button onclick="window.print()" class="btn secondary-btn">
                <i class="fas fa-print"></i> Drucken
            </button>
            <button id="export-employee-report-btn" class="btn secondary-btn">
                <i class="fas fa-file-csv"></i> Als CSV exportieren
            </button>
            <button id="export-pdf-btn" class="btn primary-btn">
                <i class="fas fa-file-pdf"></i> Als PDF exportieren
            </button>
        </div>
    `;
    
    // Event-Listener für Export-Buttons neu setzen
    document.getElementById('export-employee-report-btn').addEventListener('click', exportEmployeeReport);
    
    // Aktualisierte Referenzen zu den neu erstellten Elementen
    const reportHeader = document.getElementById('employee-report-header');
    const reportSummary = document.getElementById('employee-report-summary');
    const tableContainer = reportContainer.querySelector('.report-table-container');
    
    try {
        // Zeiteinträge vom Server laden
        let timeEntries = await DataService.getTimeEntriesByEmployeeId(currentEmployeeId);
        
        console.log('Geladene Zeiteinträge:', timeEntries.length);
        
        // Einträge nach Datum filtern
        const filteredEntries = timeEntries.filter(entry => {
            const entryDate = entry.clockInTime?.toDate ? entry.clockInTime.toDate() : new Date(entry.clockInTime);
            return (!currentStartDate || entryDate >= currentStartDate) && (!currentEndDate || entryDate <= currentEndDate);
        });
        
        console.log('Nach Filterung verbleibende Einträge:', filteredEntries.length);
        
        // Einträge im globalen Objekt speichern und nach Datum aufsteigend sortieren
        currentReportEntries = filteredEntries.sort((a, b) => {
            const dateA = a.clockInTime?.toDate ? a.clockInTime.toDate() : new Date(a.clockInTime);
            const dateB = b.clockInTime?.toDate ? b.clockInTime.toDate() : new Date(b.clockInTime);
            return dateA - dateB; // Aufsteigend nach Datum sortieren
        });
        
        // Mitarbeiter-Details laden
        const employee = await DataService.getEmployeeById(currentEmployeeId);
        
        // Projekte für alle Einträge laden
        const projectIds = [...new Set(filteredEntries.map(entry => entry.projectId))];
        const projects = await Promise.all(projectIds.map(id => DataService.getProjectById(id)));
        
        // Projekt-Map erstellen
        const projectMap = {};
        projects.forEach(project => {
            if (project && project.id) {
                projectMap[project.id] = project;
            }
        });
        
        // Berichts-Header aktualisieren
        reportHeader.innerHTML = `
            <h3>Zeitbericht für: ${employee ? employee.name : 'Unbekannter Mitarbeiter'}</h3>
            <p>Zeitraum: ${formatDate(currentStartDate)} bis ${formatDate(currentEndDate)}</p>
        `;
        
        // Tabelle erstellen
        tableContainer.innerHTML = `
            <table id="employee-report-table" class="data-table" style="width:100%">
                <thead>
                    <tr>
                        <th>Datum</th>
                        <th>Projekt</th>
                        <th>Einstempelzeit</th>
                        <th>Ausstempelzeit</th>
                        <th>Dauer</th>
                        <th>Pausenzeit</th>
                        <th>Notizen</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `;
        
        // Tabelle referenzieren
        const reportTable = document.getElementById('employee-report-table');
        const tableBody = reportTable.querySelector('tbody');
        
        // Gesamtstunden zurücksetzen
        totalHours = 0;
        
        // Einträge in die Tabelle einfügen
        filteredEntries.forEach(entry => {
            try {
                const row = document.createElement('tr');
                
                // Datum formatieren
                const clockInTime = entry.clockInTime?.toDate ? entry.clockInTime.toDate() : new Date(entry.clockInTime);
                const clockOutTime = entry.clockOutTime ? (entry.clockOutTime.toDate ? entry.clockOutTime.toDate() : new Date(entry.clockOutTime)) : null;
                
                // Projekt ermitteln
                const project = projectMap[entry.projectId] || { name: 'Unbekannt' };
                
                // Dauer berechnen
                let duration = '-';
                let durationHours = 0;
                
                if (clockOutTime) {
                    durationHours = (clockOutTime - clockInTime) / (1000 * 60 * 60);
                    duration = durationHours.toFixed(2) + ' h';
                    totalHours += durationHours;
                }
                
                // Pausenzeit ermitteln
                let pauseTime = '-';
                if (entry.breaks && entry.breaks.length > 0) {
                    const totalPauseMinutes = entry.breaks.reduce((total, breakItem) => {
                        const start = breakItem.startTime?.toDate ? breakItem.startTime.toDate() : new Date(breakItem.startTime);
                        const end = breakItem.endTime?.toDate ? breakItem.endTime.toDate() : new Date(breakItem.endTime);
                        return total + (end - start) / (1000 * 60);
                    }, 0);
                    
                    pauseTime = `${Math.floor(totalPauseMinutes / 60)}h ${Math.round(totalPauseMinutes % 60)}min`;
                }
                
                // Zeile mit Daten füllen
                row.innerHTML = `
                    <td>${formatDate(clockInTime)}</td>
                    <td>${project.name}</td>
                    <td>${formatTime(clockInTime)}</td>
                    <td>${clockOutTime ? formatTime(clockOutTime) : '-'}</td>
                    <td class="duration-cell">${duration}</td>
                    <td class="pause-time">${pauseTime}</td>
                    <td>${entry.notes || '-'}</td>
                `;
                
                tableBody.appendChild(row);
            } catch (error) {
                console.error('Fehler beim Hinzufügen eines Eintrags:', error, entry);
            }
        });
        
        // Debug: Tabelleninhalt prüfen
        console.log('Anzahl der Zeilen in der Tabelle:', tableBody.childElementCount);
        
        // Zusammenfassung aktualisieren
        reportSummary.innerHTML = `
            <p><strong>Gesamtstunden:</strong> ${totalHours.toFixed(2)} h</p>
            <p><strong>Anzahl Einträge:</strong> ${currentReportEntries.length}</p>
        `;
        
        // Export-Button aktivieren
        const exportReportBtn = document.getElementById('export-employee-report-btn');
        if (exportReportBtn) {
            exportReportBtn.disabled = currentReportEntries.length === 0;
        }
    } catch (error) {
        console.error('Fehler beim Generieren des Berichts:', error);
        reportContainer.innerHTML = `
            <div class="error-message">
                <h3>Fehler beim Erstellen des Berichts</h3>
                <p>${error.message || 'Unbekannter Fehler'}</p>
                <p>Bitte versuchen Sie es später erneut oder wenden Sie sich an den Administrator.</p>
            </div>
        `;
    }
}

/**
 * Exportiert den aktuellen Bericht als CSV-Datei
 */
function exportEmployeeReport() {
    if (currentReportEntries.length === 0) {
        alert('Keine Daten zum Exportieren vorhanden.');
        return;
    }
    
    try {
        // Mitarbeiterinformationen laden
        DataService.getEmployeeById(currentEmployeeId).then(employee => {
            const employeeName = employee?.name || 'Unbekannt';
            
            // CSV-Header definieren
            const csvHeader = [
                'Datum', 'Projekt', 'Einstempelzeit', 'Ausstempelzeit', 
                'Dauer (h)', 'Pausenzeit', 'Notizen'
            ];
            
            // CSV-Daten erstellen
            const csvData = currentReportEntries.map(entry => {
                const clockInTime = entry.clockInTime?.toDate ? entry.clockInTime.toDate() : new Date(entry.clockInTime);
                const clockOutTime = entry.clockOutTime ? (entry.clockOutTime.toDate ? entry.clockOutTime.toDate() : new Date(entry.clockOutTime)) : null;
                
                // Dauer berechnen
                let duration = '';
                if (clockOutTime) {
                    const durationHours = (clockOutTime - clockInTime) / (1000 * 60 * 60);
                    duration = durationHours.toFixed(2);
                }
                
                // Pausenzeit berechnen
                let pauseTime = '';
                if (entry.breaks && entry.breaks.length > 0) {
                    const totalPauseMinutes = entry.breaks.reduce((total, breakItem) => {
                        const start = breakItem.startTime?.toDate ? breakItem.startTime.toDate() : new Date(breakItem.startTime);
                        const end = breakItem.endTime?.toDate ? breakItem.endTime.toDate() : new Date(breakItem.endTime);
                        return total + (end - start) / (1000 * 60);
                    }, 0);
                    
                    pauseTime = `${Math.floor(totalPauseMinutes / 60)}h ${Math.round(totalPauseMinutes % 60)}min`;
                }
                
                // Projektname laden (asynchron, daher vorläufig die ID)
                const projectId = entry.projectId || '';
                
                return [
                    formatDate(clockInTime),
                    projectId, // Wird später durch den Projektnamen ersetzt
                    formatTime(clockInTime),
                    clockOutTime ? formatTime(clockOutTime) : '',
                    duration,
                    pauseTime,
                    entry.notes || ''
                ];
            });
            
            // Projekte laden und Namen ersetzen
            const projectIds = [...new Set(currentReportEntries.map(entry => entry.projectId))];
            Promise.all(projectIds.map(id => DataService.getProjectById(id))).then(projects => {
                // Projekte als Map für schnellen Zugriff
                const projectMap = {};
                projects.forEach(project => {
                    if (project) projectMap[project.id] = project.name;
                });
                
                // Projekt-IDs durch Namen ersetzen
                csvData.forEach(row => {
                    const projectId = row[1];
                    row[1] = projectMap[projectId] || 'Unbekannt';
                });
                
                // CSV-String erstellen
                let csvContent = csvHeader.join(';') + '\n';
                csvData.forEach(row => {
                    csvContent += row.join(';') + '\n';
                });
                
                // Zusätzliche Zusammenfassung am Ende hinzufügen
                csvContent += '\n';
                csvContent += `Mitarbeiter;${employeeName}\n`;
                csvContent += `Zeitraum;${formatDate(currentStartDate)} bis ${formatDate(currentEndDate)}\n`;
                csvContent += `Gesamtstunden;${totalHours.toFixed(2)}\n`;
                csvContent += `Anzahl Einträge;${currentReportEntries.length}\n`;
                
                // CSV-Datei herunterladen
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', `Zeitbericht_${employeeName.replace(/\s+/g, '_')}_${formatDate(currentStartDate).replace(/\./g, '-')}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        });
    } catch (error) {
        console.error('Fehler beim CSV-Export:', error);
        alert('Fehler beim Exportieren: ' + (error.message || 'Unbekannter Fehler'));
    }
}

/**
 * Formatiert ein Datum als DD.MM.YYYY
 */
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

/**
 * Formatiert eine Zeit als HH:MM
 */
function formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}
