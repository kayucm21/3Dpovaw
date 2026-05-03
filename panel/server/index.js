const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, '../data/config.json');
const USERS_FILE = path.join(__dirname, '../data/users.json');
const DEVICES_FILE = path.join(__dirname, '../data/devices.json');
const CONNECTIONS_LOG_FILE = path.join(__dirname, '../data/connections-log.json');
let discordMonitorTimer = null;
let lastDiscordServiceState = null;
const oneTimeQrTokens = new Map();
const warpInstallJobs = new Map();
const UPDATE_STATE_FILE = path.join(__dirname, '../data/update.json');
const TIKTOK_DOMAINS = [
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'tiktokcdn.com',
  'tiktokv.com',
  'musical.ly',
  'byteoversea.com',
  'ibytedtos.com',
  'ibyteimg.com',
  'pstatp.com',
  'tik-tokapi.com'
];

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Initialize config
function loadConfig() {
  if (!fs.existsSync(DATA_FILE)) {
    const defaultConfig = {
      installed: false,
      domain: '',
      email: '',
      serverIp: '',
      adminPassword: '',
      installProtocol: 'naive',
      vlessPort: 443,
      vlessWsPath: '/vless',
      vlessAutoPort: true,
      vlessPreferredPorts: [443, 2053, 2083, 2087, 2096, 8443],
      tiktokMode: false,
      warpInstalled: false,
      warpEnabled: false,
      warpLastEgressIpv4: '',
      warpLastEgressIpv6: '',
      warpKillswitch: true,
      discordEnabled: false,
      discordWebhookUrl: '',
      discordIntervalSec: 300,
      proxyUsers: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  const config = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!config.installProtocol) config.installProtocol = 'naive';
  if (!config.vlessPort) config.vlessPort = 443;
  if (!config.vlessWsPath) config.vlessWsPath = '/vless';
  if (typeof config.vlessAutoPort !== 'boolean') config.vlessAutoPort = true;
  if (!Array.isArray(config.vlessPreferredPorts) || config.vlessPreferredPorts.length === 0) {
    config.vlessPreferredPorts = [443, 2053, 2083, 2087, 2096, 8443];
  }
  if (typeof config.tiktokMode !== 'boolean') config.tiktokMode = false;
  if (typeof config.warpInstalled !== 'boolean') config.warpInstalled = false;
  if (typeof config.warpEnabled !== 'boolean') config.warpEnabled = false;
  if (!config.warpLastEgressIpv4) config.warpLastEgressIpv4 = '';
  if (!config.warpLastEgressIpv6) config.warpLastEgressIpv6 = '';
  if (typeof config.warpKillswitch !== 'boolean') config.warpKillswitch = true;
  if (typeof config.discordEnabled !== 'boolean') config.discordEnabled = false;
  if (!config.discordWebhookUrl) config.discordWebhookUrl = '';
  if (!config.discordIntervalSec) config.discordIntervalSec = 300;
  if (!config.proxyUsers) config.proxyUsers = [];
  return config;
}

function saveConfig(config) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(config, null, 2));
}

function loadUpdateState() {
  if (!fs.existsSync(UPDATE_STATE_FILE)) {
    const s = { lastUpdateAt: '', lastResult: '', lastMessage: '' };
    try { fs.writeFileSync(UPDATE_STATE_FILE, JSON.stringify(s, null, 2)); } catch {}
    return s;
  }
  try {
    const s = JSON.parse(fs.readFileSync(UPDATE_STATE_FILE, 'utf8'));
    return {
      lastUpdateAt: String(s.lastUpdateAt || ''),
      lastResult: String(s.lastResult || ''),
      lastMessage: String(s.lastMessage || '')
    };
  } catch {
    return { lastUpdateAt: '', lastResult: '', lastMessage: '' };
  }
}

function saveUpdateState(next) {
  const s = {
    lastUpdateAt: String(next.lastUpdateAt || ''),
    lastResult: String(next.lastResult || ''),
    lastMessage: String(next.lastMessage || '')
  };
  try { fs.writeFileSync(UPDATE_STATE_FILE, JSON.stringify(s, null, 2)); } catch {}
}

function normalizeProtocol(protocol) {
  return protocol === 'vless' ? 'vless' : 'naive';
}

function ensureUserProtocol(user) {
  if (!user.protocol) user.protocol = 'naive';
  return user;
}

function buildUserLink(user, config) {
  const protocol = normalizeProtocol(user.protocol);
  if (protocol === 'vless') {
    const port = Number(config.vlessPort) || 443;
    const encodedName = encodeURIComponent(user.username || 'vless-user');
    const wsPath = encodeURIComponent(config.vlessWsPath || '/vless');
    const host = config.domain;
    return `vless://${user.password}@${host}:${port}?encryption=none&security=tls&type=ws&host=${host}&sni=${host}&path=${wsPath}#${encodedName}`;
  }
  return `naive+https://${user.username}:${user.password}@${config.domain}:443`;
}

function syncXrayClients(config) {
  try {
    if (!config.installed) return;
    if (normalizeProtocol(config.installProtocol) !== 'vless') return;
    const filePath = '/usr/local/etc/xray/config.json';
    if (!fs.existsSync(filePath)) return;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!raw || !Array.isArray(raw.inbounds) || raw.inbounds.length === 0) return;
    const inbound = raw.inbounds[0];
    if (!inbound.settings) inbound.settings = {};
    const vlessUsers = (config.proxyUsers || []).filter(u => normalizeProtocol(u.protocol) === 'vless');
    inbound.settings.clients = vlessUsers.map((u) => ({
      id: String(u.password || '').trim(),
      email: `${String(u.username || 'vless-user').trim()}@${String(config.domain || 'server').trim()}`
    })).filter((c) => c.id);
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));
    spawn('bash', ['-lc', 'systemctl restart xray 2>/dev/null || true']);
  } catch {
    // ignore
  }
}

function getProtocolServiceStatus(config, callback) {
  const selectedProtocol = normalizeProtocol(config.installProtocol);
  const statusCommand = selectedProtocol === 'vless'
    ? 'systemctl is-active caddy >/dev/null 2>&1 && systemctl is-active xray >/dev/null 2>&1 && echo active || echo inactive'
    : 'systemctl is-active caddy >/dev/null 2>&1 && echo active || echo inactive';
  const child = spawn('bash', ['-lc', statusCommand]);
  let output = '';
  child.stdout.on('data', d => { output += d.toString(); });
  child.on('close', () => callback(output.trim() === 'active' ? 'running' : 'stopped'));
  child.on('error', () => callback('unknown'));
}

function formatMoscowTime(dateInput) {
  try {
    return new Date(dateInput).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return '—';
  }
}

function generateDeviceId(userAgent, ip) {
  const hash = crypto.createHash('sha256');
  hash.update(`${userAgent || ''}-${ip || ''}-${Date.now()}`);
  return hash.digest('hex').slice(0, 16);
}

function parseDeviceFromUA(ua) {
  if (!ua) return 'Неизвестно';
  const v = ua.toLowerCase();
  if (v.includes('android')) return 'Android';
  if (v.includes('iphone') || v.includes('ios')) return 'iPhone/iOS';
  if (v.includes('ipad')) return 'iPad';
  if (v.includes('windows')) return 'Windows';
  if (v.includes('macintosh') || v.includes('mac os')) return 'macOS';
  if (v.includes('linux')) return 'Linux';
  return ua.slice(0, 80);
}

function tryDecodeBasicUser(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return '';
  if (!authHeader.toLowerCase().startsWith('basic ')) return '';
  try {
    const raw = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf8');
    return raw.split(':')[0] || '';
  } catch {
    return '';
  }
}

function loadDevices() {
  if (!fs.existsSync(DEVICES_FILE)) {
    const defaultDevices = { devices: [] };
    try { fs.writeFileSync(DEVICES_FILE, JSON.stringify(defaultDevices, null, 2)); } catch {}
    return defaultDevices;
  }
  try {
    return JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
  } catch {
    return { devices: [] };
  }
}

function saveDevices(devices) {
  try { fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2)); } catch {}
}

function logConnection(username, protocol, ip, userAgent, deviceInfo) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    username,
    protocol,
    ip,
    userAgent,
    device: deviceInfo.device || 'Неизвестно',
    hwid: deviceInfo.hwid || generateDeviceId(userAgent, ip),
    blocked: false
  };

  // Load existing logs
  let logs = [];
  if (fs.existsSync(CONNECTIONS_LOG_FILE)) {
    try {
      logs = JSON.parse(fs.readFileSync(CONNECTIONS_LOG_FILE, 'utf8'));
    } catch {
      logs = [];
    }
  }

  // Check if device is blocked
  const devices = loadDevices();
  const existingDevice = devices.devices.find(d => d.hwid === logEntry.hwid);
  if (existingDevice && existingDevice.blocked) {
    logEntry.blocked = true;
  }

  // Add new entry
  logs.unshift(logEntry);

  // Keep only last 1000 entries
  if (logs.length > 1000) {
    logs = logs.slice(0, 1000);
  }

  try { fs.writeFileSync(CONNECTIONS_LOG_FILE, JSON.stringify(logs, null, 2)); } catch {}

  // Update devices list
  if (!existingDevice) {
    devices.devices.push({
      hwid: logEntry.hwid,
      username,
      device: deviceInfo.device,
      ip,
      userAgent,
      firstSeen: logEntry.timestamp,
      lastSeen: logEntry.timestamp,
      blocked: false,
      protocol
    });
    saveDevices(devices);
  } else {
    existingDevice.lastSeen = logEntry.timestamp;
    existingDevice.ip = ip;
    saveDevices(devices);
  }
  
  return logEntry;
}

function checkDeviceBlocked(hwid) {
  const devices = loadDevices();
  const device = devices.devices.find(d => d.hwid === hwid);
  return device ? device.blocked : false;
}

function parseCaddyConnections(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  const recent = lines.slice(-400);
  const out = [];
  for (const line of recent) {
    try {
      const item = JSON.parse(line);
      const req = item.request || {};
      const headers = req.headers || {};
      const ua = Array.isArray(headers['User-Agent']) ? headers['User-Agent'][0] : headers['User-Agent'];
      const proxyAuth = Array.isArray(headers['Proxy-Authorization']) ? headers['Proxy-Authorization'][0] : headers['Proxy-Authorization'];
      const user = tryDecodeBasicUser(proxyAuth);
      const deviceInfo = {
        device: parseDeviceFromUA(ua),
        hwid: generateDeviceId(ua, req.remote_ip || item.remote_ip)
      };
      out.push({
        time: formatMoscowTime(item.ts ? new Date(item.ts * 1000) : new Date()),
        protocol: 'naive',
        username: user || 'unknown',
        ip: req.remote_ip || item.remote_ip || '—',
        userAgent: ua || '—',
        device: deviceInfo.device,
        hwid: deviceInfo.hwid,
        blocked: checkDeviceBlocked(deviceInfo.hwid)
      });
    } catch {
      // skip bad line
    }
  }
  return out;
}
  
function parseXrayConnections(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  const recent = lines.slice(-400);
  const out = [];
  for (const line of recent) {
    const ipMatch = line.match(/from\s+([0-9a-fA-F\.:]+):\d+/);
    if (!ipMatch) continue;
    const emailMatch = line.match(/email:([^\s]+)/i);
    const timeMatch = line.match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/);
    const hwid = generateDeviceId(emailMatch ? emailMatch[1] : '', ipMatch[1]);
    out.push({
      time: formatMoscowTime(timeMatch ? timeMatch[1].replace(/\//g, '-') : new Date()),
      protocol: 'vless',
      username: emailMatch ? emailMatch[1] : 'vless-user',
      ip: ipMatch[1],
      userAgent: '—',
      device: 'Неизвестно',
      hwid,
      blocked: checkDeviceBlocked(hwid)
    });
  }
  return out;
}

function collectConnections() {
  const caddyConnections = parseCaddyConnections('/var/log/caddy/access.log');
  const xrayConnections = parseXrayConnections('/var/log/xray/access.log');
  return [...caddyConnections, ...xrayConnections].slice(-500).reverse();
}

function safeNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getSystemSnapshot() {
  const total = os.totalmem();
  const free = os.freemem();
  const usedPct = total > 0 ? ((total - free) / total) * 100 : 0;
  const load1 = os.loadavg()[0] || 0;
  return {
    cpuLoad1: Number(load1.toFixed(2)),
    memUsedPct: Number(usedPct.toFixed(2)),
    memUsedGb: Number(((total - free) / 1024 / 1024 / 1024).toFixed(2)),
    memTotalGb: Number((total / 1024 / 1024 / 1024).toFixed(2))
  };
}

async function sendDiscordWebhook(url, payload) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {
    // ignore webhook network errors
  }
}

async function sendDeviceBlockedWebhook(device, hwid, blockedAt) {
  const config = loadConfig();
  if (!config.discordEnabled || !config.discordWebhookUrl) return;
  
  const nowMsk = formatMoscowTime(new Date());
  
  const payload = {
    embeds: [{
      title: '🚫 Устройство заблокировано',
      color: 15158332, // Красный цвет
      thumbnail: {
        url: 'https://i.imgur.com/7QxKZyP.png'
      },
      fields: [
        {
          name: '👤 Пользователь',
          value: `\`${device.username || 'Неизвестно'}\``,
          inline: true
        },
        {
          name: '📱 Устройство',
          value: `\`${device.device || 'Неизвестно'}\``,
          inline: true
        },
        {
          name: '🔑 HWID (Серийный номер)',
          value: `\`${hwid}\``,
          inline: false
        },
        {
          name: '🌍 IP адрес',
          value: `\`${device.ip || 'Неизвестно'}\``,
          inline: true
        },
        {
          name: '📊 Платформа',
          value: `\`${device.device || 'Неизвестно'}\``,
          inline: true
        },
        {
          name: '🕐 Время блокировки (МСК)',
          value: `\`${nowMsk}\``,
          inline: false
        },
        {
          name: '🔒 Протокол',
          value: `\`${device.protocol?.toUpperCase() || 'НЕИЗВЕСТНО'}\``,
          inline: true
        },
        {
          name: '⏰ Первое подключение',
          value: `\`${formatMoscowTime(device.firstSeen)}\``,
          inline: true
        }
      ],
      footer: {
        text: 'NaiveProxy Panel - Глобальное обновление v2.0'
      },
      timestamp: new Date().toISOString()
    }]
  };

  await sendDiscordWebhook(config.discordWebhookUrl, payload);
}

function restartDiscordMonitor() {
  if (discordMonitorTimer) {
    clearInterval(discordMonitorTimer);
    discordMonitorTimer = null;
  }
  const config = loadConfig();
  if (!config.discordEnabled || !config.discordWebhookUrl) return;
  const intervalSec = Math.max(60, safeNumber(config.discordIntervalSec, 300));
  discordMonitorTimer = setInterval(() => {
    const latest = loadConfig();
    if (!latest.discordEnabled || !latest.discordWebhookUrl) return;
    getProtocolServiceStatus(latest, (status) => {
      const metrics = getSystemSnapshot();
      const nowMsk = formatMoscowTime(new Date());
      const payload = {
        embeds: [{
          title: 'Мониторинг панели',
          color: status === 'running' ? 3066993 : 15158332,
          fields: [
            { name: 'Статус', value: status, inline: true },
            { name: 'CPU load(1m)', value: String(metrics.cpuLoad1), inline: true },
            { name: 'RAM', value: `${metrics.memUsedGb}/${metrics.memTotalGb} GB (${metrics.memUsedPct}%)`, inline: true },
            { name: 'Время (МСК)', value: nowMsk, inline: false }
          ]
        }]
      };
      sendDiscordWebhook(latest.discordWebhookUrl, payload);
      if (lastDiscordServiceState && lastDiscordServiceState !== status) {
        sendDiscordWebhook(latest.discordWebhookUrl, {
          content: `Сервис сменил статус: ${lastDiscordServiceState} -> ${status} (${nowMsk})`
        });
      }
      lastDiscordServiceState = status;
    });
  }, intervalSec * 1000);
}
  
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = {
      admin: {
        password: bcrypt.hashSync('admin', 10),
        role: 'admin'
      }
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
    return defaultUsers;
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'naiveproxy-panel-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, '../public')));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// ─────────────────────────────────────────────
//  AUTH ROUTES
// ─────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users[username];
  if (!user) return res.json({ success: false, message: 'Неверный логин или пароль' });
  if (!bcrypt.compareSync(password, user.password)) {
    return res.json({ success: false, message: 'Неверный логин или пароль' });
  }
  req.session.authenticated = true;
  req.session.username = username;
  req.session.role = user.role;
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.session.username, role: req.session.role });
});

// ─────────────────────────────────────────────
//  CONFIG ROUTES
// ─────────────────────────────────────────────
app.get('/api/config', requireAuth, (req, res) => {
  const config = loadConfig();
  // Don't send passwords
  const safe = { ...config };
  res.json(safe);
});

app.post('/api/config/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.json({ success: false, message: 'Заполните все поля' });
  }
  if (newPassword.length < 6) {
    return res.json({ success: false, message: 'Новый пароль минимум 6 символов' });
  }
  const users = loadUsers();
  const user = users[req.session.username];
  if (!user) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.json({ success: false, message: 'Текущий пароль неверен' });
  }
  // Hash and save new password
  users[req.session.username].password = bcrypt.hashSync(newPassword, 10);
  saveUsers(users);
  res.json({ success: true, message: 'Пароль успешно изменён' });
});

app.get('/api/config/discord', requireAuth, (req, res) => {
  const config = loadConfig();
  res.json({
    enabled: Boolean(config.discordEnabled),
    webhookUrl: config.discordWebhookUrl || '',
    intervalSec: Math.max(60, safeNumber(config.discordIntervalSec, 300))
  });
});

app.post('/api/config/discord', requireAuth, (req, res) => {
  const { enabled, webhookUrl, intervalSec } = req.body;
  const config = loadConfig();
  config.discordEnabled = Boolean(enabled);
  config.discordWebhookUrl = String(webhookUrl || '').trim();
  config.discordIntervalSec = Math.max(60, safeNumber(intervalSec, 300));
  if (config.discordEnabled && !config.discordWebhookUrl) {
    return res.json({ success: false, message: 'Webhook URL обязателен при включении' });
  }
  saveConfig(config);
  restartDiscordMonitor();
  res.json({ success: true, message: 'Discord настройки сохранены' });
});

app.post('/api/config/discord/test', requireAuth, async (req, res) => {
  const config = loadConfig();
  if (!config.discordWebhookUrl) {
    return res.json({ success: false, message: 'Webhook URL не задан' });
  }
  const metrics = getSystemSnapshot();
  await sendDiscordWebhook(config.discordWebhookUrl, {
    content: 'Тестовое сообщение от панели',
    embeds: [{
      title: 'Тест мониторинга',
      color: 3447003,
      fields: [
        { name: 'CPU load(1m)', value: String(metrics.cpuLoad1), inline: true },
        { name: 'RAM', value: `${metrics.memUsedGb}/${metrics.memTotalGb} GB (${metrics.memUsedPct}%)`, inline: true },
        { name: 'Время (МСК)', value: formatMoscowTime(new Date()), inline: false }
      ]
    }]
  });
  res.json({ success: true, message: 'Тест отправлен в Discord' });
});

app.get('/api/config/tiktok', requireAuth, (req, res) => {
  const config = loadConfig();
  res.json({ enabled: Boolean(config.tiktokMode) });
});

app.post('/api/config/tiktok', requireAuth, (req, res) => {
  const { enabled } = req.body || {};
  const config = loadConfig();
  config.tiktokMode = Boolean(enabled);
  saveConfig(config);
  res.json({ success: true, message: 'TikTok режим сохранён' });
});

app.get('/api/tiktok/domains', requireAuth, (req, res) => {
  res.json({ success: true, domains: TIKTOK_DOMAINS });
});

// ─────────────────────────────────────────────
//  PROXY USERS ROUTES
// ─────────────────────────────────────────────
app.get('/api/proxy-users', requireAuth, (req, res) => {
  const config = loadConfig();
  const users = (config.proxyUsers || []).map(u => ensureUserProtocol(u));
  res.json({ users });
});

app.post('/api/proxy-users/add', requireAuth, (req, res) => {
  const { username, password, protocol, vlessPort } = req.body;
  if (!username) return res.json({ success: false, message: 'Имя пользователя обязательно' });
  const normalizedProtocol = normalizeProtocol(protocol);
  const actualPassword = normalizedProtocol === 'vless' ? (password || crypto.randomUUID()) : password;
  if (!actualPassword) return res.json({ success: false, message: 'Пароль обязателен для Naive' });

  const config = loadConfig();
  if (!config.proxyUsers) config.proxyUsers = [];
  
  // Check duplicate
  if (config.proxyUsers.find(u => u.username === username && normalizeProtocol(u.protocol) === normalizedProtocol)) {
    return res.json({ success: false, message: 'Пользователь уже существует' });
  }
  
  config.proxyUsers.push({
    username,
    password: actualPassword,
    protocol: normalizedProtocol,
    createdAt: new Date().toISOString()
  });
  if (normalizedProtocol === 'vless') {
    // Keep runtime VLESS port stable after install; changing it here would break live links.
    if (!config.installed) {
      config.vlessPort = Number(vlessPort) || Number(config.vlessPort) || 443;
    }
  }
  saveConfig(config);

  if (config.installed && normalizedProtocol === 'vless') {
    syncXrayClients(config);
  }
  
  // If installed and changed Naive users, update Caddyfile
  if (config.installed && normalizedProtocol === 'naive') {
    updateCaddyfile(config, res, () => {
      res.json({ success: true, link: buildUserLink({ username, password: actualPassword, protocol: normalizedProtocol }, config) });
    });
  } else {
    res.json({
      success: true,
      link: config.installed
        ? buildUserLink({ username, password: actualPassword, protocol: normalizedProtocol }, config)
        : username + ':' + actualPassword
    });
  }
});

app.delete('/api/proxy-users/:username', requireAuth, (req, res) => {
  const { username } = req.params;
  const config = loadConfig();
  const before = (config.proxyUsers || []).length;
  config.proxyUsers = (config.proxyUsers || []).filter(u => u.username !== username);
  if (config.proxyUsers.length === before) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  saveConfig(config);

  if (config.installed) {
    syncXrayClients(config);
  }
  
  const hasNaiveUsers = (config.proxyUsers || []).some(u => normalizeProtocol(u.protocol) === 'naive');
  if (config.installed && hasNaiveUsers) {
    updateCaddyfile(config, res, () => {
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
});

app.get('/api/connections', requireAuth, (req, res) => {
  let connections = collectConnections();
  
  // Also load from persistent log
  if (fs.existsSync(CONNECTIONS_LOG_FILE)) {
    try {
      const logs = JSON.parse(fs.readFileSync(CONNECTIONS_LOG_FILE, 'utf8'));
      connections = [...logs.slice(0, 200), ...connections];
      // Remove duplicates
      const unique = new Map();
      connections.forEach(c => {
        if (c.hwid && !unique.has(c.hwid)) {
          unique.set(c.hwid, c);
        }
      });
      connections = Array.from(unique.values());
    } catch {
      // ignore
    }
  }
  
  res.json({ connections });
});

app.get('/api/devices', requireAuth, (req, res) => {
  const devices = loadDevices();
  res.json({ devices: devices.devices || [] });
});

app.post('/api/devices/block', requireAuth, async (req, res) => {
  const { hwid } = req.body;
  if (!hwid) {
    return res.json({ success: false, message: 'HWID обязателен' });
  }
  
  const devices = loadDevices();
  const device = devices.devices.find(d => d.hwid === hwid);
  if (!device) {
    return res.json({ success: false, message: 'Устройство не найдено' });
  }
  
  // Отправляем уведомление в Discord ДО блокировки
  const blockedAt = new Date().toISOString();
  await sendDeviceBlockedWebhook(device, hwid, blockedAt);
  
  device.blocked = true;
  device.blockedAt = blockedAt;
  saveDevices(devices);
  
  res.json({ success: true, message: `Устройство ${device.username} заблокировано` });
});

app.post('/api/devices/unblock', requireAuth, (req, res) => {
  const { hwid } = req.body;
  if (!hwid) {
    return res.json({ success: false, message: 'HWID обязателен' });
  }
  
  const devices = loadDevices();
  const device = devices.devices.find(d => d.hwid === hwid);
  if (!device) {
    return res.json({ success: false, message: 'Устройство не найдено' });
  }
  
  device.blocked = false;
  delete device.blockedAt;
  saveDevices(devices);
  
  res.json({ success: true, message: `Устройство ${device.username} разблокировано` });
});

app.get('/api/logs', requireAuth, (req, res) => {
  if (!fs.existsSync(CONNECTIONS_LOG_FILE)) {
    return res.json({ logs: [] });
  }
  
  try {
    const logs = JSON.parse(fs.readFileSync(CONNECTIONS_LOG_FILE, 'utf8'));
    const limit = Math.min(500, logs.length);
    res.json({ logs: logs.slice(0, limit) });
  } catch {
    res.json({ logs: [] });
  }
});

app.post('/api/vless/one-time-qr', requireAuth, (req, res) => {
  const { username } = req.body;
  if (!username) return res.json({ success: false, message: 'Имя пользователя обязательно' });
  const config = loadConfig();
  const user = (config.proxyUsers || []).find(
    (u) => u.username === username && normalizeProtocol(u.protocol) === 'vless'
  );
  if (!user) return res.json({ success: false, message: 'VLESS пользователь не найден' });
  if (!config.installed || !config.domain) return res.json({ success: false, message: 'Сервер не установлен' });

  const token = crypto.randomBytes(24).toString('hex');
  oneTimeQrTokens.set(token, {
    link: buildUserLink(user, config),
    expiresAt: Date.now() + 5 * 60 * 1000
  });
  res.json({ success: true, token, expiresInSec: 300 });
});

app.get('/api/vless/one-time-qr/:token', requireAuth, (req, res) => {
  const token = req.params.token;
  const payload = oneTimeQrTokens.get(token);
  if (!payload) return res.status(404).json({ success: false, message: 'Токен не найден или уже использован' });
  if (Date.now() > payload.expiresAt) {
    oneTimeQrTokens.delete(token);
    return res.status(410).json({ success: false, message: 'Срок действия QR истёк' });
  }
  oneTimeQrTokens.delete(token);
  res.json({ success: true, link: payload.link });
});

// ─────────────────────────────────────────────
//  SERVER STATUS
// ─────────────────────────────────────────────
app.get('/api/status', requireAuth, (req, res) => {
  const config = loadConfig();
  if (!config.installed) {
    return res.json({ installed: false, status: 'not_installed' });
  }
  const selectedProtocol = normalizeProtocol(config.installProtocol);
  getProtocolServiceStatus(config, (statusValue) => {
    const running = statusValue === 'running';
    const upd = loadUpdateState();
    res.json({
      installed: true,
      status: running ? 'running' : 'stopped',
      domain: config.domain,
      serverIp: config.serverIp,
      email: config.email,
      installProtocol: selectedProtocol,
      vlessPort: Number(config.vlessPort) || 443,
      vlessWsPath: config.vlessWsPath || '/vless',
      lastUpdateAt: upd.lastUpdateAt,
      lastUpdateResult: upd.lastResult,
      lastUpdateMessage: upd.lastMessage,
      usersCount: (config.proxyUsers || []).length
    });
  });
});
  
app.post('/api/update/run', requireAuth, async (req, res) => {
  const cmd = [
    'cd /opt/naiveproxy-panel',
    'git pull --ff-only',
    'cd panel',
    'npm install --omit=dev',
    'pm2 restart naiveproxy-panel'
  ].join(' && ');
  const result = await execBash(cmd, 10 * 60 * 1000);
  const now = new Date().toISOString();
  saveUpdateState({
    lastUpdateAt: now,
    lastResult: result.code === 0 ? 'success' : 'error',
    lastMessage: result.code === 0 ? 'Обновлено' : (result.stderr || result.stdout || 'Ошибка обновления')
  });
  res.json({
    success: result.code === 0,
    message: result.code === 0 ? '✅ Обновление выполнено' : '❌ Ошибка обновления',
    details: tailText([result.stdout, result.stderr].filter(Boolean).join('\n'), 260)
  });
});

app.post('/api/service/:action', requireAuth, (req, res) => {
  const { action } = req.params;
  if (!['start', 'stop', 'restart'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  const config = loadConfig();
  const selectedProtocol = normalizeProtocol(config.installProtocol);
  const serviceCommand = selectedProtocol === 'vless'
    ? `systemctl ${action} xray && systemctl ${action} caddy`
    : `systemctl ${action} caddy`;
  const child = spawn('bash', ['-lc', serviceCommand]);
  child.on('close', (code) => {
    const target = selectedProtocol === 'vless' ? 'Xray + Caddy' : 'Caddy';
    res.json({ success: code === 0, message: code === 0 ? `${target}: ${action} выполнен` : 'Ошибка управления сервисом' });
  });
  child.on('error', () => {
    res.json({ success: false, message: 'systemctl недоступен (вы не на сервере?)' });
  });
});

// ─────────────────────────────────────────────
//  INSTALL VIA WEBSOCKET
// ─────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'install') {
        handleInstall(ws, data);
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });
});

function sendLog(ws, text, step = null, progress = null, level = 'info') {
  ws.send(JSON.stringify({ type: 'log', text, step, progress, level }));
}

function updateCaddyfile(config, res, callback) {
  let basicAuthLines = '';
  if (config.proxyUsers && config.proxyUsers.length > 0) {
    basicAuthLines = config.proxyUsers
      .filter(u => normalizeProtocol(u.protocol) === 'naive')
      .map(u => `    basic_auth ${u.username} ${u.password}`)
      .join('\n');
  }

  const caddyfileContent = `{
  order forward_proxy before file_server
}

:443, ${config.domain} {
  tls ${config.email}

  log {
    output file /var/log/caddy/access.log
    format json
  }

  forward_proxy {
${basicAuthLines}
    hide_ip
    hide_via
    probe_resistance
  }

  file_server {
    root /var/www/html
  }
}
`;

  try {
    fs.writeFileSync('/etc/caddy/Caddyfile', caddyfileContent, 'utf8');
  } catch (e) {
    // Not running as root or Caddy not installed — skip silently
  }

  // Reload Caddy to apply new config
  const reload = spawn('bash', ['-c',
    'caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || systemctl restart caddy 2>/dev/null || true'
  ]);
  reload.on('close', () => { if (callback) callback(); });
  reload.on('error', () => { if (callback) callback(); });
}

function handleInstall(ws, data) {
  const { domain, email, adminLogin, adminPassword, protocol, vlessPort } = data;

  if (!domain || !email || !adminLogin || !adminPassword) {
    sendLog(ws, '❌ Заполните все поля!', null, null, 'error');
    ws.send(JSON.stringify({ type: 'install_error', message: 'Заполните все поля' }));
    return;
  }

  const config = loadConfig();
  const selectedProtocol = normalizeProtocol(protocol);
  config.domain = domain;
  config.email = email;
  config.installProtocol = selectedProtocol;
  config.vlessPort = Number(vlessPort) || Number(config.vlessPort) || 443;
  config.vlessWsPath = config.vlessWsPath || '/vless';
  // Reset old users on fresh install action so connection list is clean
  config.proxyUsers = [];
  
  const initialPassword = selectedProtocol === 'vless' ? crypto.randomUUID() : adminPassword;
  config.proxyUsers.push({
    username: adminLogin,
    password: initialPassword,
    protocol: selectedProtocol,
    createdAt: new Date().toISOString()
  });
  saveConfig(config);

  // Get server IP
  const getIp = spawn('bash', ['-c', "curl -4 -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'"]);
  let serverIp = '';
  getIp.stdout.on('data', d => serverIp += d.toString().trim());
  getIp.on('close', () => {
    config.serverIp = serverIp;
    saveConfig(config);
  });

  const scriptPath = selectedProtocol === 'vless'
    ? path.join(__dirname, '../scripts/install_vless.sh')
    : path.join(__dirname, '../scripts/install_naiveproxy.sh');
  
  if (!fs.existsSync(scriptPath)) {
    sendLog(ws, '❌ Скрипт установки не найден!', null, null, 'error');
    ws.send(JSON.stringify({ type: 'install_error', message: `Скрипт установки не найден: ${path.basename(scriptPath)}` }));
    return;
  }

  sendLog(
    ws,
    selectedProtocol === 'vless' ? '🚀 Начинаем установку VLESS...' : '🚀 Начинаем установку NaiveProxy...',
    'init',
    2,
    'info'
  );

  const env = {
    ...process.env,
    NAIVE_DOMAIN: domain,
    NAIVE_EMAIL: email,
    NAIVE_LOGIN: adminLogin,
    NAIVE_PASSWORD: initialPassword,
    VLESS_DOMAIN: domain,
    VLESS_EMAIL: email,
    VLESS_UUID: initialPassword,
    VLESS_PORT: String(config.vlessPort || 443),
    VLESS_WS_PATH: config.vlessWsPath || '/vless',
    VLESS_REMARK: adminLogin,
    DEBIAN_FRONTEND: 'noninteractive'
  };

  const install = spawn('bash', [scriptPath], { env });

  install.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      const parsed = parseLogLine(line);
      sendLog(ws, parsed.text, parsed.step, parsed.progress, parsed.level);
    });
  });

  install.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      if (!line.includes('WARNING') && line.trim()) {
        sendLog(ws, line, null, null, 'warn');
      }
    });
  });

  install.on('close', (code) => {
    if (code === 0) {
      config.installed = true;
      saveConfig(config);
      sendLog(ws, '✅ Установка завершена успешно!', 'done', 100, 'success');
      ws.send(JSON.stringify({
        type: 'install_done',
        link: buildUserLink({ username: adminLogin, password: initialPassword, protocol: selectedProtocol }, config)
      }));
    } else {
      sendLog(ws, `❌ Установка завершилась с ошибкой (код ${code})`, null, null, 'error');
      ws.send(JSON.stringify({ type: 'install_error', message: `Exit code: ${code}` }));
    }
  });

  install.on('error', (err) => {
    sendLog(ws, `❌ Ошибка запуска скрипта: ${err.message}`, null, null, 'error');
    ws.send(JSON.stringify({ type: 'install_error', message: err.message }));
  });
}

function parseLogLine(line) {
  const keywordMap = [
    { pattern: /установка\s+xray/i, step: 'golang', progress: 35, text: '🧩 Установка Xray...' },
    { pattern: /настройка\s+xray/i, step: 'caddyfile', progress: 70, text: '📝 Настройка Xray...' },
    { pattern: /xray\s+сервис/i, step: 'service', progress: 80, text: '⚙️ Настройка Xray сервиса...' },
    { pattern: /установка.+caddy/i, step: 'caddy', progress: 55, text: '🔧 Установка Caddy...' },
    { pattern: /caddyfile/i, step: 'caddyfile', progress: 70, text: '📝 Создание Caddyfile...' },
  ];
  for (const s of keywordMap) {
    if (s.pattern.test(line)) {
      return { text: s.text, step: s.step, progress: s.progress, level: 'step' };
    }
  }

  const stepMap = [
    { pattern: /STEP:1/, step: 'update', progress: 10, text: '📦 Обновление системы и зависимостей...' },
    { pattern: /STEP:2/, step: 'bbr', progress: 18, text: '⚡ Включение BBR...' },
    { pattern: /STEP:3/, step: 'firewall', progress: 25, text: '🔥 Настройка файрволла...' },
    { pattern: /STEP:4/, step: 'golang', progress: 35, text: '🐹 Установка Go...' },
    { pattern: /STEP:5/, step: 'caddy', progress: 55, text: '🔨 Сборка Caddy с naive-плагином (это займёт 3-7 мин)...' },
    { pattern: /STEP:6/, step: 'caddyfile', progress: 70, text: '📝 Создание конфигурации...' },
    { pattern: /STEP:7/, step: 'service', progress: 80, text: '⚙️ Настройка systemd сервиса...' },
    { pattern: /STEP:8/, step: 'start', progress: 90, text: '🟢 Запуск и включение автостарта...' },
    { pattern: /STEP:DONE/, step: 'done', progress: 100, text: '✅ Готово!' },
  ];

  for (const s of stepMap) {
    if (s.pattern.test(line)) {
      return { text: s.text, step: s.step, progress: s.progress, level: 'step' };
    }
  }

  if (/error|ошибка|failed|fail/i.test(line)) {
    return { text: line, step: null, progress: null, level: 'error' };
  }
  if (/warn|warning/i.test(line)) {
    return { text: line, step: null, progress: null, level: 'warn' };
  }
  if (/ok|done|success|✅|✓/i.test(line)) {
    return { text: line, step: null, progress: null, level: 'success' };
  }

  return { text: line, step: null, progress: null, level: 'info' };
}

function execBash(command, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: Number(code ?? 0), stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: 127, stdout: '', stderr: 'spawn failed' });
    });
  });
}

async function getEgressIps() {
  const v4 = await execBash("curl -4 -s --connect-timeout 6 ifconfig.me 2>/dev/null || true", 10000);
  const v6 = await execBash("curl -6 -s --connect-timeout 6 ifconfig.me 2>/dev/null || true", 10000);
  return {
    ipv4: (v4.stdout || '').split('\n')[0].trim(),
    ipv6: (v6.stdout || '').split('\n')[0].trim()
  };
}

function tailText(text, maxLines = 160, maxChars = 14000) {
  const safe = String(text || '');
  const lines = safe.split('\n');
  const tail = lines.slice(-maxLines).join('\n');
  if (tail.length <= maxChars) return tail;
  return tail.slice(-maxChars);
}

function readFileTail(filePath, maxLines = 160) {
  try {
    if (!fs.existsSync(filePath)) return '';
    const content = fs.readFileSync(filePath, 'utf8');
    return tailText(content, maxLines);
  } catch {
    return '';
  }
}

function createJobId() {
  try {
    return crypto.randomBytes(12).toString('hex');
  } catch {
    return String(Date.now());
  }
}

function getJobPublic(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status, // running | success | error | cancelled
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || null,
    exitCode: typeof job.exitCode === 'number' ? job.exitCode : null,
    message: job.message || '',
    output: tailText(job.output || '', 240),
    error: tailText(job.error || '', 160),
    details: tailText(job.details || '', 320)
  };
}

async function recommendVlessPorts(preferredPorts) {
  // Prefer Cloudflare-friendly ports + fallback 443.
  const candidates = Array.from(new Set([...(Array.isArray(preferredPorts) ? preferredPorts : []), 443, 2053, 2083, 2087, 2096, 8443]))
    .map((p) => Number(p))
    .filter((p) => Number.isInteger(p) && p > 0 && p <= 65535);

  const check = await execBash("command -v ss >/dev/null 2>&1 && ss -lntH || netstat -lnt 2>/dev/null || true", 12000);
  const listening = new Set();
  if (check.stdout) {
    for (const line of check.stdout.split('\n')) {
      const m = line.match(/[:\.]([0-9]{1,5})\s+/);
      if (!m) continue;
      const p = Number(m[1]);
      if (Number.isInteger(p)) listening.add(p);
    }
  }
  const free = candidates.filter((p) => !listening.has(p));
  const list = free.length > 0 ? free : candidates;
  return { recommendedPort: list[0] || 443, ports: list.slice(0, 12) };
}

// ─────────────────────────────────────────────
//  VLESS HELPERS
// ─────────────────────────────────────────────
app.get('/api/vless/recommend-ports', requireAuth, async (req, res) => {
  const config = loadConfig();
  const { recommendedPort, ports } = await recommendVlessPorts(config.vlessPreferredPorts);
  res.json({ success: true, recommendedPort, ports });
});

// ─────────────────────────────────────────────
//  WARP (Cloudflare) ROUTES
// ─────────────────────────────────────────────
app.get('/api/warp', requireAuth, async (req, res) => {
  const config = loadConfig();
  
  // Check if WARP config exists
  const warpConfigExists = fs.existsSync('/etc/wireguard/warp.conf');
  
  // Check service status
  const status = await execBash("systemctl is-active wg-quick@warp 2>/dev/null || echo inactive", 6000);
  const serviceActive = status.stdout === 'active';
  
  // Get egress IPs
  let ipv4 = '';
  let ipv6 = '';
  
  if (serviceActive || warpConfigExists) {
    const ips = await getEgressIps();
    ipv4 = ips.ipv4 || config.warpLastEgressIpv4 || '';
    ipv6 = ips.ipv6 || config.warpLastEgressIpv6 || '';
    
    // Update config with latest IPs
    config.warpLastEgressIpv4 = ipv4;
    config.warpLastEgressIpv6 = ipv6;
    saveConfig(config);
  } else {
    ipv4 = config.warpLastEgressIpv4 || '';
    ipv6 = config.warpLastEgressIpv6 || '';
  }
  
  // Update installed status based on config existence
  if (!config.warpInstalled && warpConfigExists) {
    config.warpInstalled = true;
    saveConfig(config);
  }
  
  res.json({
    installed: Boolean(config.warpInstalled),
    enabled: Boolean(config.warpEnabled),
    killswitch: Boolean(config.warpKillswitch),
    serviceStatus: serviceActive ? 'active' : 'inactive',
    egressIpv4: ipv4,
    egressIpv6: ipv6
  });
});

app.get('/api/warp/killswitch', requireAuth, (req, res) => {
  const config = loadConfig();
  res.json({ success: true, enabled: Boolean(config.warpKillswitch) });
});

app.post('/api/warp/killswitch', requireAuth, async (req, res) => {
  const { enabled } = req.body || {};
  const config = loadConfig();
  config.warpKillswitch = Boolean(enabled);
  saveConfig(config);

  // Apply/remove immediately if WARP is enabled.
  if (config.warpEnabled) {
    const scriptPath = path.join(__dirname, '../scripts/warp_killswitch.sh');
    if (fs.existsSync(scriptPath)) {
      const cmd = config.warpKillswitch ? `bash "${scriptPath}" apply` : `bash "${scriptPath}" remove`;
      await execBash(cmd, 30000);
    }
  }

  res.json({ success: true, enabled: Boolean(config.warpKillswitch) });
});

app.post('/api/warp/install', requireAuth, (req, res) => {
  const scriptPath = path.join(__dirname, '../scripts/install_warp.sh');
  if (!fs.existsSync(scriptPath)) {
    return res.json({ success: false, message: 'install_warp.sh не найден' });
  }

  // Async job: return immediately so UI doesn't hang.
  const id = createJobId();
  const job = {
    id,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    message: 'Установка запущена',
    output: '',
    error: '',
    details: '',
    pid: null,
    _child: null
  };
  warpInstallJobs.set(id, job);

  const child = spawn('bash', [scriptPath]);
  job._child = child;
  job.pid = child.pid || null;

  child.stdout.on('data', (d) => { job.output += d.toString(); });
  child.stderr.on('data', (d) => { job.error += d.toString(); });

  const watchdog = setTimeout(() => {
    if (job.status !== 'running') return;
    job.status = 'error';
    job.exitCode = 124;
    job.finishedAt = new Date().toISOString();
    job.message = 'Таймаут установки (20 минут)';
    try { child.kill('SIGKILL'); } catch {}
  }, 20 * 60 * 1000);

  child.on('close', async (code) => {
    clearTimeout(watchdog);
    if (job.status === 'cancelled') return;
    job.exitCode = Number(code ?? 0);
    job.finishedAt = new Date().toISOString();

    const config = loadConfig();
    if (job.exitCode === 0) {
      job.status = 'success';
      job.message = 'WARP установлен и включён';
      config.warpInstalled = true;
      config.warpEnabled = true;
      const ips = await getEgressIps();
      config.warpLastEgressIpv4 = ips.ipv4 || config.warpLastEgressIpv4 || '';
      config.warpLastEgressIpv6 = ips.ipv6 || config.warpLastEgressIpv6 || '';
      saveConfig(config);

      if (config.warpKillswitch) {
        const ksPath = path.join(__dirname, '../scripts/warp_killswitch.sh');
        if (fs.existsSync(ksPath)) {
          await execBash(`bash "${ksPath}" apply`, 30000);
        }
      }
    } else {
      job.status = 'error';
      job.message = `WARP install error (код ${job.exitCode})`;
      config.warpInstalled = config.warpInstalled || false;
      saveConfig(config);
      const detailsParts = [
        tailText(job.output, 220),
        tailText(job.error, 140),
        readFileTail('/tmp/warp-apt-update.err', 80),
        readFileTail('/tmp/warp-apt-install-base.err', 120),
        readFileTail('/tmp/warp-apt-install-wg.err', 120),
        readFileTail('/tmp/warp-apt-install-wireguard.err', 120),
        readFileTail('/tmp/warp-dpkg-configure.err', 120),
        readFileTail('/tmp/warp-apt-fix.err', 120),
        readFileTail('/tmp/wgcf-download.err', 60),
        readFileTail('/tmp/wgcf-register.log', 120),
        readFileTail('/tmp/wgcf-generate.log', 120),
        readFileTail('/tmp/wg-warp.err', 120),
        readFileTail('/tmp/wg-quick-up.err', 120),
      ].filter(Boolean);
      job.details = detailsParts.join('\n\n');
    }
  });

  child.on('error', (e) => {
    clearTimeout(watchdog);
    job.status = 'error';
    job.exitCode = 127;
    job.finishedAt = new Date().toISOString();
    job.message = e.message || 'spawn error';
  });

  res.json({ success: true, jobId: id, message: 'Установка WARP запущена' });
});

app.get('/api/warp/install/:jobId', requireAuth, (req, res) => {
  const id = req.params.jobId;
  const job = warpInstallJobs.get(id);
  if (!job) return res.status(404).json({ success: false, message: 'Job не найден' });
  res.json({ success: true, job: getJobPublic(job) });
});

app.post('/api/warp/install/:jobId/cancel', requireAuth, (req, res) => {
  const id = req.params.jobId;
  const job = warpInstallJobs.get(id);
  if (!job) return res.status(404).json({ success: false, message: 'Job не найден' });
  if (job.status !== 'running') return res.json({ success: true, job: getJobPublic(job) });
  job.status = 'cancelled';
  job.exitCode = 130;
  job.finishedAt = new Date().toISOString();
  job.message = 'Отменено пользователем';
  try { job._child?.kill('SIGKILL'); } catch {}
  res.json({ success: true, job: getJobPublic(job) });
});

app.post('/api/warp/toggle', requireAuth, async (req, res) => {
  const { enabled } = req.body || {};
  const want = Boolean(enabled);
  
  const config = loadConfig();
  
  // First ensure WARP is installed
  if (want && !config.warpInstalled) {
    return res.json({ 
      success: false, 
      message: 'Сначала установите WARP через кнопку "Установить/починить WARP"' 
    });
  }

  // Check if WARP config exists
  if (want && !fs.existsSync('/etc/wireguard/warp.conf')) {
    return res.json({ 
      success: false, 
      message: 'Конфигурация WARP не найдена. Переустановите WARP.' 
    });
  }

  // Build the command based on desired state
  let cmd;
  if (want) {
    // Enable WARP - ensure service template exists first
    cmd = `
      systemctl stop wg-quick@warp 2>/dev/null || true;
      wg-quick down warp 2>/dev/null || true;
      sleep 1;
      systemctl enable wg-quick@warp 2>/dev/null || true;
      systemctl restart wg-quick@warp 2>/dev/null || wg-quick up warp 2>/dev/null || true
    `;
  } else {
    // Disable WARP
    cmd = `
      systemctl disable --now wg-quick@warp 2>/dev/null || true;
      wg-quick down warp 2>/dev/null || true;
      true
    `;
  }

  const result = await execBash(cmd, 60000);
  
  // Update config based on result
  if (result.code === 0) {
    config.warpEnabled = want;
    if (want) config.warpInstalled = true;
  } else {
    // Don't disable if we failed to stop
    if (!want) config.warpEnabled = true;
  }

  // Apply/remove killswitch depending on state.
  const ksPath = path.join(__dirname, '../scripts/warp_killswitch.sh');
  if (fs.existsSync(ksPath)) {
    if (config.warpEnabled && config.warpKillswitch) {
      const ksResult = await execBash(`bash "${ksPath}" apply`, 30000);
      if (ksResult.code !== 0 && want) {
        // Killswitch failed but WARP is running - still report success but warn
        log.warn(`Killswitch application failed: ${ksResult.stderr}`);
      }
    } else {
      await execBash(`bash "${ksPath}" remove`, 30000);
    }
  }

  const ips = await getEgressIps();
  config.warpLastEgressIpv4 = ips.ipv4 || config.warpLastEgressIpv4 || '';
  config.warpLastEgressIpv6 = ips.ipv6 || config.warpLastEgressIpv6 || '';
  saveConfig(config);
  
  const statusMsg = want 
    ? (result.code === 0 ? 'WARP включён' : 'WARP включён с предупреждениями') 
    : (result.code === 0 ? 'WARP выключен' : 'Не удалось выключить WARP');
    
  res.json({
    success: result.code === 0,
    enabled: config.warpEnabled,
    killswitch: Boolean(config.warpKillswitch),
    message: statusMsg,
    egressIpv4: config.warpLastEgressIpv4,
    egressIpv6: config.warpLastEgressIpv6,
    debug: result.code === 0 ? '' : tailText([result.stdout, result.stderr].filter(Boolean).join('\n'), 120)
  });
});

// ─────────────────────────────────────────────
//  DIAGNOSTICS
// ─────────────────────────────────────────────
app.get('/api/diagnostics/vless', requireAuth, async (req, res) => {
  const xray = await execBash("systemctl is-active xray 2>/dev/null || echo inactive", 8000);
  const caddy = await execBash("systemctl is-active caddy 2>/dev/null || echo inactive", 8000);
  const ports = await execBash("ss -lntpH 2>/dev/null | head -n 200 || netstat -lntp 2>/dev/null | head -n 200 || true", 12000);
  const caddyLog = await execBash("journalctl -u caddy -n 120 --no-pager 2>/dev/null || true", 12000);
  const xrayLog = await execBash("journalctl -u xray -n 120 --no-pager 2>/dev/null || true", 12000);
  res.json({
    success: true,
    xray: xray.stdout || 'unknown',
    caddy: caddy.stdout || 'unknown',
    listening: tailText(ports.stdout || '', 200, 16000),
    caddyLog: tailText(caddyLog.stdout || '', 160, 16000),
    xrayLog: tailText(xrayLog.stdout || '', 160, 16000)
  });
});

app.get('/api/diagnostics/warp', requireAuth, async (req, res) => {
  const wg = await execBash("wg show 2>/dev/null || true", 12000);
  const warpSvc = await execBash("systemctl status wg-quick@warp --no-pager 2>/dev/null || true", 12000);
  const warpLog = await execBash("journalctl -u wg-quick@warp -n 160 --no-pager 2>/dev/null || true", 12000);
  res.json({
    success: true,
    wg: tailText(wg.stdout || wg.stderr || '', 200, 16000),
    serviceStatus: tailText(warpSvc.stdout || '', 220, 16000),
    serviceLog: tailText(warpLog.stdout || '', 220, 16000)
  });
});

// Serve index for all non-api routes (SPA)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  restartDiscordMonitor();
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   Панель NaiveProxy                  ║`);
  console.log(`║   Running on http://0.0.0.0:${PORT}     ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
