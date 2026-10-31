/**
 * UserPreferences — хранилище глобальных ограничений пользователя.
 * 
 * v1.0 (v6.4.0):
 *   • Сохранение в localStorage.
 *   • Дефолтные значения (без ограничений).
 */
import { CONSTANTS, DIET_TYPES } from '../utils/Constants.js';

export const UserPreferences = (function() {
  const STORAGE_KEY = CONSTANTS.STORAGE_KEYS.USER_PREFERENCES;

  const DEFAULTS = {
    diet: DIET_TYPES.ALL,
    maxDifficulty: 5,
    maxSpiciness: 5,
    allergens: [],
    stopIngredients: []
  };

  let prefs = { ...DEFAULTS };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        prefs = { ...DEFAULTS, ...parsed };
      }
    } catch (e) {
      console.warn('Ошибка загрузки настроек:', e);
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
      console.error('Ошибка сохранения настроек:', e);
    }
  }

  function get() { return { ...prefs }; }

  function update(newPrefs) {
    prefs = { ...prefs, ...newPrefs };
    save();
  }

  // Автоматическая загрузка при импорте модуля
  load();

  return { get, update, DEFAULTS };
})();
