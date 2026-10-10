; AITU Desk: the end of installing and uninstalling is plain to see (bundle > windows > nsis > installerHooks).

; Installing: once the files are in place the installer moves on to its last page by itself («Установка AITU Desk
; завершена», with «Запустить AITU Desk» and «Готово»), instead of resting on a full progress bar that keeps glowing
; and looks unfinished. Silent and passive runs close as before.
!macro NSIS_HOOK_POSTINSTALL
  SetAutoClose true
!macroend

; Uninstalling has no last page of its own: a short message says the app is gone, then the window closes. Silent,
; passive and update runs (winget, an upgrade that removes the old version first) stay quiet.
!macro NSIS_HOOK_POSTUNINSTALL
  ${IfNot} ${Silent}
  ${AndIf} $PassiveMode <> 1
  ${AndIf} $UpdateMode <> 1
    ${If} $LANGUAGE = 1049
      MessageBox MB_OK|MB_ICONINFORMATION "AITU Desk удалена с этого компьютера."
    ${Else}
      MessageBox MB_OK|MB_ICONINFORMATION "AITU Desk has been removed from this computer."
    ${EndIf}
    SetAutoClose true
  ${EndIf}
!macroend
