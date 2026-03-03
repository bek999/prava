const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'cards.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const adminSessions = new Map();

// Middleware
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(origin => origin.trim()).filter(Boolean);
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    }
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

function createToken() {
    return crypto.randomBytes(32).toString('hex');
}

function cleanupSessions() {
    const now = Date.now();
    for (const [token, expiresAt] of adminSessions.entries()) {
        if (expiresAt <= now) {
            adminSessions.delete(token);
        }
    }
}

function requireAdmin(req, res, next) {
    cleanupSessions();
    const authHeader = req.headers.authorization || '';
    const [, tokenFromHeader] = authHeader.match(/^Bearer\s+(.+)$/i) || [];
    const token = tokenFromHeader || req.headers['x-admin-token'];

    if (!token || !adminSessions.has(token)) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    next();
}

// Multer setup for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|svg/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error("Only images (jpeg, jpg, png, svg) are allowed"));
    }
});

// Helper to read/write data
const readData = () => {
    if (!fs.existsSync(DATA_FILE)) return [];
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
};

const writeData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
};

const imagePathFromUrl = (imageUrl) => {
    const relativePath = String(imageUrl || '').replace(/^\/+/, '');
    return path.join(__dirname, 'public', relativePath);
};

// --- API Endpoints ---

// Login (Simple hardcoded check)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = createToken();
        const expiresAt = Date.now() + TOKEN_TTL_MS;
        adminSessions.set(token, expiresAt);
        res.json({ success: true, token, expiresAt });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Get all cards
app.get('/api/cards', (req, res) => {
    const cards = readData();
    res.json(cards);
});

// Add a card
app.post('/api/cards', requireAdmin, upload.single('image'), (req, res) => {
    try {
        const { question, answer, details, category } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

        if (!question || !answer) {
            return res.status(400).json({ success: false, message: 'Question and answer are required' });
        }

        const cards = readData();
        const newCard = {
            id: Date.now().toString(),
            question,
            answer,
            details,
            category,
            imageUrl
        };

        cards.push(newCard);
        writeData(cards);

        res.json({ success: true, card: newCard });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Update a card
app.put('/api/cards/:id', requireAdmin, upload.single('image'), (req, res) => {
    try {
        const { id } = req.params;
        const { question, answer, details, category } = req.body;
        let cards = readData();
        const cardIndex = cards.findIndex(c => c.id === id);

        if (cardIndex === -1) {
            return res.status(404).json({ success: false, message: 'Card not found' });
        }

        const card = cards[cardIndex];

        // If a new image uploaded — delete old one
        if (req.file) {
            if (card.imageUrl) {
                const oldPath = imagePathFromUrl(card.imageUrl);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
            card.imageUrl = `/uploads/${req.file.filename}`;
        }

        card.question = question || card.question;
        card.answer = answer || card.answer;
        card.details = details !== undefined ? details : card.details;
        card.category = category || card.category;

        cards[cardIndex] = card;
        writeData(cards);
        res.json({ success: true, card });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Delete a card
app.delete('/api/cards/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    let cards = readData();
    const cardIndex = cards.findIndex(c => c.id === id);

    if (cardIndex !== -1) {
        // Optional: Delete image file if it exists
        const card = cards[cardIndex];
        if (card.imageUrl) {
            const imagePath = imagePathFromUrl(card.imageUrl);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        cards = cards.filter(c => c.id !== id);
        writeData(cards);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'Card not found' });
    }
});

// Initialize
if (!fs.existsSync(DATA_FILE)) {
    writeData([]);
}
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
