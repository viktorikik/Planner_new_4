import { CONSTANTS } from '../utils/Constants.js';
import { trapFocus } from '../utils/focusTrap.js';

// ============================================================
// ОБУЧАЮЩИЙ ТУР (слайды).
// Открывается при первом запуске (после welcome) и по кнопке «❓»
// в шапке. Флаг «показано» хранится в localStorage.
// ============================================================
export const Onboarding = (function() {
  let currentSlide = 0;
  let slides = [];
  let dots = [];

  let overlay, slidesEl, dotsEl, prevBtn, nextBtn, skipBtn, closeBtn;

  // ---------- Инициализация ----------
  function init() {
    overlay = document.getElementById(CONSTANTS.SELECTORS.onboardingOverlay);
    if (!overlay) return;

    slidesEl = document.getElementById(CONSTANTS.SELECTORS.onboardingSlides);
    dotsEl = document.getElementById(CONSTANTS.SELECTORS.onboardingDots);
    prevBtn = document.getElementById(CONSTANTS.SELECTORS.onboardingPrev);
    nextBtn = document.getElementById(CONSTANTS.SELECTORS.onboardingNext);
    skipBtn = document.getElementById(CONSTANTS.SELECTORS.onboardingSkip);
    closeBtn = document.getElementById(CONSTANTS.SELECTORS.onboardingClose);

    slides = Array.from(slidesEl.querySelectorAll('.onboarding-slide'));

    // Точки-индикаторы (по одной на слайд)
    slides.forEach(function() {
      const dot = document.createElement('span');
      dot.className = 'onboarding-dot';
      dotsEl.appendChild(dot);
    });
    dots = Array.from(dotsEl.children);

    // Навигация
    prevBtn.addEventListener('click', function() { goTo(currentSlide - 1); });
    nextBtn.addEventListener('click', function() {
      if (currentSlide === slides.length - 1) close(true);
      else goTo(currentSlide + 1);
    });
    skipBtn.addEventListener('click', function() { close(true); });
    closeBtn.addEventListener('click', function() { close(true); });

    // Клик по оверлею (вне модалки) и Escape — закрывают тур
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) close(true);
    });
    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') close(true);
    });

    // Кнопка «❓» в шапке — всегда открывает тур
    const helpBtn = document.getElementById(CONSTANTS.SELECTORS.onboardingHelpBtn);
    if (helpBtn) helpBtn.addEventListener('click', open);
  }

  // ---------- Открытие ----------
  function open() {
    showSlide(0);
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    trapFocus(overlay, function() { close(false); });
  }

  // ---------- Закрытие ----------
  // markShown = true → отметить тур как показанный
  function close(markShown) {
    if (!overlay.classList.contains('active')) return;

    overlay.classList.remove('active');
    document.body.style.overflow = '';

    if (overlay._trapFocusCleanup) {
      overlay._trapFocusCleanup();
      delete overlay._trapFocusCleanup;
    }

    if (markShown) {
      try {
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.ONBOARDING_SHOWN, '1');
      } catch (e) {
        // Если localStorage недоступен — молча игнорируем,
        // тур просто покажется снова при следующем запуске.
      }
    }
  }

  // ---------- Навигация по слайдам ----------
  function goTo(index) {
    if (index < 0 || index >= slides.length) return;
    showSlide(index);
  }

  function showSlide(index) {
    currentSlide = index;

    slides.forEach(function(s, i) {
      s.classList.toggle('active', i === index);
    });
    dots.forEach(function(d, i) {
      d.classList.toggle('active', i === index);
    });

    prevBtn.disabled = index === 0;
    nextBtn.textContent = index === slides.length - 1 ? 'Готово' : 'Далее';
    skipBtn.style.visibility = index === slides.length - 1 ? 'hidden' : 'visible';
  }

  // ---------- Первый запуск ----------
  function shouldShow() {
    try {
      return localStorage.getItem(CONSTANTS.STORAGE_KEYS.ONBOARDING_SHOWN) !== '1';
    } catch (e) {
      return false;
    }
  }

  return { init, open, close, shouldShow };
})();
