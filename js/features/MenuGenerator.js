/**
 * MenuGenerator — точка входа и оркестратор генерации.
 * 
 * v3.0 (v6.3.2):
 *   • Вызов MenuOptimizer.generateOptimizedMenu.
 *   • Возврат результата с оценкой (score).
 *   • getReplacement работает через контекст.
 */
import { RecipeStore } from '../stores/RecipeStore.js';
import { Utils } from '../utils/Utils.js';
import { MenuOptimizer } from './MenuOptimizer.js';

export const MenuGenerator = (function() {

  function formatDate(date) {
    return Utils.formatDateLocal(date);
  }

  function generateMenu(options) {
    const {
      startDate = formatDate(new Date()),
      days = 7,
      mealTypes = ['breakfast', 'lunch', 'dinner'],
      maxWeekdayTime = 40
    } = options;

    const allRecipes = RecipeStore.getAll().filter(r => !r.hidden && !r.disliked);
    if (allRecipes.length === 0) return { success: false, message: 'Нет доступных рецептов' };

    // Запускаем оптимизатор
    const result = MenuOptimizer.generateOptimizedMenu(options, allRecipes);
    
    return {
      success: true,
      menu: result.menu,
      score: result.score // Передаем оценку в main.js для отображения
    };
  }

  // ============================================================
  // ЗАМЕНА ОДНОГО БЛЮДА (Reroll)
  // ============================================================
  function getReplacement(currentRecipeId, targetDate, mealType, currentMenu, options) {
    const allRecipes = RecipeStore.getAll().filter(r => !r.hidden && !r.disliked && String(r.id) !== String(currentRecipeId));
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
    getReplacement
  };
})();
