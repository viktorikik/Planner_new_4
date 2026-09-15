import { STATUSES, CATEGORIES, CATEGORY_LABELS, CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { EventBus } from '../utils/EventBus.js';
import { showStorageError } from '../utils/notifications.js';

export const DishStore = (function() {
  const STORAGE_KEY = CONSTANTS.STORAGE_KEYS.DISHES;
  let dishes = [];
  let cacheUnique = null;
  let cacheRecs = null;
  let cacheAllWithDone = null;

  const DEFAULT_DISHES = [ /* ... (как в исходном коде) ... */ ];

  const TASTE_DISHES = { /* ... */ };

  function generateId() {
    return Date.now() + Math.random() * 10000;
  }

  function normalizeDish(dish) { /* ... */ }

  function load() { /* ... */ }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dishes));
      cacheUnique = null;
      cacheRecs = null;
      cacheAllWithDone = null;
    } catch (e) {
      console.error('Ошибка сохранения данных:', e);
      showStorageError('блюда');
    }
    EventBus.emit(CONSTANTS.EVENTS.DISHES_CHANGED);
  }

  function init() { /* ... */ }

  function editDishName(id, newName) { /* ... */ }
  function updateNote(id, note) { /* ... */ }
  function getAll() { return dishes.slice(); }
  function getForDate(dateStr) { return dishes.filter(d => d.date === dateStr); }

  function addDish(name, status, date, category, liked = false, note = '', recipeId = null) { /* ... */ }
  function removeDish(id) { /* ... */ }
  function toggleStatus(id) { /* ... */ }
  function toggleLike(id) { /* ... */ }
  function getAllUniqueWithLastDone() { /* ... */ }
  function getRecommendations() { /* ... */ }
  function getFavorites() { return dishes.filter(d => d.liked); }
  function invalidateCache() { cacheUnique = null; cacheRecs = null; cacheAllWithDone = null; }
  function replaceAll(newDishes) { /* ... */ }
  function getRandomDishFromTaste() { /* ... */ }
  function setRecipeId(dishId, recipeId) { /* ... */ }
  function updateDishDate(id, newDate) { /* ... */ }

  return {
    init, editDishName, updateNote, getAll, getForDate, addDish, removeDish,
    toggleStatus, toggleLike, getAllUniqueWithLastDone,
    getRecommendations, getFavorites, invalidateCache, replaceAll,
    getRandomDishFromTaste, setRecipeId, updateDishDate
  };
})();
