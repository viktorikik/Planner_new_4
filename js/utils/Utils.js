import { CATEGORIES, PRODUCT_WORDS } from './Constants.js';

export const Utils = {
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

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
    // Выпечка — проверяем раньше остальных категорий,
    // чтобы «пирог», «торт», «кекс» и т.п. не улетали в «Другое».
    // Важно: используется 'печенье' (полное слово), чтобы не путать с «печенью» (органом).
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
    start.setDate(start.getDate() - start.getDay() + 1);
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
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let title = '';
    let ingredients = [];
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i];
      if (line.length > 2 && line.length < 80 && !/\d/.test(line) && !this.isIngredientLine(line)) {
        title = line;
        break;
      }
    }
    if (!title && lines.length > 0) title = lines[0];
    for (const line of lines) {
      if (this.isIngredientLine(line) && line.length < 100) {
        ingredients.push(line);
      }
    }
    if (ingredients.length === 0) {
      for (const line of lines) {
        if (/\d/.test(line) && line.length < 100 && line.length > 3) {
          ingredients.push(line);
        }
      }
    }
    return { title, ingredients: ingredients.join('\n') };
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
