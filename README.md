# Documentation Technique - Undercover (Scriptable)

Cette documentation détaille l'architecture, la gestion de l'état et les mécaniques de jeu du script `undercover.js`, conçu pour fonctionner dans l'application iOS **Scriptable**.

## 1. Architecture Globale (Single Page Application)

Le script est conçu comme une **Single Page Application (SPA)** fonctionnant à l'intérieur d'une unique interface `UITable` native à Scriptable. Au lieu d'ouvrir et de fermer continuellement des vues, le script actualise dynamiquement les lignes du tableau via une fonction `render()` récursive.

### 1.1. La boucle d'événements (`main()`)

Tout le script repose sur une boucle asynchrone infinie `while(true)` exécutée au lancement.
La fonction `startApp()` crée l'interface et retourne une `Promise` qui reste "en attente" (`pending`). Lorsque l'utilisateur effectue une action majeure (comme lancer la partie, ou quitter), la `Promise` est résolue (`resolve("action")`), ce qui indique à la boucle principale de déclencher l'action appropriée, puis de relancer `startApp()`.

### 1.2. Moteur de Rendu (`render()`)

La fonction `render()` vide entièrement le tableau (`table.removeAllRows()`) et reconstruit l'interface en fonction de la valeur de `appState.view`. Cette approche permet des transitions fluides entre les différentes "pages" (Menu Principal, Classement, Jeu en cours, Règles, etc.).

## 2. Gestion de l'État (`appState` & `sessionConfig`)

L'état de l'application est maintenu dans deux objets distincts.

### 2.1. `sessionConfig` (Persistant)
Gère les préférences globales qui s'appliquent d'une session à l'autre :
- `showRoleInMessage` / `showPseudoInMessage` : Permet d'inclure ou non des informations explicites dans les SMS distribués aux joueurs.
- `activeListName` : Détermine la liste de mots JSON actuellement utilisée (ou `null` pour la liste embarquée).

### 2.2. `appState` (Volatil & Persistant partiel)
Contient l'état dynamique de l'application :
- `view` : La vue actuelle affichée par la fonction `render()` (ex: `"main"`, `"playing"`, `"stats"`).
- `prevView` : Conserve la vue précédente pour le bouton "Retour".
- `players` : Tableau d'objets représentant les joueurs (Nom, Téléphone, Pseudo, Score, et Statistiques par Rôle). **Ce tableau est persisté sur iCloud/Local**.
- `game` : L'état d'une partie en cours. Il est réinitialisé à chaque lancement de partie via `launchGame()`.
  - `status`: `"playing"` ou `"ended"`.
  - `alive`, `turnOrder`, `assignments` : Informations dynamiques sur les rôles et les morts.

## 3. Stockage et Sauvegarde (`FileManager`)

Les données sont persistées en JSON via le `FileManager` (sur **iCloud** par défaut pour la synchronisation inter-appareils, sinon en **Local**).
Les données sauvegardées incluent :
- `players.json` : Profils des joueurs, scores cumulés (2 points par victoire Civil, etc.) et statistiques (`played`, `won`, `lost` par rôle).
- `config.json` : État du mode Debug et configuration de session (`sessionConfig`).
- Dossier `lists/` : Contient les éventuelles listes externes ajoutées par l'utilisateur.
- `*_used_words.json` : Garde une trace des paires de mots déjà jouées dans une liste pour éviter les répétitions.

## 4. Logique du Jeu

### 4.1. Lancement (`launchGame()`)
Lorsqu'une partie est lancée :
1. Le script détermine le nombre d'infiltrés (calcul automatique via 25% arrondi au supérieur, ou manuel) et de Mister White.
2. `assignRoles()` mélange les joueurs sélectionnés et distribue les rôles (Mister White, puis Infiltrés, puis Civils restants).
3. Une paire de mots est tirée au sort (`pickPair()`) et assignée aux Civils et Infiltrés.
4. La distribution se fait soit par lecture à l'écran (`showOnScreen`), soit par envoi de SMS automatiques (`sendInitialSMS`).

### 4.2. Éliminations (`executeElimination(phone)`)
Exécutée lorsqu'un joueur est éliminé depuis l'interface :
1. Retrait du joueur de la liste `appState.game.alive`.
2. Si le joueur est **Mister White**, un prompt spécial s'ouvre : a-t-il deviné le mot des Civils ? S'il répond "Oui", la victoire immédiate lui est accordée.
3. Le script recompte les joueurs restants :
   - Plus aucun Infiltré/Mr White = **Victoire Civils**.
   - 1 seul Civil restant = **Victoire Infiltrés/Mr White**.
4. Si la partie continue, une notification SMS de l'élimination est préparée pour informer le mort de son rôle, et informer les survivants via un message de groupe.

### 4.3. Fin de Partie (`computeEndGameStats()`)
Si une condition de victoire est remplie :
1. Le statut passe à `status: "ended"`. L'interface ne se ferme pas, mais révèle tous les rôles en direct.
2. Les statistiques (Victoires/Défaites) de chaque rôle sont incrémentées pour chaque joueur de la partie.
3. Les points de victoire globale sont distribués (`+2` Civils, `+10` Infiltré, `+6` Mr White).
4. `savePlayers()` enregistre la base de données de manière asynchrone.

## 5. Personnalisation (Mots externes)

Le script permet l'import de listes JSON. Celles-ci doivent être déposées dans le dossier iCloud `Scriptable/Undercover/lists/` sous la forme :
```json
[
  { "civil": "Mot A", "undercover": "Mot B" },
  { "civil": "Chien", "undercover": "Chat" }
]
```
L'interface de "Configuration avancée" permet alors de sélectionner ces listes à la volée sans toucher au code source.