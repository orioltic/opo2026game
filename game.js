(() => {
  const cfg = window.GAME_CONFIG;
  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#viewport'), ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, FOV = Math.PI / 3;
  const focal = W / (2 * Math.tan(FOV / 2));
  const horizon = H / 2;
  const rayStep = 2;
  const arcade = $('.arcade');
  const touchMoves = new Map();
  let levelIndex = 0, energy = cfg.startingEnergy, player, enemies = [], pickups = [];
  let questionOrder = [], questionIndex = 0, activePickup = null, ended = false, quizMode = 'pickup';
  let soundOn = false, audio, lastDamage = 0, toastTimer, enemyLoop = null;
  let knowledge = 0, projectile = null, lastFrame = 0;
  const bookMethods=cfg.bookMethods||['Aula Invertida','Gamificación','ABP','ApS','Juegos Serios'];
  let readyBookMethod=bookMethods[Math.floor(Math.random()*bookMethods.length)];
  const orientationGate=$('#orientation-gate');
  const touchPointer=matchMedia('(pointer: coarse)');
  const narrowScreen=matchMedia('(max-width: 1024px)');
  function syncOrientation(){
    const mobile=touchPointer.matches||(navigator.maxTouchPoints>0&&narrowScreen.matches);
    const needsLandscape=mobile&&matchMedia('(orientation: portrait)').matches;
    orientationGate.hidden=!needsLandscape;
    arcade.inert=needsLandscape;
    document.body.classList.toggle('mobile-landscape',mobile&&!needsLandscape);
    document.body.classList.toggle('needs-landscape',needsLandscape);
    if(needsLandscape)releaseTouchMoves();
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
    toastTimer=setTimeout(()=>$('#toast').textContent='Motiva a los estudiantes y encuentra la salida.',2300);
  }
  function beep(frequency=540){
    if(!soundOn)return;
    try{audio ||= new(window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type='square';o.frequency.value=frequency;g.gain.value=.035;o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.08)}catch(_){}
  }
  function updateHud(){
    $('#energy-count').textContent=`${energy} / ${cfg.maxEnergy}`;
    $('#energy-pips').textContent='● '.repeat(energy);
    $('#energy-pips').setAttribute('aria-label',`${energy} puntos de valoración docente`);
    $('#level-name').textContent=activeLevel().title.toUpperCase();
    const turned=enemies.filter(enemy=>enemy.reading).length;
    $('#enemy-count').textContent=`${turned} / ${enemies.length}`;
  }
  function resetLevel(){
    const level=activeLevel();
    player={x:1.5,y:1.5,angle:0};
    enemies=level.enemies.map((enemy,index)=>({...enemy,id:index,reading:false,cheerUntil:0,hitsLeft:enemy.hits||2,maxHits:enemy.hits||2,flash:0}));
    pickups=level.energyPickups.map((pickup,index)=>({...pickup,id:index,taken:false}));
    questionOrder=cfg.questions.map((_,i)=>i).sort(()=>Math.random()-.5);questionIndex=0;quizMode='pickup';
    activePickup=null;ended=false;lastDamage=-Infinity;projectile=null;
    $('#quiz-panel').hidden=true;$('#end-panel').hidden=true;
    showToast('Motiva a los estudiantes y encuentra la salida.');
    updateHud();render();startEnemyLoop();
  }
  function startGame(){
    levelIndex=0;energy=cfg.startingEnergy;knowledge=0;
    $('#start-screen').hidden=true;$('#play-screen').hidden=false;
    $('#screen-label').textContent='FASE 1 // PREPARA EL LIBRO';resetLevel();
  }
  function wallAt(x,y){
    const t=tileAt(x,y);
    return t==='1'||(t==='2'&&enemies.some(enemy=>!enemy.reading));
  }
  function canPlay(){
    return player&&!ended&&activePickup===null&&!document.body.classList.contains('needs-landscape');
  }
  function move(action){
    if(!canPlay())return;
    if(action==='left'){player.angle-=.17;render();return}
    if(action==='right'){player.angle+=.17;render();return}
    const direction=action==='back'?-1:1,step=.19;
    const nx=player.x+Math.cos(player.angle)*step*direction;
    const ny=player.y+Math.sin(player.angle)*step*direction;
    const next=tileAt(nx,ny);
    if(next==='2'){
      if(enemies.every(enemy=>enemy.reading)){activePickup='exit';openQuestion('exit');return}
      showToast('La salida se abrirá cuando todo el grupo esté motivado.');return;
    }
    const radius=.16;
    if(!wallAt(nx-radius,player.y-radius)&&!wallAt(nx+radius,player.y-radius)&&
       !wallAt(nx-radius,player.y+radius)&&!wallAt(nx+radius,player.y+radius))player.x=nx;
    if(!wallAt(player.x-radius,ny-radius)&&!wallAt(player.x+radius,ny-radius)&&
       !wallAt(player.x-radius,ny+radius)&&!wallAt(player.x+radius,ny+radius))player.y=ny;
    checkContact();checkPickups();render();
  }
  function checkContact(){
    const now=performance.now();
    if(now-lastDamage<1000)return;
    const touching=enemies.find(e=>!e.reading&&Math.hypot(e.x-player.x,e.y-player.y)<.56);
    if(!touching)return;
    energy=Math.max(0,energy-1);lastDamage=now;updateHud();beep(170);
    showToast('Pierdes un punto de valoración.');
    if(energy===0)gameOver();
  }
  function updateEnemies(seconds){
    for(const enemy of enemies){
      if(enemy.reading)continue;
      // El alumnado recorre el mapa por rutas aleatorias; no persigue ni ataca al jugador.
      if(!enemy.path?.length&&performance.now()>=(enemy.nextWander||0))chooseWanderPath(enemy);
      const waypoint=enemy.path?.[0];if(!waypoint)continue;
      const wx=waypoint.x-enemy.x,wy=waypoint.y-enemy.y,wd=Math.hypot(wx,wy),step=seconds*.4;
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
    cancelAnimationFrame(enemyLoop);
    lastFrame=performance.now();
    enemyLoop=requestAnimationFrame(frame);
  }
  function frame(now){
    const elapsed=now-lastFrame;
    if(elapsed>=30){
      lastFrame=now;
      if(canPlay()){
        const delta=Math.min(elapsed,65);
        updateEnemies(delta/1000);
        if(canPlay()&&projectile){
          projectile.elapsed+=delta;
          if(projectile.elapsed>=projectile.duration)finishProjectile();
        }
        render();
      }
    }
    if(!ended)enemyLoop=requestAnimationFrame(frame);
  }
  function checkPickups(){
    const found=pickups.find(p=>!p.taken&&Math.hypot(p.x-player.x,p.y-player.y)<.45);
    if(found){found.taken=true;activePickup=found.id;openQuestion('pickup')}
  }
  function openQuestion(mode='pickup'){
    quizMode=mode;
    if(questionIndex>=questionOrder.length){questionOrder=cfg.questions.map((_,i)=>i).sort(()=>Math.random()-.5);questionIndex=0}
    const question=cfg.questions[questionOrder[questionIndex++]];
    $('#quiz-panel').querySelector('.eyebrow').textContent=mode==='exit'?'PREGUNTA PARA ABRIR LA SALIDA':'ESTRELLA DE VALORACIÓN';
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
          const gained=energy<cfg.maxEnergy;energy=Math.min(cfg.maxEnergy,energy+1);
          $('#quiz-result').textContent=gained?'¡Correcto! Ganas un punto de valoración docente.':'¡Correcto! Ya tienes el máximo de valoraciones docentes.';
          beep(760);
        }else{
          button.classList.add('incorrect');options.children[correctPosition].classList.add('correct');
          $('#quiz-result').textContent=quizMode==='exit'?'No es correcta. Responde otra pregunta para abrir la salida.':'Respuesta incorrecta: no ganas el punto de valoración.';
        }
        updateHud();$('#quiz-continue').textContent=quizMode==='exit'?'OTRA PREGUNTA':'CONTINUAR';$('#quiz-continue').hidden=false;
      });
      options.append(button);
    });
    releaseTouchMoves();
    $('#quiz-panel').hidden=false;options.firstElementChild?.focus();beep(620);
  }
  $('#quiz-continue').addEventListener('click',()=>{
    if(quizMode==='exit'){openQuestion('exit');return}
    $('#quiz-panel').hidden=true;activePickup=null;canvas.focus({preventScroll:true});render();
  });

  function gameOver(){
    ended=true;cancelAnimationFrame(enemyLoop);releaseTouchMoves();$('#end-eyebrow').textContent='FIN DE LA PARTIDA';
    $('#end-title').textContent='Sin puntos de valoración';$('#end-message').textContent='Reinicia la fase para volver a intentarlo.';
    $('#download-pdf').hidden=true;$('#continue-button').hidden=true;$('#retry-button').hidden=false;$('#end-panel').hidden=false;
    $('#screen-label').textContent='PARTIDA INTERRUMPIDA';
    $('#retry-button').focus();
  }
  function completeLevel(){
    ended=true;cancelAnimationFrame(enemyLoop);releaseTouchMoves();
    $('#quiz-panel').hidden=true;
    const last=levelIndex===cfg.levels.length-1;
    $('#end-eyebrow').textContent=last?'MISIÓN COMPLETADA':`FASE ${levelIndex+1} SUPERADA`;
    $('#end-title').textContent=activeLevel().title;
    $('#end-message').textContent=last?'Has completado las tres fases. Tu documento está desbloqueado.':'Has respondido correctamente. Tu documento está desbloqueado.';
    $('#download-pdf').hidden=false;$('#continue-button').hidden=last;$('#retry-button').hidden=true;$('#end-panel').hidden=false;
    const pdf=$('#download-pdf');
    pdf.href=activeLevel().pdf;
    pdf.textContent=`Abrir PDF · ${activeLevel().title}`;
    pdf.focus();
    $('#continue-button').textContent=last?'MISIÓN COMPLETADA':'SIGUIENTE FASE';
    $('#screen-label').textContent=last?'MISIÓN COMPLETADA':`FASE ${levelIndex+1} // PDF DESBLOQUEADO`;
    beep(880);
  }
  $('#continue-button').addEventListener('click',()=>{
    if(levelIndex>=cfg.levels.length-1)return;
    levelIndex++;$('#end-panel').hidden=true;$('#screen-label').textContent=`FASE ${levelIndex+1}`;
    resetLevel();canvas.focus({preventScroll:true});
  });
  $('#retry-button').addEventListener('click',()=>{
    energy=cfg.startingEnergy;$('#end-panel').hidden=true;$('#screen-label').textContent=`FASE ${levelIndex+1}`;
    resetLevel();canvas.focus({preventScroll:true});
  });

  function fire(){
    if(!canPlay()||projectile)return;
    const target=enemies.filter(e=>!e.reading).map(e=>{
      const dx=e.x-player.x,dy=e.y-player.y,dist=Math.hypot(dx,dy);
      let delta=Math.atan2(dy,dx)-player.angle;
      while(delta>Math.PI)delta-=Math.PI*2;while(delta< -Math.PI)delta+=Math.PI*2;
      return{enemy:e,dist,delta};
    }).filter(item=>item.dist<5.5&&Math.abs(item.delta)<.20&&lineOfSight(item.enemy.x,item.enemy.y))
      .sort((a,b)=>a.dist-b.dist)[0];
    const method=readyBookMethod;
    readyBookMethod=bookMethods[Math.floor(Math.random()*bookMethods.length)];
    projectile={elapsed:0,duration:360,target:target?.enemy,method};
    showToast(`LIBRO: ${method}`);beep(380);render();
  }
  function finishProjectile(){
      const hit=projectile.target,method=projectile.method;projectile=null;
      if(hit&&!hit.reading){hit.hitsLeft--;hit.flash=performance.now()+260;beep(700);
        if(hit.hitsLeft<=0){hit.reading=true;hit.cheerUntil=performance.now()+1500;showToast(`¡${method}! ¡Se anima a aprender!`);if(enemies.every(enemy=>enemy.reading))showToast('¡Todo el grupo está motivado! Busca la salida.');}
        else showToast(`¡${method}! Quedan ${hit.hitsLeft} impactos para animarle.`);
      }else{showToast(`¡${method}! El libro no alcanzó a nadie. Ajusta la mira.`);beep(250)}
      updateHud();
  }
  function lineOfSight(x,y){return clearPath(player.x,player.y,x,y)}
  function clearPath(startX,startY,x,y){
    const dx=x-startX,dy=y-startY,distance=Math.hypot(dx,dy),steps=Math.ceil(distance/.08);
    for(let i=1;i<steps;i++)if(tileAt(startX+dx*i/steps,startY+dy*i/steps)!=='0')return false;
    return true;
  }
  function enemyBob(enemy,now,scale){return Math.sin(now/210+enemy.id)*Math.max(1,scale*.012)}
  function hexRgb(hex){return[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]}
  function shade(hex,mul){const c=hexRgb(hex);return `rgb(${Math.floor(c[0]*mul)},${Math.floor(c[1]*mul)},${Math.floor(c[2]*mul)})`}
  const textureSize=128;
  const scenery=new Map();
  function makeTexture(paint){
    const texture=document.createElement('canvas');
    texture.width=texture.height=textureSize;
    paint(texture.getContext('2d'));
    return texture;
  }
  function levelTextures(colors){
    if(scenery.has(colors))return scenery.get(colors);
    const [base,wall,accent]=colors;
    const walls=makeTexture(c=>{
      c.fillStyle=shade(base,.55);c.fillRect(0,0,128,128);
      for(let row=0;row<5;row++){
        for(let x=row%2?-32:0;x<128;x+=64){
          const y=row*23+6;
          c.fillStyle=shade(wall,.73+(row%3)*.08);c.fillRect(x+1,y,62,21);
          c.fillStyle='#ffffff24';c.fillRect(x+1,y,62,2);
          c.fillStyle='#0d132644';c.fillRect(x+1,y+18,62,3);
          for(let i=0;i<10;i++){
            c.fillStyle=i%2?'#07142124':'#ffffff21';
            c.fillRect(x+(i*23+row*13)%57+2,y+3+(i*7)%12,4,1);
          }
        }
      }
      c.fillStyle=shade(base,.68);c.fillRect(0,109,128,19);c.fillRect(0,0,128,7);
      c.fillStyle=shade(accent,.7);c.fillRect(0,7,128,2);c.fillRect(0,109,128,2);
    });
    const shelves=makeTexture(c=>{
      c.drawImage(walls,0,0);
      c.fillStyle='#342432';c.fillRect(9,12,110,101);
      c.fillStyle='#151824';c.fillRect(14,17,100,91);
      const bindings=[accent,'#dfac61','#a55265','#638ac0','#af9a81'];
      for(let row=0;row<3;row++){
        const bottom=44+row*30;
        for(let i=0;i<11;i++){
          const x=17+i*8,bookHeight=14+(i*5+row*7)%11;
          c.fillStyle=bindings[(i+row*3)%bindings.length];c.fillRect(x,bottom-bookHeight,7,bookHeight);
          c.fillStyle='#ffffff70';c.fillRect(x+1,bottom-6,5,1);
        }
        c.fillStyle='#a27666';c.fillRect(12,bottom,104,2);
        c.fillStyle='#513b46';c.fillRect(12,bottom+2,104,3);
      }
    });
    const doors=[false,true].map(open=>makeTexture(c=>{
      c.fillStyle='#20293a';c.fillRect(0,0,128,128);
      c.fillStyle='#798293';c.fillRect(4,2,120,126);
      c.fillStyle=open?'#245b53':'#293347';c.fillRect(10,8,108,120);
      c.fillStyle='#0c1421';c.fillRect(20,32,88,82);
      c.fillStyle=open?'#458478':'#43536c';c.fillRect(24,35,80,77);
      c.fillStyle='#0c142155';c.fillRect(62,35,4,77);
      c.fillStyle=open?'#aaf0bd':'#ffb872';c.fillRect(23,13,82,15);
      c.fillStyle='#181b2b';c.font='bold 11px monospace';c.textAlign='center';c.fillText('SALIDA',64,24);
      c.fillStyle=open?'#aaf0bd':'#ffb872';c.fillRect(89,70,7,7);
    }));
    const textures={walls,shelves,doors,base:hexRgb(base)};
    scenery.set(colors,textures);
    return textures;
  }
  const ground=document.createElement('canvas');
  ground.width=W/2;ground.height=H/2;
  const groundCtx=ground.getContext('2d');
  const groundPixels=groundCtx.createImageData(ground.width,ground.height);
  const groundColors=new Uint32Array(groundPixels.data.buffer);
  function renderGround(cos,sin,base){
    const width=ground.width,height=ground.height;
    for(let y=0;y<height;y++){
      const depth=horizon/Math.max(1,Math.abs(2*y+1-horizon));
      const across=depth*W/focal;
      const stepX=-sin*across/width,stepY=cos*across/width;
      let x=player.x+depth*cos+sin*across/2;
      let z=player.y+depth*sin-cos*across/2;
      const ceiling=y<height/2,light=.28+.72/(1+depth*.23);
      for(let i=0;i<width;i++,x+=stepX,z+=stepY){
        const tx=Math.floor(x),tz=Math.floor(z);
        const edge=x-tx<.035||z-tz<.035;
        const tint=light*(edge?.52:((tx+tz)&1)?.88:1);
        const r=(base[0]*.52+(ceiling?17:37))*tint;
        const g=(base[1]*.57+(ceiling?20:35))*tint;
        const b=(base[2]*.57+(ceiling?33:39))*tint;
        groundColors[y*width+i]=0xff000000|(b<<16)|(g<<8)|r;
      }
    }
    groundCtx.putImageData(groundPixels,0,0);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(ground,0,0,W,H);
  }
  function render(){
    if(!player)return;
    const textures=levelTextures(activeLevel().palette);
    const cos=Math.cos(player.angle),sin=Math.sin(player.angle);
    const unlocked=enemies.every(enemy=>enemy.reading);
    renderGround(cos,sin,textures.base);
    const depth=[];
    for(let sx=0;sx<W;sx+=rayStep){
      const camera=(sx+rayStep/2-W/2)/focal;
      const rx=cos-sin*camera,ry=sin+cos*camera;
      let mx=Math.floor(player.x),my=Math.floor(player.y),side=0,hit='0';
      const deltaX=Math.abs(1/(rx||.00001)),deltaY=Math.abs(1/(ry||.00001));
      const stepX=rx<0?-1:1,stepY=ry<0?-1:1;
      let sideX=(rx<0?player.x-mx:mx+1-player.x)*deltaX;
      let sideY=(ry<0?player.y-my:my+1-player.y)*deltaY;
      for(let n=0;n<40;n++){
        if(sideX<sideY){sideX+=deltaX;mx+=stepX;side=0}else{sideY+=deltaY;my+=stepY;side=1}
        hit=tileAt(mx+.001,my+.001);if(hit!=='0')break;
      }
      const distance=Math.max(.08,side===0?sideX-deltaX:sideY-deltaY);
      depth[sx/rayStep]=distance;
      const line=Math.ceil(H/distance),top=Math.floor(horizon-line/2);
      const hitPosition=side===0?player.y+distance*ry:player.x+distance*rx;
      let tx=Math.floor((hitPosition-Math.floor(hitPosition))*textureSize);
      if((side===0&&rx>0)||(side===1&&ry<0))tx=textureSize-1-tx;
      const texture=hit==='2'?textures.doors[Number(unlocked)]:
        (mx*13+my*7+side)%5===0?textures.shelves:textures.walls;
      ctx.drawImage(texture,tx,0,1,textureSize,sx,top,rayStep,line);
      ctx.globalAlpha=Math.min(.73,distance*.064+(side===1?.14:0));
      ctx.fillStyle='#0b1020';ctx.fillRect(sx,top,rayStep,line);ctx.globalAlpha=1;
    }
    renderSprites(depth);
    // Retícula y libro preparado para salir volando.
    ctx.fillStyle='#fff6c7';ctx.fillRect(W/2-5,H/2,10,2);ctx.fillRect(W/2,H/2-5,2,10);
    if(projectile){
      const progress=projectile.elapsed/projectile.duration;
      const y=(H-72)*(1-progress)+horizon*progress-Math.sin(progress*Math.PI)*24;
      drawFlyingBook(W/2+Math.sin(progress*Math.PI)*21,y,152-124*progress,Math.sin(progress*Math.PI)*.3,projectile.method);
    }else drawBookHands(readyBookMethod);
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
    enemies.forEach(enemy=>{m.fillStyle=enemy.reading?'#73f29a':'#ffb85c';m.fillRect(ox+enemy.x*cell-2,oy+enemy.y*cell-2,4,4)});
    pickups.filter(p=>!p.taken).forEach(p=>{m.fillStyle='#ffe66b';m.fillRect(ox+p.x*cell-2,oy+p.y*cell-2,4,4)});
    m.save();m.translate(ox+player.x*cell,oy+player.y*cell);m.rotate(player.angle);m.fillStyle='#fff';m.beginPath();m.moveTo(6,0);m.lineTo(-4,-3);m.lineTo(-4,3);m.closePath();m.fill();m.restore();
  }
  function drawBookHands(method){
    for(const side of [-1,1]){
      ctx.save();ctx.translate(W/2,H);ctx.scale(side,1);
      ctx.fillStyle='#141b2d';ctx.beginPath();ctx.moveTo(84,0);ctx.lineTo(87,-29);
      ctx.lineTo(149,-19);ctx.lineTo(192,0);ctx.fill();
      ctx.fillStyle='#384b64';ctx.fillRect(87,-25,48,9);
      ctx.fillStyle='#647890';ctx.fillRect(87,-25,15,14);
      ctx.fillStyle='#a46752';ctx.fillRect(68,-44,25,24);
      ctx.fillStyle='#dfab82';ctx.fillRect(69,-46,24,18);
      ctx.fillStyle='#f2c29a';ctx.fillRect(69,-46,16,5);
      ctx.restore();
    }
    drawFlyingBook(W/2,H-72,152,0,method);
  }
  function drawFlyingBook(x,y,size,angle,label=''){
    const covers={'Aula Invertida':'#235b77','Gamificación':'#8e345d','ABP':'#48613b','ApS':'#824828','Juegos Serios':'#503e85'};
    const lines=label==='Aula Invertida'?['Aula','Invertida']:label==='Juegos Serios'?['Juegos','Serios']:[label];
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.imageSmoothingEnabled=true;
    ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillRect(-size*.48,-size*.26,size*.98,size*.68);
    ctx.fillStyle='#f3e8d1';ctx.fillRect(-size*.42,-size*.31,size*.88,size*.62);
    ctx.fillStyle=covers[label]||'#493875';ctx.fillRect(-size*.5,-size*.36,size*.92,size*.67);
    ctx.fillStyle='#ffffff33';ctx.fillRect(-size*.45,-size*.32,size*.82,size*.06);
    ctx.fillStyle='#241536';ctx.fillRect(-size*.5,-size*.36,size*.1,size*.67);
    ctx.strokeStyle='#ffd68c';ctx.lineWidth=Math.max(1,size*.012);
    ctx.strokeRect(-size*.36,-size*.24,size*.74,size*.44);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff8e8';
    ctx.font=`bold ${Math.max(4,size*.125)}px "Courier New", monospace`;
    const lineHeight=Math.max(5,size*.15),startY=-((lines.length-1)*lineHeight)/2;
    lines.forEach((line,index)=>ctx.fillText(line,0,startY+index*lineHeight,size*.74));
    ctx.restore();
  }
  function createEnemySprite(type,reading,variantIndex=0){
    const s=document.createElement('canvas');s.width=192;s.height=256;const c=s.getContext('2d');
    const variants=[
      {skin:'#f4c8a5',hair:'#342422',shirt:'#3b73a5',pants:'#27324d'},
      {skin:'#d99770',hair:'#241d1d',shirt:'#b84968',pants:'#34324b'},
      {skin:'#f0d0b0',hair:'#9b623b',shirt:'#3a907f',pants:'#3c4055'},
      {skin:'#9b614b',hair:'#211a18',shirt:'#a87532',pants:'#253b58'},
      {skin:'#eab28f',hair:'#493129',shirt:'#7755a5',pants:'#31354d'},
      {skin:'#c78362',hair:'#201b1c',shirt:'#4c8b50',pants:'#40344f'}
    ];
    const seed=[...type].reduce((n,ch)=>n+ch.charCodeAt(0),0)+variantIndex*7,v=variants[seed%variants.length];
    const girl=type.startsWith('girl-'),hairStyle=type.split('-')[1]||'short';
    const rounded=(x,y,w,h,r,color)=>{c.fillStyle=color;c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();c.fill()};
    const line=(points,color,width)=>{c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(points[0][0],points[0][1]);points.slice(1).forEach(p=>c.lineTo(p[0],p[1]));c.stroke()};
    const ellipse=(x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill()};
    const shirt=c.createLinearGradient(42,0,150,0);shirt.addColorStop(0,shade(v.shirt,.68));shirt.addColorStop(.46,v.shirt);shirt.addColorStop(1,shade(v.shirt,.74));
    const pants=c.createLinearGradient(60,0,132,0);pants.addColorStop(0,shade(v.pants,.65));pants.addColorStop(.5,v.pants);pants.addColorStop(1,shade(v.pants,.72));
    const hairBack=hairStyle==='long'||hairStyle==='wavy';

    // Piernas, mochila y zapatos con sombras suaves de sprite de aventura.
    if(hairBack)rounded(43,112,106,88,35,shade(v.hair,.7));
    rounded(70,185,24,53,9,pants);rounded(99,185,24,53,9,pants);
    rounded(65,230,34,17,7,'#23253b');rounded(96,230,35,17,7,'#23253b');
    rounded(69,233,23,4,2,'#d4d8e5');rounded(100,233,23,4,2,'#d4d8e5');
    if(reading){
      line([[56,130],[35,110],[28,77]],shade(v.skin,.82),19);
      line([[136,130],[157,108],[163,75]],shade(v.skin,.82),19);
      ellipse(27,71,9,11,v.skin);ellipse(164,69,9,11,v.skin);
    }else{
      line([[57,130],[42,157],[47,183]],shade(v.skin,.82),17);
      line([[135,130],[150,157],[145,183]],shade(v.skin,.82),17);
    }

    // Sudadera y mochila, con pliegues y costuras visibles a distancia.
    rounded(47,111,98,91,25,shirt);
    rounded(40,124,24,56,11,shade(v.shirt,.78));rounded(128,124,24,56,11,shade(v.shirt,.78));
    line([[59,124],[68,140],[96,148],[124,140],[133,124]],shade(v.shirt,1.16),4);
    line([[70,158],[70,188]],'#ffffff45',2);line([[122,158],[122,188]],'#100b2533',2);
    rounded(82,150,28,30,4,'#211d34');rounded(85,153,22,24,2,'#eee4cb');
    c.fillStyle='#bc9c58';c.fillRect(89,158,14,2);c.fillRect(89,164,14,2);c.fillRect(89,170,11,2);
    line([[77,194],[96,198],[115,194]],shade(v.shirt,.72),3);

    // Cuello, orejas y cara. Al principio mira abajo; al motivarse mira al frente.
    rounded(82,91,29,31,9,shade(v.skin,.88));
    ellipse(63,71,8,13,v.skin);ellipse(129,71,8,13,v.skin);
    const face=c.createLinearGradient(56,45,136,112);face.addColorStop(0,shade(v.skin,.8));face.addColorStop(.42,v.skin);face.addColorStop(1,shade(v.skin,.82));
    ellipse(96,72,39,48,face);
    if(hairBack){
      rounded(53,48,16,70,9,v.hair);rounded(123,48,16,70,9,shade(v.hair,.8));
      line([[60,103],[63,116]],shade(v.hair,1.18),3);line([[132,102],[129,116]],shade(v.hair,1.1),3);
    }
    if(hairStyle==='curly'){
      for(let i=0;i<7;i++)ellipse(62+i*11,38+(i%2)*-4,10,11,i%2?shade(v.hair,1.14):v.hair);
    }else if(hairStyle==='wavy'){
      for(let i=0;i<5;i++)ellipse(67+i*13,37+(i%2)*-3,11,10,i%2?shade(v.hair,1.12):v.hair);
      line([[57,45],[65,55],[72,45],[81,53],[91,43],[102,52],[113,43],[123,51],[134,42]],v.hair,12);
    }else{
      rounded(57,28,78,25,13,v.hair);
      line([[59,43],[71,52],[83,42],[95,50],[108,40],[120,49],[134,42]],v.hair,10);
    }
    // Fine hair highlights add depth without losing the retro palette.
    line([[75,32],[90,29]],shade(v.hair,1.45),2);
    line([[105,30],[118,34]],shade(v.hair,1.3),2);

    if(reading){
      ellipse(79,72,8,7,'#fff6e8');ellipse(112,72,8,7,'#fff6e8');
      ellipse(80,72,3.3,4.2,'#25324b');ellipse(111,72,3.3,4.2,'#25324b');
      line([[70,61],[84,59]],shade(v.hair,.8),3);line([[106,59],[121,61]],shade(v.hair,.8),3);
      line([[82,94],[90,99],[99,100],[109,94]],'#8e3d55',3);
      ellipse(71,84,5,2,'#f29c91');ellipse(121,84,5,2,'#f29c91');
    }else{
      ellipse(79,75,8,6,'#f7f0e3');ellipse(112,75,8,6,'#f7f0e3');
      ellipse(80,79,3.2,2.8,'#30314a');ellipse(111,79,3.2,2.8,'#30314a');
      line([[69,64],[80,69],[87,72]],shade(v.hair,.75),4);line([[104,72],[112,69],[122,64]],shade(v.hair,.75),4);
      line([[83,97],[94,102],[107,97]],'#774855',3);
      ellipse(70,86,5,2,'#edaa98');ellipse(122,86,5,2,'#edaa98');
    }
    line([[95,77],[91,87],[97,89]],shade(v.skin,.72),2);
    // Distinct hairline and simple accessories vary the student group naturally.
    if(seed%3===0){rounded(69,70,19,13,4,'transparent');c.strokeStyle='#dbe8ee';c.lineWidth=2;c.strokeRect(69,70,19,13);c.strokeRect(104,70,19,13);line([[88,75],[104,75]],'#dbe8ee',2)}
    if(girl){ellipse(59,86,3,4,'#ffd56c');ellipse(133,86,3,4,'#ffd56c')}
    if(reading){
      // Gesto de celebración y salto; el personaje queda orientado hacia el jugador.
      line([[29,79],[24,65]],'#fff3bd',3);line([[164,77],[170,62]],'#fff3bd',3);
      ellipse(18,53,3,3,'#ffe66b');ellipse(176,51,3,3,'#59f1e2');
    }else{
      // Hombros bajos, cabeza inclinada y ojos dirigidos al suelo.
      line([[54,116],[69,127]],shade(v.shirt,.62),5);line([[138,116],[123,127]],shade(v.shirt,.62),5);
    }
    return s;
  }
  function drawEnergy(x,y,size){
    const c=ctx,time=performance.now(),bob=Math.sin(time/240+x*.03)*Math.max(2,size*.07),pulse=1+Math.sin(time/180+x)*.08;
    c.save();c.translate(x,y+bob);c.scale(pulse,pulse);
    c.fillStyle='rgba(0,0,0,.38)';c.beginPath();c.ellipse(0,size*.42,size*.29,size*.09,0,0,Math.PI*2);c.fill();
    const glow=c.createRadialGradient(0,0,size*.04,0,0,size*.46);glow.addColorStop(0,'#fff8c6');glow.addColorStop(.34,'#ffe66b');glow.addColorStop(1,'#ff579e00');
    c.fillStyle=glow;c.beginPath();c.arc(0,0,size*.46,0,Math.PI*2);c.fill();
    c.fillStyle='#ffe66b';c.beginPath();c.moveTo(0,-size*.37);c.lineTo(size*.1,-size*.12);c.lineTo(size*.34,-size*.1);c.lineTo(size*.16,size*.07);c.lineTo(size*.23,size*.32);c.lineTo(0,size*.18);c.lineTo(-size*.23,size*.32);c.lineTo(-size*.16,size*.07);c.lineTo(-size*.34,-size*.1);c.lineTo(-size*.1,-size*.12);c.closePath();c.fill();
    c.strokeStyle='#fff8d7';c.lineWidth=Math.max(1,size*.035);c.stroke();
    c.fillStyle='#fff';c.fillRect(-size*.035,-size*.19,size*.07,size*.36);c.fillRect(-size*.18,-size*.045,size*.36,size*.07);
    c.restore();
  }
  const enemySpriteCache=new Map();
  function renderSprites(depth){
    const cos=Math.cos(player.angle),sin=Math.sin(player.angle);
    const sprites=[];
    function addSprite(kind,item){
      const dx=item.x-player.x,dy=item.y-player.y,dist=dx*cos+dy*sin;
      if(dist<.16)return;
      sprites.push({kind,item,dist,center:W/2+focal*(dy*cos-dx*sin)/dist});
    }
    enemies.forEach(enemy=>addSprite('enemy',enemy));
    pickups.filter(p=>!p.taken).forEach(p=>addSprite('energy',p));
    sprites.sort((a,b)=>b.dist-a.dist);
    for(const sprite of sprites){
      const {center,dist}=sprite;
      const scale=Math.min(H*1.35,H/dist*.82),width=scale*.75;
      const radius=sprite.kind==='energy'?Math.min(80,H/dist*.24):width/2;
      const first=Math.max(0,Math.floor((center-radius)/rayStep));
      const last=Math.min(depth.length,Math.ceil((center+radius)/rayStep));
      let visible=false;
      ctx.save();ctx.beginPath();
      for(let i=first;i<last;i++){
        if(dist>depth[i]+.05)continue;
        ctx.rect(i*rayStep,0,rayStep,H);visible=true;
      }
      if(!visible){ctx.restore();continue}
      ctx.clip();
      const foot=horizon+Math.min(H*.64,H/(2*dist));
      if(sprite.kind==='energy'){
        drawEnergy(center,foot-radius*.75,radius);
      }else{
        const variantIndex=sprite.item.id+levelIndex*4,spriteKey=`${sprite.item.type}:${sprite.item.reading}:${variantIndex}`;
        if(!enemySpriteCache.has(spriteKey))enemySpriteCache.set(spriteKey,createEnemySprite(sprite.item.type,sprite.item.reading,variantIndex));
        const image=enemySpriteCache.get(spriteKey);
        ctx.fillStyle='rgba(0,0,0,.42)';ctx.beginPath();ctx.ellipse(center,foot,width*.25,Math.max(2,scale*.035),0,0,Math.PI*2);ctx.fill();
        const now=performance.now(),celebration=Math.max(0,(sprite.item.cheerUntil-now)/1500);
        const jump=celebration?Math.abs(Math.sin((1-celebration)*Math.PI*4))*scale*.075:enemyBob(sprite.item,now,scale);
        const top=foot-scale*.96-jump;
        ctx.imageSmoothingEnabled=false;ctx.drawImage(image,center-width/2,top,width,scale);
        if(!sprite.item.reading&&sprite.dist<5){
          const labelY=Math.max(2,top+scale*.07-10),meter=sprite.item.maxHits*9;
          ctx.fillStyle='#100b25';ctx.fillRect(center-meter/2-3,labelY,meter+6,9);
          for(let i=0;i<sprite.item.maxHits;i++){
            ctx.fillStyle=i<sprite.item.hitsLeft?'#ffcf53':'#57435d';
            ctx.fillRect(center-meter/2+i*9,labelY+2,7,5);
          }
          if(now<sprite.item.flash){
            ctx.strokeStyle='#ffda86';ctx.lineWidth=2;
            ctx.strokeRect(center-9,top+scale*.48,18,11);
          }
        }
      }
      ctx.restore();
    }
  }
  window.addEventListener('keydown',event=>{
    if(!canPlay()||event.altKey||event.ctrlKey||event.metaKey)return;
    if(event.target.closest?.('button, a, input, select, textarea'))return;
    const key=event.key.toLowerCase(),map={w:'forward',arrowup:'forward',s:'back',arrowdown:'back',a:'left',arrowleft:'left',d:'right',arrowright:'right'};
    if(map[key]){event.preventDefault();move(map[key])}
    if(key===' '){event.preventDefault();fire()}
  });
  function releaseTouchMove(id){
    const held=touchMoves.get(id);
    if(!held)return;
    clearInterval(held.timer);
    held.button.removeAttribute('data-held');
    touchMoves.delete(id);
  }
  function releaseTouchMoves(){
    touchMoves.forEach((_,id)=>releaseTouchMove(id));
  }
  window.addEventListener('blur',releaseTouchMoves);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseTouchMoves()});
  document.querySelectorAll('[data-move]').forEach(button=>{
    const action=button.dataset.move;
    button.addEventListener('pointerdown',event=>{
      if(!canPlay()||event.button!==0||button.hasAttribute('data-held'))return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      button.setAttribute('data-held','');
      touchMoves.set(event.pointerId,{button,timer:setInterval(()=>move(action),115)});
      move(action);
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture']){
      button.addEventListener(name,event=>releaseTouchMove(event.pointerId));
    }
    button.addEventListener('click',event=>{if(event.detail===0)move(action)});
  });
  $('#fire-button').addEventListener('click',()=>{fire();if(canPlay())canvas.focus({preventScroll:true})});
  let aim=null;
  canvas.addEventListener('pointerdown',event=>{
    if(!canPlay()||aim||event.button!==0)return;
    aim={id:event.pointerId,x:event.clientX,startX:event.clientX,dragged:false};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if(!canPlay()||aim?.id!==event.pointerId)return;
    aim.dragged ||= Math.abs(event.clientX-aim.startX)>5;
    if(!aim.dragged)return;
    player.angle+=(event.clientX-aim.x)*.008;
    aim.x=event.clientX;
    render();
  });
  canvas.addEventListener('pointerup',event=>{
    if(aim?.id!==event.pointerId)return;
    if(!aim.dragged)fire();
    aim=null;
  });
  for(const name of ['pointercancel','lostpointercapture']){
    canvas.addEventListener(name,event=>{if(aim?.id===event.pointerId)aim=null});
  }
  $('#start-button').addEventListener('click',()=>{startGame();canvas.focus({preventScroll:true})});
  $('#sound-toggle').addEventListener('click',event=>{
    soundOn=!soundOn;event.currentTarget.textContent=soundOn?'♫ sonido activado':'♫ sonido apagado';
    event.currentTarget.setAttribute('aria-pressed',String(soundOn));beep();
  });
  updateHud();
})();
