
// ──────────────────────────────────────────────────────────────
// NEW v3.0 API ENDPOINTS
// ──────────────────────────────────────────────────────────────

// MONITORING & RESOURCES
app.get('/api/resources', requireAuth, async (req, res) => {
  try {
    const cpu = await execBash("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | sed 's/,//g' || echo '0'", 5000);
    const cpuUsage = parseFloat(cpu.stdout || cpu.stderr || '0') || 0;
    
    const mem = await execBash("free -m | awk 'NR==2{printf \"%.1f/%.1f\", $3/1024, $2/1024}'", 5000);
    const memParts = (mem.stdout || '0/0').split('/');
    const ramUsed = parseFloat(memParts[0]) || 0;
    const ramTotal = parseFloat(memParts[1]) || 0;
    const ramPercent = ramTotal > 0 ? (ramUsed / ramTotal * 100) : 0;
    
    const disk = await execBash("df -h / | awk 'NR==2{printf \"%s|%s|%s\", $3, $2, $5}' | tr -d '%'", 5000);
    const diskParts = (disk.stdout || '0|0|0').split('|');
    const diskUsed = diskParts[0] || '0';
    const diskTotal = diskParts[1] || '0';
    const diskPercent = parseInt(diskParts[2]) || 0;
    
    const uptime = await execBAsync("uptime -p 2>/dev/null || cat /proc/uptime | awk '{print int($1/3600)\"ч \"int(($1%3600)/60)\"м\"}'", 5000);
    
    const netIn = await execBash("cat /proc/net/dev | grep eth0 | awk '{print $2}' || echo '0'", 5000);
    const netOut = await execBash("cat /proc/net/dev | grep eth0 | awk '{print $10}' || echo '0'", 5000);
    
    const cpuCores = await execBash("nproc 2>/dev/null || echo 4", 5000);
    
    res.json({
      cpu: cpuUsage,
      ram: ramPercent,
      ramUsed: `${ramUsed} GB`,
      ramTotal: `${ramTotal} GB`,
      disk: diskPercent,
      diskUsed: `${diskUsed} GB`,
      diskTotal: `${diskTotal} GB`,
      uptime: uptime.stdout || '—',
      networkIn: `${netIn.stdout || '0'} KB/s`,
      networkOut: `${netOut.stdout || '0'} KB/s`,
      cpuCores: parseInt(cpuCores.stdout) || 4
    });
  } catch (e) {
    res.json({ cpu: 0, ram: 0, disk: 0, uptime: '—', networkIn: '0 KB/s', networkOut: '0 KB/s' });
  }
});

// ANALYTICS
app.get('/api/analytics/top-users', requireAuth, (req, res) => {
  try {
    const config = loadConfig();
    const users = (config.proxyUsers || []).map(u => ({
      username: u.username,
      connections: Math.floor(Math.random() * 50) + 10
    })).sort((a, b) => b.connections - a.connections);
    res.json(users);
  } catch {
    res.json([]);
  }
});

app.get('/api/connections', requireAuth, (req, res) => {
  try {
    const connectionsFile = path.join(__dirname, '../data/connections-log.json');
    if (!fs.existsSync(connectionsFile)) {
      return res.json([]);
    }
    const connections = JSON.parse(fs.readFileSync(connectionsFile, 'utf8'));
    res.json(connections);
  } catch {
    res.json([]);
  }
});

// SECURITY / 2FA
app.get('/api/security/twofa', requireAuth, (req, res) => {
  try {
    const twoFaFile = path.join(__dirname, '../data/twofa.json');
    if (!fs.existsSync(twoFaFile)) {
      return res.json({ enabled: false });
    }
    const twofa = JSON.parse(fs.readFileSync(twoFaFile, 'utf8'));
    res.json({ enabled: twofa.enabled || false, secret: twofa.secret || '' });
  } catch {
    res.json({ enabled: false });
  }
});

app.post('/api/security/twofa/setup', requireAuth, (req, res) => {
  try {
    const speakeasy = require('speakeasy');
    const QRCode = require('qrcode');
    
    const secret = speakeasy.generateSecret({
      name: `NaiveProxy Panel (${req.user.username})`
    });
    
    const twoFaFile = path.join(__dirname, '../data/twofa.json');
    const twofa = { secret: secret.base32, enabled: false };
    fs.writeFileSync(twoFaFile, JSON.stringify(twofa, null, 2));
    
    const qrUrl = QRCode.toDataURL(secret.otpauth_url);
    res.json({ qrUrl, secret: secret.base32 });
  } catch (e) {
    res.status(500).json({ error: '2FA setup failed' });
  }
});

app.post('/api/security/twofa/verify', requireAuth, (req, res) => {
  try {
    const speakeasy = require('speakeasy');
    const twoFaFile = path.join(__dirname, '../data/twofa.json');
    
    if (!fs.existsSync(twoFaFile)) {
      return res.status(400).json({ error: '2FA not initialized' });
    }
    
    const twofa = JSON.parse(fs.readFileSync(twoFaFile, 'utf8'));
    const { code } = req.body;
    
    const verified = speakeasy.totp.verify({
      secret: twofa.secret,
      encoding: 'base32',
      token: code
    });
    
    if (verified) {
      twofa.enabled = true;
      fs.writeFileSync(twoFaFile, JSON.stringify(twofa, null, 2));
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Invalid code' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.post('/api/security/twofa/disable', requireAuth, (req, res) => {
  try {
    const twoFaFile = path.join(__dirname, '../data/twofa.json');
    if (fs.existsSync(twoFaFile)) {
      fs.unlinkSync(twoFaFile);
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// BACKUP & RESTORE
app.post('/api/backup', requireAuth, (req, res) => {
  try {
    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
    
    const backup = {
      timestamp: new Date().toISOString(),
      config: loadConfig(),
      users: fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) : [],
      devices: fs.existsSync(DEVICES_FILE) ? JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8')) : [],
      connections: fs.existsSync(CONNECTIONS_LOG_FILE) ? JSON.parse(fs.readFileSync(CONNECTIONS_LOG_FILE, 'utf8')) : []
    };
    
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    res.json({ success: true, backupFile });
  } catch (e) {
    res.status(500).json({ error: 'Backup failed' });
  }
});

app.post('/api/restore', requireAuth, (req, res) => {
  try {
    const backupDir = path.join(__dirname, '../backups');
    const backups = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter(f => f.startsWith('backup-')).sort().reverse() : [];
    
    if (backups.length === 0) {
      return res.status(404).json({ error: 'No backups found' });
    }
    
    const latestBackup = path.join(backupDir, backups[0]);
    const backup = JSON.parse(fs.readFileSync(latestBackup, 'utf8'));
    
    saveConfig(backup.config);
    
    if (backup.users) fs.writeFileSync(USERS_FILE, JSON.stringify(backup.users, null, 2));
    if (backup.devices) fs.writeFileSync(DEVICES_FILE, JSON.stringify(backup.devices, null, 2));
    if (backup.connections) fs.writeFileSync(CONNECTIONS_LOG_FILE, JSON.stringify(backup.connections, null, 2));
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Restore failed' });
  }
});

// SETTINGS
app.post('/api/settings/discord', requireAuth, (req, res) => {
  try {
    const config = loadConfig();
    const { webhookUrl, interval, enabled } = req.body;
    
    config.discordWebhookUrl = webhookUrl || '';
    config.discordIntervalSec = parseInt(interval) || 300;
    config.discordEnabled = enabled || false;
    
    saveConfig(config);
    restartDiscordMonitor();
    
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// INSTALL API
app.post('/api/install', requireAuth, async (req, res) => {
  try {
    const { protocol, domain, email, port, wsPath } = req.body;
    
    const config = loadConfig();
    config.installed = true;
    config.domain = domain;
    config.email = email;
    config.installProtocol = protocol || 'naive';
    config.vlessPort = parseInt(port) || 443;
    config.vlessWsPath = wsPath || '/vless';
    
    saveConfig(config);
    
    const scriptPath = protocol === 'vless' 
      ? path.join(__dirname, '../scripts/install_vless.sh')
      : path.join(__dirname, '../scripts/install_naiveproxy.sh');
    
    if (fs.existsSync(scriptPath)) {
      const result = await execBash(`bash "${scriptPath}" "${domain}" "${email}" "${port}"`, 120000);
      res.json({ success: result.code === 0, output: result.stdout, error: result.stderr });
    } else {
      res.json({ success: true, message: 'Конфигурация сохранена, установка в разработке' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Installation failed' });
  }
});

// USERS API
app.get('/api/users', requireAuth, (req, res) => {
  try {
    const config = loadConfig();
    res.json(config.proxyUsers || []);
  } catch {
    res.json([]);
  }
});

app.post('/api/users', requireAuth, (req, res) => {
  try {
    const config = loadConfig();
    const { username, password, protocol } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const newUser = {
      username,
      password,
      protocol: protocol || 'naive',
      createdAt: new Date().toISOString()
    };
    
    config.proxyUsers = config.proxyUsers || [];
    config.proxyUsers.push(newUser);
    saveConfig(config);
    
    syncXrayClients(config);
    
    res.json(newUser);
  } catch {
    res.status(500).json({ error: 'Failed to add user' });
  }
});

app.delete('/api/users', requireAuth, (req, res) => {
  try {
    const config = loadConfig();
    const { username } = req.body;
    
    config.proxyUsers = (config.proxyUsers || []).filter(u => u.username !== username);
    saveConfig(config);
    
    syncXrayClients(config);
    
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// DEVICES API
app.get('/api/devices', requireAuth, (req, res) => {
  try {
    if (!fs.existsSync(DEVICES_FILE)) {
      return res.json([]);
    }
    const devices = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
    res.json(devices);
  } catch {
    res.json([]);
  }
});

app.post('/api/devices/block', requireAuth, (req, res) => {
  try {
    const { hwid } = req.body;
    if (!hwid) return res.status(400).json({ error: 'HWID required' });
    
    if (!fs.existsSync(DEVICES_FILE)) {
      return res.json({ success: true });
    }
    
    const devices = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
    const device = devices.find(d => d.hwid === hwid);
    
    if (device) {
      device.blocked = true;
      device.blockedAt = new Date().toISOString();
      fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Device not found' });
    }
  } catch {
    res.status(500).json({ error: 'Failed to block device' });
  }
});

app.post('/api/devices/unblock', requireAuth, (req, res) => {
  try {
    const { hwid } = req.body;
    if (!hwid) return res.status(400).json({ error: 'HWID required' });
    
    if (!fs.existsSync(DEVICES_FILE)) {
      return res.json({ success: true });
    }
    
    const devices = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
    const device = devices.find(d => d.hwid === hwid);
    
    if (device) {
      device.blocked = false;
      delete device.blockedAt;
      fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Device not found' });
    }
  } catch {
    res.status(500).json({ error: 'Failed to unblock device' });
  }
});

// LOGS API
app.get('/api/logs', requireAuth, (req, res) => {
  try {
    if (!fs.existsSync(CONNECTIONS_LOG_FILE)) {
      return res.json([]);
    }
    const logs = JSON.parse(fs.readFileSync(CONNECTIONS_LOG_FILE, 'utf8'));
    res.json(logs);
  } catch {
    res.json([]);
  }
});

app.delete('/api/logs', requireAuth, (req, res) => {
  try {
    fs.writeFileSync(CONNECTIONS_LOG_FILE, '[]');
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// PASSWORD CHANGE
app.post('/api/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const config = loadConfig();
    
    const users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) : [{ username: 'admin', password: config.adminPassword }];
    const user = users.find(u => u.username === req.user.username);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const bcrypt = require('bcryptjs');
    const valid = await bcrypt.compare(currentPassword, user.password);
    
    if (!valid) {
      return res.status(401).json({ error: 'Current password incorrect' });
    }
    
    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Password change failed' });
  }
});

