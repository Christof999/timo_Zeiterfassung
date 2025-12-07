// Utility zum Leeren des Browser-Caches
export const clearCache = () => {
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => {
        caches.delete(name);
      });
      console.log('✅ Browser-Cache geleert');
    });
  }
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
        console.log('✅ Service Worker deaktiviert');
      });
    });
  }
}

