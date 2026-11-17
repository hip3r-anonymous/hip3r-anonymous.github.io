/* Video-clock-driven camera paths. No independent playback clock or remote assets. */
(() => {
  window.createVideoTrajectory = function ({ container, video, reset, frameLabel, eventsContainer, reference, referenceImage, referenceLabel }) {
    if (!container) return null;
    const T = window.THREE;
    let renderer, controls, observer, themeObserver, scene, view, group;
    let data = null, poses = [], path = null, currentCamera = null, referenceCamera = null, cameraTrail = [];
    let span = 1, request = null, generation = 0, disposed = false, animation = 0, activeFrame = -1;
    let currentEvent = null, eventButtons = [], theme = "", dataUrl = "";
    let visible = true;
    const status = document.createElement("span");
    status.className = "trajectory-status";
    container.replaceChildren(status);
    function message(text) { status.textContent = text; status.hidden = !text; }
    function clearGroup() {
      if (!group) return;
      scene.remove(group);
      group.traverse((object) => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
        else object.material?.dispose();
      });
      group = null;
      cameraTrail = [];
    }
    function hideReference() {
      currentEvent = null;
      reference.hidden = true;
      reference.parentElement.classList.remove("has-reference");
      referenceImage.removeAttribute("src");
      eventButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
    }
    function safeImage(value) {
      if (typeof value !== "string" || !value || /^(?:[a-z]+:|\/|\\)/i.test(value)) return null;
      try {
        const decoded = decodeURIComponent(value);
        if (decoded.split(/[\\/]/).includes("..") || /[\x00-\x1f]/.test(decoded)) return null;
        const base = new URL(".", dataUrl);
        const url = new URL(value, base);
        return url.origin === base.origin && url.pathname.startsWith(base.pathname) ? url.href : null;
      } catch (_) { return null; }
    }
    function eventName(event) { return event.type === "loop_closure" ? "Loop closure" : "Revisit candidate"; }
    function displayEvent(event) {
      if (event === currentEvent) return;
      hideReference();
      if (!event) return;
      const url = safeImage(event.reference_image);
      if (!url) return;
      currentEvent = event;
      referenceImage.src = url;
      referenceImage.alt = `Earlier input frame ${event.reference_frame + 1} · ${eventName(event)}`;
      referenceLabel.textContent = `Earlier · frame ${event.reference_frame + 1}`;
      reference.hidden = false;
      reference.parentElement.classList.add("has-reference");
      eventButtons.forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.frame) === event.frame_index)));
    }
    function fitView() {
      if (!group || !controls) return;
      view.position.set(span * 0.85, -span * 0.8, span * 1.15);
      view.up.set(0, -1, 0);
      view.near = Math.max(span / 10000, 0.00001);
      view.far = span * 100;
      view.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.minDistance = span * 0.03;
      controls.maxDistance = span * 12;
      controls.update();
    }
    function resize() {
      if (!renderer) return;
      const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      view.aspect = width / height;
      view.updateProjectionMatrix();
      controls.handleResize();
    }
    function applyTheme() {
      if (!renderer) return;
      theme = document.documentElement.dataset.theme;
      const dark = theme === "dark";
      renderer.setClearColor(dark ? 0x11171c : 0xf4f5f7);
      if (group) group.traverse((object) => {
        if (object.userData.kind === "full-path") object.material.color.set(dark ? 0x52626d : 0xc1c9cf);
        if (object.userData.kind === "elapsed-path") object.material.color.set(dark ? 0x62bcb7 : 0x2b9695);
        if (object.userData.kind === "current-camera") object.material.color.set(dark ? 0x91e2da : 0x128c8b);
        if (object.userData.kind === "reference-camera") object.material.color.set(dark ? 0xedb580 : 0xb3733f);
        if (object.userData.kind === "history-camera") object.material.color.set(dark ? 0x71a4a6 : 0x508f91);
        if (object.userData.kind === "grid") {
          object.material.color.set(dark ? 0x36414b : 0xdbe0e5);
          object.material.opacity = 0.5;
        }
      });
    }
    function animate() {
      if (disposed || !renderer) return;
      if (visible) {
        controls.update();
        update(video.currentTime);
        renderer.render(scene, view);
      }
      animation = requestAnimationFrame(animate);
    }
    try {
      if (!T) throw new Error("Three.js unavailable");
      renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.domElement.setAttribute("aria-label", "3D camera trajectory. Drag to rotate; scroll to zoom.");
      renderer.domElement.setAttribute("role", "img");
      container.append(renderer.domElement);
      scene = new T.Scene();
      view = new T.PerspectiveCamera(45, 1, 0.001, 1000);
      controls = new T.TrackballControls(view, renderer.domElement);
      controls.rotateSpeed = 2.5;
      controls.zoomSpeed = 1.1;
      controls.panSpeed = 0.6;
      controls.staticMoving = true;
      renderer.domElement.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        cancelAnimationFrame(animation);
        message("3D view interrupted. Reload to restore.");
      });
      observer = new ResizeObserver(resize);
      observer.observe(container);
      themeObserver = new MutationObserver(applyTheme);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      applyTheme(); resize(); animate();
    } catch (_) {
      renderer?.dispose(); renderer = null;
      message("3D view unavailable in this browser. Video playback is still available.");
      reset.disabled = true;
    }
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    visibilityObserver.observe(container);
    reset.addEventListener("click", fitView);
    referenceImage.addEventListener("error", hideReference);

    function line(points, color, opacity = 1) {
      return new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
    }
    function normalizedPose(values) {
      if (!Array.isArray(values) || values.length !== 4 || values.some((row) => !Array.isArray(row) || row.length !== 4 || row.some((x) => !Number.isFinite(x)))) throw new Error("Invalid camera pose");
      // Preserve translation, remove Sim(3) scale, and orthogonalize numerical drift.
      const x = new T.Vector3(values[0][0], values[1][0], values[2][0]).normalize();
      const y = new T.Vector3(values[0][1], values[1][1], values[2][1]);
      y.addScaledVector(x, -y.dot(x)).normalize();
      const z = new T.Vector3().crossVectors(x, y).normalize();
      return new T.Matrix4().makeBasis(x, y, z).setPosition(values[0][3], values[1][3], values[2][3]);
    }
    function makeFrustum(color, historical = false) {
      return new T.LineSegments(new T.BufferGeometry().setAttribute("position", new T.Float32BufferAttribute(new Float32Array(48), 3)), new T.LineBasicMaterial({
        color, depthTest: historical, transparent: historical, opacity: historical ? 0.7 : 1,
      }));
    }
    function placeFrustum(object, index, size = 0.075) {
      const k = data.intrinsics?.mode === "per_frame" ? data.intrinsics.matrices[index] : data.intrinsics?.matrix;
      const width = data.image_size[0], height = data.image_size[1];
      if (!k || !(k[0][0] > 0) || !(k[1][1] > 0)) { object.visible = false; return; }
      const depth = span * size;
      const corners = [[0, 0], [width, 0], [width, height], [0, height]].map(([u, v]) => new T.Vector3((u - k[0][2]) / k[0][0] * depth, (v - k[1][2]) / k[1][1] * depth, depth));
      const vertices = [new T.Vector3(), ...corners];
      const edges = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1]];
      const positions = object.geometry.attributes.position;
      edges.flat().forEach((vertex, i) => positions.setXYZ(i, vertices[vertex].x, vertices[vertex].y, vertices[vertex].z));
      positions.needsUpdate = true;
      object.geometry.computeBoundingSphere();
      object.matrix.copy(poses[index]);
      object.matrixAutoUpdate = false;
      object.visible = true;
    }
    function build() {
      poses = data.frames.map((frame) => normalizedPose(frame.c2w));
      const points = poses.map((matrix) => new T.Vector3().setFromMatrixPosition(matrix));
      const bounds = new T.Box3().setFromPoints(points), center = bounds.getCenter(new T.Vector3());
      span = Math.max(bounds.getSize(new T.Vector3()).length(), 0.01);
      group = new T.Group();
      group.position.copy(center).negate();
      scene.add(group);
      const full = line(points, 0xc1c9cf); full.userData.kind = "full-path"; group.add(full);
      path = line(points, 0x2b9695); path.userData.kind = "elapsed-path"; path.geometry.setDrawRange(0, 1); group.add(path);
      // Sample actual exported poses/K once; the video clock only changes visibility.
      // A bounded trail keeps long paths legible without adding per-frame geometry work.
      const trailStride = Math.max(1, Math.ceil(poses.length / 32));
      for (let index = 0; index < poses.length; index += trailStride) {
        const camera = makeFrustum(0x508f91, true);
        camera.userData = { kind: "history-camera", frameIndex: index };
        placeFrustum(camera, index, 0.018);
        camera.userData.valid = camera.visible;
        camera.visible = false;
        cameraTrail.push(camera);
        group.add(camera);
      }
      currentCamera = makeFrustum(0x128c8b); currentCamera.userData.kind = "current-camera"; group.add(currentCamera);
      referenceCamera = makeFrustum(0xcc8751); referenceCamera.userData.kind = "reference-camera"; referenceCamera.visible = false; group.add(referenceCamera);
      const grid = new T.GridHelper(span * 1.3, 10, 0xdbe0e5, 0xdbe0e5);
      grid.position.set(center.x, bounds.max.y + span * 0.08, center.z);
      grid.material.transparent = true; grid.material.opacity = 0.5; grid.userData.kind = "grid"; group.add(grid);
      const axes = new T.AxesHelper(span * 0.12); axes.position.copy(points[0]); group.add(axes);
      applyTheme(); fitView(); resize(); message("");
      update(video.currentTime);
    }
    function update(time) {
      if (!data || !poses.length || disposed) return;
      let lo = 0, hi = data.frames.length - 1;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (data.frames[mid].time <= time + 0.0001) lo = mid; else hi = mid - 1; }
      if (lo === activeFrame) return;
      activeFrame = lo;
      path.geometry.setDrawRange(0, lo + 1);
      placeFrustum(currentCamera, lo);
      cameraTrail.forEach((camera) => {
        camera.visible = camera.userData.valid && camera.userData.frameIndex < lo;
      });
      frameLabel.textContent = `Frame ${lo + 1} / ${data.frames.length} · Drag to orbit`;
      const event = data.events.find((item) => {
        const start = data.frames[item.frame_index]?.time;
        return Number.isFinite(start) && time >= start - 0.0001 && time <= start + 2;
      });
      displayEvent(event);
      referenceCamera.visible = false;
      if (event && data.frames[event.reference_frame]) placeFrustum(referenceCamera, event.reference_frame);
    }
    async function load(id, trajectoryUrl = "") {
      const version = ++generation;
      request?.abort(); request = new AbortController();
      clearGroup(); data = null; poses = []; activeFrame = -1;
      hideReference(); eventsContainer.replaceChildren(); eventsContainer.hidden = true; eventButtons = [];
      frameLabel.textContent = "Drag to orbit · Scroll to zoom";
      if (!renderer) return;
      message("Loading trajectory…");
      if (!/^[a-z0-9-]+$/.test(id)) { message("Trajectory unavailable for this scene."); return; }
      dataUrl = new URL(trajectoryUrl || `assets/trajectories/${id}/trajectory.json`, document.baseURI).href;
      try {
        const response = await fetch(dataUrl, { signal: request.signal });
        if (!response.ok) throw new Error("Trajectory not found");
        const value = await response.json();
        if (disposed || version !== generation) return;
        if (value.coordinate_convention !== "opencv_c2w" || !value.frames?.length || !value.image_size || value.frames.some((frame, i) => !Number.isFinite(frame.time) || (i && frame.time < value.frames[i - 1].time))) throw new Error("Invalid trajectory");
        data = value;
        data.events = (data.events || []).filter((event) => ["revisit_candidate", "loop_closure"].includes(event.type) && Number.isInteger(event.frame_index) && Number.isInteger(event.reference_frame) && data.frames[event.frame_index] && data.frames[event.reference_frame]);
        build();
        if (data.events.length) {
          const label = document.createElement("span"); label.textContent = "Revisits"; eventsContainer.append(label);
          data.events.forEach((event) => {
            const button = document.createElement("button"); button.type = "button"; button.dataset.frame = event.frame_index;
            const time = data.frames[event.frame_index].time;
            button.textContent = `${eventName(event)} · ${time.toFixed(1)}s`;
            button.title = event.type === "revisit_candidate" ? "Geometric proximity and viewing direction; not a verified loop closure." : "Recorded loop-closure event.";
            button.setAttribute("aria-pressed", "false");
            button.addEventListener("click", () => { video.currentTime = time; activeFrame = -1; update(time); });
            eventButtons.push(button); eventsContainer.append(button);
          });
          eventsContainer.hidden = false;
        }
      } catch (error) {
        if (error.name === "AbortError" || version !== generation || disposed) return;
        clearGroup(); data = null; poses = [];
        message("Trajectory unavailable for this scene. Video playback is still available.");
      }
    }
    function dispose() {
      disposed = true; generation += 1; request?.abort(); cancelAnimationFrame(animation);
      observer?.disconnect(); themeObserver?.disconnect(); visibilityObserver.disconnect();
      reset.removeEventListener("click", fitView); referenceImage.removeEventListener("error", hideReference);
      controls?.dispose(); clearGroup(); renderer?.dispose();
    }
    return { load, update, dispose };
  };
})();
