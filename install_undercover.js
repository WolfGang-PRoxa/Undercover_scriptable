// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: cloud-download-alt;
// Script d'installation et de mise à jour pour Undercover
const scriptName = "Undercover";
// URL brute vers le fichier sur votre dépôt GitHub (branche main)
const url = "https://raw.githubusercontent.com/WolfGang-PRoxa/Undercover_scriptable/main/undercover.js";

let req = new Request(url);
let scriptCode = await req.loadString();

if (req.response.statusCode !== 200) {
  let errAlert = new Alert();
  errAlert.title = "Erreur !";
  errAlert.message = "Impossible de télécharger le script. Vérifiez votre connexion ou l'URL.";
  errAlert.addAction("OK");
  await errAlert.presentAlert();
  return;
}

// Détection de l'emplacement de sauvegarde (iCloud ou Local)
let fm = FileManager.iCloud();
try {
  fm.documentsDirectory();
} catch(e) {
  fm = FileManager.local();
}

let path = fm.joinPath(fm.documentsDirectory(), scriptName + ".js");
fm.writeString(path, scriptCode);

let alert = new Alert();
alert.title = "Installation réussie 🎉";
alert.message = "La dernière version de '" + scriptName + "' a été téléchargée et installée avec succès.";
alert.addAction("Lancer le jeu");
alert.addCancelAction("Fermer");
let response = await alert.presentAlert();

if (response === 0) {
  Safari.open("scriptable:///run?scriptName=" + encodeURIComponent(scriptName));
}