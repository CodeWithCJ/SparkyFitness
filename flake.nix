{
  description = "SparkyFitness - self-hosted nutrition and fitness tracker";

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
        pkgs = nixpkgs.legacyPackages.${system};

        # Pin the toolchain used across the Docker images: Node 24 + pnpm 10.x.
        # pnpm 10 is required because the repo still uses the `pnpm` field in
        # package.json (overrides/patchedDependencies), which pnpm 11 ignores.
        nodejs = pkgs.nodejs_24;
        pnpm = pkgs.pnpm_10;

        # Bind the top-level pnpm fetcher/hook to the pinned pnpm 10 so both the
        # offline dep fetch and the install hook use the same version.
        fetchPnpmDeps = pkgs.fetchPnpmDeps.override { inherit pnpm; };
        pnpmConfigHook = pkgs.pnpmConfigHook.override { inherit pnpm; };

        sparkyfitness-server = pkgs.callPackage ./nix/backend.nix {
          inherit nodejs pnpm fetchPnpmDeps pnpmConfigHook;
        };

        sparkyfitness-frontend = pkgs.callPackage ./nix/frontend.nix {
          inherit nodejs pnpm fetchPnpmDeps pnpmConfigHook;
        };
      in
      {
        packages = {
          inherit sparkyfitness-server sparkyfitness-frontend;
          default = sparkyfitness-server;
        };

        devShells.default = pkgs.mkShell {
          packages = [
            nodejs
            pnpm
            pkgs.postgresql
          ];
        };

        checks = {
          inherit sparkyfitness-server sparkyfitness-frontend;
        };
      }
    )
    // {
      # System-independent outputs.
      #
      # `default` is the bare module: set `services.sparkyfitness.backendPackage`
      # and `frontendPackage` yourself.
      nixosModules.default = ./nix/module.nix;

      # Convenience module that also defaults the package options to this flake's
      # builds for the host system.
      nixosModules.sparkyfitness =
        { pkgs, ... }:
        {
          imports = [ ./nix/module.nix ];
          config.services.sparkyfitness = {
            backendPackage = self.packages.${pkgs.system}.sparkyfitness-server;
            frontendPackage = self.packages.${pkgs.system}.sparkyfitness-frontend;
          };
        };
    };
}
