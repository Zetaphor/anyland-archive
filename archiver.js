/**
  totalAreas: 38510,
  totalPublicAreas: 27536,
  totalSearchablePublicAreas: 27428,
*/


// var cluster = require('cluster');
// if (cluster.isMaster) {
//   cluster.fork();

//   cluster.on('exit', function(worker, code, signal) {
//     cluster.fork();
//   });
// }

// if (cluster.isWorker) {
  const DEBUG = false;

  var request = require('request');
  var fs = require('fs');
  var glob = require("glob");
  
  if (DEBUG) {
    // Reports stack trace for console methods
    // https://stackoverflow.com/questions/45395369/how-to-get-console-log-line-numbers-shown-in-nodejs#47296370
    ['log', 'warn', 'error'].forEach((methodName) => {
      const originalMethod = console[methodName];
      console[methodName] = (...args) => {
        let initiator = 'unknown place';
        try {
          throw new Error();
        } catch (e) {
          if (typeof e.stack === 'string') {
            let isFirst = true;
            for (const line of e.stack.split('\n')) {
              const matches = line.match(/^\s+at\s+(.*)/);
              if (matches) {
                if (!isFirst) { // first line - current function
                                // second line - caller (what we are looking for)
                  initiator = matches[1];
                  break;
                }
                isFirst = false;
              }
            }
          }
        }
        originalMethod.apply(console, [...args, '\n', `  at ${initiator}`]);
      };
    });  
  }
  
  // popular, popular_rnd, newest, popularNew, popularNew_rnd, lively, favorite, mostFavorited
  // visited, created, favorite
  const targetList = 'favorite';
  const listQueueDelay = 10 // How long in seconds before checking the random lists to queue more areas
  const downloadDelay = 1; // How long in seconds between getting each area
  
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'UnityPlayer/2018.1.0f2 (UnityWebRequest/1.0, libcurl/7.51.0-DEV)',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
    'X-Unity-Version': '2018.1.0f2',
    'Cookie': 's=s%3Ak1zWVtvSGwS6x3-shK-xg-cYqenEHt56.hveQ9omg%2FjXAj03vo6MMr2YMUBNsLBPhICWxnZm24aA' // Change this
  };
  
  let failedAreas = [];
  let downloadQueue = [];
  let downloadTimer = null;
  let queueReady = true;
  let listQueueTimer = null
  let listQueueReady = true;
  
  let englishDictionary = {};
  let englishDictionarySize = 0;
  
  let wordlist = [];
  // let wordlistIndex = 259;
  let wordlistIndex = 0;
  
  let timestamp = Date.now();
  
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
        if (typeof response === 'undefined' || typeof response.body === 'undefined') reject('Missing response');
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
        if (typeof response === 'undefined' || typeof response.body === 'undefined') reject('Missing response');
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
      fs.appendFile(`failedDownloads-${timestamp}.txt`, logData, function(err) {
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
          downloadQueue = downloadQueue.concat(newAreas);
          resolve(`Queued ${newAreas.length} new areas for download. Queue contains ${downloadQueue.length} areas`);
        } else {
          resolve(`No areas in the ${listName} list need archiving. Queue contains ${downloadQueue.length} areas`);
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
  
  function queueSearch(query) {
    return new Promise((resolve, reject) => {
      const options = {
        'method': 'POST',
        'url': 'http://app.anyland.com/area/search',
        'headers': headers,
        form: { 'term': query }
      };
      request(options, function (error, response) {
        if (error) reject(error);
        if (typeof response === 'undefined' || typeof response.body === 'undefined') reject('Missing body');
        const results = JSON.parse(response.body);
        if (results['error']) reject('Missing body');
        if (typeof results.areas === 'undefined' || typeof results.areas.length === 'undefined') reject('No areas found in response');
        let newAreas = [];
        for (let i = 0; i < results.areas.length; i++) {
          const area = results.areas[i];
          if (isAreaArchived(area.name) || downloadQueue.includes(area.name) || failedAreas.includes(area.name)) continue;
          newAreas.push(area.name);
        }
        downloadQueue = downloadQueue.concat(newAreas);
        if (newAreas.length) resolve(`Queued ${newAreas.length} new areas for download. Queue contains ${downloadQueue.length} areas`);
        else resolve();
      });
    });  
  }
  
  function queueSearchAlphabet() {
    for (i = 0; i < 26; i++) {
      setTimeout(function() {
        queueSearch((i+10).toString(36)).then((resp) => {
          console.log(resp);
        });
      }, 2000 * i);
    }  
  }
  
  function queueWebsiteAreaString() {
    return new Promise((resolve, reject) => {
      const areas = [] // Update this with the data from the website http://anyland.com/areas/
      let newAreas = [];
      for (let i = 0; i < areas.length; i++) {
        const area = areas[i];
        if (isAreaArchived(area.title) || downloadQueue.includes(area.title) || failedAreas.includes(area.title)) continue;
        newAreas.push(area.title);      
      }
      downloadQueue = newAreas.concat(downloadQueue);
      resolve(`Queued ${newAreas.length} new areas for download. Queue contains ${downloadQueue.length} areas`);
    });
  }
  
  function randomDictionaryWord() {
    return englishDictionary[Math.floor(Math.random() * englishDictionarySize)];
  }
  
  function startRandomSearchQueue() {
    request('https://raw.githubusercontent.com/dwyl/english-words/master/words_dictionary.json', function (error, response, body) {
      if (error || response.statusCode !== 200) {
        console.log('Failed to populate dictionary:', error);
        return;
      }
  
      englishDictionary = Object.keys(JSON.parse(body));
      englishDictionarySize = englishDictionary.length;
      console.log('Dictionary size:', englishDictionarySize);
      console.log('Starting random search queue');
      setInterval(function() {
        const word = randomDictionaryWord();
        console.log('Searching for', word);
        queueSearch(word).then((resp) => {
          if (typeof resp !== 'undefined') console.log(resp);
        });
      }, 500);
    });
  }
  
  function startWordListQueue() {
    const date_ob = new Date();
    let hours = date_ob.getHours();
    let minutes = date_ob.getMinutes();
    let seconds = date_ob.getSeconds();    
    console.log(`Current time: ${date_ob.getHours()}:${date_ob.getMinutes()}:${date_ob.getSeconds()}`);
    fs.readFile('wordlist-dash-double.txt', 'utf8', function(err, data) {
      if (err) console.log('Failed to start wordlist queue:', err);
      wordlist = data.split('\r\n');
      wordlist.sort(function (a, b) {
        return (a).localeCompare(b);
      });
      setInterval(function() {
        if (downloadQueue.length) return;
        if (wordlistIndex >= wordlist.length) {
          console.log('Dictionary empty!');
          return;
        };
        // // const randomIndex = Math.floor(Math.random() * wordlist.length);
        // // word = wordlist[randomIndex];
        const word = wordlist[wordlistIndex];              
        console.log(`Searching for #${wordlistIndex}: ${word.toLowerCase()}`);
        wordlistIndex++;
        // console.log(`Searching for #${wordlistIndex}`);        
        // queueSearch(String(wordlistIndex)).then((resp) => {
        queueSearch(word.toLowerCase()).then((resp) => {
          if (typeof resp !== 'undefined') console.log(resp);
        }).catch((err) => {
          logFailedArchive(`Search word ${wordlistIndex}: ${word}`, 'Unobtained', 'Unobtained', err);          
        });
      }, 300);    
    });
  }
  
  fs.closeSync(fs.openSync(`failedDownloads-${timestamp}.txt`, 'w')); // Clear/create the failure log
  startDownloadQueue();
  
  startWordListQueue();
  
  // startRandomSearchQueue();
  
  // listQueueTimer = setInterval(listQueueStep, listQueueDelay * 1000);
  // listQueueStep();
  
  
  // queueSearchAlphabet();
  
  // queueSearch('Zeta').then((resp) => {
  //   console.log(resp);
  // });
  
  // queueWebsiteAreaString().then((resp) => {
  //   console.log(resp);
  // })


  
// }