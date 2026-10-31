/**
 * MealComposer — сборщик композиций для одного приема пищи.
 * 
 * v1.4 (v6.4.2):
 *   • Если нет основных блюд (main), гарниры (side) и салаты (salad) повышаются до main.
 * 
 * v1.3 (v6.4.2):
 *   • Поддержка поля requiresSide (гарнир добавляется только если true).
 *   • Усиленная защита от дублей внутри дня.
 * 
 * v1.2 (v6.3.4):
 *   • Учет recentRecipeIds (история 10 дней).
 *   • Гарнир (side) теперь обязателен, если есть второе (main).
 *   • Приоритетная фильтрация кандидатов (не из истории, не использованные).
 */

export const MealComposer = (function() {

  const COMPOSITION_RULES = {
    breakfast: {
      minItems: 1, maxItems: 2,
      requiredRoles: ['main'], optionalRoles: ['dessert']
    },
    lunch: {
      minItems: 1, maxItems: 3,
      requiredRoles: ['main'], optionalRoles: ['first_course', 'side', 'salad']
    },
    dinner: {
      minItems: 1, maxItems: 3,
      requiredRoles: ['main'], optionalRoles: ['first_course', 'side', 'salad']
    },
    snack: {
      minItems: 1, maxItems: 2,
      requiredRoles: ['snack'], optionalRoles: ['dessert']
    }
  };

  function groupByRole(recipes) {
    const groups = { first_course: [], main: [], side: [], salad: [], snack: [], dessert: [], complement: [] };
    recipes.forEach(r => {
      const role = r.mealRole || 'complement';
      if (!groups[role]) groups[role] = [];
      groups[role].push(r);
    });
    return groups;
  }

  function isCompatible(recipe, mealType, context) {
    if (context.isWeekday && recipe.activeTime) {
      if (recipe.activeTime > context.maxWeekdayTime) return false;
    }
    if (mealType === 'dinner' && recipe.isHeavy && context.preferLightDinner) {
      return false;
    }
    return true;
  }

  function pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function composeMeal(mealType, candidates, context = {}) {
    const rule = COMPOSITION_RULES[mealType];
    if (!rule) return [{ items: [candidates[0]] }];

    // 1. Фильтруем по Hard Constraints
    let validCandidates = candidates.filter(c => isCompatible(c, mealType, context));
    if (validCandidates.length === 0) validCandidates = candidates; // fallback

    // 2. Исключаем недавние (история) и уже использованные (включая текущий день)
    const usedIds = context.usedRecipeIds || new Set();
    const recentIds = context.recentRecipeIds || new Set();
    
    // Приоритет 1: Не из истории и не использованные
    let pool = validCandidates.filter(c => !usedIds.has(c.id) && !recentIds.has(String(c.id)));
    
    // Приоритет 2: Просто не использованные
    if (pool.length < 3) {
      pool = validCandidates.filter(c => !usedIds.has(c.id));
    }
    
    // Приоритет 3: Все
    if (pool.length === 0) {
      pool = validCandidates;
    }

    const grouped = groupByRole(pool);
    const compositions = [];

    // --- Завтрак ---
    if (mealType === 'breakfast') {
      const mains = grouped.main;
      const desserts = grouped.dessert;
      if (mains.length > 0) {
        compositions.push({ items: [pickRandom(mains)], type: 'simple' });
        if (desserts.length > 0) {
          compositions.push({ items: [pickRandom(mains), pickRandom(desserts)], type: 'extended' });
        }
      }
    }

    // --- Обед / Ужин ---
    if (mealType === 'lunch' || mealType === 'dinner') {
      const soups = grouped.first_course;
      let mains = grouped.main;
      const sides = grouped.side;
      const salads = grouped.salad;

      // v6.4.2: Если нет вторых блюд (например, у вегетарианцев), 
      // повышаем гарниры и салаты до статуса основного блюда.
      if (mains.length === 0) {
        mains = [...sides, ...salads];
      }

      if (mains.length > 0) {
        const main = pickRandom(mains);
        
        if (main) {
          const items = [main];
          
          // v6.4.2: Проверяем requiresSide
          if (main.requiresSide === true && sides.length > 0) {
            const side = pickRandom(sides.filter(s => s.id !== main.id));
            if (side) items.push(side);
          }
          
          compositions.push({ items: [...items], type: 'main_with_side' });
          
          if (salads.length > 0) {
            const salad = pickRandom(salads.filter(s => s.id !== main.id));
            if (salad) compositions.push({ items: [...items, salad], type: 'full' });
          }
          if (soups.length > 0) {
            const soup = pickRandom(soups.filter(s => s.id !== main.id));
            if (soup) compositions.push({ items: [soup, ...items], type: 'full_lunch' });
          }
        }
      }

      if (soups.length > 0 && salads.length > 0) {
        compositions.push({ items: [pickRandom(soups), pickRandom(salads)], type: 'soup_and_salad' });
      }
      if (soups.length > 0) {
        compositions.push({ items: [pickRandom(soups)], type: 'soup_only' });
      }
    }

    if (compositions.length === 0) {
      return [{ items: [pickRandom(pool)], type: 'fallback' }];
    }

    return compositions;
  }

  return { composeMeal };
})();
