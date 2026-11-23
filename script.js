import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const stage = document.querySelector("#stage");
const world = document.querySelector("#glassWorld");
const panel = document.querySelector("#shardPanel");
const readButton = document.querySelector("#readPaper");
const backButton = document.querySelector("#goBack");
const details = document.querySelector("#details");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let renderer, scene, camera, pmrem, raycaster, pointer = new THREE.Vector2(2,2);
let shards = [], navShard, hovered = null, targetTiltX=0, targetTiltY=0;
let isShattered = false, animationFrame = 0;
const clock = new THREE.Clock();

function roundedShape(points, radius=0.12) {
  const s = new THREE.Shape();
  const p = points.map(([x,y])=>new THREE.Vector2(x,y));
  for(let i=0;i<p.length;i++){
    const prev=p[(i-1+p.length)%p.length], cur=p[i], next=p[(i+1)%p.length];
    const v1=prev.clone().sub(cur).normalize(), v2=next.clone().sub(cur).normalize();
    const angle=Math.acos(THREE.MathUtils.clamp(v1.dot(v2),-1,1));
    const d=Math.min(radius/Math.tan(angle/2),prev.distanceTo(cur)*.3,next.distanceTo(cur)*.3);
    const a=cur.clone().addScaledVector(v1,d), b=cur.clone().addScaledVector(v2,d);
    if(i===0)s.moveTo(a.x,a.y);else s.lineTo(a.x,a.y);
    s.quadraticCurveTo(cur.x,cur.y,b.x,b.y);
  }
  s.closePath(); return s;
}
function makeGlass(points, index, width, height, depth=0.12) {
  const normalized=points.map(([x,y])=>[(x-.5)*width,(.5-y)*height]);
  const shape=roundedShape(normalized,Math.min(width,height)*.018);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.025,bevelThickness:.025,curveSegments:5});
  geometry.computeVertexNormals();
  const material=new THREE.MeshPhysicalMaterial({color:0x24232b,metalness:.12,roughness:.3,clearcoat:.85,clearcoatRoughness:.12,iridescence:.62,iridescenceIOR:1.3,iridescenceThicknessRange:[250,650],envMapIntensity:1.25,transparent:false});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.position.z=index*.012;
  mesh.userData={home:mesh.position.clone(),index,phase:Math.random()*6.28,hover:0,velocity:0,baseRot:0};
  scene.add(mesh); return mesh;
}
function init3D(){
  try{
    renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.setSize(panel.clientWidth,panel.clientHeight);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1;
    renderer.domElement.className="webgl-layer";
    renderer.domElement.style.cssText="position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;opacity:.85";
    panel.prepend(renderer.domElement);
    scene=new THREE.Scene();scene.background=null;
    camera=new THREE.PerspectiveCamera(30,panel.clientWidth/panel.clientHeight,.1,100);
    camera.position.set(0,0,Math.max(panel.clientWidth,panel.clientHeight)*1.95);
    const envScene=new RoomEnvironment();
    pmrem=new THREE.PMREMGenerator(renderer);
    scene.environment=pmrem.fromScene(envScene).texture;
    scene.environmentIntensity=.42;
    scene.add(new THREE.AmbientLight(0x9da6c9,.8));
    const key=new THREE.DirectionalLight(0xe3e7ff,3.2);key.position.set(-widthPx()*.45,heightPx()*.7,400);scene.add(key);
    const fill=new THREE.PointLight(0x9b86ff,90,Math.max(widthPx(),heightPx())*1.5);fill.position.set(widthPx()*.2,-heightPx()*.2,180);scene.add(fill);
    raycaster=new THREE.Raycaster();
    buildShards();
    window.addEventListener("resize",resize3D);
    panel.addEventListener("pointermove",onPointerMove);
    panel.addEventListener("pointerleave",()=>{pointer.set(2,2);targetTiltX=0;targetTiltY=0});
    animate();
  }catch(e){console.warn("WebGL unavailable; HTML fallback is active.",e);}
}
function widthPx(){return panel.clientWidth||1000}function heightPx(){return panel.clientHeight||600}
function buildShards(){
  const w=widthPx(),h=heightPx();
  const cells=[
    [[0,0],[.22,0],[.385,.72],[.34,1],[0,1]],
    [[.22,0],[.515,0],[.48,.62],[.385,.72]],
    [[.515,0],[.84,0],[.716,.49],[.48,.62]],
    [[.385,.72],[.48,.62],[.716,.49],[.865,1],[.34,1]],
    [[.84,0],[1,0],[1,1],[.865,1],[.716,.49]]
  ];
  shards=cells.map((p,i)=>makeGlass(p,i,w,h));
  navShard=makeGlass([[0,0],[1,0],[1,1],[0,1]],9,w*.98,Math.max(60,h*.108),.1);
  navShard.position.set(0,h*.56,-8);
  navShard.userData.home=navShard.position.clone();
}
function resize3D(){
  if(!renderer)return;
  const w=widthPx(),h=heightPx();
  renderer.setSize(w,h);camera.aspect=w/h;camera.position.z=Math.max(w,h)*1.95;camera.updateProjectionMatrix();
  // Rebuild meshes to preserve the responsive shard layout.
  [...shards,navShard].forEach(m=>{scene.remove(m);m.geometry.dispose();m.material.dispose()});
  buildShards();
}
function onPointerMove(e){
  const r=panel.getBoundingClientRect();
  pointer.x=((e.clientX-r.left)/r.width)*2-1;
  pointer.y=-((e.clientY-r.top)/r.height)*2+1;
  const nx=(e.clientX-r.left)/r.width-.5,ny=(e.clientY-r.top)/r.height-.5;
  targetTiltY=nx*THREE.MathUtils.degToRad(7)-THREE.MathUtils.degToRad(1.2);
  targetTiltX=-ny*THREE.MathUtils.degToRad(5.5)+THREE.MathUtils.degToRad(.8);
}
function animate(){
  animationFrame=requestAnimationFrame(animate);
  if(!renderer||!scene)return;
  const dt=Math.min(clock.getDelta(),.04),t=clock.elapsedTime;
  world.style.transform=`rotateX(${THREE.MathUtils.radToDeg(targetTiltX)*.18}deg) rotateY(${THREE.MathUtils.radToDeg(targetTiltY)*.18}deg)`;
  raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(shards,false)[0]?.object||null;
  if(hit!==hovered){hovered=hit}
  for(const m of shards){
    const u=m.userData,active=m===hovered&&!isShattered;
    const goal=active?1:0;
    u.hover=THREE.MathUtils.damp(u.hover,goal,7,dt);
    const breathe=Math.sin(t*.45+u.phase)*.012;
    m.position.z=THREE.MathUtils.damp(m.position.z,u.home.z+u.hover*42+breathe,8,dt);
    m.rotation.x=THREE.MathUtils.damp(m.rotation.x,active?-.15:0,7,dt);
    m.rotation.y=THREE.MathUtils.damp(m.rotation.y,active?.12:0,7,dt);
    m.material.iridescence=.58+u.hover*.38;
    m.material.envMapIntensity=1.1+u.hover*.8;
  }
  if(navShard){
    navShard.position.z=THREE.MathUtils.damp(navShard.position.z,navShard.userData.home.z,8,dt);
  }
  renderer.render(scene,camera);
}
function shatter(){
  if(isShattered)return;isShattered=true;
  details.classList.add("active");details.setAttribute("aria-hidden","false");
  if(reduced){world.style.opacity="0";return}
  const all=[navShard,...shards];
  all.forEach((m,i)=>{
    const dir=new THREE.Vector3((Math.random()-.5)*2,(Math.random()-.5)*1.4,1).normalize();
    const start=m.position.clone();
    const end=start.clone().add(dir.multiplyScalar(180+Math.random()*240));
    end.y-=100+Math.random()*130;
    const rot=new THREE.Vector3(Math.random()*3,Math.random()*3,Math.random()*3);
    const t0=performance.now()+i*24;
    const duration=720;
    function fly(now){
      if(!isShattered)return;
      const p=THREE.MathUtils.clamp((now-t0)/duration,0,1),ease=p*p*p;
      m.position.lerpVectors(start,end,ease);
      m.rotation.set(rot.x*ease,rot.y*ease,rot.z*ease);
      m.scale.setScalar(1-.12*ease);
      if(p<1)requestAnimationFrame(fly);
    }
    requestAnimationFrame(fly);
  });
}
function reassemble(){
  if(!isShattered)return;isShattered=false;
  details.classList.remove("active");details.setAttribute("aria-hidden","true");
  if(reduced){world.style.opacity="1";return}
  [navShard,...shards].forEach((m,i)=>{
    const from=m.position.clone(),to=m.userData.home.clone(),r0=m.rotation.clone();
    const t0=performance.now()+i*30;
    function fly(now){
      const p=THREE.MathUtils.clamp((now-t0)/720,0,1),ease=1-Math.pow(1-p,3)*(1+1.7*(1-p));
      m.position.lerpVectors(from,to,THREE.MathUtils.clamp(ease,0,1));
      m.rotation.set(r0.x*(1-p),r0.y*(1-p),r0.z*(1-p));
      m.scale.setScalar(.88+.12*p);
      if(p<1)requestAnimationFrame(fly);else{m.position.copy(to);m.rotation.set(0,0,0);m.scale.setScalar(1)}
    }requestAnimationFrame(fly);
  });
}
readButton.addEventListener("click",shatter);
backButton.addEventListener("click",reassemble);
init3D();
