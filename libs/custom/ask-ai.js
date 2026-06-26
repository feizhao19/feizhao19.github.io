(function() {
  'use strict';

  var SITE_URL = 'https://feizhao19.github.io';

  var PLATFORM_URLS = {
    perplexity: function(encodedPrompt) {
      return 'https://www.perplexity.ai/search?q=' + encodedPrompt;
    },
    chatgpt: function(encodedPrompt) {
      return 'https://chatgpt.com/?q=' + encodedPrompt + '&hints=search';
    }
  };

  function resolveSiteUrl(raw) {
    if (!raw || /localhost|127\.0\.0\.1/i.test(raw)) {
      return SITE_URL;
    }
    return raw;
  }

  function getEntryDisplay(entry) {
    if (!entry) return '';
    return (entry.display || entry.question || '').trim();
  }

  function buildPrompt(siteUrl, llmsFullUrl, question) {
    return [
      'Please search and read the following sources before answering:',
      '',
      llmsFullUrl,
      siteUrl,
      '',
      'Prefer llms-full.txt as the primary structured summary of the website.',
      'If you cannot access the sources above, do not guess or use outside information. Reply only with:',
      '"Due to inability to access Fei Zhao\'s website, I cannot provide a summary of Fei\'s information."',
      'Focus on research vision, publications, projects, grants, awards, teaching, service, and experience.',
      '',
      'Question:',
      '',
      question
    ].join('\n');
  }

  function openPlatform(platform, prompt) {
    var buildUrl = PLATFORM_URLS[platform];
    if (!buildUrl) return;
    window.open(buildUrl(encodeURIComponent(prompt)), '_blank', 'noopener,noreferrer');
  }

  function copyPrompt(prompt, statusEl, copyBtn) {
    function showStatus(message) {
      statusEl.textContent = message;
    }

    function flashButton(label) {
      var original = copyBtn.textContent;
      copyBtn.textContent = label;
      window.setTimeout(function() {
        copyBtn.textContent = original;
      }, 1800);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(prompt).then(function() {
        showStatus('Prompt copied. You can paste it into any AI assistant.');
        flashButton('Copied');
      }).catch(function() {
        fallbackCopy(prompt, showStatus, flashButton);
      });
      return;
    }

    fallbackCopy(prompt, showStatus, flashButton);
  }

  function fallbackCopy(prompt, showStatus, flashButton) {
    var textarea = document.createElement('textarea');
    textarea.value = prompt;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand('copy');
      showStatus('Prompt copied. You can paste it into any AI assistant.');
      flashButton('Copied');
    } catch (error) {
      showStatus('Copy failed. Please select and copy the prompt manually.');
    }

    document.body.removeChild(textarea);
  }

  function init() {
    var root = document.getElementById('ask-ai-widget');
    if (!root) return;

    var siteUrl = resolveSiteUrl(root.getAttribute('data-site-url'));
    var llmsFullUrl = root.getAttribute('data-llms-full-url') || (siteUrl + '/llms-full.txt');

    var fab = root.querySelector('.js-ask-ai-open');
    var panel = document.getElementById('ask-ai-panel');
    var closeBtn = root.querySelector('.js-ask-ai-close');
    var input = root.querySelector('.js-ask-ai-question');
    var statusEl = root.querySelector('.js-ask-ai-status');
    var copyBtn = root.querySelector('.js-ask-ai-copy');
    var platformBtns = root.querySelectorAll('.js-ask-ai-platform');
    var chipBtns = root.querySelectorAll('.js-ask-ai-chip');
    var defaultDataEl = root.querySelector('.js-ask-ai-default-data');
    var suggestionsDataEl = root.querySelector('.js-ask-ai-suggestions-data');
    var defaultEntry = null;
    var suggestions = [];

    if (defaultDataEl) {
      try {
        defaultEntry = JSON.parse(defaultDataEl.textContent || 'null');
      } catch (error) {
        defaultEntry = null;
      }
    }

    if (suggestionsDataEl) {
      try {
        suggestions = JSON.parse(suggestionsDataEl.textContent || '[]');
      } catch (error) {
        suggestions = [];
      }
    }

    var selectedSuggestionIndex = null;
    var defaultDisplay = getEntryDisplay(defaultEntry);

    function clearChipSelection() {
      chipBtns.forEach(function(chip) {
        chip.classList.remove('is-selected');
      });
      selectedSuggestionIndex = null;
    }

    function selectChip(chip, index) {
      clearChipSelection();
      if (chip) chip.classList.add('is-selected');
      selectedSuggestionIndex = index;
    }

    function getSelectedSuggestion() {
      if (selectedSuggestionIndex === null) return null;
      return suggestions[selectedSuggestionIndex] || null;
    }

    function findSuggestionByDisplay(value) {
      var trimmed = (value || '').trim();
      if (!trimmed) return null;

      for (var i = 0; i < suggestions.length; i++) {
        if (getEntryDisplay(suggestions[i]) === trimmed) {
          return { suggestion: suggestions[i], index: i };
        }
      }

      return null;
    }

    function usesDefaultEntry() {
      if (!defaultEntry || !defaultEntry.prompt) return false;

      var currentValue = input.value.trim();
      return !currentValue || currentValue === defaultDisplay;
    }

    function applyDefaultDisplay() {
      if (!defaultDisplay) return;
      input.value = defaultDisplay;
    }

    function resolveActiveSuggestion() {
      var selected = getSelectedSuggestion();
      if (selected && selected.prompt) {
        return selected;
      }

      var matched = findSuggestionByDisplay(input.value);
      if (matched && matched.suggestion.prompt) {
        selectedSuggestionIndex = matched.index;
        chipBtns.forEach(function(chip, index) {
          chip.classList.toggle('is-selected', index === matched.index);
        });
        return matched.suggestion;
      }

      if (usesDefaultEntry()) {
        return defaultEntry;
      }

      return null;
    }

    function openPanel() {
      panel.hidden = false;
      fab.setAttribute('aria-expanded', 'true');
      applyDefaultDisplay();
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
      clearChipSelection();
      fab.focus();
    }

    function currentPrompt() {
      var activeSuggestion = resolveActiveSuggestion();
      if (activeSuggestion && activeSuggestion.prompt) {
        return activeSuggestion.prompt;
      }

      var question = input.value.trim() || defaultDisplay;
      return buildPrompt(siteUrl, llmsFullUrl, question);
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

    platformBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        openPlatform(btn.getAttribute('data-platform'), currentPrompt());
      });
    });

    copyBtn.addEventListener('click', function() {
      copyPrompt(currentPrompt(), statusEl, copyBtn);
    });

    chipBtns.forEach(function(chip) {
      chip.addEventListener('click', function() {
        var index = Number(chip.getAttribute('data-suggestion-index'));
        var display = chip.getAttribute('data-display') || getEntryDisplay(suggestions[index]);
        input.value = display;
        selectChip(chip, index);
        input.focus();
        statusEl.textContent = '';
      });
    });

    input.addEventListener('input', function() {
      var currentValue = input.value.trim();
      var matched = findSuggestionByDisplay(currentValue);

      if (matched) {
        chipBtns.forEach(function(chip, index) {
          chip.classList.toggle('is-selected', index === matched.index);
        });
        selectedSuggestionIndex = matched.index;
        return;
      }

      selectedSuggestionIndex = null;
      chipBtns.forEach(function(chip) {
        chip.classList.remove('is-selected');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
