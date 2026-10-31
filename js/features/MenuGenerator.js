/**
 * MenuGenerator — точка входа и оркестратор генерации.
 * 
 * v3.1 (v6.4.0):
 *   • Фильтрация рецептов по UserPreferences (аллергены, острота, диета, стоп-ингредиенты).
 * 
 * v3.0 (v6.3.2):
 *   • Вызов MenuOptimizer.generateOptimizedMenu.
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

  // v6.4.0: Проверка рецепта на соответствие жестким ограничениям
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
    if (prefs.stopIngredients && prefs.stopIngredients.length > 0 && recipe.ingredients) {
      const hasStopIngredient = recipe.ingredients.some(ing => {
        const name = ing.name.toLowerCase();
        return prefs.stopIngredients.some(stop => name.includes(stop.toLowerCase()));
      });
      if (hasStopIngredient) return false;
    }

    // 5. Диета
    if (prefs.diet === DIET_TYPES.VEGETARIAN) {
      const meatSources = ['meat', 'fish', 'poultry', 'seafood'];
      if (recipe.tags && meatSources.includes(recipe.tags.proteinSource)) return false;
    } else if (prefs.diet === DIET_TYPES.VEGAN) {
      const animalSources = ['meat', 'fish', 'poultry', 'seafood', 'dairy', 'eggs'];
      if (recipe.tags && animalSources.includes(recipe.tags.proteinSource)) return false;
      // Дополнительная проверка по ингредиентам для веганов
      if (recipe.ingredients) {
        const animalWords = ['молоко', 'сливк', 'сыр', 'творог', 'сметан', 'яйц', 'мяс', 'куриц', 'рыб', 'масло сливочн', 'мед', 'мёд'];
        const hasAnimalWord = recipe.ingredients.some(ing => {
          const name = ing.name.toLowerCase();
          return animalWords.some(w => name.includes(w));
        });
        if (hasAnimalWord) return false;
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
        message: 'Все рецепты отсеяны вашими ограничениями. Попробуйте ослабить фильтры (аллергены, стоп-ингредиенты).' 
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
      mealRole: best.mealRole
    };
  }

  return {
    generateMenu,
    getReplacement,
    isRecipeAllowed // экспортируем для MenuValidator в будущем
  };
})();
