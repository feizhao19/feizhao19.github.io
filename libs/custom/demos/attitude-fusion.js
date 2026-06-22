/* Legacy attitude-fusion demo kept for reference.
(function() {
  'use strict';

  var THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
  var DEG = Math.PI / 180;

  var activeInstances = {};
  var scriptPromises = {};

  function loadScript(src) {
    if (scriptPromises[src]) {
      return scriptPromises[src];
    }

    scriptPromises[src] = new Promise(function(resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }

      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = function() { resolve(); };
      script.onerror = function() { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(script);
    });

    return scriptPromises[src];
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
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  function formatHeading(value) {
    if (value == null || isNaN(value)) return 'N/A';
    var rounded = Math.round(wrap360(value));
    return (rounded < 10 ? '00' : rounded < 100 ? '0' : '') + rounded + '°';
  }

  function createAttitudeState() {
    return { roll: 0, pitch: 0, yaw: 270 };
  }

  function unwrapHeading(previous, heading) {
    if (previous == null || isNaN(previous)) return heading;
    return previous + shortestAngleDiff(previous, heading);
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
      tension: 0.12,
      spanGaps: false
    };
  }

  function AttitudeFusionDemo(modal) {
    this.modal = modal;
    this.canvas = modal.querySelector('.js-attitude-fusion-canvas');
    this.instrumentCanvas = modal.querySelector('.js-attitude-fusion-instruments');
    this.chartRpCanvas = modal.querySelector('.js-af-chart-rp');
    this.chartHdgCanvas = modal.querySelector('.js-af-chart-hdg');
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

    this.accNoise = 5;
    this.gyroDrift = 0.05;
    this.magNoise = 4;
    this.alpha = 0.98;
    this.accNoiseOn = true;
    this.gyroDriftOn = true;
    this.magNoiseOn = true;
    this.fusionEnabled = true;

    this.true = createAttitudeState();
    this.prevTrue = createAttitudeState();
    this.gyroEst = createAttitudeState();
    this.accEst = createAttitudeState();
    this.magEst = createAttitudeState();
    this.fusedEst = createAttitudeState();
    this.gyroBias = {
      roll: 0.6,
      pitch: -0.4,
      yaw: 1.0
    };

    this.userRollRate = 0;
    this.userPitchRate = 0;
    this.elapsed = 0;
    this.frameCount = 0;
    this.historySize = 180;

    this.labels = [];
    this.hist = {
      trueRoll: [], accRoll: [], gyroRoll: [], fusedRoll: [],
      truePitch: [], accPitch: [], gyroPitch: [], fusedPitch: [],
      trueHdg: [], gyroHdg: [], magHdg: [], fusedHdg: []
    };
    this.unwrapped = {
      trueHdg: 0, gyroHdg: 0, magHdg: 0, fusedHdg: 0
    };

    this.isDragging = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;
    this.rafId = null;
    this.running = false;
    this.initialized = false;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.aircraft = null;
    this.instrumentCtx = null;
    this.chartRp = null;
    this.chartHdg = null;

    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onResize = this.handleResize.bind(this);
    this.animate = this.animate.bind(this);

    this.bindControls();
    this.accNoiseOn = this.accNoiseOnInput.checked;
    this.gyroDriftOn = this.gyroDriftOnInput.checked;
    this.magNoiseOn = this.magNoiseOnInput.checked;
  }

  AttitudeFusionDemo.prototype.bindControls = function() {
    var self = this;

    this.accNoiseInput.addEventListener('input', function() {
      self.accNoise = parseFloat(self.accNoiseInput.value);
      self.accNoiseVal.textContent = self.accNoise.toFixed(1) + '°';
    });

    this.gyroDriftInput.addEventListener('input', function() {
      self.gyroDrift = parseFloat(self.gyroDriftInput.value);
      self.gyroDriftVal.textContent = self.gyroDrift.toFixed(3) + '°/s';
    });

    this.magNoiseInput.addEventListener('input', function() {
      self.magNoise = parseFloat(self.magNoiseInput.value);
      self.magNoiseVal.textContent = self.magNoise.toFixed(1) + '°';
    });

    this.accNoiseOnInput.addEventListener('change', function() {
      self.accNoiseOn = self.accNoiseOnInput.checked;
      self.updateNoiseControlUI();
    });

    this.gyroDriftOnInput.addEventListener('change', function() {
      self.gyroDriftOn = self.gyroDriftOnInput.checked;
      self.updateNoiseControlUI();
    });

    this.magNoiseOnInput.addEventListener('change', function() {
      self.magNoiseOn = self.magNoiseOnInput.checked;
      self.updateNoiseControlUI();
    });

    this.alphaInput.addEventListener('input', function() {
      self.alpha = parseFloat(self.alphaInput.value);
      self.alphaVal.textContent = self.alpha.toFixed(3);
    });

    this.resetBtn.addEventListener('click', function() {
      self.resetSimulation();
    });

    this.fusionToggleBtn.addEventListener('click', function() {
      self.setFusionEnabled(!self.fusionEnabled);
    });

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('resize', this.onResize);
  };

  AttitudeFusionDemo.prototype.getEffectiveNoise = function() {
    return {
      acc: this.accNoiseOn ? this.accNoise : 0,
      gyroDrift: this.gyroDriftOn ? this.gyroDrift : 0,
      mag: this.magNoiseOn ? this.magNoise : 0,
      gyroWhite: this.gyroDriftOn ? 0.08 : 0
    };
  };

  AttitudeFusionDemo.prototype.updateNoiseControlUI = function() {
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

    this.updateChartNoiseHighlight();
    this.updateDisplays();
  };

  AttitudeFusionDemo.prototype.updateChartNoiseHighlight = function() {
    if (!this.chartRp || !this.chartHdg) return;

    this.chartRp.data.datasets[1].hidden = !this.accNoiseOn;
    this.chartRp.data.datasets[2].hidden = !this.gyroDriftOn;
    this.chartRp.data.datasets[5].hidden = !this.accNoiseOn;
    this.chartRp.data.datasets[6].hidden = !this.gyroDriftOn;
    this.chartHdg.data.datasets[1].hidden = !this.gyroDriftOn;
    this.chartHdg.data.datasets[2].hidden = !this.magNoiseOn;

    this.chartRp.update('none');
    this.chartHdg.update('none');
  };

  AttitudeFusionDemo.prototype.getRawRollPitch = function() {
    if (this.accNoiseOn) {
      return { roll: this.accEst.roll, pitch: this.accEst.pitch, source: 'acc' };
    }
    if (this.gyroDriftOn) {
      return { roll: this.gyroEst.roll, pitch: this.gyroEst.pitch, source: 'gyro' };
    }
    return { roll: this.true.roll, pitch: this.true.pitch, source: 'ideal' };
  };

  AttitudeFusionDemo.prototype.getRawYaw = function() {
    if (this.magNoiseOn) {
      return { yaw: this.magEst.yaw, source: 'mag' };
    }
    if (this.gyroDriftOn) {
      return { yaw: this.gyroEst.yaw, source: 'gyro' };
    }
    return { yaw: this.true.yaw, source: 'ideal' };
  };

  AttitudeFusionDemo.prototype.getDisplayEstimate = function() {
    if (this.fusionEnabled) {
      return this.fusedEst;
    }

    var rp = this.getRawRollPitch();
    var yaw = this.getRawYaw();
    return {
      roll: rp.roll,
      pitch: rp.pitch,
      yaw: yaw.yaw,
      rpSource: rp.source,
      yawSource: yaw.source
    };
  };

  AttitudeFusionDemo.prototype.getAttInstrumentTitle = function() {
    if (this.fusionEnabled) return 'ATT · Fused Roll / Pitch';
    var source = this.getRawRollPitch().source;
    if (source === 'acc') return 'ATT · Raw Acc (noisy)';
    if (source === 'gyro') return 'ATT · Gyro only (drift)';
    return 'ATT · Ideal (no noise)';
  };

  AttitudeFusionDemo.prototype.getHdgInstrumentTitle = function() {
    if (this.fusionEnabled) return 'HDG · Fused Heading';
    var source = this.getRawYaw().source;
    if (source === 'mag') return 'HDG · Raw Mag (noisy)';
    if (source === 'gyro') return 'HDG · Gyro only (drift)';
    return 'HDG · Ideal (no noise)';
  };

  AttitudeFusionDemo.prototype.setFusionEnabled = function(enabled) {
    this.fusionEnabled = enabled;

    if (this.demoRoot) {
      this.demoRoot.classList.toggle('is-fusion-on', enabled);
      this.demoRoot.classList.toggle('is-fusion-off', !enabled);
    }

    if (this.fusionToggleBtn) {
      this.fusionToggleBtn.textContent = enabled ? 'Turn off fusion' : 'Turn on fusion';
      this.fusionToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      this.fusionToggleBtn.classList.toggle('button-primary', enabled);
      this.fusionToggleBtn.classList.toggle('button', !enabled);
    }

    if (this.fusionLabelEl) {
      this.fusionLabelEl.textContent = enabled ? 'Attitude fusion active' : 'Raw sensors — fusion off';
    }

    if (this.fusionDescEl) {
      this.fusionDescEl.textContent = enabled
        ? 'Complementary filter stabilizing roll, pitch, and heading'
        : 'Instruments show the active raw sensor path (Acc / Gyro / Mag) without fusion';
    }

    if (this.instrumentsCaptionEl) {
      this.instrumentsCaptionEl.textContent = enabled
        ? 'Fused output · ghost = ground truth'
        : 'Raw IMU on instruments · ghost = ground truth';
    }

    if (this.alphaWrap) {
      this.alphaWrap.style.opacity = enabled ? '1' : '0.4';
      this.alphaWrap.style.pointerEvents = enabled ? 'auto' : 'none';
    }

    this.updateChartStyles();
    this.updateChartNoiseHighlight();
    this.updateDisplays();
  };

  AttitudeFusionDemo.prototype.updateChartStyles = function() {
    if (!this.chartRp || !this.chartHdg) return;

    var on = this.fusionEnabled;
    var rp = this.chartRp.data.datasets;
    var hdg = this.chartHdg.data.datasets;

    rp[1].borderWidth = on ? 1.5 : 2.4;
    rp[2].borderWidth = on ? 1.5 : 2.2;
    rp[3].borderWidth = on ? 2.4 : 1;
    rp[3].borderDash = on ? [] : [4, 4];
    rp[5].borderWidth = on ? 1.5 : 2.4;
    rp[6].borderWidth = on ? 1.5 : 2.2;
    rp[7].borderWidth = on ? 2.2 : 1;
    rp[7].borderDash = on ? [4, 3] : [4, 4];

    hdg[1].borderWidth = on ? 1.5 : 2.2;
    hdg[2].borderWidth = on ? 1.5 : 2.4;
    hdg[3].borderWidth = on ? 2.4 : 1;
    hdg[3].borderDash = on ? [] : [4, 4];

    this.chartRp.update('none');
    this.chartHdg.update('none');
  };

  AttitudeFusionDemo.prototype.resetSimulation = function() {
    this.true = createAttitudeState();
    this.prevTrue = createAttitudeState();
    this.gyroEst = createAttitudeState();
    this.accEst = createAttitudeState();
    this.magEst = createAttitudeState();
    this.fusedEst = createAttitudeState();
    this.gyroBias = {
      roll: 0.6,
      pitch: -0.4,
      yaw: 1.0
    };
    this.userRollRate = 0;
    this.userPitchRate = 0;
    this.elapsed = 0;
    this.frameCount = 0;
    this.unwrapped = { trueHdg: 0, gyroHdg: 0, magHdg: 0, fusedHdg: 0 };

    this.labels = [];
    Object.keys(this.hist).forEach(function(key) {
      this.hist[key] = [];
    }, this);

    this.syncCharts();
    this.updateDisplays();
  };

  AttitudeFusionDemo.prototype.handlePointerDown = function(event) {
    this.isDragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add('is-dragging');
  };

  AttitudeFusionDemo.prototype.handlePointerMove = function(event) {
    if (!this.isDragging) return;

    var deltaX = event.clientX - this.lastPointerX;
    var deltaY = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.userRollRate += deltaX * 0.16;
    this.userPitchRate -= deltaY * 0.12;
  };

  AttitudeFusionDemo.prototype.handlePointerUp = function(event) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.canvas.classList.remove('is-dragging');

    if (this.canvas.hasPointerCapture && this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  AttitudeFusionDemo.prototype.createFixedWingModel = function() {
    var group = new THREE.Group();
    var bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8eef2, metalness: 0.18, roughness: 0.48 });
    var accentMat = new THREE.MeshStandardMaterial({ color: 0x2982ac, metalness: 0.22, roughness: 0.42 });
    var darkMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.25, roughness: 0.45 });
    var canopyMat = new THREE.MeshStandardMaterial({ color: 0x88b9d9, metalness: 0.35, roughness: 0.2, transparent: true, opacity: 0.82 });

    var fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.35, 18), bodyMat);
    fuselage.rotation.z = Math.PI / 2;
    group.add(fuselage);

    var nose = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 18), accentMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.82;
    group.add(nose);

    var canopy = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), canopyMat);
    canopy.rotation.z = -Math.PI / 2;
    canopy.position.set(0.18, 0.07, 0);
    group.add(canopy);

    var wing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.022, 1.62), accentMat);
    wing.position.set(-0.04, 0, 0);
    group.add(wing);

    var hTail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.56), darkMat);
    hTail.position.set(-0.6, 0.04, 0);
    group.add(hTail);

    var vTail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.035), accentMat);
    vTail.position.set(-0.6, 0.18, 0);
    group.add(vTail);

    group.position.y = 0.12;
    return group;
  };

  AttitudeFusionDemo.prototype.initThree = function() {
    var width = this.canvas.clientWidth;
    var height = this.canvas.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf4f7fa);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(2.4, 1.35, 2.8);
    this.camera.lookAt(0, 0.1, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    var key = new THREE.DirectionalLight(0xffffff, 0.88);
    key.position.set(5, 7, 4);
    this.scene.add(key);

    var grid = new THREE.GridHelper(6, 12, 0xbfc9d4, 0xdce3ea);
    grid.position.y = -0.55;
    this.scene.add(grid);

    this.aircraft = this.createFixedWingModel();
    this.scene.add(this.aircraft);
  };

  AttitudeFusionDemo.prototype.initInstruments = function() {
    this.instrumentCtx = this.instrumentCanvas.getContext('2d');
  };

  AttitudeFusionDemo.prototype.initCharts = function() {
    var legendLabels = { boxWidth: 8, font: { size: 9 } };

    this.chartRp = new Chart(this.chartRpCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: [
          lineDataset('Roll (truth)', this.hist.trueRoll, '#2ecc71', { width: 1.2 }),
          lineDataset('Roll Acc', this.hist.accRoll, '#e74c3c'),
          lineDataset('Roll Gyro', this.hist.gyroRoll, '#e67e22'),
          lineDataset('Roll Fused', this.hist.fusedRoll, '#2982ac', { width: 2.4 }),
          lineDataset('Pitch (truth)', this.hist.truePitch, 'rgba(46,204,113,0.55)', { dash: [4, 3], width: 1.2 }),
          lineDataset('Pitch Acc', this.hist.accPitch, 'rgba(231,76,60,0.55)', { dash: [4, 3] }),
          lineDataset('Pitch Gyro', this.hist.gyroPitch, 'rgba(230,126,34,0.55)', { dash: [4, 3] }),
          lineDataset('Pitch Fused', this.hist.fusedPitch, 'rgba(41,130,172,0.85)', { dash: [4, 3], width: 2.2 })
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: legendLabels },
          title: { display: true, text: 'Roll / Pitch — Acc + Gyro paths', font: { size: 10 } }
        },
        scales: {
          x: { display: false },
          y: {
            suggestedMin: -45,
            suggestedMax: 45,
            ticks: { stepSize: 15, font: { size: 8 } },
            grid: { color: 'rgba(0,0,0,0.06)' }
          }
        }
      }
    });

    this.chartHdg = new Chart(this.chartHdgCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: [
          lineDataset('Hdg (truth)', this.hist.trueHdg, '#2ecc71', { width: 1.2 }),
          lineDataset('Hdg Gyro', this.hist.gyroHdg, '#e67e22'),
          lineDataset('Hdg Mag', this.hist.magHdg, '#9b59b6'),
          lineDataset('Hdg Fused', this.hist.fusedHdg, '#2982ac', { width: 2.4 })
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { boxWidth: 8, font: { size: 9 } } },
          title: { display: true, text: 'Heading — Mag + Gyro paths (Acc has no yaw)', font: { size: 10 } }
        },
        scales: {
          x: { display: false },
          y: {
            ticks: { font: { size: 8 } },
            grid: { color: 'rgba(0,0,0,0.06)' },
            title: { display: true, text: 'deg (unwrapped)', font: { size: 8 } }
          }
        }
      }
    });
  };

  AttitudeFusionDemo.prototype.syncCharts = function() {
    var h = this.hist;
    if (!this.chartRp) return;

    this.chartRp.data.labels = this.labels;
    this.chartRp.data.datasets[0].data = h.trueRoll;
    this.chartRp.data.datasets[1].data = h.accRoll;
    this.chartRp.data.datasets[2].data = h.gyroRoll;
    this.chartRp.data.datasets[3].data = h.fusedRoll;
    this.chartRp.data.datasets[4].data = h.truePitch;
    this.chartRp.data.datasets[5].data = h.accPitch;
    this.chartRp.data.datasets[6].data = h.gyroPitch;
    this.chartRp.data.datasets[7].data = h.fusedPitch;
    this.chartRp.update('none');

    this.chartHdg.data.labels = this.labels;
    this.chartHdg.data.datasets[0].data = h.trueHdg;
    this.chartHdg.data.datasets[1].data = h.gyroHdg;
    this.chartHdg.data.datasets[2].data = h.magHdg;
    this.chartHdg.data.datasets[3].data = h.fusedHdg;
    this.chartHdg.update('none');
  };

  AttitudeFusionDemo.prototype.handleResize = function() {
    if (this.renderer && this.camera) {
      var width = this.canvas.clientWidth;
      var height = this.canvas.clientHeight;
      if (width && height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
      }
    }

    if (this.instrumentCanvas && this.instrumentCtx) {
      var iw = this.instrumentCanvas.clientWidth;
      var ih = this.instrumentCanvas.clientHeight;
      if (iw && ih) {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.instrumentCanvas.width = Math.round(iw * dpr);
        this.instrumentCanvas.height = Math.round(ih * dpr);
        this.instrumentCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    if (this.chartRp) this.chartRp.resize();
    if (this.chartHdg) this.chartHdg.resize();
  };

  AttitudeFusionDemo.prototype.updateAircraftRotation = function(attitude) {
    if (!this.aircraft) return;
    this.aircraft.rotation.order = 'ZXY';
    this.aircraft.rotation.x = attitude.roll * DEG;
    this.aircraft.rotation.z = -attitude.pitch * DEG;
    this.aircraft.rotation.y = -attitude.yaw * DEG;
  };

  AttitudeFusionDemo.prototype.updateReadout = function() {
    var display = this.getDisplayEstimate();
    this.rollValEl.textContent = display.roll.toFixed(1) + '°';
    this.pitchValEl.textContent = display.pitch.toFixed(1) + '°';
    this.hdgValEl.textContent = formatHeading(display.yaw);
  };

  AttitudeFusionDemo.prototype.drawInstrumentBezel = function(ctx, rect, title) {
    ctx.save();
    ctx.fillStyle = '#101820';
    ctx.strokeStyle = '#33404b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rect.x + 8, rect.y);
    ctx.lineTo(rect.x + rect.w - 8, rect.y);
    ctx.quadraticCurveTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + 8);
    ctx.lineTo(rect.x + rect.w, rect.y + rect.h - 8);
    ctx.quadraticCurveTo(rect.x + rect.w, rect.y + rect.h, rect.x + rect.w - 8, rect.y + rect.h);
    ctx.lineTo(rect.x + 8, rect.y + rect.h);
    ctx.quadraticCurveTo(rect.x, rect.y + rect.h, rect.x, rect.y + rect.h - 8);
    ctx.lineTo(rect.x, rect.y + 8);
    ctx.quadraticCurveTo(rect.x, rect.y, rect.x + 8, rect.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8fa0ad';
    ctx.font = '600 9px Raleway, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(title, rect.x + rect.w / 2, rect.y + 4);
    ctx.restore();
  };

  AttitudeFusionDemo.prototype.drawAttitudeBall = function(ctx, cx, cy, radius, roll, pitch, options) {
    options = options || {};
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-roll * DEG);
    var pitchOffset = -pitch * (radius / 35);
    ctx.fillStyle = options.sky || '#2982ac';
    ctx.fillRect(-radius * 2, -radius * 2 + pitchOffset, radius * 4, radius * 2);
    ctx.fillStyle = options.ground || '#7a5b24';
    ctx.fillRect(-radius * 2, pitchOffset, radius * 4, radius * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = options.dashed ? 1.5 : 2;
    if (options.dashed) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(-radius * 1.2, pitchOffset);
    ctx.lineTo(radius * 1.2, pitchOffset);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = options.stroke || '#d7dee5';
    ctx.lineWidth = options.dashed ? 1.5 : 2;
    if (options.dashed) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };

  AttitudeFusionDemo.prototype.drawAircraftSymbol = function(ctx, cx, cy) {
    ctx.save();
    ctx.strokeStyle = '#f7d046';
    ctx.fillStyle = '#f7d046';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy);
    ctx.lineTo(cx + 22, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy + 2);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy + 12);
    ctx.lineTo(cx - 7, cy + 17);
    ctx.lineTo(cx + 7, cy + 17);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  AttitudeFusionDemo.prototype.drawAttitudeIndicator = function(ctx, rect, display, truth) {
    var title = this.getAttInstrumentTitle();
    var rawStroke = display.rpSource === 'gyro' ? '#e67e22' : '#e74c3c';
    this.drawInstrumentBezel(ctx, rect, title);
    var cx = rect.x + rect.w / 2;
    var cy = rect.y + rect.h / 2 + 8;
    var radius = Math.min(rect.w, rect.h) * 0.36;

    this.drawAttitudeBall(ctx, cx, cy, radius, truth.roll, truth.pitch, {
      dashed: true,
      sky: 'rgba(41,130,172,0.35)',
      ground: 'rgba(122,91,36,0.35)',
      stroke: 'rgba(46,204,113,0.75)'
    });
    this.drawAttitudeBall(ctx, cx, cy, radius, display.roll, display.pitch, {
      sky: '#2982ac',
      ground: '#7a5b24',
      stroke: this.fusionEnabled ? '#d7dee5' : rawStroke
    });
    this.drawAircraftSymbol(ctx, cx, cy);

    ctx.fillStyle = '#dce6ef';
    ctx.font = '600 9px Raleway, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('P ' + display.pitch.toFixed(0) + '°', rect.x + rect.w - 8, rect.y + 18);
    ctx.fillText('R ' + display.roll.toFixed(0) + '°', rect.x + rect.w - 8, rect.y + 30);
  };

  AttitudeFusionDemo.prototype.drawHeadingIndicator = function(ctx, rect, display, truth) {
    var title = this.getHdgInstrumentTitle();
    this.drawInstrumentBezel(ctx, rect, title);
    var cx = rect.x + rect.w / 2;
    var cy = rect.y + rect.h / 2 + 8;
    var radius = Math.min(rect.w, rect.h) * 0.34;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#0d141b';
    ctx.fill();
    ctx.strokeStyle = '#44515c';
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-display.yaw * DEG);
    for (var deg = 0; deg < 360; deg += 30) {
      var angle = deg * DEG;
      ctx.strokeStyle = '#dce6ef';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.sin(angle) * (radius - 14), -Math.cos(angle) * (radius - 14));
      ctx.lineTo(Math.sin(angle) * (radius - 4), -Math.cos(angle) * (radius - 4));
      ctx.stroke();
      var label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : 'W';
      ctx.fillStyle = deg === 0 ? '#f7d046' : '#c8d4df';
      ctx.font = '9px Raleway, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, Math.sin(angle) * (radius - 22), -Math.cos(angle) * (radius - 22));
    }
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-truth.yaw * DEG);
    ctx.strokeStyle = 'rgba(46,204,113,0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, -radius + 8);
    ctx.lineTo(0, -radius + 18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.strokeStyle = '#f7d046';
    ctx.beginPath();
    ctx.moveTo(cx, rect.y + 18);
    ctx.lineTo(cx - 6, rect.y + 26);
    ctx.lineTo(cx + 6, rect.y + 26);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 14px Raleway, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatHeading(display.yaw).replace('°', ''), cx, cy + 1);
    ctx.restore();
  };

  AttitudeFusionDemo.prototype.drawInstruments = function() {
    var ctx = this.instrumentCtx;
    var width = this.instrumentCanvas.clientWidth;
    var height = this.instrumentCanvas.clientHeight;
    if (!ctx || !width || !height) return;

    var pad = 6;
    var gap = 6;
    var colW = (width - pad * 2 - gap) / 2;

    var display = this.getDisplayEstimate();

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0b1118';
    ctx.fillRect(0, 0, width, height);

    this.drawAttitudeIndicator(ctx, { x: pad, y: pad, w: colW, h: height - pad * 2 }, display, this.true);
    this.drawHeadingIndicator(ctx, { x: pad + colW + gap, y: pad, w: colW, h: height - pad * 2 }, display, this.true);
  };

  AttitudeFusionDemo.prototype.pushChartHistory = function() {
    if (this.frameCount === 0) {
      this.unwrapped.trueHdg = this.true.yaw;
      this.unwrapped.gyroHdg = this.gyroEst.yaw;
      this.unwrapped.magHdg = this.magEst.yaw;
      this.unwrapped.fusedHdg = this.fusedEst.yaw;
    } else {
      this.unwrapped.trueHdg = unwrapHeading(this.unwrapped.trueHdg, this.true.yaw);
      this.unwrapped.gyroHdg = unwrapHeading(this.unwrapped.gyroHdg, this.gyroEst.yaw);
      this.unwrapped.magHdg = unwrapHeading(this.unwrapped.magHdg, this.magEst.yaw);
      this.unwrapped.fusedHdg = unwrapHeading(this.unwrapped.fusedHdg, this.fusedEst.yaw);
    }

    this.labels.push('');
    this.hist.trueRoll.push(this.true.roll);
    this.hist.accRoll.push(this.accEst.roll);
    this.hist.gyroRoll.push(this.gyroEst.roll);
    this.hist.fusedRoll.push(this.fusedEst.roll);
    this.hist.truePitch.push(this.true.pitch);
    this.hist.accPitch.push(this.accEst.pitch);
    this.hist.gyroPitch.push(this.gyroEst.pitch);
    this.hist.fusedPitch.push(this.fusedEst.pitch);
    this.hist.trueHdg.push(this.unwrapped.trueHdg);
    this.hist.gyroHdg.push(this.unwrapped.gyroHdg);
    this.hist.magHdg.push(this.unwrapped.magHdg);
    this.hist.fusedHdg.push(this.unwrapped.fusedHdg);

    if (this.labels.length > this.historySize) {
      this.labels.shift();
      Object.keys(this.hist).forEach(function(key) {
        this.hist[key].shift();
      }, this);
    }

    this.syncCharts();
  };

  AttitudeFusionDemo.prototype.updateDisplays = function() {
    var display = this.getDisplayEstimate();
    this.updateReadout();
    this.updateAircraftRotation(display);
    this.drawInstruments();
  };

  AttitudeFusionDemo.prototype.fuseAxis = function(previous, gyroRate, accMeasurement, dt) {
    return this.alpha * (previous + gyroRate * dt) + (1 - this.alpha) * accMeasurement;
  };

  AttitudeFusionDemo.prototype.stepSimulation = function(dt) {
    this.elapsed += dt;

    var autoRoll = Math.sin(this.elapsed * 1.35) * 7;
    var autoPitch = Math.sin(this.elapsed * 0.95) * 4.5;
    var autoYaw = Math.sin(this.elapsed * 0.6) * 2.2;
    var noise = this.getEffectiveNoise();

    this.userRollRate *= 0.9;
    this.userPitchRate *= 0.9;

    this.prevTrue.roll = this.true.roll;
    this.prevTrue.pitch = this.true.pitch;
    this.prevTrue.yaw = this.true.yaw;

    this.true.roll = clamp(this.true.roll + (this.userRollRate + autoRoll) * dt, -55, 55);
    this.true.pitch = clamp(this.true.pitch + (this.userPitchRate + autoPitch) * dt, -35, 35);
    this.true.yaw = wrap360(this.true.yaw + autoYaw * dt);

    var trueRollRate = (this.true.roll - this.prevTrue.roll) / dt;
    var truePitchRate = (this.true.pitch - this.prevTrue.pitch) / dt;
    var trueYawRate = shortestAngleDiff(this.prevTrue.yaw, this.true.yaw) / dt;

    var gyroNoiseRoll = noise.gyroWhite * randn();
    var gyroNoisePitch = noise.gyroWhite * randn();
    var gyroNoiseYaw = noise.gyroWhite * randn();

    var measuredRollRate = trueRollRate + gyroNoiseRoll + noise.gyroDrift * this.gyroBias.roll;
    var measuredPitchRate = truePitchRate + gyroNoisePitch + noise.gyroDrift * this.gyroBias.pitch;
    var measuredYawRate = trueYawRate + gyroNoiseYaw + noise.gyroDrift * this.gyroBias.yaw;

    var accRoll = this.true.roll + randn() * noise.acc;
    var accPitch = this.true.pitch + randn() * noise.acc;
    var magHeading = wrap360(this.true.yaw + randn() * noise.mag);

    this.gyroEst.roll += measuredRollRate * dt;
    this.gyroEst.pitch += measuredPitchRate * dt;
    this.gyroEst.yaw = wrap360(this.gyroEst.yaw + measuredYawRate * dt);

    this.accEst.roll = accRoll;
    this.accEst.pitch = accPitch;
    this.magEst.yaw = magHeading;

    this.fusedEst.roll = this.fuseAxis(this.fusedEst.roll, measuredRollRate, accRoll, dt);
    this.fusedEst.pitch = this.fuseAxis(this.fusedEst.pitch, measuredPitchRate, accPitch, dt);
    this.fusedEst.yaw = lerpAngle(
      wrap360(this.fusedEst.yaw + measuredYawRate * dt),
      magHeading,
      1 - this.alpha
    );

    this.frameCount += 1;
    if (this.frameCount % 2 === 0) {
      this.pushChartHistory();
    }

    this.updateDisplays();
  };

  AttitudeFusionDemo.prototype.animate = function() {
    if (!this.running) return;
    this.stepSimulation(1 / 60);
    this.renderer.render(this.scene, this.camera);
    this.rafId = window.requestAnimationFrame(this.animate);
  };

  AttitudeFusionDemo.prototype.ensureInitialized = function() {
    if (this.initialized) {
      this.handleResize();
      return;
    }

    this.initThree();
    this.initInstruments();
    this.initCharts();
    this.setFusionEnabled(true);
    this.updateNoiseControlUI();
    this.initialized = true;
    this.handleResize();
    this.updateDisplays();
  };

  AttitudeFusionDemo.prototype.start = function() {
    if (this.running) return;
    this.ensureInitialized();
    this.running = true;
    this.animate();
  };

  AttitudeFusionDemo.prototype.stop = function() {
    this.running = false;
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  };

  AttitudeFusionDemo.prototype.destroy = function() {
    this.stop();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);

    if (this.chartRp) { this.chartRp.destroy(); this.chartRp = null; }
    if (this.chartHdg) { this.chartHdg.destroy(); this.chartHdg = null; }
    if (this.renderer) { this.renderer.dispose(); this.renderer = null; }

    this.scene = null;
    this.camera = null;
    this.aircraft = null;
    this.instrumentCtx = null;
  };

  function openModal(modal) {
    var modalId = modal.id;

    Promise.all([loadScript(THREE_CDN), loadScript(CHART_CDN)]).then(function() {
      document.body.classList.add('demo-modal-open');
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');

      if (!activeInstances[modalId]) {
        activeInstances[modalId] = new AttitudeFusionDemo(modal);
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

  function initAttitudeFusionDemos() {
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAttitudeFusionDemos);
  } else {
    initAttitudeFusionDemos();
  }
})();

*/

(function() {
  'use strict';

  var THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
  var DEG = Math.PI / 180;

  var activeInstances = {};
  var scriptPromises = {};

  function loadScript(src) {
    if (scriptPromises[src]) return scriptPromises[src];

    scriptPromises[src] = new Promise(function(resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }

      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = function() { resolve(); };
      script.onerror = function() { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(script);
    });

    return scriptPromises[src];
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

  function SensorFusionFlightDemo(modal) {
    this.modal = modal;
    this.canvas = modal.querySelector('.js-attitude-fusion-canvas');
    this.pipelineCanvas = modal.querySelector('.js-attitude-fusion-pipeline');
    this.flightPanelsCanvas = modal.querySelector('.js-attitude-fusion-flight-panels');
    this.chartRpCanvas = modal.querySelector('.js-af-chart-rp');
    this.chartHdgCanvas = modal.querySelector('.js-af-chart-hdg');
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

    this.accNoise = 5;
    this.gyroDrift = 0.05;
    this.magNoise = 4;
    this.alpha = 0.98;
    this.accNoiseOn = true;
    this.gyroDriftOn = true;
    this.magNoiseOn = true;
    this.fusionEnabled = true;

    this.true = createAttitudeState();
    this.prevTrue = createAttitudeState();
    this.gyroEst = createAttitudeState();
    this.accEst = createAttitudeState();
    this.magEst = createAttitudeState();
    this.fusedEst = createAttitudeState();
    this.gyroBias = { roll: 0.6, pitch: -0.4, yaw: 1.0 };

    this.elapsed = 0;
    this.frameCount = 0;
    this.userRollRate = 0;
    this.userPitchRate = 0;
    this.isDragging = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;
    this.running = false;
    this.initialized = false;
    this.rafId = null;

    this.flight = {
      rollStabGain: 1.15,
      pitchStabGain: 0.95,
      yawStabGain: 0.55,
      gustRoll: 0,
      gustPitch: 0,
      gustYaw: 0
    };

    this.pathHistorySize = 180;
    this.truePath = [];
    this.estPath = [];
    this.ctrlHistory = [];

    this.historySize = 180;
    this.labels = [];
    this.hist = {
      trueRoll: [], estRoll: [], accRoll: [], gyroRoll: [],
      truePitch: [], estPitch: [], accPitch: [], gyroPitch: [],
      trueYaw: [], estYaw: [], magYaw: [], gyroYaw: []
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.trueAircraft = null;
    this.estimatedAircraft = null;
    this.windArrows = [];
    this.pipelineCtx = null;
    this.flightPanelsCtx = null;
    this.chartRp = null;
    this.chartHdg = null;

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

  SensorFusionFlightDemo.prototype.bindControls = function() {
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

  SensorFusionFlightDemo.prototype.getEffectiveNoise = function() {
    return {
      acc: this.accNoiseOn ? this.accNoise : 0,
      gyroDrift: this.gyroDriftOn ? this.gyroDrift : 0,
      gyroWhite: this.gyroDriftOn ? 0.08 : 0,
      mag: this.magNoiseOn ? this.magNoise : 0
    };
  };

  SensorFusionFlightDemo.prototype.updateNoiseControlUI = function() {
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

  SensorFusionFlightDemo.prototype.setFusionEnabled = function(enabled) {
    this.fusionEnabled = enabled;

    if (this.demoRoot) {
      this.demoRoot.classList.toggle('is-fusion-on', enabled);
      this.demoRoot.classList.toggle('is-fusion-off', !enabled);
    }

    if (this.fusionToggleBtn) {
      this.fusionToggleBtn.textContent = enabled ? 'Turn off fusion' : 'Turn on fusion';
      this.fusionToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      this.fusionToggleBtn.classList.toggle('button-primary', enabled);
      this.fusionToggleBtn.classList.toggle('button', !enabled);
    }

    if (this.fusionLabelEl) {
      this.fusionLabelEl.textContent = enabled ? 'ESKF-style attitude estimation active' : 'Raw sensor estimate — fusion off';
    }

    if (this.fusionDescEl) {
      this.fusionDescEl.textContent = enabled
        ? 'Gyro propagation corrected by accelerometer, magnetometer, and barometer observations.'
        : 'The orange aircraft follows raw gyro / acc / mag estimates, so drift and noise become visible.';
    }

    if (this.instrumentsCaptionEl) {
      this.instrumentsCaptionEl.textContent = enabled
        ? 'Gray = wind gust · Green = true attitude · Orange = estimated attitude'
        : 'Raw attitude estimate makes stabilizer demand visibly noisy';
    }

    if (this.alphaWrap) {
      this.alphaWrap.style.opacity = enabled ? '1' : '0.45';
      this.alphaWrap.style.pointerEvents = enabled ? 'auto' : 'none';
    }

    this.updateDisplays();
  };

  SensorFusionFlightDemo.prototype.createFixedWingModel = function(color, opacity) {
    var group = new THREE.Group();
    var transparent = opacity < 1;
    var bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8eef2, metalness: 0.18, roughness: 0.48, transparent: transparent, opacity: opacity });
    var wingMat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.22, roughness: 0.42, transparent: transparent, opacity: opacity });
    var darkMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.25, roughness: 0.45, transparent: transparent, opacity: opacity });

    var fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.35, 18), bodyMat);
    fuselage.rotation.z = Math.PI / 2;
    group.add(fuselage);

    var nose = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 18), wingMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.82;
    group.add(nose);

    var wing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.022, 1.62), wingMat);
    wing.position.set(-0.04, 0, 0);
    group.add(wing);

    var hTail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.56), darkMat);
    hTail.position.set(-0.6, 0.04, 0);
    group.add(hTail);

    var vTail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.035), wingMat);
    vTail.position.set(-0.6, 0.18, 0);
    group.add(vTail);

    group.position.y = 0.12;
    return group;
  };

  SensorFusionFlightDemo.prototype.initThree = function() {
    var width = this.canvas.clientWidth;
    var height = this.canvas.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf4f7fa);

    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    this.camera.position.set(2.35, 1.05, 2.95);
    this.camera.lookAt(0, 0.02, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    var key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(5, 7, 4);
    this.scene.add(key);

    var grid = new THREE.GridHelper(7, 14, 0xbfc9d4, 0xdce3ea);
    grid.position.y = -0.55;
    this.scene.add(grid);

    this.trueAircraft = this.createFixedWingModel(0x2ecc71, 1.0);
    this.estimatedAircraft = this.createFixedWingModel(0xf39c12, 0.45);
    this.estimatedAircraft.position.x = 0.28;

    this.scene.add(this.trueAircraft);
    this.scene.add(this.estimatedAircraft);

    for (var i = 0; i < 5; i += 1) {
      var arrow = new THREE.ArrowHelper(
        new THREE.Vector3(-1, 0, 0.25).normalize(),
        new THREE.Vector3(1.8 - i * 0.85, -0.28, -1.5),
        0.42,
        0x2982ac,
        0.12,
        0.06
      );
      this.windArrows.push(arrow);
      this.scene.add(arrow);
    }
  };

  SensorFusionFlightDemo.prototype.initInstruments = function() {
    if (this.pipelineCanvas) {
      this.pipelineCtx = this.pipelineCanvas.getContext('2d');
    }
    if (this.flightPanelsCanvas) {
      this.flightPanelsCtx = this.flightPanelsCanvas.getContext('2d');
    }
  };

  SensorFusionFlightDemo.prototype.resizeCanvas2d = function(canvas, ctx) {
    if (!canvas || !ctx) return;
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (!width || !height) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  SensorFusionFlightDemo.prototype.initCharts = function() {
    this.chartRp = new Chart(this.chartRpCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: [
          lineDataset('Roll truth', this.hist.trueRoll, '#2ecc71', { width: 1.2 }),
          lineDataset('Roll estimate', this.hist.estRoll, '#f39c12', { width: 2.2 }),
          lineDataset('Roll acc', this.hist.accRoll, '#e74c3c', { dash: [4, 3] }),
          lineDataset('Roll gyro', this.hist.gyroRoll, '#8e44ad', { dash: [4, 3] }),
          lineDataset('Pitch truth', this.hist.truePitch, 'rgba(46,204,113,0.55)', { dash: [5, 4], width: 1.2 }),
          lineDataset('Pitch estimate', this.hist.estPitch, 'rgba(243,156,18,0.8)', { dash: [5, 4], width: 2.0 }),
          lineDataset('Pitch acc', this.hist.accPitch, 'rgba(231,76,60,0.55)', { dash: [2, 3] }),
          lineDataset('Pitch gyro', this.hist.gyroPitch, 'rgba(142,68,173,0.55)', { dash: [2, 3] })
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { labels: { boxWidth: 8, font: { size: 9 } } },
          title: { display: true, text: 'Roll / Pitch: truth vs sensor-derived estimate', font: { size: 10 } }
        },
        scales: {
          x: { display: false },
          y: { suggestedMin: -45, suggestedMax: 45, ticks: { font: { size: 8 } }, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });

    this.chartHdg = new Chart(this.chartHdgCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: [
          lineDataset('Yaw truth', this.hist.trueYaw, '#2ecc71', { width: 1.2 }),
          lineDataset('Yaw estimate', this.hist.estYaw, '#f39c12', { width: 2.3 }),
          lineDataset('Yaw mag', this.hist.magYaw, '#9b59b6', { dash: [4, 3] }),
          lineDataset('Yaw gyro', this.hist.gyroYaw, '#e67e22', { dash: [4, 3] })
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { labels: { boxWidth: 8, font: { size: 9 } } },
          title: { display: true, text: 'Heading: gyro drift corrected by magnetometer', font: { size: 10 } }
        },
        scales: {
          x: { display: false },
          y: { ticks: { font: { size: 8 } }, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
  };

  SensorFusionFlightDemo.prototype.handleResize = function() {
    if (this.renderer && this.camera) {
      var width = this.canvas.clientWidth;
      var height = this.canvas.clientHeight;
      if (width && height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
      }
    }

    this.resizeCanvas2d(this.pipelineCanvas, this.pipelineCtx);
    this.resizeCanvas2d(this.flightPanelsCanvas, this.flightPanelsCtx);

    if (this.chartRp) this.chartRp.resize();
    if (this.chartHdg) this.chartHdg.resize();
  };

  SensorFusionFlightDemo.prototype.handlePointerDown = function(event) {
    this.isDragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add('is-dragging');
  };

  SensorFusionFlightDemo.prototype.handlePointerMove = function(event) {
    if (!this.isDragging) return;
    var dx = event.clientX - this.lastPointerX;
    var dy = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.userRollRate += dx * 0.16;
    this.userPitchRate -= dy * 0.12;
  };

  SensorFusionFlightDemo.prototype.handlePointerUp = function(event) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.canvas.classList.remove('is-dragging');
    if (this.canvas.hasPointerCapture && this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  SensorFusionFlightDemo.prototype.getDisplayEstimate = function() {
    if (this.fusionEnabled) return this.fusedEst;
    return {
      roll: this.accNoiseOn ? this.accEst.roll : this.gyroEst.roll,
      pitch: this.accNoiseOn ? this.accEst.pitch : this.gyroEst.pitch,
      yaw: this.magNoiseOn ? this.magEst.yaw : this.gyroEst.yaw
    };
  };

  SensorFusionFlightDemo.prototype.updateAircraftRotation = function(display) {
    if (this.trueAircraft) {
      this.trueAircraft.rotation.order = 'ZXY';
      this.trueAircraft.rotation.x = this.true.roll * DEG;
      this.trueAircraft.rotation.z = -this.true.pitch * DEG;
      this.trueAircraft.rotation.y = -this.true.yaw * DEG;
    }

    if (this.estimatedAircraft) {
      this.estimatedAircraft.rotation.order = 'ZXY';
      this.estimatedAircraft.rotation.x = display.roll * DEG;
      this.estimatedAircraft.rotation.z = -display.pitch * DEG;
      this.estimatedAircraft.rotation.y = -display.yaw * DEG;
    }
  };

  SensorFusionFlightDemo.prototype.drawCard = function(ctx, x, y, w, h, title) {
    ctx.fillStyle = 'rgba(16,24,32,0.92)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dce6ef';
    ctx.font = '700 10px Raleway, sans-serif';
    ctx.fillText(title, x + 10, y + 16);
  };

  SensorFusionFlightDemo.prototype.drawBar = function(ctx, x, y, w, label, value, maxValue, color) {
    var pct = clamp(Math.abs(value) / maxValue, 0, 1);
    ctx.fillStyle = '#8fa0ad';
    ctx.font = '9px Raleway, sans-serif';
    ctx.fillText(label, x, y - 3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * pct, 8);
  };

  SensorFusionFlightDemo.prototype.drawPipeline = function(ctx, x, y, w, h) {
    this.drawCard(ctx, x, y, w, h, 'ESKF-Style State Estimation');

    var noise = this.getEffectiveNoise();
    var nodes = [
      { label: 'GYRO', sub: 'prop', value: noise.gyroDrift * 100, color: '#e67e22' },
      { label: 'ACC', sub: 'grav', value: noise.acc, color: '#e74c3c' },
      { label: 'MAG', sub: 'hdg', value: noise.mag, color: '#9b59b6' },
      { label: 'BARO', sub: 'alt', value: 0.65, color: '#16a085' },
      { label: 'ESKF', sub: this.fusionEnabled ? 'corr' : 'bypass', value: this.fusionEnabled ? 1 : 0.25, color: '#2982ac' },
      { label: 'CTRL', sub: 'stab', value: this.ctrlHistory.length ? Math.abs(this.ctrlHistory[this.ctrlHistory.length - 1]) : 0, color: '#2ecc71' }
    ];

    var startX = x + 12;
    var nodeGap = 8;
    var nodeW = (w - 24 - (nodes.length - 1) * nodeGap) / nodes.length;
    var nodeH = Math.min(42, Math.max(30, h - 40));
    var nodeY = y + Math.max(24, (h - nodeH) * 0.42);
    var pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 5);

    nodes.forEach(function(node, i) {
      var nx = startX + i * (nodeW + nodeGap);
      ctx.fillStyle = node.color;
      ctx.globalAlpha = 0.55 + 0.35 * pulse;
      ctx.beginPath();
      ctx.roundRect(nx, nodeY, nodeW, nodeH, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 10px Raleway, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, nx + nodeW / 2, nodeY + nodeH * 0.38);
      ctx.font = '8px Raleway, sans-serif';
      ctx.fillText(node.sub, nx + nodeW / 2, nodeY + nodeH * 0.72);

      if (i < nodes.length - 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(nx + nodeW + 2, nodeY + nodeH * 0.5);
        ctx.lineTo(nx + nodeW + 8, nodeY + nodeH * 0.5);
        ctx.stroke();
      }
    });

    ctx.textAlign = 'left';
  };

  SensorFusionFlightDemo.prototype.drawPathMap = function(ctx, x, y, w, h) {
    this.drawCard(ctx, x, y, w, h, 'Wind Gust Response');

    var pad = 12;
    var mapX = x + pad;
    var mapY = y + 30;
    var mapW = w - pad * 2;
    var mapH = h - 44;
    var centerY = mapY + mapH * 0.55;

    ctx.save();

    // Map background
    ctx.fillStyle = 'rgba(3,10,18,0.95)';
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mapX, mapY, mapW, mapH, 7);
    ctx.fill();
    ctx.stroke();

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (var gx = 1; gx < 4; gx += 1) {
      ctx.beginPath();
      ctx.moveTo(mapX + mapW * gx / 4, mapY + 4);
      ctx.lineTo(mapX + mapW * gx / 4, mapY + mapH - 4);
      ctx.stroke();
    }
    for (var gy = 1; gy < 3; gy += 1) {
      ctx.beginPath();
      ctx.moveTo(mapX + 4, mapY + mapH * gy / 3);
      ctx.lineTo(mapX + mapW - 4, mapY + mapH * gy / 3);
      ctx.stroke();
    }

    // Zero attitude reference.
    ctx.strokeStyle = 'rgba(220,226,232,0.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(mapX + 8, centerY);
    ctx.lineTo(mapX + mapW - 8, centerY);
    ctx.stroke();
    ctx.setLineDash([]);

    var paths = [
      { key: 'wind', data: this.truePath, color: 'rgba(220,226,232,0.86)', width: 1.7, dash: [4, 4] },
      { key: 'truth', data: this.truePath, color: 'rgba(46,204,113,0.96)', width: 2.1 },
      { key: 'estimate', data: this.truePath, color: 'rgba(243,156,18,0.98)', width: 2.4 }
    ];
    var maxAbs = 8;

    paths.forEach(function(path) {
      if (!path.data.length) return;
      path.data.forEach(function(point) {
        maxAbs = Math.max(maxAbs, Math.abs(point[path.key] || 0));
      });
    });

    var scale = (mapH * 0.42) / maxAbs;

    paths.forEach(function(path) {
      if (path.data.length < 2) return;
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width;
      ctx.setLineDash(path.dash || []);
      ctx.beginPath();

      path.data.forEach(function(point, index) {
        var t = index / Math.max(1, path.data.length - 1);
        var px = mapX + 8 + t * (mapW - 16);
        var py = centerY - clamp((point[path.key] || 0) * scale, -mapH * 0.44, mapH * 0.44);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });

      ctx.stroke();
      ctx.setLineDash([]);
    });

    if (this.truePath.length) {
      var last = this.truePath[this.truePath.length - 1];
      var markerX = mapX + mapW - 8;
      var markerY = centerY - clamp((last.estimate || 0) * scale, -mapH * 0.44, mapH * 0.44);

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(markerX, markerY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = '8px Raleway, sans-serif';
      ctx.fillText('now', markerX - 16, markerY - 6);
    }

    // Wind arrow
    var arrowX = mapX + mapW - 32;
    var arrowY = mapY + 14;
    ctx.strokeStyle = 'rgba(41,130,172,0.95)';
    ctx.fillStyle = 'rgba(41,130,172,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(arrowX - 18, arrowY);
    ctx.lineTo(arrowX, arrowY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX - 6, arrowY - 4);
    ctx.lineTo(arrowX - 6, arrowY + 4);
    ctx.closePath();
    ctx.fill();
    ctx.font = '8px Raleway, sans-serif';
    ctx.fillText('gust', arrowX - 24, arrowY + 13);

    // Legend
    var legendY = y + h - 10;
    ctx.font = '9px Raleway, sans-serif';

    ctx.strokeStyle = 'rgba(220,226,232,0.86)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x + 10, legendY - 3);
    ctx.lineTo(x + 26, legendY - 3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(225,232,238,0.9)';
    ctx.fillText('gust', x + 30, legendY);

    ctx.strokeStyle = 'rgba(46,204,113,0.96)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 74, legendY - 3);
    ctx.lineTo(x + 90, legendY - 3);
    ctx.stroke();
    ctx.fillStyle = 'rgba(220,245,235,0.9)';
    ctx.fillText('true', x + 94, legendY);

    ctx.strokeStyle = 'rgba(243,156,18,0.98)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 138, legendY - 3);
    ctx.lineTo(x + 154, legendY - 3);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,230,190,0.9)';
    ctx.fillText('estimate', x + 158, legendY);

    ctx.restore();
  };

  SensorFusionFlightDemo.prototype.drawControllerPanel = function(ctx, x, y, w, h) {
    this.drawCard(ctx, x, y, w, h, 'Stabilizer Output');
    var display = this.getDisplayEstimate();
    var rollDemand = -display.roll * this.flight.rollStabGain;
    var pitchDemand = -display.pitch * this.flight.pitchStabGain;
    var yawDemand = -shortestAngleDiff(270, display.yaw) * this.flight.yawStabGain;
    var barTop = y + 30;
    var barGap = Math.max(18, (h - 44) / 3);

    this.drawBar(ctx, x + 12, barTop, w - 24, 'Aileron stab', rollDemand, 25, '#2ecc71');
    this.drawBar(ctx, x + 12, barTop + barGap, w - 24, 'Elevator stab', pitchDemand, 20, '#2982ac');
    this.drawBar(ctx, x + 12, barTop + barGap * 2, w - 24, 'Rudder / yaw stab', yawDemand, 30, '#f39c12');
  };

  SensorFusionFlightDemo.prototype.drawPipelinePanel = function() {
    var ctx = this.pipelineCtx;
    var width = this.pipelineCanvas ? this.pipelineCanvas.clientWidth : 0;
    var height = this.pipelineCanvas ? this.pipelineCanvas.clientHeight : 0;
    if (!ctx || !width || !height) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0b1118';
    ctx.fillRect(0, 0, width, height);
    this.drawPipeline(ctx, 8, 8, width - 16, height - 16);
  };

  SensorFusionFlightDemo.prototype.drawFlightPanels = function() {
    var ctx = this.flightPanelsCtx;
    var width = this.flightPanelsCanvas ? this.flightPanelsCanvas.clientWidth : 0;
    var height = this.flightPanelsCanvas ? this.flightPanelsCanvas.clientHeight : 0;
    if (!ctx || !width || !height) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0b1118';
    ctx.fillRect(0, 0, width, height);

    var gap = 10;
    var leftW = Math.round((width - 16 - gap) * 0.48);
    var rightW = width - 16 - gap - leftW;
    var panelH = height - 16;

    this.drawControllerPanel(ctx, 8, 8, leftW, panelH);
    this.drawPathMap(ctx, 8 + leftW + gap, 8, rightW, panelH);
  };

  SensorFusionFlightDemo.prototype.drawInstruments = function() {
    this.drawPipelinePanel();
    this.drawFlightPanels();
  };

  SensorFusionFlightDemo.prototype.fuseAxis = function(previous, gyroRate, accMeasurement, dt) {
    return this.alpha * (previous + gyroRate * dt) + (1 - this.alpha) * accMeasurement;
  };

  SensorFusionFlightDemo.prototype.updateCharts = function() {
    if (!this.chartRp || !this.chartHdg) return;

    var h = this.hist;
    this.chartRp.data.labels = this.labels;
    this.chartRp.data.datasets[0].data = h.trueRoll;
    this.chartRp.data.datasets[1].data = h.estRoll;
    this.chartRp.data.datasets[2].data = h.accRoll;
    this.chartRp.data.datasets[3].data = h.gyroRoll;
    this.chartRp.data.datasets[4].data = h.truePitch;
    this.chartRp.data.datasets[5].data = h.estPitch;
    this.chartRp.data.datasets[6].data = h.accPitch;
    this.chartRp.data.datasets[7].data = h.gyroPitch;
    this.chartRp.update('none');

    this.chartHdg.data.labels = this.labels;
    this.chartHdg.data.datasets[0].data = h.trueYaw;
    this.chartHdg.data.datasets[1].data = h.estYaw;
    this.chartHdg.data.datasets[2].data = h.magYaw;
    this.chartHdg.data.datasets[3].data = h.gyroYaw;
    this.chartHdg.update('none');
  };

  SensorFusionFlightDemo.prototype.pushHistory = function(display, controllerDemand) {
    this.labels.push('');
    this.hist.trueRoll.push(this.true.roll);
    this.hist.estRoll.push(display.roll);
    this.hist.accRoll.push(this.accEst.roll);
    this.hist.gyroRoll.push(this.gyroEst.roll);
    this.hist.truePitch.push(this.true.pitch);
    this.hist.estPitch.push(display.pitch);
    this.hist.accPitch.push(this.accEst.pitch);
    this.hist.gyroPitch.push(this.gyroEst.pitch);
    this.hist.trueYaw.push(this.true.yaw);
    this.hist.estYaw.push(display.yaw);
    this.hist.magYaw.push(this.magEst.yaw);
    this.hist.gyroYaw.push(this.gyroEst.yaw);
    this.ctrlHistory.push(controllerDemand);

    if (this.labels.length > this.historySize) {
      this.labels.shift();
      Object.keys(this.hist).forEach(function(key) { this.hist[key].shift(); }, this);
      this.ctrlHistory.shift();
    }

    this.updateCharts();
  };

  SensorFusionFlightDemo.prototype.stepSimulation = function(dt) {
    this.elapsed += dt;

    var noise = this.getEffectiveNoise();
    var gustPulse = Math.sin(this.elapsed * 0.72) + 0.45 * Math.sin(this.elapsed * 1.9 + 0.8);
    var gustRoll = gustPulse * 8.5;
    var gustPitch = Math.sin(this.elapsed * 0.58 + 1.4) * 4.8;
    var gustYaw = Math.sin(this.elapsed * 0.42 + 0.5) * 2.4;

    this.userRollRate *= 0.9;
    this.userPitchRate *= 0.9;

    this.prevTrue.roll = this.true.roll;
    this.prevTrue.pitch = this.true.pitch;
    this.prevTrue.yaw = this.true.yaw;

    var displayBefore = this.getDisplayEstimate();
    var rollDemand = clamp(-displayBefore.roll * this.flight.rollStabGain, -22, 22);
    var pitchDemand = clamp(-displayBefore.pitch * this.flight.pitchStabGain, -18, 18);
    var yawDemand = clamp(-shortestAngleDiff(270, displayBefore.yaw) * this.flight.yawStabGain, -18, 18);
    var controllerDemand = Math.max(Math.abs(rollDemand), Math.abs(pitchDemand), Math.abs(yawDemand));
    var appliedRollCorrection = this.fusionEnabled ? rollDemand : 0;
    var appliedPitchCorrection = this.fusionEnabled ? pitchDemand : 0;
    var appliedYawCorrection = this.fusionEnabled ? yawDemand : 0;

    this.flight.gustRoll = gustRoll;
    this.flight.gustPitch = gustPitch;
    this.flight.gustYaw = gustYaw;

    this.true.roll = clamp(this.true.roll + (this.userRollRate + gustRoll + appliedRollCorrection - this.true.roll * 0.28) * dt, -55, 55);
    this.true.pitch = clamp(this.true.pitch + (this.userPitchRate + gustPitch + appliedPitchCorrection - this.true.pitch * 0.24) * dt, -35, 35);
    this.true.yaw = wrap360(this.true.yaw + (gustYaw + appliedYawCorrection) * dt);

    var trueRollRate = (this.true.roll - this.prevTrue.roll) / dt;
    var truePitchRate = (this.true.pitch - this.prevTrue.pitch) / dt;
    var trueYawRate = shortestAngleDiff(this.prevTrue.yaw, this.true.yaw) / dt;

    var measuredRollRate = trueRollRate + noise.gyroWhite * randn() + noise.gyroDrift * this.gyroBias.roll;
    var measuredPitchRate = truePitchRate + noise.gyroWhite * randn() + noise.gyroDrift * this.gyroBias.pitch;
    var measuredYawRate = trueYawRate + noise.gyroWhite * randn() + noise.gyroDrift * this.gyroBias.yaw;

    var accRoll = this.true.roll + randn() * noise.acc;
    var accPitch = this.true.pitch + randn() * noise.acc;
    var magHeading = wrap360(this.true.yaw + randn() * noise.mag);

    this.gyroEst.roll += measuredRollRate * dt;
    this.gyroEst.pitch += measuredPitchRate * dt;
    this.gyroEst.yaw = wrap360(this.gyroEst.yaw + measuredYawRate * dt);

    this.accEst.roll = accRoll;
    this.accEst.pitch = accPitch;
    this.magEst.yaw = magHeading;

    this.fusedEst.roll = this.fuseAxis(this.fusedEst.roll, measuredRollRate, accRoll, dt);
    this.fusedEst.pitch = this.fuseAxis(this.fusedEst.pitch, measuredPitchRate, accPitch, dt);
    this.fusedEst.yaw = lerpAngle(
      wrap360(this.fusedEst.yaw + measuredYawRate * dt),
      magHeading,
      1 - this.alpha
    );

    var display = this.getDisplayEstimate();

    this.truePath.push({
      wind: gustRoll,
      truth: this.true.roll,
      estimate: display.roll
    });
    this.estPath.push({ estimate: display.roll });

    if (this.truePath.length > this.pathHistorySize) this.truePath.shift();
    if (this.estPath.length > this.pathHistorySize) this.estPath.shift();

    if (this.frameCount % 2 === 0) {
      this.pushHistory(display, controllerDemand);
    }

    this.frameCount += 1;
    this.updateDisplays();
  };

  SensorFusionFlightDemo.prototype.updateDisplays = function() {
    var display = this.getDisplayEstimate();

    if (this.rollValEl) this.rollValEl.textContent = display.roll.toFixed(1) + '°';
    if (this.pitchValEl) this.pitchValEl.textContent = display.pitch.toFixed(1) + '°';
    if (this.hdgValEl) this.hdgValEl.textContent = formatHeading(display.yaw);

    this.updateAircraftRotation(display);
    this.drawInstruments();
  };

  SensorFusionFlightDemo.prototype.resetSimulation = function() {
    this.true = createAttitudeState();
    this.prevTrue = createAttitudeState();
    this.gyroEst = createAttitudeState();
    this.accEst = createAttitudeState();
    this.magEst = createAttitudeState();
    this.fusedEst = createAttitudeState();
    this.elapsed = 0;
    this.frameCount = 0;
    this.userRollRate = 0;
    this.userPitchRate = 0;
    this.flight.gustRoll = 0;
    this.flight.gustPitch = 0;
    this.flight.gustYaw = 0;
    this.truePath = [];
    this.estPath = [];
    this.ctrlHistory = [];
    this.labels = [];
    Object.keys(this.hist).forEach(function(key) { this.hist[key] = []; }, this);
    this.updateCharts();
    this.updateDisplays();
  };

  SensorFusionFlightDemo.prototype.animate = function() {
    if (!this.running) return;
    this.stepSimulation(1 / 60);
    this.renderer.render(this.scene, this.camera);
    this.rafId = window.requestAnimationFrame(this.animate);
  };

  SensorFusionFlightDemo.prototype.ensureInitialized = function() {
    if (this.initialized) {
      this.handleResize();
      return;
    }

    this.initThree();
    this.initInstruments();
    this.initCharts();
    this.setFusionEnabled(true);
    this.updateNoiseControlUI();
    this.initialized = true;
    this.handleResize();
    this.updateDisplays();
  };

  SensorFusionFlightDemo.prototype.start = function() {
    if (this.running) return;
    this.ensureInitialized();
    this.running = true;
    this.animate();
  };

  SensorFusionFlightDemo.prototype.stop = function() {
    this.running = false;
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  };

  SensorFusionFlightDemo.prototype.destroy = function() {
    this.stop();
    if (this.canvas) this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
    if (this.chartRp) this.chartRp.destroy();
    if (this.chartHdg) this.chartHdg.destroy();
    if (this.renderer) this.renderer.dispose();
  };

  function openModal(modal) {
    var modalId = modal.id;

    Promise.all([loadScript(THREE_CDN), loadScript(CHART_CDN)]).then(function() {
      document.body.classList.add('demo-modal-open');
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');

      if (!activeInstances[modalId]) {
        activeInstances[modalId] = new SensorFusionFlightDemo(modal);
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

  function initSensorFusionFlightDemos() {
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSensorFusionFlightDemos);
  } else {
    initSensorFusionFlightDemos();
  }
})();
