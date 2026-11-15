import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import * as acorn from "acorn";

const CLIENT_PATH = path.resolve("client/client.js");
const CLIENT_SRC = fs.readFileSync(CLIENT_PATH, "utf8");
const EDGE_PATH = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

function extractTooltipSymbols() {
	const ast = acorn.parse(CLIENT_SRC, { ecmaVersion: "latest", sourceType: "script" });
	let cssInit = null;
	let iconShapeCss = "";
	const funcs = {};
	const consts = {};

	function walk(node) {
		if (!node || typeof node !== "object") return;
		if (node.type === "VariableDeclarator" && node.id && node.id.type === "Identifier") {
			if (node.id.name === "ICON_SHAPE_CSS" && node.init) {
				iconShapeCss = vm.runInNewContext(CLIENT_SRC.slice(node.init.start, node.init.end));
			} else if (node.id.name === "CSS" && node.init) {
				cssInit = CLIENT_SRC.slice(node.init.start, node.init.end);
			} else if ((node.id.name === "CPM_TOOLTIP_MARGIN" || node.id.name === "CPM_TOOLTIP_MARGIN_Y" || node.id.name === "CPM_TOOLTIP_GAP") && node.init) {
				consts[node.id.name] = CLIENT_SRC.slice(node.start, node.end);
			}
		} else if (
			node.type === "FunctionDeclaration" &&
			node.id &&
			[
				"getTooltipViewport",
				"placeTooltip",
				"isAnchoredTipAligned",
				"restoreAnchorTarget",
				"restoreDescribedBy",
				"applyFallbackPlacement",
				"CustomTooltip",
			].includes(node.id.name)
		) {
			funcs[node.id.name] = CLIENT_SRC.slice(node.start, node.end);
		}
		for (const key of Object.keys(node)) {
			if (key === "start" || key === "end") continue;
			const child = node[key];
			if (Array.isArray(child)) {
				for (const item of child) walk(item);
			} else if (child && typeof child === "object" && typeof child.type === "string") {
				walk(child);
			}
		}
	}

	walk(ast);
	assert.ok(cssInit, "Expected const CSS in client/client.js");
	const cssVal = vm.runInNewContext(cssInit, { ICON_SHAPE_CSS: iconShapeCss });
	assert.ok(funcs.getTooltipViewport, "Expected function getTooltipViewport in client/client.js");
	assert.ok(funcs.placeTooltip, "Expected function placeTooltip in client/client.js");
	assert.ok(funcs.isAnchoredTipAligned, "Expected function isAnchoredTipAligned in client/client.js");
	assert.ok(funcs.restoreAnchorTarget, "Expected function restoreAnchorTarget in client/client.js");
	assert.ok(funcs.restoreDescribedBy, "Expected function restoreDescribedBy in client/client.js");
	assert.ok(funcs.applyFallbackPlacement, "Expected function applyFallbackPlacement in client/client.js");
	assert.ok(funcs.CustomTooltip, "Expected function CustomTooltip in client/client.js");

	const helperSource = `
		const ${consts.CPM_TOOLTIP_MARGIN};
		const ${consts.CPM_TOOLTIP_MARGIN_Y};
		const ${consts.CPM_TOOLTIP_GAP};
		${funcs.getTooltipViewport}
		${funcs.placeTooltip}
		${funcs.isAnchoredTipAligned}
		${funcs.restoreAnchorTarget}
		${funcs.restoreDescribedBy}
		${funcs.applyFallbackPlacement}
	`;
	const sandbox = { Math, window: { innerWidth: 1280, innerHeight: 800 } };
	vm.runInNewContext(
		helperSource + "; this.placeTooltip = placeTooltip; this.isAnchoredTipAligned = isAnchoredTipAligned; this.restoreDescribedBy = restoreDescribedBy; this.applyFallbackPlacement = applyFallbackPlacement;",
		sandbox
	);
	return { CSS: cssVal, helperSource, customTooltipSource: funcs.CustomTooltip, ...sandbox };
}

const { CSS, helperSource, customTooltipSource, placeTooltip, isAnchoredTipAligned, restoreDescribedBy } = extractTooltipSymbols();

test("tooltip CSS follows modern-web-guidance and apple-design rules", () => {
	assert.match(CSS, /\.cpm-tooltip\s*\{[\s\S]*transition-behavior:\s*allow-discrete/);
	assert.match(CSS, /\.cpm-tooltip\s*\{[\s\S]*overlay\s+0\.09s/);
	assert.match(CSS, /:is\(:popover-open,\s*\.\\\:popover-open,\s*\[data-open="true"\]\)/);
	assert.match(CSS, /@starting-style\s*\{[\s\S]*\.cpm-tooltip:is\(:popover-open/);
	assert.match(CSS, /@supports\s*\(position-area:\s*block-start\)\s*and\s*\(anchor-name:\s*--cpm-tip-anchor\)/);
	assert.match(CSS, /justify-self:\s*anchor-center/);
	assert.match(CSS, /position-try-fallbacks:\s*flip-block/);
	assert.match(CSS, /@supports\s*\(container-type:\s*anchored\)\s*\{[\s\S]*@container\s+anchored\(fallback:\s*flip-block\)/);
	assert.match(CSS, /\.cpm-tooltip-surface,\s*\.cpm-smart-hover\s*\{\s*border-radius:\s*var\(--dsw-radius-lg,\s*16px\);\s*corner-shape:\s*squircle;\s*\}/);
	const surfaceRule = CSS.match(/\.cpm-tooltip-surface\s*\{([^}]+)\}/);
	assert.ok(surfaceRule, "Expected .cpm-tooltip-surface rule");
	assert.doesNotMatch(surfaceRule[1], /border-radius:|corner-shape:/, "corner radius & squircle must reuse the shared .cpm-smart-hover rule");
	assert.doesNotMatch(surfaceRule[1], /inset\s+0\s+1px\s+0/, "must not stack an inset top highlight that thickens the top stroke");
	assert.match(surfaceRule[1], /background-clip:\s*padding-box/);
	assert.match(CSS, /\.cpm-tooltip\.cpm-dark\s+\.cpm-tooltip-surface\s*\{([^}]+)\}/);
	assert.doesNotMatch(CSS.match(/\.cpm-tooltip\.cpm-dark\s+\.cpm-tooltip-surface\s*\{([^}]+)\}/)[1], /inset\s+0\s+1px\s+0/);
	assert.match(CSS, /opacity\s+0\.09s\s+cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)[\s\S]*transform\s+0\.14s\s+cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)[\s\S]*transition:\s*opacity\s+0\.09s\s+cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\),\s*transform\s+0\.14s\s+linear\(0,/);
	assert.match(CSS, /\.cpm-tooltip-surface[\s\S]*backdrop-filter:\s*blur\(20px\)\s*saturate\(180%\)/);
	assert.match(CSS, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.cpm-tooltip-surface\s*\{[\s\S]*transform:\s*none/);
	assert.match(CSS, /@media\s*\(prefers-reduced-transparency:\s*reduce\)\s*\{[\s\S]*\.cpm-tooltip-surface[\s\S]*backdrop-filter:\s*none/);
	assert.match(CSS, /@media\s*\(prefers-contrast:\s*more\)\s*\{[\s\S]*\.cpm-tooltip-surface[\s\S]*border-color:/);
	assert.match(CSS, /@media\s*\(forced-colors:\s*active\)[\s\S]*\.cpm-tooltip-surface/);

	// Must not put unconditional inset: auto or margin: 0 directly on base .cpm-tooltip rule.
	const baseRuleMatch = CSS.match(/\.cpm-tooltip\s*\{([\s\S]*?)\}/);
	assert.ok(baseRuleMatch, "Expected base .cpm-tooltip rule");
	assert.doesNotMatch(baseRuleMatch[1], /\binset\s*:\s*auto/);
	assert.doesNotMatch(baseRuleMatch[1], /\bmargin\s*:\s*0/);

	// Client source contract checks (safe globals & accessibility attributes).
	assert.match(CLIENT_SRC, /setAttribute\(["']popover["'],\s*["']hint["']\)/);
	assert.match(CLIENT_SRC, /role:\s*["']tooltip["']/);
	assert.match(CLIENT_SRC, /aria-describedby/);
	assert.match(CLIENT_SRC, /window\.CSS/);
	assert.doesNotMatch(CLIENT_SRC, /[^.\w]CSS\.supports\(/);
});

test("placeTooltip centers cleanly above trigger without left shift and clamps/flips correctly", () => {
	const vp = { width: 1280, height: 800 };

	// Normal centered Update button with "可更新至 v1.0.0" (~104px wide).
	const btn = { left: 520, top: 300, right: 586, bottom: 332, width: 66, height: 32 };
	const posUpdate = placeTooltip(btn, 104, 26, vp);
	assert.equal(posUpdate.placement, "top");
	assert.equal(posUpdate.left, 501);
	assert.equal(posUpdate.top, 266);
	assert.equal((posUpdate.left + 52) - (btn.left + 33), 0);
	assert.equal(btn.top - (posUpdate.top + 26), 8);
	assert.equal(posUpdate.originX, "50%");
	assert.equal(posUpdate.originY, "100%");

	// Wider disabled tooltip "当前已是最新版本 (v1.0.0)" (~172px wide).
	const posLatest = placeTooltip(btn, 172, 26, vp);
	assert.equal(posLatest.left + 86, btn.left + 33);
	assert.equal(btn.top - (posLatest.top + 26), 8);

	// Left edge clamp keeps 12px margin and tracks button center via originX.
	const leftEdgeBtn = { left: 8, top: 300, right: 48, bottom: 332, width: 40, height: 32 };
	const posLeft = placeTooltip(leftEdgeBtn, 140, 26, vp);
	assert.equal(posLeft.left, 12);
	assert.equal(posLeft.originX, "11.4%");

	// Right edge clamp keeps 12px margin and tracks button center via originX.
	const rightEdgeBtn = { left: 1220, top: 300, right: 1268, bottom: 332, width: 48, height: 32 };
	const posRight = placeTooltip(rightEdgeBtn, 140, 26, vp);
	assert.equal(posRight.left, 1128);
	assert.equal(posRight.originX, "82.9%");

	// Near top viewport edge flips cleanly below button with 8px gap.
	const topEdgeBtn = { left: 520, top: 18, right: 586, bottom: 50, width: 66, height: 32 };
	const posFlip = placeTooltip(topEdgeBtn, 104, 26, vp);
	assert.equal(posFlip.placement, "bottom");
	assert.equal(posFlip.top, 58);
	assert.equal(posFlip.top - topEdgeBtn.bottom, 8);
	assert.equal(posFlip.originY, "0%");
});

test("isAnchoredTipAligned detects centered placement, old left-skew bug, and contain:layout failures", () => {
	const vp = { width: 1280, height: 800 };
	const btn = { left: 520, top: 300, right: 586, bottom: 332, width: 66, height: 32 };

	assert.equal(
		isAnchoredTipAligned(btn, { left: 501, top: 266, width: 104, height: 26 }, vp),
		true
	);
	assert.equal(
		isAnchoredTipAligned(btn, { left: 501, top: 340, width: 104, height: 26 }, vp),
		true
	);
	// Simulated old naive heuristic left shift (-24px): must reject so fallback corrects it.
	assert.equal(
		isAnchoredTipAligned(btn, { left: 477, top: 266, width: 104, height: 26 }, vp),
		false
	);
	// Simulated contain:layout fallback drop at (12, 0): must reject so fallback corrects it.
	assert.equal(
		isAnchoredTipAligned(btn, { left: 12, top: 0, width: 104, height: 26 }, vp),
		false
	);
});

test("CustomTooltip retains exit text during close fade, preserves existing aria-describedby tokens, and sets data-anchored=false before showPopover when unsupported", () => {
	const attrs = new Map([["aria-describedby", "external-hint"]]);
	const styleMap = new Map();
	const target = {
		getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
		setAttribute: (k, v) => attrs.set(k, String(v)),
		removeAttribute: (k) => attrs.delete(k),
		getBoundingClientRect: () => ({ left: 520, top: 300, right: 586, bottom: 332, width: 66, height: 32 }),
		style: {
			getPropertyValue: (k) => styleMap.get(k) || "",
			getPropertyPriority: () => "",
			setProperty: (k, v) => styleMap.set(k, String(v)),
			removeProperty: (k) => styleMap.delete(k),
		},
	};

	const popAttrs = new Map();
	const popStyles = new Map();
	let isPopOpen = false;
	const callLog = [];
	const popEl = {
		setAttribute: (k, v) => {
			popAttrs.set(k, String(v));
			callLog.push(`set:${k}=${v}`);
		},
		getAttribute: (k) => (popAttrs.has(k) ? popAttrs.get(k) : null),
		removeAttribute: (k) => popAttrs.delete(k),
		matches: (sel) => sel === ":popover-open" && isPopOpen,
		showPopover: () => {
			isPopOpen = true;
			callLog.push(`showPopover:anchored=${popAttrs.get("data-anchored")}`);
		},
		hidePopover: () => {
			isPopOpen = false;
			callLog.push("hidePopover");
		},
		getAnimations: () => [],
		getBoundingClientRect: () => ({ left: 501, top: 266, right: 605, bottom: 292, width: 104, height: 26 }),
		style: {
			set left(v) { popStyles.set("left", v); },
			get left() { return popStyles.get("left") || ""; },
			set top(v) { popStyles.set("top", v); },
			get top() { return popStyles.get("top") || ""; },
			setProperty: (k, v) => popStyles.set(k, String(v)),
			removeProperty: (k) => popStyles.delete(k),
		},
	};

	const refs = [];
	const cleanups = [];
	let hookCursor = 0;
	const FakeHTMLElement = function () {};
	FakeHTMLElement.prototype.showPopover = () => {};

	const sandbox = {
		Math,
		Promise,
		setTimeout: () => 1,
		clearTimeout: () => {},
		HTMLElement: FakeHTMLElement,
		document: { body: {} },
		window: {
			innerWidth: 1280,
			innerHeight: 800,
			CSS: { supports: () => false },
		},
		h: (type, props, ...children) => ({ type, props: props || {}, children }),
		useRef: (init) => {
			const idx = hookCursor++;
			if (!(idx in refs)) refs[idx] = { current: init };
			return refs[idx];
		},
		useSafeLayoutEffect: (fn) => cleanups.push(fn),
		useEffect: () => {},
	};
	vm.runInNewContext(
		helperSource + "\n" + customTooltipSource + "; this.CustomTooltip = CustomTooltip;",
		sandbox
	);

	function renderTip(tooltip) {
		hookCursor = 0;
		cleanups.length = 0;
		const tree = sandbox.CustomTooltip({ tooltip, isDark: true });
		refs[0].current = popEl;
		for (const fn of cleanups) fn();
		return tree;
	}

	const openTree = renderTip({ target, text: "可更新至 v1.0.0", source: "pointer" });
	assert.equal(openTree.props["data-open"], "true");
	assert.equal(openTree.children[0].children[0], "可更新至 v1.0.0");
	assert.equal(attrs.get("aria-describedby"), "external-hint cpm-tooltip");
	assert.equal(styleMap.get("anchor-name"), "--cpm-tip-anchor");
	assert.ok(callLog.includes("showPopover:anchored=false"), `Expected data-anchored=false before showPopover, got ${callLog.join(", ")}`);
	assert.equal(popStyles.get("left"), "501px");
	assert.equal(popStyles.get("top"), "266px");

	// Closing keeps lastTextRef visible inside .cpm-tooltip-surface for the exit fade and preserves "external-hint".
	const closeTree = renderTip(null);
	assert.equal(closeTree.props["data-open"], "false");
	assert.equal(closeTree.props["aria-hidden"], "true");
	assert.equal(closeTree.children[0].children[0], "可更新至 v1.0.0");
	assert.equal(attrs.get("aria-describedby"), "external-hint");
	assert.equal(styleMap.has("anchor-name"), false);
});

test("real Edge layout aligns Update tooltip dead-center above button across manage scroll, transform, flip, and contain fallback", {
	skip: !fs.existsSync(EDGE_PATH) && "Microsoft Edge not installed",
}, () => {
	const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
html, body { margin: 0; padding: 0; width: 1280px; height: 800px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.cpm-root { width: 100%; height: 100%; overflow: hidden; }
${CSS}
.host-transform {
	position: relative;
	transform: translate(17px, 12px) scale(0.9);
	overflow: hidden;
	width: 520px;
	height: 220px;
}
.host-scoped {
	position: relative;
	contain: layout;
	anchor-scope: --cpm-tip-anchor;
	width: 300px;
	height: 120px;
}
</style>
</head>
<body>
<div class="cpm-root cpm-dark">
	<div class="cpm-manage" id="manage" style="height: 240px; padding: 48px 180px;">
		<div class="cpm-title-row">
			<button id="btn-manage" class="cpm-btn cpm-btn-secondary">Update</button>
		</div>
	</div>

	<div class="host-transform" id="transform-host" style="margin: 20px 0 0 180px; padding: 70px 120px;">
		<button id="btn-transform" class="cpm-btn cpm-btn-secondary">Update</button>
	</div>

	<button id="btn-top-edge" class="cpm-btn cpm-btn-secondary" style="position: fixed; left: 960px; top: 10px;">Update</button>
	<button id="btn-right-edge" class="cpm-btn cpm-btn-secondary" style="position: fixed; right: 8px; top: 380px;">Update</button>

	<div class="host-scoped" style="position: fixed; left: 400px; top: 580px; padding: 50px 80px;">
		<button id="btn-scoped" class="cpm-btn cpm-btn-secondary">Update</button>
	</div>

	<div id="browse-preview-ref" class="cpm-preview-popover cpm-smart-hover" style="position: fixed; left: 20px; top: 20px; width: 200px; height: 80px;"></div>

	<div id="cpm-tooltip" popover="hint" role="tooltip" class="cpm-tooltip cpm-dark" data-open="false">
		<div class="cpm-tooltip-surface"></div>
	</div>
</div>
<script>
${helperSource}

function measureScenario(trigger, text, forceFallback) {
	const tip = document.getElementById("cpm-tooltip");
	const surface = tip.querySelector(".cpm-tooltip-surface");
	const previewRef = document.getElementById("browse-preview-ref");
	surface.textContent = text;
	tip.removeAttribute("data-anchored");
	tip.removeAttribute("data-placement");
	tip.style.left = "";
	tip.style.top = "";
	tip.style.removeProperty("--cpm-tip-origin-x");
	trigger.style.anchorName = "--cpm-tip-anchor";
	tip.setAttribute("data-open", "true");
	tip.showPopover();

	const supportsAnchor = !forceFallback && window.CSS && CSS.supports("position-area", "block-start") && CSS.supports("anchor-name", "--cpm-tip-anchor");
	let usedFallback = false;
	if (!supportsAnchor || !isAnchoredTipAligned(trigger.getBoundingClientRect(), tip.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight })) {
		applyFallbackPlacement(tip, trigger);
		usedFallback = true;
	}

	const anchorRect = trigger.getBoundingClientRect();
	const tipRect = tip.getBoundingClientRect();
	const surfaceStyle = getComputedStyle(surface);
	const previewStyle = getComputedStyle(previewRef);
	const out = {
		usedFallback,
		tipWidth: Math.round(tipRect.width * 10) / 10,
		centerDelta: Math.round(((tipRect.left + tipRect.width / 2) - (anchorRect.left + anchorRect.width / 2)) * 100) / 100,
		gapAbove: Math.round((anchorRect.top - tipRect.bottom) * 100) / 100,
		gapBelow: Math.round((tipRect.top - anchorRect.bottom) * 100) / 100,
		tipLeft: Math.round(tipRect.left * 10) / 10,
		tipRight: Math.round(tipRect.right * 10) / 10,
		tipTop: Math.round(tipRect.top * 10) / 10,
		transformOrigin: surfaceStyle.transformOrigin,
		tipYVar: surfaceStyle.getPropertyValue("--cpm-tip-y").trim(),
		borderRadius: surfaceStyle.borderTopLeftRadius,
		previewRadius: previewStyle.borderTopLeftRadius,
		cornerShape: surfaceStyle.cornerShape || "",
		previewCornerShape: previewStyle.cornerShape || "",
		borderWidths: [surfaceStyle.borderTopWidth, surfaceStyle.borderRightWidth, surfaceStyle.borderBottomWidth, surfaceStyle.borderLeftWidth],
		boxShadow: surfaceStyle.boxShadow,
		transitionDuration: surfaceStyle.transitionDuration,
		transitionTimingFunction: surfaceStyle.transitionTimingFunction,
	};

	tip.hidePopover();
	tip.setAttribute("data-open", "false");
	trigger.style.removeProperty("anchor-name");
	return out;
}

window.__RESULTS__ = {
	manageUpdate: measureScenario(document.getElementById("btn-manage"), "可更新至 v1.0.0", false),
	manageLatest: measureScenario(document.getElementById("btn-manage"), "当前已是最新版本 (v1.0.0)", false),
	transformUpdate: measureScenario(document.getElementById("btn-transform"), "可更新至 v1.0.0", false),
	transformUpdating: measureScenario(document.getElementById("btn-transform"), "正在更新…", false),
	topEdgeFlip: measureScenario(document.getElementById("btn-top-edge"), "可更新至 v1.0.0", false),
	rightEdgeClamp: measureScenario(document.getElementById("btn-right-edge"), "当前已是最新版本 (v1.0.0)", false),
	scopedFallback: measureScenario(document.getElementById("btn-scoped"), "可更新至 v1.0.0", false),
	legacyFallbackAbove: measureScenario(document.getElementById("btn-manage"), "可更新至 v1.0.0", true),
	legacyFallbackFlip: measureScenario(document.getElementById("btn-top-edge"), "可更新至 v1.0.0", true),
};
document.body.setAttribute("data-results", JSON.stringify(window.__RESULTS__));
</script>
</body>
</html>`;

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cpm-tip-test-"));
	const htmlPath = path.join(tmpDir, "probe.html");
	fs.writeFileSync(htmlPath, html, "utf8");

	try {
		const dom = execFileSync(
			EDGE_PATH,
			[
				"--headless=new",
				"--disable-gpu",
				"--no-sandbox",
				"--window-size=1280,800",
				"--dump-dom",
				pathToFileURL(htmlPath).href,
			],
			{ encoding: "utf8", timeout: 20000 }
		);
		const match = dom.match(/data-results="([^"]+)"/);
		assert.ok(match, "Expected headless Edge DOM output with data-results");
		const decoded = match[1]
			.replace(/&quot;/g, '"')
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">");
		const res = JSON.parse(decoded);

		// A: .cpm-manage Update button dead-center directly above with 8px gap.
		assert.equal(res.manageUpdate.usedFallback, false, "Native CSS Anchor Positioning should handle .cpm-manage");
		assert.ok(Math.abs(res.manageUpdate.centerDelta) < 1.5, `manageUpdate centerDelta=${res.manageUpdate.centerDelta}`);
		assert.ok(Math.abs(res.manageUpdate.gapAbove - 8) <= 1.5, `manageUpdate gapAbove=${res.manageUpdate.gapAbove}`);
		assert.ok(res.manageUpdate.tipWidth < 130, `Measured width should fit "可更新至 v1.0.0", got ${res.manageUpdate.tipWidth}`);
		assert.equal(res.manageUpdate.tipYVar, "4px");
		assert.equal(res.manageUpdate.borderRadius, res.manageUpdate.previewRadius, "tooltip radius must match Browse preview popover");
		assert.equal(res.manageUpdate.cornerShape, res.manageUpdate.previewCornerShape, "tooltip corner-shape must match Browse preview popover");
		assert.deepEqual(res.manageUpdate.borderWidths, ["1px", "1px", "1px", "1px"], "all four border edges must be equal 1px width");
		assert.doesNotMatch(res.manageUpdate.boxShadow, /\binset\b/, "must not paint inset top border highlight");
		assert.equal(res.manageUpdate.transitionDuration, "0.09s, 0.14s");
		assert.match(res.manageUpdate.transitionTimingFunction, /^cubic-bezier\(0\.22, 1, 0\.36, 1\),\s*linear\(/);

		// A2: Wider "当前已是最新版本 (v1.0.0)" also dead-center directly above.
		assert.ok(Math.abs(res.manageLatest.centerDelta) < 1.5, `manageLatest centerDelta=${res.manageLatest.centerDelta}`);
		assert.ok(Math.abs(res.manageLatest.gapAbove - 8) <= 1.5, `manageLatest gapAbove=${res.manageLatest.gapAbove}`);

		// B: Transformed + overflow:hidden ancestor breaks out cleanly into top layer & re-centers on live text change.
		assert.equal(res.transformUpdate.usedFallback, false);
		assert.ok(Math.abs(res.transformUpdate.centerDelta) < 1.5, `transformUpdate centerDelta=${res.transformUpdate.centerDelta}`);
		assert.ok(Math.abs(res.transformUpdate.gapAbove - 8) <= 1.5, `transformUpdate gapAbove=${res.transformUpdate.gapAbove}`);
		assert.ok(Math.abs(res.transformUpdating.centerDelta) < 1.5, `transformUpdating centerDelta=${res.transformUpdating.centerDelta}`);

		// C: Near top viewport edge auto-flips below with 8px gap and flips container query origin/y.
		assert.equal(res.topEdgeFlip.usedFallback, false);
		assert.ok(Math.abs(res.topEdgeFlip.gapBelow - 8) <= 1.5, `topEdgeFlip gapBelow=${res.topEdgeFlip.gapBelow}`);
		assert.ok(Math.abs(res.topEdgeFlip.centerDelta) < 1.5, `topEdgeFlip centerDelta=${res.topEdgeFlip.centerDelta}`);
		assert.equal(res.topEdgeFlip.tipYVar, "-4px");
		assert.ok(res.topEdgeFlip.transformOrigin.endsWith(" 0px"), `Expected top transform-origin on flip, got ${res.topEdgeFlip.transformOrigin}`);

		// D: Right edge clamps within 12px margin.
		assert.ok(res.rightEdgeClamp.tipRight <= 1280 - 11.5, `Expected right clamp <= 1268.5, got ${res.rightEdgeClamp.tipRight}`);
		assert.ok(Math.abs(res.rightEdgeClamp.gapAbove - 8) <= 1.5);

		// E: anchor-scope isolation automatically triggers JS fallback and still dead-centers above trigger!
		assert.equal(res.scopedFallback.usedFallback, true, "anchor-scope isolation should trigger automatic JS placement fallback");
		assert.ok(Math.abs(res.scopedFallback.centerDelta) < 1.5, `scopedFallback centerDelta=${res.scopedFallback.centerDelta}`);
		assert.ok(Math.abs(res.scopedFallback.gapAbove - 8) <= 1.5, `scopedFallback gapAbove=${res.scopedFallback.gapAbove}`);

		// F: explicit non-Anchor fallback (older browser path) dead-centers above and flips cleanly below near top edge.
		assert.equal(res.legacyFallbackAbove.usedFallback, true);
		assert.ok(Math.abs(res.legacyFallbackAbove.centerDelta) < 1.5, `legacyFallbackAbove centerDelta=${res.legacyFallbackAbove.centerDelta}`);
		assert.ok(Math.abs(res.legacyFallbackAbove.gapAbove - 8) <= 1.5, `legacyFallbackAbove gapAbove=${res.legacyFallbackAbove.gapAbove}`);
		assert.equal(res.legacyFallbackFlip.usedFallback, true);
		assert.ok(Math.abs(res.legacyFallbackFlip.gapBelow - 8) <= 1.5, `legacyFallbackFlip gapBelow=${res.legacyFallbackFlip.gapBelow}`);
		assert.ok(Math.abs(res.legacyFallbackFlip.centerDelta) < 1.5, `legacyFallbackFlip centerDelta=${res.legacyFallbackFlip.centerDelta}`);
		assert.equal(res.legacyFallbackFlip.tipYVar, "-4px");
		assert.ok(res.legacyFallbackFlip.transformOrigin.endsWith(" 0px"), `Expected top transform-origin on legacy flip, got ${res.legacyFallbackFlip.transformOrigin}`);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});
