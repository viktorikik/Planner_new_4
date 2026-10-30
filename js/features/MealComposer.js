/**
 * MealComposer — сборщик композиций для одного приема пищи.
 * 
 * v1.1 (v6.3.1):
 *   • Добавлена фильтрация по context.usedRecipeIds.
 *   • Улучшен выбор кандидатов.
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

    // 2. Исключаем уже использованные (если есть альтернативы)
    const usedIds = context.usedRecipeIds || new Set();
    const unusedCandidates = validCandidates.filter(c => !usedIds.has(c.id));
    
    // Если неиспользованных достаточно (больше 3), берем только их. Иначе берем всех.
    const pool = unusedCandidates.length >= 3 ? unusedCandidates : validCandidates;

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
      const mains = grouped.main;
      const sides = grouped.side;
      const salads = grouped.salad;

      if (soups.length > 0 && mains.length > 0) {
        compositions.push({ items: [pickRandom(soups), pickRandom(mains)], type: 'full_lunch' });
        if (salads.length > 0) {
          compositions.push({ items: [pickRandom(soups), pickRandom(mains), pickRandom(salads)], type: 'gourmet' });
        }
      }
      if (mains.length > 0 && sides.length > 0) {
        compositions.push({ items: [pickRandom(mains), pickRandom(sides)], type: 'main_with_side' });
      }
      if (mains.length > 0) {
        compositions.push({ items: [pickRandom(mains)], type: 'simple_main' });
      }
      if (salads.length > 0 && sides.length > 0) {
        compositions.push({ items: [pickRandom(salads), pickRandom(sides)], type: 'light' });
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
