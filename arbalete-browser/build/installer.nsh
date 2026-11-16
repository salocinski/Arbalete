; Navigateur par défaut (ARB-80) : déclare Arbalète à Windows pour http et https (par utilisateur, HKCU, comme l'installeur).
; Windows ne laisse pas une application se choisir elle-même : l'utilisateur la sélectionne ensuite dans les paramètres
; « Applications par défaut ». Un lien d'une autre application lance `Arbalete.exe -- "<adresse>"` (adressesLancees, index.ts).
!macro customInstall
  WriteRegStr HKCU "Software\Classes\ArbaleteURL" "" "Arbalète URL"
  WriteRegStr HKCU "Software\Classes\ArbaleteURL" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\ArbaleteURL\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\ArbaleteURL\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" -- "%1"'
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Arbalete" "" "Arbalète"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Arbalete\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Arbalete\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Arbalete\Capabilities" "ApplicationName" "Arbalète"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Arbalete\Capabilities" "ApplicationDescription" "Navigateur Web pour Windows"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Arbalete\Capabilities\URLAssociations" "http" "ArbaleteURL"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Arbalete\Capabilities\URLAssociations" "https" "ArbaleteURL"
  WriteRegStr HKCU "Software\RegisteredApplications" "Arbalete" "Software\Clients\StartMenuInternet\Arbalete\Capabilities"
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\RegisteredApplications" "Arbalete"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Arbalete"
  DeleteRegKey HKCU "Software\Classes\ArbaleteURL"
!macroend
