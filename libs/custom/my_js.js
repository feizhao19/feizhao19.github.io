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
      $lightbox.removeClass('is-open').attr('aria-hidden', 'true');
      $lightbox.find('.paper-image-lightbox__img').attr('src', '');
      $body.removeClass('paper-lightbox-open');
    }
  }

  function init() {
    $window.on('scroll', onScroll)
    $window.on('resize', resize)
    $popoverLink.on('click', openPopover)
    $document.on('click', closePopover)
    $('a[href^="#"]').on('click', smoothScroll)
    buildSnippets();
    initPaperImageLightbox();
  }

  function getNavScrollOffset() {
    if ($window.width() < 750) {
      return 16;
    }
    return ($nav.outerHeight() || 104) + 16;
  }

  function smoothScroll(e) {
    e.preventDefault();
    $(document).off("scroll");
    var target = this.hash,
        menu = target;
    $target = $(target);
    $('html, body').stop().animate({
        'scrollTop': $target.offset().top - getNavScrollOffset()
    }, 0, 'swing', function () {
        window.location.hash = target;
        $(document).on("scroll", onScroll);
    });
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