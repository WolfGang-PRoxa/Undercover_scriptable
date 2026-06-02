# Undercover (Scriptable) - Technical Documentation

[English](#english) | [Français](#francais)

---

## <a name="english"></a> English

This documentation details the architecture, state management, and game mechanics of the `undercover.js` (and `undercover_en.js`) script, designed to run within the iOS **Scriptable** app.

### 1. Overall Architecture (Single Page Application)

The script is designed as a **Single Page Application (SPA)** running inside a single native Scriptable `UITable` interface. Instead of continuously opening and closing views, the script dynamically updates the table rows via a recursive `render()` function.

#### 1.1. The Event Loop (`main()`)

The entire script relies on an infinite asynchronous `while(true)` loop executed at launch.
The `startApp()` function creates the interface and returns a `Promise` that remains `pending`. When the user performs a major action (like starting the game or quitting), the `Promise` is resolved (`resolve("action")`), which tells the main loop to trigger the appropriate action, and then restart `startApp()`.

#### 1.2. Render Engine (`render()`)

The `render()` function completely clears the table (`table.removeAllRows()`) and rebuilds the interface based on the value of `appState.view`. This approach allows for smooth transitions between different "pages" (Main Menu, Leaderboard, Game in Progress, Rules, etc.).

### 2. State Management (`appState` & `sessionConfig`)

The application state is maintained in two distinct objects.

#### 2.1. `sessionConfig` (Persistent)
Manages global preferences that apply from one session to the next:
- `showRoleInMessage` / `showPseudoInMessage`: Allows including or excluding explicit information in the SMS distributed to players.
- `activeListName`: Determines the JSON word list currently used (or `null` for the built-in list).

#### 2.2. `appState` (Volatile & Partially Persistent)
Contains the dynamic state of the application:
- `view`: The current view displayed by the `render()` function (e.g., `"main"`, `"playing"`, `"stats"`).
- `prevView`: Keeps the previous view for the "Back" button.
- `players`: Array of objects representing the players (Name, Phone, Nickname, Score, and Role Statistics). **This array is persisted on iCloud/Local**.
- `game`: The state of an ongoing game. It is reset at each game launch via `launchGame()`.
  - `status`: `"playing"` or `"ended"`.
  - `alive`, `turnOrder`, `assignments`: Dynamic information about roles and deaths.

### 3. Storage and Saving (`FileManager`)

Data is persisted in JSON via the `FileManager` (on **iCloud** by default for cross-device synchronization, otherwise **Local**).
Saved data includes:
- `players.json`: Player profiles, cumulative scores (2 points per Civilian win, etc.), and stats (`played`, `won`, `lost` by role).
- `config.json`: Debug mode state and session configuration (`sessionConfig`).
- `lists/` folder: Contains any external lists added by the user.
- `*_used_words.json`: Keeps track of word pairs already played in a list to avoid repetition.

### 4. Game Logic

#### 4.1. Launch (`launchGame()`)
When a game is launched:
1. The script determines the number of Undercovers (automatic calculation via 25% rounded up, or manual) and Mr. White.
2. `assignRoles()` shuffles the selected players and distributes the roles (Mr. White, then Undercovers, then remaining Civilians).
3. A pair of words is drawn at random (`pickPair()`) and assigned to the Civilians and Undercovers.
4. Distribution is done either by reading on the screen (`showOnScreen`) or by sending automatic SMS (`sendInitialSMS`).

#### 4.2. Eliminations (`executeElimination(phone)`)
Executed when a player is eliminated from the interface:
1. Removal of the player from the `appState.game.alive` list.
2. If the player is **Mr. White**, a special prompt opens: did he guess the Civilians' word? If he answers "Yes", immediate victory is granted to him.
3. The script recounts the remaining players:
   - No more Undercovers/Mr. White = **Civilians Victory**.
   - Only 1 Civilian remaining = **Undercovers/Mr. White Victory**.
4. If the game continues, an SMS notification of the elimination is prepared to inform the dead person of their role, and inform the survivors via a group message.

#### 4.3. Game Over (`computeEndGameStats()`)
If a victory condition is met:
1. The status changes to `status: "ended"`. The interface does not close but reveals all roles live.
2. The statistics (Wins/Losses) of each role are incremented for each player in the game.
3. Global victory points are distributed (`+2` Civilians, `+10` Undercover, `+6` Mr. White).
4. `savePlayers()` saves the database asynchronously.

### 5. Customization (External Words)

The script allows the import of JSON lists. These must be placed in the iCloud folder `Scriptable/Undercover/lists/` in the format:
```json
[
  { "civil": "Word A", "undercover": "Word B" },
  { "civil": "Dog", "undercover": "Cat" }
]
```
The "Advanced settings" interface then allows selecting these lists on the fly without touching the source code.

---

## <a name="francais"></a> Français

Cette documentation détaille l'architecture, la gestion de l'état et les mécaniques de jeu du script `undercover.js`, conçu pour fonctionner dans l'application iOS **Scriptable**.

### 1. Architecture Globale (Single Page Application)

Le script est conçu comme une **Single Page Application (SPA)** fonctionnant à l'intérieur d'une unique interface `UITable` native à Scriptable. Au lieu d'ouvrir et de fermer continuellement des vues, le script actualise dynamiquement les lignes du tableau via une fonction `render()` récursive.

#### 1.1. La boucle d'événements (`main()`)

Tout le script repose sur une boucle asynchrone infinie `while(true)` exécutée au lancement.
La fonction `startApp()` crée l'interface et retourne une `Promise` qui reste "en attente" (`pending`). Lorsque l'utilisateur effectue une action majeure (comme lancer la partie, ou quitter), la `Promise` est résolue (`resolve("action")`), ce qui indique à la boucle principale de déclencher l'action appropriée, puis de relancer `startApp()`.

#### 1.2. Moteur de Rendu (`render()`)

La fonction `render()` vide entièrement le tableau (`table.removeAllRows()`) et reconstruit l'interface en fonction de la valeur de `appState.view`. Cette approche permet des transitions fluides entre les différentes "pages" (Menu Principal, Classement, Jeu en cours, Règles, etc.).

### 2. Gestion de l'État (`appState` & `sessionConfig`)

L'état de l'application est maintenu dans deux objets distincts.

#### 2.1. `sessionConfig` (Persistant)
Gère les préférences globales qui s'appliquent d'une session à l'autre :
- `showRoleInMessage` / `showPseudoInMessage` : Permet d'inclure ou non des informations explicites dans les SMS distribués aux joueurs.
- `activeListName` : Détermine la liste de mots JSON actuellement utilisée (ou `null` pour la liste embarquée).

#### 2.2. `appState` (Volatil & Persistant partiel)
Contient l'état dynamique de l'application :
- `view` : La vue actuelle affichée par la fonction `render()` (ex: `"main"`, `"playing"`, `"stats"`).
- `prevView` : Conserve la vue précédente pour le bouton "Retour".
- `players` : Tableau d'objets représentant les joueurs (Nom, Téléphone, Pseudo, Score, et Statistiques par Rôle). **Ce tableau est persisté sur iCloud/Local**.
- `game` : L'état d'une partie en cours. Il est réinitialisé à chaque lancement de partie via `launchGame()`.
  - `status`: `"playing"` ou `"ended"`.
  - `alive`, `turnOrder`, `assignments` : Informations dynamiques sur les rôles et les morts.

### 3. Stockage et Sauvegarde (`FileManager`)

Les données sont persistées en JSON via le `FileManager` (sur **iCloud** par défaut pour la synchronisation inter-appareils, sinon en **Local**).
Les données sauvegardées incluent :
- `players.json` : Profils des joueurs, scores cumulés (2 points par victoire Civil, etc.) et statistiques (`played`, `won`, `lost` par rôle).
- `config.json` : État du mode Debug et configuration de session (`sessionConfig`).
- Dossier `lists/` : Contient les éventuelles listes externes ajoutées par l'utilisateur.
- `*_used_words.json` : Garde une trace des paires de mots déjà jouées dans une liste pour éviter les répétitions.

### 4. Logique du Jeu

#### 4.1. Lancement (`launchGame()`)
Lorsqu'une partie est lancée :
1. Le script détermine le nombre d'infiltrés (calcul automatique via 25% arrondi au supérieur, ou manuel) et de Mister White.
2. `assignRoles()` mélange les joueurs sélectionnés et distribue les rôles (Mister White, puis Infiltrés, puis Civils restants).
3. Une paire de mots est tirée au sort (`pickPair()`) et assignée aux Civils et Infiltrés.
4. La distribution se fait soit par lecture à l'écran (`showOnScreen`), soit par envoi de SMS automatiques (`sendInitialSMS`).

#### 4.2. Éliminations (`executeElimination(phone)`)
Exécutée lorsqu'un joueur est éliminé depuis l'interface :
1. Retrait du joueur de la liste `appState.game.alive`.
2. Si le joueur est **Mister White**, un prompt spécial s'ouvre : a-t-il deviné le mot des Civils ? S'il répond "Oui", la victoire immédiate lui est accordée.
3. Le script recompte les joueurs restants :
   - Plus aucun Infiltré/Mr White = **Victoire Civils**.
   - 1 seul Civil restant = **Victoire Infiltrés/Mr White**.
4. Si la partie continue, une notification SMS de l'élimination est préparée pour informer le mort de son rôle, et informer les survivants via un message de groupe.

#### 4.3. Fin de Partie (`computeEndGameStats()`)
Si une condition de victoire est remplie :
1. Le statut passe à `status: "ended"`. L'interface ne se ferme pas, mais révèle tous les rôles en direct.
2. Les statistiques (Victoires/Défaites) de chaque rôle sont incrémentées pour chaque joueur de la partie.
3. Les points de victoire globale sont distribués (`+2` Civils, `+10` Infiltré, `+6` Mr White).
4. `savePlayers()` enregistre la base de données de manière asynchrone.

### 5. Personnalisation (Mots externes)

Le script permet l'import de listes JSON. Celles-ci doivent être déposées dans le dossier iCloud `Scriptable/Undercover/lists/` sous la forme :
```json
[
  [ "Mot A", "Mot B", "Mot C", "Mot D" ],
  [ "Chien", "Chat", "Loup", "Renard" ]
]
```
L'interface de "Configuration avancée" permet alors de sélectionner ces listes à la volée sans toucher au code source. Note : l'ancien format par paire (`[{ "civil": "...", "undercover": "..." }]`) est toujours pris en charge par rétrocompatibilité.