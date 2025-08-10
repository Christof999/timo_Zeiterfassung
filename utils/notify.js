(function () {
  if (!window.notify) {
    window.notify = function notify(message, type) {
      var level = type || 'info';
      try {
        if (window.app && typeof window.app.showNotification === 'function') {
          window.app.showNotification(message, level);
        } else {
          try {
            console.log((level.toUpperCase() + ': ') + message);
          } catch (e) {}
          alert(message);
        }
      } catch (err) {
        try {
          console.warn('NOTIFY_FALLBACK', err);
        } catch (e) {}
        alert(message);
      }
    };
  }
})();


