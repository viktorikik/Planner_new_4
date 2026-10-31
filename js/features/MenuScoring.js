/**
 * MenuScoring — система оценки сгенерированного меню.
 * 
 * v1.3 (v6.4.2):
 *   • Жесткий запрет на дублирование блюд в один день (штраф -1000).
 *   • Гигантский штраф за повтор ID в разные дни (300 баллов).
 * 
 * v1.2 (v6.4.1):
 *   • Усиленный штраф за повторы: точное совпадение ID, совпадение базового названия, 
 *     а также переизбыток супов в меню.
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
    const recipeCounts = {};
    const proteinCounts = {};
    const methodCounts = {};
    const categoryCounts = {};
    const baseNameCounts = {};

    allItems.forEach(item => {
      recipeCounts[item.id] = (recipeCounts[item.id] || 0) + 1;
      const cat = item.category || 'other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      const baseName = item.name.split(' ')[0].toLowerCase();
      baseNameCounts[baseName] = (baseNameCounts[baseName] || 0) + 1;

      if (item.tags) {
        if (item.tags.proteinSource) proteinCounts[item.tags.proteinSource] = (proteinCounts[item.tags.proteinSource] || 0) + 1;
        if (item.tags.cookingMethod) methodCounts[item.tags.cookingMethod] = (methodCounts[item.tags.cookingMethod] || 0) + 1;
      }
    });

    let diversityPenalty = 0;
    
    // v6.4.2: Огромный штраф за повторы в разные дни
    Object.values(recipeCounts).forEach(count => {
      if (count > 1) diversityPenalty += (count - 1) * 300; 
    });

    Object.values(baseNameCounts).forEach(count => {
      if (count > 1) diversityPenalty += (count - 1) * 50;
    });

    const maxSoupsAllowed = Math.ceil(days.length * 0.6); 
    if (categoryCounts['soup'] > maxSoupsAllowed) {
      diversityPenalty += (categoryCounts['soup'] - maxSoupsAllowed) * 100;
    }

    Object.values(proteinCounts).forEach(count => {
      if (count > 2) diversityPenalty += (count - 2) * 20;
    });
    Object.values(methodCounts).forEach(count => {
      if (count > 2) diversityPenalty += (count - 2) * 10;
    });

    if (context.recentRecipeIds) {
      allItems.forEach(item => {
        if (context.recentRecipeIds.has(String(item.id))) {
          diversityPenalty += 50; 
        }
      });
    }

    // v6.4.2: Проверка на дубли в ОДИН ДЕНЬ
    days.forEach(date => {
      const dayItems = Object.values(menu[date]).flatMap(m => m.items || []);
      const daySet = new Set(dayItems.map(i => String(i.id)));
      if (daySet.size !== dayItems.length) {
        diversityPenalty += 1000; // Оптимизатор никогда не выберет этот вариант
      }
    });

    const diversityScore = Math.max(0, 100 - diversityPenalty);

    // --- 2. Сбалансированность (20%) ---
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
    let harmonyScoreSum = 0;
    let mealCount = 0;
    
    days.forEach(date => {
      Object.values(menu[date]).forEach(meal => {
        if (!meal.items || meal.items.length === 0) return;
        mealCount++;
        let mealHarmony = 100;
        
        const roles = meal.items.map(i => i.mealRole);
        const mainsCount = roles.filter(r => r === 'main').length;
        const sidesCount = roles.filter(r => r === 'side').length;
        const soupsCount = roles.filter(r => r === 'first_course').length;
        const heavies = meal.items.filter(i => i.isHeavy).length;
        
        if (mainsCount > 1) mealHarmony -= 100; 
        if (soupsCount > 1) mealHarmony -= 50;
        
        // Штраф за мясо/рыбу без гарнира (только если requiresSide = true)
        if (mainsCount > 0 && sidesCount === 0) {
          const needsSide = meal.items.some(i => i.requiresSide === true);
          if (needsSide) mealHarmony -= 40; 
        }

        if (roles.filter(r => r === 'salad').length > 1) mealHarmony -= 20;
        if (heavies > 1) mealHarmony -= 25;
        
        if (roles.includes('first_course') && mainsCount > 0) mealHarmony += 10;
        if (mainsCount > 0 && sidesCount > 0) mealHarmony += 15;
        
        harmonyScoreSum += Math.max(0, Math.min(100, mealHarmony));
      });
    });
    const harmonyScore = mealCount > 0 ? harmonyScoreSum / mealCount : 100;

    // --- 5. Предпочтения (13%) ---
    let likedCount = allItems.filter(i => i.liked).length;
    const preferencesScore = Math.min(100, (likedCount / Math.max(1, allItems.length)) * 100 * 2);

    // --- 6. Рациональное использование продуктов (10%) ---
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
      if (count === 1) resourcePenalty += 1;
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
