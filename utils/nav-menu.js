/**
 * Hamburger Navigation Menu Functionality
 * Handles responsive navigation toggle for small screens
 */

(function() {
    'use strict';
    
    let navToggle;
    let navMenu;
    let isMenuOpen = false;
    
    /**
     * Initialisiert das Hamburger-Menü
     */
    function initNavigationMenu() {
        navToggle = document.getElementById('nav-toggle');
        navMenu = document.getElementById('nav-menu');
        
        if (!navToggle || !navMenu) {
            console.warn('Navigation menu elements not found');
            return;
        }
        
        // Toggle-Button Event Listener
        navToggle.addEventListener('click', toggleMenu);
        
        // Schließen wenn außerhalb geklickt wird
        document.addEventListener('click', handleOutsideClick);
        
        // Schließen bei Escape-Taste
        document.addEventListener('keydown', handleEscapeKey);
        
        // Schließen bei Fenster-Resize (falls das Menü offen ist und Bildschirm größer wird)
        window.addEventListener('resize', handleResize);
        
        console.log('✅ Navigation menu initialized');
    }
    
    /**
     * Öffnet/Schließt das Menü
     */
    function toggleMenu() {
        isMenuOpen = !isMenuOpen;
        
        if (isMenuOpen) {
            openMenu();
        } else {
            closeMenu();
        }
    }
    
    /**
     * Öffnet das Menü
     */
    function openMenu() {
        navToggle.classList.add('active');
        navMenu.classList.add('active');
        document.body.style.overflow = 'hidden'; // Verhindert Scrollen im Hintergrund
        isMenuOpen = true;
    }
    
    /**
     * Schließt das Menü
     */
    function closeMenu() {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.style.overflow = ''; // Ermöglicht Scrollen wieder
        isMenuOpen = false;
    }
    
    /**
     * Behandelt Klicks außerhalb des Menüs
     */
    function handleOutsideClick(event) {
        if (!isMenuOpen) return;
        
        // Prüfen ob der Klick außerhalb des Menüs und Toggle-Buttons war
        if (!navMenu.contains(event.target) && !navToggle.contains(event.target)) {
            closeMenu();
        }
    }
    
    /**
     * Behandelt Escape-Taste zum Schließen
     */
    function handleEscapeKey(event) {
        if (event.key === 'Escape' && isMenuOpen) {
            closeMenu();
        }
    }
    
    /**
     * Behandelt Fenster-Größenänderungen
     */
    function handleResize() {
        // Schließe das Menü wenn der Bildschirm groß genug wird
        if (window.innerWidth > 992 && isMenuOpen) {
            closeMenu();
        }
    }
    
    // Initialisierung wenn DOM geladen ist
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNavigationMenu);
    } else {
        initNavigationMenu();
    }
    
    // Globale Funktionen für externe Nutzung
    window.navMenu = {
        open: openMenu,
        close: closeMenu,
        toggle: toggleMenu,
        isOpen: () => isMenuOpen
    };
    
})();
