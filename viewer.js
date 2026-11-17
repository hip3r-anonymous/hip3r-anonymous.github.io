const viewers = new Map();
const viewerLoadingSurfaces = new WeakMap();
const POINT_SIZE_MIN = 0.5;
const POINT_SIZE_MAX = 5;
const DEFAULT_POINT_SIZE = 1.5;
const DEFAULT_INDOOR_POINT_SIZE = 1.8;
const DEFAULT_OUTDOOR_POINT_SIZE = 1.6;
const POINT_SPRITE_TEXTURE_SIZE = 32;
const POINT_SPRITE_ALPHA_TEST = 0.35;
const TILED_MAX_CONCURRENT_LOADS = 3;
const TILED_MAX_LOADED_TILES = 18;
const TILED_UPDATE_INTERVAL_MS = 180;
const TILED_UNLOAD_DELAY_MS = 1400;
const TILED_RELOAD_COOLDOWN_MS = 500;
const TILED_MAX_TILE_RETRIES = 2;
const TILED_TILE_RETRY_BASE_MS = 600;
let pointSpriteAlphaMap = null;

function clampPointSize(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_POINT_SIZE;
  return Math.min(POINT_SIZE_MAX, Math.max(POINT_SIZE_MIN, number));
}

function formatPointSize(value) {
  return `${clampPointSize(value).toFixed(1)}px`;
}

function getPointSpriteAlphaMap() {
  if (pointSpriteAlphaMap) return pointSpriteAlphaMap;
  const canvas = document.createElement("canvas");
  canvas.width = POINT_SPRITE_TEXTURE_SIZE;
  canvas.height = POINT_SPRITE_TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(POINT_SPRITE_TEXTURE_SIZE, POINT_SPRITE_TEXTURE_SIZE);
  const center = (POINT_SPRITE_TEXTURE_SIZE - 1) / 2;
  const radius = POINT_SPRITE_TEXTURE_SIZE / 2;
  for (let y = 0; y < POINT_SPRITE_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < POINT_SPRITE_TEXTURE_SIZE; x += 1) {
      const dx = (x - center) / radius;
      const dy = (y - center) / radius;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const edge = Math.min(1, Math.max(0, (distance - 0.86) / 0.14));
      const coverage = Math.round((1 - edge * edge * (3 - 2 * edge)) * 255);
      const offset = (y * POINT_SPRITE_TEXTURE_SIZE + x) * 4;
      image.data[offset] = coverage;
      image.data[offset + 1] = coverage;
      image.data[offset + 2] = coverage;
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  pointSpriteAlphaMap = new THREE.CanvasTexture(canvas);
  pointSpriteAlphaMap.minFilter = THREE.LinearFilter;
  pointSpriteAlphaMap.magFilter = THREE.LinearFilter;
  pointSpriteAlphaMap.generateMipmaps = false;
  return pointSpriteAlphaMap;
}

function collectPointMaterials(root) {
  const materials = new Set();
  let hasPoints = false;
  root.traverse((child) => {
    if (!child.isPoints) return;
    hasPoints = true;
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    childMaterials.forEach((material) => {
      if (material) materials.add(material);
    });
  });
  return { hasPoints, materials };
}

function applyPointSize(materials, value) {
  const pointSize = clampPointSize(value);
  const alphaMap = getPointSpriteAlphaMap();
  materials.forEach((material) => {
    if ("size" in material) material.size = pointSize;
    if ("sizeAttenuation" in material) material.sizeAttenuation = false;
    if ("alphaMap" in material) material.alphaMap = alphaMap;
    if ("alphaTest" in material) material.alphaTest = POINT_SPRITE_ALPHA_TEST;
    if ("transparent" in material) material.transparent = false;
    if ("depthTest" in material) material.depthTest = true;
    if ("depthWrite" in material) material.depthWrite = true;
    material.needsUpdate = true;
  });
  return pointSize;
}

const CAMERA_STORAGE_KEY = "long3d-show-cameras";
const MAX_FRUSTUMS = 80;
const OMEGA_INDOOR_CAMERA_COUNT = 40;
const FRUSTUM_ASPECT = 1.6;

function camerasUrlFromGlb(glbUrl) {
  return String(glbUrl || "").replace(/[^/?#]+\.glb([?#].*)?$/i, "cameras.json$1");
}

function readStoredCameraVisibility() {
  try {
    const saved = window.localStorage.getItem(CAMERA_STORAGE_KEY);
    if (saved === "0") return false;
    if (saved === "1") return true;
  } catch (err) {
    void err;
  }
  return true;
}

function storeCameraVisibility(visible) {
  try {
    window.localStorage.setItem(CAMERA_STORAGE_KEY, visible ? "1" : "0");
  } catch (err) {
    void err;
  }
}

function mat4FromRowMajor(values) {
  const matrix = new THREE.Matrix4();
  if (!Array.isArray(values) || values.length !== 4) return matrix;
  const flat = [];
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      flat.push(Number(values[row][col]) || 0);
    }
  }
  return matrix.fromArray(flat);
}

function transformPoint(matrix, x, y, z, target) {
  target.set(x, y, z).applyMatrix4(matrix);
  return target;
}

function displayedCameraPoses(data, glbUrl) {
  const poses = Array.isArray(data?.c2w) ? data.c2w : [];
  if (!/\/maps\/omega\//i.test(String(glbUrl || "")) || poses.length <= OMEGA_INDOOR_CAMERA_COUNT) return poses;
  return poses.slice(0, OMEGA_INDOOR_CAMERA_COUNT);
}

function buildCameraOverlay(data, sceneSpan = 0, glbUrl = "") {
  const poses = displayedCameraPoses(data, glbUrl);
  if (poses.length < 1) return null;
  const scale = Number(data.frustum_scale);
  const fromScene = Number(sceneSpan) > 0 ? Math.min(sceneSpan * 0.012, 3.5) : 0;
  const fromJson = Number.isFinite(scale) && scale > 0 ? Math.min(scale, 3.5) : 0;
  const frustumScale = Math.max(fromScene || fromJson, 0.02);
  const hw = 0.8 * frustumScale;
  const hh = hw / FRUSTUM_ASPECT;
  const group = new THREE.Group();
  group.name = "camera-overlay";

  const trailPositions = [];
  const trailColors = [];
  const origin = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const color = new THREE.Color();
  poses.forEach((pose, index) => {
    const matrix = mat4FromRowMajor(pose);
    transformPoint(matrix, 0, 0, 0, origin);
    const t = poses.length === 1 ? 1 : index / (poses.length - 1);
    color.setRGB(0.22 + 0.15 * t, 0.72 + 0.2 * t, 0.78 + 0.15 * t);
    if (index > 0) {
      trailPositions.push(prev.x, prev.y, prev.z, origin.x, origin.y, origin.z);
      trailColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    prev.copy(origin);
  });
  if (trailPositions.length) {
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute("position", new THREE.Float32BufferAttribute(trailPositions, 3));
    trailGeometry.setAttribute("color", new THREE.Float32BufferAttribute(trailColors, 3));
    group.add(
      new THREE.LineSegments(
        trailGeometry,
        new THREE.LineBasicMaterial({ vertexColors: THREE.VertexColors, depthTest: true })
      )
    );
  }

  const stride = Math.max(1, Math.ceil(poses.length / MAX_FRUSTUMS));
  const frustumPositions = [];
  const frustumColors = [];
  const corners = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  const edges = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 1],
  ];
  for (let index = 0; index < poses.length; index += stride) {
    const matrix = mat4FromRowMajor(poses[index]);
    transformPoint(matrix, 0, 0, 0, origin);
    transformPoint(matrix, -hw, -hh, frustumScale, corners[0]);
    transformPoint(matrix, hw, -hh, frustumScale, corners[1]);
    transformPoint(matrix, hw, hh, frustumScale, corners[2]);
    transformPoint(matrix, -hw, hh, frustumScale, corners[3]);
    const points = [origin, ...corners];
    const t = poses.length === 1 ? 1 : index / (poses.length - 1);
    color.setRGB(0.28 + 0.2 * t, 0.86, 0.78 + 0.14 * t);
    edges.forEach(([a, b]) => {
      frustumPositions.push(points[a].x, points[a].y, points[a].z, points[b].x, points[b].y, points[b].z);
      frustumColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    });
  }
  if (frustumPositions.length) {
    const frustumGeometry = new THREE.BufferGeometry();
    frustumGeometry.setAttribute("position", new THREE.Float32BufferAttribute(frustumPositions, 3));
    frustumGeometry.setAttribute("color", new THREE.Float32BufferAttribute(frustumColors, 3));
    group.add(
      new THREE.LineSegments(
        frustumGeometry,
        new THREE.LineBasicMaterial({ vertexColors: THREE.VertexColors, depthTest: true })
      )
    );
  }
  group.visible = readStoredCameraVisibility();
  return group;
}

function disposeObject(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => {
      if (!material) return;
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value?.isTexture && value !== pointSpriteAlphaMap) textures.add(value);
      });
      Object.values(material.uniforms || {}).forEach((uniform) => {
        if (uniform.value?.isTexture && uniform.value !== pointSpriteAlphaMap) textures.add(uniform.value);
      });
    });
  });
  const images = new Set();
  textures.forEach((texture) => {
    if (texture.image) images.add(texture.image);
    texture.dispose();
  });
  images.forEach((image) => image.close?.());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

// r128 GLTFLoader.load has no abort handle. Stream the same GLB bytes with an
// AbortController, then use GLTFLoader.parse for the unchanged glTF decoding.
function requestGlb(loader, url, onLoad, onProgress, onError, requests) {
  const controller = new AbortController();
  requests.add(controller);
  const fail = (error) => {
    requests.delete(controller);
    if (!controller.signal.aborted) onError(error);
  };
  (async () => {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Scene request failed: ${response.status}`);
    const encoding = response.headers.get("content-encoding");
    const total = !encoding || encoding === "identity" ? Number(response.headers.get("content-length")) || 0 : 0;
    let bytes;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.byteLength;
          onProgress?.({ loaded, total, lengthComputable: total > 0 && loaded <= total });
        }
        bytes = new Uint8Array(loaded);
        let offset = 0;
        chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
      } finally {
        chunks.length = 0;
        reader.releaseLock();
      }
    } else {
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    if (controller.signal.aborted) return;
    onProgress?.({ loaded: bytes.byteLength, total: bytes.byteLength, lengthComputable: true });
    loader.parse(bytes.buffer, THREE.LoaderUtils.extractUrlBase(url), (gltf) => {
      requests.delete(controller);
      if (controller.signal.aborted) {
        disposeObject(gltf.scene);
        return;
      }
      onLoad(gltf);
    }, fail);
  })().catch(fail);
}

function disposeViewerRenderer(renderer) {
  renderer?.dispose?.();
  renderer?.forceContextLoss?.();
}

function cancelGlbRequests(requests) {
  requests.forEach((controller) => controller.abort());
  requests.clear();
}

function createCameraToggle(container, overlay) {
  const external = document.getElementById(container.dataset.cameraControl || "");
  if (external) {
    external.checked = overlay.visible;
    external.disabled = false;
    const change = () => {
      overlay.visible = external.checked;
      storeCameraVisibility(external.checked);
    };
    external.addEventListener("change", change);
    return { dispose: () => { external.removeEventListener("change", change); external.disabled = true; } };
  }
  const control = document.createElement("label");
  control.className = "camera-toggle";
  control.title = "Show reconstructed cameras";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("aria-label", "Show cameras");
  input.checked = overlay.visible;
  const text = document.createElement("span");
  text.textContent = "Cameras";
  input.addEventListener("change", () => {
    overlay.visible = input.checked;
    storeCameraVisibility(input.checked);
  });
  control.append(input, text);
  container.appendChild(control);
  return control;
}

function createPointSizeControl(container, onChange, defaultValue = DEFAULT_POINT_SIZE) {
  const defaultPointSize = clampPointSize(defaultValue);
  const control = document.createElement("div");
  control.className = "point-size-control";
  control.setAttribute("role", "group");
  control.setAttribute("aria-label", "Point size");

  const label = document.createElement("label");
  label.className = "point-size-label";
  const labelText = document.createElement("span");
  labelText.textContent = "Point size";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(POINT_SIZE_MIN);
  slider.max = String(POINT_SIZE_MAX);
  slider.step = "0.1";
  slider.value = String(defaultPointSize);

  const output = document.createElement("output");
  output.className = "point-size-value";
  output.setAttribute("aria-live", "polite");

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "point-size-reset";
  reset.textContent = "Reset";

  function setValue(value) {
    const pointSize = clampPointSize(value);
    slider.value = String(pointSize);
    output.textContent = formatPointSize(pointSize);
    onChange(pointSize);
  }

  slider.addEventListener("input", () => setValue(slider.value));
  reset.addEventListener("click", () => setValue(defaultPointSize));

  label.append(labelText, slider);
  control.append(label, output, reset);
  container.appendChild(control);
  setValue(defaultPointSize);
  return control;
}

function isIndoorGlb(url) {
  return /\/maps\/(omega|map)\//i.test(String(url || ""));
}

function defaultPointSizeForGlb(url) {
  return isIndoorGlb(url) ? DEFAULT_INDOOR_POINT_SIZE : DEFAULT_OUTDOOR_POINT_SIZE;
}

function normalizedViewRotation(value) {
  const degrees = Number(value);
  if (!Number.isFinite(degrees)) return 0;
  return ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
}

function normalizedViewAzimuth(value) {
  const degrees = Number(value);
  if (!Number.isFinite(degrees)) return 0;
  return ((degrees % 360) + 360) % 360;
}

function setOutdoorCameraUp(camera, rotation) {
  switch (normalizedViewRotation(rotation)) {
    case 90:
      camera.up.set(-1, 0, 0);
      break;
    case 180:
      camera.up.set(0, 0, -1);
      break;
    case 270:
      camera.up.set(1, 0, 0);
      break;
    default:
      camera.up.set(0, 0, 1);
  }
}

function normalizedViewTransform(value) {
  const transform = String(value || "").toLowerCase();
  const base = transform.replace(/^opposite_/, "").replace(/_180$/, "");
  return ["diag180", "anti_diag_top", "flip_horizontal", "indoor_y_up", "overview"].includes(base) ? transform : "";
}

function setOutdoorCameraView(camera, distance, rotation, viewTransform) {
  const transform = normalizedViewTransform(viewTransform);
  if (transform.endsWith("_180")) {
    setOutdoorCameraView(camera, distance, rotation, transform.slice(0, -4));
    camera.up.negate();
    return;
  }
  if (transform.startsWith("opposite_")) {
    setOutdoorCameraView(camera, distance, rotation, transform.slice(9));
    camera.position.y *= -1;
    return;
  }
  if (transform === "diag180") {
    camera.position.set(0, -distance, 0);
    camera.up.set(-1, 0, 0);
    return;
  }
  if (transform === "anti_diag_top") {
    camera.position.set(0, distance, 0);
    camera.up.set(1, 0, 0);
    return;
  }
  if (transform === "flip_horizontal") {
    camera.position.set(0, -distance, 0);
    camera.up.set(0, 0, 1);
    return;
  }
  camera.position.set(0, distance, 0);
  setOutdoorCameraUp(camera, rotation);
}

function setIndoorCameraView(camera, distance, height, viewTransform, viewAzimuth = 0) {
  const azimuth = normalizedViewAzimuth(viewAzimuth) * Math.PI / 180;
  camera.position.set(Math.sin(azimuth) * distance, height, Math.cos(azimuth) * distance);
  camera.up.set(0, viewTransform === "indoor_y_up" ? 1 : -1, 0);
  camera.lookAt(0, 0, 0);
}

// One loading surface per viewer. Download percentages never include parsing.
function isLargeInteractiveGlb(url) {
  return /(?:^|\/)assets\/interactive\/(old-town|street-drive|flight)\/omega\/scene(?:-sparse)?\.glb(?:[?#]|$)/i.test(String(url || ""));
}

function fitLargeSceneOverview(model, camera, controls) {
  model.updateMatrixWorld(true);
  const sources = [];
  let count = 0;
  model.traverse((object) => {
    const position = object.geometry?.getAttribute("position");
    if (!position || (!object.isPoints && !object.isMesh)) return;
    sources.push({ position, matrix: object.matrixWorld });
    count += position.count;
  });
  if (!count) return null;
  const point = new THREE.Vector3();
  const stride = Math.max(1, Math.ceil(count / 8192));
  let n = 0;
  let meanX = 0;
  let meanZ = 0;
  let xx = 0;
  let xz = 0;
  let zz = 0;
  // A bounded, deterministic ground-plane PCA supplies orientation only.
  sources.forEach(({ position, matrix }) => {
    for (let index = 0; index < position.count; index += stride) {
      point.fromBufferAttribute(position, index).applyMatrix4(matrix);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) continue;
      n += 1;
      const dx = point.x - meanX;
      const dz = point.z - meanZ;
      meanX += dx / n;
      meanZ += dz / n;
      xx += dx * (point.x - meanX);
      xz += dx * (point.z - meanZ);
      zz += dz * (point.z - meanZ);
    }
  });
  if (!n) return null;
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  const right = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  const elevation = 55 * Math.PI / 180;
  const backward = new THREE.Vector3(-right.z * Math.cos(elevation), Math.sin(elevation), right.x * Math.cos(elevation));
  const up = new THREE.Vector3().crossVectors(backward, right).normalize();
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const projected = new THREE.Vector3();
  // Fit every real vertex, not just the PCA sample, so outliers are not cropped.
  sources.forEach(({ position, matrix }) => {
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(matrix);
      projected.set(point.dot(right), point.dot(up), point.dot(backward));
      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || !Number.isFinite(projected.z)) continue;
      min.min(projected);
      max.max(projected);
    }
  });
  const midpoint = min.clone().add(max).multiplyScalar(0.5);
  const half = max.clone().sub(min).multiplyScalar(0.5);
  const target = right.clone().multiplyScalar(midpoint.x)
    .addScaledVector(up, midpoint.y).addScaledVector(backward, midpoint.z);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanH = tanV * Math.max(camera.aspect, 0.1);
  const distance = Math.max(half.x / tanH, half.y / tanV, 0.01) * 1.12 + half.z;
  camera.position.copy(target).addScaledVector(backward, distance);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  controls.target.copy(target);
  return distance;
}

function createViewerLoading(container, retry) {
  viewerLoadingSurfaces.get(container)?.dispose();
  const element = document.createElement("div");
  element.className = "viewer-loading is-indeterminate";
  element.innerHTML = `<div class="viewer-loading-track" role="progressbar" aria-label="Scene loading" aria-valuemin="0" aria-valuemax="100"><div class="viewer-loading-fill"></div></div><span class="viewer-loading-label" role="status" aria-live="polite"></span><button type="button" class="viewer-loading-retry" hidden>Retry</button>`;
  const track = element.querySelector(".viewer-loading-track");
  const fill = element.querySelector(".viewer-loading-fill");
  const label = element.querySelector(".viewer-loading-label");
  const button = element.querySelector(".viewer-loading-retry");
  let active = true;
  let lastState = "";
  let lastUpdate = "";
  function set(state, text, fraction = null) {
    if (!active) return;
    const update = `${state}|${text}|${fraction}`;
    if (update === lastUpdate) return;
    lastUpdate = update;
    element.dataset.state = state;
    element.hidden = state === "complete";
    element.classList.toggle("is-indeterminate", fraction === null && state !== "error");
    button.hidden = state !== "error";
    container.setAttribute("aria-busy", String(state === "loading" || state === "preparing"));
    if (fraction === null) {
      track.removeAttribute("aria-valuenow");
      fill.style.removeProperty("transform");
    } else {
      const value = Math.min(1, Math.max(0, fraction));
      track.setAttribute("aria-valuenow", String(Math.round(value * 100)));
      fill.style.transform = `scaleX(${value})`;
    }
    // Announce stage changes, not every network chunk.
    label.setAttribute("aria-live", state === lastState ? "off" : "polite");
    label.textContent = text;
    const changed = state !== lastState;
    lastState = state;
    if (changed) container.dispatchEvent(new CustomEvent("viewerstatechange", { detail: { state } }));
  }
  const onRetry = () => {
    if (active) retry();
  };
  button.addEventListener("click", onRetry);
  container.appendChild(element);
  const surface = {
    element,
    set,
    progress(event) {
      if (!active) return;
      const loaded = Number(event.loaded) || 0;
      const total = Number(event.total) || 0;
      if (event.lengthComputable && total > 0) {
        if (loaded >= total) set("preparing", "Preparing scene");
        else set("loading", `Loading · ${Math.floor(loaded / total * 100)}%`, loaded / total);
      } else {
        set("loading", loaded > 0 ? `Loading · ${(loaded / 1048576).toFixed(1)} MB` : "Loading scene");
      }
    },
    dispose() {
      active = false;
      button.removeEventListener("click", onRetry);
      element.remove();
      container.removeAttribute("aria-busy");
      if (viewerLoadingSurfaces.get(container) === surface) viewerLoadingSurfaces.delete(container);
    },
  };
  viewerLoadingSurfaces.set(container, surface);
  set("loading", "Loading scene");
  return surface;
}

function loadGlb(containerId, glbUrl, viewRotation = 0, viewTransform = "", viewAzimuth = 0) {
  const container = document.getElementById(containerId);
  if (!container || !glbUrl) return;
  const rotation = normalizedViewRotation(viewRotation);
  const transform = normalizedViewTransform(viewTransform);
  const azimuth = normalizedViewAzimuth(viewAzimuth);
  const existing = viewers.get(containerId);
  if (
    existing?.url === glbUrl
    && existing?.viewRotation === rotation
    && existing?.viewTransform === transform
    && existing?.viewAzimuth === azimuth
  ) return;
  if (existing) {
    existing.stop?.();
    existing.controls?.dispose?.();
    disposeObject(existing.overlay);
    disposeViewerRenderer(existing.renderer);
    window.removeEventListener("resize", existing.resize);
    viewers.delete(containerId);
  }
  container.replaceChildren();
  const loading = createViewerLoading(container, () => {
    unloadGlb(containerId);
    loadGlb(containerId, glbUrl, viewRotation, viewTransform, viewAzimuth);
  });
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.01, 5000);
  if (isIndoorGlb(glbUrl)) {
    setIndoorCameraView(camera, 8, 1.2, transform, azimuth);
  } else {
    setOutdoorCameraView(camera, 8, rotation, transform);
  }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    loading.set("error", "Unable to start 3D view");
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.domElement.style.touchAction = "none";
  container.prepend(renderer.domElement);
  const controls = new THREE.TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 1.4;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.6;
  controls.dynamicDampingFactor = 0.18;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x303846, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(4, 7, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-4, 3, -5);
  scene.add(fill);
  const clock = new THREE.Clock();
  let mixer = null;
  let frame = 0;
  let cameraToggle = null;
  let disposed = false;
  let modelRoot = null;
  let awaitingFirstFrame = false;
  let contextLost = false;
  let fogThemeObserver = null;
  const cameraRequest = new AbortController();
  const glbRequests = new Set();
  const token = Symbol("glb-viewer");
  const onContextLost = (event) => {
    event.preventDefault();
    if (disposed) return;
    contextLost = true;
    cameraRequest.abort();
    cancelGlbRequests(glbRequests);
    cancelAnimationFrame(frame);
    loading.set("error", "3D view interrupted");
  };
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);
  requestGlb(
    new THREE.GLTFLoader(),
    glbUrl,
    (gltf) => {
      const current = viewers.get(containerId);
      if (disposed || contextLost || !current || current.token !== token) {
        disposeObject(gltf.scene);
        return;
      }
      loading.set("preparing", "Preparing scene");
      const model = gltf.scene;
      modelRoot = model;
      if (transform.replace(/^opposite_/, "").replace(/_180$/, "") === "anti_diag_top") {
        model.scale.z *= -1;
        model.updateMatrixWorld(true);
      }
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      model.position.sub(center);
      scene.add(model);
      current.model = model;
      current.sceneSpan = Math.max(size.x, size.y, size.z);
      const indoor = isIndoorGlb(glbUrl);
      const groundSpan = Math.max(size.x, size.z) || 1;
      const height = Math.max(size.y, groundSpan * 0.02);
      const nadirDist = Math.max(groundSpan * 1.15, height * 2.2);
      const frontDist = Math.max(size.x, size.y, 0.2) * 1.45;
      if (indoor) {
        setIndoorCameraView(camera, frontDist, height * 0.08, transform, azimuth);
      } else {
        setOutdoorCameraView(camera, nadirDist, rotation, transform);
      }
      let dist = indoor ? frontDist : nadirDist;
      controls.target.set(0, 0, 0);
      if (isLargeInteractiveGlb(glbUrl)) dist = fitLargeSceneOverview(model, camera, controls) || dist;
      if (containerId === "indoor-active-viewer") {
        if (!isLargeInteractiveGlb(glbUrl) && !indoor) {
          camera.position.addScaledVector(camera.up, dist * .55).normalize().multiplyScalar(dist);
          camera.lookAt(controls.target);
        }
        const fogColor = () => new THREE.Color(getComputedStyle(container).getPropertyValue("--viz-bg").trim() || "#ffffff");
        scene.fog = new THREE.Fog(fogColor(), dist * .85, dist * 2.5);
        fogThemeObserver = new MutationObserver(() => scene.fog.color.copy(fogColor()));
        fogThemeObserver.observe(document.documentElement, {attributes:true,attributeFilter:["data-theme"]});
      }
      camera.near = Math.max(dist / 10000, 0.001);
      camera.far = dist * 40;
      camera.updateProjectionMatrix();
      controls.minDistance = dist * 0.04;
      controls.maxDistance = dist * 80;
      controls.handleResize();
      controls.update();
      const points = collectPointMaterials(model);
      if (points.hasPoints) {
        createPointSizeControl(
          container,
          (pointSize) => applyPointSize(points.materials, pointSize),
          defaultPointSizeForGlb(glbUrl)
        );
      }
      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
      }
      awaitingFirstFrame = true;
      fetch(camerasUrlFromGlb(glbUrl), { signal: cameraRequest.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          const current = viewers.get(containerId);
          if (disposed || !current || current.token !== token || !data || !modelRoot) return;
          const overlay = buildCameraOverlay(data, Math.max(size.x, size.y, size.z), glbUrl);
          if (!overlay) return;
          model.add(overlay);
          current.overlay = overlay;
          cameraToggle = createCameraToggle(container, overlay);
        })
        .catch(() => {});
    },
    (event) => {
      if (!disposed && !contextLost && viewers.get(containerId)?.token === token) loading.progress(event);
    },
    (err) => {
      const current = viewers.get(containerId);
      if (disposed || !current || current.token !== token) return;
      cancelAnimationFrame(frame);
      loading.set("error", "Unable to load scene");
      console.error(err);
    },
    glbRequests
  );
  function resize() {
    const w = container.clientWidth || 640;
    const h = container.clientHeight || 420;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    controls.handleResize();
  }
  window.addEventListener("resize", resize);
  function animate() {
    frame = requestAnimationFrame(animate);
    if (mixer) mixer.update(clock.getDelta());
    controls.update();
    viewers.get(containerId)?.linkedVideo?.update();
    renderer.render(scene, camera);
    viewers.get(containerId)?.linkedVideo?.project();
    if (awaitingFirstFrame && !renderer.getContext().isContextLost()) {
      awaitingFirstFrame = false;
      loading.set("complete", "Scene ready", 1);
    }
  }
  viewers.set(containerId, {
    renderer,
    scene,
    camera,
    resize,
    controls,
    overlay: null,
    token,
    stop: () => {
      disposed = true;
      fogThemeObserver?.disconnect();
      viewers.get(containerId)?.linkedVideo?.dispose();
      cameraToggle?.dispose?.();
      cameraRequest.abort();
      cancelGlbRequests(glbRequests);
      loading.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      cancelAnimationFrame(frame);
      if (modelRoot) {
        mixer?.stopAllAction();
        mixer?.uncacheRoot(modelRoot);
        mixer = null;
        scene.remove(modelRoot);
        disposeObject(modelRoot);
        modelRoot = null;
        const current = viewers.get(containerId);
        if (current?.token === token) current.overlay = null;
      }
    },
    url: glbUrl,
    viewRotation: rotation,
    viewTransform: transform,
    viewAzimuth: azimuth,
  });
  animate();
}

// Input frames and camera matrices share the GLB's coordinate system. The
// model parent supplies the same recentering/mirroring to points and cameras.
function linkGlbVideo(containerId, video, track, onProjection) {
  const viewer = viewers.get(containerId);
  if (!viewer?.model || !Array.isArray(track?.frames) || !track.frames.length) return false;
  viewer.linkedVideo?.dispose();
  const frames = track.frames;
  const poses = frames.map(frame => mat4FromRowMajor(frame.c2w));
  const positions = poses.map(matrix => new THREE.Vector3().setFromMatrixPosition(matrix));
  // Some retained chunk poses include Sim(3) scale. Strip that scale before
  // interpolating orientations; their translations stay exactly as exported.
  const rotations = poses.map(matrix => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(matrix)).normalize());
  const group = new THREE.Group();
  group.name = "input-camera-track";
  const color = new THREE.Color(0x258a87);
  const pathGeometry = new THREE.BufferGeometry().setFromPoints(positions);
  const path = new THREE.Line(pathGeometry, new THREE.LineBasicMaterial({color, transparent:true, opacity:.22, depthWrite:false}));
  const trail = new THREE.Line(pathGeometry.clone(), new THREE.LineBasicMaterial({color, transparent:true, opacity:.95, depthWrite:false}));
  group.add(path, trail);
  const head = new THREE.Group();
  head.name = "input-camera";
  group.add(head);
  const depth = Math.max(viewer.sceneSpan * .035, .03);
  const corners = Array.from({length:4}, () => new THREE.Vector3());
  const edges = [[0,1],[0,2],[0,3],[0,4],[1,2],[2,3],[3,4],[4,1]];
  const origin = new THREE.Vector3(), up = new THREE.Vector3(0,1,0);
  const edgeMaterial = new THREE.MeshBasicMaterial({color, depthTest:false});
  const rods = edges.map(() => {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(depth * .018,depth * .018,1,6),edgeMaterial);
    rod.renderOrder = 3;
    head.add(rod);
    return rod;
  });
  const planeGeometry = new THREE.BufferGeometry();
  planeGeometry.setAttribute("position",new THREE.Float32BufferAttribute(new Float32Array(12),3));
  planeGeometry.setAttribute("uv",new THREE.Float32BufferAttribute([0,1,1,1,1,0,0,0],2));
  planeGeometry.setIndex([0,3,1,1,3,2]);
  const texture = new THREE.VideoTexture(video);
  texture.encoding = THREE.sRGBEncoding;
  const plane = new THREE.Mesh(planeGeometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true,opacity:.75,depthWrite:false}));
  head.add(plane);
  viewer.model.add(group);
  let current = 0, lastIntrinsics = -1, disposed = false, lastTheme = "";
  const projected = new THREE.Vector3(), local = new THREE.Vector3();
  function shape(index) {
    if (lastIntrinsics === index) return;
    lastIntrinsics = index;
    const K = track.intrinsics?.matrices?.[index] || track.intrinsics?.matrix;
    const [width,height] = track.image_size || [video.videoWidth || 16,video.videoHeight || 9];
    const fx = K?.[0]?.[0] || width, fy = K?.[1]?.[1] || width;
    const cx = K?.[0]?.[2] ?? width/2, cy = K?.[1]?.[2] ?? height/2;
    [[0,0],[width,0],[width,height],[0,height]].forEach(([x,y],i) => {
      corners[i].set((x-cx)/fx*depth,(y-cy)/fy*depth,depth);
      planeGeometry.attributes.position.setXYZ(i,corners[i].x,corners[i].y,corners[i].z);
    });
    planeGeometry.attributes.position.needsUpdate = true;
    planeGeometry.computeBoundingSphere();
    const points = [origin,...corners];
    edges.forEach(([a,b],i) => {
      rods[i].position.copy(points[a]).add(points[b]).multiplyScalar(.5);
      rods[i].scale.y = points[a].distanceTo(points[b]);
      rods[i].quaternion.setFromUnitVectors(up,local.copy(points[b]).sub(points[a]).normalize());
    });
  }
  const linked = {
    group, head, track,
    update() {
      if (disposed) return;
      const theme=document.documentElement.dataset.theme;
      if(theme!==lastTheme) {
        lastTheme=theme;
        [path.material,trail.material,edgeMaterial].forEach(material=>material.color.set(theme==="dark"?0x5dc4bf:0x258a87));
      }
      const time = video.currentTime || 0;
      // Binary search also handles seeking backwards and nonuniform samples.
      let lo=0, hi=frames.length-1;
      while(lo<hi) { const mid=Math.ceil((lo+hi)/2); if(frames[mid].time<=time) lo=mid; else hi=mid-1; }
      current=lo;
      const next=Math.min(current+1,frames.length-1), dt=frames[next].time-frames[current].time;
      const alpha=dt>0 ? Math.min(1,Math.max(0,(time-frames[current].time)/dt)) : 0;
      head.position.copy(positions[current]).lerp(positions[next],alpha);
      head.quaternion.copy(rotations[current]).slerp(rotations[next],alpha);
      shape(current);
      trail.geometry.setDrawRange(0,current+1);
      group.visible=viewer.overlay ? viewer.overlay.visible : readStoredCameraVisibility();
      // Use the linked path in place of a second, sampled camera overlay.
      viewer.overlay?.children.forEach(child => {child.visible=false;});
      group.userData.frame=current;
      head.updateMatrixWorld(true);
    },
    project() {
      if(disposed || !group.visible) {onProjection(null);return;}
      const box=viewer.renderer.domElement.getBoundingClientRect();
      const points=[];
      for(const corner of corners) {
        projected.copy(corner).applyMatrix4(head.matrixWorld);
        if(local.copy(projected).applyMatrix4(viewer.camera.matrixWorldInverse).z>=-viewer.camera.near) {onProjection(null);return;}
        projected.project(viewer.camera);
        points.push([box.left+(projected.x+1)*box.width/2,box.top+(1-projected.y)*box.height/2]);
      }
      onProjection(points);
    },
    dispose() {disposed=true;viewer.model?.remove(group);disposeObject(group);onProjection(null);if(viewer.linkedVideo===linked)viewer.linkedVideo=null;},
  };
  viewer.linkedVideo=linked;
  linked.update();
  return true;
}
window.linkGlbVideo = linkGlbVideo;

function resolveManifestAssetUrl(manifestUrl, assetPath) {
  const path = String(assetPath || "");
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith("data:") || path.startsWith("/")) return path;
  if (/^(?:assets|media|vendor)\//.test(path)) return new URL(path, document.baseURI).toString();
  return new URL(path, new URL(manifestUrl, document.baseURI)).toString();
}

function boundsToBox(bounds) {
  const min = bounds?.min;
  const max = bounds?.max;
  if (!Array.isArray(min) || !Array.isArray(max) || min.length < 3 || max.length < 3) return null;
  const values = [...min.slice(0, 3), ...max.slice(0, 3)].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  return new THREE.Box3(
    new THREE.Vector3(values[0], values[1], values[2]),
    new THREE.Vector3(values[3], values[4], values[5])
  );
}

function mirrorBoxZ(box) {
  return new THREE.Box3(
    new THREE.Vector3(box.min.x, box.min.y, -box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, -box.min.z)
  );
}

function sceneBoxFromManifestBox(box, mirrorZ, center) {
  const sceneBox = (mirrorZ ? mirrorBoxZ(box) : box.clone());
  sceneBox.translate(center.clone().multiplyScalar(-1));
  return sceneBox;
}

function parseTileManifest(manifest, manifestUrl, side, transform) {
  const sideKey = String(side || "native").toLowerCase();
  const sideData = manifest?.sides?.[sideKey];
  const rawTiles = Array.isArray(sideData?.tiles) ? sideData.tiles : [];
  if (!sideData || rawTiles.length < 1) {
    throw new Error(`Tile side "${sideKey}" is missing or empty.`);
  }
  const mirrorZ = transform === "anti_diag_top";
  let globalBox = boundsToBox(manifest?.grid?.combined_bbox) || boundsToBox(sideData.source_bbox);
  if (!globalBox) {
    rawTiles.forEach((tile) => {
      const tileBox = boundsToBox(tile.bbox);
      if (!tileBox) return;
      if (!globalBox) {
        globalBox = tileBox.clone();
      } else {
        globalBox.union(tileBox);
      }
    });
  }
  if (!globalBox) throw new Error("Tile manifest does not include usable bounds.");
  const transformedGlobalBox = mirrorZ ? mirrorBoxZ(globalBox) : globalBox.clone();
  const center = transformedGlobalBox.getCenter(new THREE.Vector3());
  const sceneBox = transformedGlobalBox.clone().translate(center.clone().multiplyScalar(-1));
  const sceneSize = sceneBox.getSize(new THREE.Vector3());
  const sceneSpan = Math.max(sceneSize.x, sceneSize.y, sceneSize.z, 1);
  const tileSize = Number(manifest?.grid?.tile_size);
  const margin = Math.max(
    Number.isFinite(tileSize) && tileSize > 0 ? tileSize * 0.35 : 0,
    sceneSpan * 0.04,
    0.5
  );
  const tiles = rawTiles.map((tile, index) => {
    const sourceBox = boundsToBox(tile.bbox) || globalBox.clone();
    const tileSceneBox = sceneBoxFromManifestBox(sourceBox, mirrorZ, center);
    const tileCenter = tileSceneBox.getCenter(new THREE.Vector3());
    const tileSizeVector = tileSceneBox.getSize(new THREE.Vector3());
    return {
      id: String(tile.id || `tile-${index}`),
      index,
      url: resolveManifestAssetUrl(manifestUrl, tile.path),
      pointCount: Number(tile.point_count) || 0,
      box: tileSceneBox,
      loadBox: tileSceneBox.clone().expandByScalar(margin),
      unloadBox: tileSceneBox.clone().expandByScalar(margin * 1.8),
      center: tileCenter,
      radius: tileSizeVector.length() * 0.5,
      status: "idle",
      object: null,
      wanted: false,
      lastWantedAt: 0,
      lastUnloadAt: 0,
      retryCount: 0,
      retryTimer: null,
    };
  });
  return { center, mirrorZ, sceneBox, sceneSize, sceneSpan, tiles, sideKey };
}

function loadTiledGlb(containerId, manifestUrl, side, viewRotation = 0, viewTransform = "") {
  const container = document.getElementById(containerId);
  if (!container || !manifestUrl) return;
  const rotation = normalizedViewRotation(viewRotation);
  const transform = normalizedViewTransform(viewTransform);
  const sideKey = String(side || "native").toLowerCase();
  const existing = viewers.get(containerId);
  if (
    existing?.tiled === true
    && existing?.url === manifestUrl
    && existing?.side === sideKey
    && existing?.viewRotation === rotation
    && existing?.viewTransform === transform
  ) return;
  if (existing) {
    existing.stop?.();
    existing.controls?.dispose?.();
    disposeObject(existing.overlay);
    disposeViewerRenderer(existing.renderer);
    window.removeEventListener("resize", existing.resize);
    viewers.delete(containerId);
  }

  container.replaceChildren();
  const loading = createViewerLoading(container, () => {
    unloadGlb(containerId);
    loadTiledGlb(containerId, manifestUrl, side, viewRotation, viewTransform);
  });
  loading.set("loading", "Loading scene index");
  const manifestRequest = new AbortController();
  const token = Symbol("tiled-viewer");
  let pendingDisposed = false;
  viewers.set(containerId, {
    renderer: { dispose: () => {} },
    scene: null,
    resize: () => {},
    controls: null,
    overlay: null,
    token,
    stop: () => {
      pendingDisposed = true;
      manifestRequest.abort();
      loading.dispose();
    },
    url: manifestUrl,
    side: sideKey,
    viewRotation: rotation,
    viewTransform: transform,
    tiled: true,
  });

  fetch(manifestUrl, { signal: manifestRequest.signal })
    .then((response) => {
      if (!response.ok) throw new Error(`Tile manifest failed to load: ${response.status}`);
      return response.json();
    })
    .then((manifest) => {
      const active = viewers.get(containerId);
      if (pendingDisposed || !active || active.token !== token) return;
      const parsed = parseTileManifest(manifest, manifestUrl, sideKey, transform);
      const scene = new THREE.Scene();
      scene.background = null;
      const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.01, 5000);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.domElement.style.touchAction = "none";
      container.prepend(renderer.domElement);
      loading.set("loading", "Loading scene tiles");

      const controls = new THREE.TrackballControls(camera, renderer.domElement);
      controls.rotateSpeed = 1.4;
      controls.zoomSpeed = 1.2;
      controls.panSpeed = 0.6;
      controls.dynamicDampingFactor = 0.18;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x303846, 0.9));
      const key = new THREE.DirectionalLight(0xffffff, 0.85);
      key.position.set(4, 7, 6);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.35);
      fill.position.set(-4, 3, -5);
      scene.add(fill);

      const tilesRoot = new THREE.Group();
      tilesRoot.name = "tiled-glb-root";
      tilesRoot.position.copy(parsed.center).multiplyScalar(-1);
      if (parsed.mirrorZ) tilesRoot.scale.z = -1;
      scene.add(tilesRoot);

      const groundSpan = Math.max(parsed.sceneSize.x, parsed.sceneSize.z) || 1;
      const height = Math.max(parsed.sceneSize.y, groundSpan * 0.02);
      const dist = Math.max(groundSpan * 1.15, height * 2.2);
      setOutdoorCameraView(camera, dist, rotation, transform);
      camera.near = Math.max(dist / 10000, 0.001);
      camera.far = dist * 40;
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.minDistance = dist * 0.04;
      controls.maxDistance = dist * 80;
      controls.handleResize();
      controls.update();

      const loader = new THREE.GLTFLoader();
      const glbRequests = new Set();
      const pointMaterials = new Set();
      let currentPointSize = DEFAULT_OUTDOOR_POINT_SIZE;
      let frame = 0;
      let activeLoads = 0;
      let lastTileUpdate = 0;
      let disposed = false;
      let initialReady = false;
      let contextLost = false;
      let initialTiles = [];
      const onContextLost = (event) => {
        event.preventDefault();
        if (disposed) return;
        contextLost = true;
        cancelGlbRequests(glbRequests);
        cancelAnimationFrame(frame);
        loading.set("error", "3D view interrupted");
      };
      renderer.domElement.addEventListener("webglcontextlost", onContextLost);
      const loadQueue = [];
      const frustum = new THREE.Frustum();
      const frustumMatrix = new THREE.Matrix4();

      createPointSizeControl(
        container,
        (pointSize) => {
          currentPointSize = pointSize;
          applyPointSize(pointMaterials, pointSize);
        },
        DEFAULT_OUTDOOR_POINT_SIZE
      );

      function loadedTileCount() {
        return parsed.tiles.filter((tile) => tile.status === "loaded").length;
      }

      function unloadTile(tile) {
        if (tile.status !== "loaded") return;
        tilesRoot.remove(tile.object);
        disposeObject(tile.object);
        tile.materials?.forEach((material) => pointMaterials.delete(material));
        tile.materials = null;
        tile.object = null;
        tile.status = "idle";
        tile.lastUnloadAt = performance.now();
      }

      function queueTile(tile, now) {
        if (tile.status !== "idle") return;
        if (now - tile.lastUnloadAt < TILED_RELOAD_COOLDOWN_MS) return;
        tile.status = "queued";
        loadQueue.push(tile);
      }

      function scheduleTileRetry(tile) {
        const current = viewers.get(containerId);
        if (disposed || !current || current.token !== token || tile.retryCount >= TILED_MAX_TILE_RETRIES) {
          tile.status = "failed";
          return;
        }
        tile.retryCount += 1;
        tile.status = "retrying";
        const delay = TILED_TILE_RETRY_BASE_MS * (2 ** (tile.retryCount - 1));
        tile.retryTimer = setTimeout(() => {
          tile.retryTimer = null;
          const retryCurrent = viewers.get(containerId);
          if (disposed || !retryCurrent || retryCurrent.token !== token) return;
          tile.status = "idle";
          if (tile.wanted) queueTile(tile, performance.now());
          processLoadQueue();
        }, delay);
      }

      function processLoadQueue() {
        if (disposed || contextLost || viewers.get(containerId)?.token !== token) return;
        for (let i = loadQueue.length - 1; i >= 0; i -= 1) {
          const tile = loadQueue[i];
          if (tile.status !== "queued" || !tile.wanted) {
            tile.status = tile.status === "queued" ? "idle" : tile.status;
            loadQueue.splice(i, 1);
          }
        }
        loadQueue.sort((a, b) => {
          if (a.visible !== b.visible) return a.visible ? -1 : 1;
          return a.priority - b.priority;
        });
        while (
          activeLoads < TILED_MAX_CONCURRENT_LOADS
          && loadQueue.length
          && loadedTileCount() + activeLoads < TILED_MAX_LOADED_TILES
        ) {
          const tile = loadQueue.shift();
          if (!tile || tile.status !== "queued" || !tile.wanted) {
            if (tile?.status === "queued") tile.status = "idle";
            continue;
          }
          tile.status = "loading";
          activeLoads += 1;
          requestGlb(
            loader,
            tile.url,
            (gltf) => {
              activeLoads -= 1;
              const current = viewers.get(containerId);
              if (disposed || !current || current.token !== token || !tile.wanted) {
                disposeObject(gltf.scene);
                tile.status = "idle";
                processLoadQueue();
                return;
              }
              const model = gltf.scene;
              const points = collectPointMaterials(model);
              points.materials.forEach((material) => pointMaterials.add(material));
              if (points.hasPoints) applyPointSize(points.materials, currentPointSize);
              tile.retryCount = 0;
              tile.object = model;
              tile.materials = points.materials;
              tile.status = "loaded";
              tilesRoot.add(model);
              processLoadQueue();
            },
            undefined,
            (err) => {
              activeLoads -= 1;
              const current = viewers.get(containerId);
              if (disposed || !current || current.token !== token) {
                tile.status = "idle";
                processLoadQueue();
                return;
              }
              console.error(
                `Tiled GLB tile failed to load: ${tile.url} (attempt ${tile.retryCount + 1}/${TILED_MAX_TILE_RETRIES + 1})`,
                err
              );
              scheduleTileRetry(tile);
              processLoadQueue();
            },
            glbRequests
          );
        }
      }

      function updateTiles(force = false) {
        const now = performance.now();
        if (!force && now - lastTileUpdate < TILED_UPDATE_INTERVAL_MS) return;
        lastTileUpdate = now;
        camera.updateMatrixWorld(true);
        frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(frustumMatrix);
        const cameraDistance = camera.position.distanceTo(controls.target);
        const targetLoadRadius = Math.max(parsed.sceneSpan * 0.22, cameraDistance * 0.7);
        const targetUnloadRadius = targetLoadRadius * 1.45;
        parsed.tiles.forEach((tile) => {
          const visible = frustum.intersectsBox(tile.loadBox);
          const nearTarget = tile.box.distanceToPoint(controls.target) <= targetLoadRadius + tile.radius;
          const keepVisible = frustum.intersectsBox(tile.unloadBox);
          const keepTarget = tile.box.distanceToPoint(controls.target) <= targetUnloadRadius + tile.radius;
          const wanted = visible || nearTarget;
          tile.visible = visible;
          tile.priority = tile.box.distanceToPoint(controls.target);
          tile.wanted = wanted;
          if (wanted) {
            tile.lastWantedAt = now;
            queueTile(tile, now);
          } else if (
            tile.status === "loaded"
            && !keepVisible
            && !keepTarget
            && now - tile.lastWantedAt > TILED_UNLOAD_DELAY_MS
          ) {
            unloadTile(tile);
          }
        });
        const loaded = parsed.tiles
          .filter((tile) => tile.status === "loaded" && !tile.wanted)
          .sort((a, b) => (a.lastWantedAt - b.lastWantedAt) || (b.priority - a.priority));
        while (loadedTileCount() > TILED_MAX_LOADED_TILES && loaded.length) {
          unloadTile(loaded.shift());
        }
        if (!initialReady) {
          initialTiles = parsed.tiles.filter((tile) => tile.wanted)
            .sort((a, b) => Number(b.visible) - Number(a.visible) || a.priority - b.priority)
            .slice(0, TILED_MAX_LOADED_TILES);
        }
        processLoadQueue();
      }

      function resize() {
        const w = container.clientWidth || 640;
        const h = container.clientHeight || 420;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        controls.handleResize();
        updateTiles(true);
      }

      function stop() {
        disposed = true;
        pendingDisposed = true;
        manifestRequest.abort();
        cancelGlbRequests(glbRequests);
        loading.dispose();
        renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
        cancelAnimationFrame(frame);
        parsed.tiles.forEach((tile) => {
          if (tile.retryTimer) {
            clearTimeout(tile.retryTimer);
            tile.retryTimer = null;
          }
          if (tile.object) {
            tilesRoot.remove(tile.object);
            disposeObject(tile.object);
            tile.materials?.forEach((material) => pointMaterials.delete(material));
            tile.materials = null;
            tile.object = null;
          }
          if (tile.status === "queued" || tile.status === "retrying") tile.status = "idle";
        });
        loadQueue.length = 0;
      }

      window.addEventListener("resize", resize);
      viewers.set(containerId, {
        renderer,
        scene,
        resize,
        controls,
        overlay: null,
        token,
        stop,
        url: manifestUrl,
        side: sideKey,
        viewRotation: rotation,
        viewTransform: transform,
        tiled: true,
      });

      function animate() {
        frame = requestAnimationFrame(animate);
        controls.update();
        updateTiles();
        const initialLoaded = initialTiles.filter((tile) => tile.status === "loaded").length;
        const prepared = initialTiles.length > 0 && initialLoaded === initialTiles.length;
        if (!initialReady) {
          if (initialTiles.some((tile) => tile.status === "failed") || !initialTiles.length) {
            loading.set("error", "Unable to load scene tiles");
          } else if (prepared) {
            loading.set("preparing", "Preparing scene");
          } else {
            loading.set("loading", `Loading scene tiles · ${initialLoaded} / ${initialTiles.length}`);
          }
        }
        renderer.render(scene, camera);
        if (!initialReady && prepared && !renderer.getContext().isContextLost()) {
          initialReady = true;
          loading.set("complete", "Visible tiles ready", 1);
        }
      }

      updateTiles(true);
      animate();
    })
    .catch((err) => {
      const current = viewers.get(containerId);
      if (pendingDisposed || !current || current.token !== token) return;
      loading.set("error", "Unable to load scene");
      console.error(err);
    });
}

function unloadGlb(containerId) {
  const existing = viewers.get(containerId);
  if (existing) {
    existing.stop?.();
    existing.controls?.dispose?.();
    disposeObject(existing.overlay);
    disposeViewerRenderer(existing.renderer);
    window.removeEventListener("resize", existing.resize);
    viewers.delete(containerId);
  }
  const container = document.getElementById(containerId);
  if (container) {
    // Initialization can fail before a renderer is registered in viewers.
    viewerLoadingSurfaces.get(container)?.dispose();
    container.replaceChildren();
    container.removeAttribute("aria-busy");
    container.dispatchEvent(new CustomEvent("viewerstatechange", { detail: { state: "idle" } }));
  }
}

window.loadGlb = loadGlb;
window.loadTiledGlb = loadTiledGlb;
window.unloadGlb = unloadGlb;

function autoloadGlbs() {
  document.querySelectorAll("[data-glb-url], [data-tile-manifest]").forEach((el) => {
    if (el.dataset.tileManifest && el.dataset.tileSide) {
      loadTiledGlb(
        el.id,
        el.dataset.tileManifest,
        el.dataset.tileSide,
        el.dataset.viewRotation,
        el.dataset.viewTransform
      );
      return;
    }
    if (el.dataset.glbUrl) {
      loadGlb(el.id, el.dataset.glbUrl, el.dataset.viewRotation, el.dataset.viewTransform, el.dataset.viewAzimuth);
    }
  });
}

function filterRows() {
  const q = (document.getElementById("search")?.value || "").toLowerCase();
  document.querySelectorAll("[data-filter-row]").forEach((row) => {
    row.style.display = row.dataset.filterRow.includes(q) ? "" : "none";
  });
}

window.addEventListener("DOMContentLoaded", autoloadGlbs);
