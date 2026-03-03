{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nixpkgs-bun.url = "github:NixOS/nixpkgs/f665af0cdb70ed27e1bd8f9fdfecaf451260fc55";
  };

  outputs =
    { nixpkgs, nixpkgs-bun }:
    let
      systems = [
        "aarch64-linux"
        "x86_64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      forEachSystem =
        f:
        nixpkgs.lib.genAttrs systems (
          system:
          f {
            pkgs = nixpkgs.legacyPackages.${system};
            bun = nixpkgs-bun.legacyPackages.${system}.bun;
          }
        );
    in
    {
      devShells = forEachSystem (
        { pkgs, bun }:
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.openssl
              pkgs.nodejs_22
              pkgs.prisma-engines_7
              bun
            ];

            shellHook = ''
              export PRISMA_SCHEMA_ENGINE_BINARY="${pkgs.prisma-engines_7}/bin/schema-engine"
              export PRISMA_QUERY_ENGINE_LIBRARY="${pkgs.prisma-engines_7}/lib/libquery_engine.node"
              export PRISMA_QUERY_ENGINE_BINARY="${pkgs.prisma-engines_7}/bin/query-engine"
              export PRISMA_FMT_BINARY="${pkgs.prisma-engines_7}/bin/prisma-fmt"
            '';
          };
        }
      );
    };
}
