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

  function init() {
    $window.on('scroll', onScroll)
    $window.on('resize', resize)
    $popoverLink.on('click', openPopover)
    $document.on('click', closePopover)
    $('a[href^="#"]').on('click', smoothScroll);
    $('.navbar-link').on('click', smoothScroll);
    buildSnippets();
    initPaperImageLightbox();
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