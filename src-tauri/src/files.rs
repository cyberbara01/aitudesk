//! Standard Windows «Сохранить» and «Открыть» dialogs for settings files («Конфиги»). Each dialog
//! runs on its own short-lived thread (COM single-threaded apartment) and is owned by the settings window,
//! which stays drawn behind it and cannot be used until the dialog closes. Files are plain UTF-8 JSON: they
//! can be opened and read in any text editor before loading.

use windows::core::{HRESULT, HSTRING, PCWSTR};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    COINIT_DISABLE_OLE1DDE,
};
use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
use windows::Win32::UI::Shell::{
    FileOpenDialog, FileSaveDialog, IFileDialog, IFileOpenDialog, IFileSaveDialog, IShellItem, SHGetKnownFolderItem,
    FOLDERID_Documents, FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, FOS_OVERWRITEPROMPT, FOS_PATHMUSTEXIST,
    FOS_STRICTFILETYPES, KF_FLAG_DEFAULT, SIGDN_FILESYSPATH,
};

/// HRESULT_FROM_WIN32(ERROR_CANCELLED): the user closed the dialog.
const CANCELLED: HRESULT = HRESULT(0x8007_04C7_u32 as i32);
/// A settings file is a few hundred KB at most (site icons included); anything far bigger is not one.
const MAX_FILE: u64 = 16 * 1024 * 1024;

/// Name of the file type in the dialogs' type box.
fn filter_name() -> &'static str {
    crate::lang::pick("Конфиг AITU Desk (*.json)", "AITU Desk config (*.json)")
}
const FILTER_SPEC: &str = "*.json";

fn err(e: windows::core::Error) -> String {
    e.message()
}

/// Run `f` on a fresh thread inside a single-threaded COM apartment (what the shell dialogs need).
fn on_sta_thread<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    std::thread::spawn(move || {
        // SAFETY: balanced with CoUninitialize on this same thread.
        let init = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
        let out = f();
        if init.is_ok() {
            unsafe { CoUninitialize() };
        }
        out
    })
    .join()
    .map_err(|_| "file dialog failed".to_string())?
}

/// Filter, title and owner shared by both dialogs; then shows it. Ok(false) = cancelled.
unsafe fn show(dialog: &IFileDialog, owner: isize, title: &str) -> Result<bool, String> {
    let name = HSTRING::from(filter_name());
    let spec = HSTRING::from(FILTER_SPEC);
    let filters = [COMDLG_FILTERSPEC { pszName: PCWSTR(name.as_ptr()), pszSpec: PCWSTR(spec.as_ptr()) }];
    dialog.SetFileTypes(&filters).map_err(err)?;
    dialog.SetTitle(&HSTRING::from(title)).map_err(err)?;
    // The first time, «Документы» rather than the folder the app was started from; later Windows reopens the
    // folder used last.
    if let Ok(documents) = SHGetKnownFolderItem::<IShellItem>(&FOLDERID_Documents, KF_FLAG_DEFAULT, None) {
        let _ = dialog.SetDefaultFolder(&documents);
    }
    let owner = (owner != 0).then_some(HWND(owner as *mut core::ffi::c_void));
    match dialog.Show(owner) {
        Ok(()) => Ok(true),
        Err(e) if e.code() == CANCELLED => Ok(false),
        Err(e) => Err(err(e)),
    }
}

unsafe fn result_path(dialog: &IFileDialog) -> Result<String, String> {
    let item = dialog.GetResult().map_err(err)?;
    let raw = item.GetDisplayName(SIGDN_FILESYSPATH).map_err(err)?;
    let path = raw.to_string().map_err(|e| e.to_string());
    CoTaskMemFree(Some(raw.0 as *const core::ffi::c_void));
    path
}

/// «Сохранить»: asks where (suggesting `file_name`), writes `contents`. Ok(None) = cancelled.
pub fn save(owner: isize, title: String, file_name: String, contents: String) -> Result<Option<String>, String> {
    on_sta_thread(move || unsafe {
        let dialog: IFileSaveDialog = CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER).map_err(err)?;
        let options = dialog.GetOptions().map_err(err)?;
        dialog
            .SetOptions(options | FOS_OVERWRITEPROMPT | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_STRICTFILETYPES)
            .map_err(err)?;
        dialog.SetDefaultExtension(&HSTRING::from("json")).map_err(err)?;
        dialog.SetFileName(&HSTRING::from(file_name)).map_err(err)?;
        if !show(&dialog, owner, &title)? {
            return Ok(None);
        }
        let path = result_path(&dialog)?;
        std::fs::write(&path, contents.as_bytes()).map_err(|e| e.to_string())?;
        Ok(Some(path))
    })
}

/// A file picked in «Открыть»: its path (for the message) and text.
#[derive(serde::Serialize)]
pub struct OpenedFile {
    pub path: String,
    pub contents: String,
}

/// «Открыть»: asks for a .json file and reads it as text (a UTF-8 BOM is dropped). Ok(None) = cancelled.
pub fn open(owner: isize, title: String) -> Result<Option<OpenedFile>, String> {
    on_sta_thread(move || unsafe {
        let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(err)?;
        let options = dialog.GetOptions().map_err(err)?;
        dialog.SetOptions(options | FOS_FILEMUSTEXIST | FOS_PATHMUSTEXIST | FOS_FORCEFILESYSTEM).map_err(err)?;
        if !show(&dialog, owner, &title)? {
            return Ok(None);
        }
        let path = result_path(&dialog)?;
        let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
        if size > MAX_FILE {
            return Err("too large".into());
        }
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&bytes)).into_owned();
        Ok(Some(OpenedFile { path, contents: text }))
    })
}
