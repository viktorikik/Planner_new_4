/**
 * MenuGenerator — оркестратор генерации меню.
 * 
 * v2.0 (v6.3.1):
 *   • Переход на композиции (MealComposer).
 *   • Новый формат возврата: { menu: { date: { mealType: { items: [] } } } }.
 *   • Удален старый расчет штрафов (перенесен в будущий MenuScoring).
 *   • Адаптирована функция getReplacement для работы с mealRole.
 */
import { RecipeStore } from '../stores/RecipeStore.js';
import { Utils } from '../utils/Utils.js';
import { MealComposer } from './MealComposer.js';

export const MenuGenerator = (function() {

  function formatDate(date) {
    return Utils.formatDateLocal(date);
  }

  function getShiftedDate(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return formatDate(d);
  }

  function generateMenu(options) {
    const {
      startDate = formatDate(new Date()),
      days = 7,
      mealTypes = ['breakfast', 'lunch', 'dinner'],
      fridgeIngredients = [],
      maxWeekdayTime = 40
    } = options;

    const allRecipes = RecipeStore.getAll().filter(r => !r.hidden && !r.disliked);
    if (allRecipes.length === 0) return { success: false, message: 'Нет доступных рецептов' };

    const resultMenu = {};
    const context = {
      usedRecipeIds: new Set(),
      fridgeMode: fridgeIngredients.length > 0,
      fridgeIngredients: fridgeIngredients.map(f => f.toLowerCase().replace(/ё/g, 'е').trim()),
      maxWeekdayTime,
      preferLightDinner: true // Настройка для ужина
    };

    for (let i = 0; i < days; i++) {
      const currentDate = getShiftedDate(startDate, i);
      const dateObj = new Date(currentDate);
      const dayOfWeek = dateObj.getDay();
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
      
      resultMenu[currentDate] = {};
      context.isWeekday = isWeekday;

      mealTypes.forEach(mealType => {
        // 1. Фильтруем блюда по приему пищи
        let candidates = allRecipes.filter(r => {
          if (!r.mealTypes || r.mealTypes.length === 0) return false; // Жесткий фильтр! Если пусто, не берем.
          return r.mealTypes.includes(mealType);
        });

        if (candidates.length === 0) {
          // Если совсем ничего нет, ставим заглушку (или пропускаем слот)
          resultMenu[currentDate][mealType] = { items: [] };
          return;
        }

        // 2. Запускаем композитор
        const compositions = MealComposer.composeMeal(mealType, candidates, context);
        
        // 3. Пока без оптимизатора просто берем случайную композицию
        const chosen = compositions[Math.floor(Math.random() * compositions.length)];

        // 4. Записываем в меню
        resultMenu[currentDate][mealType] = {
          items: chosen.items.map(item => ({
            id: item.id,
            name: item.name,
            category: item.category,
            mealRole: item.mealRole
          }))
        };

        // 5. Запоминаем использованные
        chosen.items.forEach(item => context.usedRecipeIds.add(item.id));
      });
    }

    return {
      success: true,
      menu: resultMenu
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

    // Ищем только те рецепты, которые подходят под этот прием пищи и роль
    let candidates = allRecipes.filter(r => {
      const matchesMeal = !r.mealTypes || r.mealTypes.length === 0 || r.mealTypes.includes(mealType);
      const matchesRole = r.mealRole === targetRole;
      return matchesMeal && matchesRole;
    });

    // Если не нашли по роли, ослабляем фильтр
    if (candidates.length === 0) {
      candidates = allRecipes.filter(r => !r.mealTypes || r.mealTypes.length === 0 || r.mealTypes.includes(mealType));
    }
    if (candidates.length === 0) candidates = allRecipes;

    // Исключаем те, что уже стоят в меню на этот день
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
