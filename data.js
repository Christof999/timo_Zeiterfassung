/**
 * Datenverwaltung für die Lauffer Zeiterfassung App
 * Verantwortlich für die Speicherung und Abfrage von Mitarbeitern, Projekten und Zeiteinträgen
 * Firebase-Version
 */

const DataService = {
    // Firebase-Referenzen werden bei der Initialisierung gesetzt
    db: null,
    storage: null,
    employeesCollection: null,
    projectsCollection: null,
    timeEntriesCollection: null,
    usersCollection: null,
    fileUploadsCollection: null,
    
    // Initialisierung der Firebase-Verbindung
    async init() {
        this.db = firebase.firestore();
        
        // Storage nur initialisieren, wenn verfügbar
        if (firebase.storage) {
            this.storage = firebase.storage();
        } else {
            console.warn('Firebase Storage nicht verfügbar');
            this.storage = null;
        }
        
        this.employeesCollection = this.db.collection('employees');
        this.projectsCollection = this.db.collection('projects');
        this.timeEntriesCollection = this.db.collection('timeEntries');
        this.usersCollection = this.db.collection('users');
        this.fileUploadsCollection = this.db.collection('fileUploads');
        
        // Anmerkung: Wir entfernen hier die updateExistingTimeEntriesWithEntryId-Funktion,
        // da sie nur auf der Hauptseite benötigt wird, nicht für Projektdetails
        console.log('DataService erfolgreich initialisiert');
    },
    
    // Admin-Verwaltung
    _currentAdmin: null,
    _currentUser: null,
    
    getCurrentAdmin() {
        try {
            const savedAdmin = localStorage.getItem('lauffer_admin_user');
            return savedAdmin ? JSON.parse(savedAdmin) : null;
        } catch (error) {
            console.error('Fehler beim Laden des Admins:', error);
            return null;
        }
    },
    
    setCurrentAdmin(admin) {
        this._currentAdmin = admin;
        if (admin) {
            localStorage.setItem('lauffer_admin_user', JSON.stringify(admin));
        }
    },
    
    clearCurrentAdmin() {
        this._currentAdmin = null;
        localStorage.removeItem('lauffer_admin_user');
    },
    
    // Mitarbeiter-Sitzungsverwaltung
    getCurrentUser() {
        try {
            const savedUser = localStorage.getItem('lauffer_current_user');
            return savedUser ? JSON.parse(savedUser) : null;
        } catch (error) {
            console.error('Fehler beim Laden des Benutzers:', error);
            return null;
        }
    },
    
    setCurrentUser(user) {
        this._currentUser = user;
        if (user) {
            // Passwort niemals im Local Storage speichern!
            const { password, ...safeUserData } = user;
            localStorage.setItem('lauffer_current_user', JSON.stringify(safeUserData));
        }
    },
    
    clearCurrentUser() {
        this._currentUser = null;
        localStorage.removeItem('lauffer_current_user');
    },
    
    // Mitarbeiter-Verwaltung für den Admin-Bereich
    async getAllEmployees() {
        try {
            const snapshot = await this.employeesCollection.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Fehler beim Abrufen aller Mitarbeiter:', error);
            return [];
        }
    },
    
    async getEmployeeById(id) {
        try {
            console.log('Lade Mitarbeiter mit ID:', id);
            if (!id) {
                console.error('Keine gültige ID angegeben');
                return null;
            }
            
            const doc = await this.employeesCollection.doc(id).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            console.log('Mitarbeiter nicht gefunden');
            return null;
        } catch (error) {
            console.error(`Fehler beim Abrufen des Mitarbeiters ${id}:`, error);
            return null;
        }
    },
    
    async getEmployeeByUsername(username) {
        try {
            const snapshot = await this.employeesCollection
                .where('username', '==', username)
                .limit(1)
                .get();
                
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error(`Fehler beim Suchen des Mitarbeiters mit Benutzername ${username}:`, error);
            return null;
        }
    },
    
    async createEmployee(employeeData) {
        try {
            console.log('Erstelle neuen Mitarbeiter:', employeeData);
            // Prüfen, ob der Benutzername bereits existiert
            const existingSnapshot = await this.employeesCollection
                .where('username', '==', employeeData.username)
                .limit(1)
                .get();
                
            if (!existingSnapshot.empty) {
                throw new Error('Dieser Benutzername ist bereits vergeben.');
            }
            
            const result = await this.employeesCollection.add(employeeData);
            return result.id;
        } catch (error) {
            console.error('Fehler beim Erstellen des Mitarbeiters:', error);
            throw error;
        }
    },
    
    async updateEmployee(id, employeeData) {
        console.log('Starte updateEmployee mit ID:', id, 'und Daten:', employeeData);
        try {
            if (!id) {
                throw new Error('Keine gültige Mitarbeiter-ID angegeben');
            }
            
            // Prüfen, ob der Mitarbeiter existiert
            const employeeDoc = await this.employeesCollection.doc(id).get();
            
            if (!employeeDoc.exists) {
                throw new Error(`Mitarbeiter mit ID ${id} nicht gefunden`);
            }
            
            // Prüfen, ob der Benutzername bereits existiert (bei anderem Mitarbeiter)
            if (employeeData.username) {
                const existingSnapshot = await this.employeesCollection
                    .where('username', '==', employeeData.username)
                    .limit(1)
                    .get();
                    
                if (!existingSnapshot.empty && existingSnapshot.docs[0].id !== id) {
                    throw new Error('Dieser Benutzername ist bereits vergeben.');
                }
            }
            
            console.log(`Aktualisiere Mitarbeiter mit ID: ${id}`);
            await this.employeesCollection.doc(id).update(employeeData);
            return true;
        } catch (error) {
            console.error(`Fehler beim Aktualisieren des Mitarbeiters mit ID ${id}:`, error);
            throw error;
        }
    },
    
    async deleteEmployee(id) {
        try {
            // Prüfen, ob der Mitarbeiter aktive Zeiteinträge hat
            const activeEntries = await this.timeEntriesCollection
                .where('employeeId', '==', id)
                .where('clockOutTime', '==', null)
                .limit(1)
                .get();
                
            if (!activeEntries.empty) {
                throw new Error('Dieser Mitarbeiter hat noch aktive Zeiteinträge und kann nicht gelöscht werden.');
            }
            
            await this.employeesCollection.doc(id).delete();
            return true;
        } catch (error) {
            console.error(`Fehler beim Löschen des Mitarbeiters ${id}:`, error);
            throw error;
        }
    },
    
    async authenticateEmployee(username, password) {
        try {
            const employee = await this.getEmployeeByUsername(username);
            if (employee && employee.password === password && employee.status === 'active') {
                // Erfolgreich authentifiziert, Passwort nicht in die Session speichern
                const { password, ...employeeData } = employee;
                return employeeData;
            }
            return null;
        } catch (error) {
            console.error('Fehler bei der Authentifizierung:', error);
            return null;
        }
    },
    
    // Projekt-Verwaltung für den Admin-Bereich
    async getAllProjects() {
        try {
            const snapshot = await this.projectsCollection.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Fehler beim Abrufen aller Projekte:', error);
            return [];
        }
    },
    
    async getProjectById(projectId) {
        if (!projectId) {
            console.error('Keine Projekt-ID angegeben');
            return null;
        }
        
        try {
            console.log('🔍 getProjectById: Starte Firestore-Abfrage für ID:', projectId);
            console.log('🔍 getProjectById: projectsCollection verfügbar:', !!this.projectsCollection);
            
            // Firestore-Verbindung testen
            console.log('🔍 getProjectById: Teste Firestore-Verbindung...');
            const startTime = Date.now();
            
            const doc = await this.projectsCollection.doc(projectId).get();
            const endTime = Date.now();
            
            console.log(`🔍 getProjectById: Firestore-Abfrage abgeschlossen in ${endTime - startTime}ms`);
            console.log('🔍 getProjectById: doc.exists:', doc.exists);
            
            if (!doc.exists) {
                console.log(`❌ Projekt mit ID ${projectId} nicht gefunden`);
                return null;
            }
            
            const projectData = doc.data();
            console.log('✅ getProjectById: Projekt-Daten erhalten:', projectData);
            
            return { id: doc.id, ...projectData };
        } catch (error) {
            console.error(`❌ Fehler beim Abrufen des Projekts mit ID ${projectId}:`, error);
            console.error('❌ Fehler-Code:', error.code);
            console.error('❌ Fehler-Message:', error.message);
            console.error('❌ Fehler-Stack:', error.stack);
            return null;
        }
    },
    
    // Zeiteinträge für ein Projekt abrufen
    async getProjectTimeEntries(projectId) {
        if (!projectId) {
            console.error('Keine Projekt-ID angegeben');
            return [];
        }
        
        try {
            const snapshot = await this.timeEntriesCollection
                .where('projectId', '==', projectId)
                .orderBy('clockInTime', 'desc')
                .get();
                
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Fehler beim Abrufen der Zeiteinträge für Projekt ${projectId}:`, error);
            return [];
        }
    },
    
    // Zeiterfassung - Einzelnen Zeiteintrag abrufen
    async getTimeEntryByIdAndEmployeeId(timeEntryId, employeeId) {
        if (!timeEntryId || !employeeId) {
            console.error('Keine Zeiteintrags-ID oder Mitarbeiter-ID angegeben');
            return null;
        }
        
        try {
            const doc = await this.timeEntriesCollection.doc(timeEntryId).get();
            if (doc.exists && doc.data().employeeId === employeeId) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error('Fehler beim Abrufen des Zeiteintrags:', error);
            return null;
        }
    },
    
    // Zeiteintrag anhand der ID abrufen (für Berichtsfunktion)
    async getTimeEntryById(timeEntryId) {
        if (!timeEntryId) {
            console.error('Keine Zeiteintrags-ID angegeben');
            return null;
        }
        
        try {
            const doc = await this.timeEntriesCollection.doc(timeEntryId).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error('Fehler beim Abrufen des Zeiteintrags:', error);
            return null;
        }
    },
    
    // Alle Zeiteinträge für ein bestimmtes Projekt abrufen
    async getProjectTimeEntries(projectId) {
        if (!projectId) {
            console.error('Keine Projekt-ID angegeben');
            return [];
        }
        
        try {
            console.log(`Lade Zeiteinträge für Projekt: ${projectId}`);
            
            const snapshot = await this.timeEntriesCollection
                .where('projectId', '==', projectId)
                .get();
            
            if (snapshot.empty) {
                console.log(`Keine Zeiteinträge für Projekt ${projectId} gefunden`);
                return [];
            }
            
            const entries = snapshot.docs.map(doc => {
                const data = doc.data();
                // Stelle sicher, dass die entryId gesetzt ist
                if (!data.entryId) {
                    data.entryId = doc.id;
                }
                return { id: doc.id, ...data };
            });
            
            console.log(`${entries.length} Zeiteinträge für Projekt ${projectId} gefunden`);
            return entries;
        } catch (error) {
            console.error(`Fehler beim Laden der Zeiteinträge für Projekt ${projectId}:`, error);
            return [];
        }
    },
    
    // Alle Dateien für ein bestimmtes Projekt abrufen
    async getProjectFiles(projectId, type = 'construction_site') {
        if (!projectId) {
            console.error('Keine Projekt-ID angegeben');
            return [];
        }
        
        try {
            console.log(`Lade Dateien vom Typ '${type}' für Projekt: ${projectId}`);
            
            // Erst alle Zeiteinträge für das Projekt abrufen
            const timeEntries = await this.getProjectTimeEntries(projectId);
            if (!timeEntries || timeEntries.length === 0) {
                console.log(`Keine Zeiteinträge für Projekt ${projectId} gefunden - daher auch keine Dateien`);
                return [];
            }
            
            console.log(`${timeEntries.length} Zeiteinträge gefunden, suche nach Dateien...`);
            
            // Alle relevanten Datei-IDs aus den Zeiteinträgen sammeln
            let fileIds = [];
            
            // Sammlung für direkt gespeicherte Bilder/Dokumente (als Objekte)
            let directFiles = [];
            
            timeEntries.forEach(entry => {
                // Je nach Typ die richtigen Datei-IDs sammeln
                if (type === 'construction_site') {
                    // Baustellenfotos
                    if (entry.sitePhotoUploads && Array.isArray(entry.sitePhotoUploads)) {
                        fileIds = [...fileIds, ...entry.sitePhotoUploads];
                    }
                    if (entry.photos && Array.isArray(entry.photos)) {
                        // Wenn die Fotos direkt gespeichert sind
                        if (entry.photos.length > 0 && typeof entry.photos[0] === 'object' && entry.photos[0].url) {
                            // Alle Bilder mit ihren Kommentaren und Zeiteintrags-ID hinzufügen
                            entry.photos.forEach(photo => {
                                // Füge zusätzliche Infos zum Bild hinzu, aber behalte den Bildkommentar bei
                                // Wichtig: Niemals die Arbeitsbeschreibung (entry.notes) als Bildkommentar verwenden!
                                directFiles.push({
                                    ...photo,  // Hier sollte photo.comment enthalten sein
                                    timeEntryId: entry.id,
                                    employeeId: entry.employeeId,
                                    timestamp: entry.clockOutTime || entry.clockInTime,
                                    type: 'construction_site'
                                    // NICHT notes: entry.notes hinzufügen, das würde den Bildkommentar überschreiben!
                                });
                            });
                        } else {
                            // Sonst die IDs sammeln
                            fileIds = [...fileIds, ...entry.photos];
                        }
                    }
                }
                else if (type === 'delivery_note') {
                    // Lieferscheine/Dokumente
                    if (entry.documentPhotoUploads && Array.isArray(entry.documentPhotoUploads)) {
                        fileIds = [...fileIds, ...entry.documentPhotoUploads];
                    }
                    if (entry.documents && Array.isArray(entry.documents)) {
                        // Wenn die Dokumente direkt gespeichert sind
                        if (entry.documents.length > 0 && typeof entry.documents[0] === 'object' && entry.documents[0].url) {
                            // Alle Dokumente mit ihren Kommentaren und Zeiteintrags-ID hinzufügen
                            entry.documents.forEach(doc => {
                                // Füge zusätzliche Infos zum Dokument hinzu, aber behalte den Dokumentkommentar bei
                                directFiles.push({
                                    ...doc,  // Hier sollte doc.comment enthalten sein
                                    timeEntryId: entry.id,
                                    employeeId: entry.employeeId,
                                    timestamp: entry.clockOutTime || entry.clockInTime,
                                    type: 'delivery_note'
                                    // NICHT notes: entry.notes hinzufügen, das würde den Dokumentkommentar überschreiben!
                                });
                            });
                        } else {
                            // Sonst die IDs sammeln
                            fileIds = [...fileIds, ...entry.documents];
                        }
                    }
                    if (entry.deliveryNotes && Array.isArray(entry.deliveryNotes)) {
                        fileIds = [...fileIds, ...entry.deliveryNotes];
                    }
                }
            });
            
            // Duplikate entfernen und leere/ungültige Werte filtern
            fileIds = [...new Set(fileIds)].filter(id => id && typeof id === 'string');
            
            console.log(`${fileIds.length} eindeutige Datei-IDs für Typ ${type} gefunden`);
            console.log(`${directFiles.length} direkt gespeicherte Dateien gefunden`);
            
            // Wenn wir nur direkte Dateien haben und keine IDs
            if (fileIds.length === 0 && directFiles.length > 0) {
                console.log(`Nur direkte Dateien vom Typ ${type} für Projekt ${projectId} gefunden:`, directFiles);
                return directFiles;
            }
            
            // Wenn keine Dateien vorhanden sind
            if (fileIds.length === 0 && directFiles.length === 0) {
                return [];
            }
            
            // Dateien anhand der IDs abrufen
            const filePromises = fileIds.map(id => this.getFileUploadById(id));
            const files = await Promise.all(filePromises);
            
            // Ungültige Einträge herausfiltern
            const validFiles = files.filter(file => file !== null);
            
            // Direkte Dateien mit den geladenen Dateien kombinieren
            const allFiles = [...validFiles, ...directFiles];
            
            console.log(`${allFiles.length} gültige Dateien vom Typ ${type} für Projekt ${projectId} gefunden`);
            return allFiles;
        } catch (error) {
            console.error(`Fehler beim Laden der Dateien für Projekt ${projectId}:`, error);
            return [];
        }
    },
    
    // Bilder zu einem Zeiteintrag abrufen (für Berichtsfunktion)
    async getTimeEntryFiles(timeEntryId, type = 'construction_site') {
        if (!timeEntryId) {
            console.error('Keine Zeiteintrags-ID angegeben');
            return [];
        }
        
        console.log(`Lade ${type}-Bilder für Zeiteintrag ${timeEntryId}`);
        
        try {
            // TimeEntry abrufen, um die Upload-IDs zu erhalten
            const timeEntry = await this.getTimeEntryById(timeEntryId);
            if (!timeEntry) {
                console.log('Zeiteintrag nicht gefunden für Bildabruf');
                return [];
            }
            
            console.log('Zeiteintrag für Bildabruf gefunden:', timeEntry);
            
            // Relevante Upload-IDs extrahieren
            let uploadIds = [];
            
            // Konstruktionsfotos
            if (type === 'construction_site') {
                if (timeEntry.sitePhotoUploads && Array.isArray(timeEntry.sitePhotoUploads)) {
                    uploadIds = timeEntry.sitePhotoUploads;
                    console.log(`${uploadIds.length} sitePhotoUploads IDs gefunden`);
                }
                // Zusätzliche mögliche Bildquellen prüfen
                if (timeEntry.photos && Array.isArray(timeEntry.photos)) {
                    console.log(`${timeEntry.photos.length} direkte Fotos im timeEntry gefunden`);
                    // Wenn die Fotos direkt gespeichert sind, können wir sie direkt zurückgeben
                    if (timeEntry.photos.length > 0 && typeof timeEntry.photos[0] === 'object' && timeEntry.photos[0].url) {
                        return timeEntry.photos;
                    }
                    // Andernfalls die IDs zu den vorhandenen hinzufügen
                    uploadIds = [...uploadIds, ...timeEntry.photos];
                }
                if (timeEntry.sitePhotos && Array.isArray(timeEntry.sitePhotos)) {
                    console.log(`${timeEntry.sitePhotos.length} direkte sitePhotos gefunden`);
                    // Wenn die Fotos direkt gespeichert sind, können wir sie direkt zurückgeben
                    if (timeEntry.sitePhotos.length > 0 && typeof timeEntry.sitePhotos[0] === 'object' && timeEntry.sitePhotos[0].url) {
                        return timeEntry.sitePhotos;
                    }
                    // Andernfalls die IDs zu den vorhandenen hinzufügen
                    uploadIds = [...uploadIds, ...timeEntry.sitePhotos];
                }
            }
            // Lieferscheine/Dokumente
            else if (type === 'delivery_note') {
                if (timeEntry.documentPhotoUploads && Array.isArray(timeEntry.documentPhotoUploads)) {
                    uploadIds = timeEntry.documentPhotoUploads;
                    console.log(`${uploadIds.length} documentPhotoUploads IDs gefunden`);
                }
                // Zusätzliche mögliche Dokumentquellen prüfen
                if (timeEntry.documents && Array.isArray(timeEntry.documents)) {
                    console.log(`${timeEntry.documents.length} direkte Dokumente gefunden`);
                    // Wenn die Dokumente direkt gespeichert sind, können wir sie direkt zurückgeben
                    if (timeEntry.documents.length > 0 && typeof timeEntry.documents[0] === 'object' && timeEntry.documents[0].url) {
                        return timeEntry.documents;
                    }
                    // Andernfalls die IDs zu den vorhandenen hinzufügen
                    uploadIds = [...uploadIds, ...timeEntry.documents];
                }
                if (timeEntry.deliveryNotes && Array.isArray(timeEntry.deliveryNotes)) {
                    console.log(`${timeEntry.deliveryNotes.length} direkte deliveryNotes gefunden`);
                    // Wenn die Dokumente direkt gespeichert sind, können wir sie direkt zurückgeben
                    if (timeEntry.deliveryNotes.length > 0 && typeof timeEntry.deliveryNotes[0] === 'object' && timeEntry.deliveryNotes[0].url) {
                        return timeEntry.deliveryNotes;
                    }
                    // Andernfalls die IDs zu den vorhandenen hinzufügen
                    uploadIds = [...uploadIds, ...timeEntry.deliveryNotes];
                }
            }
            
            console.log(`Insgesamt ${uploadIds.length} Bild-IDs für ${type} gefunden`);
            
            // Live-Dokumentation prüfen und hinzufügen
            let liveFileIds = [];
            if (timeEntry.liveDocumentation && Array.isArray(timeEntry.liveDocumentation)) {
                console.log(`${timeEntry.liveDocumentation.length} Live-Dokumentationen gefunden`);
                
                timeEntry.liveDocumentation.forEach(liveDoc => {
                    // Bilder aus Live-Dokumentation für construction_site
                    if (type === 'construction_site' && liveDoc.imageIds && Array.isArray(liveDoc.imageIds)) {
                        liveFileIds = [...liveFileIds, ...liveDoc.imageIds];
                        console.log(`${liveDoc.imageIds.length} Live-Bild-IDs gefunden`);
                    }
                    
                    // Dokumente aus Live-Dokumentation für delivery_note
                    if (type === 'delivery_note' && liveDoc.documentIds && Array.isArray(liveDoc.documentIds)) {
                        liveFileIds = [...liveFileIds, ...liveDoc.documentIds];
                        console.log(`${liveDoc.documentIds.length} Live-Dokument-IDs gefunden`);
                    }
                });
                
                console.log(`${liveFileIds.length} Live-Datei-IDs für ${type} gefunden`);
            }
            
            // Alle IDs kombinieren (normale + Live-Dokumentation)
            const allFileIds = [...uploadIds, ...liveFileIds];
            
            // Entferne Duplikate und ungültige Werte
            const uniqueFileIds = [...new Set(allFileIds)].filter(id => id && typeof id === 'string');
            
            if (!uniqueFileIds.length) {
                console.log(`Keine gültigen Datei-IDs für ${type} gefunden`);
                return [];
            }
            
            // Alle Dateien mit den IDs abrufen
            const filePromises = uniqueFileIds.map(id => this.getFileUploadById(id));
            const files = await Promise.all(filePromises);
            
            // Ungültige Einträge herausfiltern
            const validFiles = files.filter(file => file !== null);
            console.log(`${validFiles.length} gültige Dateien für ${type} gefunden`);
            
            return validFiles;
        } catch (error) {
            console.error(`Fehler beim Abrufen der ${type}-Dateien:`, error);
            return [];
        }
    },
    
    // Hilfsfunktion: Aktualisiert bestehende Zeiteinträge, um die entryId zu ergänzen
    async updateExistingTimeEntriesWithEntryId() {
        try {
            console.log('Starte Aktualisierung bestehender Zeiteinträge mit entryId...');
            
            // Alle Zeiteinträge ohne entryId abrufen
            const snapshot = await this.timeEntriesCollection
                .where('entryId', '==', null)
                .get();
            
            if (snapshot.empty) {
                console.log('Keine Zeiteinträge ohne entryId gefunden.');
                return;
            }
            
            console.log(`${snapshot.size} Zeiteinträge ohne entryId gefunden.`);
            
            // Batch-Update für bessere Performance
            const batch = this.db.batch();
            let batchCount = 0;
            
            snapshot.docs.forEach(doc => {
                const entryId = doc.id;
                const docRef = this.timeEntriesCollection.doc(entryId);
                batch.update(docRef, { entryId: entryId });
                batchCount++;
                
                // Firestore hat ein Limit von 500 Operationen pro Batch
                if (batchCount >= 450) {
                    batch.commit();
                    console.log(`${batchCount} Zeiteinträge aktualisiert.`);
                    batchCount = 0;
                }
            });
            
            // Restliche Operationen ausführen
            if (batchCount > 0) {
                await batch.commit();
                console.log(`${batchCount} weitere Zeiteinträge aktualisiert.`);
            }
            
            console.log('Aktualisierung bestehender Zeiteinträge abgeschlossen.');
            return true;
        } catch (error) {
            console.error('Fehler bei der Aktualisierung bestehender Zeiteinträge:', error);
            return false;
        }
    },
    
    // Datei-Upload anhand der ID abrufen
    async getFileUploadById(fileId) {
        if (!fileId) return null;
        
        try {
            const doc = await this.fileUploadsCollection.doc(fileId).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error('Fehler beim Abrufen des Datei-Uploads:', error);
            return null;
        }
    },
    
    // Zeiteintrag anhand von Datum und Mitarbeitername finden
    async getTimeEntryByDateAndName(dateStr, employeeName, projectName, exactEntryId = null) {
        if (!dateStr || !employeeName) {
            console.error('Datum oder Mitarbeitername fehlt für die Zeiteintragssuche');
            return null;
        }
        
        console.log(`Suche Zeiteintrag für Datum ${dateStr} und Mitarbeiter ${employeeName}`);
        
        try {
            // Alle Zeiteinträge abrufen (keine zeitliche Einschränkung)
            const snapshot = await this.timeEntriesCollection.get();
            
            if (snapshot.empty) {
                console.log('Keine Zeiteinträge in der Datenbank gefunden');
                return null;
            }
            
            // Alle Mitarbeiter laden, um Teilnamensübereinstimmungen zu finden
            const allEmployeesSnapshot = await this.employeesCollection.get();
            const employees = [];
            allEmployeesSnapshot.forEach(doc => {
                employees.push({ id: doc.id, ...doc.data() });
            });
            
            console.log(`${employees.length} Mitarbeiter in der Datenbank gefunden`);
            
            // Passenden Mitarbeiter suchen (auch Teilnamensübereinstimmungen)
            let matchingEmployeeId = null;
            const matchingEmployees = employees.filter(emp => {
                if (!emp.name) return false;
                
                // Entferne Leerzeichen und Sonderzeichen für besseren Vergleich
                const normalizedEmpName = emp.name.toLowerCase().replace(/[^a-z0-9]/gi, '');
                const normalizedSearchName = employeeName.toLowerCase().replace(/[^a-z0-9]/gi, '');
                
                // Prüfe, ob der Name enthalten ist oder ähnlich ist
                return normalizedEmpName.includes(normalizedSearchName) || 
                       normalizedSearchName.includes(normalizedEmpName);
            });
            
            if (matchingEmployees.length > 0) {
                console.log('Passende Mitarbeiter gefunden:', matchingEmployees);
                matchingEmployeeId = matchingEmployees[0].id;
            } else {
                console.log('Kein passender Mitarbeiter gefunden für:', employeeName);
            }
            
            // Alle Projekte laden für spätere Filterung
            const allProjectsSnapshot = await this.projectsCollection.get();
            const projects = [];
            allProjectsSnapshot.forEach(doc => {
                projects.push({ id: doc.id, ...doc.data() });
            });
            
            console.log(`${projects.length} Projekte in der Datenbank gefunden`);
            
            // Passende Projekte suchen
            let matchingProjectId = null;
            if (projectName) {
                const matchingProjects = projects.filter(proj => {
                    if (!proj.name) return false;
                    
                    // Entferne Leerzeichen und Sonderzeichen für besseren Vergleich
                    const normalizedProjName = proj.name.toLowerCase().replace(/[^a-z0-9]/gi, '');
                    const normalizedSearchName = projectName.toLowerCase().replace(/[^a-z0-9]/gi, '');
                    
                    // Prüfe, ob der Name enthalten ist oder ähnlich ist
                    return normalizedProjName.includes(normalizedSearchName) || 
                           normalizedSearchName.includes(normalizedProjName);
                });
                
                if (matchingProjects.length > 0) {
                    console.log('Passende Projekte gefunden:', matchingProjects);
                    matchingProjectId = matchingProjects[0].id;
                }
            }
            
            // Zeiteinträge sammeln
            const entries = [];
            snapshot.forEach(doc => {
                entries.push({ id: doc.id, ...doc.data() });
            });
            
            console.log(`${entries.length} Zeiteinträge insgesamt gefunden`);
            
            // Einträge nach passendem Datum filtern
            let matchingEntries = entries.filter(entry => {
                if (!entry.clockInTime) return false;
                
                // Datum formatieren und vergleichen
                const entryDate = entry.clockInTime instanceof firebase.firestore.Timestamp ? 
                    entry.clockInTime.toDate() : new Date(entry.clockInTime);
                
                if (!isValidDate(entryDate)) return false;
                
                // Vergleiche in verschiedenen Formaten für bessere Trefferquote
                const entryDateStr1 = entryDate.toLocaleDateString('de-DE'); // z.B. 26.5.2025
                const entryDateStr2 = `${entryDate.getDate()}.${entryDate.getMonth() + 1}.${entryDate.getFullYear()}`; // z.B. 26.5.2025
                const entryDateStr3 = `${entryDate.getDate()}-${entryDate.getMonth() + 1}-${entryDate.getFullYear()}`; // z.B. 26-5-2025
                
                // Teste alle Formate
                return entryDateStr1.includes(dateStr) || dateStr.includes(entryDateStr1) ||
                       entryDateStr2.includes(dateStr) || dateStr.includes(entryDateStr2) ||
                       entryDateStr3.includes(dateStr) || dateStr.includes(entryDateStr3);
            });
            
            console.log(`${matchingEntries.length} Einträge mit passendem Datum gefunden`);
            
            // Falls wir einen passenden Mitarbeiter haben, filtern wir weiter
            if (matchingEmployeeId) {
                const employeeEntries = matchingEntries.filter(entry => entry.employeeId === matchingEmployeeId);
                if (employeeEntries.length > 0) {
                    matchingEntries = employeeEntries;
                    console.log(`${matchingEntries.length} Einträge für Mitarbeiter ${matchingEmployeeId} gefunden`);
                }
            }
            
            // Falls wir ein passendes Projekt haben, filtern wir weiter
            if (matchingProjectId) {
                const projectEntries = matchingEntries.filter(entry => entry.projectId === matchingProjectId);
                if (projectEntries.length > 0) {
                    matchingEntries = projectEntries;
                    console.log(`${matchingEntries.length} Einträge für Projekt ${matchingProjectId} gefunden`);
                }
            }
            
            if (matchingEntries.length === 0) {
                console.log('Keine passenden Zeiteinträge gefunden');
                return null;
            }
            
            // Wenn eine exakte ID angegeben wurde, versuchen wir zuerst diese zu finden
            if (exactEntryId) {
                console.log('Suche nach exakter ID:', exactEntryId);
                const exactMatch = matchingEntries.find(entry => entry.id === exactEntryId);
                if (exactMatch) {
                    console.log('Exakte ID gefunden!', exactMatch);
                    return exactMatch;
                }
            }
            
            // Wenn mehrere Einträge gefunden wurden, den neuesten zurückgeben
            matchingEntries.sort((a, b) => {
                const dateA = a.clockInTime instanceof firebase.firestore.Timestamp ? 
                    a.clockInTime.toDate() : new Date(a.clockInTime);
                const dateB = b.clockInTime instanceof firebase.firestore.Timestamp ? 
                    b.clockInTime.toDate() : new Date(b.clockInTime);
                return dateB - dateA;
            });
            
            const result = matchingEntries[0];
            console.log('Passenden Zeiteintrag gefunden:', result);
            return result;
        } catch (error) {
            console.error('Fehler bei der Suche nach Zeiteinträgen:', error);
            return null;
        }
    },
    
    // Hilfsfunktion: Prüft, ob ein Datum gültig ist
    isValidDate(date) {
        return date instanceof Date && !isNaN(date);
    },
    
    async createProject(projectData) {
        try {
            // Datumsfelder als Timestamps speichern, wenn vorhanden
            if (projectData.startDate) {
                projectData.startDate = firebase.firestore.Timestamp.fromDate(new Date(projectData.startDate));
            }
            
            if (projectData.endDate) {
                projectData.endDate = firebase.firestore.Timestamp.fromDate(new Date(projectData.endDate));
            }
            
            const result = await this.projectsCollection.add(projectData);
            return result.id;
        } catch (error) {
            console.error('Fehler beim Erstellen des Projekts:', error);
            throw error;
        }
    },
    
    async updateProject(id, projectData) {
        console.log('Starte updateProject mit ID:', id, 'und Daten:', projectData);
        try {
            if (!id) {
                throw new Error('Keine gültige Projekt-ID angegeben');
            }
            
            // Prüfen, ob das Projekt existiert
            const projectDoc = await this.projectsCollection.doc(id).get();
            
            if (!projectDoc.exists) {
                throw new Error(`Projekt mit ID ${id} nicht gefunden`);
            }
            
            // Datumsfelder als Timestamps speichern, wenn vorhanden
            if (projectData.startDate) {
                projectData.startDate = firebase.firestore.Timestamp.fromDate(new Date(projectData.startDate));
            }
            
            if (projectData.endDate) {
                projectData.endDate = firebase.firestore.Timestamp.fromDate(new Date(projectData.endDate));
            }
            
            console.log(`Aktualisiere Projekt mit ID: ${id}`);
            await this.projectsCollection.doc(id).update(projectData);
            return true;
        } catch (error) {
            console.error(`Fehler beim Aktualisieren des Projekts mit ID ${id}:`, error);
            throw error;
        }
    },
    
    async deleteProject(id) {
        try {
            // Prüfen, ob noch Zeiteinträge für dieses Projekt existieren
            const entries = await this.timeEntriesCollection
                .where('projectId', '==', id)
                .limit(1)
                .get();
                
            if (!entries.empty) {
                throw new Error('Dieses Projekt hat Zeiteinträge und kann nicht gelöscht werden.');
            }
            
            await this.projectsCollection.doc(id).delete();
            return true;
        } catch (error) {
            console.error(`Fehler beim Löschen des Projekts ${id}:`, error);
            throw error;
        }
    },
    
    // Zeiteintragsabfragen
    async getCurrentTimeEntries() {
        try {
            const snapshot = await this.timeEntriesCollection
                .where('clockOutTime', '==', null)
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Fehler beim Abrufen der aktuellen Zeiteinträge:', error);
            return [];
        }
    },
    
    async getCurrentTimeEntry(employeeId) {
        try {
            if (!employeeId) {
                console.error('Keine Mitarbeiter-ID angegeben');
                return null;
            }
            
            const snapshot = await this.timeEntriesCollection
                .where('employeeId', '==', employeeId)
                .where('clockOutTime', '==', null)
                .limit(1)
                .get();
                
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error(`Fehler beim Abrufen des aktuellen Zeiteintrags für Mitarbeiter ${employeeId}:`, error);
            return null;
        }
    },
    
    async addTimeEntry(timeEntryData) {
        try {
            // Sicherstellen, dass Zeitstempel richtig formatiert sind
            if (timeEntryData.clockInTime && !(timeEntryData.clockInTime instanceof firebase.firestore.Timestamp)) {
                timeEntryData.clockInTime = firebase.firestore.Timestamp.fromDate(
                    typeof timeEntryData.clockInTime === 'string' 
                    ? new Date(timeEntryData.clockInTime) 
                    : timeEntryData.clockInTime
                );
            }
            
            if (timeEntryData.clockOutTime && !(timeEntryData.clockOutTime instanceof firebase.firestore.Timestamp)) {
                timeEntryData.clockOutTime = firebase.firestore.Timestamp.fromDate(
                    typeof timeEntryData.clockOutTime === 'string' 
                    ? new Date(timeEntryData.clockOutTime) 
                    : timeEntryData.clockOutTime
                );
            }
            
            // Erst ein leeres Dokument anlegen, um die ID zu erhalten
            const result = await this.timeEntriesCollection.add(timeEntryData);
            const entryId = result.id;
            
            // Die Dokument-ID auch im Dokument selbst speichern
            const updatedData = { ...timeEntryData, entryId: entryId };
            await this.timeEntriesCollection.doc(entryId).update({ entryId: entryId });
            
            return { id: entryId, ...updatedData };
        } catch (error) {
            console.error('Fehler beim Hinzufügen des Zeiteintrags:', error);
            throw error;
        }
    },
    
    async updateTimeEntry(timeEntryId, timeEntryData) {
        try {
            if (!timeEntryId) {
                throw new Error('Keine gültige Zeiteintrag-ID angegeben');
            }
            
            // Sicherstellen, dass Zeitstempel richtig formatiert sind
            if (timeEntryData.clockOutTime && !(timeEntryData.clockOutTime instanceof firebase.firestore.Timestamp)) {
                timeEntryData.clockOutTime = firebase.firestore.Timestamp.fromDate(
                    typeof timeEntryData.clockOutTime === 'string' 
                    ? new Date(timeEntryData.clockOutTime) 
                    : timeEntryData.clockOutTime
                );
            }
            
            // Dokument-ID immer im Dokument speichern für eindeutige Referenzierung
            if (!timeEntryData.entryId) {
                timeEntryData.entryId = timeEntryId;
            }
            
            await this.timeEntriesCollection.doc(timeEntryId).update(timeEntryData);
            return true;
        } catch (error) {
            console.error(`Fehler beim Aktualisieren des Zeiteintrags mit ID ${timeEntryId}:`, error);
            throw error;
        }
    },
    
    async getTimeEntriesByEmployeeId(employeeId, startDate = null, endDate = null) {
        try {
            let query = this.timeEntriesCollection.where('employeeId', '==', employeeId);
            
            if (startDate) {
                const startTimestamp = firebase.firestore.Timestamp.fromDate(new Date(startDate));
                query = query.where('clockInTime', '>=', startTimestamp);
            }
            
            if (endDate) {
                const endTimestamp = firebase.firestore.Timestamp.fromDate(new Date(endDate));
                endTimestamp.setHours(23, 59, 59, 999);
                query = query.where('clockInTime', '<=', endTimestamp);
            }
            
            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Fehler beim Abrufen der Zeiteinträge für Mitarbeiter ${employeeId}:`, error);
            return [];
        }
    },
    
    async getAllTimeEntries(startDate = null, endDate = null) {
        try {
            let query = this.timeEntriesCollection;
            
            if (startDate) {
                const startTimestamp = firebase.firestore.Timestamp.fromDate(new Date(startDate));
                query = query.where('clockInTime', '>=', startTimestamp);
            }
            
            if (endDate) {
                const endTimestamp = firebase.firestore.Timestamp.fromDate(new Date(endDate));
                // Setze die Zeit auf das Ende des Tages
                const endDateObj = new Date(endDate);
                endDateObj.setHours(23, 59, 59, 999);
                const endOfDayTimestamp = firebase.firestore.Timestamp.fromDate(endDateObj);
                query = query.where('clockInTime', '<=', endOfDayTimestamp);
            }
            
            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Fehler beim Abrufen aller Zeiteinträge:', error);
            return [];
        }
    },
    
    // Berechnung der Arbeitszeit für einen Zeiteintrag
    calculateWorkHours(timeEntry) {
        try {
            if (!timeEntry || !timeEntry.clockInTime) {
                console.error('Ungültiger Zeiteintrag:', timeEntry);
                return 0;
            }
            
            // Wenn noch kein Ausstempel-Zeitpunkt vorhanden ist, aktuelle Zeit verwenden
            const clockOutTime = timeEntry.clockOutTime || new Date();
            
            // Sicherstellen, dass die Zeitstempel als Date-Objekte vorliegen
            const clockInDate = timeEntry.clockInTime instanceof Date 
                ? timeEntry.clockInTime 
                : new Date(timeEntry.clockInTime);
                
            const clockOutDate = clockOutTime instanceof Date 
                ? clockOutTime 
                : new Date(clockOutTime);
            
            // Differenz in Millisekunden
            const diffMs = clockOutDate - clockInDate;
            
            // Pausenzeit abziehen, falls vorhanden
            let pauseTime = timeEntry.pauseTotalTime || 0;
            
            // Tatsächliche Arbeitszeit = Gesamtzeit - Pausenzeit
            const actualWorkTime = diffMs - pauseTime;
            
            // Differenz in Minuten
            const diffMinutes = Math.floor(actualWorkTime / 60000);
            
            return diffMinutes;
        } catch (error) {
            console.error('Fehler bei der Berechnung der Arbeitsstunden:', error);
            return 0;
        }
    },

    // Berechnung der heutigen Arbeitsstunden
    async getTodaysHours() {
        try {
            console.log('Berechne heutige Arbeitsstunden');
            // Startzeitstempel für heute 00:00 Uhr
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStart = firebase.firestore.Timestamp.fromDate(today);
            
            // Endzeitstempel für heute 23:59:59
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            const todayEndTimestamp = firebase.firestore.Timestamp.fromDate(todayEnd);
            
            console.log('Zeitraum:', todayStart.toDate(), 'bis', todayEndTimestamp.toDate());
            
            // Alle Zeiteinträge von heute abrufen (sowohl aktive als auch abgeschlossene)
            const snapshot = await this.timeEntriesCollection
                .where('clockInTime', '>=', todayStart)
                .where('clockInTime', '<=', todayEndTimestamp)
                .get();
                
            console.log(`${snapshot.docs.length} Zeiteinträge für heute gefunden`);
            
            let totalMinutes = 0;
            const now = firebase.firestore.Timestamp.now();
            
            snapshot.docs.forEach(doc => {
                const entry = doc.data();
                console.log('Verarbeite Eintrag:', entry);
                
                const clockInTime = entry.clockInTime;
                const clockOutTime = entry.clockOutTime || now; // Für aktive Einträge die aktuelle Zeit verwenden
                
                // Umrechnung in JavaScript Date-Objekte für einfachere Berechnung
                const clockInDate = clockInTime.toDate();
                const clockOutDate = clockOutTime.toDate();
                
                // Differenz in Millisekunden berechnen
                const diffMs = clockOutDate - clockInDate;
                const diffMinutes = Math.floor(diffMs / (1000 * 60));
                
                console.log(`Zeitdauer für Eintrag ${doc.id}: ${diffMinutes} Minuten`);
                totalMinutes += diffMinutes;
            });
            
            console.log(`Gesamtarbeitszeit heute: ${totalMinutes} Minuten`);
            return totalMinutes;
        } catch (error) {
            console.error('Fehler bei der Berechnung der heutigen Arbeitsstunden:', error);
            return 0;
        }
    },
    
    // Datei-Upload-Funktionen
    async uploadFile(file, projectId, employeeId, type = 'construction_site', notes = '', comment = '') {
        try {
            if (!file || !projectId || !employeeId) {
                throw new Error('Datei, Projekt-ID und Mitarbeiter-ID müssen angegeben werden');
            }
            
            // Storage-Verfügbarkeit prüfen
            if (!this.storage) {
                throw new Error('Firebase Storage ist nicht verfügbar');
            }
            
            console.log(`🔄 Starte Upload: ${file.name} (${file.size} Bytes, Typ: ${type})`);
            
            // TEMP: Storage für lokale Entwicklung deaktivieren
            console.log('🔧 Storage für lokale Entwicklung deaktiviert, verwende direkt Base64-Upload');
            
            console.log('🚀 Rufe uploadFileAsBase64 auf...');
            const base64Result = await this.uploadFileAsBase64(file, projectId, employeeId, type, notes, comment);
            console.log('✅ uploadFileAsBase64 abgeschlossen, Ergebnis:', base64Result);
            
            if (!base64Result || !base64Result.id) {
                throw new Error('Base64-Upload lieferte kein gültiges Ergebnis');
            }
            
            console.log('🎯 uploadFile gibt Ergebnis zurück:', base64Result.id);
            return base64Result;
            
        } catch (error) {
            console.error('❌ uploadFile Fehler:', error);
            throw error;
        }
    },

    // Fallback-Upload-Methode für lokale Entwicklung (Base64)
    uploadFileAsBase64: async function(file, projectId, employeeId, type, notes, comment) {
        const self = this; // DataService-Referenz sichern
        
        console.log('📄 Starte Base64-Upload (Fallback für lokale Entwicklung)');
        console.log(`📊 Original-Dateigröße: ${(file.size / 1024).toFixed(1)} KB`);
        console.log(`🆔 Upload-ID wird generiert für: ${file.name}`);
        console.log('🔧 Self-Referenz verfügbar:', !!self);
        console.log('🔧 FileUploadsCollection verfügbar:', !!self.fileUploadsCollection);
        
        try {
            // Direkter Zugriff auf DataService
            if (!DataService.fileUploadsCollection) {
                throw new Error('FileUploadsCollection ist nicht verfügbar');
            }
            
            // Bild komprimieren - Start mit aggressiverer Komprimierung
            let compressedFile = await self.compressImage(file, 0.5, 600); // Reduzierte Qualität und Größe
            console.log(`📉 Komprimierte Größe: ${(compressedFile.size / 1024).toFixed(1)} KB`);
            
            // Base64-Konvertierung
            let base64DataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(compressedFile);
            });
            
            let base64String = base64DataUrl.split(',')[1];
            const mimeType = base64DataUrl.split(',')[0];
            let base64Size = base64String.length;
            
            console.log(`📏 Base64-Größe: ${(base64Size / 1024).toFixed(1)} KB`);
            console.log(`🔍 MIME-Type: ${mimeType}`);
            
            // Firestore 900KB Limit prüfen (sicherer Puffer für das 1MB-Limit)
            if (base64Size > 900000) {
                console.warn('⚠️ Base64 zu groß, verwende maximale Kompression');
                
                // Maximale Kompression
                compressedFile = await self.compressImage(file, 0.3, 400); // Sehr aggressive Kompression
                base64DataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = e => resolve(e.target.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(compressedFile);
                });
                
                base64String = base64DataUrl.split(',')[1];
                base64Size = base64String.length;
                console.log(`🔧 Maximale Kompression: ${(base64Size / 1024).toFixed(1)} KB`);
                
                if (base64Size > 900000) {
                    throw new Error(`Bild ist zu groß für Upload (${(base64Size / 1024).toFixed(1)} KB > 900 KB). Bitte verwenden Sie ein kleineres Bild.`);
                }
            }
            
            // Datei-Objekt erstellen mit eindeutiger ID
            const uniqueId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const fileData = {
                id: uniqueId,
                fileName: compressedFile.name || file.name,
                fileSize: compressedFile.size,
                originalSize: file.size,
                fileType: file.type,
                base64String: base64String,
                mimeType: mimeType,
                projectId: projectId,
                employeeId: employeeId,
                type: type,
                notes: notes || '',
                comment: comment || '',
                uploadTime: firebase.firestore.Timestamp.now(),
                isLocalUpload: true,
                compressionLevel: 'normal',
                storagePath: `local://projects/${projectId}/${type}/${file.name}`,
                url: base64DataUrl
            };
            
            console.log('💾 Speichere komprimierte Base64-Datei in Firestore...');
            console.log(`📋 Datenstruktur: fileName=${fileData.fileName}, fileSize=${fileData.fileSize}, type=${fileData.type}`);
            
            const docRef = await DataService.fileUploadsCollection.add(fileData);
            fileData.id = docRef.id;
            
            console.log('✅ Base64-Upload erfolgreich:', fileData.id);
            return fileData;
            
        } catch (error) {
            console.error('❌ Base64-Upload Fehler:', error);
            console.error('❌ Fehler-Details:', error.message, error.code);
            throw error;
        }
    },

    // Bildkomprimierungs-Funktion
    compressImage(file, quality = 0.7, maxWidth = 800) {
        return new Promise((resolve, reject) => {
            // Nur Bilder komprimieren
            if (!file.type.startsWith('image/')) {
                resolve(file);
                return;
            }
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = function() {
                // Größe berechnen unter Beibehaltung des Seitenverhältnisses
                let { width, height } = img;
                
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                // Canvas-Größe setzen
                canvas.width = width;
                canvas.height = height;
                
                // Bild auf Canvas zeichnen
                ctx.drawImage(img, 0, 0, width, height);
                
                // Als komprimierte Datei exportieren
                canvas.toBlob((blob) => {
                    if (blob) {
                        // Blob in File-Objekt umwandeln
                        const compressedFile = new File([blob], file.name, {
                            type: file.type,
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    } else {
                        reject(new Error('Bildkomprimierung fehlgeschlagen'));
                    }
                }, file.type, quality);
            };
            
            img.onerror = function() {
                reject(new Error('Bild konnte nicht geladen werden'));
            };
            
            // Bild laden
            img.src = URL.createObjectURL(file);
        });
    },
    
    // Abrufen aller Datei-Uploads für ein bestimmtes Projekt
    async getFilesByProject(projectId) {
        try {
            const snapshot = await this.fileUploadsCollection
                .where('projectId', '==', projectId)
                .orderBy('uploadTime', 'desc')
                .get();
                
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Fehler beim Abrufen der Dateien für Projekt ${projectId}:`, error);
            return [];
        }
    },
    
    // Abrufen aller Datei-Uploads nach Typ (Baustelle, Lieferschein, Rechnung)
    async getFilesByType(type) {
        try {
            const snapshot = await this.fileUploadsCollection
                .where('type', '==', type)
                .orderBy('uploadTime', 'desc')
                .get();
                
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Fehler beim Abrufen der Dateien vom Typ ${type}:`, error);
            return [];
        }
    },
    
    // Projektdateien abrufen (wird für die Admin-Ansicht benötigt)
    async getProjectFiles(projectId, type = null, includeDrafts = true) {
        try {
            if (!projectId) {
                throw new Error('Keine Projekt-ID angegeben');
            }
            
            let query = this.fileUploadsCollection.where('projectId', '==', projectId);
            
            // Optional nach Dateityp filtern
            if (type) {
                query = query.where('type', '==', type);
            }
            
            // Optional Entwürfe ausschließen
            if (!includeDrafts) {
                query = query.where('isDraft', '==', false);
            }
            
            const snapshot = await query.get();
            return snapshot.docs.map(doc => {
                const data = doc.data();
                
                // Timestamp in normales Date-Objekt umwandeln
                const timestamp = data.uploadTime instanceof firebase.firestore.Timestamp 
                    ? data.uploadTime.toDate() 
                    : new Date(data.uploadTime);
                
                return {
                    id: doc.id,
                    ...data,
                    timestamp: timestamp
                };
            });
        } catch (error) {
            console.error('Fehler beim Abrufen der Projektdateien:', error);
            return [];
        }
    },
    
    // Projektbezogene Zeiteinträge abrufen
    async getProjectTimeEntries(projectId) {
        try {
            if (!projectId) {
                throw new Error('Keine Projekt-ID angegeben');
            }
            
            const snapshot = await this.timeEntriesCollection
                .where('projectId', '==', projectId)
                .get();
                
            return snapshot.docs.map(doc => {
                const data = doc.data();
                
                // Timestamps in normale Date-Objekte umwandeln
                const clockInTime = data.clockInTime instanceof firebase.firestore.Timestamp 
                    ? data.clockInTime.toDate() 
                    : new Date(data.clockInTime);
                    
                const clockOutTime = data.clockOutTime instanceof firebase.firestore.Timestamp 
                    ? data.clockOutTime.toDate() 
                    : data.clockOutTime ? new Date(data.clockOutTime) : null;
                
                return {
                    id: doc.id,
                    ...data,
                    clockInTime: clockInTime,
                    clockOutTime: clockOutTime
                };
            });
        } catch (error) {
            console.error('Fehler beim Abrufen der Projektzeit-Einträge:', error);
            return [];
        }
    },
    
    // Berichte generieren
    async generateEmployeeReport(employeeId, startDate, endDate) {
        try {
            if (!employeeId) {
                throw new Error('Keine Mitarbeiter-ID angegeben');
            }
            
            // Start- und Enddatum formatieren
            startDate = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
            endDate = endDate ? new Date(endDate) : new Date();
            
            // Auf Mitternacht setzen
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            
            // Zeiteinträge des Mitarbeiters im angegebenen Zeitraum abrufen
            const query = await this.timeEntriesCollection
                .where('employeeId', '==', employeeId)
                .where('clockInTime', '>=', startDate)
                .where('clockInTime', '<=', endDate)
                .get();
                
            const timeEntries = [];
            
            // Daten für jeden Zeiteintrag sammeln
            for (const doc of query.docs) {
                const entry = doc.data();
                const entryId = doc.id;
                
                // Projekt abrufen
                const project = await this.getProjectById(entry.projectId);
                
                // Timestamps in Date-Objekte umwandeln
                const clockInTime = entry.clockInTime instanceof firebase.firestore.Timestamp 
                    ? entry.clockInTime.toDate() 
                    : new Date(entry.clockInTime);
                    
                const clockOutTime = entry.clockOutTime instanceof firebase.firestore.Timestamp 
                    ? entry.clockOutTime.toDate() 
                    : entry.clockOutTime ? new Date(entry.clockOutTime) : null;
                
                // Arbeitszeit berechnen
                const workMinutes = this.calculateWorkHours({
                    ...entry,
                    clockInTime,
                    clockOutTime
                });
                
                timeEntries.push({
                    id: entryId,
                    ...entry,
                    clockInTime,
                    clockOutTime,
                    projectName: project ? project.name : 'Unbekanntes Projekt',
                    workMinutes,
                    workHours: (workMinutes / 60).toFixed(2)
                });
            }
            
            // Nach Datum sortieren
            timeEntries.sort((a, b) => b.clockInTime - a.clockInTime);
            
            return timeEntries;
        } catch (error) {
            console.error('Fehler beim Generieren des Mitarbeiterberichts:', error);
            throw error;
        }
    },
    
    // Projektbericht generieren
    async generateProjectReport(projectId, startDate, endDate) {
        try {
            if (!projectId) {
                throw new Error('Keine Projekt-ID angegeben');
            }
            
            // Start- und Enddatum formatieren
            startDate = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
            endDate = endDate ? new Date(endDate) : new Date();
            
            // Auf Mitternacht setzen
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            
            // Projekt-Details abrufen
            const project = await this.getProjectById(projectId);
            if (!project) {
                throw new Error(`Projekt mit ID ${projectId} nicht gefunden`);
            }
            
            // Zeiteinträge für das Projekt im angegebenen Zeitraum abrufen
            const timeEntriesQuery = await this.timeEntriesCollection
                .where('projectId', '==', projectId)
                .where('clockInTime', '>=', startDate)
                .where('clockInTime', '<=', endDate)
                .get();
                
            const timeEntries = [];
            
            // Daten für jeden Zeiteintrag sammeln
            for (const doc of timeEntriesQuery.docs) {
                const entry = doc.data();
                const entryId = doc.id;
                
                // Mitarbeiter abrufen
                const employee = await this.getEmployeeById(entry.employeeId);
                
                // Timestamps in Date-Objekte umwandeln
                const clockInTime = entry.clockInTime instanceof firebase.firestore.Timestamp 
                    ? entry.clockInTime.toDate() 
                    : new Date(entry.clockInTime);
                    
                const clockOutTime = entry.clockOutTime instanceof firebase.firestore.Timestamp 
                    ? entry.clockOutTime.toDate() 
                    : entry.clockOutTime ? new Date(entry.clockOutTime) : null;
                
                // Arbeitszeit berechnen
                const workMinutes = this.calculateWorkHours({
                    ...entry,
                    clockInTime,
                    clockOutTime
                });
                
                timeEntries.push({
                    id: entryId,
                    ...entry,
                    clockInTime,
                    clockOutTime,
                    employeeName: employee ? `${employee.firstName} ${employee.lastName}` : 'Unbekannter Mitarbeiter',
                    workMinutes,
                    workHours: (workMinutes / 60).toFixed(2)
                });
            }
            
            // Projektdateien abrufen
            const projectFiles = await this.getProjectFiles(projectId);
            
            // Gesamtarbeitszeit berechnen
            const totalWorkMinutes = timeEntries.reduce((sum, entry) => sum + entry.workMinutes, 0);
            const totalWorkHours = (totalWorkMinutes / 60).toFixed(2);
            
            // Nach Datum sortieren
            timeEntries.sort((a, b) => b.clockInTime - a.clockInTime);
            
            return {
                project,
                timeEntries,
                projectFiles,
                totalWorkMinutes,
                totalWorkHours
            };
        } catch (error) {
            console.error('Fehler beim Generieren des Projektberichts:', error);
            throw error;
        }
    },
    
    // Dokumentation bearbeiten (für mdorner, um martin's Entwürfe zu überprüfen)
    async reviewDocumentation(fileId, reviewedBy, updatedComment = null, status = 'reviewed') {
        try {
            if (!fileId || !reviewedBy) {
                throw new Error('Datei-ID und Prüfer müssen angegeben werden');
            }
            
            const updateData = {
                reviewedBy,
                reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
                status,
                isDraft: false
            };
            
            // Optional den Kommentar aktualisieren
            if (updatedComment !== null) {
                updateData.comment = updatedComment;
            }
            
            await this.fileUploadsCollection.doc(fileId).update(updateData);
            return true;
        } catch (error) {
            console.error('Fehler beim Überprüfen der Dokumentation:', error);
            throw error;
        }
    },
    
    // Dateien für ein Projekt nach Typ abrufen
    async getProjectFilesByType(projectId, type) {
        if (!projectId) {
            console.error('Keine Projekt-ID angegeben');
            return [];
        }
        
        console.log(`Lade Dateien vom Typ ${type} für Projekt ${projectId}`);
        
        try {
            // Zuerst in der fileUploads-Collection suchen
            const filesSnapshot = await this.fileUploadsCollection
                .where('projectId', '==', projectId)
                .where('type', '==', type)
                .get();
            
            let files = [];
            
            if (!filesSnapshot.empty) {
                // Wenn Dateien gefunden wurden, diese verwenden
                files = filesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log(`${files.length} ${type}-Dateien in fileUploads gefunden`);
                return files;
            }
            
            console.log(`Keine ${type}-Dateien in fileUploads gefunden, suche in Zeiteinträgen...`);
            
            // Fallback: Zeiteinträge laden, um daraus die Bilder/Dokumente zu extrahieren
            const timeEntriesSnapshot = await this.timeEntriesCollection
                .where('projectId', '==', projectId)
                .get();
            
            if (timeEntriesSnapshot.empty) {
                console.log('Keine Zeiteinträge für dieses Projekt gefunden');
                return [];
            }
            
            // Zeiteinträge extrahieren
            const timeEntries = timeEntriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`${timeEntries.length} Zeiteinträge gefunden, suche nach ${type}-Dateien...`);
            
            // Temporäres Array für direkt gespeicherte Dateien
            let directFiles = [];
            
            // Durch alle Zeiteinträge gehen und Dateien sammeln
            timeEntries.forEach(entry => {
                // Je nach Typ die richtigen Felder prüfen
                if (type === 'construction_site') {
                    // sitePhotos prüfen (neues Format)
                    if (entry.sitePhotos && Array.isArray(entry.sitePhotos)) {
                        if (entry.sitePhotos.length > 0 && typeof entry.sitePhotos[0] === 'object' && entry.sitePhotos[0].url) {
                            entry.sitePhotos.forEach(photo => {
                                directFiles.push({
                                    ...photo,
                                    timeEntryId: entry.id,
                                    employeeId: entry.employeeId,
                                    timestamp: entry.clockOutTime || entry.clockInTime,
                                    type: 'construction_site'
                                });
                            });
                        }
                    }
                    
                    // photos prüfen (altes Format)
                    if (entry.photos && Array.isArray(entry.photos)) {
                        if (entry.photos.length > 0 && typeof entry.photos[0] === 'object' && entry.photos[0].url) {
                            entry.photos.forEach(photo => {
                                directFiles.push({
                                    ...photo,
                                    timeEntryId: entry.id,
                                    employeeId: entry.employeeId,
                                    timestamp: entry.clockOutTime || entry.clockInTime,
                                    type: 'construction_site'
                                });
                            });
                        }
                    }
                } else if (type === 'delivery_note') {
                    // documents oder deliveryNotes für Dokumente prüfen
                    if (entry.documents && Array.isArray(entry.documents)) {
                        if (entry.documents.length > 0 && typeof entry.documents[0] === 'object' && entry.documents[0].url) {
                            entry.documents.forEach(doc => {
                                directFiles.push({
                                    ...doc,
                                    timeEntryId: entry.id,
                                    employeeId: entry.employeeId,
                                    timestamp: entry.clockOutTime || entry.clockInTime,
                                    type: 'delivery_note'
                                });
                            });
                        }
                    }
                    
                    if (entry.deliveryNotes && Array.isArray(entry.deliveryNotes)) {
                        if (entry.deliveryNotes.length > 0 && typeof entry.deliveryNotes[0] === 'object' && entry.deliveryNotes[0].url) {
                            entry.deliveryNotes.forEach(note => {
                                directFiles.push({
                                    ...note,
                                    timeEntryId: entry.id,
                                    employeeId: entry.employeeId,
                                    timestamp: entry.clockOutTime || entry.clockInTime,
                                    type: 'delivery_note'
                                });
                            });
                        }
                    }
                }
            });
            
            console.log(`Insgesamt ${directFiles.length} direkte ${type}-Dateien in Zeiteinträgen gefunden`);
            return directFiles;
            
        } catch (error) {
            console.error(`Fehler beim Laden der ${type}-Dateien für Projekt ${projectId}:`, error);
            return [];
        }
    },
    
    /**
     * Verbesserte Funktion zum Laden aller Projekt-Dateien (Bilder und Dokumente)
     * Durchsucht alle Ordner und Unterordner (construction_site, site, etc.)
     */
    async getProjectAllFiles(projectId) {
        if (!projectId) {
            console.error('Keine Projekt-ID angegeben');
            return { construction_site: [], delivery_note: [] };
        }
        
        console.log(`Lade ALLE Dateien für Projekt ${projectId} aus allen Quellen...`);
        
        try {
            // Ergebnis-Objekt vorbereiten
            const result = {
                construction_site: [],
                delivery_note: []
            };
            
            // 1. Zuerst in der fileUploads-Collection nach Dateien mit dieser projectId suchen
            console.log(`Suche in fileUploads nach Dateien für Projekt ${projectId}...`);
            
            const filesSnapshot = await this.fileUploadsCollection
                .where('projectId', '==', projectId)
                .get();
            
            if (!filesSnapshot.empty) {
                // Dateien nach Typ sortieren
                filesSnapshot.docs.forEach(doc => {
                    const file = { id: doc.id, ...doc.data() };
                    const fileType = file.type || 'construction_site'; // Default-Typ, falls nicht angegeben
                    
                    // In entsprechendes Array einfügen
                    if (fileType === 'construction_site' || fileType === 'site') {
                        result.construction_site.push(file);
                    } else if (fileType === 'delivery_note' || fileType === 'document') {
                        result.delivery_note.push(file);
                    }
                });
                
                console.log(`${filesSnapshot.docs.length} Dateien in fileUploads gefunden:`, 
                    `${result.construction_site.length} Baustellenfotos, ${result.delivery_note.length} Dokumente`);
            } else {
                console.log(`Keine Dateien in fileUploads für Projekt ${projectId} gefunden`);
            }
            
            // 2. In Zeiteinträgen suchen (für direktes Einbetten von Bildern und Dokumenten)
            console.log(`Suche in Zeiteinträgen nach eingebetteten Dateien für Projekt ${projectId}...`);
            
            const timeEntriesSnapshot = await this.timeEntriesCollection
                .where('projectId', '==', projectId)
                .get();
            
            if (!timeEntriesSnapshot.empty) {
                const timeEntries = timeEntriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log(`${timeEntries.length} Zeiteinträge gefunden, extrahiere eingebettete Dateien...`);
                
                // Durch alle Zeiteinträge gehen und Dateien sammeln
                timeEntries.forEach(entry => {
                    // Baustellenfotos
                    // 1. sitePhotos (neues Format)
                    if (entry.sitePhotos && Array.isArray(entry.sitePhotos)) {
                        if (entry.sitePhotos.length > 0 && typeof entry.sitePhotos[0] === 'object' && entry.sitePhotos[0].url) {
                            entry.sitePhotos.forEach(photo => {
                                result.construction_site.push({
                                    ...photo,
                                    timeEntryId: entry.id,
                                    employeeId: entry.employeeId,
                                    timestamp: entry.clockOutTime || entry.clockInTime,
                                    type: 'construction_site'
                                });
                            });
                        }
                    }
                    
                    // 2. photos (altes Format)
                    if (entry.photos && Array.isArray(entry.photos)) {
                        if (entry.photos.length > 0 && typeof entry.photos[0] === 'object' && entry.photos[0].url) {
                            entry.photos.forEach(photo => {
                                result.construction_site.push({
                                    ...photo,
                                    timeEntryId: entry.id,
                                    employeeId: entry.employeeId,
                                    timestamp: entry.clockOutTime || entry.clockInTime,
                                    type: 'construction_site'
                                });
                            });
                        }
                    }
                    
                    // Dokumente und Lieferscheine
                    // 1. documents
                    if (entry.documents && Array.isArray(entry.documents)) {
                        if (entry.documents.length > 0 && typeof entry.documents[0] === 'object' && entry.documents[0].url) {
                            entry.documents.forEach(doc => {
                                result.delivery_note.push({
                                    ...doc,
                                    timeEntryId: entry.id,
                                    employeeId: entry.employeeId,
                                    timestamp: entry.clockOutTime || entry.clockInTime,
                                    type: 'delivery_note'
                                });
                            });
                        }
                    }
                    
                    // 2. deliveryNotes
                    if (entry.deliveryNotes && Array.isArray(entry.deliveryNotes)) {
                        if (entry.deliveryNotes.length > 0 && typeof entry.deliveryNotes[0] === 'object' && entry.deliveryNotes[0].url) {
                            entry.deliveryNotes.forEach(note => {
                                result.delivery_note.push({
                                    ...note,
                                    timeEntryId: entry.id,
                                    employeeId: entry.employeeId,
                                    timestamp: entry.clockOutTime || entry.clockInTime,
                                    type: 'delivery_note'
                                });
                            });
                        }
                    }
                });
                
                console.log(`Aus Zeiteinträgen extrahiert: ${result.construction_site.length} Baustellenfotos, ${result.delivery_note.length} Dokumente`);
            } else {
                console.log(`Keine Zeiteinträge für Projekt ${projectId} gefunden`);
            }
            
            // 3. Nach Timestamp sortieren (neueste zuerst)
            result.construction_site.sort((a, b) => {
                const dateA = a.timestamp instanceof firebase.firestore.Timestamp ? 
                    a.timestamp.toDate() : new Date(a.timestamp || a.uploadTime || 0);
                const dateB = b.timestamp instanceof firebase.firestore.Timestamp ? 
                    b.timestamp.toDate() : new Date(b.timestamp || b.uploadTime || 0);
                return dateB - dateA;
            });
            
            result.delivery_note.sort((a, b) => {
                const dateA = a.timestamp instanceof firebase.firestore.Timestamp ? 
                    a.timestamp.toDate() : new Date(a.timestamp || a.uploadTime || 0);
                const dateB = b.timestamp instanceof firebase.firestore.Timestamp ? 
                    b.timestamp.toDate() : new Date(b.timestamp || b.uploadTime || 0);
                return dateB - dateA;
            });
            
            // 4. Abschließende Zählung
            console.log(`Insgesamt gefunden: ${result.construction_site.length} Baustellenfotos, ${result.delivery_note.length} Dokumente`);
            
            return result;
            
        } catch (error) {
            console.error(`Fehler beim Laden der Dateien für Projekt ${projectId}:`, error);
            return { construction_site: [], delivery_note: [] };
        }
    },
    
    // Aktive Projekte für Mitarbeiter abrufen
    async getActiveProjects() {
        try {
            console.log('Lade aktive Projekte...');
            
            // Einfacher Ansatz: Alle Projekte laden und clientseitig filtern
            const snapshot = await this.projectsCollection.get();
            
            let projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Nur aktive Projekte filtern (falls status-Feld existiert)
            projects = projects.filter(project => 
                !project.status || project.status === 'active' || project.status === 'aktiv'
            );
            
            // Nach Namen sortieren
            projects.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            
            console.log(`${projects.length} aktive Projekte gefunden:`, projects);
            return projects;
        } catch (error) {
            console.error('Fehler beim Abrufen aktiver Projekte:', error);
            console.error('Error details:', error.message, error.code);
            return [];
        }
    },

    // Live-Dokumentation zu einem aktiven Zeiteintrag hinzufügen
    async addLiveDocumentationToTimeEntry(timeEntryId, documentationData) {
        if (!timeEntryId) {
            throw new Error('Keine Zeiteintrag-ID angegeben');
        }
        
        try {
            console.log('Füge Live-Dokumentation zu Zeiteintrag hinzu:', timeEntryId, documentationData);
            
            // Aktuellen Zeiteintrag abrufen
            const currentEntry = await this.getTimeEntryById(timeEntryId);
            if (!currentEntry) {
                throw new Error('Zeiteintrag nicht gefunden');
            }
            
            // Vorhandene Live-Dokumentation laden oder neues Array erstellen
            const existingLiveDocumentation = currentEntry.liveDocumentation || [];
            
            // Neue Dokumentation mit nur Referenzen (IDs) statt kompletten Objekten
            const newDocumentation = {
                timestamp: firebase.firestore.Timestamp.now(),
                notes: documentationData.notes || '',
                // Nur IDs speichern, nicht komplette Objekte
                imageIds: (documentationData.images || []).map(img => img.id),
                documentIds: (documentationData.documents || []).map(doc => doc.id),
                photoCount: documentationData.photoCount || 0,
                documentCount: documentationData.documentCount || 0,
                addedBy: documentationData.addedBy,
                addedByName: documentationData.addedByName
            };
            
            console.log('📋 Speichere Live-Dokumentation mit Referenzen:', newDocumentation);
            
            // Dokumentation zu bestehender Liste hinzufügen
            const updatedLiveDocumentation = [...existingLiveDocumentation, newDocumentation];
            
            // Zeiteintrag aktualisieren (nur mit IDs, nicht mit kompletten Objekten)
            await this.updateTimeEntry(timeEntryId, {
                liveDocumentation: updatedLiveDocumentation,
                hasLiveDocumentation: true
            });
            
            console.log('✅ Live-Dokumentation erfolgreich hinzugefügt (nur Referenzen)');
            return newDocumentation;
        } catch (error) {
            console.error('Fehler beim Hinzufügen der Live-Dokumentation:', error);
            throw error;
        }
    }
};

// Firebase initialisieren, wenn das Dokument geladen ist
document.addEventListener('DOMContentLoaded', () => {
    DataService.init();
});

// Hilfsfunktion zum Exportieren von Berichten als CSV
DataService.exportToCsv = function(data, filename) {
    // Falls keine Daten vorhanden sind
    if (!data || !data.length) {
        console.error('Keine Daten zum Exportieren vorhanden');
        return false;
    }
    
    // CSV-Header aus den Eigenschaften des ersten Objekts erstellen
    const headers = Object.keys(data[0]);
    
    // CSV-Zeilen erstellen
    const csvRows = [];
    
    // Header-Zeile hinzufügen
    csvRows.push(headers.join(','));
    
    // Datenzeilen hinzufügen
    for (const row of data) {
        const values = headers.map(header => {
            const value = row[header];
            
            // Datum formatieren
            if (value instanceof Date) {
                return `"${value.toLocaleString('de-DE')}"`;  
            }
            
            // Zeichenketten in Anführungszeichen einschließen und Kommas escapen
            if (typeof value === 'string') {
                return `"${value.replace(/"/g, '""')}"`;  
            }
            
            return value;
        });
        
        csvRows.push(values.join(','));
    }
    
    // CSV-Inhalt erstellen
    const csvContent = csvRows.join('\n');
    
    // CSV-Datei herunterladen
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    // Browser-Support für URL.createObjectURL()
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    return true;
};
