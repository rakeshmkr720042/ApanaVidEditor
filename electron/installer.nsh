; Install password page for the Windows installer (electron-builder NSIS include).
; The first page asks for the install password; Next stays blocked until it is right.
; Only two 32-bit hashes of the password are stored here, not the password itself.
; Silent installs (/S) need /PASSWORD=<password> on the command line.
; This is a light deterrent: a determined person can still unpack the installer.

!include nsDialogs.nsh
!include LogicLib.nsh
!include FileFunc.nsh

; FNV-1a style hashes of the password (made by scripts/install-password-hash.mjs).
!define PWD_HASH_A 464077357
!define PWD_HASH_B 1231088143

; Everything below is placed where electron-builder declares the installer pages (after MUI2/UAC),
; so the page functions can use their macros. The uninstaller never includes it.
!macro customWelcomePage
  Var PwdDialog
  Var PwdInput
  Var PwdNote

  ; Hashes the string in $R0 into $R1 (hash A) and $R2 (hash B).
  Function PwdHash
    Push $R3
    Push $R4
    Push $R5
    Push $R6
    Push $R7
    Push $R8
    StrCpy $R8 " !$\"#$$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}~"
    StrCpy $R1 -2128831035
    StrCpy $R2 777777777
    StrCpy $R3 0
    StrLen $R4 $R0
    ${While} $R3 < $R4
      StrCpy $R5 $R0 1 $R3
      ; character code: position in the printable ASCII table + 32, anything else = 255
      StrCpy $R7 255
      StrCpy $R6 0
      ${While} $R6 < 95
        StrCpy $9 $R8 1 $R6
        ${If} $9 S== $R5
          IntOp $R7 $R6 + 32
          ${Break}
        ${EndIf}
        IntOp $R6 $R6 + 1
      ${EndWhile}
      IntOp $R1 $R1 ^ $R7
      IntOp $R1 $R1 * 16777619
      IntOp $R2 $R2 ^ $R7
      IntOp $R2 $R2 * 1540483477
      IntOp $R3 $R3 + 1
    ${EndWhile}
    Pop $R8
    Pop $R7
    Pop $R6
    Pop $R5
    Pop $R4
    Pop $R3
  FunctionEnd

  ; Leaves 1 in $R9 when the password in $R0 is right, else 0.
  Function PwdCheck
    Push $R1
    Push $R2
    Call PwdHash
    StrCpy $R9 0
    ${If} $R1 == ${PWD_HASH_A}
    ${AndIf} $R2 == ${PWD_HASH_B}
      StrCpy $R9 1
    ${EndIf}
    Pop $R2
    Pop $R1
  FunctionEnd

  Function PwdPageCreate
    ; the elevated copy (install for all users) was already unlocked by the first one
    ${If} ${UAC_IsInnerInstance}
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "Install password" "Apna Editor is protected. Enter the password to install it."
    nsDialogs::Create 1018
    Pop $PwdDialog
    ${If} $PwdDialog == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 24u "Type the install password and press Next."
    Pop $0
    ${NSD_CreatePassword} 0 30u 100% 13u ""
    Pop $PwdInput
    ${NSD_CreateLabel} 0 50u 100% 24u ""
    Pop $PwdNote
    SetCtlColors $PwdNote FF0000 transparent
    ${NSD_SetFocus} $PwdInput
    nsDialogs::Show
  FunctionEnd

  Function PwdPageLeave
    ${NSD_GetText} $PwdInput $R0
    Call PwdCheck
    ${If} $R9 != 1
      ${NSD_SetText} $PwdNote "Wrong password. Please try again."
      ${NSD_SetText} $PwdInput ""
      ${NSD_SetFocus} $PwdInput
      Abort
    ${EndIf}
  FunctionEnd

  Page custom PwdPageCreate PwdPageLeave
!macroend

!macro customInit
  ; A silent install skips every page, so it must bring the password itself.
  ${If} ${Silent}
    ${GetParameters} $0
    ClearErrors
    ${GetOptions} $0 "/PASSWORD=" $R0
    ${If} ${Errors}
      StrCpy $R0 ""
    ${EndIf}
    Call PwdCheck
    ${If} $R9 != 1
      SetErrorLevel 5
      Quit
    ${EndIf}
  ${EndIf}
!macroend
