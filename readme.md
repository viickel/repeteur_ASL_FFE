# ⚔️ Repeteur d'escrime Sabre Laser 
https://viickel.github.io/repeteur_ASL_FFE/

## 📋 Description du Projet

Outil d'arbitrage au sabre laser réactif conçu pour la gestion du temps, des scores et des sanctions lors de matchs de sabre laser. Interface optimisée pour le tactile (tablette/smartphone) et contrôlable au clavier pour une précision maximale en tournoi.

## ✨ Fonctionnalités Clés

* **Chronomètre:** Fonctionnalités START/PAUSE/RÉGLAGE (personnalisé ou 30s pour la morts subit, il faut cliquer sur le chrono pour afficher les fonction).
* **Scores:** Attribution de points rapides (+1, +3, +5).
* **Système de Sanctions:** Gestion des fautes avec progression de cartons et affichage visuel de l'état des pénalités pour chaque combattant.
* **Élimination (Carton Noir):** Déclenche une alerte de fin de match et d'élimination.
* **Interface Réactive:** Design optimisé pour les écrans de bureau et les smartphones.

## 📖 Notice d'utilisation

Demo video : https://youtu.be/BAAN3_9lc74

Voici comment utiliser le système lors d'une compétition :
1. Configuration du match

    Temps: Cliquez sur le chronomètre pour afficher les réglages. Utilisez "30s" pour la mort subite ou le bouton de temps personnalisé pour définir la durée du match (ex: 03:00).

    Scores: Cliquez sur les boutons de points pour incrémenter le score du combattant (Rouge à gauche, Vert à droite).

2. Gestion des sanctions (Fautes)

Cliquez sur les boutons de groupes de fautes (Grp 1 à 4). Le système calcule automatiquement la couleur du carton selon la progression :

 - Groupe 1: Carton blanc -> Carton jaune.

 - Groupe 2: Carton jaune -> Carton rouge.

 - Groupe 3: Carton rouge -> Carton noir (Élimination).

 - Groupe 4: Carton noir immédiat.

3. Diffusion sur écran TV (Mode Cast)

Pour projeter le score sur un écran distant :

 - Côté Arbitre (Tablette) : Cliquez sur le bouton "📺 CAST TV" puis, sur "📡 Activer le mode CONTRÔLEUR" Un code unique de type ASL-XXXX s'affiche.

 - Côté TV (PC relié) : Ouvrez la même page, saisissez le code ASL-XXXX affiché sur la tablette et cliquez sur "TV".

 - Synchronisation : Une fois connecté, les scores, le chrono et les cartons se mettent à jour en temps réel sur la TV.


 ## ⌨️ Racourci clavier
Il est possible de piloter l'application avec des raccourci clavier, voici la liste des racourci : 
 
 
 ### Points — Combattant Rouge (gauche)
A ou Q → +1 pt (Zone A)
Z ou W → +3 pts (Zone B)
E → +5 pts (Zone C)

### Points — Combattant Vert (droite)
Shift + A/Q → +1 pt
Shift + Z/W → +3 pts
Shift + E → +5 pts

### Cartons — Combattant Rouge (gauche)
B → Faute Groupe 1
J → Faute Groupe 2
R → Faute Groupe 3
N → Faute Groupe 4

### Cartons — Combattant Vert (droite)
Alt + B → Faute Groupe 1
Alt + J → Faute Groupe 2
Alt + R → Faute Groupe 3
Alt + N → Faute Groupe 4

### Commandes globales
Espace → Start / Pause chrono
Ctrl + Z → Annuler dernière action
F5 → Réinitialiser le match

## 🤝 Contribution

Les contributions sont les bienvenues ! Si vous avez des suggestions de fonctionnalités, des corrections de bugs, ou des idées pour améliorer le design, n'hésitez pas à ouvrir une *issue* ou soumettre une *pull request*.

## 📄 Licence

Ce projet est distribué sous licence MIT.
