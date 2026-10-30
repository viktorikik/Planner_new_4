/**
 * ExportImport — экспорт/импорт данных приложения.
 * Зависит от: Constants, Utils, DishStore, RecipeStore, notifications.
 *
 * v5.44.1 (фикс валидации импорта):
 *   • validateDish больше не требует recipeId строго числом.
 *     С v5.36 ID рецептов — строки. Экспорт писал строки,
 *     импорт падал с ошибкой «recipeId должно быть числом».
 *     Теперь принимается string | number | null.
 */
import {
  STATUSES, CATEGORIES, CATEGORY_LABELS, CONSTANTS,
  MEAL_TYPES, ALLERGENS, CUISINES, UNITS
} from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { DishStore } from '../stores/DishStore.js';
import { RecipeStore } from '../stores/RecipeStore.js';
import { showMessage } from '../utils/notifications.js';

// ============================================================
// НОРМАЛИЗАЦИЯ РУССКИХ ДАННЫХ ПРИ ИМПОРТЕ (v5.25, Блок 6)
// Импортируемые JSON-файлы могут содержать значения полей
// в русском написании (Закуска, Перекус, Молоко, ...). Здесь
// приводим их к внутренним ключам приложения.
// ============================================================
const CATEGORY_MAP_FROM_RU = {
  'закуска': 'appetizer',
  'салат': 'salad',
  'горячее блюдо': 'main',
  'горячее': 'main',
  'основное': 'main',
  'основное блюдо': 'main',
  'суп': 'soup',
  'выпечка': 'bakery',
  'десерт': 'dessert',
  'другое': 'other'
};

const MEAL_TYPE_MAP_FROM_RU = {
  'завтрак': 'breakfast',
  'обед': 'lunch',
  'ужин': 'dinner',
  'перекус': 'snack',
  'десерт': 'snack'
};

const ALLERGEN_MAP_FROM_RU = {
  'молоко': 'milk',
  'белок коровьего молока': 'milk',
  'глютен': 'gluten',
  'злаки, содержащие глютен': 'gluten',
  'яйцо': 'eggs',
  'яйца': 'eggs',
  'рыба': 'fish',
  'горчица': 'mustard',
  'моллюски': 'molluscs',
  'соя': 'soy',
  'кунжут': 'sesame',
  'арахис': 'peanut',
  'орехи': 'nuts',
  'ракообразные': 'crustaceans',
  'клубника': 'strawberry',
  'сельдерей': 'celery',
  'люпин': 'lupin'
};

const CUISINE_MAP_FROM_RU = {
  'русская': 'russian',
  'украинская': 'ukrainian',
  'кавказская': 'caucasian',
  'итальянская': 'italian',
  'французская': 'french',
  'средиземноморская': 'mediterranean',
  'греческая': 'greek',
  'американская': 'american',
  'мексиканская': 'mexican',
  'китайская': 'chinese',
  'японская': 'japanese',
  'корейская': 'korean',
  'индийская': 'indian',
  'азиатская': 'asian',
  'международная': 'international',
  'европейская': 'international'
};

const UNIT_MAP_FROM_RU = {
  'г': 'g',
  'кг': 'kg',
  'мл': 'ml',
  'л': 'l',
  'шт': 'pcs',
  'ст.л.': 'tbsp',
  'ст. л.': 'tbsp',
  'ч.л.': 'tsp',
  'ч. л.': 'tsp',
  'щепотка': 'pinch',
  'зубчик': 'clove',
  'зуб.': 'clove',
  'пучок': 'bunch',
  'вет.': 'bunch'
};

const DIFFICULTY_MAP_FROM_RU = {
  'очень просто': 1,
  'просто': 2,
  'легко': 2,
  'средне': 3,
  'сложно': 4,
  'очень сложно': 5
};

const SPICINESS_MAP_FROM_RU = {
  'не остро': 1,
  'не острое': 1,
  'слегка остро': 2,
  'средне остро': 3,
  'остро': 4,
  'очень остро': 5
};

function mapEnum(map, value, allowedValues) {
  if (value == null || value === '') return null;
  if (allowedValues && allowedValues.includes(value)) return value;
  const key = String(value).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  return null;
}

function normalizeRecipeForImport(recipe) {
  if (!recipe || typeof recipe !== 'object') return recipe;
  const out = { ...recipe };

  // category
  if (out.category != null) {
    const mapped = mapEnum(CATEGORY_MAP_FROM_RU, out.category, Object.values(CATEGORIES));
    out.category = mapped || CATEGORIES.OTHER;
  }

  // mealTypes
  if (Array.isArray(out.mealTypes)) {
    const mapped = out.mealTypes
      .map(v => mapEnum(MEAL_TYPE_MAP_FROM_RU, v, Object.values(MEAL_TYPES)))
      .filter(Boolean);
    out.mealTypes = [...new Set(mapped)];
  }

  // allergens
  if (Array.isArray(out.allergens)) {
    const mapped = out.allergens
      .map(v => mapEnum(ALLERGEN_MAP_FROM_RU, v, Object.values(ALLERGENS)))
      .filter(Boolean);
    out.allergens = [...new Set(mapped)];
  }

  // cuisine
  if (out.cuisine != null && out.cuisine !== '') {
    const mapped = mapEnum(CUISINE_MAP_FROM_RU, out.cuisine, Object.values(CUISINES));
    out.cuisine = mapped || null;
  }

  // ingredients (units)
  if (Array.isArray(out.ingredients)) {
    out.ingredients = out.ingredients.map(ing => {
      if (!ing || typeof ing !== 'object') return ing;
      const newIng = { ...ing };
      if (newIng.unit) {
        const mapped = mapEnum(UNIT_MAP_FROM_RU, newIng.unit, Object.values(UNITS));
        if (mapped) newIng.unit = mapped;
      }
      return newIng;
    });
  }

  // difficulty
  if (typeof out.difficulty === 'string') {
    out.difficulty = mapEnum(DIFFICULTY_MAP_FROM_RU, out.difficulty, [1, 2, 3, 4, 5]);
  }

  // spiciness
  if (typeof out.spiciness === 'string') {
    out.spiciness = mapEnum(SPICINESS_MAP_FROM_RU, out.spiciness, [1, 2, 3, 4, 5]);
  }

  return out;
}

function validateDish(dish, index) {
  if (!dish || typeof dish !== 'object') return `Блюдо №${index + 1}: не объект`;
  if (typeof dish.name !== 'string' || dish.name.trim() === '') return `Блюдо №${index + 1}: отсутствует или некорректное name`;
  if (![STATUSES.DONE, STATUSES.PLANNED].includes(dish.status)) return `Блюдо №${index + 1}: недопустимый status`;
  if (typeof dish.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dish.date)) return `Блюдо №${index + 1}: некорректный формат даты (YYYY-MM-DD)`;
  const validCategories = Object.values(CATEGORIES);
  if (!validCategories.includes(dish.category)) return `Блюдо №${index + 1}: недопустимая категория`;
  if (dish.liked !== undefined && typeof dish.liked !== 'boolean') return `Блюдо №${index + 1}: поле liked должно быть boolean`;
  if (dish.note !== undefined && typeof dish.note !== 'string') return `Блюдо №${index + 1}: поле note должно быть строкой`;
  // v5.44.1: recipeId — строка (основной формат), но принимаем и число
  // для обратной совместимости со старыми бэкапами.
  if (dish.recipeId !== undefined && dish.recipeId !== null &&
      typeof dish.recipeId !== 'string' && typeof dish.recipeId !== 'number') {
    return `Блюдо №${index + 1}: recipeId должно быть строкой, числом или null`;
  }
  return null;
}

function validateRecipe(recipe, index) {
  if (!recipe || typeof recipe !== 'object') return `Рецепт №${index + 1}: не объект`;
  if (typeof recipe.name !== 'string' || recipe.name.trim() === '') {
    return `Рецепт №${index + 1}: отсутствует или некорректное name`;
  }
  if (recipe.ingredients !== undefined) {
    if (!Array.isArray(recipe.ingredients)) {
      return `Рецепт №${index + 1}: ingredients должен быть массивом`;
    }
    for (let j = 0; j < recipe.ingredients.length; j++) {
      const ing = recipe.ingredients[j];
      if (typeof ing === 'string') continue;
      if (ing && typeof ing === 'object' && typeof ing.name === 'string') continue;
      return `Рецепт №${index + 1}, ингредиент №${j + 1}: должен быть строкой или объектом с полем name`;
    }
  }
  if (recipe.instructions !== undefined && typeof recipe.instructions !== 'string') {
    return `Рецепт №${index + 1}: instructions должен быть строкой`;
  }
  if (recipe.comments !== undefined && recipe.comments !== null && typeof recipe.comments !== 'string') {
    return `Рецепт №${index + 1}: comments должен быть строкой или null`;
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
    downloadFile(json, `menu_backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
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
    downloadFile('\uFEFF' + csvContent, `menu_export_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
  } else if (format === 'txt') {
    const weekdays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    const categoryOrder = [
      CATEGORIES.SOUP, CATEGORIES.SALAD, CATEGORIES.MAIN,
      CATEGORIES.APPETIZER, CATEGORIES.BAKERY, CATEGORIES.DESSERT, CATEGORIES.OTHER
    ];

    const groupedByDate = {};
    data.forEach(dish => {
      if (!groupedByDate[dish.date]) groupedByDate[dish.date] = {};
      if (!groupedByDate[dish.date][dish.category]) groupedByDate[dish.date][dish.category] = [];
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
      text += `${dayOfWeek} | ${day}.${month}.${year}\n\n`;

      const categoriesInDay = groupedByDate[dateStr];
      const sortedCategories = Object.keys(categoriesInDay).sort(
        (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
      );

      sortedCategories.forEach(cat => {
        const dishes = categoriesInDay[cat];
        text += `${CATEGORY_LABELS[cat] || cat}:\n`;
        dishes.forEach(dish => { text += `  ${dish.name}\n`; });
        text += '\n';
      });
    });

    text += '='.repeat(45) + '\n';
    text += `Всего блюд: ${data.length}`;

    downloadFile(text, `menu_export_${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain;charset=utf-8');
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
      let recipes = parsed.recipes;
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
      if (confirm(`Будет импортировано ${dishes ? dishes.length : 0} блюд и ${recipesCount} рецептов. Текущие данные будут заменены. Продолжить?`)) {
        if (recipes) {
          const normalizedRecipes = recipes.map(normalizeRecipeForImport);
          RecipeStore.replaceAll(normalizedRecipes);
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
  if (!recipes.length) { showMessage('Нет рецептов для экспорта.'); return; }
  const json = JSON.stringify({ schemaVersion: 2, recipes }, null, 2);
  downloadFile(json, `recipes_backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
}

export function exportRecipesAsTxt() {
  const recipes = RecipeStore.getAll();
  if (!recipes.length) { showMessage('Нет рецептов для экспорта.'); return; }

  const categoryOrder = [
    CATEGORIES.SOUP, CATEGORIES.SALAD, CATEGORIES.MAIN,
    CATEGORIES.APPETIZER, CATEGORIES.BAKERY, CATEGORIES.DESSERT, CATEGORIES.OTHER
  ];
  const categoryTitles = {
    [CATEGORIES.SOUP]:      '🍲 СУПЫ',
    [CATEGORIES.SALAD]:     '🥗 САЛАТЫ',
    [CATEGORIES.MAIN]:      '🍖 ОСНОВНЫЕ БЛЮДА',
    [CATEGORIES.APPETIZER]: '🥪 ЗАКУСКИ',
    [CATEGORIES.BAKERY]:    '🥐 ВЫПЕЧКА',
    [CATEGORIES.DESSERT]:   '🍰 ДЕСЕРТЫ',
    [CATEGORIES.OTHER]:     '🍽️ ДРУГОЕ'
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
          const line2 = Utils.formatIngredient(ing);
          if (line2) text += `   • ${line2}\n`;
        });
      }

      if (recipe.instructions && recipe.instructions.trim()) {
        text += `\n   Приготовление:\n`;
        recipe.instructions.split('\n').forEach(l => {
          text += `   ${l}\n`;
        });
      }

      if (recipe.comments && String(recipe.comments).trim()) {
        text += `\n   Заметка: ${String(recipe.comments).trim()}\n`;
      }

      text += '\n' + thin + '\n\n';
    });
  });

  text += line + '\n';
  text += `Всего рецептов: ${recipes.length}\n`;
  text += line + '\n';

  downloadFile(text, `recipes_${yyyy}-${mm}-${dd}.txt`, 'text/plain;charset=utf-8');
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

      let recipesRaw = parsed.recipes;
      if (!Array.isArray(recipesRaw) && Array.isArray(parsed)) {
        // Поддержка «голого» массива — удобно для recipes.json
        recipesRaw = parsed;
      }
      if (!Array.isArray(recipesRaw)) {
        showMessage('Поле recipes должно быть массивом.', 'error');
        return;
      }
      if (recipesRaw.length === 0) {
        showMessage('Файл не содержит рецептов.');
        return;
      }

      for (let i = 0; i < recipesRaw.length; i++) {
        const err = validateRecipe(recipesRaw[i], i);
        if (err) {
          showMessage('Ошибка валидации: ' + err, 'error');
          return;
        }
      }

      let added = 0, replaced = 0, skipped = 0;

      recipesRaw.forEach(raw => {
        const incoming = normalizeRecipeForImport(raw);
        const currentRecipes = RecipeStore.getAll();
        const existing = currentRecipes.find(
          r => r.name.toLowerCase() === incoming.name.toLowerCase()
        );

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
          builtIn: incoming.builtIn,
          comments: incoming.comments
        };
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
