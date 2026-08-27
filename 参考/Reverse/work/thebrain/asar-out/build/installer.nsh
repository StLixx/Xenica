!macro customInit
  ; Kill legacy TheBrain (MAUI) process if running.
  ; The legacy app's executable is "TheBrain.exe" (from Deku.csproj AssemblyName).
  ; Dekutron's executable is "TheBrain 15.exe" (from electron-builder productName), so this won't affect it.
  nsExec::ExecToLog 'taskkill /f /im TheBrain.exe'
  Sleep 500

  ; Silently uninstall TheBrain MSIX if present.
  ; The MSIX identity name is "TheBrain" (from Package.appxmanifest), not "TheBrain 15".
  nsExec::ExecToLog 'powershell -NoProfile -Command "Get-AppxPackage -Name \"TheBrain\" | Remove-AppxPackage -ErrorAction SilentlyContinue"'

  ; Silently uninstall TheBrain 15 Inno Setup installer if present.
  ; The registry key uses the UpgradeCode GUID with "_is1" suffix.
  ; UninstallString includes the quoted path, e.g. "C:\Program Files\TheBrain\TheBrain 15\unins000.exe"
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\bec730ad-7505-420e-a5dd-f20dbddfac23_is1" "UninstallString"
  StrCmp $0 "" +2
    nsExec::ExecToLog '$0 /VERYSILENT'

  ; Silently uninstall TheBrain WiX/MSI if present.
  ; ProductCode varies per build, so use PowerShell to find entries by DisplayName and uninstall each.
  nsExec::ExecToLog "powershell -NoProfile -Command $\"$$entries = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { $$_.DisplayName -eq 'TheBrain' -and $$_.PSChildName -match '^\{' }; foreach($$e in $$entries) { Start-Process msiexec -ArgumentList '/x',$$e.PSChildName,'/qn' -Wait }$\""
!macroend
