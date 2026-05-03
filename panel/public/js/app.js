/* ═══════════════════════════════════════════════
   Панель NaiveProxy — Frontend App
   ═══════════════════════════════════════════════ */

'use strict';

// ─── STATE ───────────────────────────────────────
let currentPage = 'dashboard';
let ws = null;
let installRunning = false;
let deleteUserTarget = null;
let currentConfig = null;
let currentQrLink = '';

function normalizeProtocol(protocol) {
  return protocol === 'vless' ? 'vless' : 'naive';
}

function makeConnectionLink(user, status) {
  const protocol = normalizeProtocol(user.protocol);
  if (!status.installed || !status.domain) return '(установите сервер)';
  if (protocol === 'vless') {
    const host = status.domain;
    const port = Number(status.vlessPort) || 443;
    const wsPath = encodeURIComponent(status.vlessWsPath || '/vless');
    return `vless://${user.password}@${host}:${port}?encryption=none&security=tls&type=ws&host=${host}&sni=${host}&path=${wsPath}#${encodeURIComponent(user.username)}`;
  }
  return `naive+https://${user.username}:${user.password}@${status.domain}:443`;
}

function generateUuidV4() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

// ─── INIT ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();

  // Login form
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await doLogin();
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', doLogout);

  // Nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      goToPage(item.dataset.page);
    });
  });

  // Refresh status button
  document.getElementById('refreshStatusBtn').addEventListener('click', () => {
    loadDashboard();
  });
});

// ─── AUTH ─────────────────────────────────────────
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
  // Set username in sidebar
  if (username) {
    document.getElementById('sidebarUsername').textContent = username;
    document.getElementById('sidebarUserAvatar').textContent = username[0].toUpperCase();
  }
  goToPage('dashboard');
}

async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = document.querySelector('#loginForm button[type="submit"]');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');

  if (!username || !password) {
    showAlert(errEl, 'Заполните все поля', 'error');
    return;
  }

  btn.disabled = true;
  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');
  errEl.classList.add('hidden');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      showApp(username);
    } else {
      showAlert(errEl, data.message || 'Ошибка входа', 'error');
    }
  } catch {
    showAlert(errEl, 'Ошибка соединения с сервером', 'error');
  } finally {
    btn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
  }
}

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  showLogin();
}

// ─── NAVIGATION ──────────────────────────────────
function goToPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(page + 'Page');
  if (pageEl) pageEl.classList.add('active');

  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  if (page === 'dashboard') loadDashboard();
  if (page === 'users') loadUsers();
  if (page === 'connections') loadConnections();
  if (page === 'settings') loadSettingsPage();
}

// ─── DASHBOARD ───────────────────────────────────
async function loadDashboard() {
  const statusEl = document.getElementById('serviceStatus');
  const domainEl = document.getElementById('serverDomain');
  const ipEl = document.getElementById('serverIp');
  const countEl = document.getElementById('usersCount');
  const notInstalled = document.getElementById('notInstalledMsg');
  const serviceBtns = document.getElementById('serviceBtns');
  const quickLinksEmpty = document.getElementById('quickLinksEmpty');
  const quickLinksList = document.getElementById('quickLinksList');

  statusEl.innerHTML = '<span class="dot dot-gray"></span> Загрузка...';

  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    currentConfig = data;

    if (!data.installed) {
      statusEl.innerHTML = '<span class="dot dot-gray"></span> Не установлен';
      domainEl.textContent = '—';
      ipEl.textContent = '—';
      countEl.textContent = '0';
      notInstalled.classList.remove('hidden');
      serviceBtns.style.display = 'none';
      quickLinksEmpty.classList.remove('hidden');
      quickLinksList.classList.add('hidden');
    } else {
      const isRunning = data.status === 'running';
      statusEl.innerHTML = isRunning
        ? `<span class="dot dot-green"></span> Работает`
        : `<span class="dot dot-red"></span> Остановлен`;
      domainEl.textContent = data.domain || '—';
      ipEl.textContent = data.serverIp || '—';
      countEl.textContent = data.usersCount || '0';
      notInstalled.classList.add('hidden');
      serviceBtns.style.display = 'flex';

      // Quick links
      const usersRes = await fetch('/api/proxy-users');
      const usersData = await usersRes.json();
      if (usersData.users && usersData.users.length > 0) {
        quickLinksEmpty.classList.add('hidden');
        quickLinksList.classList.remove('hidden');
        quickLinksList.innerHTML = '';
        usersData.users.slice(0, 5).forEach(u => {
          const link = makeConnectionLink(u, data);
          const protocol = normalizeProtocol(u.protocol).toUpperCase();
          quickLinksList.innerHTML += `
            <div class="quick-link-item">
              <span style="min-width:110px;color:var(--text-primary);font-weight:600">${u.username} (${protocol})</span>
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${link}</span>
              <button class="quick-link-copy" onclick="copyText('${link}')">Копировать</button>
            </div>`;
        });
      } else {
        quickLinksEmpty.classList.remove('hidden');
        quickLinksList.classList.add('hidden');
      }
    }
  } catch (err) {
    statusEl.innerHTML = '<span class="dot dot-yellow"></span> Ошибка';
  }
}

async function serviceAction(action) {
  showToast(`Выполняем: ${action}...`, 'info');
  try {
    const res = await fetch(`/api/service/${action}`, { method: 'POST' });
    const data = await res.json();
    showToast(data.message, data.success ? 'success' : 'error');
    setTimeout(loadDashboard, 1500);
  } catch {
    showToast('Ошибка соединения', 'error');
  }
}

// ─── INSTALL ──────────────────────────────────────
function generatePassword() {
  const protocolEl = document.getElementById('installProtocol');
  if (protocolEl && normalizeProtocol(protocolEl.value) === 'vless') {
    document.getElementById('installPassword').value = generateUuidV4();
    return;
  }
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$';
  let pwd = '';
  for (let i = 0; i < 20; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  document.getElementById('installPassword').value = pwd;
}

// Auto-generate password on install page load if empty
document.addEventListener('DOMContentLoaded', () => {
  generatePassword();
  onInstallProtocolChange();
});

function startInstall() {
  if (installRunning) return;

  const domain = document.getElementById('installDomain').value.trim();
  const email = document.getElementById('installEmail').value.trim();
  const login = document.getElementById('installLogin').value.trim();
  const password = document.getElementById('installPassword').value.trim();
  const protocol = document.getElementById('installProtocol').value;
  const vlessPort = document.getElementById('installVlessPort').value.trim();
  const alertEl = document.getElementById('installAlert');

  if (!domain || !email || !login || !password) {
    showAlert(alertEl, '❌ Заполните все поля', 'error');
    return;
  }
  if (!domain.includes('.')) {
    showAlert(alertEl, '❌ Введите корректный домен (например: naive.yourdomain.com)', 'error');
    return;
  }
  if (!email.includes('@')) {
    showAlert(alertEl, '❌ Введите корректный email', 'error');
    return;
  }
  if (normalizeProtocol(protocol) === 'naive' && password.length < 8) {
    showAlert(alertEl, '❌ Пароль должен быть минимум 8 символов', 'error');
    return;
  }
  if (normalizeProtocol(protocol) === 'vless' && (!vlessPort || Number(vlessPort) < 1 || Number(vlessPort) > 65535)) {
    showAlert(alertEl, '❌ Порт VLESS должен быть от 1 до 65535', 'error');
    return;
  }

  alertEl.classList.add('hidden');
  installRunning = true;

  // UI: show progress, hide done
  document.getElementById('installDone').classList.add('hidden');
  document.getElementById('installLog').innerHTML = '';
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressPercent').textContent = '0%';

  // Reset steps
  document.querySelectorAll('.install-step').forEach(s => {
    s.classList.remove('active', 'done');
  });

  // Disable button
  const btn = document.getElementById('startInstallBtn');
  btn.disabled = true;
  btn.innerHTML = `
    <svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
    Установка...`;

  connectInstallWebSocket({
    domain,
    email,
    login,
    password,
    protocol,
    vlessPort: Number(vlessPort) || 443
  });
}

function connectInstallWebSocket(payload) {
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const candidates = [`${wsProto}//${location.host}`];

  // Fallback for reverse-proxy setups where WS on 443 fails.
  if (location.port !== '3000') {
    candidates.push(`ws://${location.hostname}:3000`);
  }

  let index = 0;
  let connected = false;

  const tryNext = () => {
    if (index >= candidates.length) {
      appendLog('❌ Ошибка WebSocket соединения (проверьте порт 3000 и proxy websocket)', 'error');
      installRunning = false;
      resetInstallBtn();
      return;
    }

    const wsUrl = candidates[index++];
    appendLog(`Подключение: ${wsUrl}`, 'info');

    try {
      ws = new WebSocket(wsUrl);
    } catch {
      tryNext();
      return;
    }

    ws.onopen = () => {
      connected = true;
      ws.send(JSON.stringify({
        type: 'install',
        domain: payload.domain,
        email: payload.email,
        adminLogin: payload.login,
        adminPassword: payload.password,
        protocol: payload.protocol,
        vlessPort: payload.vlessPort
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleWsMessage(msg);
    };

    ws.onerror = () => {
      if (!connected) {
        tryNext();
      } else {
        appendLog('❌ Ошибка WebSocket во время установки', 'error');
      }
    };

    ws.onclose = () => {
      if (!connected) return;
      if (installRunning) {
        installRunning = false;
        appendLog('❌ WebSocket закрыт во время установки', 'error');
        resetInstallBtn();
      }
    };
  };

  tryNext();
}

function handleWsMessage(msg) {
  if (msg.type === 'log') {
    appendLog(msg.text, msg.level);
    if (msg.step) activateStep(msg.step);
    if (msg.progress !== null && msg.progress !== undefined) {
      setProgress(msg.progress);
    }
  } else if (msg.type === 'install_done') {
    installRunning = false;
    setProgress(100);
    markStepDone('done');
    showInstallDone(msg.link);
    resetInstallBtn();
  } else if (msg.type === 'install_error') {
    installRunning = false;
    appendLog(`❌ ${msg.message}`, 'error');
    resetInstallBtn();
    showAlert(document.getElementById('installAlert'), `Ошибка установки: ${msg.message}`, 'error');
  }
}

function appendLog(text, level = 'info') {
  const terminal = document.getElementById('installLog');
  const line = document.createElement('div');
  line.className = `log-line log-${level}`;
  line.textContent = `› ${text}`;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

function setProgress(pct) {
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressPercent').textContent = pct + '%';
}

let currentActiveStep = null;
function activateStep(stepName) {
  if (currentActiveStep && currentActiveStep !== stepName) {
    markStepDone(currentActiveStep);
  }
  const el = document.getElementById('step-' + stepName);
  if (el) {
    el.classList.add('active');
    el.classList.remove('done');
    currentActiveStep = stepName;
  }
}

function markStepDone(stepName) {
  const el = document.getElementById('step-' + stepName);
  if (el) {
    el.classList.remove('active');
    el.classList.add('done');
  }
}

function showInstallDone(link) {
  document.getElementById('doneLink').textContent = link || '';
  document.getElementById('installDone').classList.remove('hidden');
  // Mark all steps done
  document.querySelectorAll('.install-step').forEach(s => {
    s.classList.remove('active');
    s.classList.add('done');
  });
  showToast('✅ Установка протокола завершена!', 'success');
}

function copyLink() {
  const link = document.getElementById('doneLink').textContent;
  copyText(link);
}

function resetInstallBtn() {
  const btn = document.getElementById('startInstallBtn');
  btn.disabled = false;
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
    Начать установку`;
}

function onInstallProtocolChange() {
  const protocol = normalizeProtocol(document.getElementById('installProtocol').value);
  const pwdHint = document.getElementById('installPasswordHint');
  const vlessPort = document.getElementById('installVlessPort');
  if (protocol === 'vless') {
    document.getElementById('installPassword').value = generateUuidV4();
    pwdHint.textContent = 'Для VLESS будет использоваться UUID';
    vlessPort.disabled = false;
    autoPickVlessPort('installVlessPort');
  } else {
    if (!document.getElementById('installPassword').value || document.getElementById('installPassword').value.includes('-')) {
      generatePassword();
    }
    pwdHint.textContent = 'Минимум 8 символов';
    vlessPort.disabled = true;
  }
}

async function autoPickVlessPort(targetInputId) {
  const el = document.getElementById(targetInputId);
  if (!el || el.disabled) return;
  try {
    const res = await fetch('/api/vless/recommend-ports');
    const data = await res.json();
    if (!data || !data.success) return;
    const port = Number(data.recommendedPort);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) {
      el.value = String(port);
    }
  } catch {
    // ignore
  }
}

// ─── USERS ───────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  const table = document.getElementById('usersTable');
  const empty = document.getElementById('emptyUsers');

  try {
    const [usersRes, statusRes] = await Promise.all([
      fetch('/api/proxy-users'),
      fetch('/api/status')
    ]);
    const { users } = await usersRes.json();
    const status = await statusRes.json();

    if (!users || users.length === 0) {
      table.style.display = 'none';
      empty.style.display = 'flex';
      return;
    }

    table.style.display = 'table';
    empty.style.display = 'none';
    tbody.innerHTML = '';

    users.forEach((u, i) => {
      const protocol = normalizeProtocol(u.protocol);
      const link = makeConnectionLink(u, status);
      const safeLinkAttr = escapeHtml(link);
      const safeLinkJs = link.replace(/'/g, "\\'");
      const date = u.createdAt ? new Date(u.createdAt).toLocaleDateString('ru') : '—';
      tbody.innerHTML += `
        <tr>
          <td>${i + 1}</td>
          <td><span class="badge">${protocol.toUpperCase()}</span></td>
          <td class="td-login">${escapeHtml(u.username)}</td>
          <td class="td-pwd">${escapeHtml(u.password)}</td>
          <td class="td-link" title="${safeLinkAttr}">
            ${status.installed ? `<span style="cursor:pointer" onclick="copyText('${safeLinkJs}')" title="Нажмите для копирования">${safeLinkAttr}</span>` : '<span style="color:var(--text-muted)">Сервер не установлен</span>'}
          </td>
          <td>${date}</td>
          <td>
            ${status.installed ? `<button class="btn btn-outline btn-sm" onclick="copyText('${safeLinkJs}')" title="Копировать ссылку">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>` : ''}
            ${status.installed && protocol === 'vless' ? `<button class="btn btn-outline btn-sm" onclick="openOneTimeQr('${escapeHtml(u.username)}')" title="Показать одноразовый QR">QR 1x</button>` : ''}
            <button class="btn btn-danger btn-sm" onclick="showDeleteModal('${escapeHtml(u.username)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </td>
        </tr>`;
    });
  } catch (err) {
    showToast('Ошибка загрузки пользователей', 'error');
  }
}

async function openOneTimeQr(username) {
  try {
    const tokenRes = await fetch('/api/vless/one-time-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.success) {
      showToast(tokenData.message || 'Ошибка генерации QR', 'error');
      return;
    }
    const qrRes = await fetch(`/api/vless/one-time-qr/${encodeURIComponent(tokenData.token)}`);
    const qrData = await qrRes.json();
    if (!qrData.success) {
      showToast(qrData.message || 'QR уже использован', 'error');
      return;
    }
    currentQrLink = qrData.link;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrData.link)}`;
    document.getElementById('qrImage').src = qrUrl;
    document.getElementById('qrLinkText').textContent = qrData.link;
    openModal('qrModal');
    showToast('Одноразовый QR создан. Повторно этот токен не откроется.', 'success');
  } catch {
    showToast('Ошибка соединения', 'error');
  }
}

function copyQrLink() {
  if (!currentQrLink) return;
  copyText(currentQrLink);
}

function showAddUserModal() {
  document.getElementById('newUserLogin').value = '';
  document.getElementById('newUserProtocol').value = 'naive';
  generateUserPassword();
  onNewUserProtocolChange();
  document.getElementById('addUserAlert').classList.add('hidden');
  openModal('addUserModal');
}

function generateUserPassword() {
  const protocolEl = document.getElementById('newUserProtocol');
  if (protocolEl && normalizeProtocol(protocolEl.value) === 'vless') {
    document.getElementById('newUserPassword').value = generateUuidV4();
    return;
  }
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 18; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  document.getElementById('newUserPassword').value = pwd;
}

async function addUser() {
  const username = document.getElementById('newUserLogin').value.trim();
  const password = document.getElementById('newUserPassword').value.trim();
  const protocol = document.getElementById('newUserProtocol').value;
  const vlessPort = document.getElementById('newUserVlessPort').value.trim();
  const alertEl = document.getElementById('addUserAlert');

  if (!username || !password) {
    showAlert(alertEl, 'Введите логин и пароль/UUID', 'error');
    return;
  }
  if (normalizeProtocol(protocol) === 'naive' && password.length < 8) {
    showAlert(alertEl, 'Для Naive пароль минимум 8 символов', 'error');
    return;
  }

  try {
    const res = await fetch('/api/proxy-users/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, protocol, vlessPort: Number(vlessPort) || 443 })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('addUserModal');
      showToast(`✅ Пользователь ${username} добавлен`, 'success');
      loadUsers();
    } else {
      showAlert(alertEl, data.message || 'Ошибка', 'error');
    }
  } catch {
    showAlert(alertEl, 'Ошибка соединения', 'error');
  }
}

function onNewUserProtocolChange() {
  const protocol = normalizeProtocol(document.getElementById('newUserProtocol').value);
  const portInput = document.getElementById('newUserVlessPort');
  if (protocol === 'vless') {
    document.getElementById('newUserPassword').value = generateUuidV4();
    portInput.disabled = false;
    autoPickVlessPort('newUserVlessPort');
  } else {
    generateUserPassword();
    portInput.disabled = true;
  }
}

function showDeleteModal(username) {
  deleteUserTarget = username;
  document.getElementById('deleteUserName').textContent = username;
  openModal('deleteUserModal');
}

async function confirmDeleteUser() {
  if (!deleteUserTarget) return;
  try {
    const res = await fetch(`/api/proxy-users/${encodeURIComponent(deleteUserTarget)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      closeModal('deleteUserModal');
      showToast(`Пользователь ${deleteUserTarget} удалён`, 'success');
      deleteUserTarget = null;
      loadUsers();
    } else {
      showToast(data.message || 'Ошибка удаления', 'error');
    }
  } catch {
    showToast('Ошибка соединения', 'error');
  }
}

async function loadConnections() {
  const table = document.getElementById('connectionsTable');
  const tbody = document.getElementById('connectionsTableBody');
  const empty = document.getElementById('emptyConnections');
  if (!table || !tbody || !empty) return;
  try {
    const res = await fetch('/api/connections');
    const data = await res.json();
    const list = data.connections || [];
    if (list.length === 0) {
      table.style.display = 'none';
      empty.style.display = 'block';
      return;
    }
    table.style.display = 'table';
    empty.style.display = 'none';
    tbody.innerHTML = '';
    list.forEach((item) => {
      tbody.innerHTML += `
        <tr>
          <td>${escapeHtml(item.time || '—')}</td>
          <td><span class="badge">${escapeHtml((item.protocol || 'unknown').toUpperCase())}</span></td>
          <td>${escapeHtml(item.username || '—')}</td>
          <td class="td-pwd">${escapeHtml(item.ip || '—')}</td>
          <td>${escapeHtml(item.device || '—')}</td>
          <td>${escapeHtml(item.hwid || 'Недоступно')}</td>
          <td class="td-link" title="${escapeHtml(item.userAgent || '—')}">${escapeHtml(item.userAgent || '—')}</td>
        </tr>`;
    });
  } catch {
    showToast('Ошибка загрузки подключений', 'error');
  }
}

// ─── SETTINGS ────────────────────────────────────
async function changePassword() {
  const currentPwd = document.getElementById('currentPwd').value;
  const newPwd = document.getElementById('newPwd').value;
  const confirmPwd = document.getElementById('confirmPwd').value;
  const alertEl = document.getElementById('pwdChangeAlert');

  if (!currentPwd || !newPwd || !confirmPwd) {
    showAlert(alertEl, 'Заполните все поля', 'error');
    return;
  }
  if (newPwd !== confirmPwd) {
    showAlert(alertEl, 'Новые пароли не совпадают', 'error');
    return;
  }
  if (newPwd.length < 6) {
    showAlert(alertEl, 'Пароль должен быть минимум 6 символов', 'error');
    return;
  }

  try {
    const res = await fetch('/api/config/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd })
    });
    const data = await res.json();
    if (data.success) {
      showAlert(alertEl, '✅ Пароль изменён', 'success');
      document.getElementById('currentPwd').value = '';
      document.getElementById('newPwd').value = '';
      document.getElementById('confirmPwd').value = '';
    } else {
      showAlert(alertEl, data.message || 'Ошибка', 'error');
    }
  } catch {
    showAlert(alertEl, 'Ошибка соединения', 'error');
  }
}

async function loadDiscordSettings() {
  const alertEl = document.getElementById('discordAlert');
  if (!alertEl) return;
  try {
    const res = await fetch('/api/config/discord');
    const data = await res.json();
    document.getElementById('discordWebhookUrl').value = data.webhookUrl || '';
    document.getElementById('discordIntervalSec').value = data.intervalSec || 300;
    document.getElementById('discordEnabled').checked = Boolean(data.enabled);
    alertEl.classList.add('hidden');
  } catch {
    showAlert(alertEl, 'Ошибка загрузки Discord настроек', 'error');
  }
}

async function saveDiscordSettings() {
  const alertEl = document.getElementById('discordAlert');
  const webhookUrl = document.getElementById('discordWebhookUrl').value.trim();
  const intervalSec = Number(document.getElementById('discordIntervalSec').value || 300);
  const enabled = document.getElementById('discordEnabled').checked;
  try {
    const res = await fetch('/api/config/discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl, intervalSec, enabled })
    });
    const data = await res.json();
    if (data.success) {
      showAlert(alertEl, '✅ Discord настройки сохранены', 'success');
    } else {
      showAlert(alertEl, data.message || 'Ошибка сохранения', 'error');
    }
  } catch {
    showAlert(alertEl, 'Ошибка соединения', 'error');
  }
}

async function testDiscordWebhook() {
  const alertEl = document.getElementById('discordAlert');
  try {
    const res = await fetch('/api/config/discord/test', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showAlert(alertEl, '✅ Тест отправлен в Discord', 'success');
    } else {
      showAlert(alertEl, data.message || 'Ошибка теста', 'error');
    }
  } catch {
    showAlert(alertEl, 'Ошибка соединения', 'error');
  }
}

async function loadSettingsPage() {
  await Promise.allSettled([
    loadDiscordSettings(),
    refreshWarp(),
    loadTiktokSettings(),
    loadUpdateInfo()
  ]);
}

// ─── WARP ────────────────────────────────────────
async function refreshWarp() {
  const alertEl = document.getElementById('warpAlert');
  if (!alertEl) return;
  
  try {
    const res = await fetch('/api/warp');
    const data = await res.json();
    
    document.getElementById('warpServiceStatus').textContent = (data.serviceStatus || '—') === 'active' ? 'active' : 'inactive';
    document.getElementById('warpEgressIpv4').textContent = data.egressIpv4 || '—';
    document.getElementById('warpEgressIpv6').textContent = data.egressIpv6 || '—';
    document.getElementById('warpEnabled').checked = Boolean(data.enabled);
    
    const ksEl = document.getElementById('warpKillswitch');
    if (ksEl) ksEl.checked = Boolean(data.killswitch);
    
    // Show status message if no other alert is visible
    if (alertEl.classList.contains('hidden')) {
      const statusText = data.serviceStatus === 'active' 
        ? `✅ WARP активен (IPv4: ${data.egressIpv4 || 'неизвестно'})`
        : '⚠️ WARP не активен';
      showAlert(alertEl, statusText, data.serviceStatus === 'active' ? 'success' : 'warning');
      setTimeout(() => { if (alertEl) alertEl.classList.add('hidden'); }, 5000);
    }
    
    alertEl.classList.add('hidden');
  } catch (err) {
    showAlert(alertEl, `Ошибка загрузки WARP статуса: ${err.message}`, 'error');
  }
}

async function installWarp() {
  const alertEl = document.getElementById('warpAlert');
  if (!alertEl) return;
  
  showAlert(alertEl, '🔧 Запускаем установку/восстановление WARP...\nЭто может занять 2-3 минуты.', 'info');
  
  try {
    const res = await fetch('/api/warp/install', { method: 'POST' });
    const data = await res.json();
    
    if (!data.success || !data.jobId) {
      const details = (data.details || data.error || data.output || '').toString().trim();
      const msg = details 
        ? `❌ ${data.message || 'Ошибка запуска установки WARP'}\n\n${details}` 
        : `❌ ${data.message || 'Ошибка запуска установки WARP'}`;
      showAlert(alertEl, msg, 'error');
      showToast('Ошибка запуска установки WARP', 'error');
      return;
    }
    
    showToast('Установка WARP запущена, ожидайте...', 'info');
    await pollWarpInstallJob(data.jobId);
  } catch (err) {
    showAlert(alertEl, `❌ Ошибка соединения: ${err.message}`, 'error');
    showToast('Ошибка соединения с сервером', 'error');
  }
}

let warpInstallPollTimer = null;
async function pollWarpInstallJob(jobId) {
  const alertEl = document.getElementById('warpAlert');
  if (!alertEl) return;
  if (warpInstallPollTimer) clearInterval(warpInstallPollTimer);

  const started = Date.now();
  
  warpInstallPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/warp/install/${encodeURIComponent(jobId)}`);
      const data = await res.json();
      if (!data.success || !data.job) return;
      
      const job = data.job;
      const elapsedSec = Math.floor((Date.now() - started) / 1000);
      const tail = (job.details || job.error || job.output || '').toString().trim();
      
      let statusText = '';
      let alertType = 'info';
      
      switch (job.status) {
        case 'running':
          statusText = `⏳ Статус: ${job.message || 'Установка в процессе'}\nПрошло времени: ${elapsedSec}s`;
          alertType = 'info';
          break;
        case 'success':
          statusText = `✅ ${job.message || 'WARP успешно установлен'}\nПрошло времени: ${elapsedSec}s`;
          alertType = 'success';
          break;
        case 'error':
          statusText = `❌ ${job.message || 'Ошибка установки'}\nПрошло времени: ${elapsedSec}s`;
          alertType = 'error';
          break;
        case 'cancelled':
          statusText = `⚠️ Установка отменена\nПрошло времени: ${elapsedSec}s`;
          alertType = 'warning';
          break;
        default:
          statusText = `Статус: ${job.status}\nПрошло: ${elapsedSec}s`;
      }
      
      const msg = tail ? `${statusText}\n\n${tail}` : statusText;
      showAlert(alertEl, msg, alertType);

      if (job.status === 'success' || job.status === 'error' || job.status === 'cancelled') {
        clearInterval(warpInstallPollTimer);
        warpInstallPollTimer = null;
        
        if (job.status === 'success') {
          await refreshWarp();
          showToast('✅ WARP установлен успешно!', 'success');
        } else if (job.status === 'error') {
          showToast('❌ Ошибка установки WARP. Проверьте лог выше.', 'error');
        } else {
          showToast('⚠️ Установка отменена', 'warning');
        }
      }
    } catch (err) {
      console.error('WARP poll error:', err);
      // Don't stop on transient errors, keep polling
    }
  }, 2000);
}

async function toggleWarpFromUi() {
  const alertEl = document.getElementById('warpAlert');
  if (!alertEl) return;
  
  const enabled = document.getElementById('warpEnabled').checked;
  const ksEl = document.getElementById('warpKillswitch');
  const killswitch = ksEl ? ksEl.checked : true;
  
  // Save killswitch preference first
  if (ksEl) {
    try {
      await fetch('/api/warp/killswitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: killswitch })
      });
    } catch (err) {
      console.error('Killswitch save error:', err);
    }
  }

  const actionText = enabled ? 'Включаем WARP...' : 'Выключаем WARP...';
  showAlert(alertEl, `${actionText}\nПожалуйста подождите...`, 'info');

  try {
    const res = await fetch('/api/warp/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    const data = await res.json();
    
    if (data.success) {
      // Success - update UI
      showAlert(alertEl, `✅ ${data.message}`, 'success');
      document.getElementById('warpEnabled').checked = Boolean(data.enabled);
      if (ksEl) ksEl.checked = Boolean(data.killswitch);
      document.getElementById('warpEgressIpv4').textContent = data.egressIpv4 || '—';
      document.getElementById('warpEgressIpv6').textContent = data.egressIpv6 || '—';
      showToast(data.message, 'success');
    } else {
      // Error handling
      const dbg = (data.debug || '').toString().trim();
      const errorMsg = dbg 
        ? `${data.message || 'Ошибка управления WARP'}\n\n${dbg}` 
        : (data.message || 'Ошибка управления WARP');
      
      showAlert(alertEl, `❌ ${errorMsg}`, 'error');
      showToast(errorMsg, 'error');
      
      // Revert checkbox if failed
      document.getElementById('warpEnabled').checked = !enabled;
    }
  } catch (err) {
    const errorMsg = 'Ошибка соединения с сервером. Проверьте консоль.';
    showAlert(alertEl, `❌ ${errorMsg}\n${err.message}`, 'error');
    showToast(errorMsg, 'error');
    document.getElementById('warpEnabled').checked = !enabled;
  }
}

async function showWarpDiagnostics() {
  const alertEl = document.getElementById('warpAlert');
  if (!alertEl) return;
  showAlert(alertEl, 'Получаем диагностику WARP...', 'info');
  try {
    const res = await fetch('/api/diagnostics/warp');
    const data = await res.json();
    if (!data.success) {
      showAlert(alertEl, 'Не удалось получить диагностику WARP', 'error');
      return;
    }
    const txt = [
      'WARP DIAGNOSTICS',
      '',
      '--- wg show ---',
      data.wg || '—',
      '',
      '--- systemctl status wg-quick@warp ---',
      data.serviceStatus || '—',
      '',
      '--- journalctl -u wg-quick@warp ---',
      data.serviceLog || '—'
    ].join('\n');
    showAlert(alertEl, txt, 'info');
  } catch {
    showAlert(alertEl, 'Ошибка соединения', 'error');
  }
}

async function loadUpdateInfo() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const atEl = document.getElementById('lastUpdateAt');
    const resEl = document.getElementById('lastUpdateResult');
    if (atEl) atEl.textContent = data.lastUpdateAt ? new Date(data.lastUpdateAt).toLocaleString('ru-RU') : '—';
    if (resEl) resEl.textContent = data.lastUpdateResult || '—';
  } catch {
    // ignore
  }
}

async function runPanelUpdate() {
  const alertEl = document.getElementById('discordAlert') || document.getElementById('warpAlert');
  if (alertEl) showAlert(alertEl, 'Запускаем обновление панели...', 'info');
  try {
    const res = await fetch('/api/update/run', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Панель обновлена', 'success');
    } else {
      showToast('❌ Ошибка обновления', 'error');
    }
    if (alertEl && data.details) {
      showAlert(alertEl, `${data.message}\n\n${data.details}`, data.success ? 'success' : 'error');
    }
    await loadUpdateInfo();
  } catch {
    if (alertEl) showAlert(alertEl, 'Ошибка соединения', 'error');
  }
}

// ─── TikTok ──────────────────────────────────────
async function loadTiktokSettings() {
  const alertEl = document.getElementById('tiktokAlert');
  if (!alertEl) return;
  try {
    const res = await fetch('/api/config/tiktok');
    const data = await res.json();
    document.getElementById('tiktokEnabled').checked = Boolean(data.enabled);
    alertEl.classList.add('hidden');
  } catch {
    showAlert(alertEl, 'Ошибка загрузки TikTok настроек', 'error');
  }
}

async function saveTiktokSettings() {
  const alertEl = document.getElementById('tiktokAlert');
  if (!alertEl) return;
  const enabled = document.getElementById('tiktokEnabled').checked;
  try {
    const res = await fetch('/api/config/tiktok', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    const data = await res.json();
    if (data.success) {
      showAlert(alertEl, '✅ TikTok режим сохранён', 'success');
    } else {
      showAlert(alertEl, data.message || 'Ошибка сохранения', 'error');
    }
  } catch {
    showAlert(alertEl, 'Ошибка соединения', 'error');
  }
}

async function copyTiktokDomains() {
  const alertEl = document.getElementById('tiktokAlert');
  if (!alertEl) return;
  try {
    const res = await fetch('/api/tiktok/domains');
    const data = await res.json();
    if (!data.success) {
      showAlert(alertEl, 'Не удалось получить домены', 'error');
      return;
    }
    const txt = (data.domains || []).join('\n');
    copyText(txt);
  } catch {
    showAlert(alertEl, 'Ошибка соединения', 'error');
  }
}

// ─── HELPERS ─────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Close modal on backdrop click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.add('hidden');
    }
  });
});

function showAlert(el, message, type = 'error') {
  el.className = `alert alert-${type}`;
  el.textContent = message;
  el.classList.remove('hidden');
}

function copyText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('✅ Скопировано!', 'success');
    }).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast('✅ Скопировано!', 'success');
}

let toastTimer = null;
let toastFadeTimer = null;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  // Reset any pending fade
  if (toastTimer) clearTimeout(toastTimer);
  if (toastFadeTimer) clearTimeout(toastFadeTimer);
  toast.classList.remove('hidden');
  toast.style.opacity = '';
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toastFadeTimer = setTimeout(() => {
      toast.classList.add('hidden');
      toast.style.opacity = '';
    }, 220);
  }, 2800);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
