import { CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { EventBus } from '../utils/EventBus.js';
import { showStorageError } from '../utils/notifications.js';

export const RecipeStore = (function() {
  const STORAGE_KEY = CONSTANTS.STORAGE_KEYS.RECIPES;
  const LEGACY_KEY = CONSTANTS.STORAGE_KEYS.RECIPES_LEGACY;
  let recipes = [];

  function generateId() { return Date.now() + Math.random() * 10000; }

  // ============================================================
  // НОРМАЛИЗАЦИЯ (схема v2)
  // ============================================================

  // Приводит ингредиент к объекту { name, amount, unit }.
  // Принимает и объект, и строку.
  function normalizeIngredient(ing) {
    if (typeof ing === 'string') {
      const parsed = Utils.parseRecipeText(ing).ingredients;
      return parsed[0] || null;
    }
    if (!ing || typeof ing !== 'object') return null;
    const name = String(ing.name || '').trim();
    if (!name) return null;
    const amount = (typeof ing.amount === 'number' && isFinite(ing.amount)) ? ing.amount : null;
    return { name, amount, unit: ing.unit || null };
  }

  // Приводит ингредиенты к массиву объектов.
  // Принимает: массив объектов, массив строк, одну строку (textarea).
  function normalizeIngredients(input) {
    if (Array.isArray(input)) {
      return input.map(normalizeIngredient).filter(Boolean);
    }
    if (typeof input === 'string') {
      return Utils.parseRecipeText(input).ingredients;
    }
    return [];
  }

  function normalizeNutrition(n) {
    const base = { kcal: null, protein: null, fat: null, carbs: null };
    if (!n || typeof n !== 'object') return base;
    ['kcal', 'protein', 'fat', 'carbs'].forEach(k => {
      if (typeof n[k] === 'number' && isFinite(n[k])) base[k] = n[k];
    });
    return base;
  }

  // Приводит запись рецепта к схеме v2. Дозаполняет отсутствующие поля.
  function normalizeRecipe(r) {
    const safe = r || {};
    return {
      id: safe.id != null ? safe.id : generateId(),
      name: safe.name || '',
      ingredients: normalizeIngredients(safe.ingredients),
      instructions: safe.instructions || '',
      category: safe.category || Utils.guessCategory(safe.name || ''),
      servings: (typeof safe.servings === 'number' && safe.servings > 0) ? safe.servings : 1,
      cookTime: (typeof safe.cookTime === 'number' && isFinite(safe.cookTime)) ? safe.cookTime : null,
      activeTime: (typeof safe.activeTime === 'number' && isFinite(safe.activeTime)) ? safe.activeTime : null,
      nutrition: normalizeNutrition(safe.nutrition),
      difficulty: (typeof safe.difficulty === 'number') ? safe.difficulty : null,
      spiciness: (typeof safe.spiciness === 'number') ? safe.spiciness : null,
      cuisine: safe.cuisine || null,
      allergens: Array.isArray(safe.allergens) ? safe.allergens.slice() : [],
      mealTypes: Array.isArray(safe.mealTypes) ? safe.mealTypes.slice() : [],
      liked: !!safe.liked,
      disliked: !!safe.disliked,
      builtIn: !!safe.builtIn,
      createdAt: safe.createdAt || new Date().toISOString()
    };
  }

  // Публичный хелпер миграции одной записи v1 → v2.
  // Используется при загрузке из localStorage и при импорте JSON-бэкапа.
  function migrateLegacyRecipe(oldRecipe) {
    return normalizeRecipe(oldRecipe);
  }

  // ============================================================
  // ЗАГРУЗКА И СОХРАНЕНИЕ
  // ============================================================

  function load() {
    // Попытка 1: актуальный ключ v2.
    try {
      const savedV2 = localStorage.getItem(STORAGE_KEY);
      if (savedV2) {
        const parsed = JSON.parse(savedV2);
        if (Array.isArray(parsed)) {
          recipes = parsed.map(normalizeRecipe);
          return true;
        }
      }
    } catch(e) {
      console.warn('Ошибка загрузки рецептов v2:', e);
    }

    // Попытка 2: старый ключ v1 → миграция.
    if (LEGACY_KEY) {
      try {
        const savedV1 = localStorage.getItem(LEGACY_KEY);
        if (savedV1) {
          const parsedV1 = JSON.parse(savedV1);
          if (Array.isArray(parsedV1)) {
            recipes = parsedV1.map(migrateLegacyRecipe);
            // Сохраняем мигрированные данные в v2.
            // Старый ключ НЕ удаляем — оставляем на случай отката.
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
            } catch(e) {
              console.error('Ошибка сохранения мигрированных рецептов:', e);
              showStorageError('рецепты');
            }
            console.log(`Рецепты мигрированы v1 → v2: ${recipes.length} записей`);
            return true;
          }
        }
      } catch(e) {
        console.warn('Ошибка миграции рецептов v1 → v2:', e);
      }
    }

    return false;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
    } catch(e) {
      console.error('Ошибка сохранения рецептов:', e);
      showStorageError('рецепты');
    }
    EventBus.emit(CONSTANTS.EVENTS.RECIPES_CHANGED);
  }

  function init() {
    if (!load()) {
      recipes = [];
      save();
    } else {
      EventBus.emit(CONSTANTS.EVENTS.RECIPES_CHANGED);
    }
  }

  // ============================================================
  // ПУБЛИЧНЫЙ API
  // ============================================================

  function getAll() { return recipes.slice(); }
  function getById(id) { return recipes.find(r => r.id === id); }

  // Добавляет рецепт.
  // ingredients — строка (textarea) ИЛИ массив объектов { name, amount, unit }.
  // extra — опциональный объект с новыми полями v2
  //         (servings, cookTime, activeTime, nutrition, difficulty,
  //          spiciness, cuisine, allergens, mealTypes, liked, disliked, builtIn).
  function add(name, ingredients, instructions, category, extra = {}) {
    const recipe = normalizeRecipe({
      id: generateId(),
      name,
      ingredients,
      instructions: instructions || '',
      category: category || Utils.guessCategory(name),
      ...extra,
      createdAt: new Date().toISOString()
    });
    recipes.push(recipe);
    save();
    return recipe;
  }

  // Обновляет рецепт. Переданные поля перезаписывают текущие.
  // Если аргумент === undefined — поле не меняется.
  function update(id, name, ingredients, instructions, category, extra = {}) {
    const recipe = getById(id);
    if (!recipe) return false;

    const updated = normalizeRecipe({
      ...recipe,
      name: name !== undefined ? name : recipe.name,
      ingredients: ingredients !== undefined ? ingredients : recipe.ingredients,
      instructions: instructions !== undefined ? instructions : recipe.instructions,
      category: category !== undefined ? category : recipe.category,
      ...extra
    });

    // Object.assign сохраняет идентичность объекта,
    // чтобы не сломать ссылки, если где-то уже держат recipe.
    Object.assign(recipe, updated);
    save();
    return true;
  }

  function remove(id) {
    const index = recipes.findIndex(r => r.id === id);
    if (index === -1) return false;
    recipes.splice(index, 1);
    save();
    return true;
  }

  // ---- Оценки 👍 / 👎 (для будущего источника «Из рецептов») ----

  function toggleThumbUp(id) {
    const recipe = getById(id);
    if (!recipe) return;
    if (recipe.liked) {
      recipe.liked = false;
    } else {
      recipe.liked = true;
      recipe.disliked = false;
    }
    save();
  }

  function toggleThumbDown(id) {
    const recipe = getById(id);
    if (!recipe) return;
    if (recipe.disliked) {
      recipe.disliked = false;
    } else {
      recipe.disliked = true;
      recipe.liked = false;
    }
    save();
  }

  // Смотрит на последнюю по порядку добавления запись с этой оценкой.
  // Возвращает true, если у последней оценённой записи с таким именем стоит 👎.
  function isRecipeNameDisliked(name) {
    for (let i = recipes.length - 1; i >= 0; i--) {
      const r = recipes[i];
      if (r.name !== name) continue;
      if (r.liked || r.disliked) return !!r.disliked;
    }
    return false;
  }

  // Заменяет все рецепты (для импорта). Данные прогоняются через normalizeRecipe.
  function replaceAll(newRecipes) {
    if (!Array.isArray(newRecipes)) return false;
    recipes = newRecipes.map(normalizeRecipe);
    save();
    return true;
  }

  return {
    init,
    getAll,
    getById,
    add,
    update,
    remove,
    toggleThumbUp,
    toggleThumbDown,
    isRecipeNameDisliked,
    replaceAll,
    migrateLegacyRecipe
  };
})();
