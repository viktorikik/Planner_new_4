/**
 * RecipeStore — хранилище рецептов (схема v2).
 * Ключ localStorage: CONSTANTS.STORAGE_KEYS.RECIPES ('smartMenuRecipes_v2').
 * Автоматическая миграция из v1 при загрузке.
 * Зависит от: Constants, Utils, EventBus, notifications.
 *
 * v5.46:
 *   • Добавлен метод restore(snapshot) для восстановления удалённого рецепта.
 */
import { CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { EventBus } from '../utils/EventBus.js';
import { showStorageError } from '../utils/notifications.js';

export const RecipeStore = (function() {
  const STORAGE_KEY = CONSTANTS.STORAGE_KEYS.RECIPES;
  const LEGACY_KEY = CONSTANTS.STORAGE_KEYS.RECIPES_LEGACY;
  const CATEGORY_MIGRATION_KEY = 'smartMenuCategoryMigration_v1';
  let recipes = [];

  function generateId() { return Date.now() + Math.random() * 10000; }

  // ============================================================
  // НОРМАЛИЗАЦИЯ РУССКИХ КЛЮЧЕЙ (v5.35)
  // ============================================================
  const RU_CATEGORY_MAP = {
    'суп': 'soup', 'супы': 'soup',
    'салат': 'salad', 'салаты': 'salad',
    'горячее блюдо': 'main', 'основное': 'main', 'основное блюдо': 'main', 'горячее': 'main',
    'гарнир': 'side_dish', 'гарниры': 'side_dish',
    'закуска': 'appetizer', 'закуски': 'appetizer',
    'выпечка': 'bakery',
    'десерт': 'dessert', 'десерты': 'dessert',
    'напиток': 'other', 'другое': 'other'
  };

  const RU_MEAL_MAP = {
    'завтрак': 'breakfast',
    'обед': 'lunch',
    'ужин': 'dinner',
    'перекус': 'snack',
    'десерт': 'snack'
  };

  const RU_ALLERGEN_MAP = {
    'молоко': 'milk', 'глютен': 'gluten', 'яйца': 'eggs', 'яйцо': 'eggs',
    'орехи': 'nuts', 'арахис': 'peanut', 'рыба': 'fish', 'соя': 'soy',
    'моллюски': 'molluscs', 'ракообразные': 'crustaceans', 'горчица': 'mustard',
    'кунжут': 'sesame', 'клубника': 'strawberry', 'сельдерей': 'celery', 'люпин': 'lupin'
  };

  const RU_DIFFICULTY_MAP = {
    'легко': 2, 'просто': 2, 'средне': 3, 'сложно': 4, 'очень сложно': 5
  };

  const RU_SPICINESS_MAP = {
    'не острое': 1, 'слегка остро': 2, 'средне остро': 3, 'остро': 4, 'очень остро': 5
  };

  function normalizeRussianKeys(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    const r = { ...raw };

    if (typeof r.category === 'string') {
      const lower = r.category.toLowerCase().trim();
      if (RU_CATEGORY_MAP[lower]) r.category = RU_CATEGORY_MAP[lower];
    }

    if (Array.isArray(r.mealTypes)) {
      r.mealTypes = r.mealTypes.map(m => {
        if (typeof m !== 'string') return m;
        const lower = m.toLowerCase().trim();
        return RU_MEAL_MAP[lower] || m;
      });
    }

    if (Array.isArray(r.allergens)) {
      r.allergens = r.allergens.map(a => {
        if (typeof a !== 'string') return a;
        const lower = a.toLowerCase().trim();
        return RU_ALLERGEN_MAP[lower] || a;
      });
    }

    if (typeof r.difficulty === 'string') {
      const lower = r.difficulty.toLowerCase().trim();
      if (RU_DIFFICULTY_MAP[lower]) r.difficulty = RU_DIFFICULTY_MAP[lower];
    }

    if (typeof r.spiciness === 'string') {
      const lower = r.spiciness.toLowerCase().trim();
      if (RU_SPICINESS_MAP[lower]) r.spiciness = RU_SPICINESS_MAP[lower];
    }

    return r;
  }

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
    const base = { kcal: null, protein: null, fat: null, carbs: null, fiber: null };
    if (!n || typeof n !== 'object') return base;
    ['kcal', 'protein', 'fat', 'carbs', 'fiber'].forEach(k => {
      if (typeof n[k] === 'number' && isFinite(n[k])) base[k] = n[k];
    });
    return base;
  }

  // ============================================================
  // АВТООПРЕДЕЛЕНИЕ ТЕГОВ (v5.40)
  // ============================================================
  function autoDetectTags(recipe) {
    const text = (
      (recipe.name || '') + ' ' + 
      (recipe.ingredients || []).map(i => i.name).join(' ')
    ).toLowerCase().replace(/ё/g, 'е');

    let tags = {
      proteinSource: 'vegetarian',
      proteinForm: 'none',
      cookingMethod: 'bake',
      baseType: 'none',
      nutritionProfile: 'balanced'
    };

    if (/куриц|куриное|цыплен|индейк|утк/.test(text)) tags.proteinSource = 'chicken';
    else if (/говяд|телятин|баранин/.test(text)) tags.proteinSource = 'beef';
    else if (/свинин|бекон|карбонад|ветчин/.test(text)) tags.proteinSource = 'pork';
    else if (/рыб|сельд|минтай|лосось|треск|тунец|скумбри/.test(text)) tags.proteinSource = 'fish';
    else if (/креветк|кальмар|краб|морепродукт|моллюск/.test(text)) tags.proteinSource = 'seafood';
    else if (/фарш/.test(text) && tags.proteinSource === 'vegetarian') tags.proteinSource = 'mixed';

    if (/фарш|котлет|тефтел|фрикадел/.test(text)) tags.proteinForm = 'minced';
    else if (/колбас|сосиск|сардельк/.test(text)) tags.proteinForm = 'processed';
    else if (tags.proteinSource !== 'vegetarian') tags.proteinForm = 'whole';

    if (recipe.category === 'salad' || /сырой|свеж/.test(text)) tags.cookingMethod = 'raw';
    else if (/запек|духовк|запекан/.test(text)) tags.cookingMethod = 'bake';
    else if (/туш|рагу|бигус|бигос|плов/.test(text)) tags.cookingMethod = 'stew';
    else if (/жар|обжар|сковород|шницель|блин/.test(text)) tags.cookingMethod = 'fry';
    else if (/вар|суп|бульон|паров/.test(text)) tags.cookingMethod = 'boil';

    if (/картоф|пюре/.test(text)) tags.baseType = 'potato';
    else if (/рис/.test(text)) tags.baseType = 'rice';
    else if (/макарон|паст|спагетти|лапш/.test(text)) tags.baseType = 'pasta';
    else if (/греч|булгур|перлов|круп|овсян|киноа/.test(text)) tags.baseType = 'grains';
    else if (/фасол|горох|чечевиц|нут/.test(text)) tags.baseType = 'legumes';
    else if (/овощ|капуст|кабач|брокколи|салат/.test(text)) tags.baseType = 'vegetables';

    if (recipe.category === 'salad' || tags.baseType === 'vegetables' || tags.baseType === 'legumes') {
      tags.nutritionProfile = 'high_fiber';
    } else if (tags.proteinSource !== 'vegetarian' && tags.baseType === 'none') {
      tags.nutritionProfile = 'high_protein';
    } else if (recipe.category === 'soup') {
      tags.nutritionProfile = 'light';
    }

    return tags;
  }

  // ============================================================
  // СБОРКА РЕЦЕПТА
  // ============================================================
  function normalizeRecipe(r) {
    const normalized = normalizeRussianKeys(r || {});
    const safe = normalized;
    
    const normIngredients = normalizeIngredients(safe.ingredients);
    
    const defaultTags = autoDetectTags({ 
      name: safe.name || '', 
      ingredients: normIngredients,
      category: safe.category || '' 
    });

    const finalTags = {
      ...defaultTags,
      ...(safe.tags || {}) 
    };

    return {
      id: safe.id != null ? String(safe.id) : String(generateId()),
      name: safe.name || '',
      ingredients: normIngredients,
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
      tags: finalTags,
      liked: !!safe.liked,
      disliked: !!safe.disliked,
      builtIn: !!safe.builtIn,
      hidden: !!safe.hidden,
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

  function migrateCategoriesOnce() {
    try {
      if (localStorage.getItem(CATEGORY_MIGRATION_KEY) === '1') return;

      let changed = false;
      recipes.forEach(r => {
        if (r.category === 'other') {
          const guessed = Utils.guessCategory(r.name);
          if (guessed && guessed !== 'other') {
            r.category = guessed;
            changed = true;
          }
        }
      });

      if (changed) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
        } catch (e) {}
      }

      try {
        localStorage.setItem(CATEGORY_MIGRATION_KEY, '1');
      } catch (e) {}
    } catch (e) {}
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
      }
    } catch(e) {}

    migrateCategoriesOnce();

    EventBus.emit(CONSTANTS.EVENTS.RECIPES_CHANGED);
  }

  // ============================================================
  // СИНХРОНИЗАЦИЯ С СЕРВЕРОМ (v5.35)
  // ============================================================
  async function syncWithServer() {
    try {
      const response = await fetch(`recipes.json?v=${Date.now()}`);
      if (!response.ok) throw new Error('Файл recipes.json не найден');

      const serverRecipes = await response.json();
      const localRecipes = getAll();

      const hiddenBaseIds = new Set();
      localRecipes.forEach(r => {
        if (r.builtIn && r.hidden) {
          hiddenBaseIds.add(String(r.id));
        }
      });

      const normalizedServerRecipes = serverRecipes.map(r => {
        const normalized = normalizeRecipe(r);
        return {
          ...normalized,
          builtIn: true,
          hidden: hiddenBaseIds.has(String(normalized.id))
        };
      });

      const userRecipes = localRecipes.filter(r => !r.builtIn);
      replaceAll([...userRecipes, ...normalizedServerRecipes]);

      return true;
    } catch (error) {
      return false;
    }
  }

  // ============================================================
  // ПУБЛИЧНЫЙ API
  // ============================================================

  function getAll() { return recipes.slice(); }

  function getById(id) {
    if (id == null) return null;
    const idStr = String(id);
    return recipes.find(r => String(r.id) === idStr);
  }

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
    const idStr = String(id);
    const index = recipes.findIndex(r => String(r.id) === idStr);
    if (index === -1) return false;
    recipes.splice(index, 1);
    save();
    return true;
  }

  // v5.46: восстановление удалённого рецепта
  function restore(snapshot) {
    if (!snapshot || !snapshot.name) return false;
    
    // Проверяем, нет ли уже рецепта с таким ID
    const existing = getById(snapshot.id);
    const newId = existing ? generateId() : snapshot.id;
    
    const copy = normalizeRecipe({
      ...snapshot,
      id: newId
    });
    
    recipes.push(copy);
    save();
    return true;
  }

  function toggleHidden(id) {
    const recipe = getById(id);
    if (!recipe) return false;
    recipe.hidden = !recipe.hidden;
    save();
    return recipe.hidden;
  }

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
    syncWithServer,
    getAll,
    getById,
    add,
    update,
    remove,
    restore,
    toggleThumbUp,
    toggleThumbDown,
    toggleHidden,
    cloneFromBase,
    isRecipeNameDisliked,
    replaceAll,
    migrateLegacyRecipe,
    getUniqueIngredientNames
  };
})();
