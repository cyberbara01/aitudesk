<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="96" height="96" alt="AITU Desk">

# AITU Desk

[English](README.md) · **Русский**

**Виджеты на рабочий стол Windows 11: часы, заряд и сеть, нагрузка компьютера, ярлыки, заметки с дедлайнами,
расписание пар, карта Astana IT University и ваши картинки.** Лежат прямо на обоях, под окнами, не мешают работать
и не пропадают от Win+D.

[![Скачать для Windows 11](https://img.shields.io/badge/%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C_%D0%B4%D0%BB%D1%8F_Windows_11-0078D4?style=for-the-badge&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyBmaWxsPSIjZmZmZmZmIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMTMgM2ExIDEgMCAxIDAtMiAwdjEyLjA5bC0zLjMtMy4zYTEgMSAwIDAgMC0xLjQgMS40Mmw1IDVhMSAxIDAgMCAwIDEuNCAwbDUtNWExIDEgMCAwIDAtMS40LTEuNDJMMTMgMTUuMXpNNSAyMGExIDEgMCAxIDAgMCAyaDE0YTEgMSAwIDEgMCAwLTJ6Ii8%2BPC9zdmc%2B)](https://github.com/cyberbara01/aitudesk/releases/latest)

[![Версия](https://img.shields.io/github/v/release/cyberbara01/aitudesk?label=%D0%B2%D0%B5%D1%80%D1%81%D0%B8%D1%8F&color=0078D4)](https://github.com/cyberbara01/aitudesk/releases/latest)
[![Windows 11](https://img.shields.io/badge/Windows-11%2C_64_%D0%B1%D0%B8%D1%82%D0%B0-0078D4)](#установка)
[![Русский и English](https://img.shields.io/badge/%D1%8F%D0%B7%D1%8B%D0%BA-%D1%80%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9%2C_English-0078D4)](README.md)
[![Лицензия MIT](https://img.shields.io/badge/%D0%BB%D0%B8%D1%86%D0%B5%D0%BD%D0%B7%D0%B8%D1%8F-MIT-2EA043)](LICENSE)
[![Без телеметрии](https://img.shields.io/badge/%D1%82%D0%B5%D0%BB%D0%B5%D0%BC%D0%B5%D1%82%D1%80%D0%B8%D1%8F-%D0%BD%D0%B5%D1%82-2EA043)](#почему-ему-можно-доверять)
[![Без прав администратора](https://img.shields.io/badge/%D0%BF%D1%80%D0%B0%D0%B2%D0%B0_%D0%B0%D0%B4%D0%BC%D0%B8%D0%BD%D0%B8%D1%81%D1%82%D1%80%D0%B0%D1%82%D0%BE%D1%80%D0%B0-%D0%BD%D0%B5_%D0%BD%D1%83%D0%B6%D0%BD%D1%8B-2EA043)](#установка)
<br>
[![Tauri 2](https://img.shields.io/badge/Tauri_2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-B7410E?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React](https://img.shields.io/badge/React-087EA4?logo=react&logoColor=white)](https://react.dev)

<img src="docs/screenshots/desktop-dark.png" alt="Виджеты AITU Desk на рабочем столе" width="760">

</div>

## Что умеет

<table>
<tr>
<td width="50%" valign="top"><img src="docs/readme/clock.svg" width="22" height="22" alt=""><br><b>Часы</b><br>Готовые стили и тонкая настройка: шрифт, размер, секунды, формат даты, фон</td>
<td width="50%" valign="top"><img src="docs/readme/system.svg" width="22" height="22" alt=""><br><b>Система</b><br>Заряд батареи, Wi-Fi и Bluetooth. Имена сети и устройств можно скрыть</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="docs/readme/perf.svg" width="22" height="22" alt=""><br><b>Нагрузка</b><br>Процессор, видеокарта, память и диск, их температура; четыре вида и свои цвета</td>
<td width="50%" valign="top"><img src="docs/readme/launchers.svg" width="22" height="22" alt=""><br><b>Ярлыки</b><br>Сайты AITU с их настоящими иконками и свои: иконка сайта, из набора или буква, свой цвет</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="docs/readme/notes.svg" width="22" height="22" alt=""><br><b>Заметки</b><br>Задачи с дедлайном и обратным отсчётом; порядок расставляется мышью</td>
<td width="50%" valign="top"><img src="docs/readme/schedule.svg" width="22" height="22" alt=""><br><b>Расписание</b><br>Пары по дням недели, текущая и следующая подсвечены</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="docs/readme/reminders.svg" width="22" height="22" alt=""><br><b>Напоминания</b><br>Уведомления Windows перед парой и дедлайном, тихие часы</td>
<td width="50%" valign="top"><img src="docs/readme/map.svg" width="22" height="22" alt=""><br><b>Карта AITU</b><br>Этажи университета, поиск кабинета, шесть цветовых схем или свой цвет, цвет и толщина номеров, метки, приближение колесом или двумя пальцами</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="docs/readme/custom.svg" width="22" height="22" alt=""><br><b>Свои виджеты</b><br>Ваша картинка или GIF на рабочем столе, до 20 штук</td>
<td width="50%" valign="top"><img src="docs/readme/design.svg" width="22" height="22" alt=""><br><b>Оформление</b><br>Три дизайна и тонкая настройка: шрифт, формы, рамки, прозрачность. Темы, свой акцент, масштаб</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="docs/readme/privacy.svg" width="22" height="22" alt=""><br><b>Приватность</b><br>Текст на рабочем столе можно скрыть точками, как пароль</td>
<td width="50%" valign="top"><img src="docs/readme/configs.svg" width="22" height="22" alt=""><br><b>Конфиги</b><br>Все настройки в одном файле: на другой компьютер или другу</td>
</tr>
</table>

Не учитесь в AITU? Всё, кроме карты, пригодится и вам, а карту и ярлыки сайтов университета можно выключить.

## Почему ему можно доверять

- **Открытый код** под лицензией MIT: всё, что делает приложение, видно в этом репозитории.
- **Ничего не отправляет**: нет телеметрии, рекламы, учётных записей и автообновлений.
- **Не просит прав администратора** и ставится только для вашей учётной записи.
- **Собирается на GitHub**: установщик для каждого релиза собирает GitHub Actions из исходников, рядом лежат
  контрольные суммы.
- **Лёгкое**: установщик около 3 МБ, в простое приложение почти не нагружает процессор.

## Скриншоты

Три дизайна, в каждом одни и те же виджеты: Windows 11 (светлая тема), Aqua (стекло) и Rice (чёрная). Любой
дизайн сочетается с любой темой и акцентным цветом.

<p align="center">
  <img src="docs/screenshots/designs.png" alt="Одни и те же виджеты в трёх дизайнах: Windows 11, Aqua и Rice" width="760">
</p>

Виджет можно свернуть в маленький значок: по щелчку он вырастает во всплывающее окно посередине экрана.

<p align="center">
  <img src="docs/screenshots/desktop-light.png" alt="Виджеты свёрнуты в значки, карта выросла из своего значка во всплывающее окно; светлая тема" width="760">
</p>

Окно настроек:

<p align="center">
  <img src="docs/screenshots/settings-widgets.png" alt="Виджеты: какие лежат на рабочем столе, их размер и свои виджеты с картинкой" width="49%">
  <img src="docs/screenshots/settings-general.png" alt="Общие: запуск вместе с Windows, язык, сброс" width="49%">
</p>
<p align="center">
  <img src="docs/screenshots/settings-appearance.png" alt="Оформление: дизайн и его части на выбор" width="49%">
  <img src="docs/screenshots/settings-perf.png" alt="Нагрузка: процессор, видеокарта, память и диск" width="49%">
</p>
<p align="center">
  <img src="docs/screenshots/settings-notes.png" alt="Заметки в своём порядке: заметку перетаскивают мышью" width="49%">
  <img src="docs/screenshots/settings-own-widget.png" alt="Свой виджет с живым предпросмотром" width="49%">
</p>
<p align="center">
  <img src="docs/screenshots/settings-reminders.png" alt="Напоминания о парах и дедлайнах" width="49%">
  <img src="docs/screenshots/settings-configs.png" alt="Конфиги: перенос настроек в файл" width="49%">
</p>

## Установка

1. Скачайте `AITU Desk_<версия>_x64-setup.exe` из [последнего релиза](https://github.com/cyberbara01/aitudesk/releases/latest) и запустите.
2. Если Windows покажет «Система Windows защитила ваш компьютер», нажмите «Подробнее», затем «Выполнить в любом
   случае». Предупреждение появляется потому, что приложение не подписано платным сертификатом.
3. Откроется окно настроек с короткой подсказкой, а виджеты появятся на рабочем столе. Дальше они запускаются вместе
   с Windows; выключить это можно в разделе «Общие».

Нужна Windows 11, 64 бита. Чтобы переставить виджет или изменить его размер, нажмите на него правой кнопкой мыши:
всё внутри растёт вместе с ним. В пункте «Размер» виджет можно свернуть в значок, который
по щелчку вырастает во всплывающее окно посередине экрана. Какие виджеты показывать, их размеры и свои виджеты
с картинкой собраны в разделе «Виджеты». Интерфейс на русском или английском, как в Windows; сменить язык можно
в разделе «Общие» или кнопкой «RU | EN» внизу окна настроек.

<details>
<summary><b>Проверить, что установщик тот самый</b></summary>
<br>

Рядом с установщиком в релизе лежит `SHA256SUMS.txt`. Сравните с ним хеш скачанного файла в PowerShell:

```powershell
Get-FileHash ".\AITU Desk_1.0.0_x64-setup.exe" -Algorithm SHA256
```

Сборку делает [`.github/workflows/release.yml`](.github/workflows/release.yml) из исходников этого репозитория.
</details>

<details>
<summary><b>Что делает установщик и где лежат данные</b></summary>
<br>

| Что | Где |
| --- | --- |
| Программа `aitudesk.exe` и деинсталлятор `uninstall.exe` | `%LOCALAPPDATA%\AITU Desk\` |
| Ярлык в меню «Пуск» и, если оставить галочку, на рабочем столе | меню «Пуск», рабочий стол |
| Запись для удаления в «Установленных приложениях» | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\AITU Desk` |
| Настройки, пары, заметки, ярлыки, расположение виджетов (обычный JSON) | `%APPDATA%\kz.edu.astanait.aitudesk\settings.json` |
| Копии картинок своих виджетов | `%APPDATA%\kz.edu.astanait.aitudesk\widgets\` |
| Служебный кэш WebView2 | `%LOCALAPPDATA%\kz.edu.astanait.aitudesk\EBWebView\` |
| Автозапуск (включён с первого запуска, выключается в «Общих») | значение `AITU Desk` в `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` |

Больше установщик ничего не делает: нет служб, драйверов, задач планировщика, расширений браузера и программ
в комплекте. WebView2 уже есть в Windows 11; только если его нет, установщик скачает его с сайта Microsoft.

Файл настроек можно открыть в Блокноте. Если после правки он перестанет читаться, приложение его не сотрёт, а
переименует в `settings.broken-<время>.json`.
</details>

<details>
<summary><b>Сеть и приватность</b></summary>
<br>

- Сеть нужна только по вашему действию: открыть ярлык в браузере или один раз загрузить иконку сайта, когда вы
  добавляете или меняете ярлык (запрос к самому сайту, а если иконки там нет, к сервису иконок Google, которому не
  сообщаются локальные имена). Иконки DU, LMS и Learn встроены в программу. Сайт не может направить эти запросы на
  устройства вашей домашней сети.
- Расписание, заметки, имя сети Wi-Fi и названия Bluetooth-устройств на рабочем столе можно скрыть точками.
- Температуру процессора приложение берёт у Windows, если та её сообщает (обычно на ноутбуках). На большинстве
  настольных ПК Windows её не даёт, а драйверов приложение не ставит: тогда температура берётся из программы
  мониторинга, если она у вас запущена (LibreHardwareMonitor, HWiNFO, Core Temp, MSI Afterburner или AIDA64),
  и только на этом компьютере.
- Конфиг содержит только выбранные вами разделы, заметки и свои виджеты по умолчанию в него не попадают. Ярлыки из
  чужого конфига принимаются только с адресами `http://` и `https://`, а картинки только если это действительно
  картинки.
</details>

<details>
<summary><b>Удаление</b></summary>
<br>

Параметры → Приложения → Установленные приложения → AITU Desk → Удалить. Галочка «Удалить данные приложения»
стирает и настройки; без неё они останутся на случай повторной установки. Перед удалением всё можно сохранить
в конфиг в разделе «Конфиги». Чтобы начать заново без удаления, кнопка «Сбросить всё» внизу раздела «Общие» делает
программу такой, как сразу после установки.
</details>

<details>
<summary><b>Сборка из исходников</b></summary>
<br>

Понадобятся Node.js 22+, Rust (stable) и, по [инструкции Tauri](https://tauri.app/start/prerequisites/), Microsoft
C++ Build Tools (или mingw-w64 для цели `x86_64-pc-windows-gnu`).

```bash
npm install
npm run tauri dev      # запуск в режиме разработки
npm run tauri build    # установщик в src-tauri/target/release/bundle/nsis/
```

Для проверки без ноутбука есть переменные окружения: `AITUDESK_MOCK_POWER` (`none` | `78` | `15,charging` | `40,saver`),
`AITUDESK_MOCK_WIFI` (`off` | `SSID,bars` | `hidden,bars`), `AITUDESK_MOCK_BT` (`off` | `none` | `A;B;C`).

Внутри: Tauri 2, Rust, React 18, TypeScript и Vite. Все виджеты работают в одном процессе WebView2, часы
просыпаются раз в минуту, если секунды не показаны, а скрытые и свёрнутые в значок виджеты не держат таймеров.
Пока окно программы закрывает весь экран, нагрузка не считывается, а GIF замирают. В режиме экономии заряда Windows
часы прячут секунды, заряд, сеть и нагрузка проверяются реже, а GIF замирают. Без прозрачности виджеты обходятся
без акрила, и видеокарте легче.
</details>

## Обратная связь

- Оцените приложение от 0 до 10 в [анонимной форме](https://forms.gle/LV7BYCqeveRyRm9YA): хватит одной оценки, идеи по желанию.
- Нашли ошибку? Напишите в [Issues](https://github.com/cyberbara01/aitudesk/issues) или в Telegram [@capybara205](https://t.me/capybara205).

Автор: [@cyberbara01](https://github.com/cyberbara01). Карта: проект [aitumap](https://github.com/Yuujiso/aitumap)
от [Yuujiso](https://github.com/Yuujiso).

## Лицензия

[MIT](LICENSE): пользуйтесь, меняйте и делитесь, сохраняя имя автора. Сторонние компоненты (карта, иконки, шрифты)
перечислены в [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
