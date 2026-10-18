# Baselio C icon asset verification

All 20 files below are byte-identical to the supplied `baselio-app-icons-C.zip`. The supplied SHA256SUMS file was verified at the repository root and is not committed. The 16/20/24/32 px frames were copied without resampling or re-encoding. The Icon Composer scale is unchanged from the supplied archive.

| Source | SHA-256 |
| --- | --- |
| `build/icon.icns` | `2b47a7dba2844eb7ede656460b19b5828b674d3f8356132f66e1fffac7ee5b17` |
| `build/icon.ico` | `29888f2d5e69c5099ba26aeaf5231688656407ab5b6f41c5104a572ea5686451` |
| `build/icon.icon/Assets/black.svg` | `38557ce2851840f99504ba9bd8a26419b7310ded6018b136bc408f105880fbfa` |
| `build/icon.icon/icon.json` | `8baea3e8636be34b304ccc07e4ddfde1e16a1d3953a61befae1838781b05a04d` |
| `build/icon.png` | `7f29b33a16898e50ff3ddc7b90c63411eaf38e2ff317916726c0f804389fd04a` |
| `resources/icon-dark.ico` | `29888f2d5e69c5099ba26aeaf5231688656407ab5b6f41c5104a572ea5686451` |
| `resources/icon-dark.png` | `7f29b33a16898e50ff3ddc7b90c63411eaf38e2ff317916726c0f804389fd04a` |
| `resources/icon-light.ico` | `29888f2d5e69c5099ba26aeaf5231688656407ab5b6f41c5104a572ea5686451` |
| `resources/icon.png` | `7f29b33a16898e50ff3ddc7b90c63411eaf38e2ff317916726c0f804389fd04a` |
| `resources/tray-dark.ico` | `111df86c206becf2851b2a0c1415e08eabcc524be6cad4817cae1e85815889ae` |
| `resources/tray-light.ico` | `111df86c206becf2851b2a0c1415e08eabcc524be6cad4817cae1e85815889ae` |
| `resources/tray.png` | `0f5b468638e0270ec450b1ca2502ed4a63814e18c22bcdedd425a8765b5022b4` |
| `resources/tray@2x.png` | `77f99a9c264ce425becf113e38599366ceee2aea8949f5841b98f56a3f5a2f57` |
| `resources/trayTemplate.png` | `eb3c7c55a53dd760102b70ade7675c7aec8f2e58987baa44ebb6fdc06ec3c196` |
| `resources/trayTemplate@2x.png` | `28d19b605e21de15bacef1874913b769d6400b3e8e750afad5ae9ee18c339986` |
| `src/renderer/src/assets/logo-dark.png` | `ec47d74995180a7f61f23e0ff151c615aa412949f35179886fc25a9c9da6719a` |
| `src/renderer/src/assets/logo.png` | `ec47d74995180a7f61f23e0ff151c615aa412949f35179886fc25a9c9da6719a` |
| `src/renderer/web/public/dra-icon-180-v0.1.12.png` | `9cc3a2fdfe33c6326e5b61cb1aad437254a3796b5c89259dc3eaa0c727b477b2` |
| `src/renderer/web/public/dra-icon-192-v0.1.12.png` | `1aac9fe11c77d35f6860b7861b8544b3fb0b61d675943d386eec4eb67a5c2a35` |
| `src/renderer/web/public/dra-icon-512-v0.1.12.png` | `ec47d74995180a7f61f23e0ff151c615aa412949f35179886fc25a9c9da6719a` |

## Package use

| Surface | Packaging/runtime input |
| --- | --- |
| Windows installer, installed EXE/taskbar | `win.icon`, `MUI_ICON`, `MUI_UNICON`: `build/icon.ico` |
| Windows window icons | `resources/icon-light.ico` / `resources/icon-dark.ico` through existing `?asset` imports |
| Windows tray | `resources/tray-light.ico` / `resources/tray-dark.ico` |
| macOS Finder / installed app | `mac.icon: build/icon.icon`, compiled by Apple actool into the app asset catalog; source SVG and JSON hashes above |
| macOS Dock at runtime | `resources/icon.png` / `resources/icon-dark.png` through existing `?asset` imports |
| macOS menu bar | `resources/trayTemplate.png` and its `@2x` companion |
| Mounted DMG volume | `dmg.icon: build/icon.icns` |
| Web/PWA | Existing `dra-icon-{180,192,512}-v0.1.12.png` paths and manifest |

The application resources continue through the existing Electron/Vite asset pipeline and `asarUnpack: resources/**`. EXE resources and Apple asset catalogs are compiled containers and need not have the source file hashes. These are the exact packaging inputs, not a claim that packaged containers have identical hashes. Screenshots and native visual review remain Leo’s beta-installer acceptance check.

The header and startup lockup use the original supplied `baselio-horizontal.svg` (flat #285745, no tilt): `3c68ccd280b4fd52536c285912390b57cf2632a789d2510045ed7e0dcbfa2c37`.
