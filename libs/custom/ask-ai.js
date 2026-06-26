(function() {
  'use strict';

  var PLATFORM_URLS = {
    chatgpt: 'https://chatgpt.com/',
    perplexity: 'https://www.perplexity.ai/',
    gemini: 'https://gemini.google.com/app'
  };

  var PLATFORM_LABELS = {
    chatgpt: 'ChatGPT',
    perplexity: 'Perplexity',
    gemini: 'Gemini'
  };

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function(resolve, reject) {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        document.execCommand('copy');
        document.body.removeChild(textarea);
        resolve();
      } catch (error) {
        document.body.removeChild(textarea);
        reject(error);
      }
    });
  }

  function init() {
    var root = document.getElementById('ask-ai-widget');
    if (!root) return;

    var fab = root.querySelector('.js-ask-ai-open');
    var panel = document.getElementById('ask-ai-panel');
    var closeBtn = root.querySelector('.js-ask-ai-close');
    var input = root.querySelector('.js-ask-ai-question');
    var statusEl = root.querySelector('.js-ask-ai-status');
    var copyBtn = root.querySelector('.js-ask-ai-copy');
    var copyOpenBtns = root.querySelectorAll('.js-ask-ai-copy-open');
    var configEl = root.querySelector('.js-ask-ai-config');
    var config = {
      display: '',
      questionIntro: 'I would like to learn about Dr. Fei Zhao. Please answer the following question:',
      systemPrompt: '',
      llmsFull: ''
    };

    if (configEl) {
      try {
        config = JSON.parse(configEl.textContent || '{}');
      } catch (error) {
        config = { display: '', questionIntro: '', systemPrompt: '', llmsFull: '' };
      }
    }

    var defaultQuestion = (config.display || '').trim();
    var questionIntro = (config.questionIntro || 'I would like to learn about Dr. Fei Zhao. Please answer the following question:').trim();
    var systemPrompt = (config.systemPrompt || '').trim();
    var llmsFull = (config.llmsFull || '').trim();

    function currentUserQuestion() {
      var value = (input.value || '').trim();
      return value || defaultQuestion;
    }

    function buildPrompt(userQuestion) {
      var parts = [];

      if (llmsFull) {
        parts.push('# Website Profile (llms-full.txt)', '', llmsFull);
      }

      if (systemPrompt) {
        parts.push('---', systemPrompt);
      }

      parts.push('---', questionIntro, '', userQuestion);

      return parts.join('\n');
    }

    function currentPrompt() {
      return buildPrompt(currentUserQuestion());
    }

    function showStatus(message) {
      statusEl.textContent = message;
    }

    function flashButton(btn, label) {
      var original = btn.textContent;
      btn.textContent = label;
      window.setTimeout(function() {
        btn.textContent = original;
      }, 1800);
    }

    function handleCopy(prompt, btn) {
      return copyToClipboard(prompt).then(function() {
        showStatus('Copied — paste with Cmd/Ctrl+V.');
        if (btn) flashButton(btn, 'Copied');
      }).catch(function() {
        showStatus('Copy failed. Select and copy manually.');
      });
    }

    function handleCopyAndOpen(prompt, platform, btn) {
      var platformLabel = PLATFORM_LABELS[platform] || 'the AI platform';
      var platformUrl = PLATFORM_URLS[platform];

      if (!platformUrl) return;

      return copyToClipboard(prompt).then(function() {
        window.open(platformUrl, '_blank', 'noopener,noreferrer');
        showStatus('Copied — paste into ' + platformLabel + '.');
        flashButton(btn, '✓');
      }).catch(function() {
        showStatus('Copy failed. Open ' + platformLabel + ' and paste manually.');
      });
    }

    function applyDefaultQuestion() {
      input.value = defaultQuestion;
    }

    function openPanel() {
      panel.hidden = false;
      fab.setAttribute('aria-expanded', 'true');
      applyDefaultQuestion();
      window.setTimeout(function() {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }, 0);
    }

    function closePanel() {
      panel.hidden = true;
      fab.setAttribute('aria-expanded', 'false');
      statusEl.textContent = '';
      input.value = '';
      fab.focus();
    }

    fab.addEventListener('click', function() {
      if (panel.hidden) {
        openPanel();
      } else {
        closePanel();
      }
    });

    closeBtn.addEventListener('click', closePanel);

    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape' && !panel.hidden) {
        closePanel();
      }
    });

    document.addEventListener('click', function(event) {
      if (panel.hidden) return;
      if (root.contains(event.target)) return;
      closePanel();
    });

    copyBtn.addEventListener('click', function() {
      handleCopy(currentPrompt(), copyBtn);
    });

    copyOpenBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        handleCopyAndOpen(
          currentPrompt(),
          btn.getAttribute('data-platform'),
          btn
        );
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
