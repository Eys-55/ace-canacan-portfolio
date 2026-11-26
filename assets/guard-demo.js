/* Workflow Guard demo: runs guard.js on the export in the editor and prints the hook's decision. */
(function () {
  "use strict";
  var data = document.getElementById("guard-fixtures");
  var input = document.querySelector("[data-guard-input]");
  if (!data || !input || !window.N8nGuard) return;

  var fixtures = JSON.parse(data.textContent);
  var samples = document.querySelector("[data-guard-samples]");
  var fileLabel = document.querySelector("[data-guard-file]");
  var term = document.querySelector("[data-guard-term]");
  var verdict = document.querySelector("[data-guard-verdict]");
  var raw = document.querySelector("[data-guard-raw]");
  var runButton = document.querySelector("[data-guard-run]");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var currentFile = fixtures[0].file;
  var runId = 0;

  function select(index) {
    var fixture = fixtures[index];
    currentFile = fixture.file;
    input.value = fixture.json;
    input.scrollTop = 0;
    fileLabel.textContent = "workflows/" + fixture.file;
    Array.prototype.forEach.call(samples.children, function (button, i) {
      button.classList.toggle("is-on", i === index);
      button.setAttribute("aria-pressed", i === index ? "true" : "false");
    });
  }

  fixtures.forEach(function (fixture, index) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = fixture.label;
    button.addEventListener("click", function () { select(index); run(); });
    samples.appendChild(button);
  });

  input.addEventListener("input", function () {
    Array.prototype.forEach.call(samples.children, function (button) {
      button.classList.remove("is-on");
      button.setAttribute("aria-pressed", "false");
    });
    currentFile = "pasted-export.json";
    fileLabel.textContent = "workflows/" + currentFile + " (edited)";
  });

  function line(text, cls) {
    var p = document.createElement("p");
    p.className = "line" + (cls ? " " + cls : "");
    p.textContent = text;
    return p;
  }

  function buildLines(result) {
    var lines = [];
    lines.push(line("$ n8n import:workflow --input=workflows/" + currentFile));
    lines.push(line("PreToolUse hook: n8n-guard", "t-dim gap"));
    if (result.parseError) {
      lines.push(line("✗ " + result.parseError, "t-bad ind"));
    } else {
      lines.push(line("validating " + result.nodeCount + " nodes", "t-dim ind"));
      result.checks.forEach(function (check) {
        lines.push(line((check.passed ? "✓ " : "✗ ") + check.title, (check.passed ? "t-ok" : "t-bad") + " ind"));
        result.findings.filter(function (f) { return f.rule === check.rule; }).forEach(function (f) {
          var where = f.node ? "node \"" + f.node + "\" at " + f.path : f.path;
          lines.push(line("  " + f.detail, "ind"));
          lines.push(line("  " + where + (f.preview ? "  =  " + f.preview : ""), "t-dim ind"));
        });
      });
    }
    if (result.ok) {
      lines.push(line("no decision returned: import proceeds through the normal permission flow", "t-ok gap"));
      return lines;
    }
    lines.push(line("permissionDecision: deny", "t-bad gap"));
    var seen = [];
    result.findings.forEach(function (f) {
      var rule = window.N8nGuard.RULES[f.rule];
      if (seen.indexOf(rule.skill) !== -1) return;
      seen.push(rule.skill);
      lines.push(line("Agent Skill: " + rule.skill, "gap"));
      rule.steps.forEach(function (step, i) { lines.push(line((i + 1) + ". " + step, "t-dim ind")); });
    });
    return lines;
  }

  function run() {
    var id = ++runId;
    var result = window.N8nGuard.validate(input.value);
    var output = window.N8nGuard.hookOutput(result);
    var lines = buildLines(result);
    term.textContent = "";
    verdict.textContent = "running";
    verdict.removeAttribute("data-state");
    raw.textContent = "Running…";

    function finish() {
      verdict.textContent = result.ok ? "allow" : "deny";
      verdict.setAttribute("data-state", result.ok ? "allow" : "deny");
      raw.textContent = output ? JSON.stringify(output, null, 2) : "(no output, exit 0: the hook makes no decision)";
    }

    if (reduce) {
      lines.forEach(function (p) { term.appendChild(p); });
      finish();
      return;
    }
    var i = 0;
    (function step() {
      if (id !== runId) return;
      if (i >= lines.length) { finish(); return; }
      term.appendChild(lines[i++]);
      window.setTimeout(step, 85);
    })();
  }

  runButton.addEventListener("click", run);
  select(0);
})();
