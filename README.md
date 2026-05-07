# 🚀 NaiveProxy Panel v7.0

> Современная веб-панель управления для быстрой установки и управления `NaiveProxy`, `VLESS` с максимальным шифрованием на VPS

![Version](https://img.shields.io/badge/version-7.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Ubuntu%2022.04%20%7C%2024.04%20%7C%20Debian%2011%20%7C%2012-lightgrey)

---

## 🎯 Что нового в v7.0?

### ✨ Ключевые функции v7.0
- 🔒 **Reality + XTLS-Vision** — максимальное шифрование, невозможно отследить трафик
- 🛡️ **SNI Whitelist Manager** — расширенное управление доменами для маскировки
- 🔍 **Автопроверка доменов** — DNS и HTTPS проверка перед добавлением
- ⭐ **Популярные домены** — 15 предустановленных доменов (Cloudflare, Microsoft, Apple...)
- 🖥️ **panel-info** — bash скрипт для просмотра текущих данных панели
- 🔑 **panel-password** — bash скрипт для смены логина и пароля
- ⚡ **Ultra-Fast Install** — установка за 60 секунд
- 🚀 **VDS Auto-Tune** — автооптимизация под ресурсы сервера
- 📱 **Подписки VLESS** — автообновляемые подписки
- 🎨 **Тёмная/светлая тема** — плавное переключение
- 🔐 **2FA аутентификация** — защита с Google Authenticator
- 🔄 **Auto Update** — автоматическое обновление панели

---

## 🛠️ Быстрая установка (60 секунд)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kayucm21/3Dpovaw/main/install.sh)
```

---

## 🖥️ Скрипты управления

### panel-info — Просмотр данных панели
```bash
panel-info
# или
bash /opt/naiveproxy-panel/panel-info.sh
```

**Показывает:**
- 🌐 URL панели (с автоопределением порта/домена/HTTPS)
- 🔑 Логин и пароль
- 📊 Статус всех сервисов (Xray, Caddy, Nginx, Панель)
- 🔗 Готовые ссылки подключения (Naive / VLESS)
- 🛡️ Статус WARP и SNI
- ⚡ Быстрые команды

### panel-password — Смена логина и пароля
```bash
panel-password
# или
bash /opt/naiveproxy-panel/panel-password.sh
```

**Возможности:**
- Смена логина (по умолчанию `admin`)
- Смена пароля с проверкой совпадения
- Автоматический рестарт панели
- Bcrypt хеширование пароля

### panel-sni — Управление SNI Whitelist (NEW v7.0!)
```bash
panel-sni
# или
bash /opt/naiveproxy-panel/panel-sni.sh
```

**Возможности:**
- 👁️ Просмотр списка доменов
- ➕ Добавление доменов для маскировки
- ➖ Удаление доменов
- ⚡ Включение/выключение доменов
- ⭐ Добавление популярных доменов (15 штук)
- 🔍 Проверка доступности домена (DNS, HTTPS, SNI)
- 🔄 Обновление Xray конфигу с новыми доменами

---

## 🔄 Обновление панели

```bash
cd /opt/naiveproxy-panel && git pull --ff-only && cd panel && npm install && pm2 restart naiveproxy-panel
```

---

## 📋 Требования к серверу

- Ubuntu 22.04 / 24.04 или Debian 11 / 12
- Поддомен с A-записью на IP сервера
- Открытые порты: 22, 80, 443, 3000
- Минимум 512 MB RAM

---

## 🛡️ SNI Whitelist (Маскировка трафика)

### Как это работает
SNI (Server Name Indication) позволяет замаскировать прокси-трафик под обычные посещения легитимных сайтов:

1. **Добавьте домены** в белый список через поиск или из предустановок
2. **Xray Reality** использует эти домены как маскировочные SNI
3. **Провайдер видит** только соединение с Cloudflare/Microsoft/Apple
4. **Невозможно определить** что вы используете прокси!

### Популярные маскировочные домены (v7.0)
- `www.cloudflare.com` — CDN (рекомендуется)
- `www.microsoft.com` — Microsoft
- `www.apple.com` — Apple
- `www.amazon.com` — Amazon
- `www.google.com` — Google
- `www.youtube.com` — YouTube
- `www.facebook.com` — Facebook
- `www.twitter.com` — Twitter
- `www.instagram.com` — Instagram
- `www.linkedin.com` — LinkedIn
- `www.netflix.com` — Netflix
- `www.icloud.com` — iCloud
- `www.outlook.com` — Outlook
- `www.dropbox.com` — Dropbox

---

## 🔒 Reality + XTLS-Vision (Невозможно отследить)

VLESS v7.0 использует передовую технологию защиты:

```
Protocol:  VLESS
Security:  REALITY
Flow:      xtls-rprx-vision
SNI:       Маскировочный домен из whitelist
Public Key: Автогенерируемый ключ
Short ID:  Автогенерируемый ID
```

**Преимущества Reality:**
- 🛡️ **Невозможно детектировать** — трафик выглядит как обычный HTTPS
- 🔒 **Forward secrecy** — даже при компрометации ключей прошлый трафик защищён
- ⚡ **Zero-RTT** — минимальная задержка при подключении
- 🎭 **SNI spoofing** — маскировка под любой легитимный сайт
- 🔑 **Динамические ключи** — несколько Short ID для дополнительной защиты

---

## 📱 Клиенты для подключения

| Платформа | Приложение | Reality |
|-----------|-----------|---------|
| iOS | Karing | ✅ |
| iOS | Shadowrocket | ✅ |
| Android | v2rayNG | ✅ |
| Windows | v2rayN | ✅ |
| macOS | V2RayXS | ✅ |
| Linux | v2ray | ✅ |

---

## 🎯 Быстрый старт

1. **Установите панель** (60 секунд)
   ```bash
   bash <(curl -fsSL https://raw.githubusercontent.com/kayucm21/3Dpovaw/main/install.sh)
   ```

2. **Войдите** по адресу из `panel-info`

3. **Смените пароль** через `panel-password`

4. **Настройте SNI Whitelist**:
   ```bash
   panel-sni
   # Добавьте популярные домены или свои
   ```

5. **Создайте подписку** — получите автообновляемую ссылку

6. **Подключитесь** через Karing/v2rayNG

---

## 🔧 Управление через API

### SNI Whitelist
```bash
GET  /api/sni-whitelist              # Список доменов
POST /api/sni-whitelist              # Добавить домен
DELETE /api/sni-whitelist            # Удалить домен
POST /api/sni-whitelist/toggle       # Включить/выключить
POST /api/sni-whitelist/search       # Поиск домена
GET  /api/sni-whitelist/presets      # Популярные домены
GET  /api/sni-whitelist/search-log   # История поиска
```

### Подписки
```bash
GET  /api/subscriptions
POST /api/subscriptions
GET  /sub/:token
```

---

## 📊 Мониторинг и безопасность

### Discord Webhook
- 🔔 Уведомления о статусе сервиса
- 📊 Отправка метрик (CPU, RAM)
- 🚫 Уведомления о блокировке устройств
- ⏰ Регулярные отчеты (настраиваемый интервал)

### Управление устройствами
- 📱 Просмотр всех подключённых устройств
- 🔑 HWID идентификация
- 🚫 Блокировка подозрительных устройств
- 📊 История подключений

---

## ⚡ Оптимизация VDS (Auto-Tune)

Панель автоматически настраивает:
- **BBR Congestion** — улучшенный алгоритм TCP
- **TCP Fast Open** — ускорение установки соединений
- **Socket Buffers** — оптимизация размеров буферов
- **File Descriptors** — увеличение лимитов
- **Connection Tracking** — оптимизация таблиц соединений

---

## 🆘 Решение проблем

### Xray не запускается
```bash
journalctl -u xray -n 50 --no-pager
```

### Домен не доступен
```bash
panel-sni
# Проверьте доступность через пункт 6
```

### Обновление не работает
```bash
cd /opt/naiveproxy-panel && git pull --ff-only
cd panel && npm install
pm2 restart naiveproxy-panel
```

---

## 📜 License

MIT License

---

**Создано с ❤️ для безопасного интернета**

v7.0 — Reality шифрование, SNI маскировка, невозможно отследить!
