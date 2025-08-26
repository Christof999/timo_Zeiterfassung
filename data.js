/**
 * Datenverwaltung für die Lauffer Zeiterfassung App
 * Verantwortlich für die Speicherung und Abfrage von Mitarbeitern, Projekten, Zeiteinträgen und Fahrzeugen
 * Firebase-Version - JETZT MIT ANONYMER AUTHENTIFIZIERUNG
 */

/**
 * @typedef {Object} Employee
 * @property {string} id
 * @property {string} username
 * @property {string} [name]
 * @property {string} [firstName]
 * @property {string} [lastName]
 * @property {number} [hourlyWage]
 * @property {boolean} [isAdmin]
 * @property {('active'|'inactive')} [status]
 * @property {{ total:number, used:number, year:number }} [vacationDays]
 */

/**
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} [name]
 * @property {string} [client]
 * @property {string} [location]
 * @property {any} [startDate]
 * @property {any} [endDate]
 * @property {string} [description]
 */

/**
 * @typedef {Object} Vehicle
 * @property {string} id
 * @property {string} name
 * @property {string} [type]
 * @property {string} [licensePlate]
 * @property {number} [hourlyRate]
 * @property {boolean} [isActive]
 */

/**
 * @typedef {Object} TimeEntry
 * @property {string} id
 * @property {string} employeeId
 * @property {string} projectId
 * @property {Date|any} clockInTime
 * @property {Date|any|null} clockOutTime
 * @property {{lat:number|null,lng:number|null}|null} [clockInLocation]
 * @property {{lat:number|null,lng:number|null}|null} [clockOutLocation]
 * @property {string} [notes]
 * @property {number} [pauseTotalTime]
 * @property {Array<{start:any,end:any,duration:number,startedBy?:string,endedBy?:string}>} [pauseDetails]
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
  vehiclesCollection: null,
  vehicleUsagesCollection: null,
  leaveRequestsCollection: null,

  // In-Memory Deduplizierung (zurückgesetzt auf ursprüngliches Verhalten - nicht verwendet)

  // Ein Promise, das sicherstellt, dass keine DB-Anfrage gesendet wird,
  // bevor die anonyme Anmeldung abgeschlossen ist.
  _authReadyPromise: null,
  // Öffentlicher Zugriff auf das Auth-Ready-Promise
  get authReady() {
    return this._authReadyPromise;
  },

  // Initialisierung der Firebase-Verbindung und der Authentifizierung
  init() {
    this.db = firebase.firestore();
    const auth = firebase.auth();

    if (firebase.storage) {
      this.storage = firebase.storage();
    } else {
      console.warn("Firebase Storage nicht verfügbar");
      this.storage = null;
    }

    this.employeesCollection = this.db.collection("employees");
    this.projectsCollection = this.db.collection("projects");
    this.timeEntriesCollection = this.db.collection("timeEntries");
    this.usersCollection = this.db.collection("users");
    this.fileUploadsCollection = this.db.collection("fileUploads");
    this.vehiclesCollection = this.db.collection("vehicles");
    this.vehicleUsagesCollection = this.db.collection("vehicleUsages");
    this.leaveRequestsCollection = this.db.collection("leaveRequests");

    // Check for session stored admin login
    const storedAdmin = this.getCurrentAdmin();
    
    this._authReadyPromise = new Promise((resolve) => {
      // Set up auth state change listener first
      const unsubscribe = auth.onAuthStateChanged((user) => {
        if (user) {
          console.log(`✅ Firebase Auth bereit. ${user.isAnonymous ? 'Anonymer' : 'Authentifizierter'} Benutzer:`, 
                      user.uid, user.isAnonymous ? '' : user.email);
          
          // Check if we have an admin in local storage but Firebase shows anonymous
          if (user.isAnonymous && storedAdmin) {
            console.log('Admin in Session gefunden, aber Firebase zeigt anonymen Benutzer. Session wird aktualisiert.');
            // WICHTIG: Auth Promise jetzt sofort auflösen - lokaler Admin-Login ist gültig!
            resolve();
            unsubscribe();
          } else {
            // Normal case - auth state is as expected
            resolve();
            unsubscribe();
          }
        } else {
          console.log('Kein Benutzer angemeldet.');
        }
      });
    
      // Check current authentication state
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        // If we have stored admin credentials but no current user, don't sign in anonymously
        // This gives a chance for admin login to be restored from session
        if (storedAdmin) {
          console.log('Admin in lokaler Session gefunden. Überspringe anonyme Anmeldung.');
          // We'll try to sign in properly during app initialization elsewhere
        } else {
          // Only sign in anonymously if no stored admin session and no current user
          console.log('Keine Admin-Session gefunden. Starte anonyme Anmeldung...');
          auth.signInAnonymously().catch((error) => {
            console.error("❌ Fehler bei der anonymen Anmeldung:", error);
          });
        }
      } else {
        console.log("Benutzer bereits authentifiziert:", currentUser.uid, 
                  currentUser.isAnonymous ? "(anonym)" : currentUser.email);
      }
    });

    console.log("DataService initialisiert und wartet auf Firebase Auth...");
  },

  // Admin-Verwaltung (bleibt unverändert)
  _currentAdmin: null,
  _currentUser: null,

  getCurrentAdmin() {
    try {
      // Zuerst neuere Admin-Session prüfen
      let savedAdmin = localStorage.getItem("lauffer_admin_user");
      if (!savedAdmin) {
        // Fallback für kompatibilität mit admin.js
        savedAdmin = localStorage.getItem("lauffer_current_admin");
      }
      return savedAdmin ? JSON.parse(savedAdmin) : null;
    } catch (error) {
      console.error("Fehler beim Laden des Admins:", error);
      return null;
    }
  },

  setCurrentAdmin(admin) {
    this._currentAdmin = admin;
    if (admin) {
      localStorage.setItem("lauffer_admin_user", JSON.stringify(admin));
      // Auch für Kompatibilität mit admin.js
      localStorage.setItem("lauffer_current_admin", JSON.stringify(admin));
    } else {
      localStorage.removeItem("lauffer_admin_user");
      localStorage.removeItem("lauffer_current_admin");
    }
  },

  clearCurrentAdmin() {
    this._currentAdmin = null;
    localStorage.removeItem("lauffer_admin_user");
  },

  // Mitarbeiter-Sitzungsverwaltung (bleibt unverändert)
  getCurrentUser() {
    try {
      const savedUser = localStorage.getItem("lauffer_current_user");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (error) {
      console.error("Fehler beim Laden des Benutzers:", error);
      return null;
    }
  },

  setCurrentUser(user) {
    this._currentUser = user;
    if (user) {
      const { password, ...safeUserData } = user;
      localStorage.setItem(
        "lauffer_current_user",
        JSON.stringify(safeUserData)
      );
    }
  },

  clearCurrentUser() {
    this._currentUser = null;
    localStorage.removeItem("lauffer_user");
  },
  
  /**
   * Gibt den aktuell angemeldeten Mitarbeiter zurück
   * @returns {Object|null} Die Daten des angemeldeten Mitarbeiters oder null
   */
  getCurrentEmployee() {
    return this.getCurrentUser();
  },
  
  /**
   * Prüft, ob der aktuell angemeldete Benutzer Admin-Rechte hat
   * @returns {Promise<boolean>} True, wenn der Benutzer Admin-Rechte hat, sonst false
   */
  async isAdmin() {
    await this._authReadyPromise;
    try {
      // Zuerst prüfen, ob ein Admin in der Session gespeichert ist
      const storedAdmin = this.getCurrentAdmin();
      if (storedAdmin) {
        return true;
      }
      
      // Wenn kein Admin in der Session, dann prüfen, ob der angemeldete Benutzer Admin-Rechte hat
      const currentUser = this.getCurrentUser();
      if (currentUser && currentUser.isAdmin === true) {
        return true;
      }
      
      // Falls Firebase Auth nicht anonym ist, den Benutzer aus der Datenbank laden
      const firebaseUser = firebase.auth().currentUser;
      if (firebaseUser && !firebaseUser.isAnonymous) {
        const userDoc = await this.employeesCollection.doc(firebaseUser.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData.isAdmin === true) {
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error('Fehler bei der Überprüfung der Admin-Rechte:', error);
      return false;
    }
  },

  // --- AB HIER MUSS JED E FUNKTION AUF DIE AUTH WARTEN ---

  async getAllEmployees() {
    await this._authReadyPromise;
    try {
      const snapshot = await this.employeesCollection.get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Fehler beim Abrufen aller Mitarbeiter:", error);
      return [];
    }
  },

  async getEmployeeById(id) {
    await this._authReadyPromise;
    try {
      console.log("Lade Mitarbeiter mit ID:", id);
      if (!id) {
        console.error("Keine gültige ID angegeben");
        return null;
      }
      
      // Erzwinge ein Abrufen der aktuellsten Daten ohne Cache
      const doc = await this.employeesCollection.doc(id).get({ source: 'server' });
      
      if (doc.exists) {
        const employeeData = { id: doc.id, ...doc.data() };
        console.log("Mitarbeiterdaten geladen:", employeeData);
        
        // Zusätzliches Logging für Urlaubsdaten
        if (employeeData.vacationDays) {
          console.log("Urlaubsdaten in Firestore:", {
            total: employeeData.vacationDays.total,
            used: employeeData.vacationDays.used,
            year: employeeData.vacationDays.year,
            verfügbar: employeeData.vacationDays.total - employeeData.vacationDays.used
          });
        } else {
          console.log("Keine Urlaubsdaten in Firestore gefunden!");
        }
        
        return employeeData;
      }
      console.log("Mitarbeiter nicht gefunden");
      return null;
    } catch (error) {
      console.error(`Fehler beim Abrufen des Mitarbeiters ${id}:`, error);
      return null;
    }
  },

  async getEmployeeByUsername(username) {
    await this._authReadyPromise;
    try {
      const snapshot = await this.employeesCollection
        .where("username", "==", username)
        .limit(1)
        .get();
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
      return null;
    } catch (error) {
      console.error(
        `Fehler beim Suchen des Mitarbeiters mit Benutzername ${username}:`,
        error
      );
      return null;
    }
  },

  async createEmployee(employeeData) {
    await this._authReadyPromise;
    try {
      console.log("Erstelle neuen Mitarbeiter:", employeeData);
      const existingSnapshot = await this.employeesCollection
        .where("username", "==", employeeData.username)
        .limit(1)
        .get();
      if (!existingSnapshot.empty) {
        throw new Error("Dieser Benutzername ist bereits vergeben.");
      }
      
      // Falls hourlyWage angegeben ist, sicherstellen, dass es als Zahl gespeichert wird
      if (employeeData.hourlyWage !== undefined) {
        employeeData.hourlyWage = parseFloat(employeeData.hourlyWage);
      }
      
      // Standard-Urlaubsdaten hinzufügen, falls nicht vorhanden
      if (employeeData.vacationDays === undefined) {
        employeeData.vacationDays = {
          total: 30, // Jährliches Kontingent: 30 Tage
          used: 0,   // Bisher genutzte Tage
          year: new Date().getFullYear() // Aktuelles Jahr
        };
      }
      
      const result = await this.employeesCollection.add(employeeData);
      return result.id;
    } catch (error) {
      console.error("Fehler beim Erstellen des Mitarbeiters:", error);
      throw error;
    }
  },

  async updateEmployee(id, employeeData) {
    await this._authReadyPromise;
    console.log("Starte updateEmployee mit ID:", id, "und Daten:", employeeData);
    try {
      if (!id) {
        throw new Error("Keine gültige Mitarbeiter-ID angegeben");
      }
      const employeeDoc = await this.employeesCollection.doc(id).get();
      if (!employeeDoc.exists) {
        throw new Error(`Mitarbeiter mit ID ${id} nicht gefunden`);
      }
      if (employeeData.username) {
        const existingSnapshot = await this.employeesCollection
          .where("username", "==", employeeData.username)
          .limit(1)
          .get();
        if (!existingSnapshot.empty && existingSnapshot.docs[0].id !== id) {
          throw new Error("Dieser Benutzername ist bereits vergeben.");
        }
      }
      
      // Falls hourlyWage angegeben ist, sicherstellen, dass es als Zahl gespeichert wird
      if (employeeData.hourlyWage !== undefined) {
        employeeData.hourlyWage = parseFloat(employeeData.hourlyWage);
      }
      
      console.log(`Aktualisiere Mitarbeiter mit ID: ${id}`);
      await this.employeesCollection.doc(id).update(employeeData);
      return true;
    } catch (error) {
      console.error(
        `Fehler beim Aktualisieren des Mitarbeiters mit ID ${id}:`,
        error
      );
      throw error;
    }
  },

  async deleteEmployee(id) {
    await this._authReadyPromise;
    try {
      const activeEntries = await this.timeEntriesCollection
        .where("employeeId", "==", id)
        .where("clockOutTime", "==", null)
        .limit(1)
        .get();
      if (!activeEntries.empty) {
        throw new Error(
          "Dieser Mitarbeiter hat noch aktive Zeiteinträge und kann nicht gelöscht werden."
        );
      }
      await this.employeesCollection.doc(id).delete();
      return true;
    } catch (error) {
      // KORRIGIERTE STELLE: Die Klammer { wurde hier hinzugefügt.
      console.error(`Fehler beim Löschen des Mitarbeiters ${id}:`, error);
      throw error;
    }
  },

  async authenticateEmployee(username, password) {
    await this._authReadyPromise;
    try {
      const employee = await this.getEmployeeByUsername(username);
      if (
        employee &&
        employee.password === password &&
        employee.status === "active"
      ) {
        const { password, ...employeeData } = employee;
        return employeeData;
      }
      return null;
    } catch (error) {
      console.error("Fehler bei der Authentifizierung:", error);
      return null;
    }
  },

  async getAllProjects() {
    await this._authReadyPromise;
    try {
      const snapshot = await this.projectsCollection.get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Fehler beim Abrufen aller Projekte:", error);
      return [];
    }
  },

  async getProjectById(projectId) {
    // Cache-Key für dieses Projekt
    const cacheKey = `project_${projectId}`;
    
    // Prüfe auf Cache-Eintrag
    const cachedProject = sessionStorage.getItem(cacheKey);
    if (cachedProject) {
      console.log(`🔄 Projekt ${projectId} aus Cache geladen`);
      return JSON.parse(cachedProject);
    }
    
    await this._authReadyPromise;
    if (!projectId) {
      console.error("❌ Keine Projekt-ID angegeben");
      return null;
    }
    
    console.log(`🔍 Starte Firestore-Abfrage für Projekt ${projectId}...`);
    
    try {
      // Verwende get() mit explizitem source-Parameter für schnellere Antwort
      const doc = await this.projectsCollection.doc(projectId).get({ source: 'server' });
      console.log(`✅ Firestore-Antwort für Projekt ${projectId} erhalten`);
      
      if (!doc.exists) {
        console.log(`❌ Projekt mit ID ${projectId} nicht gefunden`);
        return null;
      }
      
      const projectData = doc.data();
      const project = { id: doc.id, ...projectData };
      
      // Speichere im Cache
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(project));
      } catch (cacheError) {
        console.warn(`⚠️ Projekt konnte nicht gecached werden: ${cacheError.message}`);
      }
      
      return project;
    } catch (error) {
      console.error(
        `❌ Fehler beim Abrufen des Projekts mit ID ${projectId}:`,
        error
      );
      
      // Versuche eine alternative Abfrage ohne Quelle anzugeben
      try {
        console.log(`🔄 Versuche alternative Projekt-Abfrage...`);
        const altDoc = await this.projectsCollection.doc(projectId).get();
        
        if (!altDoc.exists) {
          console.log(`❌ Projekt mit ID ${projectId} nicht gefunden (Alternative Abfrage)`);  
          return null;
        }
        
        const projectData = altDoc.data();
        const project = { id: altDoc.id, ...projectData };
        
        // Speichere im Cache
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(project));
        } catch (cacheError) {
          console.warn(`⚠️ Projekt konnte nicht gecached werden: ${cacheError.message}`);
        }
        
        return project;
      } catch (altError) {
        console.error(
          `❌ Auch alternative Projekt-Abfrage fehlgeschlagen:`,
          altError
        );
        return null;
      }
    }
  },

  async getProjectTimeEntries(projectId) {
    await this._authReadyPromise;
    if (!projectId) {
      console.error("Keine Projekt-ID angegeben");
      return [];
    }
    try {
      const snapshot = await this.timeEntriesCollection
        .where("projectId", "==", projectId)
        .get();
      if (snapshot.empty) {
        return [];
      }
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error(
        `Fehler beim Laden der Zeiteinträge für Projekt ${projectId}:`,
        error
      );
      return [];
    }
  },

  async getTimeEntryByIdAndEmployeeId(timeEntryId, employeeId) {
    await this._authReadyPromise;
    if (!timeEntryId || !employeeId) {
      console.error("Keine Zeiteintrags-ID oder Mitarbeiter-ID angegeben");
      return null;
    }
    try {
      const doc = await this.timeEntriesCollection.doc(timeEntryId).get();
      if (doc.exists && doc.data().employeeId === employeeId) {
        return { id: doc.id, ...doc.data() };
      }
      return null;
    } catch (error) {
      console.error("Fehler beim Abrufen des Zeiteintrags:", error);
      return null;
    }
  },

  async getTimeEntryById(timeEntryId) {
    await this._authReadyPromise;
    if (!timeEntryId) {
      console.error("Keine Zeiteintrags-ID angegeben");
      return null;
    }
    try {
      const doc = await this.timeEntriesCollection.doc(timeEntryId).get();
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      return null;
    } catch (error) {
      console.error("Fehler beim Abrufen des Zeiteintrags:", error);
      return null;
    }
  },

  async getProjectFiles(projectId, type = "construction_site") {
    await this._authReadyPromise;
    if (!projectId) {
      console.error("Keine Projekt-ID angegeben");
      return [];
    }
    try {
      const timeEntries = await this.getProjectTimeEntries(projectId);
      if (!timeEntries || timeEntries.length === 0) {
        return [];
      }
      let fileIds = [];
      let directFiles = [];
      timeEntries.forEach((entry) => {
        if (type === "construction_site") {
          if (
            entry.sitePhotoUploads &&
            Array.isArray(entry.sitePhotoUploads)
          ) {
            fileIds = [...fileIds, ...entry.sitePhotoUploads];
          }
          if (entry.photos && Array.isArray(entry.photos)) {
            if (
              entry.photos.length > 0 &&
              typeof entry.photos[0] === "object" &&
              entry.photos[0].url
            ) {
              entry.photos.forEach((photo) => {
                directFiles.push({
                  ...photo,
                  timeEntryId: entry.id,
                  employeeId: entry.employeeId,
                  timestamp: entry.clockOutTime || entry.clockInTime,
                  type: "construction_site",
                });
              });
            } else {
              fileIds = [...fileIds, ...entry.photos];
            }
          }
        } else if (type === "delivery_note") {
          if (
            entry.documentPhotoUploads &&
            Array.isArray(entry.documentPhotoUploads)
          ) {
            fileIds = [...fileIds, ...entry.documentPhotoUploads];
          }
          if (entry.documents && Array.isArray(entry.documents)) {
            if (
              entry.documents.length > 0 &&
              typeof entry.documents[0] === "object" &&
              entry.documents[0].url
            ) {
              entry.documents.forEach((doc) => {
                directFiles.push({
                  ...doc,
                  timeEntryId: entry.id,
                  employeeId: entry.employeeId,
                  timestamp: entry.clockOutTime || entry.clockInTime,
                  type: "delivery_note",
                });
              });
            } else {
              fileIds = [...fileIds, ...entry.documents];
            }
          }
          if (entry.deliveryNotes && Array.isArray(entry.deliveryNotes)) {
            fileIds = [...fileIds, ...entry.deliveryNotes];
          }
        }
      });
      fileIds = [...new Set(fileIds)].filter((id) => id && typeof id === "string");
      if (fileIds.length === 0 && directFiles.length > 0) {
        return directFiles;
      }
      if (fileIds.length === 0 && directFiles.length === 0) {
        return [];
      }
      const filePromises = fileIds.map((id) => this.getFileUploadById(id));
      const files = await Promise.all(filePromises);
      const validFiles = files.filter((file) => file !== null);
      // Duplikate entfernen (z. B. wenn Datei sowohl als Upload-Dokument als auch direkt am Zeiteintrag vorhanden ist)
      const combined = [...validFiles, ...directFiles];
      const seen = new Set();
      const deduped = [];
      for (const f of combined) {
        const key = f.id || f.url || `${f.fileName}|${f.fileSize}|${f.employeeId}|${f.projectId}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(f);
        }
      }
      return deduped;
    } catch (error) {
      console.error(
        `Fehler beim Laden der Dateien für Projekt ${projectId}:`,
        error
      );
      return [];
    }
  },

  async getTimeEntryFiles(timeEntryId, type = "construction_site") {
    await this._authReadyPromise;
    if (!timeEntryId) {
      console.error("Keine Zeiteintrags-ID angegeben");
      return [];
    }
    try {
      const timeEntry = await this.getTimeEntryById(timeEntryId);
      if (!timeEntry) {
        return [];
      }
      let uploadIds = [];
      if (type === "construction_site") {
        if (
          timeEntry.sitePhotoUploads &&
          Array.isArray(timeEntry.sitePhotoUploads)
        ) {
          uploadIds = timeEntry.sitePhotoUploads;
        }
        if (timeEntry.photos && Array.isArray(timeEntry.photos)) {
          if (
            timeEntry.photos.length > 0 &&
            typeof timeEntry.photos[0] === "object" &&
            timeEntry.photos[0].url
          ) {
            return timeEntry.photos;
          }
          uploadIds = [...uploadIds, ...timeEntry.photos];
        }
        if (timeEntry.sitePhotos && Array.isArray(timeEntry.sitePhotos)) {
          if (
            timeEntry.sitePhotos.length > 0 &&
            typeof timeEntry.sitePhotos[0] === "object" &&
            timeEntry.sitePhotos[0].url
          ) {
            return timeEntry.sitePhotos;
          }
          uploadIds = [...uploadIds, ...timeEntry.sitePhotos];
        }
      } else if (type === "delivery_note") {
        if (
          timeEntry.documentPhotoUploads &&
          Array.isArray(timeEntry.documentPhotoUploads)
        ) {
          uploadIds = timeEntry.documentPhotoUploads;
        }
        if (timeEntry.documents && Array.isArray(timeEntry.documents)) {
          if (
            timeEntry.documents.length > 0 &&
            typeof timeEntry.documents[0] === "object" &&
            timeEntry.documents[0].url
          ) {
            return timeEntry.documents;
          }
          uploadIds = [...uploadIds, ...timeEntry.documents];
        }
        if (timeEntry.deliveryNotes && Array.isArray(timeEntry.deliveryNotes)) {
          if (
            timeEntry.deliveryNotes.length > 0 &&
            typeof timeEntry.deliveryNotes[0] === "object" &&
            timeEntry.deliveryNotes[0].url
          ) {
            return timeEntry.deliveryNotes;
          }
          uploadIds = [...uploadIds, ...timeEntry.deliveryNotes];
        }
      }
      let liveFileIds = [];
      if (
        timeEntry.liveDocumentation &&
        Array.isArray(timeEntry.liveDocumentation)
      ) {
        timeEntry.liveDocumentation.forEach((liveDoc) => {
          if (
            type === "construction_site" &&
            liveDoc.imageIds &&
            Array.isArray(liveDoc.imageIds)
          ) {
            liveFileIds = [...liveFileIds, ...liveDoc.imageIds];
          }
          if (
            type === "delivery_note" &&
            liveDoc.documentIds &&
            Array.isArray(liveDoc.documentIds)
          ) {
            liveFileIds = [...liveFileIds, ...liveDoc.documentIds];
          }
        });
      }
      const allFileIds = [...uploadIds, ...liveFileIds];
      const uniqueFileIds = [...new Set(allFileIds)].filter(
        (id) => id && typeof id === "string"
      );
      if (!uniqueFileIds.length) {
        return [];
      }
      const filePromises = uniqueFileIds.map((id) =>
        this.getFileUploadById(id)
      );
      const files = await Promise.all(filePromises);
      return files.filter((file) => file !== null);
    } catch (error) {
      console.error(`Fehler beim Abrufen der ${type}-Dateien:`, error);
      return [];
    }
  },

  async updateExistingTimeEntriesWithEntryId() {
    await this._authReadyPromise;
    try {
      const snapshot = await this.timeEntriesCollection
        .where("entryId", "==", null)
        .get();
      if (snapshot.empty) {
        return;
      }
      const batch = this.db.batch();
      let batchCount = 0;
      snapshot.docs.forEach((doc) => {
        const entryId = doc.id;
        const docRef = this.timeEntriesCollection.doc(entryId);
        batch.update(docRef, { entryId: entryId });
        batchCount++;
        if (batchCount >= 450) {
          batch.commit();
          batchCount = 0;
        }
      });
      if (batchCount > 0) {
        await batch.commit();
      }
      return true;
    } catch (error) {
      console.error(
        "Fehler bei der Aktualisierung bestehender Zeiteinträge:",
        error
      );
      return false;
    }
  },

  async getFileUploadById(fileId) {
    await this._authReadyPromise;
    if (!fileId) return null;
    try {
      const doc = await this.fileUploadsCollection.doc(fileId).get();
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      return null;
    } catch (error) {
      console.error("Fehler beim Abrufen des Datei-Uploads:", error);
      return null;
    }
  },

  async getTimeEntryByDateAndName(
    dateStr,
    employeeName,
    projectName,
    exactEntryId = null
  ) {
    await this._authReadyPromise;
    if (!dateStr || !employeeName) {
      return null;
    }
    try {
      const snapshot = await this.timeEntriesCollection.get();
      if (snapshot.empty) {
        return null;
      }
      const allEmployeesSnapshot = await this.employeesCollection.get();
      const employees = [];
      allEmployeesSnapshot.forEach((doc) => {
        employees.push({ id: doc.id, ...doc.data() });
      });
      let matchingEmployeeId = null;
      const matchingEmployees = employees.filter((emp) => {
        if (!emp.name) return false;
        const normalizedEmpName = emp.name.toLowerCase().replace(/[^a-z0-9]/gi, "");
        const normalizedSearchName = employeeName
          .toLowerCase()
          .replace(/[^a-z0-9]/gi, "");
        return (
          normalizedEmpName.includes(normalizedSearchName) ||
          normalizedSearchName.includes(normalizedEmpName)
        );
      });
      if (matchingEmployees.length > 0) {
        matchingEmployeeId = matchingEmployees[0].id;
      }
      const allProjectsSnapshot = await this.projectsCollection.get();
      const projects = [];
      allProjectsSnapshot.forEach((doc) => {
        projects.push({ id: doc.id, ...doc.data() });
      });
      let matchingProjectId = null;
      if (projectName) {
        const matchingProjects = projects.filter((proj) => {
          if (!proj.name) return false;
          const normalizedProjName = proj.name
            .toLowerCase()
            .replace(/[^a-z0-9]/gi, "");
          const normalizedSearchName = projectName
            .toLowerCase()
            .replace(/[^a-z0-9]/gi, "");
          return (
            normalizedProjName.includes(normalizedSearchName) ||
            normalizedSearchName.includes(normalizedProjName)
          );
        });
        if (matchingProjects.length > 0) {
          matchingProjectId = matchingProjects[0].id;
        }
      }
      const entries = [];
      snapshot.forEach((doc) => {
        entries.push({ id: doc.id, ...doc.data() });
      });
      let matchingEntries = entries.filter((entry) => {
        if (!entry.clockInTime) return false;
        const entryDate =
          entry.clockInTime instanceof firebase.firestore.Timestamp
            ? entry.clockInTime.toDate()
            : new Date(entry.clockInTime);
        if (!this.isValidDate(entryDate)) return false;
        const entryDateStr1 = entryDate.toLocaleDateString("de-DE");
        const entryDateStr2 = `${entryDate.getDate()}.${
          entryDate.getMonth() + 1
        }.${entryDate.getFullYear()}`;
        const entryDateStr3 = `${entryDate.getDate()}-${
          entryDate.getMonth() + 1
        }-${entryDate.getFullYear()}`;
        return (
          entryDateStr1.includes(dateStr) ||
          dateStr.includes(entryDateStr1) ||
          entryDateStr2.includes(dateStr) ||
          dateStr.includes(entryDateStr2) ||
          entryDateStr3.includes(dateStr) ||
          dateStr.includes(entryDateStr3)
        );
      });
      if (matchingEmployeeId) {
        const employeeEntries = matchingEntries.filter(
          (entry) => entry.employeeId === matchingEmployeeId
        );
        if (employeeEntries.length > 0) {
          matchingEntries = employeeEntries;
        }
      }
      if (matchingProjectId) {
        const projectEntries = matchingEntries.filter(
          (entry) => entry.projectId === matchingProjectId
        );
        if (projectEntries.length > 0) {
          matchingEntries = projectEntries;
        }
      }
      if (matchingEntries.length === 0) {
        return null;
      }
      if (exactEntryId) {
        const exactMatch = matchingEntries.find(
          (entry) => entry.id === exactEntryId
        );
        if (exactMatch) {
          return exactMatch;
        }
      }
      matchingEntries.sort((a, b) => {
        const dateA =
          a.clockInTime instanceof firebase.firestore.Timestamp
            ? a.clockInTime.toDate()
            : new Date(a.clockInTime);
        const dateB =
          b.clockInTime instanceof firebase.firestore.Timestamp
            ? b.clockInTime.toDate()
            : new Date(b.clockInTime);
        return dateB - dateA;
      });
      return matchingEntries[0];
    } catch (error) {
      console.error("Fehler bei der Suche nach Zeiteinträgen:", error);
      return null;
    }
  },

  isValidDate(date) {
    return date instanceof Date && !isNaN(date);
  },

  async createProject(projectData) {
    await this._authReadyPromise;
    try {
      if (projectData.startDate) {
        projectData.startDate = firebase.firestore.Timestamp.fromDate(
          new Date(projectData.startDate)
        );
      }
      if (projectData.endDate) {
        projectData.endDate = firebase.firestore.Timestamp.fromDate(
          new Date(projectData.endDate)
        );
      }
      const result = await this.projectsCollection.add(projectData);
      return result.id;
    } catch (error) {
      console.error("Fehler beim Erstellen des Projekts:", error);
      throw error;
    }
  },

  async updateProject(id, projectData) {
    await this._authReadyPromise;
    console.log("Starte updateProject mit ID:", id, "und Daten:", projectData);
    try {
      if (!id) {
        throw new Error("Keine gültige Projekt-ID angegeben");
      }
      const projectDoc = await this.projectsCollection.doc(id).get();
      if (!projectDoc.exists) {
        throw new Error(`Projekt mit ID ${id} nicht gefunden`);
      }
      if (projectData.startDate) {
        projectData.startDate = firebase.firestore.Timestamp.fromDate(
          new Date(projectData.startDate)
        );
      }
      if (projectData.endDate) {
        projectData.endDate = firebase.firestore.Timestamp.fromDate(
          new Date(projectData.endDate)
        );
      }
      console.log(`Aktualisiere Projekt mit ID: ${id}`);
      await this.projectsCollection.doc(id).update(projectData);
      return true;
    } catch (error) {
      console.error(
        `Fehler beim Aktualisieren des Projekts mit ID ${id}:`,
        error
      );
      throw error;
    }
  },

  async deleteProject(id) {
    await this._authReadyPromise;
    try {
      const entries = await this.timeEntriesCollection
        .where("projectId", "==", id)
        .limit(1)
        .get();
      if (!entries.empty) {
        throw new Error(
          "Dieses Projekt hat Zeiteinträge und kann nicht gelöscht werden."
        );
      }
      await this.projectsCollection.doc(id).delete();
      return true;
    } catch (error) {
      console.error(`Fehler beim Löschen des Projekts ${id}:`, error);
      throw error;
    }
  },

  async getCurrentTimeEntries() {
    await this._authReadyPromise;
    try {
      const snapshot = await this.timeEntriesCollection
        .where("clockOutTime", "==", null)
        .get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Fehler beim Abrufen der aktuellen Zeiteinträge:", error);
      return [];
    }
  },

  async getCurrentTimeEntry(employeeId) {
    await this._authReadyPromise;
    try {
      if (!employeeId) {
        console.error("Keine Mitarbeiter-ID angegeben");
        return null;
      }
      const snapshot = await this.timeEntriesCollection
        .where("employeeId", "==", employeeId)
        .where("clockOutTime", "==", null)
        .limit(1)
        .get();
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
      return null;
    } catch (error) {
      console.error(
        `Fehler beim Abrufen des aktuellen Zeiteintrags für Mitarbeiter ${employeeId}:`,
        error
      );
      return null;
    }
  },

  // Validierung für doppelte Einstempelungen
  async validateTimeEntry(timeEntryData) {
    await this._authReadyPromise;
    try {
      const employeeId = timeEntryData.employeeId;
      const clockInTime = timeEntryData.clockInTime;
      
      // Wenn clockOutTime bereits gesetzt ist (vollständiger Eintrag), keine Validierung nötig
      if (timeEntryData.clockOutTime) {
        // Prüfung auf überlappende Zeiteinträge
        await this.checkForOverlappingTimeEntries(timeEntryData);
        return true;
      }
      
      // Prüfen, ob der Mitarbeiter bereits aktiv ist (clockOutTime ist null)
      const activeTimeEntries = await this.timeEntriesCollection
        .where('employeeId', '==', employeeId)
        .where('clockOutTime', '==', null)
        .get();
      
      if (!activeTimeEntries.empty) {
        const activeEntry = activeTimeEntries.docs[0].data();
        const activeProject = await this.getProjectById(activeEntry.projectId);
        throw new Error(`Mitarbeiter ist bereits in Projekt "${activeProject ? activeProject.name : 'Unbekannt'}" eingestempelt. Bitte erst ausstempeln bevor Sie erneut einstempeln.`);
      }
      
      return true;
    } catch (error) {
      console.error("Fehler bei der Validierung des Zeiteintrags:", error);
      throw error;
    }
  },

  // Prüfung auf überlappende Zeiteinträge
  async checkForOverlappingTimeEntries(timeEntryData) {
    await this._authReadyPromise;
    try {
      const employeeId = timeEntryData.employeeId;
      const clockInTime = timeEntryData.clockInTime instanceof firebase.firestore.Timestamp 
        ? timeEntryData.clockInTime.toDate() 
        : new Date(timeEntryData.clockInTime);
      const clockOutTime = timeEntryData.clockOutTime instanceof firebase.firestore.Timestamp 
        ? timeEntryData.clockOutTime.toDate() 
        : new Date(timeEntryData.clockOutTime);
      
      // Zeiteinträge des Mitarbeiters für den Tag abrufen
      const startOfDay = new Date(clockInTime);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(clockInTime);
      endOfDay.setHours(23, 59, 59, 999);
      
      const existingEntries = await this.timeEntriesCollection
        .where('employeeId', '==', employeeId)
        .where('clockInTime', '>=', firebase.firestore.Timestamp.fromDate(startOfDay))
        .where('clockInTime', '<=', firebase.firestore.Timestamp.fromDate(endOfDay))
        .get();
      
      // Prüfung auf Überlappungen
      for (const doc of existingEntries.docs) {
        const entry = doc.data();
        
        // Überspringen wenn es der gleiche Eintrag ist (bei Updates)
        if (timeEntryData.entryId && doc.id === timeEntryData.entryId) {
          continue;
        }
        
        if (entry.clockOutTime) {
          const existingClockIn = entry.clockInTime instanceof firebase.firestore.Timestamp 
            ? entry.clockInTime.toDate() 
            : new Date(entry.clockInTime);
          const existingClockOut = entry.clockOutTime instanceof firebase.firestore.Timestamp 
            ? entry.clockOutTime.toDate() 
            : new Date(entry.clockOutTime);
          
          // Prüfung auf Zeitüberlappung
          const overlap = (clockInTime < existingClockOut && clockOutTime > existingClockIn);
          
          if (overlap) {
            const project = await this.getProjectById(entry.projectId);
            throw new Error(`Zeiteinträge überlappen sich mit einem bestehenden Eintrag in Projekt "${project ? project.name : 'Unbekannt'}" von ${existingClockIn.toLocaleTimeString()} bis ${existingClockOut.toLocaleTimeString()}.`);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error("Fehler bei der Prüfung auf überlappende Zeiteinträge:", error);
      throw error;
    }
  },

  async addTimeEntry(timeEntryData) {
    await this._authReadyPromise;
    try {
      // Validierung vor dem Hinzufügen
      await this.validateTimeEntry(timeEntryData);
      
      if (
        timeEntryData.clockInTime &&
        !(timeEntryData.clockInTime instanceof firebase.firestore.Timestamp)
      ) {
        timeEntryData.clockInTime = firebase.firestore.Timestamp.fromDate(
          typeof timeEntryData.clockInTime === "string"
            ? new Date(timeEntryData.clockInTime)
            : timeEntryData.clockInTime
        );
      }
      if (
        timeEntryData.clockOutTime &&
        !(timeEntryData.clockOutTime instanceof firebase.firestore.Timestamp)
      ) {
        timeEntryData.clockOutTime = firebase.firestore.Timestamp.fromDate(
          typeof timeEntryData.clockOutTime === "string"
            ? new Date(timeEntryData.clockOutTime)
            : timeEntryData.clockOutTime
        );
      }
      const result = await this.timeEntriesCollection.add(timeEntryData);
      const entryId = result.id;
      const updatedData = { ...timeEntryData, entryId: entryId };
      await this.timeEntriesCollection.doc(entryId).update({ entryId: entryId });
      return { id: entryId, ...updatedData };
    } catch (error) {
      console.error("Fehler beim Hinzufügen des Zeiteintrags:", error);
      throw error;
    }
  },

  // Alias für addTimeEntry (für Abwärtskompatibilität)
  async createTimeEntry(timeEntryData) {
    return await this.addTimeEntry(timeEntryData);
  },

  // Ausstehende Urlaubsanträge zählen
  async getPendingLeaveRequestsCount() {
    await this._authReadyPromise;
    try {
      console.log('📋 Zähle ausstehende Urlaubsanträge...');
      const snapshot = await this.leaveRequestsCollection
        .where('status', '==', 'pending')
        .get();
      console.log('📊 Gefundene ausstehende Anträge:', snapshot.size);
      return snapshot.size;
    } catch (error) {
      console.error('❌ Fehler beim Zählen der ausstehenden Urlaubsanträge:', error);
      return 0;
    }
  },

  async updateTimeEntry(timeEntryId, timeEntryData) {
    await this._authReadyPromise;
    try {
      if (!timeEntryId) {
        throw new Error("Keine gültige Zeiteintrag-ID angegeben");
      }
      if (
        timeEntryData.clockOutTime &&
        !(timeEntryData.clockOutTime instanceof firebase.firestore.Timestamp)
      ) {
        timeEntryData.clockOutTime = firebase.firestore.Timestamp.fromDate(
          typeof timeEntryData.clockOutTime === "string"
            ? new Date(timeEntryData.clockOutTime)
            : timeEntryData.clockOutTime
        );
      }
      if (!timeEntryData.entryId) {
        timeEntryData.entryId = timeEntryId;
      }
      await this.timeEntriesCollection.doc(timeEntryId).update(timeEntryData);
      return true;
    } catch (error) {
      console.error(
        `Fehler beim Aktualisieren des Zeiteintrags mit ID ${timeEntryId}:`,
        error
      );
      throw error;
    }
  },

  async getTimeEntriesByEmployeeId(employeeId, startDate = null, endDate = null) {
    await this._authReadyPromise;
    try {
      let query = this.timeEntriesCollection.where("employeeId", "==", employeeId);
      if (startDate) {
        const startTimestamp = firebase.firestore.Timestamp.fromDate(
          new Date(startDate)
        );
        query = query.where("clockInTime", ">=", startTimestamp);
      }
      if (endDate) {
        const endTimestamp = firebase.firestore.Timestamp.fromDate(
          new Date(endDate)
        );
        endTimestamp.setHours(23, 59, 59, 999);
        query = query.where("clockInTime", "<=", endTimestamp);
      }
      let snapshot;
      try {
        snapshot = await query.get({ source: "server" });
      } catch (e) {
        console.warn("⚠️ Server-Abfrage fehlgeschlagen, nutze Cache für getProjectFiles:", e && e.message);
        snapshot = await query.get();
      }
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error(
        `Fehler beim Abrufen der Zeiteinträge für Mitarbeiter ${employeeId}:`,
        error
      );
      return [];
    }
  },

  async getAllTimeEntries(startDate = null, endDate = null) {
    await this._authReadyPromise;
    try {
      let query = this.timeEntriesCollection;
      if (startDate) {
        const startTimestamp = firebase.firestore.Timestamp.fromDate(
          new Date(startDate)
        );
        query = query.where("clockInTime", ">=", startTimestamp);
      }
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        const endOfDayTimestamp =
          firebase.firestore.Timestamp.fromDate(endDateObj);
        query = query.where("clockInTime", "<=", endOfDayTimestamp);
      }
      const snapshot = await query.get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Fehler beim Abrufen aller Zeiteinträge:", error);
      return [];
    }
  },

  calculateWorkHours(timeEntry) {
    try {
      if (!timeEntry || !timeEntry.clockInTime) {
        return 0;
      }
      const clockOutTime = timeEntry.clockOutTime || new Date();
      const clockInDate =
        timeEntry.clockInTime instanceof Date
          ? timeEntry.clockInTime
          : new Date(timeEntry.clockInTime);
      const clockOutDate =
        clockOutTime instanceof Date ? clockOutTime : new Date(clockOutTime);
      const diffMs = clockOutDate - clockInDate;
      let pauseTime = timeEntry.pauseTotalTime || 0;
      const actualWorkTime = diffMs - pauseTime;
      return Math.floor(actualWorkTime / 60000);
    } catch (error) {
      console.error("Fehler bei der Berechnung der Arbeitsstunden:", error);
      return 0;
    }
  },

  async clockOutEmployee(timeEntryId, notes, location) {
    await this._authReadyPromise;
    try {
      if (!timeEntryId) {
        throw new Error("Keine gültige Zeiteintrag-ID angegeben");
      }
      
      // Zeiteintrag abrufen
      const timeEntry = await this.getTimeEntryById(timeEntryId);
      if (!timeEntry) {
        throw new Error(`Zeiteintrag mit ID ${timeEntryId} nicht gefunden`);
      }
      
      // Prüfen, ob der Mitarbeiter noch eingestempelt ist
      if (timeEntry.clockOutTime !== null) {
        throw new Error("Dieser Mitarbeiter ist bereits ausgestempelt");
      }
      
      // Ausstempel-Zeit setzen
      const clockOutTime = firebase.firestore.Timestamp.now();
      const updateData = {
        clockOutTime: clockOutTime,
        notes: notes || timeEntry.notes || ""
      };
      
      // Standort hinzufügen, wenn vorhanden
      if (location && (location.latitude || location.longitude)) {
        updateData.clockOutLocation = location;
      }
      
      // Arbeitszeit berechnen (in ms)
      const clockInDate = timeEntry.clockInTime instanceof firebase.firestore.Timestamp
        ? timeEntry.clockInTime.toDate()
        : new Date(timeEntry.clockInTime);
      const clockOutDate = clockOutTime.toDate();
      const diffMs = clockOutDate - clockInDate;
      const pauseTime = timeEntry.pauseTotalTime || 0;
      const actualWorkTime = diffMs - pauseTime;
      updateData.totalWorkTime = actualWorkTime;
      
      // Zeiteintrag aktualisieren
      await this.updateTimeEntry(timeEntryId, updateData);
      
      console.log(`✅ Mitarbeiter erfolgreich ausgestempelt (ID: ${timeEntryId})`);
      return true;
    } catch (error) {
      console.error(`❌ Fehler beim Ausstempeln des Mitarbeiters mit Zeiteintrag ${timeEntryId}:`, error);
      throw error;
    }
  },

  async getTodaysHours() {
    await this._authReadyPromise;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStart = firebase.firestore.Timestamp.fromDate(today);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const todayEndTimestamp = firebase.firestore.Timestamp.fromDate(todayEnd);
      const snapshot = await this.timeEntriesCollection
        .where("clockInTime", ">=", todayStart)
        .where("clockInTime", "<=", todayEndTimestamp)
        .get();
      let totalMinutes = 0;
      const now = firebase.firestore.Timestamp.now();
      snapshot.docs.forEach((doc) => {
        const entry = doc.data();
        const clockInTime = entry.clockInTime;
        const clockOutTime = entry.clockOutTime || now;
        const clockInDate = clockInTime.toDate();
        const clockOutDate = clockOutTime.toDate();
        const diffMs = clockOutDate - clockInDate;
        totalMinutes += Math.floor(diffMs / (1000 * 60));
      });
      return totalMinutes;
    } catch (error) {
      console.error(
        "Fehler bei der Berechnung der heutigen Arbeitsstunden:",
        error
      );
      return 0;
    }
  },

  async uploadFile(
    file,
    projectId,
    employeeId,
    type = "construction_site",
    notes = "",
    comment = ""
  ) {
    await this._authReadyPromise;
    try {
      if (!file || !projectId || !employeeId) {
        throw new Error(
          "Datei, Projekt-ID und Mitarbeiter-ID müssen angegeben werden"
        );
      }
      if (!this.storage) {
        throw new Error("Firebase Storage ist nicht verfügbar");
      }
      // Ursprüngliches, einfaches Verhalten: Direkt speichern
      const base64Result = await this.uploadFileAsBase64(
        file,
        projectId,
        employeeId,
        type,
        notes,
        comment
      );
      if (!base64Result || !base64Result.id) {
        throw new Error("Base64-Upload lieferte kein gültiges Ergebnis");
      }
      return base64Result;
    } catch (error) {
      console.error("❌ uploadFile Fehler:", error);
      throw error;
    }
  },

  async uploadFileAsBase64(file, projectId, employeeId, type, notes, comment) {
    await this._authReadyPromise;
    const self = this;
    try {
      if (!DataService.fileUploadsCollection) {
        throw new Error("FileUploadsCollection ist nicht verfügbar");
      }
      let compressedFile = await self.compressImage(file, 0.5, 600);
      let base64DataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(compressedFile);
      });
      let base64String = base64DataUrl.split(",")[1];
      const mimeType = base64DataUrl.split(",")[0];
      let base64Size = base64String.length;
      if (base64Size > 900000) {
        compressedFile = await self.compressImage(file, 0.3, 400);
        base64DataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(compressedFile);
        });
        base64String = base64DataUrl.split(",")[1];
        base64Size = base64String.length;
        if (base64Size > 900000) {
          throw new Error(
            `Bild ist zu groß für Upload (${(base64Size / 1024).toFixed(
              1
            )} KB > 900 KB). Bitte verwenden Sie ein kleineres Bild.`
          );
        }
      }
      // Hinweis: Duplikatsprüfung deaktiviert, damit jeder Upload einen eigenen Datensatz erhält

      const uniqueId = `local_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}_${file.name.replace(/[^a-zA-Z0-9]/g, "_")}`;
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
        notes: notes || "",
        comment: comment || "",
        uploadTime: firebase.firestore.Timestamp.now(),
        isLocalUpload: true,
        compressionLevel: "normal",
        storagePath: `local://projects/${projectId}/${type}/${file.name}`,
        url: base64DataUrl,
      };
      const docRef = await DataService.fileUploadsCollection.add(fileData);
      // Sicherstellen, dass wir die echte Firestore-ID verwenden und den Datensatz verifizieren
      try {
        const savedDoc = await DataService.fileUploadsCollection.doc(docRef.id).get();
        if (savedDoc.exists) {
          const savedData = { id: savedDoc.id, ...savedDoc.data() };
          console.log(`📄 Datei in Firestore gespeichert: fileUploads/${savedDoc.id}`);
          return savedData;
        }
      } catch (verifyErr) {
        console.warn('⚠️ Konnte gespeicherten Upload nicht verifizieren:', verifyErr && verifyErr.message);
      }
      // Fallback: mindestens die richtige ID zurückgeben
      fileData.id = docRef.id;
      console.log(`📄 Datei in Firestore gespeichert (ohne Verifizierungsdaten): fileUploads/${docRef.id}`);
      return fileData;
    } catch (error) {
      console.error("❌ Base64-Upload Fehler:", error);
      throw error;
    }
  },

  compressImage(file, quality = 0.7, maxWidth = 800) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        resolve(file);
        return;
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = function () {
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              reject(new Error("Bildkomprimierung fehlgeschlagen"));
            }
          },
          file.type,
          quality
        );
      };
      img.onerror = function () {
        reject(new Error("Bild konnte nicht geladen werden"));
      };
      img.src = URL.createObjectURL(file);
    });
  },

  async getFilesByProject(projectId) {
    await this._authReadyPromise;
    try {
      const snapshot = await this.fileUploadsCollection
        .where("projectId", "==", projectId)
        .orderBy("uploadTime", "desc")
        .get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error(
        `Fehler beim Abrufen der Dateien für Projekt ${projectId}:`,
        error
      );
      return [];
    }
  },

  async getFilesByType(type) {
    await this._authReadyPromise;
    try {
      const snapshot = await this.fileUploadsCollection
        .where("type", "==", type)
        .orderBy("uploadTime", "desc")
        .get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error(`Fehler beim Abrufen der Dateien vom Typ ${type}:`, error);
      return [];
    }
  },

  async getProjectFiles(projectId, type = null, includeDrafts = true) {
    await this._authReadyPromise;
    try {
      if (!projectId) {
        throw new Error("Keine Projekt-ID angegeben");
      }
      let query = this.fileUploadsCollection.where("projectId", "==", projectId);
      if (type) {
        query = query.where("type", "==", type);
      }
      if (!includeDrafts) {
        query = query.where("isDraft", "==", false);
      }
      const snapshot = await query.get();
      const files = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      // Duplikate anhand id/url entfernen
      const seen = new Set();
      const deduped = [];
      for (const f of files) {
        const key = f.id || f.url || `${f.fileName}|${f.fileSize}|${f.employeeId}|${f.projectId}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(f);
        }
      }
      return deduped;
    } catch (error) {
      console.error(
        `Fehler beim Abrufen der Dateien für Projekt ${projectId}:`,
        error
      );
      return [];
    }
  },

  async getProjectTimeEntries(projectId) {
    try {
      const timeEntriesRef = this.db.collection("timeEntries");
      const snapshot = await timeEntriesRef
        .where("projectId", "==", projectId)
        .get();

      // Datensätze transformieren
      return snapshot.docs.map((doc) => {
        return {
          id: doc.id,
          ...doc.data(),
        };
      });
    } catch (error) {
      console.error("Fehler beim Laden der Zeiteinträge:", error);
      throw error;
    }
  },

  async getTimeEntryById(timeEntryId) {
    try {
      console.log("Suche Zeiteintrag mit ID:", timeEntryId);
      const timeEntryDoc = await this.db
        .collection("timeEntries")
        .doc(timeEntryId)
        .get();

      if (!timeEntryDoc.exists) {
        console.error("Zeiteintrag nicht gefunden:", timeEntryId);
        return null;
      }

      return {
        id: timeEntryDoc.id,
        ...timeEntryDoc.data(),
      };
    } catch (error) {
      console.error("Fehler beim Laden des Zeiteintrags:", error);
      throw error;
    }
  },

  async getEmployeeTimeEntries(employeeId, startDate, endDate) {
    await this._authReadyPromise;
    try {
      if (!employeeId) {
        throw new Error("Keine Mitarbeiter-ID angegeben");
      }
      startDate = startDate
        ? new Date(startDate)
        : new Date(new Date().setDate(new Date().getDate() - 30));
      endDate = endDate ? new Date(endDate) : new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      const query = await this.timeEntriesCollection
        .where("employeeId", "==", employeeId)
        .where("clockInTime", ">=", startDate)
        .where("clockInTime", "<=", endDate)
        .get();
      const timeEntries = [];
      for (const doc of query.docs) {
        const entry = doc.data();
        const entryId = doc.id;
        const project = await this.getProjectById(entry.projectId);
        const clockInTime =
          entry.clockInTime instanceof firebase.firestore.Timestamp
            ? entry.clockInTime.toDate()
            : new Date(entry.clockInTime);
        const clockOutTime =
          entry.clockOutTime instanceof firebase.firestore.Timestamp
            ? entry.clockOutTime.toDate()
            : entry.clockOutTime
            ? new Date(entry.clockOutTime)
            : null;
        const workMinutes = this.calculateWorkHours({
          ...entry,
          clockInTime,
          clockOutTime,
        });
        timeEntries.push({
          id: entryId,
          ...entry,
          clockInTime,
          clockOutTime,
          projectName: project ? project.name : "Unbekanntes Projekt",
          workMinutes,
          workHours: (workMinutes / 60).toFixed(2),
        });
      }
      timeEntries.sort((a, b) => b.clockInTime - a.clockInTime);
      return timeEntries;
    } catch (error) {
      console.error("Fehler beim Generieren des Mitarbeiterberichts:", error);
      throw error;
    }
  },

  async generateProjectReport(projectId, startDate, endDate) {
    await this._authReadyPromise;
    try {
      if (!projectId) {
        throw new Error("Keine Projekt-ID angegeben");
      }
      startDate = startDate
        ? new Date(startDate)
        : new Date(new Date().setDate(new Date().getDate() - 30));
      endDate = endDate ? new Date(endDate) : new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      const project = await this.getProjectById(projectId);
      if (!project) {
        throw new Error(`Projekt mit ID ${projectId} nicht gefunden`);
      }
      const timeEntriesQuery = await this.timeEntriesCollection
        .where("projectId", "==", projectId)
        .where("clockInTime", ">=", startDate)
        .where("clockInTime", "<=", endDate)
        .get();
      const timeEntries = [];
      for (const doc of timeEntriesQuery.docs) {
        const entry = doc.data();
        const entryId = doc.id;
        const employee = await this.getEmployeeById(entry.employeeId);
        const clockInTime =
          entry.clockInTime instanceof firebase.firestore.Timestamp
            ? entry.clockInTime.toDate()
            : new Date(entry.clockInTime);
        const clockOutTime =
          entry.clockOutTime instanceof firebase.firestore.Timestamp
            ? entry.clockOutTime.toDate()
            : entry.clockOutTime
            ? new Date(entry.clockOutTime)
            : null;
        const workMinutes = this.calculateWorkHours({
          ...entry,
          clockInTime,
          clockOutTime,
        });
        timeEntries.push({
          id: entryId,
          ...entry,
          clockInTime,
          clockOutTime,
          employeeName: employee
            ? `${employee.firstName} ${employee.lastName}`
            : "Unbekannter Mitarbeiter",
          workMinutes,
          workHours: (workMinutes / 60).toFixed(2),
        });
      }
      const projectFiles = await this.getProjectFiles(projectId);
      const totalWorkMinutes = timeEntries.reduce(
        (sum, entry) => sum + entry.workMinutes,
        0
      );
      const totalWorkHours = (totalWorkMinutes / 60).toFixed(2);
      timeEntries.sort((a, b) => b.clockInTime - a.clockInTime);
      return {
        project,
        timeEntries,
        projectFiles,
        totalWorkMinutes,
        totalWorkHours,
      };
    } catch (error) {
      console.error("Fehler beim Generieren des Projektberichts:", error);
      throw error;
    }
  },

  // Fahrzeug-Verwaltung Funktionen
  async createVehicle(vehicleData) {
    await this._authReadyPromise;
    try {
      // Debug-Ausgabe der eingehenden Daten
      console.log("Fahrzeug wird erstellt mit Daten:", vehicleData);
      
      if (!vehicleData || !vehicleData.name || !vehicleData.hourlyRate) {
        throw new Error("Fahrzeugname und Stundensatz müssen angegeben werden");
      }
      
      const newVehicle = {
        name: vehicleData.name,
        hourlyRate: parseFloat(vehicleData.hourlyRate),
        description: vehicleData.description || "",
        type: vehicleData.type || "",
        licensePlate: vehicleData.licensePlate || "",
        isActive: vehicleData.isActive !== false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      
      // Debug-Ausgabe des zu speichernden Objekts
      console.log("Zu speicherndes Fahrzeug:", newVehicle);
      
      // Prüfen, ob der aktuelle Benutzer authentifiziert ist
      const currentUser = firebase.auth().currentUser;
      console.log("Aktueller Benutzer beim Fahrzeug erstellen:", 
                currentUser ? currentUser.uid + (currentUser.isAnonymous ? " (anonym)" : "") : "keiner");
      
      const docRef = await this.vehiclesCollection.add(newVehicle);
      console.log("Fahrzeug erfolgreich erstellt mit ID:", docRef.id);
      
      // Gespeichertes Dokument abrufen, um zu prüfen, was tatsächlich gespeichert wurde
      const savedDoc = await this.vehiclesCollection.doc(docRef.id).get();
      console.log("Gespeichertes Fahrzeug:", savedDoc.data());
      
      return {
        id: docRef.id,
        ...newVehicle,
      };
    } catch (error) {
      console.error("Fehler beim Erstellen des Fahrzeugs:", error);
      throw error;
    }
  },

  async getVehicleById(vehicleId) {
    await this._authReadyPromise;
    try {
      if (!vehicleId) {
        throw new Error("Keine Fahrzeug-ID angegeben");
      }
      
      const vehicleDoc = await this.vehiclesCollection.doc(vehicleId).get();
      
      if (!vehicleDoc.exists) {
        return null;
      }
      
      return {
        id: vehicleDoc.id,
        ...vehicleDoc.data(),
      };
    } catch (error) {
      console.error("Fehler beim Laden des Fahrzeugs:", error);
      return null;
    }
  },

  async getAllVehicles(includeInactive = false) {
    await this._authReadyPromise;
    try {
      let query = this.vehiclesCollection;
      
      if (!includeInactive) {
        query = query.where("isActive", "==", true);
      }
      
      const snapshot = await query.orderBy("name").get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        hourlyRate: parseFloat(doc.data().hourlyRate || 0),
      }));
    } catch (error) {
      console.error("Fehler beim Laden der Fahrzeuge:", error);
      return [];
    }
  },

  async updateVehicle(vehicleId, updateData) {
    await this._authReadyPromise;
    try {
      if (!vehicleId) {
        throw new Error("Keine Fahrzeug-ID angegeben");
      }
      
      // Debug: Eingehende Daten
      console.log("Fahrzeug-Update mit Daten:", updateData);
      
      const updates = {};
      
      if (updateData.name) updates.name = updateData.name;
      if (typeof updateData.hourlyRate !== 'undefined') updates.hourlyRate = parseFloat(updateData.hourlyRate);
      if (typeof updateData.description !== 'undefined') updates.description = updateData.description;
      if (typeof updateData.isActive !== 'undefined') updates.isActive = updateData.isActive;
      
      // Fahrzeugtyp und Kennzeichen hinzufügen
      if (typeof updateData.type !== 'undefined') updates.type = updateData.type;
      if (typeof updateData.licensePlate !== 'undefined') updates.licensePlate = updateData.licensePlate;
      
      updates.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      
      console.log("Zu aktualisierende Felder:", updates);
      
      await this.vehiclesCollection.doc(vehicleId).update(updates);
      
      return {
        id: vehicleId,
        ...updates
      };
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Fahrzeugs:", error);
      throw error;
    }
  },

  async deleteVehicle(vehicleId) {
    await this._authReadyPromise;
    try {
      if (!vehicleId) {
        throw new Error("Keine Fahrzeug-ID angegeben");
      }
      
      // Aktuellen Benutzer prüfen
      const currentUser = firebase.auth().currentUser;
      console.log("Aktueller Benutzer beim Löschen:", 
                currentUser ? `${currentUser.uid} (${currentUser.isAnonymous ? 'anonym' : 'authentifiziert'})` : "nicht angemeldet");
      
      if (!currentUser) {
        throw new Error("Sie müssen angemeldet sein, um Fahrzeuge zu löschen.");
      }
      
      // Admin-Berechtigung prüfen - zuerst direkt im Firestore
      let isAdmin = false;
      
      try {
        // Prüfen ob Benutzer in der employees-Collection als Admin markiert ist
        const userDoc = await this.employeesCollection.doc(currentUser.uid).get();
        isAdmin = userDoc.exists && userDoc.data().isAdmin === true;
        console.log("Firestore Admin-Status:", isAdmin);
      } catch (e) {
        console.warn("Fehler bei direkter Admin-Prüfung:", e);
      }
      
      // Falls Firestore-Admin-Status negativ ist, prüfe die lokale App-Authentifizierung
      if (!isAdmin) {
        // Prüfe lokalen Admin-Status im localStorage
        const localAdminData = localStorage.getItem('lauffer_admin_user');
        const isLocalAdmin = localAdminData !== null;
        console.log("Lokaler Admin-Status:", isLocalAdmin);
        
        if (isLocalAdmin) {
          isAdmin = true;
          console.log("Benutzer ist lokal als Admin authentifiziert");
        }
      }
      
      if (!isAdmin) {
        throw new Error("Sie benötigen Admin-Rechte, um Fahrzeuge zu löschen.");
      }
      
      console.log("Admin-Berechtigung bestätigt, fahre mit Löschvorgang fort");
      
      // Prüfen, ob Fahrzeug existiert
      const vehicleDoc = await this.vehiclesCollection.doc(vehicleId).get();
      
      if (!vehicleDoc.exists) {
        throw new Error(`Fahrzeug mit ID ${vehicleId} nicht gefunden`);
      }
      
      // Prüfen, ob Fahrzeug bereits in Verwendung ist
      const usagesSnapshot = await this.vehicleUsagesCollection
        .where("vehicleId", "==", vehicleId)
        .limit(1)
        .get();
      
      if (!usagesSnapshot.empty) {
        // Fahrzeug wird verwendet, daher nur als inaktiv markieren
        console.log("Fahrzeug wird verwendet, deaktiviere es stattdessen");
        await this.vehiclesCollection.doc(vehicleId).update({
          isActive: false,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return { success: true, deactivated: true };
      }
      
      // Wenn nicht in Verwendung, vollständig löschen
      console.log("Lösche Fahrzeug mit ID:", vehicleId);
      try {
        await this.vehiclesCollection.doc(vehicleId).delete();
        console.log("Fahrzeug erfolgreich gelöscht.");
        return { success: true, deactivated: false };
      } catch (deleteError) {
        console.error("Firestore-Fehler beim Löschen:", deleteError);
        
        // Falls Firestore-Regeln das Löschen verhindern, setze das Fahrzeug auf inaktiv
        if (deleteError.code === "permission-denied") {
          console.log("Löschberechtigung verweigert, deaktiviere Fahrzeug stattdessen");
          await this.vehiclesCollection.doc(vehicleId).update({
            isActive: false,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
          return { success: true, deactivated: true, note: "Fahrzeug wurde deaktiviert, da Löschberechtigungen fehlen." };
        } else {
          throw deleteError;
        }
      }
    } catch (error) {
      console.error("Fehler beim Löschen des Fahrzeugs:", error);
      throw error;
    }
  },
  
  // Prüft, ob der aktuelle Benutzer Admin-Rechte hat
  async isUserAdmin(uid = null) {
    try {
      // Wenn UID angegeben, verwende diese, ansonsten den aktuell angemeldeten Benutzer
      const userUid = uid || (firebase.auth().currentUser?.uid);
      if (!userUid) return false;
      
      console.log("Prüfe Admin-Status für UID:", userUid);
      
      // Prüfe Admin-Status in der employees-Collection
      const userDoc = await this.employeesCollection.doc(userUid).get();
      
      // Debug
      if (userDoc.exists) {
        console.log("Benutzerdaten gefunden:", userDoc.data());
        console.log("Admin-Status:", userDoc.data().isAdmin === true);
      } else {
        console.log("Benutzer nicht in employees-Collection gefunden");
      }
      
      return userDoc.exists && userDoc.data().isAdmin === true;
    } catch (error) {
      console.error("Fehler bei Admin-Prüfung:", error);
      return false;
    }
  },

  // Fahrzeugnutzung Funktionen
  async createVehicleUsage(usageData) {
    await this._authReadyPromise;
    try {
      if (!usageData || !usageData.timeEntryId || !usageData.vehicleId || !usageData.hoursUsed) {
        throw new Error("Zeiteintrags-ID, Fahrzeug-ID und Nutzungsstunden müssen angegeben werden");
      }
      
      // Überprüfen, ob der Zeiteintrag existiert
      const timeEntryDoc = await this.timeEntriesCollection.doc(usageData.timeEntryId).get();
      if (!timeEntryDoc.exists) {
        throw new Error(`Zeiteintrag mit ID ${usageData.timeEntryId} nicht gefunden`);
      }
      
      // Überprüfen, ob das Fahrzeug existiert und aktiv ist
      const vehicleDoc = await this.vehiclesCollection.doc(usageData.vehicleId).get();
      if (!vehicleDoc.exists) {
        throw new Error(`Fahrzeug mit ID ${usageData.vehicleId} nicht gefunden`);
      }
      
      const vehicle = vehicleDoc.data();
      if (!vehicle.isActive) {
        throw new Error(`Fahrzeug ${vehicle.name} ist nicht aktiv und kann nicht verwendet werden`);
      }
      
      const timeEntryData = timeEntryDoc.data();
      
      const newVehicleUsage = {
        timeEntryId: usageData.timeEntryId,
        vehicleId: usageData.vehicleId,
        employeeId: timeEntryData.employeeId,
        projectId: timeEntryData.projectId,
        hoursUsed: parseFloat(usageData.hoursUsed),
        date: timeEntryData.date || timeEntryData.clockInTime,
        hourlyRate: parseFloat(vehicle.hourlyRate),
        vehicleName: vehicle.name,
        comment: usageData.comment || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      
      const docRef = await this.vehicleUsagesCollection.add(newVehicleUsage);
      return {
        id: docRef.id,
        ...newVehicleUsage,
      };
    } catch (error) {
      console.error("Fehler beim Erstellen der Fahrzeugnutzung:", error);
      throw error;
    }
  },
  
  async createDirectVehicleUsage(usageData) {
    await this._authReadyPromise;
    try {
      if (!usageData || !usageData.vehicleId || !usageData.hoursUsed) {
        throw new Error("Fahrzeug-ID und Nutzungsstunden müssen angegeben werden");
      }
      
      // Überprüfen, ob das Fahrzeug existiert und aktiv ist
      const vehicleDoc = await this.vehiclesCollection.doc(usageData.vehicleId).get();
      if (!vehicleDoc.exists) {
        throw new Error(`Fahrzeug mit ID ${usageData.vehicleId} nicht gefunden`);
      }
      
      const vehicle = vehicleDoc.data();
      if (!vehicle.isActive) {
        throw new Error(`Fahrzeug ${vehicle.name} ist nicht aktiv und kann nicht verwendet werden`);
      }
      
      const newVehicleUsage = {
        vehicleId: usageData.vehicleId,
        hoursUsed: parseFloat(usageData.hoursUsed),
        date: usageData.date || new Date(),
        hourlyRate: parseFloat(vehicle.hourlyRate),
        vehicleName: vehicle.name,
        comment: usageData.comment || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      
      const docRef = await this.vehicleUsagesCollection.add(newVehicleUsage);
      return {
        id: docRef.id,
        ...newVehicleUsage,
      };
    } catch (error) {
      console.error("Fehler beim Erstellen der direkten Fahrzeugnutzung:", error);
      throw error;
    }
  },
  
  async getDirectVehicleUsages() {
    await this._authReadyPromise;
    try {
      const snapshot = await this.vehicleUsagesCollection
        .where("timeEntryId", "==", null)
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        hoursUsed: parseFloat(doc.data().hoursUsed || 0),
        hourlyRate: parseFloat(doc.data().hourlyRate || 0),
      }));
    } catch (error) {
      console.error("Fehler beim Laden der direkten Fahrzeugnutzungen:", error);
      return [];
    }
  },
  
  async getVehicleUsagesByTimeEntry(timeEntryId) {
    await this._authReadyPromise;
    try {
      if (!timeEntryId) {
        throw new Error("Keine Zeiteintrags-ID angegeben");
      }
      
      const snapshot = await this.vehicleUsagesCollection
        .where("timeEntryId", "==", timeEntryId)
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        hoursUsed: parseFloat(doc.data().hoursUsed || 0),
        hourlyRate: parseFloat(doc.data().hourlyRate || 0),
      }));
    } catch (error) {
      console.error("Fehler beim Laden der Fahrzeugnutzungen für Zeiteintrag:", error);
      return [];
    }
  },
  
  async getVehicleUsagesByProject(projectId) {
    await this._authReadyPromise;
    try {
      if (!projectId) {
        throw new Error("Keine Projekt-ID angegeben");
      }
      
      const snapshot = await this.vehicleUsagesCollection
        .where("projectId", "==", projectId)
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        hoursUsed: parseFloat(doc.data().hoursUsed || 0),
        hourlyRate: parseFloat(doc.data().hourlyRate || 0),
      }));
    } catch (error) {
      console.error("Fehler beim Laden der Fahrzeugnutzungen für Projekt:", error);
      return [];
    }
  },
  
  async getVehicleUsagesByDateRange(startDate, endDate) {
    await this._authReadyPromise;
    try {
      startDate = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
      endDate = endDate ? new Date(endDate) : new Date();
      
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      
      const snapshot = await this.vehicleUsagesCollection
        .where("date", ">=", startDate)
        .where("date", "<=", endDate)
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        hoursUsed: parseFloat(doc.data().hoursUsed || 0),
        hourlyRate: parseFloat(doc.data().hourlyRate || 0),
      }));
    } catch (error) {
      console.error("Fehler beim Laden der Fahrzeugnutzungen für Zeitraum:", error);
      return [];
    }
  },
  
  async deleteVehicleUsage(usageId) {
    await this._authReadyPromise;
    try {
      if (!usageId) {
        throw new Error("Keine Fahrzeugnutzungs-ID angegeben");
      }
      
      await this.vehicleUsagesCollection.doc(usageId).delete();
      return { success: true };
    } catch (error) {
      console.error("Fehler beim Löschen der Fahrzeugnutzung:", error);
      throw error;
    }
  },
  
  /**
   * Erstellt einen direkten Fahrzeugzeitbuchungseintrag (ohne Verknüpfung mit einem Zeiteintrag)
   * @param {Object} bookingData - Die Daten für die Fahrzeugbuchung
   * @returns {Promise<Object>} - Die gespeicherte Fahrzeugbuchung mit ID
   */
  async createVehicleTimeBooking(bookingData) {
    await this._authReadyPromise;
    try {
      if (!bookingData || !bookingData.vehicleId || !bookingData.hours || 
          !bookingData.projectId || !bookingData.employeeId) {
        throw new Error("Fahrzeug-ID, Stunden, Projekt-ID und Mitarbeiter-ID müssen angegeben werden");
      }
      
      // Überprüfen, ob das Fahrzeug existiert und aktiv ist
      const vehicleDoc = await this.vehiclesCollection.doc(bookingData.vehicleId).get();
      if (!vehicleDoc.exists) {
        throw new Error(`Fahrzeug mit ID ${bookingData.vehicleId} nicht gefunden`);
      }
      
      const vehicle = vehicleDoc.data();
      if (!vehicle.isActive) {
        throw new Error(`Fahrzeug ${vehicle.name} ist nicht aktiv und kann nicht verwendet werden`);
      }
      
      // Überprüfen, ob das Projekt existiert
      const projectDoc = await this.projectsCollection.doc(bookingData.projectId).get();
      if (!projectDoc.exists) {
        throw new Error(`Projekt mit ID ${bookingData.projectId} nicht gefunden`);
      }
      
      // Überprüfen, ob der Mitarbeiter existiert
      const employeeDoc = await this.employeesCollection.doc(bookingData.employeeId).get();
      if (!employeeDoc.exists) {
        throw new Error(`Mitarbeiter mit ID ${bookingData.employeeId} nicht gefunden`);
      }
      
      const newVehicleBooking = {
        vehicleId: bookingData.vehicleId,
        projectId: bookingData.projectId,
        employeeId: bookingData.employeeId,
        hours: parseFloat(bookingData.hours),
        date: bookingData.date || new Date().toISOString().split('T')[0],  // Format YYYY-MM-DD
        hourlyRate: parseFloat(vehicle.hourlyRate || 0),
        vehicleName: vehicle.name,
        employeeName: employeeDoc.data().name,
        projectName: projectDoc.data().name,
        comment: bookingData.comment || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        isDirectBooking: true,  // Kennzeichnung als direkte Buchung ohne Zeiteintrag
      };
      
      const docRef = await this.vehicleUsagesCollection.add(newVehicleBooking);
      return {
        id: docRef.id,
        ...newVehicleBooking,
      };
    } catch (error) {
      console.error("Fehler beim Erstellen der Fahrzeugbuchung:", error);
      throw error;
    }
  },
  
  /**
   * Ruft alle Fahrzeugzeitbuchungen für ein Projekt ab
   * @param {string} projectId - Die Projekt-ID
   * @returns {Promise<Array>} - Eine Liste der Fahrzeugbuchungen
   */
  async getVehicleTimeBookingsByProject(projectId) {
    await this._authReadyPromise;
    try {
      if (!projectId) {
        throw new Error("Keine Projekt-ID angegeben");
      }
      
      const snapshot = await this.vehicleUsagesCollection
        .where("projectId", "==", projectId)
        .where("isDirectBooking", "==", true)
        .orderBy("date", "desc")
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        hours: parseFloat(doc.data().hours || 0),
        hourlyRate: parseFloat(doc.data().hourlyRate || 0),
      }));
    } catch (error) {
      console.error("Fehler beim Laden der Fahrzeugbuchungen für Projekt:", error);
      return [];
    }
  },
  
  /**
   * Ruft die Fahrzeugbuchungen für einen bestimmten Tag ab
   * @param {string} date - Das Datum im Format YYYY-MM-DD
   * @param {string} projectId - Optional: Die Projekt-ID zur Filterung
   * @returns {Promise<Array>} - Eine Liste der Fahrzeugbuchungen für den Tag
   */
  async getVehicleTimeBookingsByDate(date, projectId = null) {
    await this._authReadyPromise;
    try {
      if (!date) {
        throw new Error("Kein Datum angegeben");
      }
      
      let query = this.vehicleUsagesCollection
        .where("date", "==", date)
        .where("isDirectBooking", "==", true);
      
      if (projectId) {
        query = query.where("projectId", "==", projectId);
      }
      
      const snapshot = await query.get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        hours: parseFloat(doc.data().hours || 0),
        hourlyRate: parseFloat(doc.data().hourlyRate || 0),
      }));
    } catch (error) {
      console.error("Fehler beim Laden der Fahrzeugbuchungen für Datum:", error);
      return [];
    }
  },
  
  /**
   * Aggregiert die Fahrzeugbuchungen nach Fahrzeug, Datum und Projekt
   * @param {string} projectId - Die Projekt-ID
   * @returns {Promise<Array>} - Eine Liste der aggregierten Fahrzeugbuchungen
   */
  async getAggregatedVehicleTimeBookings(projectId) {
    await this._authReadyPromise;
    try {
      if (!projectId) {
        throw new Error("Keine Projekt-ID angegeben");
      }
      
      // Alle Buchungen für das Projekt laden
      const bookings = await this.getVehicleTimeBookingsByProject(projectId);
      
      // Aggregation nach Fahrzeug und Datum
      const aggregatedBookings = {};
      
      bookings.forEach(booking => {
        const key = `${booking.vehicleId}_${booking.date}`;
        
        if (!aggregatedBookings[key]) {
          aggregatedBookings[key] = {
            vehicleId: booking.vehicleId,
            vehicleName: booking.vehicleName,
            date: booking.date,
            projectId: booking.projectId,
            totalHours: 0,
            hourlyRate: booking.hourlyRate,
            bookings: [],
          };
        }
        
        aggregatedBookings[key].totalHours += booking.hours;
        aggregatedBookings[key].bookings.push(booking);
      });
      
      // In Array umwandeln und nach Datum sortieren
      return Object.values(aggregatedBookings).sort((a, b) => {
        if (a.date === b.date) {
          return a.vehicleName.localeCompare(b.vehicleName);
        }
        return b.date.localeCompare(a.date); // Absteigend nach Datum
      });
    } catch (error) {
      console.error("Fehler bei der Aggregation der Fahrzeugbuchungen:", error);
      return [];
    }
  },
  
  async reviewDocumentation(
    fileId,
    reviewedBy,
    updatedComment = null,
    status = "reviewed"
  ) {
    await this._authReadyPromise;
    try {
      if (!fileId || !reviewedBy) {
        throw new Error("Datei-ID und Prüfer müssen angegeben werden");
      }
      const updateData = {
        reviewedBy,
        reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
        status,
        isDraft: false,
      };
      if (updatedComment !== null) {
        updateData.comment = updatedComment;
      }
      await this.fileUploadsCollection.doc(fileId).update(updateData);
      return true;
    } catch (error) {
      console.error("Fehler beim Überprüfen der Dokumentation:", error);
      throw error;
    }
  },

  async getProjectFilesByType(projectId, type) {
    await this._authReadyPromise;
    if (!projectId) {
      return [];
    }
    try {
      const filesSnapshot = await this.fileUploadsCollection
        .where("projectId", "==", projectId)
        .where("type", "==", type)
        .get();
      let files = [];
      if (!filesSnapshot.empty) {
        files = filesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        return files;
      }
      let timeEntriesSnapshot;
      try {
        timeEntriesSnapshot = await this.timeEntriesCollection
          .where("projectId", "==", projectId)
          .get({ source: "server" });
      } catch (e) {
        console.warn("⚠️ Server-Abfrage fehlgeschlagen, nutze Cache für timeEntries:", e && e.message);
        timeEntriesSnapshot = await this.timeEntriesCollection
        .where("projectId", "==", projectId)
        .get();
      }
      if (timeEntriesSnapshot.empty) {
        return [];
      }
      const timeEntries = timeEntriesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      let directFiles = [];
      timeEntries.forEach((entry) => {
        if (type === "construction_site") {
          if (entry.sitePhotos && Array.isArray(entry.sitePhotos)) {
            if (
              entry.sitePhotos.length > 0 &&
              typeof entry.sitePhotos[0] === "object" &&
              entry.sitePhotos[0].url
            ) {
              entry.sitePhotos.forEach((photo) => {
                directFiles.push({
                  ...photo,
                  timeEntryId: entry.id,
                  employeeId: entry.employeeId,
                  timestamp: entry.clockOutTime || entry.clockInTime,
                  type: "construction_site",
                });
              });
            }
          }
          if (entry.photos && Array.isArray(entry.photos)) {
            if (
              entry.photos.length > 0 &&
              typeof entry.photos[0] === "object" &&
              entry.photos[0].url
            ) {
              entry.photos.forEach((photo) => {
                directFiles.push({
                  ...photo,
                  timeEntryId: entry.id,
                  employeeId: entry.employeeId,
                  timestamp: entry.clockOutTime || entry.clockInTime,
                  type: "construction_site",
                });
              });
            }
          }
        } else if (type === "delivery_note") {
          if (entry.documents && Array.isArray(entry.documents)) {
            if (
              entry.documents.length > 0 &&
              typeof entry.documents[0] === "object" &&
              entry.documents[0].url
            ) {
              entry.documents.forEach((doc) => {
                directFiles.push({
                  ...doc,
                  timeEntryId: entry.id,
                  employeeId: entry.employeeId,
                  timestamp: entry.clockOutTime || entry.clockInTime,
                  type: "delivery_note",
                });
              });
            }
          }
          if (entry.deliveryNotes && Array.isArray(entry.deliveryNotes)) {
            if (
              entry.deliveryNotes.length > 0 &&
              typeof entry.deliveryNotes[0] === "object" &&
              entry.deliveryNotes[0].url
            ) {
              entry.deliveryNotes.forEach((note) => {
                directFiles.push({
                  ...note,
                  timeEntryId: entry.id,
                  employeeId: entry.employeeId,
                  timestamp: entry.clockOutTime || entry.clockInTime,
                  type: "delivery_note",
                });
              });
            }
          }
        }
      });
      return directFiles;
    } catch (error) {
      console.error(
        `Fehler beim Laden der ${type}-Dateien für Projekt ${projectId}:`,
        error
      );
      return [];
    }
  },

  async getProjectAllFiles(projectId) {
    await this._authReadyPromise;
    if (!projectId) {
      return { construction_site: [], delivery_note: [] };
    }
    try {
      const result = {
        construction_site: [],
        delivery_note: [],
      };
      let filesSnapshot;
      try {
        filesSnapshot = await this.fileUploadsCollection
          .where("projectId", "==", projectId)
          .get({ source: "server" });
      } catch (e) {
        console.warn("⚠️ Server-Abfrage fehlgeschlagen, nutze Cache für fileUploads:", e && e.message);
        filesSnapshot = await this.fileUploadsCollection
        .where("projectId", "==", projectId)
        .get();
      }
      if (!filesSnapshot.empty) {
        filesSnapshot.docs.forEach((doc) => {
          const file = { id: doc.id, ...doc.data() };
          const fileType = file.type || "construction_site";
          if (fileType === "construction_site" || fileType === "site") {
            result.construction_site.push(file);
          } else if (fileType === "delivery_note" || fileType === "document") {
            result.delivery_note.push(file);
          }
        });
      }
      const timeEntriesSnapshot = await this.timeEntriesCollection
        .where("projectId", "==", projectId)
        .get();
      if (!timeEntriesSnapshot.empty) {
        const timeEntries = timeEntriesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        timeEntries.forEach((entry) => {
          if (entry.sitePhotos && Array.isArray(entry.sitePhotos)) {
            if (
              entry.sitePhotos.length > 0 &&
              typeof entry.sitePhotos[0] === "object" &&
              entry.sitePhotos[0].url
            ) {
              entry.sitePhotos.forEach((photo) => {
                result.construction_site.push({
                  ...photo,
                  timeEntryId: entry.id,
                  employeeId: entry.employeeId,
                  timestamp: entry.clockOutTime || entry.clockInTime,
                  type: "construction_site",
                });
              });
            }
          }
          if (entry.photos && Array.isArray(entry.photos)) {
            if (
              entry.photos.length > 0 &&
              typeof entry.photos[0] === "object" &&
              entry.photos[0].url
            ) {
              entry.photos.forEach((photo) => {
                result.construction_site.push({
                  ...photo,
                  timeEntryId: entry.id,
                  employeeId: entry.employeeId,
                  timestamp: entry.clockOutTime || entry.clockInTime,
                  type: "construction_site",
                });
              });
            }
          }
          if (entry.documents && Array.isArray(entry.documents)) {
            if (
              entry.documents.length > 0 &&
              typeof entry.documents[0] === "object" &&
              entry.documents[0].url
            ) {
              entry.documents.forEach((doc) => {
                result.delivery_note.push({
                  ...doc,
                  timeEntryId: entry.id,
                  employeeId: entry.employeeId,
                  timestamp: entry.clockOutTime || entry.clockInTime,
                  type: "delivery_note",
                });
              });
            }
          }
          if (entry.deliveryNotes && Array.isArray(entry.deliveryNotes)) {
            if (
              entry.deliveryNotes.length > 0 &&
              typeof entry.deliveryNotes[0] === "object" &&
              entry.deliveryNotes[0].url
            ) {
              entry.deliveryNotes.forEach((note) => {
                result.delivery_note.push({
                  ...note,
                  timeEntryId: entry.id,
                  employeeId: entry.employeeId,
                  timestamp: entry.clockOutTime || entry.clockInTime,
                  type: "delivery_note",
                });
              });
            }
          }
        });
      }
      result.construction_site.sort((a, b) => {
        const dateA =
          a.timestamp instanceof firebase.firestore.Timestamp
            ? a.timestamp.toDate()
            : new Date(a.timestamp || a.uploadTime || 0);
        const dateB =
          b.timestamp instanceof firebase.firestore.Timestamp
            ? b.timestamp.toDate()
            : new Date(b.timestamp || b.uploadTime || 0);
        return dateB - dateA;
      });
      result.delivery_note.sort((a, b) => {
        const dateA =
          a.timestamp instanceof firebase.firestore.Timestamp
            ? a.timestamp.toDate()
            : new Date(a.timestamp || a.uploadTime || 0);
        const dateB =
          b.timestamp instanceof firebase.firestore.Timestamp
            ? b.timestamp.toDate()
            : new Date(b.timestamp || b.uploadTime || 0);
        return dateB - dateA;
      });
      // Duplikate in beiden Listen entfernen (z. B. gleiche Datei aus mehreren Quellen)
      function dedupe(list) {
        const seen = new Set();
        const out = [];
        for (const f of list) {
          const key = f.id || f.url || `${f.fileName}|${f.fileSize}|${f.employeeId}|${f.projectId}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push(f);
          }
        }
        return out;
      }
      result.construction_site = dedupe(result.construction_site);
      result.delivery_note = dedupe(result.delivery_note);
      return result;
    } catch (error) {
      console.error(
        `Fehler beim Laden der Dateien für Projekt ${projectId}:`,
        error
      );
      return { construction_site: [], delivery_note: [] };
    }
  },

  async getActiveProjects() {
    await this._authReadyPromise;
    try {
      const snapshot = await this.projectsCollection.get();
      let projects = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      projects = projects.filter(
        (project) =>
          !project.status ||
          project.status === "active" ||
          project.status === "aktiv"
      );
      projects.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      return projects;
    } catch (error) {
      console.error("Fehler beim Abrufen aktiver Projekte:", error);
      return [];
    }
  },

  async addLiveDocumentationToTimeEntry(timeEntryId, documentationData) {
    await this._authReadyPromise;
    if (!timeEntryId) {
      throw new Error("Keine Zeiteintrag-ID angegeben");
    }
    try {
      const currentEntry = await this.getTimeEntryById(timeEntryId);
      if (!currentEntry) {
        throw new Error("Zeiteintrag nicht gefunden");
      }
      const existingLiveDocumentation = currentEntry.liveDocumentation || [];
      const newDocumentation = {
        timestamp: firebase.firestore.Timestamp.now(),
        notes: documentationData.notes || "",
        imageIds: (documentationData.images || []).map((img) => img.id),
        documentIds: (documentationData.documents || []).map((doc) => doc.id),
        photoCount: documentationData.photoCount || 0,
        documentCount: documentationData.documentCount || 0,
        addedBy: documentationData.addedBy,
        addedByName: documentationData.addedByName,
      };
      const updatedLiveDocumentation = [
        ...existingLiveDocumentation,
        newDocumentation,
      ];
      await this.updateTimeEntry(timeEntryId, {
        liveDocumentation: updatedLiveDocumentation,
        hasLiveDocumentation: true,
      });
      return newDocumentation;
    } catch (error) {
      console.error("Fehler beim Hinzufügen der Live-Dokumentation:", error);
      throw error;
    }
  },

  exportToCsv(data, filename) {
    if (!data || !data.length) {
      console.error("Keine Daten zum Exportieren vorhanden");
      return false;
    }
    const headers = Object.keys(data[0]);
    const csvRows = [];
    csvRows.push(headers.join(","));
    for (const row of data) {
      const values = headers.map((header) => {
        const value = row[header];
        if (value instanceof Date) {
          return `"${value.toLocaleString("de-DE")}"`;
        }
        if (typeof value === "string") {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvRows.push(values.join(","));
    }
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (navigator.msSaveBlob) {
      navigator.msSaveBlob(blob, filename);
    } else {
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    return true;
  },

  /**
   * Erstellt einen neuen Zeiteintrag für einen Mitarbeiter (Admin-Funktion)
   * @param {Object} timeEntry - Das Zeiteintragsobjekt mit allen erforderlichen Eigenschaften
   * @returns {Promise<Object>} - Das gespeicherte Zeiteintragsobjekt mit ID
   */
  async createTimeEntry(timeEntry) {
    try {
      await this._authReadyPromise;
      
      if (!timeEntry.employeeId || !timeEntry.projectId || !timeEntry.clockInTime || !timeEntry.clockOutTime) {
        throw new Error('Fehlende Pflichtfelder für den Zeiteintrag');
      }
      
      // Prüfen, ob der aktuelle Benutzer Admin-Rechte hat
      const user = await this.getFirebaseUser();
      const isAdmin = await this.isUserAdmin(user?.uid);
      
      if (!isAdmin) {
        throw new Error('Nur Administratoren können Zeiteinträge für Mitarbeiter erstellen');
      }
      
      // Zeiteintrag mit Zeitstempel versehen
      const entryWithTimestamp = {
        ...timeEntry,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      // In Firestore speichern
      const docRef = await this.timeEntriesCollection.add(entryWithTimestamp);
      
      // Gespeichertes Dokument zurückgeben
      return {
        id: docRef.id,
        ...timeEntry
      };
    } catch (error) {
      console.error('Fehler beim Erstellen des Zeiteintrags:', error);
      throw error;
    }
  },
  
  /**
   * Prüft, ob ein Benutzer Admin-Rechte hat
   * @param {string} userId - Die Benutzer-ID
   * @returns {Promise<boolean>} - true, wenn der Benutzer Admin-Rechte hat
   */
  async isUserAdmin(userId) {
    try {
      await this._authReadyPromise;
      
      if (!userId) return false;
      
      // Für Entwicklungszwecke: Standardmäßig true, um die Funktion zu testen
      // In der Produktion sollte hier eine echte Admin-Prüfung stattfinden
      // z.B. durch Abfrage einer Liste von Admin-Benutzern in Firestore
      // HINWEIS: Diese Implementierung ist nur vorübergehend und sollte für die
      // Produktion mit einer echten Berechtigungsprüfung ersetzt werden
      return true;
    } catch (error) {
      console.error('Fehler bei der Prüfung der Admin-Rechte:', error);
      return false;
    }
  },
  
  /**
   * Gibt den aktuell bei Firebase angemeldeten Benutzer zurück
   * @returns {Promise<Object|null>} - Der aktuelle Firebase-Benutzer oder null
   */
  async getFirebaseUser() {
    await this._authReadyPromise;
    return firebase.auth().currentUser;
  },

  /**
   * Lädt alle Fahrzeugbuchungen für ein bestimmtes Projekt
   * @param {string} projectId - Die ID des Projekts
   * @returns {Promise<Array>} - Array mit Fahrzeugbuchungen
   */
  async getVehicleUsagesForProject(projectId) {
    try {
      await this._authReadyPromise;
      
      if (!projectId) {
        throw new Error('Keine Projekt-ID angegeben');
      }
      
      // Fahrzeugbuchungen für das Projekt laden
      const snapshot = await this.vehicleUsagesCollection
        .where('projectId', '==', projectId)
        .orderBy('date', 'desc')
        .get();
      
      if (snapshot.empty) {
        console.log(`Keine Fahrzeugbuchungen für Projekt ${projectId} gefunden`);
        return [];
      }
      
      // Fahrzeugbuchungen sammeln
      const usages = [];
      
      for (const doc of snapshot.docs) {
        const usage = {
          id: doc.id,
          ...doc.data()
        };
        usages.push(usage);
      }
      
      console.log(`${usages.length} Fahrzeugbuchungen für Projekt ${projectId} geladen`);
      
      // Fahrzeug- und Mitarbeiterdaten nachladen
      const usagesWithDetails = await Promise.all(usages.map(async (usage) => {
        // Fahrzeugdaten laden
        let vehicleData = { name: 'Unbekanntes Fahrzeug' };
        if (usage.vehicleId) {
          const vehicleDoc = await this.vehiclesCollection.doc(usage.vehicleId).get();
          if (vehicleDoc.exists) {
            vehicleData = { 
              id: vehicleDoc.id,
              ...vehicleDoc.data()
            };
          }
        }
        
        // Mitarbeiterdaten laden
        let employeeData = { name: 'Unbekannter Mitarbeiter' };
        if (usage.employeeId) {
          const employeeDoc = await this.employeesCollection.doc(usage.employeeId).get();
          if (employeeDoc.exists) {
            employeeData = { 
              id: employeeDoc.id,
              ...employeeDoc.data()
            };
          }
        }
        
        return {
          ...usage,
          vehicle: vehicleData,
          employee: employeeData
        };
      }));
      
      return usagesWithDetails;
    } catch (error) {
      console.error('Fehler beim Laden der Fahrzeugbuchungen:', error);
      throw error;
    }
  },

  /**
   * Erstellt einen neuen Urlaubsantrag
   * @param {Object} leaveRequestData - Die Daten des Urlaubsantrags
   * @returns {Promise<string>} - Die ID des erstellten Urlaubsantrags
   */
  async createLeaveRequest(leaveRequestData) {
    try {
      await this._authReadyPromise;
      
      // Mitarbeiter-Details prüfen
      if (!leaveRequestData.employeeId) {
        throw new Error('Keine Mitarbeiter-ID angegeben');
      }
      
      // Prüfen, ob Start- und Enddatum vorhanden sind
      if (!leaveRequestData.startDate || !leaveRequestData.endDate) {
        throw new Error('Start- und Enddatum müssen angegeben werden');
      }
      
      // Standardwerte setzen
      const leaveRequest = {
        ...leaveRequestData,
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      // In Firestore speichern
      const docRef = await this.leaveRequestsCollection.add(leaveRequest);
      return docRef.id;
    } catch (error) {
      console.error('Fehler beim Erstellen des Urlaubsantrags:', error);
      throw error;
    }
  },
  
  /**
   * Aktualisiert einen Urlaubsantrag
   * @param {string} id - Die ID des Urlaubsantrags
   * @param {Object} leaveRequestData - Die aktualisierten Daten
   * @returns {Promise<void>}
   */
  async updateLeaveRequest(id, leaveRequestData) {
    try {
      await this._authReadyPromise;
      
      if (!id) {
        throw new Error('Keine Urlaubsantrag-ID angegeben');
      }
      
      // Timestamp für die Aktualisierung setzen
      const updateData = {
        ...leaveRequestData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      // In Firestore aktualisieren
      await this.leaveRequestsCollection.doc(id).update(updateData);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Urlaubsantrags:', error);
      throw error;
    }
  },
  
  /**
   * Genehmigt oder lehnt einen Urlaubsantrag ab
   * @param {string} id - Die ID des Urlaubsantrags
   * @param {string} status - Der neue Status ('approved' oder 'rejected')
   * @param {string} adminId - Die ID des Admins, der den Antrag bearbeitet
   * @param {string} adminComment - Optional: Kommentar des Admins
   * @returns {Promise<void>}
   */
  async processLeaveRequest(id, status, adminId, adminComment = '') {
    try {
      await this._authReadyPromise;
      
      if (!id) {
        throw new Error('Keine Urlaubsantrag-ID angegeben');
      }
      
      if (status !== 'approved' && status !== 'rejected') {
        throw new Error('Ungültiger Status. Erlaubte Werte: approved, rejected');
      }
      
      // Urlaubsantrag laden
      const leaveRequestDoc = await this.leaveRequestsCollection.doc(id).get();
      
      if (!leaveRequestDoc.exists) {
        throw new Error('Urlaubsantrag nicht gefunden');
      }
      
      const leaveRequest = {
        id: leaveRequestDoc.id,
        ...leaveRequestDoc.data()
      };
      
      // Aktualisierungsdaten vorbereiten
      const updateData = {
        status,
        reviewedBy: adminId,
        reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      if (adminComment) {
        updateData.adminComment = adminComment;
      }
      
      // Wenn genehmigt, Urlaubstage zum Mitarbeiter hinzufügen
      if (status === 'approved') {
        // Mitarbeiter laden
        const employeeDoc = await this.employeesCollection.doc(leaveRequest.employeeId).get();
        
        if (!employeeDoc.exists) {
          throw new Error('Mitarbeiter nicht gefunden');
        }
        
        const employee = employeeDoc.data();
        
        // Aktuelles Jahr prüfen und ggf. zurücksetzen
        const currentYear = new Date().getFullYear();
        
        // Urlaubstage-Objekt initialisieren oder aktualisieren
        let vacationDaysObj;
        if (!employee.vacationDays || employee.vacationDays.year !== currentYear) {
          // Neues Jahr - setze neue Urlaubsdaten
          vacationDaysObj = {
            total: 30,
            used: 0,
            year: currentYear
          };
        } else {
          // Bestehendes Jahr - behalte bestehende Daten
          vacationDaysObj = {
            total: employee.vacationDays.total || 30, // Standardwert, falls undefiniert
            used: employee.vacationDays.used || 0,    // Standardwert, falls undefiniert
            year: currentYear
          };
        }
        
        // Urlaubstage berechnen (ohne Wochenenden und Feiertage)
        const vacationDays = this.calculateWorkingDaysBetweenDates(
          leaveRequest.startDate.toDate(),
          leaveRequest.endDate.toDate()
        );
        
        // Überprüfen, ob genügend Urlaubstage vorhanden sind
        if (vacationDaysObj.used + vacationDays > vacationDaysObj.total) {
          throw new Error('Nicht genügend Urlaubstage verfügbar');
        }
        
        // Neue Gesamtzahl der verwendeten Urlaubstage
        const updatedUsedDays = vacationDaysObj.used + vacationDays;
        
        // Gesamtes Urlaubstage-Objekt aktualisieren
        await this.employeesCollection.doc(leaveRequest.employeeId).update({
          vacationDays: {
            total: vacationDaysObj.total,
            used: updatedUsedDays,
            year: currentYear
          }
        });
        
        console.log(`Urlaubstage für Mitarbeiter ${leaveRequest.employeeId} aktualisiert:`, {
          total: vacationDaysObj.total,
          used: updatedUsedDays,
          year: currentYear,
          verfügbar: vacationDaysObj.total - updatedUsedDays
        });
        
        // Genehmigte Urlaubstage als Zeiteinträge hinzufügen
        const startDate = leaveRequest.startDate.toDate();
        const endDate = leaveRequest.endDate.toDate();
        let currentDate = new Date(startDate);
        
        while (currentDate <= endDate) {
          // Prüfen, ob es sich um einen Arbeitstag handelt
          if (this.isWorkingDay(currentDate)) {
            // Zeiteintrag für den Urlaubstag erstellen
            const timeEntry = {
              employeeId: leaveRequest.employeeId,
              date: new Date(currentDate),
              clockInTime: new Date(currentDate.setHours(8, 0, 0)), // 8:00 Uhr
              clockOutTime: new Date(currentDate.setHours(16, 0, 0)), // 16:00 Uhr
              notes: `Genehmigter Urlaub (Antrag #${id})`,
              isVacationDay: true, // Markierung als Urlaubstag
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await this.timeEntriesCollection.add(timeEntry);
            
            // Zeit zurücksetzen für den nächsten Durchlauf
            currentDate.setHours(0, 0, 0, 0);
          }
          
          // Zum nächsten Tag
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
      
      // Urlaubsantrag aktualisieren
      await this.leaveRequestsCollection.doc(id).update(updateData);
    } catch (error) {
      console.error('Fehler bei der Bearbeitung des Urlaubsantrags:', error);
      throw error;
    }
  },
  
  /**
   * Lädt einen Urlaubsantrag anhand seiner ID
   * @param {string} id - Die ID des Urlaubsantrags
   * @returns {Promise<Object>} - Der Urlaubsantrag
   */
  async getLeaveRequestById(id) {
    try {
      await this._authReadyPromise;
      
      if (!id) {
        throw new Error('Keine Urlaubsantrag-ID angegeben');
      }
      
      const doc = await this.leaveRequestsCollection.doc(id).get();
      
      if (!doc.exists) {
        throw new Error('Urlaubsantrag nicht gefunden');
      }
      
      return {
        id: doc.id,
        ...doc.data()
      };
    } catch (error) {
      console.error('Fehler beim Laden des Urlaubsantrags:', error);
      throw error;
    }
  },
  
  /**
   * Lädt alle Urlaubsanträge eines Mitarbeiters
   * @param {string} employeeId - Die ID des Mitarbeiters
   * @returns {Promise<Array>} - Array mit Urlaubsanträgen
   */
  async getLeaveRequestsByEmployeeId(employeeId) {
    try {
      await this._authReadyPromise;
      
      if (!employeeId) {
        throw new Error('Keine Mitarbeiter-ID angegeben');
      }
      
      const snapshot = await this.leaveRequestsCollection
        .where('employeeId', '==', employeeId)
        .orderBy('createdAt', 'desc')
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Fehler beim Laden der Urlaubsanträge:', error);
      throw error;
    }
  },
  
  /**
   * Lädt alle Urlaubsanträge (für Admin-Übersicht)
   * @param {string} status - Optional: Filter nach Status
   * @returns {Promise<Array>} - Array mit Urlaubsanträgen und Mitarbeiterdaten
   */
  async getAllLeaveRequests(status = null) {
    try {
      await this._authReadyPromise;
      
      let query = this.leaveRequestsCollection.orderBy('createdAt', 'desc');
      
      if (status) {
        query = query.where('status', '==', status);
      }
      
      const snapshot = await query.get();
      
      const leaveRequests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Mitarbeiterdaten laden
      const leaveRequestsWithEmployeeData = await Promise.all(
        leaveRequests.map(async (request) => {
          const employeeDoc = await this.employeesCollection.doc(request.employeeId).get();
          const employeeData = employeeDoc.exists ? employeeDoc.data() : { name: 'Unbekannter Mitarbeiter' };
          
          return {
            ...request,
            employeeName: employeeData.name
          };
        })
      );
      
      return leaveRequestsWithEmployeeData;
    } catch (error) {
      console.error('Fehler beim Laden der Urlaubsanträge:', error);
      throw error;
    }
  },
  
  /**
   * Berechnet die Anzahl der Arbeitstage zwischen zwei Daten
   * (ohne Wochenenden und Feiertage in Bayern)
   * @param {Date} startDate - Startdatum
   * @param {Date} endDate - Enddatum
   * @returns {number} - Anzahl der Arbeitstage
   */
  calculateWorkingDaysBetweenDates(startDate, endDate) {
    let workingDays = 0;
    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    while (currentDate <= end) {
      if (this.isWorkingDay(currentDate)) {
        workingDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return workingDays;
  },
  
  /**
   * Prüft, ob ein Datum ein Arbeitstag ist (kein Wochenende und kein Feiertag in Bayern)
   * @param {Date} date - Das zu prüfende Datum
   * @returns {boolean} - true, wenn es ein Arbeitstag ist
   */
  isWorkingDay(date) {
    const day = date.getDay();
    
    // Wochenende ausschließen (0 = Sonntag, 6 = Samstag)
    if (day === 0 || day === 6) {
      return false;
    }
    
    // Bayerische Feiertage prüfen
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // Januar = 1
    const dayOfMonth = date.getDate();
    
    // Formatierung des Datums als 'YYYY-MM-DD' für den Vergleich
    const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
    
    // Statische bayerische Feiertage
    const holidays = [
      `${year}-01-01`, // Neujahr
      `${year}-01-06`, // Heilige Drei Könige
      `${year}-05-01`, // Tag der Arbeit
      `${year}-08-15`, // Mariä Himmelfahrt
      `${year}-10-03`, // Tag der Deutschen Einheit
      `${year}-11-01`, // Allerheiligen
      `${year}-12-25`, // 1. Weihnachtsfeiertag
      `${year}-12-26`  // 2. Weihnachtsfeiertag
    ];
    
    // Berechnung der beweglichen Feiertage
    const easterDate = this.calculateEaster(year);
    const karfreitag = new Date(easterDate);
    karfreitag.setDate(easterDate.getDate() - 2);
    
    const ostermontag = new Date(easterDate);
    ostermontag.setDate(easterDate.getDate() + 1);
    
    const christiHimmelfahrt = new Date(easterDate);
    christiHimmelfahrt.setDate(easterDate.getDate() + 39);
    
    const pfingstsonntag = new Date(easterDate);
    pfingstsonntag.setDate(easterDate.getDate() + 49);
    
    const pfingstmontag = new Date(easterDate);
    pfingstmontag.setDate(easterDate.getDate() + 50);
    
    const fronleichnam = new Date(easterDate);
    fronleichnam.setDate(easterDate.getDate() + 60);
    
    // Formatierung der beweglichen Feiertage
    holidays.push(
      `${karfreitag.getFullYear()}-${String(karfreitag.getMonth()+1).padStart(2, '0')}-${String(karfreitag.getDate()).padStart(2, '0')}`,
      `${ostermontag.getFullYear()}-${String(ostermontag.getMonth()+1).padStart(2, '0')}-${String(ostermontag.getDate()).padStart(2, '0')}`,
      `${christiHimmelfahrt.getFullYear()}-${String(christiHimmelfahrt.getMonth()+1).padStart(2, '0')}-${String(christiHimmelfahrt.getDate()).padStart(2, '0')}`,
      `${pfingstmontag.getFullYear()}-${String(pfingstmontag.getMonth()+1).padStart(2, '0')}-${String(pfingstmontag.getDate()).padStart(2, '0')}`,
      `${fronleichnam.getFullYear()}-${String(fronleichnam.getMonth()+1).padStart(2, '0')}-${String(fronleichnam.getDate()).padStart(2, '0')}`
    );
    
    // Prüfen, ob das Datum ein Feiertag ist
    return !holidays.includes(formattedDate);
  },
  
  /**
   * Berechnet das Osterdatum für ein gegebenes Jahr
   * @param {number} year - Das Jahr
   * @returns {Date} - Das Osterdatum
   */
  calculateEaster(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    
    return new Date(year, month - 1, day);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  DataService.init();
});
