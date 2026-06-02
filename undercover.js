// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: user-secret;
// ============================================================
//  UNDERCOVER — Script Scriptable complet (Façon Raccourcis)
//  Version : 5.1 (Jeu Complet, Scores, Contacts Restaurés)
//  Fonctionnalités : Déroulement de partie, conditions de 
//  victoire, SMS d'élimination, classement des joueurs.
// ============================================================

// ─────────────────────────────────────────────
//  CONSTANTES GLOBALES ET DONNÉES
// ─────────────────────────────────────────────

let DEBUG_MODE = false;

const FOLDER_NAME   = "Undercover";
const LISTS_FOLDER  = "lists";
const FILE_PLAYERS  = "players.json";
const FILE_CONFIG   = "config.json";

const BUILTIN_PAIRS = [
  { civil: "Chat",        undercover: "Tigre" },
  { civil: "Coca-Cola",   undercover: "Pepsi" },
  { civil: "Football",    undercover: "Rugby" },
  { civil: "Chocolat",    undercover: "Cacao" },
  { civil: "Plage",       undercover: "Piscine" },
  { civil: "Voiture",     undercover: "Moto" },
  { civil: "Paris",       undercover: "Lyon" },
  { civil: "Pizza",       undercover: "Quiche" },
  { civil: "Guitare",     undercover: "Violon" },
  { civil: "Cinéma",      undercover: "Théâtre" },
  { civil: "Requin",      undercover: "Dauphin" },
  { civil: "Café",        undercover: "Thé" },
  { civil: "Ski",         undercover: "Snowboard" },
  { civil: "Château",     undercover: "Manoir" },
  { civil: "Soleil",      undercover: "Lune" }
];

let sessionConfig = {
  showRoleInMessage: false,
  showPseudoInMessage: false,
  activeListName: null,
};

let appState = {
  view: "main",
  prevView: "main", 
  players: [],
  contacts: null,
  contactQuery: "",
  game: {
    selected: new Set(),
    nbInfil: -1,
    nbMW: 0,
    assignments: [],
    alive: [], 
    turnOrder: [], 
    round: 1,
    method: "screen" 
  }
};

// ─────────────────────────────────────────────
//  GESTION FICHIERS & DONNÉES
// ─────────────────────────────────────────────

function getFM() { try { return FileManager.iCloud(); } catch (e) { return FileManager.local(); } }
function rootPath() { return getFM().joinPath(getFM().documentsDirectory(), FOLDER_NAME); }
function listsPath() { return getFM().joinPath(rootPath(), LISTS_FOLDER); }
function playersPath() { return getFM().joinPath(rootPath(), FILE_PLAYERS); }
function configPath() { return getFM().joinPath(rootPath(), FILE_CONFIG); }
function usedWordsPath(listName) { return getFM().joinPath(listsPath(), listName + "__used_words.json"); }

function ensureStorage() {
  const fm = getFM();
  if (!fm.fileExists(rootPath())) fm.createDirectory(rootPath(), true);
  if (!fm.fileExists(listsPath())) fm.createDirectory(listsPath(), true);
  if (!fm.fileExists(playersPath())) writeJSON(playersPath(), []);
  if (!fm.fileExists(configPath())) saveConfig();
}

function writeJSON(path, data) { getFM().writeString(path, JSON.stringify(data, null, 2)); }

function saveConfig() { writeJSON(configPath(), { DEBUG_MODE, sessionConfig }); }

function loadConfig() {
  const fm = getFM(), path = configPath();
  try {
    if (fm.isFileStoredIniCloud && fm.isFileStoredIniCloud(path)) fm.downloadFileFromiCloud(path);
    const data = JSON.parse(fm.readString(path));
    if (data.DEBUG_MODE !== undefined) DEBUG_MODE = data.DEBUG_MODE;
    if (data.sessionConfig) sessionConfig = { ...sessionConfig, ...data.sessionConfig };
  } catch (e) {}
}

function loadPlayers() {
  const fm = getFM(), path = playersPath();
  try {
    if (fm.isFileStoredIniCloud && fm.isFileStoredIniCloud(path)) fm.downloadFileFromiCloud(path);
    const data = JSON.parse(fm.readString(path));
    return Array.isArray(data) ? data.map(p => ({ ...p, score: p.score || 0 })) : [];
  } catch (e) { return []; }
}

function savePlayers() { writeJSON(playersPath(), appState.players); }

function addScore(phone, points) {
  let player = appState.players.find(p => p.phone === phone);
  if (player) {
    player.score = (player.score || 0) + points;
    savePlayers();
  }
}

// ─────────────────────────────────────────────
//  LISTES DE MOTS
// ─────────────────────────────────────────────

function getAvailableLists() {
  const fm = getFM(), lp = listsPath(), names = [];
  try { fm.listContents(lp).forEach(f => { if (f.endsWith(".json") && !f.includes("__used_words")) names.push(f.replace(".json", "")); }); } catch (e) {}
  return names;
}

function loadExternalList(listName) {
  const fm = getFM(), path = getFM().joinPath(listsPath(), listName + ".json");
  try {
    if (fm.isFileStoredIniCloud && fm.isFileStoredIniCloud(path)) fm.downloadFileFromiCloud(path);
    const data = JSON.parse(fm.readString(path));
    return Array.isArray(data) ? data.filter(p => p.civil && p.undercover) : null;
  } catch (e) { return null; }
}

function loadUsedWords(listName) {
  const fm = getFM(), path = usedWordsPath(listName);
  try {
    if (!fm.fileExists(path)) return [];
    if (fm.isFileStoredIniCloud && fm.isFileStoredIniCloud(path)) fm.downloadFileFromiCloud(path);
    const data = JSON.parse(fm.readString(path));
    return Array.isArray(data) ? data : [];
  } catch (e) { return []; }
}

function pickPair(listName) {
  let allPairs = !listName ? BUILTIN_PAIRS : loadExternalList(listName);
  if (!allPairs || allPairs.length === 0) allPairs = BUILTIN_PAIRS;
  if (!listName) return allPairs[Math.floor(Math.random() * allPairs.length)];

  const used = loadUsedWords(listName);
  const usedSet = new Set(used.map(u => u.civil + "|" + u.undercover));
  let remaining = allPairs.filter(p => !usedSet.has(p.civil + "|" + p.undercover));

  if (remaining.length === 0) {
    writeJSON(usedWordsPath(listName), []);
    remaining = allPairs;
  }

  const chosen = remaining[Math.floor(Math.random() * remaining.length)];
  const usedUpdated = loadUsedWords(listName);
  usedUpdated.push({ civil: chosen.civil, undercover: chosen.undercover, date: new Date().toISOString() });
  writeJSON(usedWordsPath(listName), usedUpdated);
  return chosen;
}

// ─────────────────────────────────────────────
//  UTILITAIRES
// ─────────────────────────────────────────────

function normalizePhone(phone) {
  let p = String(phone).replace(/[\s\-\.\(\)]/g, "");
  if (p.startsWith("0") && p.length === 10) p = "+33" + p.slice(1);
  return p;
}
function isValidPhone(p) { return /^\+\d{8,15}$/.test(p); }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pause(ms) { return new Promise(r => Timer.schedule(ms, false, r)); }

async function loadAllContactsWithPhone() {
  const allContainers = await ContactsContainer.all();
  let allContacts = [];
  for (const container of allContainers) {
    try { allContacts = allContacts.concat(await Contact.all([container])); } catch (e) {}
  }
  const seen = new Set();
  const contacts = allContacts.filter(c => {
    if (seen.has(c.identifier)) return false;
    seen.add(c.identifier);
    return true;
  });
  contacts.sort((a, b) => ((a.givenName||"")+" "+(a.familyName||"")).localeCompare((b.givenName||"")+" "+(b.familyName||"")));
  return contacts.filter(c => c.phoneNumbers && c.phoneNumbers.length > 0);
}

// ─────────────────────────────────────────────
//  MOTEUR UI SINGLE PAGE (SPA)
// ─────────────────────────────────────────────

async function startApp() {
  return new Promise(async (resolve) => {
    let table = new UITable();
    table.showSeparators = true;
    
    function render() {
      table.removeAllRows();

      const addHeader = (title, subtitle) => {
        let row = new UITableRow();
        row.isHeader = true;
        row.height = 80;
        let cell = row.addText(title, subtitle || "");
        cell.titleFont = Font.boldSystemFont(30);
        if (subtitle) cell.subtitleFont = Font.systemFont(14);
        table.addRow(row);
      };

      const addRow = (icon, title, subtitle, color, onClick, dismiss = false, rightText = null) => {
        let row = new UITableRow();
        row.height = 55;
        row.dismissOnSelect = dismiss;
        let cell = row.addText(icon + " " + title, subtitle || "");
        cell.titleFont = Font.systemFont(18);
        if (subtitle) cell.subtitleFont = Font.systemFont(13);
        if (color) { cell.titleColor = color; cell.subtitleColor = color; }
        if (rightText) {
          let rCell = row.addText(rightText);
          rCell.rightAligned();
          rCell.titleColor = Color.orange();
          rCell.titleFont = Font.boldSystemFont(18);
        }
        if (onClick) row.onSelect = onClick;
        table.addRow(row);
        return row;
      };

      // ─────────────────────────────────────────────
      // VUE : MENU PRINCIPAL
      if (appState.view === "main") {
        addHeader("🕵️ UNDERCOVER", "Scriptable Edition");
        addRow("🎮", "Lancer une partie", "Configurer et démarrer", Color.blue(), () => { appState.view = "config"; render(); });
        addRow("👥", "Gérer les joueurs", `${appState.players.length} enregistré(s)`, null, () => { appState.view = "players"; render(); });
        addRow("🏆", "Classement & Scores", "Statistiques des joueurs", Color.orange(), () => { appState.view = "stats"; render(); });
        addRow("⚙️", "Configuration avancée", "Mots, affichage...", null, () => { appState.prevView = "main"; appState.view = "advanced"; render(); });
        
        addRow("🐛", "Mode Debug", DEBUG_MODE ? "🟢 ON (Test)" : "⚪ OFF", DEBUG_MODE ? Color.orange() : Color.gray(), () => { DEBUG_MODE = !DEBUG_MODE; saveConfig(); render(); });
        addRow("❌", "Quitter", "", Color.red(), () => resolve("quit"), true);
      }

      // ─────────────────────────────────────────────
      // VUE : CLASSEMENT
      else if (appState.view === "stats") {
        addHeader("🏆 Classement", "Scores cumulés");
        addRow("◀", "Retour", "", Color.blue(), () => { appState.view = "main"; render(); });
        
        let sorted = [...appState.players].sort((a, b) => (b.score || 0) - (a.score || 0));
        if (sorted.length === 0) addRow("ℹ️", "Aucun joueur", "Ajoutez des joueurs pour commencer.", Color.gray());
        
        sorted.forEach((p, idx) => {
          let med = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "🔹";
          let pRoles = p.roles || { civil: 0, infiltre: 0, mrwhite: 0 };
          let rolesStr = ` 🤠 ${pRoles.civil} | 🕵️ ${pRoles.infiltre} | 👻 ${pRoles.mrwhite}`;
          let sub = (p.pseudo ? `Pseudo: ${p.pseudo}` : p.phone) + rolesStr;
          
          addRow(med, p.name, sub, null, async () => {
            let a = new Alert();
            a.title = `Gérer ${p.name}`;
            a.message = `Score : ${p.score || 0}\nCivils: ${pRoles.civil} | Infiltrés: ${pRoles.infiltre} | Mr. White: ${pRoles.mrwhite}`;
            a.addAction("Modifier le score");
            a.addDestructiveAction("Réinitialiser le score");
            a.addCancelAction("Annuler");
            let res = await a.presentAlert();
            
            if (res === 0) {
              let aScore = new Alert();
              aScore.title = "Nouveau score";
              aScore.addTextField("Ex: 10", String(p.score || 0));
              aScore.addAction("Enregistrer");
              aScore.addCancelAction("Annuler");
              
              if (await aScore.presentAlert() === 0) {
                let val = parseInt(aScore.textFieldValue(0));
                if (!isNaN(val)) {
                  let pIdx = appState.players.findIndex(x => x.phone === p.phone);
                  if (pIdx >= 0) { appState.players[pIdx].score = val; savePlayers(); render(); }
                }
              }
            } else if (res === 1) {
              let pIdx = appState.players.findIndex(x => x.phone === p.phone);
              if (pIdx >= 0) { appState.players[pIdx].score = 0; savePlayers(); render(); }
            }
          }, false, (p.score || 0) + " pts");
        });
      }
      
      // ─────────────────────────────────────────────
      // VUE : GESTION DES JOUEURS
      else if (appState.view === "players") {
        addHeader("👥 Joueurs", `${appState.players.length} joueur(s) prêt(s)`);
        addRow("◀", "Retour", "", Color.blue(), () => { appState.view = "main"; render(); });
        addRow("📇", "Importer depuis Contacts", "", null, () => { appState.view = "contacts"; render(); });
        addRow("✏️", "Ajouter manuellement", "", null, async () => {
          let a = new Alert(); a.title = "Nouveau joueur";
          a.addTextField("Nom", ""); a.addTextField("Numéro (+33...)", "");
          a.addAction("Ajouter"); a.addCancelAction("Annuler");
          if (await a.presentAlert() === 0) {
            let n = a.textFieldValue(0).trim();
            let p = normalizePhone(a.textFieldValue(1).trim());
            if (n && isValidPhone(p)) {
              if (!appState.players.some(x => x.phone === p)) { appState.players.push({name: n, phone: p, score: 0, roles: { civil: 0, infiltre: 0, mrwhite: 0 }}); savePlayers(); render(); }
            }
          }
        });
        
        appState.players.forEach((p, idx) => {
          let sub = p.phone + (p.pseudo ? `  •  Pseudo : ${p.pseudo}` : "");
          addRow("👤", p.name, sub, null, async () => {
            let a = new Alert(); a.title = `Gérer ${p.name}`;
            a.addAction(p.pseudo ? "Modifier le pseudo" : "Ajouter un pseudo");
            a.addDestructiveAction("Supprimer le joueur"); a.addCancelAction("Annuler");
            let res = await a.presentAlert();
            if (res === 0) {
              let pAlert = new Alert(); pAlert.title = `Pseudo`; pAlert.addTextField("Pseudo", p.pseudo || "");
              pAlert.addAction("Enregistrer"); pAlert.addCancelAction("Annuler");
              if (await pAlert.presentAlert() === 0) {
                let val = pAlert.textFieldValue(0).trim();
                appState.players[idx].pseudo = val !== "" ? val : undefined; savePlayers(); render();
              }
            } else if (res === 1) {
              appState.players.splice(idx, 1); savePlayers(); render();
            }
          });
        });
      }

      // ─────────────────────────────────────────────
      // VUE : IMPORT DE CONTACTS (TEMPS RÉEL)
      else if (appState.view === "contacts") {
        addHeader("📇 Contacts", appState.contactQuery ? `Filtre: "${appState.contactQuery}"` : "Recherchez pour filtrer");
        addRow("◀", "Retour aux joueurs", "", Color.blue(), () => { appState.view = "players"; appState.contactQuery = ""; render(); });
        
        if (!appState.contacts) {
          addRow("⏳", "Chargement du carnet d'adresses...", "Patientez...", Color.gray());
          loadAllContactsWithPhone().then(c => { appState.contacts = c; render(); });
          table.reload(); return;
        }

        if (appState.contactQuery) {
          addRow("✖️", "Effacer la recherche", "", Color.orange(), () => { appState.contactQuery = ""; render(); });
        } else {
          addRow("🔍", "Rechercher un contact...", "Taper un nom", Color.blue(), async () => {
            let a = new Alert(); a.title = "Recherche"; a.addTextField("Nom...", "");
            a.addAction("Filtrer"); a.addCancelAction("Annuler");
            if (await a.presentAlert() === 0) { appState.contactQuery = a.textFieldValue(0).trim(); render(); }
          });
        }

        let q = appState.contactQuery.toLowerCase();
        let filtered = appState.contacts.filter(c => ((c.givenName||'')+' '+(c.familyName||'')).toLowerCase().includes(q));

        filtered.forEach(c => {
          let cName = ((c.givenName||"")+" "+(c.familyName||"")).trim() || "(sans nom)";
          let phones = c.phoneNumbers.map(pn => normalizePhone(pn.value));
          let existingIdx = appState.players.findIndex(p => phones.includes(p.phone));

          if (existingIdx >= 0) {
            addRow("✅", cName, appState.players[existingIdx].phone, Color.green(), () => {
              appState.players.splice(existingIdx, 1);
              savePlayers(); render();
            });
          } else {
            addRow("➕", cName, c.phoneNumbers[0].value, null, async () => {
              let chosenPhone = phones[0];
              if (phones.length > 1) {
                let a = new Alert(); a.title = "Choisir le numéro";
                c.phoneNumbers.forEach(pn => a.addAction(`${pn.label||"?"} : ${pn.value}`));
                a.addCancelAction("Annuler");
                let res = await a.presentAlert();
                if (res === -1) return;
                chosenPhone = phones[res];
              }
              // Ajout du joueur avec un score initialisé à 0
              appState.players.push({name: cName, phone: chosenPhone, score: 0});
              savePlayers(); render();
            });
          }
        });
      }

      // ─────────────────────────────────────────────
      // VUE : CONFIGURATION DE LA PARTIE
      else if (appState.view === "config") {
        let validPlayers = appState.players.filter(p => appState.game.selected.has(p.phone));
        let n = validPlayers.length;
        let effInfil = appState.game.nbInfil === -1 ? Math.ceil(n * 0.25) : appState.game.nbInfil;
        let effMW = appState.game.nbMW;
        let isValid = n >= 3 && (effInfil > 0 || effMW > 0) && (n - effInfil - effMW > 0);

        addHeader("🎮 Nouvelle Partie", `${n} sélectionnés | Civils: ${Math.max(0, n - effInfil - effMW)} | Inf: ${effInfil} | MW: ${effMW}`);
        addRow("◀", "Retour au menu", "", Color.orange(), () => { appState.view = "main"; render(); });
        
        addRow("⚙️", "Réglages de la partie", "Modifier mots, pseudos...", null, () => {
          appState.prevView = "config"; appState.view = "advanced"; render();
        });

        addRow("🚀", "LANCER LA PARTIE", isValid ? "Cliquez pour démarrer" : "Sélectionnez 3 joueurs min.", isValid ? Color.blue() : Color.gray(), () => {
          if (isValid) resolve("launch");
        }, isValid);

        addRow("🕵️", `Infiltrés : ${appState.game.nbInfil === -1 ? effInfil + " (Auto)" : effInfil}`, "Cliquez pour modifier", null, async () => {
          let a = new Alert(); a.title = "Nombre d'infiltrés"; a.addTextField("Ex: 1", String(effInfil));
          a.addAction("Forcer la valeur"); a.addAction("Remettre en Auto"); a.addCancelAction("Annuler");
          let r = await a.presentAlert();
          if (r === 0) appState.game.nbInfil = parseInt(a.textFieldValue(0)) || 0;
          else if (r === 1) appState.game.nbInfil = -1;
          render();
        });

        addRow("👻", `Mister White : ${effMW}`, "Cliquez pour modifier", null, async () => {
          let a = new Alert(); a.title = "Nombre de Mister White"; a.addTextField("Ex: 0", String(effMW));
          a.addAction("Valider"); a.addCancelAction("Annuler");
          if (await a.presentAlert() === 0) appState.game.nbMW = parseInt(a.textFieldValue(0)) || 0;
          render();
        });

        appState.players.forEach(p => {
          let isSel = appState.game.selected.has(p.phone);
          let sub = p.pseudo ? `${p.phone} (${p.pseudo})` : p.phone;
          addRow(isSel ? "✅" : "⭕️", p.name, sub, isSel ? Color.green() : null, () => {
            isSel ? appState.game.selected.delete(p.phone) : appState.game.selected.add(p.phone); render();
          });
        });
      }

      // ─────────────────────────────────────────────
      // VUE : CONFIGURATION AVANCÉE
      else if (appState.view === "advanced") {
        addHeader("⚙️ Avancé", "Réglages du jeu");
        addRow("◀", "Retour", "", Color.blue(), () => { appState.view = appState.prevView; render(); });
        
        addRow("📚", "Changer de liste de mots", `Active : ${sessionConfig.activeListName || "⭐ Embarquée"}`, null, async () => { appState.view = "lists"; render(); });
        addRow("🏷️", "Inclure rôle dans le SMS", sessionConfig.showRoleInMessage ? "🟢 ON" : "⚪ OFF", null, () => { sessionConfig.showRoleInMessage = !sessionConfig.showRoleInMessage; saveConfig(); render(); });
        addRow("👤", "Inclure pseudo dans le SMS", sessionConfig.showPseudoInMessage ? "🟢 ON" : "⚪ OFF", null, () => { sessionConfig.showPseudoInMessage = !sessionConfig.showPseudoInMessage; saveConfig(); render(); });
      }

      // ─────────────────────────────────────────────
      // VUE : SÉLECTION DE LISTE
      else if (appState.view === "lists") {
        addHeader("📚 Listes", "Choisissez la liste de mots active");
        addRow("◀", "Retour", "", Color.blue(), () => { appState.view = "advanced"; render(); });
        
        addRow("⭐", "Liste Embarquée", "Incluse dans le script", sessionConfig.activeListName === null ? Color.green() : null, () => {
          sessionConfig.activeListName = null; saveConfig(); appState.view = "advanced"; render();
        });
        
        getAvailableLists().forEach(list => {
           addRow("📄", list, "", sessionConfig.activeListName === list ? Color.green() : null, () => {
             sessionConfig.activeListName = list; saveConfig(); appState.view = "advanced"; render();
           });
        });
      }

      // ─────────────────────────────────────────────
      // VUE : EN JEU (Manches, Ordre, Éliminations)
      else if (appState.view === "playing") {
        let aliveCount = appState.game.alive.length;
        addHeader(`🎙️ Manche ${appState.game.round}`, `Vivants : ${aliveCount} joueur(s)`);
        
        addRow("⚙️", "Réglages en jeu", "Modifier les options", null, () => { appState.prevView = "playing"; appState.view = "advanced"; render(); });
        
        addRow("💀", "ÉLIMINER UN JOUEUR", "Fin de manche", Color.red(), async () => {
          resolve("eliminate");
        }, true);

        let orderCell = new UITableRow();
        orderCell.isHeader = true; orderCell.addText("Ordre de parole :").titleFont = Font.boldSystemFont(18);
        table.addRow(orderCell);

        appState.game.turnOrder.forEach((phone, idx) => {
          let assign = appState.game.assignments.find(a => a.player.phone === phone);
          let name = assign.player.pseudo || assign.player.name;
          addRow(`${idx + 1}.`, name, "", null, null, false);
        });
      }

      table.reload();
    }

    render();
    await table.present(false);
  });
}

// ─────────────────────────────────────────────
//  LOGIQUE DU JEU : DISTRIBUTION & ÉLIMINATION
// ─────────────────────────────────────────────

async function launchGame() {
  let selectedPlayers = appState.players.filter(p => appState.game.selected.has(p.phone));
  let effInfil = appState.game.nbInfil === -1 ? Math.ceil(selectedPlayers.length * 0.25) : appState.game.nbInfil;
  let effMW = appState.game.nbMW;

  appState.game.assignments = assignRoles(selectedPlayers, effInfil, effMW);
  appState.game.alive = selectedPlayers.map(p => p.phone);
  appState.game.round = 1;
  appState.game.turnOrder = shuffle(appState.game.alive);
  
  if (DEBUG_MODE) {
    let lines = appState.game.assignments.map(a => `${a.emoji} ${a.player.name} → ${a.role} [${a.word || "—"}]`);
    let a = new Alert(); a.title = "🐛 DEBUG (Pas d'envoi)"; a.message = lines.join("\n"); a.addAction("OK"); await a.presentAlert();
    appState.view = "playing";
    return;
  }
  
  let a = new Alert(); a.title = "📤 Démarrage";
  a.addAction("📱 Via SMS"); a.addAction("📋 Sur cet écran");
  let c = await a.presentAlert();
  appState.game.method = c === 0 ? "sms" : "screen";
  
  if (c === 0) await sendInitialSMS();
  else await showOnScreen();
  
  appState.view = "playing";
}

function assignRoles(players, nbInfil, nbMW) {
  const n = players.length;
  const pair = pickPair(sessionConfig.activeListName);
  const shuffled = shuffle(players);
  
  const validMWSlots = []; for (let i = Math.floor(n / 2); i < n; i++) validMWSlots.push(i);
  const mwPositions = new Set();
  
  if (nbMW >= validMWSlots.length) { for (let i = n - nbMW; i < n; i++) mwPositions.add(i < 0 ? 0 : i); } 
  else { const slotPool = shuffle(validMWSlots); for (let i = 0; i < nbMW; i++) mwPositions.add(slotPool[i]); }

  const remaining = []; for (let i = 0; i < n; i++) { if (!mwPositions.has(i)) remaining.push(i); }
  const infilPositions = new Set(shuffle(remaining).slice(0, nbInfil));

  const assignments = [];
  for (let i = 0; i < n; i++) {
    let role = mwPositions.has(i) ? "Mister White" : infilPositions.has(i) ? "Infiltré" : "Civil";
    let word = role === "Mister White" ? null : role === "Infiltré" ? pair.undercover : pair.civil;
    let emoji = role === "Mister White" ? "👻" : role === "Infiltré" ? "🕵️" : "🙂";
    assignments.push({ player: shuffled[i], role, word, emoji, orderIndex: i + 1, isPair: pair });
  }
  return assignments;
}

// ─────────────────────────────────────────────
// GESTION DES ÉLIMINATIONS
// ─────────────────────────────────────────────

async function handleElimination() {
  let a = new Alert();
  a.title = "💀 Qui est éliminé ?";
  
  let aliveAssigns = appState.game.alive.map(phone => appState.game.assignments.find(x => x.player.phone === phone));
  aliveAssigns.forEach(assign => a.addAction(assign.player.pseudo || assign.player.name));
  a.addCancelAction("Annuler");
  
  let res = await a.presentAlert();
  if (res === -1) { appState.view = "playing"; return; }
  
  let killed = aliveAssigns[res];
  
  appState.game.alive = appState.game.alive.filter(phone => phone !== killed.player.phone);
  
  if (killed.role === "Mister White") {
    let mwAlert = new Alert();
    mwAlert.title = "👻 Mr. White est éliminé !";
    mwAlert.message = "A-t-il deviné le mot des Civils ?";
    mwAlert.addAction("Oui (Victoire Mr. White)");
    mwAlert.addAction("Non (Il meurt)");
    if (await mwAlert.presentAlert() === 0) {
      await processEndGame("mrwhite", killed);
      return;
    }
  }

  let cCount = 0, iCount = 0, mwCount = 0;
  appState.game.alive.forEach(phone => {
    let r = appState.game.assignments.find(x => x.player.phone === phone).role;
    if (r === "Civil") cCount++;
    else if (r === "Infiltré") iCount++;
    else if (r === "Mister White") mwCount++;
  });

  if (iCount === 0 && mwCount === 0) {
    await processEndGame("civils");
    return;
  } else if (cCount <= 1 && (iCount > 0 || mwCount > 0)) {
    await processEndGame("infiltres");
    return;
  }

  appState.game.round++;
  appState.game.turnOrder = shuffle(appState.game.alive);
  
  if (!DEBUG_MODE) await notifyElimination(killed);
  appState.view = "playing";
}

async function notifyElimination(killed) {
  let pName = killed.player.pseudo || killed.player.name;
  
  if (appState.game.method === "screen") {
    let a = new Alert(); a.title = "💀 Élimination";
    a.message = `${pName} est éliminé(e) !\nC'était un(e) ${killed.role} ${killed.emoji}`;
    a.addAction("OK"); await a.presentAlert();
  } else {
    let msgKilled = `💀 Tu as été éliminé(e) !\nTon rôle était : ${killed.role} ${killed.emoji}`;
    let alert1 = new Alert(); alert1.title = `📤 SMS Victime : ${pName}`;
    alert1.addAction("Ouvrir Messages"); alert1.addCancelAction("Passer");
    if (await alert1.presentAlert() === 0) {
      Safari.openInApp(`sms:${killed.player.phone}&body=${encodeURIComponent(msgKilled)}`, false);
      await pause(1500);
    }
    
    let msgGroup = `💀 ${pName} a été éliminé(e) !\nC'était un(e) ${killed.role} ${killed.emoji}\nLa partie continue.`;
    let phones = appState.game.alive.join(",");
    let alert2 = new Alert(); alert2.title = `📤 SMS de groupe (Survivants)`;
    alert2.addAction("Envoyer aux survivants"); alert2.addCancelAction("Passer");
    if (await alert2.presentAlert() === 0) {
      Safari.openInApp(`sms:${phones}&body=${encodeURIComponent(msgGroup)}`, false);
      await pause(1500);
    }
  }
}

async function processEndGame(winnerType, mrWhiteAssign = null) {
  let title = "🎉 FIN DE PARTIE";
  let msg = "";
  
  if (winnerType === "civils") {
    msg = "Les Civils ont gagné ! Tous les imposteurs sont éliminés.\n(+2 pts par Civil)";
    appState.game.assignments.forEach(a => { if(a.role === "Civil") addScore(a.player.phone, 2); });
  } 
  else if (winnerType === "infiltres") {
    msg = "Les Infiltrés et Mr. White ont survécu ! Il ne reste qu'un Civil.\n(+10 pts Undercover / +6 pts Mr.White)";
    appState.game.assignments.forEach(a => { 
      if(a.role === "Infiltré") addScore(a.player.phone, 10);
      if(a.role === "Mister White") addScore(a.player.phone, 6);
    });
  } 
  else if (winnerType === "mrwhite") {
    msg = "Mr. White a trouvé le mot et vole la victoire !\n(+6 pts pour lui)";
    addScore(mrWhiteAssign.player.phone, 6);
  }

  let pair = appState.game.assignments.find(a => a.isPair).isPair;
  msg += `\n\n🔑 Mots secrets :\nCivil : ${pair.civil}\nUndercover : ${pair.undercover}`;

  let a = new Alert(); a.title = title; a.message = msg; a.addAction("Retour au menu");
  await a.presentAlert();
  
  appState.view = "main";
}

// ─────────────────────────────────────────────
// FONCTIONS DE COMMUNICATION INITIALES
// ─────────────────────────────────────────────

function buildMessage(assign) {
  let pseudoPart = (sessionConfig.showPseudoInMessage && assign.player.pseudo) ? `👤 Joueur : ${assign.player.pseudo}\n\n` : "";
  if (assign.role === "Mister White") return `🕵️ UNDERCOVER 🕵️\n\n${pseudoPart}Mister White\nVous n'avez pas de mot.\n\nBluffez, restez discret(e) et trouvez le mot secret !`;
  let rolePart = sessionConfig.showRoleInMessage ? `${assign.emoji} Rôle : ${assign.role}\n\n` : "";
  return `🕵️ UNDERCOVER 🕵️\n\n${pseudoPart}${rolePart}🔑 Votre mot : « ${assign.word} »\n\nNe le révélez à personne !`;
}

async function sendInitialSMS() {
  let as = appState.game.assignments;
  for (let i = 0; i < as.length; i++) {
    let a = new Alert(); a.title = `📤 SMS initial ${i + 1}/${as.length}`; a.message = `Destinataire : ${as[i].player.name}`;
    a.addAction("Ouvrir Messages"); a.addAction("Passer"); a.addCancelAction("Arrêter");
    let c = await a.presentAlert();
    if (c === -1) break;
    if (c === 0) { Safari.openInApp(`sms:${as[i].player.phone}&body=${encodeURIComponent(buildMessage(as[i]))}`, false); await pause(1500); }
  }
}

async function showOnScreen() {
  let as = appState.game.assignments;
  for (let i = 0; i < as.length; i++) {
    let a = new Alert(); a.title = `${as[i].emoji} ${as[i].player.name}`;
    a.message = buildMessage(as[i]); a.addAction(`J'ai lu ✓`); await a.presentAlert();
    if (i < as.length - 1) {
      let t = new Alert(); t.title = "🔄 Passez le téléphone"; t.message = `Au tour de : ${as[i+1].player.name}`;
      t.addAction("Prêt !"); await t.presentAlert();
    }
  }
}

// ─────────────────────────────────────────────
//  BOUCLE PRINCIPALE
// ─────────────────────────────────────────────

async function main() {
  ensureStorage();
  loadConfig();
  appState.players = loadPlayers();
  
  while(true) {
    let action = await startApp();
    if (action === "quit") break;
    if (action === "launch") await launchGame();
    if (action === "eliminate") await handleElimination();
  }
}

// ─────────────────────────────────────────────
await main();

async function main() {
  ensureStorage();
  loadConfig();
  appState.players = loadPlayers();
  
  while(true) {
    let action = await startApp();
    if (action === "quit") break;
    if (action === "launch") await launchGame();
    if (action === "eliminate") await handleElimination();
  }
}

await main();