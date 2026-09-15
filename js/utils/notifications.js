export function showStorageError(action) {
  showMessage(`⚠️ Не удалось сохранить данные (${action}). Проверьте доступность localStorage и переполнение хранилища.`, 'error');
}

export function showMessage(message, type = 'info') {
  const liveRegion = document.getElementById('liveRegion');
  if (!liveRegion) return;
  
  liveRegion.textContent = '';
  setTimeout(() => {
    liveRegion.textContent = message;
  }, 50);
  
  setTimeout(() => {
    if (liveRegion.textContent === message) {
      liveRegion.textContent = '';
    }
  }, 3000);
}
