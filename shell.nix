{
  # LOGA3-Automation-Mobile — Dev-Shell mit Node + JDK + Android SDK/Emulator
  #
  #   nix-shell
  #   loga3-help
  #   loga3-emu          # Emulator starten
  #   loga3-android      # App auf Emulator bauen & installieren
  #
  # Erster Einstieg lädt Android SDK + Emulator + NDK (~mehrere GiB, Nix-Cache).
  # Unfree + SDK-Lizenzen: NIXPKGS_ALLOW_UNFREE=1 (oder config unten).
  #
  # Nach Emulator-Start:
  #   adb reverse tcp:8091 tcp:8091
  #   loga3-android   # braucht expo-dev-client (bereits in package.json)

  pkgs ? import <nixpkgs> {
    config.allowUnfree = true;
    config.android_sdk.accept_license = true;
  },
}:

let
  inherit (pkgs) lib;

  emulatorSupported = pkgs.stdenv.hostPlatform.isx86_64 || pkgs.stdenv.hostPlatform.isDarwin;

  # Explizite Versionen — Expo SDK 57 braucht compileSdk/buildTools 36 + NDK 27.
  sdkArgs = {
    cmdLineToolsVersion = "13.0";
    platformToolsVersion = "35.0.2";
    buildToolsVersions = [ "34.0.0" "35.0.0" "36.0.0" ];
    platformVersions = [ "34" "35" "36" ];
    includeEmulator = if emulatorSupported then true else false;
    emulatorVersion = "35.2.5";
    includeSystemImages = emulatorSupported;
    systemImageTypes = [ "google_apis" ];
    abiVersions = [ "x86_64" ];
    includeNDK = true;
    ndkVersions = [ "27.1.12297006" ];
    cmakeVersions = [ "3.22.1" ];
    includeSources = false;
    useGoogleAPIs = false;
    useGoogleTVAddOns = false;
    extraLicenses = [
      "android-sdk-preview-license"
      "android-googletv-license"
      "android-sdk-arm-dbt-license"
      "google-gdk-license"
      "intel-android-extra-license"
      "intel-android-sysimage-license"
      "mips-android-sysimage-license"
    ];
  };

  androidComposition = pkgs.androidenv.composeAndroidPackages sdkArgs;
  androidSdk = androidComposition.androidsdk;
  platformTools = androidComposition.platform-tools;

  # Fertiges AVD-Launcher-Skript (nixpkgs androidenv.emulateApp)
  androidEmulator =
    if emulatorSupported then
      pkgs.androidenv.emulateApp {
        name = "loga3-android-emulator";
        deviceName = "pixel_6";
        platformVersion = "34";
        abiVersion = "x86_64";
        systemImageType = "google_apis";
        configOptions = {
          "hw.keyboard" = "yes";
          "hw.gpu.enabled" = "yes";
          "hw.gpu.mode" = "auto";
        };
        sdkExtraArgs = sdkArgs;
      }
    else
      null;

  jdk = pkgs.jdk17;
  nodejs = pkgs.nodejs_22;

  helperBin = pkgs.writeShellScriptBin "loga3-help" ''
    cat <<'EOF'
    LOGA3 Mobile — nix-shell Hilfen
    ===============================

    Umgebung:
      ANDROID_SDK_ROOT / ANDROID_HOME  → Nix Android SDK
      JAVA_HOME                        → JDK 17
      Node                             → Node 22

    Typischer Ablauf:
      1) nix-shell
      2) loga3-emu          # Emulator im Hintergrund (braucht KVM: /dev/kvm)
      3) adb wait-for-device
      4) loga3-android      # npm install + expo run:android
         oder: npx expo start   dann im Metro „a“

    Smoke ohne Live-LOGA3:
      Holen-Tab → „Fixture konvertieren“ → Preview → Export → ICS

    Weitere Befehle:
      npm test
      npm run typecheck
      loga3-emu-fg          # Emulator Vordergrund (Logs)
      adb devices
      sdkmanager --list

    Hinweise:
      • Erster Download ~2.5 GiB (SDK + Emulator + system-image)
      • AVD-Daten unter ./.android-nix (gitignored)
      • iOS: nicht via dieser Shell — Mac/Xcode oder eas build
    EOF
  '';

  runAndroid = pkgs.writeShellScriptBin "loga3-android" ''
    set -euo pipefail
    cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
    if ! command -v adb >/dev/null; then
      echo "adb fehlt — bist du in nix-shell?" >&2
      exit 1
    fi
    if ! adb devices 2>/dev/null | awk 'NR>1 && $2=="device"{found=1} END{exit !found}'; then
      echo "Kein Gerät/Emulator. Starte zuerst: loga3-emu" >&2
      exit 1
    fi
    if [ ! -d node_modules ]; then
      echo "→ npm install"
      npm install
    fi
    echo "→ npx expo run:android"
    exec npx expo run:android "$@"
  '';

  runEmu = pkgs.writeShellScriptBin "loga3-emu" ''
    set -euo pipefail
    if [ ! -e /dev/kvm ]; then
      echo "Warnung: /dev/kvm fehlt — Emulator wird sehr langsam (oder scheitert)." >&2
    fi
    export ANDROID_USER_HOME="''${ANDROID_USER_HOME:-$PWD/.android-nix}"
    export ANDROID_AVD_HOME="''${ANDROID_AVD_HOME:-$ANDROID_USER_HOME/avd}"
    mkdir -p "$ANDROID_USER_HOME" "$ANDROID_AVD_HOME"
    echo "→ Emulator starten (ANDROID_USER_HOME=$ANDROID_USER_HOME)"
    # emulateApp liefert run-test-emulator
    if command -v run-test-emulator >/dev/null 2>&1; then
      nohup run-test-emulator >/tmp/loga3-emulator.log 2>&1 &
      echo "Emulator im Hintergrund (PID $!). Log: /tmp/loga3-emulator.log"
      echo "Warte auf adb…"
      adb wait-for-device
      adb devices
    else
      echo "run-test-emulator nicht im PATH (Plattform ohne Emulator-Support?)." >&2
      exit 1
    fi
  '';

  runEmuFg = pkgs.writeShellScriptBin "loga3-emu-fg" ''
    set -euo pipefail
    export ANDROID_USER_HOME="''${ANDROID_USER_HOME:-$PWD/.android-nix}"
    export ANDROID_AVD_HOME="''${ANDROID_AVD_HOME:-$ANDROID_USER_HOME/avd}"
    mkdir -p "$ANDROID_USER_HOME" "$ANDROID_AVD_HOME"
    exec run-test-emulator "$@"
  '';

in
pkgs.mkShell {
  name = "loga3-automation-mobile";

  packages = [
    nodejs
    jdk
    androidSdk
    platformTools
    helperBin
    runAndroid
    runEmu
    runEmuFg
    pkgs.git
    pkgs.which
    pkgs.unzip
    pkgs.wget
    pkgs.curl
    pkgs.watchman
  ]
  ++ lib.optionals (androidEmulator != null) [ androidEmulator ]
  ++ lib.optionals pkgs.stdenv.isLinux [
    pkgs.gcc
    pkgs.gnumake
  ];

  LANG = "C.UTF-8";
  LC_ALL = "C.UTF-8";
  JAVA_HOME = jdk.home;

  ANDROID_SDK_ROOT = "${androidSdk}/libexec/android-sdk";
  ANDROID_HOME = "${androidSdk}/libexec/android-sdk";
  ANDROID_NDK_ROOT = "${androidSdk}/libexec/android-sdk/ndk/27.1.12297006";

  GRADLE_OPTS = "-Dorg.gradle.daemon=false";
  # Prevent Gradle from trying to write into the Nix store SDK
  ANDROID_SDK_ROOT_RO = "1";

  shellHook = ''
    export ANDROID_USER_HOME="''${ANDROID_USER_HOME:-$PWD/.android-nix}"
    export ANDROID_AVD_HOME="''${ANDROID_AVD_HOME:-$ANDROID_USER_HOME/avd}"
    mkdir -p "$ANDROID_USER_HOME" "$ANDROID_AVD_HOME"

    printf '%s\n' "# generated by nix-shell" "sdk.dir=$ANDROID_SDK_ROOT" > local.properties

    echo ""
    echo "┌──────────────────────────────────────────────┐"
    echo "│  LOGA3 Mobile nix-shell                      │"
    echo "│  Node $(node -v) · JDK 17"
    echo "│  tip: loga3-help | loga3-emu | loga3-android │"
    echo "└──────────────────────────────────────────────┘"
    echo ""
  '';
}
