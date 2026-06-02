// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: user-secret;
// ============================================================
//  UNDERCOVER — Scriptable Script (Shortcut-like)
//  Version: 1.0 (Full Game, Scores, Restored Contacts)
//  Features: Game flow, victory conditions, 
//  elimination SMS, player leaderboard.
// ============================================================

// ─────────────────────────────────────────────
//  GLOBAL CONSTANTS AND DATA
// ─────────────────────────────────────────────

let DEBUG_MODE = false;

const FOLDER_NAME   = "Undercover";
const LISTS_FOLDER  = "lists";
const FILE_PLAYERS  = "players.json";
const FILE_CONFIG   = "config.json";

const BUILTIN_PAIRS = [
  { civil: "Cat",           undercover: "Tiger" },
  { civil: "Coca-Cola",     undercover: "Pepsi" },
  { civil: "Football",      undercover: "Rugby" },
  { civil: "Chocolate",     undercover: "Cocoa" },
  { civil: "Beach",         undercover: "Pool" },
  { civil: "Car",           undercover: "Motorcycle" },
  { civil: "New York",      undercover: "London" },
  { civil: "Pizza",         undercover: "Quiche" },
  { civil: "Guitar",        undercover: "Violin" },
  { civil: "Movie Theater", undercover: "Theater" },
  { civil: "Shark",         undercover: "Dolphin" },
  { civil: "Coffee",        undercover: "Tea" },
  { civil: "Skiing",        undercover: "Snowboarding" },
  { civil: "Castle",        undercover: "Manor" },
  { civil: "Sun",           undercover: "Moon" }
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
  selectedPlayerPhone: null,
  game: {
    selected: new Set(),
    nbInfil: -1,
    nbMW: 0,
    assignments: [],
    alive: [], 
    turnOrder: [], 
    round: 1,
    method: "screen",
    status: "playing",
    winnerType: null,
    mrWhiteAssign: null
  }
};

// ─────────────────────────────────────────────
//  FILE MANAGEMENT & DATA
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
    return Array.isArray(data) ? data.map(p => {
      let r = p.roles || {};
      let nRole = (d) => {
        if (typeof d === 'number') return { played: d, won: 0, lost: 0 };
        if (typeof d === 'object' && d !== null) return { played: d.played || 0, won: d.won || 0, lost: d.lost || 0 };
        return { played: 0, won: 0, lost: 0 };
      };
      return { 
        ...p, 
        score: p.score || 0,
        roles: { civil: nRole(r.civil), infiltre: nRole(r.infiltre), mrwhite: nRole(r.mrwhite) }
      };
    }) : [];
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
//  WORD LISTS
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
//  UTILITIES
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
//  SPA UI ENGINE
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
      // VIEW : MAIN MENU
      if (appState.view === "main") {
        addHeader("🕵️ UNDERCOVER", "Scriptable Edition");
        addRow("🎮", "Start a game", "Configure and start", Color.blue(), () => { appState.view = "config"; render(); });
        addRow("👥", "Manage players", `${appState.players.length} registered`, null, () => { appState.view = "players"; render(); });
        addRow("🏆", "Leaderboard & Scores", "Player statistics", Color.orange(), () => { appState.view = "stats"; render(); });
        addRow("📖", "Game Rules", "How to play and win", null, () => { appState.view = "rules"; render(); });
        addRow("⚙️", "Advanced settings", "Words, display...", null, () => { appState.prevView = "main"; appState.view = "advanced"; render(); });
        
        addRow("🐛", "Debug Mode", DEBUG_MODE ? "🟢 ON (Test)" : "⚪ OFF", DEBUG_MODE ? Color.orange() : Color.gray(), () => { DEBUG_MODE = !DEBUG_MODE; saveConfig(); render(); });
        addRow("❌", "Quit", "", Color.red(), () => resolve("quit"), true);
      }

      // ─────────────────────────────────────────────
      // VIEW : GAME RULES
      else if (appState.view === "rules") {
        addHeader("Game Rules", "How to play and win");
        addRow("◀", "Back", "", Color.blue(), () => { appState.view = "main"; render(); });

        const addSection = (title, text) => {
          let rTitle = new UITableRow();
          rTitle.isHeader = true;
          let tCell = rTitle.addText(title);
          tCell.titleFont = Font.boldSystemFont(18);
          table.addRow(rTitle);

          let rText = new UITableRow();
          let cText = rText.addText(text);
          cText.titleFont = Font.systemFont(15);
          cText.titleColor = Color.dynamic(Color.darkGray(), Color.lightGray());
          table.addRow(rText);
        };

        addSection("Objective", "Each player receives a secret role. Civilians all receive the same word. Undercovers receive a similar but slightly different word. Mr. White receives no word.\nThe goal of the Civilians is to unmask the intruders. The goal of the imposters is to survive.");
        addSection("Turn Sequence", "1. Each player takes turns saying a word related to their secret word.\n2. Once all players have spoken, a debate begins to identify the intruder.\n3. After the debate, the group votes and eliminates one participant. Their role is then revealed.");
        addSection("Roles and Strategy", "Civilian: Find the intruders without using clues that are too obvious, which would help Mr. White.\nUndercover: Blend in with the crowd by deducing the general theme of the Civilians' word.\nMr. White: You have no word. Observe, bluff, and try to discover the Civilians' word.");
        addSection("Victory Conditions", "Civilians: They eliminate all Undercovers and Mr. White.\nUndercovers: They survive until only one Civilian remains.\nMr. White: He survives until the end, OR he is eliminated but manages to guess the exact word of the Civilians.");
      }

      // ─────────────────────────────────────────────
      // VIEW : LEADERBOARD
      else if (appState.view === "stats") {
        addHeader("🏆 Leaderboard", "Cumulative scores");
        addRow("◀", "Back", "", Color.blue(), () => { appState.view = "main"; render(); });
        
        let sorted = [...appState.players].sort((a, b) => (b.score || 0) - (a.score || 0));
        if (sorted.length === 0) addRow("ℹ️", "No players", "Add players to start.", Color.gray());
        
        sorted.forEach((p, idx) => {
          let med = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "🔹";
          let pRoles = p.roles || { civil: {played:0, won:0, lost:0}, infiltre: {played:0, won:0, lost:0}, mrwhite: {played:0, won:0, lost:0} };
          let rolesStr = ` 🤠 ${pRoles.civil.played} | 🕵️ ${pRoles.infiltre.played} | 👻 ${pRoles.mrwhite.played}`;
          let sub = (p.pseudo ? `Nickname: ${p.pseudo}` : p.phone) + rolesStr;
          
          addRow(med, p.name, sub, null, () => {
            appState.selectedPlayerPhone = p.phone;
            appState.view = "player_stats";
            render();
          }, false, (p.score || 0) + " pts");
        });
      }

      // ─────────────────────────────────────────────
      // VIEW : PLAYER STATS
      else if (appState.view === "player_stats") {
        let p = appState.players.find(x => x.phone === appState.selectedPlayerPhone);
        if (!p) { appState.view = "stats"; render(); return; }
        
        let pRoles = p.roles || { civil: {played:0, won:0, lost:0}, infiltre: {played:0, won:0, lost:0}, mrwhite: {played:0, won:0, lost:0} };

        addHeader(`Manage ${p.name}`, `Global score : ${p.score || 0}`);
        addRow("◀", "Back to leaderboard", "", Color.blue(), () => { appState.view = "stats"; render(); });

        addRow("✏️", "Edit global score", "", null, async () => {
          let aScore = new Alert();
          aScore.title = "New score";
          aScore.addTextField("E.g., 10", String(p.score || 0));
          aScore.addAction("Save");
          aScore.addCancelAction("Cancel");
          if (await aScore.presentAlert() === 0) {
            let val = parseInt(aScore.textFieldValue(0));
            if (!isNaN(val)) { p.score = val; savePlayers(); render(); }
          }
        });

        let statsHeader = new UITableRow();
        statsHeader.isHeader = true; statsHeader.height = 40;
        let shCell = statsHeader.addText("Role statistics");
        shCell.titleFont = Font.boldSystemFont(20);
        table.addRow(statsHeader);

        const addRoleStatRow = (icon, roleName, roleKey) => {
           let rStats = pRoles[roleKey];
           let subtitle = `${rStats.played} played | ${rStats.won}W - ${rStats.lost}L`;
           addRow(icon, roleName, subtitle, null, async () => {
             let aEdit = new Alert();
             aEdit.title = `Stats: ${roleName}`;
             aEdit.addTextField("Played", String(rStats.played));
             aEdit.addTextField("Won", String(rStats.won));
             aEdit.addTextField("Lost", String(rStats.lost));
             aEdit.addAction("Save");
             aEdit.addCancelAction("Cancel");
             if (await aEdit.presentAlert() === 0) {
               rStats.played = parseInt(aEdit.textFieldValue(0)) || 0;
               rStats.won = parseInt(aEdit.textFieldValue(1)) || 0;
               rStats.lost = parseInt(aEdit.textFieldValue(2)) || 0;
               savePlayers(); render(); 
             }
           });
        };

        addRoleStatRow("🤠", "Civilians", "civil");
        addRoleStatRow("🕵️", "Undercovers", "infiltre");
        addRoleStatRow("👻", "Mr. White", "mrwhite");

        addRow("🗑️", "Reset all", "Resets score and stats to 0", Color.red(), async () => {
             let a = new Alert();
             a.title = "Reset " + p.name;
             a.message = "Do you want to reset the score and role statistics?";
             a.addDestructiveAction("Reset");
             a.addCancelAction("Cancel");
             if (await a.presentAlert() === 0) {
                p.score = 0;
                p.roles = { 
                  civil: {played:0, won:0, lost:0}, 
                  infiltre: {played:0, won:0, lost:0}, 
                  mrwhite: {played:0, won:0, lost:0} 
                };
                savePlayers(); render();
             }
        });
      }
      
      // ─────────────────────────────────────────────
      // VIEW : MANAGE PLAYERS
      else if (appState.view === "players") {
        addHeader("👥 Players", `${appState.players.length} player(s) ready`);
        addRow("◀", "Back", "", Color.blue(), () => { appState.view = "main"; render(); });
        addRow("📇", "Import from Contacts", "", null, () => { appState.view = "contacts"; render(); });
        addRow("✏️", "Add manually", "", null, async () => {
          let a = new Alert(); a.title = "New player";
          a.addTextField("Name", ""); a.addTextField("Phone number (+1...)", "");
          a.addAction("Add"); a.addCancelAction("Cancel");
          if (await a.presentAlert() === 0) {
            let n = a.textFieldValue(0).trim();
            let p = normalizePhone(a.textFieldValue(1).trim());
            if (n && isValidPhone(p)) {
              if (!appState.players.some(x => x.phone === p)) { appState.players.push({name: n, phone: p, score: 0, roles: { civil: {played: 0, won: 0, lost: 0}, infiltre: {played: 0, won: 0, lost: 0}, mrwhite: {played: 0, won: 0, lost: 0} }}); savePlayers(); render(); }
            }
          }
        });
        
        appState.players.forEach((p, idx) => {
          let sub = p.phone + (p.pseudo ? `  •  Nickname: ${p.pseudo}` : "");
          addRow("👤", p.name, sub, null, async () => {
            let a = new Alert(); a.title = `Manage ${p.name}`;
            a.addAction(p.pseudo ? "Edit nickname" : "Add nickname");
            a.addDestructiveAction("Delete player"); a.addCancelAction("Cancel");
            let res = await a.presentAlert();
            if (res === 0) {
              let pAlert = new Alert(); pAlert.title = `Nickname`; pAlert.addTextField("Nickname", p.pseudo || "");
              pAlert.addAction("Save"); pAlert.addCancelAction("Cancel");
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
      // VIEW : IMPORT FROM CONTACTS
      else if (appState.view === "contacts") {
        addHeader("📇 Contacts", appState.contactQuery ? `Filter: "${appState.contactQuery}"` : "Search to filter");
        addRow("◀", "Back to players", "", Color.blue(), () => { appState.view = "players"; appState.contactQuery = ""; render(); });
        
        if (!appState.contacts) {
          addRow("⏳", "Loading address book...", "Please wait...", Color.gray());
          loadAllContactsWithPhone().then(c => { appState.contacts = c; render(); });
          table.reload(); return;
        }

        if (appState.contactQuery) {
          addRow("✖️", "Clear search", "", Color.orange(), () => { appState.contactQuery = ""; render(); });
        } else {
          addRow("🔍", "Search for a contact...", "Type a name", Color.blue(), async () => {
            let a = new Alert(); a.title = "Search"; a.addTextField("Name...", "");
            a.addAction("Filter"); a.addCancelAction("Cancel");
            if (await a.presentAlert() === 0) { appState.contactQuery = a.textFieldValue(0).trim(); render(); }
          });
        }

        let q = appState.contactQuery.toLowerCase();
        let filtered = appState.contacts.filter(c => ((c.givenName||'')+' '+(c.familyName||'')).toLowerCase().includes(q));

        filtered.forEach(c => {
          let cName = ((c.givenName||"")+" "+(c.familyName||"")).trim() || "(no name)";
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
                let a = new Alert(); a.title = "Choose the number";
                c.phoneNumbers.forEach(pn => a.addAction(`${pn.label||"?"} : ${pn.value}`));
                a.addCancelAction("Cancel");
                let res = await a.presentAlert();
                if (res === -1) return;
                chosenPhone = phones[res];
              }
              appState.players.push({name: cName, phone: chosenPhone, score: 0, roles: { civil: {played: 0, won: 0, lost: 0}, infiltre: {played: 0, won: 0, lost: 0}, mrwhite: {played: 0, won: 0, lost: 0} }});
              savePlayers(); render();
            });
          }
        });
      }

      // ─────────────────────────────────────────────
      // VIEW : GAME CONFIGURATION
      else if (appState.view === "config") {
        let validPlayers = appState.players.filter(p => appState.game.selected.has(p.phone));
        let n = validPlayers.length;
        let effInfil = appState.game.nbInfil === -1 ? Math.ceil(n * 0.25) : appState.game.nbInfil;
        let effMW = appState.game.nbMW;
        let isValid = n >= 3 && (effInfil > 0 || effMW > 0) && (n - effInfil - effMW > 0);

        addHeader("🎮 New Game", `${n} selected | Civilians: ${Math.max(0, n - effInfil - effMW)} | Und: ${effInfil} | MW: ${effMW}`);
        addRow("◀", "Back to menu", "", Color.orange(), () => { appState.view = "main"; render(); });
        
        addRow("⚙️", "Game settings", "Edit words, nicknames...", null, () => {
          appState.prevView = "config"; appState.view = "advanced"; render();
        });

        addRow("🚀", "START GAME", isValid ? "Click to start" : "Select at least 3 players", isValid ? Color.blue() : Color.gray(), () => {
          if (isValid) resolve("launch");
        }, isValid);

        addRow("🕵️", `Undercovers : ${appState.game.nbInfil === -1 ? effInfil + " (Auto)" : effInfil}`, "Click to edit", null, async () => {
          let a = new Alert(); a.title = "Number of Undercovers"; a.addTextField("E.g., 1", String(effInfil));
          a.addAction("Force value"); a.addAction("Set to Auto"); a.addCancelAction("Cancel");
          let r = await a.presentAlert();
          if (r === 0) appState.game.nbInfil = parseInt(a.textFieldValue(0)) || 0;
          else if (r === 1) appState.game.nbInfil = -1;
          render();
        });

        addRow("👻", `Mr. White : ${effMW}`, "Click to edit", null, async () => {
          let a = new Alert(); a.title = "Number of Mr. White"; a.addTextField("E.g., 0", String(effMW));
          a.addAction("Confirm"); a.addCancelAction("Cancel");
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
      // VIEW : ADVANCED SETTINGS
      else if (appState.view === "advanced") {
        addHeader("⚙️ Advanced", "Game settings");
        addRow("◀", "Back", "", Color.blue(), () => { appState.view = appState.prevView; render(); });
        
        addRow("📚", "Change word list", `Active: ${sessionConfig.activeListName || "⭐ Built-in"}`, null, async () => { appState.view = "lists"; render(); });
        addRow("🏷️", "Include role in SMS", sessionConfig.showRoleInMessage ? "🟢 ON" : "⚪ OFF", null, () => { sessionConfig.showRoleInMessage = !sessionConfig.showRoleInMessage; saveConfig(); render(); });
        addRow("👤", "Include nickname in SMS", sessionConfig.showPseudoInMessage ? "🟢 ON" : "⚪ OFF", null, () => { sessionConfig.showPseudoInMessage = !sessionConfig.showPseudoInMessage; saveConfig(); render(); });
      }

      // ─────────────────────────────────────────────
      // VIEW : LIST SELECTION
      else if (appState.view === "lists") {
        addHeader("📚 Lists", "Choose the active word list");
        addRow("◀", "Back", "", Color.blue(), () => { appState.view = "advanced"; render(); });
        
        addRow("⭐", "Built-in List", "Included in the script", sessionConfig.activeListName === null ? Color.green() : null, () => {
          sessionConfig.activeListName = null; saveConfig(); appState.view = "advanced"; render();
        });
        
        getAvailableLists().forEach(list => {
           addRow("📄", list, "", sessionConfig.activeListName === list ? Color.green() : null, () => {
             sessionConfig.activeListName = list; saveConfig(); appState.view = "advanced"; render();
           });
        });
      }

      // ─────────────────────────────────────────────
      // VIEW : PLAYING (Rounds, Order, Eliminations)
      else if (appState.view === "playing") {
        if (appState.game.status === "ended") {
          addHeader(`🏁 Game Over`, "Roles are revealed");
          addRow("🏆", "Show end game summary", "And return to menu", Color.orange(), async () => {
             await showEndGameSummary();
             appState.view = "main";
             render();
          });

          let cell = new UITableRow();
          cell.isHeader = true; cell.addText("Players:").titleFont = Font.boldSystemFont(18);
          table.addRow(cell);

          appState.game.assignments.forEach(assign => {
            let name = assign.player.pseudo || assign.player.name;
            let isAlive = appState.game.alive.includes(assign.player.phone);
            let roleColor = assign.role === "Undercover" ? Color.red() : assign.role === "Civilian" ? Color.blue() : Color.dynamic(Color.darkGray(), Color.white());
            let icon = isAlive ? "🙂" : "💀";
            let row = new UITableRow();
            row.height = 55;
            let c = row.addText(`${icon} ${name}`, `${assign.role} ${assign.emoji} - Word: ${assign.word || "None"}`);
            if (!isAlive) {
               c.titleColor = Color.gray();
               c.subtitleColor = Color.gray();
            } else {
               c.subtitleColor = roleColor;
            }
            table.addRow(row);
          });
        } else {
          let aliveCount = appState.game.alive.length;
          addHeader(`🎙️ Round ${appState.game.round}`, `Alive: ${aliveCount} player(s)`);
          
          addRow("⚙️", "In-game settings", "Modify options", null, () => { appState.prevView = "playing"; appState.view = "advanced"; render(); });
          
          addRow("🛑", "Quit game", "Return to menu", Color.red(), async () => {
            let a = new Alert(); a.title = "Quit the game?"; a.message = "Progress will be lost."; a.addAction("Quit"); a.addCancelAction("Cancel");
            if (await a.presentAlert() === 0) { appState.view = "main"; render(); }
          });

          let orderCell = new UITableRow();
          orderCell.isHeader = true; orderCell.addText("Alive (click to eliminate):").titleFont = Font.boldSystemFont(18);
          table.addRow(orderCell);

          let aliveSet = new Set(appState.game.alive);

          appState.game.turnOrder.forEach((phone, idx) => {
            let assign = appState.game.assignments.find(a => a.player.phone === phone);
            let name = assign.player.pseudo || assign.player.name;
            addRow(`${idx + 1}.`, name, "Alive", null, async () => {
              let a = new Alert();
              a.title = `Eliminate ${name}?`;
              a.addAction("Eliminate");
              a.addCancelAction("Cancel");
              if (await a.presentAlert() === 0) {
                await executeElimination(phone);
                render();
              }
            }, false);
          });

          let deadPlayers = appState.game.assignments.filter(a => !aliveSet.has(a.player.phone));
          if (deadPlayers.length > 0) {
            let deadCell = new UITableRow();
            deadCell.isHeader = true; deadCell.addText("Eliminated:").titleFont = Font.boldSystemFont(18);
            table.addRow(deadCell);

            deadPlayers.forEach(assign => {
              let name = assign.player.pseudo || assign.player.name;
              let roleColor = assign.role === "Undercover" ? Color.red() : assign.role === "Civilian" ? Color.blue() : Color.dynamic(Color.darkGray(), Color.white());
              let row = new UITableRow();
              row.height = 55;
              let cell = row.addText("💀 " + name, `is eliminated (${assign.role} ${assign.emoji})`);
              cell.titleColor = Color.gray();
              cell.subtitleColor = roleColor;
              table.addRow(row);
            });
          }
        }
      }

      table.reload();
    }

    render();
    await table.present(false);
    resolve("quit");
  });
}

// ─────────────────────────────────────────────
//  GAME LOGIC: DISTRIBUTION & ELIMINATION
// ─────────────────────────────────────────────

async function launchGame() {
  let selectedPlayers = appState.players.filter(p => appState.game.selected.has(p.phone));
  let effInfil = appState.game.nbInfil === -1 ? Math.ceil(selectedPlayers.length * 0.25) : appState.game.nbInfil;
  let effMW = appState.game.nbMW;

  appState.game.assignments = assignRoles(selectedPlayers, effInfil, effMW);
  appState.game.alive = selectedPlayers.map(p => p.phone);
  appState.game.round = 1;
  appState.game.turnOrder = shuffle(appState.game.alive);
  appState.game.status = "playing";
  appState.game.winnerType = null;
  appState.game.mrWhiteAssign = null;
  
  if (DEBUG_MODE) {
    let lines = appState.game.assignments.map(a => `${a.emoji} ${a.player.name} → ${a.role} [${a.word || "—"}]`);
    let a = new Alert(); a.title = "🐛 DEBUG (No sending)"; a.message = lines.join("\n"); a.addAction("OK"); await a.presentAlert();
    appState.view = "playing";
    return;
  }
  
  let a = new Alert(); a.title = "📤 Starting";
  a.addAction("📱 Via SMS"); a.addAction("📋 On this screen");
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
    let role = mwPositions.has(i) ? "Mr. White" : infilPositions.has(i) ? "Undercover" : "Civilian";
    let word = role === "Mr. White" ? null : role === "Undercover" ? pair.undercover : pair.civil;
    let emoji = role === "Mr. White" ? "👻" : role === "Undercover" ? "🕵️" : "🙂";
    assignments.push({ player: shuffled[i], role, word, emoji, orderIndex: i + 1, isPair: pair });
  }
  return assignments;
}

// ─────────────────────────────────────────────
// ELIMINATION MANAGEMENT
// ─────────────────────────────────────────────

async function executeElimination(killedPhone) {
  let killed = appState.game.assignments.find(x => x.player.phone === killedPhone);
  if (!killed) return;
  
  appState.game.alive = appState.game.alive.filter(phone => phone !== killed.player.phone);
  
  if (killed.role === "Mr. White") {
    let mwAlert = new Alert();
    mwAlert.title = "👻 Mr. White is eliminated!";
    mwAlert.message = "Did he guess the Civilians' word?";
    mwAlert.addAction("Yes (Mr. White Wins)");
    mwAlert.addAction("No (He dies)");
    if (await mwAlert.presentAlert() === 0) {
      computeEndGameStats("mrwhite", killed);
      return;
    }
  }

  let cCount = 0, iCount = 0, mwCount = 0;
  appState.game.alive.forEach(phone => {
    let r = appState.game.assignments.find(x => x.player.phone === phone).role;
    if (r === "Civilian") cCount++;
    else if (r === "Undercover") iCount++;
    else if (r === "Mr. White") mwCount++;
  });

  if (iCount === 0 && mwCount === 0) {
    computeEndGameStats("civils");
    return;
  } else if (cCount <= 1 && (iCount > 0 || mwCount > 0)) {
    computeEndGameStats("infiltres");
    return;
  }

  appState.game.round++;
  appState.game.turnOrder = shuffle(appState.game.alive);
  
  if (!DEBUG_MODE) await notifyElimination(killed);
}

async function notifyElimination(killed) {
  let pName = killed.player.pseudo || killed.player.name;
  
  if (appState.game.method === "screen") {
    let a = new Alert(); a.title = "💀 Elimination";
    a.message = `${pName} is eliminated!\nThey were a ${killed.role} ${killed.emoji}`;
    a.addAction("OK"); await a.presentAlert();
  } else {
    let msgKilled = `💀 You have been eliminated!\nYour role was: ${killed.role} ${killed.emoji}`;
    let alert1 = new Alert(); alert1.title = `📤 Victim SMS: ${pName}`;
    alert1.addAction("Open Messages"); alert1.addCancelAction("Skip");
    if (await alert1.presentAlert() === 0) {
      Safari.openInApp(`sms:${killed.player.phone}&body=${encodeURIComponent(msgKilled)}`, false);
      await pause(1500);
    }
    
    let msgGroup = `💀 ${pName} has been eliminated!\nThey were a ${killed.role} ${killed.emoji}\nThe game continues.`;
    let phones = appState.game.alive.join(",");
    let alert2 = new Alert(); alert2.title = `📤 Group SMS (Survivors)`;
    alert2.addAction("Send to survivors"); alert2.addCancelAction("Skip");
    if (await alert2.presentAlert() === 0) {
      Safari.openInApp(`sms:${phones}&body=${encodeURIComponent(msgGroup)}`, false);
      await pause(1500);
    }
  }
}

function computeEndGameStats(winnerType, mrWhiteAssign = null) {
  appState.game.status = "ended";
  appState.game.winnerType = winnerType;
  appState.game.mrWhiteAssign = mrWhiteAssign;

  const updateStats = (phone, roleKey, isWin) => {
    let pObj = appState.players.find(p => p.phone === phone);
    if (pObj && pObj.roles) {
      if (!pObj.roles[roleKey]) pObj.roles[roleKey] = {played: 0, won: 0, lost: 0};
      pObj.roles[roleKey].played++;
      if (isWin) pObj.roles[roleKey].won++;
      else pObj.roles[roleKey].lost++;
    }
  };

  appState.game.assignments.forEach(a => {
    let roleKey = a.role === "Civilian" ? "civil" : a.role === "Undercover" ? "infiltre" : "mrwhite";
    let isWin = false;
    if (winnerType === "civils" && a.role === "Civilian") isWin = true;
    else if (winnerType === "infiltres" && (a.role === "Undercover" || a.role === "Mr. White")) isWin = true;
    else if (winnerType === "mrwhite" && a.role === "Mr. White" && a.player.phone === (mrWhiteAssign ? mrWhiteAssign.player.phone : null)) isWin = true;
    
    updateStats(a.player.phone, roleKey, isWin);
  });
  
  if (winnerType === "civils") {
    appState.game.assignments.forEach(a => { if(a.role === "Civilian") { addScore(a.player.phone, 2); } });
  } 
  else if (winnerType === "infiltres") {
    appState.game.assignments.forEach(a => { 
      if(a.role === "Undercover") { addScore(a.player.phone, 10); }
      if(a.role === "Mr. White") { addScore(a.player.phone, 6); }
    });
  } 
  else if (winnerType === "mrwhite") {
    addScore(mrWhiteAssign ? mrWhiteAssign.player.phone : null, 6);
  }

  savePlayers();
}

async function showEndGameSummary() {
  let title = "🎉 GAME OVER";
  let msg = "";
  let winnerType = appState.game.winnerType;
  let mrWhiteAssign = appState.game.mrWhiteAssign;

  if (winnerType === "civils") {
    msg = "The Civilians won! All imposters are eliminated.\n(+2 pts per Civilian)";
  } 
  else if (winnerType === "infiltres") {
    msg = "The Undercovers and Mr. White survived! Only one Civilian remains.\n(+10 pts Undercover / +6 pts Mr. White)";
  } 
  else if (winnerType === "mrwhite") {
    msg = "Mr. White guessed the word and steals the victory!\n(+6 pts for him)";
  }

  let pair = appState.game.assignments.find(a => a.isPair).isPair;
  msg += `\n\n🔑 Secret words:\nCivilian: ${pair.civil}\nUndercover: ${pair.undercover}`;

  let a = new Alert(); a.title = title; a.message = msg; a.addAction("Return to menu");
  await a.presentAlert();
}

// ─────────────────────────────────────────────
// INITIAL COMMUNICATION FUNCTIONS
// ─────────────────────────────────────────────

function buildMessage(assign) {
  let pseudoPart = (sessionConfig.showPseudoInMessage && assign.player.pseudo) ? `👤 Player: ${assign.player.pseudo}\n\n` : "";
  if (assign.role === "Mr. White") return `🕵️ UNDERCOVER 🕵️\n\n${pseudoPart}Mr. White\nYou don't have a word.\n\nBluff, stay discreet and find the secret word!`;
  let rolePart = sessionConfig.showRoleInMessage ? `${assign.emoji} Role: ${assign.role}\n\n` : "";
  return `🕵️ UNDERCOVER 🕵️\n\n${pseudoPart}${rolePart}🔑 Your word: « ${assign.word} »\n\nDo not reveal it to anyone!`;
}

async function sendInitialSMS() {
  let as = appState.game.assignments;
  for (let i = 0; i < as.length; i++) {
    let a = new Alert(); a.title = `📤 Initial SMS ${i + 1}/${as.length}`; a.message = `Recipient: ${as[i].player.name}`;
    a.addAction("Open Messages"); a.addAction("Skip"); a.addCancelAction("Stop");
    let c = await a.presentAlert();
    if (c === -1) break;
    if (c === 0) { Safari.openInApp(`sms:${as[i].player.phone}&body=${encodeURIComponent(buildMessage(as[i]))}`, false); await pause(1500); }
  }
}

async function showOnScreen() {
  let as = appState.game.assignments;
  for (let i = 0; i < as.length; i++) {
    let a = new Alert(); a.title = `${as[i].emoji} ${as[i].player.name}`;
    a.message = buildMessage(as[i]); a.addAction(`I read it ✓`); await a.presentAlert();
    if (i < as.length - 1) {
      let t = new Alert(); t.title = "🔄 Pass the phone"; t.message = `Turn of: ${as[i+1].player.name}`;
      t.addAction("Ready!"); await t.presentAlert();
    }
  }
}

// ─────────────────────────────────────────────
//  MAIN LOOP
// ─────────────────────────────────────────────

async function main() {
  ensureStorage();
  loadConfig();
  appState.players = loadPlayers();
  
  while(true) {
    let action = await startApp();
    if (action === "quit") break;
    if (action === "launch") await launchGame();
  }
}

await main();