buildTools.zip
 - jre/  https://www.java.com/download/
 - fabric-installer-0.11.2 https://fabricmc.net/use/installer/
 - ForgeCLI-1.0.1.jar  https://github.com/TeamKun/ForgeCLI
 - icon-default.png

modePack (common)
  - config.json
    - type: 'MANUAL' | 'FORGE' | 'FABRIC' | 'VANILLA'
    - versionId: string
    - profileName: string
  - init.zip
  - icon.png


modePack (fabric)
  - config.json
    - type: 'FABRIC'
    - fabricMcVersion: string
    - fabricLoaderVersion: string


modePack (forge)
  - config.json 
    - type: 'FORGE'
  - forge-installer.jar


modePack (manual)
  - config.json 
    - type: 'FORGE'
    - manualMcVersion: string
  - version.json
  - libraries.zip


modePack (vanilla)
  - config.json 
    - type: 'VANILLA'
  - forge-installer.jar

