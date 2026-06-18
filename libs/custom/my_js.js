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

  function initSyncedSwipeCompare() {
    var $activeSwipe = null;

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

    $(document).on('mousedown touchstart click', '.js-sample-btn', function(e) {
      e.stopPropagation();
    });

    $(document).on('click', '.js-sample-btn', function() {
      var $btn = $(this);
      var $project = $btn.closest('.viz-project');
      var sampleId = $btn.attr('data-sample-id');
      var sampleLabel = $.trim($btn.find('.viz-project__sample-btn-text').text() || $btn.text());
      var pre = $btn.attr('data-pre');
      var post = $btn.attr('data-post');
      var result = $btn.attr('data-result');
      var $swipe = $project.find('.js-synced-swipe');
      var setPosition = $swipe.data('setSwipePosition');
      var pendingLoads = 0;

      $project.find('.js-sample-btn').removeClass('is-active').attr('aria-selected', 'false');
      $btn.addClass('is-active').attr('aria-selected', 'true');
      $project.find('.js-sample-active-label').text(sampleLabel);

      $project.find('.js-project-caption').html(
        $project.find('.js-caption-template[data-sample-id="' + sampleId + '"]').html()
      );

      function onSampleImageLoad() {
        pendingLoads -= 1;
        if (pendingLoads <= 0 && setPosition) {
          setPosition(getSwipePosition($swipe));
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

      if (pendingLoads === 0 && setPosition) {
        setPosition(getSwipePosition($swipe));
      }
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
    initPaperImageLightbox();
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