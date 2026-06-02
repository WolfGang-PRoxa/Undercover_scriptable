// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: cloud-download-alt;
// Installation and update script for Undercover
const scriptName = "Undercover_en";
// Raw URL to the file on your GitHub repository (main branch)
const url = "https://raw.githubusercontent.com/WolfGang-PRoxa/Undercover_scriptable/main/undercover_en.js";

let req = new Request(url);
let scriptCode = await req.loadString();

if (req.response.statusCode !== 200) {
  let errAlert = new Alert();
  errAlert.title = "Error!";
  errAlert.message = "Unable to download the script. Check your connection or the URL.";
  errAlert.addAction("OK");
  await errAlert.presentAlert();
  return;
}

// Detect save location (iCloud or Local)
let fm = FileManager.iCloud();
try {
  fm.documentsDirectory();
} catch(e) {
  fm = FileManager.local();
}

let path = fm.joinPath(fm.documentsDirectory(), scriptName + ".js");
fm.writeString(path, scriptCode);

let alert = new Alert();
alert.title = "Installation successful 🎉";
alert.message = "The latest version of '" + scriptName + "' has been successfully downloaded and installed.";
alert.addAction("Launch game 🚀");
alert.addCancelAction("Close");
let response = await alert.presentAlert();

if (response === 0) {
  Safari.open("scriptable:///run?scriptName=" + encodeURIComponent(scriptName));
}