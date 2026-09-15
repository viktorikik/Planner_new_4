import { STATUSES, CATEGORIES, CATEGORY_LABELS, CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { DishStore } from '../stores/DishStore.js';
import { RecipeStore } from '../stores/RecipeStore.js';
import { showMessage } from '../utils/notifications.js';

// ============================================================
// ВАЛИДАЦИЯ ИМПОРТА
// ============================================================
export function validateDish(dish, index) {
  if (!dish || typeof dish !== 'object') return `Блюдо №${index+1}: не объект`;
  if (typeof dish.name !== 'string' || dish.name.trim() === '') return `Блюдо №${index+1}: отсутствует или некорректное name`;
  if (![STATUSES.DONE, STATUSES.PLANNED].includes(dish.status)) return `Блюдо №${index+1}: недопустимый status`;
  if (typeof dish.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dish.date)) return `Блюдо №${index+1}: некорректный формат даты (YYYY-MM-DD)`;
  const validCategories = Object.values(CATEGORIES);
  if (!validCategories.includes(dish.category)) return `Блюдо №${index+1}: недопустимая категория`;
  if (dish.liked !== undefined && typeof dish.liked !== 'boolean') return `Блюдо №${index+1}: поле liked должно быть boolean`;
  if (dish.note !== undefined && typeof dish.note !== 'string') return `Блюдо №${index+1}: поле note должно быть строкой`;
  if (dish.recipeId !== undefined && dish.recipeId !== null && typeof dish.recipeId !== 'number') return `Блюдо №${index+1}: recipeId должно быть числом или null`;
  return null;
}

export function validateRecipe(recipe, index) {
  if (!recipe || typeof recipe !== 'object') return `Рецепт №${index+1}: не объект`;
  if (typeof recipe.name !== 'string' || recipe.name.trim() === '') return `Рецепт №${index+1}: отсутствует или некорректное name`;
  if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.every(i => typeof i === 'string')) return `Рецепт №${index+1}: ингредиенты должны быть массивом строк`;
  if (recipe.instructions !== undefined && typeof recipe.instructions !== 'string') return `Рецепт №${index+1}: instructions должен быть строкой`;
  const validCategories = Object.values(CATEGORIES);
  if (!validCategories.includes(recipe.category)) return `Рецепт №${index+1}: недопустимая категория`;
  if (typeof recipe.id !== 'number') return `Рецепт №${index+1}: отсутствует или некорректный id`;
  return null;
}

// ============================================================
// ЭКСПОРТ ДАННЫХ
// ============================================================
export function exportData(format) {
  const data = DishStore.getAll();
  if (!data.length) { showMessage('Нет данных для экспорта.'); return; }

  if (format === 'json') {
    const json = JSON.stringify({ dishes: data, recipes: RecipeStore.getAll() }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `menu_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } else if (format === 'csv') {
    const headers = ['Название', 'Статус', 'Дата', 'Категория', 'Заметка', 'Любимое', 'Рецепт'];
    const rows = data.map(d => {
      const recipe = d.recipeId ? RecipeStore.getById(d.recipeId) : null;
      return [
        d.name,
        d.status === STATUSES.DONE ? 'Готовила' : 'Планирую',
        d.date,
        d.category,
        d.note || '',
        d.liked ? 'Да' : 'Нет',
        recipe ? recipe.name : ''
      ];
    });
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `menu_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } else if (format === 'txt') {
    const weekdays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    const categoryOrder = [CATEGORIES.SOUP, CATEGORIES.SALAD, CATEGORIES.MAIN, CATEGORIES.OTHER];

    const groupedByDate = {};
    data.forEach(dish => {
      if (!groupedByDate[dish.date]) {
        groupedByDate[dish.date] = {};
      }
      if (!groupedByDate[dish.date][dish.category]) {
        groupedByDate[dish.date][dish.category] = [];
      }
      groupedByDate[dish.date][dish.category].push(dish);
    });

    const sortedDates = Object.keys(groupedByDate).sort();

    let text = '📋 МОЁ МЕНЮ\n';
    text += `Дата экспорта: ${new Date().toLocaleDateString()}\n`;
    text += '='.repeat(45) + '\n\n';

    sortedDates.forEach(dateStr => {
      const d = new Date(dateStr + 'T00:00:00');
      const dayOfWeek = weekdays[d.getDay() === 0 ? 6 : d.getDay() - 1];
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const formattedDate = `${day}.${month}.${year}`;

      text += `${dayOfWeek} | ${formattedDate}\n\n`;

      const categoriesInDay = groupedByDate[dateStr];
      const sortedCategories = Object.keys(categoriesInDay).sort((a, b) => {
        return categoryOrder.indexOf(a) - categoryOrder.indexOf(b);
      });

      sortedCategories.forEach(cat => {
        const dishes = categoriesInDay[cat];
        const catLabel = CATEGORY_LABELS[cat] || cat;
        text += `${catLabel}:\n`;
        dishes.forEach(dish => {
          text += `  ${dish.name}\n`;
        });
        text += '\n';
      });
    });

    text += '='.repeat(45) + '\n';
    text += `Всего блюд: ${data.length}`;

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `menu_export_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// ============================================================
// ИМПОРТ ДАННЫХ
// ============================================================
export function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || typeof parsed !== 'object') {
        showMessage('Некорректный файл: ожидается объект.', 'error');
        return;
      }
      const dishes = parsed.dishes;
      const recipes = parsed.recipes;
      if (dishes && !Array.isArray(dishes)) {
        showMessage('Поле dishes должно быть массивом.', 'error');
        return;
      }
      if (recipes && !Array.isArray(recipes)) {
        showMessage('Поле recipes должно быть массивом.', 'error');
        return;
      }

      let validationError = null;
      if (dishes) {
        for (let i = 0; i < dishes.length; i++) {
          const err = validateDish(dishes[i], i);
          if (err) { validationError = err; break; }
        }
      }
      if (!validationError && recipes) {
        for (let i = 0; i < recipes.length; i++) {
          const err = validateRecipe(recipes[i], i);
          if (err) { validationError = err; break; }
        }
      }
      if (validationError) {
        showMessage('Ошибка валидации импортируемых данных: ' + validationError, 'error');
        return;
      }

      if (confirm(`Будет импортировано ${dishes.length} блюд и ${recipes ? recipes.length : 0} рецептов. Текущие данные будут заменены. Продолжить?`)) {
        if (recipes) {
          localStorage.setItem(CONSTANTS.STORAGE_KEYS.RECIPES, JSON.stringify(recipes));
          RecipeStore.init();
        }
        DishStore.replaceAll(dishes);
        showMessage('✅ Данные успешно импортированы!');
      }
    } catch (err) {
      showMessage('Ошибка при чтении файла: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}
