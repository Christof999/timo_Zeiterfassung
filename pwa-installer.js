// PWA Installation Handler
class PWAInstaller {
    constructor() {
        this.deferredPrompt = null;
        this.init();
    }

    init() {
        // PWA Install Button erstellen
        this.createInstallButton();
        
        // Event Listener für Installation
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallButton();
        });

        // Nach Installation verstecken
        window.addEventListener('appinstalled', () => {
            this.hideInstallButton();
            this.showInstalledMessage();
        });

        // Überprüfen ob bereits installiert
        if (window.matchMedia('(display-mode: standalone)').matches) {
            this.hideInstallButton();
        }
    }

    createInstallButton() {
        // Prüfen ob Button bereits existiert
        if (document.getElementById('pwa-install-btn')) return;

        const installBtn = document.createElement('button');
        installBtn.id = 'pwa-install-btn';
        installBtn.className = 'btn secondary-btn pwa-install-btn';
        installBtn.innerHTML = '<i class="fas fa-mobile-alt"></i> App installieren';
        installBtn.style.display = 'none';
        installBtn.onclick = () => this.installApp();

        // Button in Header einfügen
        const header = document.querySelector('header .logo');
        if (header) {
            header.appendChild(installBtn);
        }
    }

    showInstallButton() {
        const btn = document.getElementById('pwa-install-btn');
        if (btn) {
            btn.style.display = 'inline-block';
            btn.style.marginTop = '10px';
        }
    }

    hideInstallButton() {
        const btn = document.getElementById('pwa-install-btn');
        if (btn) {
            btn.style.display = 'none';
        }
    }

    async installApp() {
        if (!this.deferredPrompt) return;

        try {
            this.deferredPrompt.prompt();
            const result = await this.deferredPrompt.userChoice;
            
            if (result.outcome === 'accepted') {
                console.log('PWA installiert');
            } else {
                console.log('PWA Installation abgebrochen');
            }
        } catch (error) {
            console.error('Fehler bei PWA Installation:', error);
        }

        this.deferredPrompt = null;
        this.hideInstallButton();
    }

    showInstalledMessage() {
        // Kurze Bestätigungsnachricht anzeigen
        const message = document.createElement('div');
        message.className = 'install-success-message';
        message.innerHTML = '<i class="fas fa-check"></i> App erfolgreich installiert!';
        message.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--primary-color);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 1000;
            font-size: 14px;
        `;

        document.body.appendChild(message);

        // Nach 3 Sekunden entfernen
        setTimeout(() => {
            message.remove();
        }, 3000);
    }
}

// PWA Installer initialisieren wenn DOM geladen ist
document.addEventListener('DOMContentLoaded', () => {
    new PWAInstaller();
});
