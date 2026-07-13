(function() {
  'use strict';

  var EMBED_BASE = 'https://www.youtube-nocookie.com/embed/';

  function getModalForTrigger(trigger) {
    var modalId = trigger.getAttribute('data-modal-id');
    return modalId ? document.getElementById(modalId) : null;
  }

  function getVideoId(trigger) {
    return trigger.getAttribute('data-youtube-id') || '';
  }

  function buildEmbedSrc(videoId) {
    return EMBED_BASE + encodeURIComponent(videoId) + '?autoplay=1&rel=0';
  }

  function openModal(modal, videoId) {
    var iframe = modal.querySelector('.js-geo-agent-iframe');
    if (!iframe) return;

    iframe.src = buildEmbedSrc(videoId);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('demo-modal-open');
  }

  function closeModal(modal) {
    var iframe = modal.querySelector('.js-geo-agent-iframe');
    if (iframe) {
      iframe.src = '';
    }
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.demo-modal:not([hidden])')) {
      document.body.classList.remove('demo-modal-open');
    }
  }

  function initGeoAgentDemo() {
    document.addEventListener('click', function(event) {
      var openTrigger = event.target.closest('.js-geo-agent-open');
      if (openTrigger) {
        var modal = getModalForTrigger(openTrigger);
        var videoId = getVideoId(openTrigger);
        if (modal && videoId) {
          openModal(modal, videoId);
        }
        return;
      }

      var closeTrigger = event.target.closest('.js-geo-agent-close');
      if (closeTrigger) {
        var modal = closeTrigger.closest('.js-geo-agent-modal');
        if (modal) {
          closeModal(modal);
        }
      }
    });

    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') {
        var openModalEl = document.querySelector('.js-geo-agent-modal:not([hidden])');
        if (openModalEl) {
          closeModal(openModalEl);
        }
        return;
      }

      var trigger = event.target.closest('.js-geo-agent-open');
      if (!trigger) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        var modal = getModalForTrigger(trigger);
        var videoId = getVideoId(trigger);
        if (modal && videoId) {
          openModal(modal, videoId);
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGeoAgentDemo);
  } else {
    initGeoAgentDemo();
  }
})();
