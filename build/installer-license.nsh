# Keep the existing install/update/uninstall lifecycle independent of license presentation.
# Backslash separators only: NSIS does not treat a forward-slash path as absolute for !include,
# so the mixed form resolves through the include search path and fails the Windows package build.
!include "${BUILD_RESOURCES_DIR}\installer.nsh"

# electron-builder inserts this hook immediately before its license page, and skips that page
# during updates. Override all agreement copy; Next only advances the informational page.
!macro customWelcomePage
  !define MUI_PAGE_HEADER_TEXT "$(BaselioLicenseHeader)"
  !define MUI_PAGE_HEADER_SUBTEXT "$(BaselioLicenseSubheader)"
  !define MUI_LICENSEPAGE_TEXT_TOP "$(BaselioLicenseTop)"
  !define MUI_LICENSEPAGE_TEXT_BOTTOM "$(BaselioLicenseBottom)"
  !define MUI_LICENSEPAGE_BUTTON "$(^NextBtn)"
!macroend

# NSIS falls back to its first compiled language (Japanese here). Resolve the actual Windows UI
# language before showing the selector so unsupported UIs default to English instead.
!macro preInit
  Push $0
  System::Call 'kernel32::GetUserDefaultUILanguage() i .r0'
  StrCpy $LANGUAGE 1033
  StrCmp $0 1041 0 +2
    StrCpy $LANGUAGE 1041
  StrCmp $0 2052 0 +2
    StrCpy $LANGUAGE 2052
  Pop $0
!macroend
