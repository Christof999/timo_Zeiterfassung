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

/**
 * Konvertiert Dezimalstunden in Stunden:Minuten Format
 * @param {number} decimalHours - Stunden als Dezimalzahl (z.B. 12.88)
 * @returns {string} - Formatierte Zeit als "12:53 h"
 */
function formatHoursToHHMM(decimalHours) {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}:${minutes.toString().padStart(2, '0')} h`;
}

// Bearbeitungsmodus Variablen
let isEditModeActive = false;
let editedEntries = new Map(); // Speichert temporäre Änderungen

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
    
    // Event-Listener für den Druck-Button (initialer Button)
    const printBtnInitial = document.getElementById('print-employee-report-btn-initial');
    if (printBtnInitial && !printBtnInitial.hasAttribute('data-listener-added')) {
        printBtnInitial.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🖨️ Druck-Button geklickt (initial)');
            printEmployeeReportDirect();
        });
        printBtnInitial.setAttribute('data-listener-added', 'true');
    }
    
    // Event-Listener für den PDF-Export-Button (initialer Button)
    const pdfExportBtn = document.getElementById('export-pdf-btn');
    if (pdfExportBtn && !pdfExportBtn.hasAttribute('data-listener-added')) {
        pdfExportBtn.addEventListener('click', function(e) {
            e.preventDefault();
            // Verwende die Funktion aus pdf-export-new.js, falls verfügbar, sonst die aus employee-reports.html
            if (typeof generateEmployeeReportPDF === 'function') {
                generateEmployeeReportPDF();
            } else {
                console.error('PDF-Export-Funktion nicht gefunden');
                alert('PDF-Export-Funktion nicht verfügbar. Bitte laden Sie die Seite neu.');
            }
        });
        pdfExportBtn.setAttribute('data-listener-added', 'true');
    }
    
    // Event-Listener für den Bearbeitungsmodus-Button
    const toggleEditModeBtn = document.getElementById('toggle-edit-mode-btn');
    if (toggleEditModeBtn) {
        toggleEditModeBtn.addEventListener('click', toggleEditMode);
    }
    
    // Event-Listener für den Zurücksetzen-Button
    const resetChangesBtn = document.getElementById('reset-changes-btn');
    if (resetChangesBtn) {
        resetChangesBtn.addEventListener('click', resetAllChanges);
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
        const employees = await DataService.getAllActiveEmployees();
        
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
 * Setzt den Datumsbereich standardmäßig auf den aktuellen Monat
 */
function setDefaultDateRange() {
    // Aktuelles Datum
    const today = new Date();
    
    // Formatierung im YYYY-MM-DD Format für Date-Inputs
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Monat ist 0-basiert
    const day = String(today.getDate()).padStart(2, '0');
    
    // Von: Erster Tag des aktuellen Monats
    const startDateString = `${year}-${month}-01`;
    
    // Bis: Heutiges Datum
    const endDateString = `${year}-${month}-${day}`;
    
    const startDateInput = document.getElementById('report-start-date');
    const endDateInput = document.getElementById('report-end-date');
    
    if (startDateInput) {
        startDateInput.value = startDateString;
    }
    
    if (endDateInput) {
        endDateInput.value = endDateString;
    }
    
    console.log('Standarddatumsbereich gesetzt: Von ' + startDateString + ' bis ' + endDateString);
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
            <button id="print-employee-report-btn" class="btn secondary-btn">
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
    const exportBtn = document.getElementById('export-employee-report-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportEmployeeReport);
    }
    
    // Event-Listener für Druck-Button (dynamisch erstellter Button)
    const printBtn = document.getElementById('print-employee-report-btn');
    if (printBtn) {
        // Entferne alte Event-Listener, falls vorhanden, durch Klonen
        const newPrintBtn = printBtn.cloneNode(true);
        printBtn.parentNode.replaceChild(newPrintBtn, printBtn);
        
        newPrintBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🖨️ Druck-Button geklickt (dynamisch erstellt)');
            // Direkt window.print() aufrufen - keine Verzögerung
            printEmployeeReportDirect();
        });
    }
    
    // Event-Listener für PDF-Export-Button
    const pdfExportBtn = document.getElementById('export-pdf-btn');
    if (pdfExportBtn) {
        pdfExportBtn.addEventListener('click', function(e) {
            e.preventDefault();
            // Verwende die Funktion aus pdf-export-new.js, falls verfügbar, sonst die aus employee-reports.html
            if (typeof generateEmployeeReportPDF === 'function') {
                generateEmployeeReportPDF();
            } else {
                console.error('PDF-Export-Funktion nicht gefunden');
                alert('PDF-Export-Funktion nicht verfügbar. Bitte laden Sie die Seite neu.');
            }
        });
    }
    
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
                
                // Projekt ermitteln - Urlaubstage speziell behandeln
                let projectName = 'Unbekannt';
                if (entry.isVacationDay) {
                    projectName = 'Urlaub';
                } else {
                    const project = projectMap[entry.projectId] || { name: 'Unbekannt' };
                    projectName = project.name;
                }
                
                // Pausenzeit ermitteln (zuerst, da wir sie für die Dauerberechnung brauchen)
                let pauseTime = '-';
                let pauseTimeMs = 0;
                
                // Pausenzeit aus verschiedenen Quellen ermitteln
                if (entry.breaks && entry.breaks.length > 0) {
                    const totalPauseMinutes = entry.breaks.reduce((total, breakItem) => {
                        const start = breakItem.startTime?.toDate ? breakItem.startTime.toDate() : new Date(breakItem.startTime);
                        const end = breakItem.endTime?.toDate ? breakItem.endTime.toDate() : new Date(breakItem.endTime);
                        return total + (end - start) / (1000 * 60);
                    }, 0);
                    pauseTimeMs = totalPauseMinutes * 60 * 1000;
                    pauseTime = `${Math.floor(totalPauseMinutes / 60)}h ${Math.round(totalPauseMinutes % 60)}min`;
                } else if (entry.pauseTotalTime) {
                    // Pausenzeit in Millisekunden
                    pauseTimeMs = entry.pauseTotalTime;
                    const totalPauseMinutes = Math.floor(pauseTimeMs / (1000 * 60));
                    pauseTime = `${Math.floor(totalPauseMinutes / 60)}h ${Math.round(totalPauseMinutes % 60)}min`;
                } else if (entry.pauseMinutes) {
                    // Legacy: Pausenzeit in Minuten
                    pauseTimeMs = entry.pauseMinutes * 60 * 1000;
                    pauseTime = `${Math.floor(entry.pauseMinutes / 60)}h ${Math.round(entry.pauseMinutes % 60)}min`;
                }
                
                // Dauer berechnen - Urlaubstage haben 0 Stunden
                let duration = '-';
                let durationHours = 0;
                
                if (entry.isVacationDay) {
                    // Urlaubstag: 0 Arbeitsstunden (Steuerberater verwaltet Urlaubszeit)
                    duration = '0.00 h (Urlaub)';
                    durationHours = 0;
                } else if (clockOutTime) {
                    // Gesamtzeit minus Pausenzeit = tatsächliche Arbeitszeit
                    const totalTimeMs = clockOutTime - clockInTime;
                    const actualWorkTimeMs = totalTimeMs - pauseTimeMs;
                    durationHours = actualWorkTimeMs / (1000 * 60 * 60);
                    
                    // Negative Werte verhindern (falls Pause länger als Arbeitszeit)
                    if (durationHours < 0) durationHours = 0;
                    
                    duration = formatHoursToHHMM(durationHours);
                    totalHours += durationHours;
                }
                
                // Zeile mit Daten füllen (mit bearbeitbaren Zellen)
                const entryId = entry.id || `entry_${Date.now()}_${Math.random()}`;
                row.dataset.entryId = entryId;
                
                row.innerHTML = `
                    <td>${formatDate(clockInTime)}</td>
                    <td>${projectName}</td>
                    <td class="editable-cell time-cell" data-field="clockInTime" data-entry-id="${entryId}">${formatTime(clockInTime)}</td>
                    <td class="editable-cell time-cell" data-field="clockOutTime" data-entry-id="${entryId}">${clockOutTime ? formatTime(clockOutTime) : '-'}</td>
                    <td class="duration-cell">${duration}</td>
                    <td class="editable-cell pause-cell" data-field="pauseTime" data-entry-id="${entryId}">${pauseTime}</td>
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
            <p><strong>Gesamtstunden:</strong> ${formatHoursToHHMM(totalHours)}</p>
            <p><strong>Anzahl Einträge:</strong> ${currentReportEntries.length}</p>
        `;
        
        // Export-Button aktivieren
        const exportReportBtn = document.getElementById('export-employee-report-btn');
        if (exportReportBtn) {
            exportReportBtn.disabled = currentReportEntries.length === 0;
        }
        
        // Bearbeitungsmodus-Button anzeigen
        const toggleEditModeBtn = document.getElementById('toggle-edit-mode-btn');
        if (toggleEditModeBtn) {
            toggleEditModeBtn.style.display = currentReportEntries.length > 0 ? 'inline-block' : 'none';
        }
        
        // Bearbeitungsmodus zurücksetzen
        isEditModeActive = false;
        editedEntries.clear();
        updateEditModeUI();
        
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
                
                // Pausenzeit berechnen (zuerst, da wir sie für die Dauerberechnung brauchen)
                let pauseTime = '';
                let pauseTimeMs = 0;
                
                if (entry.breaks && entry.breaks.length > 0) {
                    const totalPauseMinutes = entry.breaks.reduce((total, breakItem) => {
                        const start = breakItem.startTime?.toDate ? breakItem.startTime.toDate() : new Date(breakItem.startTime);
                        const end = breakItem.endTime?.toDate ? breakItem.endTime.toDate() : new Date(breakItem.endTime);
                        return total + (end - start) / (1000 * 60);
                    }, 0);
                    pauseTimeMs = totalPauseMinutes * 60 * 1000;
                    pauseTime = `${Math.floor(totalPauseMinutes / 60)}h ${Math.round(totalPauseMinutes % 60)}min`;
                } else if (entry.pauseTotalTime) {
                    // Pausenzeit in Millisekunden
                    pauseTimeMs = entry.pauseTotalTime;
                    const totalPauseMinutes = Math.floor(pauseTimeMs / (1000 * 60));
                    pauseTime = `${Math.floor(totalPauseMinutes / 60)}h ${Math.round(totalPauseMinutes % 60)}min`;
                } else if (entry.pauseMinutes) {
                    // Legacy: Pausenzeit in Minuten
                    pauseTimeMs = entry.pauseMinutes * 60 * 1000;
                    pauseTime = `${Math.floor(entry.pauseMinutes / 60)}h ${Math.round(entry.pauseMinutes % 60)}min`;
                }
                
                // Dauer berechnen - Urlaubstage haben 0 Stunden, Pausenzeit wird abgezogen
                let duration = '';
                if (entry.isVacationDay) {
                    // Urlaubstag: 0 Arbeitsstunden
                    duration = '0.00 (Urlaub)';
                } else if (clockOutTime) {
                    // Gesamtzeit minus Pausenzeit = tatsächliche Arbeitszeit
                    const totalTimeMs = clockOutTime - clockInTime;
                    const actualWorkTimeMs = totalTimeMs - pauseTimeMs;
                    let durationHours = actualWorkTimeMs / (1000 * 60 * 60);
                    
                    // Negative Werte verhindern
                    if (durationHours < 0) durationHours = 0;
                    
                    duration = durationHours.toFixed(2);
                }
                
                // Projektname - Urlaubstage speziell behandeln
                const projectId = entry.isVacationDay ? 'Urlaub' : (entry.projectId || '');
                
                return [
                    formatDate(clockInTime),
                    projectId, // Wird später durch den Projektnamen ersetzt (außer bei "Urlaub")
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
                
                // Projekt-IDs durch Namen ersetzen (außer "Urlaub")
                csvData.forEach(row => {
                    const projectId = row[1];
                    if (projectId !== 'Urlaub') {
                        row[1] = projectMap[projectId] || 'Unbekannt';
                    }
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
                csvContent += `Gesamtstunden;${formatHoursToHHMM(totalHours)}\n`;
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

/**
 * Schaltet den Bearbeitungsmodus ein/aus
 */
function toggleEditMode() {
    isEditModeActive = !isEditModeActive;
    updateEditModeUI();
    
    if (isEditModeActive) {
        setupEditableTable();
    } else {
        removeEditableTable();
    }
}

/**
 * Aktualisiert die Benutzeroberfläche basierend auf dem Bearbeitungsmodus
 */
function updateEditModeUI() {
    const toggleBtn = document.getElementById('toggle-edit-mode-btn');
    const instructions = document.getElementById('edit-instructions');
    
    if (toggleBtn) {
        if (isEditModeActive) {
            toggleBtn.innerHTML = '<i class="fas fa-times"></i> Bearbeiten deaktivieren';
            toggleBtn.classList.add('active');
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-edit"></i> Bearbeiten aktivieren';
            toggleBtn.classList.remove('active');
        }
    }
    
    if (instructions) {
        if (isEditModeActive) {
            instructions.classList.add('show');
        } else {
            instructions.classList.remove('show');
        }
    }
}

/**
 * Macht die Tabelle bearbeitbar
 */
function setupEditableTable() {
    const editableCells = document.querySelectorAll('.editable-cell');
    
    editableCells.forEach(cell => {
        cell.addEventListener('click', handleCellClick);
    });
}

/**
 * Entfernt die Bearbeitbarkeit von der Tabelle
 */
function removeEditableTable() {
    const editableCells = document.querySelectorAll('.editable-cell');
    
    editableCells.forEach(cell => {
        cell.removeEventListener('click', handleCellClick);
        cell.classList.remove('editing');
    });
}

/**
 * Behandelt Klicks auf bearbeitbare Zellen
 */
function handleCellClick(event) {
    if (!isEditModeActive) return;
    
    const cell = event.target;
    const field = cell.dataset.field;
    const entryId = cell.dataset.entryId;
    
    if (cell.classList.contains('editing')) return;
    
    const currentValue = cell.textContent.trim();
    cell.classList.add('editing');
    
    let inputElement;
    
    if (field === 'pauseTime') {
        // Für Pausenzeit: Eingabe in Minuten
        const currentMinutes = parsePauseTimeToMinutes(currentValue);
        inputElement = document.createElement('input');
        inputElement.type = 'number';
        inputElement.min = '0';
        inputElement.max = '480'; // Max 8 Stunden Pause
        inputElement.step = '1';
        inputElement.value = currentMinutes;
        inputElement.placeholder = 'Minuten (z.B. 30 für 30min)';
        inputElement.title = 'Pausenzeit in Minuten eingeben (z.B. 30 für 30min, 90 für 1h 30min)';
    } else {
        // Für Zeit-Felder: HH:MM Format
        inputElement = document.createElement('input');
        inputElement.type = 'time';
        inputElement.value = currentValue !== '-' ? currentValue : '';
    }
    
    inputElement.addEventListener('blur', () => finishEditing(cell, inputElement, field, entryId));
    inputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            finishEditing(cell, inputElement, field, entryId);
        } else if (e.key === 'Escape') {
            cancelEditing(cell, currentValue);
        }
    });
    
    cell.innerHTML = '';
    cell.appendChild(inputElement);
    inputElement.focus();
}

/**
 * Beendet die Bearbeitung einer Zelle
 */
function finishEditing(cell, inputElement, field, entryId) {
    const newValue = inputElement.value.trim();
    let displayValue;
    
    if (field === 'pauseTime') {
        const minutes = parseInt(newValue) || 0;
        if (minutes > 0) {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            if (hours > 0 && remainingMinutes > 0) {
                displayValue = `${hours}h ${remainingMinutes}min`;
            } else if (hours > 0) {
                displayValue = `${hours}h`;
            } else {
                displayValue = `${remainingMinutes}min`;
            }
        } else {
            displayValue = '-';
        }
    } else {
        displayValue = newValue || '-';
    }
    
    cell.classList.remove('editing');
    cell.innerHTML = displayValue;
    
    // Änderung speichern
    if (!editedEntries.has(entryId)) {
        editedEntries.set(entryId, {});
    }
    editedEntries.get(entryId)[field] = newValue;
    
    // Zeile als bearbeitet markieren
    const row = cell.closest('tr');
    row.classList.add('edited-entry');
    
    // Indikator hinzufügen
    if (!cell.querySelector('.edit-indicator')) {
        const indicator = document.createElement('div');
        indicator.className = 'edit-indicator';
        cell.appendChild(indicator);
    }
    
    // Dauer neu berechnen wenn Zeit oder Pause geändert wurde
    if (field === 'clockInTime' || field === 'clockOutTime' || field === 'pauseTime') {
        recalculateDuration(row, entryId);
    }
    
    // Gesamtstunden neu berechnen
    recalculateTotalHours();
    
    // Reset-Button anzeigen/verstecken
    updateResetButton();
}

/**
 * Bricht die Bearbeitung ab
 */
function cancelEditing(cell, originalValue) {
    cell.classList.remove('editing');
    cell.innerHTML = originalValue;
}

/**
 * Berechnet die Dauer einer Zeile neu
 */
function recalculateDuration(row, entryId) {
    const clockInCell = row.querySelector('[data-field="clockInTime"]');
    const clockOutCell = row.querySelector('[data-field="clockOutTime"]');
    const pauseCell = row.querySelector('[data-field="pauseTime"]');
    const durationCell = row.querySelector('.duration-cell');
    
    const clockInText = clockInCell.textContent.trim();
    const clockOutText = clockOutCell.textContent.trim();
    const pauseText = pauseCell ? pauseCell.textContent.trim() : '-';
    
    if (clockInText !== '-' && clockOutText !== '-') {
        try {
            const clockInTime = parseTimeString(clockInText);
            const clockOutTime = parseTimeString(clockOutText);
            
            if (clockInTime && clockOutTime) {
                let totalTimeMs = clockOutTime - clockInTime;
                
                // Behandlung von Tageswechseln (negative Dauer bedeutet Übernachtarbeit)
                if (totalTimeMs < 0) {
                    totalTimeMs += 24 * 60 * 60 * 1000; // Füge 24 Stunden hinzu für Tageswechsel
                }
                
                // Pausenzeit auslesen und abziehen
                let pauseTimeMs = 0;
                if (pauseText !== '-') {
                    // Pausenzeit im Format "Xh Ymin" parsen
                    const pauseMatch = pauseText.match(/(\d+)h\s*(\d+)min/);
                    if (pauseMatch) {
                        const hours = parseInt(pauseMatch[1]) || 0;
                        const minutes = parseInt(pauseMatch[2]) || 0;
                        pauseTimeMs = (hours * 60 + minutes) * 60 * 1000;
                    }
                }
                
                // Tatsächliche Arbeitszeit = Gesamtzeit - Pausenzeit
                const actualWorkTimeMs = totalTimeMs - pauseTimeMs;
                let durationHours = actualWorkTimeMs / (1000 * 60 * 60);
                
                // Negative Werte verhindern
                if (durationHours < 0) durationHours = 0;
                
                const displayDuration = durationHours > 0 ? formatHoursToHHMM(durationHours) : '-';
                durationCell.textContent = displayDuration;
            }
        } catch (error) {
            console.error('Fehler bei Dauerberechnung:', error);
            durationCell.textContent = '-';
        }
    } else {
        durationCell.textContent = '-';
    }
}

/**
 * Berechnet die Gesamtstunden neu
 */
function recalculateTotalHours() {
    const durationCells = document.querySelectorAll('.duration-cell');
    let total = 0;
    
    durationCells.forEach(cell => {
        const text = cell.textContent.trim();
        if (text !== '-' && !text.includes('Urlaub')) {
            // Format kann sein: "12:53 h" oder "12.88 h" (Legacy)
            const timeMatch = text.match(/(\d+):(\d+)\s*h/);
            if (timeMatch) {
                // Neues Format: "12:53 h"
                const hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                total += hours + (minutes / 60);
            } else {
                // Legacy Format: "12.88 h"
                const hours = parseFloat(text.replace(' h', ''));
                if (!isNaN(hours)) {
                    total += hours;
                }
            }
        }
    });
    
    // Zusammenfassung aktualisieren
    const reportSummary = document.getElementById('employee-report-summary');
    if (reportSummary) {
        reportSummary.innerHTML = `
            <p><strong>Gesamtstunden:</strong> ${formatHoursToHHMM(total)}</p>
            <p><strong>Anzahl Einträge:</strong> ${currentReportEntries.length}</p>
            ${editedEntries.size > 0 ? `<p><strong>Bearbeitete Einträge:</strong> ${editedEntries.size}</p>` : ''}
        `;
    }
}

/**
 * Parst eine Zeit-String zu einem Date-Objekt (heute)
 */
function parseTimeString(timeStr) {
    if (!timeStr || timeStr === '-') return null;
    
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
}

/**
 * Parst Pausenzeit zu Minuten
 * Unterstützt Formate: "1h 30min", "90min", "1,5h", "90"
 */
function parsePauseTimeToMinutes(pauseStr) {
    if (!pauseStr || pauseStr === '-') return 0;
    
    // Entferne Leerzeichen für einfachere Verarbeitung
    const cleanStr = pauseStr.replace(/\s+/g, '');
    
    // Format: "1h30min" oder "1h 30min"
    const hourMinMatch = cleanStr.match(/(\d+)h(\d+)min/);
    if (hourMinMatch) {
        const hours = parseInt(hourMinMatch[1]);
        const minutes = parseInt(hourMinMatch[2]);
        return hours * 60 + minutes;
    }
    
    // Format: "1h" 
    const hourMatch = cleanStr.match(/^(\d+)h$/);
    if (hourMatch) {
        return parseInt(hourMatch[1]) * 60;
    }
    
    // Format: "30min"
    const minuteMatch = cleanStr.match(/^(\d+)min$/);
    if (minuteMatch) {
        return parseInt(minuteMatch[1]);
    }
    
    // Format: "1,5h" oder "1.5h" (Dezimalstunden)
    const decimalHourMatch = cleanStr.match(/^(\d+[,.]?\d*)h$/);
    if (decimalHourMatch) {
        const hours = parseFloat(decimalHourMatch[1].replace(',', '.'));
        return Math.round(hours * 60);
    }
    
    // Format: Nur Zahl (wird als Minuten interpretiert)
    const numberMatch = cleanStr.match(/^\d+$/);
    if (numberMatch) {
        return parseInt(cleanStr);
    }
    
    // Fallback: Versuche alte Parsing-Methode
    const oldHourMatch = pauseStr.match(/(\d+)h/);
    const oldMinuteMatch = pauseStr.match(/(\d+)min/);
    
    const hours = oldHourMatch ? parseInt(oldHourMatch[1]) : 0;
    const minutes = oldMinuteMatch ? parseInt(oldMinuteMatch[1]) : 0;
    
    return hours * 60 + minutes;
}

/**
 * Setzt alle Änderungen zurück
 */
function resetAllChanges() {
    if (!confirm('Möchten Sie wirklich alle Änderungen zurücksetzen?')) {
        return;
    }
    
    // Editierte Einträge löschen
    editedEntries.clear();
    
    // Bericht neu generieren
    generateEmployeeReport();
}

/**
 * Aktualisiert die Sichtbarkeit des Reset-Buttons
 */
function updateResetButton() {
    const resetBtn = document.getElementById('reset-changes-btn');
    if (resetBtn) {
        resetBtn.style.display = editedEntries.size > 0 ? 'inline-block' : 'none';
    }
}

/**
 * Direkte Druckfunktion ohne Verzögerung
 */
function printEmployeeReportDirect() {
    // Prüfen, ob Berichtsdaten vorhanden sind
    if (!currentReportEntries || currentReportEntries.length === 0) {
        alert('Keine Daten zum Drucken vorhanden.');
        return;
    }
    
    // Stelle sicher, dass die Tabelle in Desktop-Ansicht ist
    const reportTable = document.getElementById('employee-report-table');
    if (reportTable) {
        // Entferne mobile Klassen
        reportTable.classList.remove('accordion-enabled');
        // Stelle sicher, dass die Tabelle als Tabelle angezeigt wird
        reportTable.style.display = 'table';
        reportTable.style.width = '100%';
        
        // Stelle sicher, dass alle Zeilen korrekt angezeigt werden
        const rows = reportTable.querySelectorAll('tr');
        rows.forEach(row => {
            row.style.display = 'table-row';
            row.style.margin = '0';
            row.style.padding = '0';
        });
        
        const cells = reportTable.querySelectorAll('td, th');
        cells.forEach(cell => {
            cell.style.display = 'table-cell';
            cell.style.position = 'static';
        });
    }
    
    // Direkt drucken - keine Verzögerung, keine Animation
    window.print();
}

/**
 * Druckt den Bericht - vereinfachte Version für Desktop-Ansicht
 * (Kompatibilitätsfunktion für onclick-Attribute)
 */
function printEmployeeReport() {
    printEmployeeReportDirect();
}

// Funktionen global verfügbar machen
window.printEmployeeReport = printEmployeeReport;
window.printEmployeeReportDirect = printEmployeeReportDirect;
