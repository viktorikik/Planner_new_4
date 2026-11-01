/**
 * @file MenuValidator.js
 * @version 1.0
 * @description Финальная проверка сгенерированного меню перед сохранением.
 * Проверяет жесткие ограничения (Hard Constraints) и мягкие правила композиции.
 * Возвращает статус (optimal, suboptimal, infeasible) и список предупреждений.
 * 
 * Зависимости:
 * - Constants.js (DIET_TYPES, MEAL_TYPES)
 * - UserPreferences.js (для доступа к настройкам, если не переданы)
 * 
 * Маркеры версий:
 * - v6.4.6: Создание модуля.
 */

import { DIET_TYPES } from '../utils/Constants.js';
import { UserPreferences } from '../stores/UserPreferences.js';

// Запрещенные слова для вегетарианцев (синхронизировано с MenuGenerator)
const VEGETARIAN_STOP_WORDS = [
  'мясо', 'фарш', 'курица', 'куриц', 'бедр', 'грудк', 'свинин', 'говядин', 'баранин',
  'кальмар', 'рыба', 'лосос', 'треск', 'сельд', 'тунец', 'креветк', 'мясной бульон'
];

export const MenuValidator = {
  /**
   * Проверяет меню на соответствие всем правилам.
   * @param {Object} menu - Объект меню { "2026-11-02": { lunch: { items: [] } } }
   * @param {Object} allRecipes - Полный список рецептов для проверки аллергенов и состава
   * @param {Object} prefs - Настройки пользователя (если не переданы, берутся из UserPreferences)
   * @returns {Object} { valid: boolean, status: string, errors: [], warnings: [] }
   */
  validate(menu, allRecipes, prefs = null) {
    const userPrefs = prefs || UserPreferences.get();
    const errors = [];
    const warnings = [];
    
    // Карта рецептов для быстрого поиска по ID
    const recipeMap = new Map();
    allRecipes.forEach(r => recipeMap.set(String(r.id), r));

    const dates = Object.keys(menu).sort();

    for (const date of dates) {
      const dayMeals = menu[date];
      const dayRecipeIds = new Set();
      let hasSoup = false;

      for (const mealType of Object.keys(dayMeals)) {
        const meal = dayMeals[mealType];
        if (!meal || !meal.items || meal.items.length === 0) continue;

        let mainCount = 0;
        let hasSideOrSalad = false;

        for (const item of meal.items) {
          const recipe = recipeMap.get(String(item.id));
          if (!recipe) {
            warnings.push(`[${date}/${mealType}] Рецепт с ID ${item.id} не найден в базе.`);
            continue;
          }

          // 1. Жесткие ограничения (Hard Constraints)
          // 1.1. Аллергены
          if (userPrefs.allergens && userPrefs.allergens.length > 0) {
            const recipeAllergens = recipe.allergens || [];
            const hasAllergen = recipeAllergens.some(a => userPrefs.allergens.includes(a));
            if (hasAllergen) {
              errors.push(`[${date}/${mealType}] "${recipe.name}" содержит аллерген из списка запрещенных.`);
            }
          }

          // 1.2. Диета (Вегетарианство / Веганство)
          if (userPrefs.diet === DIET_TYPES.VEGETARIAN || userPrefs.diet === DIET_TYPES.VEGAN) {
            const nameLower = recipe.name.toLowerCase();
            const ingText = (recipe.ingredients || []).map(i => (i.name || '').toLowerCase()).join(' ');
            const hasMeat = VEGETARIAN_STOP_WORDS.some(word => nameLower.includes(word) || ingText.includes(word));
            if (hasMeat) {
              errors.push(`[${date}/${mealType}] "${recipe.name}" не подходит для диеты (найдены запрещенные ингредиенты).`);
            }
            if (userPrefs.diet === DIET_TYPES.VEGAN) {
              const animalProducts = ['молоко', 'сыр', 'сливк', 'масло', 'яйц', 'мед', 'творог', 'сметан', 'кефир'];
              const hasAnimal = animalProducts.some(word => nameLower.includes(word) || ingText.includes(word));
              if (hasAnimal) {
                errors.push(`[${date}/${mealType}] "${recipe.name}" содержит продукты животного происхождения (для веганства).`);
              }
            }
          }

          // 2. Мягкие правила (Soft Constraints / Warnings)
          // 2.1. Подсчет ролей и дублей
          if (recipe.mealRole === 'main') mainCount++;
          if (recipe.mealRole === 'side' || recipe.mealRole === 'salad') hasSideOrSalad = true;
          if (recipe.mealRole === 'first_course') hasSoup = true;

          // 2.2. Дублирование ID в один день
          if (dayRecipeIds.has(String(recipe.id))) {
            warnings.push(`[${date}] Дублирование блюда "${recipe.name}" в один день.`);
          }
          dayRecipeIds.add(String(recipe.id));
        }

        // 2.3. Два вторых блюда в одном приеме
        if (mainCount > 1) {
          warnings.push(`[${date}/${mealType}] Два основных блюда (main) в одном приеме пищи.`);
        }

        // 2.4. Отсутствие гарнира (requiresSide)
        const hasRequiresSideMain = meal.items.some(item => {
          const r = recipeMap.get(String(item.id));
          return r && r.mealRole === 'main' && r.requiresSide === true;
        });
        
        if (hasRequiresSideMain && !hasSideOrSalad) {
          warnings.push(`[${date}/${mealType}] Блюдо требует гарнира (requiresSide: true), но гарнир или салат не добавлен.`);
        }
      }

      // 2.5. Два супа в один день
      if (hasSoup) {
        let soupCount = 0;
        Object.values(dayMeals).forEach(m => {
          if (!m || !m.items) return;
          m.items.forEach(item => {
            const r = recipeMap.get(String(item.id));
            if (r && r.mealRole === 'first_course') soupCount++;
          });
        });
        if (soupCount > 1) {
          warnings.push(`[${date}] Два супа (first_course) в один день.`);
        }
      }
    }

    // Формирование итогового статуса
    let status = 'optimal';
    if (errors.length > 0) {
      status = 'infeasible'; // Жесткие ограничения нарушены, меню нельзя сохранять
    } else if (warnings.length > 0) {
      status = 'suboptimal'; // Есть нарушения композиции, но меню рабочее
    }

    return {
      valid: errors.length === 0,
      status: status,
      errors: errors,
      warnings: warnings
    };
  }
};
