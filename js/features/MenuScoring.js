/**
 * MenuScoring — система оценки сгенерированного меню.
 * 
 * v1.0 (v6.3.2):
 *   • Оценка по 6 критериям (D, B, P, H, F, R).
 *   • Формула: S = 0.22D + 0.20B + 0.20P + 0.15H + 0.13F + 0.10R
 *   • Учет новых полей (flavorProfile, texture, isHeavy, isQuick, mealRole).
 */

export const MenuScoring = (function() {

  const WEIGHTS = {
    diversity: 0.22,
    balance: 0.20,
    practicality: 0.20,
    harmony: 0.15,
    preferences: 0.13,
    resourceEfficiency: 0.10
  };

  function scoreMenu(menu, context) {
    const days = Object.keys(menu);
    if (days.length === 0) return { total: 0, criteria: {} };

    // Собираем все блюда из меню для анализа
    const allItems = [];
    days.forEach(date => {
      Object.values(menu[date]).forEach(meal => {
        if (meal.items) {
          meal.items.forEach(item => allItems.push(item));
        }
      });
    });

    if (allItems.length === 0) return { total: 0, criteria: {} };

    // --- 1. Разнообразие (22%) ---
    // Штрафуем за повторы рецептов, источников белка и способов готовки
    const recipeCounts = {};
    const proteinCounts = {};
    const methodCounts = {};

    allItems.forEach(item => {
      recipeCounts[item.id] = (recipeCounts[item.id] || 0) + 1;
      if (item.tags) {
        if (item.tags.proteinSource) proteinCounts[item.tags.proteinSource] = (proteinCounts[item.tags.proteinSource] || 0) + 1;
        if (item.tags.cookingMethod) methodCounts[item.tags.cookingMethod] = (methodCounts[item.tags.cookingMethod] || 0) + 1;
      }
    });

    let diversityPenalty = 0;
    Object.values(recipeCounts).forEach(count => {
      if (count > 1) diversityPenalty += (count - 1) * 15; // Повтор рецепта — сильный штраф
    });
    Object.values(proteinCounts).forEach(count => {
      if (count > 2) diversityPenalty += (count - 2) * 5; // Повтор белка допустим, но не частый
    });
    Object.values(methodCounts).forEach(count => {
      if (count > 2) diversityPenalty += (count - 2) * 3; // Способы готовки разнообразнее
    });

    const diversityScore = Math.max(0, 100 - diversityPenalty);

    // --- 2. Сбалансированность (20%) ---
    // Проверяем наличие овощей/салатов в каждый день и отсутствие перегруза "тяжелыми" блюдами
    let daysWithoutVeggies = 0;
    let heavyDays = 0;

    days.forEach(date => {
      const dayItems = Object.values(menu[date]).flatMap(m => m.items || []);
      const hasVeggies = dayItems.some(i => i.mealRole === 'salad' || (i.tags && i.tags.baseType === 'vegetables'));
      if (!hasVeggies) daysWithoutVeggies++;
      
      const heavyCount = dayItems.filter(i => i.isHeavy).length;
      if (heavyCount > 1) heavyDays++;
    });

    const balancePenalty = (daysWithoutVeggies * 15) + (heavyDays * 10);
    const balanceScore = Math.max(0, 100 - balancePenalty);

    // --- 3. Практичность (20%) ---
    // Штрафуем, если в будний день суммарное время готовки слишком велико
    let practicalityPenalty = 0;
    days.forEach(date => {
      const dayItems = Object.values(menu[date]).flatMap(m => m.items || []);
      const totalActiveTime = dayItems.reduce((sum, i) => sum + (i.activeTime || 20), 0);
      const isWeekday = [1,2,3,4,5].includes(new Date(date).getDay());
      
      if (isWeekday && totalActiveTime > context.maxWeekdayTime * 1.5) {
        practicalityPenalty += (totalActiveTime - context.maxWeekdayTime) * 0.5;
      }
      
      const complexCount = dayItems.filter(i => i.difficulty >= 4).length;
      if (complexCount > 1) practicalityPenalty += 10;
    });
    const practicalityScore = Math.max(0, 100 - practicalityPenalty);

    // --- 4. Гармоничность (15%) ---
    // Оцениваем каждую композицию (обед, ужин) на логичность сочетаний
    let harmonyScoreSum = 0;
    let mealCount = 0;
    
    days.forEach(date => {
      Object.values(menu[date]).forEach(meal => {
        if (!meal.items || meal.items.length === 0) return;
        mealCount++;
        let mealHarmony = 100;
        
        const roles = meal.items.map(i => i.mealRole);
        const heavies = meal.items.filter(i => i.isHeavy).length;
        
        if (roles.filter(r => r === 'main').length > 1) mealHarmony -= 30; // Два вторых
        if (roles.filter(r => r === 'first_course').length > 1) mealHarmony -= 40; // Два супа
        if (roles.filter(r => r === 'salad').length > 1) mealHarmony -= 20; // Два салата
        if (heavies > 1) mealHarmony -= 25; // Слишком тяжело
        
        if (roles.includes('first_course') && roles.includes('main')) mealHarmony += 10; // Классика
        if (roles.includes('main') && roles.includes('side')) mealHarmony += 10; // Второе с гарниром
        
        harmonyScoreSum += Math.max(0, Math.min(100, mealHarmony));
      });
    });
    const harmonyScore = mealCount > 0 ? harmonyScoreSum / mealCount : 100;

    // --- 5. Предпочтения (13%) ---
    // Бонус за любимые блюда (liked)
    let likedCount = allItems.filter(i => i.liked).length;
    const preferencesScore = Math.min(100, (likedCount / Math.max(1, allItems.length)) * 100 * 2);

    // --- 6. Рациональное использование продуктов (10%) ---
    // Считаем, как часто ингредиенты повторяются в рамках меню (чтобы не покупать лишнего)
    const ingredientCounts = {};
    allItems.forEach(item => {
      if (item.ingredients) {
        item.ingredients.forEach(ing => {
          const name = ing.name.toLowerCase();
          ingredientCounts[name] = (ingredientCounts[name] || 0) + 1;
        });
      }
    });
    
    let resourcePenalty = 0;
    Object.values(ingredientCounts).forEach(count => {
      if (count === 1) resourcePenalty += 1; // Если ингредиент встретился 1 раз — его покупка неэффективна
    });
    const resourceScore = Math.max(0, 100 - (resourcePenalty * 2));

    // --- Итог ---
    const criteria = {
      diversity: diversityScore,
      balance: balanceScore,
      practicality: practicalityScore,
      harmony: harmonyScore,
      preferences: preferencesScore,
      resourceEfficiency: resourceScore
    };

    const total = 
      diversityScore * WEIGHTS.diversity +
      balanceScore * WEIGHTS.balance +
      practicalityScore * WEIGHTS.practicality +
      harmonyScore * WEIGHTS.harmony +
      preferencesScore * WEIGHTS.preferences +
      resourceScore * WEIGHTS.resourceEfficiency;

    return { total, criteria };
  }

  return { scoreMenu };
})();
