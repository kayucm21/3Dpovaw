# CHANGELOG - NaiveProxy Panel

## 2026-05-04 15:53:39 UTC - 662afa60

- Author: Koda AI
- Message: Merge v5.0
- Commit: https://github.com/kayucm21/3Dpovaw/commit/662afa607894fba641dbfc76cffa1f86b66e28cc

### Changed files



## 2026-05-04 - Глобальное обновление v5.0 — Ultra-Fast Install & VDS Auto-Tune

### ✨ Новые функции v5.0

#### ⚡ Ultra-Fast Installation (60 секунд!)
- ✅ **Быстрая установка** — оптимизированный скрипт без задержек
- ✅ **Параллельные процессы** — apt и сборка данных одновременно
- ✅ **Минимум зависимостей** — только необходимое для работы
- ✅ **Автоматический выбор** — умные дефолты для неинтерактивного режима
- ✅ **Git shallow clone** — `--depth=1` для быстрой загрузки
- ✅ **npm production only** — `--omit=dev --no-audit --no-fund`

#### 🚀 VDS Auto-Tune & Optimization
- ✅ **Автоопределение ресурсов** — RAM, CPU cores, тип диска (SSD/HDD)
- ✅ **Системная оптимизация** — `/etc/sysctl.d/99-naiveproxy.conf`
- ✅ **BBR + TCP Fast Open** — сниженная задержка, повышенная пропускная способность
- ✅ **Увеличенные буферы** — `rmem_max/wmem_max = 67108864` (64MB)
- ✅ **Limits оптимизация** — `/etc/security/limits.d/99-naiveproxy.conf`
- ✅ **File descriptors** — `nofile 1048576`, `nproc 65536`
- ✅ **TCP оптимизации** — `tcp_tw_reuse`, `tcp_fin_timeout`, `tcp_keepalive_time`
- ✅ **Network tuning** — `netdev_max_backlog`, `ip_local_port_range`

#### 🔄 Auto-Update из GitHub
- ✅ **Git pull команда** — быстрое обновление одной командой
- ✅ **PM2 restart** — автоматический рестарт после обновления
- ✅ **Сохранение конфига** — данные не теряются при обновлении

#### 📱 Подписки VLESS (из v4.0)
- ✅ **Автообновляемые подписки** — `https://domain.com/sub/token`
- ✅ **QR-коды** — сканирование в приложении
- ✅ **Срок действия** — 7/30/90/365 дней
- ✅ **Лимит трафика** — ограничение GB на подписку
- ✅ **Поддержка клиентов** — Karing, v2rayNG, Shadowrocket, Quantumult X

#### ⚡ Тюнинг VLESS 50MB (из v4.0)
- ✅ **Буфер 50MB** — увеличенная пропускная способность
- ✅ **TCP Fast Open** — снижение задержки при подключении
- ✅ **MUX Concurrency 8** — стабильность соединения
- ✅ **WebSocket Early Data** — быстрый старт
- ✅ **Read/Write Buffer** — оптимизированные буферы 52428800 байт

### 🛠️ Технические улучшения

#### Install Script (install.sh)
- ✅ Полная переработка для скорости
- ✅ Параллельное выполнение задач
- ✅ VDS auto-detect (RAM/CPU/Disk)
- ✅ Автоматическая sysctl оптимизация
- ✅ Limits настройка
- ✅ Быстрый git clone (--depth=1)
- ✅ npm install с флагами скорости
- ✅ PM2 startup + save
- ✅ Firewall авто-настройка
- ✅ Nginx reverse proxy (режим 1 и 3)
- ✅ Let's Encrypt HTTPS (режим 3)

#### Backend (server/index.js)
- ✅ `GET /api/subscriptions` — список подписок
- ✅ `POST /api/subscriptions` — создание подписки
- ✅ `GET /sub/:token` — публичный API для клиентов
- ✅ `DELETE /api/subscriptions/:id` — удаление
- ✅ `POST /api/subscriptions/:id/renew` — продление
- ✅ `GET /api/traffic/:token` — статистика трафика

#### Frontend (public/index.html, public/js/app.js)
- ✅ Страница "Подписки" в меню
- ✅ Модальные окна QR-кодов
- ✅ Копирование ссылок
- ✅ Создание подписок с настройками
- ✅ Статус подписки (активна/истекла)

#### Скрипты установки
- ✅ `install_vless.sh` — тюнинг 50MB буфера, TCP оптимизации
- ✅ `install_naiveproxy.sh` — быстрая установка Caddy

#### Новые файлы
```
/etc/sysctl.d/99-naiveproxy.conf        — системная оптимизация
/etc/security/limits.d/99-naiveproxy.conf — limits настройки
panel/data/subscriptions.json           — подписки пользователей
panel/data/traffic.json                 — учёт трафика
```

### 📦 Обновлённые файлы
```
install.sh                              — Ultra-Fast Installer v5.0
README.md                               — обновлённая документация
CHANGELOG.md                            — история изменений
panel/server/index.js                   — API подписок
panel/public/index.html                 — страница подписок
panel/public/js/app.js                  — логика подписок
panel/scripts/install_vless.sh          — тюнинг VLESS 50MB
panel/public/css/style.css              — стили
```

### ⚙️ Установка v5.0
```bash
# Быстрая установка (60 секунд)
bash <(curl -fsSL https://raw.githubusercontent.com/kayucm21/3Dpovaw/main/install.sh)

# Обновление с v4.0
cd /opt/naiveproxy-panel && git pull
cd panel && npm install
pm2 restart naiveproxy-panel
```

### 🔧 Миграция с v4.0
1. Сделайте бэкап через панель
2. Обновите файлы: `git pull`
3. Установите зависимости: `npm install`
4. Перезапустите: `pm2 restart naiveproxy-panel`
5. Наслаждайтесь скоростью!

### 🐛 Исправления
- Удалена секция "Ссылки" из README
- Оптимизирована скорость установки
- Улучшена обработка ошибок
- Автоматический выбор режима при неинтерактивном запуске

### 🚀 Планы на v5.1
- Telegram бот для уведомлений
- Мультиязычность (RU/EN)
- Расширенная статистика трафика
- Авто-продление подписок
- Групповые подписки (семейный план)

---

## 2026-05-04 - Глобальное обновление v4.0 — Подписки VLESS и Тюнинг Скорости

(см. предыдущую версию CHANGELOG.md)

---

## 2026-05-04 - Глобальное обновление v3.0 — Modern UI/UX и Расширенные функции

(см. предыдущую версию CHANGELOG.md)
