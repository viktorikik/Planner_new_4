/**
 * RecommendationEngine — движок рекомендаций для экрана «Что приготовить?».
 *
 * v3 (v5.43):
 *   • Добавлен учёт истории последних 2 дней: штрафы за повтор
 *     типа белка, способа готовки и гарнира — та же логика,
 *     что и в MenuGenerator (автосборщик меню на неделю).
 *   • Работает только для items с recipeId: если у блюда нет
 *     привязанного рецепта, штраф не начисляется.
 *   • Для базовых правил (давно не готовили, любимое, mealType)
 *     поведение не изменилось.
 *
 * Зависит от: DishStore, RecipeStore, Utils.
 */
import { DishStore } from '../stores/DishStore.js';
import { RecipeStore } from '../stores/RecipeStore.js';
import { Utils } from '../utils/Utils.js';

export const RecommendationEngine = (function() {
  const WEIGHTS = {
    NEVER_COOKED: 50,
    DAYS_SINCE_MAX: 50,
    DAYS_SINCE_FACTOR: 2,
    LIKED: 30,
    MEAL_TYPE_MATCH: 20,
    MEAL_TYPE_ANY: 10,
    RANDOM_JITTER: 5
  };

  // v5.43: штрафы за повторение блюд из последних дней.
  // Подобраны так, чтобы не «убивать» хорошие блюда, но
  // предотвращать очевидные повторы (курица два дня подряд и т.п.).
  const REPEAT_PENALTIES = {
    SAME_PROTEIN_YESTERDAY: 25,
    SAME_METHOD_YESTERDAY: 12,
    SAME_BASE_YESTERDAY: 18,
    SAME_PROTEIN_DAY_BEFORE: 10
  };

  function daysSince(dateStr) {
    const then = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = Math.floor((now - then) / (1000 * 60 * 60 * 24));
    return diff < 0 ? 0 : diff;
  }

  function pluralDays(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'день';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
    return 'дней';
  }

  function formatDaysAgo(n) {
    if (n === 0) return 'сегодня';
    if (n === 1) return 'вчера';
    return `${n} ${pluralDays(n)} назад`;
  }

  // Собираем теги блюд за последние N дней (по recipeId).
  function getRecentTags(daysBack) {
    const history = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i <= daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = Utils.formatDateLocal(d);
      const dishes = DishStore.getForDate(dateStr);
      dishes.forEach(dish => {
        if (!dish.recipeId) return;
        const recipe = RecipeStore.getById(dish.recipeId);
        if (recipe && recipe.tags) {
          history.push({ tags: recipe.tags, daysAgo: i });
        }
      });
    }
    return history;
  }

  // Штраф за повторение по истории последних дней.
  function calculateRepeatPenalty(item, history) {
    if (!item.recipeId || !history || history.length === 0) {
      return { penalty: 0, reasons: [] };
    }
    const recipe = RecipeStore.getById(item.recipeId);
    if (!recipe || !recipe.tags) {
      return { penalty: 0, reasons: [] };
    }

    const tags = recipe.tags;
    let penalty = 0;

    history.forEach(h => {
      const hTags = h.tags;
      if (!hTags) return;

      if (h.daysAgo === 1) {
        if (tags.proteinSource && hTags.proteinSource &&
            tags.proteinSource === hTags.proteinSource &&
            tags.proteinSource !== 'vegetarian') {
          penalty += REPEAT_PENALTIES.SAME_PROTEIN_YESTERDAY;
        }
        if (tags.cookingMethod && hTags.cookingMethod &&
            tags.cookingMethod === hTags.cookingMethod) {
          penalty += REPEAT_PENALTIES.SAME_METHOD_YESTERDAY;
        }
        if (tags.baseType && hTags.baseType &&
            tags.baseType === hTags.baseType &&
            tags.baseType !== 'none') {
          penalty += REPEAT_PENALTIES.SAME_BASE_YESTERDAY;
        }
      } else if (h.daysAgo === 2) {
        if (tags.proteinSource && hTags.proteinSource &&
            tags.proteinSource === hTags.proteinSource &&
            tags.proteinSource !== 'vegetarian') {
          penalty += REPEAT_PENALTIES.SAME_PROTEIN_DAY_BEFORE;
        }
      }
    });

    const reasons = penalty > 0 ? ['недавно было похожее'] : [];
    return { penalty, reasons };
  }

  function scoreItem(item, context, history) {
    let score = 0;
    const reasons = [];

    // 1. Давно не готовили
    if (!item.lastDoneDate) {
      score += WEIGHTS.NEVER_COOKED;
      reasons.push('ещё не готовили');
    } else {
      const days = daysSince(item.lastDoneDate);
      const bonus = Math.min(WEIGHTS.DAYS_SINCE_MAX, days * WEIGHTS.DAYS_SINCE_FACTOR);
      score += bonus;
      reasons.push(formatDaysAgo(days));
    }

    // 2. Любимое
    if (item.liked) {
      score += WEIGHTS.LIKED;
      reasons.push('👍 любимое');
    }

    // 3. Подходит под выбранный приём пищи
    if (context.mealType) {
      const types = Array.isArray(item.mealTypes) ? item.mealTypes : [];
      if (types.length === 0) {
        score += WEIGHTS.MEAL_TYPE_ANY;
      } else if (types.includes(context.mealType)) {
        score += WEIGHTS.MEAL_TYPE_MATCH;
      }
    }

    // 4. v5.43: штраф за повтор по истории последних дней
    const repeatResult = calculateRepeatPenalty(item, history);
    score -= repeatResult.penalty;
    if (repeatResult.reasons.length > 0) {
      reasons.push(...repeatResult.reasons);
    }

    // 5. Небольшой случайный шум
    score += Math.random() * WEIGHTS.RANDOM_JITTER;

    return { score, reasons };
  }

  function rank(items, context) {
    const ctx = context || {};
    // v5.43: история последних 2 дней (та же логика, что в MenuGenerator)
    const history = getRecentTags(2);

    const result = items.map(item => {
      const { score, reasons } = scoreItem(item, ctx, history);
      return { ...item, score, reasons };
    });
    result.sort((a, b) => b.score - a.score);
    return result;
  }

  return { rank };
})();
