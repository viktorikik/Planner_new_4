import { STATUSES, CATEGORIES, CATEGORY_LABELS, CONSTANTS } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { DishStore } from '../stores/DishStore.js';
import { RecipeStore } from '../stores/RecipeStore.js';
import { showMessage } from '../utils/notifications.js';

function validateDish(dish, index) {
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

// Валидация рецепта. Принимает схему v1 (ингредиенты — массив строк)
// и схему v2 (ингредиенты — массив объектов { name, amount, unit }).
// Остальные поля (id, category, servings и т.д.) — опциональны:
// RecipeStore.normalizeRecipe дозаполнит их сам.
function validateRecipe(recipe, index) {
  if (!recipe || typeof recipe !== 'object') return `Рецепт №${index+1}: не объект`;
  if (typeof recipe.name !== 'string' || recipe.name.trim() === '') {
    return `Рецепт №${index+1}: отсутствует или некорректное name`;
  }
  if (recipe.ingredients !== undefined) {
    if (!Array.isArray(recipe.ingredients)) {
      return `Рецепт №${index+1}: ingredients должен быть массивом`;
    }
    for (let j = 0; j < recipe.ingredients.length; j++) {
      const ing = recipe.ingredients[j];
      if (typeof ing === 'string') continue;
      if (ing && typeof ing === 'object' && typeof ing.name === 'string') continue;
      return `Рецепт №${index+1}, ингредиент №${j+1}: должен быть строкой или объектом с полем name`;
    }
  }
  if (recipe.instructions !== undefined && typeof recipe.instructions !== 'string') {
    return `Рецепт №${index+1}: instructions должен быть строкой`;
  }
  return null;
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// ЗАЩИТА ОТ CSV INJECTION
// Значения, начинающиеся с =, +, -, @, \t, \r, Excel/Sheets/LibreOffice
// интерпретируют как формулу. Добавляем апостроф в начало, чтобы
// принудительно оставить значение текстом.
// ============================================================
function sanitizeCsvCell(value) {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function exportData(format) {
  const data = DishStore.getAll();
  if (!data.length) { showMessage('Нет данных для экспорта.'); return; }

  if (format === 'json') {
    const json = JSON.stringify({
      schemaVersion: 2,
      dishes: data,
      recipes: RecipeStore.getAll()
    }, null, 2);
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
        d.status === STATUSES.DONE ? 'Приготовлено' : 'Планирую',
        d.date,
        d.category,
        d.note || '',
        d.liked ? 'Да' : 'Нет',
        recipe ? recipe.name : ''
      ];
    });
    const csvContent = [headers, ...rows]
      .map(row => row.map(sanitizeCsvCell).join(';'))
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
    const categoryOrder = [CATEGORIES.SOUP, CATEGORIES.SALAD, CATEGORIES.MAIN, CATEGORIES.BAKERY, CATEGORIES.OTHER];

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

      const recipesCount = recipes ? recipes.length : 0;
      if (confirm(`Будет импортировано ${dishes.length} блюд и ${recipesCount} рецептов. Текущие данные будут заменены. Продолжить?`)) {
        // Рецепты прогоняются через normalizeRecipe внутри replaceAll —
        // старые бэкапы (v1) автоматически конвертируются в схему v2.
        if (recipes) {
          RecipeStore.replaceAll(recipes);
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

export function exportRecipesAsJson() {
  const recipes = RecipeStore.getAll();
  if (!recipes.length) {
    showMessage('Нет рецептов для экспорта.');
    return;
  }
  const json = JSON.stringify({ schemaVersion: 2, recipes }, null, 2);
  const filename = `recipes_backup_${new Date().toISOString().slice(0,10)}.json`;
  downloadFile(json, filename, 'application/json');
}

export function exportRecipesAsTxt() {
  const recipes = RecipeStore.getAll();
  if (!recipes.length) {
    showMessage('Нет рецептов для экспорта.');
    return;
  }

  const categoryOrder = [CATEGORIES.SOUP, CATEGORIES.SALAD, CATEGORIES.MAIN, CATEGORIES.BAKERY, CATEGORIES.OTHER];
  const categoryTitles = {
    [CATEGORIES.SOUP]:   '🍲 СУПЫ',
    [CATEGORIES.SALAD]:  '🥗 САЛАТЫ',
    [CATEGORIES.MAIN]:   '🍖 ОСНОВНЫЕ БЛЮДА',
    [CATEGORIES.BAKERY]: '🥐 ВЫПЕЧКА',
    [CATEGORIES.OTHER]:  '🍽️ ДРУГОЕ'
  };

  const grouped = {};
  recipes.forEach(r => {
    const cat = r.category || CATEGORIES.OTHER;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(r);
  });

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const dateHuman = `${dd}.${mm}.${yyyy}`;

  const line = '═'.repeat(50);
  const thin = '─'.repeat(50);

  let text = '';
  text += line + '\n';
  text += `   📖 МОИ РЕЦЕПТЫ · всего: ${recipes.length}\n`;
  text += `   Дата выгрузки: ${dateHuman}\n`;
  text += line + '\n\n';

  categoryOrder.forEach(cat => {
    const items = grouped[cat];
    if (!items || items.length === 0) return;

    items.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    text += `${categoryTitles[cat] || cat} (${items.length})\n`;
    text += thin + '\n\n';

    items.forEach(recipe => {
      text += `📖 ${recipe.name}\n`;

      if (recipe.ingredients && recipe.ingredients.length > 0) {
        text += `   Ингредиенты:\n`;
        recipe.ingredients.forEach(ing => {
          // ing — объект { name, amount, unit } или строка (на случай, если
          // где-то ещё остались не мигрированные данные).
          const line2 = Utils.formatIngredient(ing);
          if (line2) text += `   • ${line2}\n`;
        });
      }

      if (recipe.instructions && recipe.instructions.trim()) {
        text += `\n   Приготовление:\n`;
        const lines = recipe.instructions.split('\n');
        lines.forEach(l => {
          text += `   ${l}\n`;
        });
      }

      text += '\n' + thin + '\n\n';
    });
  });

  text += line + '\n';
  text += `Всего рецептов: ${recipes.length}\n`;
  text += line + '\n';

  const filename = `recipes_${yyyy}-${mm}-${dd}.txt`;
  downloadFile(text, filename, 'text/plain;charset=utf-8');
}

export function importRecipesOnly(file, onDone) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || typeof parsed !== 'object') {
        showMessage('Некорректный файл: ожидается объект.', 'error');
        return;
      }
      const recipes = parsed.recipes;
      if (!Array.isArray(recipes)) {
        showMessage('Поле recipes должно быть массивом.', 'error');
        return;
      }
      if (recipes.length === 0) {
        showMessage('Файл не содержит рецептов.');
        return;
      }

      for (let i = 0; i < recipes.length; i++) {
        const err = validateRecipe(recipes[i], i);
        if (err) {
          showMessage('Ошибка валидации: ' + err, 'error');
          return;
        }
      }

      let added = 0, replaced = 0, skipped = 0;

      recipes.forEach(incoming => {
        const currentRecipes = RecipeStore.getAll();
        const existing = currentRecipes.find(
          r => r.name.toLowerCase() === incoming.name.toLowerCase()
        );

        // Прокидываем весь набор полей v2 через extra-объект.
        // RecipeStore.add/update сами нормализуют и дозаполнят отсутствующее.
        const extra = {
          servings: incoming.servings,
          cookTime: incoming.cookTime,
          activeTime: incoming.activeTime,
          nutrition: incoming.nutrition,
          difficulty: incoming.difficulty,
          spiciness: incoming.spiciness,
          cuisine: incoming.cuisine,
          allergens: incoming.allergens,
          mealTypes: incoming.mealTypes,
          liked: incoming.liked,
          disliked: incoming.disliked,
          builtIn: incoming.builtIn
        };
        // Удаляем undefined, чтобы normalizeRecipe не перетёр существующие
        // значения при обновлении.
        Object.keys(extra).forEach(k => {
          if (extra[k] === undefined) delete extra[k];
        });

        if (!existing) {
          RecipeStore.add(
            incoming.name,
            incoming.ingredients || [],
            incoming.instructions || '',
            incoming.category,
            extra
          );
          added++;
        } else {
          const answer = confirm(
            `Рецепт "${incoming.name}" уже существует.\n\n` +
            `OK — заменить его новым.\n` +
            `Отмена — пропустить.`
          );
          if (answer) {
            RecipeStore.update(
              existing.id,
              incoming.name,
              incoming.ingredients || [],
              incoming.instructions || '',
              incoming.category,
              extra
            );
            replaced++;
          } else {
            skipped++;
          }
        }
      });

      showMessage(
        `✅ Импорт рецептов завершён: добавлено ${added}, заменено ${replaced}, пропущено ${skipped}.`
      );

      if (typeof onDone === 'function') onDone();
    } catch (err) {
      showMessage('Ошибка при чтении файла: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}
