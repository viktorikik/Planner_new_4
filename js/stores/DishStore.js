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

  const TASTE_DISHES = {
    [CATEGORIES.SOUP]: ['Борщ', 'Солянка', 'Уха', 'Щи', 'Сырный суп', 'Гороховый суп', 'Рассольник', 'Окрошка'],
    [CATEGORIES.MAIN]: ['Картофельное пюре с котлетой', 'Пельмени', 'Манты', 'Гречка с мясом', 'Голубцы', 'Жаркое', 'Макароны по-флотски', 'Плов'],
    [CATEGORIES.SALAD]: ['Селедка под шубой', 'Оливье', 'Крабовый', 'Цезарь с курицей', 'Мимоза', 'Винегрет', 'Греческий салат', 'Салат из свежих овощей']
  };

  function generateId() {
    return Date.now() + Math.random() * 10000;
  }

  function normalizeDish(dish) {
    if (!dish.category) dish.category = Utils.guessCategory(dish.name);
    if (!dish.note) dish.note = '';
    if (dish.liked === undefined) dish.liked = false;
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
      cacheUnique = null;
      cacheRecs = null;
      cacheAllWithDone = null;
    } catch (e) {
      console.error('Ошибка сохранения данных:', e);
      showStorageError('блюда');
    }
    EventBus.emit(CONSTANTS.EVENTS.DISHES_CHANGED);
  }

  function init() {
    if (!load()) {
      const result = DEFAULT_DISHES.map((d, i) => ({ ...d, id: generateId() + i, liked: false, recipeId: null }));
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

  function editDishName(id, newName) {
    const dish = dishes.find(d => d.id === id);
    if (!dish) return false;
    dish.name = newName.trim();
    save();
    return true;
  }

  function updateNote(id, note) {
    const dish = dishes.find(d => d.id === id);
    if (!dish) return false;
    dish.note = note.trim();
    save();
    return true;
  }

  function getAll() { return dishes.slice(); }
  function getForDate(dateStr) { return dishes.filter(d => d.date === dateStr); }

  function addDish(name, status, date, category, liked = false, note = '', recipeId = null) {
    if (!name || !status || !date || !category) return false;
    const id = generateId();
    dishes.push({ id, name, status, date, category, liked, note, recipeId });
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

  function toggleLike(id) {
    const dish = dishes.find(d => d.id === id);
    if (!dish) return false;
    dish.liked = !dish.liked;
    save();
    return true;
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

  function getRecommendations() {
    if (cacheRecs) return cacheRecs;
    const doneDishes = dishes.filter(d => d.status === STATUSES.DONE);
    const map = {};
    doneDishes.forEach(d => {
      if (!map[d.name] || d.date > map[d.name]) {
        map[d.name] = { name: d.name, lastDate: d.date, liked: d.liked };
      }
    });
    const unique = Object.values(map);
    const likedItems = unique.filter(item => item.liked);
    const otherItems = unique.filter(item => !item.liked);
    likedItems.sort((a, b) => a.lastDate.localeCompare(b.lastDate));
    otherItems.sort((a, b) => a.lastDate.localeCompare(b.lastDate));
    const likedResult = likedItems.slice(0, 1);
    const othersResult = otherItems.slice(0, 3);
    const result = { liked: likedResult, others: othersResult };
    cacheRecs = result;
    return result;
  }

  function getFavorites() { return dishes.filter(d => d.liked); }
  function invalidateCache() { cacheUnique = null; cacheRecs = null; cacheAllWithDone = null; }
  function replaceAll(newDishes) {
    dishes = newDishes.map(normalizeDish);
    save();
    invalidateCache();
  }
  function getRandomDishFromTaste() {
    const categories = [CATEGORIES.SOUP, CATEGORIES.MAIN, CATEGORIES.SALAD];
    const cat = categories[Math.floor(Math.random() * categories.length)];
    const list = TASTE_DISHES[cat];
    const name = list[Math.floor(Math.random() * list.length)];
    return { name, category: cat, categoryLabel: CATEGORY_LABELS[cat] };
  }

  function setRecipeId(dishId, recipeId) {
    const dish = dishes.find(d => d.id === dishId);
    if (!dish) return false;
    dish.recipeId = recipeId;
    save();
    return true;
  }

  function updateDishDate(id, newDate) {
    const dish = dishes.find(d => d.id === id);
    if (!dish) return false;
    dish.date = newDate;
    save();
    return true;
  }

  return {
    init, editDishName, updateNote, getAll, getForDate, addDish, removeDish,
    toggleStatus, toggleLike, getAllUniqueWithLastDone,
    getRecommendations, getFavorites, invalidateCache, replaceAll,
    getRandomDishFromTaste, setRecipeId, updateDishDate
  };
})();
