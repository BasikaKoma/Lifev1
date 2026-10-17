; Auto-update passes --updated. Drop the uninstall command so the previous
; uninstaller never runs. That uninstaller renames every file in the Electron
; folder one by one before the copy, which is extremely slow with Defender
; and looks like a hung update. NSIS then overwrites the install in place.
; Do not taskkill /T: the installer is a child of lifev1.exe, so /T kills it.

!macro customInit
  ${GetParameters} $R8
  StrCpy $R7 $R8
  customInit_scan:
    StrCpy $R6 $R7 9
    StrCmp $R6 "--updated" customInit_skip_uninstall
    StrCmp $R7 "" customInit_done
    StrCpy $R7 $R7 "" 1
    Goto customInit_scan

  customInit_skip_uninstall:
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
    DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  customInit_done:
!macroend

!macro customUnInstallCheck
  ; Previous uninstaller can report a false "app still running" after it exits.
  ; Continue with in-place overwrite instead of aborting.
!macroend
