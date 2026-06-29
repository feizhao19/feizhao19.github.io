(function () {
  'use strict';

  /*
   * Left:  Input → Vision-Language Model → Final Output
   * Right: [Beam Search + Candidates] → Reward Model → (red ←) scores on candidates → VLM
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

  function wait(ms) { return new Promise(function(res){ setTimeout(res, ms); }); }

  function Demo(root) {
    this.root = root;
    this.samples = parseSamples(root);
    this.sampleById = {};
    this.samples.forEach(function(s){ this.sampleById[s.id]=s; }, this);

    this.imageEl         = root.querySelector('.js-vlm-image');
    this.promptEl        = root.querySelector('.js-vlm-prompt');
    this.statusEl        = root.querySelector('.js-vlm-status');
    this.vlmHubEl        = root.querySelector('.js-vlm-hub');
    this.vlmStateLabelEl = root.querySelector('.js-vlm-state-label');
    this.branchPanelEl   = root.querySelector('[data-stage="branch"]');
    this.outputStageEl   = root.querySelector('.js-output-stage');
    this.iterLabelEl     = root.querySelector('.js-tta-iter-label');
    this.iterDotsEl      = root.querySelector('.js-tta-dots');
    this.candidatesEl    = root.querySelector('.js-flow-candidates');
    this.scoresFrameEl   = root.querySelector('.js-scores-frame');
    this.scoresMeanEl    = root.querySelector('.js-scores-mean');
    this.captionEl       = root.querySelector('.js-vlm-output-caption');
    this.dualEl          = root.querySelector('.js-vlm-output-dual');
    this.scoreDisplayEl  = root.querySelector('.js-score-display');
    this.mitigateBtn     = root.querySelector('.js-vlm-mitigate-btn');
    this.resetBtn        = root.querySelector('.js-vlm-reset-btn');

    this.stageEls   = root.querySelectorAll('.js-flow-stage');
    this.bridgeEls  = root.querySelectorAll('.js-flow-bridge');
    this.wireEls    = root.querySelectorAll('.js-vg-wire');
    this.ttaStepEls = root.querySelectorAll('.js-tta-step');

    this.currentSampleId = this.samples.length ? this.samples[0].id : null;
    this.runToken = 0;
    this.isRunning = false;
    this.totalIters = TOTAL_ITERS;

    this._bindEvents();
    this._loadSample(this.currentSampleId, true);
  }

  Demo.prototype._bindEvents = function () {
    var self = this;
    this.mitigateBtn.addEventListener('click', function(){ self.runMitigation(); });
    this.resetBtn.addEventListener('click', function(){ self._loadSample(self.currentSampleId, true); });
  };

  Demo.prototype._status = function (html) {
    if (this.statusEl) this.statusEl.innerHTML = html;
  };

  Demo.prototype._wireParts = function (el) {
    return el.querySelectorAll(
      '.vg-conn__shaft,.vg-conn__tip,.vg-hconn__line,.vg-hconn__tip'
    );
  };

  Demo.prototype._setWire = function (name, state) {
    this.wireEls.forEach(function(el){
      if (el.getAttribute('data-wire') !== name) return;
      el.classList.remove('is-working','is-complete');
      if (state) el.classList.add(state);
      this._wireParts(el).forEach(function(child){
        child.classList.remove('is-working','is-complete');
        if (state) child.classList.add(state);
      });
    }, this);
  };

  Demo.prototype._workWire = function(n){ if(n) this._setWire(n,'is-working'); };
  Demo.prototype._doneWire = function(n){ if(n) this._setWire(n,'is-complete'); };

  Demo.prototype._clearAllWorking = function () {
    this.root.querySelectorAll('.is-working').forEach(function(el){
      el.classList.remove('is-working');
    });
  };

  Demo.prototype._activateBridge = function (name) {
    this.bridgeEls.forEach(function(el){
      if (el.getAttribute('data-bridge') === name) {
        this._wireParts(el).forEach(function(c){
          c.classList.add('is-working'); c.classList.remove('is-complete');
        });
      }
    }, this);
    this._workWire(name);
  };

  Demo.prototype._completeBridge = function (name) {
    this.bridgeEls.forEach(function(el){
      if (el.getAttribute('data-bridge') === name) {
        this._wireParts(el).forEach(function(c){
          c.classList.remove('is-working'); c.classList.add('is-complete');
        });
      }
    }, this);
    this._doneWire(name);
  };

  Demo.prototype._activateStage = function (name) {
    this.stageEls.forEach(function(el){
      el.classList.toggle('is-working', el.getAttribute('data-stage') === name);
    });
  };

  Demo.prototype._completeStage = function (name) {
    this.stageEls.forEach(function(el){
      if (el.getAttribute('data-stage') === name) {
        el.classList.remove('is-working'); el.classList.add('is-complete');
      }
    });
  };

  Demo.prototype._setVlmWorking = function (label, updating) {
    var hub = this.vlmHubEl;
    if (!hub) return;
    hub.classList.remove('is-complete','is-updating');
    hub.classList.add('is-working');
    if (updating) hub.classList.add('is-updating');
    if (this.vlmStateLabelEl) this.vlmStateLabelEl.textContent = label || 'Generator';
  };

  Demo.prototype._setVlmIdle = function (label) {
    var hub = this.vlmHubEl;
    if (!hub) return;
    hub.classList.remove('is-working','is-updating');
    if (this.vlmStateLabelEl) this.vlmStateLabelEl.textContent = label || 'Generator';
  };

  Demo.prototype._setVlmComplete = function () {
    var hub = this.vlmHubEl;
    if (!hub) return;
    hub.classList.remove('is-working','is-updating');
    hub.classList.add('is-complete');
    if (this.vlmStateLabelEl) this.vlmStateLabelEl.textContent = 'Generator';
  };

  Demo.prototype._resetFlow = function () {
    this._clearAllWorking();
    this.stageEls.forEach(function(el){ el.classList.remove('is-working','is-complete','is-grayed'); });
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
    if (this.branchPanelEl) this.branchPanelEl.classList.remove('is-grayed');
    if (this.vlmHubEl) this.vlmHubEl.classList.remove('is-working','is-updating','is-complete');
    if (this.iterDotsEl) Array.from(this.iterDotsEl.children).forEach(function(d){
      d.classList.remove('is-current','is-done');
    });
    if (this.iterLabelEl) this.iterLabelEl.textContent = '— / ' + this.totalIters;
    if (this.candidatesEl) {
      this.candidatesEl.innerHTML = '';
      this.candidatesEl.classList.remove('has-scores', 'is-relative');
    }
    this._hideScoresFrame();
    if (this.captionEl) this.captionEl.innerHTML = '';
    if (this.dualEl) { this.dualEl.hidden = true; this.dualEl.textContent = ''; }
    if (this.scoreDisplayEl) this.scoreDisplayEl.textContent = 'beam outputs';
    this.root.classList.remove('is-running','is-complete','is-tta-done');
    this._status('Press <em>Run self-correction</em> to start.');
  };

  Demo.prototype._setIteration = function (iter) {
    if (this.iterLabelEl) this.iterLabelEl.textContent = iter + ' / ' + this.totalIters;
    if (!this.iterDotsEl) return;
    Array.from(this.iterDotsEl.children).forEach(function(d, i){
      d.classList.toggle('is-done',    i < iter - 1);
      d.classList.toggle('is-current', i === iter - 1);
    });
  };

  Demo.prototype._resetBranchCycle = function () {
    this.ttaStepEls.forEach(function(el){ el.classList.remove('is-working','is-complete'); });
    ['vlm-beam','cand-rm','rm-cand','scores-vlm'].forEach(function(w){
      this._setWire(w,'');
    }, this);
    if (this.scoreDisplayEl) this.scoreDisplayEl.textContent = 'beam outputs';
    if (this.candidatesEl) this.candidatesEl.classList.remove('has-scores', 'is-relative');
    this._hideScoresFrame();
  };

  Demo.prototype._activateBranchStep = function (name) {
    var idx = BRANCH_STEPS.indexOf(name);
    this.ttaStepEls.forEach(function(el){
      var s = el.getAttribute('data-tta-step');
      var i = BRANCH_STEPS.indexOf(s);
      el.classList.toggle('is-working',  s === name);
      el.classList.toggle('is-complete', i >= 0 && i < idx);
    });

    if (WIRE_DURING[name]) this._workWire(WIRE_DURING[name]);

    if (name === 'beam-candidates') {
      this._setVlmWorking('generating…', false);
    } else if (name === 'vlm-update') {
      this._setVlmWorking('LN-γ update', true);
    } else {
      this._setVlmIdle('Generator');
    }
  };

  Demo.prototype._completeBranchStep = function (name) {
    this.ttaStepEls.forEach(function(el){
      if (el.getAttribute('data-tta-step') === name) {
        el.classList.remove('is-working'); el.classList.add('is-complete');
      }
    });
    if (WIRE_DURING[name]) this._doneWire(WIRE_DURING[name]);
    if (WIRE_AFTER[name]) this._workWire(WIRE_AFTER[name]);
    if (name === 'vlm-update') {
      this._doneWire('scores-vlm');
      this._setVlmIdle('Generator');
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

  Demo.prototype._buildCandidates = function (candidates) {
    this.candidatesEl.innerHTML = '';
    this.candidatesEl.classList.remove('has-scores');
    candidates.forEach(function(c, i){
      var row = document.createElement('div');
      row.className = 'vg-beam-row js-beam-card';
      row.setAttribute('role','listitem');
      row.innerHTML =
        '<span class="vg-beam-row__rank">#'+(c.beam_rank||i+1)+'</span>'+
        '<span class="vg-beam-row__text">'+escapeHtml(c.caption)+'</span>';
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
        card.classList.add('is-visible');
        return wait(50).then(function(){ return token === self.runToken; });
      });
    });
    return chain;
  };

  Demo.prototype._hideScoresFrame = function () {
    if (this.scoresFrameEl) {
      this.scoresFrameEl.hidden = true;
      this.scoresFrameEl.classList.remove('is-visible', 'is-normalizing');
      var box = this.scoresFrameEl.querySelector('.vg-scores-frame__box');
      if (box) box.style.height = '';
    }
    if (this.scoresMeanEl) this.scoresMeanEl.textContent = '';
  };

  Demo.prototype._positionScoresFrame = function () {
    if (!this.candidatesEl || !this.scoresFrameEl) return;
    var box = this.scoresFrameEl.querySelector('.vg-scores-frame__box');
    if (box) box.style.height = this.candidatesEl.offsetHeight + 'px';
  };

  Demo.prototype._updateScoreBars = function (cards, values, isRelative) {
    var minV = Math.min.apply(null, values);
    var maxV = Math.max.apply(null, values);
    var span = maxV - minV;
    var best = -Infinity;
    var bestCard = null;
    cards.forEach(function(card, i){
      var v = values[i];
      var fill = card.querySelector('.js-beam-fill');
      var scoreEl = card.querySelector('.js-beam-score');
      if (scoreEl) {
        scoreEl.textContent = isRelative ? formatSigned(v) : v.toFixed(2);
        scoreEl.classList.toggle('is-negative', isRelative && v < 0);
        scoreEl.classList.toggle('is-positive', isRelative && v > 0);
      }
      if (fill) {
        fill.style.width = (span > 0 ? ((v - minV) / span) * 100 : 50) + '%';
      }
      if (v > best) { best = v; bestCard = card; }
    });
    cards.forEach(function(c){ c.classList.remove('is-top'); });
    if (bestCard) bestCard.classList.add('is-top');
    return best;
  };

  Demo.prototype._fillScores = function (token) {
    if (token !== this.runToken) return Promise.resolve(false);
    var genEl = this.root.querySelector('[data-tta-step="beam-candidates"]');
    if (genEl) genEl.classList.add('is-working');
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
    if (this.scoreDisplayEl) this.scoreDisplayEl.textContent = 'absolute scores';
    return wait(220).then(function(){
      if (genEl) genEl.classList.remove('is-working');
      return token === this.runToken;
    }.bind(this));
  };

  Demo.prototype._normalizeScores = function (token) {
    if (token !== this.runToken) return Promise.resolve(false);
    var genEl = this.root.querySelector('[data-tta-step="beam-candidates"]');
    var cards = Array.from(this.candidatesEl.querySelectorAll('.js-beam-card'));
    if (!cards.length) return Promise.resolve(true);

    var values = cards.map(function(card){ return card.__reward || 0; });
    var mean = values.reduce(function(a, b){ return a + b; }, 0) / values.length;

    this._positionScoresFrame();
    if (this.scoresFrameEl) {
      this.scoresFrameEl.hidden = false;
      requestAnimationFrame(function(){
        if (this.scoresFrameEl) this.scoresFrameEl.classList.add('is-visible');
      }.bind(this));
    }
    if (this.scoresMeanEl) this.scoresMeanEl.textContent = 'mean = ' + mean.toFixed(2);
    if (genEl) genEl.classList.add('is-working');

    return wait(480).then(function(){
      if (token !== this.runToken) return false;
      if (this.scoresFrameEl) this.scoresFrameEl.classList.add('is-normalizing');
      var relatives = values.map(function(v){ return v - mean; });
      cards.forEach(function(card, i){ card.__relative = relatives[i]; });
      this.candidatesEl.classList.add('is-relative');
      var best = this._updateScoreBars(cards, relatives, true);
      if (this.scoreDisplayEl) {
        this.scoreDisplayEl.textContent = 'relative (score \u2212 mean), best: ' + formatSigned(best);
      }
      return wait(360).then(function(){
        if (genEl) genEl.classList.remove('is-working');
        return token === this.runToken;
      }.bind(this));
    }.bind(this));
  };

  Demo.prototype._runIteration = function (sample, iter, token) {
    var self = this;
    var candidates = this._iterRewards(sample, iter);

    this._resetBranchCycle();
    this._setIteration(iter);
    this._buildCandidates(candidates);

    this._activateBranchStep('beam-candidates');
    this._status('Iter '+iter+'/'+self.totalIters+' — beam search from VLM');

    return wait(300)
      .then(function(){
        if (token !== self.runToken) return false;
        self._status('Iter '+iter+'/'+self.totalIters+' — candidates generated');
        return self._revealCaptions(token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        self._completeBranchStep('beam-candidates');
        self._activateBranchStep('reward-model');
        self._status('Iter '+iter+'/'+self.totalIters+' — reward model (SAS + NHP)');
        return wait(320);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        self._completeBranchStep('reward-model');
        self._status('Iter '+iter+'/'+self.totalIters+' — reward scores → candidates');
        return self._fillScores(token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        self._status('Iter '+iter+'/'+self.totalIters+' — mean & normalization (score \u2212 mean)');
        return self._normalizeScores(token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        self._doneWire('rm-cand');
        self._activateBranchStep('vlm-update');
        self._status('Iter '+iter+'/'+self.totalIters+' — scores → vision-language model');
        return wait(340);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return false;
        self._completeBranchStep('vlm-update');
        return wait(160).then(function(){ return true; });
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
    this.currentSampleId = sample.id;
    this.totalIters = sample.rl_steps || TOTAL_ITERS;
    this._resetFlow();
    this.imageEl.src = getSiteBaseUrl() + '/images/' + sample.image;
    this.imageEl.alt = sample.alt || '';
    if (this.promptEl) this.promptEl.textContent = sample.prompt || '"Describe this image."';
    this.mitigateBtn.disabled = false;
    this.mitigateBtn.hidden = false;
    this.resetBtn.hidden = true;
    if (!resetOnly) this.runMitigation();
  };

  Demo.prototype.runMitigation = function () {
    var self = this;
    var sample = this.sampleById[this.currentSampleId] || this.samples[0];
    if (!sample || this.isRunning) return;
    this.isRunning = true;
    this.runToken++;
    var token = this.runToken;
    this._resetFlow();
    this.totalIters = sample.rl_steps || TOTAL_ITERS;
    this.mitigateBtn.disabled = true;
    this.root.classList.add('is-running');

    this._activateStage('input');
    this._status('Input image + text prompt');

    wait(360)
      .then(function(){
        if (token !== self.runToken) return null;
        self._completeStage('input');
        self._activateBridge('input-vlm');
        self._setVlmWorking('receiving input…', false);
        self._status('Sending image + prompt into vision-language model…');
        return wait(340);
      })
      .then(function(r){
        if (r === null || token !== self.runToken) return null;
        self._completeBridge('input-vlm');
        self._setVlmIdle('Generator');
        self._activateStage('branch');
        self._status('Starting '+self.totalIters+' self-correction loops');
        return wait(280);
      })
      .then(function(r){
        if (r === null || token !== self.runToken) return null;
        return self._runAllIterations(sample, token);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return null;
        self._completeStage('branch');
        if (self.iterDotsEl)
          Array.from(self.iterDotsEl.children).forEach(function(d){
            d.classList.remove('is-current'); d.classList.add('is-done');
          });
        if (self.iterLabelEl) self.iterLabelEl.textContent = self.totalIters+' / '+self.totalIters+' · done';
        if (self.branchPanelEl) self.branchPanelEl.classList.add('is-grayed');
        self.ttaStepEls.forEach(function(el){ el.classList.remove('is-working'); });
        self._setVlmWorking('outputting…', false);
        self._status('Self-correction complete — generating final caption');
        return wait(420);
      })
      .then(function(r){
        if (r === null || token !== self.runToken) return null;
        self._setVlmIdle('Generator');
        self._activateBridge('vlm-output');
        self._activateStage('output');
        self._status('Vision-language model outputs final caption');
        return wait(280);
      })
      .then(function(r){
        if (r === null || token !== self.runToken) return null;
        self._completeBridge('vlm-output');
        self._setVlmComplete();
        return self._typeCaption(self.captionEl, sample.corrected_caption, 13);
      })
      .then(function(ok){
        if (ok === false || token !== self.runToken) return null;
        self.captionEl.innerHTML = highlightTokens(
          sample.corrected_caption, sample.corrected_tokens, 'vg-output__token--ok');
        if (self.dualEl && sample.sas_after != null) {
          var sc = sample.critic_score != null ? sample.critic_score : sample.clip_after;
          self.dualEl.textContent =
            'Critic '+(sc!=null?sc.toFixed(2):'')+
            ' · SAS '+sample.sas_after.toFixed(2)+
            ' · NHP '+sample.nhp_after.toFixed(2);
          self.dualEl.hidden = false;
        }
        self._status('Done.');
        return wait(140);
      })
      .then(function(r){
        if (r === null || token !== self.runToken) return;
        self._completeStage('output');
        self.isRunning = false;
        self.mitigateBtn.hidden = true;
        self.resetBtn.hidden = false;
        self.root.classList.remove('is-running');
        self.root.classList.add('is-complete');
      });
  };

  function init() {
    document.querySelectorAll('.js-vlm-hallucination').forEach(function(root){
      if (!root.__vlmDemo) root.__vlmDemo = new Demo(root);
    });
  }
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
