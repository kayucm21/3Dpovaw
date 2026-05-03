# CHANGELOG

## 2024-XX-XX - Глобальное обновление v2.0 - Мониторинг устройств и расширенные логи

### ✨ Новые функции

#### 🔍 Мониторинг подключений в реальном времени
- ✅ **HWID (Серийный номер устройства)** - автоматическая генерация уникального идентификатора для каждого устройства
- ✅ **Распознавание платформ** - автоматическое определение iOS, Android, Windows, macOS, Linux
- ✅ **IP-адреса подключений** - отслеживание IP адресов с которых заходят пользователи
- ✅ **User-Agent анализ** - полный анализ браузера/клиента пользователя
- ✅ **Время подключения** - точное время каждого подключения в МСК

#### 🚫 Управление устройствами
- ✅ **Блокировка устройств** - кнопка "Заблокировать" для запрета доступа конкретному устройству
- ✅ **Разблокировка устройств** - возможность разблокировать ранее заблокированное устройство
- ✅ **Статус блокировки** - визуальное отображение заблокированных устройств (красный бейдж)
- ✅ **HWID фильтрация** - блокировка по серийному номеру устройства

#### 📊 Расширенные логи
- ✅ **Терминал логов** - специальный интерфейс для просмотра истории подключений
- ✅ **Цветовая индикация** - зелёный для активных, красный для заблокированных
- ✅ **Поиск по HWID** - возможность найти все подключения по серийному номеру
- ✅ **Автоматическое сохранение** - до 1000 записей в истории
- ✅ **Группировка по устройствам** - каждое устройство отслеживается отдельно

### 🔧 Улучшения WARP

#### panel/scripts/install_warp.sh
- ✅ Добавлена автоматическая перерегистрация аккаунта (удаляет старый аккаунт перед созданием нового)
- ✅ Улучшена обработка ошибок при скачивании wgcf
- ✅ Добавлен fallback на Cloudflare wgcf если GitHub API недоступен
- ✅ Улучшена проверка архитектуры системы и скачивания бинарника
- ✅ Добавлена верификация аккаунта после регистрации (`wgcf show`)
- ✅ Добавлена проверка внешнего IP после включения WARP
- ✅ Улучшены сообщения об ошибках для лучшего понимания пользователем
- ✅ Добавлена установка `gnupg2` как дополнительной зависимости
- ✅ Улучшена обработка ошибок wireguard-tools установки

#### panel/scripts/warp_killswitch.sh
- ✅ Добавлена проверка существования интерфейса WARP перед применением правил
- ✅ Улучшена обработка ошибок iptables/ip6tables
- ✅ Добавлены fallback команды для разных версий iptables
- ✅ Улучшена диагностика WAN интерфейса с fallback
- ✅ Добавлены обработки ошибок для всех iptables команд

#### panel/server/index.js (Backend)
- ✅ Улучшен `/api/warp/toggle` с полной обработкой ошибок
- ✅ Добавлена проверка конфигурации WARP перед включением
- ✅ Улучшена логика включения/выключения WARP с правильным порядком операций
- ✅ Добавлена проверка наличия config.json перед применением killswitch
- ✅ Улучшен `/api/warp` endpoint с проверкой существования конфига
- ✅ Добавлена автоматическая установка `warpInstalled = true` при обнаружении конфига
- ✅ **НОВОЕ**: Добавлены API endpoints для управления устройствами:
  - `GET /api/devices` - получение списка всех устройств
  - `POST /api/devices/block` - блокировка устройства по HWID
  - `POST /api/devices/unblock` - разблокировка устройства по HWID
  - `GET /api/logs` - получение истории подключений
- ✅ **НОВОЕ**: Добавлены функции мониторинга:
  - `logConnection()` - логирование каждого подключения
  - `checkDeviceBlocked()` - проверка блокировки устройства
  - `generateDeviceId()` - генерация уникального HWID
  - `parseDeviceFromUA()` - определение платформы из User-Agent

#### panel/public/js/app.js (Frontend)
- ✅ Улучшена функция `toggleWarpFromUi()` с полной обработкой ошибок
- ✅ Добавлены уведомления о прогрессе выполнения операций
- ✅ Автоматическая отмена чекбокса при ошибке включения/выключения
- ✅ Улучшена функция `installWarp()` с информативными сообщениями
- ✅ Улучшен `pollWarpInstallJob()` с разными статусами (running, success, error, cancelled)
- ✅ Улучшен `refreshWarp()` с автоматическим показом статуса
- ✅ Добавлены toast уведомления для всех WARP операций
- ✅ Улучшена обработка сетевых ошибок
- ✅ **НОВОЕ**: Добавлены страницы управления:
  - `loadDevicesPage()` - загрузка и отображение устройств
  - `blockDevice()` - блокировка устройства
  - `unblockDevice()` - разблокировка устройства
  - `loadLogsPage()` - загрузка и отображение логов

#### panel/public/index.html (UI)
- ✅ **НОВОЕ**: Добавлена вкладка "Устройства" в боковое меню
- ✅ **НОВОЕ**: Добавлена вкладка "Логи" в боковое меню
- ✅ **НОВОЕ**: Страница "Устройства" с таблицей:
  - Пользователь
  - Устройство (платформа)
  - HWID (серийный номер)
  - IP адрес
  - Платформа (цветные бейджи)
  - Последнее подключение
  - Статус (активен/заблокирован)
  - Кнопки блокировки/разблокировки
- ✅ **НОВОЕ**: Страница "Логи" с терминалом:
  - Цветовая индикация статусов
  - Временные метки
  - HWID и IP адреса
  - Информация об устройстве

#### panel/public/css/style.css (Стили)
- ✅ **НОВОЕ**: Стили для платформ устройств:
  - `.client-platform.ios` - синий для iOS
  - `.client-platform.android` - зелёный для Android
  - `.client-platform.windows` - голубой для Windows
  - `.client-platform.macos` - серый для macOS
  - `.client-platform.linux` - жёлтый для Linux
  - `.client-platform.unknown` - серый для неизвестных
- ✅ Улучшены стили для заблокированных устройств (красный бейдж)
- ✅ Улучшены стили для терминала логов

### 🎯 Пользовательские улучшения

1. **Мониторинг устройств в реальном времени:**
   - Видите все подключённые устройства
   - Видите IP адреса подключений
   - Видите платформы устройств
   - Видите время последнего подключения

2. **Блокировка устройств:**
   - Одна кнопка для блокировки любого устройства
   - Заблокированные устройства не могут подключиться
   - Быстрая разблокировка при необходимости
   - Визуальное отображение статуса блокировки

3. **Детальная история подключений:**
   - До 1000 записей в истории
   - Цветовая индикация статусов
   - Полная информация о каждом подключении
   - Возможность отслеживать подозрительную активность

4. **Улучшенная диагностика:**
   - Лучше показывает ошибки установки и работы
   - Показывает внешний IP после включения WARP
   - Автоматически обновляет статус при загрузке страницы

### 🐛 Исправления ошибок

- Исправлена проблема когда WARP не включался из-за старого аккаунта
- Исправлена ошибка когда killswitch не применялся из-за отсутствия интерфейса
- Исправлена проблема с отображением статуса WARP при перезагрузке страницы
- Улучшена обработка ошибок при установке зависимостей

### 📝 Обновлённые файлы

**Основные файлы:**
- `panel/scripts/install_warp.sh`
- `panel/scripts/warp_killswitch.sh`
- `panel/server/index.js`
- `panel/public/js/app.js`
- `panel/public/index.html`
- `panel/public/css/style.css`
- `CHANGELOG.md`

---

## 2026-04-22 09:14:56 UTC - c5d6f5c9

- Author: kayucm21
- Message: fix: avoid duplicate access mode menu
- Commit: https://github.com/kayucm21/3Dpovaw/commit/c5d6f5c9166e260ef42bbad51c4c84b7e79eb701

### Changed files

- `install.sh`


## 2026-04-22 09:09:42 UTC - cd5b09f0

- Author: kayucm21
- Message: feat: show selected access mode in installer
- Commit: https://github.com/kayucm21/3Dpovaw/commit/cd5b09f0e0b1cea1e5cbd310ce70c8683ba0ee9f

### Changed files

- `install.sh`


## 2026-04-22 09:06:10 UTC - f1cdf5d0

- Author: kayucm21
- Message: fix: improve installer header and non-tty prompts
- Commit: https://github.com/kayucm21/3Dpovaw/commit/f1cdf5d06bd81d62f773e53b020033aa828093a1

### Changed files

- `install.sh`


## 2026-04-22 09:02:41 UTC - 116b6489

- Author: kayucm21
- Message: docs: add access mode install commands
- Commit: https://github.com/kayucm21/3Dpovaw/commit/116b64898594996e14f395239b2a6408c6cab250

### Changed files

- `README.md`
- `install.sh`


## 2026-04-22 08:58:29 UTC - ca582370

- Author: kayucm21
- Message: feat: auto-update and vless multi-user support
- Commit: https://github.com/kayucm21/3Dpovaw/commit/ca582370e37c6005ce608323b336725f1f9e6acb

### Changed files

- `install.sh`
- `panel/public/index.html`
- `panel/public/js/app.js`
- `panel/scripts/panel_auto_update.sh`
- `panel/server/index.js`


## 2026-04-22 08:52:40 UTC - 83434daa

- Author: kayucm21
- Message: feat: add vless/warp diagnostics
- Commit: https://github.com/kayucm21/3Dpovaw/commit/83434daa07ccffe37494ef895319a7d69d4775b3

### Changed files

- `panel/public/index.html`
- `panel/public/js/app.js`
- `panel/server/index.js`


## 2026-04-22 08:30:41 UTC - 0bbd3a71

- Author: kayucm21
- Message: fix: improve vless and warp runtime reliability
- Commit: https://github.com/kayucm21/3Dpovaw/commit/0bbd3a712f9e5716b2034dccda196d371d1911a0

### Changed files

- `panel/scripts/install_vless.sh`
- `panel/scripts/install_warp.sh`
- `panel/server/index.js`


## 2026-04-21 16:32:11 UTC - fbe4b2ca

- Author: kayucm21
- Message: fix: add websocket fallback for install
- Commit: https://github.com/kayucm21/3Dpovaw/commit/fbe4b2ca47e346b42537688b1289e2c88e2bc2a3

### Changed files

- `panel/public/js/app.js`


## 2026-04-21 16:27:18 UTC - 87e0156c

- Author: kayucm21
- Message: chore: simplify update flow
- Commit: https://github.com/kayucm21/3Dpovaw/commit/87e0156c64893446cc68e8259379247dec4ecf28

### Changed files

- `README.md`
- `panel/package.json`
- `panel/scripts/fix_dns_and_update.sh`
- `panel/scripts/full_repair_update.sh`
- `panel/scripts/post_update_finalize.sh`


## 2026-04-21 16:20:46 UTC - 0dda943d

- Author: kayucm21
- Message: add one-command full repair updater
- Commit: https://github.com/kayucm21/3Dpovaw/commit/0dda943ddd9df8f8da71c40bfd5867e62d35a184

### Changed files

- `README.md`
- `panel/scripts/full_repair_update.sh`


## 2026-04-21 16:17:45 UTC - 33a9114b

- Author: kayucm21
- Message: add DNS auto-fix updater script
- Commit: https://github.com/kayucm21/3Dpovaw/commit/33a9114b6620cd559a378e8e65f7c01364c9be1d

### Changed files

- `README.md`
- `panel/scripts/fix_dns_and_update.sh`


## 2026-04-21 16:13:25 UTC - 965d6f2d

- Author: kayucm21
- Message: fix: reduce WARP apt repair hangs
- Commit: https://github.com/kayucm21/3Dpovaw/commit/965d6f2d983f8cffa5c49c28ded1e4a3d45d8914

### Changed files

- `panel/scripts/install_warp.sh`
- `panel/server/index.js`


## 2026-04-21 15:43:13 UTC - 425cf33c

- Author: kayucm21
- Message: feat: run WARP install as async job
- Commit: https://github.com/kayucm21/3Dpovaw/commit/425cf33cf0a783d27f41f6dbab35130b385b584f

### Changed files

- `panel/public/js/app.js`
- `panel/server/index.js`


## 2026-04-21 15:36:54 UTC - cd1e2a71

- Author: kayucm21
- Message: fix: auto-repair dpkg before WARP install
- Commit: https://github.com/kayucm21/3Dpovaw/commit/cd1e2a7182d157659dda04eb1e0282aecb696ba0

### Changed files

- `panel/scripts/install_warp.sh`


## 2026-04-21 15:34:36 UTC - 36c85b80

- Author: kayucm21
- Message: fix: install wireguard-tools for WARP
- Commit: https://github.com/kayucm21/3Dpovaw/commit/36c85b8065fbcc57a0037fbd778aa521b5d8dc54

### Changed files

- `panel/scripts/install_warp.sh`


## 2026-04-21 15:32:36 UTC - 4e57b199

- Author: kayucm21
- Message: fix: show WARP install failure details
- Commit: https://github.com/kayucm21/3Dpovaw/commit/4e57b199d6043e818ebee4131f1223375ca67010

### Changed files

- `panel/public/js/app.js`
- `panel/server/index.js`


## 2026-04-21 15:29:06 UTC - 7d49289f

- Author: kayucm21
- Message: fix: improve WARP install diagnostics
- Commit: https://github.com/kayucm21/3Dpovaw/commit/7d49289f26d28298ccbb8696b87b2ea51d88bcbf

### Changed files

- `panel/scripts/install_warp.sh`


## 2026-04-21 15:26:07 UTC - 55a915f8

- Author: kayucm21
- Message: fix: make wgcf download reliable
- Commit: https://github.com/kayucm21/3Dpovaw/commit/55a915f87a1803eebf3740a576dfffc9c3d755a8

### Changed files

- `panel/scripts/install_warp.sh`


## 2026-04-21 15:19:07 UTC - a1f0c483

- Author: kayucm21
- Message: feat: add WARP killswitch (no-leak)
- Commit: https://github.com/kayucm21/3Dpovaw/commit/a1f0c4832025c8208571c653b9532db5e626a9c5

### Changed files

- `panel/public/index.html`
- `panel/public/js/app.js`
- `panel/scripts/warp_killswitch.sh`
- `panel/server/index.js`


## 2026-04-21 15:14:23 UTC - 2d195c34

- Author: kayucm21
- Message: feat: add WARP toggle and VLESS port auto-pick
- Commit: https://github.com/kayucm21/3Dpovaw/commit/2d195c343e7be9f37f1130d5db3f8cb7dcca4fc9

### Changed files

- `panel/public/index.html`
- `panel/public/js/app.js`
- `panel/scripts/install_vless.sh`
- `panel/scripts/install_warp.sh`
- `panel/server/index.js`


## 2026-04-21 14:39:52 UTC - b6480c1c

- Author: kayucm21
- Message: Merge branch 'main' of https://github.com/kayucm21/3Dpovaw
- Commit: https://github.com/kayucm21/3Dpovaw/commit/b6480c1c0310cbb07605e818ac8e5bd4684e887a

### Changed files

- `CHANGELOG.md`


## 2026-04-21 14:34:31 UTC - df6b2e1d

- Author: kayucm21
- Message: Merge branch 'main' of https://github.com/kayucm21/3Dpovaw
- Commit: https://github.com/kayucm21/3Dpovaw/commit/df6b2e1d2c1f43b012efe8c68e102284e7c0300d

### Changed files

- `CHANGELOG.md`


## 2026-04-21 14:25:45 UTC - fa88a0ea

- Author: kayucm21
- Message: Merge branch 'main' of https://github.com/kayucm21/3Dpovaw
- Commit: https://github.com/kayucm21/3Dpovaw/commit/fa88a0ea32bc902983a555b4a215124dd75cf1ad

### Changed files

- `CHANGELOG.md`


## 2026-04-21 14:20:01 UTC - 7c1fe4e5

- Author: kayucm21
- Message: Merge branch 'main' of https://github.com/kayucm21/3Dpovaw
- Commit: https://github.com/kayucm21/3Dpovaw/commit/7c1fe4e5305c3ff1e6eac8c77a15acf4b1dddff1

### Changed files

- `CHANGELOG.md`


## 2026-04-21 13:58:21 UTC - 482ef897

- Author: kayucm21
- Message: Merge branch 'main' of https://github.com/kayucm21/3Dpovaw
- Commit: https://github.com/kayucm21/3Dpovaw/commit/482ef8971b55ce6cb134cf61129380707536ae90

### Changed files

- `CHANGELOG.md`


## 2026-04-21 05:59:04 UTC - ae2202df

- Author: kayucm21
- Message: Merge branch 'main' of https://github.com/kayucm21/3Dpovaw
- Commit: https://github.com/kayucm21/3Dpovaw/commit/ae2202df36cdfffa730e97edf24ed0ebd11cfca2

### Changed files

- `CHANGELOG.md`


## 2026-04-21 05:12:17 UTC - 8204c1a9

- Author: kayucm21
- Message: Add automatic changelog with changed files
- Commit: https://github.com/kayucm21/3Dpovaw/commit/8204c1a9cf09eebc030b44b037741ddf6410cfb4

### Changed files

- `.github/workflows/auto-changelog.yml`
- `CHANGELOG.md`
- `README.md`


Автоматический журнал изменений проекта.

## Формат

- дата и время (UTC)
- коммит
- список изменённых файлов

