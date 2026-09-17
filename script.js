"use strict";

const SVG_NS="http://www.w3.org/2000/svg";
const KEYS={last:"blumenglueck-last-watered",test:"blumenglueck-test-mode"};
const REAL_HOUR=3_600_000;
const TEST_HOUR=10_000; // Eine Minute = sechs Pflanzenstunden.
const MAX_HOURS=25;

const ui={
  bouquet:document.querySelector("#bouquet"), arrangement:document.querySelector("#flowerArrangement"),
  fallLayer:document.querySelector("#fallLayer"), drops:document.querySelector("#waterDrops"),
  hearts:document.querySelector("#heartLayer"),
  button:document.querySelector("#waterButton"), test:document.querySelector("#testMode"),
  status:document.querySelector("#statusText"), dot:document.querySelector("#statusDot"),
  water:document.querySelector("#waterLevel"), elapsed:document.querySelector("#elapsedPlantTime"),
  last:document.querySelector("#lastWatered"), toast:document.querySelector("#toast")
};

// 28 Blumen, unregelmäßig auf drei Tiefen verteilt. Jede erhält einen eigenen
// gebogenen Stängel und zwei individuell positionierte Blätter.
const flowers=[
  {t:"filler",x:105,y:310,s:.7,a:-25,d:"back"},{t:"roseBud",x:180,y:210,s:.68,a:-18,d:"back"},
  {t:"roseHalf",x:260,y:118,s:.7,a:-11,d:"back"},{t:"rose",x:342,y:150,s:.68,a:-7,d:"back"},
  {t:"rose",x:425,y:102,s:.65,a:-2,d:"back"},{t:"filler",x:510,y:125,s:.72,a:7,d:"back"},
  {t:"roseBud",x:600,y:168,s:.72,a:13,d:"back"},{t:"rose",x:690,y:220,s:.72,a:18,d:"back"},
  {t:"roseHalf",x:790,y:302,s:.68,a:25,d:"back"},
  {t:"rose",x:135,y:370,s:.82,a:-23,d:"middle"},{t:"roseHalf",x:205,y:305,s:.8,a:-18,d:"middle"},
  {t:"rose",x:280,y:255,s:.88,a:-13,d:"middle"},{t:"filler",x:338,y:215,s:.82,a:-8,d:"middle"},
  {t:"rose",x:400,y:282,s:.88,a:-4,d:"middle"},{t:"roseBud",x:475,y:215,s:.78,a:4,d:"middle"},
  {t:"rose",x:548,y:255,s:.9,a:9,d:"middle"},{t:"rose",x:625,y:292,s:.86,a:14,d:"middle"},
  {t:"roseBud",x:705,y:348,s:.78,a:19,d:"middle"},{t:"filler",x:755,y:420,s:.8,a:23,d:"middle"},
  {t:"rose",x:220,y:430,s:.82,a:-17,d:"middle"},
  {t:"rose",x:245,y:470,s:1.03,a:-17,d:"front"},{t:"rose",x:345,y:440,s:1.1,a:-10,d:"front"},
  {t:"rose",x:448,y:415,s:1.12,a:-2,d:"front"},{t:"roseHalf",x:550,y:445,s:1.03,a:8,d:"front"},
  {t:"rose",x:650,y:475,s:1.02,a:16,d:"front"},{t:"roseBud",x:170,y:505,s:.9,a:-22,d:"front"},
  {t:"rose",x:300,y:525,s:.98,a:-12,d:"front"},{t:"rose",x:725,y:515,s:.94,a:20,d:"front"}
];

let plants=[];
let leafOrder=[];
let headOrder=[];
let nextFallAt=null;
let fallEventNumber=0;
let fallGeneration=0;
let activeFlowerPhase=-1;
let toastTimer;

function svg(name,attributes={}){
  const node=document.createElementNS(SVG_NS,name);
  Object.entries(attributes).forEach(([key,value])=>node.setAttribute(key,String(value)));
  return node;
}
function curvePoint(start,control,end,t){
  const m=1-t;
  return{x:m*m*start.x+2*m*t*control.x+t*t*end.x,y:m*m*start.y+2*m*t*control.y+t*t*end.y};
}
function createPlant(flower,index){
  // Alle Stängelenden liegen eng gebündelt innerhalb der Bucket-Öffnung.
  // Die kleinen Abweichungen verhindern einen künstlichen einzelnen Knotenpunkt.
  const start={x:450+(index%5-2)*4,y:638+(index%3)*3};
  const end={x:flower.x,y:flower.y+14};
  const outward=(flower.x-450)*.12;
  const control={x:(start.x+end.x)/2+outward,y:(start.y+end.y)/2+28};
  const plant=svg("g",{class:"plant",style:`--speed:${11+(index%7)*.73}s;--delay:${-(index%9)*1.12}s;--bend:${flower.x<450?-10-(index%3):10+(index%3)}deg;--head-bend:${flower.x<450?-52:52}deg`});
  const body=svg("g",{class:"plant-body"});
  body.append(svg("path",{class:`stem ${flower.d==="front"?"heavy":flower.t==="filler"?"thin":""}`,d:`M${start.x} ${start.y} Q${control.x} ${control.y} ${end.x} ${end.y}`}));
  const leafData=[];
  [.43,.64].forEach((position,leafIndex)=>{
    const p=curvePoint(start,control,end,position);
    const left=(index+leafIndex)%2===0;
    const size=.48+((index*3+leafIndex)%6)*.055;
    // Die Gruppe sitzt exakt auf dem berechneten Punkt des Stängels. Skalierung
    // und Drehung wirken dadurch um den Blattansatz statt auf die Seitenposition.
    const leaf=svg("g",{class:`leaf leaf-${leafIndex===0?"one":"two"}`,transform:`translate(${p.x} ${p.y}) rotate(${left?-146:29}) scale(${size})`,style:`--leaf-drop:${left?-38:38}deg`});
    leaf.append(svg("use",{href:"#leafShape"}));
    body.append(leaf); leafData.push({x:p.x,y:p.y,side:left?-1:1,size});
  });
  const head=svg("g",{class:`flower-head${flower.tone?` tone-${flower.tone}`:""}`,transform:`translate(${flower.x} ${flower.y}) rotate(${flower.a}) scale(${flower.s})`});
  head.append(svg("use",{href:`#${flower.t}`})); body.append(head); plant.append(body);
  return{node:plant,flower,index,leaves:leafData,head,headUse:head.querySelector("use")};
}
function buildBouquet(){
  const layers={back:svg("g",{class:"depth back"}),middle:svg("g",{class:"depth middle"}),front:svg("g",{class:"depth front"})};
  plants=flowers.map((flower,index)=>createPlant(flower,index));
  // Keine dauerhafte Luft- oder Schwebebewegung: Befestigte Elemente bleiben
  // sowohl vor als auch nach Stunde 4 exakt an ihrer Ausgangsposition.
  plants.forEach(plant=>{
    plant.node.style.animation="none";
    layers[plant.flower.d].append(plant.node);
  });
  ui.arrangement.replaceChildren(layers.back,layers.middle,layers.front);
  leafOrder=plants.flatMap((plant,index)=>[
    {plant,index,leaf:0,rank:(index*17)%plants.length},
    {plant,index,leaf:1,rank:(index*13+9)%plants.length+plants.length}
  ]).sort((a,b)=>a.rank-b.rank);
  headOrder=[...plants].sort((a,b)=>((a.index*11)%plants.length)-((b.index*11)%plants.length));
}

// Alle 24 Pflanzenstunden wechselt nur die sichtbare Blüte. Die vorhandenen
// Positionen, Stängel, Blätter und sämtliche Zustandslogik bleiben bestehen.
function flowerVariant(index,phase){
  const mixedRoster=[
    {type:"rose",tone:"red"},
    {type:"tulipYellow",tone:""},
    {type:"peony",tone:"cream"},
    {type:"daisy",tone:""},
    {type:"filler",tone:""},
    {type:"roseHalf",tone:"pink"},
    {type:"smallOrange",tone:""},
    {type:"tulipWhite",tone:""},
    {type:"rose",tone:"red"},
    {type:"smallPurple",tone:""},
    {type:"peony",tone:"purple"},
    {type:"filler",tone:""},
    {type:"roseBud",tone:"cream"},
    {type:"tulipPink",tone:"red"},
    {type:"daisy",tone:""},
    {type:"rose",tone:"pink"}
  ];
  // Der bestehende 24-Stunden-Zyklus verschiebt nur die Mischung. Dadurch sind
  // in jeder Phase gleichzeitig verschiedene Arten und Farben sichtbar.
  return mixedRoster[(index+phase*5)%mixedRoster.length];
}
function applyFlowerPhase(phase){
  if(phase===activeFlowerPhase)return;
  plants.forEach((plant,index)=>{
    const variant=flowerVariant(index,phase);
    plant.flower.t=variant.type;
    plant.flower.tone=variant.tone;
    plant.head.setAttribute("class",`flower-head${variant.tone?` tone-${variant.tone}`:""}`);
    plant.headUse.setAttribute("href",`#${variant.type}`);
  });
  activeFlowerPhase=phase;
}

function clamp(value,min=0,max=1){return Math.min(max,Math.max(min,value))}
function readLast(){
  const saved=Number(localStorage.getItem(KEYS.last));
  if(Number.isFinite(saved)&&saved>0)return saved;
  const now=Date.now();localStorage.setItem(KEYS.last,String(now));return now;
}
let lastWatered=readLast();
ui.test.checked=localStorage.getItem(KEYS.test)==="true";

function plantHour(){return ui.test.checked?TEST_HOUR:REAL_HOUR}
function state(hours){
  if(hours>=24)return{label:"Fast kaputt",color:"#7b684f"};
  if(hours>=18)return{label:"Stark welk",color:"#997754"};
  if(hours>=12)return{label:"Welk",color:"#a88d63"};
  if(hours>=6)return{label:"Leicht trocken",color:"#9b9b70"};
  return{label:"Gesund",color:"#91aa84"};
}
function plantTime(hours){
  const whole=Math.floor(hours),minutes=Math.floor((hours-whole)*60);
  return minutes?`${whole} Std. ${minutes} Min.`:`${whole} ${whole===1?"Stunde":"Stunden"}`;
}
function formatDate(timestamp){
  if(Date.now()-timestamp<60_000)return"gerade eben";
  return new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(timestamp);
}

function pieceSvg(reference,kind,tone){
  const view=kind==="leaf"?"-5 -45 105 90":"-100 -100 200 200";
  const element=document.createElementNS(SVG_NS,"svg");
  element.setAttribute("viewBox",view);
  if(tone)element.classList.add(`tone-${tone}`);
  element.append(svg("use",{href:`#${reference}`}));
  return element;
}
function randomBetween(min,max){return min+Math.random()*(max-min)}
function randomInteger(min,max){return Math.floor(randomBetween(min,max+1))}
function randomSelection(items,amount){
  const pool=[...items];
  for(let index=pool.length-1;index>0;index--){
    const other=Math.floor(Math.random()*(index+1));
    [pool[index],pool[other]]=[pool[other],pool[index]];
  }
  return pool.slice(0,amount);
}

// Übernimmt die wirkliche Bildschirmposition und simuliert den Fall anschließend
// mit Geschwindigkeit und Gravitation. velocityY startet immer bei null.
function physicsFall(item,kind){
  const sourceNode=kind==="leaf"
    ? item.plant.node.querySelector(item.leaf===0?".leaf-one":".leaf-two")
    : item.plant.node.querySelector(".flower-head");
  const sourceRect=sourceNode.getBoundingClientRect();
  const layerRect=ui.fallLayer.getBoundingClientRect();
  const floorRect=document.querySelector(".floor").getBoundingClientRect();
  const reference=kind==="leaf"?"leafShape":item.plant.flower.t;
  const element=pieceSvg(reference,kind,item.plant.flower.tone);
  const width=Math.max(kind==="leaf"?24:42,sourceRect.width);
  const height=Math.max(kind==="leaf"?18:38,sourceRect.height);
  let x=sourceRect.left-layerRect.left;
  let y=sourceRect.top-layerRect.top;
  const groundY=Math.max(y+24,floorRect.top-layerRect.top+randomBetween(8,30));
  let velocityY=0;
  const gravity=kind==="leaf"?1050:1450;
  const drift=kind==="leaf"?randomBetween(-38,38):randomBetween(-13,13);
  const angularVelocity=kind==="leaf"?randomBetween(-330,330):randomBetween(-125,125);
  let rotation=randomBetween(-20,20);
  let previousTime=null;
  const generation=fallGeneration;

  element.classList.add("falling-piece");
  element.style.animation="none";
  element.style.left=`${x}px`;element.style.top=`${y}px`;
  element.style.width=`${width}px`;element.style.height=`${height}px`;
  element.style.opacity=".9";
  ui.fallLayer.append(element);

  // Erst nach dem Klonen ausblenden: So bleibt die Startposition pixelgenau.
  if(kind==="leaf")item.plant.node.classList.add(item.leaf===0?"leaf-one-lost":"leaf-two-lost");
  else item.plant.node.classList.add("head-lost");

  function frame(time){
    if(generation!==fallGeneration||!element.isConnected)return;
    if(previousTime===null)previousTime=time;
    const delta=Math.min(.032,(time-previousTime)/1000);
    previousTime=time;
    velocityY+=gravity*delta;
    y+=velocityY*delta; // velocityY ist nie negativ: keine Aufwärtsbewegung.
    x+=drift*delta;
    rotation+=angularVelocity*delta;
    if(y+height*.5>=groundY){
      y=groundY-height*.5;
      element.classList.remove("falling-piece");element.classList.add("fallen-piece");
      element.style.left=`${x}px`;element.style.top=`${y}px`;
      element.style.transform=`rotate(${rotation}deg) scaleY(.62)`;
      element.style.opacity=".78";
      return;
    }
    element.style.left=`${x}px`;element.style.top=`${y}px`;
    element.style.transform=`rotate(${rotation}deg)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function startFallEvent(hours){
  const availableLeaves=leafOrder.filter(item=>!item.plant.node.classList.contains(item.leaf===0?"leaf-one-lost":"leaf-two-lost"));
  const availableHeads=headOrder.filter(plant=>!plant.node.classList.contains("head-lost"));
  const leafLimit=hours<24?Math.max(0,availableLeaves.length-1):availableLeaves.length;
  const headLimit=hours<24?Math.max(0,availableHeads.length-1):availableHeads.length;
  const leaves=randomSelection(availableLeaves,Math.min(randomInteger(2,5),leafLimit));
  const heads=randomSelection(availableHeads,Math.min(randomInteger(1,3),headLimit));
  leaves.forEach(item=>physicsFall(item,"leaf"));
  heads.forEach(plant=>physicsFall({plant},"head"));
  fallEventNumber++;
}

function updateFallEvents(hours){
  const FALL_START_HOUR=4;
  if(hours<FALL_START_HOUR){nextFallAt=null;return}
  const now=Date.now();
  // Das erste Event beginnt unmittelbar beim ersten Update ab Stunde 4.
  if(nextFallAt===null)nextFallAt=now;
  if(now>=nextFallAt){
    startFallEvent(hours);
    // Kurze zufällige Pause von 0,2 bis 0,6 Pflanzenstunden.
    nextFallAt=now+plantHour()*randomBetween(.2,.6);
  }
}
function update(){
  const hours=Math.max(0,Date.now()-lastWatered)/plantHour();
  const dry=clamp(hours/MAX_HOURS),current=state(hours);
  // Nur ausgewählte, abgelöste Elemente dürfen sich bewegen. Alle weiterhin
  // befestigten Blätter, Köpfe und Stängel behalten ihre exakte Position.
  ui.bouquet.style.setProperty("--leaf-wilt","0");
  ui.bouquet.style.setProperty("--head-wilt","0");
  ui.bouquet.style.setProperty("--stem-wilt","0");
  ui.bouquet.style.setProperty("--sat",(1.14-dry*.52).toFixed(3));
  ui.bouquet.style.setProperty("--light",(1.08-dry*.28).toFixed(3));
  ui.status.textContent=current.label;ui.dot.style.background=current.color;
  ui.water.textContent=`${Math.max(0,Math.round(100-dry*100))} %`;
  ui.elapsed.textContent=plantTime(hours);ui.last.textContent=formatDate(lastWatered);
  applyFlowerPhase(Math.floor(hours/24)%4);
  updateFallEvents(hours);
}

function waterAnimation(){
  ui.drops.replaceChildren();
  for(let i=0;i<22;i++){
    const drop=document.createElement("i");drop.className="drop";drop.style.left=`${22+Math.random()*58}%`;
    drop.style.setProperty("--size",`${4+Math.random()*7}px`);drop.style.setProperty("--delay",`${Math.random()*.7}s`);
    drop.style.setProperty("--time",`${.9+Math.random()*.6}s`);drop.style.setProperty("--drift",`${-15+Math.random()*30}px`);ui.drops.append(drop);
  }
  setTimeout(()=>ui.drops.replaceChildren(),2200);
}
function heartAnimation(){
  ui.hearts.replaceChildren();
  const colors=["#e94b56","#f29ab2","#fffaf2","#b78bd1","#8ecde3"];
  for(let index=0;index<46;index++){
    const heart=document.createElement("span");
    heart.className="watering-heart";heart.textContent="♥";
    heart.style.setProperty("--heart-x",`${Math.random()*100}%`);
    heart.style.setProperty("--heart-y",`${48+Math.random()*50}%`);
    heart.style.setProperty("--heart-color",colors[index%colors.length]);
    heart.style.setProperty("--heart-size",`${12+Math.random()*27}px`);
    heart.style.setProperty("--heart-duration",`${2+Math.random()*2}s`);
    heart.style.setProperty("--heart-delay",`${Math.random()*.38}s`);
    heart.style.setProperty("--heart-drift",`${-80+Math.random()*160}px`);
    heart.style.setProperty("--heart-rise",`-${55+Math.random()*55}vh`);
    heart.style.setProperty("--heart-start-rotation",`${-35+Math.random()*70}deg`);
    heart.style.setProperty("--heart-end-rotation",`${-110+Math.random()*220}deg`);
    ui.hearts.append(heart);
  }
  setTimeout(()=>ui.hearts.replaceChildren(),4500);
}
function waterFlowers(){
  lastWatered=Date.now();localStorage.setItem(KEYS.last,String(lastWatered));
  plants.forEach(plant=>plant.node.classList.remove("leaf-one-lost","leaf-two-lost","head-lost"));
  fallGeneration++;ui.fallLayer.replaceChildren();nextFallAt=null;fallEventNumber=0;update();waterAnimation();heartAnimation();
  clearTimeout(toastTimer);ui.toast.classList.add("show");toastTimer=setTimeout(()=>ui.toast.classList.remove("show"),2600);
}

buildBouquet();
ui.button.addEventListener("click",waterFlowers);
ui.test.addEventListener("change",()=>{localStorage.setItem(KEYS.test,String(ui.test.checked));location.reload()});
update();setInterval(update,250);
