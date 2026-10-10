// ============================================================
// Движок рекомендаций для экрана «Что приготовить?».
// Считает score для каждого элемента (блюда или рецепта) и
// возвращает отсортированный список — от более желанного к менее.
// Никакого машинного обучения: простая сумма баллов, чтобы
// поведение было предсказуемым и его можно было объяснить словами.
//
// v2 (Блок 2 · подэтап 2.2):
//   Движок больше не знает, блюдо это или рецепт. Он работает с
//   универсальным «item» — объект с уже подготовленными полями.
//   Кто и как их готовит (Renderer) — не его забота.
//   Это позволяет ранжировать и блюда, и рецепты одним и тем же кодом.
// ============================================================

export const RecommendationEngine = (function() {
  // Веса факторов. Подобраны «на глаз» — если после недели использования
  // что-то будет казаться неправильным, правим здесь, в одном месте.
  //
  // «Ещё не готовили» и «давно не готовили» — самые сильные факторы,
  // чтобы список не зацикливался на одном и том же. «Любимое» — второй
  // по силе. «Подходит под приём пищи» — третий.
  const WEIGHTS = {
    NEVER_COOKED: 50,       // никогда не готовили — максимальный бонус
    DAYS_SINCE_MAX: 50,     // потолок за «давность» (дальше не растёт)
    DAYS_SINCE_FACTOR: 2,   // 1 день = +2, 25 дней = +50
    LIKED: 30,              // есть 👍 хоть где-то
    MEAL_TYPE_MATCH: 20,    // блюдо помечено именно этим приёмом пищи
    MEAL_TYPE_ANY: 10,      // пустой mealTypes = «подходит ко всему»
    RANDOM_JITTER: 5        // небольшой шум, чтобы разорвать связи
  };

  // Сколько дней прошло с даты (в формате YYYY-MM-DD).
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

  // Считает score одного элемента и собирает список коротких причин —
  // их потом показываем в карточке результата.
  //
  // item: {
  //   name,
  //   lastDoneDate,   // 'YYYY-MM-DD' или null («ещё не готовили»)
  //   liked,          // boolean
  //   disliked,       // boolean (не участвует в score — используется снаружи)
  //   mealTypes       // массив строк из MEAL_TYPES
  // }
  // context: { mealType: string|null }
  function scoreItem(item, context) {
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

    // 2. Любимое — берётся прямо из item.
    //    Для блюда сюда кладётся «хоть одна запись с 👍» (готовит Renderer).
    //    Для рецепта — recipe.liked.
    if (item.liked) {
      score += WEIGHTS.LIKED;
      reasons.push('👍 любимое');
    }

    // 3. Подходит под выбранный приём пищи.
    //    Это добавляет только балл, но НЕ причину: пользователь сам
    //    выбрал фильтр, значит и так знает, зачем ему эти элементы.
    if (context.mealType) {
      const types = Array.isArray(item.mealTypes) ? item.mealTypes : [];
      if (types.length === 0) {
        score += WEIGHTS.MEAL_TYPE_ANY;
      } else if (types.includes(context.mealType)) {
        score += WEIGHTS.MEAL_TYPE_MATCH;
      }
    }

    // 4. Небольшой случайный шум — чтобы при равных score порядок
    //    не был всегда одинаковым. Не перебивает основные факторы.
    score += Math.random() * WEIGHTS.RANDOM_JITTER;

    return { score, reasons };
  }

  // Публичная функция. Принимает список items и контекст,
  // возвращает копию списка с полями score и reasons, отсортированную
  // по убыванию score.
  function rank(items, context) {
    const ctx = context || {};
    const result = items.map(item => {
      const { score, reasons } = scoreItem(item, ctx);
      return { ...item, score, reasons };
    });
    result.sort((a, b) => b.score - a.score);
    return result;
  }

  return { rank };
})();
