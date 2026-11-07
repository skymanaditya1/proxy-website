(function () {
  'use strict';
  var doc = document;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;
  var $ = function (sel, root) { return (root || doc).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); };
  // play() returns a promise that rejects when autoplay is blocked or a file is missing; swallow it.
  var play = function (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); };

  /* ---------- theme ---------- */
  (function () {
    var btn = $('#theme-toggle');
    if (!btn) return;
    var root = doc.documentElement;
    var dark = window.matchMedia('(prefers-color-scheme: dark)');
    function current() {
      var t = root.getAttribute('data-theme');
      return t || (dark.matches ? 'dark' : 'light');
    }
    function label() {
      btn.setAttribute('aria-label', current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
    // A chosen theme overrides the OS one, so both media-scoped theme-color metas get its paper colour
    // (the head script does the same for a stored theme on load).
    var metas = $$('meta[name="theme-color"]');
    function toolbar(t) {
      metas.forEach(function (m) { m.setAttribute('content', t === 'dark' ? '#141413' : '#fbfaf7'); });
    }
    btn.hidden = false;
    label();
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      toolbar(next);
      label();
    });
    if (dark.addEventListener) dark.addEventListener('change', label);
  })();

  /* ---------- MathML fallback ---------- */
  (function () {
    var box = doc.createElement('div');
    box.style.cssText = 'position:absolute;left:-9999px;top:0';
    box.innerHTML = '<math><mspace width="77px" height="23px"></mspace></math>';
    doc.body.appendChild(box);
    var m = box.firstChild && box.firstChild.firstChild;
    var w = m && m.getBoundingClientRect ? m.getBoundingClientRect().width : 0;
    doc.body.removeChild(box);
    if (Math.abs(w - 77) > 1) doc.documentElement.classList.add('no-mathml');
  })();

  /* ---------- shared video helpers ---------- */
  // Pause/play overlay button for the hero and the task loops.
  function bindToggle(btn, video) {
    btn.hidden = false;
    btn.addEventListener('click', function () {
      if (video.paused) play(video); else video.pause();
    });
    var sync = function () { btn.setAttribute('data-paused', video.paused ? 'true' : 'false'); };
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    video.addEventListener('emptied', sync);
    sync();
    return sync;
  }
  // Point a <video> at media/<slug>.v1.webm / .mp4 with media/<slug>.poster.webp (WebM source first).
  function setClip(v, slug) {
    v.pause();
    var srcs = $$('source', v);
    srcs[0].src = 'media/' + slug + '.v1.webm';
    srcs[1].src = 'media/' + slug + '.v1.mp4';
    v.poster = 'media/' + slug + '.poster.webp';
    v.load();
  }
  var pauseOffscreen = function (video) {
    if (!hasIO) return;
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (!en.isIntersecting && !video.paused) video.pause(); });
    }, { threshold: 0.1 }).observe(video);
  };

  /* ---------- hero ---------- */
  (function () {
    var v = $('#hero-video'), btn = $('#hero-toggle');
    if (!v || !btn) return;
    if (reduceMotion) { v.removeAttribute('autoplay'); v.pause(); }
    v.removeAttribute('controls'); // the native bar is the JS-off fallback; the overlay button replaces it
    bindToggle(btn, v);
  })();

  /* ---------- pipeline walk-through ---------- */
  (function () {
    var root = $('#walk');
    if (!root) return;
    var radios = $$('input[name="walk"]', root);
    var items = $$('.walk-steps > li', root);
    var list = $('.walk-steps', root);
    var hl = $('.hl', root);
    var view = $('.walk-view', root);
    var count = $('#walk-count');
    var prev = $('#walk-prev'), next = $('#walk-next');
    if (!radios.length || radios.length !== items.length || !hl || !view) return;
    var n = items.length, cur = 0;

    root.classList.add('is-live');
    $('.step-tabs', root).hidden = false;
    $('.walk-nav', root).hidden = false;
    hl.hidden = false;
    view.setAttribute('tabindex', '0');
    view.setAttribute('role', 'group');

    function show(i) {
      cur = Math.max(0, Math.min(n - 1, i));
      items.forEach(function (li, k) { li.classList.toggle('on', k === cur); });
      if (!radios[cur].checked) radios[cur].checked = true;
      var b = (items[cur].getAttribute('data-box') || '0,0,100,100').split(',');
      hl.style.left = b[0] + '%';
      hl.style.top = b[1] + '%';
      hl.style.width = b[2] + '%';
      hl.style.height = b[3] + '%';
      var title = items[cur].querySelector('h3').textContent.replace(/^\d/, '').trim();
      count.textContent = 'Step ' + (cur + 1) + ' of ' + n;
      view.setAttribute('aria-label', 'Pipeline figure, highlighting ' + title + '. Use the arrow keys to change step.');
      prev.setAttribute('aria-disabled', cur === 0 ? 'true' : 'false');
      next.setAttribute('aria-disabled', cur === n - 1 ? 'true' : 'false');
    }

    radios.forEach(function (r, i) {
      r.addEventListener('change', function () { if (r.checked) show(i); });
    });
    prev.addEventListener('click', function () { show(cur - 1); });
    next.addEventListener('click', function () { show(cur + 1); });
    view.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); show(cur + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); show(cur - 1); }
      else if (e.key === 'Home') { e.preventDefault(); show(0); }
      else if (e.key === 'End') { e.preventDefault(); show(n - 1); }
    });
    show(0);
    // The step list becomes a live region after the first step is shown, so nothing is announced on load,
    // and it already exists when the first user change happens (a region created with the change is often silent).
    list.setAttribute('aria-live', 'polite');
  })();

  /* ---------- lightbox ---------- */
  var lightbox = (function () {
    var dlg = $('#lightbox'), body = $('#lightbox-body');
    if (!dlg || !body || typeof dlg.showModal !== 'function') return null;
    function videoEl(o) {
      var v = doc.createElement('video');
      v.controls = true; v.playsInline = true; v.muted = true; v.preload = 'metadata';
      v.width = 960; v.height = 540;
      if (o.poster) v.poster = o.poster;
      v.setAttribute('aria-label', o.label || '');
      o.sources.forEach(function (s) {
        var el = doc.createElement('source');
        el.src = s.src; el.type = s.type;
        v.appendChild(el);
      });
      return v;
    }
    // caption: a string, or nodes (a DocumentFragment) so sub/superscripts survive.
    function open(node, caption) {
      body.innerHTML = '';
      body.appendChild(node);
      if (caption) {
        var p = doc.createElement('p');
        p.className = 'lb-cap';
        if (typeof caption === 'string') p.textContent = caption; else p.appendChild(caption);
        body.appendChild(p);
      }
      dlg.showModal();
    }
    // A copy of the figure caption that holds the Enlarge button, without the button.
    function captionOf(btn) {
      var cap = btn.closest('figcaption');
      if (!cap) return null;
      var frag = doc.createDocumentFragment();
      Array.prototype.forEach.call(cap.childNodes, function (n) { if (n !== btn) frag.appendChild(n.cloneNode(true)); });
      return frag;
    }
    // The close event is queued, so skip the cleanup if the dialog was reopened in the meantime.
    dlg.addEventListener('close', function () { if (!dlg.open) body.innerHTML = ''; });
    // Close on a backdrop click only when the press also started on the backdrop, so a drag that starts on the
    // media or the caption (selecting text, say) and ends outside the frame does not close it.
    var downOnBackdrop = false;
    dlg.addEventListener('pointerdown', function (e) { downOnBackdrop = e.target === dlg; });
    dlg.addEventListener('click', function (e) { if (e.target === dlg && downOnBackdrop) dlg.close(); });

    $$('[data-enlarge]').forEach(function (btn) {
      btn.hidden = false;
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-enlarge');
        if (key.indexOf('img:') === 0) {
          var img = doc.createElement('img');
          img.src = key.slice(4);
          var fig = btn.closest('figure');
          var src = fig && fig.querySelector('img');
          img.alt = src ? src.alt : '';
          open(img, captionOf(btn));
        } else {
          var from = doc.getElementById(key);
          if (!from) return;
          from.pause();
          var v = videoEl({
            poster: from.poster,
            label: from.getAttribute('aria-label'),
            sources: $$('source', from).map(function (s) { return { src: s.src, type: s.type }; })
          });
          v.width = from.width; v.height = from.height;
          // The 2x2 grid's quadrant labels are an HTML overlay, not burned into the clip, so carry them along.
          var wrap = doc.createElement('div');
          wrap.className = 'lb-media';
          wrap.appendChild(v);
          var q = from.parentNode.querySelector('.quads');
          if (q) wrap.appendChild(q.cloneNode(true));
          open(wrap, captionOf(btn));
          try { v.currentTime = from.currentTime; } catch (e) {}
        }
      });
    });
    return { open: open, videoEl: videoEl };
  })();

  /* ---------- task picker with looping clips ---------- */
  (function () {
    var bar = $('#task-chips');
    var vids = $$('#task-player video.loop');
    if (!bar || !vids.length) return;
    var chips = $$('button', bar);
    var prompt = $('#task-prompt');
    var visible = {};

    vids.forEach(function (v) {
      var btn = $('[aria-controls="' + v.id + '"]');
      v.removeAttribute('controls'); // the native bar is the JS-off fallback; the overlay button replaces it
      // Registered before bindToggle's handler, so v.paused is still the pre-click state.
      btn.addEventListener('click', function () { v.dataset.userPaused = v.paused ? '' : '1'; });
      v.syncBtn = bindToggle(btn, v);
    });

    function maybePlay(v) {
      if (!reduceMotion && visible[v.id] && !v.dataset.userPaused) play(v);
    }

    bar.hidden = false;
    chips.forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('aria-pressed') === 'true') return;
        chips.forEach(function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
        var task = b.getAttribute('data-task');
        prompt.innerHTML = '';
        var tag = doc.createElement('span');
        tag.className = 'task-name';
        tag.textContent = b.getAttribute('data-name');
        prompt.appendChild(tag);
        prompt.appendChild(doc.createTextNode(' “' + b.getAttribute('data-prompt') + '”'));
        vids.forEach(function (v) {
          setClip(v, 'task-' + task + '-' + v.getAttribute('data-robot'));
          v.setAttribute('aria-label', 'PROXY on the ' + v.getAttribute('data-robot-name') + ': ' + b.getAttribute('data-desc'));
          v.dataset.userPaused = ''; // a new task is a fresh request to watch
          v.syncBtn();
          maybePlay(v);
        });
      });
    });

    if (reduceMotion || !hasIO) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        visible[v.id] = en.isIntersecting;
        if (en.isIntersecting) maybePlay(v);
        else if (!v.paused) v.pause();
      });
    }, { threshold: 0.35 });
    vids.forEach(function (v) { io.observe(v); });
  })();

  /* ---------- side-by-side comparison ---------- */
  (function () {
    var root = $('#cmp');
    if (!root) return;
    var vids = $$('.cmp-row video', root);
    var robots = $$('#cmp-robots button', root);
    var tasks = $$('#cmp-tasks button', root);
    var btn = $('#cmp-play'), lbl = $('#cmp-play-lbl'), now = $('#cmp-now');
    if (vids.length !== 3 || !btn) return;
    var state = { robot: 'panda', task: 'pour' };
    var robotName = { panda: 'Franka Panda', ur5: 'UR5' };
    var taskName = { pour: 'Pour', stack: 'Stack', hook: 'Hook', place: 'Place' };
    // Which trial each clip shows; every clip is trial 2 except DP on Panda Stack (see the footnote).
    var trial = function (m) { return (m === 'dp' && state.robot === 'panda' && state.task === 'stack') ? 4 : 2; };

    // A clip whose sources all failed (NETWORK_NO_SOURCE) never plays, even though paused can stay false.
    function anyPlaying() { return vids.some(function (v) { return !v.paused && !v.ended && v.networkState !== 3; }); }
    function sync() {
      var on = anyPlaying();
      btn.setAttribute('data-playing', on ? 'true' : 'false');
      lbl.textContent = on ? 'Pause all' : 'Play all';
    }
    function playAll() {
      vids.forEach(function (v) { try { v.currentTime = 0; } catch (e) {} play(v); });
    }
    function apply(autoplay) {
      vids.forEach(function (v) {
        var m = v.getAttribute('data-method');
        setClip(v, 'cmp-' + state.robot + '-' + state.task + '-' + m);
        v.setAttribute('aria-label', v.getAttribute('data-method-name') + ', ' + robotName[state.robot] + ', ' + taskName[state.task] +
          ', trial ' + trial(m) + (m === 'dp' ? ', shown at 4 times speed' : ''));
      });
      now.textContent = robotName[state.robot] + ' · ' + taskName[state.task];
      sync();
      if (autoplay && !reduceMotion) playAll();
    }
    function group(list, key) {
      list.forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.getAttribute('aria-pressed') === 'true') return;
          list.forEach(function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
          state[key] = b.getAttribute('data-' + key);
          apply(true);
        });
      });
    }
    group(robots, 'robot');
    group(tasks, 'task');
    btn.addEventListener('click', function () {
      if (anyPlaying()) vids.forEach(function (v) { v.pause(); });
      else playAll();
    });
    vids.forEach(function (v) {
      ['play', 'pause', 'ended', 'emptied'].forEach(function (ev) { v.addEventListener(ev, sync); });
      v.addEventListener('error', sync, true); // <source> errors do not bubble, so listen in the capture phase
    });
    $('.cmp-controls', root).hidden = false;
    sync();
    if (hasIO) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (!en.isIntersecting) vids.forEach(function (v) { if (!v.paused) v.pause(); }); });
      }, { threshold: 0.1 }).observe($('.cmp-row', root));
    }
  })();

  /* ---------- other inline videos stop when scrolled away ---------- */
  ['closed-loop', 'd1-pour', 'd1-place'].forEach(function (id) {
    var v = doc.getElementById(id);
    if (v) pauseOffscreen(v);
  });

  /* ---------- rollout gallery ---------- */
  (function () {
    var tiles = $$('#gallery a.tile');
    if (!tiles.length || !lightbox) return;
    tiles.forEach(function (a) {
      // Plain MP4 links without JS; with JS each tile opens the clip in the lightbox.
      a.setAttribute('role', 'button');
      a.setAttribute('aria-haspopup', 'dialog');
      a.addEventListener('keydown', function (e) { if (e.key === ' ') { e.preventDefault(); a.click(); } });
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var slug = a.getAttribute('data-clip');
        var lblEl = a.querySelector('.tile-lbl'), small = lblEl.querySelector('small');
        var label = lblEl.firstChild.textContent.trim() + (small ? ', ' + small.textContent.trim() : '');
        var v = lightbox.videoEl({
          poster: 'media/' + slug + '.poster.webp',
          label: 'PROXY run: ' + label,
          sources: [
            { src: 'media/' + slug + '.v1.webm', type: 'video/webm' },
            { src: 'media/' + slug + '.v1.mp4', type: 'video/mp4' }
          ]
        });
        lightbox.open(v, 'PROXY · ' + label);
        if (!reduceMotion) play(v);
      });
    });
  })();

  /* ---------- BibTeX copy ---------- */
  (function () {
    var btn = $('#bib-copy'), out = $('#bib-status'), pre = $('#bib-text');
    if (!btn || !pre || !navigator.clipboard) return;
    var timer = null;
    btn.hidden = false;
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(pre.textContent).then(function () {
        out.textContent = 'Copied to the clipboard.';
      }, function () {
        out.textContent = 'Copy failed; select the text above instead.';
      });
      clearTimeout(timer);
      timer = setTimeout(function () { out.textContent = ''; }, 4000);
    });
  })();
})();
