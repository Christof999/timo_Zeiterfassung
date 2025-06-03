/**
 * Modal-Fix.js - Behebt Probleme mit Modals und Bildanzeige
 * Dieses Skript wird nach dem Laden aller anderen Skripte ausgeführt.
 */

// Sofortige Ausführung nach dem Laden
(function() {
    console.log('Modal-Fix geladen');
    
    // Modal-Fix für Vollbildanzeige und Bericht-Modal
    fixModals();
    
    // Zeitformat-Fix
    fixDateDisplay();
    
    // Bild-Fix
    enhanceImageSupport();
    
    // Alle Modals reparieren
    function fixModals() {
        // 1. Existierende Modals finden
        const reportModal = document.getElementById('time-entry-report-modal');
        let fullscreenModal = document.getElementById('fullscreen-image-modal');
        
        // 2. Vollbild-Modal erstellen, falls es nicht existiert
        if (!fullscreenModal) {
            fullscreenModal = document.createElement('div');
            fullscreenModal.id = 'fullscreen-image-modal';
            fullscreenModal.className = 'fullscreen-modal';
            
            fullscreenModal.innerHTML = `
                <button class="close-fullscreen-btn">&times;</button>
                <div class="fullscreen-image-container">
                    <img class="fullscreen-image" src="" alt="Vollbildansicht">
                </div>
            `;
            
            document.body.appendChild(fullscreenModal);
        }
        
        // 3. Event-Listener für das Vollbild-Modal
        const closeFullscreenButton = fullscreenModal.querySelector('.close-fullscreen-btn');
        if (closeFullscreenButton) {
            // Alten Event-Listener entfernen
            const oldClone = closeFullscreenButton.cloneNode(true);
            closeFullscreenButton.parentNode.replaceChild(oldClone, closeFullscreenButton);
            
            // Neuen Event-Listener hinzufügen
            oldClone.addEventListener('click', function() {
                fullscreenModal.style.display = 'none';
                
                // Report-Modal wieder anzeigen, wenn es vorher geöffnet war
                if (reportModal && reportModal.dataset.wasOpen === 'true') {
                    reportModal.style.display = 'block';
                    reportModal.dataset.wasOpen = 'false';
                }
            });
        }
        
        // 4. Event-Listener für Klick außerhalb des Modals
        fullscreenModal.addEventListener('click', function(event) {
            if (event.target === fullscreenModal) {
                fullscreenModal.style.display = 'none';
                
                // Report-Modal wieder anzeigen, wenn es vorher geöffnet war
                if (reportModal && reportModal.dataset.wasOpen === 'true') {
                    reportModal.style.display = 'block';
                    reportModal.dataset.wasOpen = 'false';
                }
            }
        });
        
        // 5. ESC-Taste zum Schließen des Modals
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && fullscreenModal.style.display === 'block') {
                fullscreenModal.style.display = 'none';
                
                // Report-Modal wieder anzeigen, wenn es vorher geöffnet war
                if (reportModal && reportModal.dataset.wasOpen === 'true') {
                    reportModal.style.display = 'block';
                    reportModal.dataset.wasOpen = 'false';
                }
            }
        });
        
        // 6. Globale Funktion zum Öffnen von Vollbildanzeigen überschreiben
        window.openFullscreenImage = function(imageUrl) {
            const fullscreenModal = document.getElementById('fullscreen-image-modal');
            const fullscreenImage = fullscreenModal.querySelector('.fullscreen-image');
            
            if (fullscreenModal && fullscreenImage) {
                fullscreenImage.src = imageUrl;
                
                // Speichern, ob das Report-Modal geöffnet war
                const reportModal = document.getElementById('time-entry-report-modal');
                if (reportModal && reportModal.style.display === 'block') {
                    reportModal.dataset.wasOpen = 'true';
                    reportModal.style.display = 'none';
                }
                
                fullscreenModal.style.display = 'block';
            }
        };
        
        // 7. Berichts-Modal reparieren, wenn vorhanden
        if (reportModal) {
            const closeReportButton = reportModal.querySelector('.close-modal-btn');
            if (closeReportButton) {
                // Alten Event-Listener entfernen
                const oldClone = closeReportButton.cloneNode(true);
                closeReportButton.parentNode.replaceChild(oldClone, closeReportButton);
                
                // Neuen Event-Listener hinzufügen
                oldClone.addEventListener('click', function() {
                    reportModal.style.display = 'none';
                });
            }
            
            // Klick außerhalb des Modals schließt es
            reportModal.addEventListener('click', function(event) {
                if (event.target === reportModal) {
                    reportModal.style.display = 'none';
                }
            });
        }
    }
    
    // Zeitformat-Fix
    function fixDateDisplay() {
        // Hilfsfunktion für korrekte Datumswerte
        window.isValidDate = function(date) {
            return date instanceof Date && !isNaN(date.getTime());
        };
        
        // Erweiterte Funktion zur Formatierung von Zeiten
        window.formatTime = function(date) {
            if (!date || !isValidDate(date)) {
                console.error('Ungültiges Datum beim Formatieren der Zeit:', date);
                return '--:--';
            }
            try {
                return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            } catch (error) {
                console.error('Fehler beim Formatieren der Zeit:', error);
                return '--:--';
            }
        };
    }
    
    // Erweiterte Bildunterstützung
    function enhanceImageSupport() {
        // Delegierter Event-Listener für alle Bilder
        document.addEventListener('click', function(event) {
            if (event.target.tagName === 'IMG') {
                // Nur auf bestimmte Bildklassen reagieren
                if (event.target.classList.contains('report-gallery-image') || 
                    event.target.classList.contains('gallery-preview-image') || 
                    event.target.hasAttribute('data-fullscreen') ||
                    event.target.closest('.gallery-item') ||
                    event.target.closest('.report-gallery-item')) {
                    
                    event.preventDefault();
                    event.stopPropagation();
                    
                    // Öffne Vollbildansicht
                    window.openFullscreenImage(event.target.src);
                }
            }
        });
    }
    
    // Füge Styles für die Modals hinzu
    function addFixStyles() {
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            /* Styles für die Vollbildansicht */
            .fullscreen-modal {
                display: none;
                position: fixed;
                z-index: 10000;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.9);
                overflow: auto;
            }
            
            .fullscreen-image-container {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100%;
                width: 100%;
            }
            
            .fullscreen-image {
                max-width: 90%;
                max-height: 90%;
                object-fit: contain;
            }
            
            .close-fullscreen-btn {
                position: absolute;
                top: 15px;
                right: 35px;
                color: #f1f1f1;
                font-size: 40px;
                font-weight: bold;
                transition: 0.3s;
                background: none;
                border: none;
                cursor: pointer;
                z-index: 10001;
            }
            
            .close-fullscreen-btn:hover,
            .close-fullscreen-btn:focus {
                color: #bbb;
                text-decoration: none;
                cursor: pointer;
            }
        `;
        
        document.head.appendChild(styleElement);
    }
    
    // Styles hinzufügen
    addFixStyles();
})();
