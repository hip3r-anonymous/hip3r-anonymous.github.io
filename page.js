let publicData = window.PUBLIC_SHOWCASE_DATA || {};
let themedVideoSync = null;
let themedConceptSync = null;

const THEME_STORAGE_KEY = "vggt-showcase-theme";
const SITE_CACHE_VERSION = "hip3r-20260924-remove-videos-03-06-1";

function validTheme(value) {
  return value === "light" || value === "dark" ? value : "";
}

function setTheme(theme, persist = true) {
  const nextTheme = validTheme(theme) || "light";
  const targetTheme = nextTheme === "dark" ? "light" : "dark";
  const label = `Switch to ${targetTheme} theme`;
  document.documentElement.dataset.theme = nextTheme;
  syncThemedImages(nextTheme);
  syncThemedVideos(nextTheme);
  themedConceptSync?.(nextTheme);
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.setAttribute("aria-pressed", nextTheme === "dark" ? "true" : "false");
  });
  if (!persist) return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch (err) {
    void err;
  }
}

function bindThemeToggle() {
  const buttons = Array.from(document.querySelectorAll("[data-theme-toggle]"));
  if (!buttons.length) return;
  setTheme(document.documentElement.dataset.theme, false);
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const currentTheme = validTheme(document.documentElement.dataset.theme) || "light";
      setTheme(currentTheme === "dark" ? "light" : "dark");
    });
  });
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[ch]));
}

function publicLabel(value) {
  return String(value ?? "")
    .replace(/\bPOST3R\+MAP\b/g, "HiP3R")
    .replace(/\bPOST3R\b/g, "HiP3R")
    .replace(/HiP3R\s*\((?:VGGT-Omega|LingBot-MAP)\)/g, "HiP3R")
    .replace(/\bdemo\b/gi, "showcase")
    .replace(/\bSpeed3R(?:[\s_-]+|\s*\(\s*)windowed\s*\)?/gi, "Speed3R");
}

function escPublic(value) {
  return esc(publicLabel(value));
}

function pick(obj, keys, fallback = "") {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function loadOptionalManifest(path) {
  try {
    const response = await fetch(path, { cache: "no-cache" });
    if (!response.ok) return false;
    const source = await response.text();
    if (!source.trim()) return false;
    Function(source)();
    return true;
  } catch (err) {
    console.info(`Optional manifest unavailable: ${path}`);
    return false;
  }
}

function rootAsset(path) {
  if (!path) return "";
  const value = String(path);
  if (/^(https?:)?\/\//.test(value) || value.startsWith("data:")) return value;
  if (value.startsWith("../")) return value.replace(/^(\.\.\/)+/, "");
  if (value.startsWith("./")) return value.replace(/^(\.\/)+/, "");
  if (value.startsWith("/")) return value.replace(/^\/+/, "");
  return value;
}

function mimeType(path) {
  const lower = String(path || "").toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

function formatName(value) {
  return String(value || "")
    .replace(/\.(mp4|webm|mov|glb|png|jpg|jpeg)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function paperMetric(value) {
  const number = finiteNumber(value);
  if (number === null) return "N/A";
  if (number < 0.1) return number.toFixed(4);
  if (number < 100) return number.toFixed(3);
  return number.toFixed(2);
}

function paperRpeTrans(value) {
  const number = finiteNumber(value);
  if (number === null) return "N/A";
  return number < 10 ? number.toFixed(4) : number.toFixed(2);
}

function slug(value) {
  return String(value || "subset").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "subset";
}

function inferVideoCategory(item) {
  const explicit = pick(item, ["category"]);
  if (explicit) return explicit;
  const blob = [item?.id, item?.title, item?.scene, item?.source].join(" ").toLowerCase();
  if (/\bdrive|kitti|dash\b/.test(blob)) return "Driving";
  if (/\bkitchen|desk|tum|eth3d|indoor\b/.test(blob)) return "Indoor";
  return "Exploration";
}

function inferVideoDevice(item) {
  const explicit = pick(item, ["device"]);
  if (explicit) return explicit;
  const blob = [item?.id, item?.title, item?.scene].join(" ").toLowerCase();
  if (/\bdrive|dash\b/.test(blob)) return "Dash camera";
  if (/\bkitchen|desk|tum|rgbd\b/.test(blob)) return "RGB-D";
  return "Handheld";
}

function videoLayout(item) {
  const value = String(pick(item, ["layout"], "combined-lr")).toLowerCase();
  return value === "overlay" || value === "full" ? "overlay" : "combined-lr";
}

const RECON_ASPECT = 16 / 9;
const RECON_EDGE_CROP_PX = 2;

function videoReconWidth(width, height, scene = {}) {
  const explicit = finiteNumber(scene?.reconWidth);
  if (explicit !== null && width > explicit) return explicit;
  return width > 0 && height > 0 ? height * RECON_ASPECT : 0;
}

function reconSpan(width, height, scene = {}) {
  if (!(width > 0 && height > 0)) return 0.5;
  const reconWidth = videoReconWidth(width, height, scene);
  const edgeCrop = Math.max(0, finiteNumber(scene?.reconEdgeCrop) ?? RECON_EDGE_CROP_PX);
  return Math.min(0.85, Math.max(0.35, Math.max(1, reconWidth - edgeCrop) / width));
}

function rgbSplitLeft(width, height, scene = {}) {
  if (!(width > 1 && height > 0)) return 1;
  return Math.min(width - 1, Math.max(1, Math.round(videoReconWidth(width, height, scene))));
}

function normalizeVideo(item, sourceLabel = "Public selection") {
  const preferred = item?.offline3d || item?.adaptive3d || item?.offline4d || item?.adaptive4d;
  const src = pick(item, ["src", "url", "video", "videoUrl", "path"]) || artifactPath(preferred);
  if (!src) return null;
  const viewLabel = pick(item, ["view", "viewLabel"], pick(preferred, ["title", "label"], "Offline 3D"));
  const poster = artifactPath(pick(item, ["poster", "thumbnail", "image"], ""));
  const srcLight = artifactPath(pick(item, ["srcLight", "lightSrc"], ""))
    || artifactPath(item?.offline3d_light || item?.offline3dLight);
  const posterLight = artifactPath(pick(item, ["posterLight", "lightPoster"], ""));
  return {
    id: pick(item, ["id", "scene", "case", "name"], src),
    title: pick(item, ["title", "label", "name"], formatName(src) || "Reconstruction video"),
    scene: pick(item, ["scene", "case", "caseId", "id"], ""),
    source: pick(item, ["source", "collection", "dataset"], sourceLabel),
    src: rootAsset(src),
    srcLight: rootAsset(srcLight),
    inputSrc: rootAsset(artifactPath(item.inputSrc)),
    inputPoster: rootAsset(artifactPath(item.inputPoster)),
    trajectoryUrl: rootAsset(artifactPath(item.trajectoryUrl)),
    curatedBenchmark: item.curatedBenchmark === true,
    poster: rootAsset(poster),
    posterLight: rootAsset(posterLight),
    view: viewLabel,
    category: inferVideoCategory(item),
    device: inferVideoDevice(item),
    layout: videoLayout(item),
    reconWidth: finiteNumber(pick(item, ["reconWidth", "reconstructionWidth", "recon_width"], pick(preferred, ["reconWidth", "reconstructionWidth", "recon_width"], ""))),
    reconEdgeCrop: finiteNumber(pick(item, ["reconEdgeCrop", "reconstructionEdgeCrop", "recon_edge_crop"], pick(preferred, ["reconEdgeCrop", "reconstructionEdgeCrop", "recon_edge_crop"], ""))),
    mediaType: pick(item, ["mediaType", "mimeType"], mimeType(src)),
    frames: pick(item, ["frames", "frameCount"], ""),
    ready: item.ready !== false && item.status !== "pending",
  };
}

function isExcludedSelectedVideo(video) {
  if (video?.id === "barn" && video.curatedBenchmark && video.inputSrc) return false;
  const signature = [
    video?.id,
    video?.title,
    video?.scene,
    video?.source,
    video?.caption,
    video?.src,
  ].join(" ").toLowerCase().replace(/[^a-z0-9]+/g, " ");
  return signature.includes("eth3d office")
    || signature.includes("tanks and temples barn")
    || signature.includes("tat barn");
}

function selectedVideos() {
  const shortTitles = {
    "showroom": "Showroom",
    "old-town": "Old Town",
    kitchen: "Kitchen",
    "street-drive": "Street Drive",
    garden: "Garden",
    flight: "Flight",
    "christ-church": "Christ Church",
    barn: "Barn", diag: "Diag", campus: "Campus", ciampino: "Ciampino",
    spagna: "Spagna", kitti: "KITTI", keble: "Keble",
  };
  const featuredOrder = [
    "old-town",
    "garden",
    "flight",
    "kitchen",
    "showroom",
    "street-drive",
    "kitti", "diag", "campus", "ciampino", "spagna", "keble", "christ-church", "barn",
  ];
  const configured = asArray(publicData.videos)
    .map((item) => normalizeVideo(item))
    .filter(Boolean)
    .filter((item) => item.ready)
    .filter((item) => !isExcludedSelectedVideo(item))
    .filter((item) => featuredOrder.includes(item.id))
    .map((item) => ({ ...item, title: shortTitles[item.id] || item.title }));
  return configured.sort((a, b) => featuredOrder.indexOf(a.id) - featuredOrder.indexOf(b.id));
}

function normalizeGlb(item, sourceLabel = "Public selection") {
  const sourceValue = pick(item, ["src", "url", "glb", "glbUrl", "path", "asset"]);
  const src = artifactPath(sourceValue);
  if (!src) return null;
  const resolved = rootAsset(src);
  const poster = artifactPath(pick(item, ["poster", "preview", "thumbnail"], ""))
    || resolved.replace(/scene\.glb([?#].*)?$/i, "preview.jpg$1");
  const posterPath = rootAsset(poster);
  const explicitLightPoster = artifactPath(pick(item, ["posterLight", "lightPoster", "previewLight", "lightPreview", "thumbnailLight"], ""));
  return {
    id: pick(item, ["id", "scene", "case", "name"], src),
    caseId: pick(item, ["caseId", "case_id", "publicId", "public_id"], ""),
    title: pick(item, ["title", "label", "name"], formatName(src) || "Interactive GLB"),
    scene: pick(item, ["scene", "case", "caseId"], ""),
    method: pick(item, ["method", "methodLabel"], sourceLabel),
    caption: pick(item, ["caption", "note", "description"], "Interactive point-cloud artifact for browser inspection."),
    src: resolved,
    poster: posterPath,
    posterLight: rootAsset(explicitLightPoster) || glbLightPoster(posterPath),
    raw: rootAsset(pick(item, ["raw", "rawUrl", "raw_url"], src)),
    size: pick(item, ["sizeLabel", "size_label", "size"], ""),
    tileManifest: rootAsset(artifactPath(pick(item, ["tileManifest", "tile_manifest", "tilesManifest", "tiles_manifest"], ""))),
    tileSide: pick(item, ["tileSide", "tile_side"], ""),
    viewRotation: finiteNumber(pick(item, ["viewRotation", "view_rotation", "view_rotation_deg"], 0)) || 0,
    viewTransform: pick(item, ["viewTransform", "view_transform"], ""),
    viewAzimuth: finiteNumber(pick(item, ["viewAzimuth", "view_azimuth", "view_azimuth_deg"], 0)) || 0,
  };
}

function selectedGlbs() {
  const skip = new Set(
    allCompareRowSpecs().flatMap((row) => [row?.native?.id, row?.ours?.id]).filter(Boolean)
  );
  return asArray(publicData.glbs || publicData.example_glbs)
    .map((item) => normalizeGlb(item))
    .filter(Boolean)
    .filter((item) => !skip.has(item.id));
}

function selectedMapGlbs() {
  return asArray(publicData.glbs_map)
    .map((item) => normalizeGlb(item))
    .filter(Boolean);
}

// Homepage cards only. Detail routes still resolve the remaining indoor GLBs.
function featuredIndoorGlbs(items) {
  const order = ["case-00", "case-01", "case-02"];
  return items
    .filter((item) => order.includes(String(item.scene)))
    .sort((a, b) => order.indexOf(String(a.scene)) - order.indexOf(String(b.scene)));
}

function allIndoorGlbs() {
  return [...selectedGlbs(), ...selectedMapGlbs()];
}

function ateOf(traj, kind) {
  return finiteNumber(trajectoryMethod(traj, kind)?.ate);
}

function allCompareRowSpecs() {
  return [
    ...asArray(publicData.compare_rows),
    ...asArray(publicData.compare_rows_map),
  ];
}

function compareTrajectoryMap() {
  return new Map([
    ...asArray(publicData.trajectory_omega).map((item) => normalizeTrajectory(item, "VGGT-Omega")),
    ...asArray(publicData.trajectory_map).map((item) => normalizeTrajectory(item, "LingBot-MAP")),
  ].filter(Boolean).map((item) => [item.id, item]));
}

function compareModelKey(row, traj) {
  const value = [
    pick(row, ["model", "modelLabel", "baseline", "baselineLabel"], ""),
    row?.trajectory_id,
    traj?.id,
    traj?.source,
  ].join(" ");
  return /lingbot|map/i.test(value) ? "map" : "omega";
}

function compareModelLabels(modelKey) {
  if (modelKey === "map") {
    return {
      baseline: "LingBot-MAP",
      ours: "HiP3R",
      ateKind: "lingbot",
    };
  }
  return {
    baseline: "VGGT-Omega",
    ours: "HiP3R",
    ateKind: "omega",
  };
}

function compareGap(row) {
  if (row.nativeAte === null || row.oursAte === null) return Number.NEGATIVE_INFINITY;
  return row.nativeAte - row.oursAte;
}

function selectedCompareRows() {
  const trajs = compareTrajectoryMap();
  const rows = allCompareRowSpecs().map((row, index) => {
    const traj = trajs.get(row.trajectory_id);
    const viewRotation = finiteNumber(pick(row, ["viewRotation", "view_rotation", "view_rotation_deg"], 0)) || 0;
    const viewTransform = pick(row, ["viewTransform", "view_transform"], "");
    const native = row.native
      ? normalizeGlb({ ...row.native, view_rotation_deg: viewRotation, view_transform: viewTransform })
      : null;
    const ours = row.ours
      ? normalizeGlb({ ...row.ours, view_rotation_deg: viewRotation, view_transform: viewTransform })
      : null;
    const vggtLong = row.vggt_long
      ? normalizeGlb({ ...row.vggt_long, view_rotation_deg: row.vggt_long.view_rotation_deg ?? viewRotation, view_transform: row.vggt_long.view_transform ?? viewTransform })
      : null;
    if (!traj?.figure || Boolean(native) !== Boolean(ours)) return null;
    const modelKey = compareModelKey(row, traj);
    const labels = compareModelLabels(modelKey);
    return {
      id: pick(row, ["id", "scene"], traj.id),
      title: pick(row, ["title"], traj.title) || formatName(pick(row, ["scene"], traj.scene)),
      caption: pick(row, ["caption"], traj.caption),
      dataset: pick(row, ["dataset"], traj.dataset),
      scene: pick(row, ["scene"], traj.scene),
      modelKey,
      baselineLabel: pick(row, ["baselineLabel", "baseline_label"], labels.baseline),
      oursLabel: pick(row, ["oursLabel", "ours_label"], labels.ours),
      traj,
      native,
      vggtLong,
      ours,
      lazy: row.lazy === true,
      nativeAte: ateOf(traj, labels.ateKind),
      oursAte: ateOf(traj, "ours"),
      index,
    };
  }).filter(Boolean);
  // Lead with strong relative ATE reductions; retain the curated closing
  // examples: Keble for Omega and Pincio for MAP.
  const featured = {
    omega: ["omega-case-01", "omega-case-04", "omega-case-00", "omega-case-05", "omega-case-03", "omega-case-02"],
    map: ["map-case-01", "map-case-03", "map-case-05", "map-case-00", "map-case-02"],
  };
  const take = (modelKey) => {
    const byId = new Map(rows.filter((row) => row.modelKey === modelKey).map((row) => [row.id, row]));
    return featured[modelKey].map((id) => byId.get(id)).filter(Boolean);
  };
  return [...take("omega"), ...take("map")].map((row, index) => ({ ...row, index }));
}

function artifactPath(value) {
  if (!value) return "";
  return typeof value === "string" ? value : pick(value, ["src", "url", "path", "image"]);
}

function glbLightPoster(path) {
  const value = rootAsset(path);
  if (!/^assets\/maps\/.+\/preview\.jpe?g(?:[?#].*)?$/i.test(value)) return "";
  return value.replace(/preview\.jpe?g([?#].*)?$/i, "preview.png$1");
}

function currentTheme() {
  return validTheme(document.documentElement.dataset.theme) || "light";
}

function themedImageSrc(darkSrc, lightSrc, theme = currentTheme()) {
  return theme === "light" && lightSrc ? lightSrc : darkSrc;
}

function handleThemedImageError(event) {
  const img = event.currentTarget;
  const failed = img.getAttribute("src") || "";
  const fallback = img.dataset.darkSrc || img.dataset.originalSrc || "";
  if (failed) img.dataset.failedThemeSrc = failed;
  if (fallback && failed !== fallback) img.src = fallback;
}

function syncThemedImages(theme = currentTheme()) {
  document.querySelectorAll("img[data-light-src][data-dark-src]").forEach((img) => {
    if (!img.dataset.themeFallbackBound) {
      img.addEventListener("error", handleThemedImageError);
      img.dataset.themeFallbackBound = "true";
    }
    const fallback = img.dataset.darkSrc || "";
    const desired = themedImageSrc(fallback, img.dataset.lightSrc || "", theme);
    const nextSrc = img.dataset.failedThemeSrc === desired ? fallback : desired;
    if (nextSrc && img.getAttribute("src") !== nextSrc) img.src = nextSrc;
  });
}

function themedVideoMedia(scene, theme = currentTheme()) {
  const light = theme === "light" && Boolean(scene?.srcLight);
  return {
    src: light ? scene.srcLight : scene?.src || "",
    poster: (light ? scene.posterLight : "") || scene?.poster || "",
  };
}

function syncThemedVideos(theme = currentTheme()) {
  if (typeof themedVideoSync === "function") themedVideoSync(theme);
}

function themedImageAttributes(darkSrc, lightSrc = "") {
  const dark = rootAsset(darkSrc);
  const light = rootAsset(lightSrc);
  if (!light || light === dark) return `src="${esc(dark)}"`;
  return [
    `src="${esc(themedImageSrc(dark, light))}"`,
    `data-dark-src="${esc(dark)}"`,
    `data-light-src="${esc(light)}"`,
    `data-original-src="${esc(dark)}"`,
  ].join(" ");
}

function normalizeTrajectory(item, sourceLabel = "Public selection") {
  const figures = item?.figures || item?.images || {};
  const figure = pick(item, ["figure", "image", "src", "url"], "") || artifactPath(figures.cover) || artifactPath(figures.matrix_gt_zoom) || artifactPath(figures.matrix) || artifactPath(figures.prediction) || artifactPath(figures.full) || artifactPath(figures.gtZoom);
  const explicitLightFigure = pick(item, ["figureLight", "lightFigure", "imageLight", "light_image"], "")
    || artifactPath(figures.cover_light)
    || artifactPath(figures.coverLight)
    || artifactPath(figures.matrix_gt_zoom_light)
    || artifactPath(figures.matrixLight)
    || artifactPath(figures.light);
  const methods = asArray(item?.methods || item?.rows).map((method) => {
    const traj = method?.eval?.traj || method?.traj || {};
    return {
      ...method,
      ate: pick(method, ["ate", "ATE"], pick(traj, ["ate", "ATE"], "")),
      rpeRot: pick(method, ["rpeRot", "rpe_rot"], pick(traj, ["rpe_rot", "rpeRot"], "")),
      rpeTrans: pick(method, ["rpeTrans", "rpe_trans"], pick(traj, ["rpe_trans", "rpeTrans"], "")),
      pairs: pick(method, ["pairs", "pairCount", "num_frame_pairs"], ""),
    };
  });
  return {
    id: pick(item, ["id", "scene", "case", "name"], figure || sourceLabel),
    title: pick(item, ["title", "name", "scene", "case"], "Trajectory comparison"),
    dataset: pick(item, ["dataset", "source", "collection"], sourceLabel),
    scene: pick(item, ["scene", "case", "id"], ""),
    source: pick(item, ["source", "collection", "dataset"], sourceLabel),
    figure: rootAsset(figure),
    figureLight: rootAsset(explicitLightFigure || (/^assets\/showcase\/trajectories\/.+_trajectory_matrix_gt_zoom\.png$/.test(figure) ? figure.replace(/\.png$/, "_light.png") : "")),
    caption: pick(item, ["caption", "note", "description"], "Predicted trajectory compared against GT when GT is available."),
    coverLayout: item?.cover_layout || item?.coverLayout || null,
    legendPalette: item?.legendPalette || "",
    methods,
    selection: item?.selection || null,
    gtAvailable: item?.gtAvailable !== false && item?.gt !== false,
  };
}

function selectedOmegaTrajectories() {
  return selectTrajectoryCases(publicData.trajectory_omega, "VGGT-Omega");
}

function selectedMapTrajectories() {
  return selectTrajectoryCases(publicData.trajectory_map, "LingBot-MAP");
}

function selectedLongTrajectories() {
  return selectTrajectoryCases(publicData.trajectory_long, "VGGT-Long");
}

function selectTrajectoryCases(items, sourceLabel) {
  const cases = asArray(items)
    .map((item) => normalizeTrajectory(item, sourceLabel))
    .filter((item) => item.figure || item.methods.length);
  if (cases.length <= 4) return cases;
  return cases.sort((a, b) => trajectoryNativeGap(b) - trajectoryNativeGap(a)).slice(0, 4);
}

function trajectoryNativeGap(item) {
  const native = finiteNumber(item?.methods?.[0]?.ate);
  const ours = finiteNumber(trajectoryMethod(item, "ours")?.ate);
  if (native === null || ours === null) return Number.NEGATIVE_INFINITY;
  return native - ours;
}

function renderHero() {
  return `<section class="hero" aria-labelledby="paper-title">
    <div class="hero-copy">
      <h1 id="paper-title"><span class="hero-wordmark" role="img" aria-label="HiP3R"><span class="brand-lockup hero-brand-centered" aria-hidden="true"><span class="hero-brand-left"><span class="brand-letter">H</span><svg class="brand-bolt" viewBox="0 0 44 80" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false"><path class="bolt-face" d="M27 0H44L28 30H42L5 80L15 45H0L27 0Z"/><path class="bolt-edge" d="M28 30H42L5 80L30 38H19L36 0H44L28 30Z"/></svg></span><span class="brand-letter hero-brand-p">P</span><span class="brand-letter brand-ending hero-brand-right">3R</span></span></span><span class="hero-title">Hierarchical Pose Graphs for<br class="desktop-break"> Long-Horizon 3D Reconstruction</span></h1>
      <a class="hero-link" href="#compare">Explore the comparisons <span aria-hidden="true">↗</span></a>
    </div>
    <figure class="hero-overview">
      <video controls playsinline preload="metadata" poster="assets/overview/hip3r-poster.jpg?v=20261022" width="1920" height="1080" aria-label="HiP3R overview: hierarchical pose graphs for long-horizon 3D reconstruction">
        <source src="assets/overview/hip3r.mp4?v=20261025-v19" type="video/mp4">
        <a href="assets/overview/hip3r.mp4?v=20261025-v19">Download the HiP3R overview video</a>.
      </video>
    </figure>
  </section>`;
}

const CONCEPT_CHAPTERS = [
  {
    id: "windows", tab: "Overlapping windows", stage: "The problem",
    title: "One frame, several predictions",
    text: "Overlapping windows can predict different camera poses for the same frame. Aligning whole windows cannot resolve those disagreements on its own.",
    alt: "Overlapping reconstruction windows contain different camera predictions for the same frame.",
  },
  {
    id: "layout", tab: "Global layout", stage: "Stage I · Sim(3)",
    title: "First, recover the global layout",
    text: "Each chunk is aligned in scale, rotation and position using overlaps and registered revisits. Loop constraints enter from shorter to longer temporal spans.",
    alt: "Whole chunks align through overlap links and progressively introduced registered-revisit constraints; duplicate camera predictions remain.",
  },
  {
    id: "shared", tab: "Shared cameras", stage: "Stage II · SE(3)",
    title: "Then, share one camera per frame",
    text: "With chunk transforms fixed, placement priors and within-chunk motion constraints refine shared camera poses into one trajectory.",
    alt: "Fixed chunk placements provide soft priors to shared camera poses, joined by local motion constraints into one trajectory.",
  },
];

function renderFrameworkSection() {
  return `<section id="method" class="concept-section" aria-labelledby="concept-heading">
    <div class="concept-intro">
      <h2 id="concept-heading">Method</h2>
    </div>
    <figure class="method-framework"><a href="assets/method/framework.pdf" target="_blank" rel="noopener" aria-label="Open the paper method framework PDF in a new tab" title="Open full-size framework"><img src="assets/method/framework.svg" width="1152" height="436" alt="HiP3R framework: overlapping windows feed a frozen reconstruction backend, followed by chunk-level Sim(3) alignment and shared-camera SE(3) refinement."></a><figcaption>HiP3R aligns overlapping reconstructions at the chunk level, then refines one shared camera pose per frame.</figcaption></figure>
  </section>`;
}

function renderConceptSection() {
  const chapter = CONCEPT_CHAPTERS[0];
  return `<section id="concept" class="concept-section concept-leading" aria-label="HiP3R method concepts">
    <div id="concept-tabs" class="concept-tabs" role="tablist" aria-label="How HiP3R works">${CONCEPT_CHAPTERS.map((item, i) => `<button type="button" role="tab" id="concept-tab-${i}" aria-controls="concept-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-index="${i}">${esc(item.tab)}</button>`).join("")}</div>
    <figure id="concept-panel" class="concept-figure" role="tabpanel" aria-labelledby="concept-tab-0" tabindex="0">
      <div class="concept-stage">
        <video id="concept-video" muted playsinline loop preload="none" poster="assets/concepts/windows-${currentTheme()}.png" aria-label="${esc(chapter.alt)}" aria-describedby="concept-description"></video>
      </div>
      <figcaption class="concept-caption">
        <div class="concept-copy" aria-live="polite"><span id="concept-stage-label">${esc(chapter.stage)}</span><h3 id="concept-title">${esc(chapter.title)}</h3><p id="concept-description">${esc(chapter.text)}</p></div>
        <div class="concept-actions"><div class="concept-buttons"><button type="button" id="concept-play">Play</button><button type="button" id="concept-replay">Replay</button></div><span id="concept-status" role="status" hidden></span></div>
      </figcaption>
    </figure>
  </section>`;
}

function bindConceptSection() {
  const video = document.getElementById("concept-video");
  if (!video) return;
  const panel = document.getElementById("concept-panel");
  const play = document.getElementById("concept-play");
  const replay = document.getElementById("concept-replay");
  const status = document.getElementById("concept-status");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let index = 0, visible = false, wantsPlay = !motion.matches, disposed = false;
  let loading = false, resumeTime = 0, desiredSrc = "", mediaGeneration = 0;
  function updateControls() {
    play.textContent = wantsPlay ? "Pause" : "Play";
    play.setAttribute("aria-label", wantsPlay ? "Pause method illustration" : "Play method illustration");
  }
  function maybePlay() {
    if (disposed || !visible || document.hidden || !wantsPlay || loading || video.seeking) return;
    const generation = mediaGeneration;
    video.play().catch((error) => {
      if (error.name !== "AbortError" && generation === mediaGeneration && !disposed && visible && !document.hidden) { wantsPlay = false; updateControls(); }
    });
  }
  function ensureLoaded() {
    if (video.getAttribute("src") !== desiredSrc || video.error) {
      loading = true;
      video.preload = "auto";
      video.src = desiredSrc;
      video.load();
    } else maybePlay();
  }
  function setMedia(theme = currentTheme(), preserveTime = false) {
    mediaGeneration += 1;
    const wasLoaded = Boolean(video.getAttribute("src"));
    resumeTime = preserveTime ? (loading ? resumeTime : video.currentTime || 0) : 0;
    video.pause();
    const chapter = CONCEPT_CHAPTERS[index];
    desiredSrc = `assets/concepts/${chapter.id}-${theme}.mp4`;
    video.poster = `assets/concepts/${chapter.id}-${theme}.png`;
    video.setAttribute("aria-label", chapter.alt);
    status.hidden = true;
    status.textContent = "";
    if ((visible && wantsPlay) || (preserveTime && wasLoaded)) ensureLoaded();
    else {
      loading = false;
      if (wasLoaded) { video.removeAttribute("src"); video.load(); }
    }
    updateControls();
  }
  bindSceneTabs("concept-tabs", (next) => {
    if (next === index) return;
    index = next;
    const chapter = CONCEPT_CHAPTERS[index];
    panel.setAttribute("aria-labelledby", `concept-tab-${index}`);
    document.getElementById("concept-stage-label").textContent = chapter.stage;
    document.getElementById("concept-title").textContent = chapter.title;
    document.getElementById("concept-description").textContent = chapter.text;
    setMedia();
  });
  video.addEventListener("loadeddata", () => {
    if (disposed || !loading) return;
    loading = false;
    if (resumeTime > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(resumeTime, Math.max(0, video.duration - 0.05));
    resumeTime = 0;
    maybePlay();
  });
  video.addEventListener("seeked", maybePlay);
  video.addEventListener("error", () => {
    if (disposed || !video.getAttribute("src")) return;
    loading = false; wantsPlay = false;
    status.textContent = "Animation unavailable. The illustration and explanation remain available.";
    status.hidden = false; updateControls();
  });
  play.addEventListener("click", () => {
    wantsPlay = !wantsPlay;
    if (wantsPlay) ensureLoaded(); else video.pause();
    updateControls();
  });
  replay.addEventListener("click", () => {
    wantsPlay = true; resumeTime = 0;
    if (video.readyState >= 2 && video.getAttribute("src") === desiredSrc) video.currentTime = 0;
    ensureLoaded(); updateControls();
  });
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && wantsPlay) ensureLoaded(); else video.pause();
  }, { threshold: 0.15 });
  observer.observe(video);
  function onVisibility() {
    if (document.hidden) video.pause(); else if (visible && wantsPlay) ensureLoaded();
  }
  function onMotion() {
    if (motion.matches) { wantsPlay = false; video.pause(); updateControls(); }
  }
  function onPageShow() { if (visible && wantsPlay) ensureLoaded(); }
  document.addEventListener("visibilitychange", onVisibility);
  motion.addEventListener("change", onMotion);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("pagehide", (event) => {
    video.pause();
    if (event.persisted) return;
    disposed = true; observer.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    motion.removeEventListener("change", onMotion);
    window.removeEventListener("pageshow", onPageShow);
    themedConceptSync = null;
  });
  themedConceptSync = (theme) => setMedia(theme, true);
  setMedia();
}

function renderVideoSection(videos) {
  if (!videos.length) {
    return `<section id="videos" class="section">
      <div class="section-head">
        <h2>Reconstruction videos</h2>
      <p>Follow the camera in 3D, alongside its input and reconstruction.</p>
      </div>
      <div class="empty-card"><b>No reconstruction videos</b><p>Add combined reconstruction and RGB media to the public manifest.</p></div>
    </section>`;
  }
  const selector = videos.map((video, index) => `<div class="scene-selector-item">
      <button type="button" role="tab" data-scene="${index}" aria-selected="${index === 0 ? "true" : "false"}"${index === 0 ? " class=\"active\"" : ""}>
        <figure class="scene-selector-thumb">
          <img loading="lazy" ${themedImageAttributes(video.inputPoster || video.poster, video.inputPoster || video.posterLight)} alt="">
          <canvas class="scene-selector-live" width="320" height="180" aria-hidden="true"></canvas>
        </figure>
        <div class="scene-selector-copy">
          <span class="scene-selector-index">${String(index + 1).padStart(2, "0")}</span>
          <b class="scene-selector-title">${escPublic(video.title)}</b>
        </div>
      </button>
    </div>`).join("");
  return `<section id="videos" class="section">
    <div class="section-head">
      <h2>Reconstruction videos</h2>
      <p>Follow the camera in 3D, alongside its input and reconstruction.</p>
    </div>
    <div class="scene-gallery" id="scene-gallery" style="--scene-count: ${videos.length}">
      <div class="scene-workspace">
        <div class="scene-inputs">
          <section class="scene-trajectory-panel" aria-label="Interactive camera trajectory">
            <div class="scene-panel-heading"><span>Camera trajectory</span><button id="trajectory-reset" type="button">Reset view</button></div>
            <div class="scene-trajectory" id="scene-trajectory"><span class="trajectory-status">Loading trajectory…</span></div>
            <div class="trajectory-caption"><span id="trajectory-frame">Drag to orbit · Scroll to zoom</span></div>
          </section>
          <section class="scene-input-panel" aria-label="Synchronized input video">
            <div class="scene-panel-heading"><span>Input RGB</span><span class="scene-panel-note" id="scene-input-note">Preview</span></div>
            <figure class="scene-rgb-input" id="scene-rgb-pip">
              <canvas id="scene-rgb-canvas" width="320" height="180" aria-label="Input RGB preview"></canvas>
              <video id="scene-input-video" muted loop playsinline preload="metadata" hidden aria-hidden="true"></video>
              <figure class="scene-reference" id="scene-reference" hidden><img id="scene-reference-image" alt="Earlier input frame at the selected revisit"><figcaption id="scene-reference-label"></figcaption></figure>
            </figure>
          </section>
        </div>
        <section class="scene-output" aria-label="Reconstruction output">
          <div class="scene-panel-heading"><span>HiP3R reconstruction</span><span class="scene-panel-note">Output</span></div>
          <div class="scene-stage is-combined-lr" id="scene-stage">
            <video id="scene-video" muted loop playsinline preload="metadata"></video>
            <div class="scene-video-placeholder" id="scene-video-placeholder" role="status" aria-label="Loading reconstruction"></div>
            <button class="demo-nav demo-prev" id="demo-prev" type="button" aria-label="Previous scene" title="Previous scene"><span>‹</span></button>
            <button class="demo-nav demo-next" id="demo-next" type="button" aria-label="Next scene" title="Next scene"><span>›</span></button>
          </div>
        </section>
      </div>
      <div class="scene-events" id="scene-events" hidden></div>
      <div class="scene-controls">
        <button type="button" class="scene-play" id="scene-play">Play</button>
        <label class="scene-speed" for="scene-speed"><span>Speed</span><select id="scene-speed"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2" selected>2×</option><option value="4">4×</option><option value="8">8×</option></select></label>
        <input class="scene-progress" id="scene-progress" type="range" min="0" max="1000" step="1" value="0" aria-label="Video progress">
        <span class="scene-time" id="scene-time">0:00</span>
      </div>
      <div class="scene-now" id="scene-now"></div>
      <div class="scene-selector" id="scene-selector" role="tablist" aria-label="Demo scenes">${selector}</div>
    </div>
  </section>`;
}

function isComparePage() {
  return /compare\.html$/i.test(window.location.pathname);
}

function isViewPage() {
  return /view\.html$/i.test(window.location.pathname);
}

function glbDetailId() {
  const params = new URLSearchParams(window.location.search);
  return {
    caseId: params.get("case") || "",
    legacyId: params.get("glb") || params.get("id") || "",
  };
}

function indoorGlbHref(item) {
  const key = item?.caseId || item?.id || "";
  const param = item?.caseId ? "case" : "glb";
  return `view.html?${param}=${encodeURIComponent(key)}`;
}

const GLB_MODAL_VIEWER_ID = "glb-modal-viewer";

function renderGlbModalButton(item) {
  const tileAttrs = item.tileManifest && item.tileSide
    ? ` data-tile-manifest="${esc(item.tileManifest)}" data-tile-side="${esc(item.tileSide)}"`
    : "";
  return `<button class="button primary" type="button" data-open-glb-modal
    data-glb-url="${esc(item.src)}"${tileAttrs}
    data-glb-title="${escPublic(item.modalTitle || item.title || "3D map")}"
    data-view-rotation="${esc(item.viewRotation || 0)}"
    data-view-transform="${esc(item.viewTransform || "")}"
    data-view-azimuth="${esc(item.viewAzimuth || 0)}">Open 3D map</button>`;
}

function renderGlbModal() {
  return `<div class="glb-modal" id="glb-modal" hidden>
    <button class="glb-modal-backdrop" type="button" data-close-glb-modal tabindex="-1" aria-label="Close 3D viewer"></button>
    <section class="glb-modal-panel" role="dialog" aria-modal="true" aria-labelledby="glb-modal-title">
      <header class="glb-modal-header">
        <div>
          <small>Interactive 3D</small>
          <h2 id="glb-modal-title">3D map</h2>
        </div>
        <button class="button glb-modal-close" type="button" data-close-glb-modal>Close</button>
      </header>
      <div class="glb-modal-stage">
        <div class="viewer" id="${GLB_MODAL_VIEWER_ID}"><div class="empty-card">Loading interactive GLB...</div></div>
      </div>
      <footer class="glb-modal-help">Drag to rotate · scroll to zoom · right-drag to pan</footer>
    </section>
  </div>`;
}

function findIndoorGlb(request) {
  const detail = typeof request === "string" ? { legacyId: request } : (request || {});
  const caseId = String(detail.caseId || "");
  const legacyId = String(detail.legacyId || "");
  return allIndoorGlbs().find((entry) => (caseId && entry.caseId === caseId) || (legacyId && entry.id === legacyId)) || null;
}

function canonicalizeIndoorGlbUrl(item) {
  if (!item?.caseId || !window.history?.replaceState) return;
  const params = new URLSearchParams(window.location.search);
  const currentCase = params.get("case") || "";
  if (currentCase === item.caseId && !params.get("glb") && !params.get("id")) return;
  const nextUrl = `${window.location.pathname}?case=${encodeURIComponent(item.caseId)}${window.location.hash || ""}`;
  window.history.replaceState(null, "", nextUrl);
}

function renderGlbCard(item, index, extraClass = "", {
  live = false,
  openHref = "",
  showTitle = true,
  showCaption = true,
  showMeta = true,
} = {}) {
  const titleKey = publicLabel(item.title).toLowerCase().replace(/\s+/g, " ").trim();
  const isRepeatedMeta = (value) => {
    const valueKey = publicLabel(value).toLowerCase().replace(/\s+/g, " ").trim();
    return Boolean(valueKey && titleKey.includes(valueKey));
  };
  const metaPills = [
    item.method && !isRepeatedMeta(item.method) ? escPublic(item.method) : "",
    item.scene && !isRepeatedMeta(item.scene) ? escPublic(item.scene) : "",
    item.size ? esc(item.size) : "",
  ].filter(Boolean);
  const viewerId = `showcase-glb-${index}-${String(item.id).replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const tileAttrs = item.tileManifest && item.tileSide
    ? ` data-tile-manifest="${esc(item.tileManifest)}" data-tile-side="${esc(item.tileSide)}"`
    : "";
  const media = live
    ? `<div class="viewer" id="${esc(viewerId)}" data-glb-url="${esc(item.src)}"${tileAttrs} data-view-rotation="${esc(item.viewRotation || 0)}" data-view-transform="${esc(item.viewTransform || "")}" data-view-azimuth="${esc(item.viewAzimuth || 0)}"><div class="empty-card">Loading interactive GLB...</div></div>`
    : `<figure class="glb-preview"><img ${index === 0 ? "" : "loading=\"lazy\" "}${themedImageAttributes(item.poster, item.posterLight)} alt="${escPublic(item.title)} preview"></figure>`;
  const openBtn = live
    ? `<a class="button" href="${esc(item.raw || item.src)}" target="_blank">${item.tileManifest ? "Download lightweight GLB" : "Open GLB"}</a>`
    : renderGlbModalButton(item);
  return `<article class="glb-card${extraClass ? ` ${extraClass}` : ""}">
    ${media}
    <div class="glb-card-body">
      ${showTitle ? `<h3>${escPublic(item.title)}</h3>` : ""}
      ${showCaption && item.caption ? `<p>${escPublic(item.caption)}</p>` : ""}
      ${showMeta && metaPills.length ? `<div class="meta-line">${metaPills.map((label) => `<span class="pill">${label}</span>`).join("")}</div>` : ""}
      <div class="glb-actions">${openBtn}</div>
    </div>
  </article>`;
}

function compareDetailId() {
  return new URLSearchParams(window.location.search).get("scene") || "";
}

function renderCompareGlb(item, index, ate, kicker, { live = false, href = "", sceneTitle = "" } = {}) {
  const compact = {
    ...item,
    title: kicker,
    modalTitle: sceneTitle ? `${sceneTitle} · ${kicker}` : kicker,
    caption: "",
    scene: "",
    method: "",
  };
  return renderGlbCard(compact, index, "compare-col", {
    live,
    openHref: href,
    showTitle: true,
    showCaption: false,
    showMeta: false,
  });
}

function renderCompareRow(row, { live = false } = {}) {
  const href = `compare.html?scene=${encodeURIComponent(row.id)}`;
  const glbs = row.native && row.ours
    ? `${renderCompareGlb(row.native, `${row.index}-native`, row.nativeAte, row.baselineLabel, { live, href, sceneTitle: row.title })}${row.vggtLong ? renderCompareGlb(row.vggtLong, `${row.index}-long`, null, "VGGT-Long", { live, href, sceneTitle: row.title }) : ""}${renderCompareGlb(row.ours, `${row.index}-ours`, row.oursAte, row.oursLabel, { live, href, sceneTitle: row.title })}`
    : "";
  return `<div class="compare-row${glbs ? "" : " is-traj-only"}${row.vggtLong ? " has-long-baseline" : ""}">
    <article class="compare-col compare-traj">
      <figure><img ${themedImageAttributes(row.traj.figure, row.traj.figureLight)} alt="Trajectory vs GT"></figure>
      ${trajectoryMethodKey(row.traj)}
    </article>
    ${glbs}
  </div>`;
}

function renderCompareSelection(rows) {
  return `<div class="showcase-tabs" id="compare-tabs" role="tablist" aria-label="Trajectory comparison scenes">${rows.map((row, i) => `<button type="button" role="tab" id="compare-tab-${i}" aria-controls="compare-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-index="${i}"><b>${escPublic(row.title)}</b></button>`).join("")}</div>`;
}

function renderCompareSection(rows) {
  if (!rows.length) return "";
  const initialRows = rows.filter(row => row.modelKey === "omega");
  return `<section id="compare" class="section">
    <div class="section-head"><h2>Trajectory Comparison</h2><p>Ground-truth trajectories, baseline methods, and HiP3R reconstructions.</p></div>
    <div class="compare-controls">
      <div id="compare-selection">${renderCompareSelection(initialRows)}</div>
    </div>
    <div id="compare-panel" role="tabpanel" aria-labelledby="compare-tab-0" tabindex="0">${initialRows.length ? renderCompareRow(initialRows[0]) : ""}</div>
  </section>`;
}

function bindSceneTabs(id, onSelect) {
  const list = document.getElementById(id);
  if (!list) return;
  const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
  function select(index, focus = false) {
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
    if (focus) tabs[index].focus();
    onSelect(index);
  }
  list.addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab && list.contains(tab)) select(Number(tab.dataset.index));
  });
  list.addEventListener("keydown", (event) => {
    const index = tabs.indexOf(document.activeElement);
    if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    select(next, true);
  });
}

function bindCompareScenes(rows) {
  const visibleRows = rows.filter(row => row.modelKey === "omega");
  bindSceneTabs("compare-tabs", index => {
    const panel = document.getElementById("compare-panel");
    panel.innerHTML = renderCompareRow(visibleRows[index]);
    panel.setAttribute("aria-labelledby", `compare-tab-${index}`);
    syncThemedImages();
  });
}

function renderCompareDetail(sceneId) {
  const row = selectedCompareRows().find((item) => item.id === sceneId);
  document.body.classList.toggle("compare-page", Boolean(row));
  if (!row) {
    document.getElementById("app").innerHTML = `<div class="loading-card">Unknown compare scene. <a href="./#compare">Back</a></div>`;
    return;
  }
  document.getElementById("app").innerHTML = `<section class="section">
    <div class="section-head">
      <p class="kicker"><a href="./#compare">← Trajectory Comparison</a></p>
      <h2>${escPublic(row.title)}</h2>
    </div>
    ${renderCompareRow(row, { live: true })}
  </section>`;
  syncThemedImages();
  if (typeof autoloadGlbs === "function") autoloadGlbs();
}

function renderGlbDetail(request) {
  const item = findIndoorGlb(request);
  document.body.classList.toggle("view-page", Boolean(item));
  if (!item) {
    document.getElementById("app").innerHTML = `<div class="loading-card">Unknown GLB. <a href="./#glbs">Back</a></div>`;
    return;
  }
  canonicalizeIndoorGlbUrl(item);
  document.getElementById("app").innerHTML = `<section class="section">
    <div class="section-head">
      <p class="kicker"><a href="./#glbs">← Interactive GLBs</a></p>
      <h2>${escPublic(item.title)}</h2>
    </div>
    <div class="glb-grid">${renderGlbCard(item, "detail", "", {
      live: true,
      showTitle: false,
      showCaption: false,
      showMeta: false,
    })}</div>
  </section>`;
  syncThemedImages();
  if (typeof autoloadGlbs === "function") autoloadGlbs();
}

function interactiveScenes() {
  return window.HIP3R_INTERACTIVE?.scenes || [];
}

function renderGlbSection() {
  const items = interactiveScenes();
  if (!items.length) return "";
  return `<section id="glbs" class="section">
    <div class="section-head"><h2>Long-Horizon 3D Reconstruction</h2><p>Explore the 3D scene alongside its input video. Drag to rotate, scroll to zoom.</p></div>
    <div class="showcase-tabs indoor-scene-tabs" id="indoor-tabs" role="tablist" aria-label="Reconstruction scenes">${items.map((item, i) => `<button type="button" role="tab" id="indoor-tab-${i}" aria-controls="indoor-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-index="${i}"><img loading="lazy" ${themedImageAttributes(item.preview, item.previewLight)} alt=""><b>${escPublic(item.title)}</b></button>`).join("")}</div>
    <div id="indoor-panel" class="indoor-active-panel" role="tabpanel" aria-labelledby="indoor-tab-0">
      <div class="indoor-active-heading"><h3 id="indoor-active-title"></h3><span id="interactive-size"></span><span id="interactive-status" role="status">Preview</span></div>
      <div class="interactive-viewer-stage">
        <p class="interactive-scene-label">3D scene</p>
        <div class="viewer" id="indoor-active-viewer" data-camera-control="interactive-cameras"></div>
        <svg class="interactive-beam" aria-hidden="true"><defs><linearGradient id="interactive-beam-gradient" gradientUnits="userSpaceOnUse"><stop offset="0"/><stop offset="1"/></linearGradient></defs><path class="beam-fill" fill="url(#interactive-beam-gradient)"/><path class="beam-edge"/></svg>
        <div class="interactive-input-card">
          <p class="interactive-video-label">Input video</p>
          <div class="interactive-input-screen"><video id="interactive-input-video" muted playsinline loop controls preload="none" aria-label="Input video synchronized with the 3D camera"></video><p id="interactive-input-empty" hidden>Input video unavailable</p></div>
          <p class="interactive-input-caption" id="interactive-input-caption"></p>
        </div>
      </div>
      <div class="interactive-bottom-bar">
        <span class="interactive-camera-hint">Camera position follows the video</span>
        <div class="interactive-viewer-dock" role="group" aria-label="Reconstruction display">
          <label><input type="checkbox" id="interactive-dense" value="dense" checked>Dense</label>
          <label><input type="checkbox" id="interactive-sparse" value="sparse">Sparse</label>
          <label><input type="checkbox" id="interactive-cameras" checked disabled>Cameras</label>
        </div>
      </div>
    </div>
  </section>`;
}

function bindIndoorScenes() {
  const items = interactiveScenes();
  const panel = document.getElementById("indoor-panel");
  const container = document.getElementById("indoor-active-viewer");
  if (!panel || !container || !items.length) return;
  const densityInputs = [...panel.querySelectorAll("#interactive-dense, #interactive-sparse")];
  let density = "dense";
  const status = document.getElementById("interactive-status");
  const video = document.getElementById("interactive-input-video");
  const stage = panel.querySelector(".interactive-viewer-stage");
  const beam = panel.querySelector(".interactive-beam");
  const screen = panel.querySelector(".interactive-input-screen");
  let track = null, trackRequest = null, mediaIndex = -1;
  const hull = points => {
    const p=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
    const lower=[],upper=[];
    for(const q of p){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),q)<=0)lower.pop();lower.push(q);}
    for(const q of p.reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),q)<=0)upper.pop();upper.push(q);}
    return lower.slice(0,-1).concat(upper.slice(0,-1));
  };
  function drawBeam(points) {
    beam.style.opacity = points ? "1" : "0";
    if(!points) return;
    const s=stage.getBoundingClientRect(),v=screen.getBoundingClientRect();
    beam.setAttribute("viewBox",`0 0 ${s.width} ${s.height}`);
    const q=points.map(([x,y])=>[x-s.left,y-s.top,1]);
    const x=v.left-s.left,y=v.top-s.top,w=v.width,h=v.height;
    const polygon=hull([...q,[x,y,0],[x+w,y,0],[x+w,y+h,0],[x,y+h,0]]);
    const xy=p=>`${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    beam.querySelector(".beam-fill").setAttribute("d",`M${polygon.map(xy).join("L")}Z`);
    beam.querySelector(".beam-edge").setAttribute("d",polygon.map((a,i)=>[a,polygon[(i+1)%polygon.length]]).filter(([a,b])=>a[2]!==b[2]).map(([a,b])=>`M${xy(a)}L${xy(b)}`).join(""));
    const gradient=beam.querySelector("linearGradient");
    gradient.setAttribute("x1",q.reduce((s,p)=>s+p[0],0)/4);gradient.setAttribute("y1",q.reduce((s,p)=>s+p[1],0)/4);
    gradient.setAttribute("x2",x);gradient.setAttribute("y2",y+h/2);
  }
  function linkVideo() {
    if(track && active) window.linkGlbVideo?.(container.id,video,track,drawBeam);
  }
  function prepareMedia() {
    if(mediaIndex === index) return;
    mediaIndex=index;track=null;trackRequest?.abort();trackRequest=null;
    video.pause();video.removeAttribute("src");video.removeAttribute("poster");video.load();drawBeam(null);
    const media=items[index].inputVideo;
    const empty=document.getElementById("interactive-input-empty");
    empty.hidden=Boolean(media?.url);video.hidden=!media?.url;
    document.getElementById("interactive-input-caption").textContent=media?.timingLabel || "";
    if(!media?.url) return;
    video.src=media.url;
    if(media.poster)video.poster=media.poster;
    video.load();
    if(near && !matchMedia("(prefers-reduced-motion: reduce)").matches)video.play().catch(()=>{});
    if(media.trajectoryUrl) {
      const request=new AbortController();trackRequest=request;
      fetch(media.trajectoryUrl,{signal:request.signal}).then(r=>{if(!r.ok)throw Error("Camera track unavailable");return r.json();}).then(data=>{if(request.signal.aborted)return;track=data;linkVideo();}).catch(error=>{if(error.name!=="AbortError")document.getElementById("interactive-input-caption").textContent="Input video · camera synchronization unavailable";});
    }
  }
  video.addEventListener("loadedmetadata",()=>{screen.style.aspectRatio=`${video.videoWidth} / ${video.videoHeight}`;});
  video.addEventListener("error",()=>{document.getElementById("interactive-input-empty").hidden=false;document.getElementById("interactive-input-empty").textContent="Unable to load input video";drawBeam(null);});
  let index = 0, active = false, near = false, disposed = false, releaseTimer = 0;
  const modelKey = () => {
    const item = items[index];
    return item.models?.[item.preferredModel] ? item.preferredModel : item.models?.omega ? "omega" : "map";
  };
  const selected = () => items[index].models?.[modelKey()]?.[density];
  function preview() {
    active = false;
    window.unloadGlb?.(container.id);
    const item = items[index];
    prepareMedia();
    for (const input of densityInputs) input.disabled = !item.models?.[modelKey()]?.[input.value];
    if (!item.models?.[modelKey()]?.[density]) density = densityInputs.find(input => !input.disabled)?.value || "dense";
    densityInputs.forEach(input => { input.checked = input.value === density; });
    document.getElementById("interactive-cameras").disabled = true;
    const base = item.models?.[modelKey()];
    container.innerHTML = `<img class="indoor-loading-preview" ${themedImageAttributes(base?.preview || item.preview, base?.previewLight || (base?.preview ? "" : item.previewLight))} alt="${escPublic(item.title)} reconstruction preview">`;
    const asset = selected();
    status.textContent = asset?.url ? "Preview" : "Unavailable";
    document.getElementById("interactive-size").textContent = asset?.bytes ? `${(asset.bytes / 1048576).toFixed(1)} MB` : "";
    document.getElementById("indoor-active-title").textContent = `${publicLabel(item.title)} · HiP3R + ${modelKey() === "map" ? "LingBot-MAP" : "VGGT-Omega"} · ${density === "dense" ? "Dense" : "Sparse"}`;
    syncThemedImages();
  }
  bindSceneTabs("indoor-tabs", next => {
    if (next === index) return;
    index = next;
    panel.setAttribute("aria-labelledby", `indoor-tab-${index}`);
    changeSelection();
  });
  function changeSelection() {
    preview();
    load();
  }
  densityInputs.forEach(input => input.addEventListener("change", () => {
    const changed = density !== input.value;
    density = input.value;
    densityInputs.forEach(other => { other.checked = other.value === density; });
    if (changed) changeSelection();
  }));
  function load() {
    const asset = selected();
    if (!asset?.url || active || !near || disposed) return;
    active = true;
    status.textContent = "Loading";
    const item = items[index], base = item.models[modelKey()];
    try {
      window.loadGlb(container.id, asset.url, asset.viewRotation ?? base.viewRotation ?? item.viewRotation ?? 0, asset.viewTransform ?? base.viewTransform ?? item.viewTransform ?? "", asset.viewAzimuth ?? base.viewAzimuth ?? item.viewAzimuth ?? 0);
    } catch (error) {
      status.textContent = "Unable to load model";
      active = false;
    }
  }
  container.addEventListener("viewerstatechange", event => {
    if (!active) return;
    const state = event.detail?.state;
    if (state === "complete") {status.textContent = "Loaded";linkVideo();}
    else if (state === "error") status.textContent = "Unable to load model";
    else if (state === "preparing") status.textContent = "Preparing scene";
    else if (state === "loading") status.textContent = "Loading";
  });
  preview();
  const visibility = new IntersectionObserver(([entry]) => {
    near = entry.isIntersecting;
    clearTimeout(releaseTimer);
    if (near) {load();if(video.src && !matchMedia("(prefers-reduced-motion: reduce)").matches)video.play().catch(()=>{});}
    else {video.pause();releaseTimer = window.setTimeout(() => {
      if (!near && !disposed) preview();
    }, 3000);}
  }, { rootMargin: "200px" });
  visibility.observe(panel);
  window.addEventListener("pagehide", event => {
    if (event.persisted) return;
    disposed = true; active = false;
    clearTimeout(releaseTimer); visibility.disconnect();
    trackRequest?.abort();video.pause();video.removeAttribute("src");video.load();
    window.unloadGlb?.(container.id);
  });
}

function trajectoryMethod(item, kind) {
  const patterns = {
    ours: /ours/i,
    omega: /vggt[-_ ]?omega/i,
    lingbot: /lingbot/i,
  };
  return item?.methods?.find((entry) => patterns[kind].test(String(entry.label || entry.method || ""))) || null;
}

function datasetLabel(value) {
  const labels = {
    "omega-case-00_full": "KITTI",
    oxford: "Oxford",
    vbr: "VBR",
    eth3d: "ETH3D",
    tat: "Tanks and Temples",
    neural_rgbd: "Neural RGB-D",
  };
  return labels[value] || formatName(value);
}

function trajectoryAtePills(item) {
  const best = item.methods
    .map((method) => finiteNumber(method.ate))
    .filter((value) => value !== null)
    .sort((a, b) => a - b)[0];
  return item.methods.map((method) => {
    const ate = finiteNumber(method.ate);
    if (ate === null) return "";
    const label = escPublic(method.label || method.method || "");
    return `<span class="pill${ate === best ? " ready" : ""}">${label} ${paperMetric(ate)}</span>`;
  }).join("");
}

// Labels for the 1x5 cover live in HTML, aligned to the column geometry the
// render script publishes, so nothing is painted over the figure.
function trajectoryCoverKey(item) {
  const layout = item.coverLayout;
  const panels = asArray(layout?.methods);
  const row = layout?.row || {};
  const left = finiteNumber(row.left);
  const right = finiteNumber(row.right);
  const gap = finiteNumber(row.gap) || 0;
  if (!panels.length || left === null || right === null || right <= left) return "";
  const ateByLabel = new Map(item.methods.map((method) => [String(method.label), finiteNumber(method.ate)]));
  const values = panels.map((panel) => ateByLabel.get(String(panel.label))).filter((value) => value !== null && value !== undefined);
  const best = values.length ? Math.min(...values) : null;
  const cells = panels.map((panel) => {
    const ate = ateByLabel.get(String(panel.label));
    const dark = panel?.color?.dark || "currentColor";
    const light = panel?.color?.light || dark;
    const isBest = ate !== null && ate !== undefined && ate === best;
    return `<div class="cover-key-cell${isBest ? " is-best" : ""}" style="--key-dark:${esc(dark)};--key-light:${esc(light)}">
      <span class="cover-key-name">${escPublic(panel.short || panel.label || "")}</span>
      <span class="cover-key-ate">${ate === null || ate === undefined ? "N/A" : `${paperMetric(ate)} m`}</span>
    </div>`;
  }).join("");
  const style = `margin-left:${(left * 100).toFixed(2)}%;margin-right:${((1 - right) * 100).toFixed(2)}%;gap:${((gap / (right - left)) * 100).toFixed(2)}%`;
  return `<div class="cover-key" style="${style}">${cells}</div>`;
}

function trajectoryCoverNotes(item) {
  const layout = item.coverLayout;
  const notes = [];
  if (layout?.note) notes.push(escPublic(layout.note));
  if (layout?.pose_only_note) notes.push(`&dagger; ${escPublic(layout.pose_only_note)}`);
  return notes.length ? `<p class="cover-note">${notes.join(" ")}</p>` : "";
}

function renderTrajectoryCard(item, index, wide = false) {
  const coverKey = wide ? trajectoryCoverKey(item) : "";
  const aspect = wide ? finiteNumber(item.coverLayout?.aspect) : null;
  const aspectAttr = aspect ? ` style="aspect-ratio:${aspect}"` : "";
  return `<article class="trajectory-evidence-card${wide ? " is-wide" : ""}">
    <figure><img ${index === 0 ? "" : "loading=\"lazy\" "}${themedImageAttributes(item.figure, item.figureLight)} alt="Trajectory comparison"${aspectAttr}>${coverKey}</figure>
    ${trajectoryMethodKey(item)}
  </article>`;
}

function trajectoryMethodKey(item) {
  const methods = asArray(item?.methods);
  const baseline = methods.find((method) => !/ours/i.test(String(method?.label || method?.method || "")));
  const baselineLabel = publicLabel(baseline?.label || baseline?.method || "Baseline");
  const oursLabel = "HiP3R";
  const labels = [
    { role: "gt", label: "GT" },
    { role: "baseline", label: baselineLabel },
    ...(methods.some(method => method.label === "VGGT-Long") ? [{ role: "long", label: "VGGT-Long" }] : []),
    { role: "ours", label: oursLabel },
  ];
  if (!methods.length) return "";
  const paletteClass = item?.legendPalette === "legacy-omega" ? " is-legacy-omega" : "";
  return `<div class="trajectory-line-legend${paletteClass}" aria-label="Trajectory line colors">${labels.map((item) => `<span class="trajectory-line-legend-item is-${esc(item.role)}"><i aria-hidden="true"></i><span>${esc(item.label)}</span></span>`).join("")}</div>`;
}

function benchmarkRows(rows) {
  return asArray(rows).slice().sort((a, b) => {
    const ateA = finiteNumber(a?.ate);
    const ateB = finiteNumber(b?.ate);
    if (ateA !== null && ateB !== null && ateA !== ateB) return ateA - ateB;
    if (ateA !== null && ateB === null) return -1;
    if (ateA === null && ateB !== null) return 1;
    const labelA = pick(a, ["model", "label", "method", "name"], "");
    const labelB = pick(b, ["model", "label", "method", "name"], "");
    return String(labelA).localeCompare(String(labelB));
  });
}

function uniqueSortedMetrics(rows, key, { higher = false } = {}) {
  return rankedMetrics(rows.map((row) => finiteNumber(row?.[key])), { higher });
}

function rankedMetrics(values, { higher = false } = {}) {
  const unique = [...new Set(values.filter((value) => value !== null))].sort((a, b) => a - b);
  return higher ? unique.slice().reverse() : unique;
}

function metricPodium(values, { higher = false } = {}) {
  const ranked = rankedMetrics(values, { higher });
  return { first: ranked[0] ?? null, second: ranked[1] ?? null };
}

function nearMetric(a, b) {
  return b !== null && Math.abs(a - b) < 1e-12;
}

function columnFormatter(column = {}) {
  if (Number.isInteger(column.digits)) {
    return (value) => {
      const number = finiteNumber(value);
      return number === null ? "N/A" : number.toFixed(column.digits);
    };
  }
  return paperMetric;
}

function benchmarkMetricCell(row, key, podium, formatter = paperMetric) {
  const number = finiteNumber(row?.[key]);
  if (number === null) return `<td class="metric-cell"><span class="missing">N/A</span></td>`;
  const rendered = formatter(number);
  if (nearMetric(number, podium.first)) {
    return `<td class="metric-cell rank-1"><strong>${rendered}</strong></td>`;
  }
  if (nearMetric(number, podium.second)) {
    return `<td class="metric-cell rank-2">${rendered}</td>`;
  }
  return `<td class="metric-cell">${rendered}</td>`;
}

function renderProtocolNote(protocol) {
  if (!protocol) return "";
  const primary = protocol.primary || {};
  const reference = protocol.reference || {};
  const metricLine = (item) => `<span>ATE <strong>${paperMetric(item.ate)}</strong></span>
    <span>RPE Rot <strong>${paperMetric(item.rpe_rot)}</strong></span>
    <span>RPE Trans <strong>${paperMetric(item.rpe_trans)}</strong></span>`;
  return `<aside class="protocol-note" aria-label="${escPublic(protocol.title || "Evaluation protocol note")}">
    <div class="protocol-note-copy">
      <span class="protocol-kicker">Protocol note</span>
      <h4>${escPublic(protocol.title || "VBR evaluation settings")}</h4>
      <p>${escPublic(protocol.description || "")}</p>
    </div>
    <div class="protocol-results">
      <div class="protocol-result primary">
        <b>${escPublic(primary.label || "Reported")}</b>
        <div>${metricLine(primary)}</div>
      </div>
      <div class="protocol-result">
        <b>${escPublic(reference.label || "Reference")}</b>
        <div>${metricLine(reference)}</div>
      </div>
    </div>
  </aside>`;
}

function renderBenchmarkTable(caption, rows, note = "", protocol = null) {
  const sorted = benchmarkRows(rows);
  if (!sorted.length) {
    return `<div class="empty-card benchmark-empty"><b>${escPublic(caption)} unavailable</b><p>The public manifest does not include rows for this benchmark table.</p></div>`;
  }
  const podium = {
    ate: uniqueSortedMetrics(sorted, "ate"),
    rpe_rot: uniqueSortedMetrics(sorted, "rpe_rot"),
    rpe_trans: uniqueSortedMetrics(sorted, "rpe_trans"),
  };
  const places = (values) => ({ first: values[0] ?? null, second: values[1] ?? null });
  return `<div class="benchmark-table-group">
    <div class="metric-table-wrap benchmark-table-wrap"><table class="benchmark-table">
      <caption>${escPublic(caption)}</caption>
      <thead><tr><th>Model</th><th>ATE</th><th>RPE Rot</th><th>RPE Trans</th></tr></thead>
      <tbody>${sorted.map((row) => `<tr>
        <td class="model-cell"><strong>${escPublic(pick(row, ["display_model", "model", "label", "method", "name"], "Model"))}</strong></td>
        ${benchmarkMetricCell(row, "ate", places(podium.ate))}
        ${benchmarkMetricCell(row, "rpe_rot", places(podium.rpe_rot))}
        ${benchmarkMetricCell(row, "rpe_trans", places(podium.rpe_trans), paperRpeTrans)}
      </tr>`).join("")}</tbody>
    </table></div>
    ${protocol ? renderProtocolNote(protocol) : note ? `<p class="note benchmark-note">${escPublic(note)}</p>` : ""}
  </div>`;
}

function renderWideMetricTable(caption, spec) {
  const rows = asArray(spec?.rows);
  const columns = asArray(spec?.columns);
  if (!rows.length || !columns.length) return "";
  const compareAcross = pick(spec, ["compare"], "column") === "row" ? "row" : "column";
  const columnPodium = {};
  if (compareAcross === "column") {
    for (const column of columns) {
      columnPodium[column.key] = metricPodium(
        rows.map((row) => finiteNumber(row?.[column.key])),
        { higher: Boolean(column.higher) },
      );
    }
  }
  const labelKey = pick(spec, ["row_key"], "dataset");
  return `<div class="benchmark-table-group">
    <div class="metric-table-wrap benchmark-table-wrap${columns.length > 4 ? " wide" : ""}"><table class="benchmark-table">
      <caption>${escPublic(caption)}</caption>
      <thead><tr><th>${escPublic(pick(spec, ["row_label"], "Dataset"))}</th>${columns.map((column) => `<th>${escPublic(column.label || column.key)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => {
        const rowPodium = compareAcross === "row"
          ? metricPodium(columns.map((column) => finiteNumber(row?.[column.key])))
          : null;
        return `<tr>
        <td class="model-cell"><strong>${escPublic(pick(row, [labelKey, "model", "label", "dataset"], "Row"))}</strong></td>
        ${columns.map((column) => benchmarkMetricCell(row, column.key, rowPodium || columnPodium[column.key], columnFormatter(column))).join("")}
      </tr>`;
      }).join("")}</tbody>
    </table></div>
    ${spec?.note ? `<p class="note benchmark-note">${escPublic(spec.note)}</p>` : ""}
  </div>`;
}

function renderBenchmarkPresentation() {
  const benchmark = publicData.trajectory_benchmark || {};
  const overallLabel = pick(benchmark.overall, ["label"], "Overall");
  const longTable = renderWideMetricTable(
    pick(benchmark.long_sequence, ["label"], "Long sequences"),
    benchmark.long_sequence,
  );
  const e2eTable = renderWideMetricTable(
    pick(benchmark.e2e_omega, ["label"], "End-to-end pose and geometry"),
    { ...benchmark.e2e_omega, row_key: "model", row_label: "Method" },
  );
  return `<div class="benchmark-block">
    <div class="benchmark-intro">
      <h3>Complete trajectory benchmark</h3>
    </div>
    ${renderBenchmarkTable(`${overallLabel} benchmark`, benchmark.overall?.rows, benchmark.overall?.note)}
    ${e2eTable}
    ${longTable}
  </div>`;
}

function bindDemoGallery(videos) {
  themedVideoSync = null;
  const stage = document.getElementById("scene-stage");
  const video = document.getElementById("scene-video");
  const inputVideo = document.getElementById("scene-input-video");
  const canvas = document.getElementById("scene-rgb-canvas");
  const pip = document.getElementById("scene-rgb-pip");
  const placeholder = document.getElementById("scene-video-placeholder");
  const selector = document.getElementById("scene-selector");
  const now = document.getElementById("scene-now");
  const playButton = document.getElementById("scene-play");
  const progress = document.getElementById("scene-progress");
  const speedControl = document.getElementById("scene-speed");
  const timeLabel = document.getElementById("scene-time");
  const inputNote = document.getElementById("scene-input-note");
  if (!stage || !video || !videos.length) return;

  const trajectory = window.createVideoTrajectory?.({
    container: document.getElementById("scene-trajectory"), video,
    reset: document.getElementById("trajectory-reset"),
    frameLabel: document.getElementById("trajectory-frame"),
    eventsContainer: document.getElementById("scene-events"),
    reference: document.getElementById("scene-reference"),
    referenceImage: document.getElementById("scene-reference-image"),
    referenceLabel: document.getElementById("scene-reference-label"),
  });
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) trajectory?.dispose();
  });
  let index = 0;
  let pipPlaying = false;
  let pipGeneration = 0;
  let posterGeneration = 0;
  let dragging = false;
  let resumeAt = 0;
  let resumePlayback = false;
  let mediaLoading = false;
  let playbackSpeed = 2;
  let inputFailed = false;
  let galleryDisposed = false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const waitingMedia = new Set();
  const videoLoading = createViewerLoading(stage, () => selectScene(index, resumePlayback));
  videoLoading.element.classList.add("scene-video-loading");
  videoLoading.element.querySelector('[role="progressbar"]').setAttribute("aria-label", "Video buffering");

  function bufferedFraction(media) {
    const requested = media.getAttribute("src");
    if (!requested || media.currentSrc !== new URL(requested, document.baseURI).href) return null;
    if (!Number.isFinite(media.duration) || media.duration <= 0 || !media.buffered.length) return null;
    let seconds = 0;
    for (let i = 0; i < media.buffered.length; i += 1) {
      seconds += Math.max(0, Math.min(media.duration, media.buffered.end(i)) - Math.max(0, media.buffered.start(i)));
    }
    return Math.min(1, seconds / media.duration);
  }
  function needsVideoData(media) {
    const requested = media.getAttribute("src");
    if (!requested || media.currentSrc !== new URL(requested, document.baseURI).href) return true;
    if (media.seeking) {
      let buffered = false;
      for (let i = 0; i < media.buffered.length; i += 1) {
        if (media.currentTime >= media.buffered.start(i) && media.currentTime <= media.buffered.end(i)) buffered = true;
      }
      // Keep an already-needed loader until the sought frame decodes, but
      // do not flash it for a fast seek entirely inside cached media.
      return !buffered || (!videoLoading.element.hidden && media.readyState < 2);
    }
    if (media.readyState < 2) return true;
    return !video.paused && waitingMedia.has(media) && media.readyState < 3;
  }
  function updateVideoLoading() {
    if (galleryDisposed) return;
    if (stage.classList.contains("media-failed")) {
      videoLoading.set("error", "Unable to load video");
      return;
    }
    const required = [video];
    if (videos[index].inputSrc && !inputFailed) required.push(inputVideo);
    const pending = required.find(needsVideoData);
    if (!pending) {videoLoading.set("complete", "Video ready");return;}
    const fraction = bufferedFraction(pending);
    const isInput = pending === inputVideo;
    const label = fraction === null
      ? (isInput ? "Loading input video" : "Loading video")
      : `${isInput ? "Input buffered" : "Buffered"} · ${Math.round(fraction * 100)}%`;
    videoLoading.set("loading", label, fraction);
  }

  const rgbSource = () => videos[index].inputSrc ? inputVideo : video;
  function syncInput(force = false) {
    if (galleryDisposed || !videos[index].inputSrc || !inputVideo || inputFailed || inputVideo.readyState < 1) return;
    inputVideo.playbackRate = playbackSpeed;
    const target = Math.min(video.currentTime || 0, Math.max(0, inputVideo.duration - .001));
    const drift = Math.abs(inputVideo.currentTime - target);
    if (!mediaLoading && !inputVideo.seeking && drift > (force ? .015 : .075)) inputVideo.currentTime = target;
    if (video.paused || mediaLoading || video.seeking) inputVideo.pause();
    // Queue playback during a seek too. Waiting for seeked before play can
    // chase a fast master forever while the input remains paused.
    else if (inputVideo.paused && inputVideo.readyState >= 2) inputVideo.play().catch(() => {});
  }
  function playMedia() {
    if (galleryDisposed) return;
    if (videos[index].inputSrc && !inputFailed && inputVideo.readyState < 2) return;
    video.play().catch(() => {});
  }
  function loadInput(scene) {
    inputVideo.pause();
    inputFailed = false;
    if (scene.inputSrc) {
      inputVideo.preload = "auto";
      inputVideo.src = scene.inputSrc;
      inputVideo.defaultPlaybackRate = playbackSpeed;
      inputVideo.playbackRate = playbackSpeed;
    } else {inputVideo.preload = "none";inputVideo.removeAttribute("src");}
    inputVideo.load();
  }

  function formatClock(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }

  function updateChrome() {
    const duration = video.duration || 0;
    const current = video.currentTime || 0;
    if (playButton) playButton.textContent = video.paused ? "Play" : "Pause";
    if (timeLabel) timeLabel.textContent = duration ? `${formatClock(current)} / ${formatClock(duration)}` : "0:00";
    if (progress && !dragging && duration) progress.value = String(Math.round((current / duration) * 1000));
  }

  function setStageAspect(width, height, layout, scene = {}) {
    const combined = layout === "combined-lr";
    stage.classList.toggle("is-combined-lr", combined);
    if (pip) pip.hidden = !combined && !scene.inputSrc;
    if (combined) {
      const span = reconSpan(width, height, scene);
      stage.style.aspectRatio = `${RECON_ASPECT}`;
      stage.style.setProperty("--recon-span", String(span));
      return;
    }
    if (width > 0 && height > 0) stage.style.aspectRatio = `${width} / ${height}`;
    stage.style.removeProperty("--recon-span");
  }

  function rgbCropRect(source, scene = videos[index]) {
    const width = source.videoWidth || source.naturalWidth || 0;
    const height = source.videoHeight || source.naturalHeight || 0;
    if (width < 2 || height < 1) return null;
    // Posters are standalone RGB images; only the video has a reconstruction pane.
    const left = source.naturalWidth || source === inputVideo ? 0 : rgbSplitLeft(width, height, scene);
    const crop = width - left;
    return { left, width: crop, height };
  }

  function drawPipFrom(source, scene = videos[index]) {
    if (!canvas || !pip || pip.hidden || (source.tagName === "VIDEO" && source.readyState < 2)) return;
    const crop = rgbCropRect(source, scene);
    if (!crop) return;
    if (canvas.width !== crop.width) canvas.width = crop.width;
    if (canvas.height !== crop.height) canvas.height = crop.height;
    pip.style.setProperty("--input-aspect", String(crop.width / crop.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(source, crop.left, 0, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const syncing = source === inputVideo && (inputVideo.seeking || video.seeking || Math.abs(inputVideo.currentTime - video.currentTime) > .1);
    if (inputNote) inputNote.textContent = source.tagName === "VIDEO" ? (syncing ? "Syncing" : "Same frame") : "Preview";
    canvas.setAttribute("aria-label", source.tagName === "VIDEO" ? "Current input RGB frame" : "Input RGB preview");
  }

  function activeSelectorPreviewCanvas() {
    return selector?.querySelector(`button[data-scene="${index}"] .scene-selector-live`);
  }

  function clearSelectorLivePreview() {
    selector?.querySelectorAll(".scene-selector-thumb.is-live").forEach((thumb) => {
      thumb.classList.remove("is-live");
    });
  }

  function drawActiveSelectorPreview(source, scene = videos[index]) {
    if (source.tagName === "VIDEO" && source.readyState < 2) return;
    const target = activeSelectorPreviewCanvas();
    if (!target) return;
    const crop = rgbCropRect(source, scene);
    if (!crop) return;
    const targetWidth = 320;
    const targetHeight = 180;
    if (target.width !== targetWidth) target.width = targetWidth;
    if (target.height !== targetHeight) target.height = targetHeight;
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.fillStyle = "#05070b";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    const scale = Math.min(targetWidth / crop.width, targetHeight / crop.height);
    const drawWidth = Math.max(1, crop.width * scale);
    const drawHeight = Math.max(1, crop.height * scale);
    const drawX = (targetWidth - drawWidth) / 2;
    const drawY = (targetHeight - drawHeight) / 2;
    ctx.drawImage(source, crop.left, 0, crop.width, crop.height, drawX, drawY, drawWidth, drawHeight);
    target.closest(".scene-selector-thumb")?.classList.add("is-live");
  }

  function drawRgbPreviewsFrom(source, scene = videos[index]) {
    drawPipFrom(source, scene);
    drawActiveSelectorPreview(source, scene);
    trajectory?.update(video.currentTime);
  }

  function startPipLoop() {
    if (pipPlaying || !canvas || pip?.hidden) return;
    pipPlaying = true;
    const generation = pipGeneration;
    const step = () => {
      if (!pipPlaying || generation !== pipGeneration) return;
      syncInput();
      drawRgbPreviewsFrom(rgbSource());
      if (typeof video.requestVideoFrameCallback === "function") {
        video.requestVideoFrameCallback(step);
      } else {
        window.requestAnimationFrame(step);
      }
    };
    step();
  }

  function stopPipLoop(paint = true) {
    pipPlaying = false;
    pipGeneration += 1;
    inputVideo.pause();
    if (paint) {syncInput(true);drawRgbPreviewsFrom(rgbSource());}
  }

  function paintPoster(url, scene = videos[index]) {
    const generation = ++posterGeneration;
    if (!url) return;
    const image = new Image();
    image.onload = () => {
      // A delayed poster must not replace another scene/theme or a decoded video frame.
      if (generation !== posterGeneration || rgbSource().readyState >= 2) return;
      drawRgbPreviewsFrom(image, scene);
    };
    image.src = url;
  }

  function renderNow(scene, sceneIndex) {
    if (!now) return;
    now.innerHTML = `<div>
        <small>${String(sceneIndex + 1).padStart(2, "0")}${scene.curatedBenchmark ? "" : ` · ${escPublic(scene.category)}`}</small>
        <h3>${escPublic(scene.title)}</h3>
      </div>`;
  }

  function loadThemedMedia(scene, theme = currentTheme(), reload = false) {
    const media = themedVideoMedia(scene, theme);
    video.removeAttribute("poster");
    if (reload || video.dataset.mediaSrc !== media.src) {
      video.classList.remove("ready");
      stage.classList.remove("media-failed");
      stage.setAttribute("aria-busy", "true");
      if (placeholder) {
        placeholder.hidden = false;
        placeholder.replaceChildren();
        placeholder.setAttribute("aria-label", "Loading reconstruction");
      }
      video.dataset.mediaSrc = media.src;
      video.src = media.src;
      mediaLoading = true;
      waitingMedia.delete(video);
      videoLoading.set("loading", "Loading video");
      if (inputNote) inputNote.textContent = "Preview";
      canvas?.setAttribute("aria-label", "Input RGB preview");
      video.load();
      video.defaultPlaybackRate = playbackSpeed;
      video.playbackRate = playbackSpeed;
    }
  }

  function selectScene(nextIndex, playWhenReady = false) {
    index = (nextIndex + videos.length) % videos.length;
    const scene = videos[index];
    waitingMedia.clear();
    videoLoading.set("loading", "Loading video");
    stopPipLoop(false);
    loadInput(scene);
    stage.classList.remove("media-failed");
    video.classList.remove("ready");
    if (placeholder) {
      placeholder.hidden = false;
      placeholder.replaceChildren();
      placeholder.setAttribute("aria-label", "Loading reconstruction");
    }
    selector?.querySelectorAll("button[data-scene]").forEach((button, buttonIndex) => {
      const active = buttonIndex === index;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    const selectedTab = selector?.querySelector("button.active");
    if (selectedTab) {
      const tabBox = selectedTab.getBoundingClientRect(), stripBox = selector.getBoundingClientRect();
      if (tabBox.left < stripBox.left) selector.scrollLeft -= stripBox.left - tabBox.left;
      else if (tabBox.right > stripBox.right) selector.scrollLeft += tabBox.right - stripBox.right;
    }
    clearSelectorLivePreview();
    renderNow(scene, index);
    trajectory?.load(scene.id, scene.trajectoryUrl);
    pip?.style.setProperty("--input-aspect", "1.7777778");
    setStageAspect(0, 0, scene.layout, scene);
    paintPoster(scene.inputPoster || themedVideoMedia(scene).poster, scene);
    if (progress) {
      progress.disabled = true;
      progress.value = "0";
    }
    if (playButton) playButton.textContent = "Play";
    if (timeLabel) timeLabel.textContent = "0:00";
    video.pause();
    resumeAt = 0;
    resumePlayback = Boolean(playWhenReady);
    loadThemedMedia(scene, currentTheme(), true);
  }

  video.addEventListener("loadedmetadata", () => {
    video.playbackRate = playbackSpeed;
    setStageAspect(video.videoWidth, video.videoHeight, videos[index].layout, videos[index]);
    if (progress) progress.disabled = false;
    updateChrome();
  });
  function revealDecodedOutput() {
    if (video.readyState < 2 || video.seeking) return;
    video.classList.add("ready");
    if (placeholder) placeholder.hidden = true;
    updateVideoLoading();
  }

  video.addEventListener("loadeddata", () => {
    const duration = video.duration || 0;
    if (resumeAt > 0 && duration) video.currentTime = Math.min(resumeAt, duration - 0.05);
    const shouldPlay = resumePlayback;
    video.playbackRate = playbackSpeed;
    mediaLoading = false;
    resumeAt = 0;
    syncInput(true);
    drawRgbPreviewsFrom(rgbSource(), videos[index]);
    revealDecodedOutput();
    updateChrome();
    if (shouldPlay) playMedia();
  });
  video.addEventListener("play", () => {
    syncInput(true);
    startPipLoop();
    updateChrome();
  });
  video.addEventListener("pause", () => {
    stopPipLoop();
    updateChrome();
  });
  video.addEventListener("timeupdate", updateChrome);
  video.addEventListener("seeked", () => {
    syncInput(true);
    drawRgbPreviewsFrom(rgbSource(), videos[index]);
    revealDecodedOutput();
    updateChrome();
  });
  video.addEventListener("seeking", () => {inputVideo.pause();syncInput(true);});
  inputVideo.addEventListener("loadeddata", () => {
    if (galleryDisposed || !videos[index].inputSrc || inputVideo.readyState < 2) return;
    syncInput(true);
    drawRgbPreviewsFrom(inputVideo);
    if (resumePlayback && !mediaLoading) playMedia();
  });
  inputVideo.addEventListener("seeked", () => {
    if (galleryDisposed || !videos[index].inputSrc) return;
    syncInput(video.paused);
    drawRgbPreviewsFrom(inputVideo);
  });
  inputVideo.addEventListener("error", () => {
    if (galleryDisposed || !videos[index].inputSrc || !inputVideo.error) return;
    inputFailed = true;
    if (inputNote) inputNote.textContent = "Input unavailable";
    updateVideoLoading();
    if (resumePlayback && !mediaLoading) playMedia();
  });
  video.addEventListener("error", () => {
    const scene = videos[index];
    if (scene.srcLight && video.dataset.mediaSrc !== scene.src) {
      loadThemedMedia(scene, "dark");
      return;
    }
    video.classList.remove("ready");
    stage.classList.add("media-failed");
    stage.setAttribute("aria-busy", "false");
    if (placeholder) {
      placeholder.hidden = false;
      placeholder.setAttribute("aria-label", "Could not load this video");
      placeholder.replaceChildren();
    }
    updateVideoLoading();
  });

  [video, inputVideo].forEach((media) => {
    ["waiting", "stalled"].forEach((eventName) => media.addEventListener(eventName, () => {
      waitingMedia.add(media);
      updateVideoLoading();
    }));
    ["loadeddata", "canplay", "playing", "seeked"].forEach((eventName) => media.addEventListener(eventName, () => {
      waitingMedia.delete(media);
      if (media === video) revealDecodedOutput();
      updateVideoLoading();
    }));
    ["loadstart", "loadedmetadata", "durationchange", "progress", "seeking", "pause", "emptied", "timeupdate"].forEach((eventName) => {
      media.addEventListener(eventName, updateVideoLoading);
    });
  });

  function togglePlayback() {
    resumePlayback = video.paused;
    if (resumePlayback) playMedia();
    else video.pause();
  }
  playButton?.addEventListener("click", togglePlayback);
  video.addEventListener("click", togglePlayback);
  speedControl?.addEventListener("change", () => {
    const requestedSpeed = Number(speedControl.value);
    playbackSpeed = [0.5, 1, 2, 4, 8].includes(requestedSpeed) ? requestedSpeed : 2;
    video.defaultPlaybackRate = playbackSpeed;
    video.playbackRate = playbackSpeed;
    inputVideo.defaultPlaybackRate = playbackSpeed;
    syncInput(true);
  });
  progress?.addEventListener("pointerdown", () => {
    dragging = true;
  });
  progress?.addEventListener("input", () => {
    const duration = video.duration || 0;
    if (!duration) return;
    timeLabel.textContent = `${formatClock(duration * (Number(progress.value) / 1000))} / ${formatClock(duration)}`;
  });
  progress?.addEventListener("change", () => {
    const duration = video.duration || 0;
    if (duration) video.currentTime = duration * (Number(progress.value) / 1000);
    dragging = false;
    updateChrome();
  });
  progress?.addEventListener("pointerup", () => {
    dragging = false;
  });
  progress?.addEventListener("pointercancel", () => {
    dragging = false;
    updateChrome();
  });

  selector?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-scene]");
    if (!button) return;
    selectScene(Number(button.dataset.scene), true);
  });
  document.getElementById("demo-prev")?.addEventListener("click", () => selectScene(index - 1, true));
  document.getElementById("demo-next")?.addEventListener("click", () => selectScene(index + 1, true));
  themedVideoSync = (theme) => {
    const scene = videos[index];
    const media = themedVideoMedia(scene, theme);
    if (video.dataset.mediaSrc === media.src) {
      video.removeAttribute("poster");
      return;
    }
    if (!mediaLoading) {
      resumeAt = video.currentTime || 0;
      resumePlayback = !video.paused;
    }
    video.pause();
    paintPoster(scene.inputPoster || media.poster, scene);
    loadThemedMedia(scene, theme);
  };

  const requestedVideo = new URLSearchParams(window.location.search).get("video");
  const requestedIndex = videos.findIndex((scene) => scene.id === requestedVideo);
  selectScene(requestedIndex >= 0 ? requestedIndex : 0, !reduceMotion);
  window.addEventListener("pagehide", (event) => {
    galleryDisposed = !event.persisted;
    video.pause();
    stopPipLoop(false);
    if (!event.persisted) {inputVideo.removeAttribute("src");inputVideo.load();}
    if (!event.persisted) videoLoading.dispose();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && resumePlayback) playMedia();
  });
}

function bindBenchmarkTabs() {
  document.querySelectorAll("[data-benchmark-tabs]").forEach((group) => {
    const tabs = Array.from(group.querySelectorAll("[data-benchmark-tab]"));
    const panels = Array.from(group.querySelectorAll("[data-benchmark-panel]"));
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("data-benchmark-tab");
        tabs.forEach((item) => {
          const active = item === tab;
          item.classList.toggle("active", active);
          item.setAttribute("aria-selected", active ? "true" : "false");
        });
        panels.forEach((panel) => {
          panel.hidden = panel.getAttribute("data-benchmark-panel") !== target;
        });
      });
    });
  });
}

function bindGlbModal() {
  const modal = document.getElementById("glb-modal");
  if (!modal) return;
  const title = document.getElementById("glb-modal-title");
  const closeButton = modal.querySelector(".glb-modal-close");
  let lastTrigger = null;

  function closeModal() {
    if (modal.hidden) return;
    window.unloadGlb?.(GLB_MODAL_VIEWER_ID);
    modal.hidden = true;
    document.body.classList.remove("glb-modal-open");
    lastTrigger?.focus();
  }

  function openModal(button) {
    lastTrigger = button;
    title.textContent = button.dataset.glbTitle || "3D map";
    modal.hidden = false;
    document.body.classList.add("glb-modal-open");
    window.requestAnimationFrame(() => {
      if (button.dataset.tileManifest && button.dataset.tileSide) {
        window.loadTiledGlb?.(
          GLB_MODAL_VIEWER_ID,
          button.dataset.tileManifest,
          button.dataset.tileSide,
          button.dataset.viewRotation,
          button.dataset.viewTransform
        );
      } else {
        window.loadGlb?.(
          GLB_MODAL_VIEWER_ID,
          button.dataset.glbUrl,
          button.dataset.viewRotation,
          button.dataset.viewTransform,
          button.dataset.viewAzimuth
        );
      }
      closeButton?.focus();
    });
  }

  document.getElementById("app").addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-glb-modal]");
    if (button) openModal(button);
  });
  modal.querySelectorAll("[data-close-glb-modal]").forEach((button) => {
    button.addEventListener("click", closeModal);
  });
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
    if (event.key !== "Tab") return;
    const focusable = Array.from(modal.querySelectorAll(
      "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )).filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function render() {
  document.body.classList.add("home-page");
  const videos = selectedVideos();
  const compare = selectedCompareRows();
  document.getElementById("app").innerHTML = [
    renderHero(),
    renderConceptSection(),
    renderCompareSection(compare),
    renderGlbSection(),
    typeof renderStageDetails === "function" ? renderStageDetails() : "",
    renderVideoSection(videos),
    renderFrameworkSection(),
    renderGlbModal(),
  ].join("");
  syncThemedImages();
  bindConceptSection();
  bindDemoGallery(videos);
  bindCompareScenes(compare);
  if (typeof bindStageDetails === "function") bindStageDetails();
  bindIndoorScenes();
  bindBenchmarkTabs();
  bindGlbModal();
  if (typeof autoloadGlbs === "function") autoloadGlbs();
}

function scrollToHashTarget() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;
  window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
}

async function main() {
  if (!window.PUBLIC_SHOWCASE_DATA) await loadOptionalManifest("assets/showcase/manifest.js");
  publicData = window.PUBLIC_SHOWCASE_DATA || {};
  const scene = compareDetailId();
  const glbRequest = glbDetailId();
  if (isViewPage() || ((glbRequest.caseId || glbRequest.legacyId) && !scene)) renderGlbDetail(glbRequest);
  else if (isComparePage() || scene) renderCompareDetail(scene);
  else {
    render();
    scrollToHashTarget();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  bindThemeToggle();
  main().catch((err) => {
    document.getElementById("app").innerHTML = `<div class="loading-card">Failed to render public showcase.</div>`;
    console.error(err);
  });
});
