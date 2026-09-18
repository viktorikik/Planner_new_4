import { STATUSES } from '../utils/Constants.js';
import { Utils } from '../utils/Utils.js';
import { DishStore } from '../stores/DishStore.js';
import { Renderer } from '../ui/Renderer.js';

// ============================================================
// ПЕЧАТЬ МЕНЮ НА НЕДЕЛЮ
// Формирует HTML в #printArea и вызывает системный диалог печати.
// ============================================================
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

const DAY_NAMES = [
  'Понедельник', 'Вторник', 'Среда', 'Четверг',
  'Пятница', 'Суббота', 'Воскресенье'
];

// «22–28 сентября 2026» или «30 сентября – 6 октября 2026»
function formatWeekRange(weekDays) {
  const first = weekDays[0];
  const last = weekDays[weekDays.length - 1];
  const d1 = first.getDate();
  const d2 = last.getDate();
  const m1 = first.getMonth();
  const m2 = last.getMonth();
  const year = last.getFullYear();

  if (m1 === m2) {
    return `${d1}–${d2} ${MONTHS_GENITIVE[m1]} ${year}`;
  }
  return `${d1} ${MONTHS_GENITIVE[m1]} – ${d2} ${MONTHS_GENITIVE[m2]} ${year}`;
}

export function printWeeklyMenu() {
  const printArea = document.getElementById('printArea');
  if (!printArea) return;

  const baseDate = Renderer.getCurrentDate();
  const weekDays = Utils.getWeekDays(baseDate);

  printArea.innerHTML = '';

  // ---------- Заголовок ----------
  const header = document.createElement('div');
  header.className = 'print-header';

  const title = document.createElement('h1');
  title.className = 'print-title';
  title.textContent = '🍽️ Планировщик меню';
  header.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'print-subtitle';
  subtitle.textContent = 'Меню на неделю: ' + formatWeekRange(weekDays);
  header.appendChild(subtitle);

  printArea.appendChild(header);

  // ---------- Дни недели ----------
  weekDays.forEach((day, idx) => {
    const dateStr = Utils.formatDateLocal(day);
    const dishes = DishStore.getForDate(dateStr);

    const dayEl = document.createElement('div');
    dayEl.className = 'print-day';

    const dayHeader = document.createElement('div');
    dayHeader.className = 'print-day-header';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = DAY_NAMES[idx];
    dayHeader.appendChild(nameSpan);

    const dateSpan = document.createElement('span');
    dateSpan.className = 'print-day-date';
    dateSpan.textContent = Utils.formatDate(day);
    dayHeader.appendChild(dateSpan);

    dayEl.appendChild(dayHeader);

    if (dishes.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'print-day-empty';
      empty.textContent = '— блюда не запланированы';
      dayEl.appendChild(empty);
    } else {
      const ul = document.createElement('ul');
      ul.className = 'print-dishes';

      dishes.forEach(dish => {
        const li = document.createElement('li');

        const mark = document.createElement('span');
        mark.className = 'print-dish-mark';
        mark.textContent = '•';
        li.appendChild(mark);

        li.appendChild(document.createTextNode(dish.name));

        if (dish.status === STATUSES.DONE) {
          const statusSpan = document.createElement('span');
          statusSpan.className = 'print-dish-status';
          statusSpan.textContent = '✓ приготовлено';
          li.appendChild(statusSpan);
        }

        ul.appendChild(li);
      });

      dayEl.appendChild(ul);
    }

    printArea.appendChild(dayEl);
  });

  // ---------- Подвал ----------
  const footer = document.createElement('div');
  footer.className = 'print-footer';
  footer.textContent = 'Сгенерировано: ' + Utils.formatDate(new Date());
  printArea.appendChild(footer);

  // ---------- Печать ----------
  // requestAnimationFrame — чтобы браузер успел применить изменения DOM
  // до открытия диалога печати. Без этого некоторые браузеры печатают
  // пустую страницу.
  requestAnimationFrame(() => {
    window.print();
  });
}
