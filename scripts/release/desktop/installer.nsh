; Fresh Windows installs prefer D:. Existing locations and /D overrides win.
!macro clooteeDefaultInstallDir
  Push $0
  Push $1
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $1 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 == ""
  ${AndIf} $1 == ""
    !insertmacro GetDParameter $0
    ${If} $0 == ""
      IfFileExists "D:\*.*" 0 +2
      StrCpy $INSTDIR "D:\${APP_FILENAME}"
    ${EndIf}
  ${EndIf}
  Pop $1
  Pop $0
!macroend

; Init covers silent installs. The install-mode page recalculates INSTDIR, so
; apply the same default after that page, before the user chooses a directory.
!macro customInit
  !insertmacro clooteeDefaultInstallDir
!macroend

; No welcome/license page is configured: the next page is PAGE_INSTALL_MODE.
!macro customWelcomePage
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE clooteeInstallModeLeave
  Function clooteeInstallModeLeave
    !insertmacro clooteeDefaultInstallDir
  FunctionEnd
!macroend

; Installation is complete only after all required tools pass executable checks.
!macro customInstall
  DetailPrint "Installing Node, Git, Claude Code and Codex..."
  nsExec::ExecToLog '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --install-only'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Dependency installation did not complete. Reopen Clootee to retry; see desktop.log in the Clootee user data directory."
    SetErrorLevel 1
    Abort
  ${EndIf}
!macroend
