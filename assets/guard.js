/* n8n Workflow Guard: validator for exported n8n workflow JSON.
 * Runs in the browser (window.N8nGuard) and in Node (module.exports).
 * Three checks: error workflow assigned, no inline secrets, community nodes on the allowlist.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.N8nGuard = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CORE_PREFIXES = ["n8n-nodes-base.", "@n8n/n8n-nodes-langchain."];

  var SECRET_VALUE_PATTERNS = [
    { kind: "bearer token", re: /Bearer\s+[A-Za-z0-9._~+\/-]{16,}=*/ },
    { kind: "sk- style API key", re: /\bsk-[A-Za-z0-9_-]{16,}/ },
    { kind: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
    { kind: "AWS access key ID", re: /\bAKIA[0-9A-Z]{16}\b/ }
  ];
  var SECRET_NAME_RE = /(authorization|api[-_ ]?key|token|secret|password|passwd)/i;
  var CODE_ASSIGN_RE = /(api[-_]?key|token|secret|password)\s*[:=]\s*["'`][^"'`\s]{12,}["'`]/i;

  var RULES = {
    "missing-error-workflow": {
      title: "Error workflow assigned",
      skill: "fix-missing-error-workflow",
      steps: [
        "Open the workflow settings and set Error Workflow to the shared error handler.",
        "Re-export the workflow JSON and run the import again."
      ]
    },
    "inline-secret": {
      title: "No inline secrets",
      skill: "fix-inline-secret",
      steps: [
        "Move the value into an n8n credential and select that credential on the node.",
        "Rotate the exposed key if the export was ever committed or shared.",
        "Re-export the workflow JSON and run the import again."
      ]
    },
    "unlisted-community-node": {
      title: "Community nodes on the allowlist",
      skill: "fix-unlisted-community-node",
      steps: [
        "Replace the node with a core n8n node if one does the job.",
        "Otherwise open a request to add the package to the repository allowlist.",
        "Re-export the workflow JSON and run the import again."
      ]
    }
  };

  function isExpression(value) {
    return value.charAt(0) === "=" && value.indexOf("{{") !== -1;
  }

  function mask(value) {
    var shown = value.slice(0, 10);
    return shown + "… (" + value.length + " chars)";
  }

  function matchValue(value) {
    for (var i = 0; i < SECRET_VALUE_PATTERNS.length; i++) {
      var m = SECRET_VALUE_PATTERNS[i].re.exec(value);
      if (m) return { kind: SECRET_VALUE_PATTERNS[i].kind, text: m[0] };
    }
    return null;
  }

  function scanParams(value, path, nodeName, findings, keyName) {
    if (typeof value === "string") {
      var hit = matchValue(value);
      if (hit) {
        findings.push({ rule: "inline-secret", node: nodeName, path: path, detail: hit.kind, preview: mask(hit.text) });
        return;
      }
      if (/code$/i.test(keyName || "") && CODE_ASSIGN_RE.test(value)) {
        findings.push({ rule: "inline-secret", node: nodeName, path: path, detail: "inline secret in code", preview: mask(CODE_ASSIGN_RE.exec(value)[0]) });
        return;
      }
      if (keyName && SECRET_NAME_RE.test(keyName) && value.length >= 12 && !isExpression(value)) {
        findings.push({ rule: "inline-secret", node: nodeName, path: path, detail: "literal value in \"" + keyName + "\"", preview: mask(value) });
      }
      return;
    }
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) scanParams(value[i], path + "[" + i + "]", nodeName, findings, keyName);
      return;
    }
    if (value && typeof value === "object") {
      // n8n name/value pairs, e.g. header parameters.
      if (typeof value.name === "string" && typeof value.value === "string" &&
          SECRET_NAME_RE.test(value.name) && value.value.length >= 8 &&
          !isExpression(value.value) && !matchValue(value.value)) {
        findings.push({ rule: "inline-secret", node: nodeName, path: path + ".value", detail: "literal value for \"" + value.name + "\"", preview: mask(value.value) });
      }
      Object.keys(value).forEach(function (key) {
        scanParams(value[key], path + "." + key, nodeName, findings, key);
      });
    }
  }

  function packageOf(type) {
    var cut = type.lastIndexOf(".");
    return cut === -1 ? type : type.slice(0, cut);
  }

  function validate(input, options) {
    var allowlist = (options && options.allowlist) || [];
    var wf = input;
    if (typeof input === "string") {
      try {
        wf = JSON.parse(input);
      } catch (err) {
        return { ok: false, parseError: "Export is not valid JSON: " + err.message, findings: [], checks: [], nodeCount: 0 };
      }
    }
    if (!wf || typeof wf !== "object" || !Array.isArray(wf.nodes)) {
      return { ok: false, parseError: "Not an n8n workflow export: no \"nodes\" array.", findings: [], checks: [], nodeCount: 0 };
    }

    var findings = [];

    // A workflow that starts from an Error Trigger is itself the error handler.
    var isErrorHandler = wf.nodes.some(function (node) { return node && node.type === "n8n-nodes-base.errorTrigger"; });
    var errorWorkflow = wf.settings && wf.settings.errorWorkflow;
    if (!isErrorHandler && (typeof errorWorkflow !== "string" || !errorWorkflow.trim())) {
      findings.push({ rule: "missing-error-workflow", node: null, path: "settings.errorWorkflow", detail: "no error workflow assigned", preview: null });
    }

    wf.nodes.forEach(function (node) {
      var name = node && node.name ? String(node.name) : "(unnamed node)";
      if (node && node.parameters) scanParams(node.parameters, "parameters", name, findings, null);
      var type = node && typeof node.type === "string" ? node.type : "";
      var core = CORE_PREFIXES.some(function (prefix) { return type.indexOf(prefix) === 0; });
      if (type && !core && allowlist.indexOf(packageOf(type)) === -1) {
        findings.push({ rule: "unlisted-community-node", node: name, path: "type", detail: "package \"" + packageOf(type) + "\" is not on the allowlist", preview: type });
      }
    });

    var checks = Object.keys(RULES).map(function (rule) {
      var count = findings.filter(function (f) { return f.rule === rule; }).length;
      return { rule: rule, title: RULES[rule].title, passed: count === 0, count: count };
    });

    return { ok: findings.length === 0, parseError: null, findings: findings, checks: checks, nodeCount: wf.nodes.length };
  }

  function describe(finding) {
    var where = finding.node ? "node \"" + finding.node + "\", " + finding.path : finding.path;
    return finding.rule + ": " + finding.detail + " (" + where + ")";
  }

  /* Which Bash commands the hook gates. */
  function isGuardedCommand(command) {
    if (/\bn8n\s+import:workflow\b/.test(command)) return true;
    var push = /\bcurl\b/.test(command) && /\/api\/v1\/workflows\b/.test(command) &&
      /(-X\s*|--request\s+)(POST|PUT|PATCH)\b|(\s-d\s|--data\b|--json\b)/.test(command);
    return push;
  }

  /* The JSON a PreToolUse hook prints to deny the tool call. Null means no decision. */
  function hookOutput(result) {
    if (result.ok) return null;
    var reason;
    if (result.parseError) {
      reason = "n8n-guard: " + result.parseError;
    } else {
      var skills = [];
      result.findings.forEach(function (f) {
        if (skills.indexOf(RULES[f.rule].skill) === -1) skills.push(RULES[f.rule].skill);
      });
      reason = "n8n-guard blocked this command. " + result.findings.map(describe).join("; ") +
        ". Fix steps are in the Agent Skill" + (skills.length > 1 ? "s " : " ") + skills.join(", ") + ".";
    }
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason
      }
    };
  }

  return { validate: validate, hookOutput: hookOutput, isGuardedCommand: isGuardedCommand, describe: describe, RULES: RULES };
});
