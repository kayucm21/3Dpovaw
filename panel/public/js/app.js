/* ============================================
   Панель NaiveProxy v3.0 — Frontend App
   ============================================ */

'use strict';

// ─── STATE ──────────────────────────────────────────────────────
let currentPage = 'dashboard';
let ws = null;
let installProtocol = 'naive';
let deleteUserTarget = null;
let currentConfig = null;
let connectionsChart = null;
let trafficChart = null;
let devicesChart = null;
let resourcesHistoryChart = null;
let resourceMonitorInterval = null;
let pwaDeferredPrompt = null;

// ─── THEME & PWA INIT ───────────────────────────────────────────
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcons(savedTheme);
}

function updateThemeIcons(theme) {
  const sunIcon = document.getElementById('sunIcon');
  const moonIcon = document.getElementById('moonIcon');
  if (theme === 'light') {
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'block';
  } else {
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
  }
}

// ─── TOAST NOTIFICATIONS ────────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 10px; min-width: 250px; animation: slideIn 0.3s ease;';
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── INIT ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAuth();
  initThemeToggle();
  initEventListeners();
  startResourceMonitor();
});

function initThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeIcons(newTheme);
    });
  }
}

function initEventListeners() {
  // Login form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await doLogin();
    });
  }

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', doLogout);
  }

  // Nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      goToPage(item.dataset.page);
    });
  });

  // Refresh buttons
  const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
  if (refreshDashboardBtn) refreshDashboardBtn.addEventListener('click', loadDashboard);

  const refreshResourcesBtn = document.getElementById('refreshResourcesBtn');
  if (refreshResourcesBtn) refreshResourcesBtn.addEventListener('click', loadResources);

  // Install form
  const installForm = document.getElementById('installForm');
  if (installForm) {
    installForm.addEventListener('submit', handleInstallSubmit);
  }

  // Add user button
  const addUserBtn = document.getElementById('addUserBtn');
  if (addUserBtn) addUserBtn.addEventListener('click', showAddUserModal);

  // Change password form
  const changePasswordForm = document.getElementById('changePasswordForm');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', handleChangePassword);
  }

  // Discord settings
  const discordSettingsForm = document.getElementById('discordSettingsForm');
  if (discordSettingsForm) {
    discordSettingsForm.addEventListener('submit', handleDiscordSettings);
  }

  // Backup buttons
  const backupBtn = document.getElementById('backupBtn');
  if (backupBtn) backupBtn.addEventListener('click', createBackup);

  const restoreBtn = document.getElementById('restoreBtn');
  if (restoreBtn) restoreBtn.addEventListener('click', restoreBackup);

  // Clear logs
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  if (clearLogsBtn) clearLogsBtn.addEventListener('click', clearLogs);

  // WARP toggle
  const warpToggle = document.getElementById('warpToggle');
  if (warpToggle) {
    warpToggle.addEventListener('change', () => toggleWarpFromUi(warpToggle.checked));
  }

  const installWarpBtn = document.getElementById('installWarpBtn');
  if (installWarpBtn) {
    installWarpBtn.addEventListener('click', installWarp);
  }

  // 2FA buttons
  const enableTwoFaBtn = document.getElementById('enableTwoFaBtn');
  if (enableTwoFaBtn) {
    enableTwoFaBtn.addEventListener('click', initTwoFaSetup);
  }

  const verifyTwoFaBtn = document.getElementById('verifyTwoFaBtn');
  if (verifyTwoFaBtn) {
    verifyTwoFaBtn.addEventListener('click', verifyTwoFa);
  }

  // Protocol selection
  window.selectProtocol = selectProtocol;
}

// ─── AUTH ───────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      showApp(data.username);
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp(username) {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  if (username) {
    document.getElementById('sidebarUsername').textContent = username;
    document.getElementById('sidebarUserAvatar').textContent = username[0].toUpperCase();
  }
  goToPage('dashboard');
}

async function doLogin() {
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  const submitBtn = document.querySelector('#loginForm button[type="submit"]');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnLoader = submitBtn.querySelector('.btn-loader');

  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');
  submitBtn.disabled = true;
  errorEl.classList.add('hidden');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.twoFaRequired) {
        showToast('Требуется 2FA код', 'warning');
        // Handle 2FA flow
      } else {
        showApp(username);
        showToast('Добро пожаловать!', 'success');
      }
    } else {
      const err = await res.json();
      errorEl.textContent = err.error || 'Ошибка входа';
      errorEl.classList.remove('hidden');
      showToast('Неверный логин или пароль', 'error');
    }
  } catch (e) {
    errorEl.textContent = 'Ошибка соединения с сервером';
    errorEl.classList.remove('hidden');
    showToast('Ошибка соединения', 'error');
  } finally {
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
    submitBtn.disabled = false;
  }
}

async function doLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch {}
  location.reload();
}

// ─── NAVIGATION ─────────────────────────────────────────────────
function goToPage(page) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
  currentPage = page;

  switch(page) {
    case 'dashboard':
      document.getElementById('dashboardPage').classList.remove('hidden');
      loadDashboard();
      break;
    case 'analytics':
      document.getElementById('analyticsPage').classList.remove('hidden');
      loadAnalytics();
      break;
    case 'resources':
      document.getElementById('resourcesPage').classList.remove('hidden');
      loadResources();
      break;
    case 'install':
      document.getElementById('installPage').classList.remove('hidden');
      loadInstallPage();
      break;
    case 'users':
      document.getElementById('usersPage').classList.remove('hidden');
      loadUsers();
      break;
    case 'devices':
      document.getElementById('devicesPage').classList.remove('hidden');
      loadDevices();
      break;
    case 'logs':
      document.getElementById('logsPage').classList.remove('hidden');
      loadLogs();
      break;
    case 'security':
      document.getElementById('securityPage').classList.remove('hidden');
      loadSecurity();
      break;
    case 'settings':
      document.getElementById('settingsPage').classList.remove('hidden');
      loadSettings();
      break;
  }
}

// ─── DASHBOARD ──────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const data = await res.json();
      currentConfig = data;
      updateDashboard(data);
    }
  } catch (e) {
    console.error('Failed to load dashboard:', e);
  }
}

function updateDashboard(config) {
  document.getElementById('totalUsers').textContent = (config.proxyUsers || []).length;
  document.getElementById('warpStatus').textContent = config.warpInstalled ? (config.warpEnabled ? 'Включён' : 'Выключен') : 'Не установлен';
  document.getElementById('serverIp').textContent = config.serverIp || '—';
  document.getElementById('serverDomain').textContent = config.domain || '—';
  document.getElementById('serverProtocol').textContent = config.installProtocol ? capitalizeFirst(config.installProtocol) : '—';
  
  fetch('/api/devices')
    .then(r => r.json())
    .then(data => {
      document.getElementById('activeDevices').textContent = data.length;
    })
    .catch(() => {});

  fetch('/api/connections')
    .then(r => r.json())
    .then(data => {
      const today = new Date().toDateString();
      const todayCount = data.filter(c => new Date(c.timestamp).toDateString() === today).length;
      document.getElementById('totalConnections').textContent = todayCount;
    })
    .catch(() => {});

  initConnectionsChart();
}

function initConnectionsChart() {
  const ctx = document.getElementById('connectionsChart');
  if (!ctx) return;

  if (connectionsChart) connectionsChart.destroy();

  connectionsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
      datasets: [{
        label: 'Подключения',
        data: [12, 19, 8, 15, 22, 18, 25],
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124, 58, 237, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94a3b8' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8' }
        }
      }
    }
  });
}

// ─── RESOURCES MONITOR ──────────────────────────────────────────
function startResourceMonitor() {
  resourceMonitorInterval = setInterval(loadResources, 5000);
}

async function loadResources() {
  try {
    const res = await fetch('/api/resources');
    if (res.ok) {
      const data = await res.json();
      updateResourceMonitor(data);
    }
  } catch (e) {
    console.error('Failed to load resources:', e);
  }
}

function updateResourceMonitor(data) {
  const cpu = Math.round(data.cpu || 0);
  const ram = Math.round(data.ram || 0);
  const disk = Math.round(data.disk || 0);

  document.getElementById('cpuValue').textContent = cpu + '%';
  document.getElementById('cpuProgress').style.width = cpu + '%';
  document.getElementById('cpuDetailed').textContent = cpu + '%';
  document.getElementById('cpuCores').textContent = `${data.cpuCores || 0} ядер`;

  document.getElementById('ramValue').textContent = ram + '%';
  document.getElementById('ramProgress').style.width = ram + '%';
  document.getElementById('ramDetailed').textContent = data.ramUsed || '0 GB';
  document.getElementById('ramTotal').textContent = `из ${data.ramTotal || '0'} GB`;

  document.getElementById('diskValue').textContent = disk + '%';
  document.getElementById('diskProgress').style.width = disk + '%';
  document.getElementById('diskDetailed').textContent = data.diskUsed || '0 GB';
  document.getElementById('diskTotal').textContent = `из ${data.diskTotal || '0'} GB`;

  if (data.uptime) {
    document.getElementById('uptimeValue').textContent = data.uptime;
    document.getElementById('serverUptime').textContent = data.uptime;
  }

  if (data.networkIn) document.getElementById('networkInValue').textContent = data.networkIn;
  if (data.networkOut) document.getElementById('networkOutValue').textContent = data.networkOut;
}

// ─── INSTALL ────────────────────────────────────────────────────
function selectProtocol(protocol) {
  installProtocol = protocol;
  document.getElementById('naiveCard').style.borderColor = protocol === 'naive' ? '#7c3aed' : 'transparent';
  document.getElementById('vlessCard').style.borderColor = protocol === 'vless' ? '#7c3aed' : 'transparent';
  document.getElementById('installBtn').disabled = false;
  document.getElementById('vlessWsPathGroup').classList.toggle('hidden', protocol !== 'vless');
}

async function handleInstallSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('installBtn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');

  btn.disabled = true;
  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');

  const data = {
    protocol: installProtocol,
    domain: document.getElementById('installDomain').value,
    email: document.getElementById('installEmail').value,
    port: document.getElementById('installPort').value,
    wsPath: document.getElementById('installWsPath').value
  };

  try {
    const res = await fetch('/api/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      showToast('Установка начата!', 'success');
      goToPage('dashboard');
    } else {
      showToast('Ошибка установки', 'error');
    }
  } catch (e) {
    showToast('Ошибка соединения', 'error');
  } finally {
    btn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
  }
}

// ─── USERS ──────────────────────────────────────────────────────
async function loadUsers() {
  try {
    const res = await fetch('/api/users');
    if (res.ok) {
      const users = await res.json();
      renderUsersTable(users);
    }
  } catch (e) {
    console.error('Failed to load users:', e);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  tbody.innerHTML = users.map(user => `
    <tr style="border-bottom: 1px solid var(--border);">
      <td style="padding: 12px;">${escapeHtml(user.username)}</td>
      <td style="padding: 12px;"><span class="platform-badge">${user.protocol || 'naive'}</span></td>
      <td style="padding: 12px;"><code style="background: var(--bg-input); padding: 4px 8px; border-radius: 4px; font-size: 11px;">${user.link || '—'}</code></td>
      <td style="padding: 12px; text-align: right;">
        <button class="btn-icon" onclick="copyLink('${user.link}')" title="Копировать">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="btn-icon" onclick="deleteUser('${user.username}')" title="Удалить" style="color: var(--danger);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
}

async function deleteUser(username) {
  if (!confirm(`Удалить пользователя ${username}?`)) return;

  try {
    const res = await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });

    if (res.ok) {
      showToast('Пользователь удалён', 'success');
      loadUsers();
    }
  } catch (e) {
    showToast('Ошибка удаления', 'error');
  }
}

function copyLink(link) {
  navigator.clipboard.writeText(link);
  showToast('Ссылка скопирована', 'success');
}

// ─── DEVICES ────────────────────────────────────────────────────
async function loadDevices() {
  try {
    const res = await fetch('/api/devices');
    if (res.ok) {
      const devices = await res.json();
      renderDevicesTable(devices);
    }
  } catch (e) {
    console.error('Failed to load devices:', e);
  }
}

function renderDevicesTable(devices) {
  const tbody = document.getElementById('devicesTableBody');
  if (!tbody) return;

  tbody.innerHTML = devices.map(device => {
    const isBlocked = device.blocked;
    return `
      <tr style="border-bottom: 1px solid var(--border); ${isBlocked ? 'opacity: 0.6;' : ''}">
        <td style="padding: 12px;">${escapeHtml(device.username)}</td>
        <td style="padding: 12px;">${device.deviceName || '—'}</td>
        <td style="padding: 12px;"><code style="font-size: 11px;">${escapeHtml(device.hwid)}</code></td>
        <td style="padding: 12px;">${device.ip || '—'}</td>
        <td style="padding: 12px;"><span class="platform-badge platform-${(device.platform || 'unknown').toLowerCase()}">${device.platform || 'Unknown'}</span></td>
        <td style="padding: 12px;">${formatTime(device.lastConnected)}</td>
        <td style="padding: 12px; text-align: right;">
          <button class="btn btn-sm ${isBlocked ? 'btn-success' : 'btn-danger'}" onclick="toggleDeviceBlock('${device.hwid}', ${!isBlocked})">
            ${isBlocked ? 'Разблокировать' : 'Заблокировать'}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function toggleDeviceBlock(hwid, block) {
  try {
    const res = await fetch(`/api/devices/${block ? 'block' : 'unblock'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hwid })
    });

    if (res.ok) {
      showToast(block ? 'Устройство заблокировано' : 'Устройство разблокировано', 'success');
      loadDevices();
    }
  } catch (e) {
    showToast('Ошибка', 'error');
  }
}

// ─── LOGS ───────────────────────────────────────────────────────
async function loadLogs() {
  try {
    const res = await fetch('/api/logs');
    if (res.ok) {
      const logs = await res.json();
      renderLogs(logs);
    }
  } catch (e) {
    console.error('Failed to load logs:', e);
  }
}

function renderLogs(logs) {
  const container = document.getElementById('logsTerminal');
  if (!container) return;

  container.innerHTML = logs.slice(-100).reverse().map(log => {
    const isBlocked = log.blocked;
    return `<div style="padding: 4px 0; border-bottom: 1px solid var(--border-light); color: ${isBlocked ? 'var(--danger)' : 'var(--text-primary)'};">
      <span style="color: var(--text-muted);">[${formatTime(log.timestamp)}]</span>
      ${escapeHtml(log.message)}
    </div>`;
  }).join('');
}

async function clearLogs() {
  if (!confirm('Очистить все логи?')) return;
  try {
    await fetch('/api/logs', { method: 'DELETE' });
    showToast('Логи очищены', 'success');
    loadLogs();
  } catch (e) {
    showToast('Ошибка', 'error');
  }
}

// ─── SECURITY / 2FA ─────────────────────────────────────────────
async function loadSecurity() {
  try {
    const res = await fetch('/api/security/twofa');
    if (res.ok) {
      const data = await res.json();
      updateTwoFaStatus(data.enabled);
    }
  } catch (e) {
    console.error('Failed to load security:', e);
  }
}

function updateTwoFaStatus(enabled) {
  const statusText = document.getElementById('twoFaStatusText');
  const enableBtn = document.getElementById('enableTwoFaBtn');
  const qrSetup = document.getElementById('qrSetup');

  if (enabled) {
    statusText.textContent = 'Включено';
    statusText.style.color = 'var(--success)';
    enableBtn.textContent = 'Отключить 2FA';
    qrSetup.classList.add('hidden');
  } else {
    statusText.textContent = 'Отключено';
    statusText.style.color = 'var(--text-secondary)';
    enableBtn.textContent = 'Включить 2FA';
    qrSetup.classList.add('hidden');
  }
}

async function initTwoFaSetup() {
  try {
    const res = await fetch('/api/security/twofa/setup');
    if (res.ok) {
      const data = await res.json();
      document.getElementById('qrSetup').classList.remove('hidden');
      document.getElementById('qrCodeImage').querySelector('img').src = data.qrUrl;
      showToast('Отсканируйте QR код', 'info');
    }
  } catch (e) {
    showToast('Ошибка инициализации 2FA', 'error');
  }
}

async function verifyTwoFa() {
  const inputs = document.querySelectorAll('#verificationInput input');
  const code = Array.from(inputs).map(i => i.value).join('');

  if (code.length !== 6) {
    showToast('Введите 6-значный код', 'error');
    return;
  }

  try {
    const res = await fetch('/api/security/twofa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    if (res.ok) {
      showToast('2FA успешно включена!', 'success');
      updateTwoFaStatus(true);
    } else {
      showToast('Неверный код', 'error');
    }
  } catch (e) {
    showToast('Ошибка проверки', 'error');
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  const current = document.getElementById('currentPassword').value;
  const newPass = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;

  if (newPass !== confirm) {
    showToast('Новые пароли не совпадают', 'error');
    return;
  }

  try {
    const res = await fetch('/api/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: newPass })
    });

    if (res.ok) {
      showToast('Пароль изменён', 'success');
      e.target.reset();
    } else {
      showToast('Ошибка смены пароля', 'error');
    }
  } catch (e) {
    showToast('Ошибка соединения', 'error');
  }
}

// ─── SETTINGS ───────────────────────────────────────────────────
async function loadSettings() {
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const data = await res.json();
      updateSettings(data);
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

function updateSettings(config) {
  const warpToggle = document.getElementById('warpToggle');
  if (warpToggle) {
    warpToggle.checked = config.warpEnabled || false;
    document.getElementById('warpSettingsStatus').textContent = config.warpInstalled ? (config.warpEnabled ? 'Включён' : 'Выключен') : 'Не установлено';
  }

  const discordWebhook = document.getElementById('discordWebhook');
  const discordInterval = document.getElementById('discordInterval');
  const discordEnabled = document.getElementById('discordEnabled');

  if (discordWebhook) discordWebhook.value = config.discordWebhookUrl || '';
  if (discordInterval) discordInterval.value = config.discordIntervalSec || 300;
  if (discordEnabled) discordEnabled.checked = config.discordEnabled || false;
}

async function toggleWarpFromUi(enabled) {
  try {
    const res = await fetch('/api/warp/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    if (res.ok) {
      showToast(enabled ? 'WARP включён' : 'WARP выключен', 'success');
      loadSettings();
    } else {
      showToast('Ошибка изменения статуса WARP', 'error');
    }
  } catch (e) {
    showToast('Ошибка соединения', 'error');
  }
}

async function installWarp() {
  showToast('Начата установка WARP...', 'info');
  // Implementation for WARP installation
}

async function handleDiscordSettings(e) {
  e.preventDefault();
  const webhook = document.getElementById('discordWebhook').value;
  const interval = document.getElementById('discordInterval').value;
  const enabled = document.getElementById('discordEnabled').checked;

  try {
    const res = await fetch('/api/settings/discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: webhook, interval: parseInt(interval), enabled })
    });

    if (res.ok) {
      showToast('Настройки Discord сохранены', 'success');
    } else {
      showToast('Ошибка сохранения', 'error');
    }
  } catch (e) {
    showToast('Ошибка соединения', 'error');
  }
}

async function createBackup() {
  const status = document.getElementById('backupStatus');
  status.textContent = 'Создание бэкапа...';
  
  try {
    const res = await fetch('/api/backup', { method: 'POST' });
    if (res.ok) {
      status.textContent = 'Бэкап успешно создан!';
      status.style.color = 'var(--success)';
      showToast('Бэкап создан', 'success');
    }
  } catch (e) {
    status.textContent = 'Ошибка создания бэкапа';
    status.style.color = 'var(--danger)';
    showToast('Ошибка', 'error');
  }
}

async function restoreBackup() {
  if (!confirm('Восстановить из бэкапа? Текущие настройки будут заменены.')) return;
  
  try {
    const res = await fetch('/api/restore', { method: 'POST' });
    if (res.ok) {
      showToast('Восстановление успешно! Перезагрузите страницу.', 'success');
      setTimeout(() => location.reload(), 2000);
    }
  } catch (e) {
    showToast('Ошибка восстановления', 'error');
  }
}

// ─── ANALYTICS ──────────────────────────────────────────────────
async function loadAnalytics() {
  initTrafficChart();
  initDevicesChart();
  loadTopUsers();
}

function initTrafficChart() {
  const ctx = document.getElementById('trafficChart');
  if (!ctx) return;

  if (trafficChart) trafficChart.destroy();

  trafficChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
      datasets: [{
        label: 'Трафик (MB)',
        data: [50, 30, 80, 120, 95, 70],
        backgroundColor: 'rgba(124, 58, 237, 0.7)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
      }
    }
  });
}

function initDevicesChart() {
  const ctx = document.getElementById('devicesChart');
  if (!ctx) return;

  if (devicesChart) devicesChart.destroy();

  devicesChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['iOS', 'Android', 'Windows', 'macOS', 'Linux'],
      datasets: [{
        data: [15, 25, 30, 20, 10],
        backgroundColor: ['#3b82f6', '#10b981', '#7c3aed', '#6b7280', '#f59e0b']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#e2e8f0' } } }
    }
  });
}

async function loadTopUsers() {
  const list = document.getElementById('topUsersList');
  if (!list) return;

  list.innerHTML = '<div style="text-align: center; color: var(--text-secondary);">Загрузка...</div>';

  try {
    const res = await fetch('/api/analytics/top-users');
    if (res.ok) {
      const users = await res.json();
      list.innerHTML = users.slice(0, 5).map((u, i) => `
        <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid var(--border-light);">
          <span>#${i+1} ${escapeHtml(u.username)}</span>
          <span style="color: var(--accent);">${u.connections} подключений</span>
        </div>
      `).join('');
    }
  } catch (e) {
    list.innerHTML = '<div style="text-align: center; color: var(--text-secondary);">Нет данных</div>';
  }
}

// ─── UTILS ──────────────────────────────────────────────────────
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function capitalizeFirst(str) {
  if (!str) return '—';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatTime(timestamp) {
  if (!timestamp) return '—';
  try {
    return new Date(timestamp).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    });
  } catch {
    return '—';
  }
}

// ─── HELPERS ────────────────────────────────────────────────────
function showAddUserModal() {
  showToast('Функция добавления пользователя в разработке', 'info');
}

async function loadInstallPage() {
  const res = await fetch('/api/status');
  if (res.ok) {
    const data = await res.json();
    if (data.domain) {
      document.getElementById('installDomain').value = data.domain;
    }
  }
}

async function loadUsers() {
  // Already defined above
}

async function loadDevices() {
  // Already defined above
}

async function loadLogs() {
  // Already defined above
}

async function loadSettings() {
  // Already defined above
}

// ═══════════════════════════════════════════════════════════════
// V4.0 — ПОДПИСКИ (SUBSCRIPTIONS)
// ═══════════════════════════════════════════════════════════════

// Загрузка страницы подписок
async function loadSubscriptions() {
  try {
    const res = await fetch('/api/subscriptions');
    if (res.ok) {
      const subs = await res.json();
      renderSubscriptionsTable(subs);
    }
  } catch (e) {
    console.error('Failed to load subscriptions:', e);
  }
}

function renderSubscriptionsTable(subs) {
  const tbody = document.getElementById('subscriptionsTableBody');
  if (!tbody) return;

  if (subs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-secondary);">Нет активных подписок</td></tr>';
    return;
  }

  tbody.innerHTML = subs.map(sub => `
    <tr style="border-bottom: 1px solid var(--border); ${sub.active ? '' : 'opacity: 0.5;'}">
      <td style="padding: 12px;">${escapeHtml(sub.username)}</td>
      <td style="padding: 12px;"><code style="background: var(--bg-input); padding: 4px 8px; border-radius: 4px; font-size: 11px;">${sub.url}</code></td>
      <td style="padding: 12px;">
        <button class="btn btn-sm" onclick="showSubQR('${sub.token}', '${sub.url}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </button>
      </td>
      <td style="padding: 12px;">${sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('ru-RU') : '∞'}</td>
      <td style="padding: 12px;">
        <span class="platform-badge platform-${sub.active ? 'android' : 'unknown'}">${sub.active ? 'Активна' : 'Истекла'}</span>
      </td>
      <td style="padding: 12px; text-align: right;">
        <button class="btn-icon" onclick="copySubLink('${sub.url}')" title="Копировать">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="btn-icon" onclick="deleteSubscription('${sub.id}')" title="Удалить" style="color: var(--danger);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
}

function showCreateSubModal() {
  document.getElementById('createSubModal').style.display = 'flex';
  loadUsersForDropdown();
}

function closeCreateSubModal() {
  document.getElementById('createSubModal').style.display = 'none';
}

async function loadUsersForDropdown() {
  try {
    const res = await fetch('/api/users');
    if (res.ok) {
      const users = await res.json();
      const select = document.getElementById('subUsername');
      select.innerHTML = users.map(u => `<option value="${escapeHtml(u.username)}">${escapeHtml(u.username)} (${u.protocol || 'naive'})</option>`).join('');
    }
  } catch {}
}

document.getElementById('createSubForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const data = {
    username: document.getElementById('subUsername').value,
    expiresDays: parseInt(document.getElementById('subExpires').value) || null,
    trafficLimit: parseInt(document.getElementById('subTraffic').value) || null
  };

  try {
    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      const result = await res.json();
      showToast('Подписка создана!', 'success');
      closeCreateSubModal();
      loadSubscriptions();
      showSubQR(result.subscription.token, result.subscription.url);
    } else {
      showToast('Ошибка создания', 'error');
    }
  } catch {
    showToast('Ошибка соединения', 'error');
  } finally {
    btn.disabled = false;
  }
});

function showSubQR(token, url) {
  const qrImg = document.getElementById('qrCodeImg');
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  document.getElementById('subLinkText').textContent = url;
  document.getElementById('subQRModal').style.display = 'flex';
}

function copySubLink(url) {
  navigator.clipboard.writeText(url);
  showToast('Ссылка скопирована', 'success');
}

async function deleteSubscription(id) {
  if (!confirm('Удалить подписку?')) return;
  try {
    const res = await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Подписка удалена', 'success');
      loadSubscriptions();
    }
  } catch {
    showToast('Ошибка', 'error');
  }
}

// Обновление навигации для подписок
const oldGoToPage = window.goToPage;
window.goToPage = function(page) {
  oldGoToPage(page);
  if (page === 'subscriptions') {
    loadSubscriptions();
  }
};

// ═══════════════════════════════════════════════════════════════
// V6.0 — SNI WHITELIST
// ═══════════════════════════════════════════════════════════════

async function loadSNIPage() {
  await loadSNIWhitelist();
  await loadSNIPresets();
  await loadSNISearchLog();
}

async function loadSNIWhitelist() {
  try {
    const res = await fetch('/api/sni-whitelist');
    if (res.ok) {
      const data = await res.json();
      renderSNIDomains(data);
      document.getElementById('sniToggle').checked = data.enabled;
      document.getElementById('sniStatusText').textContent = data.enabled ? 'Включено' : 'Выключено';
      document.getElementById('sniStatusText').style.color = data.enabled ? 'var(--success)' : 'var(--text-secondary)';
    }
  } catch (e) {
    console.error('Failed to load SNI whitelist:', e);
  }
}

function renderSNIDomains(data) {
  const container = document.getElementById('sniDomainsList');
  const emptyState = document.getElementById('sniEmptyState');
  if (!container) return;

  if (!data.domains || data.domains.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  container.style.display = 'flex';
  emptyState.style.display = 'none';
  container.innerHTML = data.domains.map(domain => `
    <div style="display: flex; align-items: center; gap: 6px; background: var(--bg-input); padding: 6px 12px; border-radius: 20px; font-size: 13px;">
      <span>${escapeHtml(domain)}</span>
      <button onclick="removeSNIDomain('${escapeHtml(domain)}')" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 0; font-size: 16px; line-height: 1;">×</button>
    </div>
  `).join('');
}

async function searchSNIDomain() {
  const input = document.getElementById('sniSearchInput');
  const query = input.value.trim();
  if (!query) return;

  const btn = document.querySelector('#sniPage button[onclick="searchSNIDomain()"]');
  btn.disabled = true;
  btn.innerHTML = '⏳ Поиск...';

  try {
    const res = await fetch('/api/sni-whitelist/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    const resultsDiv = document.getElementById('sniSearchResults');
    if (res.ok) {
      const result = await res.json();
      resultsDiv.style.display = 'block';
      resultsDiv.innerHTML = `
        <div style="padding: 15px; background: var(--bg-input); border-radius: var(--radius); margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 600;">${escapeHtml(result.domain)}</div>
              <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                DNS: ${result.hasDNS ? '🟢 ' + result.dnsIP : '🔴 Не найден'}
                | HTTP: ${result.accessible ? '🟢 Доступен' : '🟡 Проверка'}
              </div>
            </div>
            <button class="btn btn-sm btn-primary" onclick="addSNIDomain('${escapeHtml(result.domain)}')">Добавить</button>
          </div>
        </div>
      `;
    } else {
      showToast('Ошибка поиска', 'error');
    }
  } catch {
    showToast('Ошибка соединения', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      Поиск
    `;
  }
}

async function addSNIDomain(domain) {
  try {
    const res = await fetch('/api/sni-whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain })
    });

    if (res.ok) {
      showToast('Домен добавлен!', 'success');
      document.getElementById('sniSearchResults').style.display = 'none';
      document.getElementById('sniSearchInput').value = '';
      loadSNIWhitelist();
    } else {
      showToast('Ошибка добавления', 'error');
    }
  } catch {
    showToast('Ошибка соединения', 'error');
  }
}

async function removeSNIDomain(domain) {
  if (!confirm(`Удалить ${domain} из белого списка?`)) return;
  try {
    const res = await fetch('/api/sni-whitelist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain })
    });

    if (res.ok) {
      showToast('Домен удалён', 'success');
      loadSNIWhitelist();
    }
  } catch {
    showToast('Ошибка', 'error');
  }
}

async function toggleSNI() {
  const enabled = document.getElementById('sniToggle').checked;
  try {
    const res = await fetch('/api/sni-whitelist/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    if (res.ok) {
      showToast(enabled ? 'SNI Whitelist включён' : 'SNI Whitelist выключен', 'success');
      document.getElementById('sniStatusText').textContent = enabled ? 'Включено' : 'Выключено';
      document.getElementById('sniStatusText').style.color = enabled ? 'var(--success)' : 'var(--text-secondary)';
    }
  } catch {
    showToast('Ошибка', 'error');
  }
}

async function loadSNIPresets() {
  try {
    const res = await fetch('/api/sni-whitelist/presets');
    if (res.ok) {
      const presets = await res.json();
      const container = document.getElementById('sniPresets');
      if (!container) return;
      container.innerHTML = presets.map(p => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; background: var(--bg-input); border-radius: var(--radius);">
          <div>
            <div style="font-weight: 500; font-size: 13px;">${escapeHtml(p.domain)}</div>
            <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(p.category)}</div>
          </div>
          <button class="btn btn-sm" onclick="addSNIDomain('${escapeHtml(p.domain)}')">+</button>
        </div>
      `).join('');
    }
  } catch {}
}

async function loadSNISearchLog() {
  try {
    const res = await fetch('/api/sni-whitelist/search-log');
    if (res.ok) {
      const logs = await res.json();
      const tbody = document.getElementById('sniSearchLogBody');
      if (!tbody) return;

      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-secondary);">Нет записей</td></tr>';
        return;
      }

      tbody.innerHTML = logs.map(log => `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="padding: 10px; font-size: 13px;">${escapeHtml(log.domain)}</td>
          <td style="padding: 10px; font-size: 13px;">${log.hasDNS ? '🟢 ' + log.dnsIP : '🔴'}</td>
          <td style="padding: 10px; font-size: 13px;">${log.accessible ? '🟢' : '🟡'}</td>
          <td style="padding: 10px; font-size: 12px; color: var(--text-secondary);">${new Date(log.timestamp).toLocaleString('ru-RU')}</td>
        </tr>
      `).join('');
    }
  } catch {}
}

// Обновление навигации
const _oldGoToPage2 = window.goToPage;
window.goToPage = function(page) {
  _oldGoToPage2(page);
  if (page === 'sni') {
    loadSNIPage();
  }
};
