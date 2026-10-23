/**
 * RecipeStore — хранилище рецептов (схема v2).
 * Ключ localStorage: CONSTANTS.STORAGE_KEYS.RECIPES ('smartMenuRecipes_v2').
 * Автоматическая миграция из v1 при загрузке.
 * Зависит от: Constants, Utils, EventBus, notifications.
 *
 * v5.26 (Блок 6):
 *   • Поле hidden — для базовых рецептов, скрытых пользователем.
 *   • Поле comments — заметка/источник (уже в схеме, теперь сохраняется).
 *   • cloneFromBase(id) — копия базового рецепта в «Мои», без правки базы.
 *   • toggleHidden(id) — скрыть/вернуть базовый рецепт.
 */
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

  function normalizeIngredient(ing) {
    if (typeof ing === 'string') {
      const parsed = Utils.parseRecipeText(ing).ingredients;
      return parsed[0] || null;
    }
    if (!ing || typeof ing !== 'object') return null;
    const rawName = String(ing.name || '').trim();
    const name = Utils.cleanIngredientName(rawName);
    if (!name) return null;
    const amount = (typeof ing.amount === 'number' && isFinite(ing.amount)) ? ing.amount : null;
    return { name, amount, unit: ing.unit || null };
  }

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
      // v5.26: скрытый базовый рецепт. Пользовательские рецепты
      // не скрываются, но флаг безвредно висит и у них (false).
      hidden: !!safe.hidden,
      // v5.26: заметка/источник. Пустая строка = блок не показывается.
      comments: safe.comments != null ? String(safe.comments) : '',
      createdAt: safe.createdAt || new Date().toISOString()
    };
  }

  function migrateLegacyRecipe(oldRecipe) {
    return normalizeRecipe(oldRecipe);
  }

  // ============================================================
  // ЗАГРУЗКА И СОХРАНЕНИЕ
  // ============================================================

  function load() {
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

    if (LEGACY_KEY) {
      try {
        const savedV1 = localStorage.getItem(LEGACY_KEY);
        if (savedV1) {
          const parsedV1 = JSON.parse(savedV1);
          if (Array.isArray(parsedV1)) {
            recipes = parsedV1.map(migrateLegacyRecipe);
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
      return;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const current = JSON.stringify(recipes);
      if (stored !== current) {
        localStorage.setItem(STORAGE_KEY, current);
        console.log('Рецепты нормализованы при загрузке.');
      }
    } catch(e) {
      console.warn('Не удалось сохранить нормализованные рецепты', e);
    }
    EventBus.emit(CONSTANTS.EVENTS.RECIPES_CHANGED);
  }

  // ============================================================
  // ПУБЛИЧНЫЙ API
  // ============================================================

  function getAll() { return recipes.slice(); }
  function getById(id) { return recipes.find(r => r.id === id); }

  // Собирает эталонный словарь ингредиентов из всех рецептов.
  // Возвращает Map: нормализованное_имя -> оригинальное_имя.
  function getUniqueIngredientNames() {
    const map = new Map();
    recipes.forEach(recipe => {
      if (Array.isArray(recipe.ingredients)) {
        recipe.ingredients.forEach(ing => {
          if (ing && ing.name) {
            const cleaned = Utils.cleanIngredientName(ing.name);
            if (!cleaned) return;
            const key = cleaned.toLowerCase().replace(/ё/g, 'е');
            if (!map.has(key)) {
              map.set(key, cleaned);
            }
          }
        });
      }
    });
    return map;
  }

  function add(name, ingredients, instructions, category, extra = {}) {
    // v5.26: пользовательский рецепт по умолчанию не базовый.
    // extra.builtIn === true приходит только из импорта базы.
    const recipe = normalizeRecipe({
      id: generateId(),
      name,
      ingredients,
      instructions: instructions || '',
      category: category || Utils.guessCategory(name),
      builtIn: false,
      hidden: false,
      ...extra,
      createdAt: new Date().toISOString()
    });
    recipes.push(recipe);
    save();
    return recipe;
  }

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

  // v5.26: скрыть/вернуть базовый рецепт. Применяется только к базовым,
  // но функция не проверяет builtIn — вызывающая сторона (Recipes.js)
  // уже различает сценарии. Возвращает новое значение hidden или false.
  function toggleHidden(id) {
    const recipe = getById(id);
    if (!recipe) return false;
    recipe.hidden = !recipe.hidden;
    save();
    return recipe.hidden;
  }

  // v5.26: копия базового рецепта в «Мои». База не меняется.
  // Имя — «<оригинал> (копия)». Лайки/дизлайки сбрасываются,
  // категория и всё содержимое наследуются.
  function cloneFromBase(id) {
    const base = getById(id);
    if (!base || !base.builtIn) return null;

    const copy = normalizeRecipe({
      ...base,
      id: generateId(),
      name: base.name + ' (копия)',
      builtIn: false,
      hidden: false,
      liked: false,
      disliked: false,
      createdAt: new Date().toISOString()
    });
    recipes.push(copy);
    save();
    return copy;
  }

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

  function isRecipeNameDisliked(name) {
    for (let i = recipes.length - 1; i >= 0; i--) {
      const r = recipes[i];
      if (r.name !== name) continue;
      if (r.liked || r.disliked) return !!r.disliked;
    }
    return false;
  }

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
    toggleHidden,     // v5.26
    cloneFromBase,    // v5.26
    isRecipeNameDisliked,
    replaceAll,
    migrateLegacyRecipe,
    getUniqueIngredientNames
  };
})();
