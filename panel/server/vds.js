const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const VDS_CONFIG_FILE = path.join(__dirname, '../data/vds.json');
const VDS_STATE_FILE = path.join(__dirname, '../data/vds-state.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let sshClient = null;
let socksServer = null;
let currentStream = null;

function loadVdsConfig() {
  if (!fs.existsSync(VDS_CONFIG_FILE)) {
    const defaultConfig = {
      servers: [],
      activeServerId: null,
      mode: 'direct', // 'direct' | 'cascade'
      localSocksPort: 11080,
      autoOptimize: true
    };
    fs.writeFileSync(VDS_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(VDS_CONFIG_FILE, 'utf8'));
    if (!cfg.servers) cfg.servers = [];
    if (!cfg.mode) cfg.mode = 'direct';
    if (!cfg.localSocksPort) cfg.localSocksPort = 11080;
    return cfg;
  } catch {
    return { servers: [], activeServerId: null, mode: 'direct', localSocksPort: 11080, autoOptimize: true };
  }
}

function saveVdsConfig(config) {
  fs.writeFileSync(VDS_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadVdsState() {
  if (!fs.existsSync(VDS_STATE_FILE)) {
    const s = { connected: false, status: 'disconnected', externalIp: '', lastError: '', connectedAt: null };
    fs.writeFileSync(VDS_STATE_FILE, JSON.stringify(s, null, 2));
    return s;
  }
  try {
    return JSON.parse(fs.readFileSync(VDS_STATE_FILE, 'utf8'));
  } catch {
    return { connected: false, status: 'disconnected', externalIp: '', lastError: '', connectedAt: null };
  }
}

function saveVdsState(state) {
  fs.writeFileSync(VDS_STATE_FILE, JSON.stringify(state, null, 2));
}

function generateServerId() {
  return crypto.randomBytes(8).toString('hex');
}

function getSocksProxyUrl() {
  const config = loadVdsConfig();
  return `socks5://127.0.0.1:${config.localSocksPort}`;
}

// Execute command via SSH exec
function sshExec(command) {
  return new Promise((resolve, reject) => {
    if (!sshClient) return reject(new Error('SSH not connected'));
    sshClient.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => resolve({ code, stdout, stderr }));
      stream.on('data', (data) => { stdout += data.toString(); });
      stream.stderr.on('data', (data) => { stderr += data.toString(); });
    });
  });
}

// Execute local bash command with optional proxy env
function localExec(command, timeoutMs = 30000, useProxy = false) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (useProxy) {
      const proxyUrl = getSocksProxyUrl();
      env.ALL_PROXY = proxyUrl;
      env.HTTP_PROXY = proxyUrl;
      env.HTTPS_PROXY = proxyUrl;
    }
    const child = spawn('bash', ['-lc', command], { env, stdio: ['ignore', 'pipe', 'pipe'] });
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

async function connectToServer(serverId) {
  const config = loadVdsConfig();
  const server = config.servers.find(s => s.id === serverId);
  if (!server) throw new Error('Сервер не найден');

  // Disconnect existing if any
  await disconnectServer();

  return new Promise((resolve, reject) => {
    const client = new Client();
    sshClient = client;
    currentStream = null;

    client.on('ready', async () => {
      try {
        // Setup dynamic forward (SOCKS5)
        client.forwardOut('127.0.0.1', config.localSocksPort, '0.0.0.0', 0, (err, stream) => {
          if (err) {
            saveVdsState({ connected: false, status: 'error', externalIp: '', lastError: err.message, connectedAt: null });
            client.end();
            return reject(err);
          }
          currentStream = stream;
        });

        // Wait a bit for stream setup
        setTimeout(async () => {
          const state = loadVdsState();
          state.connected = true;
          state.status = 'connected';
          state.connectedAt = new Date().toISOString();
          state.lastError = '';
          config.activeServerId = serverId;
          config.mode = 'cascade';
          saveVdsConfig(config);

          // Get external IP through cascade
          try {
            const ipResult = await getExternalIp(true);
            state.externalIp = ipResult.ipv4 || ipResult.ipv6 || '';
          } catch {
            state.externalIp = '';
          }
          saveVdsState(state);
          resolve(state);
        }, 1500);
      } catch (e) {
        reject(e);
      }
    });

    client.on('error', (err) => {
      saveVdsState({ connected: false, status: 'error', externalIp: '', lastError: err.message, connectedAt: null });
      reject(err);
    });

    client.on('close', () => {
      const state = loadVdsState();
      if (state.status === 'connected') {
        state.connected = false;
        state.status = 'disconnected';
        state.connectedAt = null;
        saveVdsState(state);
      }
      sshClient = null;
      currentStream = null;
    });

    client.connect({
      host: server.host,
      port: server.port || 22,
      username: server.username || 'root',
      password: server.password,
      readyTimeout: 20000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3
    });
  });
}

async function disconnectServer() {
  return new Promise((resolve) => {
    const config = loadVdsConfig();
    config.activeServerId = null;
    config.mode = 'direct';
    saveVdsConfig(config);

    const state = loadVdsState();
    state.connected = false;
    state.status = 'disconnected';
    state.externalIp = '';
    state.connectedAt = null;
    saveVdsState(state);

    if (sshClient) {
      try {
        sshClient.end();
      } catch {}
      sshClient = null;
    }
    currentStream = null;
    resolve(true);
  });
}

async function getExternalIp(useProxy = false) {
  const v4 = await localExec("curl -4 -s --connect-timeout 8 ifconfig.me 2>/dev/null || curl -4 -s --connect-timeout 8 icanhazip.com 2>/dev/null || true", 15000, useProxy);
  const v6 = await localExec("curl -6 -s --connect-timeout 8 ifconfig.me 2>/dev/null || curl -6 -s --connect-timeout 8 icanhazip.com 2>/dev/null || true", 15000, useProxy);
  return {
    ipv4: (v4.stdout || '').split('\n')[0].trim(),
    ipv6: (v6.stdout || '').split('\n')[0].trim()
  };
}

async function runSpeedtest(useProxy = false) {
  // Use speedtest-cli if available, else fallback to curl download test
  const hasSpeedtest = await localExec('command -v speedtest-cli 2>/dev/null || echo "no"', 5000);
  if (hasSpeedtest.stdout && !hasSpeedtest.stdout.includes('no')) {
    const proxyPrefix = useProxy ? `ALL_PROXY=${getSocksProxyUrl()} ` : '';
    const result = await localExec(`${proxyPrefix}speedtest-cli --simple --timeout 15 2>/dev/null || true`, 30000);
    const lines = result.stdout.split('\n').filter(Boolean);
    const parseLine = (prefix) => {
      const line = lines.find(l => l.toLowerCase().startsWith(prefix.toLowerCase()));
      if (!line) return null;
      const match = line.match(/([0-9.]+)\s*Mbit\/s/);
      return match ? parseFloat(match[1]) : null;
    };
    return {
      method: 'speedtest-cli',
      ping: parseLine('Ping'),
      download: parseLine('Download'),
      upload: parseLine('Upload'),
      raw: result.stdout
    };
  }

  // Fallback curl speedtest
  const proxyOpt = useProxy ? `--proxy ${getSocksProxyUrl()}` : '';
  const dl = await localExec(`curl -o /dev/null -s -w '%{speed_download}' ${proxyOpt} --max-time 15 'https://speed.cloudflare.com/__down?bytes=25000000' 2>/dev/null || echo '0'`, 20000);
  const ul = await localExec(`curl -o /dev/null -s -w '%{speed_upload}' ${proxyOpt} --max-time 15 -d @/dev/urandom 'https://speed.cloudflare.com/__up' 2>/dev/null || echo '0'`, 20000);
  const downloadMbps = (parseFloat(dl.stdout || '0') * 8 / 1024 / 1024).toFixed(2);
  const uploadMbps = (parseFloat(ul.stdout || '0') * 8 / 1024 / 1024).toFixed(2);
  return {
    method: 'curl',
    ping: null,
    download: parseFloat(downloadMbps),
    upload: parseFloat(uploadMbps),
    raw: `Download: ${downloadMbps} Mbit/s, Upload: ${uploadMbps} Mbit/s`
  };
}

async function optimizeServer(serverId) {
  const config = loadVdsConfig();
  const server = config.servers.find(s => s.id === serverId);
  if (!server) throw new Error('Сервер не найден');

  // If connected to this server, use SSH exec
  if (sshClient && config.activeServerId === serverId) {
    const commands = [
      'sysctl -w net.core.rmem_max=134217728',
      'sysctl -w net.core.wmem_max=134217728',
      'sysctl -w net.ipv4.tcp_rmem="4096 87380 134217728"',
      'sysctl -w net.ipv4.tcp_wmem="4096 65536 134217728"',
      'sysctl -w net.ipv4.tcp_congestion_control=bbr',
      'sysctl -w net.ipv4.tcp_notsent_lowat=16384',
      'echo "net.core.rmem_max=134217728" >> /etc/sysctl.conf',
      'echo "net.core.wmem_max=134217728" >> /etc/sysctl.conf',
      'echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf',
      'sysctl -p 2>/dev/null || true'
    ];
    const results = [];
    for (const cmd of commands) {
      try {
        const r = await sshExec(cmd);
        results.push({ cmd, code: r.code });
      } catch (e) {
        results.push({ cmd, code: -1, error: e.message });
      }
    }
    return { success: true, method: 'ssh', results };
  }

  // Otherwise use local SSH command
  const sshCmd = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${server.port || 22} ${server.username || 'root'}@${server.host} '`;
  const remoteCommands = [
    'sysctl -w net.core.rmem_max=134217728',
    'sysctl -w net.core.wmem_max=134217728',
    'sysctl -w net.ipv4.tcp_congestion_control=bbr',
    'sysctl -p 2>/dev/null || true'
  ].join(' && ');
  const fullCmd = `${sshCmd}${remoteCommands}'`;
  const result = await localExec(fullCmd, 30000);
  return { success: result.code === 0, method: 'local-ssh', output: result.stdout, error: result.stderr };
}

function getStatus() {
  const config = loadVdsConfig();
  const state = loadVdsState();
  const activeServer = config.servers.find(s => s.id === config.activeServerId) || null;
  return {
    ...state,
    mode: config.mode,
    localSocksPort: config.localSocksPort,
    autoOptimize: config.autoOptimize,
    activeServer: activeServer ? { id: activeServer.id, host: activeServer.host, port: activeServer.port || 22, username: activeServer.username || 'root' } : null,
    servers: config.servers.map(s => ({ id: s.id, host: s.host, port: s.port || 22, username: s.username || 'root', label: s.label || s.host }))
  };
}

function addServer({ host, port, password, username, label }) {
  const config = loadVdsConfig();
  const id = generateServerId();
  config.servers.push({
    id,
    host,
    port: Number(port) || 22,
    username: username || 'root',
    password,
    label: label || host,
    createdAt: new Date().toISOString()
  });
  saveVdsConfig(config);
  return { id, host, port: Number(port) || 22, username: username || 'root', label: label || host };
}

function removeServer(serverId) {
  const config = loadVdsConfig();
  if (config.activeServerId === serverId) {
    disconnectServer();
  }
  config.servers = config.servers.filter(s => s.id !== serverId);
  saveVdsConfig(config);
  return true;
}

function updateServer(serverId, updates) {
  const config = loadVdsConfig();
  const server = config.servers.find(s => s.id === serverId);
  if (!server) return null;
  if (updates.host) server.host = updates.host;
  if (updates.port) server.port = Number(updates.port);
  if (updates.password) server.password = updates.password;
  if (updates.username) server.username = updates.username;
  if (updates.label !== undefined) server.label = updates.label;
  saveVdsConfig(config);
  return server;
}

module.exports = {
  loadVdsConfig,
  saveVdsConfig,
  loadVdsState,
  saveVdsState,
  connectToServer,
  disconnectServer,
  getExternalIp,
  runSpeedtest,
  optimizeServer,
  getStatus,
  addServer,
  removeServer,
  updateServer,
  getSocksProxyUrl,
  sshExec,
  localExec
};
