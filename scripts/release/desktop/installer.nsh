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
