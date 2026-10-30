/**
 * MenuGenerator — умный алгоритм сбора меню на основе тегов.
 * Использует систему штрафных баллов для обеспечения разнообразия.
 * Зависит от: RecipeStore, Utils.
 *
 * v1.0:
 *   • Учет типа белка, формы, способа готовки и основы.
 *   • Баланс по клетчатке и БЖУ (без жесткого подсчета калорий).
 *   • Режим «Холодильник» (поиск по ингредиентам).
 *   • Возможность заменить одно блюдо (reroll).
 */
import { RecipeStore } from '../stores/RecipeStore.js';
import { Utils } from '../utils/Utils.js';

export const MenuGenerator = (function() {

  // ============================================================
  // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  // ============================================================

  // Получить дату в формате YYYY-MM-DD
  function formatDate(date) {
    return Utils.formatDateLocal(date);
  }

  // Получить дату со сдвигом (например, -1 день)
  function getShiftedDate(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return formatDate(d);
  }

  // ============================================================
  // ЯДРО: РАСЧЕТ ШТРАФНЫХ БАЛЛОВ ДЛЯ БЛЮДА
  // ============================================================
  function calculatePenalty(recipe, targetDate, mealType, context) {
    let penalty = 0;
    const tags = recipe.tags || {};
    const history = context.history; // Объект с меню на предыдущие дни
    
    // 0. Базовый штраф (чтобы все блюда имели равные шансы)
    penalty += 100;

    // 1. ИСКЛЮЧАЕМ ПОВТОРЫ В РАМКАХ НЕДЕЛИ
    if (context.usedRecipeIds.has(recipe.id)) {
      penalty += 500; // Практически исключаем
    }

    // 2. РЕЖИМ «ХОЛОДИЛЬНИК» (Бонус за совпадения)
    if (context.fridgeMode && context.fridgeIngredients.length > 0) {
      let matches = 0;
      recipe.ingredients.forEach(ing => {
        const ingName = ing.name.toLowerCase().replace(/ё/g, 'е');
        if (context.fridgeIngredients.some(f => ingName.includes(f) || f.includes(ingName))) {
          matches++;
        }
      });
      if (matches > 0) {
        penalty -= (matches * 30); // Чем больше совпадений, тем сильнее бонус (минус штраф)
      }
    }

    // 3. АНАЛИЗ ИСТОРИИ (Чередование)
    // Проверяем вчерашний и позавчерашний день
    const yesterday = getShiftedDate(targetDate, -1);
    const dayBefore = getShiftedDate(targetDate, -2);
    
    let yesterdayTags = [];
    let dayBeforeTags = [];

    if (history[yesterday]) {
      yesterdayTags = Object.values(history[yesterday]).map(dish => dish.tags || {});
    }
    if (history[dayBefore]) {
      dayBeforeTags = Object.values(history[dayBefore]).map(dish => dish.tags || {});
    }

    // 3.1. Тип белка (Курица, говядина, рыба...)
    if (yesterdayTags.some(t => t.proteinSource === tags.proteinSource) && tags.proteinSource !== 'vegetarian') {
      penalty += 150; // Вчера был тот же белок — сильный штраф
    }
    if (dayBeforeTags.some(t => t.proteinSource === tags.proteinSource) && tags.proteinSource !== 'vegetarian') {
      penalty += 50;  // Позавчера был тот же белок — слабый штраф
    }

    // 3.2. Форма белка (Цельное / Фарш)
    if (tags.proteinForm !== 'none') {
      if (yesterdayTags.some(t => t.proteinForm === tags.proteinForm)) {
        penalty += 80; // Вчера был фарш, значит сегодня лучше цельное мясо
      }
    }

    // 3.3. Способ готовки (Жарка, запекание, варка...)
    if (yesterdayTags.some(t => t.cookingMethod === tags.cookingMethod)) {
      penalty += 40; // Вчера жарили, сегодня лучше запечь
    }

    // 3.4. Основа / Гарнир (Картошка, рис, макароны...)
    if (tags.baseType !== 'none') {
      if (yesterdayTags.some(t => t.baseType === tags.baseType)) {
        penalty += 60; // Вчера был рис, сегодня лучше картошка или гречка
      }
    }

    // 4. БАЛАНС КЛЕТЧАТКИ И БЖУ
    // Считаем, сколько блюд с клетчаткой было за последние 2 дня
    let fiberCount = 0;
    if (yesterdayTags.some(t => t.nutritionProfile === 'high_fiber')) fiberCount++;
    if (dayBeforeTags.some(t => t.nutritionProfile === 'high_fiber')) fiberCount++;

    // Если клетчатки не было, штрафуем "тяжелые" блюда (мясо без овощей)
    if (fiberCount === 0 && tags.nutritionProfile === 'high_protein') {
      penalty += 70; // Даешь клетчатку!
    }
    // Если было много тяжелого, бонус легким блюдам
    if (fiberCount >= 2 && tags.nutritionProfile === 'light') {
      penalty -= 30;
    }

    // 5. ОГРАНИЧЕНИЕ ПО ВРЕМЕНИ (для будней)
    if (context.isWeekday && recipe.activeTime) {
      if (recipe.activeTime > context.maxWeekdayTime) {
        penalty += 100; // Слишком долго для буднего дня
      }
    }

    // 6. ПРИЕМ ПИЩИ (Если блюдо предназначено для завтрака, не ставим его на ужин)
    if (recipe.mealTypes && recipe.mealTypes.length > 0) {
      if (!recipe.mealTypes.includes(mealType)) {
        penalty += 200; // Очень сильный штраф, если не подходит под прием пищи
      }
    }

    return penalty;
  }

  // ============================================================
  // ОСНОВНОЙ ГЕНЕРАТОР
  // ============================================================
  function generateMenu(options) {
    const {
      startDate = formatDate(new Date()),
      days = 7,
      mealTypes = ['breakfast', 'lunch', 'dinner'],
      fridgeIngredients = [],
      maxWeekdayTime = 40 // Максимальное активное время для будней
    } = options;

    const allRecipes = RecipeStore.getAll().filter(r => !r.hidden && !r.disliked);
    if (allRecipes.length === 0) return { success: false, message: 'Нет доступных рецептов' };

    const resultMenu = {}; // Итоговое меню
    const context = {
      history: resultMenu,
      usedRecipeIds: new Set(),
      fridgeMode: fridgeIngredients.length > 0,
      fridgeIngredients: fridgeIngredients.map(f => f.toLowerCase().replace(/ё/g, 'е').trim()),
      maxWeekdayTime
    };

    const daysOfWeek = [0, 1, 2, 3, 4, 5, 6]; // 0 - Вс, 1 - Пн и т.д.

    for (let i = 0; i < days; i++) {
      const currentDate = getShiftedDate(startDate, i);
      const dateObj = new Date(currentDate);
      const dayOfWeek = dateObj.getDay();
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
      
      resultMenu[currentDate] = {};

      context.isWeekday = isWeekday;

      mealTypes.forEach(mealType => {
        // Фильтруем блюда, которые подходят под этот прием пищи
        let candidates = allRecipes.filter(r => {
          if (!r.mealTypes || r.mealTypes.length === 0) return true;
          return r.mealTypes.includes(mealType);
        });

        // Если подходящих мало, берем все (чтобы не сломаться)
        if (candidates.length < 3) candidates = allRecipes;

        // Считаем штрафы для каждого
        const scoredCandidates = candidates.map(recipe => ({
          recipe,
          penalty: calculatePenalty(recipe, currentDate, mealType, context)
        }));

        // Сортируем по возрастанию штрафа (чем меньше, тем лучше)
        scoredCandidates.sort((a, b) => a.penalty - b.penalty);

        // Выбираем лучшее (берем случайное из топ-3, чтобы меню не было одинаковым при повторной генерации)
        const topCandidates = scoredCandidates.slice(0, 3);
        const best = topCandidates[Math.floor(Math.random() * topCandidates.length)].recipe;

        // Записываем в меню
        resultMenu[currentDate][mealType] = {
          id: best.id,
          name: best.name,
          tags: best.tags
        };

        // Добавляем в использованные, чтобы не повторялось на этой неделе
        context.usedRecipeIds.add(best.id);
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
    const allRecipes = RecipeStore.getAll().filter(r => !r.hidden && !r.disliked && r.id !== currentRecipeId);
    
    const context = {
      history: currentMenu,
      usedRecipeIds: new Set(), // При замене мы не должны блокировать уже использованные (кроме текущего)
      fridgeMode: options.fridgeIngredients && options.fridgeIngredients.length > 0,
      fridgeIngredients: (options.fridgeIngredients || []).map(f => f.toLowerCase().replace(/ё/g, 'е').trim()),
      maxWeekdayTime: options.maxWeekdayTime || 40,
      isWeekday: [1,2,3,4,5].includes(new Date(targetDate).getDay())
    };

    // Собираем ID всех блюд, которые уже стоят в меню на этой неделе (чтобы не предложить их снова)
    Object.values(currentMenu).forEach(day => {
      Object.values(day).forEach(dish => {
        if (dish.id !== currentRecipeId) context.usedRecipeIds.add(dish.id);
      });
    });

    let candidates = allRecipes.filter(r => !r.mealTypes || r.mealTypes.length === 0 || r.mealTypes.includes(mealType));
    if (candidates.length < 3) candidates = allRecipes;

    const scoredCandidates = candidates.map(recipe => ({
      recipe,
      penalty: calculatePenalty(recipe, targetDate, mealType, context)
    }));

    scoredCandidates.sort((a, b) => a.penalty - b.penalty);

    if (scoredCandidates.length > 0) {
       // Возвращаем лучший вариант
       const best = scoredCandidates[0].recipe;
       return {
         id: best.id,
         name: best.name,
         tags: best.tags
       };
    }
    return null;
  }

  return {
    generateMenu,
    getReplacement
  };
})();
