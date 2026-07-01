(function () {
  'use strict';

  /*
   * Left:  Input → Vision-Language Model → Final Output
   * Right: Candidates (Beam Search, K=5) → Reward Model → (green ←) scores → VLM
   *        (×3 iterations, then main line continues)
   */
  var BRANCH_STEPS = ['beam-candidates', 'reward-model', 'vlm-update'];
  var WIRE_DURING = {
    'beam-candidates': 'vlm-beam',
    'reward-model':    'cand-rm',
    'vlm-update':      'scores-vlm'
  };
  var WIRE_AFTER = {
    'beam-candidates': 'cand-rm',
    'reward-model':    'rm-cand',
    'vlm-update':      ''
  };
  var TOTAL_ITERS = 3;
  var PULSE_FADE_MS = 480;
  var INPUT_PULSE_HOLD_MS = 1200;
  var SCORES_AFTER_RM_MS = 520;
  var VLM_NEURO_UPDATE_DELAY_MS = 320;
  var AUTO_RESTART_DELAY_MS = 4000;
  var FINAL_CAPTION_PREFIX = 'Final: ';
  var ORIGINAL_CAPTION_PREFIX = 'Original: ';

  function getSiteBaseUrl() {
    var el = document.querySelector('script[src*="vlm-hallucination.js"]');
    if (!el) return '';
    var m = el.src.match(/^(.*)\/libs\/custom\/demos\/vlm-hallucination\.js/);
    return m ? m[1] : '';
  }

  function parseSamples(root) {
    var el = root.querySelector('.js-vlm-hallucination-data');
    if (!el) return [];
    try { return JSON.parse(el.textContent || '[]'); } catch (e) { return []; }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function highlightTokens(text, tokens, cls) {
    if (!tokens || !tokens.length) return escapeHtml(text);
    var html = escapeHtml(text), used = [];
    tokens.slice().sort(function(a,b){return b.length-a.length;}).forEach(function(tok){
      var esc = escapeHtml(tok), i = html.indexOf(esc);
      if (i === -1) return;
      if (used.some(function(r){return i<r.end&&i+esc.length>r.start;})) return;
      used.push({start:i,end:i+esc.length});
      html = html.slice(0,i)+'<mark class="'+cls+'">'+esc+'</mark>'+html.slice(i+esc.length);
    });
    return html;
  }

  function formatSigned(n) {
    var s = n.toFixed(2);
    return (n >= 0 ? '+' : '') + s;
  }

  function pauseAwareWait(demo, ms, token) {
    var step = 40;
    var elapsed = 0;
    return new Promise(function(resolve) {
      function tick() {
        if (token != null && token !== demo.runToken) return resolve(false);
        if (demo.isPaused) {
          setTimeout(tick, step);
          return;
        }
        if (elapsed >= ms) return resolve(true);
        var chunk = Math.min(step, ms - elapsed);
        setTimeout(function() {
          elapsed += chunk;
          tick();
        }, chunk);
      }
      tick();
    });
  }

  function Demo(root) {
    this.root = root;
    this.samples = parseSamples(root);
    this.sampleById = {};
    this.samples.forEach(function(s){ this.sampleById[s.id]=s; }, this);

    this.imageEl         = root.querySelector('.js-vlm-image');
    this.promptEl        = root.querySelector('.js-vlm-prompt');
    this.statusEl        = root.querySelector('.js-vlm-status');
    this.vlmHubEl        = root.querySelector('.js-vlm-hub');
    this.vlmNeuroEl        = root.querySelector('.js-vlm-neuro-img');
    this.vlmNeuroOverlayEl = root.querySelector('.js-vlm-neuro-overlay');
    this.vlmActivityEl   = root.querySelector('.js-vlm-activity-label');
    this.branchPanelEl   = root.querySelector('[data-stage="branch"]');
    this.outputStageEl   = root.querySelector('.js-output-stage');
    this.originalStageEl = root.querySelector('.js-original-stage');
    this.originalDividerEl = root.querySelector('.js-original-divider');
    this.finalPaneEl     = root.querySelector('.vg-output-combined__pane--final');
    this.iterLabelEl     = root.querySelector('.js-tta-iter-label');
    this.iterDotsEl      = root.querySelector('.js-tta-dots');
    this.candidatesEl    = root.querySelector('.js-flow-candidates');
    this.scoresFrameEl   = root.querySelector('.js-scores-frame');
    this.scoresMeanEl    = root.querySelector('.js-scores-mean');
    this.captionEl            = root.querySelector('.js-vlm-output-caption');
    this.captionTextEl        = root.querySelector('.js-vlm-output-caption-text');
    this.captionSizerEl       = root.querySelector('.js-vlm-output-caption-sizer');
    this.originalCaptionEl    = root.querySelector('.js-vlm-original-caption');
    this.originalCaptionTextEl  = root.querySelector('.js-vlm-original-caption-text');
    this.originalCaptionSizerEl = root.querySelector('.js-vlm-original-caption-sizer');
    this.mitigateBtn     = root.querySelector('.js-vlm-mitigate-btn');
    this.pauseBtn        = root.querySelector('.js-vlm-pause-btn');
    this.resetBtn        = root.querySelector('.js-vlm-reset-btn');

    this.stageEls   = root.querySelectorAll('.js-flow-stage');
    this.bridgeEls  = root.querySelectorAll('.js-flow-bridge');
    this.wireEls    = root.querySelectorAll('.js-vg-wire');
    this.ttaStepEls = root.querySelectorAll('.js-tta-step');

    this.currentSampleId = this.samples.length ? this.samples[0].id : null;
    this.runToken = 0;
    this.isRunning = false;
    this.isPaused = false;
    this.totalIters = TOTAL_ITERS;
    this.currentTtaIter = 0;

    this._bindEvents();
    this._bindOutputResize();
    this._loadSample(this.currentSampleId, false);
  }

  Demo.prototype._nextSampleId = function () {
    if (!this.samples.length) return this.currentSampleId;
    var idx = -1;
    for (var i = 0; i < this.samples.length; i++) {
      if (this.samples[i].id === this.currentSampleId) {
        idx = i;
        break;
      }
    }
    var next = idx < 0 ? 0 : (idx + 1) % this.samples.length;
    return this.samples[next].id;
  };

  Demo.prototype._bindOutputResize = function () {
    var self = this;
    if (this._outputResizeBound) return;
    this._outputResizeBound = true;
    window.addEventListener('resize', function () {
      self._syncOutputBoxHeights();
    });
  };

  Demo.prototype._bindEvents = function () {
    var self = this;
    this.mitigateBtn.addEventListener('click', function(){ self.runMitigation(); });
    this.pauseBtn.addEventListener('click', function(){ self.togglePause(); });
    this.resetBtn.addEventListener('click', function(){ self._loadSample(self.currentSampleId, true); });
  };

  Demo.prototype._wait = function (ms, token) {
    return pauseAwareWait(this, ms, token);
  };

  Demo.prototype.togglePause = function () {
    if (!this.isRunning) return;
    this.isPaused = !this.isPaused;
    if (this.pauseBtn) {
      this.pauseBtn.textContent = this.isPaused ? 'Resume' : 'Pause';
    }
    if (this.isPaused) {
      this.root.classList.add('is-paused');
      this._status('Paused — click <em>Resume</em> to continue.');
    } else {
      this.root.classList.remove('is-paused');
    }
  };

  Demo.prototype._setPauseUi = function (running) {
    if (!this.pauseBtn) return;
    if (running) {
      this.pauseBtn.hidden = false;
      this.pauseBtn.disabled = false;
      this.pauseBtn.textContent = 'Pause';
    } else {
      this.pauseBtn.hidden = true;
      this.isPaused = false;
      this.root.classList.remove('is-paused');
    }
  };

  Demo.prototype._status = function (html) {
    if (this.statusEl) this.statusEl.innerHTML = html;
  };

  Demo.prototype._vlmNeuroSrc = function (filename) {
    return getSiteBaseUrl() + '/images/' + filename;
  };

  Demo.prototype._setVlmNeuroUpdating = function (iter) {
    if (!this.vlmNeuroOverlayEl) return;
    var n = Math.max(1, Math.min(TOTAL_ITERS, iter || 1));
    this.vlmNeuroOverlayEl.src = this._vlmNeuroSrc('vlm-hallucination/p' + n + '_neuro.png');
    this.vlmNeuroOverlayEl.hidden = false;
    this.vlmNeuroOverlayEl.classList.add('is-visible');
  };

  Demo.prototype._resetVlmNeuro = function () {
    if (!this.vlmNeuroOverlayEl) return;
    this.vlmNeuroOverlayEl.classList.remove('is-visible');
    this.vlmNeuroOverlayEl.hidden = true;
  };

  Demo.prototype._wireParts = function (el) {
    return el.querySelectorAll(
      '.vg-conn__shaft,.vg-conn__tip,.vg-hconn__line,.vg-hconn__tip'
    );
  };

  Demo.prototype._wireNodes = function (name) {
    var nodes = [];
    this.wireEls.forEach(function (el) {
      if (el.getAttribute('data-wire') !== name) return;
      nodes.push(el);
      this._wireParts(el).forEach(function (child) {
        nodes.push(child);
      });
    }, this);
    return nodes;
  };

  Demo.prototype._setWire = function (name, state) {
    var target = state || '';
    this._wireNodes(name).forEach(function (node) {
      var working = node.classList.contains('is-working');
      var complete = node.classList.contains('is-complete');
      if (target === 'is-working' && working) return;
      if (target === 'is-complete' && complete && !working) return;
      if (!target && !working && !complete) return;
      node.classList.remove('is-working', 'is-complete');
      if (target) node.classList.add(target);
    });
  };

  Demo.prototype._idleBranchWires = function () {
    ['cand-rm', 'rm-cand', 'scores-vlm'].forEach(function (w) {
      this._setWire(w, '');
    }, this);
  };

  Demo.prototype._workWire = function(n){ if(n) this._setWire(n,'is-working'); };
  Demo.prototype._doneWire = function(n){ if(n) this._setWire(n,'is-complete'); };

  Demo.prototype._clearAllWorking = function () {
    this.root.querySelectorAll('.is-working').forEach(function(el){
      el.classList.remove('is-working');
    });
  };

  /* Pulse helpers — fade between boxes; keep rhythm when staying on same box. */
  Demo.prototype._stageEl = function (name) {
    var found = null;
    this.stageEls.forEach(function (el) {
      if (el.getAttribute('data-stage') === name) found = el;
    });
    return found;
  };

  Demo.prototype._isPulsing = function (el) {
    return el && el.classList.contains('is-working') && !el.classList.contains('is-halo-exit');
  };

  Demo.prototype._beginPulse = function (el, opts) {
    if (!el) return;
    opts = opts || {};
    el.classList.remove('is-complete', 'is-pulse-out', 'is-grayed', 'is-halo-exit', 'is-pulse-in');
    if (el === this.vlmHubEl) {
      el.classList.toggle('is-updating', !!opts.updating);
    } else {
      el.classList.remove('is-updating');
    }
    if (!el.classList.contains('is-working')) {
      el.classList.add('is-working');
    }
  };

  Demo.prototype._fadePulseOff = function (els) {
    var self = this;
    var token = this.runToken;
    var list = (Array.isArray(els) ? els : [els]).filter(function (el) {
      return el && el.classList.contains('is-working') && !el.classList.contains('is-halo-exit');
    });
    if (!list.length) return Promise.resolve(true);
    list.forEach(function (el) {
      el.classList.add('is-halo-exit');
    });
    return this._wait(PULSE_FADE_MS, token).then(function (ok) {
      if (!ok) return false;
      list.forEach(function (el) {
        el.classList.remove('is-working', 'is-halo-exit', 'is-updating', 'is-pulse-in', 'is-pulse-out');
      });
      return true;
    });
  };

  Demo.prototype._fadePulseOn = function (els, opts) {
    var self = this;
    var token = this.runToken;
    opts = opts || {};
    var list = (Array.isArray(els) ? els : [els]).filter(function (el) {
      return el && (!el.classList.contains('is-working') || el.classList.contains('is-halo-exit'));
    });
    if (!list.length) return Promise.resolve(true);
    var fresh = list.filter(function (el) { return !el.classList.contains('is-working'); });
    list.forEach(function (el) {
      self._beginPulse(el, opts);
    });
    if (!fresh.length) return Promise.resolve(true);
    return this._wait(PULSE_FADE_MS, token).then(function (ok) {
      return !!ok;
    });
  };

  Demo.prototype._handoffPulse = function (fromEls, toEls, opts) {
    var self = this;
    var token = this.runToken;
    opts = opts || {};
    var fromList = (Array.isArray(fromEls) ? fromEls : [fromEls]).filter(function (el) {
      return el && el.classList.contains('is-working') && !el.classList.contains('is-halo-exit');
    });
    var toList = (Array.isArray(toEls) ? toEls : [toEls]).filter(Boolean);
    if (!fromList.length) {
      return this._fadePulseOn(toList, opts);
    }
    if (!toList.length) {
      return this._fadePulseOff(fromList);
    }
    toList.forEach(function (el) {
      self._beginPulse(el, opts);
    });
    fromList.forEach(function (el) {
      el.classList.add('is-halo-exit');
    });
    return this._wait(PULSE_FADE_MS, token).then(function (ok) {
      if (!ok) return false;
      fromList.forEach(function (el) {
        el.classList.remove('is-working', 'is-halo-exit', 'is-updating', 'is-pulse-in', 'is-pulse-out');
      });
      return true;
    });
  };

  Demo.prototype._clearStagePulses = function () {
    this.ttaStepEls.forEach(function (el) {
      el.classList.remove('is-working', 'is-pulse-in', 'is-pulse-out', 'is-halo-exit');
    });
    this.stageEls.forEach(function (el) {
      el.classList.remove('is-working', 'is-pulse-in', 'is-pulse-out', 'is-halo-exit');
    });
  };

  Demo.prototype._clearNodePulse = function () {
    if (this.vlmHubEl) {
      this.vlmHubEl.classList.remove('is-working', 'is-updating', 'is-pulse-in', 'is-pulse-out', 'is-halo-exit');
    }
    if (this.branchPanelEl) {
      this.branchPanelEl.classList.remove('is-working', 'is-pulse-in', 'is-pulse-out', 'is-halo-exit');
    }
    this._clearStagePulses();
  };

  Demo.prototype._applyVlmPulse = function (label, updating) {
    var hub = this.vlmHubEl;
    if (!hub) return;
    hub.classList.remove('is-complete', 'is-pulse-out', 'is-halo-exit');
    hub.classList.add('is-working');
    hub.classList.toggle('is-updating', !!updating);
    this._setVlmActivity(label || '');
  };

  Demo.prototype._applyTtaPulse = function (on) {
    if (!this.branchPanelEl) return Promise.resolve(true);
    if (on) {
      this.branchPanelEl.classList.remove('is-complete', 'is-grayed', 'is-updating', 'is-pulse-out', 'is-halo-exit');
      if (!this._isPulsing(this.branchPanelEl)) {
        return this._fadePulseOn(this.branchPanelEl);
      }
      this.branchPanelEl.classList.add('is-working');
      return Promise.resolve(true);
    }
    return this._fadePulseOff(this.branchPanelEl);
  };

  Demo.prototype._pulseVlm = function (label, updating) {
    var self = this;
    this._clearStagePulses();
    return this._fadePulseOff(this.branchPanelEl).then(function (ok) {
      if (!ok) return false;
      if (self._isPulsing(self.vlmHubEl)) {
        self._applyVlmPulse(label, updating);
        return true;
      }
      return self._fadePulseOn(self.vlmHubEl, { updating: updating });
    });
  };

  Demo.prototype._pulseVlmAndTta = function (label, updating) {
    var self = this;
    var vlm = this.vlmHubEl;
    var tta = this.branchPanelEl;
    var vlmOn = this._isPulsing(vlm);
    var ttaOn = this._isPulsing(tta);

    this._clearStagePulses();
    if (tta) tta.classList.remove('is-complete', 'is-grayed', 'is-updating');

    if (vlmOn && ttaOn) {
      this._applyVlmPulse(label, updating);
      if (tta) {
        tta.classList.remove('is-halo-exit', 'is-complete', 'is-grayed');
        tta.classList.add('is-working');
      }
      return Promise.resolve(true);
    }

    if (vlmOn && !ttaOn) {
      return this._fadePulseOn(tta).then(function (ok) {
        if (!ok) return false;
        self._applyVlmPulse(label, updating);
        if (tta) tta.classList.add('is-working');
        return true;
      });
    }

    return this._fadePulseOn([vlm, tta], { updating: updating }).then(function (ok) {
      if (!ok) return false;
      self._applyVlmPulse(label, updating);
      if (tta) tta.classList.add('is-working');
      return true;
    });
  };

  Demo.prototype._pulseStage = function (stageName) {
    this._clearNodePulse();
    return this._fadePulseOn(this._stageEl(stageName));
  };

  Demo.prototype._activateBridge = function (name) {
    this._workWire(name);
  };

  Demo.prototype._completeBridge = function (name) {
    this._doneWire(name);
  };

  Demo.prototype._activateStage = function (name) {
    if (name === 'branch') {
      if (this.branchPanelEl) {
        this.branchPanelEl.classList.remove('is-working', 'is-pulse-in', 'is-pulse-out', 'is-halo-exit');
      }
      return Promise.resolve(true);
    }
    return this._pulseStage(name);
  };

  Demo.prototype._completeStage = function (name) {
    var self = this;
    var el = this._stageEl(name);
    return this._fadePulseOff(el).then(function (ok) {
      if (el && ok) {
        el.classList.remove('is-pulse-in', 'is-pulse-out');
        el.classList.add('is-complete');
      }
      return ok;
    });
  };

  Demo.prototype._setVlmActivity = function (text) {
    if (!this.vlmActivityEl) return;
    if (text) {
      this.vlmActivityEl.textContent = text;
      this.vlmActivityEl.hidden = false;
    } else {
      this.vlmActivityEl.textContent = '';
      this.vlmActivityEl.hidden = true;
    }
  };

  Demo.prototype._setVlmWorking = function (label, updating) {
    return this._pulseVlm(label, updating);
  };

  Demo.prototype._setVlmIdle = function () {
    var self = this;
    return this._fadePulseOff(this.vlmHubEl).then(function (ok) {
      if (ok) self._setVlmActivity('');
      return ok;
    });
  };

  Demo.prototype._setVlmComplete = function () {
    var hub = this.vlmHubEl;
    if (!hub) return;
    hub.classList.remove('is-working','is-updating');
    hub.classList.add('is-complete');
    this._setVlmActivity('');
  };

  Demo.prototype._setOutputLit = function () {
    var el = this.outputStageEl;
    if (!el) return;
    el.classList.remove('is-pulse-in', 'is-pulse-out', 'is-halo-exit', 'is-complete', 'is-steady');
    el.classList.add('is-working');
  };

  Demo.prototype._reserveOutputSpace = function (sample) {
    if (!sample) return;
    var corrected = sample.corrected_caption || '';
    var original = sample.original_caption || '';
    if (this.captionSizerEl)
      this.captionSizerEl.textContent = FINAL_CAPTION_PREFIX + corrected;
    if (this.originalCaptionSizerEl)
      this.originalCaptionSizerEl.textContent = ORIGINAL_CAPTION_PREFIX + original;
    this._syncOutputBoxHeights();
  };

  Demo.prototype._syncOutputBoxHeights = function () {
    if (this.finalPaneEl) this.finalPaneEl.style.minHeight = '';
    if (this.originalStageEl) this.originalStageEl.style.minHeight = '';
  };

  Demo.prototype._clearCaptionText = function (textEl) {
    if (!textEl) return;
    textEl.textContent = '';
  };

  Demo.prototype._resetOriginalShell = function () {
    if (!this.originalStageEl) return;
    this._clearCaptionText(this.originalCaptionTextEl);
    this.originalStageEl.classList.remove(
      'is-working', 'is-steady', 'is-revealed',
      'is-pulse-in', 'is-pulse-out', 'is-halo-exit', 'is-complete'
    );
    this.originalStageEl.hidden = false;
    if (this.originalDividerEl) this.originalDividerEl.hidden = false;
  };

  Demo.prototype._revealOriginalOutput = function (sample) {
    if (!this.originalStageEl || !this.originalCaptionTextEl) return;
    var original = sample.original_caption || '';
    if (!original) {
      this.originalStageEl.hidden = true;
      if (this.originalDividerEl) this.originalDividerEl.hidden = true;
      return;
    }
    this.originalCaptionTextEl.innerHTML = highlightTokens(
      original,
      sample.hallucinated_tokens,
      'vg-output__token--bad'
    );
    this.originalStageEl.hidden = false;
    if (this.originalDividerEl) this.originalDividerEl.hidden = false;
    this.originalStageEl.classList.remove('is-pulse-in', 'is-pulse-out', 'is-halo-exit', 'is-complete', 'is-steady', 'is-working');
    this.originalStageEl.classList.add('is-revealed');
    this._syncOutputBoxHeights();
  };

  Demo.prototype._resetFlow = function () {
    this._clearAllWorking();
    this.stageEls.forEach(function(el){
      el.classList.remove('is-working', 'is-complete', 'is-grayed', 'is-pulse-in', 'is-pulse-out', 'is-halo-exit', 'is-steady');
    });
    this.bridgeEls.forEach(function(el){
      this._wireParts(el).forEach(function(c){
        c.classList.remove('is-working','is-complete');
      });
    }, this);
    this.wireEls.forEach(function(el){
      el.classList.remove('is-working','is-complete');
      this._wireParts(el).forEach(function(c){
        c.classList.remove('is-working','is-complete');
      });
    }, this);
    this.ttaStepEls.forEach(function(el){ el.classList.remove('is-working','is-complete'); });
    if (this.branchPanelEl) {
      this.branchPanelEl.classList.remove('is-grayed', 'is-working', 'is-pulse-in', 'is-pulse-out', 'is-halo-exit');
    }
    if (this.vlmHubEl) {
      this.vlmHubEl.classList.remove('is-working', 'is-updating', 'is-complete', 'is-pulse-in', 'is-pulse-out', 'is-halo-exit');
    }
    this._setVlmActivity('');
    if (this.iterDotsEl) Array.from(this.iterDotsEl.children).forEach(function(d){
      d.classList.remove('is-current','is-done');
    });
    if (this.iterLabelEl) this.iterLabelEl.textContent = '— / ' + this.totalIters;
    if (this.candidatesEl) {
      this.candidatesEl.classList.remove('has-scores', 'is-relative', 'is-formula-phase');
    }
    this._hideScoresFrame();
    this._buildCandidateShell();
    this._clearCaptionText(this.captionTextEl);
    this._resetOriginalShell();
    this._resetVlmNeuro();
    this.root.classList.remove('is-running','is-complete','is-tta-done','is-paused');
    this._setPauseUi(false);
    this._status('Press <em>Run TTA</em> to start.');
  };

  Demo.prototype._setIteration = function (iter) {
    if (this.iterLabelEl) this.iterLabelEl.textContent = iter + ' / ' + this.totalIters;
    if (!this.iterDotsEl) return;
    Array.from(this.iterDotsEl.children).forEach(function(d, i){
      d.classList.toggle('is-done',    i < iter - 1);
      d.classList.toggle('is-current', i === iter - 1);
    });
  };

  Demo.prototype._resetBranchCycle = function (iter) {
    this.ttaStepEls.forEach(function(el){ el.classList.remove('is-working','is-complete'); });
    this._idleBranchWires();
    if (this.candidatesEl) this.candidatesEl.classList.remove('has-scores', 'is-relative');
    this._hideScoresFrame();
  };

  Demo.prototype._activateBranchStep = function (name) {
    var idx = BRANCH_STEPS.indexOf(name);
    this.ttaStepEls.forEach(function(el){
      var s = el.getAttribute('data-tta-step');
      var i = BRANCH_STEPS.indexOf(s);
      el.classList.toggle('is-complete', i >= 0 && i < idx);
    });

    if (WIRE_DURING[name]) this._workWire(WIRE_DURING[name]);

    if (name === 'vlm-update') {
      this._pulseVlmAndTta('RL update (PPO + LN-γ)', true);
    } else if (name === 'beam-candidates') {
      this._pulseVlmAndTta('Generating', false);
    } else if (name === 'reward-model') {
      this._pulseVlmAndTta('', false);
    }
  };

  Demo.prototype._completeBranchStep = function (name) {
    this.ttaStepEls.forEach(function(el){
      if (el.getAttribute('data-tta-step') === name) {
        el.classList.remove('is-working'); el.classList.add('is-complete');
      }
    });
    if (WIRE_DURING[name] && WIRE_DURING[name] !== 'vlm-beam') {
      this._doneWire(WIRE_DURING[name]);
    }
    if (WIRE_AFTER[name]) this._workWire(WIRE_AFTER[name]);
    if (name === 'vlm-update') {
      this._setWire('rm-cand', '');
      this._resetVlmNeuro();
    }
  };

  function beamRowHtml(rank, caption, imgSrc, imgAlt) {
    return (
      '<span class="vg-beam-row__rank">#' + rank + '</span>' +
      '<span class="vg-beam-row__text-wrap">' +
        '<span class="vg-beam-row__text">' + escapeHtml(caption) + '</span>' +
      '</span>' +
      '<span class="vg-beam-row__trail">' +
        '<span class="vg-beam-row__suffix" aria-hidden="true">+</span>' +
        (imgSrc
          ? '<span class="vg-beam-row__pair" title="Paired image → reward model">' +
            '<img class="vg-beam-row__thumb" src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(imgAlt) + '" loading="lazy" decoding="async">' +
            '</span>'
          : '<span class="vg-beam-row__pair vg-beam-row__pair--empty" aria-hidden="true"></span>') +
      '</span>' +
      '<span class="vg-beam-row__bar"><span class="vg-beam-row__fill js-beam-fill"></span></span>' +
      '<span class="vg-beam-row__score js-beam-score"></span>'
    );
  }

  var BEAM_K = 5;
  var SCORE_BAR_MIN = -2;
  var SCORE_BAR_MAX = 2;
  var SCORE_BAR_SPAN = SCORE_BAR_MAX - SCORE_BAR_MIN;

  function scoreBarWidth(value) {
    var clamped = Math.max(SCORE_BAR_MIN, Math.min(SCORE_BAR_MAX, value));
    return ((clamped - SCORE_BAR_MIN) / SCORE_BAR_SPAN) * 100;
  }

  function setScoreBarFill(fill, value, isRelative) {
    if (!fill) return;
    fill.style.width = scoreBarWidth(value) + '%';
    fill.classList.remove('is-gray', 'is-positive', 'is-negative');
    if (isRelative) {
      if (value > 0) fill.classList.add('is-positive');
      else if (value < 0) fill.classList.add('is-negative');
      else fill.classList.add('is-gray');
    } else {
      fill.classList.add('is-gray');
    }
  }

  Demo.prototype._buildCandidateShell = function () {
    if (!this.candidatesEl) return;
    var imgSrc = this.imageEl && this.imageEl.src ? this.imageEl.src : '';
    var imgAlt = this.imageEl && this.imageEl.alt ? this.imageEl.alt : 'Input image';
    this.candidatesEl.innerHTML = '';
    this.candidatesEl.classList.remove('has-scores', 'is-relative', 'is-formula-phase');
    for (var i = 1; i <= BEAM_K; i++) {
      var row = document.createElement('div');
      row.className = 'vg-beam-row vg-beam-row--shell js-beam-shell';
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-hidden', 'true');
      row.innerHTML = beamRowHtml(i, '\u00a0', imgSrc, imgAlt);
      this.candidatesEl.appendChild(row);
    }
  };

  Demo.prototype._iterRewards = function (sample, iter) {
    var final = sample.critic_score != null ? sample.critic_score : 0.83;
    var prog  = iter / this.totalIters;
    return (sample.beam_candidates || []).map(function(c){
      var start = c.reward || 0.5;
      return { caption: c.caption, beam_rank: c.beam_rank,
               reward: Math.min(final - 0.02, start + (final - start) * prog * 0.85) };
    });
  };

  Demo.prototype._getIterationData = function (sample, iter) {
    var groups = sample.tta_iterations;
    if (groups && groups[iter - 1]) {
      var g = groups[iter - 1];
      return {
        label: g.label || '',
        mean: g.mean != null ? g.mean : null,
        original_caption: g.original_caption || '',
        candidates: (g.candidates || []).map(function (c) {
          return {
            caption: c.caption,
            beam_rank: c.beam_rank,
            reward: c.reward != null ? c.reward : c.score
          };
        })
      };
    }
    return {
      label: '',
      mean: null,
      original_caption: '',
      candidates: this._iterRewards(sample, iter)
    };
  };

  Demo.prototype._buildCandidates = function (candidates) {
    this.candidatesEl.innerHTML = '';
    this.candidatesEl.classList.remove('has-scores', 'is-formula-phase');
    var imgSrc = this.imageEl && this.imageEl.src ? this.imageEl.src : '';
    var imgAlt = this.imageEl && this.imageEl.alt ? this.imageEl.alt : 'Input image';
    candidates.forEach(function(c, i){
      var row = document.createElement('div');
      row.className = 'vg-beam-row js-beam-card';
      row.setAttribute('role','listitem');
      row.innerHTML = beamRowHtml(c.beam_rank || i + 1, c.caption, imgSrc, imgAlt);
      row.__reward = c.reward;
      this.candidatesEl.appendChild(row);
    }, this);
  };

  Demo.prototype._revealCaptions = function (token) {
    var self = this;
    var cards = Array.from(this.candidatesEl.querySelectorAll('.js-beam-card'));
    if (!cards.length) return Promise.resolve(true);
    var chain = Promise.resolve(true);
    cards.forEach(function(card){
      chain = chain.then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        card.classList.add('is-caption-visible');
        return self._wait(50, token);
      });
    });
    return chain;
  };

  Demo.prototype._revealPairs = function (token) {
    var self = this;
    var cards = Array.from(this.candidatesEl.querySelectorAll('.js-beam-card'));
    if (!cards.length) return Promise.resolve(true);
    var chain = Promise.resolve(true);
    cards.forEach(function(card){
      chain = chain.then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        card.classList.add('is-pair-visible');
        return self._wait(45, token);
      });
    });
    return chain;
  };

  Demo.prototype._hidePairs = function (token) {
    var cards = Array.from(this.candidatesEl.querySelectorAll('.js-beam-card'));
    cards.forEach(function(card){
      card.classList.remove('is-pair-visible');
    });
    return this._wait(140, token);
  };

  Demo.prototype._hideScoresFrame = function () {
    if (this.scoresFrameEl) {
      this.scoresFrameEl.hidden = true;
      this.scoresFrameEl.classList.remove('is-visible', 'is-normalizing');
    }
    if (this.scoresMeanEl) this.scoresMeanEl.textContent = '';
  };

  Demo.prototype._showScoreFormulas = function (cards, values, meanToken) {
    if (this.candidatesEl) this.candidatesEl.classList.add('is-formula-phase');
    var meanLabel = meanToken === 'mean' ? 'mean' : meanToken;
    cards.forEach(function(card, i){
      var scoreEl = card.querySelector('.js-beam-score');
      var fill = card.querySelector('.js-beam-fill');
      if (!scoreEl) return;
      scoreEl.classList.remove('is-negative', 'is-positive');
      scoreEl.classList.add('is-formula');
      scoreEl.innerHTML = values[i].toFixed(2) + '<span class="vg-score-formula__mean"> \u2212 ' + meanLabel + '</span>';
      if (fill) fill.style.width = '0%';
    });
    cards.forEach(function(c){ c.classList.remove('is-top'); });
  };

  Demo.prototype._updateScoreBars = function (cards, values, isRelative) {
    if (this.candidatesEl) this.candidatesEl.classList.remove('is-formula-phase');
    cards.forEach(function(card, i){
      var v = values[i];
      var fill = card.querySelector('.js-beam-fill');
      var scoreEl = card.querySelector('.js-beam-score');
      if (scoreEl) {
        scoreEl.classList.remove('is-formula');
        scoreEl.textContent = isRelative ? formatSigned(v) : v.toFixed(2);
        scoreEl.classList.toggle('is-negative', isRelative && v < 0);
        scoreEl.classList.toggle('is-positive', isRelative && v > 0);
      }
      setScoreBarFill(fill, v, isRelative);
    });
    cards.forEach(function(c){ c.classList.remove('is-top'); });
  };

  Demo.prototype._fillScores = function (token) {
    if (token !== this.runToken) return Promise.resolve(false);
    if (this.candidatesEl) this.candidatesEl.classList.add('has-scores');
    var cards = Array.from(this.candidatesEl.querySelectorAll('.js-beam-card'));
    var values = cards.map(function(card){ return card.__reward || 0; });
    cards.forEach(function(card){
      if (!card.querySelector('.js-beam-fill')) {
        var bar = document.createElement('span');
        bar.className = 'vg-beam-row__bar';
        bar.innerHTML = '<span class="vg-beam-row__fill js-beam-fill"></span>';
        var score = document.createElement('span');
        score.className = 'vg-beam-row__score js-beam-score';
        card.appendChild(bar);
        card.appendChild(score);
      }
    });
    this._updateScoreBars(cards, values, false);
    return this._wait(220, token).then(function(ok){
      return ok && token === this.runToken;
    }.bind(this));
  };

  Demo.prototype._normalizeScores = function (token) {
    if (token !== this.runToken) return Promise.resolve(false);
    var cards = Array.from(this.candidatesEl.querySelectorAll('.js-beam-card'));
    if (!cards.length) return Promise.resolve(true);

    var values = cards.map(function(card){ return card.__reward || 0; });
    var mean = this._currentIterMean != null
      ? this._currentIterMean
      : values.reduce(function(a, b){ return a + b; }, 0) / values.length;
    var meanText = mean.toFixed(2);

    if (this.scoresFrameEl) {
      this.scoresFrameEl.hidden = false;
      this.scoresFrameEl.classList.add('is-normalizing');
      requestAnimationFrame(function(){
        if (this.scoresFrameEl) this.scoresFrameEl.classList.add('is-visible');
      }.bind(this));
    }
    if (this.scoresMeanEl) this.scoresMeanEl.textContent = 'mean=' + meanText;

    return this._wait(380, token).then(function(ok){
      if (ok === false || token !== this.runToken) return false;
      this._showScoreFormulas(cards, values, 'mean');
      return this._wait(420, token);
    }.bind(this)).then(function(ok){
      if (ok === false || token !== this.runToken) return false;
      var relatives = values.map(function(v){ return v - mean; });
      cards.forEach(function(card, i){ card.__relative = relatives[i]; });
      this.candidatesEl.classList.add('is-relative');
      this._updateScoreBars(cards, relatives, true);
      return this._wait(360, token).then(function(ok2){
        return ok2 && token === this.runToken;
      }.bind(this));
    }.bind(this));
  };

  Demo.prototype._runIteration = function (sample, iter, token) {
    var self = this;
    var iterData = this._getIterationData(sample, iter);
    var candidates = iterData.candidates;

    this._currentIterMean = iterData.mean;
    this._resetBranchCycle(iter);
    this._setIteration(iter);
    this._buildCandidates(candidates);

    var iterLabel = iterData.label ? ' (' + iterData.label + ')' : '';
    this._activateBranchStep('beam-candidates');
    this._status('Iter '+iter+'/'+self.totalIters+iterLabel+' — candidates (beam search, k=5) from VLM');

    return this._wait(500, token)
      .then(function(){
        if (token !== self.runToken) return false;
        self._status('Iter '+iter+'/'+self.totalIters+' — candidates generated');
        return self._revealCaptions(token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        self._status('Iter '+iter+'/'+self.totalIters+' — pairing captions with input image');
        return self._revealPairs(token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        self._completeBranchStep('beam-candidates');
        self._activateBranchStep('reward-model');
        self._status('Iter '+iter+'/'+self.totalIters+' — LLM-as-judge (CLIP Model), SAS + NHP');
        return self._wait(320, token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        self._completeBranchStep('reward-model');
        self._status('Iter '+iter+'/'+self.totalIters+' — reward scores → candidates');
        return self._hidePairs(token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        return self._wait(SCORES_AFTER_RM_MS, token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        return self._fillScores(token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        self._status('Iter '+iter+'/'+self.totalIters+iterLabel+' — mean & normalization (score \u2212 mean)');
        return self._normalizeScores(token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        self.currentTtaIter = iter;
        self._activateBranchStep('vlm-update');
        self._status('Iter '+iter+'/'+self.totalIters+' — RL update (PPO + LN-γ)');
        return self._wait(VLM_NEURO_UPDATE_DELAY_MS, token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        self._setVlmNeuroUpdating(iter);
        return self._wait(760 - VLM_NEURO_UPDATE_DELAY_MS, token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        self._completeBranchStep('vlm-update');
        return self._wait(160, token).then(function(){ return true; });
      });
  };

  Demo.prototype._runAllIterations = function (sample, token) {
    var self = this, chain = Promise.resolve(true);
    for (var i = 1; i <= this.totalIters; i++) {
      (function(iter){
        chain = chain.then(function(ok){
          if (ok === false || token !== self.runToken) return false;
          return self._runIteration(sample, iter, token);
        });
      })(i);
    }
    return chain;
  };

  Demo.prototype._typeCaption = function (el, text, speed) {
    var self = this, token = this.runToken, chars = Array.from(text), i = 0;
    el.textContent = '';
    return new Promise(function(resolve){
      function tick() {
        if (token !== self.runToken) return resolve(false);
        if (self.isPaused) {
          setTimeout(tick, 40);
          return;
        }
        if (i >= chars.length) return resolve(true);
        el.textContent += chars[i++];
        setTimeout(tick, speed);
      }
      tick();
    });
  };

  Demo.prototype._loadSample = function (id, resetOnly) {
    var sample = this.sampleById[id] || this.samples[0];
    if (!sample) return;
    this.runToken++;
    this.isRunning = false;
    this.isPaused = false;
    this.currentSampleId = sample.id;
    this.totalIters = sample.rl_steps || TOTAL_ITERS;
    this.imageEl.src = getSiteBaseUrl() + '/images/' + sample.image;
    this.imageEl.alt = sample.alt || '';
    this._resetFlow();
    this._reserveOutputSpace(sample);
    if (this.promptEl) this.promptEl.textContent = sample.prompt || '"Describe this image."';
    this.mitigateBtn.disabled = false;
    this.mitigateBtn.hidden = false;
    this.resetBtn.hidden = true;
    this._setPauseUi(false);
    if (!resetOnly) this.runMitigation();
  };

  Demo.prototype.runMitigation = function () {
    var self = this;
    var sample = this.sampleById[this.currentSampleId] || this.samples[0];
    if (!sample || this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.runToken++;
    var token = this.runToken;
    this._resetFlow();
    this._reserveOutputSpace(sample);
    this.totalIters = sample.rl_steps || TOTAL_ITERS;
    this.mitigateBtn.disabled = true;
    this.mitigateBtn.hidden = true;
    this._setPauseUi(true);
    this.root.classList.add('is-running');

    this._status('Input image + text prompt');

    return this._activateStage('input')
      .then(function(ok){
        if (ok === false || token !== self.runToken) return null;
        self._workWire('input-vlm');
        return self._wait(INPUT_PULSE_HOLD_MS, token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return null;
        var inputEl = self._stageEl('input');
        if (inputEl) inputEl.classList.add('is-complete');
        return self._handoffPulse(
          inputEl,
          self.vlmHubEl,
          { updating: false }
        );
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return null;
        self._setWire('input-vlm', '');
        self._setVlmActivity('Receiving…');
        self._status('Sending image + prompt into vision-language model…');
        return self._wait(560, token);
      })
      .then(function(r){
        if (r === false || token !== self.runToken) return null;
        self._activateStage('branch');
        self._workWire('vlm-beam');
        self._setVlmActivity('Generating');
        return self._fadePulseOn(self.branchPanelEl).then(function(ok2) {
          if (!ok2 || token !== self.runToken) return null;
          self._applyVlmPulse('Generating', false);
          self._status('Starting '+self.totalIters+' TTA loops');
          return self._wait(280, token);
        });
      })
      .then(function(r){
        if (r === false || token !== self.runToken) return null;
        return self._runAllIterations(sample, token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return null;
        return self._completeStage('branch');
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return null;
        if (self.iterDotsEl)
          Array.from(self.iterDotsEl.children).forEach(function(d){
            d.classList.remove('is-current'); d.classList.add('is-done');
          });
        if (self.iterLabelEl) self.iterLabelEl.textContent = self.totalIters+' / '+self.totalIters+' · done';
        if (self.branchPanelEl) self.branchPanelEl.classList.add('is-grayed');
        self.ttaStepEls.forEach(function(el){ el.classList.remove('is-working'); });
        self._setWire('vlm-beam', '');
        self._idleBranchWires();
        return self._fadePulseOff(self.branchPanelEl);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return null;
        var inputEl = self._stageEl('input');
        if (inputEl) {
          inputEl.classList.remove('is-complete');
          inputEl.classList.add('is-working');
        }
        self._workWire('input-vlm');
        self._applyVlmPulse('Generating', false);
        self._workWire('vlm-output');
        self._status('TTA complete — generating final caption');
        return self._wait(650, token);
      })
      .then(function(r){
        if (r === false || token !== self.runToken) return null;
        self._status('Vision-language model outputs final caption');
        self._revealOriginalOutput(sample);
        return self._fadePulseOn(self.outputStageEl);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return null;
        return self._typeCaption(self.captionTextEl, sample.corrected_caption, 13);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return null;
        self._setOutputLit();
        self.captionTextEl.innerHTML = highlightTokens(
          sample.corrected_caption, sample.corrected_tokens, 'vg-output__token--ok');
        self._syncOutputBoxHeights();
        self._status('Done.');
        self.isRunning = false;
        self._setPauseUi(false);
        self.mitigateBtn.hidden = true;
        self.resetBtn.hidden = false;
        self.root.classList.remove('is-running');
        self.root.classList.add('is-complete');
        return self._wait(AUTO_RESTART_DELAY_MS, token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return;
        self.root.classList.remove('is-complete');
        self.resetBtn.hidden = true;
        self._loadSample(self._nextSampleId(), false);
      });
  };

  function isMobileViewport() {
    return window.matchMedia('(max-width: 640px)').matches;
  }

  function init() {
    if (isMobileViewport()) return;
    document.querySelectorAll('.js-vlm-hallucination').forEach(function(root){
      if (!root.__vlmDemo) root.__vlmDemo = new Demo(root);
    });
  }
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
