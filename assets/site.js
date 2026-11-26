/* Theme toggle, scroll reveal, and metric count-up. No dependencies. */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var toggle = document.querySelector("[data-theme-toggle]");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var current = root.getAttribute("data-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* private mode */ }
    });
  }

  function countUp(el) {
    var target = el.textContent.trim();
    var from = (el.getAttribute("data-from") || "").trim();
    var suffix = /%$/.test(target) ? "%" : "";
    var end = parseFloat(target);
    var start = parseFloat(from);
    if (isNaN(end) || isNaN(start) || !/^[\d.]+%?$/.test(target)) return;
    var decimals = (target.replace("%", "").split(".")[1] || "").length;
    var t0 = null;
    var duration = 900;
    function frame(now) {
      if (t0 === null) t0 = now;
      var p = Math.min(1, (now - t0) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (start + (end - start) * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = target;
    }
    requestAnimationFrame(frame);
  }

  var items = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  function show(el) {
    el.classList.add("is-in");
    if (reduce) return;
    Array.prototype.forEach.call(el.querySelectorAll("[data-count]"), countUp);
  }
  if (reduce || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("is-in"); });
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      show(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
  items.forEach(function (el, i) {
    el.style.transitionDelay = Math.min(i % 4, 3) * 60 + "ms";
    observer.observe(el);
  });
  // Safety net: never leave content hidden if the observer does not fire.
  window.setTimeout(function () {
    items.forEach(function (el) {
      var rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && !el.classList.contains("is-in")) show(el);
    });
  }, 1200);
})();
