; Xito Truck Hub — instalación en un clic. El asistente de configuración está dentro de la propia app.

!macro XthCopyPlugin GAMEDIR
  ${If} ${FileExists} "${GAMEDIR}\bin\win_x64\*.*"
    CreateDirectory "${GAMEDIR}\bin\win_x64\plugins"
    CopyFiles /SILENT "$INSTDIR\resources\plugin\win64\scs-telemetry.dll" "${GAMEDIR}\bin\win_x64\plugins"
  ${EndIf}
!macroend

!macro customInstall
  ; Permite que el móvil se conecte por la Wi-Fi (en cualquier tipo de red: privada o pública)
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Xito Truck Hub"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Xito Truck Hub" dir=in action=allow program="$INSTDIR\Xito Truck Hub.exe" enable=yes profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Xito Truck Hub" dir=in action=allow protocol=TCP localport=25580 enable=yes profile=any'
  ; Plugin de telemetría en la biblioteca principal de Steam (el resto lo revisa la app)
  ReadRegStr $2 HKCU "Software\Valve\Steam" "SteamPath"
  ${If} $2 == ""
    ReadRegStr $2 HKLM "SOFTWARE\WOW6432Node\Valve\Steam" "InstallPath"
  ${EndIf}
  ${If} $2 != ""
    !insertmacro XthCopyPlugin "$2\steamapps\common\Euro Truck Simulator 2"
    !insertmacro XthCopyPlugin "$2\steamapps\common\American Truck Simulator"
  ${EndIf}
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Xito Truck Hub"'
  ${IfNot} ${Silent}
  ${AndIfNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "¿Quieres borrar también tu historial de entregas, estadísticas y ajustes?$\r$\n$\r$\nSi eliges No, se conservarán para cuando vuelvas a instalar Xito Truck Hub." IDNO xth_keep
      SetShellVarContext current
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
      SetShellVarContext all
    xth_keep:
  ${EndIf}
!macroend
