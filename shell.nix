{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_20
    git
    # 'serve' est une alternative moderne et maintenue
    nodePackages.serve
  ];

  shellHook = ''
    echo "--- Environnement Web Duel Fencing prêt ---"
    echo "Pour lancer le serveur, tape : serve ."
    echo "Ton site sera disponible sur http://localhost:3000"
  '';
}