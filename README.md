# Панель NaiveProxy

> Веб-панель управления для быстрой установки и управления `Naive` и `VLESS` на VPS

---

## 🚀 Быстрая установка панели

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kayucm21/3Dpovaw/main/install.sh)
```

### Выбор способа доступа к панели

Во время установки будет вопрос:

```text
1) Через Nginx на порту 8080
2) Напрямую на порту 3000
3) Через Nginx с доменом + HTTPS
```

Можно выбрать вручную в установщике, либо заранее указать выбор командой:

```bash
ACCESS_MODE=1 bash <(curl -fsSL https://raw.githubusercontent.com/kayucm21/3Dpovaw/main/install.sh)
```

```bash
ACCESS_MODE=2 bash <(curl -fsSL https://raw.githubusercontent.com/kayucm21/3Dpovaw/main/install.sh)
```

```bash
ACCESS_MODE=3 bash <(curl -fsSL https://raw.githubusercontent.com/kayucm21/3Dpovaw/main/install.sh)
```

## 🔄 Обновление панели с GitHub

```bash
cd /opt/naiveproxy-panel && git pull --ff-only && cd panel && npm install --omit=dev && pm2 restart naiveproxy-panel
```

## 📝 Журнал изменений

Список изменённых файлов после каждого пуша автоматически публикуется в `CHANGELOG.md`.

После установки панель будет доступна по адресу:
```
http://YOUR_SERVER_IP:3000
```

**Логин по умолчанию:** `admin` / `admin` — **смените сразу!**

---

## 📋 Требования к серверу

- Ubuntu 22.04 / 24.04 или Debian 11 / 12
- Поддомен с A-записью на IP сервера (например `naive.yourdomain.com`)
- Открытые порты: 22, 80, 443, 3000
- Минимум 1 GB RAM (для сборки Caddy — временно нужно 512 MB)

---

## 🎛️ Возможности панели

| Функция | Описание |
|---------|----------|
| 🟢 **Установка в 2 клика** | Вводите домен + email + логин/пароль — панель сама поднимает весь стек |
| 👥 **Управление пользователями** | Добавление и удаление прокси-пользователей с авто-обновлением конфига |
| 📊 **Дашборд** | Статус сервиса, IP сервера, домен, кол-во пользователей |
| 🔗 **Ссылки подключения** | Готовые `naive+https://...` и `vless://...` ссылки для всех клиентов |
| 🔄 **Управление сервисом** | Старт / стоп / рестарт Caddy прямо из браузера |
| 🔒 **Смена пароля панели** | Безопасное управление доступом |

---

## 🔄 Процесс установки протокола (автоматически)

1. Выбор протокола: `Naive` или `VLESS`
2. Обновление системы и зависимостей
3. Включение BBR (алгоритм TCP от Google)
4. Настройка файрволла UFW
5. Для Naive: установка Go и сборка Caddy с `forwardproxy`
6. Сохранение домена, порта и пользователя в панели
7. Генерация готовой ссылки подключения

---

## 📱 Клиенты для подключения

| Платформа | Приложение |
|-----------|-----------|
| iOS | [Karing](https://apps.apple.com/app/karing/id6472431552) |
| Android | [NekoBox](https://github.com/MatsuriDayo/NekoBoxForAndroid/releases) |
| Windows | [Hiddify](https://github.com/hiddify/hiddify-app/releases) |
| Windows | [NekoRay](https://github.com/MatsuriDayo/nekoray/releases) |
| Multi-platform | [v2RayTun](https://v2raytun.com/) |
| Multi-platform | [Happ](https://www.happ.su/main) |

## 🔗 Ссылки для подключения

- Готовые `naive+https://LOGIN:PASSWORD@your.domain.com:443` ссылки
- Готовые `vless://UUID@your.domain.com:PORT?encryption=none&security=tls&type=ws&host=your.domain.com&sni=your.domain.com&path=%2Fvless#NAME` ссылки

---

## ⚙️ Управление панелью

```bash
pm2 status                      # Статус
pm2 logs naiveproxy-panel       # Логи
pm2 restart naiveproxy-panel    # Перезапуск
pm2 stop naiveproxy-panel       # Остановка
```

---

Панель управления `Naive` и `VLESS` с удобным интерфейсом.
