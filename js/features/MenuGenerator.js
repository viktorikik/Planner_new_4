/**
 * MenuGenerator — точка входа и оркестратор генерации.
 * 
 * v3.3 (v6.4.2):
 *   • Расширен список VEGETARIAN_STOP_WORDS (корни слов: фарш, бедр, кальмар и т.д.).
 * 
 * v3.2 (v6.4.1):
 *   • Добавлен глубокий текстовый фильтр на мясо/рыбу/молочку для вегетарианцев.
 * 
 * v3.1 (v6.4.0):
 *   • Фильтрация рецептов по UserPreferences.
 */
import { RecipeStore } from '../stores/RecipeStore.js';
import { UserPreferences } from '../stores/UserPreferences.js';
import { Utils } from '../utils/Utils.js';
import { MenuOptimizer } from './MenuOptimizer.js';
import { DIET_TYPES } from '../utils/Constants.js';

export const MenuGenerator = (function() {

  function formatDate(date) {
    return Utils.formatDateLocal(date);
  }

  // v6.4.2: Расширенный список корней для жесткого отсева
  const VEGETARIAN_STOP_WORDS = [
    'мяс', 'фарш', 'куриц', 'курин', 'бедр', 'голен', 'окорочк', 'цыплен',
    'говяд', 'свин', 'телятин', 'баранин', 'индейк', 'кролик', 'утка', 'гусь',
    'рыб', 'лосос', 'форел', 'треск', 'кревет', 'кальмар', 'миди', 'краб',
    'сельд', 'тунец', 'горбуш', 'семг', 'сёмг', 'кета', 'кижуч', 'пикша',
    'окунь', 'судак', 'щука', 'сом', 'налим', 'осётр', 'пангасиус', 'тилапия',
    'дорада', 'сибас', 'ставрида', 'скумбрия', 'макрель', 'шпроты', 'килька',
    'бекон', 'колбас', 'сосиск', 'сардельк', 'окорок', 'ветчин', 'сало', 
    'печень', 'сердце', 'почки', 'бульон мясн', 'бульон курин'
  ];

  const VEGAN_EXTRA_STOP_WORDS = [
    'молок', 'сливк', 'сыр', 'творог', 'яйц', 'масло сливочн', 'мед', 'мёд', 
    'сметан', 'кефир', 'йогурт', 'ряженка', 'маргарин', 'сгущёнка'
  ];

  // v6.4.1: Проверка рецепта на соответствие жестким ограничениям
  function isRecipeAllowed(recipe, prefs) {
    // 1. Аллергены
    if (prefs.allergens && prefs.allergens.length > 0) {
      const hasAllergen = recipe.allergens && recipe.allergens.some(a => prefs.allergens.includes(a));
      if (hasAllergen) return false;
    }

    // 2. Острота
    if (recipe.spiciness && recipe.spiciness > prefs.maxSpiciness) {
      return false;
    }

    // 3. Сложность
    if (recipe.difficulty && recipe.difficulty > prefs.maxDifficulty) {
      return false;
    }

    // 4. Стоп-ингредиенты
    if (prefs.stopIngredients && prefs.stopIngredients.length > 0) {
      const nameLower = recipe.name.toLowerCase();
      if (prefs.stopIngredients.some(stop => nameLower.includes(stop.toLowerCase()))) return false;
      
      if (recipe.ingredients) {
        const hasStopIngredient = recipe.ingredients.some(ing => {
          const name = ing.name.toLowerCase();
          return prefs.stopIngredients.some(stop => name.includes(stop.toLowerCase()));
        });
        if (hasStopIngredient) return false;
      }
    }

    // 5. Диета (v6.4.1: Глубокий текстовый фильтр)
    if (prefs.diet === DIET_TYPES.VEGETARIAN || prefs.diet === DIET_TYPES.VEGAN) {
      const nameLower = recipe.name.toLowerCase();
      
      // Проверка названия
      if (VEGETARIAN_STOP_WORDS.some(w => nameLower.includes(w))) return false;
      if (prefs.diet === DIET_TYPES.VEGAN && VEGAN_EXTRA_STOP_WORDS.some(w => nameLower.includes(w))) return false;

      // Проверка ингредиентов
      if (recipe.ingredients) {
        for (const ing of recipe.ingredients) {
          const ingName = ing.name.toLowerCase();
          if (VEGETARIAN_STOP_WORDS.some(w => ingName.includes(w))) return false;
          if (prefs.diet === DIET_TYPES.VEGAN && VEGAN_EXTRA_STOP_WORDS.some(w => ingName.includes(w))) return false;
        }
      }
      
      // Проверка тегов на всякий случай
      if (recipe.tags && recipe.tags.proteinSource) {
        const src = recipe.tags.proteinSource;
        if (['meat', 'fish', 'poultry', 'seafood'].includes(src)) return false;
        if (prefs.diet === DIET_TYPES.VEGAN && ['dairy', 'eggs'].includes(src)) return false;
      }
    }

    return true;
  }

  function generateMenu(options) {
    const {
      startDate = formatDate(new Date()),
      days = 7,
      mealTypes = ['breakfast', 'lunch', 'dinner'],
      maxWeekdayTime = 40
    } = options;

    const prefs = UserPreferences.get();

    let allRecipes = RecipeStore.getAll().filter(r => !r.hidden && !r.disliked);
    
    // v6.4.0: Применяем глобальные ограничения
    allRecipes = allRecipes.filter(r => isRecipeAllowed(r, prefs));

    if (allRecipes.length === 0) {
      return { 
        success: false, 
        message: 'Все рецепты отсеяны вашими ограничениями. Попробуйте ослабить фильтры (аллергены, стоп-ингредиенты, диета).' 
      };
    }

    // Запускаем оптимизатор
    const result = MenuOptimizer.generateOptimizedMenu(options, allRecipes);
    
    return {
      success: true,
      menu: result.menu,
      score: result.score
    };
  }

  // ============================================================
  // ЗАМЕНА ОДНОГО БЛЮДА (Reroll)
  // ============================================================
  function getReplacement(currentRecipeId, targetDate, mealType, currentMenu, options) {
    const prefs = UserPreferences.get();
    
    // Отфильтровываем по ограничениям
    let allRecipes = RecipeStore.getAll()
      .filter(r => !r.hidden && !r.disliked && String(r.id) !== String(currentRecipeId))
      .filter(r => isRecipeAllowed(r, prefs));

    if (allRecipes.length === 0) return null;

    const currentRecipe = RecipeStore.getById(currentRecipeId);
    const targetRole = options.mealRole || (currentRecipe ? currentRecipe.mealRole : 'main');

    let candidates = allRecipes.filter(r => {
      const matchesMeal = !r.mealTypes || r.mealTypes.length === 0 || r.mealTypes.includes(mealType);
      const matchesRole = r.mealRole === targetRole;
      return matchesMeal && matchesRole;
    });

    if (candidates.length === 0) {
      candidates = allRecipes.filter(r => !r.mealTypes || r.mealTypes.length === 0 || r.mealTypes.includes(mealType));
    }
    if (candidates.length === 0) candidates = allRecipes;

    const dayDishes = currentMenu[targetDate] ? Object.values(currentMenu[targetDate]).flatMap(c => c.items || []) : [];
    const usedIds = new Set(dayDishes.map(d => String(d.id)));
    
    const unusedCandidates = candidates.filter(r => !usedIds.has(String(r.id)));
    const pool = unusedCandidates.length > 0 ? unusedCandidates : candidates;

    const best = pool[Math.floor(Math.random() * pool.length)];
    
    return {
      id: best.id,
      name: best.name,
      category: best.category,
      mealRole: best.mealRole,
      requiresSide: best.requiresSide
    };
  }

  return {
    generateMenu,
    getReplacement,
    isRecipeAllowed
  };
})();
