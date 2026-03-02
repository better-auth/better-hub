{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "aarch64-linux"
        "x86_64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpm_10
            prisma-engines_7
            openssl
          ];

          shellHook = ''
            export PRISMA_SCHEMA_ENGINE_BINARY="${pkgs.prisma-engines_7}/bin/schema-engine"
            export PRISMA_QUERY_ENGINE_LIBRARY="${pkgs.prisma-engines_7}/lib/libquery_engine.node"
            export PRISMA_QUERY_ENGINE_BINARY="${pkgs.prisma-engines_7}/bin/query-engine"
            export PRISMA_FMT_BINARY="${pkgs.prisma-engines_7}/bin/prisma-fmt"
          '';
        };
      });
    };
}
