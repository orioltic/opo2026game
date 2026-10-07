(() => {
  const cfg = window.GAME_CONFIG;
  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#viewport'), ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, FOV = Math.PI / 3;
  let levelIndex = 0, vaccines = cfg.startingVaccines, player, enemies = [], pickups = [];
  let questionOrder = [], questionIndex = 0, activePickup = null, ended = false, quizMode = 'pickup';
  let soundOn = false, audio, lastDamage = 0, flashUntil = 0, toastTimer, enemyLoop = null;
  let knowledge = 0, heldTimer = null, projectile = null, projectileFrame = 0;
  const orientationGate=$('#orientation-gate');
  const isMobileDevice=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>1;
  function syncOrientation(){
    const portraitMode=matchMedia('(orientation: portrait)').matches;
    const needsLandscape=isMobileDevice&&portraitMode;
    orientationGate.hidden=!needsLandscape;
    document.body.classList.toggle('mobile-landscape',isMobileDevice&&!portraitMode);
    document.body.classList.toggle('needs-landscape',needsLandscape);
  }
  function requestLandscape(){
    if(!isMobileDevice)return;
    try{const full=document.documentElement.requestFullscreen?.();full?.catch(()=>{});}catch(_){}
    try{const lock=screen.orientation?.lock?.('landscape');lock?.catch(()=>{});}catch(_){}
  }
  syncOrientation();window.addEventListener('resize',syncOrientation);window.addEventListener('orientationchange',syncOrientation);

  const portrait = $('#player-portrait');
  portrait.addEventListener('load', () => {
    if (portrait.dataset.pixelated) return;
    const mini = document.createElement('canvas'); mini.width = 48; mini.height = 60;
    const pctx = mini.getContext('2d'), ratio = portrait.naturalWidth / portrait.naturalHeight;
    const wanted = mini.width / mini.height;
    let sx=0,sy=0,sw=portrait.naturalWidth,sh=portrait.naturalHeight;
    if(ratio>wanted){sw=sh*wanted;sx=(portrait.naturalWidth-sw)/2}
    else{sh=sw/wanted;sy=Math.min(portrait.naturalHeight*.08,portrait.naturalHeight-sh)}
    pctx.drawImage(portrait,sx,sy,sw,sh,0,0,mini.width,mini.height);
    portrait.dataset.pixelated='true';portrait.src=mini.toDataURL('image/png');
  },{once:true});

  function activeLevel(){return cfg.levels[levelIndex]}
  function activeMaze(){return activeLevel().maze||cfg.maze}
  function tileAt(x,y){
    const maze=activeMaze(),row=maze[Math.floor(y)], tile=row&&row[Math.floor(x)];
    return tile||'1';
  }
  function showToast(message){
    $('#toast').textContent=message;clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>$('#toast').textContent='Convierte a los negacionistas y encuentra la salida.',2300);
  }
  function beep(frequency=540){
    if(!soundOn)return;
    try{audio ||= new(window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type='square';o.frequency.value=frequency;g.gain.value=.035;o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.08)}catch(_){}
  }
  function updateHud(){
    $('#vaccine-count').textContent=`${vaccines} / ${cfg.maxVaccines}`;
    $('#vaccine-pips').textContent='● '.repeat(vaccines);
    $('#vaccine-pips').setAttribute('aria-label',`${vaccines} vacunas`);
    $('#level-name').textContent=activeLevel().title.toUpperCase();
    const turned=enemies.filter(enemy=>enemy.reading).length;
    $('#enemy-count').textContent=`${turned} / ${enemies.length}`;
  }
  function resetLevel(){
    const level=activeLevel();
    player={x:1.5,y:1.5,angle:0};
    enemies=level.enemies.map((enemy,index)=>({...enemy,id:index,reading:false,hitsLeft:enemy.hits||2,maxHits:enemy.hits||2,flash:0}));
    pickups=level.vaccines.map((pickup,index)=>({...pickup,id:index,taken:false}));
    questionOrder=cfg.questions.map((_,i)=>i).sort(()=>Math.random()-.5);questionIndex=0;quizMode='pickup';
    activePickup=null;ended=false;lastDamage=0;$('#quiz-panel').hidden=true;$('#end-panel').hidden=true;
    updateHud();render();startEnemyLoop();
  }
  function startGame(){
    levelIndex=0;vaccines=cfg.startingVaccines;knowledge=0;
    $('#start-screen').hidden=true;$('#play-screen').hidden=false;
    $('#screen-label').textContent='FASE 1 // PREPARA EL LIBRO';resetLevel();
  }
  function wallAt(x,y){
    const t=tileAt(x,y);
    return t==='1'||(t==='2'&&enemies.some(enemy=>!enemy.reading));
  }
  function move(action){
    if(!player||ended||activePickup!==null||document.body.classList.contains('needs-landscape'))return;
    if(action==='left'){player.angle-=.17;render();return}
    if(action==='right'){player.angle+=.17;render();return}
    const direction=action==='back'?-1:1,step=.19;
    const nx=player.x+Math.cos(player.angle)*step*direction;
    const ny=player.y+Math.sin(player.angle)*step*direction;
    const next=tileAt(nx,ny);
    if(next==='2'){
      if(enemies.every(enemy=>enemy.reading)){activePickup='exit';openQuestion('exit');return}
      showToast('La salida se abrirá cuando todos lean.');return;
    }
    if(!wallAt(nx+.15*Math.sign(Math.cos(player.angle)),player.y))player.x=nx;
    if(!wallAt(player.x,ny+.15*Math.sign(Math.sin(player.angle))))player.y=ny;
    checkContact();checkPickups();render();
  }
  function checkContact(){
    const now=performance.now();
    if(now-lastDamage<1000)return;
    const touching=enemies.find(e=>!e.reading&&Math.hypot(e.x-player.x,e.y-player.y)<.56);
    if(!touching)return;
    vaccines=Math.max(0,vaccines-1);lastDamage=now;flashUntil=now+180;updateHud();beep(170);
    showToast('¡Te han alcanzado! Pierdes una vacuna.');setTimeout(render,190);
    if(vaccines===0)gameOver();
  }
  function updateEnemies(){
    if(ended||activePickup!==null)return;
    for(const enemy of enemies){
      if(enemy.reading)continue;
      const dx=player.x-enemy.x,dy=player.y-enemy.y,distance=Math.hypot(dx,dy);
      const canChase=distance>.72&&distance<4.2&&clearPath(enemy.x,enemy.y,player.x,player.y);
      if(canChase){
        const step=.024,nx=enemy.x+dx/distance*step,ny=enemy.y+dy/distance*step;
        if(tileAt(nx,enemy.y)==='0')enemy.x=nx;
        if(tileAt(enemy.x,ny)==='0')enemy.y=ny;
        enemy.path=[];enemy.nextWander=performance.now()+700;
        continue;
      }
      // Fuera de la zona de persecución, recorren rutas aleatorias conectadas por pasillos.
      if(!enemy.path?.length&&performance.now()>=(enemy.nextWander||0))chooseWanderPath(enemy);
      const waypoint=enemy.path?.[0];if(!waypoint)continue;
      const wx=waypoint.x-enemy.x,wy=waypoint.y-enemy.y,wd=Math.hypot(wx,wy),step=.04;
      if(wd<.07){enemy.path.shift();if(!enemy.path.length)enemy.nextWander=performance.now()+500+Math.random()*1500;continue}
      const nx=enemy.x+wx/wd*Math.min(step,wd),ny=enemy.y+wy/wd*Math.min(step,wd);
      if(tileAt(nx,enemy.y)==='0')enemy.x=nx;
      if(tileAt(enemy.x,ny)==='0')enemy.y=ny;
      if(Math.abs(enemy.x-nx)>.001||Math.abs(enemy.y-ny)>.001)chooseWanderPath(enemy);
    }
    checkContact();
  }
  function chooseWanderPath(enemy){
    const sx=Math.floor(enemy.x),sy=Math.floor(enemy.y),key=(x,y)=>`${x},${y}`;
    const queue=[[sx,sy]],parent=new Map([[key(sx,sy),null]]),reachable=[];
    const steps=[[1,0],[-1,0],[0,1],[0,-1]];
    for(let i=0;i<queue.length;i++){
      const [x,y]=queue[i];
      if(Math.hypot(x-sx,y-sy)>1.5)reachable.push([x,y]);
      for(const [ox,oy] of steps){const nx=x+ox,ny=y+oy,k=key(nx,ny);if(tileAt(nx,ny)!=='0'||parent.has(k))continue;parent.set(k,key(x,y));queue.push([nx,ny])}
    }
    if(!reachable.length){enemy.path=[];enemy.nextWander=performance.now()+500;return}
    const [gx,gy]=reachable[Math.floor(Math.random()*reachable.length)],route=[];let cursor=key(gx,gy);
    while(cursor&&cursor!==key(sx,sy)){const [x,y]=cursor.split(',').map(Number);route.push({x:x+.5,y:y+.5});cursor=parent.get(cursor)}
    enemy.path=route.reverse();enemy.nextWander=0;
  }
  function startEnemyLoop(){
    clearInterval(enemyLoop);
    enemyLoop=setInterval(()=>{if(ended||document.body.classList.contains('needs-landscape'))return;updateEnemies();render()},100);
  }
  function checkPickups(){
    const found=pickups.find(p=>!p.taken&&Math.hypot(p.x-player.x,p.y-player.y)<.45);
    if(found){found.taken=true;activePickup=found.id;openQuestion('pickup')}
  }
  function openQuestion(mode='pickup'){
    quizMode=mode;
    if(questionIndex>=questionOrder.length){questionOrder=cfg.questions.map((_,i)=>i).sort(()=>Math.random()-.5);questionIndex=0}
    const question=cfg.questions[questionOrder[questionIndex++]];
    $('#quiz-panel').querySelector('.eyebrow').textContent=mode==='exit'?'PREGUNTA PARA ABRIR LA SALIDA':'CÁPSULA DE VACUNA';
    $('#quiz-question').textContent=question.prompt;$('#quiz-result').textContent='';$('#quiz-continue').hidden=true;
    const options=$('#quiz-options');options.replaceChildren();
    const choices=question.choices.map((text,index)=>({text,correct:index===question.answer})).sort(()=>Math.random()-.5);
    const correctPosition=choices.findIndex(choice=>choice.correct);
    choices.forEach(({text,correct},index)=>{
      const button=document.createElement('button');button.type='button';button.textContent=text;
      button.addEventListener('click',()=>{
        options.querySelectorAll('button').forEach(b=>b.disabled=true);
        if(correct){
          button.classList.add('correct');
          knowledge++;
          if(quizMode==='exit'){
            $('#quiz-result').textContent='¡Correcto! La salida queda abierta.';
            $('#quiz-panel').hidden=true;activePickup=null;completeLevel();return;
          }
          const gained=vaccines<cfg.maxVaccines;vaccines=Math.min(cfg.maxVaccines,vaccines+1);
          $('#quiz-result').textContent=gained?'¡Correcto! Recuperas una vacuna.':'¡Correcto! Ya tienes las cinco vacunas.';
          beep(760);
        }else{
          button.classList.add('incorrect');options.children[correctPosition].classList.add('correct');
          $('#quiz-result').textContent=quizMode==='exit'?'No es correcta. Responde otra pregunta para abrir la salida.':'Respuesta incorrecta: no recuperas vacuna.';
        }
        updateHud();$('#quiz-continue').textContent=quizMode==='exit'?'OTRA PREGUNTA':'CONTINUAR';$('#quiz-continue').hidden=false;
      });
      options.append(button);
    });
    $('#quiz-panel').hidden=false;beep(620);
  }
  $('#quiz-continue').addEventListener('click',()=>{
    if(quizMode==='exit'){openQuestion('exit');return}
    $('#quiz-panel').hidden=true;activePickup=null;render();
  });

  function gameOver(){
    ended=true;clearInterval(enemyLoop);$('#end-eyebrow').textContent='FIN DE LA PARTIDA';
    $('#end-title').textContent='Sin vacunas';$('#end-message').textContent='La fase sigue disponible. Reiníciala para volver a intentarlo.';
    $('#download-pdf').hidden=true;$('#continue-button').hidden=true;$('#retry-button').hidden=false;$('#end-panel').hidden=false;
    $('#screen-label').textContent='PARTIDA INTERRUMPIDA';
  }
  function completeLevel(){
    ended=true;clearInterval(enemyLoop);
    $('#quiz-panel').hidden=true;
    const last=levelIndex===cfg.levels.length-1;
    $('#end-eyebrow').textContent=last?'MISIÓN COMPLETADA':`FASE ${levelIndex+1} SUPERADA`;
    $('#end-title').textContent=activeLevel().title;
    $('#end-message').textContent=last?'Has completado las tres fases. Tu documento está desbloqueado.':'Has respondido correctamente. Tu documento está desbloqueado.';
    $('#download-pdf').hidden=false;$('#continue-button').hidden=last;$('#retry-button').hidden=true;$('#end-panel').hidden=false;
    $('#continue-button').textContent=last?'MISIÓN COMPLETADA':'SIGUIENTE FASE';
    $('#screen-label').textContent=last?'MISIÓN COMPLETADA':`FASE ${levelIndex+1} // PDF DESBLOQUEADO`;
    beep(880);
  }
  $('#download-pdf').addEventListener('click',()=>{
    const link=document.createElement('a');link.href=activeLevel().pdf;link.download=activeLevel().pdf.split('/').pop();
    document.body.append(link);link.click();link.remove();
  });
  $('#continue-button').addEventListener('click',()=>{
    if(levelIndex>=cfg.levels.length-1)return;
    levelIndex++;$('#end-panel').hidden=true;$('#screen-label').textContent=`FASE ${levelIndex+1}`;
    resetLevel();
  });
  $('#retry-button').addEventListener('click',()=>{
    vaccines=cfg.startingVaccines;$('#end-panel').hidden=true;$('#screen-label').textContent=`FASE ${levelIndex+1}`;
    resetLevel();
  });

  function fire(){
    if(ended||activePickup!==null||projectile||$('#quiz-panel').hidden===false||document.body.classList.contains('needs-landscape'))return;
    const target=enemies.filter(e=>!e.reading).map(e=>{
      const dx=e.x-player.x,dy=e.y-player.y,dist=Math.hypot(dx,dy);
      let delta=Math.atan2(dy,dx)-player.angle;
      while(delta>Math.PI)delta-=Math.PI*2;while(delta< -Math.PI)delta+=Math.PI*2;
      return{enemy:e,dist,delta};
    }).filter(item=>item.dist<5.5&&Math.abs(item.delta)<.20).sort((a,b)=>a.dist-b.dist)[0];
    projectile={started:performance.now(),duration:360,target:target&&lineOfSight(target.enemy.x,target.enemy.y)?target.enemy:null};
    flashUntil=performance.now()+100;beep(380);animateProjectile();
  }
  function animateProjectile(){
    if(!projectile)return;
    render();
    if(performance.now()-projectile.started>=projectile.duration){
      const hit=projectile.target;projectile=null;
      if(hit&&!hit.reading){hit.hitsLeft--;hit.flash=performance.now()+260;beep(700);
        if(hit.hitsLeft<=0){hit.reading=true;showToast('¡Lee y contrasta fuentes!');if(enemies.every(enemy=>enemy.reading))showToast('Salida abierta: busca la puerta azul.');}
        else showToast(`¡Impacto! Quedan ${hit.hitsLeft} impactos para que lea.`);
      }else{showToast('El libro no ha alcanzado a nadie. Ajusta la mira.');beep(250)}
      updateHud();render();return;
    }
    projectileFrame=requestAnimationFrame(animateProjectile);
  }
  function lineOfSight(x,y){return clearPath(player.x,player.y,x,y)}
  function clearPath(startX,startY,x,y){
    const dx=x-startX,dy=y-startY,distance=Math.hypot(dx,dy),steps=Math.ceil(distance/.08);
    for(let i=1;i<steps;i++)if(tileAt(startX+dx*i/steps,startY+dy*i/steps)!=='0')return false;
    return true;
  }
  function normalize(angle){while(angle>Math.PI)angle-=Math.PI*2;while(angle< -Math.PI)angle+=Math.PI*2;return angle}
  function hexRgb(hex){return[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]}
  function shade(hex,mul){const c=hexRgb(hex);return `rgb(${Math.floor(c[0]*mul)},${Math.floor(c[1]*mul)},${Math.floor(c[2]*mul)})`}
  function render(){
    if(!player)return;
    const level=activeLevel(),colors=level.palette;
    const sky=ctx.createLinearGradient(0,0,0,H/2);sky.addColorStop(0,'#08071b');sky.addColorStop(1,colors[0]);
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,H/2);
    const floor=ctx.createLinearGradient(0,H/2,0,H);floor.addColorStop(0,'#37234b');floor.addColorStop(1,'#100c22');
    ctx.fillStyle=floor;ctx.fillRect(0,H/2,W,H/2);
    const depth=[],xStep=2;
    for(let sx=0;sx<W;sx+=xStep){
      const camera=(sx/W-.5),angle=player.angle+camera*FOV,rx=Math.cos(angle),ry=Math.sin(angle);
      let mx=Math.floor(player.x),my=Math.floor(player.y),side=0,hit='0';
      const deltaX=Math.abs(1/(rx||.00001)),deltaY=Math.abs(1/(ry||.00001));
      const stepX=rx<0?-1:1,stepY=ry<0?-1:1;
      let sideX=(rx<0?player.x-mx:mx+1-player.x)*deltaX;
      let sideY=(ry<0?player.y-my:my+1-player.y)*deltaY;
      for(let n=0;n<40;n++){
        if(sideX<sideY){sideX+=deltaX;mx+=stepX;side=0}else{sideY+=deltaY;my+=stepY;side=1}
        hit=tileAt(mx+.001,my+.001);if(hit!=='0')break;
      }
      let distance=side===0?sideX-deltaX:sideY-deltaY;
      distance=Math.max(.08,distance*Math.cos(angle-player.angle));depth[sx/xStep]=distance;
      const line=Math.min(H*2,H/distance),top=Math.floor((H-line)/2),bottom=Math.ceil((H+line)/2);
      let base=hit==='2'?colors[2]:colors[1],light=(side===1?.76:1)*Math.max(.25,1-distance/9);
      const stripe=(Math.floor((side===0?player.y+distance*ry:player.x+distance*rx)*8)%8===0)?0.68:1;
      ctx.fillStyle=shade(base,light*stripe);ctx.fillRect(sx,top,xStep,bottom-top);
      if(hit==='2'){
        ctx.fillStyle='#f4d66f';ctx.fillRect(sx,top+line*.12,xStep,Math.max(2,line*.08));
        ctx.fillStyle='#3e2b67';if(Math.floor(sx/8)%2===0)ctx.fillRect(sx,top+line*.25,xStep,line*.55);
      }else{
        const band=Math.floor((top+line*.35)/12)%2;
        if(band===0){ctx.fillStyle='rgba(8,6,24,.24)';ctx.fillRect(sx,top+line*.35,xStep,Math.max(2,line*.06))}
      }
    }
    renderSprites(depth);
    // Retícula y libro preparado para salir volando.
    ctx.fillStyle='#fff6c7';ctx.fillRect(W/2-5,H/2,10,2);ctx.fillRect(W/2,H/2-5,2,10);
    drawBookHands();
    if(projectile){
      const progress=Math.min(1,(performance.now()-projectile.started)/projectile.duration);
      const ease=progress*progress*(3-2*progress),size=15+ease*47,y=H*.78-ease*H*.54;
      drawFlyingBook(W/2+(Math.sin(ease*Math.PI)*28),y,size,Math.sin(ease*Math.PI*3)*.35);
    }
    if(performance.now()<flashUntil){ctx.fillStyle='#fff1bd';ctx.fillRect(W/2-8,H/2-32,16,18);ctx.fillStyle='#df4d8c';ctx.fillRect(W/2-7,H/2-31,14,15)}
    if(performance.now()<lastDamage+180){ctx.fillStyle='#ff273333';ctx.fillRect(0,0,W,H)}
    drawMiniMap();
  }
  function drawMiniMap(){
    const map=$('#minimap'),m=map.getContext('2d'),maze=activeMaze(),cell=Math.min(map.width/maze[0].length,map.height/maze.length),ox=(map.width-cell*maze[0].length)/2,oy=(map.height-cell*maze.length)/2;
    m.fillStyle='#0e0a1f';m.fillRect(0,0,map.width,map.height);
    maze.forEach((row,y)=>[...row].forEach((value,x)=>{
      m.fillStyle=value==='2'?(enemies.every(enemy=>enemy.reading)?'#59f1e2':'#b48c38'):value==='1'?'#514473':'#1b1730';
      m.fillRect(ox+x*cell,oy+y*cell,cell-1,cell-1);
    }));
    enemies.forEach(enemy=>{m.fillStyle=enemy.reading?'#73f29a':'#ff5268';m.fillRect(ox+enemy.x*cell-2,oy+enemy.y*cell-2,4,4)});
    pickups.filter(p=>!p.taken).forEach(p=>{m.fillStyle='#ffe66b';m.fillRect(ox+p.x*cell-2,oy+p.y*cell-2,4,4)});
    m.save();m.translate(ox+player.x*cell,oy+player.y*cell);m.rotate(player.angle);m.fillStyle='#fff';m.beginPath();m.moveTo(6,0);m.lineTo(-4,-3);m.lineTo(-4,3);m.closePath();m.fill();m.restore();
  }
  function drawBookHands(){
    // Brazos, puños y libro en perspectiva para que el gesto de lanzar se lea mejor.
    ctx.fillStyle='#151027';ctx.beginPath();ctx.moveTo(0,H);ctx.lineTo(0,H-34);ctx.lineTo(W*.22,H-64);ctx.lineTo(W*.34,H);ctx.fill();
    ctx.beginPath();ctx.moveTo(W,H);ctx.lineTo(W,H-34);ctx.lineTo(W*.78,H-64);ctx.lineTo(W*.66,H);ctx.fill();
    ctx.fillStyle='#dba27e';ctx.fillRect(W*.28,H-49,W*.12,32);ctx.fillRect(W*.60,H-49,W*.12,32);
    drawFlyingBook(W/2,H-59,42,0);
  }
  function drawFlyingBook(x,y,size,angle){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#21133e';ctx.fillRect(-size*.52,-size*.34,size*1.04,size*.72);
    ctx.fillStyle='#f1e6c7';ctx.fillRect(-size*.46,-size*.32,size*.43,size*.64);ctx.fillRect(size*.03,-size*.32,size*.43,size*.64);
    ctx.fillStyle='#d65b9b';ctx.fillRect(-size*.03,-size*.33,size*.06,size*.66);
    ctx.fillStyle='#7ae5d5';ctx.fillRect(-size*.35,-size*.22,size*.18,size*.035);ctx.fillRect(size*.13,-size*.22,size*.18,size*.035);
    ctx.restore();
  }
  function createEnemySprite(type,reading){
    const s=document.createElement('canvas');s.width=192;s.height=256;const c=s.getContext('2d');
    c.scale(4,4);
    const r=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h)};
    const feminine=type.startsWith('woman-'),archetype=feminine?type.slice(6):type;
    r(8,60,34,4,'#100d1d');r(14,4,22,20,'#20182b');
    if(archetype==='car'&&!reading){
      r(4,38,40,15,'#cf354f');r(9,30,29,12,'#e94a68');r(14,24,18,12,'#f1bc8b');r(11,24,23,5,'#17142e');r(7,49,10,8,'#151323');r(32,49,10,8,'#151323');r(10,51,5,4,'#87909a');r(34,51,5,4,'#87909a');
      r(15,27,17,3,'#09091c');r(17,27,5,3,'#63e7df');r(25,27,5,3,'#63e7df');r(20,34,8,2,'#fff2da');
      r(5,38,36,3,'#ff8792');r(11,31,22,2,'#ff9c9f');r(8,46,6,2,'#ffdb75');r(34,46,6,2,'#ffdb75');
      if(feminine){r(16,20,4,10,'#713f32');r(31,20,4,10,'#713f32');r(19,20,13,4,'#95523b');r(18,27,3,2,'#ffd3a0')}
    }else if(reading){
      r(16,5,17,17,'#e9b991');r(15,3,20,6,'#514039');r(18,11,14,4,'#2b3048');r(13,23,24,26,'#343e70');r(21,23,8,25,'#f3eedc');r(17,49,5,12,'#211d37');r(29,49,5,12,'#211d37');
      r(12,33,12,12,'#e9b991');r(25,34,15,12,'#e9b991');r(23,34,13,11,'#f5e8cc');r(24,37,11,1,'#d7b969');r(24,40,11,1,'#d7b969');r(24,43,11,1,'#d7b969');
      r(16,6,4,4,'#f3d5b4');r(29,6,4,4,'#f3d5b4');r(16,14,6,2,'#423147');r(27,14,6,2,'#423147');
      if(feminine){r(12,4,5,21,'#713f32');r(34,4,5,21,'#713f32');r(16,3,20,5,'#824a36');r(18,5,4,2,'#a96645')}
      r(14,24,4,22,'#596ba6');r(32,24,4,22,'#596ba6');r(19,26,2,18,'#fff8e8');r(29,26,2,18,'#fff8e8');
      if(feminine){r(15,24,3,18,'#6b3b31');r(34,24,3,18,'#6b3b31');r(17,46,16,5,'#29355e');r(20,47,10,2,'#8596ca')}
      r(8,34,16,12,'#52351f');r(9,35,14,9,'#f7e8c7');r(10,37,11,1,'#d6bb70');r(10,40,11,1,'#d6bb70');r(10,43,8,1,'#d6bb70');
    }else{
      r(17,5,17,17,archetype==='selfie'?'#d99b72':'#efbf91');r(16,3,20,7,feminine?'#713f32':archetype==='selfie'?'#302127':'#39251c');
      if(feminine){r(15,4,4,20,'#713f32');r(32,4,5,20,'#713f32');r(18,3,14,4,'#95523b')}
      if(archetype==='muscle'||archetype==='selfie'){r(11,23,29,24,feminine?'#ba376f':'#5643a4');r(7,25,10,22,'#dca67e');r(38,25,8,22,'#dca67e');r(11,23,29,8,feminine?'#ed84b2':'#f04b8d')}
      else{r(14,23,25,25,'#267d70');r(10,25,7,19,'#efbd91');r(37,25,7,19,'#efbd91')}
      r(19,26,13,27,'#25223d');r(17,47,7,15,'#27233a');r(31,47,7,15,'#27233a');
      r(16,11,8,5,'#080a19');r(27,11,8,5,'#080a19');r(23,12,4,2,'#080a19');
      r(18,6,5,2,'#ffe0b0');r(30,6,4,2,'#ffe0b0');r(17,19,15,2,'#9d514f');
      if(archetype==='selfie'||archetype==='muscle'){r(12,24,3,16,'#f3c197');r(37,24,3,16,'#f3c197');r(13,27,2,9,'#ffd3a0');r(37,27,2,9,'#ffd3a0')}
      r(20,29,3,12,'#564a82');r(28,29,3,12,'#161729');
      if(archetype==='selfie'){r(40,17,6,12,'#31203f');r(41,16,7,7,'#78f1e2');r(43,18,3,2,'#fff5cb');r(40,23,8,2,'#3d345b');r(42,17,5,2,'#c0fff0');r(44,18,2,2,'#fff')}
      if(archetype==='money'){r(1,28,11,8,'#72e883');r(2,29,9,6,'#d6ffad');r(37,29,10,7,'#69de7a');r(3,30,3,4,'#fff3ad');r(39,30,6,2,'#baff93');r(39,33,6,2,'#40a65d')}
      if(archetype==='muscle'){r(10,30,7,7,'#f0b28b');r(39,30,7,7,'#f0b28b');r(11,31,5,2,'#ffd3ac');r(40,31,5,2,'#ffd3ac');r(17,24,8,6,'#745cc3');r(27,24,8,6,'#745cc3')}
      r(17,47,7,2,'#554b68');r(31,47,7,2,'#554b68');r(18,51,5,2,'#6d6477');r(31,51,5,2,'#6d6477');
    }
    c.save();c.globalCompositeOperation='source-atop';c.globalAlpha=.18;
    const light=c.createLinearGradient(0,0,s.width,s.height);light.addColorStop(0,'#fff4cf');light.addColorStop(.38,'#ffffff');light.addColorStop(1,'#1e327a');c.fillStyle=light;c.fillRect(0,0,s.width,s.height);c.restore();
    c.fillStyle='rgba(255,255,255,.65)';c.fillRect(17*4,8*4,3*4,1*4);c.fillRect(29*4,8*4,2*4,1*4);
    return s;
  }
  function drawVaccine(x,y,size){
    const c=ctx,time=performance.now(),bob=Math.sin(time/260+x*.03)*Math.max(2,size*.07),angle=Math.sin(time/500+x)*.14;
    c.save();c.translate(x,y+bob);c.rotate(-.48+angle);
    c.fillStyle='rgba(0,0,0,.38)';c.fillRect(-size*.12,size*.48,size*.62,size*.12);
    c.fillStyle='#c7efff';c.fillRect(-size*.08,-size*.28,size*.19,size*.66);
    c.fillStyle='#f4ffff';c.fillRect(-size*.055,-size*.24,size*.055,size*.57);
    c.fillStyle='#63eeb0';c.fillRect(-size*.075,size*.02,size*.18,size*.31);
    c.fillStyle='#3bb78f';c.fillRect(size*.045,size*.03,size*.06,size*.29);
    c.fillStyle='#eafaff';c.fillRect(-size*.13,-size*.35,size*.29,size*.1);
    c.fillStyle='#9dbbd8';c.fillRect(-size*.04,-size*.48,size*.12,size*.14);
    c.fillStyle='#fff';c.fillRect(-size*.015,-size*.48,size*.035,size*.12);
    c.fillStyle='#d9e8ff';c.fillRect(-size*.02,-size*.62,size*.035,size*.16);
    c.fillStyle='#9dbbd8';c.fillRect(-size*.17,size*.33,size*.37,size*.1);
    c.fillStyle='#fff';c.fillRect(-size*.14,size*.34,size*.08,size*.055);
    c.fillStyle='#253c70';c.fillRect(-size*.08,size*.1,size*.18,size*.025);c.fillRect(-size*.08,size*.2,size*.13,size*.025);
    c.restore();
  }
  const enemySpriteCache=new Map();
  function renderSprites(depth){
    const sprites=[];
    enemies.forEach(e=>{const dx=e.x-player.x,dy=e.y-player.y; sprites.push({kind:'enemy',item:e,dist:Math.hypot(dx,dy),angle:normalize(Math.atan2(dy,dx)-player.angle)})});
    pickups.filter(p=>!p.taken).forEach(p=>{const dx=p.x-player.x,dy=p.y-player.y;sprites.push({kind:'vaccine',item:p,dist:Math.hypot(dx,dy),angle:normalize(Math.atan2(dy,dx)-player.angle)})});
    sprites.sort((a,b)=>b.dist-a.dist);
    for(const sprite of sprites){
      if(Math.abs(sprite.angle)>FOV*.68||sprite.dist<.16)continue;
      const center=W/2+(sprite.angle/(FOV/2))*(W/2),z=depth[Math.max(0,Math.min(depth.length-1,Math.floor(center/2)))];
      if(sprite.dist>z+.3)continue;
      if(sprite.kind==='vaccine'){
        const size=Math.min(80,H/sprite.dist*.24);drawVaccine(center,H/2,size);
      }else{
        const scale=Math.min(H*1.35,H/sprite.dist*.92),width=scale*.75;
        const spriteKey=`${sprite.item.type}:${sprite.item.reading}`;
        if(!enemySpriteCache.has(spriteKey))enemySpriteCache.set(spriteKey,createEnemySprite(sprite.item.type,sprite.item.reading));
        const image=enemySpriteCache.get(spriteKey);
        ctx.fillStyle='rgba(0,0,0,.42)';ctx.beginPath();ctx.ellipse(center,H/2+scale*.43,width*.34,Math.max(2,scale*.035),0,0,Math.PI*2);ctx.fill();
        ctx.imageSmoothingEnabled=true;ctx.drawImage(image,center-width/2,H/2-scale*.56+Math.sin(performance.now()/180+sprite.item.id)*2,width,scale);
        if(!sprite.item.reading&&sprite.dist<5){
          const labelY=H/2-scale*.62;
          ctx.fillStyle='#100b25';ctx.fillRect(center-width*.38,labelY-11,width*.76,9);
          for(let i=0;i<sprite.item.maxHits;i++){ctx.fillStyle=i<sprite.item.hitsLeft?'#ffcf53':'#57435d';ctx.fillRect(center-width*.35+i*8,labelY-9,6,5)}
          if(performance.now()<sprite.item.flash){ctx.fillStyle='#fff';ctx.globalAlpha=.75;ctx.fillRect(center-width/2,H/2-scale*.56,width,scale);ctx.globalAlpha=1}
        }
      }
    }
  }
  function setKeyMove(event,pressed){
    const key=event.key.toLowerCase(),map={w:'forward',arrowup:'forward',s:'back',arrowdown:'back',a:'left',arrowleft:'left',d:'right',arrowright:'right'};
    if(map[key]){event.preventDefault();if(pressed)move(map[key])}
    if(pressed&&(key===' '||key==='spacebar')){event.preventDefault();fire()}
  }
  window.addEventListener('keydown',event=>setKeyMove(event,true));
  window.addEventListener('keyup',()=>{});
  document.querySelectorAll('[data-move]').forEach(button=>{
    const action=button.dataset.move;
    button.addEventListener('pointerdown',event=>{
      event.preventDefault();move(action);clearInterval(heldTimer);heldTimer=setInterval(()=>move(action),145);
    });
    ['pointerup','pointerleave','pointercancel'].forEach(name=>button.addEventListener(name,()=>clearInterval(heldTimer)));
  });
  $('#fire-button').addEventListener('click',fire);
  let dragX=null,dragged=false;
  canvas.addEventListener('pointerdown',event=>{dragX=event.clientX;dragged=false;canvas.setPointerCapture(event.pointerId)});
  canvas.addEventListener('pointermove',event=>{
    if(dragX===null||!event.buttons)return;
    const delta=event.clientX-dragX;dragX=event.clientX;
    if(Math.abs(delta)>2)dragged=true;
    if(player&&delta) {player.angle+=delta*.008;render()}
  });
  canvas.addEventListener('pointerup',()=>{dragX=null});
  canvas.addEventListener('click',()=>{if(!dragged)fire();dragged=false});
  $('#start-button').addEventListener('click',()=>{requestLandscape();startGame()});
  $('#sound-toggle').addEventListener('click',event=>{
    soundOn=!soundOn;event.currentTarget.textContent=soundOn?'♫ sonido activado':'♫ sonido apagado';
    event.currentTarget.setAttribute('aria-pressed',String(soundOn));beep();
  });
  updateHud();
})();
