/* Synchronized views of paired, unmodified Stage 1 / Stage 2 point observations. */
(() => {
  window.renderStageDetails = () => `<section id="local-details" class="section stage-details">
    <div class="section-heading"><h2>Local refinement</h2><p>Explore how overlapping predictions come together from Stage 1 to Stage 2.</p></div>
    ${typeof renderLongStages === "function" ? renderLongStages() : ""}
    <div class="stage-case-tabs" role="group" aria-label="Local reconstruction examples"></div>
    <div class="stage-toolbar">
      <div class="stage-view-buttons" role="group" aria-label="View region"><button type="button" data-region="local" aria-pressed="true">Local detail</button><button type="button" data-region="context" aria-pressed="false">Context</button></div>
      <label class="stage-color-control">Color <select aria-label="Point colors"><option value="chunks">By chunk</option><option value="rgb">RGB</option></select></label>
      <button type="button" data-stage-reset>Reset view</button><button type="button" data-stage-expand>Expand</button>
    </div>
    <div class="stage-content">
      <aside class="stage-reference"><div class="stage-input-label">Input frame</div><div class="stage-input-wrap"><img alt="Input frame for the selected local reconstruction" loading="lazy"><span class="stage-input-roi" aria-hidden="true"></span></div><p class="stage-reference-note">The box locates the selected detail.</p><div class="stage-legend"><span><i class="stage-dot stage-dot-a"></i>Chunk A</span><span><i class="stage-dot stage-dot-b"></i>Chunk B</span></div></aside>
      <div class="stage-pair">
        <div class="stage-pane"><div class="stage-pane-title"><strong>Stage 1</strong><span>Layout alignment</span></div><div class="stage-canvas" data-stage-canvas="0" tabindex="0" role="img" aria-label="Stage 1 point cloud. Drag to rotate; scroll to zoom. Arrow keys rotate, plus and minus zoom."></div><div class="stage-metric" data-stage-metric="0"></div></div>
        <div class="stage-pane"><div class="stage-pane-title"><strong>Stage 2</strong><span>Camera refinement</span></div><div class="stage-canvas" data-stage-canvas="1" tabindex="0" role="img" aria-label="Stage 2 point cloud. Drag to rotate; scroll to zoom. Arrow keys rotate, plus and minus zoom."></div><div class="stage-metric" data-stage-metric="1"></div></div>
      </div>
    </div>
    <div class="stage-footnote"><span>Drag to rotate · Scroll or pinch to zoom · Views stay synchronized</span><span class="stage-scale-note">Same points, view and scale.</span></div>
    <p class="stage-evidence-note">Colors identify the two chunks. Distances measure disagreement between their predictions at corresponding pixels in the selected region.</p>
    <div class="stage-message" role="status" aria-live="polite">Loading local comparisons…</div>
  </section>`;

  window.bindStageDetails = () => {
    const root = document.querySelector('#local-details');
    if (!root) return;
    if (typeof bindLongStages === "function") bindLongStages();
    let started = false;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !started) { started = true; initialize(root).catch(error => {
        root.querySelector('.stage-message').textContent = 'The 3D comparison could not load. Reload the page to try again.';
        console.error(error);
      }); }
    }, {rootMargin: '250px'});
    observer.observe(root);
  };

  async function initialize(root) {
    const response = await fetch('assets/stage-details/manifest.json');
    if (!response.ok) throw new Error('Missing detail manifest');
    const manifest = await response.json();
    const message = root.querySelector('.stage-message');
    const tabs = root.querySelector('.stage-case-tabs');
    let selected, region = 'local', color = 'chunks', token = 0, visible = true, frameId = 0;
    const cache = new Map();
    const views = [...root.querySelectorAll('[data-stage-canvas]')].map(container => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, 1, 0.001, 10000);
      const renderer = new THREE.WebGLRenderer({antialias: true, alpha: false, preserveDrawingBuffer: true});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.appendChild(renderer.domElement);
      const controls = new THREE.TrackballControls(camera, container);
      controls.rotateSpeed = 2; controls.zoomSpeed = 1.15; controls.panSpeed = .6; controls.staticMoving = true;
      return {container, scene, camera, renderer, controls, cloud: null};
    });
    function render() { views.forEach(v => v.renderer.render(v.scene, v.camera)); }
    function synchronize(from) {
      const other = views[1 - from]; const source = views[from];
      other.camera.position.copy(source.camera.position); other.camera.up.copy(source.camera.up);
      other.camera.quaternion.copy(source.camera.quaternion); other.camera.zoom = source.camera.zoom;
      other.camera.updateProjectionMatrix(); other.controls.target.copy(source.controls.target);
      render();
    }
    views.forEach((v, index) => {
      v.controls.addEventListener('change', () => synchronize(index));
      v.container.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(event.key)) return;
        event.preventDefault();
        const delta = v.camera.position.clone().sub(v.controls.target);
        if (['+','=','-'].includes(event.key)) delta.multiplyScalar(event.key === '-' ? 1.15 : 1/1.15);
        else delta.applyAxisAngle(new THREE.Vector3(event.key.includes('Up') || event.key.includes('Down') ? 1 : 0, event.key.includes('Left') || event.key.includes('Right') ? 1 : 0, 0), ['ArrowLeft','ArrowUp'].includes(event.key) ? .12 : -.12);
        v.camera.position.copy(v.controls.target).add(delta); v.camera.lookAt(v.controls.target); synchronize(index);
      });
    });
    function theme() {
      const dark = document.documentElement.dataset.theme === 'dark';
      views.forEach(v => v.renderer.setClearColor(dark ? 0x12171b : 0xf7f8fa)); render();
    }
    new MutationObserver(theme).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
    theme();
    function resize() {
      views.forEach(v => { const w = v.container.clientWidth, h = v.container.clientHeight; v.renderer.setSize(w,h); v.camera.aspect=w/h; v.camera.updateProjectionMatrix(); v.controls.handleResize(); });
      render();
    }
    new ResizeObserver(resize).observe(root.querySelector('.stage-pair'));
    function animate() { if (!visible) { frameId=0; return; } views.forEach(v=>v.controls.update()); frameId=requestAnimationFrame(animate); }
    new IntersectionObserver(entries => {visible=entries[0].isIntersecting; if(visible&&!frameId) animate();}).observe(root);
    resize();
    function reset() {
      if (!selected) return;
      const bounds = region === 'local' ? selected.localBounds : selected.contextBounds;
      const lo=new THREE.Vector3(...bounds[0]), hi=new THREE.Vector3(...bounds[1]);
      const target=lo.clone().add(hi).multiplyScalar(.5), size=hi.clone().sub(lo);
      views.forEach(v=>{
        const tan=Math.tan(THREE.MathUtils.degToRad(v.camera.fov/2));
        const distance=Math.max(size.y/(2*tan),size.x/(2*tan*v.camera.aspect))*1.18+size.z*.55;
        v.camera.up.set(0,1,0);v.camera.position.copy(target).add(new THREE.Vector3(0,0,Math.max(distance,.1)));
        v.camera.zoom=1;v.camera.near=Math.max(distance/1000,.0001);v.camera.far=Math.max(distance*100,100);
        v.camera.updateProjectionMatrix();v.controls.target.copy(target);v.camera.lookAt(target);
      });render();
    }
    function applyRegion() {
      if (!selected) return;
      const n=selected.pointsPerChunk, local=selected.localPointsPerChunk;
      const indices = new Uint32Array((region==='local'?local:n)*2); const count=indices.length/2;
      for(let i=0;i<count;i++){indices[i]=i;indices[count+i]=n+i;}
      views.forEach(v=>v.cloud.geometry.setIndex(new THREE.BufferAttribute(indices,1)));
      root.querySelectorAll('[data-region]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.region===region)));
      reset();
    }
    function applyColor() {
      if (!selected) return;
      const n=selected.pointsPerChunk;const colors=new Float32Array(n*6);
      const rgb=cache.get(selected.id).rgb;
      const a=new THREE.Color(manifest.colors[0]), b=new THREE.Color(manifest.colors[1]);
      for(let i=0;i<n*2;i++){
        const c=i<n?a:b;
        colors[i*3]=color==='rgb'?rgb[i*3]/255:c.r;
        colors[i*3+1]=color==='rgb'?rgb[i*3+1]/255:c.g;
        colors[i*3+2]=color==='rgb'?rgb[i*3+2]/255:c.b;
      }
      views.forEach(v=>v.cloud.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3)));render();
    }
    async function buffer(url) {const r=await fetch(url);if(!r.ok)throw new Error('Missing point data');return r.arrayBuffer();}
    async function choose(item) {
      const request=++token; message.hidden=false;message.textContent='Loading local point clouds…';
      tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===item.id)));
      try {
        if(!cache.has(item.id)) {
          const [a,b,rgb]=await Promise.all([buffer(item.stage1),buffer(item.stage2),buffer(item.rgb)]);
          const entry={positions:[new Float32Array(a),new Float32Array(b)],rgb:new Uint8Array(rgb)};
          if(entry.positions.some(p=>p.length!==item.pointsPerChunk*6)||entry.rgb.length!==item.pointsPerChunk*6)throw new Error('Point data size mismatch');
          cache.set(item.id,entry);
        }
        if(request!==token)return;
        selected=item;
        views.forEach((v,i)=>{
          if(v.cloud){v.scene.remove(v.cloud);v.cloud.geometry.dispose();v.cloud.material.dispose();}
          const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(cache.get(item.id).positions[i],3));
          const material=new THREE.PointsMaterial({size:item.id==='case-1'?1.35:2.1,sizeAttenuation:false,vertexColors:true});
          v.cloud=new THREE.Points(geometry,material);v.scene.add(v.cloud);
          root.querySelector(`[data-stage-metric="${i}"]`).innerHTML=`<span>Median disagreement</span><strong>${item.disagreement[i].toFixed(3)} <small>m</small></strong>`;
        });
        const img=root.querySelector('.stage-input-wrap img');img.src=item.image;
        const [x0,y0,x1,y1]=item.imageROI, box=root.querySelector('.stage-input-roi');
        Object.assign(box.style,{left:`${x0*100}%`,top:`${y0*100}%`,width:`${(x1-x0)*100}%`,height:`${(y1-y0)*100}%`});
        root.querySelector('.stage-reference-note').textContent=`Frame ${item.frame} · selected detail`;
        root.dataset.ready=item.id;resize();applyColor();applyRegion();message.hidden=true;
      }catch(error){if(request===token){message.textContent='Unable to load this example. Select it again to retry.';}console.error(error);}
    }
    manifest.cases.forEach(item=>{const b=document.createElement('button');b.type='button';b.dataset.id=item.id;b.textContent=item.label;b.setAttribute('aria-pressed','false');b.onclick=()=>choose(item);tabs.appendChild(b);});
    root.querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>{region=b.dataset.region;applyRegion();});
    root.querySelector('select').onchange=event=>{color=event.target.value;applyColor();};
    root.querySelector('[data-stage-reset]').onclick=reset;
    root.querySelector('[data-stage-expand]').onclick=async()=>{
      try {if(document.fullscreenElement===root)await document.exitFullscreen();else if(root.requestFullscreen)await root.requestFullscreen();}
      catch(error){message.hidden=false;message.textContent='Full screen is unavailable in this browser.';}
    };
    document.addEventListener('fullscreenchange',()=>{root.querySelector('[data-stage-expand]').textContent=document.fullscreenElement===root?'Exit full screen':'Expand';resize();reset();});
    await choose(manifest.cases[0]);
  }
})();
