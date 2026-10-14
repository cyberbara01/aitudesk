<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="AITU Desk">

# AITU Desk

**Виджеты на рабочий стол Windows 11 для студентов Astana IT University.**

Часы, заряд и сеть, нагрузка компьютера, ярлыки, заметки с дедлайнами, расписание пар, календарь,<br>карта AITU и ваши картинки лежат прямо на обоях.

[![Версия](https://img.shields.io/github/v/release/cyberbara01/aitudesk?label=%D0%B2%D0%B5%D1%80%D1%81%D0%B8%D1%8F&color=0078D4)](https://github.com/cyberbara01/aitudesk/releases/latest)
[![Windows 11](https://img.shields.io/badge/Windows-11%2C_64--bit-0078D4)](#установка)
[![Русский, казахский и английский](https://img.shields.io/badge/%D1%8F%D0%B7%D1%8B%D0%BA%D0%B8-%D1%80%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9%2C_%D2%9B%D0%B0%D0%B7%D0%B0%D2%9B%D1%88%D0%B0%2C_English-0078D4)](README.md)
[![Лицензия MIT](https://img.shields.io/badge/%D0%BB%D0%B8%D1%86%D0%B5%D0%BD%D0%B7%D0%B8%D1%8F-MIT-2EA043)](LICENSE)
[![Без телеметрии](https://img.shields.io/badge/%D1%82%D0%B5%D0%BB%D0%B5%D0%BC%D0%B5%D1%82%D1%80%D0%B8%D1%8F-%D0%BD%D0%B5%D1%82-2EA043)](#почему-ему-можно-доверять)
[![Без прав администратора](https://img.shields.io/badge/%D0%BF%D1%80%D0%B0%D0%B2%D0%B0_%D0%B0%D0%B4%D0%BC%D0%B8%D0%BD%D0%B8%D1%81%D1%82%D1%80%D0%B0%D1%82%D0%BE%D1%80%D0%B0-%D0%BD%D0%B5_%D0%BD%D1%83%D0%B6%D0%BD%D1%8B-2EA043)](#установка)

<a href="https://github.com/cyberbara01/aitudesk/releases/latest"><img src="https://img.shields.io/badge/%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C%20%D0%B4%D0%BB%D1%8F%20Windows%2011-0078D4?style=for-the-badge&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyBmaWxsPSIjZmZmZmZmIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMTMgM2ExIDEgMCAxIDAtMiAwdjEyLjA5bC0zLjMtMy4zYTEgMSAwIDAgMC0xLjQgMS40Mmw1IDVhMSAxIDAgMCAwIDEuNCAwbDUtNWExIDEgMCAwIDAtMS40LTEuNDJMMTMgMTUuMXpNNSAyMGExIDEgMCAxIDAgMCAyaDE0YTEgMSAwIDEgMCAwLTJ6Ii8%2BPC9zdmc%2B" alt="Скачать для Windows 11"></a>

**Русский** · [Қазақша](README.kk.md) · [English](README.md)

<sub>Неофициальный студенческий проект, не связан с Astana IT University.</sub>

</div>

<p align="center">
  <img src="docs/screenshots/desk.webp" alt="Рабочий стол с AITU Desk: карта, календарь и стопка слева, часы и нагрузка посередине, ярлыки, система, заметки и расписание справа" width="100%">
</p>

<p align="center">
<picture>
  <source media="(max-width: 700px) and (prefers-color-scheme:dark)" srcset="docs/screenshots/m/map-dark.webp">
  <source media="(max-width: 700px)" srcset="docs/screenshots/m/map.webp">
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/map-dark.webp">
  <img src="docs/screenshots/map.webp" alt="Карта приближается колесом мыши там, где курсор, двигается перетаскиванием, переходит на третий этаж, а двойной щелчок снова показывает весь этаж" width="100%">
</picture>
  <br><sub>Карта приближается колесом там, где курсор, а двойной щелчок показывает весь этаж</sub>
</p>

<p align="center">
<picture>
  <source media="(max-width: 700px) and (prefers-color-scheme:dark)" srcset="docs/screenshots/m/calendar-dark.webp">
  <source media="(max-width: 700px)" srcset="docs/screenshots/m/calendar.webp">
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/calendar-dark.webp">
  <img src="docs/screenshots/calendar.webp" alt="Календарь листает месяцы, выбирает пятницу, а правый щелчок по ней делает напоминание: в заметках появляется дедлайн на этот день" width="100%">
</picture>
  <br><sub>Правый щелчок по дню календаря делает заметку или напоминание на этот день</sub>
</p>

<p align="center">
<picture>
  <source media="(max-width: 700px) and (prefers-color-scheme:dark)" srcset="docs/screenshots/m/stack-dark.webp">
  <source media="(max-width: 700px)" srcset="docs/screenshots/m/stack.webp">
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/stack-dark.webp">
  <img src="docs/screenshots/stack.webp" alt="Стопка виджетов: перетаскивание мышью влево, колесо и стрелка листают расписание, нагрузку, ярлыки и заметки, щелчок по точке возвращает к первому" width="100%">
</picture>
  <br><sub>Стопка листается мышью, колесом, двумя пальцами по тачпаду и стрелками</sub>
</p>

<p align="center">
<picture>
  <source media="(max-width: 700px) and (prefers-color-scheme:dark)" srcset="docs/screenshots/m/stack-in-dark.webp">
  <source media="(max-width: 700px)" srcset="docs/screenshots/m/stack-in.webp">
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/stack-in-dark.webp">
  <img src="docs/screenshots/stack-in.webp" alt="В режиме перемещения часы перетаскиваются на стопку с расписанием и заметками и ложатся в неё" width="100%">
</picture>
  <br><sub>Любой виджет перетаскивается в стопку, а стопок можно сделать несколько</sub>
</p>

<p align="center">
<picture>
  <source media="(max-width: 700px) and (prefers-color-scheme:dark)" srcset="docs/screenshots/m/fold-dark.webp">
  <source media="(max-width: 700px)" srcset="docs/screenshots/m/fold.webp">
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/fold-dark.webp">
  <img src="docs/screenshots/fold.webp" alt="Расписание, свёрнутое в значок, раскрывается в окно по щелчку, в окне выбирается вторник, а щелчок рядом сворачивает его обратно" width="100%">
</picture>
  <br><sub>Любой виджет сворачивается в значок и раскрывается по щелчку</sub>
</p>

<p align="center">
<picture>
  <source media="(max-width: 700px) and (prefers-color-scheme:dark)" srcset="docs/screenshots/m/move-dark.webp">
  <source media="(max-width: 700px)" srcset="docs/screenshots/m/move.webp">
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/move-dark.webp">
  <img src="docs/screenshots/move.webp" alt="Часы через меню переходят в режим перемещения, переезжают вправо, встают по сетке и растягиваются за угол" width="100%">
</picture>
  <br><sub>Виджет двигается мышью, встаёт по сетке и растягивается за угол, а всё внутри растёт вместе с ним</sub>
</p>

<p align="center">
<picture>
  <source media="(max-width: 700px) and (prefers-color-scheme:dark)" srcset="docs/screenshots/m/scale-dark.webp">
  <source media="(max-width: 700px)" srcset="docs/screenshots/m/scale.webp">
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/scale-dark.webp">
  <img src="docs/screenshots/scale.webp" alt="В меню заметок выбирается размер текста 80 %, затем 130 %, затем «Авто»" width="100%">
</picture>
  <br><sub>Размер текста: текст и значки мельче или крупнее при любом размере виджета</sub>
</p>

<p align="center">
<picture>
  <source media="(max-width: 700px) and (prefers-color-scheme:dark)" srcset="docs/screenshots/m/fade-dark.webp">
  <source media="(max-width: 700px)" srcset="docs/screenshots/m/fade.webp">
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/fade-dark.webp">
  <img src="docs/screenshots/fade.webp" alt="Полупрозрачные часы, система и заметки проявляются, когда над ними курсор" width="100%">
</picture>
  <br><sub>Проявление при наведении: полупрозрачный виджет проявляется под курсором</sub>
</p>

## Что умеет

<table>
<tr>
<td width="33%" valign="top"><img src="docs/readme/schedule.svg" width="32" height="32" alt=""><br><b>Расписание</b><br>Текущая пара, следующая и сколько осталось</td>
<td width="33%" valign="top"><img src="docs/readme/notes.svg" width="32" height="32" alt=""><br><b>Заметки</b><br>Дедлайны с живым отсчётом</td>
<td width="33%" valign="top"><img src="docs/readme/reminders.svg" width="32" height="32" alt=""><br><b>Напоминания</b><br>Перед парой и дедлайном, тихие часы</td>
</tr>
<tr>
<td width="33%" valign="top"><img src="docs/readme/calendar.svg" width="32" height="32" alt=""><br><b>Календарь</b><br>Месяц, дедлайны заметок и пары дня</td>
<td width="33%" valign="top"><img src="docs/readme/map.svg" width="32" height="32" alt=""><br><b>Карта AITU</b><br>Все этажи и поиск: 223 или C1.2.223</td>
<td width="33%" valign="top"><img src="docs/readme/clock.svg" width="32" height="32" alt=""><br><b>Часы</b><br>Стили, шрифт, размер, секунды и дата</td>
</tr>
<tr>
<td width="33%" valign="top"><img src="docs/readme/system.svg" width="32" height="32" alt=""><br><b>Система</b><br>Заряд, Wi-Fi и Bluetooth, имена скрываются</td>
<td width="33%" valign="top"><img src="docs/readme/perf.svg" width="32" height="32" alt=""><br><b>Нагрузка</b><br>Процессор, видеокарта, память и диск</td>
<td width="33%" valign="top"><img src="docs/readme/launchers.svg" width="32" height="32" alt=""><br><b>Ярлыки</b><br>DU, LMS, Learn и любой сайт</td>
</tr>
<tr>
<td width="33%" valign="top"><img src="docs/readme/custom.svg" width="32" height="32" alt=""><br><b>Свои виджеты</b><br>Картинка или GIF на обоях, до 20 штук</td>
<td width="33%" valign="top"><img src="docs/readme/stack.svg" width="32" height="32" alt=""><br><b>Стопки виджетов</b><br>Несколько стопок, любые виджеты</td>
<td width="33%" valign="top"><img src="docs/readme/layout.svg" width="32" height="32" alt=""><br><b>Расположение</b><br>Сетка значков, размер окна и текста</td>
</tr>
<tr>
<td width="33%" valign="top"><img src="docs/readme/background.svg" width="32" height="32" alt=""><br><b>Свой фон</b><br>Цвет или градиент на весь экран</td>
<td width="33%" valign="top"><img src="docs/readme/fade.svg" width="32" height="32" alt=""><br><b>Проявление</b><br>Виджет проявляется под курсором</td>
<td width="33%" valign="top"><img src="docs/readme/privacy.svg" width="32" height="32" alt=""><br><b>Приватность</b><br>Текст за точками, ничего не отправляет</td>
</tr>
<tr>
<td width="33%" valign="top"><img src="docs/readme/configs.svg" width="32" height="32" alt=""><br><b>Конфиги</b><br>Все настройки в одном файле</td>
<td width="33%" valign="top"><img src="docs/readme/journal.svg" width="32" height="32" alt=""><br><b>Журнал ошибок</b><br>Отчёт о сбое в один клик, без личного</td>
<td width="33%" valign="top"><img src="docs/readme/languages.svg" width="32" height="32" alt=""><br><b>Три языка</b><br>Русский, казахский и английский</td>
</tr>
</table>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/widgets-dark.webp">
  <img src="docs/screenshots/widgets.webp" alt="Все виджеты AITU Desk: расписание, карта, часы, заметки, нагрузка, система, ярлыки и своя картинка" width="100%">
</picture>
</p>

## Под себя

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/looks-dark.webp">
  <img src="docs/screenshots/looks.webp" alt="Часы и Система в дизайнах Windows 11, Aqua, Rice и Pearl, Система в трёх цветах, светлая тема" width="100%">
</picture>
  <br><sub>Windows 11, Aqua, Rice и Pearl · свой акцент и любой цвет значков и текста · свой фон: цвет или градиент на весь экран · темы от светлой до чёрной</sub>
</p>

## Установка

1. Скачайте `AITU-Desk_<версия>_x64-setup.exe` со страницы [последнего релиза](https://github.com/cyberbara01/aitudesk/releases/latest) и запустите.
2. Если Windows покажет «Система Windows защитила ваш компьютер», нажмите «Подробнее», затем «Выполнить в любом
   случае». Предупреждение появляется, потому что приложение не подписано платным сертификатом.
3. Откроется окно настроек с короткой инструкцией, а на рабочем столе появятся виджеты. Дальше они запускаются вместе
   с Windows; это можно выключить в «Общих».

Нужна Windows 11, 64-бит. Интерфейс на русском, казахском или английском, как в Windows; переключается в «Общих» или
кнопкой «RU | KZ | EN» внизу окна настроек.

<details>
<summary><b>Проверить, что установщик настоящий</b></summary>
<br>

Рядом с установщиком в релизе лежит `SHA256SUMS.txt`. Сравните его с хешем скачанного файла в PowerShell:

```powershell
Get-FileHash ".\AITU-Desk_1.0.0_x64-setup.exe" -Algorithm SHA256
```

GitHub ещё и подтверждает, что сам собрал файл из этого репозитория: тот же хеш есть на странице
[подтверждений сборки](https://github.com/cyberbara01/aitudesk/attestations). Эту запись делает GitHub Actions во
время сборки и подписывает её, у файла, загруженного вручную, её нет. Через [GitHub CLI](https://cli.github.com) это
одна команда:

```powershell
gh attestation verify ".\AITU-Desk_1.0.0_x64-setup.exe" --repo cyberbara01/aitudesk
```

Сборку делает [`.github/workflows/release.yml`](.github/workflows/release.yml) из исходников этого репозитория.
</details>

<details>
<summary><b>Что делает установщик и где хранятся данные</b></summary>
<br>

| Что | Где |
| --- | --- |
| Программа `aitudesk.exe` и деинсталлятор `uninstall.exe` | `%LOCALAPPDATA%\AITU Desk\` |
| Ярлык в меню «Пуск» и, если оставить галочку, на рабочем столе | меню «Пуск», рабочий стол |
| Запись для удаления в «Установленных приложениях» | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\AITU Desk` |
| Настройки, пары, заметки, ярлыки, расположение виджетов (обычный JSON) | `%APPDATA%\kz.edu.astanait.aitudesk\settings.json` |
| Копии картинок ваших виджетов | `%APPDATA%\kz.edu.astanait.aitudesk\widgets\` |
| Служебный кеш WebView2 | `%LOCALAPPDATA%\kz.edu.astanait.aitudesk\EBWebView\` |
| Автозапуск (включён с первого запуска, переключатель в «Общих») | значение `AITU Desk` в `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` |

Больше установщик ничего не делает: никаких служб, драйверов, задач планировщика, расширений браузера и программ в
нагрузку. WebView2 уже есть в Windows 11; только если его нет, установщик скачает его с сайта Microsoft.

Файл настроек открывается в Блокноте. Если после правки он перестанет читаться, приложение не сотрёт его, а
переименует в `settings.broken-<время>.json`.
</details>

<details>
<summary><b>Сеть и приватность</b></summary>
<br>

- Сеть нужна только по вашему действию: открыть ярлык в браузере или один раз скачать иконку сайта, когда вы
  добавляете или меняете ярлык (запрос к самому сайту и, если иконки там нет, к сервису иконок Google, которого не
  спрашивают про локальные имена). Иконки DU, LMS и Learn встроены. Сайт не может перенаправить эти запросы на
  устройства вашей домашней сети.
- Расписание, заметки, имя сети Wi-Fi и имена Bluetooth-устройств на рабочем столе можно скрыть за точками.
- Температуру процессора даёт Windows там, где она её знает (в основном на ноутбуках). На большинстве стационарных ПК
  её нет, и приложение не ставит для этого драйвер: оно берёт температуру из программы мониторинга, которую вы и так
  запускаете (LibreHardwareMonitor, HWiNFO, Core Temp, MSI Afterburner или AIDA64), только на этом компьютере.
- В конфиг попадают только выбранные вами части, а заметки и свои виджеты по умолчанию не попадают. Ярлыки из
  чужого конфига принимаются только с адресами `http://` и `https://`, а картинки только если это действительно
  картинки.
</details>

<details>
<summary><b>Удаление</b></summary>
<br>

Параметры → Приложения → Установленные приложения → AITU Desk → Удалить. Галочка «Удалить данные приложения» сотрёт
и настройки; без неё они останутся на случай повторной установки. Перед удалением всё можно сохранить в конфиг в
разделе «Конфиги». Чтобы начать заново без удаления, кнопка «Сбросить всё» внизу «Общих» сделает приложение таким,
как сразу после установки.
</details>

## Почему ему можно доверять

- **Открытый код** под лицензией MIT: всё, что делает приложение, есть в этом репозитории.
- **Ничего не отправляет**: ни телеметрии, ни рекламы, ни аккаунтов, ни автообновлений.
- **Не нужны права администратора**, ставится только для вашей учётной записи.
- **Собирается на GitHub**: установщик каждого релиза собирает GitHub Actions из исходников, рядом лежат контрольные
  суммы, а GitHub подписывает подтверждение сборки.
- **Лёгкое**: установщик около 3 МБ, а в покое приложение почти не нагружает процессор.

**Приватность.** AITU Desk выходит в сеть, только когда вы сами просите: открыть ярлык или загрузить иконку сайта.
Пары, заметки и настройки остаются на вашем компьютере. Подробности в «Сеть и приватность» в разделе
[«Установка»](#установка).

## Вопросы

<details>
<summary><b>Windows пишет «Система Windows защитила ваш компьютер». Это опасно?</b></summary>
<br>

Нет. Так Windows встречает любую программу без платной цифровой подписи. Нажмите «Подробнее», затем «Выполнить в
любом случае». Установщик собирает GitHub из открытого кода этого репозитория, а проверить файл можно по разделу
«Проверить, что установщик настоящий» выше.
</details>

<details>
<summary><b>Я учусь не в AITU. Мне пригодится?</b></summary>
<br>

Да. Часы, нагрузка, заметки, расписание, ярлыки и свои картинки нужны любому. Карту и ярлыки университета можно
выключить в настройках.
</details>

<details>
<summary><b>Не будет ли тормозить компьютер или садиться батарея?</b></summary>
<br>

Нет. В покое AITU Desk почти не нагружает процессор. Пока игра или фильм открыты на весь экран, нагрузка не
считывается и GIF стоят, а в режиме экономии батареи всё обновляется реже.
</details>

<details>
<summary><b>Работает ли на Windows 10?</b></summary>
<br>

Нет, нужна Windows 11, 64-бит. Закруглённые углы, стекло и прозрачность виджетов есть только в Windows 11.
</details>

<details>
<summary><b>Программа зависла или закрылась сама. Что делать?</b></summary>
<br>

Откройте AITU Desk снова. В разделе «О программе» включите «Записывать журнал», а когда сбой повторится, нажмите
«Сохранить отчёт» и пришлите файл в Telegram [@capybara205](https://t.me/capybara205). В журнале только то, что
происходило в приложении: что включено, что нажато и ошибки. Тексты заметок и пар, адреса ярлыков, названия сетей и
устройств туда не попадают, и файл никуда не отправляется сам.
</details>

<details>
<summary><b>Как открыть настройки или вернуть виджеты?</b></summary>
<br>

Щёлкните значок AITU Desk в трее или запустите программу ещё раз из меню «Пуск»: откроется окно настроек. В разделе
«Виджеты» каждый виджет включается и выключается отдельно.
</details>

## Ссылки

| Что | Где |
| --- | --- |
| Скачать | [Последний релиз](https://github.com/cyberbara01/aitudesk/releases/latest) |
| Ошибка или идея | [Issues](https://github.com/cyberbara01/aitudesk/issues), Telegram [@capybara205](https://t.me/capybara205) или [анонимная форма](https://forms.gle/LV7BYCqeveRyRm9YA) |
| Оценить приложение | [Та же форма](https://forms.gle/LV7BYCqeveRyRm9YA): ваши данные не нужны, а без вашего фидбэка софт не будет расти |
| Автор | [@cyberbara01](https://github.com/cyberbara01) |
| Карта AITU | [aitumap](https://github.com/Yuujiso/aitumap), автор [Yuujiso](https://github.com/Yuujiso) |
| Сторонние компоненты | [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) |

<details>
<summary><b>Сборка из исходников</b></summary>
<br>

Нужны Node.js 22+, Rust (stable) и, по [инструкции Tauri](https://tauri.app/start/prerequisites/), Microsoft C++
Build Tools (или mingw-w64 для цели `x86_64-pc-windows-gnu`).

```bash
npm install
npm run tauri dev      # запуск в режиме разработки
npm run tauri build    # установщик появится в src-tauri/target/release/bundle/nsis/
```

Для проверки без ноутбука есть переменные окружения: `AITUDESK_MOCK_POWER` (`none` | `78` | `15,charging` |
`40,saver`), `AITUDESK_MOCK_WIFI` (`off` | `SSID,bars` | `hidden,bars`), `AITUDESK_MOCK_BT` (`off` | `none` |
`A;B;C`).

Внутри: Tauri 2, Rust, React 18, TypeScript и Vite. Все виджеты работают в одном процессе WebView2, часы просыпаются
раз в минуту, если секунды не показаны, а скрытые и свёрнутые в значок виджеты не держат таймеров. Пока программа
открыта на весь экран, нагрузка не считывается и GIF стоят. В режиме экономии Windows часы прячут секунды, заряд, сеть
и нагрузка проверяются реже, а GIF стоят. При прозрачности «Без прозрачности» виджеты сбрасывают акрил, и видеокарте
легче.

[![Tauri 2](https://img.shields.io/badge/Tauri_2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-B7410E?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React](https://img.shields.io/badge/React-087EA4?logo=react&logoColor=white)](https://react.dev)
</details>

## Лицензия

[MIT](LICENSE): пользуйтесь, меняйте и делитесь, сохраняя имя автора. Сторонние компоненты (карта, иконки, шрифты)
перечислены в [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
