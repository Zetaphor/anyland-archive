var request = require('request');
var fs = require('fs');
var glob = require("glob");

// popular, popular_rnd, newest, popularNew, popularNew_rnd, lively, favorite, mostFavorited
const targetList = 'popular_rnd';
const listQueueDelay = 120 // How long in seconds before checking the random lists to queue more areas
const downloadDelay = 60; // How long in seconds between getting each area

const headers = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'UnityPlayer/2018.1.0f2 (UnityWebRequest/1.0, libcurl/7.51.0-DEV)',
  'Accept': '*/*',
  'Accept-Encoding': 'identity',
  'X-Unity-Version': '2018.1.0f2',
  'Cookie': 's=s%3APwn3LpP0PQ6O65pYThSsCebSHO5KS9GK.ikCfG6PWLeg72N1FMN%2ByTCQjg%2B3BSoB3L1rJyznSUxU' // Change this
};

let failedAreas = [];
let downloadQueue = [];
let downloadTimer = null;
let queueReady = true;
let listQueueTimer = null
let listQueueReady = true;

function getAreaIdentifiers(areaName) {
  return new Promise((resolve, reject) => {
    const options = {
      'method': 'POST',
      'url': 'http://app.anyland.com/area/load',
      'headers': headers,
      form: { 'areaUrlName': areaName.replace(/[(\ )(')(,)(&)]/g, '') }
    };
    request(options, function (error, response) {
      if (error) reject(error);    
      const areaData = JSON.parse(response.body);
      if (typeof areaData.areaId === 'undefined' || typeof areaData.areaKey === 'undefined') reject('Undefined keys, probably area name');
      resolve({ id: areaData.areaId, key: areaData.areaKey });
    });
  });
}

function getAreaBundle(areaId, areaKey) {
  return new Promise((resolve, reject) => {
    const options = {
      'method': 'GET',
      'url': `http://anyland-tdefbdl.manyland.netdna-cdn.com/${areaId}/${areaKey}`,
      'headers': headers
    };
    request(options, function (error, response) {
      if (error) reject(error);
      resolve(response.body);
    });
  });
}

function isAreaArchived(areaName) {
  return glob.sync(`areas/${areaName}__*_*.json`).length;
}

function saveAreaBundle(areaName, areaId, areaKey, bundle) {
  return new Promise((resolve, reject) => {
    fs.writeFile(`areas/${areaName}__${areaId}_${areaKey}.json`, bundle, function(err) {
      if(err) reject(err)  
      resolve();
    });
  });
}

function logFailedArchive(areaName, areaId, areaKey, error) {
  return new Promise((resolve, reject) => {
    const logData = `${areaName}\r\nID: ${areaId}\r\nKey: ${areaKey}\r\nError: ${error}\r\n\r\n`;
    fs.appendFile(`failedDownloads.txt`, logData, function(err) {
      if(err) reject(err)  
      resolve();
    });
  });
}

function getAreaLists() {
  return new Promise((resolve, reject) => {
    const options = {
      'method': 'POST',
      'url': 'http://app.anyland.com/area/lists',
      'headers': headers,
      form: { 'subsetsize': '30', 'setsize': '300' }
    };
    request(options, function (error, response) {
      if (error) reject(error);
      resolve(JSON.parse(response.body));
    });
  });
}

function archiveArea(areaName) {
  return new Promise((resolve, reject) => {
    getAreaIdentifiers(areaName).then((values) => {
      getAreaBundle(values.id, values.key).then((bundle) => {
        saveAreaBundle(areaName, values.id, values.key, bundle).then(() => {
          resolve(`Archived ${areaName}`);
        }).catch((err) => {
          const errorMsg = `Failed to save file (${areaName}) - ${err}`;
          logFailedArchive(areaName, values.id, values.key, errorMsg);
          reject(errorMsg);
        });
      }).catch((err) => {
        const errorMsg = `Failed to get area bundle (${areaName}) - ${err}`;
        logFailedArchive(areaName, values.id, values.key, errorMsg);
        reject(`Failed to get area bundle (${areaName}) - ${err}`);
      });
    }).catch((err) => {
      const errorMsg = `Failed to get area identifiers (${areaName}) - ${err}`;
      failedAreas.push(areaName);
      logFailedArchive(areaName, 'Unobtained', 'Unobtained', errorMsg);
      reject(`Failed to get area identifiers (${areaName}) - ${err}`);
    });
  });
}

function queueList(listName) {
  return new Promise((resolve, reject) => {
    getAreaLists().then((lists) => {
      let newAreas = [];
      for (let i = 0; i < lists[listName].length; i++) {
        const area = lists[listName][i];
        if (isAreaArchived(area.name) || downloadQueue.includes(area.name) || failedAreas.includes(area.name)) continue;
        newAreas.push(area.name);
      }
      resolve(newAreas);
    }).catch((err) => {
      reject(err);
    });
  });  
}

function archiveList(listName) {
  return new Promise((resolve, reject) => {
    queueList(listName).then((newAreas) => {
      if (newAreas.length) {
        downloadQueue = newAreas.concat(downloadQueue);
        console.log(newAreas);
        resolve(`Queued ${newAreas.length} new areas for archival`);
      } else {
        resolve(`No areas in the ${listName} list need archiving`);
      }
    }).catch((err) => {
      reject(err);
    });
  });
}

function downloadQueueStep() {
  if (!downloadQueue.length || !queueReady) return;  
  queueReady = false;
  const areaName = downloadQueue.shift();
  // console.log('Archiving', areaName);
  archiveArea(areaName).then((resp) => {
    console.log(resp);
    queueReady = true;
  }).catch((error) => {
    console.log(`Failure logged for ${areaName}`);
    queueReady = true;
  });
}

function startDownloadQueue() {
  console.log('Download queue started');
  downloadTimer = setInterval(downloadQueueStep, downloadDelay * 1000);
}

function stopDownloadQueue() {
  console.log('Download queue stopped');
  clearInterval(downloadTimer);
}

function listQueueStep() {
  if (!listQueueReady) return;
  listQueueReady = false;
  archiveList(targetList).then((resp) => {
    console.log(resp);
    listQueueReady = true;
  }).catch((err) => {
    console.log(`Failed to queue ${targetList}: ${err}`);
    listQueueReady = true;
  });  
}

fs.closeSync(fs.openSync('failedDownloads.txt', 'w')); // Clear/create the failure log
startDownloadQueue();
listQueueTimer = setInterval(listQueueStep, listQueueDelay * 1000);
listQueueStep();