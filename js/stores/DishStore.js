import { STATUSES, CATEGORIES, CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { EventBus } from '../utils/EventBus.js';
import { showStorageError } from '../utils/notifications.js';

export const DishStore = (function() {
  const STORAGE_KEY = CONSTANTS.STORAGE_KEYS.DISHES;
  let dishes = [];
  let cacheAllWithDone = null;

  const DEFAULT_DISHES = [
    { name: 'Гороховый суп', status: STATUSES.DONE, date: '2026-08-24', category: CATEGORIES.SOUP, note: '' },
    { name: 'Запеканка из фарша и овощей', status: STATUSES.DONE, date: '2026-08-25', category: CATEGORIES.MAIN, note: 'можно добавить сыр' },
    { name: 'Колбаски и запеченая картошка', status: STATUSES.DONE, date: '2026-08-26', category: CATEGORIES.MAIN, note: '' },
    { name: 'Плов', status: STATUSES.PLANNED, date: '2026-08-28', category: CATEGORIES.MAIN, note: 'использовать баранину' },
    { name: 'Салат с крабовыми палочками', status: STATUSES.PLANNED, date: '2026-08-28', category: CATEGORIES.SALAD, note: '' },
    { name: 'Суп борщ?', status: STATUSES.PLANNED, date: '2026-08-31', category: CATEGORIES.SOUP, note: '' },
    { name: 'Котлеты с картофельным пюре', status: STATUSES.PLANNED, date: '2026-09-01', category: CATEGORIES.MAIN, note: '' },
    { name: 'Салат морковь по-корейски', status: STATUSES.PLANNED, date: '2026-09-01', category: CATEGORIES.SALAD, note: '' },
    { name: 'Печень и перловка', status: STATUSES.PLANNED, date: '2026-09-02', category: CATEGORIES.MAIN, note: '' },
    { name: 'Мясо по-французски', status: STATUSES.PLANNED, date: '2026-09-03', category: CATEGORIES.MAIN, note: '' },
    { name: 'Морская капуста с крабовыми палочками', status: STATUSES.PLANNED, date: '2026-09-04', category: CATEGORIES.SALAD, note: '' },
    { name: 'Суп с сайрой', status: STATUSES.PLANNED, date: '2026-09-07', category: CATEGORIES.SOUP, note: '' },
    { name: 'Тушеная капуста', status: STATUSES.PLANNED, date: '2026-09-08', category: CATEGORIES.MAIN, note: '' },
    { name: 'Запеченные куриные ножки', status: STATUSES.PLANNED, date: '2026-09-09', category: CATEGORIES.MAIN, note: '' },
    { name: 'Фунчоза', status: STATUSES.PLANNED, date: '2026-09-09', category: CATEGORIES.MAIN, note: '' },
    { name: 'Удон', status: STATUSES.PLANNED, date: '2026-09-10', category: CATEGORIES.MAIN, note: '' },
    { name: 'Паста Болоньезе', status: STATUSES.PLANNED, date: '2026-09-12', category: CATEGORIES.MAIN, note: 'сделать с фаршем индейки' },
  ];

  function generateId() {
    return Date.now() + Math.random() * 10000;
  }

  // Приводит любое значение к массиву mealTypes.
  // Принимает: массив строк, одну строку, null/undefined.
  function normalizeMealTypes(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter(v => typeof v === 'string' && v);
    }
    if (typeof value === 'string') return [value];
    return [];
  }

  function normalizeDish(dish) {
    if (!dish.category) dish.category = Utils.guessCategory(dish.name);
    if (!dish.note) dish.note = '';
    if (dish.liked === undefined) dish.liked = false;
    if (dish.disliked === undefined) dish.disliked = false;
    if (!dish.id) dish.id = generateId();
    if (dish.recipeId === undefined) dish.recipeId = null;

    // Миграция: старое поле mealType (строка|null) → mealTypes (массив).
    // Работает один раз — после сохранения блюда поле mealType исчезает.
    if (dish.mealTypes === undefined) {
      if (dish.mealType) {
        dish.mealTypes = [dish.mealType];
      } else {
        dish.mealTypes = [];
      }
    }
    // Защита: mealTypes всегда массив
    if (!Array.isArray(dish.mealTypes)) {
      dish.mealTypes = dish.mealTypes ? [dish.mealTypes] : [];
    }
    // Удаляем старое поле, чтобы не путалось в модели
    delete dish.mealType;

    return dish;
  }

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) {
          dishes = parsed.map(normalizeDish);
          return true;
        }
      }
    } catch (e) {
      console.warn('Ошибка загрузки данных:', e);
    }
    return false;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dishes));
      cacheAllWithDone = null;
    } catch (e) {
      console.error('Ошибка сохранения данных:', e);
      showStorageError('блюда');
    }
    EventBus.emit(CONSTANTS.EVENTS.DISHES_CHANGED);
  }

  function init() {
    if (!load()) {
      const result = DEFAULT_DISHES.map((d, i) => ({ ...d, id: generateId() + i, liked: false, disliked: false, recipeId: null, mealTypes: [] }));
      const noDate = [
        { name: 'Салат с морской капустой и крабовым мясом', category: CATEGORIES.SALAD, note: '' },
        { name: 'Гречка и салат из свежей капусты как в столовой', category: CATEGORIES.MAIN, note: '' },
        { name: 'Суп-пюре из кабачков', category: CATEGORIES.SOUP, note: 'можно добавить сливки' }
      ];
      const today = new Date();
      noDate.forEach((item, idx) => {
        const d = new Date(today);
        d.setDate(d.getDate() + 7 + idx);
        result.push({
          id: generateId() + 1000 + idx,
          name: item.name,
          status: STATUSES.PLANNED,
          date: Utils.formatDateLocal(d),
          category: item.category,
          liked: false,
          disliked: false,
          note: item.note || '',
          recipeId: null,
          mealTypes: []
        });
      });
      dishes = result;
      save();
    } else {
      EventBus.emit(CONSTANTS.EVENTS.DISHES_CHANGED);
    }
  }

  function getAll() { return dishes.slice(); }
  function getForDate(dateStr) { return dishes.filter(d => d.date === dateStr); }

  // mealTypes — массив значений из MEAL_TYPES. Может быть пустым.
  // Функция принимает массив, строку или null — нормализует внутри.
  function addDish(name, status, date, category, liked = false, note = '', recipeId = null, mealTypes = []) {
    if (!name || !status || !date || !category) return false;
    const id = generateId();
    const normalized = normalizeMealTypes(mealTypes);
    dishes.push({ id, name, status, date, category, liked, disliked: false, note, recipeId, mealTypes: normalized });
    save();
    return true;
  }

  function removeDish(id) {
    const index = dishes.findIndex(d => d.id === id);
    if (index === -1) return false;
    dishes.splice(index, 1);
    save();
    return true;
  }

  function toggleStatus(id) {
    const dish = dishes.find(d => d.id === id);
    if (!dish) return false;
    dish.status = dish.status === STATUSES.DONE ? STATUSES.PLANNED : STATUSES.DONE;
    save();
    return true;
  }

  // Классический toggleLike оставлен — используется в «Любимых» для снятия оценки
  function toggleLike(id) {
    const dish = dishes.find(d => d.id === id);
    if (!dish) return false;
    dish.liked = !dish.liked;
    if (dish.liked) dish.disliked = false;
    save();
    return true;
  }

  // 👍 Нравится — взаимоисключение с 👎
  function toggleThumbUp(id) {
    const dish = dishes.find(d => d.id === id);
    if (!dish) return false;
    if (dish.liked) {
      dish.liked = false;
    } else {
      dish.liked = true;
      dish.disliked = false;
    }
    save();
    return true;
  }

  // 👎 Не нравится — взаимоисключение с 👍
  function toggleThumbDown(id) {
    const dish = dishes.find(d => d.id === id);
    if (!dish) return false;
    if (dish.disliked) {
      dish.disliked = false;
    } else {
      dish.disliked = true;
      dish.liked = false;
    }
    save();
    return true;
  }

  // Проверка: последняя по дате запись с этим именем имеет 👎?
  function isDishNameDisliked(name) {
    const entries = dishes.filter(d => d.name === name);
    if (entries.length === 0) return false;
    const sorted = entries.slice().sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0].disliked === true;
  }

  function getAllUniqueWithLastDone() {
    if (cacheAllWithDone) return cacheAllWithDone;
    const names = new Set(dishes.map(d => d.name));
    const result = [];
    names.forEach(name => {
      const doneEntries = dishes.filter(d => d.name === name && d.status === STATUSES.DONE);
      let lastDoneDate = null;
      if (doneEntries.length > 0) {
        lastDoneDate = doneEntries.reduce((max, d) => d.date > max ? d.date : max, doneEntries[0].date);
      }
      result.push({ name, lastDoneDate });
    });
    result.sort((a, b) => {
      if (a.lastDoneDate && b.lastDoneDate) return a.lastDoneDate.localeCompare(b.lastDoneDate);
      if (a.lastDoneDate && !b.lastDoneDate) return -1;
      if (!a.lastDoneDate && b.lastDoneDate) return 1;
      return a.name.localeCompare(b.name);
    });
    cacheAllWithDone = result;
    return result;
  }

  function getFavorites() { return dishes.filter(d => d.liked); }
  function replaceAll(newDishes) {
    dishes = newDishes.map(normalizeDish);
    save();
  }

  function updateDishDate(id, newDate) {
    const dish = dishes.find(d => d.id === id);
    if (!dish) return false;
    dish.date = newDate;
    save();
    return true;
  }

  function clearRecipeRefs(recipeId) {
    let changed = false;
    dishes.forEach(d => {
      if (d.recipeId === recipeId) {
        d.recipeId = null;
        changed = true;
      }
    });
    if (changed) save();
    return changed;
  }

  function updateDish(id, fields) {
    const dish = dishes.find(d => d.id === id);
    if (!dish) return false;
    if (fields.name !== undefined) dish.name = String(fields.name).trim();
    if (fields.status !== undefined) dish.status = fields.status;
    if (fields.category !== undefined) dish.category = fields.category;
    if (fields.note !== undefined) dish.note = String(fields.note).trim();
    if (fields.recipeId !== undefined) dish.recipeId = fields.recipeId;
    if (fields.liked !== undefined) dish.liked = fields.liked;
    if (fields.disliked !== undefined) dish.disliked = fields.disliked;
    if (fields.mealTypes !== undefined) dish.mealTypes = normalizeMealTypes(fields.mealTypes);
    save();
    return true;
  }

  return {
    init, getAll, getForDate, addDish, removeDish,
    toggleStatus, toggleLike, toggleThumbUp, toggleThumbDown,
    isDishNameDisliked,
    getAllUniqueWithLastDone,
    getFavorites, replaceAll,
    updateDishDate, clearRecipeRefs,
    updateDish
  };
})();
