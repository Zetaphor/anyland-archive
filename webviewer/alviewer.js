import * as THREE from "https://threejs.org/build/three.module.js"
import {OBJLoader} from "https://threejs.org/examples/jsm/loaders/OBJLoader.js"
import anime from "/lib/anime.es.js"

var debugLog = document.getElementById("debug")

var init = async function(){}

function setInit(func){
  init = func
}

var shapes = {}

var shapesURL = "https://www.dropbox.com/s/tg7jm1xu4bfpnbw/baseShapes.zip?dl=0"
shapesURL = "https://dl.dropboxusercontent.com" + shapesURL.split("https://www.dropbox.com")[1]

var thingsZip

// var thingsURL = "https://www.dropbox.com/s/1u9uyqbe8fxgtyd/things.zip?dl=0"
var thingsURL = "https://www.dropbox.com/s/12g614coyi43k7d/thingdefs.zip?dl=0"
thingsURL = "https://dl.dropboxusercontent.com" + thingsURL.split("https://www.dropbox.com")[1]


function loadFile(uri,callback){
  var loadfile = new XMLHttpRequest();
  loadfile.open("GET", uri);
  loadfile.responseType = "arraybuffer";
  loadfile.send();
  
  loadfile.onload = callback
  loadfile.onerror = function() {
    alert("Failed to load "+uri+"! Are CORS requests enabled on the server?")
  }
}

loadFile(shapesURL, async function(file){
  
  await JSZip.loadAsync(file.target.response)
  .then(async function(zip) {
    
    for(var i = 1; i <= 251; i++ ){
      // console.log(i)
      let file = zip.file("baseShapes/"+i+".obj")
      
      if (file){
        await file.async("base64").then(function (base64) {
          loadShape("data:application/object;base64,"+base64,i)
          debugLog.innerHTML = "Loading shape assets... " + Math.ceil((i/251)*100) + "%"
        })
      }
      
    }
    
    
    loadFile(thingsURL, function(file){
      JSZip.loadAsync(file.target.response)
      .then(function(zip) {
        
          thingsZip = zip
        
          debugLog.innerHTML = "Shapes Loaded!"
        
          init()
        
      });
    })
    
    
  });
})


var OBJloader = new OBJLoader();

function loadShape(uri,id){

  OBJloader.load(uri,function ( object ) {
    
    // object.children[0].castShadow = true
    // object.children[0].receiveShadow = true
    
    shapes["s"+id] = object.children[0]

    }
  );

}

function degToRad(deg){
  return deg * (Math.PI/180)
}

async function loadThing(json,thing){
  
  thing = (thing || new THREE.Group())
  
  thing.traverse (function(object){
    if(object.material){
      object.material.dispose()
    }
  })
  for( var i = thing.children.length - 1; i >= 0; i--) {
    thing.remove(thing.children[i]); 
  }

  if(json){
    json = JSON.parse(json)
    
    let scale = 6
      
    let thingInvisible = false
    
    if (json.a){
      for(var i = 0; i < json.a.length; i++){
        if(json.a[i] == 48){
          thingInvisible = true
          break
        }
      }
    }
    
    for(var i = 0; i < json.p.length; i++){
      
      let shapeInvisible = false

      if (json.p[i].a){
        for(var j = 0; j < json.p[i].a.length; j++){
          if(json.p[i].a[j] == 12){
            shapeInvisible = true
            break
          }
        }
      }
      
      if (json.p[i].t == 21 && (json.p[i].s[0].c[0]+json.p[i].s[0].c[1]+json.p[i].s[0].c[2]) < (0.1*3)){
        shapeInvisible = true
      }
      
      let baseShape = (json.p[i].b || 1)

      if (!shapeInvisible && !thingInvisible && shapes["s"+baseShape]){
        var shape = shapes["s"+baseShape].clone()
        shape.material = new THREE.MeshLambertMaterial()
        shape.material.color.fromArray(json.p[i].s[0].c)
        shape.material.color.convertSRGBToLinear()
      }else{
        var shape = new THREE.Group()
      }

      shape.position.set(-json.p[i].s[0].p[0],json.p[i].s[0].p[1],json.p[i].s[0].p[2])

      shape.rotation.set(degToRad(json.p[i].s[0].r[0]),-degToRad(json.p[i].s[0].r[1]),-degToRad(json.p[i].s[0].r[2]),"YXZ")

      shape.scale.set(json.p[i].s[0].s[0],json.p[i].s[0].s[1],json.p[i].s[0].s[2])

      if(json.p[i].i){
        for(var j = 0; j < json.p[i].i.length; j++){

          var ojson = await getThingJSON(json.p[i].i[j].t)

          var subthing = await loadThing(ojson)
          
          subthing.position.set(-json.p[i].i[j].p[0],json.p[i].i[j].p[1],json.p[i].i[j].p[2])

          subthing.rotation.set(degToRad(json.p[i].i[j].r[0]),-degToRad(json.p[i].i[j].r[1]),-degToRad(json.p[i].i[j].r[2]),"YXZ")
          
          subthing.scale.divide(shape.scale)

          shape.add(subthing)

        }
      }

      thing.add(shape)

    }
    
  }
  
  debugLog.innerHTML = "Thing Loaded!"
  return thing
  
}

async function getThingJSON(id){
  
  // let file = thingsZip.file(id+".json")

  let file = thingsZip.file("thingdefs/"+id.substr(id.length-6, 3)+"/"+id.substr(id.length-3, 3)+"/"+id)
  
  var json = ""
  
  if(file){
    await file.async("string").then(function (string) {
      json = string
    })
  }
  
  return json

}

async function loadArea(json,map){
  
  map = (map || new THREE.Group())
  
  json = JSON.parse(json)
  
  let tjson = ""
  
  for(var i = 0; i < json.placements.length; i++){
    
    if (json.placements[i].p[0] == 0 && json.placements[i].p[1] == 0 && json.placements[i].p[2] == 0 && json.placements[i].r[0] == 0 && json.placements[i].r[1] == 0 && json.placements[i].r[2] == 0){
      // console.log(json.placements[i])
    }else{

      tjson = await getThingJSON(json.placements[i].i)

      if(!json.placements[i].invisibleToEditors){
        var thing = await loadThing(tjson)
      }else{
        var thing = new THREE.Group()
      }

      thing.position.set(-json.placements[i].p[0],json.placements[i].p[1],json.placements[i].p[2])
      thing.position.y += 10

      anime({
        targets: thing.position,
        // x: json.placements[i].p[0],
        y: json.placements[i].p[1],
        // z: json.placements[i].p[2],
        easing: 'easeOutBounce',
        duration: 2000,
        round: 1000
      })

      thing.rotation.set(degToRad(json.placements[i].r[0]),-degToRad(json.placements[i].r[1]),-degToRad(json.placements[i].r[2]),"YXZ")

      if(json.placements[i].s){
        // thing.scale.set(json.placements[i].s[0],json.placements[i].s[1],json.placements[i].s[2])
        thing.scale.setScalar(0)
        anime({
          targets: thing.scale,
          x: json.placements[i].s[0],
          y: json.placements[i].s[1],
          z: json.placements[i].s[2],
          easing: 'easeOutQuad',
          duration: 500,
          round: 1000
        })
      }else{
        thing.scale.setScalar(0)
        anime({
          targets: thing.scale,
          x: 1,
          y: 1,
          z: 1,
          easing: 'easeOutQuad',
          duration: 500,
          round: 1000
        })
      }

      debugLog.innerHTML = "Generating area things... " + Math.ceil((i/json.placements.length)*100) + "%"

      map.add(thing)
      
    }
    
  }
  
  debugLog.innerHTML = "Area Loaded!"
  return map
  
}

export {shapes, loadThing, getThingJSON, loadArea, setInit}