/**
 * Datenverwaltung für die Lauffer Zeiterfassung App
 * Verantwortlich für die Speicherung und Abfrage von Mitarbeitern, Projekten und Zeiteinträgen
 * Firebase-Version - JETZT MIT ANONYMER AUTHENTIFIZIERUNG
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

  // Ein Promise, das sicherstellt, dass keine DB-Anfrage gesendet wird,
  // bevor die anonyme Anmeldung abgeschlossen ist.
  _authReadyPromise: null,

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

    this._authReadyPromise = new Promise((resolve) => {
      auth.onAuthStateChanged((user) => {
        if (user) {
          console.log("✅ Firebase Auth bereit. Anonymer Benutzer:", user.uid);
          resolve();
        }
      });
    });

    auth.signInAnonymously().catch((error) => {
      console.error("❌ Fehler bei der anonymen Anmeldung:", error);
    });

    console.log("DataService initialisiert und wartet auf Firebase Auth...");
  },

  // Admin-Verwaltung (bleibt unverändert)
  _currentAdmin: null,
  _currentUser: null,

  getCurrentAdmin() {
    try {
      const savedAdmin = localStorage.getItem("lauffer_admin_user");
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
    localStorage.removeItem("lauffer_current_user");
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
      const doc = await this.employeesCollection.doc(id).get();
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
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
    await this._authReadyPromise;
    if (!projectId) {
      console.error("Keine Projekt-ID angegeben");
      return null;
    }
    try {
      const doc = await this.projectsCollection.doc(projectId).get();
      if (!doc.exists) {
        console.log(`❌ Projekt mit ID ${projectId} nicht gefunden`);
        return null;
      }
      const projectData = doc.data();
      return { id: doc.id, ...projectData };
    } catch (error) {
      console.error(
        `❌ Fehler beim Abrufen des Projekts mit ID ${projectId}:`,
        error
      );
      return null;
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
      return [...validFiles, ...directFiles];
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

  async addTimeEntry(timeEntryData) {
    await this._authReadyPromise;
    try {
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
      const snapshot = await query.get();
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
      fileData.id = docRef.id;
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
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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
      const timeEntriesSnapshot = await this.timeEntriesCollection
        .where("projectId", "==", projectId)
        .get();
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
      const filesSnapshot = await this.fileUploadsCollection
        .where("projectId", "==", projectId)
        .get();
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
};

document.addEventListener("DOMContentLoaded", () => {
  DataService.init();
});
