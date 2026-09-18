import { STATUSES, CATEGORIES, CATEGORY_LABELS, CONSTANTS } from '../utils/Constants.js';
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

  // «На твой вкус» — подборка по категориям. Используется функцией
  // getRandomDishFromTaste(category).
  const TASTE_DISHES = {
    [CATEGORIES.SOUP]:   ['Борщ', 'Солянка', 'Уха', 'Щи', 'Сырный суп', 'Гороховый суп', 'Рассольник', 'Окрошка'],
    [CATEGORIES.SALAD]:  ['Селедка под шубой', 'Оливье', 'Крабовый', 'Цезарь с курицей', 'Мимоза', 'Винегрет', 'Греческий салат', 'Салат из свежих овощей'],
    [CATEGORIES.MAIN]:   ['Картофельное пюре с котлетой', 'Пельмени', 'Манты', 'Гречка с мясом', 'Голубцы', 'Жаркое', 'Макароны по-флотски', 'Плов'],
    [CATEGORIES.BAKERY]: ['Блины', 'Оладьи', 'Сырники', 'Пирог с яблоками', 'Ватрушки', 'Пирожки'],
    [CATEGORIES.OTHER]:  ['Пицца', 'Шаурма', 'Сэндвичи', 'Омлет', 'Яичница с беконом']
  };

  function generateId() {
    return Date.now() + Math.random() * 10000;
  }

  function normalizeDish(dish) {
    if (!dish.category) dish.category = Utils.guessCategory(dish.name);
    if (!dish.note) dish.note = '';
    if (dish.liked === undefined) dish.liked = false;
    if (dish.disliked === undefined) dish.disliked = false;
    if (!dish.id) dish.id = generateId();
    if (dish.recipeId === undefined) dish.recipeId = null;
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
      const result = DEFAULT_DISHES.map((d, i) => ({ ...d, id: generateId() + i, liked: false, disliked: false, recipeId: null }));
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
          recipeId: null
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

  function addDish(name, status, date, category, liked = false, note = '', recipeId = null) {
    if (!name || !status || !date || !category) return false;
    const id = generateId();
    dishes.push({ id, name, status, date, category, liked, disliked: false, note, recipeId });
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

  // Случайное блюдо из категории.
  // Без аргумента (category = null) — случайная категория из TASTE_DISHES
  // (обратная совместимость со старым вызовом без параметров).
  // С аргументом — строго из указанной категории.
  function getRandomDishFromTaste(category = null) {
    const available = Object.keys(TASTE_DISHES);
    const pool = (category && TASTE_DISHES[category]) ? [category] : available;
    const cat = pool[Math.floor(Math.random() * pool.length)];
    const list = TASTE_DISHES[cat];
    const name = list[Math.floor(Math.random() * list.length)];
    return { name, category: cat, categoryLabel: CATEGORY_LABELS[cat] };
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
    save();
    return true;
  }

  return {
    init, getAll, getForDate, addDish, removeDish,
    toggleStatus, toggleLike, toggleThumbUp, toggleThumbDown,
    isDishNameDisliked,
    getAllUniqueWithLastDone,
    getFavorites, replaceAll,
    getRandomDishFromTaste, updateDishDate, clearRecipeRefs,
    updateDish
  };
})();
