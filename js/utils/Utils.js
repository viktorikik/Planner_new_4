import { CATEGORIES, PRODUCT_WORDS, UNITS, UNIT_LABELS } from './Constants.js';

// ============================================================
// ВНУТРЕННИЕ ХЕЛПЕРЫ ПАРСЕРА ИНГРЕДИЕНТОВ (не экспортируются)
// ============================================================

// Заголовки блоков — не ингредиенты, не попадают в массив.
const HEADER_KEYWORDS = /^(ингредиенты|состав|продукты|для\s+(теста|начинки|соуса|крема|украшения|подачи|заливки|глазури|маринада|панировки|обжарки))$/i;

function isHeaderLine(line) {
  if (!line) return true;
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/:\s*$/.test(trimmed) && trimmed.length < 60 && !/\d/.test(trimmed)) return true;
  const clean = trimmed.toLowerCase().replace(/[:.]/g, '').trim();
  if (HEADER_KEYWORDS.test(clean)) return true;
  return false;
}

// Нормализация русской единицы измерения в ключ из UNITS.
function normalizeUnit(raw) {
  const u = String(raw).toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  if (/^(кг|килограмм|килограмма|килограммов)/.test(u)) return UNITS.KG;
  if (/^(г|гр|грамм|грамма|граммов)/.test(u)) return UNITS.G;
  if (/^(мл|миллилитр|миллилитра|миллилитров)/.test(u)) return UNITS.ML;
  if (/^(л|литр|литра|литров)/.test(u)) return UNITS.L;
  if (/^(шт|штук|штука|штуки)/.test(u)) return UNITS.PCS;
  if (/^(ст л|столовая ложка|столовых ложек|столовые ложки)/.test(u)) return UNITS.TBSP;
  if (/^(ч л|чайная ложка|чайных ложек|чайные ложки)/.test(u)) return UNITS.TSP;
  if (/^(щепотк|щепоть)/.test(u)) return UNITS.PINCH;
  if (/^(зубчик|зубчика|зубчиков)/.test(u)) return UNITS.CLOVE;
  if (/^(пучок|пучка|пучков)/.test(u)) return UNITS.BUNCH;
  return null;
}

// Регулярка для поиска единицы в строке (только распознавание, не нормализация).
const UNIT_REGEX = '(кг|килограмм[аов]*|гр|грамм[аов]*|г|мл|миллилитр[аов]*|литр[аов]*|л|штук[аи]?|шт|ст\\.?\\s*л\\.?|столов[а-я]+\\s+ложк[а-я]+|ч\\.?\\s*л\\.?|чайн[а-я]+\\s+ложк[а-я]+|щепотк[а-я]*|щепоть|зубчик[аов]*|пучок|пучка|пучков|пуч)';

// Чистит имя ингредиента от мусора: скобок, «по вкусу», висячих чисел,
// диапазонов в конце, пунктуации по краям. Идемпотентна.
function cleanupName(name) {
  let s = String(name || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';

  // 1. Скобки и их содержимое («(≈300 г)», «(4 ст. л.)», «(по желанию)»).
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

  // 2. «по вкусу», «по желанию», «для подачи» и т.п.
  s = s.replace(/\s+по\s+(вкусу|желанию)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\s+для\s+(подачи|украшения|теста|начинки|соуса|крема|заливки|глазури|обжарки|панировки|маринада)\s*$/gi, '').replace(/\s+/g, ' ').trim();

  // 3. Пунктуация по краям.
  s = s.replace(/^[\s\-–—,;:.]+|[\s\-–—,;:.]+$/g, '').trim();

  // 4. Диапазон в конце: «2-3», «600-800».
  s = s.replace(/\s+\d+([.,]\d+)?\s*[-–—]\s*\d+([.,]\d+)?\s*$/g, '').trim();

  // 5. Открытый диапазон: «2-», «2-.».
  s = s.replace(/\s+\d+\s*[-–—]\s*\.?\s*$/g, '').trim();

  // 6. Одиночное число в конце: «Картофель 2».
  s = s.replace(/\s+\d+([.,]\d+)?\s*$/g, '').trim();

  // 7. Ещё раз пунктуация (после удаления хвостов).
  s = s.replace(/^[\s\-–—,;:.]+|[\s\-–—,;:.]+\s*$/g, '').trim();

  // 8. Финальная нормализация пробелов.
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

// Разбирает одну строку ингредиента в { name, amount, unit }.
function parseIngredientLine(line) {
  let s = String(line)
    .replace(/[–—]/g, '-')
    .replace(/^[•\-*]\s*/, '')
    .replace(/^\d+[.)]\s+/, '')
    .trim();

  // Скобки как правило — пояснения («≈300 г», «4 ст. л.», «по желанию»).
  // Удаляем их, чтобы не мешали. Содержимое не сохраняем.
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

  // Попытка 1: «число [ - число ] единица» — «Свинина 1,2 кг», «Картофель 2-3 шт».
  const withNumber = new RegExp(
    '(\\d+(?:[.,]\\d+)?)' +
    '(?:\\s*[-–—]\\s*(\\d+(?:[.,]\\d+)?))?' +
    '\\s*' + UNIT_REGEX,
    'i'
  );
  const m1 = s.match(withNumber);
  if (m1) {
    const num1 = parseFloat(m1[1].replace(',', '.'));
    let num = num1;
    if (m1[2]) {
      const num2 = parseFloat(m1[2].replace(',', '.'));
      num = (num1 + num2) / 2; // середина диапазона
    }
    let unit = normalizeUnit(m1[3]);
    if (unit === UNITS.KG) { num = num * 1000; unit = UNITS.G; }
    else if (unit === UNITS.L) { num = num * 1000; unit = UNITS.ML; }
    const name = cleanupName(s.replace(m1[0], ''));
    return { name: name || cleanupName(s), amount: num, unit };
  }

  // Попытка 2: только единица, без числа — «Сахар коричневый ст.л.».
  const onlyUnit = new RegExp('\\s*' + UNIT_REGEX + '\\s*\\.?\\s*$', 'i');
  const m2 = s.match(onlyUnit);
  if (m2) {
    const unit = normalizeUnit(m2[1]);
    const name = cleanupName(s.replace(m2[0], ''));
    return { name: name || cleanupName(s), amount: null, unit };
  }

  return { name: cleanupName(s), amount: null, unit: null };
}

// Форматирует число: целые — как есть, дробные — через запятую.
function formatNumber(n) {
  if (Number.isInteger(n)) return String(n);
  return String(n).replace('.', ',');
}

// ============================================================
// ПУБЛИЧНЫЙ ОБЪЕКТ UTILS
// ============================================================

export const Utils = {
  formatDate(date) {
    const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  },

  formatDateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  daysAgo(dateStr) {
    if (!dateStr) return null;
    const today = new Date();
    const d = new Date(dateStr);
    const diff = Math.floor((today - d) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'сегодня';
    if (diff === 1) return 'вчера';
    if (diff < 7) return `${diff} дня назад`;
    if (diff < 14) return 'неделю назад';
    if (diff < 30) return `${Math.floor(diff / 7)} недели назад`;
    return `${diff} дней назад`;
  },

  guessCategory(name) {
    const lower = name.toLowerCase();
    if (lower.includes('пирог') || lower.includes('пирож') || lower.includes('торт') ||
        lower.includes('кекс') || lower.includes('печенье') || lower.includes('булочк') ||
        lower.includes('хлеб') || lower.includes('блин') || lower.includes('олад') ||
        lower.includes('маффин') || lower.includes('брауни') || lower.includes('чизкейк') ||
        lower.includes('круассан') || lower.includes('кулич') || lower.includes('сдоб') ||
        lower.includes('вафл') || lower.includes('пончик') || lower.includes('эклер') ||
        lower.includes('профитрол') || lower.includes('тарт') || lower.includes('пирожн') ||
        lower.includes('пряник') || lower.includes('бисквит') || lower.includes('капкейк') ||
        lower.includes('корж') || lower.includes('багет') || lower.includes('лаваш')) {
      return CATEGORIES.BAKERY;
    }
    if (lower.includes('суп') || lower.includes('борщ') || lower.includes('пюре') || lower.includes('бульон')) return CATEGORIES.SOUP;
    if (lower.includes('салат') || lower.includes('винегрет') || lower.includes('овощ') || lower.includes('зелень')) return CATEGORIES.SALAD;
    if (lower.includes('котлет') || lower.includes('запекан') || lower.includes('тушен') ||
        lower.includes('колбас') || lower.includes('жарен') || lower.includes('печень') ||
        lower.includes('мясо') || lower.includes('курин') || lower.includes('индей') ||
        lower.includes('рыб') || lower.includes('бифштекс') || lower.includes('стейк') ||
        lower.includes('паста') || lower.includes('макарон') || lower.includes('греч') ||
        lower.includes('рис') || lower.includes('плов') || lower.includes('картош') ||
        lower.includes('каш')) return CATEGORIES.MAIN;
    return CATEGORIES.OTHER;
  },

  getWeekDays(baseDate) {
    const start = new Date(baseDate);
    const day = start.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + offset);
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      week.push(d);
    }
    return week;
  },

  isIngredientLine(line) {
    if (!line || line.length < 3) return false;
    const lower = line.toLowerCase();
    const hasNumber = /\d+/.test(line);
    const hasUnit = /(грамм|гр|мл|литр|кг|ст\.|ч\.|шт|зуб|пуч|ветк|головк|щепотк|кус|ломтик|пласт|лист|горст|капл|столов|чайн|десертн|стакан|банк|пакет|упаковк|коробк|баночк|бутылк|капля|щепотка|головка|пучок|веточка|лист|горсть|столовая ложка|чайная ложка|десертная ложка)/i.test(line);
    const hasProduct = PRODUCT_WORDS.some(word => lower.includes(word));
    const hasMarker = /^[•\-*]\s*/.test(line);
    let score = 0;
    if (hasNumber) score++;
    if (hasUnit) score++;
    if (hasProduct) score++;
    if (hasMarker) score++;
    return score >= 2;
  },

  parseRecipeText(text) {
    const lines = String(text || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const ingredients = [];
    for (const line of lines) {
      if (isHeaderLine(line)) continue;
      if (line.length > 150) continue;
      const parsed = parseIngredientLine(line);
      if (parsed.name) ingredients.push(parsed);
    }

    let title = '';
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const candidate = lines[i];
      if (isHeaderLine(candidate)) continue;
      if (candidate.length < 3 || candidate.length > 80) continue;
      if (/\d/.test(candidate)) continue;
      if (!this.isIngredientLine(candidate)) {
        title = candidate;
        break;
      }
    }
    if (!title && lines.length > 0) title = lines[0];

    return { title, ingredients };
  },

  formatIngredient(ing) {
    if (!ing) return '';
    if (typeof ing === 'string') return ing;
    const name = ing.name || '';
    if (ing.amount == null) {
      if (ing.unit) {
        const label = UNIT_LABELS[ing.unit] || ing.unit;
        return `${name} — ${label}`.trim();
      }
      return name;
    }
    if (ing.unit === UNITS.G && ing.amount >= 1000) {
      return `${name} — ${formatNumber(ing.amount / 1000)} кг`.trim();
    }
    if (ing.unit === UNITS.ML && ing.amount >= 1000) {
      return `${name} — ${formatNumber(ing.amount / 1000)} л`.trim();
    }
    const label = UNIT_LABELS[ing.unit] || '';
    const amountStr = formatNumber(ing.amount);
    return label ? `${name} — ${amountStr} ${label}`.trim() : `${name} — ${amountStr}`.trim();
  },

  formatIngredientsToText(ingredients) {
    if (!Array.isArray(ingredients)) return '';
    return ingredients
      .map(ing => this.formatIngredient(ing))
      .filter(s => s.length > 0)
      .join('\n');
  },

  // Чистит имя ингредиента от мусора. Публичный метод — используется
  // в RecipeStore (миграция при загрузке) и ShoppingList (агрегация).
  cleanIngredientName(name) {
    return cleanupName(name);
  },

  // Форматирует число с запятой для дробных. Публичный метод — используется
  // в ShoppingList для агрегированных количеств.
  formatNumber(n) {
    return formatNumber(n);
  },

  debounce(func, delay = 300) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
      }, delay);
    };
  }
};
