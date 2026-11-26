/* Intake Reply Eval Kit replay: sample data only, no network calls. */
(function () {
  "use strict";
  var data = document.getElementById("eval-scenarios");
  var grid = document.querySelector("[data-eval-tiles]");
  if (!data || !grid) return;

  var spec = JSON.parse(data.textContent);
  var scenarios = spec.scenarios;
  var dims = spec.dimensions;
  var check = document.querySelector("[data-eval-check]");
  var stateEl = document.querySelector("[data-eval-state]");
  var dimsEl = document.querySelector("[data-eval-dims]");
  var detail = document.querySelector("[data-eval-detail]");
  var runButton = document.querySelector("[data-eval-run]");
  var promptButtons = Array.prototype.slice.call(document.querySelectorAll("[data-eval-prompt]"));
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var prompt = "main";
  var hasRun = false;
  var selected = -1;
  var runId = 0;

  function grade(scenario) {
    var result = {};
    dims.forEach(function (dim) {
      var failed = prompt === "pr" && scenario.fail && scenario.fail.dimension === dim;
      var note = failed ? scenario.fail.note
        : dim === "escalation" ? spec.passNotes.escalation[scenario.expect]
        : spec.passNotes[dim];
      result[dim] = { pass: !failed, note: note };
    });
    return result;
  }

  function passed(scenario) {
    return !(prompt === "pr" && scenario.fail);
  }

  var tiles = scenarios.map(function (scenario, index) {
    var tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.setAttribute("aria-pressed", "false");
    tile.setAttribute("aria-label", scenario.id + ", " + scenario.category + ", not run");
    tile.addEventListener("click", function () { choose(index); });
    grid.appendChild(tile);
    return tile;
  });

  function el(tag, text, cls) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    node.textContent = text;
    return node;
  }

  function choose(index) {
    selected = index;
    tiles.forEach(function (tile, i) { tile.setAttribute("aria-pressed", i === index ? "true" : "false"); });
    renderDetail();
  }

  function renderDetail() {
    if (selected < 0) return;
    var scenario = scenarios[selected];
    detail.textContent = "";
    detail.appendChild(el("p", scenario.id + " · " + scenario.category + " · " + scenario.channel, "eyebrow"));
    detail.appendChild(el("h3", scenario.inquiry + "."));
    detail.appendChild(el("p", "Expected: " + (scenario.expect === "escalate" ? "hand off to staff" : "reply directly"), "t-dim"));
    if (!hasRun) {
      detail.appendChild(el("p", "Run the suite to grade this scenario.", "t-dim"));
      return;
    }
    var grades = grade(scenario);
    var list = document.createElement("ul");
    dims.forEach(function (dim) {
      var item = document.createElement("li");
      item.appendChild(el("span", dim));
      item.appendChild(el("span", grades[dim].pass ? "pass" : "fail", grades[dim].pass ? "t-ok" : "t-bad"));
      item.appendChild(el("span", grades[dim].note));
      list.appendChild(item);
    });
    detail.appendChild(list);
  }

  function summary() {
    var failures = scenarios.filter(function (s) { return !passed(s); });
    dimsEl.textContent = "";
    dims.forEach(function (dim) {
      var failed = failures.filter(function (s) { return s.fail.dimension === dim; }).length;
      var box = document.createElement("div");
      box.appendChild(el("dt", dim));
      box.appendChild(el("dd", (scenarios.length - failed) + "/" + scenarios.length, failed ? "t-bad" : "t-ok"));
      dimsEl.appendChild(box);
    });
    if (failures.length) {
      check.setAttribute("data-state", "fail");
      stateEl.textContent = "Failed: " + failures.length + " regression" + (failures.length === 1 ? "" : "s");
    } else {
      check.setAttribute("data-state", "pass");
      stateEl.textContent = "Passed: " + scenarios.length + " of " + scenarios.length;
    }
  }

  function reset() {
    hasRun = false;
    tiles.forEach(function (tile, i) {
      tile.removeAttribute("data-state");
      tile.setAttribute("aria-label", scenarios[i].id + ", " + scenarios[i].category + ", not run");
    });
    check.setAttribute("data-state", "idle");
    stateEl.textContent = "Waiting to run";
    dimsEl.textContent = "";
    renderDetail();
  }

  function settle(index) {
    var ok = passed(scenarios[index]);
    tiles[index].setAttribute("data-state", ok ? "ok" : "bad");
    tiles[index].setAttribute("aria-label", scenarios[index].id + ", " + scenarios[index].category + ", " + (ok ? "passed" : "regression"));
  }

  function run() {
    var id = ++runId;
    reset();
    check.setAttribute("data-state", "idle");
    stateEl.textContent = "Running " + scenarios.length + " scenarios";

    function done() {
      hasRun = true;
      summary();
      if (selected < 0) {
        var firstFail = -1;
        scenarios.some(function (s, i) { if (!passed(s)) { firstFail = i; return true; } return false; });
        if (firstFail >= 0) choose(firstFail);
      } else {
        renderDetail();
      }
    }

    if (reduce) {
      scenarios.forEach(function (_, i) { settle(i); });
      done();
      return;
    }
    var i = 0;
    (function step() {
      if (id !== runId) return;
      for (var n = 0; n < 3 && i < scenarios.length; n++) settle(i++);
      if (i >= scenarios.length) { done(); return; }
      window.setTimeout(step, 45);
    })();
  }

  promptButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      prompt = button.getAttribute("data-eval-prompt");
      promptButtons.forEach(function (other) {
        var on = other === button;
        other.classList.toggle("is-on", on);
        other.setAttribute("aria-pressed", on ? "true" : "false");
      });
      runId++;
      selected = -1;
      tiles.forEach(function (tile) { tile.setAttribute("aria-pressed", "false"); });
      detail.textContent = "";
      detail.appendChild(el("p", "Select a tile to see the scenario and its grade.", "t-dim"));
      reset();
    });
  });
  runButton.addEventListener("click", run);
})();
