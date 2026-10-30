/**
 * MealComposer — сборщик композиций для одного приема пищи.
 * 
 * v1.0 (v6.3.0):
 *   • Гибкая композиция: от 1 до 3 блюд (Суп + Основное + Салат).
 *   • Учет ролей блюд (mealRole).
 *   • Проверка совместимости (не ставим два супа или два горячих).
 *   • Учет времени готовки (для будней).
 *   • Работает как генератор вариантов для оптимизатора.
 */

export const MealComposer = (function() {

  // Конфигурация правил композиции
  const COMPOSITION_RULES = {
    breakfast: {
      minItems: 1,
      maxItems: 2,
      requiredRoles: ['main'], // Основное блюдо (каша, омлет, сырники)
      optionalRoles: ['dessert'] // Может быть выпечка/десерт
    },
    lunch: {
      minItems: 1,
      maxItems: 3,
      requiredRoles: ['main'], // Обязательно что-то сытное
      optionalRoles: ['first_course', 'side', 'salad'] // Может быть суп, гарнир, салат
    },
    dinner: {
      minItems: 1,
      maxItems: 3,
      requiredRoles: ['main'], 
      optionalRoles: ['first_course', 'side', 'salad']
    },
    snack: {
      minItems: 1,
      maxItems: 2,
      requiredRoles: ['snack'], // Закуски, перекусы
      optionalRoles: ['dessert']
    }
  };

  // ============================================================
  // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  // ============================================================
  
  // Группируем рецепты по ролям для быстрого доступа
  function groupByRole(recipes) {
    const groups = {
      first_course: [],
      main: [],
      side: [],
      salad: [],
      snack: [],
      dessert: [],
      complement: []
    };
    
    recipes.forEach(r => {
      const role = r.mealRole || 'complement';
      if (!groups[role]) groups[role] = [];
      groups[role].push(r);
    });
    
    return groups;
  }

  // Проверка, подходит ли блюдо под ограничения (время, тяжесть)
  function isCompatible(recipe, mealType, context) {
    // 1. Проверка времени для будней
    if (context.isWeekday && recipe.activeTime) {
      if (recipe.activeTime > context.maxWeekdayTime) return false;
    }
    
    // 2. Ужин не должен быть слишком тяжелым
    if (mealType === 'dinner' && recipe.isHeavy && context.preferLightDinner) {
      return false;
    }
    
    return true;
  }

  // Выбор случайного элемента из массива (для разнообразия)
  function pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ============================================================
  // ОСНОВНАЯ ЛОГИКА СБОРКИ
  // ============================================================

  /**
   * Собирает варианты композиций для конкретного приема пищи.
   * @param {string} mealType - 'breakfast', 'lunch', 'dinner', 'snack'
   * @param {Array} candidates - Массив рецептов, подходящих под этот прием пищи
   * @param {Object} context - Настройки (isWeekday, maxWeekdayTime)
   * @returns {Array} Массив объектов композиций: [{ items: [recipe1, recipe2], role: 'standard' }]
   */
  function composeMeal(mealType, candidates, context = {}) {
    const rule = COMPOSITION_RULES[mealType];
    if (!rule) return [{ items: candidates.slice(0, 1) }]; // Fallback

    // 1. Фильтруем кандидатов по Hard Constraints (время, тяжесть)
    const validCandidates = candidates.filter(c => isCompatible(c, mealType, context));
    if (validCandidates.length === 0) return []; // Нет подходящих рецептов

    const grouped = groupByRole(validCandidates);
    const compositions = [];

    // ============================================================
    // ЛОГИКА ДЛЯ ЗАВТРАКА
    // ============================================================
    if (mealType === 'breakfast') {
      const mains = grouped.main;
      const desserts = grouped.dessert;

      if (mains.length > 0) {
        // Вариант 1: Просто основное блюдо (сырники, омлет)
        compositions.push({ items: [pickRandom(mains)], type: 'simple' });
        
        // Вариант 2: Основное + десерт/выпечка (если есть)
        if (desserts.length > 0 && rule.maxItems > 1) {
          compositions.push({ 
            items: [pickRandom(mains), pickRandom(desserts)], 
            type: 'extended' 
          });
        }
      }
      return compositions;
    }

    // ============================================================
    // ЛОГИКА ДЛЯ ОБЕДА И УЖИНА (LUNCH / DINNER)
    // ============================================================
    if (mealType === 'lunch' || mealType === 'dinner') {
      const soups = grouped.first_course;
      const mains = grouped.main;
      const sides = grouped.side;
      const salads = grouped.salad;

      // ВАРИАНТ А: "Полный обед" (Суп + Основное)
      if (soups.length > 0 && mains.length > 0) {
        compositions.push({
          items: [pickRandom(soups), pickRandom(mains)],
          type: 'full_lunch'
        });
        
        // А если есть еще и салат — "Гурманский" вариант
        if (salads.length > 0) {
          compositions.push({
            items: [pickRandom(soups), pickRandom(mains), pickRandom(salads)],
            type: 'gourmet'
          });
        }
      }

      // ВАРИАНТ Б: "Второе с гарниром" (Основное + Гарнир)
      if (mains.length > 0 && sides.length > 0) {
        compositions.push({
          items: [pickRandom(mains), pickRandom(sides)],
          type: 'main_with_side'
        });
      }

      // ВАРИАНТ В: "Быстрый ужин" (Только основное или только салат)
      if (mains.length > 0) {
        compositions.push({
          items: [pickRandom(mains)],
          type: 'simple_main'
        });
      }

      // ВАРИАНТ Г: "Легкий ужин" (Салат + Гарнир)
      if (salads.length > 0 && sides.length > 0) {
        compositions.push({
          items: [pickRandom(salads), pickRandom(sides)],
          type: 'light'
        });
      }

      // ВАРИАНТ Д: "Только суп" (Если больше ничего нет или это легкий ужин)
      if (soups.length > 0) {
        compositions.push({
          items: [pickRandom(soups)],
          type: 'soup_only'
        });
      }
    }

    // Если ничего не собрали (например, нет main'ов, только закуски), 
    // берем случайное блюдо, чтобы не оставить слот пустым.
    if (compositions.length === 0) {
      return [{ items: [pickRandom(validCandidates)], type: 'fallback' }];
    }

    return compositions;
  }

  return {
    composeMeal
  };
})();
