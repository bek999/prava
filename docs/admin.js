const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || '';
const API_ORIGIN = API_BASE.replace(/\/+$/, '');
const API_URL = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';

function resolveAssetUrl(url) {
    if (!url) return 'https://placehold.co/40x40?text=?';
    if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
    if (url.startsWith('/') && API_ORIGIN) return `${API_ORIGIN}${url}`;
    return url;
}
let selectedFile = null;       // для формы добавления
let editSelectedFile = null;   // для модала редактирования
let allAdminCards = [];        // все карточки (для фильтра)
let adminCurrentCategory = 'all';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupLogin();
    setupDragAndDrop();
    setupFormSubmit();
    setupLogout();
    setupEditDragAndDrop();
    setupEditFormSubmit();
});

// --- Auth Logic ---

function checkAuth() {
    const token = sessionStorage.getItem('token');
    const loginSection = document.getElementById('login-section');
    const dashboardSection = document.getElementById('dashboard-section');

    if (token) {
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        loadCardsForAdmin();
    } else {
        loginSection.style.display = 'block';
        dashboardSection.style.display = 'none';
    }
}

function setupLogin() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.status === 401) {
                sessionStorage.removeItem('token');
                checkAuth();
                alert('Session expired. Please log in again.');
                return;
            }

            if (data.success) {
                sessionStorage.setItem('token', data.token);
                checkAuth();
                form.reset();
            } else {
                alert('Ошибка входа: ' + data.message);
            }
        } catch (err) {
            console.error(err);
            alert('Ошибка сети');
        }
    });
}

function setupLogout() {
    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('token');
        checkAuth();
    });
}

function getAuthHeaders() {
    const token = sessionStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

// --- Drag & Drop Logic ---

function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const preview = document.getElementById('image-preview');
    const dropText = document.getElementById('drop-zone-text');

    // Click to open file dialog
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    // Drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            handleFile(files[0]);
        }
    });

    function handleFile(file) {
        // Validate type
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml'];
        if (!validTypes.includes(file.type)) {
            alert('Только изображения (JPG, PNG, SVG)');
            return;
        }

        // Validate size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('Файл слишком большой (макс 5MB)');
            return;
        }

        selectedFile = file;

        // Preview
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = function () {
            preview.src = reader.result;
            preview.style.display = 'block';
            dropText.style.display = 'none';
        }
    }
}

// --- Card Management ---

async function setupFormSubmit() {
    const form = document.getElementById('add-card-form');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        if (selectedFile) {
            formData.set('image', selectedFile);
        }

        try {
            const res = await fetch(`${API_URL}/cards`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: formData // No headers needed, fetch sets boundary for FormData
            });
            const data = await res.json();

            if (data.success) {
                alert('Карточка добавлена!');
                form.reset();
                resetPreview();
                selectedFile = null;
                loadCardsForAdmin();
            } else {
                alert('Ошибка: ' + data.message);
            }
        } catch (err) {
            console.error(err);
            alert('Ошибка при сохранении');
        }
    });
}

function resetPreview() {
    const preview = document.getElementById('image-preview');
    const dropText = document.getElementById('drop-zone-text');
    preview.style.display = 'none';
    preview.src = '';
    dropText.style.display = 'block';
}

async function loadCardsForAdmin() {
    const tbody = document.getElementById('cards-table-body');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Загрузка...</td></tr>';

    try {
        const res = await fetch(`${API_URL}/cards`);
        allAdminCards = await res.json();
        renderAdminTable();
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Ошибка загрузки</td></tr>';
    }
}

function renderAdminTable() {
    const tbody = document.getElementById('cards-table-body');
    tbody.innerHTML = '';

    const cards = adminCurrentCategory === 'all'
        ? allAdminCards
        : allAdminCards.filter(c => c.category === adminCurrentCategory);

    if (cards.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No cards</td></tr>';
        return;
    }

    cards.forEach(card => {
        const tr = document.createElement('tr');

        const tdImage = document.createElement('td');
        const img = document.createElement('img');
        img.src = resolveAssetUrl(card.imageUrl);
        img.className = 'thumbnail-sm';
        img.alt = 'img';
        tdImage.appendChild(img);

        const tdQuestion = document.createElement('td');
        tdQuestion.textContent = card.question || '';

        const tdAnswer = document.createElement('td');
        tdAnswer.textContent = card.answer || '';

        const tdCategory = document.createElement('td');
        const categoryBadge = document.createElement('span');
        categoryBadge.style.background = '#f1f5f9';
        categoryBadge.style.padding = '2px 6px';
        categoryBadge.style.borderRadius = '4px';
        categoryBadge.style.fontSize = '0.8em';
        categoryBadge.textContent = card.category || '-';
        tdCategory.appendChild(categoryBadge);

        const tdActions = document.createElement('td');
        tdActions.style.textAlign = 'right';
        const actionWrap = document.createElement('div');
        actionWrap.style.display = 'flex';
        actionWrap.style.gap = '0.4rem';
        actionWrap.style.justifyContent = 'flex-end';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm';
        editBtn.style.background = '#f1f5f9';
        editBtn.style.color = 'var(--text-main)';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => openEditModal(card.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteCard(card.id));

        actionWrap.appendChild(editBtn);
        actionWrap.appendChild(deleteBtn);
        tdActions.appendChild(actionWrap);

        tr.appendChild(tdImage);
        tr.appendChild(tdQuestion);
        tr.appendChild(tdAnswer);
        tr.appendChild(tdCategory);
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });
}

function adminFilterCategory(category) {
    adminCurrentCategory = category;
    document.querySelectorAll('#admin-category-filters .category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick') === `adminFilterCategory('${category}')`);
    });
    renderAdminTable();
}


// Expose delete function relative to window for HTML onclick
window.deleteCard = async function (id) {
    if (!confirm('Вы уверены, что хотите удалить эту карточку?')) return;

    try {
        const res = await fetch(`${API_URL}/cards/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.status === 401) {
            sessionStorage.removeItem('token');
            checkAuth();
            alert('Session expired. Please log in again.');
            return;
        }
        if (data.success) {
            loadCardsForAdmin();
        } else {
            alert('Не удалось удалить: ' + data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Ошибка сети');
    }
}

// ==================== EDIT MODAL ====================

window.openEditModal = function (id) {
    const card = allAdminCards.find(c => c.id === id);
    if (!card) return;

    document.getElementById('edit-card-id').value = card.id;
    document.getElementById('edit-question').value = card.question || '';
    document.getElementById('edit-answer').value = card.answer || '';
    document.getElementById('edit-details').value = card.details || '';
    document.getElementById('edit-category').value = card.category || 'Предупреждающие';

    // Reset image preview in modal
    editSelectedFile = null;
    const preview = document.getElementById('edit-image-preview');
    const dropText = document.getElementById('edit-drop-zone-text');
    if (card.imageUrl) {
        preview.src = resolveAssetUrl(card.imageUrl);
        preview.style.display = 'block';
        dropText.style.display = 'none';
    } else {
        preview.src = '';
        preview.style.display = 'none';
        dropText.style.display = 'block';
    }

    document.getElementById('edit-modal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

window.closeEditModal = function () {
    document.getElementById('edit-modal').style.display = 'none';
    document.body.style.overflow = '';
    editSelectedFile = null;
}

// Close modal on backdrop click
document.getElementById('edit-modal').addEventListener('click', function (e) {
    if (e.target === this) closeEditModal();
});

function setupEditFormSubmit() {
    document.getElementById('edit-card-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('edit-card-id').value;
        const formData = new FormData();
        formData.append('question', document.getElementById('edit-question').value);
        formData.append('answer', document.getElementById('edit-answer').value);
        formData.append('details', document.getElementById('edit-details').value);
        formData.append('category', document.getElementById('edit-category').value);
        if (editSelectedFile) formData.append('image', editSelectedFile);

        try {
            const res = await fetch(`${API_URL}/cards/${id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: formData
            });
            const data = await res.json();
            if (res.status === 401) {
                sessionStorage.removeItem('token');
                checkAuth();
                alert('Session expired. Please log in again.');
                return;
            }
            if (data.success) {
                closeEditModal();
                loadCardsForAdmin();
            } else {
                alert('Ошибка: ' + data.message);
            }
        } catch (err) {
            console.error(err);
            alert('Ошибка при сохранении');
        }
    });
}

function setupEditDragAndDrop() {
    const dropZone = document.getElementById('edit-drop-zone');
    const fileInput = document.getElementById('edit-file-input');
    const preview = document.getElementById('edit-image-preview');
    const dropText = document.getElementById('edit-drop-zone-text');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleEditFile(e.target.files[0]);
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
        dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); })
    );
    ['dragenter', 'dragover'].forEach(ev =>
        dropZone.addEventListener(ev, () => dropZone.classList.add('drag-over'))
    );
    ['dragleave', 'drop'].forEach(ev =>
        dropZone.addEventListener(ev, () => dropZone.classList.remove('drag-over'))
    );
    dropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files.length) handleEditFile(e.dataTransfer.files[0]);
    });

    function handleEditFile(file) {
        const valid = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml'];
        if (!valid.includes(file.type)) { alert('Только изображения (JPG, PNG, SVG)'); return; }
        if (file.size > 5 * 1024 * 1024) { alert('Файл слишком большой (макс 5MB)'); return; }
        editSelectedFile = file;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = () => {
            preview.src = reader.result;
            preview.style.display = 'block';
            dropText.style.display = 'none';
        };
    }
}
