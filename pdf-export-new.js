/**
 * PDF Export-Funktionalität für Lauffer Zeiterfassung
 * Erstellt PDFs mit Projekt- und Zeitinformationen, Bildern und Dokumenten
 */

// Hilfsfunktion zum Konvertieren von Bildern in Data-URLs
function imageToDataUrl(img) {
    return new Promise((resolve, reject) => {
        try {
            // Bereits eine Data-URL?
            if (img.src.startsWith('data:')) {
                resolve(img.src);
                return;
            }
            
            // Bei Firebase-Storage-URLs: Direkt Fallback-Bild verwenden wegen CORS
            if (img.src.includes('firebasestorage.googleapis.com')) {
                console.log('Firebase-Bild erkannt, verwende Fallback wegen CORS:', img.alt || 'Bild');
                // Fallback-Bild mit Beschriftung
                const altText = img.alt || 'Bild wurde aufgrund von Browser-Einstellungen blockiert';
                resolve(`data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#f5f5f5"/><text x="50%" y="50%" font-size="14" text-anchor="middle" alignment-baseline="middle" fill="#666">' + altText + '</text></svg>')}`);
                return;
            }
            
            // Erstelle ein Canvas-Element
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Handler für erfolgreiches Laden
            const onLoad = function() {
                canvas.width = this.naturalWidth || this.width || 300;
                canvas.height = this.naturalHeight || this.height || 200;
                
                try {
                    // Bild auf Canvas zeichnen
                    ctx.drawImage(this, 0, 0);
                    
                    // Canvas als Data-URL konvertieren
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    resolve(dataUrl);
                } catch (e) {
                    console.warn('Fehler beim Konvertieren zu Data-URL:', e);
                    // Fallback-Bild zurückgeben
                    resolve('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgMjAwIDIwMCI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNlZWUiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIxOCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgYWxpZ25tZW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiNhYWEiPkJpbGQga29ubnRlIG5pY2h0IGdlbGFkZW4gd2VyZGVuPC90ZXh0Pjwvc3ZnPg==');
                }
            };
            
            // Handler für Fehler
            const onError = function() {
                console.warn('Fehler beim Laden des Bildes:', img.src);
                // Fallback-Bild zurückgeben
                resolve('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgMjAwIDIwMCI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNlZWUiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIxOCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgYWxpZ25tZW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiNhYWEiPkJpbGQga29ubnRlIG5pY2h0IGdlbGFkZW4gd2VyZGVuPC90ZXh0Pjwvc3ZnPg==');
            };
            
            // Neues Bild erstellen und mit Quell-URL laden
            const imgObj = new Image();
            imgObj.crossOrigin = 'Anonymous'; // Wichtig für CORS
            imgObj.onload = onLoad;
            imgObj.onerror = onError;
            
            // Timestamp an URL anhängen, um Cache-Probleme zu vermeiden
            const imgSrc = img.src.includes('?') ? 
                `${img.src}&t=${new Date().getTime()}` : 
                `${img.src}?t=${new Date().getTime()}`;
            
            // Bild laden
            imgObj.src = imgSrc;
        } catch (error) {
            console.error('Fehler beim Konvertieren des Bildes:', error);
            // Bei Fehler immer noch ein Fallback-Bild liefern
            resolve('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgMjAwIDIwMCI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNlZWUiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIxOCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgYWxpZ25tZW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiNhYWEiPkZlaGxlciBiZWltIExhZGVuPC90ZXh0Pjwvc3ZnPg==');
        }
    });
}

// PDF Export-Funktion
async function generatePDF() {
    // Debugging-Info ausgeben
    console.log('PDF-Export wird gestartet...');
    
    // Ladeindikator erstellen
    const loadingIndicator = document.createElement('div');
    loadingIndicator.style.position = 'fixed';
    loadingIndicator.style.top = '0';
    loadingIndicator.style.left = '0';
    loadingIndicator.style.width = '100%';
    loadingIndicator.style.height = '100%';
    loadingIndicator.style.backgroundColor = 'rgba(0,0,0,0.7)';
    loadingIndicator.style.display = 'flex';
    loadingIndicator.style.justifyContent = 'center';
    loadingIndicator.style.alignItems = 'center';
    loadingIndicator.style.zIndex = '9999';
    loadingIndicator.innerHTML = '<div style="background-color: white; padding: 20px; border-radius: 5px; text-align: center;"><h3>PDF wird erstellt...</h3><p>Bitte warten Sie, die Bilder werden vorbereitet...</p></div>';
    document.body.appendChild(loadingIndicator);
    
    try {
        // Exportbutton während der Erstellung ausblenden
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            exportBtn.style.display = 'none';
        }
        
        // WICHTIG: Prüfen, ob der PDF-Inhalt vorhanden ist
        const originalContent = document.getElementById('pdf-content');
        if (!originalContent) {
            console.error('Element mit ID "pdf-content" wurde nicht gefunden!');
            // Fallback: Versuche, den report-content zu finden
            const reportContent = document.querySelector('.report-content') || document.querySelector('.modal-content');
            if (reportContent) {
                console.log('Fallback: Verwende report-content/modal-content für PDF');
                // Erstelle dynamisch ein pdf-content Element und füge den Inhalt ein
                const pdfContentDiv = document.createElement('div');
                pdfContentDiv.id = 'pdf-content';
                pdfContentDiv.innerHTML = reportContent.innerHTML;
                document.body.appendChild(pdfContentDiv);
                pdfContentDiv.style.display = 'none';
                setTimeout(() => {
                    if (document.body.contains(pdfContentDiv)) document.body.removeChild(pdfContentDiv);
                }, 5000);
            } else {
                throw new Error('PDF-Inhalt nicht gefunden - weder pdf-content noch report-content');
            }
        }
        
        // Aktualisiere den Content nach dem potenziellen Fallback
        const contentElement = document.getElementById('pdf-content');
        if (!contentElement) throw new Error('PDF-Inhalt konnte nicht erstellt werden');
        
        console.log('PDF-Inhalt gefunden, erstelle Klon');
        
        // Klonen des Inhalts für die Bearbeitung
        const contentClone = contentElement.cloneNode(true);
        
        // Temporären Container erstellen
        const tempContainer = document.createElement('div');
        tempContainer.id = 'temp-pdf-container';
        tempContainer.style.position = 'absolute';
        tempContainer.style.top = '10px'; // Nicht mehr verstecken für Debugging
        tempContainer.style.left = '-9999px';
        tempContainer.style.width = '210mm'; // A4 Breite
        tempContainer.style.backgroundColor = 'white';
        tempContainer.style.padding = '15mm';
        tempContainer.style.zIndex = '999';
        tempContainer.appendChild(contentClone);
        document.body.appendChild(tempContainer);
        
        console.log('Temporärer PDF-Container erstellt, Größe:', tempContainer.offsetWidth, 'x', tempContainer.offsetHeight);
        console.log('Container enthält Elemente:', tempContainer.querySelectorAll('*').length);
        
        // Projektname für den Dateinamen abrufen
        const projectTitle = document.getElementById('project-title')?.textContent || 'Lauffer_Projekt';
        const filename = `Projektbericht_${projectTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().slice(0,10)}.pdf`;
        
        // Optimierung der Galerie-Elemente im geklonten Inhalt
        const galleryItems = tempContainer.querySelectorAll('.gallery-item');
        galleryItems.forEach(item => {
            item.style.width = '45%';
            item.style.display = 'inline-block';
            item.style.margin = '10px';
            item.style.pageBreakInside = 'avoid';
            item.style.verticalAlign = 'top';
            
            // Kommentare optimieren
            const commentContainer = item.querySelector('.image-comment-container');
            if (commentContainer) {
                commentContainer.style.marginTop = '8px';
                commentContainer.style.padding = '10px';
                commentContainer.style.backgroundColor = '#f9f9f9';
                commentContainer.style.border = '1px solid #ddd';
                commentContainer.style.borderRadius = '4px';
                commentContainer.style.fontSize = '12px';
            }
        });
        
        // Tabellen optimieren
        const tables = tempContainer.querySelectorAll('table');
        tables.forEach(table => {
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';
            table.style.marginBottom = '20px';
            table.style.pageBreakInside = 'avoid';
            
            // Zellen und Header formatieren
            const cells = table.querySelectorAll('th, td');
            cells.forEach(cell => {
                cell.style.border = '1px solid #ddd';
                cell.style.padding = '8px';
                cell.style.fontSize = '11px';
            });
            
            const headers = table.querySelectorAll('th');
            headers.forEach(header => {
                header.style.backgroundColor = '#5e8c2f';
                header.style.color = 'white';
                header.style.fontWeight = 'bold';
            });
        });
        
        // Pausenzeiten prüfen und formatieren (falls vorhanden)
        const pausenElemente = tempContainer.querySelectorAll('.pause-time, .pause-duration');
        pausenElemente.forEach(el => {
            // Hervorhebung für Pausenzeiten hinzufügen
            el.style.backgroundColor = '#fff9e6';
            el.style.fontWeight = 'bold';
        });
        
        // Besondere Kennzeichnung für Pausenzeiten
        const pausenInfos = tempContainer.querySelectorAll('tr[data-has-pause="true"], .entry-with-pause');
        pausenInfos.forEach(el => {
            // Pause-Hinweis hinzufügen, falls noch nicht vorhanden
            if (!el.querySelector('.pause-indicator')) {
                const hinweis = document.createElement('span');
                hinweis.className = 'pause-indicator';
                hinweis.textContent = ' (inkl. Pause)';
                hinweis.style.color = '#ff6b00';
                hinweis.style.fontWeight = 'bold';
                hinweis.style.fontSize = '0.9em';
                const zeitElement = el.querySelector('.time-duration, .duration-cell') || el.querySelector('td:nth-child(3)');
                if (zeitElement) zeitElement.appendChild(hinweis);
            }
        });
        
        // Alle Bilder im temporären Container in Data-URLs umwandeln
        const images = tempContainer.querySelectorAll('img');
        console.log(`Gefundene Bilder im Container: ${images.length}`);
        
        // Aktualisiere den Ladetext
        loadingIndicator.querySelector('div p').textContent = 'Bilder werden vorbereitet...';
        
        // Bilder umwandeln (sequentiell, um Speicher zu sparen)
        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            try {
                // Status-Update für lange Operationen
                if (images.length > 5 && i % 5 === 0) {
                    loadingIndicator.querySelector('div p').textContent = `Bilder werden vorbereitet (${i+1}/${images.length})...`;
                }
                
                console.log(`Verarbeite Bild ${i+1}/${images.length}: ${img.src.substring(0, 50)}...`);
                
                // Bild in Data-URL umwandeln
                const dataUrl = await imageToDataUrl(img);
                img.src = dataUrl;
                
                // Alt-Text setzen falls nicht vorhanden
                if (!img.alt) img.alt = 'Lauffer Baustelle';
                
                // Sicherstellen, dass das Bild eine angemessene Größe hat
                if (!img.style.maxWidth) img.style.maxWidth = '100%';
                if (!img.style.height) img.style.height = 'auto';
            } catch (err) {
                console.error('Fehler bei der Bildverarbeitung:', err);
                // Weiter mit dem nächsten Bild
            }
        }
        
        // Aktualisiere den Ladetext
        loadingIndicator.querySelector('div p').textContent = 'PDF wird generiert...';
        
        // Konfiguration für html2pdf
        const options = {
            margin: [15, 15, 15, 15],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2, 
                useCORS: true, 
                logging: false,
                letterRendering: true,
                allowTaint: true  // Erlaube nicht-CORS-Bilder
            },
            jsPDF: { 
                unit: 'mm', 
                format: 'a4', 
                orientation: 'portrait',
                compress: true
            },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'], before: '.page-break-before', after: '.page-break-after' }
        };
        
        // Prüfen, ob html2pdf verfügbar ist
        if (typeof html2pdf === 'undefined') {
            throw new Error('Die PDF-Export-Bibliothek (html2pdf) wurde nicht geladen. Bitte prüfen Sie Ihre Internetverbindung oder laden Sie die Seite neu.');
        }
        
        console.log('Starte PDF-Generierung mit html2pdf...');
        
        // PDF generieren - mit Retry-Mechanismus
        let success = false;
        let attempts = 0;
        
        while (!success && attempts < 3) {
            attempts++;
            try {
                console.log(`PDF-Generierungsversuch ${attempts}...`);
                // Kurze Pause, um sicherzustellen, dass der DOM-Inhalt gerendert wurde
                if (attempts > 1) await new Promise(resolve => setTimeout(resolve, 1000));
        
                // PDF generieren
                await html2pdf()
                    .from(tempContainer)
                    .set(options)
                    .save();
        
                success = true;
                console.log('PDF wurde erfolgreich generiert!');
            } catch (err) {
                console.error(`Fehler bei PDF-Generierungsversuch ${attempts}:`, err);
                // Bei letztem Versuch den Fehler werfen
                if (attempts === 3) throw err;
            }
        }
        
        // Erfolgsmeldung
        alert('PDF wurde erfolgreich erstellt!');
        
        // Temporären Container entfernen
        if (document.body.contains(tempContainer)) {
            document.body.removeChild(tempContainer);
        }
        
    } catch (error) {
        console.error('Fehler beim Erstellen des PDFs:', error);
        
        // Spezifischere Fehlermeldung für häufige Probleme
        let errorMessage = error.message;
        
        if (error.message.includes('html2canvas')) {
            errorMessage = 'Problem beim Rendering der Seite. Möglicherweise sind einige Bilder nicht zugänglich wegen CORS-Einschränkungen.';
        } else if (error.message.includes('jsPDF')) {
            errorMessage = 'Problem bei der PDF-Erstellung. Bitte versuchen Sie es später erneut.';
        } else if (error.message.includes('undefined')) {
            errorMessage = 'Ein Teil der notwendigen PDF-Funktionalität wurde nicht korrekt geladen. Bitte laden Sie die Seite neu.';
        }
        
        alert(`Fehler beim Erstellen des PDFs: ${errorMessage}`);
        
        // Versuche ein einfacheres Fallback bei bestimmten Fehlern
        if (error.message.includes('html2canvas') || error.message.includes('render')) {
            try {
                console.log('Versuche vereinfachtes Fallback für PDF-Export...');
                const simpleContent = document.createElement('div');
                simpleContent.innerHTML = `
                    <h1>Projektbericht (Fallback-Version)</h1>
                    <p>Erstellt am: ${new Date().toLocaleString()}</p>
                    <hr>
                    <div>
                        ${document.getElementById('pdf-content')?.innerText || 'Keine Inhalte gefunden'}
                    </div>
                `;
                window.print();
            } catch (fallbackError) {
                console.error('Auch Fallback fehlgeschlagen:', fallbackError);
            }
        }
    } finally {
        // Ladeindikator entfernen
        if (document.body.contains(loadingIndicator)) {
            document.body.removeChild(loadingIndicator);
        }
        
        // Tempcontainer aufräumen
        const tempContainer = document.getElementById('temp-pdf-container');
        if (tempContainer && document.body.contains(tempContainer)) {
            document.body.removeChild(tempContainer);
        }
        
        // Temporäre pdf-content-Elemente aufräumen
        const tempPdfContent = document.querySelectorAll('#pdf-content[style*="display: none"]');
        tempPdfContent.forEach(el => {
            if (document.body.contains(el)) document.body.removeChild(el);
        });
        
        // Exportbutton wieder anzeigen
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            exportBtn.style.display = 'inline-block';
        }
    }
}

// Funktion für den Mitarbeiter-Berichts-PDF-Export
async function generateEmployeeReportPDF() {
    // Prüfen, ob Berichtsdaten vorhanden sind
    if (typeof currentReportEntries === 'undefined' || !currentReportEntries || currentReportEntries.length === 0) {
        alert('Keine Daten zum Exportieren vorhanden.');
        return;
    }
    
    try {
        // Ladeindikator erstellen
        const loadingIndicator = document.createElement('div');
        loadingIndicator.style.position = 'fixed';
        loadingIndicator.style.top = '0';
        loadingIndicator.style.left = '0';
        loadingIndicator.style.width = '100%';
        loadingIndicator.style.height = '100%';
        loadingIndicator.style.backgroundColor = 'rgba(0,0,0,0.7)';
        loadingIndicator.style.display = 'flex';
        loadingIndicator.style.justifyContent = 'center';
        loadingIndicator.style.alignItems = 'center';
        loadingIndicator.style.zIndex = '9999';
        loadingIndicator.innerHTML = '<div style="background-color: white; padding: 20px; border-radius: 5px; text-align: center;"><h3>PDF wird erstellt...</h3><p>Bitte warten Sie, die Daten werden vorbereitet...</p></div>';
        document.body.appendChild(loadingIndicator);
        
        // Ausblenden der "Kein Druck"-Elemente
        const noPrintElements = document.querySelectorAll('.no-print');
        noPrintElements.forEach(el => el.style.display = 'none');
        
        try {
            // Mitarbeiter-Informationen laden
            const employee = typeof currentEmployeeId !== 'undefined' && currentEmployeeId ? 
                await DataService.getEmployeeById(currentEmployeeId) : 
                { name: 'Mitarbeiter' };
            
            // Hole den Container mit dem Berichtsinhalt
            const reportContainer = document.getElementById('employee-report-container');
            
            if (!reportContainer) {
                throw new Error('Berichtsinhalt konnte nicht gefunden werden');
            }
            
            // Dateiname generieren
            const fileName = `Zeitbericht_${employee?.name.replace(/\s+/g, '_') || 'Mitarbeiter'}_${
                typeof currentStartDate !== 'undefined' && currentStartDate ? 
                formatDate(currentStartDate).replace(/\./g, '-') : 
                new Date().toISOString().slice(0, 10)
            }.pdf`;
            
            // PDF-Optionen
            const options = {
                margin: 10,
                filename: fileName,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
            };
            
            // PDF generieren
            await html2pdf().from(reportContainer).set(options).save();
            
            // Erfolgsmeldung
            alert('PDF wurde erfolgreich erstellt!');
        } catch (error) {
            console.error('Fehler beim PDF-Export:', error);
            alert('Fehler beim PDF-Export: ' + (error.message || 'Unbekannter Fehler'));
        } finally {
            // "Kein Druck"-Elemente wieder anzeigen
            noPrintElements.forEach(el => el.style.display = '');
            
            // Ladeindikator entfernen
            if (document.body.contains(loadingIndicator)) {
                document.body.removeChild(loadingIndicator);
            }
        }
    } catch (error) {
        console.error('Fehler beim PDF-Export:', error);
        alert('Fehler beim PDF-Export: ' + (error.message || 'Unbekannter Fehler'));
    }
}

// Hilfsfunktion zum Formatieren von Datum (falls nicht global verfügbar)
function formatDate(date) {
    if (!date) return '';
    if (typeof date === 'string') date = new Date(date);
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}.${month}.${year}`;
}

// Event-Listener hinzufügen, wenn das DOM geladen ist
document.addEventListener('DOMContentLoaded', function() {
    // Projektbericht-Export-Button
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', generatePDF);
    }
    
    // Mitarbeiterbericht-Export-Button
    const exportEmployeeReportBtn = document.getElementById('export-pdf-btn');
    if (exportEmployeeReportBtn) {
        exportEmployeeReportBtn.addEventListener('click', generateEmployeeReportPDF);
    }
});
