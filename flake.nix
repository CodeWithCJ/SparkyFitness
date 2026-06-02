{
  description = "SparkyFitness development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config = {
            android_sdk.accept_license = true;
            allowUnfree = true;
          };
        };

        nativeBuildInputs = with pkgs; [
          nodejs_24
          pnpm
          python3
          pkg-config
          gcc
          gnumake
          git
        ];

        commonTools = with pkgs; [
          bashInteractive
          coreutils
          curl
          docker-compose
          jq
          openssl
          postgresql
          vips
          watchman
          zlib
        ];
      in
      {
        devShells.default = pkgs.mkShell {
          packages = nativeBuildInputs ++ commonTools;

          env = {
            COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";
            npm_config_update_notifier = "false";
          };

          shellHook = ''
            export COREPACK_HOME="$PWD/.cache/corepack"
            export PNPM_HOME="$PWD/.cache/pnpm-home"
            export PATH="$PNPM_HOME:$PATH"

            if [ -d "$PWD/node_modules/.bin" ]; then
              export PATH="$PWD/node_modules/.bin:$PATH"
            fi

            if command -v corepack >/dev/null 2>&1; then
              corepack enable --install-directory "$PNPM_HOME" >/dev/null 2>&1 || true
            fi

            echo "SparkyFitness dev shell"
            echo "Node: $(node --version)"
            echo "pnpm: $(pnpm --version 2>/dev/null || echo 'run: corepack prepare pnpm@10.33.4 --activate')"
          '';
        };
      }
    );
}
