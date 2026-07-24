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

  # Stable AVD home — NEVER use nixpkgs run-test-emulator (mktemp → broken 320×640).
  # Prefer pixel_6_phone (1080×2400@400 = Moto G73 class).
  runEmu = pkgs.writeShellScriptBin "loga3-emu" ''
    set -euo pipefail
    if [ ! -e /dev/kvm ]; then
      echo "Warnung: /dev/kvm fehlt — Emulator wird sehr langsam (oder scheitert)." >&2
    fi
    # Prefer pre-seeded phone AVD; fall back to project-local dir
    if [ -z "''${ANDROID_USER_HOME:-}" ]; then
      if [ -d "$HOME/.loga3-android/project-android-nix/avd/pixel_6_phone.avd" ]; then
        export ANDROID_USER_HOME="$HOME/.loga3-android/project-android-nix"
      else
        export ANDROID_USER_HOME="$PWD/.android-nix"
      fi
    fi
    export ANDROID_AVD_HOME="''${ANDROID_AVD_HOME:-$ANDROID_USER_HOME/avd}"
    mkdir -p "$ANDROID_USER_HOME" "$ANDROID_AVD_HOME"
    AVD_NAME="''${LOGA3_AVD_NAME:-pixel_6_phone}"
    if [ ! -d "$ANDROID_AVD_HOME/''${AVD_NAME}.avd" ]; then
      AVD_NAME="pixel_6"
    fi
    if [ ! -d "$ANDROID_AVD_HOME/''${AVD_NAME}.avd" ]; then
      echo "Kein AVD unter $ANDROID_AVD_HOME (erwartet pixel_6_phone oder pixel_6)." >&2
      echo "Nicht run-test-emulator nutzen — das erzeugt Temp-AVDs mit 320×640." >&2
      exit 1
    fi
    # Keep .ini path coherent
    printf '%s\n' \
      "avd.ini.encoding=UTF-8" \
      "path=$ANDROID_AVD_HOME/''${AVD_NAME}.avd" \
      "path.rel=avd/''${AVD_NAME}.avd" \
      "target=android-34" >"$ANDROID_AVD_HOME/''${AVD_NAME}.ini"
    if pgrep -f "qemu-system-x86_64.*-avd ''${AVD_NAME}" >/dev/null 2>&1; then
      echo "→ Emulator @''${AVD_NAME} läuft schon"
      adb devices || true
      exit 0
    fi
    echo "→ Emulator @''${AVD_NAME} (ANDROID_USER_HOME=$ANDROID_USER_HOME)"
    nohup "$ANDROID_SDK_ROOT/emulator/emulator" -avd "$AVD_NAME" -no-boot-anim -port 5554 \
      >/tmp/loga3-emulator.log 2>&1 &
    echo "PID $!  log=/tmp/loga3-emulator.log"
    adb wait-for-device
    adb devices
  '';

  runEmuFg = pkgs.writeShellScriptBin "loga3-emu-fg" ''
    set -euo pipefail
    if [ -z "''${ANDROID_USER_HOME:-}" ]; then
      if [ -d "$HOME/.loga3-android/project-android-nix/avd/pixel_6_phone.avd" ]; then
        export ANDROID_USER_HOME="$HOME/.loga3-android/project-android-nix"
      else
        export ANDROID_USER_HOME="$PWD/.android-nix"
      fi
    fi
    export ANDROID_AVD_HOME="''${ANDROID_AVD_HOME:-$ANDROID_USER_HOME/avd}"
    mkdir -p "$ANDROID_USER_HOME" "$ANDROID_AVD_HOME"
    AVD_NAME="''${LOGA3_AVD_NAME:-pixel_6_phone}"
    [ -d "$ANDROID_AVD_HOME/''${AVD_NAME}.avd" ] || AVD_NAME="pixel_6"
    exec "$ANDROID_SDK_ROOT/emulator/emulator" -avd "$AVD_NAME" -no-boot-anim "$@"
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

    # Bypass global aliases (e.g. PIDEA node-wrapper in ~/.bashrc) — use Nix binaries
    unalias node npm npx 2>/dev/null || true
    export PATH="${nodejs}/bin:${androidSdk}/bin:$PATH"
    hash -r 2>/dev/null || true

    printf '%s\n' "# generated by nix-shell" "sdk.dir=$ANDROID_SDK_ROOT" > local.properties
    printf '%s\n' "# generated by nix-shell" "sdk.dir=$ANDROID_SDK_ROOT" > android/local.properties

    echo ""
    echo "┌──────────────────────────────────────────────┐"
    echo "│  LOGA3 Mobile nix-shell                      │"
    echo "│  Node $(${nodejs}/bin/node -v) · JDK 17"
    echo "│  tip: loga3-help | loga3-emu | loga3-android │"
    echo "└──────────────────────────────────────────────┘"
    echo ""
  '';
}
