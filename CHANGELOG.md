# CHANGELOG - NaiveProxy Panel

## 2026-05-12 09:43:17 UTC - 7ab467b8

- Author: kayucm21
- Message: v7.1 Ultra-Fast Installer — оптимизация для слабых VDS
- Commit: https://github.com/kayucm21/3Dpovaw/commit/7ab467b86ce216f153c7a6f24a42aa0178f8e7a5

### Changed files

- `install.sh`


## 2026-05-12 09:21:31 UTC - a58cff76

- Author: kayucm21
- Message: v7.1 Ultra-Fast VLESS Install — оптимизация скорости
- Commit: https://github.com/kayucm21/3Dpovaw/commit/a58cff76994a1e16e04093b68e1d7873d3699f32

### Changed files

- `install.sh`
- `panel/scripts/install_vless.sh`


## 2026-05-08 15:20:42 UTC - 8825555d

- Author: kayucm21
- Message: v7.0 VDS Каскад + Оптимизация скорости
- Commit: https://github.com/kayucm21/3Dpovaw/commit/8825555dbdef558ace483856c1eac0625d3333da

### Changed files

- `CHANGELOG.md`
- `README.md`
- `panel/package-lock.json`
- `panel/package.json`
- `panel/public/index.html`
- `panel/public/js/app.js`
- `panel/server/index.js`
- `panel/server/vds.js`


## 2026-05-04 — Глобальное обновление v7.0 — VDS Каскад + Оптимизация скорости

### ✨ Новые функции v7.0

#### 🔗 VDS Каскад (SSH-туннелирование)
- ✅ **SSH SOCKS5 туннель** — динамический порт-форвардинг через второй сервер
- ✅ **Авто root** — пользователь root прописывается автоматически
- ✅ **Добавление сервера** — IP, SSH порт, пароль, название
- ✅ **Режимы работы** — Основной сервер / Каскадный сервер
- ✅ **IP через каскад** — показывает внешний IP второго сервера
- ✅ **Speedtest через каскад** — замер скорости через SOCKS5 прокси
- ✅ **Авто-переподключение** — keepalive каждые 10 секунд

#### ⚡ Оптимизация скорости (BBR + TCP Tune)
- ✅ **BBR congestion control** — включение на сервере через SSH
- ✅ **TCP буферы** — rmem_max/wmem_max 134MB
- ✅ **TCP tuning** — оптимальные значения tcp_rmem/tcp_wmem
- ✅ **One-click оптимизация** — кнопка на каждом сервере
- ✅ **Работает на каскаде** — оптимизирует удалённый сервер напрямую через SSH exec

#### 🖥️ Панель VDS
- ✅ **Страница "VDS Каскад"** — в боковом меню
- ✅ **Управление серверами** — добавление, удаление, подключение
- ✅ **Визуальный статус** — бейдж подключения, выделение активного сервера
- ✅ **Карточки режимов** — выбор основного/каскадного с подсветкой
- ✅ **IP мониторинг** — отображение прямого и каскадного IP
- ✅ **Speedtest UI** — загрузка, отдача, пинг с анимацией

### 🛠️ Технические улучшения

#### Backend (panel/server/vds.js)
- ✅ Модуль `ssh2` для SSH-соединений
- ✅ Динамический forwardOut для SOCKS5
- ✅ Хранение конфигурации в `data/vds.json`
- ✅ Хранение состояния в `data/vds-state.json`
- ✅ API endpoints для полного управления

#### Backend (panel/server/index.js)
- ✅ Интеграция VDS API
- ✅ Версия панели обновлена до v4.0

#### Frontend (public/js/app.js)
- ✅ Полная логика VDS страницы
- ✅ Асинхронное управление серверами
- ✅ Speedtest с индикатором загрузки

#### Новые файлы
```
panel/server/vds.js                     — модуль SSH/VDS
```

### 📦 Обновлённые файлы
```
README.md                               — v7.0 документация
CHANGELOG.md                            — история изменений
panel/package.json                      — добавлен ssh2, версия 4.0.0
panel/server/index.js                   — VDS API интеграция
panel/public/index.html                 — страница VDS Каскад
panel/public/js/app.js                  — логика VDS
```

### ⚙️ Установка v7.0
```bash
# Быстрая установка
bash <(curl -fsSL https://raw.githubusercontent.com/kayucm21/3Dpovaw/main/install.sh)

# После установки:
cd /opt/naiveproxy-panel/panel && npm install
pm2 restart naiveproxy-panel
```

### 🔧 Миграция с v6.0
1. Обновите: `cd /opt/naiveproxy-panel && git pull`
2. Установите зависимости: `cd panel && npm install`
3. Перезапустите: `pm2 restart naiveproxy-panel`
4. Перейдите в раздел **VDS Каскад** и добавьте серверы

---

## 2026-05-04 16:13:39 UTC - a6d7863b

- Author: Koda AI
- Message: Merge v6.0
- Commit: https://github.com/kayucm21/3Dpovaw/commit/a6d7863bd8a338a393dce51027107c78260dd557

### Changed files



## 2026-05-04 - Глобальное обновление v6.0 — Reality Шифрование + SNI Маскировка + Скрипты

### ✨ Новые функции v6.0

#### 🔒 Reality + XTLS-Vision (МАКСИМАЛЬНОЕ ШИФРОВАНИЕ)
- ✅ **Reality протокол** — невозможно детектировать прокси-трафик
- ✅ **XTLS-Vision flow** — forward secrecy, защита прошлого трафика
- ✅ **x25519 ключи** — автогенерация Reality private/public ключей
- ✅ **Short ID** — случайные short IDs для маскировки
- ✅ **SNI spoofing** — трафик выглядит как обычный HTTPS к легитимным сайтам
- ✅ **Zero-RTT** — минимальная задержка при подключении
- ✅ **GeoIP/GeoSite** — блокировка рекламы и приватных IP

#### 🛡️ SNI Whitelist (БЕЛЫЕ СПИСКИ)
- ✅ **Поиск доменов** — проверка DNS и HTTP доступности
- ✅ **Быстрое добавление** — кнопка "Добавить" из результатов поиска
- ✅ **Популярные домены** — предустановленный список (Cloudflare, Microsoft, Apple, Amazon, Google)
- ✅ **Визуальный список** — теги с возможностью удаления
- ✅ **Включение/выключение** — переключатель в интерфейсе
- ✅ **Автообновление Xray** — при добавлении домена Xray перезагружается автоматически
- ✅ **История поиска** — лог последних 500 проверок
- ✅ **Информационный блок** — объяснение как работает SNI маскировка

#### 🖥️ Bash Скрипты Управления
- ✅ **panel-info.sh** — просмотр всех данных панели:
  - URL панели (автоопределение порта/домена/HTTPS)
  - Логин и пароль
  - Статус сервисов (Xray, Caddy, Nginx, Панель)
  - Готовые ссылки подключения
  - Статус WARP и SNI
  - Быстрые команды
- ✅ **panel-password.sh** — смена логина и пароля:
  - Проверка совпадения паролей
  - Bcrypt хеширование
  - Автоматический рестарт панели
  - Защита от пустых/коротких паролей

### 🛠️ Технические улучшения

#### Install Script (install.sh)
- ✅ Копирование panel-info.sh и panel-password.sh в /usr/local/bin
- ✅ Доступны глобально как команды: `panel-info`, `panel-password`

#### VLESS Install (scripts/install_vless.sh)
- ✅ Полная переработка с Reality вместо обычного TLS
- ✅ Автогенерация x25519 ключей
- ✅ Short IDs для маскировки
- ✅ SNI serverNames из whitelist
- ✅ XTLS-Vision flow
- ✅ Sniffing destOverride (http, tls, quic)
- ✅ GeoSite категория ads — блокировка рекламы

#### Backend (server/index.js)
- ✅ `GET /api/sni-whitelist` — список доменов
- ✅ `POST /api/sni-whitelist` — добавить домен
- ✅ `DELETE /api/sni-whitelist` — удалить домен
- ✅ `POST /api/sni-whitelist/toggle` — включить/выключить
- ✅ `POST /api/sni-whitelist/search` — поиск с DNS/HTTP проверкой
- ✅ `GET /api/sni-whitelist/presets` — популярные домены
- ✅ `GET /api/sni-whitelist/search-log` — история
- ✅ Автообновление Xray config при изменении whitelist

#### Frontend (public/index.html, public/js/app.js)
- ✅ Страница "SNI Whitelist" в меню
- ✅ Поисковая строка с кнопкой
- ✅ Результаты поиска с DNS/HTTP статусом
- ✅ Визуальные теги доменов
- ✅ Предустановленные домены (сетка карточек)
- ✅ Таблица истории поиска
- ✅ Информационный блок
- ✅ Переключатель включения/выключения

#### Новые файлы
```
panel-info.sh                           — скрипт просмотра данных
panel-password.sh                       — скрипт смены пароля
panel/data/reality-keys.json            — Reality ключи
panel/data/sni-whitelist.json           — белый список SNI
panel/data/sni-search-log.json          — лог поиска
```

### 📦 Обновлённые файлы
```
README.md                               — v6.0 документация
CHANGELOG.md                            — история изменений
install.sh                              — установка скриптов управления
panel/scripts/install_vless.sh          — Reality + XTLS-Vision
panel/server/index.js                   — SNI API
panel/public/index.html                 — страница SNI
panel/public/js/app.js                  — логика SNI
```

### ⚙️ Установка v6.0
```bash
# Быстрая установка
bash <(curl -fsSL https://raw.githubusercontent.com/kayucm21/3Dpovaw/main/install.sh)

# После установки:
panel-info        # посмотреть данные
panel-password    # сменить пароль
```

### 🔧 Миграция с v5.0
1. Сделайте бэкап через панель
2. Обновите: `cd /opt/naiveproxy-panel && git pull`
3. Переустановите VLESS: раздел "Установка" → выберите VLESS
4. Настройте SNI Whitelist

### 🐛 Исправления
- Улучшено шифрование VLESS (Reality вместо обычного TLS)
- Добавлены скрипты управления
- SNI маскировка для защиты от детектирования

### 🚀 Планы на v6.1
- Telegram бот для уведомлений
- Мультиязычность (RU/EN)
- Авто-продление подписок
- Групповые подписки

---

## 2026-05-04 - Глобальное обновление v5.0 — Ultra-Fast Install & VDS Auto-Tune
(см. предыдущую версию CHANGELOG.md)

---

## 2026-05-04 - Глобальное обновление v4.0 — Подписки VLESS и Тюнинг Скорости
(см. предыдущую версию CHANGELOG.md)

---

## 2026-05-04 - Глобальное обновление v3.0 — Modern UI/UX и Расширенные функции
(см. предыдущую версию CHANGELOG.md)
