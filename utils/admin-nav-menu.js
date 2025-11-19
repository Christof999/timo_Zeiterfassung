/**
 * Admin Hamburger Navigation Menu Functionality
 * Handles responsive navigation toggle for admin dashboard tabs
 */

(function() {
    'use strict';
    
    let adminNavToggle;
    let adminNavMenu;
    let isAdminMenuOpen = false;
    
    /**
     * Initialisiert das Admin-Hamburger-Menü
     */
    function initAdminNavigationMenu() {
        adminNavToggle = document.getElementById('admin-nav-toggle');
        adminNavMenu = document.getElementById('admin-nav-menu');
        
        if (!adminNavToggle || !adminNavMenu) {
            console.log('Admin navigation menu elements not found - maybe not on admin page');
            return;
        }
        
        // Toggle-Button Event Listener
        adminNavToggle.addEventListener('click', toggleAdminMenu);
        
        // Schließen-Button im Menü (X-Button)
        const closeButton = adminNavMenu.querySelector('.admin-menu-close');
        if (closeButton) {
            closeButton.addEventListener('click', closeAdminMenu);
        }
        
        // Schließen wenn außerhalb geklickt wird
        document.addEventListener('click', handleOutsideClick);
        
        // Schließen bei Escape-Taste
        document.addEventListener('keydown', handleEscapeKey);
        
        // Schließen bei Fenster-Resize (falls das Menü offen ist und Bildschirm größer wird)
        window.addEventListener('resize', handleResize);
        
        // Tab-Button Clicks - Menü schließen nach Tab-Wechsel
        const tabButtons = adminNavMenu.querySelectorAll('.tab-btn');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Kurze Verzögerung, damit der Tab-Wechsel stattfinden kann
                setTimeout(() => {
                    if (isAdminMenuOpen) {
                        closeAdminMenu();
                    }
                }, 100);
            });
        });
        
        console.log('✅ Admin navigation menu initialized');
    }
    
    /**
     * Öffnet/Schließt das Admin-Menü
     */
    function toggleAdminMenu() {
        isAdminMenuOpen = !isAdminMenuOpen;
        
        if (isAdminMenuOpen) {
            openAdminMenu();
        } else {
            closeAdminMenu();
        }
    }
    
    /**
     * Öffnet das Admin-Menü
     */
    function openAdminMenu() {
        adminNavToggle.classList.add('active');
        adminNavMenu.classList.add('active');
        document.body.classList.add('admin-menu-open'); // Klasse für CSS-Selektor
        document.body.style.overflow = 'hidden'; // Verhindert Scrollen im Hintergrund
        isAdminMenuOpen = true;
    }
    
    /**
     * Schließt das Admin-Menü
     */
    function closeAdminMenu() {
        adminNavToggle.classList.remove('active');
        adminNavMenu.classList.remove('active');
        document.body.classList.remove('admin-menu-open'); // Klasse entfernen
        document.body.style.overflow = ''; // Ermöglicht Scrollen wieder
        isAdminMenuOpen = false;
    }
    
    /**
     * Behandelt Klicks außerhalb des Menüs
     */
    function handleOutsideClick(event) {
        if (!isAdminMenuOpen) return;
        
        // Prüfen ob der Klick außerhalb des Menüs und Toggle-Buttons war
        if (!adminNavMenu.contains(event.target) && !adminNavToggle.contains(event.target)) {
            closeAdminMenu();
        }
    }
    
    /**
     * Behandelt Escape-Taste zum Schließen
     */
    function handleEscapeKey(event) {
        if (event.key === 'Escape' && isAdminMenuOpen) {
            closeAdminMenu();
        }
    }
    
    /**
     * Behandelt Fenster-Größenänderungen
     */
    function handleResize() {
        // Schließe das Menü wenn der Bildschirm groß genug wird
        if (window.innerWidth > 992 && isAdminMenuOpen) {
            closeAdminMenu();
        }
    }
    
    // Initialisierung wenn DOM geladen ist
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdminNavigationMenu);
    } else {
        initAdminNavigationMenu();
    }
    
    // Globale Funktionen für externe Nutzung
    window.adminNavMenu = {
        open: openAdminMenu,
        close: closeAdminMenu,
        toggle: toggleAdminMenu,
        isOpen: () => isAdminMenuOpen
    };
    
})();
