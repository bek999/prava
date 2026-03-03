const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || '';
const API_ORIGIN = API_BASE.replace(/\/+$/, '');
const API_URL = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';

function resolveAssetUrl(url) {
    if (!url) return 'https://placehold.co/180x180?text=No+Image';
    if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
    if (url.startsWith('/') && API_ORIGIN) return `${API_ORIGIN}${url}`;
    return url;
}

let allCards = [];
let activeCards = []; // карточки после фильтра
let currentIndex = 0;
let currentMode = 'learn'; // 'learn' | 'test'
let isFlipped = false;

// Touch state for swipe
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('DOMContentLoaded', () => {
    loadCards();
});

async function loadCards() {
    try {
        const response = await fetch(`${API_URL}/cards`);
        allCards = await response.json();
        activeCards = [...allCards];
    } catch (error) {
        console.error('Error loading cards:', error);
        allCards = [];
        activeCards = [];
    }
}

function filterCategory(category) {
    // Обновить активный класс на кнопках
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick') === `filterCategory('${category}')`);
    });

    if (category === 'all') {
        activeCards = [...allCards];
    } else {
        activeCards = allCards.filter(c => c.category === category);
    }
}

function startMode(mode) {
    if (activeCards.length === 0) {
        alert('Нет карточек в выбранной категории.');
        return;
    }

    currentMode = mode;
    currentIndex = 0;
    isFlipped = false;

    document.getElementById('mode-select-screen').classList.add('hidden');
    document.getElementById('flashcard-screen').classList.remove('hidden');

    const badge = document.getElementById('mode-badge');
    badge.textContent = mode === 'learn' ? '📖 Обучение' : '🧠 Тест';
    badge.className = 'mode-badge ' + (mode === 'learn' ? 'badge-learn' : 'badge-test');

    const flipHint = document.getElementById('flip-hint');
    const detailsBelow = document.getElementById('fc-details-below');
    const flashcardEl = document.getElementById('flashcard');
    if (mode === 'test') {
        flipHint.classList.remove('hidden');
        detailsBelow.classList.add('hidden');
        flashcardEl.classList.remove('learn-mode');
        flashcardEl.style.cursor = 'pointer';
        flashcardEl.onclick = toggleFlip;
    } else {
        flipHint.classList.add('hidden');
        detailsBelow.classList.add('hidden');
        flashcardEl.classList.add('learn-mode');
        flashcardEl.style.cursor = 'default';
        flashcardEl.onclick = null;
    }

    renderCard();
    setupSwipe();
}

function backToMenu() {
    document.getElementById('flashcard-screen').classList.add('hidden');
    document.getElementById('mode-select-screen').classList.remove('hidden');
    isFlipped = false;
    setFlipped(false, true);
}

function renderCard() {
    const card = activeCards[currentIndex];
    if (!card) return;

    // Reset flip
    setFlipped(false, true);

    const imageUrl = resolveAssetUrl(card.imageUrl);
    document.getElementById('fc-image').src = imageUrl;
    document.getElementById('fc-question').textContent = card.question || '';

    const categoryEl = document.getElementById('fc-category');
    categoryEl.textContent = card.category || '';
    categoryEl.style.display = card.category ? 'inline-block' : 'none';

    // Back side content
    document.getElementById('fc-answer').textContent = card.answer || '';
    document.getElementById('fc-details').textContent = '';

    // In learn mode — show answer on front face too
    if (currentMode === 'learn') {
        document.getElementById('flashcard-inner').classList.remove('has-back');
        renderLearnContent(card.answer || '', card.details || '');
        setDetailsBelow('', false);
    } else {
        document.getElementById('flashcard-inner').classList.add('has-back');
        document.getElementById('fc-question').textContent = card.question || '';
        setDetailsBelow(card.details || '', false);
    }

    // Counter
    document.getElementById('card-counter').textContent = `${currentIndex + 1} / ${activeCards.length}`;

    // Progress bar
    const pct = ((currentIndex + 1) / activeCards.length) * 100;
    document.getElementById('progress-bar').style.width = pct + '%';

    // Prev/next buttons
    document.getElementById('btn-prev').disabled = currentIndex === 0;
    document.getElementById('btn-next').disabled = currentIndex === activeCards.length - 1;
}

function renderLearnContent(answer, details) {
    const questionEl = document.getElementById('fc-question');
    questionEl.textContent = '';

    const answerEl = document.createElement('span');
    answerEl.className = 'learn-answer';
    answerEl.textContent = answer;
    questionEl.appendChild(answerEl);

    if (details) {
        const detailsEl = document.createElement('span');
        detailsEl.className = 'learn-details';
        detailsEl.textContent = details;
        questionEl.appendChild(detailsEl);
    }
}

function toggleFlip() {
    if (currentMode !== 'test') return;
    setFlipped(!isFlipped);
}

function setFlipped(flipped, instant = false) {
    isFlipped = flipped;
    const inner = document.getElementById('flashcard-inner');

    if (instant) {
        inner.style.transition = 'none';
        inner.classList.toggle('flipped', flipped);
        // Force reflow
        inner.offsetHeight;
        inner.style.transition = '';
    } else {
        inner.classList.toggle('flipped', flipped);
    }

    if (currentMode === 'test') {
        const currentCard = activeCards[currentIndex];
        setDetailsBelow(currentCard?.details || '', flipped);
    }
}

function setDetailsBelow(details, visible) {
    const detailsEl = document.getElementById('fc-details-below');
    detailsEl.textContent = details || '';
    detailsEl.classList.toggle('hidden', !visible || !details);
}

function nextCard() {
    if (currentIndex < activeCards.length - 1) {
        currentIndex++;
        renderCard();
    }
}

function prevCard() {
    if (currentIndex > 0) {
        currentIndex--;
        renderCard();
    }
}

function setupSwipe() {
    const card = document.getElementById('flashcard');

    card.removeEventListener('touchstart', onTouchStart);
    card.removeEventListener('touchend', onTouchEnd);
    card.addEventListener('touchstart', onTouchStart, { passive: true });
    card.addEventListener('touchend', onTouchEnd, { passive: true });
}

function onTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}

function onTouchEnd(e) {
    const dx = e.changedTouches[0].screenX - touchStartX;
    const dy = e.changedTouches[0].screenY - touchStartY;

    // Swipe must be mostly horizontal and longer than 50px
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;

    if (dx < 0) {
        // Swipe left → next
        nextCard();
    } else {
        // Swipe right → prev
        prevCard();
    }
}
