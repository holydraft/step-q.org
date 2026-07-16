const STATIC_VIEWS = [
  {
    name: "1",
    model: "LOGO.glb",
    createdAt: "2026-07-16T09:52:11.001Z",
    camera: {
      alpha: 1.570796,
      beta: 1.570796,
      radius: 0.0175,
      target: { x: 0, y: 0, z: 0 }
    }
  },
  {
    name: "2",
    model: "LOGO.glb",
    createdAt: "2026-07-16T10:01:40.533Z",
    camera: {
      alpha: 2.581645,
      beta: 0.72336,
      radius: 0.023785,
      target: { x: 0.000431, y: -0.001566, z: 0.003866 }
    }
  }
];

const LOCKED_SETTINGS = {
  brightness: 70,
  saturation: 150,
  gamma: 70,
  darkBrightness: 60,
  darkSaturation: 100,
  darkGamma: 100,
  lightBrightness: 125,
  lightSaturation: 100,
  lightGamma: 100,
  colorMatch: true
};

const ANIMATION_HOLD_MS = 1500;
const ANIMATION_TRANSITION_MS = 1500;
const ANIMATION_RETURN_MS = 700;
const ANIMATION_WHEEL_RELEASE_MS = 240;
const DEFAULT_PANNING_SENSIBILITY = 50000;

function mountLogoViewer(hostElement, options = {}) {
  if (!hostElement || !window.BABYLON) return null;

  const modelUrl = options.modelUrl || "LOGO.glb";
  const canvas = document.createElement("canvas");
  canvas.className = "logo-viewer-canvas";
  hostElement.appendChild(canvas);

  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
  scene.autoClear = true;
  scene.autoClearDepthAndStencil = true;

  const camera = new BABYLON.ArcRotateCamera("camera", Math.PI + 4, Math.PI / 2.5, 1, BABYLON.Vector3.Zero(), scene);
  camera.attachControl(canvas, true, false, 2);
  camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
  camera.wheelDeltaPercentage = 0.013;
  camera.pinchDeltaPercentage = 0.0006;
  camera.panningSensibility = DEFAULT_PANNING_SENSIBILITY;
  camera.lowerAlphaLimit = null;
  camera.upperAlphaLimit = null;
  camera.lowerBetaLimit = null;
  camera.upperBetaLimit = null;
  camera.allowUpsideDown = true;

  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 1.15;
  const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.5, -0.9, -0.4), scene);
  key.intensity = 0.9;

  const pipeline = new BABYLON.DefaultRenderingPipeline("default", true, scene, [camera]);
  pipeline.samples = 4;
  pipeline.fxaaEnabled = true;

  const materialState = new WeakMap();
  const colorMatchState = new WeakMap();
  let currentMeshes = [];
  let currentModelSize = 1;
  let animationStartTime = 0;
  let isInteracting = false;
  let blendBackStartTime = 0;
  let blendBackStartView = null;
  let wheelTimer = 0;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => t * t * (3 - 2 * t);

  const updateOrthographicBounds = () => {
    const height = Math.max(engine.getRenderHeight(), 1);
    const aspect = engine.getRenderWidth() / height;
    const halfHeight = Math.max(Math.abs(camera.radius), 0.001) * Math.tan(camera.fov / 2);
    const halfWidth = halfHeight * aspect;
    camera.orthoLeft = -halfWidth;
    camera.orthoRight = halfWidth;
    camera.orthoTop = halfHeight;
    camera.orthoBottom = -halfHeight;
  };

  const applyCameraView = (view) => {
    camera.target = new BABYLON.Vector3(view.target.x, view.target.y, view.target.z);
    camera.alpha = view.alpha;
    camera.beta = view.beta;
    camera.radius = view.radius;
    camera.lowerRadiusLimit = -Math.max(Math.abs(view.radius) * 20, 1000);
    camera.upperRadiusLimit = Math.max(Math.abs(view.radius) * 20, 1000);
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
    camera.inertialPanningX = 0;
    camera.inertialPanningY = 0;
    updateOrthographicBounds();
  };

  const getCameraView = () => ({
    alpha: camera.alpha,
    beta: camera.beta,
    radius: camera.radius,
    target: {
      x: camera.target.x,
      y: camera.target.y,
      z: camera.target.z
    }
  });

  const interpolateView = (from, to, t) => ({
    alpha: lerp(from.alpha, to.alpha, t),
    beta: lerp(from.beta, to.beta, t),
    radius: lerp(from.radius, to.radius, t),
    target: {
      x: lerp(from.target.x, to.target.x, t),
      y: lerp(from.target.y, to.target.y, t),
      z: lerp(from.target.z, to.target.z, t)
    }
  });

  const updatePanningSensibility = (modelSize) => {
    const size = Math.max(modelSize, 0.000001);
    camera.panningSensibility = clamp(DEFAULT_PANNING_SENSIBILITY / size, 2, 80000);
  };

  const updateCameraDepthRange = (modelSize) => {
    const size = Math.max(modelSize, 0.000001);
    camera.minZ = clamp(size * 0.0005, 0.00001, 0.01);
    camera.maxZ = Math.max(size * 100, 10);
  };

  const applyLockedColorSettings = () => {
    const globalBrightness = LOCKED_SETTINGS.brightness / 100;
    const globalSaturation = LOCKED_SETTINGS.saturation / 100;
    const globalGamma = 100 / LOCKED_SETTINGS.gamma;
    const darkBrightness = LOCKED_SETTINGS.darkBrightness / 100;
    const darkSaturation = LOCKED_SETTINGS.darkSaturation / 100;
    const darkGamma = 100 / LOCKED_SETTINGS.darkGamma;
    const lightBrightness = LOCKED_SETTINGS.lightBrightness / 100;
    const lightSaturation = LOCKED_SETTINGS.lightSaturation / 100;
    const lightGamma = 100 / LOCKED_SETTINGS.lightGamma;

    const adjustColor = (color) => {
      let r = color.r * globalBrightness;
      let g = color.g * globalBrightness;
      let b = color.b * globalBrightness;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum + (r - lum) * globalSaturation;
      g = lum + (g - lum) * globalSaturation;
      b = lum + (b - lum) * globalSaturation;
      r = Math.pow(Math.max(r, 0), globalGamma);
      g = Math.pow(Math.max(g, 0), globalGamma);
      b = Math.pow(Math.max(b, 0), globalGamma);

      const toneLum = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
      const useDark = toneLum < 0.5;
      const toneBrightness = useDark ? darkBrightness : lightBrightness;
      const toneSaturation = useDark ? darkSaturation : lightSaturation;
      const toneGamma = useDark ? darkGamma : lightGamma;
      r *= toneBrightness;
      g *= toneBrightness;
      b *= toneBrightness;
      const toneAdjustedLum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = toneAdjustedLum + (r - toneAdjustedLum) * toneSaturation;
      g = toneAdjustedLum + (g - toneAdjustedLum) * toneSaturation;
      b = toneAdjustedLum + (b - toneAdjustedLum) * toneSaturation;
      r = Math.pow(Math.max(r, 0), toneGamma);
      g = Math.pow(Math.max(g, 0), toneGamma);
      b = Math.pow(Math.max(b, 0), toneGamma);

      return new BABYLON.Color3(clamp(r, 0, 4), clamp(g, 0, 4), clamp(b, 0, 4));
    };

    currentMeshes.forEach((mesh) => {
      const materials = mesh.material && mesh.material.subMaterials ? mesh.material.subMaterials : [mesh.material];
      materials.forEach((material) => {
        if (!material) return;

        let state = materialState.get(material);
        if (!state) {
          state = {
            albedoColor: material.albedoColor ? material.albedoColor.clone() : null,
            diffuseColor: material.diffuseColor ? material.diffuseColor.clone() : null,
            emissiveColor: material.emissiveColor ? material.emissiveColor.clone() : null,
            albedoTextureLevel: material.albedoTexture && typeof material.albedoTexture.level === "number" ? material.albedoTexture.level : null,
            diffuseTextureLevel: material.diffuseTexture && typeof material.diffuseTexture.level === "number" ? material.diffuseTexture.level : null
          };
          materialState.set(material, state);
        }

        if (state.albedoColor && material.albedoColor) material.albedoColor = adjustColor(state.albedoColor);
        if (state.diffuseColor && material.diffuseColor) material.diffuseColor = adjustColor(state.diffuseColor);
        if (state.emissiveColor && material.emissiveColor) material.emissiveColor = adjustColor(state.emissiveColor);
        if (state.albedoTextureLevel !== null && material.albedoTexture) material.albedoTexture.level = state.albedoTextureLevel * globalBrightness;
        if (state.diffuseTextureLevel !== null && material.diffuseTexture) material.diffuseTexture.level = state.diffuseTextureLevel * globalBrightness;
      });
    });
  };

  const applyColorMatch = () => {
    if (!LOCKED_SETTINGS.colorMatch) return;

    currentMeshes.forEach((mesh) => {
      const materials = mesh.material && mesh.material.subMaterials ? mesh.material.subMaterials : [mesh.material];
      materials.forEach((material) => {
        if (!material) return;

        if (!colorMatchState.has(material)) {
          colorMatchState.set(material, {
            disableLighting: !!material.disableLighting,
            unlit: typeof material.unlit === "boolean" ? material.unlit : null,
            emissiveColor: material.emissiveColor ? material.emissiveColor.clone() : null
          });
        }

        if ("disableLighting" in material) material.disableLighting = true;
        if (typeof material.unlit === "boolean") material.unlit = true;
        if (material.emissiveColor) material.emissiveColor = BABYLON.Color3.Black();
      });
    });
  };

  const showModelFromInside = () => {
    currentMeshes.forEach((mesh) => {
      const materials = mesh.material && mesh.material.subMaterials ? mesh.material.subMaterials : [mesh.material];
      materials.forEach((material) => {
        if (material && "backFaceCulling" in material) material.backFaceCulling = false;
      });
    });
  };

  const fitModelMetrics = () => {
    const visibleMeshes = currentMeshes.filter((mesh) => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
    const boundsSource = visibleMeshes.length ? visibleMeshes : currentMeshes;
    const min = new BABYLON.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const max = new BABYLON.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    boundsSource.forEach((mesh) => {
      const bounds = mesh.getBoundingInfo().boundingBox;
      min.x = Math.min(min.x, bounds.minimumWorld.x);
      min.y = Math.min(min.y, bounds.minimumWorld.y);
      min.z = Math.min(min.z, bounds.minimumWorld.z);
      max.x = Math.max(max.x, bounds.maximumWorld.x);
      max.y = Math.max(max.y, bounds.maximumWorld.y);
      max.z = Math.max(max.z, bounds.maximumWorld.z);
    });

    const size = max.subtract(min);
    currentModelSize = Math.max(size.x, size.y, size.z, 1);
    updatePanningSensibility(currentModelSize);
    updateCameraDepthRange(currentModelSize);
    camera.lowerRadiusLimit = -currentModelSize * 20;
    camera.upperRadiusLimit = currentModelSize * 20;
  };

  const getAnimatedView = (elapsedMs) => {
    const viewA = STATIC_VIEWS[0].camera;
    const viewB = STATIC_VIEWS[1].camera;
    const cycleMs = (ANIMATION_HOLD_MS + ANIMATION_TRANSITION_MS) * 2;
    const cycleTime = elapsedMs % cycleMs;

    if (cycleTime < ANIMATION_HOLD_MS) return viewA;
    if (cycleTime < ANIMATION_HOLD_MS + ANIMATION_TRANSITION_MS) {
      return interpolateView(viewA, viewB, easeInOut((cycleTime - ANIMATION_HOLD_MS) / ANIMATION_TRANSITION_MS));
    }
    if (cycleTime < ANIMATION_HOLD_MS * 2 + ANIMATION_TRANSITION_MS) return viewB;

    return interpolateView(viewB, viewA, easeInOut((cycleTime - ANIMATION_HOLD_MS * 2 - ANIMATION_TRANSITION_MS) / ANIMATION_TRANSITION_MS));
  };

  const updateAnimation = (now) => {
    if (!currentMeshes.length || isInteracting) return;

    const target = getAnimatedView(now - animationStartTime);
    if (blendBackStartView) {
      const t = clamp((now - blendBackStartTime) / ANIMATION_RETURN_MS, 0, 1);
      applyCameraView(interpolateView(blendBackStartView, target, easeInOut(t)));
      if (t >= 1) blendBackStartView = null;
      return;
    }

    applyCameraView(target);
  };

  const beginInteraction = () => {
    if (!currentMeshes.length) return;
    isInteracting = true;
    blendBackStartView = null;
    if (wheelTimer) {
      clearTimeout(wheelTimer);
      wheelTimer = 0;
    }
  };

  const endInteraction = () => {
    if (!isInteracting) return;
    isInteracting = false;
    blendBackStartTime = performance.now();
    blendBackStartView = getCameraView();
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
    camera.inertialPanningX = 0;
    camera.inertialPanningY = 0;
  };

  const holdForWheel = () => {
    beginInteraction();
    wheelTimer = setTimeout(endInteraction, ANIMATION_WHEEL_RELEASE_MS);
  };

  const loadModel = async () => {
    const result = await BABYLON.SceneLoader.ImportMeshAsync(null, "", modelUrl, scene, null, ".glb");
    currentMeshes = result.meshes;
    fitModelMetrics();
    showModelFromInside();
    applyLockedColorSettings();
    applyColorMatch();
    applyCameraView(STATIC_VIEWS[0].camera);
    animationStartTime = performance.now();
  };

  canvas.addEventListener("pointerdown", beginInteraction);
  window.addEventListener("pointerup", endInteraction);
  window.addEventListener("pointercancel", endInteraction);
  canvas.addEventListener("wheel", (event) => {
    holdForWheel();
    event.preventDefault();
  }, { passive: false });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("resize", () => {
    engine.resize();
    updateOrthographicBounds();
  });

  engine.runRenderLoop(() => {
    updateAnimation(performance.now());
    updateOrthographicBounds();
    scene.render();
  });

  loadModel().catch((error) => {
    console.error("Model load failed", error);
    hostElement.classList.add("viewer-load-error");
    hostElement.setAttribute("aria-label", "LOGO Viewer konnte nicht geladen werden");
  });

  return {
    engine,
    scene,
    dispose: () => {
      engine.dispose();
      canvas.remove();
    }
  };
}

window.addEventListener("DOMContentLoaded", () => {
  mountLogoViewer(document.getElementById("logoViewer"), { modelUrl: "LOGO.glb" });
});
