let lastFocusedElement = null;

export function trapFocus(overlay, closeCallback) {
  if (!overlay) return;

  lastFocusedElement = document.activeElement;

  const focusableElements = overlay.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusableElements.length === 0) {
    overlay.setAttribute('tabindex', '-1');
    overlay.focus();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  firstElement.focus();

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    } else if (e.key === 'Escape') {
      if (typeof closeCallback === 'function') closeCallback();
    }
  };

  overlay.addEventListener('keydown', handleKeyDown);

  overlay._trapFocusCleanup = () => {
    overlay.removeEventListener('keydown', handleKeyDown);
    if (lastFocusedElement) {
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  };
}
