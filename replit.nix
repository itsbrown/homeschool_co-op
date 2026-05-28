{ pkgs }: {
  # Native libraries for Playwright's bundled Chromium on Linux (Replit Nix).
  # Without these, chrome-headless-shell fails with e.g. libglib-2.0.so.0 missing.
  deps = [
    pkgs.glib
    pkgs.nss
    pkgs.nspr
    pkgs.dbus
    pkgs.at-spi2-atk
    pkgs.atk
    pkgs.cups
    pkgs.expat
    pkgs.libdrm
    pkgs.mesa
    pkgs.alsa-lib
    pkgs.libxkbcommon
    pkgs.pango
    pkgs.cairo
    pkgs.gdk-pixbuf
    pkgs.fontconfig
    pkgs.freetype
    pkgs.libXcomposite
    pkgs.libXdamage
    pkgs.libXfixes
    pkgs.libXrandr
    pkgs.libXi
    pkgs.xorg.libX11
    pkgs.xorg.libXext
    pkgs.libxcb
    pkgs.libxshmfence
  ];
}
