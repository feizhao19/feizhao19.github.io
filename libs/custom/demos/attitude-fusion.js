(function() {
  'use strict';

  var THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var THREE_MTL_LOADER_CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/MTLLoader.js';
  var THREE_OBJ_LOADER_CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/OBJLoader.js';
  var CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
  var DEG = Math.PI / 180;
  var DRAG_YAW_RATE = 0.7;
  var DRAG_PITCH_RATE = 0.44;
  var DRAG_ROLL_RATE = 0.24;
  var THEME = {
    bg: '#f8fafc',
    bgAlt: '#f4f7fa',
    card: '#ffffff',
    cardBorder: 'rgba(0, 0, 0, 0.08)',
    text: 'rgba(0, 0, 0, 0.72)',
    textMuted: 'rgba(0, 0, 0, 0.55)',
    textSoft: 'rgba(0, 0, 0, 0.48)',
    grid: 'rgba(0, 0, 0, 0.06)',
    barTrack: 'rgba(0, 0, 0, 0.06)',
    mapBg: '#eef2f6',
    mapBorder: 'rgba(0, 0, 0, 0.08)',
    mapGrid: 'rgba(0, 0, 0, 0.06)',
    connector: 'rgba(0, 0, 0, 0.18)'
  };

  var activeInstances = {};
  var scriptPromises = {};
  var airplaneModelPromises = {};
  var previewInstances = [];
  var threeDepsPromise = null;

  function loadScript(src) {
    if (scriptPromises[src]) return scriptPromises[src];

    scriptPromises[src] = new Promise(function(resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');

      function finish() {
        resolve();
      }

      function fail() {
        reject(new Error('Failed to load ' + src));
      }

      if (existing) {
        if (existing.dataset.loaded === 'true') {
          finish();
          return;
        }

        var settled = false;

        function done() {
          if (settled) return;
          settled = true;
          existing.dataset.loaded = 'true';
          finish();
        }

        existing.addEventListener('load', done);
        existing.addEventListener('error', fail);

        if (existing.readyState === 'complete' || existing.readyState === 'loaded') {
          done();
        }

        return;
      }

      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = function() {
        script.dataset.loaded = 'true';
        finish();
      };
      script.onerror = fail;
      document.head.appendChild(script);
    });

    return scriptPromises[src];
  }

  function waitForGlobal(path, maxAttempts) {
    maxAttempts = maxAttempts || 240;

    return new Promise(function(resolve, reject) {
      var attempts = 0;

      function check() {
        var parts = path.split('.');
        var value = window;
        var found = true;

        for (var i = 0; i < parts.length; i++) {
          value = value[parts[i]];
          if (value == null) {
            found = false;
            break;
          }
        }

        if (found) {
          resolve();
          return;
        }

        if (++attempts > maxAttempts) {
          reject(new Error(path + ' is not available'));
          return;
        }

        window.requestAnimationFrame(check);
      }

      check();
    });
  }

  function resetBrokenLoaderScript(src, globalPath) {
    if (typeof THREE === 'undefined') return;

    var parts = globalPath.split('.');
    var value = window;
    var found = true;

    for (var i = 0; i < parts.length; i++) {
      value = value[parts[i]];
      if (value == null) {
        found = false;
        break;
      }
    }

    if (found) return;

    var broken = document.querySelector('script[src="' + src + '"]');
    if (!broken || broken.dataset.loaded === 'true') return;

    broken.remove();
    delete scriptPromises[src];
  }

  function loadThreeDeps() {
    if (threeDepsPromise) return threeDepsPromise;

    threeDepsPromise = loadScript(THREE_CDN)
      .then(function() { return waitForGlobal('THREE'); })
      .then(function() {
        resetBrokenLoaderScript(THREE_MTL_LOADER_CDN, 'THREE.MTLLoader');
        return loadScript(THREE_MTL_LOADER_CDN);
      })
      .then(function() { return waitForGlobal('THREE.MTLLoader'); })
      .then(function() {
        resetBrokenLoaderScript(THREE_OBJ_LOADER_CDN, 'THREE.OBJLoader');
        return loadScript(THREE_OBJ_LOADER_CDN);
      })
      .then(function() { return waitForGlobal('THREE.OBJLoader'); });

    return threeDepsPromise;
  }

  function getSiteBaseUrl() {
    var script = document.querySelector('script[src*="attitude-fusion.js"]');
    if (!script) return '';
    var match = script.src.match(/^(.*)\/libs\/custom\/demos\/attitude-fusion\.js(?:\?.*)?$/);
    return match ? match[1] : '';
  }

  function getAirplaneModelBase() {
    return getSiteBaseUrl() + '/libs/airplane-model/';
  }

  function computeFuselagePivot(object) {
    var box = new THREE.Box3().setFromObject(object);
    var size = box.getSize(new THREE.Vector3());
    var threshold = Math.max(size.x * 0.1, 3);
    var vertex = new THREE.Vector3();
    var sumX = 0;
    var sumY = 0;
    var sumZ = 0;
    var count = 0;
    var minZ = Infinity;
    var maxZ = -Infinity;

    object.traverse(function(child) {
      if (!child.isMesh || !child.geometry) return;

      var positions = child.geometry.attributes.position;
      if (!positions) return;

      for (var i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        child.localToWorld(vertex);

        if (Math.abs(vertex.x) > threshold) continue;

        sumX += vertex.x;
        sumY += vertex.y;
        sumZ += vertex.z;
        count += 1;
        minZ = Math.min(minZ, vertex.z);
        maxZ = Math.max(maxZ, vertex.z);
      }
    });

    if (!count) return box.getCenter(new THREE.Vector3());

    return new THREE.Vector3(
      sumX / count,
      sumY / count,
      (minZ + maxZ) / 2
    );
  }

  function prepareAirplaneModel(object) {
    object.updateMatrixWorld(true);

    var pivot = computeFuselagePivot(object);
    var box = new THREE.Box3().setFromObject(object);
    var size = box.getSize(new THREE.Vector3());

    var model = new THREE.Group();
    model.add(object);
    object.position.set(-pivot.x, -pivot.y, -pivot.z);

    model.scale.setScalar(1.35 / Math.max(size.x, size.y, size.z));
    model.rotation.y = -Math.PI / 2;

    box.setFromObject(model);
    model.position.y -= box.min.y;
    model.position.y += 0.02;

    var group = new THREE.Group();
    group.add(model);
    group.position.y = 0.12;
    return group;
  }

  function createColoredAirplane(template, color, opacity) {
    var clone = template.clone(true);
    var materialOptions = {
      color: color,
      metalness: 0.18,
      roughness: 0.48,
      side: THREE.FrontSide,
      flatShading: false
    };

    if (opacity < 1) {
      materialOptions.transparent = true;
      materialOptions.opacity = opacity;
    }

    clone.traverse(function(child) {
      if (!child.isMesh) return;
      child.material = new THREE.MeshStandardMaterial(materialOptions);
    });

    return clone;
  }

  function loadAirplaneTemplate(objFile) {
    objFile = objFile || 'bixler.obj';
    if (airplaneModelPromises[objFile]) return airplaneModelPromises[objFile];

    airplaneModelPromises[objFile] = loadThreeDeps().then(function() {
      var modelBase = getAirplaneModelBase();

      return new Promise(function(resolve, reject) {
        var mtlLoader = new THREE.MTLLoader();
        mtlLoader.setPath(modelBase);
        mtlLoader.load('bixler.mtl', function(materials) {
          materials.preload();

          var objLoader = new THREE.OBJLoader();
          objLoader.setMaterials(materials);
          objLoader.setPath(modelBase);
          objLoader.load(objFile, function(object) {
            resolve(prepareAirplaneModel(object));
          }, undefined, reject);
        }, undefined, reject);
      });
    });

    return airplaneModelPromises[objFile];
  }

  function createAttitudeScene() {
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    var key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(5, 7, 4);
    scene.add(key);

    var grid = new THREE.GridHelper(7, 14, 0xbfc9d4, 0xdce3ea);
    grid.position.y = -0.55;
    scene.add(grid);

    return scene;
  }

  function applyAttitudeRotation(group, roll, pitch, yaw) {
    group.rotation.order = 'ZXY';
    group.rotation.x = roll * DEG;
    group.rotation.z = -pitch * DEG;
    group.rotation.y = -yaw * DEG;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function wrap360(value) {
    return ((value % 360) + 360) % 360;
  }

  function shortestAngleDiff(from, to) {
    return ((to - from + 540) % 360) - 180;
  }

  function lerpAngle(from, to, t) {
    return wrap360(from + shortestAngleDiff(from, to) * t);
  }

  function randn() {
    var u = 0;
    var v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function formatHeading(value) {
    if (value == null || isNaN(value)) return 'N/A';
    var rounded = Math.round(wrap360(value));
    return (rounded < 10 ? '00' : rounded < 100 ? '0' : '') + rounded + '°';
  }

  function createAttitudeState() {
    return { roll: 0, pitch: 0, yaw: 270 };
  }

  function copyAttitudeState(state) {
    return { roll: state.roll, pitch: state.pitch, yaw: state.yaw };
  }

  function attitudeError(a, b) {
    var yawError = shortestAngleDiff(a.yaw, b.yaw);
    return Math.sqrt(
      Math.pow(a.roll - b.roll, 2) +
      Math.pow(a.pitch - b.pitch, 2) +
      Math.pow(yawError, 2)
    ) / Math.sqrt(3);
  }

  function lineDataset(label, data, color, options) {
    options = options || {};
    return {
      label: label,
      data: data,
      borderColor: color,
      backgroundColor: 'transparent',
      borderWidth: options.width || 1.5,
      borderDash: options.dash || [],
      pointRadius: 0,
      tension: 0.16,
      spanGaps: true
    };
  }

  function MemsSensorFusionLabDemo(modal) {
    this.modal = modal;
    this.canvas = modal.querySelector('.js-attitude-fusion-canvas');
    this.pipelineCanvas = modal.querySelector('.js-attitude-fusion-pipeline');
    this.sensorPanelsCanvas = modal.querySelector('.js-attitude-fusion-sensor-panels');
    this.chartRpCanvas = modal.querySelector('.js-af-chart-rp');
    this.rollValEl = modal.querySelector('.js-af-roll-val');
    this.pitchValEl = modal.querySelector('.js-af-pitch-val');
    this.hdgValEl = modal.querySelector('.js-af-hdg-val');
    this.accNoiseInput = modal.querySelector('.js-af-acc-noise');
    this.gyroDriftInput = modal.querySelector('.js-af-gyro-drift');
    this.magNoiseInput = modal.querySelector('.js-af-mag-noise');
    this.accNoiseOnInput = modal.querySelector('.js-af-acc-noise-on');
    this.gyroDriftOnInput = modal.querySelector('.js-af-gyro-drift-on');
    this.magNoiseOnInput = modal.querySelector('.js-af-mag-noise-on');
    this.alphaInput = modal.querySelector('.js-af-alpha');
    this.accNoiseVal = modal.querySelector('.js-af-acc-noise-val');
    this.gyroDriftVal = modal.querySelector('.js-af-gyro-drift-val');
    this.magNoiseVal = modal.querySelector('.js-af-mag-noise-val');
    this.alphaVal = modal.querySelector('.js-af-alpha-val');
    this.alphaWrap = modal.querySelector('.js-af-alpha-wrap');
    this.resetBtn = modal.querySelector('.js-af-reset');
    this.fusionToggleBtn = modal.querySelector('.js-af-fusion-toggle');
    this.fusionLabelEl = modal.querySelector('.js-af-fusion-label');
    this.fusionDescEl = modal.querySelector('.js-af-fusion-desc');
    this.instrumentsCaptionEl = modal.querySelector('.js-af-instruments-caption');
    this.demoRoot = modal.querySelector('.js-attitude-fusion-demo');
    this.modelLoadingEl = modal.querySelector('.js-af-model-loading');
    this.rawErrorValEl = modal.querySelector('.js-af-raw-error-val');
    this.calibratedErrorValEl = modal.querySelector('.js-af-calibrated-error-val');
    this.ekfErrorValEl = modal.querySelector('.js-af-ekf-error-val');

    this.accNoise = 5;
    this.gyroDrift = 0.05;
    this.magNoise = 4;
    this.alpha = 0.98;
    this.accNoiseOn = true;
    this.gyroDriftOn = true;
    this.magNoiseOn = true;
    this.fusionEnabled = true;

    this.groundTruth = createAttitudeState();
    this.prevGroundTruth = createAttitudeState();
    this.rawSensor = createAttitudeState();
    this.calibratedSensor = createAttitudeState();
    this.ekfEstimate = createAttitudeState();
    this.true = this.groundTruth;
    this.prevTrue = this.prevGroundTruth;
    this.gyroEst = createAttitudeState();
    this.accEst = createAttitudeState();
    this.magEst = createAttitudeState();
    this.fusedEst = this.ekfEstimate;
    this.gyroBias = { roll: 0.6, pitch: -0.4, yaw: 1.0 };
    this.lastErrors = { raw: 0, calibrated: 0, ekf: 0, gyro: 0 };

    this.elapsed = 0;
    this.frameCount = 0;
    this.userRollRate = 0;
    this.userPitchRate = 0;
    this.userYawRate = 0;
    this.isDragging = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;
    this.running = false;
    this.initialized = false;
    this.rafId = null;

    this.historySize = 180;
    this.labels = [];
    this.hist = {
      truth: [], raw: [], calibrated: [], ekf: []
    };

    this.trueScene = null;
    this.estimatedScene = null;
    this.camera = null;
    this.renderer = null;
    this.trueVehicle = null;
    this.estimatedVehicle = null;
    this.pipelineCtx = null;
    this.sensorPanelsCtx = null;
    this.chartRp = null;

    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onResize = this.handleResize.bind(this);
    this.animate = this.animate.bind(this);

    this.bindControls();

    if (this.accNoiseOnInput) this.accNoiseOn = this.accNoiseOnInput.checked;
    if (this.gyroDriftOnInput) this.gyroDriftOn = this.gyroDriftOnInput.checked;
    if (this.magNoiseOnInput) this.magNoiseOn = this.magNoiseOnInput.checked;
  }

  MemsSensorFusionLabDemo.prototype.bindControls = function() {
    var self = this;

    if (this.accNoiseInput) {
      this.accNoiseInput.addEventListener('input', function() {
        self.accNoise = parseFloat(self.accNoiseInput.value);
        self.accNoiseVal.textContent = self.accNoise.toFixed(1) + '°';
      });
    }

    if (this.gyroDriftInput) {
      this.gyroDriftInput.addEventListener('input', function() {
        self.gyroDrift = parseFloat(self.gyroDriftInput.value);
        self.gyroDriftVal.textContent = self.gyroDrift.toFixed(3) + '°/s';
      });
    }

    if (this.magNoiseInput) {
      this.magNoiseInput.addEventListener('input', function() {
        self.magNoise = parseFloat(self.magNoiseInput.value);
        self.magNoiseVal.textContent = self.magNoise.toFixed(1) + '°';
      });
    }

    if (this.accNoiseOnInput) {
      this.accNoiseOnInput.addEventListener('change', function() {
        self.accNoiseOn = self.accNoiseOnInput.checked;
        self.updateNoiseControlUI();
      });
    }

    if (this.gyroDriftOnInput) {
      this.gyroDriftOnInput.addEventListener('change', function() {
        self.gyroDriftOn = self.gyroDriftOnInput.checked;
        self.updateNoiseControlUI();
      });
    }

    if (this.magNoiseOnInput) {
      this.magNoiseOnInput.addEventListener('change', function() {
        self.magNoiseOn = self.magNoiseOnInput.checked;
        self.updateNoiseControlUI();
      });
    }

    if (this.alphaInput) {
      this.alphaInput.addEventListener('input', function() {
        var correctionStrength = parseFloat(self.alphaInput.value);
        self.alpha = 1 - correctionStrength;
        self.alphaVal.textContent = Math.round(correctionStrength * 100) + '%';
      });
    }

    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', function() {
        self.resetSimulation();
      });
    }

    if (this.fusionToggleBtn) {
      this.fusionToggleBtn.addEventListener('click', function() {
        self.setFusionEnabled(!self.fusionEnabled);
      });
    }

    if (this.canvas) {
      this.canvas.addEventListener('pointerdown', this.onPointerDown);
    }

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('resize', this.onResize);
  };

  MemsSensorFusionLabDemo.prototype.getEffectiveNoise = function() {
    return {
      acc: this.accNoiseOn ? this.accNoise : 0,
      gyroDrift: this.gyroDriftOn ? this.gyroDrift : 0,
      gyroWhite: this.gyroDriftOn ? 0.08 : 0,
      mag: this.magNoiseOn ? this.magNoise : 0
    };
  };

  MemsSensorFusionLabDemo.prototype.updateNoiseControlUI = function() {
    var blocks = [
      { on: this.accNoiseOn, el: this.modal.querySelector('.js-af-noise-acc') },
      { on: this.gyroDriftOn, el: this.modal.querySelector('.js-af-noise-gyro') },
      { on: this.magNoiseOn, el: this.modal.querySelector('.js-af-noise-mag') }
    ];

    blocks.forEach(function(block) {
      if (!block.el) return;
      block.el.classList.toggle('is-noise-off', !block.on);
      var range = block.el.querySelector('input[type="range"]');
      if (range) range.disabled = !block.on;
    });

    this.updateDisplays();
  };

  MemsSensorFusionLabDemo.prototype.setFusionEnabled = function(enabled) {
    if (!enabled && this.fusionEnabled) {
      this.gyroEst.roll = this.ekfEstimate.roll;
      this.gyroEst.pitch = this.ekfEstimate.pitch;
      this.gyroEst.yaw = this.ekfEstimate.yaw;
    }

    this.fusionEnabled = enabled;

    if (this.demoRoot) {
      this.demoRoot.classList.toggle('is-fusion-on', enabled);
      this.demoRoot.classList.toggle('is-fusion-off', !enabled);
    }

    if (this.fusionToggleBtn) {
      this.fusionToggleBtn.textContent = enabled ? 'Disable EKF fusion' : 'Enable EKF fusion';
      this.fusionToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      this.fusionToggleBtn.classList.toggle('button-primary', enabled);
      this.fusionToggleBtn.classList.toggle('button', !enabled);
    }

    if (this.fusionLabelEl) {
      this.fusionLabelEl.textContent = enabled ? 'EKF-based attitude estimation active' : 'Uncorrected MEMS sensors — EKF off';
    }

    if (this.fusionDescEl) {
      this.fusionDescEl.textContent = enabled
        ? 'Gyro propagation is corrected by accelerometer and magnetometer observations with online bias compensation.'
        : 'Roll/pitch follow gyro integration (bias drifts) with accelerometer noise; heading follows the magnetometer directly (jitter).';
    }

    if (this.instrumentsCaptionEl) {
      this.instrumentsCaptionEl.textContent = enabled
        ? 'Sensor health and calibration effect update from live MEMS errors.'
        : 'EKF is bypassed; gyro drift, accelerometer noise, and magnetometer jitter are all visible on the estimate.';
    }

    if (this.ekfErrorValEl && this.ekfErrorValEl.parentNode && this.ekfErrorValEl.parentNode.firstChild) {
      this.ekfErrorValEl.parentNode.firstChild.textContent = enabled ? 'EKF Error: ' : 'Sensor Error: ';
    }

    if (this.alphaWrap) {
      this.alphaWrap.style.opacity = enabled ? '1' : '0.45';
      this.alphaWrap.style.pointerEvents = enabled ? 'auto' : 'none';
    }

    this.updateDisplays();
  };

  MemsSensorFusionLabDemo.prototype.createVehicleModel = function(color, opacity) {
    var group = new THREE.Group();
    var transparent = opacity < 1;
    var bodyMat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.18, roughness: 0.48, transparent: transparent, opacity: opacity });
    var cabinMat = new THREE.MeshStandardMaterial({ color: 0xe8eef2, metalness: 0.12, roughness: 0.38, transparent: transparent, opacity: opacity });
    var darkMat = new THREE.MeshStandardMaterial({ color: 0x2f3740, metalness: 0.25, roughness: 0.45, transparent: transparent, opacity: opacity });
    var sensorMat = new THREE.MeshStandardMaterial({ color: 0xf7d046, metalness: 0.18, roughness: 0.34, transparent: transparent, opacity: opacity });

    var chassis = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.22, 0.62), bodyMat);
    chassis.position.y = 0.02;
    group.add(chassis);

    var cabin = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.26, 0.48), cabinMat);
    cabin.position.set(0.12, 0.26, 0);
    group.add(cabin);

    var hood = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.54), bodyMat);
    hood.position.set(0.54, 0.18, 0);
    group.add(hood);

    var sensorPod = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), sensorMat);
    sensorPod.position.set(0.04, 0.44, 0);
    group.add(sensorPod);

    var antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 10), darkMat);
    antenna.position.set(-0.2, 0.56, 0.16);
    group.add(antenna);

    [-0.42, 0.42].forEach(function(px) {
      [-0.36, 0.36].forEach(function(pz) {
        var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 20), darkMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(px, -0.12, pz);
        group.add(wheel);
      });
    });

    group.position.y = 0.12;
    return group;
  };

  MemsSensorFusionLabDemo.prototype.initThree = function() {
    var width = this.canvas.clientWidth;
    var height = this.canvas.clientHeight;

    this.trueScene = this.createAttitudeScene();
    this.estimatedScene = this.createAttitudeScene();
    this.trueScene.background = null;
    this.estimatedScene.background = null;

    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    this.camera.position.set(2.35, 1.05, 2.95);
    this.camera.lookAt(0, 0.02, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setScissorTest(true);
  };

  MemsSensorFusionLabDemo.prototype.setModelLoading = function(isLoading) {
    if (this.modelLoadingEl) this.modelLoadingEl.hidden = !isLoading;
    if (this.demoRoot) this.demoRoot.classList.toggle('is-loading', isLoading);
  };

  MemsSensorFusionLabDemo.prototype.loadVehicles = function() {
    var self = this;

    return loadAirplaneTemplate().then(function(template) {
      self.trueVehicle = createColoredAirplane(template, 0x2ecc71, 1.0);
      self.estimatedVehicle = createColoredAirplane(template, 0xf39c12, 1.0);
      self.trueScene.add(self.trueVehicle);
      self.estimatedScene.add(self.estimatedVehicle);
    }).catch(function(error) {
      console.warn('Airplane model failed to load, using fallback vehicle.', error);
      self.trueVehicle = self.createVehicleModel(0x2ecc71, 1.0);
      self.estimatedVehicle = self.createVehicleModel(0xf39c12, 1.0);
      self.trueScene.add(self.trueVehicle);
      self.estimatedScene.add(self.estimatedVehicle);
    });
  };

  MemsSensorFusionLabDemo.prototype.createAttitudeScene = function() {
    return createAttitudeScene();
  };

  MemsSensorFusionLabDemo.prototype.initInstruments = function() {
    if (this.pipelineCanvas) {
      this.pipelineCtx = this.pipelineCanvas.getContext('2d');
    }
    if (this.sensorPanelsCanvas) {
      this.sensorPanelsCtx = this.sensorPanelsCanvas.getContext('2d');
    }
  };

  MemsSensorFusionLabDemo.prototype.resizeCanvas2d = function(canvas, ctx) {
    if (!canvas || !ctx) return;
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (!width || !height) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  MemsSensorFusionLabDemo.prototype.initCharts = function() {
    this.chartRp = new Chart(this.chartRpCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: [
          lineDataset('Ground Truth', this.hist.truth, '#2ecc71', { width: 1.3 }),
          lineDataset('Raw Sensor', this.hist.raw, '#e74c3c', { dash: [4, 3] }),
          lineDataset('Calibrated Sensor', this.hist.calibrated, '#2982ac', { dash: [5, 3], width: 1.8 }),
          lineDataset('EKF Estimate', this.hist.ekf, '#f39c12', { width: 2.4 })
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { labels: { boxWidth: 8, font: { size: 9 } } },
          title: { display: true, text: 'Attitude Estimation Performance', font: { size: 10 } }
        },
        scales: {
          x: { display: false },
          y: { suggestedMin: -35, suggestedMax: 35, ticks: { font: { size: 8 } }, grid: { color: 'rgba(0,0,0,0.06)' }, title: { display: true, text: 'roll angle (deg)', font: { size: 8 } } }
        }
      }
    });
  };

  MemsSensorFusionLabDemo.prototype.handleResize = function() {
    if (this.renderer && this.camera) {
      var width = this.canvas.clientWidth;
      var height = this.canvas.clientHeight;
      if (width && height) {
        this.camera.aspect = (width / 2) / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
      }
    }

    this.resizeCanvas2d(this.pipelineCanvas, this.pipelineCtx);
    this.resizeCanvas2d(this.sensorPanelsCanvas, this.sensorPanelsCtx);

    if (this.chartRp) this.chartRp.resize();
  };

  MemsSensorFusionLabDemo.prototype.handlePointerDown = function(event) {
    var rect = this.canvas.getBoundingClientRect();
    var localX = event.clientX - rect.left;
    if (localX > rect.width / 2) return;

    this.isDragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add('is-dragging');
  };

  MemsSensorFusionLabDemo.prototype.handlePointerMove = function(event) {
    if (!this.isDragging) return;
    var dx = event.clientX - this.lastPointerX;
    var dy = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;

    var yawDelta = dx * DRAG_YAW_RATE;
    var pitchDelta = -dy * DRAG_PITCH_RATE;
    var rollDelta = dx * DRAG_ROLL_RATE;

    this.groundTruth.yaw = wrap360(this.groundTruth.yaw + yawDelta);
    this.groundTruth.pitch = clamp(this.groundTruth.pitch + pitchDelta, -35, 35);
    this.groundTruth.roll = clamp(this.groundTruth.roll + rollDelta, -55, 55);

    this.userYawRate = yawDelta * 18;
    this.userPitchRate = pitchDelta * 18;
    this.userRollRate = rollDelta * 18;
    this.updateDisplays();
  };

  MemsSensorFusionLabDemo.prototype.handlePointerUp = function(event) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.canvas.classList.remove('is-dragging');
    if (this.canvas.hasPointerCapture && this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  MemsSensorFusionLabDemo.prototype.getDisplayEstimate = function() {
    if (this.fusionEnabled) return this.ekfEstimate;
    // Gyro integration carries slow bias drift; acc residual adds high-frequency tilt noise.
    return {
      roll: this.gyroEst.roll + (this.accEst.roll - this.calibratedSensor.roll),
      pitch: this.gyroEst.pitch + (this.accEst.pitch - this.calibratedSensor.pitch),
      yaw: this.magEst.yaw
    };
  };

  MemsSensorFusionLabDemo.prototype.updateVehicleRotation = function(display) {
    if (this.trueVehicle) {
      applyAttitudeRotation(this.trueVehicle, this.groundTruth.roll, this.groundTruth.pitch, this.groundTruth.yaw);
    }

    if (this.estimatedVehicle) {
      applyAttitudeRotation(this.estimatedVehicle, display.roll, display.pitch, display.yaw);
    }
  };

  MemsSensorFusionLabDemo.prototype.drawCard = function(ctx, x, y, w, h, title) {
    ctx.fillStyle = THEME.card;
    ctx.strokeStyle = THEME.cardBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = THEME.text;
    ctx.font = '700 10px Raleway, sans-serif';
    ctx.fillText(title, x + 10, y + 16);
  };

  MemsSensorFusionLabDemo.prototype.drawBar = function(ctx, x, y, w, label, value, maxValue, color) {
    var pct = clamp(Math.abs(value) / maxValue, 0, 1);
    ctx.fillStyle = THEME.textMuted;
    ctx.font = '9px Raleway, sans-serif';
    ctx.fillText(label, x, y - 3);
    ctx.fillStyle = THEME.barTrack;
    ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * pct, 8);
  };

  MemsSensorFusionLabDemo.prototype.drawPipeline = function(ctx, x, y, w, h) {
    this.drawCard(ctx, x, y, w, h, 'MEMS Sensor Fusion Pipeline');

    var nodes = [
      { label: 'GYRO', sub: 'rate', fill: 'rgba(230,126,34,0.16)', stroke: 'rgba(230,126,34,0.34)', text: '#8a4d15' },
      { label: 'ACC', sub: 'tilt', fill: 'rgba(231,76,60,0.14)', stroke: 'rgba(231,76,60,0.32)', text: '#a83226' },
      { label: 'MAG', sub: 'heading', fill: 'rgba(155,89,182,0.14)', stroke: 'rgba(155,89,182,0.32)', text: '#6f3f87' },
      { label: 'GPS', sub: 'motion', fill: 'rgba(22,160,133,0.14)', stroke: 'rgba(22,160,133,0.32)', text: '#0f6d5b' },
      { label: 'CALIB', sub: 'bias/noise', fill: 'rgba(41,130,172,0.14)', stroke: 'rgba(41,130,172,0.32)', text: '#1f5f7d' },
      { label: 'DCM', sub: 'attitude', fill: 'rgba(52,73,94,0.12)', stroke: 'rgba(52,73,94,0.28)', text: '#2c3e50' },
      { label: 'EKF', sub: this.fusionEnabled ? 'fusion' : 'bypass', fill: 'rgba(243,156,18,0.16)', stroke: 'rgba(243,156,18,0.34)', text: '#9a6412' },
      { label: 'RECORD', sub: 'motion', fill: 'rgba(46,204,113,0.14)', stroke: 'rgba(46,204,113,0.32)', text: '#1f7a45' }
    ];

    var startX = x + 12;
    var nodeGap = 6;
    var nodeW = (w - 24 - (nodes.length - 1) * nodeGap) / nodes.length;
    var nodeH = Math.min(42, Math.max(30, h - 40));
    var nodeY = y + Math.max(24, (h - nodeH) * 0.42);
    var pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 5);

    nodes.forEach(function(node, i) {
      var nx = startX + i * (nodeW + nodeGap);
      ctx.fillStyle = node.fill;
      ctx.strokeStyle = node.stroke;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.72 + 0.28 * pulse;
      ctx.beginPath();
      ctx.roundRect(nx, nodeY, nodeW, nodeH, 6);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = node.text;
      ctx.font = '700 8px Raleway, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, nx + nodeW / 2, nodeY + nodeH * 0.38);
      ctx.font = '8px Raleway, sans-serif';
      ctx.fillText(node.sub, nx + nodeW / 2, nodeY + nodeH * 0.72);

      if (i < nodes.length - 1) {
        ctx.strokeStyle = THEME.connector;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(nx + nodeW + 2, nodeY + nodeH * 0.5);
        ctx.lineTo(nx + nodeW + 8, nodeY + nodeH * 0.5);
        ctx.stroke();
      }
    });

    ctx.textAlign = 'left';
  };

  MemsSensorFusionLabDemo.prototype.drawSensorHealthPanel = function(ctx, x, y, w, h) {
    this.drawCard(ctx, x, y, w, h, 'Sensor Health');
    var noise = this.getEffectiveNoise();
    var barTop = y + 30;
    var barGap = Math.max(18, (h - 44) / 3);

    this.drawBar(ctx, x + 12, barTop, w - 24, 'Gyro bias', noise.gyroDrift, 0.2, '#e67e22');
    this.drawBar(ctx, x + 12, barTop + barGap, w - 24, 'Acc noise', noise.acc, 15, '#e74c3c');
    this.drawBar(ctx, x + 12, barTop + barGap * 2, w - 24, 'Mag noise', noise.mag, 25, '#9b59b6');
  };

  MemsSensorFusionLabDemo.prototype.drawCalibrationPanel = function(ctx, x, y, w, h) {
    this.drawCard(ctx, x, y, w, h, 'Calibration Effect');
    var raw = this.rawSensor;
    var cal = this.calibratedSensor;
    var truth = this.groundTruth;
    var rows = [
      { label: 'Roll Error', before: Math.abs(raw.roll - truth.roll), after: Math.abs(cal.roll - truth.roll) },
      { label: 'Pitch Error', before: Math.abs(raw.pitch - truth.pitch), after: Math.abs(cal.pitch - truth.pitch) },
      { label: 'Heading Error', before: Math.abs(shortestAngleDiff(truth.yaw, raw.yaw)), after: Math.abs(shortestAngleDiff(truth.yaw, cal.yaw)) }
    ];
    var startY = y + 34;
    var rowH = Math.max(20, (h - 48) / rows.length);

    ctx.font = '700 8px Raleway, sans-serif';
    ctx.fillStyle = THEME.textMuted;
    ctx.fillText('Before', x + w - 86, y + 17);
    ctx.fillText('After', x + w - 40, y + 17);

    rows.forEach(function(row, i) {
      var ry = startY + i * rowH;
      ctx.fillStyle = THEME.text;
      ctx.font = '9px Raleway, sans-serif';
      ctx.fillText(row.label, x + 12, ry);
      ctx.fillStyle = '#e74c3c';
      ctx.font = '700 9px Raleway, sans-serif';
      ctx.fillText(row.before.toFixed(1) + '°', x + w - 88, ry);
      ctx.fillStyle = '#2ecc71';
      ctx.fillText(row.after.toFixed(1) + '°', x + w - 42, ry);
    });
  };

  MemsSensorFusionLabDemo.prototype.drawPipelinePanel = function() {
    var ctx = this.pipelineCtx;
    var width = this.pipelineCanvas ? this.pipelineCanvas.clientWidth : 0;
    var height = this.pipelineCanvas ? this.pipelineCanvas.clientHeight : 0;
    if (!ctx || !width || !height) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, width, height);
    this.drawPipeline(ctx, 8, 8, width - 16, height - 16);
  };

  MemsSensorFusionLabDemo.prototype.drawSensorPanels = function() {
    var ctx = this.sensorPanelsCtx;
    var width = this.sensorPanelsCanvas ? this.sensorPanelsCanvas.clientWidth : 0;
    var height = this.sensorPanelsCanvas ? this.sensorPanelsCanvas.clientHeight : 0;
    if (!ctx || !width || !height) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, width, height);

    var gap = 10;
    var leftW = Math.round((width - 16 - gap) * 0.48);
    var rightW = width - 16 - gap - leftW;
    var panelH = height - 16;

    this.drawSensorHealthPanel(ctx, 8, 8, leftW, panelH);
    this.drawCalibrationPanel(ctx, 8 + leftW + gap, 8, rightW, panelH);
  };

  MemsSensorFusionLabDemo.prototype.drawInstruments = function() {
    this.drawPipelinePanel();
    this.drawSensorPanels();
  };

  MemsSensorFusionLabDemo.prototype.fuseAxis = function(previous, gyroRate, accMeasurement, dt) {
    return this.alpha * (previous + gyroRate * dt) + (1 - this.alpha) * accMeasurement;
  };

  MemsSensorFusionLabDemo.prototype.updateCharts = function() {
    if (!this.chartRp) return;

    var h = this.hist;
    this.chartRp.data.labels = this.labels;
    this.chartRp.data.datasets[0].data = h.truth;
    this.chartRp.data.datasets[1].data = h.raw;
    this.chartRp.data.datasets[2].data = h.calibrated;
    this.chartRp.data.datasets[3].data = h.ekf;
    this.chartRp.update('none');
  };

  MemsSensorFusionLabDemo.prototype.pushHistory = function(display) {
    this.labels.push('');
    this.hist.truth.push(this.groundTruth.roll);
    this.hist.raw.push(this.rawSensor.roll);
    this.hist.calibrated.push(this.calibratedSensor.roll);
    this.hist.ekf.push(display.roll);

    if (this.labels.length > this.historySize) {
      this.labels.shift();
      Object.keys(this.hist).forEach(function(key) { this.hist[key].shift(); }, this);
    }

    this.updateCharts();
  };

  MemsSensorFusionLabDemo.prototype.stepSimulation = function(dt) {
    this.elapsed += dt;

    var noise = this.getEffectiveNoise();
    var groundRollRate = this.isDragging ? 0 : Math.sin(this.elapsed * 1.18) * 9.2 + Math.sin(this.elapsed * 0.31) * 2.4;
    var groundPitchRate = this.isDragging ? 0 : Math.sin(this.elapsed * 0.82 + 1.2) * 5.6;
    var groundYawRate = this.isDragging ? 0 : 9 + Math.sin(this.elapsed * 0.46) * 3.4;

    this.userRollRate *= 0.9;
    this.userPitchRate *= 0.9;
    this.userYawRate *= 0.9;

    this.prevGroundTruth = copyAttitudeState(this.groundTruth);

    this.groundTruth.roll = clamp(this.groundTruth.roll + (groundRollRate - this.groundTruth.roll * (this.isDragging ? 0 : 0.18)) * dt, -55, 55);
    this.groundTruth.pitch = clamp(this.groundTruth.pitch + (groundPitchRate - this.groundTruth.pitch * (this.isDragging ? 0 : 0.14)) * dt, -35, 35);
    this.groundTruth.yaw = wrap360(this.groundTruth.yaw + groundYawRate * dt);

    var trueRollRate = (this.groundTruth.roll - this.prevGroundTruth.roll) / dt + this.userRollRate;
    var truePitchRate = (this.groundTruth.pitch - this.prevGroundTruth.pitch) / dt + this.userPitchRate;
    var trueYawRate = shortestAngleDiff(this.prevGroundTruth.yaw, this.groundTruth.yaw) / dt + this.userYawRate;

    if (noise.gyroDrift > 0) {
      var biasWalk = 0.03 * dt;
      this.gyroBias.roll = clamp(this.gyroBias.roll + randn() * biasWalk, -1.4, 1.4);
      this.gyroBias.pitch = clamp(this.gyroBias.pitch + randn() * biasWalk, -1.4, 1.4);
      this.gyroBias.yaw = clamp(this.gyroBias.yaw + randn() * biasWalk, -1.4, 1.4);
    }

    var measuredRollRate = trueRollRate + noise.gyroWhite * randn() + noise.gyroDrift * this.gyroBias.roll;
    var measuredPitchRate = truePitchRate + noise.gyroWhite * randn() + noise.gyroDrift * this.gyroBias.pitch;
    var measuredYawRate = trueYawRate + noise.gyroWhite * randn() + noise.gyroDrift * this.gyroBias.yaw;

    var accRoll = this.groundTruth.roll + randn() * noise.acc;
    var accPitch = this.groundTruth.pitch + randn() * noise.acc;
    var magHeading = wrap360(this.groundTruth.yaw + randn() * noise.mag);

    this.gyroEst.roll += measuredRollRate * dt;
    this.gyroEst.pitch += measuredPitchRate * dt;
    this.gyroEst.yaw = wrap360(this.gyroEst.yaw + measuredYawRate * dt);

    this.accEst.roll = accRoll;
    this.accEst.pitch = accPitch;
    this.magEst.yaw = magHeading;

    this.rawSensor.roll = accRoll;
    this.rawSensor.pitch = accPitch;
    this.rawSensor.yaw = magHeading;

    this.calibratedSensor.roll = this.calibratedSensor.roll * 0.7 + accRoll * 0.3;
    this.calibratedSensor.pitch = this.calibratedSensor.pitch * 0.7 + accPitch * 0.3;
    this.calibratedSensor.yaw = lerpAngle(this.calibratedSensor.yaw, magHeading, 0.3);

    this.ekfEstimate.roll = this.fuseAxis(this.ekfEstimate.roll, measuredRollRate, this.calibratedSensor.roll, dt);
    this.ekfEstimate.pitch = this.fuseAxis(this.ekfEstimate.pitch, measuredPitchRate, this.calibratedSensor.pitch, dt);
    this.ekfEstimate.yaw = lerpAngle(
      wrap360(this.ekfEstimate.yaw + measuredYawRate * dt),
      this.calibratedSensor.yaw,
      1 - this.alpha
    );

    var display = this.getDisplayEstimate();
    this.lastErrors.raw = attitudeError(this.rawSensor, this.groundTruth);
    this.lastErrors.calibrated = attitudeError(this.calibratedSensor, this.groundTruth);
    this.lastErrors.ekf = attitudeError(this.ekfEstimate, this.groundTruth);
    this.lastErrors.gyro = attitudeError(display, this.groundTruth);

    if (this.frameCount % 2 === 0) {
      this.pushHistory(display);
    }

    this.frameCount += 1;
    this.updateDisplays();
  };

  MemsSensorFusionLabDemo.prototype.updateDisplays = function() {
    var display = this.getDisplayEstimate();

    if (this.rollValEl) this.rollValEl.textContent = display.roll.toFixed(1) + '°';
    if (this.pitchValEl) this.pitchValEl.textContent = display.pitch.toFixed(1) + '°';
    if (this.hdgValEl) this.hdgValEl.textContent = formatHeading(display.yaw);
    if (this.rawErrorValEl) this.rawErrorValEl.textContent = this.lastErrors.raw.toFixed(1) + '°';
    if (this.calibratedErrorValEl) this.calibratedErrorValEl.textContent = this.lastErrors.calibrated.toFixed(1) + '°';
    if (this.ekfErrorValEl) {
      this.ekfErrorValEl.textContent = (this.fusionEnabled ? this.lastErrors.ekf : this.lastErrors.gyro).toFixed(1) + '°';
    }

    this.updateVehicleRotation(display);
    this.drawInstruments();
  };

  MemsSensorFusionLabDemo.prototype.resetSimulation = function() {
    this.groundTruth = createAttitudeState();
    this.prevGroundTruth = createAttitudeState();
    this.rawSensor = createAttitudeState();
    this.calibratedSensor = createAttitudeState();
    this.ekfEstimate = createAttitudeState();
    this.true = this.groundTruth;
    this.prevTrue = this.prevGroundTruth;
    this.gyroEst = createAttitudeState();
    this.accEst = createAttitudeState();
    this.magEst = createAttitudeState();
    this.fusedEst = this.ekfEstimate;
    this.lastErrors = { raw: 0, calibrated: 0, ekf: 0, gyro: 0 };
    this.elapsed = 0;
    this.frameCount = 0;
    this.userRollRate = 0;
    this.userPitchRate = 0;
    this.userYawRate = 0;
    this.labels = [];
    Object.keys(this.hist).forEach(function(key) { this.hist[key] = []; }, this);
    this.updateCharts();
    this.updateDisplays();
  };

  MemsSensorFusionLabDemo.prototype.animate = function() {
    if (!this.running) return;
    this.stepSimulation(1 / 60);
    this.renderThree();
    this.rafId = window.requestAnimationFrame(this.animate);
  };

  MemsSensorFusionLabDemo.prototype.renderThree = function() {
    if (!this.renderer || !this.camera || !this.trueScene || !this.estimatedScene) return;

    var width = this.canvas.clientWidth;
    var height = this.canvas.clientHeight;
    var halfWidth = Math.floor(width / 2);
    var rightWidth = width - halfWidth;

    this.renderer.setScissorTest(true);

    this.renderer.setViewport(0, 0, halfWidth, height);
    this.renderer.setScissor(0, 0, halfWidth, height);
    this.renderer.render(this.trueScene, this.camera);

    this.renderer.setViewport(halfWidth, 0, rightWidth, height);
    this.renderer.setScissor(halfWidth, 0, rightWidth, height);
    this.renderer.render(this.estimatedScene, this.camera);
  };

  MemsSensorFusionLabDemo.prototype.ensureInitialized = function() {
    if (this.initialized) {
      this.handleResize();
      return Promise.resolve();
    }

    if (this._initPromise) return this._initPromise;

    var self = this;
    this.setModelLoading(true);
    this.initThree();
    this._initPromise = this.loadVehicles().then(function() {
      self.initInstruments();
      self.initCharts();
      self.setFusionEnabled(true);
      self.updateNoiseControlUI();
      self.initialized = true;
      self.handleResize();
      self.updateDisplays();
    }).finally(function() {
      self.setModelLoading(false);
    });

    return this._initPromise;
  };

  MemsSensorFusionLabDemo.prototype.start = function() {
    if (this.running) return;

    var self = this;
    this.ensureInitialized().then(function() {
      if (self.running) return;
      self.running = true;
      self.animate();
    });
  };

  MemsSensorFusionLabDemo.prototype.stop = function() {
    this.running = false;
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  };

  MemsSensorFusionLabDemo.prototype.destroy = function() {
    this.stop();
    if (this.canvas) this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
    if (this.chartRp) this.chartRp.destroy();
    if (this.renderer) this.renderer.dispose();
  };

  function openModal(modal) {
    var modalId = modal.id;

    Promise.all([loadThreeDeps(), loadScript(CHART_CDN)]).then(function() {
      document.body.classList.add('demo-modal-open');
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');

      if (!activeInstances[modalId]) {
        activeInstances[modalId] = new MemsSensorFusionLabDemo(modal);
      }

      window.requestAnimationFrame(function() {
        activeInstances[modalId].setFusionEnabled(true);
        activeInstances[modalId].start();
      });
    }).catch(function(error) {
      window.alert('Unable to load the interactive demo. Please check your network connection.');
      console.error(error);
    });
  }

  function closeModal(modal) {
    var modalId = modal.id;
    var instance = activeInstances[modalId];
    if (instance) instance.stop();

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');

    if (!document.querySelector('.demo-modal:not([hidden])')) {
      document.body.classList.remove('demo-modal-open');
    }
  }

  function AttitudeFusionCardPreview(root) {
    this.root = root;
    this.canvas = root.querySelector('.js-attitude-fusion-preview-canvas');
    this.loadingEl = root.querySelector('.js-attitude-fusion-preview-loading');
    this.trueScene = null;
    this.estimatedScene = null;
    this.camera = null;
    this.renderer = null;
    this.trueVehicle = null;
    this.estimatedVehicle = null;
    this.elapsed = 0;
    this.estRoll = 0;
    this.estPitch = 0;
    this.estYaw = 270;
    this.truthRoll = 0;
    this.truthPitch = 0;
    this.truthYaw = 270;
    this.isDragging = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;
    this.running = false;
    this.visible = false;
    this.initialized = false;
    this.initializing = false;
    this.rafId = null;
    this.onResize = this.handleResize.bind(this);
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.animate = this.animate.bind(this);
  }

  AttitudeFusionCardPreview.prototype.setLoading = function(isLoading) {
    if (this.loadingEl) this.loadingEl.hidden = !isLoading;
    if (this.root) this.root.classList.toggle('is-loading', isLoading);
  };

  AttitudeFusionCardPreview.prototype.ensureInitialized = function() {
    if (this.initialized || this.initializing) return this._initPromise || Promise.resolve();

    var self = this;
    this.initializing = true;
    this.setLoading(true);

    this._initPromise = loadAirplaneTemplate('bixler.obj').then(function(template) {
      self.initThree(template);
      self.initialized = true;
      self.initializing = false;
      self.setLoading(false);
      self.handleResize();
    }).catch(function(error) {
      console.warn('Attitude fusion preview failed to load.', error);
      self.initializing = false;
      self.setLoading(false);
    });

    return this._initPromise;
  };

  AttitudeFusionCardPreview.prototype.initThree = function(template) {
    var width = this.canvas.clientWidth;
    var height = this.canvas.clientHeight;

    this.trueScene = createAttitudeScene();
    this.estimatedScene = createAttitudeScene();
    this.trueVehicle = createColoredAirplane(template, 0x2ecc71, 1.0);
    this.estimatedVehicle = createColoredAirplane(template, 0xf39c12, 1.0);
    this.trueScene.add(this.trueVehicle);
    this.estimatedScene.add(this.estimatedVehicle);

    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    this.camera.position.set(2.35, 1.05, 2.95);
    this.camera.lookAt(0, 0.02, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0xf8fafc, 1);
    this.renderer.setScissorTest(true);

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('resize', this.onResize);
  };

  AttitudeFusionCardPreview.prototype.handlePointerDown = function(event) {
    if (!this.initialized || !this.canvas) return;

    var rect = this.canvas.getBoundingClientRect();
    var localX = event.clientX - rect.left;
    if (localX > rect.width / 2) return;

    this.isDragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add('is-dragging');
  };

  AttitudeFusionCardPreview.prototype.handlePointerMove = function(event) {
    if (!this.isDragging) return;

    var dx = event.clientX - this.lastPointerX;
    var dy = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;

    this.truthYaw = wrap360(this.truthYaw + dx * DRAG_YAW_RATE);
    this.truthPitch = clamp(this.truthPitch - dy * DRAG_PITCH_RATE, -35, 35);
    this.truthRoll = clamp(this.truthRoll + dx * DRAG_ROLL_RATE, -55, 55);
  };

  AttitudeFusionCardPreview.prototype.handlePointerUp = function(event) {
    if (!this.isDragging || !this.canvas) return;

    this.isDragging = false;
    this.canvas.classList.remove('is-dragging');
    if (this.canvas.hasPointerCapture && this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  AttitudeFusionCardPreview.prototype.handleResize = function() {
    if (!this.renderer || !this.camera || !this.canvas) return;

    var width = this.canvas.clientWidth;
    var height = this.canvas.clientHeight;
    if (!width || !height) return;

    this.camera.aspect = (width / 2) / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  AttitudeFusionCardPreview.prototype.step = function(dt) {
    this.elapsed += dt;

    if (!this.isDragging) {
      var targetRoll = Math.sin(this.elapsed * 0.85) * 24;
      var targetPitch = Math.sin(this.elapsed * 0.58 + 0.8) * 16;
      var targetYaw = wrap360(270 + Math.sin(this.elapsed * 0.42) * 20);
      this.truthRoll += (targetRoll - this.truthRoll) * 0.06;
      this.truthPitch += (targetPitch - this.truthPitch) * 0.06;
      this.truthYaw = lerpAngle(this.truthYaw, targetYaw, 0.06);
    }

    this.estRoll += (this.truthRoll * 0.9 + Math.sin(this.elapsed * 1.15) * 4 - this.estRoll) * 0.08;
    this.estPitch += (this.truthPitch * 0.88 + Math.sin(this.elapsed * 0.92) * 3 - this.estPitch) * 0.08;
    this.estYaw = lerpAngle(this.estYaw, wrap360(this.truthYaw + Math.sin(this.elapsed * 0.74) * 7), 0.08);

    applyAttitudeRotation(this.trueVehicle, this.truthRoll, this.truthPitch, this.truthYaw);
    applyAttitudeRotation(this.estimatedVehicle, this.estRoll, this.estPitch, this.estYaw);
  };

  AttitudeFusionCardPreview.prototype.render = function() {
    if (!this.renderer || !this.camera || !this.trueScene || !this.estimatedScene) return;

    var width = this.canvas.clientWidth;
    var height = this.canvas.clientHeight;
    var halfWidth = Math.floor(width / 2);
    var rightWidth = width - halfWidth;

    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, width, height);
    this.renderer.clear();
    this.renderer.setScissorTest(true);

    this.renderer.setViewport(0, 0, halfWidth, height);
    this.renderer.setScissor(0, 0, halfWidth, height);
    this.renderer.render(this.trueScene, this.camera);

    this.renderer.setViewport(halfWidth, 0, rightWidth, height);
    this.renderer.setScissor(halfWidth, 0, rightWidth, height);
    this.renderer.render(this.estimatedScene, this.camera);
  };

  AttitudeFusionCardPreview.prototype.animate = function() {
    if (!this.running) return;
    this.step(1 / 60);
    this.render();
    this.rafId = window.requestAnimationFrame(this.animate);
  };

  AttitudeFusionCardPreview.prototype.start = function() {
    if (this.running) return;

    var self = this;
    this.ensureInitialized().then(function() {
      if (!self.initialized || self.running) return;
      self.running = true;
      self.animate();
    });
  };

  AttitudeFusionCardPreview.prototype.stop = function() {
    this.running = false;
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  };

  AttitudeFusionCardPreview.prototype.setVisible = function(isVisible) {
    this.visible = isVisible;
    if (isVisible) this.start();
    else this.stop();
  };

  AttitudeFusionCardPreview.prototype.destroy = function() {
    this.stop();
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.onPointerDown);
      this.canvas.classList.remove('is-dragging');
    }
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
    if (this.renderer) this.renderer.dispose();
  };

  function initAttitudeFusionPreviews() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.js-attitude-fusion-preview').forEach(function(root) {
        var preview = new AttitudeFusionCardPreview(root);
        previewInstances.push(preview);
        preview.start();
      });
      return;
    }

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        var preview = entry.target.__afPreview;
        if (!preview) return;
        preview.setVisible(entry.isIntersecting);
      });
    }, { rootMargin: '120px 0px', threshold: 0.12 });

    document.querySelectorAll('.js-attitude-fusion-preview').forEach(function(root) {
      var preview = new AttitudeFusionCardPreview(root);
      root.__afPreview = preview;
      previewInstances.push(preview);
      observer.observe(root);
    });
  }

  function initMemsSensorFusionLabDemos() {
    document.querySelectorAll('.js-attitude-fusion-open').forEach(function(button) {
      button.addEventListener('click', function() {
        var modal = document.getElementById(button.getAttribute('data-modal-id'));
        if (modal) openModal(modal);
      });
    });

    document.querySelectorAll('.js-attitude-fusion-close').forEach(function(el) {
      el.addEventListener('click', function() {
        var modal = el.closest('.js-attitude-fusion-modal');
        if (modal) closeModal(modal);
      });
    });

    document.addEventListener('keydown', function(event) {
      if (event.key !== 'Escape') return;
      var openModalEl = document.querySelector('.js-attitude-fusion-modal:not([hidden])');
      if (openModalEl) closeModal(openModalEl);
    });

    initAttitudeFusionPreviews();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMemsSensorFusionLabDemos);
  } else {
    initMemsSensorFusionLabDemos();
  }
})();
