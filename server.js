const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8086;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Ensure DB directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// User DB File
const FILE_USERS = path.join(DATA_DIR, 'users.json');
if (!fs.existsSync(FILE_USERS)) {
    fs.writeFileSync(FILE_USERS, JSON.stringify([]), 'utf8');
}

// Notifications DB File
const FILE_NOTIFICATIONS = path.join(DATA_DIR, 'notifications.json');
if (!fs.existsSync(FILE_NOTIFICATIONS)) {
    fs.writeFileSync(FILE_NOTIFICATIONS, JSON.stringify([]), 'utf8');
}

// In-Memory Sessions (Token -> User Info)
// For production, this could be saved in a database, but in-memory is standard and clean.
const SESSIONS = {};

// Helper functions for reading/writing JSON files safely
function readJSON(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return [];
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        console.error(`Error reading ${filePath}:`, e);
        return [];
    }
}

function writeJSON(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error(`Error writing ${filePath}:`, e);
        return false;
    }
}

// Cryptography Helpers
function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Pre-register Arthur C and migrate global database files
const arthurUsername = 'Arthur C';
const arthurPassword = 'Mhydws.77';
const cleanArthur = arthurUsername.toLowerCase();
let users = readJSON(FILE_USERS);
let arthurExists = users.some(u => u.username.toLowerCase() === cleanArthur);

if (!arthurExists) {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(arthurPassword, salt);
    const arthurId = crypto.randomUUID();
    const arthurUser = {
        id: arthurId,
        username: arthurUsername,
        passwordHash,
        salt,
        createdAt: new Date().toISOString()
    };
    users.push(arthurUser);
    writeJSON(FILE_USERS, users);
    console.log(`Pre-registered user: ${arthurUsername}`);

    // Migrate old global data to Arthur C's new user-isolated files
    const globalFinance = path.join(DATA_DIR, 'finance_transactions.json');
    const globalAccounts = path.join(DATA_DIR, 'streaming_accounts.json');
    const globalCustomers = path.join(DATA_DIR, 'streaming_customers.json');

    const arthurFinance = path.join(DATA_DIR, `user_${arthurId}_finance.json`);
    const arthurAccounts = path.join(DATA_DIR, `user_${arthurId}_accounts.json`);
    const arthurCustomers = path.join(DATA_DIR, `user_${arthurId}_customers.json`);

    if (fs.existsSync(globalFinance)) {
        fs.copyFileSync(globalFinance, arthurFinance);
        console.log(`Migrated global finance data to user: ${arthurUsername}`);
    }
    if (fs.existsSync(globalAccounts)) {
        fs.copyFileSync(globalAccounts, arthurAccounts);
        console.log(`Migrated global accounts data to user: ${arthurUsername}`);
    }
    if (fs.existsSync(globalCustomers)) {
        fs.copyFileSync(globalCustomers, arthurCustomers);
        console.log(`Migrated global customers data to user: ${arthurUsername}`);
    }
}

// Authentication Middleware
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
    }

    const token = authHeader.split(' ')[1];
    const session = SESSIONS[token];

    if (!session) {
        return res.status(401).json({ error: 'Sessão expirada ou token inválido. Faça login novamente.' });
    }

    // Attach user info to request
    req.userId = session.userId;
    req.username = session.username;
    next();
}

// ==================================================
// AUTHENTICATION API ROUTES
// ==================================================

// 1. Register User
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
        return res.status(400).json({ error: 'O nome de usuário deve ter pelo menos 3 caracteres.' });
    }

    if (password.length < 4) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres.' });
    }

    const users = readJSON(FILE_USERS);
    const userExists = users.some(u => u.username.toLowerCase() === cleanUsername);

    if (userExists) {
        return res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
    }

    // Hash password with salt
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);

    const newUser = {
        id: crypto.randomUUID(),
        username: username.trim(), // Keep original casing
        passwordHash,
        salt,
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    if (writeJSON(FILE_USERS, users)) {
        res.status(201).json({ success: true, message: 'Usuário cadastrado com sucesso.' });
    } else {
        res.status(500).json({ error: 'Erro ao salvar novo usuário no banco de dados.' });
    }
});

// 2. Login User
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const users = readJSON(FILE_USERS);
    const user = users.find(u => u.username.toLowerCase() === cleanUsername);

    if (!user) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    // Verify hash
    const verifiedHash = hashPassword(password, user.salt);
    if (verifiedHash !== user.passwordHash) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    // Generate session token
    const token = generateToken();
    SESSIONS[token] = {
        userId: user.id,
        username: user.username,
        createdAt: Date.now()
    };

    res.json({
        success: true,
        token,
        username: user.username
    });
});

// ==================================================
// DATA API ROUTES (Isolated per User)
// ==================================================

// Helper to get user specific database path
function getUserFilePath(userId, type) {
    return path.join(DATA_DIR, `user_${userId}_${type}.json`);
}

// 1. Finance Transactions
app.get('/api/finance/transactions', requireAuth, (req, res) => {
    const filePath = getUserFilePath(req.userId, 'finance');
    res.json(readJSON(filePath));
});

app.post('/api/finance/transactions', requireAuth, (req, res) => {
    const data = req.body;
    if (Array.isArray(data)) {
        const filePath = getUserFilePath(req.userId, 'finance');
        if (writeJSON(filePath, data)) {
            res.json({ success: true, count: data.length });
        } else {
            res.status(500).json({ error: 'Failed to write user finance database file.' });
        }
    } else {
        res.status(400).json({ error: 'Data must be an array of transactions.' });
    }
});

// 2. Streaming Accounts
app.get('/api/streaming/accounts', requireAuth, (req, res) => {
    const filePath = getUserFilePath(req.userId, 'accounts');
    res.json(readJSON(filePath));
});

app.post('/api/streaming/accounts', requireAuth, (req, res) => {
    const data = req.body;
    if (Array.isArray(data)) {
        const filePath = getUserFilePath(req.userId, 'accounts');
        if (writeJSON(filePath, data)) {
            res.json({ success: true, count: data.length });
        } else {
            res.status(500).json({ error: 'Failed to write user accounts database file.' });
        }
    } else {
        res.status(400).json({ error: 'Data must be an array of accounts.' });
    }
});

// 3. Streaming Customers
app.get('/api/streaming/customers', requireAuth, (req, res) => {
    const filePath = getUserFilePath(req.userId, 'customers');
    res.json(readJSON(filePath));
});

app.post('/api/streaming/customers', requireAuth, (req, res) => {
    const data = req.body;
    if (Array.isArray(data)) {
        const filePath = getUserFilePath(req.userId, 'customers');
        if (writeJSON(filePath, data)) {
            res.json({ success: true, count: data.length });
        } else {
            res.status(500).json({ error: 'Failed to write user customers database file.' });
        }
    } else {
        res.status(400).json({ error: 'Data must be an array of customers.' });
    }
});

// ==================================================
// NOTIFICATIONS AND MESSAGING API ROUTES
// ==================================================

// 1. Get list of other registered users (safe, no passwords/salts)
app.get('/api/users', requireAuth, (req, res) => {
    const allUsers = readJSON(FILE_USERS);
    const otherUsers = allUsers
        .filter(u => u.id !== req.userId)
        .map(u => ({ id: u.id, username: u.username }));
    res.json(otherUsers);
});

// 2. Get received notifications
app.get('/api/notifications', requireAuth, (req, res) => {
    const notifications = readJSON(FILE_NOTIFICATIONS);
    const userNotifications = notifications
        .filter(n => n.receiverId === req.userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(userNotifications);
});

// 3. Send notification/message to another user
app.post('/api/notifications', requireAuth, (req, res) => {
    const { receiverId, message } = req.body;
    if (!receiverId || !message) {
        return res.status(400).json({ error: 'Receiver ID and message are required.' });
    }

    const allUsers = readJSON(FILE_USERS);
    const receiverExists = allUsers.some(u => u.id === receiverId);
    if (!receiverExists) {
        return res.status(404).json({ error: 'Receiver user not found.' });
    }

    const notifications = readJSON(FILE_NOTIFICATIONS);
    const newNotification = {
        id: crypto.randomUUID(),
        senderId: req.userId,
        senderUsername: req.username,
        receiverId: receiverId,
        message: message,
        isRead: false,
        createdAt: new Date().toISOString()
    };

    notifications.push(newNotification);
    if (writeJSON(FILE_NOTIFICATIONS, notifications)) {
        res.status(201).json({ success: true, notification: newNotification });
    } else {
        res.status(500).json({ error: 'Failed to save notification.' });
    }
});

// 4. Mark notification as read
app.patch('/api/notifications/:id/read', requireAuth, (req, res) => {
    const { id } = req.params;
    const notifications = readJSON(FILE_NOTIFICATIONS);
    const notif = notifications.find(n => n.id === id);

    if (!notif) {
        return res.status(404).json({ error: 'Notification not found.' });
    }

    if (notif.receiverId !== req.userId) {
        return res.status(403).json({ error: 'Unauthorized to access this notification.' });
    }

    notif.isRead = true;
    if (writeJSON(FILE_NOTIFICATIONS, notifications)) {
        res.json({ success: true, notification: notif });
    } else {
        res.status(500).json({ error: 'Failed to update notification.' });
    }
});

// Serve Static Frontend Files
app.use(express.static(__dirname));

// Start server
app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`SERVIDOR MULTI-USUÁRIO INICIADO COM SUCESSO!`);
    console.log(`Acesse o painel de Finanças e Vendas em:`);
    console.log(`   👉 http://localhost:${PORT}`);
    console.log(`Acesse o painel de Revenda de Streaming em:`);
    console.log(`   👉 http://localhost:${PORT}/streaming`);
    console.log(`Pasta dos bancos de dados: ${DATA_DIR}`);
    console.log(`==================================================`);
});
