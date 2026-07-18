(function() {
  'use strict';

  var EMBED_BASE = 'https://www.youtube-nocookie.com/embed/';
  var modal = null;
  var pendingOpen = null;

  function buildEmbedSrc(videoId) {
    return EMBED_BASE + encodeURIComponent(videoId) + '?autoplay=1&rel=0';
  }

  function ensureModal(aspectRatio) {
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'demo-modal js-geo-agent-modal';
    modal.id = 'geo-agent-modal-lazy';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'RapidResponseAgent demo video');
    modal.setAttribute('aria-hidden', 'true');
    modal.hidden = true;
    modal.innerHTML =
      '<div class="demo-modal__backdrop js-geo-agent-close" aria-hidden="true"></div>' +
      '<button type="button" class="demo-modal__close js-geo-agent-close" aria-label="Close demo">&times;</button>' +
      '<div class="demo-modal__content demo-modal__content--geo-agent">' +
        '<p class="demo-modal__hint">Press Escape or click the background to close</p>' +
        '<div class="geo-agent-modal__video-wrap js-geo-agent-video-wrap" style="--geo-agent-video-aspect: ' + aspectRatio + ';">' +
          '<iframe class="geo-agent-modal__video js-geo-agent-iframe" title="RapidResponseAgent demo walkthrough" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    return modal;
  }

  function openModal(videoId, aspectRatio) {
    var current = ensureModal(aspectRatio || '1920/954');
    var wrap = current.querySelector('.js-geo-agent-video-wrap');
    var iframe = current.querySelector('.js-geo-agent-iframe');
    if (!iframe) return;

    if (wrap && aspectRatio) {
      wrap.style.setProperty('--geo-agent-video-aspect', aspectRatio);
    }
    // Assign src only when opening — YouTube never loads on initial page render.
    iframe.src = buildEmbedSrc(videoId);
    current.hidden = false;
    current.setAttribute('aria-hidden', 'false');
    document.body.classList.add('demo-modal-open');
  }

  function closeModal() {
    if (!modal) return;
    var iframe = modal.querySelector('.js-geo-agent-iframe');
    if (iframe) {
      iframe.src = '';
      iframe.removeAttribute('src');
    }
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('demo-modal-open');
  }

  function tryOpenFromTrigger(trigger) {
    var videoId = trigger.getAttribute('data-youtube-id') || '';
    if (!videoId) return;
    openModal(videoId, trigger.getAttribute('data-aspect-ratio') || '1920/954');
  }

  function initGeoAgentDemo() {
    document.addEventListener('click', function(event) {
      var openTrigger = event.target.closest('.js-geo-agent-open');
      if (openTrigger) {
        tryOpenFromTrigger(openTrigger);
        return;
      }

      if (event.target.closest('.js-geo-agent-close')) {
        closeModal();
      }
    });

    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') {
        if (modal && !modal.hidden) {
          closeModal();
        }
        return;
      }

      var trigger = event.target.closest('.js-geo-agent-open');
      if (!trigger) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        tryOpenFromTrigger(trigger);
      }
    });

    // If the user clicked before this script finished loading, open now.
    if (pendingOpen) {
      tryOpenFromTrigger(pendingOpen);
      pendingOpen = null;
    }
  }

  window.__geoAgentOpenPending = function(trigger) {
    pendingOpen = trigger;
  };

  if (window.__geoAgentPendingTrigger) {
    pendingOpen = window.__geoAgentPendingTrigger;
    window.__geoAgentPendingTrigger = null;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGeoAgentDemo);
  } else {
    initGeoAgentDemo();
  }
})();
