//! Glass with corners of any radius for the tiles («Углы виджетов» other than 0 or 8 px).
//!
//! Windows' own acrylic (glass.rs) is clipped by the window's corner, which DWM rounds at 8 px or not at all, so a
//! CSS radius of 16 would leave wedges of bare glass in the corners. Here the glass is drawn by the tile itself:
//! a Windows.UI.Composition visual under the page (a desktop window target below the WebView2 child window) with
//! the host backdrop brush, which DWM fills with what lies behind the window, already blurred, the way it does for
//! its own acrylic (DWMWA_USE_HOSTBACKDROPBRUSH, Windows 11). The visual is clipped by an anti-aliased rounded
//! rectangle of the page's radius in device pixels, so it lines up with the CSS border. A tint layer gives the glass
//! the body of Windows' acrylic (the page's CSS fill goes on top, as with acrylic), and when Windows' transparency
//! effects are off (or the energy saver turns them off) the blur gives way to a solid colour, as acrylic does.
//!
//! Everything here lives on the main thread: the compositor needs the thread's dispatcher queue, and the tile
//! windows (whose resizes and DPI changes update the clip) belong to it.

use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::c_void;

use windows::core::{Interface, Result, BOOL};
use windows::Foundation::TypedEventHandler;
use windows::System::{DispatcherQueueController, DispatcherQueueHandler};
use windows::UI::Color;
use windows::UI::Composition::Desktop::DesktopWindowTarget;
use windows::UI::Composition::{CompositionRoundedRectangleGeometry, Compositor, ContainerVisual, SpriteVisual};
use windows::UI::ViewManagement::UISettings;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_HOSTBACKDROPBRUSH};
use windows::Win32::System::WinRT::Composition::ICompositorDesktopInterop;
use windows::Win32::System::WinRT::{CreateDispatcherQueueController, DispatcherQueueOptions, DQTAT_COM_NONE, DQTYPE_THREAD_CURRENT};
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{GetClientRect, WM_DPICHANGED, WM_SIZE};
use windows_numerics::Vector2;

/// Id of the subclass that keeps the clip at the window's size.
const SIZE_SUBCLASS: usize = 0xA180;

/// The body Windows' acrylic gives the glass under the page's CSS fill, measured on the same wallpaper: the dark
/// acrylic hardly darkens what is behind it, the light one lifts it about halfway to white.
const TINT_DARK: Color = Color { A: 8, R: 32, G: 32, B: 34 };
const TINT_LIGHT: Color = Color { A: 122, R: 243, G: 243, B: 245 };
/// The glass with Windows' transparency effects off: solid, as acrylic falls back.
const SOLID_DARK: Color = Color { A: 255, R: 32, G: 32, B: 34 };
const SOLID_LIGHT: Color = Color { A: 255, R: 243, G: 243, B: 245 };

struct Shared {
    /// Keeps the main thread's dispatcher queue running (the compositor needs it).
    _controller: DispatcherQueueController,
    compositor: Compositor,
    ui: UISettings,
    effects: bool,
}

struct Tile {
    _target: DesktopWindowTarget,
    root: ContainerVisual,
    shape: CompositionRoundedRectangleGeometry,
    blur: SpriteVisual,
    tint: SpriteVisual,
    /// Radius in device pixels, as the page asked.
    radius: f32,
    dark: bool,
}

thread_local! {
    static SHARED: RefCell<Option<Shared>> = const { RefCell::new(None) };
    static TILES: RefCell<HashMap<isize, Tile>> = RefCell::new(HashMap::new());
}

/// The compositor and the state of the transparency effects, made on first use.
fn compositor() -> Result<(Compositor, bool)> {
    SHARED.with(|cell| {
        let mut slot = cell.borrow_mut();
        if slot.is_none() {
            *slot = Some(make_shared()?);
        }
        let s = slot.as_ref().expect("made above");
        Ok((s.compositor.clone(), s.effects))
    })
}

fn effects_on() -> bool {
    SHARED.with(|s| s.try_borrow().ok().and_then(|s| s.as_ref().map(|s| s.effects)).unwrap_or(true))
}

fn make_shared() -> Result<Shared> {
    // SAFETY: creates the dispatcher queue of the calling (main) thread, whose message loop runs it.
    let controller = unsafe {
        CreateDispatcherQueueController(DispatcherQueueOptions {
            dwSize: std::mem::size_of::<DispatcherQueueOptions>() as u32,
            threadType: DQTYPE_THREAD_CURRENT,
            apartmentType: DQTAT_COM_NONE,
        })?
    };
    let queue = controller.DispatcherQueue()?;
    let compositor = Compositor::new()?;
    let ui = UISettings::new()?;
    let effects = ui.AdvancedEffectsEnabled().unwrap_or(true);
    // Transparency effects switched in Windows (or by the energy saver): every tile follows, on the main thread.
    ui.AdvancedEffectsEnabledChanged(&TypedEventHandler::new(move |_, _| {
        let _ = queue.TryEnqueue(&DispatcherQueueHandler::new(|| {
            refresh_effects();
            Ok(())
        }));
        Ok(())
    }))?;
    Ok(Shared { _controller: controller, compositor, ui, effects })
}

fn color(dark: bool, effects: bool) -> Color {
    match (dark, effects) {
        (true, true) => TINT_DARK,
        (false, true) => TINT_LIGHT,
        (true, false) => SOLID_DARK,
        (false, false) => SOLID_LIGHT,
    }
}

fn host_backdrop(hwnd: HWND, on: bool) {
    let value = BOOL::from(on);
    // SAFETY: a plain DWM attribute write on the tile's own window.
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_HOSTBACKDROPBRUSH,
            &value as *const BOOL as *const c_void,
            std::mem::size_of::<BOOL>() as u32,
        );
    }
}

fn client_size(hwnd: HWND) -> Vector2 {
    let mut r = RECT::default();
    // SAFETY: reads the client rect of the tile's own window.
    let _ = unsafe { GetClientRect(hwnd, &mut r) };
    Vector2 { X: (r.right - r.left).max(0) as f32, Y: (r.bottom - r.top).max(0) as f32 }
}

/// Size and clip of one tile's glass from its window.
fn fit(tile: &Tile, hwnd: HWND) -> Result<()> {
    let size = client_size(hwnd);
    tile.root.SetSize(size)?;
    tile.shape.SetSize(size)?;
    let r = tile.radius.min(size.X / 2.0).min(size.Y / 2.0).max(0.0);
    tile.shape.SetCornerRadius(Vector2 { X: r, Y: r })
}

/// Blur and tint of one tile's glass for its palette and the transparency effects.
fn paint(tile: &Tile, effects: bool) -> Result<()> {
    tile.blur.SetIsVisible(effects)?;
    let brush = tile.tint.Compositor()?.CreateColorBrushWithColor(color(tile.dark, effects))?;
    tile.tint.SetBrush(&brush)
}

/// Glass of `radius` device pixels under the page of this tile window (made, or updated if it has one). Main thread.
pub fn attach(hwnd: HWND, radius: f32, dark: bool) -> Result<()> {
    let key = hwnd.0 as isize;
    let (compositor, effects) = compositor()?;
    let updated = TILES.with(|t| -> Result<bool> {
        let mut tiles = t.borrow_mut();
        let Some(tile) = tiles.get_mut(&key) else { return Ok(false) };
        let repaint = tile.dark != dark;
        tile.radius = radius;
        tile.dark = dark;
        fit(tile, hwnd)?;
        if repaint {
            paint(tile, effects)?;
        }
        Ok(true)
    })?;
    if updated {
        return Ok(());
    }
    host_backdrop(hwnd, true);
    let made = (|| -> Result<Tile> {
        let interop: ICompositorDesktopInterop = compositor.cast()?;
        // SAFETY: the window is a live tile of this thread; `false` puts the visuals under its child windows (the page).
        let target = unsafe { interop.CreateDesktopWindowTarget(hwnd, false)? };
        let root = compositor.CreateContainerVisual()?;
        let shape = compositor.CreateRoundedRectangleGeometry()?;
        root.SetClip(&compositor.CreateGeometricClipWithGeometry(&shape)?)?;
        let blur = compositor.CreateSpriteVisual()?;
        blur.SetRelativeSizeAdjustment(Vector2 { X: 1.0, Y: 1.0 })?;
        blur.SetBrush(&compositor.CreateHostBackdropBrush()?)?;
        let tint = compositor.CreateSpriteVisual()?;
        tint.SetRelativeSizeAdjustment(Vector2 { X: 1.0, Y: 1.0 })?;
        root.Children()?.InsertAtTop(&blur)?;
        root.Children()?.InsertAtTop(&tint)?;
        target.SetRoot(&root)?;
        let tile = Tile { _target: target, root, shape, blur, tint, radius, dark };
        fit(&tile, hwnd)?;
        paint(&tile, effects)?;
        Ok(tile)
    })();
    let tile = match made {
        Ok(t) => t,
        Err(e) => {
            host_backdrop(hwnd, false);
            return Err(e);
        }
    };
    TILES.with(|t| t.borrow_mut().insert(key, tile));
    // SAFETY: our own subclass on our own window, removed in `detach`.
    unsafe {
        let _ = SetWindowSubclass(hwnd, Some(follow_size), SIZE_SUBCLASS, 0);
    }
    Ok(())
}

/// Back to no glass of our own (Windows' acrylic, or none). Main thread.
pub fn detach(hwnd: HWND) {
    let key = hwnd.0 as isize;
    if TILES.with(|t| t.borrow_mut().remove(&key)).is_some() {
        // SAFETY: removes our own subclass from our own window.
        unsafe {
            let _ = RemoveWindowSubclass(hwnd, Some(follow_size), SIZE_SUBCLASS);
        }
        host_backdrop(hwnd, false);
    }
}

/// Light or dark glass for this tile (the palette changed).
pub fn set_dark(hwnd: HWND, dark: bool) {
    let effects = effects_on();
    TILES.with(|t| {
        if let Some(tile) = t.borrow_mut().get_mut(&(hwnd.0 as isize)) {
            if tile.dark != dark {
                tile.dark = dark;
                let _ = paint(tile, effects);
            }
        }
    });
}

fn refresh_effects() {
    let effects = SHARED.with(|s| {
        let mut slot = s.borrow_mut();
        let shared = slot.as_mut()?;
        shared.effects = shared.ui.AdvancedEffectsEnabled().unwrap_or(true);
        Some(shared.effects)
    });
    let Some(effects) = effects else { return };
    TILES.with(|t| {
        for tile in t.borrow().values() {
            let _ = paint(tile, effects);
        }
    });
}

/// Keeps the glass at the window's size: a resize in edit mode, a new size from the layout, a DPI change.
unsafe extern "system" fn follow_size(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _data: usize) -> LRESULT {
    let result = unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) };
    if msg == WM_SIZE || msg == WM_DPICHANGED {
        TILES.with(|t| {
            if let Ok(tiles) = t.try_borrow() {
                if let Some(tile) = tiles.get(&(hwnd.0 as isize)) {
                    let _ = fit(tile, hwnd);
                }
            }
        });
    }
    result
}
