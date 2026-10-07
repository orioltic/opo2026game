(() => {
  const cfg = window.GAME_CONFIG;
  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#viewport'), ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, FOV = Math.PI / 3;
  let levelIndex = 0, energy = cfg.startingEnergy, player, enemies = [], pickups = [];
  let questionOrder = [], questionIndex = 0, activePickup = null, ended = false, quizMode = 'pickup';
  let soundOn = false, audio, lastDamage = 0, flashUntil = 0, toastTimer, enemyLoop = null;
  let knowledge = 0, heldTimer = null, projectile = null, projectileFrame = 0;
  const bookMethods=cfg.bookMethods||['Aula Invertida','Gamificación','ABP','ApS','Juegos Serios'];
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
    toastTimer=setTimeout(()=>$('#toast').textContent='Motiva a los estudiantes y encuentra la salida.',2300);
  }
  function beep(frequency=540){
    if(!soundOn)return;
    try{audio ||= new(window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type='square';o.frequency.value=frequency;g.gain.value=.035;o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.08)}catch(_){}
  }
  function updateHud(){
    $('#energy-count').textContent=`${energy} / ${cfg.maxEnergy}`;
    $('#energy-pips').textContent='● '.repeat(energy);
    $('#energy-pips').setAttribute('aria-label',`${energy} unidades de energía`);
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
    activePickup=null;ended=false;lastDamage=0;$('#quiz-panel').hidden=true;$('#end-panel').hidden=true;
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
      showToast('La salida se abrirá cuando todo el grupo esté motivado.');return;
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
    energy=Math.max(0,energy-1);lastDamage=now;flashUntil=now+180;updateHud();beep(170);
    showToast('¡El desánimo te resta energía!');setTimeout(render,190);
    if(energy===0)gameOver();
  }
  function updateEnemies(){
    if(ended||activePickup!==null)return;
    for(const enemy of enemies){
      if(enemy.reading)continue;
      // El alumnado recorre el mapa por rutas aleatorias; no persigue ni ataca al jugador.
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
    $('#quiz-panel').querySelector('.eyebrow').textContent=mode==='exit'?'PREGUNTA PARA ABRIR LA SALIDA':'CHISPA DE IDEAS';
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
          $('#quiz-result').textContent=gained?'¡Correcto! Recuperas una unidad de energía.':'¡Correcto! Tu energía ya está al máximo.';
          beep(760);
        }else{
          button.classList.add('incorrect');options.children[correctPosition].classList.add('correct');
          $('#quiz-result').textContent=quizMode==='exit'?'No es correcta. Responde otra pregunta para abrir la salida.':'Respuesta incorrecta: no recuperas energía.';
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
    $('#end-title').textContent='Sin energía';$('#end-message').textContent='La fase sigue disponible. Reiníciala para volver a intentarlo.';
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
    energy=cfg.startingEnergy;$('#end-panel').hidden=true;$('#screen-label').textContent=`FASE ${levelIndex+1}`;
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
    const method=bookMethods[Math.floor(Math.random()*bookMethods.length)];
    projectile={started:performance.now(),duration:360,target:target&&lineOfSight(target.enemy.x,target.enemy.y)?target.enemy:null,method};
    flashUntil=performance.now()+100;showToast(`¡${method}!`);beep(380);animateProjectile();
  }
  function animateProjectile(){
    if(!projectile)return;
    render();
    if(performance.now()-projectile.started>=projectile.duration){
      const hit=projectile.target,method=projectile.method;projectile=null;
      if(hit&&!hit.reading){hit.hitsLeft--;hit.flash=performance.now()+260;beep(700);
        if(hit.hitsLeft<=0){hit.reading=true;hit.cheerUntil=performance.now()+1500;showToast(`¡${method}! ¡Se anima a aprender!`);if(enemies.every(enemy=>enemy.reading))showToast('¡Todo el grupo está motivado! Busca la salida.');}
        else showToast(`¡${method}! Quedan ${hit.hitsLeft} impactos para animarle.`);
      }else{showToast(`¡${method}! El libro no alcanzó a nadie. Ajusta la mira.`);beep(250)}
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
  function enemyBob(enemy,now,scale){return Math.sin(now/210+enemy.id)*Math.max(1,scale*.012)}
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
      drawFlyingBook(W/2+(Math.sin(ease*Math.PI)*28),y,size,Math.sin(ease*Math.PI*3)*.35,projectile.method);
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
    enemies.forEach(enemy=>{m.fillStyle=enemy.reading?'#73f29a':'#ffb85c';m.fillRect(ox+enemy.x*cell-2,oy+enemy.y*cell-2,4,4)});
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
  function drawFlyingBook(x,y,size,angle,label=''){
    const covers={'Aula Invertida':'#1b6880','Gamificación':'#a52e70','ABP':'#607b2b','ApS':'#955a23','Juegos Serios':'#563c9c'};
    const lines=label==='Aula Invertida'?['Aula','Invertida']:label==='Juegos Serios'?['Juegos','Serios']:[label];
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.imageSmoothingEnabled=true;
    ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(-size*.48,-size*.26,size*.98,size*.68);
    ctx.fillStyle='#f3e8d1';ctx.fillRect(-size*.42,-size*.31,size*.88,size*.62);
    ctx.fillStyle=covers[label]||'#493875';ctx.fillRect(-size*.5,-size*.36,size*.92,size*.67);
    ctx.fillStyle='#ffffff33';ctx.fillRect(-size*.45,-size*.32,size*.82,size*.06);
    ctx.fillStyle='#241536';ctx.fillRect(-size*.5,-size*.36,size*.1,size*.67);
    ctx.fillStyle='#ffe66b';ctx.fillRect(-size*.36,-size*.22,size*.08,size*.035);
    ctx.fillRect(size*.19,-size*.22,size*.08,size*.035);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff8e8';
    ctx.font=`bold ${Math.max(4,size*.115)}px "Courier New", monospace`;
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
    const sprites=[];
    enemies.forEach(e=>{const dx=e.x-player.x,dy=e.y-player.y; sprites.push({kind:'enemy',item:e,dist:Math.hypot(dx,dy),angle:normalize(Math.atan2(dy,dx)-player.angle)})});
    pickups.filter(p=>!p.taken).forEach(p=>{const dx=p.x-player.x,dy=p.y-player.y;sprites.push({kind:'energy',item:p,dist:Math.hypot(dx,dy),angle:normalize(Math.atan2(dy,dx)-player.angle)})});
    sprites.sort((a,b)=>b.dist-a.dist);
    for(const sprite of sprites){
      if(Math.abs(sprite.angle)>FOV*.68||sprite.dist<.16)continue;
      const center=W/2+(sprite.angle/(FOV/2))*(W/2),z=depth[Math.max(0,Math.min(depth.length-1,Math.floor(center/2)))];
      if(sprite.dist>z+.3)continue;
      if(sprite.kind==='energy'){
        const size=Math.min(80,H/sprite.dist*.24);drawEnergy(center,H/2,size);
      }else{
        const scale=Math.min(H*1.35,H/sprite.dist*.92),width=scale*.82;
        const variantIndex=sprite.item.id+levelIndex*4,spriteKey=`${sprite.item.type}:${sprite.item.reading}:${variantIndex}`;
        if(!enemySpriteCache.has(spriteKey))enemySpriteCache.set(spriteKey,createEnemySprite(sprite.item.type,sprite.item.reading,variantIndex));
        const image=enemySpriteCache.get(spriteKey);
        ctx.fillStyle='rgba(0,0,0,.42)';ctx.beginPath();ctx.ellipse(center,H/2+scale*.43,width*.34,Math.max(2,scale*.035),0,0,Math.PI*2);ctx.fill();
        const now=performance.now(),celebration=Math.max(0,(sprite.item.cheerUntil-now)/1500);
        const jump=celebration?Math.abs(Math.sin((1-celebration)*Math.PI*4))*scale*.075:enemyBob(sprite.item,now,scale);
        ctx.imageSmoothingEnabled=true;ctx.drawImage(image,center-width/2,H/2-scale*.56-jump,width,scale);
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
