/**
 * MenuOptimizer — глобальный оптимизатор меню.
 * 
 * v1.0 (v6.3.2):
 *   • Multi-Start: создает 3 случайных стартовых меню.
 *   • Local Search: Simulated Annealing для поиска лучшей комбинации.
 *   • Инкрементальная оценка (в будущем, пока полная переоценка).
 */
import { MealComposer } from './MealComposer.js';
import { MenuScoring } from './MenuScoring.js';

export const MenuOptimizer = (function() {

  function getShiftedDate(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 1. Генерация случайного стартового меню
  function generateRandomMenu(days, mealTypes, allRecipes, context) {
    const menu = {};
    const usedIds = new Set();
    
    for (let i = 0; i < days; i++) {
      const dateStr = getShiftedDate(context.startDate, i);
      const dateObj = new Date(dateStr);
      const isWeekday = [1,2,3,4,5].includes(dateObj.getDay());
      context.isWeekday = isWeekday;
      
      menu[dateStr] = {};
      
      mealTypes.forEach(mealType => {
        const candidates = allRecipes.filter(r => r.mealTypes && r.mealTypes.includes(mealType));
        if (candidates.length === 0) {
          menu[dateStr][mealType] = { items: [] };
          return;
        }
        
        const compositions = MealComposer.composeMeal(mealType, candidates, { ...context, usedRecipeIds: usedIds });
        const chosen = compositions[Math.floor(Math.random() * compositions.length)];
        
        menu[dateStr][mealType] = { items: chosen.items };
        chosen.items.forEach(item => usedIds.add(item.id));
      });
    }
    
    return menu;
  }

  // 2. Мутация (изменение одного слота)
  function mutate(menu, days, mealTypes, allRecipes, context) {
    const newMenu = JSON.parse(JSON.stringify(menu)); // Глубокая копия
    
    const dateKeys = Object.keys(newMenu);
    const randomDate = dateKeys[Math.floor(Math.random() * dateKeys.length)];
    const randomMealType = mealTypes[Math.floor(Math.random() * mealTypes.length)];
    
    const dateObj = new Date(randomDate);
    const isWeekday = [1,2,3,4,5].includes(dateObj.getDay());
    context.isWeekday = isWeekday;
    
    const candidates = allRecipes.filter(r => r.mealTypes && r.mealTypes.includes(randomMealType));
    if (candidates.length === 0) return newMenu;
    
    const compositions = MealComposer.composeMeal(randomMealType, candidates, context);
    const chosen = compositions[Math.floor(Math.random() * compositions.length)];
    
    newMenu[randomDate][randomMealType] = { items: chosen.items };
    
    return newMenu;
  }

  // 3. Симуляция отжига (Simulated Annealing)
  function optimize(startMenu, days, mealTypes, allRecipes, context, iterations = 800) {
    let currentMenu = startMenu;
    let currentScore = MenuScoring.scoreMenu(currentMenu, context).total;
    
    let bestMenu = currentMenu;
    let bestScore = currentScore;
    
    let temperature = 100;
    const coolingRate = 0.99;
    
    for (let i = 0; i < iterations; i++) {
      const neighbor = mutate(currentMenu, days, mealTypes, allRecipes, context);
      const neighborScore = MenuScoring.scoreMenu(neighbor, context).total;
      
      const delta = neighborScore - currentScore;
      
      // Если лучше — берем. Если хуже — берем с вероятностью (чтобы выбраться из локального минимума)
      if (delta > 0 || Math.random() < Math.exp(delta / temperature)) {
        currentMenu = neighbor;
        currentScore = neighborScore;
        
        if (currentScore > bestScore) {
          bestMenu = currentMenu;
          bestScore = currentScore;
        }
      }
      
      temperature *= coolingRate;
      if (temperature < 0.1) temperature = 0.1;
    }
    
    return { menu: bestMenu, score: bestScore };
  }

  // 4. Главная функция (Multi-Start)
  function generateOptimizedMenu(options, allRecipes) {
    const {
      startDate,
      days = 7,
      mealTypes = ['breakfast', 'lunch', 'dinner'],
      maxWeekdayTime = 40
    } = options;

    const context = {
      startDate,
      weekdays: [1,2,3,4,5],
      maxWeekdayTime,
      preferLightDinner: true
    };

    const numStarts = 3; // Количество попыток
    let globalBest = null;
    let globalBestScore = -1;

    for (let s = 0; s < numStarts; s++) {
      const initialMenu = generateRandomMenu(days, mealTypes, allRecipes, context);
      // 500 итераций на каждый старт (можно увеличить для качества, но будет дольше)
      const result = optimize(initialMenu, days, mealTypes, allRecipes, context, 500);
      
      if (result.score > globalBestScore) {
        globalBestScore = result.score;
        globalBest = result.menu;
      }
    }

    return {
      success: true,
      menu: globalBest,
      score: globalBestScore
    };
  }

  return { generateOptimizedMenu };
})();
