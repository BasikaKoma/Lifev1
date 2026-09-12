; Close a running instance so files can be overwritten.
; Do not wipe $INSTDIR or the uninstall registry — recursive delete of the
; Electron tree is extremely slow on HDD + Defender and makes updates look hung
; before the copy step even starts. NSIS overwrites in place instead.

!macro customInit
  nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Pop $0
  Sleep 1500

  ; Auto-update passes --updated. Skip the old uninstaller: it also recursively
  ; deletes the install dir (same hang as RMDir /r). Install location stays in
  ; the registry so files are replaced in place.
  ${GetParameters} $R8
  ClearErrors
  ${GetOptions} $R8 "--updated" $R9
  IfErrors customInit_done
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  customInit_done:
!macroend

!macro customCheckAppRunning
  DetailPrint "Closing ${PRODUCT_NAME}..."
  nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Pop $0
  Sleep 1500
!macroend

!macro customUnInstallCheck
  ; Previous uninstaller can report a false "app still running" after taskkill.
  ; Continue with in-place overwrite instead of aborting.
!macroend
