/* Native-system overview and the two fixed-gauge HiP3R stages. */
(() => {
  window.renderLongStages = () => `<article class="long-stages" id="long-stages">
    <div class="long-stages-heading"><div><h3>From global layout to local detail</h3><p>VBR · Spagna · 14,141 frames</p></div><div class="stage-toolbar"><button data-long-reset>Reset view</button><button data-long-expand>Expand</button></div></div>
    <div class="long-stages-grid">${['VGGT-Long','HiP3R Stage I','HiP3R Stage II'].map(label=>`<div><h4>${label}</h4><div class="long-stage-canvas" tabindex="0" role="img" aria-label="${label} reconstruction. Drag to rotate, scroll to zoom, or use arrow keys and plus or minus."></div></div>`).join('')}</div>
    <div class="long-stages-footer"><span>Drag to rotate · Scroll to zoom · Synchronized views</span><button data-long-detail>Zoom into Stage I → II ↓</button></div>
    <p class="long-stage-status" role="status">Loading reconstruction…</p>
  </article>`;
  window.bindLongStages = () => {
    const root=document.querySelector('#long-stages');if(!root)return;
    let started=false;
    const lazy=new IntersectionObserver(entries=>{if(entries[0].isIntersecting&&!started){started=true;initialize(root).catch(e=>{root.querySelector('.long-stage-status').textContent='Unable to load reconstruction. Reload to retry.';console.error(e);});}},{rootMargin:'200px'});lazy.observe(root);
    root.querySelector('[data-long-detail]').onclick=()=>{
      document.querySelector('.stage-case-tabs [data-id="case-3"]')?.click();
      document.querySelector('[data-region="local"]')?.click();
      document.querySelector('.stage-content').scrollIntoView({behavior:'smooth',block:'center'});
    };
  };
  async function initialize(root){
    const fetchBuffer=async url=>{const r=await fetch(url);if(!r.ok)throw Error('Missing reconstruction');return r.arrayBuffer();};
    const response=await fetch('assets/long-stages/manifest.json');if(!response.ok)throw Error('Missing overview manifest');const data=await response.json();
    const views=[...root.querySelectorAll('.long-stage-canvas')].map(container=>{
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.01,100000);
      const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));container.appendChild(renderer.domElement);
      const controls=new THREE.TrackballControls(camera,container);controls.staticMoving=true;controls.rotateSpeed=2;controls.zoomSpeed=1.15;
      return {scene,camera,renderer,controls,container};
    });
    const draw=()=>views.forEach(v=>v.renderer.render(v.scene,v.camera));
    function sync(source){views.forEach(v=>{if(v===source)return;v.camera.position.copy(source.camera.position);v.camera.quaternion.copy(source.camera.quaternion);v.camera.up.copy(source.camera.up);v.controls.target.copy(source.controls.target);});draw();}
    views.forEach(v=>{v.controls.addEventListener('change',()=>sync(v));v.container.onkeydown=e=>{
      if(!['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
      const delta=v.camera.position.clone().sub(v.controls.target);
      if(['+','=','-'].includes(e.key))delta.multiplyScalar(e.key==='-'?1.2:1/1.2);
      else delta.applyAxisAngle(new THREE.Vector3(e.key==='ArrowUp'||e.key==='ArrowDown'?1:0,e.key==='ArrowLeft'||e.key==='ArrowRight'?1:0,0),['ArrowLeft','ArrowUp'].includes(e.key)?.12:-.12);
      v.camera.position.copy(v.controls.target).add(delta);v.camera.lookAt(v.controls.target);sync(v);
    };});
    const lo=new THREE.Vector3(...data.bounds[0]),hi=new THREE.Vector3(...data.bounds[1]),target=lo.clone().add(hi).multiplyScalar(.5),size=hi.clone().sub(lo);
    function reset(){views.forEach(v=>{const tan=Math.tan(THREE.MathUtils.degToRad(18)),d=Math.max(size.y/(2*tan),size.x/(2*tan*v.camera.aspect))*1.08+size.z*.5;v.camera.position.copy(target).add(new THREE.Vector3(0,0,d));v.camera.up.set(0,1,0);v.camera.lookAt(target);v.controls.target.copy(target);});draw();}
    function resize(){views.forEach(v=>{const w=v.container.clientWidth,h=v.container.clientHeight;v.renderer.setSize(w,h);v.camera.aspect=w/h;v.camera.updateProjectionMatrix();v.controls.handleResize();});draw();}
    new ResizeObserver(resize).observe(root);resize();reset();
    function theme(){views.forEach(v=>v.renderer.setClearColor(document.documentElement.dataset.theme==='dark'?0x12171b:0xf7f8fa));draw();}
    new MutationObserver(theme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});theme();
    let visible=false,frame=0;function animate(){frame=0;if(!visible)return;views.forEach(v=>v.controls.update());frame=requestAnimationFrame(animate);}
    new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible&&!frame)animate();}).observe(root);
    await Promise.all(data.methods.map(async(m,i)=>{const [p,c]=await Promise.all([fetchBuffer(m.points),fetchBuffer(m.rgb)]),points=new Float32Array(p),colors=new Uint8Array(c);if(points.length!==colors.length)throw Error('Point data mismatch');
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(points,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3,true));views[i].scene.add(new THREE.Points(g,new THREE.PointsMaterial({size:1.2,sizeAttenuation:false,vertexColors:true})));}));
    root.querySelector('[data-long-reset]').onclick=reset;
    root.querySelector('[data-long-expand]').onclick=async()=>{try{if(document.fullscreenElement===root)await document.exitFullscreen();else await root.requestFullscreen();}catch(e){root.querySelector('.long-stage-status').hidden=false;root.querySelector('.long-stage-status').textContent='Full screen is unavailable in this browser.';}};
    document.addEventListener('fullscreenchange',()=>{root.querySelector('[data-long-expand]').textContent=document.fullscreenElement===root?'Exit full screen':'Expand';resize();reset();});
    root.querySelector('.long-stage-status').hidden=true;root.dataset.ready='true';draw();
  }
})();
