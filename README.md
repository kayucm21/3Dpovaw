# 🚀 NaiveProxy Panel v7.0

> Современная веб-панель управления для быстрой установки и управления `NaiveProxy`, `VLESS`, `VDS Каскад` с максимальным шифрованием на VPS

![Version](https://img.shields.io/badge/version-7.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Ubuntu%2022.04%20%7C%2024.04%20%7C%20Debian%2011%20%7C%2012-lightgrey)

---

## 🎯 Что нового в v7.0?

### ✨ Ключевые функции v7.0
- 🔗 **VDS Каскад** — SSH-туннелирование через второй сервер с авто-оптимизацией скорости
- 🌍 **IP через каскад** — показывает внешний IP второго сервера
- ⚡ **Speedtest через каскад** — замер скорости через SOCKS5 туннель
- 🔧 **Авто-оптимизация BBR** — увеличение скорости интернета на VDS
- 🔒 **Reality + XTLS-Vision** — максимальное шифрование, невозможно отследить трафик
- 🛡️ **SNI Whitelist** — маскировка под легитимные сайты (Cloudflare, Microsoft, Apple)
- 🔍 **Поиск доменов** — проверка DNS и доступности перед добавлением
- ⭐ **Популярные домены** — быстрое добавление из предустановленного списка
- 🖥️ **panel-info** — bash скрипт для просмотра текущих данных панели
- 🔑 **panel-password** — bash скрипт для смены логина и пароля
- ⚡ **Ultra-Fast Install** — установка за 60 секунд
- 🚀 **VDS Auto-Tune** — автооптимизация под ресурсы сервера
- 📱 **Подписки VLESS** — автообновляемые подписки
- 🎨 **Тёмная/светлая тема** — плавное переключение
- 🔐 **2FA аутентификация** — защита с Google Authenticator

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

## 🔗 VDS Каскад (SSH-туннелирование)

### Что это?
VDS Каскад позволяет направить весь трафик через второй (промежуточный) сервер по SSH, создавая SOCKS5 прокси на локальном порту.

### Возможности
- 🌍 **Показ IP** — отображает внешний IP второго сервера
- ⚡ **Speedtest** — замер скорости через каскадный сервер
- 🔧 **Оптимизация** — применяет BBR и увеличивает TCP буферы для максимальной скорости
- 🔀 **Переключение** — легко переключаться между основным и каскадным сервером

### Как использовать
1. Перейдите в раздел **VDS Каскад** в панели
2. Добавьте сервер: IP, SSH порт (по умолчанию 22), пароль root (авто)
3. Выберите режим **Каскадный сервер**
4. Нажмите **Подключить** на нужном сервере
5. Наблюдайте IP второго сервера и тестируйте скорость

### API VDS
```bash
GET  /api/vds/status              # Статус подключения
POST /api/vds/servers             # Добавить сервер
DELETE /api/vds/servers/:id       # Удалить сервер
POST /api/vds/connect             # Подключиться
POST /api/vds/disconnect          # Отключиться
GET  /api/vds/ip?cascade=true     # IP через каскад
POST /api/vds/speedtest           # Тест скорости
POST /api/vds/optimize            # Оптимизация BBR
POST /api/vds/mode                # Смена режима
```

---

## 🛡️ SNI Whitelist (Маскировка трафика)

### Как это работает
SNI (Server Name Indication) позволяет замаскировать прокси-трафик под обычные посещения легитимных сайтов:

1. **Добавьте домены** в белый список через поиск или из предустановок
2. **Xray Reality** использует эти домены как маскировочные SNI
3. **Провайдер видит** только соединение с Cloudflare/Microsoft/Apple
4. **Невозможно определить** что вы используете прокси!

### Популярные маскировочные домены
- `www.cloudflare.com` — CDN (рекомендуется)
- `www.microsoft.com` — Microsoft
- `www.apple.com` — Apple
- `www.amazon.com` — Amazon
- `www.google.com` — Google

---

## 🔒 Reality + XTLS-Vision (Невозможно отследить)

VLESS v6.0 использует передовую технологию защиты:

```
Protocol:  VLESS
Security:  REALITY
Flow:      xtls-rprx-vision
SNI:       Маскировочный домен из whitelist
```

**Преимущества Reality:**
- 🛡️ **Невозможно детектировать** — трафик выглядит как обычный HTTPS
- 🔒 **Forward secrecy** — даже при компрометации ключей прошлый трафик защищён
- ⚡ **Zero-RTT** — минимальная задержка при подключении
- 🎭 **SNI spoofing** — маскировка под любой легитимный сайт

---

## 📱 Клиенты для подключения

| Платформа | Приложение | Reality |
|-----------|-----------|---------|
| iOS | Karing | ✅ |
| iOS | Shadowrocket | ✅ |
| Android | v2rayNG | ✅ |
| Windows | v2rayN | ✅ |
| macOS | V2RayXS | ✅ |

---

## 🎯 Быстрый старт

1. **Установите панель** (60 секунд)
2. **Войдите** по адресу из `panel-info`
3. **Смените пароль** через `panel-password`
4. **Настройте SNI Whitelist** — добавьте маскировочные домены
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

## 📜 License

MIT License

---

**Создано с ❤️ для безопасного интернета**

v6.0 — Reality шифрование, SNI маскировка, невозможно отследить!
