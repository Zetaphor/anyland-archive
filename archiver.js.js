var request = require('request');
var fs = require('fs');

const headers = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'UnityPlayer/2018.1.0f2 (UnityWebRequest/1.0, libcurl/7.51.0-DEV)',
  'Accept': '*/*',
  'Accept-Encoding': 'identity',
  'X-Unity-Version': '2018.1.0f2',
  'Cookie': 's=s%3AiSb3CFuBuwQLPqPoBmUBZo_FJCS5dCnp.%2FYjtsEXdPpIASM9%2FbcTlXiBY3IOYQiVufwp1JiBLYYw' // Change this
};

function getAreaIdentifiers(areaName) {
  return new Promise((resolve, reject) => {
    var options = {
      'method': 'POST',
      'url': 'http://app.anyland.com/area/load',
      'headers': headers,
      form: { 'areaUrlName': areaName }
    };
    request(options, function (error, response) {
      if (error) reject(error);    
      const areaData = JSON.parse(response.body);
      resolve({ id: areaData.areaId, key: areaData.areaKey });
    });
  });
}

function getAreaBundle(areaId, areaKey) {
  return new Promise((resolve, reject) => {
    var options = {
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

function saveAreaBundle(name, bundle) {
  return new Promise((resolve, reject) => {
    fs.writeFile(`${name}.json`, bundle, function(err) {
      if(err) reject(err)  
      resolve();
    });
  });
}

let areaName = 'buildtown';
getAreaIdentifiers(areaName).then((values) => {
  getAreaBundle(values.id, values.key).then((bundle) => {
    saveAreaBundle(areaName, bundle).then(() => {
      console.log(`Saved ${areaName}.json`);
    }).catch((err) => {
      console.error('Failed to save file:', err);
    });
  }).catch((err) => {
    console.error('Failed to get area bundle:', err);
  });
}).catch((err) => {
  console.error('Failed to get area identifiers:', err);
});