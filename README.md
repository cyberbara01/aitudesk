<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="AITU Desk">

# AITU Desk

**Widgets for the Windows 11 desktop, made for students of Astana IT University.**

A clock, battery and network, computer load, shortcuts, notes with deadlines, the class schedule, the AITU map<br>and your own pictures lie right on the wallpaper.

[![Version](https://img.shields.io/github/v/release/cyberbara01/aitudesk?label=version&color=0078D4)](https://github.com/cyberbara01/aitudesk/releases/latest)
[![Windows 11](https://img.shields.io/badge/Windows-11%2C_64--bit-0078D4)](#installation)
[![English and Russian](https://img.shields.io/badge/languages-English%2C_Russian-0078D4)](README.ru.md)
[![MIT license](https://img.shields.io/badge/license-MIT-2EA043)](LICENSE)
[![No telemetry](https://img.shields.io/badge/telemetry-none-2EA043)](#why-you-can-trust-it)
[![No admin rights](https://img.shields.io/badge/admin_rights-not_needed-2EA043)](#installation)

<a href="https://github.com/cyberbara01/aitudesk/releases/latest"><img src="https://img.shields.io/badge/Download%20for%20Windows%2011-0078D4?style=for-the-badge&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyBmaWxsPSIjZmZmZmZmIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMTMgM2ExIDEgMCAxIDAtMiAwdjEyLjA5bC0zLjMtMy4zYTEgMSAwIDAgMC0xLjQgMS40Mmw1IDVhMSAxIDAgMCAwIDEuNCAwbDUtNWExIDEgMCAwIDAtMS40LTEuNDJMMTMgMTUuMXpNNSAyMGExIDEgMCAxIDAgMCAyaDE0YTEgMSAwIDEgMCAwLTJ6Ii8%2BPC9zdmc%2B" alt="Download for Windows 11"></a>

**English** · [Русский](README.ru.md)

</div>

<p align="center">
  <img src="docs/screenshots/en/desk-1.webp" alt="A laptop with AITU Desk: the map, the clock and the load at the top, notes, system and shortcuts on the right, the schedule on the left" width="100%">
  <br><sub>The map, the clock and the load at the top, the schedule, notes, system and shortcuts around them.</sub>
</p>

## Installation

1. Download `AITU-Desk_<version>_x64-setup.exe` from the [latest release](https://github.com/cyberbara01/aitudesk/releases/latest) and run it.
2. If Windows shows “Windows protected your PC”, click “More info”, then “Run anyway”. The warning appears because
   the app is not signed with a paid certificate.
3. The settings window opens with a short guide, and the widgets appear on the desktop. They start with Windows from
   then on; this can be turned off in “General”.

Windows 11, 64-bit, is required. The interface is in English or Russian, following Windows; switch it in “General” or
with the “RU | EN” button at the bottom of the settings window.

<details>
<summary><b>Check that the installer is genuine</b></summary>
<br>

Next to the installer, the release has `SHA256SUMS.txt`. Compare it with the hash of the downloaded file in
PowerShell:

```powershell
Get-FileHash ".\AITU-Desk_1.0.0_x64-setup.exe" -Algorithm SHA256
```

GitHub also confirms that it built the file itself from this repository: the same hash is on the
[build attestations](https://github.com/cyberbara01/aitudesk/attestations) page. GitHub Actions makes that record
during the build and signs it, so a file uploaded by hand has none. With [GitHub CLI](https://cli.github.com) it is
one command:

```powershell
gh attestation verify ".\AITU-Desk_1.0.0_x64-setup.exe" --repo cyberbara01/aitudesk
```

The build is made by [`.github/workflows/release.yml`](.github/workflows/release.yml) from the source of this
repository.
</details>

<details>
<summary><b>What the installer does and where your data lives</b></summary>
<br>

| What | Where |
| --- | --- |
| The program `aitudesk.exe` and the uninstaller `uninstall.exe` | `%LOCALAPPDATA%\AITU Desk\` |
| A Start menu shortcut and, if you leave the box checked, a desktop shortcut | Start menu, desktop |
| The entry for uninstalling in “Installed apps” | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\AITU Desk` |
| Settings, classes, notes, shortcuts, widget layout (plain JSON) | `%APPDATA%\kz.edu.astanait.aitudesk\settings.json` |
| Copies of the pictures of your widgets | `%APPDATA%\kz.edu.astanait.aitudesk\widgets\` |
| The WebView2 service cache | `%LOCALAPPDATA%\kz.edu.astanait.aitudesk\EBWebView\` |
| Autostart (on from the first start, a switch in “General”) | the `AITU Desk` value in `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` |

The installer does nothing else: no services, drivers, scheduled tasks, browser extensions or bundled programs.
WebView2 is already part of Windows 11; only if it is missing does the installer download it from Microsoft.

The settings file opens in Notepad. If it stops being readable after an edit, the app does not erase it but renames
it to `settings.broken-<time>.json`.
</details>

<details>
<summary><b>Network and privacy</b></summary>
<br>

- The network is used only when you act: to open a shortcut in your browser, or to download a site's icon once when
  you add or change a shortcut (a request to the site itself and, if it has no icon, to Google's icon service, which
  is never asked about local names). The DU, LMS and Learn icons are built in. A site cannot send these requests on
  to devices in your home network.
- The schedule, notes, the Wi-Fi network name and Bluetooth device names on the desktop can be hidden behind dots.
- The processor temperature comes from Windows where it gives one (laptops, mostly). On most desktop PCs Windows does
  not, and the app installs no driver for it: it reads the temperature from a monitoring program you run anyway
  (LibreHardwareMonitor, HWiNFO, Core Temp, MSI Afterburner or AIDA64), on this computer only.
- A config holds only the parts you choose, and notes and your own widgets are left out by default. Shortcuts from
  someone else's config are accepted only with `http://` and `https://` addresses, and pictures only when they really
  are pictures.
</details>

<details>
<summary><b>Uninstalling</b></summary>
<br>

Settings → Apps → Installed apps → AITU Desk → Uninstall. The “Delete the application data” box erases the settings too;
without it they stay in case you install again. Before uninstalling you can save everything to a config in
“Configs”. To start over without uninstalling, “Reset everything” at the bottom of “General” makes the app as it was
right after installing.
</details>

## Why you can trust it

- **Open source** under the MIT license: everything the app does is in this repository.
- **Sends nothing**: no telemetry, ads, accounts or auto-updates.
- **Needs no admin rights** and installs for your account only.
- **Built on GitHub**: GitHub Actions builds the installer of every release from the source, with checksums next
  to it and GitHub's signed build attestation.
- **Light**: the installer is about 3 MB, and when idle the app barely touches the processor.

**Privacy.** AITU Desk goes online only when you ask it to: to open a shortcut or to fetch a site's icon. Your
classes, notes and settings stay on your computer. The details are under “Network and privacy” in
[Installation](#installation).

## Links

| What | Where |
| --- | --- |
| Download | [The latest release](https://github.com/cyberbara01/aitudesk/releases/latest) |
| A bug or an idea | [Issues](https://github.com/cyberbara01/aitudesk/issues), Telegram [@capybara205](https://t.me/capybara205) or the [anonymous form](https://forms.gle/LV7BYCqeveRyRm9YA) |
| Rate the app | [The same form](https://forms.gle/LV7BYCqeveRyRm9YA): we don't need your data, and without your feedback the app can't grow |
| Author | [@cyberbara01](https://github.com/cyberbara01) |
| The AITU map | [aitumap](https://github.com/Yuujiso/aitumap) by [Yuujiso](https://github.com/Yuujiso) |
| Third-party components | [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) |

<details>
<summary><b>Building from source</b></summary>
<br>

You need Node.js 22+, Rust (stable) and, following the [Tauri guide](https://tauri.app/start/prerequisites/),
Microsoft C++ Build Tools (or mingw-w64 for the `x86_64-pc-windows-gnu` target).

```bash
npm install
npm run tauri dev      # run in development mode
npm run tauri build    # the installer lands in src-tauri/target/release/bundle/nsis/
```

For testing without a laptop there are environment variables: `AITUDESK_MOCK_POWER` (`none` | `78` |
`15,charging` | `40,saver`), `AITUDESK_MOCK_WIFI` (`off` | `SSID,bars` | `hidden,bars`), `AITUDESK_MOCK_BT`
(`off` | `none` | `A;B;C`).

Inside: Tauri 2, Rust, React 18, TypeScript and Vite. All widgets run in one WebView2 process, the clock wakes up
once a minute when seconds are not shown, and hidden widgets and widgets folded into an icon keep no timers. While
a program fills the screen, the load is not read and GIFs stand still. In Windows battery saver the clock hides its
seconds, charge, network and load are checked less often, and GIFs stand still. With transparency set to none the
widgets drop their acrylic, which spares the graphics card.

[![Tauri 2](https://img.shields.io/badge/Tauri_2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-B7410E?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React](https://img.shields.io/badge/React-087EA4?logo=react&logoColor=white)](https://react.dev)
</details>

## License

[MIT](LICENSE): use it, change it and share it, keeping the author's name. Third-party components (the map, icons,
fonts) are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
