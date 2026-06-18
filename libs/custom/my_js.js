$(document).ready(function() {

  // Variables
  var $codeSnippets = $('.code-example-body'),
      $nav = $('.navbar'),
      $body = $('body'),
      $window = $(window),
      $popoverLink = $('[data-popover]'),
      navOffsetTop = $nav.offset().top,
      $document = $(document),
      entityMap = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': '&quot;',
        "'": '&#39;',
        "/": '&#x2F;'
      }

  function initDeferredPublicationImages() {
    var $images = $('.js-paper-teaser-img[data-src]');

    if (!$images.length) {
      return;
    }

    function applySrc($img) {
      var src = $img.attr('data-src');

      if (!src || $img.attr('src')) {
        return;
      }

      var $teaser = $img.closest('.js-paper-teaser');
      var $status = $teaser.find('.js-paper-teaser-status');

      function markLoaded() {
        $teaser.addClass('is-loaded').removeClass('is-error');
      }

      function markError() {
        $teaser.addClass('is-error').removeClass('is-loaded');
        $status.text('Unable to load');
      }

      $img.one('load', markLoaded);
      $img.one('error', markError);
      $img.attr('src', src);

      if ($img[0].complete) {
        $img.off('load error');
        if ($img[0].naturalWidth) {
          markLoaded();
        } else {
          markError();
        }
      }
    }

    function loadWhenIdle() {
      var queue = $images.toArray();

      function step(deadline) {
        while (queue.length && (deadline.timeRemaining() > 0 || deadline.didTimeout)) {
          applySrc($(queue.shift()));
        }

        if (queue.length) {
          window.requestIdleCallback(step, { timeout: 2000 });
        }
      }

      if (window.requestIdleCallback) {
        window.requestIdleCallback(step, { timeout: 2000 });
      } else {
        $images.each(function() {
          applySrc($(this));
        });
      }
    }

    function startDeferredPublicationLoad() {
      loadWhenIdle();
    }

    if (document.readyState === 'complete') {
      startDeferredPublicationLoad();
    } else {
      $(window).one('load.deferredPapers', startDeferredPublicationLoad);
    }
  }

  function initResearchInterestsFigure() {
    $('.js-research-interests-img').each(function() {
      var $img = $(this);
      var $figure = $img.closest('.js-research-interests-figure');
      var $status = $figure.find('.js-research-interests-status');

      function markLoaded() {
        $figure.addClass('is-loaded').removeClass('is-error');
      }

      function markError() {
        $figure.addClass('is-error').removeClass('is-loaded');
        $status.text('Unable to load');
      }

      $img.on('load', markLoaded);
      $img.on('error', markError);

      if ($img[0].complete) {
        $img.off('load error');
        if ($img[0].naturalWidth) {
          markLoaded();
        } else {
          markError();
        }
      }
    });
  }

  function initPaperImageLightbox() {
    var $lightbox = $('#paper-image-lightbox');
    if (!$lightbox.length) {
      return;
    }

    $(document).on('click', '.js-paper-image-lightbox', function(e) {
      e.preventDefault();
      var src = $(this).attr('href');
      var alt = $(this).find('img').attr('alt') || '';
      $lightbox.find('.paper-image-lightbox__img').attr({ src: src, alt: alt });
      $lightbox.removeClass('paper-image-lightbox--large paper-image-lightbox--xlarge');
      if ($(this).hasClass('js-paper-image-lightbox--xlarge')) {
        $lightbox.addClass('paper-image-lightbox--xlarge');
      } else if ($(this).hasClass('js-paper-image-lightbox--large')) {
        $lightbox.addClass('paper-image-lightbox--large');
      }
      $lightbox.addClass('is-open').attr('aria-hidden', 'false');
      $body.addClass('paper-lightbox-open');
    });

    $lightbox.on('click', function(e) {
      if (!$(e.target).closest('.paper-image-lightbox__stage').length) {
        closePaperLightbox();
      }
    });

    $(document).on('keydown', function(e) {
      if (e.key === 'Escape' && $lightbox.hasClass('is-open')) {
        closePaperLightbox();
      }
    });

    function closePaperLightbox() {
      $lightbox.removeClass('is-open paper-image-lightbox--large paper-image-lightbox--xlarge').attr('aria-hidden', 'true');
      $lightbox.find('.paper-image-lightbox__img').attr('src', '');
      $body.removeClass('paper-lightbox-open');
    }
  }

  function preloadDemoSampleImages() {
    var seen = {};

    $('.js-sample-btn').each(function() {
      ['data-pre', 'data-post', 'data-result'].forEach(function(attr) {
        var src = $(this).attr(attr);
        if (!src || seen[src]) {
          return;
        }

        seen[src] = true;
        var img = new Image();
        img.decoding = 'async';
        img.src = src;
      }, this);
    });
  }

  function initSyncedSwipeCompare() {
    var $activeSwipe = null;

    preloadDemoSampleImages();

    function getSwipePosition($root) {
      var value = parseFloat($root.attr('data-position'));
      return isNaN(value) ? 50 : value;
    }

    function positionFromEvent($root, e) {
      var rect = $root.find('.js-synced-swipe-stack')[0].getBoundingClientRect();
      var clientX = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
      return ((clientX - rect.left) / rect.width) * 100;
    }

    function syncCompareLayout($root) {
      var position = getSwipePosition($root);

      $root.find('.js-swipe-compare').each(function() {
        var $compare = $(this);
        var width = $compare.width();
        var height = $compare.height();
        var offset = (position / 100) * width;

        $compare.find('.js-swipe-after-wrap').css({
          left: position + '%',
          height: height + 'px'
        });
        $compare.find('.swipe-compare__after').css({
          width: width + 'px',
          height: height + 'px',
          marginLeft: (-offset) + 'px'
        });
      });
    }

    $('.js-synced-swipe').each(function() {
      var $root = $(this);
      var $handle = $root.find('.js-synced-swipe-handle');
      var $stack = $root.find('.js-synced-swipe-stack');

      function setPosition(percent) {
        var value = Math.max(0, Math.min(100, percent));
        $root.attr('data-position', value);
        $handle.css('left', value + '%');
        $handle.attr('aria-valuenow', Math.round(value));
        syncCompareLayout($root);
      }

      $root.data('setSwipePosition', setPosition);

      $stack.add($handle).on('mousedown touchstart', function(e) {
        $activeSwipe = $root;
        setPosition(positionFromEvent($root, e));
        e.preventDefault();
      });

      $handle.on('keydown', function(e) {
        var step = e.shiftKey ? 10 : 2;
        var current = getSwipePosition($root);
        if (e.key === 'ArrowLeft') {
          setPosition(current - step);
          e.preventDefault();
        } else if (e.key === 'ArrowRight') {
          setPosition(current + step);
          e.preventDefault();
        }
      });

      $root.find('.swipe-compare__before').on('load', function() {
        syncCompareLayout($root);
      });

      setPosition(getSwipePosition($root));
    });

    $(window).on('resize.syncedSwipe', function() {
      $('.js-synced-swipe').each(function() {
        var setPosition = $(this).data('setSwipePosition');
        if (setPosition) {
          setPosition(getSwipePosition($(this)));
        }
      });
    });

    $(document).on('mousemove.syncedSwipe touchmove.syncedSwipe', function(e) {
      if (!$activeSwipe) {
        return;
      }
      var setPosition = $activeSwipe.data('setSwipePosition');
      setPosition(positionFromEvent($activeSwipe, e));
      e.preventDefault();
    });

    $(document).on('mouseup.syncedSwipe touchend.syncedSwipe touchcancel.syncedSwipe', function() {
      $activeSwipe = null;
    });

    var segmentTransitionMs = 720;

    function beginSegmentSwitch($nav, $fromBtn, $toBtn) {
      if (!$nav.length || !$fromBtn.length || !$toBtn.length) {
        return;
      }

      var fromIndex = $nav.find('.js-sample-btn').index($fromBtn);
      var toIndex = $nav.find('.js-sample-btn').index($toBtn);
      var direction = toIndex > fromIndex ? 'right' : 'left';

      $nav
        .removeClass('is-sliding-left is-sliding-right')
        .addClass('is-segment-switching')
        .addClass(direction === 'right' ? 'is-sliding-right' : 'is-sliding-left')
        .data('slideFromRect', $fromBtn[0].getBoundingClientRect());
    }

    function endSegmentSwitch($nav) {
      window.setTimeout(function() {
        $nav.removeClass('is-segment-switching is-sliding-left is-sliding-right');
        $nav.removeData('slideFromRect');
        $nav.find('.js-sample-slider-trail').css({ opacity: 0 });
      }, segmentTransitionMs + 64);
    }

    function syncSampleSliderTrail($nav) {
      var $trail = $nav.find('.js-sample-slider-trail');
      var fromRect = $nav.data('slideFromRect');

      if (!$trail.length || !fromRect || !$nav.hasClass('is-segment-switching')) {
        return;
      }

      var $btn = $nav.find('.js-sample-btn.is-active').first();
      if (!$btn.length) {
        return;
      }

      var navRect = $nav[0].getBoundingClientRect();
      var btnRect = $btn[0].getBoundingClientRect();
      var fromLeft = fromRect.left - navRect.left;
      var fromRight = fromRect.right - navRect.left;
      var toLeft = btnRect.left - navRect.left;
      var toRight = btnRect.right - navRect.left;
      var top = Math.min(fromRect.top - navRect.top, btnRect.top - navRect.top);
      var bottom = Math.max(fromRect.bottom - navRect.top, btnRect.bottom - navRect.top);

      $trail.css({
        left: Math.min(fromLeft, toLeft) + 'px',
        top: top + 'px',
        width: Math.max(fromRight, toRight) - Math.min(fromLeft, toLeft) + 'px',
        height: Math.max(0, bottom - top) + 'px',
        opacity: 1
      });
    }

    function syncSampleNavWidth($nav) {
      if (!$nav.length) {
        return;
      }

      var $figure = $nav.closest('.viz-project__figure');
      var $stack = $figure.find('.synced-swipe__stack').first();

      if (!$stack.length) {
        return;
      }

      var stackWidth = Math.round($stack.outerWidth());
      $nav.css('width', stackWidth + 'px');
    }

    function syncSampleSlider($nav) {
      var $btn = $nav.find('.js-sample-btn.is-active').first();
      var $slider = $nav.find('.js-sample-slider');

      if (!$btn.length || !$slider.length) {
        return;
      }

      var navRect = $nav[0].getBoundingClientRect();
      var btnRect = $btn[0].getBoundingClientRect();

      $slider.css({
        left: (btnRect.left - navRect.left) + 'px',
        top: (btnRect.top - navRect.top) + 'px',
        width: btnRect.width + 'px',
        height: btnRect.height + 'px'
      });

      syncSampleSliderTrail($nav);
    }

    function runSampleSliderSync($nav) {
      var syncId = ($nav.data('sliderSyncId') || 0) + 1;
      $nav.data('sliderSyncId', syncId);

      var startedAt = performance.now();

      function tick(now) {
        if ($nav.data('sliderSyncId') !== syncId) {
          return;
        }

        syncSampleSlider($nav);

        if (now - startedAt < segmentTransitionMs + 48) {
          window.requestAnimationFrame(tick);
        } else {
          syncSampleNavWidth($nav);
        }
      }

      window.requestAnimationFrame(tick);
    }

    function updateSampleSlider($nav, isSwitching) {
      syncSampleNavWidth($nav);
      syncSampleSlider($nav);
      runSampleSliderSync($nav);

      if (isSwitching) {
        endSegmentSwitch($nav);
      }
    }

    function initSampleSliders() {
      $('.viz-project__sample-nav').each(function() {
        var $nav = $(this);
        syncSampleNavWidth($nav);
        syncSampleSlider($nav);
      });
    }

    initSampleSliders();

    $(window).on('resize.sampleSlider', function() {
      initSampleSliders();
    });

    $(window).on('load.sampleSlider', function() {
      initSampleSliders();
    });

    $(document).on('mousedown touchstart click', '.js-sample-btn', function(e) {
      e.stopPropagation();
    });

    var sampleFadeMs = 720;

    $(document).on('click', '.js-sample-btn', function() {
      var $btn = $(this);
      if ($btn.hasClass('is-active')) {
        return;
      }

      var $project = $btn.closest('.viz-project');
      var sampleId = $btn.attr('data-sample-id');
      var pre = $btn.attr('data-pre');
      var post = $btn.attr('data-post');
      var result = $btn.attr('data-result');
      var $swipe = $project.find('.js-synced-swipe');
      var setPosition = $swipe.data('setSwipePosition');
      var switchToken = ($project.data('sampleSwitchToken') || 0) + 1;

      $project.data('sampleSwitchToken', switchToken);

      var $nav = $btn.closest('.viz-project__sample-nav');
      var $fromBtn = $nav.find('.js-sample-btn.is-active').first();

      beginSegmentSwitch($nav, $fromBtn, $btn);

      $project.find('.js-sample-btn').removeClass('is-active').attr('aria-selected', 'false');
      $btn.addClass('is-active').attr('aria-selected', 'true');
      updateSampleSlider($nav, true);
      $project.addClass('is-sample-switching');

      window.setTimeout(function() {
        if ($project.data('sampleSwitchToken') !== switchToken) {
          return;
        }

        var pendingLoads = 0;

        $project.find('.js-project-caption').html(
          $project.find('.js-caption-template[data-sample-id="' + sampleId + '"]').html()
        );

        function finishSampleSwitch() {
          if ($project.data('sampleSwitchToken') !== switchToken) {
            return;
          }

          if (setPosition) {
            setPosition(getSwipePosition($swipe));
          }

          window.requestAnimationFrame(function() {
            window.requestAnimationFrame(function() {
              if ($project.data('sampleSwitchToken') === switchToken) {
                $project.removeClass('is-sample-switching');
              }
            });
          });
        }

        function onSampleImageLoad() {
          pendingLoads -= 1;
          if (pendingLoads <= 0) {
            finishSampleSwitch();
          }
        }

        function queueImageUpdate($img, src) {
          var img = $img[0];
          if (!img || img.src === src) {
            return;
          }

          pendingLoads += 1;
          $img.one('load error', onSampleImageLoad);
          img.src = src;
          if (img.complete) {
            $img.off('load error', onSampleImageLoad);
            onSampleImageLoad();
          }
        }

        $swipe.find('.js-sample-pre').each(function() {
          queueImageUpdate($(this), pre);
        });

        $swipe.find('.js-sample-post').each(function() {
          queueImageUpdate($(this), post);
        });

        $swipe.find('.js-sample-result').each(function() {
          queueImageUpdate($(this), result);
        });

        if (pendingLoads === 0) {
          finishSampleSwitch();
        }
      }, sampleFadeMs);
    });
  }

  function init() {
    $window.on('scroll', onScroll)
    $window.on('resize', resize)
    $popoverLink.on('click', openPopover)
    $document.on('click', closePopover)
    $('a[href^="#"]').on('click', smoothScroll);
    $('.navbar-link').on('click', smoothScroll);
    buildSnippets();
    initResearchInterestsFigure();
    initPaperImageLightbox();
    initDeferredPublicationImages();
    initSyncedSwipeCompare();
    scrollToHashOnLoad();
  }

  function getNavScrollOffset() {
    if ($window.width() < 750) {
      return 12;
    }
    return ($nav.outerHeight() || 104) + 12;
  }

  function getSectionScrollTarget($section) {
    var $heading = $section.children('h4').first();
    return $heading.length ? $heading : $section;
  }

  function scrollToSection($section) {
    var $scrollTarget = getSectionScrollTarget($section);
    $('html, body').stop().animate({
      scrollTop: $scrollTarget.offset().top - getNavScrollOffset()
    }, 0);
  }

  function smoothScroll(e) {
    var hash = this.hash;
    if (!hash) {
      return;
    }

    var $target = $(hash);
    if (!$target.length) {
      return;
    }

    e.preventDefault();
    $(document).off('scroll');
    scrollToSection($target);
    if (history.replaceState) {
      history.replaceState(null, '', hash);
    } else {
      window.location.hash = hash;
    }
    $(document).on('scroll', onScroll);
    onScroll();
  }

  function scrollToHashOnLoad() {
    if (!window.location.hash) {
      return;
    }

    var $target = $(window.location.hash);
    if (!$target.length) {
      return;
    }

    setTimeout(function() {
      scrollToSection($target);
      onScroll();
    }, 0);
  }

  function openPopover(e) {
    e.preventDefault()
    closePopover();
    var popover = $($(this).data('popover'));
    popover.toggleClass('open')
    e.stopImmediatePropagation();
  }

  function closePopover(e) {
    if($('.popover.open').length > 0) {
      $('.popover').removeClass('open')
    }
  }

  $("#button").click(function() {
    $('html, body').animate({
        scrollTop: $("#elementtoScrollToID").offset().top
    }, 2000);
});

  function resize() {
    $body.removeClass('has-docked-nav')
    navOffsetTop = $nav.offset().top
    onScroll()
  }

  function onScroll() {
    if(navOffsetTop < $window.scrollTop() && !$body.hasClass('has-docked-nav')) {
      $body.addClass('has-docked-nav')
    }
    if(navOffsetTop > $window.scrollTop() && $body.hasClass('has-docked-nav')) {
      $body.removeClass('has-docked-nav')
    }
  }

  function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
      return entityMap[s];
    });
  }

  function buildSnippets() {
    $codeSnippets.each(function() {
      var newContent = escapeHtml($(this).html())
      $(this).html(newContent)
    })
  }


  init();

});