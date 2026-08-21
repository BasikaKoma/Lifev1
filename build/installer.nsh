; Stop any running instance (including zombie single-instance processes).
!macro customInit
  nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Pop $0
  Sleep 1000

  ; Upgrade path: remove old files directly instead of running the old silent
  ; uninstaller (it can falsely report "app cannot be closed" even when nothing runs).
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 customInit_done
    DetailPrint "Removing previous ${PRODUCT_NAME} from $INSTDIR"
    nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
    Pop $0
    Sleep 800
    RMDir /r "$INSTDIR"
    DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
    DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY}"
    DeleteRegKey HKCU "${INSTALL_REGISTRY_KEY}"
    DeleteRegKey HKLM "${INSTALL_REGISTRY_KEY}"
  customInit_done:
!macroend

!macro customCheckAppRunning
  DetailPrint "Closing ${PRODUCT_NAME}..."
  nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Pop $0
  Sleep 1500
!macroend

!macro customUnInstallCheck
  ; Old install already removed in customInit — ignore uninstaller exit code.
!macroend
