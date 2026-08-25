window.__ModuleLoader__.load({ id: "universal-plugin-hub", factory: (require) => {

	var module = { exports: {} };
	var exports = module.exports;
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

	const React = require("react");
	const { createElement: h, useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } = React;
	const useSafeLayoutEffect = typeof useLayoutEffect === "function" ? useLayoutEffect : useEffect;

	// ────────────────────────────── Styles ──────────────────────────────
	const CSS = `
/* ────────────────────────────── Light Theme (Default) ────────────────────────────── */
.cpm-root {
	--cpm-bg: transparent;
	--cpm-main-bg: transparent;
	--cpm-card-bg: transparent;
	--cpm-card-hover: rgba(0, 0, 0, 0.045);
	--cpm-card-border: transparent;
	--cpm-border: rgba(0, 0, 0, 0.08);
	--cpm-text: #18181b;
	--cpm-text-sub: #3f3f46;
	--cpm-muted: #71717a;
	--cpm-search-bg: rgba(0, 0, 0, 0.035);
	--cpm-search-border: rgba(0, 0, 0, 0.09);
	--cpm-tab-bg: transparent;
	--cpm-tab-text: #71717a;
	--cpm-tab-active-bg: rgba(0, 0, 0, 0.07);
	--cpm-tab-active-text: #18181b;
	--cpm-tab-hover: rgba(0, 0, 0, 0.045);
	--cpm-btn-primary-bg: #18181b;
	--cpm-btn-primary-text: #ffffff;
	--cpm-btn-primary-hover: #27272a;
	--cpm-btn-secondary-bg: rgba(0, 0, 0, 0.05);
	--cpm-btn-secondary-text: #18181b;
	--cpm-btn-secondary-hover: rgba(0, 0, 0, 0.09);
	--cpm-btn-danger-bg: rgba(220, 38, 38, 0.1);
	--cpm-btn-danger-text: #dc2626;
	--cpm-pill-bg: rgba(0, 0, 0, 0.04);
	--cpm-pill-border: rgba(0, 0, 0, 0.08);
	--cpm-pill-text: #18181b;
	--cpm-icon-btn-bg: #ffffff;
	--cpm-icon-btn-border: rgba(0, 0, 0, 0.12);
	--cpm-icon-btn-hover: rgba(0, 0, 0, 0.05);
	--cpm-accent: #2563eb;
	--cpm-toggle-off: #d4d4d8;
	--cpm-toggle-on: #2563eb;
	--cpm-modal-bg: #ffffff;
	--cpm-modal-border: rgba(0, 0, 0, 0.12);
	--cpm-shadow: 0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
	--cpm-toast-bg: #ffffff;
	--cpm-toast-text: #18181b;
	--cpm-toast-border: rgba(0, 0, 0, 0.12);
	--cpm-toast-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);

	width: 100%;
	height: 100%;
	min-height: 520px;
	display: flex;
	flex-direction: column;
	position: relative;
	background: transparent !important;
	color: var(--cpm-text);
	font-family: inherit;
	box-sizing: border-box;
	overflow: hidden;
	border-radius: 0;
}

/* ────────────────────────────── Dark Theme Overrides ────────────────────────────── */
.cpm-root.cpm-dark {
	--cpm-card-bg: transparent;
	--cpm-card-hover: rgba(255, 255, 255, 0.07);
	--cpm-card-border: transparent;
	--cpm-border: rgba(255, 255, 255, 0.1);
	--cpm-text: #f4f4f5;
	--cpm-text-sub: #d4d4d8;
	--cpm-muted: #a1a1aa;
	--cpm-search-bg: rgba(255, 255, 255, 0.05);
	--cpm-search-border: rgba(255, 255, 255, 0.12);
	--cpm-tab-bg: transparent;
	--cpm-tab-text: #a1a1aa;
	--cpm-tab-active-bg: rgba(255, 255, 255, 0.15);
	--cpm-tab-active-text: #ffffff;
	--cpm-tab-hover: rgba(255, 255, 255, 0.08);
	--cpm-btn-primary-bg: #f4f4f5;
	--cpm-btn-primary-text: #09090b;
	--cpm-btn-primary-hover: #ffffff;
	--cpm-btn-secondary-bg: rgba(255, 255, 255, 0.08);
	--cpm-btn-secondary-text: #f4f4f5;
	--cpm-btn-secondary-hover: rgba(255, 255, 255, 0.14);
	--cpm-btn-danger-bg: rgba(239, 68, 68, 0.15);
	--cpm-btn-danger-text: #f87171;
	--cpm-pill-bg: rgba(255, 255, 255, 0.08);
	--cpm-pill-border: rgba(255, 255, 255, 0.12);
	--cpm-pill-text: #f4f4f5;
	--cpm-icon-btn-bg: #373739;
	--cpm-icon-btn-border: rgba(255, 255, 255, 0.14);
	--cpm-icon-btn-hover: rgba(255, 255, 255, 0.12);
	--cpm-accent: #3b82f6;
	--cpm-toggle-off: #3f3f46;
	--cpm-toggle-on: #2563eb;
	--cpm-modal-bg: #373739;
	--cpm-modal-border: rgba(255, 255, 255, 0.14);
	--cpm-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
	--cpm-toast-bg: #373739;
	--cpm-toast-text: #f4f4f5;
	--cpm-toast-border: rgba(255, 255, 255, 0.14);
	--cpm-toast-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
}

.cpm-root * { box-sizing: border-box; }

/* Main Panel */
.cpm-main {
	flex: 1;
	display: flex;
	flex-direction: column;
	width: 100%;
	height: 100%;
	min-width: 0;
	background: transparent !important;
	overflow: hidden;
	position: relative;
}

/* Top bar with clean 2-row layout matching Claude official */
.cpm-topbar {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px 16px 10px 16px;
	border-bottom: 1px solid var(--cpm-border);
	background: var(--cpm-bg);
}
.cpm-topbar-row1 {
	display: flex;
	align-items: center;
	width: 100%;
}
.cpm-search {
	flex: 1;
	width: 100%;
	display: flex;
	align-items: center;
	gap: 8px;
	background: var(--cpm-search-bg);
	border: 1px solid var(--cpm-search-border);
	border-radius: 8px;
	padding: 7px 12px;
	transition: border-color .15s ease, box-shadow .15s ease;
}
.cpm-search:focus-within {
	border-color: var(--cpm-accent, #2563eb);
	box-shadow: 0 0 0 1px var(--cpm-accent, #2563eb);
}
.cpm-dark .cpm-search:focus-within {
	border-color: var(--cpm-accent, #2563eb);
	box-shadow: 0 0 0 1px var(--cpm-accent, #2563eb);
}
.cpm-search input {
	flex: 1;
	background: transparent;
	border: none;
	outline: none;
	color: var(--cpm-text);
	font-size: 13px;
}
.cpm-search input::placeholder { color: var(--cpm-muted); }

.cpm-topbar-row2 {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	width: 100%;
	position: relative;
	z-index: 10;
}
.cpm-topbar-left {
	display: flex;
	align-items: center;
	gap: 2px;
	overflow-x: auto;
	overflow-y: hidden;
	flex: 1;
	min-width: 0;
	scrollbar-width: none;
	-ms-overflow-style: none;
	padding: 4px 0;
}
.cpm-topbar-left::-webkit-scrollbar {
	display: none;
}
.cpm-topbar-left.mask-right {
	mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 24px), transparent 100%);
	-webkit-mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 24px), transparent 100%);
}
.cpm-topbar-left.mask-both {
	mask-image: linear-gradient(to right, transparent 0, #000 20px, #000 calc(100% - 24px), transparent 100%);
	-webkit-mask-image: linear-gradient(to right, transparent 0, #000 20px, #000 calc(100% - 24px), transparent 100%);
}
.cpm-topbar-left.mask-left {
	mask-image: linear-gradient(to right, transparent 0, #000 20px, #000 100%);
	-webkit-mask-image: linear-gradient(to right, transparent 0, #000 20px, #000 100%);
}
.cpm-topbar-right {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-shrink: 0;
	margin-left: auto;
}

.cpm-icon-btn, .cpm-add-btn {
	width: 30px;
	height: 30px;
	border-radius: 6px;
	border: 1px solid var(--cpm-icon-btn-border);
	background: var(--cpm-icon-btn-bg);
	color: var(--cpm-text);
	cursor: pointer;
	font-size: 13px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	transition: background .15s ease, border-color .15s ease;
	flex-shrink: 0;
	margin: 0 !important;
	padding: 0;
	box-sizing: border-box;
	line-height: 1;
}
.cpm-icon-btn svg, .cpm-add-btn svg {
	display: block;
	margin: auto;
}
.cpm-icon-btn:hover, .cpm-add-btn:hover { background: var(--cpm-icon-btn-hover); }

.cpm-filter, .cpm-sort {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 5px;
	height: 30px;
	padding: 0 9px;
	border-radius: 6px;
	border: 1px solid var(--cpm-icon-btn-border);
	background: var(--cpm-icon-btn-bg);
	color: var(--cpm-text);
	font-size: 12.5px;
	font-weight: 500;
	cursor: pointer;
	flex-shrink: 0;
	margin: 0 !important;
	box-sizing: border-box;
	line-height: 1;
	transition: background .15s ease, border-color .15s ease;
}
.cpm-filter span, .cpm-sort span {
	display: inline-flex;
	align-items: center;
	line-height: 1;
}
.cpm-filter:hover, .cpm-sort:hover, .cpm-filter.open, .cpm-sort.open {
	background: var(--cpm-icon-btn-hover);
}
.cpm-filter-chevron {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	line-height: 1;
	color: var(--cpm-muted);
	transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
	transform-origin: center center;
}
.cpm-filter-chevron svg {
	display: block;
	margin: auto;
}
.cpm-filter.open .cpm-filter-chevron,
.cpm-sort.open .cpm-filter-chevron {
	transform: rotate(180deg);
}

/* Tabs Row: Sources from state.sources + Add button */
.cpm-tab {
	position: relative;
	height: 30px;
	padding: 0 8px;
	border-radius: 6px;
	font-size: 12.5px;
	color: var(--cpm-tab-text);
	cursor: pointer;
	border: 1px solid transparent;
	background: var(--cpm-tab-bg);
	transition: background .15s ease, color .15s ease, border-color .15s ease;
	font-weight: 500;
	white-space: nowrap;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	line-height: 1;
	user-select: none;
	-webkit-user-select: none;
	touch-action: pan-x;
	flex-shrink: 0;
	will-change: transform;
}
.cpm-tab.is-placeholder {
	opacity: 0 !important;
	pointer-events: none !important;
}
.cpm-tab.is-shifting {
	transition: transform 0.22s cubic-bezier(0.2, 0, 0, 1), background .15s ease, color .15s ease !important;
	will-change: transform;
}
.cpm-tab-drag-overlay {
	position: fixed !important;
	z-index: 9999999 !important;
	pointer-events: none !important;
	box-sizing: border-box !important;
	display: inline-flex !important;
	align-items: center !important;
	justify-content: center !important;
	height: 30px !important;
	padding: 0 10px !important;
	border-radius: 7px !important;
	font-size: 12.5px !important;
	font-weight: 600 !important;
	white-space: nowrap !important;
	user-select: none !important;
	transform-origin: center center;
	background: rgba(255, 255, 255, 0.98) !important;
	color: #18181b !important;
	border: 1.5px solid #2563eb !important;
	box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.32), 0 8px 16px -2px rgba(37, 99, 235, 0.25), 0 0 0 1px rgba(37, 99, 235, 0.4) !important;
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	will-change: left, top, transform, box-shadow;
}
.cpm-dark .cpm-tab-drag-overlay,
.cpm-tab-drag-overlay.cpm-dark {
	background: rgba(36, 36, 39, 0.98) !important;
	color: #f4f4f5 !important;
	border: 1.5px solid #3b82f6 !important;
	box-shadow: 0 20px 42px -4px rgba(0, 0, 0, 0.75), 0 10px 22px -2px rgba(59, 130, 246, 0.4), 0 0 0 1px rgba(59, 130, 246, 0.5) !important;
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
}
.cpm-topbar-left.is-dragging-mode {
	cursor: grabbing !important;
	user-select: none !important;
}
.cpm-topbar-left.is-dragging-mode .cpm-tab-del-zone {
	pointer-events: none !important;
}
.cpm-tab:hover {
	color: var(--cpm-text);
	background: var(--cpm-tab-hover);
}
.cpm-tab.active {
	background: var(--cpm-tab-active-bg);
	color: var(--cpm-tab-active-text);
	font-weight: 600;
}
.cpm-tab-del-zone {
	position: absolute;
	right: 0;
	top: 0;
	bottom: 0;
	width: 18px;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	z-index: 10;
	background: transparent;
}
.cpm-tab-close {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 14px;
	height: 14px;
	border-radius: 50%;
	border: 1px solid var(--cpm-border);
	background: var(--cpm-card-bg, #fff);
	color: var(--cpm-muted);
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
	padding: 0;
	margin: 0;
	opacity: 0;
	transform: scale(0.6);
	transform-origin: center center;
	pointer-events: none;
	transition: opacity 0.16s cubic-bezier(0.16, 1, 0.3, 1), transform 0.16s cubic-bezier(0.16, 1, 0.3, 1), background 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.cpm-tab-close svg {
	display: block;
	flex-shrink: 0;
	transform-origin: center center;
}
.cpm-dark .cpm-tab-close {
	background: #27272a;
	border-color: rgba(255, 255, 255, 0.2);
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}
.cpm-tab-del-zone:hover .cpm-tab-close {
	opacity: 1;
	transform: scale(1);
	pointer-events: auto;
	background: #ef4444 !important;
	color: #ffffff !important;
	border-color: #dc2626 !important;
	box-shadow: 0 2px 6px rgba(239, 68, 68, 0.35) !important;
}

/* Floating Preview Popover */
.cpm-preview-popover {
	position: fixed;
	z-index: 99999;
	width: 360px;
	max-width: calc(100vw - 32px);
	padding: 14px 16px 12px;
	border-radius: 8px;
	background: rgba(255, 255, 255, 0.72);
	backdrop-filter: blur(20px) saturate(180%);
	-webkit-backdrop-filter: blur(20px) saturate(180%);
	border: 1px solid rgba(0, 0, 0, 0.08);
	box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.10), 0 2px 8px rgba(0, 0, 0, 0.04);
	color: var(--cpm-text);
	box-sizing: border-box;
	pointer-events: auto;
	animation: cpmPopIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.cpm-dark .cpm-preview-popover {
	background: rgba(55, 55, 57, 0.75);
	backdrop-filter: blur(22px) saturate(180%);
	-webkit-backdrop-filter: blur(22px) saturate(180%);
	border: 1px solid var(--cpm-modal-border);
	box-shadow: var(--cpm-shadow);
}
@keyframes cpmPopIn {
	from {
		opacity: 0;
		transform: scale(0.96) translateY(4px);
	}
	to {
		opacity: 1;
		transform: scale(1) translateY(0);
	}
}
.cpm-preview-header {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-bottom: 8px;
}
.cpm-preview-header-info {
	flex: 1;
	min-width: 0;
}
.cpm-preview-title {
	font-size: 14px;
	font-weight: 600;
	color: var(--cpm-text);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: 1.3;
}
.cpm-preview-sub {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 11.5px;
	color: var(--cpm-muted);
	margin-top: 2px;
	flex-wrap: wrap;
}
.cpm-preview-tag {
	padding: 1px 6px;
	border-radius: 4px;
	font-size: 11px;
	font-weight: 500;
	background: var(--cpm-pill-bg);
	color: var(--cpm-pill-text);
	border: 1px solid var(--cpm-pill-border);
	line-height: 1.3;
}
.cpm-preview-desc {
	font-size: 12.5px;
	line-height: 1.65;
	color: var(--cpm-text-sub);
	max-height: 220px;
	overflow-y: auto;
	word-break: break-word;
	white-space: pre-wrap;
	scrollbar-width: none;
	-ms-overflow-style: none;
	padding-bottom: 4px;
	transition: mask-image 0.2s ease, -webkit-mask-image 0.2s ease;
}
.cpm-preview-desc::-webkit-scrollbar {
	display: none;
}
.cpm-preview-desc.mask-bottom {
	mask-image: linear-gradient(to bottom, #000 0%, #000 calc(100% - 48px), rgba(0,0,0,0.98) calc(100% - 40px), rgba(0,0,0,0.92) calc(100% - 32px), rgba(0,0,0,0.76) calc(100% - 24px), rgba(0,0,0,0.52) calc(100% - 16px), rgba(0,0,0,0.28) calc(100% - 10px), rgba(0,0,0,0.12) calc(100% - 5px), rgba(0,0,0,0.03) calc(100% - 2px), transparent 100%);
	-webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 calc(100% - 48px), rgba(0,0,0,0.98) calc(100% - 40px), rgba(0,0,0,0.92) calc(100% - 32px), rgba(0,0,0,0.76) calc(100% - 24px), rgba(0,0,0,0.52) calc(100% - 16px), rgba(0,0,0,0.28) calc(100% - 10px), rgba(0,0,0,0.12) calc(100% - 5px), rgba(0,0,0,0.03) calc(100% - 2px), transparent 100%);
}
.cpm-preview-desc.mask-both {
	mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.12) 5px, rgba(0,0,0,0.28) 10px, rgba(0,0,0,0.52) 16px, rgba(0,0,0,0.76) 24px, rgba(0,0,0,0.92) 32px, rgba(0,0,0,0.98) 40px, #000 48px, #000 calc(100% - 48px), rgba(0,0,0,0.98) calc(100% - 40px), rgba(0,0,0,0.92) calc(100% - 32px), rgba(0,0,0,0.76) calc(100% - 24px), rgba(0,0,0,0.52) calc(100% - 16px), rgba(0,0,0,0.28) calc(100% - 10px), rgba(0,0,0,0.12) calc(100% - 5px), rgba(0,0,0,0.03) calc(100% - 2px), transparent 100%);
	-webkit-mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.12) 5px, rgba(0,0,0,0.28) 10px, rgba(0,0,0,0.52) 16px, rgba(0,0,0,0.76) 24px, rgba(0,0,0,0.92) 32px, rgba(0,0,0,0.98) 40px, #000 48px, #000 calc(100% - 48px), rgba(0,0,0,0.98) calc(100% - 40px), rgba(0,0,0,0.92) calc(100% - 32px), rgba(0,0,0,0.76) calc(100% - 24px), rgba(0,0,0,0.52) calc(100% - 16px), rgba(0,0,0,0.28) calc(100% - 10px), rgba(0,0,0,0.12) calc(100% - 5px), rgba(0,0,0,0.03) calc(100% - 2px), transparent 100%);
}
.cpm-preview-desc.mask-top {
	mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.12) 5px, rgba(0,0,0,0.28) 10px, rgba(0,0,0,0.52) 16px, rgba(0,0,0,0.76) 24px, rgba(0,0,0,0.92) 32px, rgba(0,0,0,0.98) 40px, #000 48px, #000 100%);
	-webkit-mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.12) 5px, rgba(0,0,0,0.28) 10px, rgba(0,0,0,0.52) 16px, rgba(0,0,0,0.76) 24px, rgba(0,0,0,0.92) 32px, rgba(0,0,0,0.98) 40px, #000 48px, #000 100%);
}
.cpm-tab-add {
	padding: 4px 10px;
	border-radius: 6px;
	font-size: 14px;
	font-weight: 500;
	color: var(--cpm-muted);
	border: 1px solid transparent;
	background: transparent;
	cursor: pointer;
	transition: all .15s ease;
	display: inline-flex;
	align-items: center;
	justify-content: center;
}
.cpm-tab-add:hover {
	color: var(--cpm-text);
	background: var(--cpm-tab-hover);
}

/* Card Grid: 2 Columns with maximized text area & Dynamic Bottom Multi-Stop Easing Gradient Feathering */
.cpm-grid, .cpm-grid-container {
	flex: 1;
	overflow-y: auto;
	padding: 12px 16px 24px 16px;
	transition: mask-image 0.2s ease, -webkit-mask-image 0.2s ease;
}
.cpm-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px 14px;
	align-content: start;
	contain: content;
}
.cpm-grid.mask-bottom, .cpm-grid-container.mask-bottom {
	mask-image: linear-gradient(to bottom, #000 0%, #000 calc(100% - 60px), rgba(0,0,0,0.98) calc(100% - 50px), rgba(0,0,0,0.92) calc(100% - 40px), rgba(0,0,0,0.76) calc(100% - 30px), rgba(0,0,0,0.52) calc(100% - 20px), rgba(0,0,0,0.28) calc(100% - 12px), rgba(0,0,0,0.12) calc(100% - 6px), rgba(0,0,0,0.03) calc(100% - 2px), transparent 100%);
	-webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 calc(100% - 60px), rgba(0,0,0,0.98) calc(100% - 50px), rgba(0,0,0,0.92) calc(100% - 40px), rgba(0,0,0,0.76) calc(100% - 30px), rgba(0,0,0,0.52) calc(100% - 20px), rgba(0,0,0,0.28) calc(100% - 12px), rgba(0,0,0,0.12) calc(100% - 6px), rgba(0,0,0,0.03) calc(100% - 2px), transparent 100%);
}
.cpm-grid.cpm-hidden {
	display: none !important;
}
.cpm-grid-installed {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px 14px;
	align-content: start;
}
.cpm-installed-group {
	margin-bottom: 22px;
}
.cpm-installed-group:last-child {
	margin-bottom: 6px;
}
.cpm-installed-group-header {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-bottom: 10px;
	padding: 0 4px;
	user-select: none;
}
.cpm-installed-group-title-wrap {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	flex-shrink: 0;
}
.cpm-installed-group-title {
	font-size: 12.5px;
	font-weight: 600;
	color: var(--cpm-text);
	letter-spacing: -0.01em;
	white-space: nowrap;
}
.cpm-installed-group-line {
	flex: 1;
	height: 1px;
	background: var(--cpm-border);
	opacity: 0.7;
}
.cpm-installed-group:first-child .cpm-installed-group-line {
	display: none;
}
@media (max-width: 480px) {
	.cpm-grid, .cpm-grid-installed {
		grid-template-columns: 1fr;
	}
}

.cpm-card {
	display: flex;
	align-items: center;
	gap: 10px;
	background: transparent;
	border: 1px solid transparent;
	border-radius: 10px;
	padding: 6px 8px;
	cursor: pointer;
	min-height: 52px;
	transition: background .18s cubic-bezier(0.16, 1, 0.3, 1), transform .12s ease;
	min-width: 0;
	position: relative;
	content-visibility: auto;
	contain-intrinsic-size: auto 52px;
	contain: layout style paint;
}
.cpm-card:hover {
	background: rgba(0, 0, 0, 0.045);
}
.cpm-dark .cpm-card:hover {
	background: rgba(255, 255, 255, 0.07);
}
.cpm-card:active {
	transform: scale(0.995);
}
.cpm-card-icon {
	width: 38px;
	height: 38px;
	border-radius: 9px;
	-webkit-corner-smoothing: 100%;
	corner-smoothing: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 38px;
	position: relative;
	background: #ffffff;
	border: 1px solid rgba(0, 0, 0, 0.08);
	box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
	overflow: hidden;
	transition: all .15s ease;
}
.cpm-dark .cpm-card-icon {
	background: #18181b;
	border: 1px solid rgba(255, 255, 255, 0.12);
	box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.cpm-card-icon img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
	border-radius: 8px;
	-webkit-corner-smoothing: 100%;
	corner-smoothing: 100%;
}
.cpm-card-body {
	flex: 1 1 auto;
	min-width: 0;
	display: flex;
	flex-direction: column;
	justify-content: center;
	margin-right: 6px;
}
.cpm-card-name {
	font-size: 13px;
	font-weight: 600;
	color: var(--cpm-text);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: 1.3;
}
.cpm-card-desc {
	font-size: 12px;
	color: var(--cpm-muted);
	margin-top: 2px;
	line-height: 1.35;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.cpm-card-pill {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 3px 12px;
	border-radius: 9999px;
	font-size: 12px;
	font-weight: 500;
	cursor: pointer;
	border: 1px solid rgba(0, 0, 0, 0.12);
	background: #ffffff;
	color: #18181b;
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
	transition: all 0.15s ease;
	flex: 0 0 auto;
	margin-left: auto;
	line-height: 1.4;
	white-space: nowrap;
}
.cpm-card-pill:hover {
	background: rgba(0, 0, 0, 0.06);
	border-color: rgba(0, 0, 0, 0.25);
}
.cpm-dark .cpm-card-pill {
	background: #27272a;
	border: 1px solid rgba(255, 255, 255, 0.15);
	color: #f4f4f5;
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
.cpm-dark .cpm-card-pill:hover {
	background: #3f3f46;
	border-color: rgba(255, 255, 255, 0.3);
}
.cpm-card-pill-installed {
	background: #ffffff;
	border-color: rgba(16, 185, 129, 0.35);
	color: #059669;
}
.cpm-dark .cpm-card-pill-installed {
	background: #27272a;
	border-color: rgba(16, 185, 129, 0.4);
	color: #34d399;
}
.cpm-card-pill-installed:hover {
	background: rgba(16, 185, 129, 0.1);
	border-color: rgba(16, 185, 129, 0.5);
}
.cpm-dark .cpm-card-pill-installed:hover {
	background: rgba(16, 185, 129, 0.18);
	border-color: rgba(16, 185, 129, 0.6);
}
.cpm-add-btn {
	width: 28px;
	height: 28px;
	border-radius: 6px;
	border: none;
	background: transparent;
	color: var(--cpm-text);
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	transition: background .15s ease;
	flex-shrink: 0;
	margin-left: 2px;
}
.cpm-add-btn:hover {
	background: var(--cpm-tab-hover);
}

/* Detail Page */
.cpm-detail {
	flex: 1;
	overflow-y: auto;
	padding: 16px 16px 28px 16px;
	max-width: 100%;
	transition: mask-image 0.2s ease, -webkit-mask-image 0.2s ease;
}
.cpm-detail.mask-bottom {
	mask-image: linear-gradient(to bottom, #000 0%, #000 calc(100% - 60px), rgba(0,0,0,0.98) calc(100% - 50px), rgba(0,0,0,0.92) calc(100% - 40px), rgba(0,0,0,0.76) calc(100% - 30px), rgba(0,0,0,0.52) calc(100% - 20px), rgba(0,0,0,0.28) calc(100% - 12px), rgba(0,0,0,0.12) calc(100% - 6px), rgba(0,0,0,0.03) calc(100% - 2px), transparent 100%);
	-webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 calc(100% - 60px), rgba(0,0,0,0.98) calc(100% - 50px), rgba(0,0,0,0.92) calc(100% - 40px), rgba(0,0,0,0.76) calc(100% - 30px), rgba(0,0,0,0.52) calc(100% - 20px), rgba(0,0,0,0.28) calc(100% - 12px), rgba(0,0,0,0.12) calc(100% - 6px), rgba(0,0,0,0.03) calc(100% - 2px), transparent 100%);
}
.cpm-back {
	color: var(--cpm-muted);
	cursor: pointer;
	font-size: 13.5px;
	border: none;
	background: none;
	padding: 0 0 16px 0;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-weight: 500;
}
.cpm-back:hover { color: var(--cpm-text); }
.cpm-title-row {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}
.cpm-title {
	font-size: 22px;
	font-weight: 700;
	color: var(--cpm-text);
	flex: 1;
	min-width: 180px;
}
.cpm-btn {
	height: 32px;
	padding: 0 14px;
	border-radius: 6px;
	font-size: 13px;
	cursor: pointer;
	border: 1px solid transparent;
	outline: none;
	font-weight: 600;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	line-height: 1;
	transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}
.cpm-btn:focus, .cpm-btn:active {
	outline: none;
}
.cpm-btn-primary {
	background: var(--cpm-btn-primary-bg);
	color: var(--cpm-btn-primary-text);
	border: 1px solid transparent;
}
.cpm-btn-primary:hover { background: var(--cpm-btn-primary-hover); }
.cpm-btn-secondary {
	background: var(--cpm-btn-secondary-bg);
	color: var(--cpm-btn-secondary-text);
	border: 1px solid rgba(0, 0, 0, 0.08);
}
.cpm-root.cpm-dark .cpm-btn-secondary,
.cpm-dark .cpm-btn-secondary {
	background: rgba(255, 255, 255, 0.08);
	border: 1px solid rgba(255, 255, 255, 0.1);
	color: #f4f4f5;
}
.cpm-btn-secondary:hover { background: var(--cpm-btn-secondary-hover); }
.cpm-root.cpm-dark .cpm-btn-secondary:hover,
.cpm-dark .cpm-btn-secondary:hover {
	background: rgba(255, 255, 255, 0.14);
}
.cpm-btn:disabled {
	opacity: 0.45;
	cursor: not-allowed !important;
	pointer-events: auto;
}
.cpm-btn-secondary:disabled {
	background: var(--cpm-btn-secondary-bg);
	border: 1px solid rgba(0, 0, 0, 0.08);
	color: var(--cpm-muted);
	opacity: 0.45;
}
.cpm-root.cpm-dark .cpm-btn-secondary:disabled,
.cpm-dark .cpm-btn-secondary:disabled {
	background: rgba(255, 255, 255, 0.05);
	border: 1px solid rgba(255, 255, 255, 0.1);
	color: #71717a;
	opacity: 0.45;
}
.cpm-btn-danger {
	background: var(--cpm-btn-danger-bg);
	color: var(--cpm-btn-danger-text);
}
.cpm-btn-danger:hover { opacity: 0.85; }
.cpm-link {
	color: var(--cpm-accent);
	cursor: pointer;
	font-size: 13px;
	background: none;
	border: none;
	padding: 0;
	text-decoration: none;
	display: inline-flex;
	align-items: center;
	gap: 4px;
}
.cpm-link:hover { text-decoration: underline; }
.cpm-by {
	color: var(--cpm-muted);
	font-size: 13px;
	margin-top: 3px;
}
.cpm-desc {
	color: var(--cpm-text-sub);
	font-size: 13.5px;
	line-height: 1.6;
	margin-top: 14px;
	white-space: pre-wrap;
}
.cpm-section { margin-top: 22px; }
.cpm-section-title {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 14px;
	font-weight: 700;
	color: var(--cpm-text);
}
.cpm-badge {
	min-width: 20px;
	height: 20px;
	border-radius: 50%;
	background: var(--cpm-pill-bg);
	border: 1px solid var(--cpm-pill-border);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-size: 11.5px;
	padding: 0 5px;
	color: var(--cpm-text);
}
.cpm-section-sub {
	color: var(--cpm-muted);
	font-size: 12.5px;
	margin-top: 4px;
}
.cpm-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 10px;
}
.cpm-pill {
	background: var(--cpm-pill-bg);
	color: var(--cpm-pill-text);
	border: 1px solid var(--cpm-pill-border);
	border-radius: 999px;
	padding: 4px 12px;
	font-size: 12px;
	display: inline-flex;
	align-items: center;
}
.cpm-pill-more, .cpm-pill-collapse {
	background: var(--cpm-tab-hover);
	color: var(--cpm-muted);
	border: 1px solid var(--cpm-border);
	cursor: pointer;
	font-weight: 500;
	transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
	user-select: none;
}
.cpm-pill-more:hover, .cpm-pill-collapse:hover {
	background: var(--cpm-pill-bg);
	color: var(--cpm-text);
	border-color: var(--cpm-pill-border);
	transform: translateY(-1px);
}
.cpm-pill-more:active, .cpm-pill-collapse:active {
	transform: translateY(0);
}
.cpm-section-collapse-btn {
	margin-left: auto;
	font-size: 12px;
	font-weight: 500;
	color: var(--cpm-muted);
	background: transparent;
	border: none;
	cursor: pointer;
	padding: 0 2px;
	height: 20px;
	display: inline-flex;
	align-items: center;
	line-height: 20px;
	transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
	user-select: none;
}
.cpm-section-collapse-btn:hover {
	color: var(--cpm-text);
	background: transparent;
	transform: translateY(-1px);
}
.cpm-section-collapse-btn:active {
	transform: translateY(0);
}
.cpm-empty {
	color: var(--cpm-muted);
	font-size: 13px;
	margin-top: 8px;
}

/* Manage Page */
.cpm-manage {
	flex: 1;
	overflow-y: auto;
	padding: 16px 16px 28px 16px;
	max-width: 100%;
	background: var(--cpm-bg);
	transition: mask-image 0.2s ease, -webkit-mask-image 0.2s ease;
}
.cpm-manage.mask-bottom {
	mask-image: linear-gradient(to bottom, #000 0%, #000 calc(100% - 60px), rgba(0,0,0,0.98) calc(100% - 50px), rgba(0,0,0,0.92) calc(100% - 40px), rgba(0,0,0,0.76) calc(100% - 30px), rgba(0,0,0,0.52) calc(100% - 20px), rgba(0,0,0,0.28) calc(100% - 12px), rgba(0,0,0,0.12) calc(100% - 6px), rgba(0,0,0,0.03) calc(100% - 2px), transparent 100%);
	-webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 calc(100% - 60px), rgba(0,0,0,0.98) calc(100% - 50px), rgba(0,0,0,0.92) calc(100% - 40px), rgba(0,0,0,0.76) calc(100% - 30px), rgba(0,0,0,0.52) calc(100% - 20px), rgba(0,0,0,0.28) calc(100% - 12px), rgba(0,0,0,0.12) calc(100% - 6px), rgba(0,0,0,0.03) calc(100% - 2px), transparent 100%);
}
.cpm-manage.mask-top {
	mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.12) 6px, rgba(0,0,0,0.28) 12px, rgba(0,0,0,0.52) 20px, rgba(0,0,0,0.76) 30px, rgba(0,0,0,0.92) 40px, rgba(0,0,0,0.98) 50px, #000 60px, #000 100%);
	-webkit-mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.12) 6px, rgba(0,0,0,0.28) 12px, rgba(0,0,0,0.52) 20px, rgba(0,0,0,0.76) 30px, rgba(0,0,0,0.92) 40px, rgba(0,0,0,0.98) 50px, #000 60px, #000 100%);
}
.cpm-manage.mask-both {
	mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.12) 6px, rgba(0,0,0,0.28) 12px, rgba(0,0,0,0.52) 20px, rgba(0,0,0,0.76) 30px, rgba(0,0,0,0.92) 40px, rgba(0,0,0,0.98) 50px, #000 60px, #000 calc(100% - 60px), rgba(0,0,0,0.98) calc(100% - 50px), rgba(0,0,0,0.92) calc(100% - 40px), rgba(0,0,0,0.76) calc(100% - 30px), rgba(0,0,0,0.52) calc(100% - 20px), rgba(0,0,0,0.28) calc(100% - 12px), rgba(0,0,0,0.12) calc(100% - 6px), rgba(0,0,0,0.03) calc(100% - 2px), transparent 100%);
	-webkit-mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.12) 6px, rgba(0,0,0,0.28) 12px, rgba(0,0,0,0.52) 20px, rgba(0,0,0,0.76) 30px, rgba(0,0,0,0.92) 40px, rgba(0,0,0,0.98) 50px, #000 60px, #000 calc(100% - 60px), rgba(0,0,0,0.98) calc(100% - 50px), rgba(0,0,0,0.92) calc(100% - 40px), rgba(0,0,0,0.76) calc(100% - 30px), rgba(0,0,0,0.52) calc(100% - 20px), rgba(0,0,0,0.28) calc(100% - 12px), rgba(0,0,0,0.12) calc(100% - 6px), rgba(0,0,0,0.03) calc(100% - 2px), transparent 100%);
}
.cpm-manage-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8px;
}
.cpm-meta {
	display: flex;
	gap: 32px;
	margin-top: 14px;
	padding-bottom: 14px;
	border-bottom: 1px solid var(--cpm-border);
	flex-wrap: wrap;
}
.cpm-meta div { font-size: 13px; }
.cpm-meta .k {
	color: var(--cpm-muted);
	display: block;
	font-size: 11.5px;
	margin-bottom: 2px;
}
.cpm-meta .v { color: var(--cpm-text); font-weight: 500; }
.cpm-meta .v a { color: var(--cpm-accent); text-decoration: none; }
.cpm-toggle {
	position: relative;
	width: 40px;
	height: 22px;
	border-radius: 999px;
	background: var(--cpm-muted);
	border: none;
	cursor: pointer;
	transition: background .15s;
}
.cpm-toggle.on { background: var(--cpm-toggle-on); }
.cpm-toggle::after {
	content: "";
	position: absolute;
	top: 2px;
	left: 2px;
	width: 18px;
	height: 18px;
	border-radius: 50%;
	background: #fff;
	transition: left .15s;
}
.cpm-toggle.on::after { left: 20px; }
.cpm-menu { position: relative; }
.cpm-menu-pop {
	position: absolute;
	right: 0;
	top: 34px;
	background: var(--cpm-modal-bg);
	border: 1px solid var(--cpm-modal-border);
	border-radius: 8px;
	padding: 5px;
	z-index: 100;
	min-width: 120px;
	box-shadow: var(--cpm-shadow);
	backdrop-filter: blur(16px);
	animation: cpmPopIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	transform-origin: top right;
}
.cpm-menu-item {
	padding: 7px 10px;
	border-radius: 6px;
	font-size: 12.5px;
	cursor: pointer;
	color: var(--cpm-text);
	transition: background .12s ease;
}
.cpm-menu-item:hover { background: var(--cpm-tab-hover); }
.cpm-menu-item.danger { color: #ef4444; }
.cpm-tabs {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-top: 18px;
	margin-bottom: 6px;
}
.cpm-tab2 {
	padding: 6px 12px;
	font-size: 13.5px;
	font-weight: 500;
	color: var(--cpm-muted);
	cursor: pointer;
	border: 1px solid transparent;
	background: transparent;
	border-radius: 6px;
	transition: all .15s ease;
}
.cpm-tab2:hover {
	color: var(--cpm-text);
	background: var(--cpm-tab-hover);
}
.cpm-tab2.active {
	color: var(--cpm-text);
	background: var(--cpm-pill-bg);
	border-color: var(--cpm-pill-border);
	font-weight: 600;
}
.cpm-tabbar-search {
	margin-left: auto;
	display: flex;
	align-items: center;
}
.cpm-tab-search-btn {
	width: 28px;
	height: 28px;
	border-radius: 6px;
	background: transparent;
	border: none;
	color: var(--cpm-muted);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: background .15s ease, color .15s ease;
}
.cpm-tab-search-btn:hover {
	color: var(--cpm-text);
	background: var(--cpm-tab-hover);
}
.cpm-tab-search-box {
	display: flex;
	align-items: center;
	background: var(--cpm-search-bg);
	border: 1px solid var(--cpm-search-border);
	border-radius: 8px;
	padding: 4px 10px;
	gap: 6px;
	width: 210px;
	box-sizing: border-box;
	transition: border-color .15s ease, box-shadow .15s ease;
}
.cpm-tab-search-box:focus-within {
	border-color: #2563eb;
	box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.25);
}
.cpm-tab-search-input {
	flex: 1;
	background: transparent;
	border: none;
	outline: none;
	color: var(--cpm-text);
	font-size: 13px;
	font-family: inherit;
	min-width: 0;
	padding: 0;
}
.cpm-tab-search-clear {
	background: transparent;
	border: none;
	color: var(--cpm-muted);
	cursor: pointer;
	padding: 0 2px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 15px;
	line-height: 1;
}
.cpm-tab-search-clear:hover {
	color: var(--cpm-text);
}
.cpm-clear-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 18px;
	height: 18px;
	padding: 0;
	background: transparent;
	border: none;
	border-radius: 50%;
	cursor: pointer;
	color: var(--cpm-muted);
	opacity: 0.55;
	flex-shrink: 0;
	transition: opacity .15s ease, color .15s ease, background .15s ease;
}
.cpm-clear-btn:hover {
	opacity: 1;
	color: var(--cpm-text);
	background: rgba(128, 128, 128, 0.15);
}
.cpm-clear-btn:focus-visible {
	outline: 1px solid var(--cpm-accent);
	outline-offset: 1px;
}
.cpm-input-wrap {
	position: relative;
	width: 100%;
}
.cpm-input-wrap .cpm-clear-btn {
	position: absolute;
	right: 6px;
	top: 50%;
	transform: translateY(-50%);
}
.cpm-input-wrap .cpm-input { padding-right: 30px; }
.cpm-hint {
	color: var(--cpm-muted);
	font-size: 12px;
	margin-top: 12px;
	margin-bottom: 6px;
}
.cpm-skill-list { margin-top: 4px; }
.cpm-skill-item {
	padding: 12px 2px;
	border-bottom: 1px solid var(--cpm-border);
}
.cpm-skill-item:last-child { border-bottom: none; }
.cpm-skill-name {
	font-size: 13.5px;
	font-weight: 700;
	color: var(--cpm-text);
}
.cpm-skill-desc {
	font-size: 12.5px;
	color: var(--cpm-muted);
	margin-top: 3px;
	line-height: 1.4;
}

/* Dialog & Toast */
.cpm-dialog {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.48);
	z-index: 10000;
	display: flex;
	align-items: center;
	justify-content: center;
	backdrop-filter: blur(4px);
	-webkit-backdrop-filter: blur(4px);
}
.cpm-dialog-box {
	background: var(--cpm-modal-bg);
	border: 1px solid var(--cpm-border);
	border-radius: 12px;
	padding: 22px 24px;
	width: 440px;
	max-width: 92vw;
	color: var(--cpm-text);
	box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18), 0 4px 16px rgba(0, 0, 0, 0.08);
	animation: cpm-dialog-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.cpm-dark .cpm-dialog-box {
	background: #202023;
	border: 1px solid rgba(255, 255, 255, 0.12);
	box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
	color: #f4f4f5;
}
@keyframes cpm-dialog-in {
	from { opacity: 0; transform: scale(0.96); }
	to { opacity: 1; transform: scale(1); }
}
.cpm-dialog-title {
	font-size: 16px;
	font-weight: 700;
	margin-bottom: 12px;
	color: var(--cpm-text);
}
.cpm-field { margin-bottom: 12px; }
.cpm-field label {
	display: block;
	font-size: 12.5px;
	color: var(--cpm-muted);
	margin-bottom: 5px;
}
.cpm-input {
	width: 100%;
	background: var(--cpm-search-bg);
	border: 1px solid var(--cpm-border);
	border-radius: 6px;
	padding: 8px 10px;
	color: var(--cpm-text);
	font-size: 13.5px;
	outline: none;
}
.cpm-input:focus { border-color: var(--cpm-accent); }
.cpm-check {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
	color: var(--cpm-text);
	cursor: pointer;
}
.cpm-dialog-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 18px;
}
.cpm-form-row {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin-bottom: 12px;
}
.cpm-form-row:last-child { margin-bottom: 0; }
.cpm-source-dialog-box {
	width: 460px;
	border-radius: 14px;
	padding: 22px 24px 20px 24px;
	box-shadow: 0 20px 50px rgba(0, 0, 0, 0.22), 0 4px 16px rgba(0, 0, 0, 0.08);
}
.cpm-dark .cpm-source-dialog-box {
	background: #1c1c20;
	border: 1px solid rgba(255, 255, 255, 0.12);
	box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.cpm-source-header {
	margin-bottom: 16px;
}
.cpm-source-header-title {
	font-size: 16px;
	font-weight: 700;
	color: var(--cpm-text);
	letter-spacing: -0.01em;
}
.cpm-source-meta-row {
	display: flex;
	align-items: center;
	gap: 7px;
	margin-top: 6px;
	font-size: 12px;
	color: var(--cpm-muted);
	flex-wrap: wrap;
}
.cpm-source-live-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: #10b981;
	box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
	flex-shrink: 0;
}
.cpm-source-repo-text {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-weight: 600;
	color: var(--cpm-text);
	font-size: 12.5px;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	opacity: 0.92;
}
.cpm-source-meta-sep {
	opacity: 0.35;
}
.cpm-source-count-text {
	color: var(--cpm-muted);
	font-size: 12px;
}
.cpm-source-prompt-label {
	font-size: 12.5px;
	color: var(--cpm-muted);
	margin-bottom: 10px;
	display: block;
}

.cpm-radio-group {
	display: flex;
	flex-direction: column;
	gap: 9px;
	margin-bottom: 18px;
}
.cpm-radio-card {
	display: flex;
	align-items: flex-start;
	gap: 11px;
	padding: 12px 14px;
	border-radius: 10px;
	background: var(--cpm-search-bg);
	border: 1.5px solid var(--cpm-border);
	cursor: pointer;
	transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
	user-select: none;
	position: relative;
}
.cpm-radio-card:hover {
	background: var(--cpm-tab-hover);
	border-color: rgba(59, 130, 246, 0.4);
	transform: translateY(-1px);
}
.cpm-radio-card.is-selected {
	background: rgba(59, 130, 246, 0.05);
	border-color: var(--cpm-accent, #3b82f6);
	box-shadow: 0 0 0 1px var(--cpm-accent, #3b82f6), 0 4px 12px rgba(59, 130, 246, 0.1);
}
.cpm-dark .cpm-radio-card.is-selected {
	background: rgba(59, 130, 246, 0.1);
	box-shadow: 0 0 0 1px var(--cpm-accent, #3b82f6), 0 4px 14px rgba(0, 0, 0, 0.35);
}
.cpm-custom-radio {
	width: 17px;
	height: 17px;
	border-radius: 50%;
	border: 1.5px solid var(--cpm-border);
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	margin-top: 2px;
	transition: all 0.15s ease;
	background: transparent;
}
.cpm-custom-radio.checked {
	border-color: var(--cpm-accent, #3b82f6);
	background: var(--cpm-accent, #3b82f6);
}
.cpm-custom-radio-inner {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: #ffffff;
	transform: scale(0);
	transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.cpm-custom-radio.checked .cpm-custom-radio-inner {
	transform: scale(1);
}
.cpm-radio-card-content {
	flex: 1;
	min-width: 0;
}
.cpm-radio-card-header {
	display: flex;
	align-items: center;
	gap: 6px;
}
.cpm-radio-card-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--cpm-text);
	line-height: 1.4;
}
.cpm-radio-rec-badge {
	font-size: 10px;
	font-weight: 700;
	padding: 1px 5px;
	border-radius: 4px;
	background: rgba(59, 130, 246, 0.12);
	color: #3b82f6;
	letter-spacing: 0.3px;
}
.cpm-radio-card-desc {
	font-size: 12px;
	color: var(--cpm-muted);
	margin-top: 3px;
	line-height: 1.4;
}
.cpm-tag-preview {
	display: inline-block;
	padding: 1px 7px;
	border-radius: 5px;
	background: var(--cpm-pill-bg);
	border: 1px solid var(--cpm-pill-border);
	font-weight: 600;
	color: var(--cpm-text);
	margin-left: 4px;
	font-size: 11.5px;
}
.cpm-source-custom-input {
	margin-top: 8px;
	border-radius: 7px;
	padding: 7px 11px;
	background: var(--cpm-bg);
	font-size: 13px;
	transition: border-color .15s ease, box-shadow .15s ease;
}
.cpm-source-custom-input:focus {
	border-color: var(--cpm-accent, #3b82f6);
	box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}
.cpm-radio {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 8px 10px;
	border: 1px solid var(--cpm-border);
	border-radius: 6px;
	cursor: pointer;
	font-size: 13px;
	color: var(--cpm-text);
	transition: border-color .15s ease, background .15s ease;
}
.cpm-radio.selected {
	border-color: var(--cpm-accent);
	background: var(--cpm-tab-hover);
}

/* Install Dialog */
.cpm-install-dialog {
	width: 440px;
	padding: 22px 24px;
	border-radius: 12px;
}
.cpm-install-dialog-header {
	display: flex;
	align-items: center;
	gap: 14px;
	margin-bottom: 12px;
}
.cpm-install-dialog-header .cpm-card-icon {
	width: 44px;
	height: 44px;
	flex: 0 0 44px;
	border-radius: 10px;
}
.cpm-install-dialog-header-info {
	flex: 1;
	min-width: 0;
}
.cpm-install-dialog-title {
	font-size: 16px;
	font-weight: 700;
	color: var(--cpm-text);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: 1.3;
}
.cpm-install-dialog-sub {
	font-size: 12px;
	color: var(--cpm-muted);
	margin-top: 2px;
}
.cpm-install-desc {
	font-size: 13px;
	line-height: 1.55;
	color: var(--cpm-text-sub);
	margin-bottom: 6px;
	word-break: break-word;
}

/* ────────────────────────────── MCP Connector Modal Styles (Refined) ────────────────────────────── */
.cpm-mcp-modal {
	width: 540px;
	max-width: calc(100vw - 32px);
	border-radius: 14px;
	background: #ffffff;
	border: 1px solid rgba(0, 0, 0, 0.08);
	box-shadow: 0 20px 50px rgba(0, 0, 0, 0.16), 0 4px 16px rgba(0, 0, 0, 0.06);
	padding: 0;
	overflow: visible;
	color: #18181b;
	display: flex;
	flex-direction: column;
	position: relative;
}
.cpm-dark .cpm-mcp-modal {
	background: #202023;
	border: 1px solid rgba(255, 255, 255, 0.12);
	box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
	color: #f4f4f5;
}
.cpm-mcp-close-top {
	position: absolute;
	top: 3px;
	right: 4px;
	background: transparent;
	border: none;
	color: var(--cpm-muted);
	cursor: pointer;
	padding: 3px;
	border-radius: 6px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.15s ease;
	z-index: 20;
}
.cpm-mcp-close-top:hover {
	color: var(--cpm-text);
	background: var(--cpm-tab-hover);
}
.cpm-status-btn:hover {
	filter: brightness(1.12);
	box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.35);
}
.cpm-mcp-body {
	padding: 18px 22px 16px 22px;
	display: flex;
	flex-direction: column;
	gap: 12px;
	overflow: visible;
}
.cpm-mcp-row {
	display: grid;
	grid-template-columns: 120px 1fr;
	gap: 16px;
	align-items: flex-start;
}
.cpm-mcp-row-top {
	align-items: flex-start;
}
.cpm-mcp-label {
	font-size: 13px;
	font-weight: 500;
	color: #27272a;
	height: 34px;
	display: flex;
	align-items: center;
}
.cpm-dark .cpm-mcp-label {
	color: #f4f4f5;
}
.cpm-mcp-control {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.cpm-mcp-card-box {
	background: rgba(0, 0, 0, 0.025);
	border: 1px solid rgba(0, 0, 0, 0.08);
	border-radius: 8px;
	padding: 8px;
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.cpm-dark .cpm-mcp-card-box {
	background: rgba(255, 255, 255, 0.03);
	border: 1px solid rgba(255, 255, 255, 0.08);
}
.cpm-mcp-input {
	width: 100%;
	height: 34px;
	background: #ffffff;
	border: 1px solid rgba(0, 0, 0, 0.12);
	border-radius: 6px;
	padding: 0 10px;
	color: #18181b;
	font-size: 13px;
	font-family: inherit;
	outline: none;
	box-sizing: border-box;
	transition: all 0.15s ease;
}
.cpm-mcp-input:focus {
	border-color: #2563eb;
	box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}
.cpm-mcp-input::-ms-reveal,
.cpm-mcp-input::-ms-clear,
.cpm-mcp-input::-webkit-credentials-auto-fill-button {
	display: none !important;
	width: 0 !important;
	height: 0 !important;
	visibility: hidden !important;
	pointer-events: none !important;
}
.cpm-dark .cpm-mcp-input {
	background: #18181b;
	border: 1px solid rgba(255, 255, 255, 0.12);
	color: #f4f4f5;
}
.cpm-dark .cpm-mcp-input:focus {
	border-color: #3b82f6;
	box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
}
.cpm-mcp-input.is-invalid {
	border-color: #ef4444 !important;
}
.cpm-mcp-input.is-invalid:focus {
	border-color: #ef4444 !important;
	box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2) !important;
}
.cpm-dark .cpm-mcp-input.is-invalid {
	border-color: #f87171 !important;
}
.cpm-dark .cpm-mcp-input.is-invalid:focus {
	border-color: #f87171 !important;
	box-shadow: 0 0 0 2px rgba(248, 113, 113, 0.25) !important;
}
.cpm-mcp-field-error-wrapper {
	display: grid;
	grid-template-rows: 0fr;
	opacity: 0;
	transition: grid-template-rows 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease, margin-top 0.18s ease;
	margin-top: 0;
	overflow: hidden;
}
.cpm-mcp-field-error-wrapper.is-visible {
	grid-template-rows: 1fr;
	opacity: 1;
	margin-top: 4px;
}
.cpm-mcp-field-error-inner {
	min-height: 0;
	display: flex;
	align-items: center;
	gap: 5px;
	font-size: 12px;
	line-height: 1.35;
	color: #ef4444;
}
.cpm-dark .cpm-mcp-field-error-inner {
	color: #f87171;
}
.cpm-mcp-list-item {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
}
.cpm-mcp-pw-wrap {
	position: relative;
	flex: 1;
	display: flex;
	align-items: center;
}
.cpm-mcp-pw-btn {
	position: absolute;
	right: 6px;
	background: transparent;
	border: none;
	color: var(--cpm-muted);
	cursor: pointer;
	padding: 4px 6px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 4px;
	transition: all 0.15s ease;
}
.cpm-mcp-pw-btn:hover {
	color: var(--cpm-text);
	background: var(--cpm-tab-hover);
}
.cpm-mcp-del-btn {
	background: transparent;
	border: none;
	color: var(--cpm-muted);
	cursor: pointer;
	padding: 6px;
	border-radius: 6px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.15s ease;
}
.cpm-mcp-del-btn:hover {
	color: #ef4444;
	background: rgba(239, 68, 68, 0.1);
}
.cpm-mcp-add-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	background: transparent;
	border: 1px dashed rgba(0, 0, 0, 0.16);
	border-radius: 6px;
	height: 30px;
	padding: 0 12px;
	color: var(--cpm-text);
	font-size: 12.5px;
	font-weight: 500;
	cursor: pointer;
	width: 100%;
	justify-content: center;
	transition: all 0.15s ease;
}
.cpm-dark .cpm-mcp-add-btn {
	border: 1px dashed rgba(255, 255, 255, 0.18);
}
.cpm-mcp-add-btn:hover {
	background: var(--cpm-tab-hover);
	border-color: var(--cpm-accent);
}

/* Custom Dropdown Styles */
.cpm-custom-select {
	position: relative;
	width: 100%;
}
.cpm-custom-select.is-open {
	z-index: 100;
}
.cpm-select-trigger {
	width: 100%;
	height: 34px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	background: #ffffff;
	border: 1px solid rgba(0, 0, 0, 0.12);
	border-radius: 6px;
	padding: 0 10px;
	color: #18181b;
	font-size: 13px;
	font-weight: 400;
	cursor: pointer;
	text-align: left;
	transition: all 0.15s ease;
	outline: none;
}
.cpm-select-trigger:focus, .cpm-select-trigger.open {
	border-color: #2563eb;
	box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}
.cpm-dark .cpm-select-trigger {
	background: #18181b;
	border: 1px solid rgba(255, 255, 255, 0.12);
	color: #f4f4f5;
}
.cpm-dark .cpm-select-trigger:focus, .cpm-dark .cpm-select-trigger.open {
	border-color: #3b82f6;
	box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
}
.cpm-select-chevron {
	color: var(--cpm-muted);
	display: flex;
	align-items: center;
	transition: transform 0.18s ease;
}
.cpm-select-trigger.open .cpm-select-chevron {
	transform: rotate(180deg);
}
.cpm-select-menu {
	position: absolute;
	top: calc(100% + 4px);
	left: 0;
	right: 0;
	background: #ffffff;
	border: 1px solid rgba(0, 0, 0, 0.12);
	border-radius: 8px;
	padding: 4px;
	z-index: 10005;
	box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.08);
}
.cpm-dark .cpm-select-menu {
	background: #1f1f23;
	border: 1px solid rgba(255, 255, 255, 0.14);
	box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4);
}
.cpm-select-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 7px 10px;
	border-radius: 6px;
	font-size: 13px;
	color: #18181b;
	cursor: pointer;
	transition: all 0.12s ease;
}
.cpm-dark .cpm-select-item {
	color: #f4f4f5;
}
.cpm-select-item:hover {
	background: rgba(0, 0, 0, 0.05);
}
.cpm-dark .cpm-select-item:hover {
	background: rgba(255, 255, 255, 0.08);
}
.cpm-select-item.selected {
	font-weight: 500;
	color: #2563eb;
}
.cpm-dark .cpm-select-item.selected {
	color: #3b82f6;
}

.cpm-mcp-footer {
	position: relative;
	z-index: 1;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 20px;
	border-top: 1px solid rgba(0, 0, 0, 0.08);
	background: rgba(0, 0, 0, 0.02);
	border-bottom-left-radius: 14px;
	border-bottom-right-radius: 14px;
}
.cpm-dark .cpm-mcp-footer {
	border-top: 1px solid rgba(255, 255, 255, 0.08);
	background: #18181b;
}
.cpm-mcp-footer .cpm-btn {
	transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.cpm-mcp-footer .cpm-btn-secondary {
	background: rgba(0, 0, 0, 0.05);
	border: 1px solid rgba(0, 0, 0, 0.08);
	color: #18181b;
}
.cpm-dark .cpm-mcp-footer .cpm-btn-secondary {
	background: rgba(255, 255, 255, 0.08);
	border: 1px solid rgba(255, 255, 255, 0.1);
	color: #f4f4f5;
}
.cpm-mcp-footer .cpm-btn-secondary:disabled {
	opacity: 0.35 !important;
	background: rgba(0, 0, 0, 0.03) !important;
	border: 1px solid rgba(0, 0, 0, 0.08) !important;
	color: var(--cpm-muted) !important;
	box-shadow: none !important;
	cursor: not-allowed !important;
}
.cpm-dark .cpm-mcp-footer .cpm-btn-secondary:disabled {
	opacity: 0.35 !important;
	background: rgba(255, 255, 255, 0.03) !important;
	border: 1px solid rgba(255, 255, 255, 0.1) !important;
	color: #71717a !important;
	box-shadow: none !important;
}
.cpm-btn-ghost {
	background: transparent;
	border: 1px solid transparent;
	color: var(--cpm-muted);
	height: 32px;
	padding: 0 12px;
	border-radius: 6px;
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.15s ease;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
}
.cpm-btn-ghost:hover {
	color: var(--cpm-text);
	background: var(--cpm-tab-hover);
}
.cpm-mcp-status-pill {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	font-weight: 500;
	padding: 3px 8px;
	border-radius: 6px;
	transition: all 0.15s ease;
}

/* MCP Diagnostic Popover (Rich Status Inspection) */
.cpm-mcp-diag-popover {
	position: absolute;
	top: calc(100% + 8px);
	left: 0;
	width: 360px;
	max-width: calc(100vw - 40px);
	background: #ffffff;
	border: 1px solid rgba(0, 0, 0, 0.1);
	border-radius: 10px;
	box-shadow: 0 16px 36px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.06);
	z-index: 10005;
	overflow: hidden;
	animation: cpmDiagIn 0.16s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	pointer-events: none;
}
.cpm-dark .cpm-mcp-diag-popover {
	background: #1e1e22;
	border: 1px solid rgba(255, 255, 255, 0.12);
	box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 4px 12px rgba(0, 0, 0, 0.4);
}
@keyframes cpmDiagIn {
	from {
		opacity: 0;
		transform: translateY(-4px) scale(0.98);
	}
	to {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}
.cpm-mcp-diag-header {
	padding: 8px 12px;
	font-size: 12px;
	font-weight: 600;
	display: flex;
	align-items: center;
	justify-content: space-between;
	border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
.cpm-dark .cpm-mcp-diag-header {
	border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.cpm-mcp-diag-header.is-success {
	background: rgba(16, 185, 129, 0.1);
	color: #10b981;
}
.cpm-mcp-diag-header.is-error {
	background: rgba(239, 68, 68, 0.1);
	color: #ef4444;
}
.cpm-mcp-diag-header.is-neutral {
	background: rgba(0, 0, 0, 0.03);
	color: var(--cpm-text);
}
.cpm-dark .cpm-mcp-diag-header.is-neutral {
	background: rgba(255, 255, 255, 0.04);
}
.cpm-mcp-diag-body {
	padding: 10px 12px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.cpm-mcp-diag-desc {
	font-size: 12px;
	color: var(--cpm-text-sub);
	line-height: 1.45;
	word-break: break-word;
}
.cpm-mcp-diag-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
	margin-top: 2px;
}
.cpm-mcp-diag-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.cpm-mcp-diag-k {
	font-size: 9.5px;
	font-weight: 600;
	letter-spacing: 0.5px;
	text-transform: uppercase;
	color: var(--cpm-muted);
}
.cpm-mcp-diag-v {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 11.5px;
	color: var(--cpm-text);
	word-break: break-all;
}
.cpm-mcp-diag-endpoint {
	grid-column: span 2;
	background: rgba(0, 0, 0, 0.04);
	border: 1px solid rgba(0, 0, 0, 0.06);
	border-radius: 6px;
	padding: 6px 8px;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 11px;
	color: var(--cpm-text-sub);
	word-break: break-all;
	line-height: 1.4;
}
.cpm-dark .cpm-mcp-diag-endpoint {
	background: rgba(0, 0, 0, 0.25);
	border: 1px solid rgba(255, 255, 255, 0.06);
}

/* MCP Tools Collapse & Capability Pills */
.cpm-connector-collapse-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	border-radius: 0;
	border: none;
	background: transparent !important;
	box-shadow: none !important;
	color: var(--cpm-muted);
	cursor: pointer;
	padding: 0;
	margin: 0;
	transition: color 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.cpm-connector-collapse-btn:hover {
	background: transparent !important;
	color: var(--cpm-text);
	border: none !important;
	box-shadow: none !important;
}
.cpm-connector-collapse-btn svg {
	transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
.cpm-connector-collapse-btn.is-expanded svg {
	transform: rotate(180deg);
}

.cpm-mcp-tools-panel {
	margin-top: 10px;
	padding: 12px 14px;
	border-radius: 8px;
	background: rgba(0, 0, 0, 0.02);
	border: 1px solid var(--cpm-border);
	animation: cpmToolsIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.cpm-dark .cpm-mcp-tools-panel {
	background: rgba(255, 255, 255, 0.03);
	border: 1px solid rgba(255, 255, 255, 0.08);
}
@keyframes cpmToolsIn {
	from {
		opacity: 0;
		transform: translateY(-4px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}
.cpm-mcp-tools-summary {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	font-weight: 500;
	color: var(--cpm-muted);
	margin-bottom: 10px;
	user-select: none;
}
.cpm-mcp-tools-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
}
.cpm-mcp-tool-pill-wrap {
	position: relative;
	display: inline-flex;
}
.cpm-mcp-tool-pill-wrap:hover {
	z-index: 50;
}
.cpm-mcp-tool-pill {
	display: inline-flex;
	align-items: center;
	gap: 6.5px;
	padding: 5px 10px;
	border-radius: 6px;
	font-size: 12px;
	font-family: var(--cpm-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
	background: #ffffff;
	border: 1px solid rgba(0, 0, 0, 0.12);
	color: var(--cpm-text);
	cursor: pointer;
	transition: all 0.15s ease;
	user-select: none;
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.cpm-dark .cpm-mcp-tool-pill {
	background: rgba(255, 255, 255, 0.06);
	border: 1px solid rgba(255, 255, 255, 0.14);
	color: #f4f4f5;
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
.cpm-mcp-tool-pill:hover {
	background: var(--cpm-tab-hover);
	border-color: #6366f1;
	color: var(--cpm-text);
	transform: translateY(-1px);
	box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}
.cpm-dark .cpm-mcp-tool-pill:hover {
	background: rgba(99, 102, 241, 0.14);
	border-color: #818cf8;
	box-shadow: 0 2px 10px rgba(99, 102, 241, 0.25);
}
.cpm-mcp-tool-pill.is-disabled {
	opacity: 0.45;
	background: rgba(0, 0, 0, 0.02) !important;
	border: 1px dashed rgba(0, 0, 0, 0.14) !important;
	color: #94a3b8 !important;
	box-shadow: none !important;
	transform: none !important;
}
.cpm-dark .cpm-mcp-tool-pill.is-disabled {
	background: rgba(255, 255, 255, 0.02) !important;
	border: 1px dashed rgba(255, 255, 255, 0.12) !important;
	color: #71717a !important;
}
.cpm-mcp-tool-pill.is-disabled:hover {
	opacity: 0.68 !important;
	background: rgba(0, 0, 0, 0.04) !important;
	border: 1px dashed rgba(0, 0, 0, 0.24) !important;
	color: #64748b !important;
	box-shadow: none !important;
	transform: none !important;
}
.cpm-dark .cpm-mcp-tool-pill.is-disabled:hover {
	background: rgba(255, 255, 255, 0.04) !important;
	border: 1px dashed rgba(255, 255, 255, 0.2) !important;
	color: #a1a1aa !important;
	box-shadow: none !important;
	transform: none !important;
}
.cpm-mcp-tool-dot {
	width: 5.5px;
	height: 5.5px;
	border-radius: 50%;
	flex-shrink: 0;
	background: #10b981;
	box-shadow: 0 0 4px rgba(16, 185, 129, 0.4);
	transition: all 0.15s ease;
}
.cpm-mcp-tool-pill:hover .cpm-mcp-tool-dot {
	box-shadow: 0 0 7px rgba(16, 185, 129, 0.7);
	transform: scale(1.15);
}
.cpm-mcp-tool-pill.is-disabled .cpm-mcp-tool-dot {
	background: #71717a;
	box-shadow: none !important;
	transform: none !important;
}
.cpm-dark .cpm-mcp-tool-pill.is-disabled .cpm-mcp-tool-dot {
	background: #52525b;
}

/* MCP Tool Detail Popover */
.cpm-mcp-tool-popover {
	position: fixed;
	z-index: 100030;
	width: 340px;
	max-width: calc(100vw - 32px);
	background: rgba(255, 255, 255, 0.72);
	backdrop-filter: blur(20px) saturate(180%);
	-webkit-backdrop-filter: blur(20px) saturate(180%);
	border: 1px solid rgba(0, 0, 0, 0.08);
	border-radius: 8px;
	box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.10), 0 2px 8px rgba(0, 0, 0, 0.04);
	padding: 12px 14px;
	pointer-events: auto;
	animation: cpmPopIn 0.16s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	font-family: inherit;
	box-sizing: border-box;
}
.cpm-mcp-tool-popover::before {
	content: "";
	position: absolute;
	top: -6px;
	bottom: -6px;
	left: -12px;
	width: 14px;
	background: transparent;
}
.cpm-mcp-tool-popover.is-flipped-left::before {
	left: auto;
	right: -12px;
}
.cpm-dark .cpm-mcp-tool-popover {
	background: rgba(55, 55, 57, 0.75);
	backdrop-filter: blur(22px) saturate(180%);
	-webkit-backdrop-filter: blur(22px) saturate(180%);
	border: 1px solid var(--cpm-modal-border);
	box-shadow: var(--cpm-shadow);
}
.cpm-mcp-tool-popover-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 6px;
	user-select: none;
}
.cpm-mcp-tool-popover-title {
	font-size: 12.5px;
	font-weight: 600;
	color: var(--cpm-text);
	line-height: 1.35;
	flex: 1;
	min-width: 0;
	word-break: break-word;
}
.cpm-mcp-tool-popover-badge {
	font-size: 10.5px;
	font-weight: 600;
	padding: 1px 6px;
	border-radius: 4px;
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	cursor: pointer;
	transition: all 0.15s ease;
	user-select: none;
}
.cpm-mcp-tool-popover-badge:hover {
	opacity: 0.82;
	transform: scale(1.02);
}
.cpm-mcp-tool-popover-badge.is-enabled {
	background: rgba(16, 185, 129, 0.12);
	color: #10b981;
	border: 1px solid rgba(16, 185, 129, 0.25);
}
.cpm-mcp-tool-popover-badge.is-disabled {
	background: rgba(161, 161, 170, 0.12);
	color: var(--cpm-muted);
	border: 1px solid rgba(161, 161, 170, 0.25);
}

.cpm-mcp-tool-popover-body {
	max-height: 170px;
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-width: none;
	-ms-overflow-style: none;
	transition: mask-image 0.2s ease, -webkit-mask-image 0.2s ease;
	padding-bottom: 2px;
}
.cpm-mcp-tool-popover-body::-webkit-scrollbar {
	display: none;
}
.cpm-mcp-tool-popover-body.mask-bottom {
	mask-image: linear-gradient(to bottom, #000 0%, #000 calc(100% - 24px), rgba(0,0,0,0.76) calc(100% - 14px), rgba(0,0,0,0.28) calc(100% - 6px), transparent 100%);
	-webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 calc(100% - 24px), rgba(0,0,0,0.76) calc(100% - 14px), rgba(0,0,0,0.28) calc(100% - 6px), transparent 100%);
}
.cpm-mcp-tool-popover-body.mask-top {
	mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.28) 6px, rgba(0,0,0,0.76) 14px, #000 24px, #000 100%);
	-webkit-mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.28) 6px, rgba(0,0,0,0.76) 14px, #000 24px, #000 100%);
}
.cpm-mcp-tool-popover-body.mask-both {
	mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.28) 6px, rgba(0,0,0,0.76) 14px, #000 24px, #000 calc(100% - 24px), rgba(0,0,0,0.76) calc(100% - 14px), rgba(0,0,0,0.28) calc(100% - 6px), transparent 100%);
	-webkit-mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.28) 6px, rgba(0,0,0,0.76) 14px, #000 24px, #000 calc(100% - 24px), rgba(0,0,0,0.76) calc(100% - 14px), rgba(0,0,0,0.28) calc(100% - 6px), transparent 100%);
}

.cpm-mcp-tool-popover-desc {
	font-size: 12px;
	line-height: 1.45;
	color: var(--cpm-muted);
	word-break: break-word;
}
/* Smart Lightweight Markdown Styling */
.cpm-smart-md {
	font-size: 12px;
	line-height: 1.5;
	color: var(--cpm-text);
	word-break: break-word;
}
.cpm-smart-md p.cpm-md-p {
	margin: 0 0 6px 0;
	color: inherit;
	line-height: 1.5;
}
.cpm-smart-md p.cpm-md-p:last-child {
	margin-bottom: 0;
}
.cpm-smart-md .cpm-md-list {
	margin: 5px 0 6px 0;
	padding-left: 16px;
	list-style-type: disc;
}
.cpm-smart-md .cpm-md-list.is-ordered {
	list-style-type: decimal;
}
.cpm-smart-md .cpm-md-list:last-child {
	margin-bottom: 0;
}
.cpm-smart-md .cpm-md-list-item {
	margin-bottom: 5px;
	line-height: 1.45;
	color: inherit;
}
.cpm-smart-md .cpm-md-list-item::marker {
	color: #6366f1;
}
.cpm-dark .cpm-smart-md .cpm-md-list-item::marker {
	color: #818cf8;
}
.cpm-smart-md .cpm-md-list-item:last-child {
	margin-bottom: 0;
}
.cpm-smart-md .cpm-md-code {
	font-family: var(--cpm-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
	font-size: 11px;
	padding: 1px 4.5px;
	border-radius: 4px;
	background: rgba(99, 102, 241, 0.08);
	color: #6366f1;
	border: 1px solid rgba(99, 102, 241, 0.16);
}
.cpm-dark .cpm-smart-md .cpm-md-code {
	background: rgba(99, 102, 241, 0.15);
	color: #a5b4fc;
	border: 1px solid rgba(99, 102, 241, 0.28);
}
.cpm-smart-md .cpm-md-bold {
	font-weight: 600;
	color: var(--cpm-text);
}
.cpm-smart-md .cpm-md-key {
	font-family: var(--cpm-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
	font-size: 11.5px;
	font-weight: 600;
	color: #4f46e5;
	background: rgba(99, 102, 241, 0.08);
	padding: 1px 4.5px;
	border-radius: 4px;
	display: inline-block;
	margin-right: 2px;
}
.cpm-dark .cpm-smart-md .cpm-md-key {
	color: #c7d2fe;
	background: rgba(99, 102, 241, 0.18);
}
.cpm-smart-md .cpm-md-heading {
	font-weight: 600;
	margin: 8px 0 4px 0;
	color: var(--cpm-text);
}
.cpm-smart-md .cpm-md-h1, .cpm-smart-md .cpm-md-h2 {
	font-size: 13px;
}
.cpm-smart-md .cpm-md-h3, .cpm-smart-md .cpm-md-h4 {
	font-size: 12px;
}
.cpm-smart-md .cpm-md-quote {
	margin: 5px 0 6px 0;
	padding: 3px 8px;
	border-left: 2.5px solid #6366f1;
	background: rgba(99, 102, 241, 0.05);
	border-radius: 0 4px 4px 0;
	color: var(--cpm-text);
	font-style: normal;
}
.cpm-dark .cpm-smart-md .cpm-md-quote {
	border-left-color: #818cf8;
	background: rgba(99, 102, 241, 0.1);
}
.cpm-smart-md .cpm-md-pre {
	margin: 6px 0;
	padding: 8px 10px;
	border-radius: 6px;
	background: rgba(0, 0, 0, 0.04);
	border: 1px solid rgba(0, 0, 0, 0.08);
	overflow-x: auto;
	font-family: var(--cpm-mono, monospace);
	font-size: 11px;
	line-height: 1.45;
}
.cpm-dark .cpm-smart-md .cpm-md-pre {
	background: rgba(0, 0, 0, 0.35);
	border: 1px solid rgba(255, 255, 255, 0.1);
}
.cpm-smart-md .cpm-md-pre code {
	background: transparent;
	border: none;
	padding: 0;
	color: inherit;
}
.cpm-smart-md hr.cpm-md-hr {
	margin: 8px 0;
	border: none;
	border-top: 1px solid rgba(0, 0, 0, 0.08);
}
.cpm-dark .cpm-smart-md hr.cpm-md-hr {
	border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.cpm-smart-md .cpm-md-callout {
	font-weight: 600;
	color: #6366f1;
	display: inline-block;
	margin-right: 3px;
}
.cpm-dark .cpm-smart-md .cpm-md-callout {
	color: #818cf8;
}
.cpm-smart-md a.cpm-md-link {
	color: #6366f1;
	text-decoration: underline;
	text-underline-offset: 2px;
	transition: color 0.15s ease;
}
.cpm-smart-md a.cpm-md-link:hover {
	color: #4f46e5;
}
.cpm-dark .cpm-smart-md a.cpm-md-link {
	color: #818cf8;
}
.cpm-dark .cpm-smart-md a.cpm-md-link:hover {
	color: #a5b4fc;
}
.cpm-smart-md .cpm-md-cmd {
	font-family: var(--cpm-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
	font-size: 11.5px;
	font-weight: 600;
	color: #6366f1;
	background: rgba(99, 102, 241, 0.08);
	border: 1px solid rgba(99, 102, 241, 0.18);
	border-radius: 4px;
	padding: 0.5px 5px;
	display: inline-block;
	white-space: nowrap;
	line-height: 1.35;
	vertical-align: baseline;
	margin: 0 1.5px;
}
.cpm-dark .cpm-smart-md .cpm-md-cmd {
	color: #a5b4fc;
	background: rgba(99, 102, 241, 0.15);
	border-color: rgba(99, 102, 241, 0.3);
}
.cpm-smart-md .cpm-md-cmd-arg {
	opacity: 0.75;
	font-weight: 400;
}
.cpm-mcp-tool-popover-params {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin-top: 8px;
	padding-top: 8px;
	border-top: 1px solid rgba(0, 0, 0, 0.06);
}
.cpm-dark .cpm-mcp-tool-popover-params {
	border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.cpm-mcp-tool-popover-param-tag {
	font-size: 10.5px;
	padding: 1px 5px;
	border-radius: 3px;
	background: rgba(99, 102, 241, 0.1);
	color: #6366f1;
	font-family: var(--cpm-mono, monospace);
}

.cpm-toast {
	position: fixed;
	bottom: 28px;
	left: 50%;
	transform: translateX(-50%);
	background: rgba(255, 255, 255, 0.95);
	color: #09090b;
	border: 1px solid rgba(0, 0, 0, 0.08);
	border-radius: 12px;
	-webkit-corner-smoothing: 100%;
	corner-smoothing: 100%;
	padding: 11px 16px;
	font-size: 13px;
	z-index: 100001;
	max-width: min(92vw, 500px);
	width: max-content;
	box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8) inset, 0 4px 12px -2px rgba(0, 0, 0, 0.06), 0 16px 36px -6px rgba(0, 0, 0, 0.12);
	-webkit-backdrop-filter: blur(20px) saturate(190%);
	backdrop-filter: blur(20px) saturate(190%);
	display: flex;
	align-items: center;
	gap: 20px;
	pointer-events: auto;
	animation: cpm-toast-in 0.28s cubic-bezier(0.16, 1, 0.3, 1);
	user-select: none;
}
.cpm-dark .cpm-toast {
	background: rgba(24, 24, 27, 0.95);
	color: #f4f4f5;
	border: 1px solid rgba(255, 255, 255, 0.1);
	box-shadow: 0 1px 0 0 rgba(255, 255, 255, 0.12) inset, 0 4px 12px -2px rgba(0, 0, 0, 0.4), 0 20px 48px -8px rgba(0, 0, 0, 0.7);
}
@keyframes cpm-toast-in {
	from { opacity: 0; transform: translate(-50%, 14px) scale(0.97); }
	to { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
.cpm-spin-ring {
	display: inline-block;
	width: 13px;
	height: 13px;
	border: 2px solid rgba(59, 130, 246, 0.25);
	border-top-color: #3b82f6;
	border-radius: 50%;
	vertical-align: middle;
	animation: cpm-spin-anim 0.75s linear infinite;
}
@keyframes cpm-spin-anim {
	to { transform: rotate(360deg); }
}
.cpm-toast-content {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	justify-content: center;
}
.cpm-toast-title {
	color: #09090b;
	font-size: 13px;
	font-weight: 600;
	letter-spacing: -0.01em;
	line-height: 1.35;
	display: flex;
	align-items: center;
}
.cpm-dark .cpm-toast-title {
	color: #f4f4f5;
}
.cpm-toast-body {
	color: #71717a;
	font-size: 12px;
	line-height: 1.4;
	margin-top: 2px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.cpm-dark .cpm-toast-body {
	color: #a1a1aa;
}
.cpm-toast-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-shrink: 0;
}
.cpm-toast-action-btn {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 5px 12px;
	border-radius: 8px;
	font-size: 12px;
	font-weight: 550;
	font-family: inherit;
	background: #18181b !important;
	color: #fafafa !important;
	border: 1px solid rgba(255, 255, 255, 0.1);
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08);
	cursor: pointer;
	white-space: nowrap;
	transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.cpm-dark .cpm-toast-action-btn {
	background: #f4f4f5 !important;
	color: #18181b !important;
	border: 1px solid rgba(0, 0, 0, 0.1);
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.cpm-toast-btn-label {
	color: inherit !important;
	font-weight: inherit;
	line-height: 1;
}
.cpm-toast-arrow {
	display: inline-block;
	font-size: 11px;
	line-height: 1;
	color: inherit !important;
	transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.cpm-toast-action-btn:hover {
	transform: translateY(-1px);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
	opacity: 0.95;
}
.cpm-toast-action-btn:hover .cpm-toast-arrow {
	transform: translateX(2.5px);
}
.cpm-toast-action-btn:active {
	transform: translateY(0) scale(0.97);
}
.cpm-toast-close {
	width: 22px;
	height: 22px;
	border-radius: 6px;
	border: none;
	background: transparent;
	color: #71717a;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0;
	flex-shrink: 0;
	transition: all 0.15s ease;
}
.cpm-dark .cpm-toast-close {
	color: #a1a1aa;
}
.cpm-toast-close:hover {
	color: #09090b;
	background: rgba(0, 0, 0, 0.06);
}
.cpm-dark .cpm-toast-close:hover {
	color: #f4f4f5;
	background: rgba(255, 255, 255, 0.08);
}
.cpm-spin {
	display: inline-block;
	width: 13px;
	height: 13px;
	border: 2px solid var(--cpm-muted);
	border-top-color: var(--cpm-text);
	border-radius: 50%;
	animation: cpm-rot .8s linear infinite;
	vertical-align: -2px;
	margin-right: 6px;
}
@keyframes cpm-rot { to { transform: rotate(360deg); } }
.cpm-icon-btn.is-refreshing svg {
	animation: cpm-rot 0.75s linear infinite;
}
.cpm-tooltip {
	padding: 5px 10px;
	border-radius: 6px;
	font-size: 11.5px;
	font-weight: 500;
	line-height: 1.35;
	white-space: nowrap;
	box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
	background: #ffffff;
	color: #18181b;
	border: 1px solid rgba(0, 0, 0, 0.12);
	animation: cpmTipIn 0.12s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.cpm-root.cpm-dark .cpm-tooltip, .cpm-tooltip.cpm-dark {
	background: #27272a;
	color: #f4f4f5;
	border: 1px solid rgba(255, 255, 255, 0.14);
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.3);
}
@keyframes cpmTipIn {
	from {
		opacity: 0;
		transform: translateY(3px) scale(0.96);
	}
	to {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}
`;

	function ensureCss() {
		let el = document.getElementById("cpm-style");
		if (!el) {
			el = document.createElement("style");
			el.id = "cpm-style";
			document.head.appendChild(el);
		}
		el.textContent = CSS;
	}

	function isDarkMode(ctx, rootEl) {
		// 1. Check DSH ctx.theme service
		try {
			if (ctx && ctx.theme) {
				const t = typeof ctx.theme.getTheme === "function" ? ctx.theme.getTheme() : (typeof ctx.theme.current === "string" ? ctx.theme.current : (typeof ctx.theme === "string" ? ctx.theme : null));
				if (t === "dark") return true;
				if (t === "light") return false;
				if (typeof ctx.theme.isDark === "boolean") return ctx.theme.isDark;
			}
		} catch {}

		// 2. Check HTML / Body attributes and classes
		try {
			const html = document.documentElement;
			const body = document.body;
			const htmlTheme = (html.getAttribute("data-theme") || "").toLowerCase();
			const bodyTheme = (body.getAttribute("data-theme") || "").toLowerCase();
			if (htmlTheme === "light" || bodyTheme === "light") return false;
			if (htmlTheme === "dark" || bodyTheme === "dark") return true;

			if (html.classList.contains("light") || body.classList.contains("light")) return false;
			if (html.classList.contains("dark") || body.classList.contains("dark")) return true;
		} catch {}

		// 3. Inspect computed background of settings container or parent elements
		try {
			let node = rootEl || document.querySelector(".cpm-root") || document.querySelector('[role="dialog"]') || document.querySelector(".settings") || document.body;
			while (node && node !== document.documentElement) {
				const bg = window.getComputedStyle(node).backgroundColor;
				if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
					const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
					if (m && m[1] !== undefined) {
						const lum = (parseInt(m[1]) * 299 + parseInt(m[2]) * 587 + parseInt(m[3]) * 114) / 1000;
						return lum < 150; // true if dark, false if light
					}
				}
				node = node.parentElement;
			}
		} catch {}

		// 4. Default: check document element / body text color
		try {
			const fg = window.getComputedStyle(document.body).color;
			const m = fg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
			if (m && m[1] !== undefined) {
				const lum = (parseInt(m[1]) * 299 + parseInt(m[2]) * 587 + parseInt(m[3]) * 114) / 1000;
				// If text is dark (lum < 150), then background is light!
				return lum > 150;
			}
		} catch {}

		return false;
	}

	// ────────────────────────────── API ──────────────────────────────
	async function api(path, options) {
		const res = await fetch("/universal-plugin-hub/api" + path, {
			headers: { "Content-Type": "application/json" },
			...options,
		});
		let body = null;
		try { body = await res.json(); } catch { /* no body */ }
		if (!res.ok) throw new Error((body && body.error) || `HTTP ${res.status}`);
		return body;
	}

	// ────────────────────────────── Smart Fuzzy Search Engine ──────────────────────────────
	function normalizeSearchStr(s) {
		return String(s || "").toLowerCase().replace(/[-_.\s/]+/g, "");
	}

	function calcSearchScore(query, rawItem) {
		if (!query) return 1;
		const q = query.trim().toLowerCase();
		if (!q) return 1;

		const qNorm = normalizeSearchStr(q);
		const item = rawItem || {};
		const name = String(item.name || "").toLowerCase();
		const nameNorm = item._normName || (item._normName = normalizeSearchStr(name));
		const displayName = String(item.displayName || "").toLowerCase();
		const displayNorm = item._normDisplay || (item._normDisplay = normalizeSearchStr(displayName));
		const author = item._normAuthor || (item._normAuthor = String(item.author || "").toLowerCase());
		const desc = item._normDesc || (item._normDesc = String(item.description || "").toLowerCase());

		// 1. Exact match on raw or normalized name
		if (name === q || displayName === q) return 1000;
		if (nameNorm === qNorm || displayNorm === qNorm) return 900;

		// 2. Starts with query prefix
		if (name.startsWith(q) || displayName.startsWith(q)) return 800;
		if (nameNorm.startsWith(qNorm) || displayNorm.startsWith(qNorm)) return 750;

		// 3. Substring of normalized string (e.g. "ab" matches "a-b-testing", "airtable", "ad-be")
		if (nameNorm.includes(qNorm)) return 600 + (100 - Math.min(nameNorm.indexOf(qNorm), 99));
		if (displayNorm.includes(qNorm)) return 550 + (100 - Math.min(displayNorm.indexOf(qNorm), 99));

		// 4. Token multi-word matching (e.g. "sec audit" matches "security testing ... audit")
		const tokens = q.split(/\s+/).filter(Boolean);
		if (tokens.length > 1) {
			const allTokensMatch = tokens.every((t) => {
				const tNorm = normalizeSearchStr(t);
				return nameNorm.includes(tNorm) || displayNorm.includes(tNorm) || desc.includes(t) || author.includes(t);
			});
			if (allTokensMatch) return 500;
		}

		// 5. Subsequence fuzzy match (e.g. "ab" matches "Adobe for creativity")
		let qIdx = 0;
		for (let i = 0; i < nameNorm.length && qIdx < qNorm.length; i++) {
			if (nameNorm[i] === qNorm[qIdx]) {
				qIdx++;
			}
		}
		if (qIdx === qNorm.length) {
			return 400;
		}

		// 6. Author or Description match
		if (author.includes(q)) return 300;
		if (desc.includes(q)) return 200;
		if (normalizeSearchStr(desc).includes(qNorm)) return 150;

		return 0;
	}

	// ────────────────────────────── Dynamic GitHub & Brand Avatar Resolver ──────────────────────────────
	const BRAND_ICONS = {
	"google": "data:image/png;base64,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",
	"bigquery": "data:image/png;base64,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",
	"spanner": "data:image/png;base64,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",
	"alloydb": "data:image/png;base64,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",
	"cloud sql": "data:image/png;base64,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",
	"firestore": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAALa0lEQVR4nOyceXRTZd7Hf8/NnjRp05QmbVpoSSmWCmWRt8WyqqiIiAucvr4v+r4DgnAcGJkZjuiA0hGFAYejnpFBlBEQFBUVBxQEWTrD5qHDvnSBtmmTLmnTpNnX+8yJLIOVlufJvYHqyeec/NHc35bvvfe5z3YrxBhDnOhhbncBP3fiAnIkLiBH4gJyJC4gR+ICciQuIEfiAnJESGK0ePFiKC8vj1kR+Up5Wp5CVpAtlxi0YkmGXirSAkAiAEiumPgBwGHyBVrtwZC52uOruuDynKl0e00Blv+BwOzZs2Hy5MlEtkQCRsTbtWsX17quoRYwwsdSk+8f0ytpUrFaOV4ZFBhQO7p2PNiFn/bKpz8APBxRlWUbyzvc333S1Lp1h8W20xVmQ3zUN2HCBGJbIgH5IlcuTZ/dWzfrUW3yzAShIJ1rPAnDpBerlU9HPivvYFu+bWnfuMZkWV3ucNfxU/HNuSUCDk2U6xcbMkuLk5RPAULiWOSQMIz2kbSUBZPSNPP3tnWsW1JtWlzl8bbGItf1xPQhopeIk1fn9319+9C8imK1akasxLseBEh4X0rSswcLB9Sszu+7TC8RJ8UyX8wEnJepLTk6YmDlFJ3mRRHDJMQqT5cwTMIUnWZhpIYn01LujVkavgOKEWLWD8xZtSi39xaJgEnhOz4tEgGT+mZe1s7SfplzJQziPT6vAmpEwoSv78r78qFU9Xw+43IFISSa01v39oaBOe8pBQJe233eBCxMTDAcuTv/SIFK8QhfMfnmHk3itMe0ySP5jMnL2YiIt3VI/8OR24WPeDEBY+8LlcZHNza2HuAzLOcrMHLbbhxk+LKHi+ePiPeBuXU336E5CRh5YGwZnLtZLRYP5K8knsGAV9aap8dCPOB6C6+90/AGn20exth+1uk5Ue3xVViDITMg1nX5AKPUikVp2TJJv/4JssFihulFGNC3stY8Y2Vt00d81diZqAVckJlawsfTFmMc+KfNsXljQ8u6fTbXEVc4zHZnL0YIHuiVOGJaeuoz45JVTwJCsi4Ce2N1215PVAJmS8TqeYbMv3BJjAGHDlgd65ZW1y894/aZSP0CGMN2i/1I5JOrkL70B0PGogd7Jc1BgAT/CR67Nq8zUbWBCwz6BVw6ybZQoPLpE1WFJSerZtOI15kqt6/l/05fnPv8+br7/WH28rg3xm1eZ6ivwKGJMv1kbfLcaBMesTk+fu5CzRyTN9gRbYzOfNzUtu94h6tgw6CcdZ+3WDfFss3rDLWAy+ZCqaQqkMBapdTJNje0LFlY3VDqj8FuiEqPr6no6NmHeA98E6hu4bw+kH7P2OBTymnVIOzjpEr0bbN1xfyq+piIdzuhEvD5J5hZAEjMyMOQ8N+XQFLU/EOjczMqXd69M87XLuRSaE+FWEC1CkRTxzIzr/6NGAD5uOYfhEQJgS79Aixrm3v20vTAL3QXE7GAJaPReKUc/WQaXpTtAtX/V4FA576h35r65gUn3d56jnX2WIgFHD8cTeoyiDIEyqcugnhw24++N/v8596qafyAY409GmIBxw5mxnd3HAkxKCaYQD7RCCC4PJj4qMGy3IlxtyOLnztE3ZhBfVGaUoEMJLaSQTYQpPig5YvMpvebLZ9wrrCHQyTgndmogGYyXJjuhf25FR/ZtrFdLfESUzjv2FmuMWjAAB4kOPZfpPZEAuboya6+6/nHafZbWp8bodDm5fMRhwZpUksvACBaEiVqA3XJkEFTAMYYl53C39P49CTkGgPx7yUSsHcq0tIU4PGBqaYJHDQ+PQmRXKMjtSUSEF/e6ENMoxWaaOx7GkJZkprUlrQbI6GswUVp39NQkBrG9wfeGAGpIamAPprsCIGKxr4HQtz5JxIQAVBNfmamAueta7cZ4guGSMB6C7bQZBeLIK1v2s/5KsTEk51EAja3A9W6BQKExhSgIhqfnoTXWmMltSUSsLIBV9IWUTxM3OXsDQ2YO9Q5A+424guGaCh3pgafwsN+aAuJOB7QwKa8YU+KlHt+H3QG/KTF3Ij9i5Scego5E5Yt6D1y7gpiB4yDvvbaegCyPUhExZ034lanG18isd3hy4T5jiJwCaUazYSsqURVxJDk7FGjaOwD7raKoNdGvFmd+OweOMXu6TYxZmC5cxC85hoCgSvdqF5jDAuRVHTb+poKdV+lIr2Aaneqs/HkMRp74h/398P4s66OXQop4Vf20fCVP+tH30s08nx9yYB5NAXxia5wxjMIITmNT5v50D4ae2IBvziI93e4sbHz92V+Hcyyj4Ka8I17LboHDcvkuSk5NEXxgUSVrsooevZFKicMYdupHVQvxBAL6HQB/ryMvba+EcYI3nHnwULncPB09yxCSJo1c8gaJIzBBuVuyJ2yeqlAJCXbxXUFj/XSQU9rBXEXBmjHwm9uZd8DjP12VgTzHEWwydsPSJ7N8kzVvVm/KfoTTS4upA2dNqaX4d7naP0s57ZtofWhEvBCPTS+fVj57gz7aDgepDq5oBmetiBr/l1vCxTimL7ck9hnxICch5Z/fHnlmhw2FLCZv39vM20+6ifkS++ypSa/NKrJ0pTCPnPvWDJmt0SnIJ5vo0E7uGTs4OnbD4pkSWm0vpaqHX/1d5jo9qtEI6C/saPddtT0Dq3fVWSZqnF5r447ohqeOjTaGJ1hpAJhzv/MWZQ/5f3dAqGU/uRg7Knb8/pbUeWOxsm05dxKNhBui8Y3glAp6d/vtyO/7/di8RppXyXVektn1IX64gEr7j+UNMnyqk/zqQhDmDqG5cLXGzyWCqoJk6tE1R4FrV6b8cPjT2dPH74dEPnk4/UghISJBbpnVYO0091V7dvbDpk+dVe1HvDWdbR05xdpQxX9U4YmDUl9UD08/XFRkqzg6rGA+hsIySpA1jIbBCGyZRw25LfXfbd0aTS/Abjskbbuqd+p7JdamjK6zx+jjQFX3iJK6K95PPKJdMRC4VCdt67jZNDiMyIABysMYxQSJAjkwjRphipHrJHlI+i6c8xKa8CdUQry5l+D0Dfgpvnryt6Y72o52xht/ZyeiMa1x1+TZaqGKbLVZK933xQEQoEoS2lIyQLqlejrELjBk74SJO1PgNg+EVAXXS1788mtxrJV6zlk4rYmgkMsW/36wf8N2HxnuMSJCYgFv+Yz8GrfAoy8PzkccLVWnttQMgOHOU0WcV9UCjkD7osrDj0ccvqruMaKBaGEE+DWvwphUcO174Jeu/H0pqkP+B1mzmvXvMyUeGrt9RVLyooDLg/VTMatgpWYwZ2xBALK/cCGfO2nP5w60dFQ/pNxfTTwNtXkMzvbzs/fO85dY/uKr5i8woTAo17XeGLL6HEdxiPneAvLVyC4cjtXvHzgMdsx8yo+4/KB3+opP//K3qKOC+dP8xmX98lOHGLxpT8f/V3tuvKJAZu3gu/41PVgHLIeNi4//8J3xb4aZwPf8WM2sLfuMX5jP2jenVYycF7qfX1eYYSCW77M6WvzHq5fW/6c47TlJKnPtm3bYORI8neyYzrdHvaGQqb1J1ZdeKVsQMfZtvcxxtz6DIRErnzj3048ce75XcU04kXIyckBjUZDbH9L/m+M95LNXL20bKZUr3xZO7HfrOQRGTMFMpGezxwYY9bX6tjfusu4tm1vzeesP0w/KI6CW/qfi3xmZ5Nx7fHShvWnXkss1BUrc1PvUeSoi+XZScMRIKpbHAMOh52BavfF9mPOC9Z99n817vSZnd2Oo2MBkYCjRo0CpVLJZ94QAJSBA8rgOABzTsDI+6pzZZmqAUK1PFumU0SuTjUASK9MefsAoCPQ7rGEHH6T1+Ss8NTazwTbvR4APYBED3D3IF4KU6nommr0C32B6JYR3x/IkbiAHIkLyJG4gByJC8iRuIAciQvIkbiAHPl3AAAA//9qcWivleNrBQAAAABJRU5ErkJggg==",
	"firebase": "data:image/png;base64,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",
	"aws": "data:image/png;base64,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",
	"amazon": "data:image/png;base64,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",
	"s3": "data:image/png;base64,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",
	"dynamodb": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAAM40lEQVR4nOxaeVhT17Y/BxJkCoR5DBCqDAIiUwJFQAaZHbjXOl/v1e9e7b2v2qfWVm3ldbB9tM8Rq09t8cmjggMoAopakYIMApkYZUbLIJMISYTMeZ8c2J4kJwGHDi/N78sfa6+z9s7+nb332muvfXBSqRT6I0Hrt+7Arw0NYXWHhrC6Q0NY3aEhrO7QEFZ3aAirOzSE1R0awuoO3IwWEomkqbmFVVv/6FH3GJstlUoJBENHB1KAn+98d9dfpZMYEIvFDFYdncHq6e3j8fgEgqEDyc7L08PbywOPx6uoqIpwW3tn+g9Zufk3hoaGMQ3cXOft37c7KjwMaC5lX9350f7nM0dLa/PGdZ/u36NYq39gMDFpTf/AIARBJkRidtY5V5e5imYFN269/8FePl8AQdD2f235cNd28OjC5SuHjp74ubtHsRaBQFixNG7v7h1mZqaYfVY6pfOv3wyNSvju7P8qYwtBUHNL24a/bT2bfh5obKythZPg8/nnMrIEAoFirZu3i7p7ehGzwaGh3LzrmI1nZF7kcp8hZtZWlohSJBJtfW/H+7v2YrKFIIjD4WRkXtq2E+NFI1A6wnQGSyKRgKKtjTWJZK87Zw6Hy21ta+dynyF6qVT68X8c8PP19vbyhCAokOpPIBhyOFwIgiZ4PAarLpDiL9dydQ1dpkhnKP67QCCopk3pYRiOWRKByCkHj+Xm3QBmlhbmnp7zTYjE5+9ucKipuYXN5kAQNDSsdJCUEtbG4WAYDgkOTFqeGB4WYmNtBR4JRaIbhbf3fPLZyNNRZJGnnjiTdioVgiA8Hh8RFnKtoBCxLK+oUiRcJUuYzqgVikR4nExPmKy68fEJRPbx9rKaHOGe3r6Tp9MQJR6PP3rwq6RlCdra2qCWWCyuoTPPX7iMQynlIVWCoeHhnp5eZU+lUmnhrTuWJBfk5zDXi88XIPpLOblAn7TqL3K1enr7kEd2zh7AjMGslTM7eOQ4eHrs21OI8lxGJlDuS/5CRd9UQOkaNjczs7OzVfqeICg2OhIsLR6f39HZhciR4WHgrdMZLB6fj64F5rOfj7fLvClfBWYvwL2KKiDHxSxBhN6+fqB0Jjuq6JsKvNY+jN6WBqd9m6kJkRLgi8g8Pp/OYKGr3J8mTKX4B1GnZvv9ahraZmJigs5gIvJbzk7z5jojMsHQANhUVtFerc+vRdjIyAjIfD4PyNFREUAur6xCVwEjTA3wo04v7xrZEa6mMQUCISLHRkcBPRXlDvKv39z/2VfAd84esyLM5wuaW9rKK6vulVey6hrAYMIwjGkfHRUOZDThMTa7uaUN2aUp/r7Anw0NP+nsegjMyioqgRwX84Iwxd/Xz8cbFM+kpXtTQnZ8+HFRcYlQKJwd35kirdKyilPf/U9ZRRVfdikaGxt5erj39j3GrDXXmexMdkI4MJi1ExMTenp6EATR6Exkq/NwdyUQDAkEQxLJrru7F3HdzmSnqXc0vYAtLMzRDCEIOn7k68SktSNPnyJFLvdZ5oXszAvZxkZGUZGLlyXERkWE4XCqSCkdYaFQuH3nnnfWbSoqLpVj+3ysxtjlFVUPH/6srHrM9CALBMIa+tSCrK6ZmrpUagAiBFGmhKrqqanO4XBYdQ3TjURoacn08C1n8o1rF6kBfvL9YbNzrub99e//CgyNVhbJzEB4+669F7OvgqKpCTE6Knz9mnfWr3knMT7GZ+ECQwMDFe2CUAE9q+/XTHka6rRXC5z2W8BRV1bTxGIxIsfFRCq2THZyzMvJzM46t3plEtHYWO5pd0/v1vd2phw8pqxj2KNfVFx6JTcfkWEY3vfhznf/sUlHRyYol0gkm7duK7x1B7MFSoAfkWg8OjoGpqhAIGCy6qd4BkzxBMu4o7Nr+MkTczOz8vL7iMbAQH/R24HK+h0SHBQSHCQUie5X0a4X3r5eeHtwaAg8PZJ6MjiIEhIcpFgRe4QzMi8CecPaVdv/bYscW8Tx6OjoKOuQtrZ2ZHgoIrNq65+Nj9fWNyJLw5nsaGlpgTx6y5lsaWGOyMisLquYIhweFqKrq6usfQR4HC4kODDlQDKz6qfUwykmRCJ4dPr7dMwq2ISZrDogL18ap+z/njwZUdEb4KuFIlF1DQO1IckEm2CzqaYxRkaeNj5oQYrxKP88I3A43OqVSadPHAYa2vROLgdswkiQjMDUxATThsfj1U57l8kZLv8lQURYKIiQyyurQAgtF12D8KO6hlFeWYV8kYDD4SJRp85ZIiwkGLhoEIrLAZswgWAIZGUHsdSTZzhcLigqHlCMjAhBgRRELiuvBG6JSpHxsYHTjrquofHO3ZIpJdWfSJR3SDNiYGBQJBIhMvq0gwY2YQ93NyCfSUsXTreCQCgSHTzy7eFjJ9HK0rIKxXbArGbW1j+dnDVWlhZkJ5kw2N3NxXgyYhOJRDlX8xAl5nz+5lDqgZSDygZAIBDs2f85KIaHLcI0gzE/asm8mL1j98eg6OuzYOP6NbY2Nmw2m8mqy7te2N3TB0GQnZ1Nb+9U7IHH4SpLb5Ps7dDtPPq5m7JIpuvLEuO+O3lU7u82bHr3x6LiF32CYVrFXXuFo0tC0moanQXDsLeXRyA1wNVlnqWFuY6Ozhh7rLGx+fKVaz29fYilnq5uadF1B5K9IjXsbWn1yqTMizkgxGUw6xjMOjmb+NglR//rq7AliY/7B5BhL7hx659bNqNtHB1Ibq7zkHASQSBFPmZAlGjCnh7uimwnaegh51lWXQML5T7kKWlrHz/yNSZbpVNaW1s7/fuTb0+vQDno6+sl79uddirV2Ngo5UAyPIlNf1n31w1rFY0T42OADMPw4lCMmRYeFoIurlgaj/m/nyfv9ZWNNBXh6EDKykhbmhCrzAB7SiOQSCS3frybm3+j6UELm8Mx0Nd3JjuFLgr6c9IyM9MXrru45J6BgQHF3xezEYFAWFRcMsF7fpZyJNn7+S7ENKuhM7t7ngfVBvr6EYtDVGQeG5uai34qpTNYrW0dw8NPJni8OXN0bKytFy7wjI4Kj42OUgwZZktYLfGHS8RrCKs7Zr5q+X+BgYHBahqjubWt73E/l8OFYNiIQCDZ2/r6eL8dSEGnBGQIP2hudSY7zZmj9Az0e4NYLL5yreBcRhaNjn1UQEL3a9kv7kZkvLSHTxCBQEjetzs+dskv39vXRdfDR5u3bmuaPl0pAwzD/Y+aXxTRhBubmtf9bUt//4C/78IPdmxTFo7+TnCvvPLO3RJ7O1srSwsLC3NjI4Kurp5UKhkdHautbzh6/NTA4BAEQbq6cx61osJEucR8b9/jqLgkJLsfv3xVUXGpWCx+tRz/b4szaekIi+DwWLRe3kvb2ljn5Zxf9ecVk2do1tqNfw+PWZaReQkJlX7PYHM4RcWl3GdTmWoQq3l5zJexU/aGzmdddnTxBnc58zz89yV/Ud/Q9KsMz8uByarb9dEnZLeFliSXD/YmI8pPPv0S6XnmhWy0sarQsrPr4bade+QcoLuby4plCcsSYkEa+bdCe2dXfsHNnNz8tvYORGNoaHD21PGw0GAIgpbE/6muoRGHw9XWlJqbmYFaM8TSYrE47dz5rw8dVbzUcHdziY4MjwwP9fXxVv2VwRuEUCSiM1h3i0tvFxU/aG5FPwqiBhw79J+ODiRkW/amhEql0oS46LOnj6PNZnV46Hvc/2XKoZzcfExjAwN9aoAfNcA/wN9ngZcHwdDwTVB7gfHx8bqGphoa8351zf1qmuKrNyES9320Y8PaVSBrfzb9/N7J7EfBlawA2WPcS5yWausavvzmcElpuQobGIadyU7z3V1dXeY6k53Ijg4kezszM1O5CwQVGB0d6+nt63r4qKPrYXNLW2NTc3tHJ/pbBDR0dXU3bVz779v+KZeRj1+xis6oXZoQ+/1/y2fkX/p4WENnHkk9efene7OviMfjLSzMzExNicbGhoYGenp6eBxORwcvEotFIhGPx+dyn42x2SMjIwODQxMTs9oO9PX1Nq5f8+4/Nikm69raOxZFxFuYmxXdvGY1nQAHeMXzcGtbe9q5H7Kv5r3CheVrguzkuHHDmvWrVxobG2EafPpFSvr5Cxcz0igKV1CvmwAYHx8vKLx99VpBaVmlSDaz+cZhbmaaGB/zp+VLqVhZMTRST5wODqIqS628mYzH09HRO3dLiopL7pVVDqu8jngpaGlpecx3WxwaHBUeFuDvq63iU5VZ4w2neCQSSXtHZzWNWVvf0ND4oLW1HYQ+s+oNDNvb2c53d/X0cPfzWejn6614P/ia+MVzWgODQ93dPY/7BwaHhkdHx7hc7gSPh8x/HR0dfX09YyMjU1MTaysreztbBwd7vZku0F4TmiSeukNDWN2hIazu0BBWd2gIqzs0hNUdGsLqDg1hdYeGsLrj/wIAAP//VehyFlcFgXwAAAAASUVORK5CYII=",
	"oracle": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAI60lEQVR4nOyceVAUV/7Am+m5p2dgTkQZHeVGEBOV+CMSbxOljOSnVTGKm8Q1JnFNyngkHqxZTRldQ9XWsqVu1Cp2y7DqZldjgoknxkBhXBDRQQFHRhS552Luo5vemknBAiL9ZrrVhvTnL/vxfd/+zqemu99781o2juMQQ+iwnnUBQx1GIEkYgSRhBJKEEUgSRiBJGIEkYQSShBFIEkYgSRiBJGEEkoQRSBJGIEkYgSRhP4mkOIpC7paHI3wmY7TXbJTiXo8AgqCwJ3Guwcpg8fhOToTMzFWomvgjotogmE354idlAu211YnGyxcW2W5VzbbX3UqHICicqtxUEAbDZuG4+PLwiVMuSjOmnxInT6ijJC+ZFWmvoV3eeur4SuPl8zmetpYJVBT0tOAqVDeUc7OOqF7J/jtvxEhDqHlCEuizmEWNBfu2tZ85tQ6CIEGoJ6cDYTBsV8zJ+tOYVR/uZUvC7UH3D0ag/97WcvJoTlPh4b2YyxkV7MnoDCxCGke//btPIhdkH4Vg8DsbsECf2Si+s2tLgU17fTGJOmlP+HPpR+Ny96xkI2I3SDyQQKdeF1v7+3UnvYb2FCqKpDtcuVIb/4e815D45HqiWEKBnZVX02pz1xXjGCqjski6AwuEzUl7D8xE4pPvDBY36EDaPzSp27Hph1+bPD+Yyzmy5uP3f7TVaBMGi3vsN9DT2qy6uWb5Ncxhjw6lALZYopekTS4RqMfc5kTIWyEIcvifQ6HkCgH/oB3xGjtGuh7ox1u11zMxh310KIm4cmVd6v7CyZwI6YBP6AEF4ijKql638geHrmZeMCdjiyVN8hkvH1LOWXAMSUyhZKBKFdbqqlTD+aI3jCUXV2IOe2QwfZGE8aeT8758lcXldfX/24ACG/blbWr99vjeIM7hifr/ZTuj33wvD+YLvMEU97RBrZ2i+4fzt3Sc/XaT/wsG2i8655210StW7+vf/ohAW402/vaGd27gGMYHScyLiq6I2/zZCiQxpRa0GDrQWXl1Un3ejq+8xo5EkPgwDtec9uWxZP4odWvv9kceIk1fHdoJKk8Ul3QuNf9vM4aaPD/hz79wLXV/4RShJrYEJB73eaUN+/P29G/vI9BWXZViqbiyBCQhkphyNnnvgYVsSbgjiLpphf/BkLj7LwsFas1VkHhLRVmOtfp6Uu+2PgIbjxzc6h8CESWCRUhDfO4fl8JCEa3vdyBwZYrOxF35C2CB8CFAONxedGJN74Yege6mxkhrVTnINM0Xt3nX61ylyhJSxTSEFxll0qzZ+C5IrLG0eBnmcPC6j3sEmkqLs0GeSrIXZxREpGf8h0S9tEQ5b+H3SFLqN0RxuM8rM/50Iav7uEegpaJsPsB50FHLVgUzvBlSaN5bv9k/CSGKM5UW91ypAYFdqA+y197KJOqIJKWeFsUmEE6whyr+wb8oNqGYKM6qrZyHo2jg3wGBzrt18V1eD+F8Vzl7wRFqSqUv0oyZJ4hiujxuhbOhfizUI/BePchyPCrLnH2WiiLpjHRKxiWQOPfD+4HhTECgu+lBLFEHjlR293ET6uGEQDNOB0EQ4ed0tzYHFicCAlGnXUWYWK25R1GNtIbF5XXxR6oJ7/NdLqcS6hbobWtFiDPDZmpKpD9hMGwkivEaO4RQMDsTYB7/kaWc4QqLLwD+rAGBbLGEcEqGuRwSsoUNFTCHnXBTACxCAs5+ESgJ7yDq4DW0qymqj/Z42lrGEsWwEbEJ6hbIU0U1EHVwNz9MwBwODkU10hbnvbujcAxVEMVxFcrA4kNAoHBcXDVAbqGl8ucXqSiSztiqq6aBxAnUY/3DnV8EimITtBAEuYg6GYvPvkFBjbTGdOXyIoAwl0ATE1hE7r4HeoWamAqiXuarJcu9He0RVBRKRzxtLTJrVXk2UZwoLqmUjYj/9xDxEz5p6jmijjiGipr/dWQtBbXSksaC/bk4hhFulpK+MK1n2YvVq5FwEu2n7buvN7mbGkeQqJOW2Kqrkg2XznwAEOpTzJr/z+6DHoGStMm3BWpNGVFvHMMkus+3/ANzOYfNExlzOjj6/N2HQDacSiY8X8Qfpe7ZT9hnJhK1OGc3yAkdd+tm3vvzbqBYuoOjKKTbtfWg674+AyQ+Mmvxgd7HfQQq52ad5kVFAy3XGy6d2VCft+MzCEOf9t5nysBRNEy3e1u+paLsLZB4/xUqz5x1oXdbH4FhbDauXrE6F7SAjvNFubXb1xegdtuQu5x9ZqP41sbVJ0ylxSD3PT/YmNUffdB/o/ojiwmK2fPPhz+XXghaiKXiypva95dfN/x4dhZon2cKhkId577L0q79zTV7jZZwyNKNbNqsv0akZ1T2bx9wb4zPYkZurFpyE7VZCeeEvRGOjTsTnbPqc9m0WUC/9j9N/JerseTinKbCw9tcjQ3Tg+nLlkTo0w4em8iRym39//bY7W2W8rKpdZ+uLwYZF/WHEyHTS9ImnUMSxpfzo0fr2Ii4nStXAW2ZpQqPoV2A2ayRrqYH8fbbN9Ot2sqXUWtn0AsiYRyuJXnPvkxxysQBp7uD7lBt/eb4aw0H8r4G2a0wTOmK2bB9kXLewqLHBQy6oDoi+/WTY9796G2Q30qHHSzYE7Nh+9LB5EGgm8zbiv79asP+L47iGCakska6EgazXePWbV2inLfwe8JY0NccLOVlU+rzdhT6LKY4KoqkK1yF6nbsxzuXSdIm3QCJD+pFG5/FLKz/4tN8S8WV35IpkqZ0Sae+dDBmw/aNwWzZC+lVL1Np8bSHhYd3OfW6l4LuTEMEas2l0as+zJVOzSRcC+gPqZcNjSUXZzQfK/jEcbfulZCTPDu6RHFJZ0YtfWsPmXErKYHdOPW60aaff8ruLL8y166r+T/c55WTTvoEYHF5RiRxfJlkwqTz0ozpp0QxCQ/I5qREYG9wFIUc+jvj3I33kz2GNo3PaJA/wzc6XZwImYGrirwvHBNzSzA25h6LTe20nXKBvzaY/zOBJIxAkjACScIIJAkjkCSMQJIwAknCCCQJI5AkjECSMAJJwggkCSOQJP8NAAD//5wURZXAxMajAAAAAElFTkSuQmCC",
	"netsuite": "data:image/png;base64,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",
	"sap": "data:image/png;base64,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",
	"ui5": "data:image/png;base64,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",
	"fiori": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAKlUlEQVR4nOybe3BU5fnHv2f37G42u8nuhrAhCRgSTAAhyM+fqLTWwRtQlXoBWdkaonihZWhhLO3UP9Q/qvUyvaij1At1pNqqwIJCcaJUK1WggoKKuZAQcoMEsvfsfc+eczrvJoub7Dmb3ZwkmJnzmXlndM/7vud5v+d5nvd5XyYKyEhCFlAisoASkQWUiCygRGQBJSILKBFZQInIAkpEFlAisoASkQWUiCygRGQBJSILKBFZQInIAkpEFlAisoASkQWUCI1Xjhy50EZMWNrqd1DUHhd/oe2YiPDt9dvw8DIrTcW4C23LhIPvqN+Ox5bXwO9haYqVBcwGvqNhG//YbVYiHvl/WhFjL7RNEwaus3E798TKmoR4BJpi5RSYCVxnwzb28eVWBLyDPI6mWNkDh4Pratwee9paM1Q8pPPA0lwlbpqmxRWT1SjPo2FQU+B4wB3l0OlnUe9m8Lk9gi8dUTDDpFGjmsLt03MFn/WGWOztCgs+m22kcZVZk3Zusgd6GQ49ARbNXgZeZnQjiutqtDFPr1wlJB76BRy8+uoCFR65zIil03JBZ1Bme6Mc9p0O4e3WAD7oCkHoe9TOyMNTVxYIjg/FOMx46zQ80dSBi8xq/OkHwuOEICtp9jCo6wrh9RM+NHtjGY8VnO90oy36x7tTwjYZBSljEu3+Kh0+/UkJbinLTDyCQa3AigoddtxoxvMLTUieL9Fqq/Si47W0Aiun5wqOi7t8FhCTZxlV2Fidjy/uKMVTC4xQc6nzZtL4jgZb5Jm7LPA5o2nfSTyQtNoqHZ7/USHUyqxsPk+E5fHcMQ8S8yXa5ZNUmG1Spx1bM1OfMi7eshQwGeIAv5xnwNbrJ0PJCcydpvGdDbbwszVWBMU9L4GC4jhM0VB45oeFIzaW8Oo3HrS6IiDzJbe7KsW9L8H/m3Mw20CnjAUvPZ/dWqHHz+bkp8wt1viuRlvo2Z8O63kJ4ieRB+aaoFcLx6w/yuGjjgA6+xgoKWCSVonKAg2qC3OgGvBWZyiGPxx2YuipRqWksDwDAQl3Vurx+EHHoN/SeWCjM4Igw0GloDAtXwVTjnjobLrchL9+7QYzTMnG9pywhTavycjzEtDEyBvLdIIPPWEWV7/Rhi5fajI25SiwYmY+1v6fCZuPuuEOxEAN6bO0QgdzLp2RIXdW5eH3n9mRvMR0Av68rhvHzkX6+wG4YboOLy6egiK9KqUvseFKswYHzoRE52O7T9iCm1dbEOrLqq5TkDqgNE94kUTA3j5GME94AjFsOerCVa+1YutXLsE+tXMMGRtSblRjYXHOoPFpQ5jlv+vHcvhXqw/37D4t2n3uJLVoziO7bfDlNdZsxUMiB7IiX3q6UY2375iKaTql+MvJjhVL/b1Yq8D15XmC8zY7hOu+u+cYMt5EyLOh7zzUGYA3LKzBZK3wGrgzTbbAS/dYeL8ro5w3FIWC5XHSIT72uvI8fLm2Eq8sm4obynXQUAAV//rp24rZBigF0mqrM4I/H7QLvuvWmfnQK6nzc6TzwH4BBzclxwu+M75QPtVuErb+LQ9Y+RF43vl5iQfubvSk7aRWKnDnHCO2W8pxYsNsvHBzKRZO1YruZOA4rJxjFJyrrtmLuiYvGIFbIL1GiZsu1ifNlU7A1PcurtBDL1KHuQLMoL5x8V5dY+EDI/O8BPE68B9HnWg8J55gkzHkKGGdX4C9tRdj/wNVWDZzoERICot5Zg2qp2gFxxPxfEEGhzoCgs9XzDVmlgOJuAP5r0CjQO38Arx020Wi3evPBs/PS8TzbV1r5cMj97wENDEkGmWx+q1TePfeSpQa0he9ycydosXrK8uxt8GDdTvbEYj2e1XNfOHjlzPA4HC7D2Sr/fCEB9dUpObIRRWGeL6yB2JAGv121syIn4NpJRX/qOlwBmI43O6Pix4712Lr+9uDltEQD4kQJq3dEcL1LzZg1zfOrCe5+RIj3lhVARV4aBXA8nnCAr7f4AHH9r9vn0jaILXlynmmYUPYoKUxSUcPKx7huf09YBgWbE+zre/NdaPieQkUyUnV5WOw9q1TWLq5AXUNbpLKMuaaGflYs2AyllTlw6gVLov2HHedf1ebPYymc0HBfqsuK+zvNwonkf0tXrzy2VmwPS0275sPWvigtJw3FFroKx/r8GP11haUGNRYVm3CktkmXFmuh0psixvgvqvMaLEL51J3MIYDJ/sGedXe427MKkq95ppVpMWlxdqsLxOGsvtrJzba2hA922LzvLPeyod9o375SZk3/TcjKwv1NKwLJmP9tSXx8BGD5HUhnX1hFrZjDtR3BxFmOBQb1Fh8iRGXlwnXin/Z34NOVxhP3l6exXL6OdLuw3MfncG+Ji9i9hab+511lrEQj0AVPXQwq89cZdbi403zQA/jjVLp8USw+ZNu/O42YQF3HrXDMXDEJCUR8fB2RxhfdvrR4+2P0pj9pM1l22Dlg+5RDdtkBoXw3QuL8EW7D009wrmJ0GYPIcryoEd47ZUpxUYNrqkUPwq+/O9ufHNauBQiZ2PGcdLm2r7ewkfGxvMS0Ik8U2rS4PHby+Oeta/eiR1H7DjY4o1/2QTGXBoP31KG3JFeGmbJtbNM4g95iObImKPV5tq10TrW4iHZA9ddWwKNqj8sl1ZPijeC08/AH2ahpimY8zWiR6UxMU459H7nO+JHOQEBGUerzbnrF2PueQniAhYZ1Vi1sEiwwyS9Kt5GCtkwdh7uxRUz8jF9cu6g0PcGYzje5Ue+Vol5FwlvJmKQEmeogIyz1eba/dC4eF4CmhyXNi6ZBu0YheWBE278+u/N8f9WKSkU6FRxz/KFY/CF2Hgk/vjSSdiydk52E/ODLxuIeI73Noyb5yVQkDxy9FQf2nrFN450HGr2oPGMX/R53THH+XCLMRx6PRF0O8PwkaPawO+ffOtCIJzdv6Al5iSNsZ+0OfeMr+clUJBQ2HHoLBY9ehj3vHAc//yiF/4MFvNtpw/rtzRgw2uNqCoWvrYnNeG+rx3feYtIC0dZ7G9wZ289z8d3W8eejRYu5BmzUiUd1NT7P07JxCTEZpXqUFmiQ7FJg7yc/sKZCNvlCOOr9j502vsvRbUaJcwiFxAsy6PLGU656hfCqFPBoMvs+p/Q44rA33vS5nh/k5ULXxjxEBfwvlQBJwJRV6vNvvchCx8d/7BNhh6NA/t4Q8Rz1P3GmiyeIseUk1t29RJKQWtCpz//IObr9o6HLYrh8tP3rUWdrbbe939lSQ5bOq8k17z46SfVBZUlCm0BVbjo0Uc0Uy4tGycBB6r6CdCirlM77R8M9jxC3iXLV/sad22m86aUKXOMptCZI+/lV6+qHRcBKfCYCI1xte6y122yCG0YCrW+kA06e5Va09Sc4vkL/E27DyjUeeNy3qTTXZt/X4i6297t/fC3q7hIn2B9Fez4dEferFvvDZz6eDsb9roKFm68L9R54PB42EYznvbv9Z85xIKu487/PLFWTDxCqPOzJoVaZ9RedPV14Fk2cu54Q1/9tr3ja6nMiJD/UkkisoASkQWUiCygRGQBJSILKBFZQInIAkpEFlAisoASkQWUiCygRGQBJSILKBFZQInIAkpEFlAisoASkQWUyP8CAAD//3ghcMakDz8NAAAAAElFTkSuQmCC",
	"hana": "data:image/png;base64,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",
	"microsoft": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAACXBIWXMAAA7EAAAOxAGVKw4bAAABTklEQVR42u3aMUoDURSF4RMRy4CdZXAZYqs2Ii7AnaQQGzei9rZKkKzAItgIYpUiRVCwsFSLiThGUil4le+v3pDmcvjfnAzcBMAfptN+eNpf7yXZKDLbVff8fpIkh5fpJtktMtfoaDs37w/Lcz9uJjkpMuhWksnsvJbkrMhc/eQjwCWX8HsI8IcDfBEJA381QIG6wgxkIAOhhV1hV5iBYKAScYUZCO9ABgpQiYCBSoSBAoQSYaASYSAEqEQYqESQ5OuG6iDNZmgFrlvncaG57miDOnza0s/pYzfNQncFxjlYfU6S14usJOkVmWva2cnDonfgXmpt6Q9m516S2yJz9ZMca13/A32JMBC+RBgoQCUiQCgRBgpQgEqEgUqEgQKEEmGgEmEgBKhEGKhEwEABKhEGQokwUIBKBAuY31AdpdnArEB7G35aaK4hbYB/wxsO4jG9a3r5rAAAAABJRU5ErkJggg==",
	"playwright": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAACXBIWXMAAA7EAAAOxAGVKw4bAAABTklEQVR42u3aMUoDURSF4RMRy4CdZXAZYqs2Ii7AnaQQGzei9rZKkKzAItgIYpUiRVCwsFSLiThGUil4le+v3pDmcvjfnAzcBMAfptN+eNpf7yXZKDLbVff8fpIkh5fpJtktMtfoaDs37w/Lcz9uJjkpMuhWksnsvJbkrMhc/eQjwCWX8HsI8IcDfBEJA381QIG6wgxkIAOhhV1hV5iBYKAScYUZCO9ABgpQiYCBSoSBAoQSYaASYSAEqEQYqESQ5OuG6iDNZmgFrlvncaG57miDOnza0s/pYzfNQncFxjlYfU6S14usJOkVmWva2cnDonfgXmpt6Q9m516S2yJz9ZMca13/A32JMBC+RBgoQCUiQCgRBgpQgEqEgUqEgQKEEmGgEmEgBKhEGKhEwEABKhEGQokwUIBKBAuY31AdpdnArEB7G35aaK4hbYB/wxsO4jG9a3r5rAAAAABJRU5ErkJggg==",
	"pyright": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAACXBIWXMAAA7EAAAOxAGVKw4bAAABTklEQVR42u3aMUoDURSF4RMRy4CdZXAZYqs2Ii7AnaQQGzei9rZKkKzAItgIYpUiRVCwsFSLiThGUil4le+v3pDmcvjfnAzcBMAfptN+eNpf7yXZKDLbVff8fpIkh5fpJtktMtfoaDs37w/Lcz9uJjkpMuhWksnsvJbkrMhc/eQjwCWX8HsI8IcDfBEJA381QIG6wgxkIAOhhV1hV5iBYKAScYUZCO9ABgpQiYCBSoSBAoQSYaASYSAEqEQYqESQ5OuG6iDNZmgFrlvncaG57miDOnza0s/pYzfNQncFxjlYfU6S14usJOkVmWva2cnDonfgXmpt6Q9m516S2yJz9ZMca13/A32JMBC+RBgoQCUiQCgRBgpQgEqEgUqEgQKEEmGgEmEgBKhEGKhEwEABKhEGQokwUIBKBAuY31AdpdnArEB7G35aaK4hbYB/wxsO4jG9a3r5rAAAAABJRU5ErkJggg==",
	"typescript": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAACXBIWXMAAA7EAAAOxAGVKw4bAAABTklEQVR42u3aMUoDURSF4RMRy4CdZXAZYqs2Ii7AnaQQGzei9rZKkKzAItgIYpUiRVCwsFSLiThGUil4le+v3pDmcvjfnAzcBMAfptN+eNpf7yXZKDLbVff8fpIkh5fpJtktMtfoaDs37w/Lcz9uJjkpMuhWksnsvJbkrMhc/eQjwCWX8HsI8IcDfBEJA381QIG6wgxkIAOhhV1hV5iBYKAScYUZCO9ABgpQiYCBSoSBAoQSYaASYSAEqEQYqESQ5OuG6iDNZmgFrlvncaG57miDOnza0s/pYzfNQncFxjlYfU6S14usJOkVmWva2cnDonfgXmpt6Q9m516S2yJz9ZMca13/A32JMBC+RBgoQCUiQCgRBgpQgEqEgUqEgQKEEmGgEmEgBKhEGKhEwEABKhEGQokwUIBKBAuY31AdpdnArEB7G35aaK4hbYB/wxsO4jG9a3r5rAAAAABJRU5ErkJggg==",
	"github": "data:image/png;base64,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",
	"gitlab": "data:image/png;base64,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",
	"gitkraken": "data:image/png;base64,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",
	"jetbrains": "data:image/png;base64,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",
	"discord": "data:image/png;base64,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",
	"slack": "data:image/png;base64,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",
	"telegram": "data:image/png;base64,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",
	"imessage": "data:image/png;base64,/9j/2wCEAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDIBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAFAAUAMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APf6KKKACiiigAoorwv4wfFa8sNQl8NeHrhreSLi8u4zhwxH3EPbHcjnPHGDQB7eLq3N0bUTxG4C7zFvG/b64645FS18/fs96TdXOt6v4inLtGIfsokckmR2ZXbnuQFGf94V9A0AFFFFABRRRQAVk33ijw/pc5gv9c021mHBjnukRh+BOa8O+LXxZvp9TuPD3h66e2tbdjHc3UTYeVxwVUjooPHHX6dfFySxJJJJ5JPelcdj7otby1v7dbizuYbiFvuyQuHU/QjivnC2+DHirWdbutR8Ry2+lWsszz3E8s6SOcsSSApI79yK810nXNV0K4+0aVqFzZynqYZCu76jofxqxrXirXvEWP7X1a7u1ByEkkOwH1CjgflSuB9SaDr/AIC8M6bb6HpviDSYooBtAN2hLN3LNnBYnrXYQzw3MKzQSpLE4yrxsGUj2Ir4TrtPhr4g8U6V4ntbXw4Jbszv+8sC37qVe5OeFwP4u36U7hY+vKKRCSill2sRyM5xS0xBWF4z1Z9C8F6xqcR2ywWrtEfRyML+pFbtcf8AFSFp/hhryJ1FuH/BWVj+goA+QCSxJYkk8knvSUUVBQUUUUAFfTHwH8L2+m+EP7deNTe6kzYcjlIlYqFH1IJ9+PSvmevrD4L6lDqHwy02ONgZLRpLeVR/CwYkf+Osp/GmhM9AoooqhBVTVLCLVdJvNPm/1V1A8L/RlIP86t0UAfC99ZT6bqFzY3KbJ7aVopF9GU4P6iq9ewfHfwZJpmvL4ltI/wDQr8hZ8f8ALOYDr9GAz9QfWvH6koKKKKQBXZfDz4gXngTWGmVGuNOuMLdWwON2OjL6MP16e442tXw3oF54o8QWmkWK5muHwWI4RerMfYDJoA+ydA1yz8SaHa6vp5kNrcqWTzEKtwSDkfUGtKqelabbaNpNpptou23tYlijHfAGOferlWSFFFFAFDWtGsfEGkXOl6jCJbW4Ta69x6EHsQcEH1FfLPi34T+JvDepSR2+n3OpWJY+Tc2sRkJXtuVclT+noa+taKVgPk/QPgz4y1xRI9immwn+O/Yxn/vgAt+YFa+pfs/+KrO3Mtnc6ffMB/qkkKOfpuAH6ivpmiiw7nxrH8PPGMt8LNfDWpiUnGWt2VP++z8uPfOK+iPhb8NovBGmtdXvly6zcriZ15ES9fLU/qT3P0FehUUWEFFFFMD/2Q==",
	"apple": "data:image/png;base64,/9j/2wCEAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDIBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAFAAUAMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APf6KKKACiiigAoorwv4wfFa8sNQl8NeHrhreSLi8u4zhwxH3EPbHcjnPHGDQB7eLq3N0bUTxG4C7zFvG/b64645FS18/fs96TdXOt6v4inLtGIfsokckmR2ZXbnuQFGf94V9A0AFFFFABRRRQAVk33ijw/pc5gv9c021mHBjnukRh+BOa8O+LXxZvp9TuPD3h66e2tbdjHc3UTYeVxwVUjooPHHX6dfFySxJJJJ5JPelcdj7otby1v7dbizuYbiFvuyQuHU/QjivnC2+DHirWdbutR8Ry2+lWsszz3E8s6SOcsSSApI79yK810nXNV0K4+0aVqFzZynqYZCu76jofxqxrXirXvEWP7X1a7u1ByEkkOwH1CjgflSuB9SaDr/AIC8M6bb6HpviDSYooBtAN2hLN3LNnBYnrXYQzw3MKzQSpLE4yrxsGUj2Ir4TrtPhr4g8U6V4ntbXw4Jbszv+8sC37qVe5OeFwP4u36U7hY+vKKRCSill2sRyM5xS0xBWF4z1Z9C8F6xqcR2ywWrtEfRyML+pFbtcf8AFSFp/hhryJ1FuH/BWVj+goA+QCSxJYkk8knvSUUVBQUUUUAFfTHwH8L2+m+EP7deNTe6kzYcjlIlYqFH1IJ9+PSvmevrD4L6lDqHwy02ONgZLRpLeVR/CwYkf+Osp/GmhM9AoooqhBVTVLCLVdJvNPm/1V1A8L/RlIP86t0UAfC99ZT6bqFzY3KbJ7aVopF9GU4P6iq9ewfHfwZJpmvL4ltI/wDQr8hZ8f8ALOYDr9GAz9QfWvH6koKKKKQBXZfDz4gXngTWGmVGuNOuMLdWwON2OjL6MP16e442tXw3oF54o8QWmkWK5muHwWI4RerMfYDJoA+ydA1yz8SaHa6vp5kNrcqWTzEKtwSDkfUGtKqelabbaNpNpptou23tYlijHfAGOferlWSFFFFAFDWtGsfEGkXOl6jCJbW4Ta69x6EHsQcEH1FfLPi34T+JvDepSR2+n3OpWJY+Tc2sRkJXtuVclT+noa+taKVgPk/QPgz4y1xRI9immwn+O/Yxn/vgAt+YFa+pfs/+KrO3Mtnc6ffMB/qkkKOfpuAH6ivpmiiw7nxrH8PPGMt8LNfDWpiUnGWt2VP++z8uPfOK+iPhb8NovBGmtdXvly6zcriZ15ES9fLU/qT3P0FehUUWEFFFFMD/2Q==",
	"linear": "data:image/png;base64,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",
	"asana": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAADIUlEQVR4nOyZwU4TQRzGvzUk5ULLxYIJyAOQqBcONGmJ9QE4qRiMEHokvI0cS9CECJz0AazSQqv2JAkPAJLQXS6AF3qqmSqxyaZlZne+oZnOd6XzdX5AZzv/31Cr1cIg5d5db8B0HLDtccC2xwHbHgdsexyw7XHAtmfI3FsFDVT3cHSI02NcXsDzMJLC5BSmHyOTQ3rczC48E9fDoIGd96iV0e29PA8zGbwu4P4Yey984EoJxXU0r29/ZSKBlVXknlG3Qwb+tIvtd2pLFpYw/4K1H+6hVSkp0wJiSaVE2U87NODAR/FtxLXFdfGx54QGvFVEsxlxbfNaHHKccICDBurVWA21MumPzAGu7nV9Akmm1RIlhHCAjw77pSQUDvCvYw0lpycaSkLhAP++1FBydaGhJJSBuzxwgJOpfikJhQM8MdUvJaFwgKcf9UtJKBzgzJy48cWJ54kSQjjA6XHM5mI1zGRIIwHaKf3yDRLDEdcmElgsaN7PTWjA6XEUViOuLawhzRp9MJ/D2TwWlpVXLSwj+5Syn3YMjHi+iIux1IhnWPxTZPPU7ZgZ4vnielyv9hrizebEx54/uzQC/DedY9qr9pft5CgmHornbWbOrjFtP8VdHmzPwAHHcEv/D6GTf5f1ZEpccXS5Iv8sdMil2ofcE9E/9iBaa6RDi+2Kgga2N/Ft/5b+xZUIv1Z1YCVXVFhT/tpEdlGKwGxX9HEXO6r9y5h/Lv9ylUOL7YrKn5VpRf+mkouSBma7oqCBjXVi/02kgWO6og+b3H5pFyUHHN8Vfd8Xj5lu8c9Qr8Xql3ZRcsB6XFG56097POG09HdEDliPK/p5Z/0dkQNmuyKDLkoOmO2KDLooOWAtd+aYk2pNkQNOjmp4q5Hursigi5IDntSheXqUGHRRcsBsV2TQRckBs12RQRclB8x2RQZdlPR3abYrMuWipIHZrsiUi1K5D2fz4javGnlXlM3jVQQXtaQ0VIkw4iG7InJ/tCEe2RWd+9jawI8DRn8M1cJ2Rec+Dr5q73duyfY4YNvjgG2PA7Y9Dtj2OGDb44Btz58AAAD//3w7Z4BQOG6RAAAAAElFTkSuQmCC",
	"atlassian": "data:image/png;base64,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",
	"jira": "data:image/png;base64,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",
	"confluence": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAJIklEQVR4nNRcbWwcR/mfmduXO9t3fkviJGc3ju3ETaPE/zhx4n/bxKQYN8RA2iJZLVCQEAj4CAFBIWCgClSISlTiA4hPFQhVqAKhoDYtpLQVLa+JSUii0Ibg1CVOzpfzve3t3t2+oL0X5+52925nd27n+EmrXU9253n2p988M89zs2E+8LnPg1aEwI3si3TP/UhB7T1d6defWZd66RnaPpmBoe2AGWQU7LrR+8lTGvJv1P+OhR78AZ9/90JQuvR72r7VAtF2wAyRroefKpNXRiw48y16Hlmj5QhM+++5P+X/v0/Xtme5gYNp/p4H6HhljZYiUAM+FOl85IcQmvsVC04/4b1X9dFSBCYD44/ITM+Y1b9L/OB0hhua8Nar+mgpAlc7pr7Y6J5o6Mi8N97YQ8sQmPLvnMpxmw80uk/iR2ZbSYUtQ+Bqx+Ev2b23lVTYEgRKbHibxA+93/b9LaTCliAw3n7vZ3B9aRUVUidQgbw/FRj/BO5zugoFfvT+5nhlH9QJTAXGP6ghfp2TZ6Oho98h7xEeWoDAsTmnz+rZScq/k2p2QpVABfr9Ij90xE0fseDMN8l5hA+qBGb8o1MAMh1u+qCtQqoECtzI+0j0Q1OFVAkU/dveQ6IfmiqkRqCM2tvzzAbLwgEuaKmQGoESt2UfyYo4rXohPQLZ8DjpPmnUC6kRmGP6dpLuk0a9kB6BbN+2ZvTrdY5MbxLx9WxtRr9eV2qoEKhCFqkosKlZ/XupQioEKqitt5m/SXupQioEyr6u7mbb8EqFtGJgsNkGvKoXUoqBvN8LO17UC+kQiAKe7MnxIkemQiBSRdkrW83OkekQqGWzXtlqtgppTSJpL401U4VUCPQpiVUv7TVThXQIVDNRfT3tpc1mqZAOgVpOgaq07KXNZtULiRP4ljD2hRdWHr15emXu+mJm+2NW97HK7WukbTdCM+qFRAlcyW2672pm99MaYPtkjbvrYmrip++Iw8fM7uXklbdJ2raDZtQLiRK4KO08DiAEEEKAimffP1KTP4/m+vbW3svlly+RtG0XpHNkYgQm5J4dt+X+D0GICgQWiUQAQNR2Ljn1K1Fpq9q+wedvnCdlGwekKzXECLwm7fm6rjiIigosHKVrWeMHFpKHntU0uHa/P//uWT2rI2UfByRVSITApNK7Y0UZnFsjrubQ1RhXNhxdlEbXdmGxSiLByLHLJOzjgqQKiRB4LTteUB8wDN9SPETF9rcze56SlEBn+blA9uqrJOw7ASkVuiYwrmwYi6pb5wqxb234Vl+XiVQAv/Fy5sD3ys+2Z6+cdv0GDkGqXuiawH/lJ08aYh80xsHy9a384Kei+c379WfbpStngKYKbn1wChL1QlcEriqbJpJaeLY88xpJq2xH5eUNekvc+11QyEgkKZC9Sk2FJHJkVwQuKgfmQcVEUTyjmr+N55Sy/oFbuYGDeh9B8fwv3PjgFm5zZMcExtXNE0nQP1sd74xD1up6MTv2FVAgcOEU0OSkm5dwA7cqdEzgdXVy3hjzjEPW6jqh9h1JyOtGfZokdogXn3PqBwm4UaEjAuNaeF8SDszWG6aV57L6atrRUn7HZ/X+OoU3f+z0BUjAjQodEbgE7j1htlxptIypbY/IIx9TNB/bnrt6jssv/8GJL6TgVIXYBK5qW/4/CQeOWQ9Rq2WMMVaqkF13Mz8yq/fbk/ot1U8WnNYLsQlcQodO1p8kkMUyxjxWRpShR0FxNn6RkaN/w/WHJJzUC7EIjIPBSQFtPGy2bIFW8c8kL648x7X+I/owhkAD3enXnsZ9AZJwUi/EIvCmb/9xK2UBs9kWVeTFFgrVINO5qoQn9f47M399HqmC55XqSuDmyLYJFEDf9gQaehhrvWfziGvhqYIzWk7uTZ7+tpMXJwXcSo1tAm+wB08gBH04a72G1yWyE9rm+8p2OoU//YxR4p6X+yuBo0JbBApw4/YEM/qY6ToPWaz/KttR/fsz2vq9dxxSlO7UmZNOX54EcFRoi8Bl7pC+7mPWFIQslGXV3mBGViG7XlC713asllT4TzckuIVdFTYkMI36dyWZuz9iSoCDHNhqTSiBzh13nFKUnuTpE25JcAO79cKGBC77p5+EhdgHMVWGdy2C7uFKu/qMzMqRs26JcAM79cK6BKZ9W/YIzNZjZus3W2c7cbDUngPBcKVtfV3Yk3yZ6qesdnLkugTeCrz3hKVqkI1rDCXmQZvhq/WQuPAbVo78hQQZTtEoR7YkMM0M7s6wQw+5XePVPSr60xDTVevD/4IKLQmMtE3P69KorKZY/epm2o4q2lFtu3G4a4DlzfwIiQsvsnLkz6QIcYJ6KjQlUGC27ha5YWv1uc5CjENZQX7TfdMlFX6DJCG4qKdCUwJXOmbmYUl9jddx7oevfs0BwXLbb0hceJmVI2+SJAUXVio0EJjmtk+I/PBDwEJZwM7k4WSCAdBy26+uwt7kC18lTQoOrOqFBgL1tU+l+mrjnVV7o/gIDXGwOj6ysLBr1RIh8cJrfPb6GdLE4MCsXlhFYJofnchyd00XdmlgDsFG11b1wfLBAeFGoxfoSb/yfdKk4MCsXlhFYLxj6nhJNCWl6SkXspgk7OW5dmMopyUb1gE7pIsvsXLk780gxy5qc+Q1AiU2PCz47/5w+e+iaKpfvPZH87qk1VWlMSa2aZGGO7Ug0DTa68LaSs0agbeDM1+DtZ+gFrkqEod8BkLqpmsYZwTlmF+zt2c6JC78mn6OfEeFBQJ19aUDux63eqD0riW1+IgXE9q1m39ENr96KK0Lqf6XyJUqLBB4OzjzhEF9Jqgm0t2kUnkdUv79O5wXCIkLp1g5QvUXvLIKkchtGRUCuz5u+8maYW07zbNexqid8uVf4jhfWhd+2cF7E0O5XoiiwQf1oMzidlClRpP4WH/WvnO0KcuvBtSVd3Dth8QLr/C5JSzlkkY0dPRJJPIjh910Yj8+mpPZmzv7E6e2e1L0KzWIz/+HyPcaTuKjD4iLXbnzzzu1GZQuvcHnlqht0GTk2AXf7rHwGxl+5ICK2vtd91iOj6AU74pNxbhXvqV4A2DV1JWB9HMf9avRJTcmA7nF10V+aL/iCw6UzXkBRo6d2xR79vH/BgAA//+aKtgPWs/Q0QAAAABJRU5ErkJggg==",
	"shopify": "data:image/png;base64,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",
	"canva": "data:image/png;base64,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",
	"miro": "data:image/png;base64,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",
	"monday": "data:image/png;base64,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",
	"figma": "data:image/png;base64,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",
	"airtable": "data:image/png;base64,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",
	"grafana": "data:image/png;base64,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",
	"crowdstrike": "data:image/png;base64,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",
	"langfuse": "data:image/png;base64,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",
	"stackhawk": "data:image/png;base64,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",
	"vanta": "data:image/png;base64,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",
	"sentry": "data:image/png;base64,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",
	"datadog": "data:image/png;base64,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",
	"newrelic": "data:image/png;base64,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",
	"honeycomb": "data:image/png;base64,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",
	"logrocket": "data:image/png;base64,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",
	"rootly": "data:image/png;base64,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",
	"sonarqube": "data:image/png;base64,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",
	"terraform": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAAFfElEQVR4nOycXajSbhjAd6ZSZokkgd1kWBp9SBeCEUQZRhB0ExVhiVFBSGBSFwWSH4SmCRoUoWBZ0E0fGhQRXWQhYqAVrC4k+oAoBbPwJt10uXP+F4PDH8/ZnO/eLfP4u8xnz/v8cnu3vT7vkc7MzCALCfRvFyA2E+FxZyI87ogkTJIkzwBYCC5MkuSVK1cOHz7MHma1WtPp9PT0tND1IDNC8uLFC4PBgCDIrl272CPXrl2LIIjJZHr9+rWgJQklXK1WHQ7H1NQU/d/KURhBEKlUevr06WazKVBh8IVxHA+FQkuXLv3/ecRdmEatVl+/fv3Pnz/Qy4MsnMlkdDrd3AtnWGEao9GYy+XgVghNGMMwi8XCNFOACdPs27cPVpFwhL98+XLkyBEUZZvw+QjDnVmlLMMMBMfxy5cvR6PRTqfDJ4+YgAvfvXv33Llz379/h1qP4IA8eLx582bbtm02m+0v2maz2c+fPwMcOJxwvV4/fvz4li1bisUiwGAQyefzmzZtOn/+/O/fv4c7kuO13ul0IpGIUqkEKE6n0z158oQ9/7CTlsvloj/SaDQ3b96kKIqjCCfhYrFoNBoBVBUKRSgUwnF84BDAwjQ7duyoVCoQhL99+2az2WafEIdiz549nz594lIEf2EEQWQymdvtHvhMyijcbrcDgYBcLgdQNRgMA89h6MI0arU6kUj0er2hhTOZDIDq6tWrU6kUSZJD2UIUpimVSkwD8Xrw+D9KpfLChQsul2vx4sWwcgoBBGEURY8dOxYMBjUaDVMMRVESiYT/WPzhu+KxYcOGly9f3rhxg8mWoqhUKuVwOHgOBAtw4eXLl1+9evXdu3fbt29niimXy2az+eTJk41GA3gguACe0nv37r19+7ZarWYKaDabPp8vmUxSFMWjPPgACu/cuZPJttfrJZNJv9/fbDb51SYI0GZpmufPn7vd7kqlAjctRKAJd7vdQ4cOPXr0CFZCgYC2Lo3j+OjbTn5qWQAsOGHIszQTjUYjm82yBLRaLXEqEUn4/fv3Bw4cEGcsdhbcKT0RHncmwuPORHjcEek+rNfrnU4nS0A4HP7165cIlYgkrNVqz549yxKQSCTEEV5wp/REeNz5B4ThvnWMtPDmzZvz+fyDBw8g5hxR4RUrViSTybdv37Ks8oMh0m2JO1Kp1OVy+Xw+lUrFFPPjxw8Mw8Dyj9Y3bDabS6VSPB5nsiVJMhaLrVu3rlAogA0xKt/wypUrvV6v3W5naXDL5XKnTp36+PEjn4FGRTiXy8lkMqZPa7Wax+O5c+cO/01HoyLMZEsQRDwej0QisFb5RkV4Lt1uN51OX7p0qVqtwszL1AvRarW8Xu+iRYvmPSoWi/XFs/9WOLC5tI+HDx+uWbMGQGfZsmXhcJggCKbMA9qWvn79evDgQTGFP3z4YLVaAVRRFD169GitVmPPz6kxLZ/Pr1+/Xmjhdrvt9/vBemJMJlO5XObiwrX1kCCIYDA429gPXfj+/furVq0CUFWpVPF4nHuj1HC917NbN6ALs/dpzYtEInE6nT9//hxKAaTZ/NWrV0+fPu37R5GFLRYLhmEAxYPclrZu3QpwFCx0Ol00Gt2/fz/Y4aN7H56LQqHweDxnzpwB6wCl+TeEpVKp3W4PBAJarZZnKmhvS3K5HPq7K83u3bsxDLt16xZ/WwT63sN79+7NWxbYpKXX6x8/fgy3Qvhb8drt9sWLF/sus2GFlUplNBrtdrvQyxNqs2VfKz13YRRFT5w4Ua/XBSpM2O20z549o98BOApv3LixUCgIWpKwwvQzaSQSGbh/0Gw2X7t2TYjtpH1MifOHSwiCYL954ji+ZMkSESoRSXh0GK1VSxGYCI87E+Fx578AAAD//3iaj+9LGpvfAAAAAElFTkSuQmCC",
	"hashicorp": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAAFfElEQVR4nOycXajSbhjAd6ZSZokkgd1kWBp9SBeCEUQZRhB0ExVhiVFBSGBSFwWSH4SmCRoUoWBZ0E0fGhQRXWQhYqAVrC4k+oAoBbPwJt10uXP+F4PDH8/ZnO/eLfP4u8xnz/v8cnu3vT7vkc7MzCALCfRvFyA2E+FxZyI87ogkTJIkzwBYCC5MkuSVK1cOHz7MHma1WtPp9PT0tND1IDNC8uLFC4PBgCDIrl272CPXrl2LIIjJZHr9+rWgJQklXK1WHQ7H1NQU/d/KURhBEKlUevr06WazKVBh8IVxHA+FQkuXLv3/ecRdmEatVl+/fv3Pnz/Qy4MsnMlkdDrd3AtnWGEao9GYy+XgVghNGMMwi8XCNFOACdPs27cPVpFwhL98+XLkyBEUZZvw+QjDnVmlLMMMBMfxy5cvR6PRTqfDJ4+YgAvfvXv33Llz379/h1qP4IA8eLx582bbtm02m+0v2maz2c+fPwMcOJxwvV4/fvz4li1bisUiwGAQyefzmzZtOn/+/O/fv4c7kuO13ul0IpGIUqkEKE6n0z158oQ9/7CTlsvloj/SaDQ3b96kKIqjCCfhYrFoNBoBVBUKRSgUwnF84BDAwjQ7duyoVCoQhL99+2az2WafEIdiz549nz594lIEf2EEQWQymdvtHvhMyijcbrcDgYBcLgdQNRgMA89h6MI0arU6kUj0er2hhTOZDIDq6tWrU6kUSZJD2UIUpimVSkwD8Xrw+D9KpfLChQsul2vx4sWwcgoBBGEURY8dOxYMBjUaDVMMRVESiYT/WPzhu+KxYcOGly9f3rhxg8mWoqhUKuVwOHgOBAtw4eXLl1+9evXdu3fbt29niimXy2az+eTJk41GA3gguACe0nv37r19+7ZarWYKaDabPp8vmUxSFMWjPPgACu/cuZPJttfrJZNJv9/fbDb51SYI0GZpmufPn7vd7kqlAjctRKAJd7vdQ4cOPXr0CFZCgYC2Lo3j+OjbTn5qWQAsOGHIszQTjUYjm82yBLRaLXEqEUn4/fv3Bw4cEGcsdhbcKT0RHncmwuPORHjcEek+rNfrnU4nS0A4HP7165cIlYgkrNVqz549yxKQSCTEEV5wp/REeNz5B4ThvnWMtPDmzZvz+fyDBw8g5hxR4RUrViSTybdv37Ks8oMh0m2JO1Kp1OVy+Xw+lUrFFPPjxw8Mw8Dyj9Y3bDabS6VSPB5nsiVJMhaLrVu3rlAogA0xKt/wypUrvV6v3W5naXDL5XKnTp36+PEjn4FGRTiXy8lkMqZPa7Wax+O5c+cO/01HoyLMZEsQRDwej0QisFb5RkV4Lt1uN51OX7p0qVqtwszL1AvRarW8Xu+iRYvmPSoWi/XFs/9WOLC5tI+HDx+uWbMGQGfZsmXhcJggCKbMA9qWvn79evDgQTGFP3z4YLVaAVRRFD169GitVmPPz6kxLZ/Pr1+/Xmjhdrvt9/vBemJMJlO5XObiwrX1kCCIYDA429gPXfj+/furVq0CUFWpVPF4nHuj1HC917NbN6ALs/dpzYtEInE6nT9//hxKAaTZ/NWrV0+fPu37R5GFLRYLhmEAxYPclrZu3QpwFCx0Ol00Gt2/fz/Y4aN7H56LQqHweDxnzpwB6wCl+TeEpVKp3W4PBAJarZZnKmhvS3K5HPq7K83u3bsxDLt16xZ/WwT63sN79+7NWxbYpKXX6x8/fgy3Qvhb8drt9sWLF/sus2GFlUplNBrtdrvQyxNqs2VfKz13YRRFT5w4Ua/XBSpM2O20z549o98BOApv3LixUCgIWpKwwvQzaSQSGbh/0Gw2X7t2TYjtpH1MifOHSwiCYL954ji+ZMkSESoRSXh0GK1VSxGYCI87E+Fx578AAAD//3iaj+9LGpvfAAAAAElFTkSuQmCC",
	"cloudflare": "data:image/png;base64,/9j/2wCEAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDIBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAFAAUAMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APf6KKKACiiigAooooAKKKKACiiigAooooAKKKz9Y1WHSLFriQbmPyomfvGpnOMIuUnZIqEJTkoxWrL5YKCSQAOpNRJdW8jbUniZvRXBNeWahq15qcpe5mYrniMHCr9BVKvEnnaUvchdep7UMlbj787P0PZqK860PxRc2Eqw3UjTWpODuOWT3B9PavREdZEV0YMrDII6EV6WExlPExvHdbo83FYSeGlaWz2YtFFFdZyhSMwVSxOABkmkkkSKJpJGCogLMT2FcHqnjK6nkeOxVYoOm5lyzD8eBXLicXTwyvPqdOGwtTEO0EUdU8S399dO0NxJBAD8iRsVOPcjvWfdajd3yRLdTvKIs7d3JGffvVWrq6TduAR9nweebmMf+zV8nKpXrN6t3Pqo0qFFLRKxSorRGiXp7W//AIEx/wDxVOGg3x6fZ/8AwJj/AMalYeq/sv7iniKS+0vvMyu90XWF0/RLOO7WRmZSV2gHCZOM81j6Z4PurqZXuZI44Afm2OGJ9hjitvWtIczRvbmMRqgQIWC7QPTNehhaGJw8JVorXb+keZjcRh60o0m/M3LPUbW+UmCQEjqp4I/CrVcBtuNPnSQMqyDkFHDfyNdxZXIu7OKccb1yR6HvXr4HGuveFRWkjyMVhlStKLumUfEUFzc6HcQ2qF5X2javUjIz+lcF/wAI5rH/AD4S/p/jXqVFVisvhiZqcm10LwuPnhoOEUjy3/hHNY/58Jf0/wAaP+Ec1j/nwl/T/GvUqK5v7Fo/zP8AA6f7Zrfyr8f8zy3/AIRzWP8Anwl/T/Gj/hHNY/58Jf0/xr1Kij+xaP8AM/wD+2a38q/H/M4nw1p2raZNdSvayKphwqEj5nyMf1pZtN1W4lMk0Erue5xXa0VpLK4OCp8zsjneYTdR1OVXZw39j6h/z6v+ldVo1vLbaXFFMpVxklT25NX6K1wuX08NPni2zKvi51o8skFFFFd5yhRRRQAUUUUAFFFFABRRRQB//9k=",
	"fastly": "data:image/png;base64,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",
	"42crunch": "data:image/png;base64,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",
	"aikido": "data:image/png;base64,/9j/2wCEAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDIBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAFAAUAMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APFKKKK7hBRRRQAUUUUAFFFFABRRRQAUUUUAXdKsV1HUI7ZnKBgTuAz0Ga6L/hDYP+fuT/vkVj+Gf+Q7D9G/9BNd9XuZdhaNWi5Tjd3/AMhM5n/hDYP+fuT/AL5FH/CGwf8AP3J/3yK6aiu/+z8N/L+YXOZ/4Q2D/n7k/wC+RXO6rYrp2oSWyuXCgHcRjqM16RXA+Jv+Q7N9F/8AQRXBmOFo0qKlCNnf/MEZFFFFeGMKKKKAFVmQ5UkH1BqaI3c8gSEzSOf4VJJqbSbJdR1KK2dyqtkkjrgDNeg2llb2MIit4lRe+Op+p716GCwM8Qua9ohc4yLQdakXJVkH+3L/APXol0HWolyAzj/Yl/8Ar10Wua2mmReXHhrph8q/3fc0aHraanF5cmFulHzL/e9xXb9UwvtPY875vURxMpu4JCkxmjcfwsSDULMznLEk+pNem3dlb30JiuIlde2eo+h7V59q1kunalLbI5ZVwQT1wRmuLG4GeHXNe8R3KVFFFeeAUUUUAa/hn/kOw/Rv/QTXT63rcemReXHh7lh8q/3fc1xdhevp92LiNQzqpC56ZIxUEssk8rSyuXdjlmPevQo410cO6cPib+4QSyyTytLK5d2OWY96IpZIJVlico6nKsO1Morgu736jO+0TW49Ti8uTCXKj5l/ve4rmPE3/Idm+i/+gisuKWSCVZYnKOpyrDtU9/evqF2biRQrsoDY6ZAxXfWxrrYdU5/En9+4FWiiivPAKKKKACiiigAooooAKKKKACiiigD/2Q==",
	"endorlabs": "data:image/png;base64,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",
	"endorctl": "data:image/png;base64,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",
	"zscaler": "data:image/png;base64,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",
	"mongodb": "data:image/png;base64,/9j/2wCEAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDIBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAFAAUAMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APFqKKK6zhCiiigAorqPBvhs6ze/arlf9CgYZB/5aN/d+nrSeMfDR0a9+1W6/wChTsdoA/1bf3fp6f8A1qx9vD2ns+pxfX6P1n6tf3v609TmKKKK2O0KKKKACiiigAq9pGmTaxqcNlDwXPzN2VR1NUa9H+HGmiOzudRdfmlbyoz/ALI6/mf5VhiKvs6bkcOY4r6rh5VFvsvU7Kys4bCzitbdAsUS7VH+e9Je2UGoWctrcoHikXBB/n9asdKK8O7vc/PueXNz317nhmrabLpGpz2U3LRtw2PvL2P5VSr0b4kacHs7XUVX5428pz6qeR+RB/OvOa92hU9pTUj9By7FfWsPGo9+vqFFFFbHcFFFFABXs/hOIReFtPUd4t35kn+teMV7D4MuluvC1ng/NEDGw9CCf6Yrgx9+Rep8/wARJ/V4vpf9Gbdw2y2lb0Qn9KLdt9tE3qgP6VDqTbNKvG9IXP8A46aNNbfpVo3rCh/8dFeZb3bnyXL+75vMzfGEIm8KX6n+FA4/Ag/0rxuvXvG90LbwrdDPzSlY1/E8/oDXkNepgL+zfqfXcOprDSb7/ogoooruPfCiiigArtPh7rC2t/LpszYS5+aPJ43jt+I/kK4ulVmR1dGKspyCDgg1nVpqpBxZzYvDRxNGVKXU9w1xtnh/UW9LWT/0E0mhtv8AD+nN62sf/oIrl7LxIfEXhi9sCv8AxMxbMuwf8tuOq+/tRfeJT4e8M2Ngg/4mZtlUof8Aljx1b39q8n2E7cnW58b9Qrcv1e3v834W39PMyviDrKXd/HpsLZS2JMhHQue34D+ZrjKVmZ3LuxZmOSSckmkr1qVNU4KKPssJho4ajGlHoFFFFaHSFFFFABRRRQBp+HLlbTxFYTOwRBMAzE4AB4JP50niCdbnxDqEqMGRp22spyCAcZFZtFRyLn5/kY+xXtvbdbW/G4UUUVZsFFFFAH//2Q==",
	"redis": "data:image/png;base64,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",
	"clickhouse": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAAA0klEQVR4nOzbMQoCMRBA0azsFWLh4Tych7PwErETQViGKbLOz39dYIp8YiEj7r33tpLL2ReYzWA6g+kMpjOYzmC65YL34Nzzdd/a9jmONm7Xx4kzadEX/r7B73H+TNpyH2mD6QymM5jOYDqD6QymM5jOYDqD6aJLvH+TXvRVfeH0oq9qcJrBdAbTGUxnMF3V4NHGwfFA1e/S6Z/Iq75wmsF0BtMZTGcwncF0BtMZTGcwncF00eDI0mzmTNrmX+LhDKYzmM5gOoPpDKZbLvgdAAD///FDLvgH8jvRAAAAAElFTkSuQmCC",
	"cockroach": "data:image/png;base64,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",
	"duckdb": "data:image/png;base64,/9j/2wCEAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDIBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAFAAUAMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APn+iiigAooooAKKKKACiiigAooooAKKKKACnJG8rbY0Z29FGTXp/wAMfheviaMaxrG9dLDERRKdpuCOvPZQeOOTz0xXvunaTp+kWwt9OsoLWIfwwxhc/XHWvm8y4koYOo6UI88lvrZL56nRTw7mrvQ+M3R42KurKw6hhg02vszU9G03Wbc2+pWNvdREdJUDY+h6j8K8B+J3wwHhZf7X0je+lMwWSNjua3J6c91PTJ6H608t4koYyoqU48knt1T+egqmHlBX3PMaKKK+jMAooooAKkgha4uI4U+9IwUfUnFR1JbzNb3MUy/ejcOPqDmk720A+zNM0+DStLtdPtlCw20SxIPYDFWqradfQanpttf2zbobiJZUPsRmrNfi1Tm53z7319T11a2gVT1bTYdY0i7064UGK5iaJs9sjGfqOtXKqapqEOk6Vd6hcMFhtomlbnsBnFFLm51yb309QdranzL8M/Dmn6/42/svV4DNAsMhZA7L8y47gg17TJ8HPBTxsq6bKhIwGW6kyPzYivGPhl4h07QvHH9qaxc/Z7doZA0nls/zNjsoJr2uT4v+B0jZl1hpCBkItrNk/moFfa588z+tr6rz8tl8N7X17aHHQ9ny+9Y8D8eeEz4N8TyaYJTNAyCaB2+8UJI59wQR+FczXT+PvFn/AAmXiiTUkiaK3SMQwI33ggJPPuSSfxrmK+swftvq8Pb/AB2V/U5p25ny7BRRRXSSeq/C/wCKEfh2FdE1pm/s3cTBOASYCTyCOpUnnjkH1zx75Y6hZanbLc2N1DcwN0khcMPzFfF1SwXM9s++CaSJvVGKn9K+azPhqjjKjq05cknvpdP8jop4hwVnqfZWoanY6VbNc6heQWsI6vM4Ufr1rwL4ofE9PEsZ0bRi40wMGmmYFTOR0AHUKDzzyT6YrzGa4muH3zyySv8A3nYsf1qOnlnDdHB1FVqS55LbSyXy1CpiHNWWgUUUV9Ic4UUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//Z",
	"qdrant": "data:image/png;base64,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",
	"pinecone": "data:image/png;base64,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",
	"upstash": "data:image/png;base64,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",
	"zilliz": "data:image/png;base64,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",
	"supabase": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAAFFElEQVR4nOyaTWwbRRTH572x4zi2WyckNpRQSqG0nAAlKCJKVS4ESEQLCMEBBOKOQEDJoXDggAQIEHAIXEDiihBEUEqlqhEqKhICAjlQxLdoihKSOCbYSWM79g7a8c567KhVMvsxYtm/Vu56O7v//e17895s5Ehvby/5Pwl134DfCoGDrhA46AqBg64QOOgKgYOuEDjoCoGDLr+BcVucUJ1POeKfFcXs2GhicE81V5x7bmL9bM4/a0n+PeyuR/YnBveYz7g7lb73Jt98W+QTcOLAvvShPvsr3Rb3x3ej/ABu253pefRWH4w2I8+BMdWePXIntke9NtqkPAZGyDw9Gs1u99ZlK/IWuOuhoY4br9x4HKLUU9+LyEPgxNC12+/p9+76avIKOLrzkp7HhgHAo+sryxNgTMQufeYgxtsuOELfg/AEOHN4JLqj8yIDQN/q0n3jzgcGO/qvcv2ybsll4I6Bq9P3D7h7TXflJnD08s7Mk3dsqlDhf38OQ7wt++wh7LhwoZIHB2AOZ564va23y62reSd33ofT9w0kbr5mCyekYji8FwgQAKAIiECBf6L4am6ISMRXpHwM4Prs3ysnz9Tyq2q36gJwvG9X54ODWzoF4lG6u9uijVCMUIggUHOH71tHmr9SPsCET9/V99fzH5V/mFW4W6cpHbksnTk8stUVlTmeR5XQ1qhKm0lIrE8EBEArJzARy46NEqUFuSNgiEWzRw7SZLvKyUgI1hNVJHAzcD2YPNXBfEDWBxL+T6QrGb/+CjVbdfU8Phzb1a10qhkns1Y3x1MGJojEQuXDzaQwNxAtjaYTCsbqwNvv7k/u36t4MhLSzAYRG7t+BEBAAn84Ji1YUa5fY/1cXs1ZRfEbdnY9PKR2bj2+sDGZIyKwNiry+Ap48QxMrX3/Z/mnOQVrFWBMtWeeGnG2eAA5niYqT2ALEkEks71DQApvbfn8wiufqhmr3HTylutoukPNz1Zj6iJPaRThswPZtGPVKgDCasbCi0eV+7AKcHRHWs3MFiCg3WnQ4uQbtjKjlN58Gi+9c6qk1IHrUgGu5laU/SyJkivqEDYmKKJESBrMfCtOnil8Mu3EWQV45fMfjXLViatVtzgKsTitGII0bxtlmY+q/Dqfe/OkQ18V4NpiceG146zijNmMMAGZU6S0NIGRiP81iqX5F46ySs2RqfJa+vwXv5z7bSF5YF+kO6VwOqMA3e02GGkQEnvfRiUECGPzLx+rLhbV7lYWaPn5MKRiybHbeAemYiFJRUOmUnO2DubfPV34+FtXrDW9iBusqQ6LtwIiRdsuV6unf3aLVh8wI3KnsTttiwhAZWYpN+60UMnSA8xqRvPUBalWEWvljGCslBZfOsYcdwRZ2lK6ZUVlLaGl5gyM5N44UZ3/x11nnXO48bpXn8PYVKuX3/uyND3jurOuOczsxVVrqPm29tXvhQnXCpUsnSlNmnjFuhqhOru8ND7pkbO+XxAxVi9QBO11tQlvrK3nXj3Oyuse2WoDtt7sm5sRISQ/Plmdc7lQydIXYaPRmezKXJiYKn131lNbjSlNpMCaU7c0PVP8cMprW62/tZTe7Kvzhfxbn/ngqW8OG43OxMrV/Osn2FrFB19twMZqhYhCtfz2qerssj++2oBXPphiq2VWMwrvf1365g/ffPW8Dwtz/nePGvPTU2vRYsRnWt3AOhQCB10hcNAVAgddIXDQFQIHXSFw0BUCB13/BgAA//8x3wULXsajwQAAAABJRU5ErkJggg==",
	"elastic": "data:image/png;base64,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",
	"convex": "data:image/png;base64,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",
	"databricks": "data:image/png;base64,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",
	"snowflake": "data:image/png;base64,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",
	"datahub": "data:image/png;base64,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",
	"nvidia": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAANBUlEQVR4nOybe1hV15nGf3AAuV/kJndRFMWIEi9EBi8RE2Eao6mAUakx1TE6UWfIM51MWhrTJuZW26RjptPaMcmMSaMRMGoTjc2gmKg1Ea0SLwlKVMRLiKhc5HDvs497y2JzzuEc9gHyx36fh4e9vv2ty37PWuv7vrW/7YwOTdAJ1AidQI3QCdQInUCN0AnUCJ1AjdAJ1AidQI3QCdQInUCN0AnUCJe+7Oze2SwfOY1FfdmnGTS9m8s0RzXWpwT6hRIdkcCkvuzTDIyObExfwhqhE6gRfbqEXdxoBaqBdsALcO/L/nsDvUZgYDRRMUmkRd5DasgQkvzDiCv5gN+8OpNARcdrIL6BUcSFDCUpfCQpMWOZ4eFLdG+NqTfgUALdPBmQmM6CxHSeCIohuTv9+mpq6qs5evE4R4GNTs44xd3HtPFzyY26h4cAJ0eOrzfgkAEGRBA2bg4r75nBEjdPQlW3W+uuc7b6EmerKzllrOW7lkZaGmq4fvMKZVe+4pixlgZ1m+EjiE+ex9PDUkxuj8ER45RhfHUmHo5qTBOBPkEMnLyYnyVMZ4WzoWNQzY18V3aQgrOH+LCilGJppkny+5fx4oS5PKNqprHyFEWn97HlVBFbjbXcFm9GjibxgSf57+BYUrSMVUD/E+jqgWtyFivHP0KemycDFXnddc59ns/a47v4U3MDjep6Fgi8i6bbVB35gJcOv88bzQ00K3JnF5yTs3giZSEvG1zx7cmYBfQvgSFDiZudx/sB4SQpsrZWjEe38/xnm1jXdJsmc/V8QwlKzmZVYBQTgRavgYQEhJPgbMBbrXvjMkd3vMiCa2V8JcojRpEw51l2eflrMjT9R+D4R1g0dQnrxVlQU8XpnS8xr/IkpaKuwRVD/GRmDv8HMqMSSZOs6xcFPLd3A79QdFzccIkeS8romSweNokFzgYGKPfaWrm97488eWQbb4vtBkQQnvkCfxZ/QDvR9wR6DcR/1n+wIXoMWaL80pd8VPgcjxprqVVk7j54TsxkVdIsVg/wIlzUVxMoIjCayBn/zLqYJOaJ8uMfsXbPevLa2zpk7j74Zq2lMCyeNNsf9S4cSmC31i00jvj5v2JvcCyTRfm5w7xVuIaFTQ0dseXI+8nIeoFdsePIdHHDhzsG5Wb55xSWf06+ixtOHr4E1V+nsrmx8x7ZcIuak5+Q39rCtZgk0pUoadAwpgRE4PP1Z+xRdFuaaDxVxObwEYzxDyPezmduOfAOa+2sYxFWCRw0nFHz11Hs4UuUKL94nA/y81jY1oJpXhhccU7P5ZXJj/E71wH4K3onP+E/t+Yxq/Rj3jtfQnHMWGZOW8r6e2ezoq2VqsqTHFP3eelLjrRDZfQYZisyyQIbXKm/8DcOKrK2VlrLv2BH/GTmuHsTYsczO5RAq460fxjRbu4Eq+V71rO8vc0UjpmQ+TybY5I6lrc063b9mgVnitlltlM3/KcuYaPLALwObGK9eM/JGVzdCZI4EmN131Ai1O14BxLi7t0R2fQHrB4mfH2A3TVVnFHLI0cxVSx7BxMjlku28bIl8kRMms+6yNGMVcoubrjN+TlvJmfxiji2C8co+PBVnhLr+ocRlfUCf3H3ZlB3/fQmrBLY1kL74S28pJaP/yH/IpZP7GKDWB6eyg9t6tyA24Or+IOzC07+YYQsfJ09w1J4XNS5do7i7WvJEWd88BBG5rzOIe9A4mzppzfR7XHWid28W3edr0VZUAwpI6YyQykf/4h3jHVUKuWBkUxMmM6DtgwgKIaJD6zklzm/5Ujo0M4z+8Zl/vb+MzxsrO0wVIOGE7/wNYo8/bsu6f5AtwS2NtO6/22eVsun/pjXpIiEOxFEY/FGVov3py3lvzz9ujrJ5jAmgzxPv86G6moZxVueZoZknRVZTBITs1+i2M2987KVfMai3/PYwT/xb63NHfp9AZuC9G/PcWbQcOIGRpKoyCTL5+KK8XwJn0rla2WcDhnK4MCoO3uaFOIFDWbo6X0UKIsvdhxpEQmd3SEzaD+xm3Xb17KooYZ6ZMMy6VFWpOfynqt7h5WX0FBDRf7PmXmmmN0Xj3Po1F7e8vLDOziWMRaez6FW2OYT6Q9fZbkUdYiycXN4NnK0aaAm7PoNT1Zf4ohSHjKBebOeYYMUcdjSR/0Nzu94kYzdr/HvLY2mw1d8ggic9wrbJi/md+KBBXf2x/3/t4oJl0pNx2Em3LrCtZ0vs+Kt5Yz4poQttj5fT2EzgcY66j98hZy21o5YVwq9HnqazR5+eJp0armdn8dD9TcpU3RGTGHpovXsjUokwVLbzUa+O1JI3saljDpTzMeKfFgK0xb/nuPRicxRVWkv3cOv380l7dZVrplrs+obyrf+lEcPbeZJW5+xJ7D7MOG+R1k25XH+IMouHGNbwRqyWxppkcq+IYTOeoY3IxL4R0Gt7exf2VjzLdWe/nfcnsY6KipKOXDuMB831ncYCin6mfI4a2LHm8K6Tj+ysY7Lf3mDpaf3du8mDZlISsZTvOsVwGCxiX4/zrp/GWsmzOU5UXblK3Zv/RnZYlycmM4jKTk87xvMKLqJhaV9bvC9TEp6mFVxySanXL3s28oO8tae9fykvpob1sbnF0bY/Uv5xfBUfmxmH+x/AiWk5JCb+iN+JQ7w1lVKt69l7tWvO5awREzseFKHTCCjvZ2603vZXlvFTYMrLj5BBAVGMzIqkdTB40j38Ok0U+7i4gl2HthEXsUJTlgbk08QAcnzyB2TQa7B1aIH8P0gkDuZBtnTn2CT5BArspYmave/yaqS7fyveIKCDQeqanxbTvG+/yHvfAmfWdPzDSF4YiarEzNYKYWJ3TTrUAI1vVQ6up33b16hQt5nYrkTjvlMX87b4+aw+otCXj/5CfmN9V3feViCZOnPHabwVBGbK0/ypSU9J2ecpJk9JoMlQ5PJVlvovoJDXipJDnNKDj8d+wNWOxtM73vvorWZ2ktf8v+Vp/ncL5SQsHhSXQaYHraptooaYy2Xb1zhbFU5pVfL+GtVORWW+pFCPmmfHDGFzKH3MdfDp0cn09+fJaxGQARhk+bzk5HTWGLu3YU1I2KlzYjY8aRFJ5I2+F4edPPUfHjw/VnCatyo5MpH63iqeCNrRkwlW/qLSDDFtwNsqW9wxTk4luHhI7kvajSTIhKY4h3ICEeO0dHo9RfX7j54hMWTFBBBfGAUMZKz3VBLs8EVJ2npe/gS4hNMpG8Ig/1CiVNvAb2A7+8S7g72WuFegkMJ1LOzNEInUCP6NL3t23KOndnPpr7s0wya+7l/HSL0JawROoEaoROoETqBGuGiuo6xotsCVEHnBEg5TIsUypKVu2ihjaFm9IKhU9xcAabXBoFg9miqEagDbloZ62DhnNLaeDyhI79RRgNw3UrbFhEjZ89b+2sF06HmSmGA/vIgFR0jmPX0R6raKpDlf1TJlbS117oZyy3gz1KAY6ava4JemZVn/q2Zdi/YE6HZu4Ql/dFgymfZB6YMLGkmfCroSDNyqpm6j6jK79nZtxrSrP0BUAT2nfDIkMY534w8GjqSBrqDlj0wFXhBvi5U3cswo58tXEuzZ6ed/Z0DTgLlcuKRiGeBH9nZ3gJ5+0DeEq4K9/7JzrZMUC/hD+S9TfqLAlNq7haVzk1574yQl7ci/0rVdqyq3jvCPVuX8BihziAz9S4IE8KWJXxC0HkT+KVQlvbZMK0EmltiElnfqPSUBMcDKrloMFao7mVpJFDBfpXOPTYSmKyqN0M2POIkWGMLafYuYckS71HJguT/m1Xyh4XrdOFaMjIfC+Uu2fx2IF9VtjVb9THh+jKwFzgvTwIFy2w5K+jJHnhJVVY62awK1JUUN3folMv8CTgsAahSVe7ujRyy67JAKG+SZ55yrSAcOrJkLaEnBFo6zZB8xGKhPEmendPlDwsVFPSgT0sIUJXNfmKhwjzATyiLXwFsVX1PvKy7xhx9nLVTcAEM8swTvzBqlX03R0Htbly2oY64fCWHeab8p6BS2L/TZAOpnul34WgCd8jOqYIHoFM620HgOwf04yS7GpmCTPpxuiStqxCrGo8U7bxuRV+aBIuga5auAkcTKG3EJcA4uZwtO9sKtCzfNfKMkRzoCTIZIgrlb5GtYYmwbbVZmVlhAjdLgZdly9wFvXEiXSgQKJInDXibhnbVkYwIye9c1U196VnF/OsieYWYQ4FgBIfIW8Uh4F/lIOANhdDeOI3ZYUH+hZWgvqdolv3VVNn3s4bZsmVV8LYVXfUPvVjuwxtMGbh3P+kVg2bJ3ZgilK/K3roa0tIZJpQlYtTpZg+YCcgl8rp8MiEfMoj50dIvXSv7dJZOh1rk5XpWDsPUmAZ3E55ugyk5Sd3Pp/LJizl4q4yfUX7OHPm5Nliop8Ne6AeqGqETqBE6gRqhE6gROoEaoROoETqBGqETqBE6gRqhE6gROoEa8fcAAAD//1sN7E5Q1H03AAAAAElFTkSuQmCC",
	"amd": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAEqklEQVR4nOybS0hySxzAx76wIHogWRG26GGEq6JoEZEFEQm1yoKoVUqLImgTtAisReGqKKwWUaugjFZFWBC0cBFBj41ChG3aaZIgWuq9Npc593M4pcc8/qnL/fj/4MB88zgz8/M/j/NBuZRSSpCsyfmvB/B/BwUCQYFAUCAQFAgEBQJBgUBQIBAUCAQFAkGBQFAgEBQIBAUCQYFAUCAQFAgEBQJBgUBQIBAUCAQFAkGBQFAgEBQIBAUCQYFAUCAQFAgEBQJBgUBQIJDcn+ooHA7/22FuLsnLy5OsF4lESDweJ79+/SL5+fmgPp1OJ1laWpLVZmRkhIyOjmbegALR6/VUp9MJj8lkSlknHA7TiooKWlBQQLVaLfX5fCnreTweqtFohHoDAwM8f3x8nPchfpqamoQ+z8/PJcdns9kom2amj8VikTV/kECHw5E0AJfLlVSPCSwqKuJ1DAYDjUajH+r4/X7a0NDA6/T19fGy3t7eLyduNBrp29tbynEyKd8lELSEt7e3k/I2NjbI+vp62nYOh4NYLBayuLhIcnJyhOVtNBrJ/f39l33e3NwIW0A0GiWXl5dkZWWFPD4+ksPDQyHv6Ogoqc38/DwJBoPk7OwsqYy1Ye2zRpZuEQ8PD1SpVAq/2tjYGG1vbxfSLO/zEv0cgexRKBTUarXSWCxGzWZzUiRIReBngsEgbW5u5uUnJycpx+v3++NSc4FEYNan8ObmJonFYkJ6eHiYTE1NCWmWt7W1JdlOpVIRnU7HJkNmZ2dJd3c3j+S2tra/0x0wqSgsLCRzc3P833t7e0l1nE7n+/T0tKz3Zows3b+JRCI8otRqNc9nBwDLq6ur+1BfHIGs7O7ujqpUqg+/fGtrK316eqLFxcWyIpD+Xg2Jcna4iHG5XHGVShUfHByUnM+PRyDbw9iewjCZTDw/kfZ4POT09DRlW4VCQRobG4ndbidKpVLIq6ysJPv7+6S0tDSb4Ujidrvfu7q6yMvLy7fdd7N68c7ODk8HAoH3tbU1wp5QKBRP5LNDIhVMIIMt3d3dXWFJHxwckOrq6myGInB9fc3TOp2Opzs6Osjz8/P3fizIildKqdfr5YfHV8/FxYXQRryE6+vrP7wvEAjw9Ovrq+wl7PV639m2kCi32+28TDyW/v7+v6Tm9KPXGLbhJw4PtmQ1Gs2HcnYtsFqtQnp5eZl0dnamfV9JSYms/m9vbz9fYxSJa4herydDQ0Mp2x0fH+cmoj+BzWYjk5OTwmpZWFiQNQ6OLN2U0traWuGXYhEldXFlB4L4Yp0uAsVkEoHpLtJsdYhJV599oYiZmJj4/gh0u91Eq9UKj8FgkPxWnZmZ4VeTq6srUlNTI+xx7MJcVVWVtg9WLxQKkfLycp7X0tKSsi67wrA9r6enh12BMp7H6uqqEHli2OVfrVZn/I4ECvoH/7VmquXMZJvNZsk2Pp+PlJWVZdzHHy3wJ8D/DwSCAoGgQCAoEAgKBIICgaBAICgQCAoEggKBoEAgKBAICgSCAoGgQCAoEAgKBIICgaBAICgQCAoEggKBoEAgKBAICgSCAoGgQCAoEAgKBIICgaBAICgQyD8BAAD///8nVzchiGe6AAAAAElFTkSuQmCC",
	"apollo": "data:image/png;base64,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",
	"auth0": "data:image/png;base64,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",
	"salesforce": "data:image/png;base64,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",
	"agentforce": "data:image/png;base64,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",
	"adobe": "data:image/png;base64,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",
	"aiven": "data:image/png;base64,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",
	"altimate": "data:image/png;base64,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",
	"amplitude": "data:image/png;base64,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",
	"appwrite": "data:image/png;base64,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",
	"buildkite": "data:image/png;base64,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",
	"circle": "data:image/png;base64,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",
	"ckeditor": "data:image/png;base64,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",
	"codspeed": "data:image/png;base64,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",
	"confidence": "data:image/png;base64,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",
	"spotify": "data:image/png;base64,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",
	"dropbox": "data:image/png;base64,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",
	"growthbook": "data:image/png;base64,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",
	"jfrog": "data:image/png;base64,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",
	"pydantic": "data:image/png;base64,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",
	"lovable": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAaQAAAGkCAIAAADxLsZiAAAFyklEQVR4nOzXYY3qUBRG0cdLdeACVehBFS5QcCSMh8m0t2WvZaDfj5ud021m/gF8u/+rBwAcQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7ICE7bAvvT/Pw77Frz3ur9UT/pJXdwnHvDqXHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkLCtHsC5vD/P1RNgF7eZWb2Bs/jK0j3ur9UTOAW/sUCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QMJtZlZvANidyw5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxK21QMu7P15rp5A0eP+Wj3hklx2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCbeZWb0BYHcuOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEn4CAAD//5s7HKbIhUyIAAAAAElFTkSuQmCC",
	"mapbox": "data:image/png;base64,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",
	"mergify": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAJE0lEQVR4nOxdbUhU2xp+nByP9mFhngr0OF0ts6wsLTmGca5aVhAhB6380ZdwL+GPToegpK4f/Qi6iQRlopcK6k9RPyKyQD1JBclRSxEbSzEzzQy0q5g2zky6Lmu3Z989M3vPuD+c2XrmgVe2e631rvU+e+31vd/xh3cxH8AmAHEAYgEYAIQDCAUQDCCQjTcOYATAAIA+AN0A3gBoAvASwKi3DPDzcH4LAKQDSAPwM4B1AJQ+RCuAVwD+BPAHKyMqlVcToA8pFcAdAGYAZJplnM0rzduGK0UIgDwAXR4gTUzeATjFlmXG4AcABQC+eJE4R6Fl+RevTdUsMtmn7m3CxKSLLaPm8DcAlRogaKpCy7rc26TZkA1gTAOkSJUxtuxeAx3DVWiACKVSztriUfwEoE0DxqslbaxNHgGdKbRrwGi1pYO1bVqxGkCvBoydLullbZwWhM9y8vgkql4Tf2KruLeN85R0qNkm0h7KqAGjPC1tavXO5RowxltSoZS8bA0Y4W2RPdhePkNnGGrLGDtVlYyZNLedbqmUSl6mBgqtNZnyKk6glxdBtSrv2LVOO8wRIDAPwK9Sq+xfAIvY/Zen/JuOm0ohAN57Y3VihmCU3Tn8r+2GziHCP5SQl5ycjKtXr8JoNKK/vx9NTU0oLi5GdHS0olJrCJSbf7qKILvtO3fuHBGD2Wwm2dnZ3m7D1JIuse3gVLlKc3Jy7AgbGhoijY2NZHBwkLs3Pj5OEhISvG28WpJqI43P5B0AWVLrdGhoKN6+fYvg4GBMTk6ioKAAJSUlGB8fR0BAAHJzc3HhwgXo9Xq0tLRg48aNIIRg0aJF2LFjBxITExEeHo7AwECMjY0xuurq6lBbWwuz2SyaL42fkpKCpKQkREZGYsGCBbBarUzT0draiurqanR3d0s1Z6q4C2Av/0YwuyEt+WkcPnyYq2WXL18WjHP27Fkuzvbt20lpaSkxmUyirzxFb28vOXDggJMuf39/cuzYMfLp0yeX6ScnJ0lVVRVZt27ddNRAM3vKgsOvcpUVFxdzhd68ebNgnKioKC6OxWJxabgjamtrydKlSxk9cXFxpK2tTVJ6+qBOnTo1HSTaDfXK5CoqKSnhCrthwwbBOAaDQZLRjmhoaGB0DwwMyNaRn5+vNoFlfAKb5CrKzc11W0h+HLmgnZASWK1WEh8fryaBTTby6NjGIldRREQEZ9zXr19JVlaWXfiuXbvI8PCwYgLVQHNzM/Hz81OLQMrZfNoL/wLgiZIuqaioCIWFhdz/L1++ZHrc1atXM72kEHp6elBfX8/01jReQkIC/PyknbajA3aaD023fv16xMbGuk2Tnp6OmpoaSfm4QAr987vSp6HT6Uh5efmUakF7eztJT093qglr1qxhes2poL6+nmzatMmpHFu3biUdHR0u05aVlan5Gv8GNU8X7Ny5k3R3d4sWnr7ikZGRLh/E48ePXRJgNBrJ3LlzRXWEhoaSDx8+uCRfRQL/QwmsUlEhqaysFC38lStX3Kbftm2bSwL37t3rVseZM2dE09MHrKK9VToAYWo1CO5AZwfu8Pz5c2ZGo0THs2fPRMOCgoLcppeAMB17oNsjGBgYcBvHZDIxIobh4WG3OqYSRyX8qGOncT7IwwJKoKp1+i+GIMcFVR8kghIo3uD44A4mHXuC3Qd5GNGxn0/5IA+DOvbbMx/koU/HbmP6IA/MnsFvak1t9u/fT0ZGRkSnUffv3yfz5s1zqePkyZNkYmJCVEdhYaHLJSm9Xk9u3bolmt5qtZIjR46oNZX7nRL4dzWUJSUlkW/fvnEF/fjxI7l58ya5d+8eGR0d5e5fu3ZNVEdmZqadsa2treT69eukurrajtS8vDxRHZcuXbLTUVdXx+T54sULOxKTk5PVIPAXKF1QtQl/FaW8vJwEBARwYUuWLCFPnz7lCr927Vqn9EFBQaS/v5/TcfToUbvwuLg40tPTw4SZTCaybNkyJx2xsbEc0cPDw8xiLj88KyuLWRGyPRyFi6sW/iEE2Uv6VEJCQriCv3//nnmNHOOsWLGCI+f8+fNO4RkZGVz47du3BfPJzs7m4uTk5DiFnz59mgvPzc0V1JGfn8/FUbhjxyzp22YifyppSVetWgWd7ruqmpoaZn/WEZ2dncyeL4XQUY+YmBju+uHDh4L51NbWcteRkZFO4VFRUW51PHjwwKUOCWA4sxH4hxJNExMT3LW/v/gH6LYwQohTGH8JS0yHXq8XjC+lHHwd/PgywHBmI7CGfadlwWg0wmL5nnzPnj3MKQVHJCYmwmAwMNfNzc1O4U1N3CYXDh06JJhPRkYGd/369WuncP69gwcPCurg3xfSMUWYhSrdHSXt4N27d7m25dGjRyQsLIwLi4+PJ2/evOE6gIiICKf0/v7+XByKixcvckMe2tjTHnpoaIgJ+/z5M1m4cKGTDv4OocViIcePH+c6s8DAQGal2tZWP3nyREn7d0eIVdmHi6isXLnSbrhCe9uWlhbS2dlpN6woKioS1bFlyxa7kwtfvnxhhh99fX3cvcnJSbJv3z5RHSdOnLDLj5Ld2NjIkW/TGx0drYTAVCEC/ZQe7U1JSWEKLIYbN26QOXPmuNRBB7mUfCHQ+2K9K19KS0tFy0CHMbt371ZCXperdztPCYFUFi9eTAoKCpjdL1pzOjo6mNfbcUzmSmJiYhgS6FiNDshfvXpFKioqmLHgVHWkpaUxD4w2C1RHQ0MDc4bRYDAoso91YmFX6/jwHfF1DbdHfGlAsefLNWPwbz55YvhB4543vCVdUtym+D60cRbJ7lJ8n3r9XyR/6gX2Azvfx4bfOZDtY8b3uasKvmVmg28YuVKulDywY8LZ5CNmqmJUczzsczqhAnxuT1SAz/GOCgifpa9zuydcP9ngcz6mAubPEp8yFd5effI5YFQBy2fY3LlSri+Y6YbWndC+06oTWj4CWZfDWnODXCDktkTLCGH3D7xZI7vYfZ4Z5YhbCGnsXqqsr+IlipnNK9UTvxXg6R8jCAawjZWfAawFoFeo8xuAVvasymMA1Z489+1pAh1Bx18JAOIBxLC9eRiAH0V+DmMQwAd259AIoAXAC2/+HMb/AgAA//8H9kl0pnSM6gAAAABJRU5ErkJggg==",
	"mlflow": "data:image/png;base64,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",
	"paypal": "data:image/png;base64,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",
	"render": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAADOUlEQVR4nOzauUsrURTH8d+LQVwQNxAEByxEREEUFxBxqSwUtddCsBgEG/U/0MbG2s5KUCwErURxAUGwFC1cQSwyXQgpJgtJmMcMpHiF4ss5Q86F8wHLHC9fbuZOMol6nudBlSoVKfcKTKcBiTQgkQYk0oBEGpBIAxJpQCINSKQBiTQgkQYk0oBEGpBIAxJpQCINSKQBiaLlXkCpHMfB6ekp7u/v8fX1hXQ6jfr6enR2dmJiYgLT09Oora0NfyGeYRzH8Wzb9hoaGry6urpv/yzL8nZ2drxMJhPmctw/nkEPla6urrC8vIxEIvHr1/T29uLw8BCWZYWxpJQxAc/OzrC4uIh8Pv/fr21ra8P5+XkYEc0I+P7+jvHxcbiuW/KMvr4+XF5eorKyknNpZjzW3NjYIMXzPTw8YHd3l21NReJ3oH/KTk1Nscxqbm7G8/MzqqqqWOYZsQMPDg7YZsXjcVxcXLDNgwk30re3t6LniQ/4+fnJOu/t7Y11nuiAHx8f4L5EJ5NJ1nmiA/r3btxqampY54kOyHmAFLW3t7POExvw+voaT09P7HNHRkZY54m8D8zlcpicnGQP6N//vby8oKmpiWukzPvA7e3tUHbf0tISZ7yAuB14dHQE27bZT9/W1tbgU01jYyPnWFk7cH9/HysrK+zx/JPXn80cLyAioOu6WF9fx+rqKgqFAuts/y17fHyM4eFh1rlFrAG3traC0/O3stlssDMGBwext7fHuZTA7Ows7u7uMDo6yj67iPUa6C/Uv/h3dHRgfn4eY2Nj6O7uRktLCyKRSHC6xmIxPD4+4ubmBicnJ8EHfC7+KVt8JrKwsICenh622d/g/UJ1aGgIr6+vXOP+MTc3h7W1NfT396OioiKU/1GClBFP5TY3N4NrpEQiDpGfzMzMiI0HEwL6b1vJxAccGBgo9xJ+JD5gNCr7Mi0+oHQakEgDEmlAIg1IpAGJNCCRBiTSgEQakEgDEmlAIg1IpAGJWL8r6urqQnV1NedI8cT9MsEwsn6ZYCINSKQBiTQgkQYk0oBEGpBIAxJpQCINSKQBiTQgkQYk0oBEGpBIAxJpQKIogFS5F2Gw1N8AAAD//yxbEOfXuIj6AAAAAElFTkSuQmCC",
	"resend": "data:image/png;base64,/9j/2wCEAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDIBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAFAAUAMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APn+iiigAooooAKKKKACiiigAooooAKKKKAPTfhf8MLDx7pt/dXepXFo1tMsarEisGBGc813n/DOei/9DBff9+Urx/wr8QNd8G2txb6RJAsc7h382LccgYrf/wCF5eNP+e9l/wCAw/xoA9B/4Zz0X/oYL7/vylI/7OWkFSE8RXobsWgUj+dcB/wvLxp/z3sv/Acf416h8M/ifceMUurPUbeKK/tlD74chJEJxnBJwQcd+9AHlvjf4Oa34QtH1CCePU9Oj5kliQq8Y9WTnj3BPvivOK+2JLlJonjkVXjcFWVhkEHqCK+PPE+nxaT4p1XT4P8AU291JHH/ALoY4/TFAGVRRRQAUUUUAFKqs7BVUsxOAAMkmkro/AupWWleK7a5vtqxYZFkbpGxGA39M9s5oAk034feJtS2lNMe3jP8dyRFj8Dz+Qr134f+Dl8Gw3E9xcJPf3ICu0ediKOdozyeep46D8dT7bkZDcH3rmPGFx4lS2N5oOoMFRf3tqIY2JA/iUlck+oz9PSmK53OteJrPQdMlv76YJGg+Vc/NI3ZVHcmvl/Ur6XU9Uu7+bHm3MzzPjsWJJ/nS6hql/qs/nX93NcyDgGVy2PYeg+lVKQwooooAKKKKACiiigDs/CXjN9OCadqMha06RSnkxex9V/lXogvcgEMCCMgg5BHqK8IrodD8US6ZD9luQ81sPuYPzRn0Geo9v8A6+WJo6LxX4Wjv2fUNMQLcn5pYFHEvuo/ve3f69fPCCDg8Gu5/wCE2s/+eNz+S/41z2vajp+pzC5toJYrlj+9LABX9+D1/n9eqBGPRRRQMKKKKACiiigAooooAKKKKACiiigD/9k=",
	"runway": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAAE60lEQVR4nOyXSYgTSxiA/+mM0/Q4i85oo4SI0BKTqDl4CgaJYoKiIpiLBhQRRHiop4gXERcQMScPIRoVhFxdYtyCBpdDwBHUg4EgCS5Eo4kxMbudpa3H+D+a8PRhjwpvKOs7/VX9V02+rqq/azj4w2DCtMOEaYcJ0w4Tph0mTDtMmHaYMO0wYdphwrTDhGmHCdMOE6YdJkw7TJh2mDDtMGHa0f0wY3h42Gg0drvdz58/C4KA8cKFC+fNmyeK4ocPHzBt8eLF8+fPF0WxUqmYzWadTlev1wcHB9evX79ixQoAyOVyY2NjkiSJotjf31+r1dTJR0dHS6XS5OvnuCVLloiiKAhCpVLheX716tUOh0OSpGKx2Gg0JEnS6/WiKOL8+KcXLFhgMBhEUWy327Is/+or2bhxIyEklUrt2rWrXC4TQnbv3p3NZgkhnU5HTXv16hX5itlsJoSUSqUdO3ZgGhIKhex2O8b379/HUUeOHCGEyLI8MjICADabDROOHz++bt269+/fq8NlWfZ6vT6fD5uPHj3CGTiOy2QyhBBFUSRJ+lVbVbgXLcLfZc+ePThQluXBwUEAePbsGT7aunUrABw8eBCbHo+n2Wx+O4PH42m32xgvXboUAFatWoXNO3fuaNGZ2hlOpVK3bt3KZDIa80+dOuV2u+/du4fNLVu2RCIRAOB5fuXKlYsWLVq2bBk+crvdALBmzRoAyGazRqNREAQAOHr06MjIyKFDhzBt+fLl4XAY4507dwLAtm3bsHn27Nkpufwn6go/efJEp/vnzGtZ4UQigY/0ej32pFIpl8uFsc/nO3DggLp0tVptfHxclmVCSCAQEARhfHx88+bNf33lxIkTmHb+/Hl12+fz+eHhYTxluVxuxowZWnT6tZs/fvxYURTt+R8/fsSgUChg0NfX9+DBg0+fPs2ePdvpdLZaLQCIxWIul2toaOjYsWM8zwNAJBKZO3duNBq1WCzfTjvxFZvNJopiMBgcHR0FgAsXLvS+/V9CXeFgMKh2vn37FjuHhobQpFAo/GuF1co0MDCAPel0GgBCoRDWGEVRCCEWiwXHdjodQki5XB4YGLh48SIOOXPmzN69e0+ePKmuMB6N3oM9pXL1k9/hYrGIQSAQsNlsPp9vzpw5GsdevXoVqyvHcYlEIplMXr9+fXKz9U9ut2g02m63rVYrACiK4vV6/X6/ejqQy5cvv3nzRm3evXv3xYsXGv/6Twpfu3YNg+3btz98+HD//v3ax96+fbvZbGJ85coVAFDrEO5nAEgmk5OXBJ3u6dOnN27cOHfuXO8M3W7X7/erzd9WrpDvbumZM2fG43F1U+Xz+cOHD3e7XS1bGg2xB6s0z/PVarX3g2wymd69e6fOn06nY7GYuqXxnoOPtJcr5MdFa2JiYu3atXhu1c5Go+FwODZs2GC1WnO53KVLl8rl8s2bN8fGxjKZDObj5QkAOp0O9qgL6/V6T58+/eXLF9yrrVbL6XTOmjWrXq9Xq1UAeP78uclkcrvdBoPh5cuX4XC4r6/PbrervwE/Y7+5XE1bOI57/fr177xdTXM2bdo0pdtVL1P4Dk8farXavn37ACAej//fv2Xa88f9P8yEaYcJ0w4Tph0mTDtMmHaYMO0wYdphwrTDhGmHCdMOE6YdJkw7TJh2mDDtMGHa+eOE/w4AAP//BtVOxVQTYikAAAAASUVORK5CYII=",
	"sanity": "data:image/png;base64,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",
	"servicenow": "data:image/png;base64,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",
	"shippo": "data:image/png;base64,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",
	"confluent": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAASCklEQVR4nMxcCVhUVd+/3Nk3FkFJVFJRlFfBRHwVwRIwXMBcQdCkwi3RtMDytVReUb8oBZcKQ1N6IBXR0BQUTUASBF/ABVAWWRRwCBm2YfaN72HOcOYyGzPDTPV7eHjuWe655zfn3nP+y/kffG9vL2I2tLK6nlS+qKp9Vfvyz+YWViuru7Obw+UJRGIJgiBEAp5GJdtY0e3trEaPtHNytJ88YfQ0l7FvDLc2X5csTE6YwxPk3i/PKawoKK5sZLKMaMHRwc7LY7LvHFcfz6l0GsW03TMZYalUml1QfjGj4E5+mVAkNkmbJCJhvrdbcMAcP283PA5nkjZNQJjdw0tOv3s2LYfZ2qGjGg5Fh9ta2tlY0ulkEoGAIIhQLOZwBKxOdls7WyqT6bjXwd4mPNgvbOU8Szp1iL0dEmEOT5B47nbiuVtsDl+9lEQkeLg5zXSbMM1l7CSnUWMc7Ah4zaMklkibmG3VdcyyqpfFT56XlNcJhBreEUs6dfNa/81r/elUstF9NpKwDEHSrucf+v5yWztbrVuUAN8ZAb4zvDxcKGSiEY0LhKL84srMnIeZuaXsHp5K6Qhbqy+3rVy9xNvCiKaNI1zf2Bp5IKnoUY1KvvvU8eHBfoF+M8gkY3iqQyAUZ+aUnLmY/bCiXqVo9nTn+L0fjXe0N7RNgwmnpN+Njk/lCUTYTG+PyVGblnq6TzL08Xqi6FHNkVO/5RdXYjMpZGJMZMi6FfMMasoAwjy+MOrgz1duPcBmOo9ziIkMmec51aCnGoe7RRXR8anV9Uxs5vIFs+L2fEilkPRsRF/CzNedYZ8dr6huhDlEAj5q43sRYQsJeLyBPTceYokkISUr7vQ1kUgCM6dOckyO3+Fgb6NPC3oRrqlnhnwSx2zthDmTnUadPLTZZcJoY3s+JFTVNm/Zk1hZ+wrmONjbpH4f5TzOYdB7Byf8rKYpKOJwexcH5gQFzPl2d5hxM7CpwBeIdsUmp2XchznDrOmXEnZOcXbUfeMghGsamMs2xnb0s7WwsNi7PShi3UITdXuoOJmSFXPiEqRga02/cvo/usdZF2Fma0dg+CH4JuNxuBP7169YONvU3R4SrmQVfRJ9RiKVgqSD/bCMpC8dRgzTVh/VVsDjC8MiT2DYoqdiP/6nse2bpRfOPhW7BUrazNaOsM9O8PhCbfW1Eo48+DOcky0sLE7s37DYZ4YZOmwCLPZx/27/egsLhehVUd0YdfBnbZU1E05Jv3sVs97u3R5kqrEVisSJ52/n3C83SWsQyxfO3rs9CCav3HqQkn5XY00NhOsbW/fFp8JkcMAcE85SbR3s6PjUny/lmKpBiIh1C4MD5sDkvvjU+sZW9WqqhHsRJPJAEr9fcnSZMOqb3WGGPvtl8+s124+mZxWpFwFloFtNJTAJvtkdNtlpFLjmC0SRB5LUJ2RVwhev5UOtgEjEJxzcbMR6a21Fyy+uPH42Q72IyxPI/2udVIYCCpl48tBmIkEh+RU9qrl4PV+lzgDCHJ7g0A+XYTJqw3vGyVJWDJrvHNfqeuad/CcqRRw5YfDfHHCZMDpq43sweej7yyrPGkA48dwtqN86j3MYyqe71P/fcsHglkp+j9xU0MPVYDAwFSLWLYSyR1s7O/HcbWypkjC7h4cti4kMIRCM1woWvP0WlUIsKK16/LQBm9/F5sL/ZgKBgN8fGQKTiedvYa0ISsLJ6XehpcZ7poueGt/xsxnxp6+p51MpJLBuH08a8CUDRVoqlZnK0KcRPp5TvT0mg2t2Dz8Zs0QpCEuk0rNp2TAX+xnoQOOrtiOnr32beHXbvtPA1IxFyHveCIJk5T2uaVBqsJAnVr8zB6I2LYXXZ9OyoeypIJxdUA6lSPep4/W0XTiOGg5EnMs3Ctd9dpw7cHqY4+7y5ujhvb29Cck3YaZQqOApMOcIIwji6T7Jfep4cM1s7cwuUIg6CsJp1wtg1fBgP/3bXeY/6+DONQiC5BU9Xfnx4fbOHliEokjokr5B/vVmEbTgwhE26ysNEB7sC6/TMhQE+whzuII7BWUgbUmnBPoZJjOvX+33yQeLEQR5/KzhvQ1fY63Tq5d441BULJEmnldMh0rCmgyxpkWgn4clXeG4uJNfBtanPsI5heWwHwG+xtgcd29dFeDb9zPVvfxz6cbYl6/aQP7IETY+8snvl/Q8MDP/lSNMJhFBr8DjcgvLFYRzMaI8rGEQUBT5bv+GWW85IwjSxGQt2xhb+6IFFIUundsnWvGFYFKUyRTSHn+g3dNMwGp4OQUVCsL5JVUgi0QkeHm4GNc0lUL65diO6VPGIQjS8rpz2abYZ8+bEATxnzvNxorWN1VezMaOqg6V1YTwnulCIhLAdUFJZR/hP9u6mvp9fB5uTrolZzaHtzDsQOzJ9MraZvVSBp1y4bvIKRPHIAjC6uhZsfnb0vI6AgG/Uq5asjp7rt8pgZXNPUsDUMhED1cncN3IZLW2daFPKl/A4pluE3Tfn3X30eNnDcfOZPiE7PMJ2XfylyxWxwBXi7Ul7eIPURPHjgTiVNCWw/nFldBWnnRJudRLxFKTUtOKmdOUpJ5UvsB5zA2EFv1Na/wnjhup4+Ypzo6e7pNYHeyGptesDnZe0dPTF35/WtNEp5LfHDUcRS0UMtY898zch+wenlgivX6n5N250xqZrFd/drS87hSLJSz50hXg6z6pX5UzK9gc3m+/F4PryU6jcBOn+z6taQLpXVuW2VjRdd/v6GC3cpFnoO8MvkBUXc+USKTPG1rSs4pSr93rYvPGONhZW9LoNMp8L7eM7BIuTyiRSq9nl0xxHvNcPo2x+hfqRT7uf41ZG0VRKESOsh+Gc3D2am5plxdYRH8agkO1WrmwsBtmuWiee3CAl1Qmq6p7JZFIe7iCokc1Zy7eKXpYI+vtnT5l/GLfGRnZpTy+UCKVPe+ftCEWzXP/l/xrNzcYNPLxpAxgm7ViUHE2b3p0dvetkPZ21lvDFhnUliWD6ufltm7FOxQSsaquGTh1G5msrLxHZy7e4fAEoUvnPnj0XCDUsAItnDd9UKO5SYDDocnpeUDsJRLwaGe3wshua8MwrkVba8bnm5eVZByJiQwdZa8wCHP5wnNX/9jx3zN8gZblx4x7aVRh10+ts5uLQmsLY2jbR2gU0qY17xZdjT3x3/XTXMbCfI2+/L+Wr5Iahy/AQ7WOSDSBE5BAwAcHegUHej2sqP8p9ffffi+WSjVv3njwuAbp7bXoB4pa4HE4Ah5HIOBIJCKVTKRSSCQinkQkEIkEcAFFCEMBqYnFEn1JisWSH5JvdrF5HB6fwxNyuPxuNq+HyxeKxPI/CbgQ6726nr967/zVewb1G4dDrRhUKwaVRiXTqGQrOuWDVT5+Xm4GNYInEhSDrFsjF4klsSevGNS0ySGVyjq6OMCzh6IWlnTqgnem63MjpEYg4PE0Klkkn7d0G9bIJOLF76M62VwOl8/lCTk8fhcYYeGAERYIxTy+UCAUiUQSsUQqkUilMplM1gtdduqGEQjXSY5vTRmHx+EoZKIlg2ptSSMTCSSS8n2mkIk2VjQGjUKjkvV3+UPLIYIgdAoZP8yKBiZqrO6uDhwOfWf2FP2foQ1jZm8USzS/9uXVjbLe3vWr569cNNvoz1UjWF0KajZWNHSEnWJj4+v2brHEvHamPujcbPS0pinyQJLHks+PnbkOpIOhQyyWtLV3g2v74dboGAdbkJDJehtfGbM10kBoZuzn5Tp7ujO4bmtnx5684hG4M/poqu7dffqgkcmCSviYkXaok+MbsKy6/tUQWx8UqJYRzit6ujH03by0gxtC5g+Ty/NcvjDx3O1ZS3d9uv8M1u5pKKrrlKTGv2mPYiX4ssqXRrerJ6AXFwJ0QCKVffzlj80trIM71zzJij97eOt8bzdgD0u9XvBO8N6wz47nPXhqxBPLqpSkXJxGo24Yqai4rHYIXPQCUE5QCwtoaVi+YNbb//4X2HG5YVcCsBks9pnxy7FPSzMO/ydixVi5rff2vSert8b5hu5LzyrSJsxoxP+eKElNcxmLvjHc2tHBDqRLyurMbWrCy/eXWlvRVi32BDmXb9xPPrrdf+40YOhau+MYsA0hCPLGCJtPwwPvX/nm1x+/WLloNplEePa8OWLPqblBX12+UajP4/gCUWl5Hbh2dLDrm7QQBPHq90oIRWJg+DEfwIZaOo3yUZDCaFzT0PLoacPZw9tC5Z6KLjY3eOuRWow6iVr09fCHA5vKbh2L3/vh3JkuL5vbfr2pF+H84kpoSAPmuj7CvnNcYY3MnFJTcxwAINaSiYR/TRwz662JIPPCtXt4PO7ovvBNoe8Ce1hQxBFo64WwpFPWLH370snPy24d/XrX+/o8LjNXScfXy1VB2MfTFS70mTmlGtVXUwEYvXE4FOviuHn3kVgugcVEhe4IDwB2z1VbDmtbk2xtGGNHjxj0WQKh6Eb/+JGIBGAhR+UvGHm+t0IEZ3P4GdklpiOoCppcJARz9WLfGQ5y/bmHwy98WA0q7I5YuTtiBbBvB0UcGYpjNSO7BPpD53u7gW3lCoNOcKAXrHc2zfQ7TiDACBMIOPA9b17rD/Jv31PuFdgRHhgTFQL8GJt2n9Qmig4KLJHV/QQVhP28XOFu1IcV9fD3NjlIJAL4hkHy/WVvW1vSEAS59cdjbLVNof7HosPxOPSPB8+iDiYZ8aDCh9VwW7mDvY1vvxapIIzH4bBOw7hTvxnLaBCQ5JMWnDJoVDLw8TUxWSrG/ZAl3klHPqGQiGkZ9w+cuGTog45gKIQH++FxCqZKG2XYinnQ15ZfUpVbWGEsKV0AVEkY68r61fOBEHJ74CAjCPLu3GlpJ3faWNF/SL6pslVDN3ILywv6/UeWDGrYSuWueSVhSwYVflEIgkTHXxBr112NRj9hpfZna8NYI3e4Xdc0Wc50m5Bx9svxjvb6rx1isSQas7Fu8xp/bPDPACv05rULRthaguuahpaElCzDGQ0CBWHSAHV3y/sL8HhcRXXjk2cv1G9xevON3AsxO8ID9XxEQkpWTYNCbhlha/UxZhRVCdOp5C+3rYLJuNPXNDrNhgIGjQwkLWzm6JF2YC/nhWuarVwqP5AOVNY2x2E22Xy1bSVtYJCTqp9h9RJvqJeKxJItXyWaVrq2ks/JYGbGYsv7CxAEuXr7f0P5jvgC0ZavEqEVydPdOVi+5wILVcIWCBK/9yOoylTVvfri62Sje6AOOhhhtdAylwmjfT2ndrG5xumAAF98nVzVr/1SyMS4PR+pa98aPEnjHe1jMBu7LmXeT0i5aXQnVACo0qkaTHBbP1gk3+b0yLiWE1JuXspUhkDERIZqDOPS7Dpbt2Le8gWzYPLAicsat8YaAQVhTV4OLw+XuD0fRm1cakSz6VlFB04od4kuXzBr3Yp3NNbU6iuM2/Ph1EkKZ1dvb+/26J9MokhZW4FvWHOQ6Nplb48coVf4ERY3cku3R5+BluCpkxzj9nyorbKuII+W1x0BH/0fVFlMEuQhlcoEQhGZRMTh9PLLDgr1II/MpK90/GqDh/Es3xjbjg3j+WRVhIFeVfMhISXrwIAwHsaV07uMD+MBePa8KWjLkfYupZn+nxKo9XVyGmaWsrWmpyV8PsV5ECe7fqF4DcyQbf+gULzK2uYI84XiAbS87lynMdhy3cKhbKs2FGKxPNjyJ9Vgy5SjO/Sc7YYaTjtx3MiYyBAfT1cDe24McgsrouNTVYzy5gqnhfjlSt6+uAsqAdNeHpN3mjNguvBhddzpa5oCpkO1rbfaYGRIfNTBn9WtIoqQeN8ZZBPNZwKhKCOn9OzfGxIP0Ks49ODX1/2OOQhLOmWx/NADb6MPPRCI7pVU3sgpzcwpVT8/4m849ACCwxOcOnf7x/O31c9iwB5r4eYydtJ4B8dRw3Uca9H4qq26nllW9aL4SW1JWZ3GzcWWDOrHa/w3/S3HWmDB5vBS0vPOXMzW7dpEUYsRtla2NgwGjQLMAEKRuIfLb+/sed3eDT2aGuFgPyw82PfvP7gEC6lUmn2/PO16wZ2CMm1blQyF4miaQC8/L9d/0NE0KuDyBLmFFTn3y/NLqhrV3CX6QH74kEv/4UPGv70aYXrCWLSyusoqX1bWNte9/LNpwPFSUrnogoPHS40ZaTfe0d5FfryUvTmPl/r/AAAA///c4Cbo129cGgAAAABJRU5ErkJggg==",
	"tavily": "data:image/png;base64,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",
	"twilio": "data:image/png;base64,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",
	"epic games": "data:image/png;base64,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",
	"unreal": "data:image/png;base64,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",
	"val town": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAADLUlEQVR4nOybvUv7XBTHk1rxBRRsqThIcZE4+IKb4K5SkYqboxYdREXEQRQEEaSQgC7+C+LmkEFFV1eHEBQRDBgHFwc1JCYx9hl86O961etL0qucns9kTpNzvh+TptdI44VCQSgnYr8dgDcoDB0Uhg4KQweFoYPC0EFh6KAwdFAYOigMHRSGDgpDp+yE478dgGZnZ+f29ra4mU6nh4aGohxQ+GN0dnaS8fr7+6PtX3aXNApDB4WhE+pjKZfLvVtva2vL5XKJROLTDkEQHB4eHhwc3N/fv1RM0yR30HWdmtLR0TE3N/fz0GFu8Yy2zc3NpmmyD7+5uent7f1u4EwmEypzqIOZjI+PM461LIv6yOUjXML38MnJCePVjY0NTdNKN/0jQr2H6+vryU3btp+enoqb5M8UhmGsr6+TFVEU6+rqBEGwLOv5+flfvni8traW3JPa/DZhLg+KTCZDdm5vb/9oz7fL48nJyZeXAC4td3d3VVUlK8lkkjrhpYO3sO/7CwsLVHFpaSmZTPIJwFt4dXX18vKSrEiSNDMzwy0AV+GLiwtFUaji5uZmZWUltwxchWdnZ13XJSvDw8MDAwM8M/ATVlV1f3//1exYLJ/Pcwvw/1A+Y+7u7qampqji/Py8JEl8AhThJCzL8vX1NVlpampaWVnhM52Eh/D5+bksy1RxbW3tZWnFGR7C09PTnueRla6urrGxMQ6j31Jy4e3t7aOjI7IiiuLW1lZFRcVXDnccJ9o8pX0u/fj4uLi4SBVHR0cZfwbHYq/OwfHxcT6fT6VSxcrIyEhDQ8PPM0W4Lh8cHCQ7V1VVpdNpalx1dbVhGIwm2WyWHVjX9TAho7ykW1tbyU3Xda+urqh9lpeXW1paGE36+voijPQOYX5bFGdnZzU1NYxZ2WzW8zx2E8dxenp6GE1CnuGI/9Wyt7fX2Nj4NmUqlVIUxff9rzR5eHiYmJj46K4WUliM/FstQRBommbbdrGSSCQkSaLuRp9i2/bp6Sm19hYEobu7O8xDj+iF/zhl9yAehaGDwtBBYeigMHRQGDooDB0Uhg4KQweFoYPC0EFh6JSd8H8BAAD//733jCJVRlfzAAAAAElFTkSuQmCC",
	"workos": "data:image/png;base64,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",
	"you.com": "data:image/png;base64,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",
	"zoominfo": "data:image/png;base64,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",
	"zyte": "data:image/png;base64,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",
	"qodo": "data:image/png;base64,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",
	"stripe": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAAB/ElEQVR4nOzby27TQBTG8W+midQuuOy4FdLGSTxOk7ZseQuEEHvY8Ly52rFjSARSKFVVqFIQJR40e1RV9XhsnZ7/Mosz56expUhRam9ebXCXkmUv4DoGU4/B1GMw9RhMPQZTj8HUYzD1GEw9BlOvVvYCN6pWx14bqi/UkWgF+Pg6u/0oq4tZa3sHjRYaHjwlPYVne6jX7UyuClgIPHkOvw/Pl91j7O5DFvO2lQne3kGnh1Yg2l2hDnHvgYtDXYMfPUX3pbnGTs88tFtbjs8vGCyleVCbPpq+bLSw33Z0jddkH3z/IZoKB8eicyC8wDy3lcoCWEq8aMILEBxJ1cfjXRt7FVYu8Nv3Qh0Kv1e5a7ymXOB3H4S9TRx1575aMph6DKYeg6nHYOoxmHoMph6Dqcdg6jGYegymXlV+TLtJmw2WKZJpriFVB1/8QDhAPNHzUMdjXK7zDqwc+Oy7ucPPMRbz7NMMJytA25xfPvj3L8ynmI11ONDxBD/Piz2uBHCWYfUV8RjRUM9GepmaT5zlCHy5RjJBMtXRUIdDrC/cHPufigKfnyGNsEiwTLNkitUXaKuv4q2zBv57ZYThAPMoi4Y4/WZrsOVygU9PMBuZVzEa6UWCqz/29ioswf89JB6Dqcdg6jGYegymHoOpx2DqMZh6DKYeg6n3LwAA///aan8EVxwydwAAAABJRU5ErkJggg==",
	"postman": "data:image/png;base64,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",
	"airwallex": "data:image/png;base64,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",
	"higgsfield": "data:image/png;base64,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",
	"magnific": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAaQAAAGkCAIAAADxLsZiAAAF6ElEQVR4nOzX0W3bMBRA0brQFp7L+3AfzaV/jtCPAP0t0CRk5HvOAu8BtK/IY875C+Dd/d69AMAKYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QILYAQliBySIHZAgdkCC2AEJYgckiB2QIHZAgtgBCWIHJIgdkCB2QMKxbNK4zmWzlhnP1+4VvpIz+vmc0X9zswMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxKO3Qvc27jO3SvwD86ID4855+4d7sq/iC3G87V7hVvyjAUSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgITHnHPNpHGdawYB9zKerwVTjgUzuJE1P7tlfGL5yzMWSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSjt0L8LOM69y9AnwLsfuU8XztXuErvWXpnBEfPGOBBLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7ICEx5xz9w4A387NDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSBA7IEHsgASxAxLEDkgQOyBB7IAEsQMSxA5IEDsgQeyABLEDEsQOSPgTAAD//8n8LMJD5c+zAAAAAElFTkSuQmCC",
	"heygen": "data:image/png;base64,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",
	"greptile": "data:image/png;base64,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",
	"laravel": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAAFZUlEQVR4nOybfUxVZRzHn+e83Mtg2HbXiHxZMtbm1TKpsdkaDipsEanrCpUjxlRokRMTnVygxmULMskguEaJmcIfV42BLJe4WmjD2tKmLlykppNmLysG3d3pPW9Pu9yQt8u5zznnOYe70/n8wz/n9zy/7x7O9/ye3/NcJrCCBv8nqLlOwGgswWbHEmx2LMFmxxJsdizBZscSbHYswWaHvGCYugxASHxYUpAUDFOcbGOX/egPto7vYHomwZEJQkiwI4lxN9t856iVT4unjsEFi+2tvWxjF0xxkhmfHFBriycunt6wlSkqB/GJ0tfHheZqdPMKuMfBlFTTrhIAodh9UPioFgz/SSxlbWgQTFFUzgb2tRqYvEj68Xv+/V3oQv+UoRelMmX1dNZaFPALhxrEjkYQvEMmaw2oFAzTs9ht9dSSNHTrBt/ylnTqKEAo8pMrnmDf2E09lI7++JXfVyOd6JjtyVnnSl2GfrmsNGo26Kpkxa8xfPBh+6dn4L33i309XEk2+vmi3NO/D4nHDyKKplc9R2etkX67iQZln588UYqTrdnP7migVuVKQ1fBrRtKU52JKtNimPBfOnMN+64vijM5kpiKD5iinWhsieB4bBR0c0H1Ls23VAs+L7Uy2+Y7x7hbgCNp+hNx8fTGCnv3AO0qls58zlcVYo07NYrLf5R3FwTXOqPMhY2Gz9LosLBnO5f3iPTNCWZ9sb37Mr2pAtjjQNjPcgvsnZfY1z3o+iC3+Sl+54sh946Sy+xRMnMpROt3GA1d43fkBzc9ia7/xJZ67F0DdGG5rf2szXMASCJXWcgVZUxz74jA9KyoUTPnonJfUVrVkSk80IV+riiDqyxEosCW1cEFKXyTO+haLvUewXHXkAu2nqSWpIl9PVGjwnPxbfXwvoU2Txv1PN6bMg650hIhqfcIv+tlAIDQXCUe3gu4IG6sAS44DunNQ3hlVH0z9XLBqcTS9pC4C0ZC2f+DAYSdSRirz9hSD+MqFnz76GfywlUdV1koU9XhEEsrPAmNLihDzK3wBGEXHLpib/825IKdbURGjdEVnkCDC0Yk5gWTxhJsODDFyZTWhqqO/FL8TtjdKKXMqeC7e8D0zNAeMHkh1h5wUpTg84pfdSmac45cWrYTZnt8deROWMQohRgueKxmitwJG6u0RJ+XKatn1hfTz74kHGqQzp+OEqUQowUzW+tgwjyZmmlapYUCfpwofAx6hyc8RpJwaqaJPWBCIn4UDvqvsCOJefVNet1GgCTB5xX2vw1G/saPQghBCAlWWnoKVucxU6PELzttde0EKy19BKvzmEidfehMI5uaLoJVeMzkzr52Z5LLTY9BYcI8sa+HdxfgdHlCflZWR2fkIP8I3+QWfV4FvSHlEHZpdHWAb3Ij/whud2q82y74vMF1S5V1wlRB+rPEc+LhvdH75jO67cKe7VjurRl9vsOGdKfUoeNnSe/ulDrUrzDmbk5Ld0r1HlAGNcelYHQYBfx0Rg7jKoZLH0ODl8DIX/IR6NqAdPEs88Jm4b3ykA+LYpQpHEnMtnfY6g/h/AfEY63iZx+D4G3FeUZC1QpjOtM0MLtTEf1sdFhNnpHQ5/RQZS5G+Bn500MVJ3qYp4dEIH96aPO0Kbqn9d/trtaTBLvtMhA+PeRcy/kmN+4NBTNUWlwwxistzRfTZIaeek9LOn/afqCPr9+C7twm0p1SmZXeP7acuKcV8MOERBT4J7xzlL/dpWM+Rvy6FEJqdT6zpZaavxj5R4RPduu9B5TLxbif09rsVHae1P+FMe/qbBgoODaY+7Mlg7EEmx1LsNmxBJsdS7DZsQSbHUuw2bEEm51/AwAA//80Ls9u8dsl3AAAAABJRU5ErkJggg==",
	"expo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAAEJElEQVR4nOyaXyh7bxzHf/vNpsPFNGOyuNC2/KnVTNFIXGmRC6XcCTVxoyxJLjDhyq3InyhKmki7EGmG5EJywSG1lChm+bNsxunkd3Hq2zLPs2dn5+z8vo/zusPzfN7v16xz9nD+/eeXIQrjjiiMO6Iw7ojCuCMK444ojDuiMO6IwrgjCuNOUoLzCgoKMjMz/3x5e3vr8XgS3CFBqNXqo6Ojrwj29/fDXwJMkEgke3t7kbYMLpdLIpEI3ZFTurq6QLYMNptN6I7coVKpXl9f4cLBYFCj0QjdlCPm5ubgtgwLCwtCN+UCo9FI0zSKME3TxcXFQveNm62tLRRbhoODg7/76mWxWNBtGRoaGoRuzRaZTEaSZKzCJEkmJSX64xA3WK3WWG0ZOjs7he4eOwRB3N3dsRN+fHxMS0sT2iBGBgYG2NkyjIyMCG0QCxqN5u3tLR5hv9+fnZ0ttAcyExMT8dgyzMzMCO2Bhlar/fj4gJhcXV3pdLrCwkKPxwNZRtO0wWAQ2gaBtbU1uEZZWRmz0mQyfX5+Qhavr68LbRONiooK+BvVbreHrx8cHISvLy8vF84GAbfbDWl/cnIilUrD18tkstPTU8iW4+Nj4WyiUVtbC6lOUZTRaIzcZTAYQqEQZGNjY6MQNtGQSqUXFxeQ3mNjY6C9drsdspEkyW/vi/8FbW1t8NLJycmgvQRBXF5eQrZbrdbE2kRDLpff3NxAGldVVcEnmM1myLH54eEhJSUlUTYI9PT0QGxnZ2dRhkxOTkKG9Pf38++BhlKpfH5+BhW9v79HPAkolUqv1wua8/T0pFAo+LdBYHR0FPKbaW5uRh/V1NQEGTU+Ps6nBxoZGRmBQABUcXd3N9aBm5uboGmhUCg3N5cfD2SmpqZA/YLBoF6vj3Vgfn4+5LY8PT3Njwcaer2eoihQueHhYXZjIZ83KYrSarVceyCzuLgIanZ9fc36RiKXyyG35dXVVa490CgqKoLcOS0WSzzDa2pqQJO/vr5MJhN3HshsbGyACjkcjvjnOxwO0Hyn08mFQSyYzWZQm/f3d06upVlZWX6/H5RSWlrKhQcyTqcTVKW3t5erlO7ublCK2+3mKiU6JSUloB5nZ2ccnmxkMtn5+Tkoq7KykqugKCwvL4NKVFdXc5sFOVSsrKywGMjmoZbU1NQfv7+0tORyuVgMhHB4eDg/P//jjwiC4DYLiM1mi3y9vV4vT49qqNVqn88XmdjX18dH3A8oFIqXl5dv8S0tLfwltra2fosLBAIJfRSmvb09PH57e5vv/+vu7OyEJ3Z0dPAa9wNDQ0PM5cTn8+Xk5PAdl5eX9+eNDfnzGL/odLr6+nqVSpWYuPT09Lq6OhYnsF/Nr3vWUhTGHVEYd0Rh3BGFcUcUxh1RGHdEYdwRhXHn1wn/FwAA//8JfBIQ4EfVLwAAAABJRU5ErkJggg==",
	"fiftyone": "data:image/png;base64,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",
	"firecrawl": "data:image/png;base64,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",
	"clangd": "data:image/png;base64,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",
	"csharp": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAADZElEQVR4nOyZa0hTbRzA/0737sX33XTeNjcwyqzUCEIQS8sICzRLkiCCoEwEA6ElZPah+mTK+lSCBkEZGBmhYhmSljIvJWYfvNHUtbnNQG3ec3g8noqcyNrW6Xj2TPPx+X387/9cfuc557nN52R0L2wmBOvdgbWGCOMOEcYdIow7RBh3iDDuEGHcIcK4Q4RxhwjjDhHGHSKMO0QYd4gw7mw6YR/eJWPjZ4UiIQC0Nf7Lnhl/eB4AejsXp2f+d467ZHp8vrfLnz3HHoZh2jX/ccn04v3vYVmTUhIkAYD6J4P3bi2yZFb1RAJA0cWOjlaxc9wlA+8H8i8w7Dn2WGetZ/cbuWTyH+EVjp6JqK/8qO/nWdzQracpx+c12DUFILaZO/wUvjfc28d7xDAyY5lZCVLWeQAhl+bcFZ4cnZTKpLmFfjnp0/xquJNvNJnlTuHld8E2zvaUv6V8xb5PSy2aOm+7MCdbBJPWq/J+mqIVEYqS51I/yVc3a1sD3BWemPSvKDYAgHyrPPOaAlGvPAiCZan6EaPvGQaAhFTljj1cX631As06XHxj+QO+opYiqdBzoBE26gSqlCbrrDVQGZihcpxm/ioQLEs2TGb5g4KhnKKolHORjbVao47ro8y7u5OyUg7BwktjFosEVd/sQSYMAI0vvfYlT8QkBqgKAi6fnuJYSrHdxVQXFPRpAwgDQEOFLiYxdktUaGLy+K/r5G9peda8uOC48Rg2e2ouQCzc0Sr+oPk5yEmnZJo6C5cilQ8ZkzkUbTdYQH9aKlObaIqOjg1OSvNCXrn7oBf+bBLZtiJZ18NDZHPI63cTj5yHbVsRoUh4/moYANAU7YlW+OGpCwDbViTuSEjcIbaT49rjKWGjTlBV2gcA2TfDnJfZdYTTLJ2hYo5n7m5vGFXnTnCvurxEcODYWHBYCHvawROy8S//OMffVM8t0Oh35pyEE1KVS++nDGAVwgBwO29KXfEH4fTsKJdxQ/drrVa5qua4wEm45r42LWtXc43Z/pzdVmv0D4Rh/XeWw7euj3ms7twWKVqavR2H8d2LHpZGLRaxy3hLjUHi921okOfHyP9Oa4Oy6a5piTDuEGHcIcK4Q4RxhwjjDhHGHSKMO0QYd4gw7hBh3CHCuEOEcYcI4w4Rxp0fAQAA///C8wPQSo1WhwAAAABJRU5ErkJggg==",
	"gopls": "data:image/png;base64,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",
	"jdtls": "data:image/png;base64,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",
	"kotlin": "data:image/png;base64,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",
	"lua": "data:image/png;base64,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",
	"php": "data:image/png;base64,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",
	"ruby": "data:image/png;base64,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",
	"rust": "data:image/png;base64,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",
	"swift": "data:image/png;base64,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",
	"vercel": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjMDAwMDAwIi8+PHBhdGggZD0iTTEyIDRMMjEgMTlIM0wxMiA0WiIgZmlsbD0iI2ZmZmZmZiIvPjwvc3ZnPg==",
	"zapier": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZmY0ZjAwIi8+PHBhdGggZD0iTTEyIDQuNXYxNU00LjUgMTJoMTVNNi43IDYuN2wxMC42IDEwLjZNNi43IDE3LjNMMTcuMyA2LjciIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLXdpZHRoPSIyLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==",
	"zoom": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjMmQ4Y2ZmIi8+PHBhdGggZD0iTTUgOC41YTEuNSAxLjUgMCAwIDEgMS41LTEuNWg2QTEuNSAxLjUgMCAwIDEgMTQgOC41djdhMS41IDEuNSAwIDAgMS0xLjUgMS41aC02QTEuNSAxLjUgMCAwIDEgNSAxNS41di03eiIgZmlsbD0iI2ZmZmZmZiIvPjxwYXRoIGQ9Ik0xNSAxMC41bDQtMi41djhsLTQtMi41di0zeiIgZmlsbD0iI2ZmZmZmZiIvPjwvc3ZnPg==",
	"wordpress": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjMjE3NTliIi8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iOCIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjEuNCIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik01LjUgMTJhNi41IDYuNSAwIDAgMCAxMC41IDVsLTIuOC04LjItMiA2LjEtMS42LTQuNS0yLjIgNi4zQTYuNDUgNi40NSAwIDAgMCA1LjUgMTJ6bTcuMiA2LjRhNi40NSA2LjQ1IDAgMCAwIDUuNC00LjVsLTEuOS01LjUtMy41IDEweiIgZmlsbD0iI2ZmZmZmZiIvPjwvc3ZnPg==",
	"wix": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjMTExODI3Ii8+PHRleHQgeD0iMTIiIHk9IjE1IiBmb250LWZhbWlseT0iQXJpYWwsIEhlbHZldGljYSwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSI4IiBmb250LXdlaWdodD0iOTAwIiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5XSVg8L3RleHQ+PC9zdmc+",
	"windsor": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjMGYxNzJhIi8+PHRleHQgeD0iMTIiIHk9IjE2IiBmb250LWZhbWlseT0iQXJpYWwsIEhlbHZldGljYSwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMCIgZm9udC13ZWlnaHQ9IjkwMCIgZmlsbD0iI2ZmZmZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+Vy48L3RleHQ+PC9zdmc+",
	"vibe": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjMDY0ZTNiIi8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iNiIgZmlsbD0iIzEwYjk4MSIvPjwvc3ZnPg==",
	"vsql": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjNTgxYzg3Ii8+PHBhdGggZD0iTTYgNmwxMiA2LTYgNi02LTEyeiIgZmlsbD0iI2MwODRmYyIvPjwvc3ZnPg==",
	"vanta": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjNmQyOGQ5Ii8+PHBhdGggZD0iTTcgNmgzdjhsMy0zIDMgM3Y0aC0zbC02LTZWNnoiIGZpbGw9IiNmZmZmZmYiLz48L3N2Zz4=",
	"zilliz": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9IiNlMmU4ZjAiLz48cGF0aCBkPSJNMTIgNHYxNk00IDEyaDE2TTYuMzQgNi4zNGwxMS4zMiAxMS4zMk02LjM0IDE3LjY2TDE3LjY2IDYuMzQiIHN0cm9rZT0iIzQzMzhjYSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4=",
	"zscaler": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjMDI4NGM3Ii8+PHBhdGggZD0iTTYgMTQuNWEzLjUgMy41IDAgMCAxIDctMSAzIDMgMCAwIDEgNCAzIDMgMyAwIDAgMS0zIDNINmEzLjUgMy41IDAgMCAxIDAtN3oiIGZpbGw9IiNmZmZmZmYiLz48L3N2Zz4=",
	"langfuse": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9IiNlMmU4ZjAiLz48Y2lyY2xlIGN4PSI5IiBjeT0iMTIiIHI9IjMuNSIgc3Ryb2tlPSIjZWY0NDQ0IiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjE1IiBjeT0iMTIiIHI9IjMuNSIgc3Ryb2tlPSIjM2I4MmY2IiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIvPjwvc3ZnPg==",
	"zyte": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9IiNlMmU4ZjAiLz48cGF0aCBkPSJNNiA3aDEybC04IDEwaDgiIHN0cm9rZT0iI2JlMTg1ZCIgc3Ryb2tlLXdpZHRoPSIyLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgZmlsbD0ibm9uZSIvPjwvc3ZnPg==",
	"youdotcom": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjNGY0NmU1Ii8+PHBhdGggZD0iTTEyIDVsMiA1IDUgMi01IDItMiA1LTItNS01LTIgNS0yIDItNXoiIGZpbGw9IiNmZmZmZmYiLz48L3N2Zz4=",
	"ui5": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjMDA3MGYyIi8+PHRleHQgeD0iMTIiIHk9IjE1IiBmb250LWZhbWlseT0iQXJpYWwsIEhlbHZldGljYSwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSI3IiBmb250LXdlaWdodD0iOTAwIiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5TQVA8L3RleHQ+PC9zdmc+",
	"gopls": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjMDBBREQ4Ii8+PHBhdGggZD0iTTQuNSAxMi41YzAtMi4yIDEuOC00IDQtNCAxLjUgMCAyLjguOCAzLjUgMmgtMmMtLjQtLjYtMS0uOS0xLjUtLjktMS4xIDAtMiAuOS0yIDJzLjkgMiAyIDJjLjYgMCAxLjItLjQgMS41LTFIOC41VjExaDQuNXYzLjVoLTEuMnYtLjhjLS44LjgtMiAxLjMtMy4zIDEuMy0yLjIgMC00LTEuOC00LTQuNXptMTEgMmMtMS40IDAtMi41LTEuMS0yLjUtMi41czEuMS0yLjUgMi41LTIuNSAyLjUgMS4xIDIuNSAyLjUtMS4xIDIuNS0yLjUgMi41em0wLTEuMmMuNyAwIDEuMy0uNiAxLjMtMS4zcy0uNi0xLjMtMS4zLTEuMy0xLjMuNi0xLjMgMS4zLjYgMS4zIDEuMyAxLjN6IiBmaWxsPSIjZmZmZmZmIi8+PC9zdmc+",
	"frontend": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjNjM2NmYxIi8+PHJlY3QgeD0iNCIgeT0iNCIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjEuOCIvPjxsaW5lIHgxPSI0IiB5MT0iOSIgeDI9IjIwIiB5Mj0iOSIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjEuOCIvPjxsaW5lIHgxPSI5IiB5MT0iOSIgeDI9IjkiIHkyPSIyMCIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjEuOCIvPjxjaXJjbGUgY3g9IjYuNSIgY3k9IjYuNSIgcj0iMSIgZmlsbD0iI2ZmZmZmZiIvPjxjaXJjbGUgY3g9IjkuNSIgY3k9IjYuNSIgcj0iMSIgZmlsbD0iI2ZmZmZmZiIvPjwvc3ZnPg==",
};

	function getGithubAvatarUrl(plugin) {
		if (!plugin) return null;
		const name = (plugin.name || "").toLowerCase();
		const author = (typeof plugin.author === "string" ? plugin.author : (plugin.author && plugin.author.name) || "").trim().toLowerCase();

		// 1. Direct local brand mapping by plugin name or author key (Instant 0ms)
		for (const [k, url] of Object.entries(BRAND_ICONS)) {
			if (name.includes(k) || author.includes(k)) return url;
		}

		let rawUrl = null;

		// 2. From source.url (Git repos, excluding mirror mono-repos like anthropics/claude-plugins-...)
		if (plugin.source && typeof plugin.source === "object" && typeof plugin.source.url === "string") {
			const m = plugin.source.url.match(/github\.com\/([^/]+)/i);
			if (m && m[1] && !m[1].toLowerCase().includes("anthropics")) {
				rawUrl = `https://github.com/${m[1]}.png?size=80`;
			}
		}

		// 3. From homepage (excluding mirror mono-repos)
		if (!rawUrl && typeof plugin.homepage === "string") {
			const m = plugin.homepage.match(/github\.com\/([^/]+)/i);
			if (m && m[1] && !m[1].toLowerCase().includes("anthropics")) {
				rawUrl = `https://github.com/${m[1]}.png?size=80`;
			}
		}

		// 4. Default author handle
		if (!rawUrl && author && /^[a-z0-9_-]+$/i.test(author) && author !== "anthropic") {
			rawUrl = `https://github.com/${author}.png?size=80`;
		}

		if (rawUrl) {
			return `/universal-plugin-hub/api/icon?u=${encodeURIComponent(rawUrl)}`;
		}

		return null;
	}

	function AnthropicIcon({ isDark }) {
		return h("div", {
			className: "cpm-card-icon",
			style: {
				background: isDark ? "#18181b" : "#f4f1ea",
				border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)",
			},
		},
			h("svg", {
				width: 22,
				height: 22,
				viewBox: "0 0 24 24",
				fill: isDark ? "#ffffff" : "#18181b",
			},
				h("path", { d: "M11.98 5.95H8.33L3.63 18.07h3.69l.97-2.58h3.72l.97 2.58h3.69L11.98 5.95zm-2.82 7.15 1-2.66 1 2.66h-2z" }),
				h("path", { d: "M16.68 5.95h-3.69l4.7 12.12h3.69L16.68 5.95z" }),
			)
		);
	}

	function Context7Icon({ isDark }) {
		return h("div", {
			className: "cpm-card-icon",
			style: {
				background: isDark ? "#09090b" : "#000000",
				border: isDark ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(0, 0, 0, 0.1)",
			},
		},
			h("svg", { width: 22, height: 22, viewBox: "0 0 24 24", fill: "#ffffff" },
				h("path", { d: "M6 5h4v2H8v3l2.5 2L8 14v3h2v2H6V5z" }),
				h("path", { d: "M18 5h-4v2h2v3l-2.5 2 2.5 2v3h-2v2h4V5z" }),
				h("path", { d: "M11.25 11h1.5v2h-1.5z" }),
			)
		);
	}

	// ────────────────────────────── Official Lucide Vector Library (64 Multi-Domain Themes) ──────────────────────────────
	const LUCIDE_BADGES = [
		// 0. Terminal (Emerald / Code & CLI)
		{
			color: "#10b981",
			bgLight: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
			borderLight: "#a7f3d0",
			bgDark: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)",
			borderDark: "#047857",
			render: () => [
				h("polyline", { key: "p", points: "4 17 10 11 4 5", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("line", { key: "l", x1: 12, y1: 19, x2: 20, y2: 19, stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 1. Code (Cyan / Software & Syntax)
		{
			color: "#06b6d4",
			bgLight: "linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)",
			borderLight: "#a5f3fc",
			bgDark: "linear-gradient(135deg, #164e63 0%, #0d313f 100%)",
			borderDark: "#155e75",
			render: () => [
				h("polyline", { key: "p1", points: "16 18 22 12 16 6", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("polyline", { key: "p2", points: "8 6 2 12 8 18", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 2. Video (Red / Video & Cinema)
		{
			color: "#ef4444",
			bgLight: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
			borderLight: "#fecaca",
			bgDark: "linear-gradient(135deg, #450a0a 0%, #2b0606 100%)",
			borderDark: "#991b1b",
			render: () => [
				h("rect", { key: "r", x: "2", y: "6", width: "14", height: "12", rx: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("polygon", { key: "p", points: "22 8 16 12 22 16 22 8", stroke: "currentColor", strokeWidth: 2, fill: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 3. Film (Rose / Motion & Reels)
		{
			color: "#f43f5e",
			bgLight: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)",
			borderLight: "#fecdd3",
			bgDark: "linear-gradient(135deg, #4c0519 0%, #2e030f 100%)",
			borderDark: "#9f1239",
			render: () => [
				h("rect", { key: "r", x: "3", y: "3", width: "18", height: "18", rx: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("line", { key: "l1", x1: "7", y1: "3", x2: "7", y2: "21", stroke: "currentColor", strokeWidth: 2 }),
				h("line", { key: "l2", x1: "17", y1: "3", x2: "17", y2: "21", stroke: "currentColor", strokeWidth: 2 }),
				h("line", { key: "l3", x1: "3", y1: "12", x2: "21", y2: "12", stroke: "currentColor", strokeWidth: 2 }),
			],
		},
		// 4. Scissors (Pink / Video Cut & Editing)
		{
			color: "#ec4899",
			bgLight: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)",
			borderLight: "#fbcfe8",
			bgDark: "linear-gradient(135deg, #831843 0%, #500724 100%)",
			borderDark: "#be185d",
			render: () => [
				h("circle", { key: "c1", cx: "6", cy: "6", r: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("circle", { key: "c2", cx: "6", cy: "18", r: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("line", { key: "l1", x1: "20", y1: "4", x2: "8.12", y2: "15.88", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
				h("line", { key: "l2", x1: "14.47", y1: "14.48", x2: "20", y2: "20", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
				h("line", { key: "l3", x1: "8.12", y1: "8.12", x2: "12", y2: "12", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 5. Wand (Fuchsia / Magic & VFX)
		{
			color: "#d946ef",
			bgLight: "linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)",
			borderLight: "#f5d0fe",
			bgDark: "linear-gradient(135deg, #4a044e 0%, #2e0231 100%)",
			borderDark: "#701a75",
			render: () => [
				h("path", { key: "p1", d: "M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M12.2 6.2 11 5", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
				h("path", { key: "p2", d: "M7 2a5 5 0 0 0-5 5c0 2 1.5 3.5 3 5l12 12a1.4 1.4 0 0 0 2 0l2-2a1.4 1.4 0 0 0 0-2L9 8c-1.5-1.5-2-3-2-6Z", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
			],
		},
		// 6. Play (Orange / Action & Streaming)
		{
			color: "#f97316",
			bgLight: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
			borderLight: "#fed7aa",
			bgDark: "linear-gradient(135deg, #431407 0%, #270b04 100%)",
			borderDark: "#c2410c",
			render: () => [
				h("polygon", { key: "p", points: "6 4 20 12 6 20 6 4", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 7. Mic (Violet / Voice & Speech)
		{
			color: "#8b5cf6",
			bgLight: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
			borderLight: "#ddd6fe",
			bgDark: "linear-gradient(135deg, #2e1065 0%, #1c0a3d 100%)",
			borderDark: "#4c1d95",
			render: () => [
				h("rect", { key: "r", x: "9", y: "2", width: "6", height: "12", rx: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p1", d: "M5 10v2a7 7 0 0 0 14 0v-2", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("line", { key: "l1", x1: "12", y1: "19", x2: "12", y2: "22", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 8. Headphones (Indigo / Audio & Music)
		{
			color: "#6366f1",
			bgLight: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
			borderLight: "#c7d2fe",
			bgDark: "linear-gradient(135deg, #1e1b4b 0%, #131131 100%)",
			borderDark: "#3730a3",
			render: () => [
				h("path", { key: "p", d: "M3 18v-6a9 9 0 0 1 18 0v6", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("rect", { key: "r1", x: "17", y: "14", width: "4", height: "7", rx: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("rect", { key: "r2", x: "3", y: "14", width: "4", height: "7", rx: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
			],
		},
		// 9. Music (Purple / Melodies & Audio Tracks)
		{
			color: "#a855f7",
			bgLight: "linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)",
			borderLight: "#e9d5ff",
			bgDark: "linear-gradient(135deg, #3b0764 0%, #240340 100%)",
			borderDark: "#6b21a8",
			render: () => [
				h("path", { key: "p", d: "M9 18V5l12-2v13", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("circle", { key: "c1", cx: "6", cy: "18", r: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("circle", { key: "c2", cx: "18", cy: "16", r: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
			],
		},
		// 10. Volume (Blue / Sound Synthesizer)
		{
			color: "#3b82f6",
			bgLight: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
			borderLight: "#bfdbfe",
			bgDark: "linear-gradient(135deg, #1e3a8a 0%, #112240 100%)",
			borderDark: "#1d4ed8",
			render: () => [
				h("polygon", { key: "p", points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "w1", d: "M15.54 8.46a5 5 0 0 1 0 7.07", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("path", { key: "w2", d: "M19.07 4.93a10 10 0 0 1 0 14.14", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
			],
		},
		// 11. Bug (Red / Debugger & Troubleshooting)
		{
			color: "#ef4444",
			bgLight: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
			borderLight: "#fecaca",
			bgDark: "linear-gradient(135deg, #450a0a 0%, #2b0606 100%)",
			borderDark: "#991b1b",
			render: () => [
				h("rect", { key: "r", width: "8", height: "14", x: "8", y: "6", rx: "4", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p", d: "m19 7-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M20 13h-4M4 13h4M10 4l1 2M14 4l-1 2", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 12. GitBranch (Amber / Branching & Flow)
		{
			color: "#f59e0b",
			bgLight: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
			borderLight: "#fde68a",
			bgDark: "linear-gradient(135deg, #451a03 0%, #291002 100%)",
			borderDark: "#78350f",
			render: () => [
				h("line", { key: "l", x1: "6", x2: "6", y1: "3", y2: "15", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
				h("circle", { key: "c1", cx: "18", cy: "6", r: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("circle", { key: "c2", cx: "6", cy: "18", r: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p", d: "M18 9a9 9 0 0 1-9 9", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
			],
		},
		// 13. GitPullRequest (Rose / PRs & Review)
		{
			color: "#e11d48",
			bgLight: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)",
			borderLight: "#fecdd3",
			bgDark: "linear-gradient(135deg, #4c0519 0%, #2e030f 100%)",
			borderDark: "#881337",
			render: () => [
				h("circle", { key: "c1", cx: "18", cy: "18", r: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("circle", { key: "c2", cx: "6", cy: "6", r: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p", d: "M13 6h3a2 2 0 0 1 2 2v7", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("line", { key: "l", x1: "6", x2: "6", y1: "9", y2: "21", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 14. Cpu (Indigo / Processor & Architecture)
		{
			color: "#6366f1",
			bgLight: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
			borderLight: "#c7d2fe",
			bgDark: "linear-gradient(135deg, #1e1b4b 0%, #131131 100%)",
			borderDark: "#3730a3",
			render: () => [
				h("rect", { key: "r1", width: "16", height: "16", x: "4", y: "4", rx: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("rect", { key: "r2", width: "6", height: "6", x: "9", y: "9", rx: "1", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p", d: "M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 15. Braces (Teal / AST, JSON & Linters)
		{
			color: "#14b8a6",
			bgLight: "linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)",
			borderLight: "#99f6e4",
			bgDark: "linear-gradient(135deg, #134e4a 0%, #0c3330 100%)",
			borderDark: "#0f766e",
			render: () => [
				h("path", { key: "p1", d: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("path", { key: "p2", d: "M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
			],
		},
		// 16. Database (Cyan / SQL, Tables & Storage)
		{
			color: "#06b6d4",
			bgLight: "linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)",
			borderLight: "#a5f3fc",
			bgDark: "linear-gradient(135deg, #164e63 0%, #0d313f 100%)",
			borderDark: "#155e75",
			render: () => [
				h("ellipse", { key: "e", cx: "12", cy: "5", rx: "9", ry: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p1", d: "M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p2", d: "M3 12c0 1.66 4 3 9 3s9-1.34 9-3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
			],
		},
		// 17. Server (Sky Blue / Cloud Backend & Node)
		{
			color: "#0284c7",
			bgLight: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
			borderLight: "#bae6fd",
			bgDark: "linear-gradient(135deg, #0c4a6e 0%, #082f46 100%)",
			borderDark: "#0369a1",
			render: () => [
				h("rect", { key: "r1", width: "20", height: "8", x: "2", y: "2", rx: "2", ry: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("rect", { key: "r2", width: "20", height: "8", x: "2", y: "14", rx: "2", ry: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("line", { key: "l1", x1: "6", x2: "6.01", y1: "6", y2: "6", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
				h("line", { key: "l2", x1: "6", x2: "6.01", y1: "18", y2: "18", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 18. Container (Sky / Docker & Microservices)
		{
			color: "#0ea5e9",
			bgLight: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
			borderLight: "#bae6fd",
			bgDark: "linear-gradient(135deg, #075985 0%, #032b42 100%)",
			borderDark: "#0284c7",
			render: () => [
				h("path", { key: "p1", d: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "p2", d: "m3.3 7 8.7 5 8.7-5M12 22V12", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 19. Brain (Violet / Neural & AI Models)
		{
			color: "#8b5cf6",
			bgLight: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
			borderLight: "#ddd6fe",
			bgDark: "linear-gradient(135deg, #2e1065 0%, #1c0a3d 100%)",
			borderDark: "#4c1d95",
			render: () => [
				h("path", { key: "p1", d: "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("path", { key: "p2", d: "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("path", { key: "p3", d: "M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
			],
		},
		// 20. Bot (Emerald / Autonomous Agents)
		{
			color: "#10b981",
			bgLight: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
			borderLight: "#a7f3d0",
			bgDark: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)",
			borderDark: "#047857",
			render: () => [
				h("path", { key: "p1", d: "M12 8V4H8", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("rect", { key: "r", width: "16", height: "12", x: "4", y: "8", rx: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p2", d: "M2 14h2M20 14h2M15 13v2M9 13v2", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 21. Sparkles (Amber / Generation & Prompts)
		{
			color: "#f59e0b",
			bgLight: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
			borderLight: "#fde68a",
			bgDark: "linear-gradient(135deg, #451a03 0%, #291002 100%)",
			borderDark: "#78350f",
			render: () => [
				h("path", { key: "s1", d: "m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "s2", d: "M5 3v4M3 5h4M19 17v4M17 19h4", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 22. ScanFace (Cyan / Vision, CV & OCR)
		{
			color: "#06b6d4",
			bgLight: "linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)",
			borderLight: "#a5f3fc",
			bgDark: "linear-gradient(135deg, #164e63 0%, #0d313f 100%)",
			borderDark: "#155e75",
			render: () => [
				h("path", { key: "p1", d: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
				h("circle", { key: "c1", cx: "9", cy: "10", r: "1", fill: "currentColor" }),
				h("circle", { key: "c2", cx: "15", cy: "10", r: "1", fill: "currentColor" }),
				h("path", { key: "p2", d: "M10 15a3 3 0 0 0 4 0", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
			],
		},
		// 23. Activity (Emerald / Monitoring & Metrics)
		{
			color: "#10b981",
			bgLight: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
			borderLight: "#a7f3d0",
			bgDark: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)",
			borderDark: "#047857",
			render: () => [
				h("path", { key: "a", d: "M22 12h-4l-3 9L9 3l-3 9H2", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 24. PenTool (Purple / Copywriting & Content Creation)
		{
			color: "#a855f7",
			bgLight: "linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)",
			borderLight: "#e9d5ff",
			bgDark: "linear-gradient(135deg, #3b0764 0%, #240340 100%)",
			borderDark: "#6b21a8",
			render: () => [
				h("path", { key: "p1", d: "m12 19 7-7 3 3-7 7-3-3z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "p2", d: "m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("circle", { key: "c", cx: "11", cy: "11", r: "2", fill: "currentColor" }),
			],
		},
		// 25. FileText (Blue / Specs, Summaries & Docs)
		{
			color: "#3b82f6",
			bgLight: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
			borderLight: "#bfdbfe",
			bgDark: "linear-gradient(135deg, #1e3a8a 0%, #112240 100%)",
			borderDark: "#1d4ed8",
			render: () => [
				h("path", { key: "p1", d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "p2", d: "M14 2v4a2 2 0 0 0 2 2h4", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "p3", d: "M10 9H8M16 13H8M16 17H8", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 26. BookOpen (Indigo / Knowledge Base & Wiki)
		{
			color: "#6366f1",
			bgLight: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
			borderLight: "#c7d2fe",
			bgDark: "linear-gradient(135deg, #1e1b4b 0%, #131131 100%)",
			borderDark: "#3730a3",
			render: () => [
				h("path", { key: "p1", d: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "p2", d: "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 27. Feather (Pink / Stories & Essays)
		{
			color: "#ec4899",
			bgLight: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)",
			borderLight: "#fbcfe8",
			bgDark: "linear-gradient(135deg, #831843 0%, #500724 100%)",
			borderDark: "#be185d",
			render: () => [
				h("path", { key: "p", d: "M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("line", { key: "l1", x1: "16", y1: "8", x2: "2", y2: "22", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
				h("line", { key: "l2", x1: "17.5", y1: "15", x2: "9", y2: "15", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 28. Type (Fuchsia / Headlines & Typography)
		{
			color: "#d946ef",
			bgLight: "linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)",
			borderLight: "#f5d0fe",
			bgDark: "linear-gradient(135deg, #4a044e 0%, #2e0231 100%)",
			borderDark: "#701a75",
			render: () => [
				h("polyline", { key: "p", points: "4 7 4 4 20 4 20 7", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("line", { key: "l1", x1: "9", y1: "20", x2: "15", y2: "20", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
				h("line", { key: "l2", x1: "12", y1: "4", x2: "12", y2: "20", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 29. Newspaper (Sky Blue / Feeds & RSS)
		{
			color: "#0284c7",
			bgLight: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
			borderLight: "#bae6fd",
			bgDark: "linear-gradient(135deg, #0c4a6e 0%, #082f46 100%)",
			borderDark: "#0369a1",
			render: () => [
				h("path", { key: "p1", d: "M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "p2", d: "M18 14h-8M15 18h-5M10 6h8v4h-8V6Z", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 30. Share (Emerald / Social Distribution)
		{
			color: "#10b981",
			bgLight: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
			borderLight: "#a7f3d0",
			bgDark: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)",
			borderDark: "#047857",
			render: () => [
				h("circle", { key: "c1", cx: "18", cy: "5", r: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("circle", { key: "c2", cx: "6", cy: "12", r: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("circle", { key: "c3", cx: "18", cy: "19", r: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("line", { key: "l1", x1: "8.59", x2: "15.42", y1: "13.51", y2: "17.49", stroke: "currentColor", strokeWidth: 2 }),
				h("line", { key: "l2", x1: "15.41", x2: "8.59", y1: "6.51", y2: "10.49", stroke: "currentColor", strokeWidth: 2 }),
			],
		},
		// 31. Palette (Rose / Art & Graphic Design)
		{
			color: "#f43f5e",
			bgLight: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)",
			borderLight: "#fecdd3",
			bgDark: "linear-gradient(135deg, #4c0519 0%, #2e030f 100%)",
			borderDark: "#9f1239",
			render: () => [
				h("circle", { key: "c1", cx: "13.5", cy: "6.5", r: "1", fill: "currentColor" }),
				h("circle", { key: "c2", cx: "17.5", cy: "10.5", r: "1", fill: "currentColor" }),
				h("circle", { key: "c3", cx: "8.5", cy: "7.5", r: "1", fill: "currentColor" }),
				h("circle", { key: "c4", cx: "6.5", cy: "12.5", r: "1", fill: "currentColor" }),
				h("path", { key: "p", d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.6 1.6 0 0 1 1.7-1.7h2c3 0 5.5-2.5 5.5-5.5C21.9 6 17.5 2 12 2z", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
			],
		},
		// 32. Layout (Sky / Dashboard & Wireframes)
		{
			color: "#0ea5e9",
			bgLight: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
			borderLight: "#bae6fd",
			bgDark: "linear-gradient(135deg, #075985 0%, #032b42 100%)",
			borderDark: "#0284c7",
			render: () => [
				h("rect", { key: "r", width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("line", { key: "l1", x1: "3", y1: "9", x2: "21", y2: "9", stroke: "currentColor", strokeWidth: 2 }),
				h("line", { key: "l2", x1: "9", y1: "21", x2: "9", y2: "9", stroke: "currentColor", strokeWidth: 2 }),
			],
		},
		// 33. Image (Purple / Photos & Midjourney)
		{
			color: "#a855f7",
			bgLight: "linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)",
			borderLight: "#e9d5ff",
			bgDark: "linear-gradient(135deg, #3b0764 0%, #240340 100%)",
			borderDark: "#6b21a8",
			render: () => [
				h("rect", { key: "r", width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("circle", { key: "c", cx: "9", cy: "9", r: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p", d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 34. Eye (Cyan / Visual Inspector & A11y)
		{
			color: "#06b6d4",
			bgLight: "linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)",
			borderLight: "#a5f3fc",
			bgDark: "linear-gradient(135deg, #164e63 0%, #0d313f 100%)",
			borderDark: "#155e75",
			render: () => [
				h("path", { key: "p", d: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("circle", { key: "c", cx: "12", cy: "12", r: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
			],
		},
		// 35. Layers (Teal / Architecture & Stacks)
		{
			color: "#14b8a6",
			bgLight: "linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)",
			borderLight: "#99f6e4",
			bgDark: "linear-gradient(135deg, #134e4a 0%, #0c3330 100%)",
			borderDark: "#0f766e",
			render: () => [
				h("path", { key: "l1", d: "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "l2", d: "m2 12 8.58 3.91a2 2 0 0 0 1.66 0L22 12", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "l3", d: "m2 17 8.58 3.91a2 2 0 0 0 1.66 0L22 17", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 36. Compass (Lime / Discovery & Navigation)
		{
			color: "#84cc16",
			bgLight: "linear-gradient(135deg, #f7fee7 0%, #ecfccb 100%)",
			borderLight: "#d9f99d",
			bgDark: "linear-gradient(135deg, #365314 0%, #20310c 100%)",
			borderDark: "#4d7c0f",
			render: () => [
				h("circle", { key: "c", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("polygon", { key: "p", points: "16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
			],
		},
		// 37. Search (Blue / RAG & Query Retrieval)
		{
			color: "#3b82f6",
			bgLight: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
			borderLight: "#bfdbfe",
			bgDark: "linear-gradient(135deg, #1e3a8a 0%, #112240 100%)",
			borderDark: "#1d4ed8",
			render: () => [
				h("circle", { key: "c", cx: "11", cy: "11", r: "8", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("line", { key: "l", x1: "21", y1: "21", x2: "16.65", y2: "16.65", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 38. Globe (Sky / Internet & Web Crawling)
		{
			color: "#0284c7",
			bgLight: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
			borderLight: "#bae6fd",
			bgDark: "linear-gradient(135deg, #0c4a6e 0%, #082f46 100%)",
			borderDark: "#0369a1",
			render: () => [
				h("circle", { key: "g1", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("line", { key: "g2", x1: "2", x2: "22", y1: "12", y2: "12", stroke: "currentColor", strokeWidth: 2 }),
				h("path", { key: "g3", d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
			],
		},
		// 39. Link (Teal / Bridge & Connectors)
		{
			color: "#14b8a6",
			bgLight: "linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)",
			borderLight: "#99f6e4",
			bgDark: "linear-gradient(135deg, #134e4a 0%, #0c3330 100%)",
			borderDark: "#0f766e",
			render: () => [
				h("path", { key: "p1", d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("path", { key: "p2", d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
			],
		},
		// 40. Anchor (Cyan / Hooks & Interceptors)
		{
			color: "#06b6d4",
			bgLight: "linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)",
			borderLight: "#a5f3fc",
			bgDark: "linear-gradient(135deg, #164e63 0%, #0d313f 100%)",
			borderDark: "#155e75",
			render: () => [
				h("circle", { key: "c", cx: "12", cy: "5", r: "3", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("line", { key: "l", x1: "12", x2: "12", y1: "22", y2: "8", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
				h("path", { key: "p", d: "M5 12H2a10 10 0 0 0 20 0h-3", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
			],
		},
		// 41. ShieldCheck (Emerald / Verified Protection)
		{
			color: "#10b981",
			bgLight: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
			borderLight: "#a7f3d0",
			bgDark: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)",
			borderDark: "#047857",
			render: () => [
				h("path", { key: "s", d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "c", d: "m9 12 2 2 4-4", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 42. ShieldAlert (Red / Risk Control & Security Auditing)
		{
			color: "#ef4444",
			bgLight: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
			borderLight: "#fecaca",
			bgDark: "linear-gradient(135deg, #450a0a 0%, #2b0606 100%)",
			borderDark: "#991b1b",
			render: () => [
				h("path", { key: "s", d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("line", { key: "l1", x1: "12", y1: "8", x2: "12", y2: "12", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
				h("line", { key: "l2", x1: "12", y1: "16", x2: "12.01", y2: "16", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 43. Lock (Amber / Privacy & Encryption)
		{
			color: "#f59e0b",
			bgLight: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
			borderLight: "#fde68a",
			bgDark: "linear-gradient(135deg, #451a03 0%, #291002 100%)",
			borderDark: "#78350f",
			render: () => [
				h("rect", { key: "r", width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p", d: "M7 11V7a5 5 0 0 1 10 0v4", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
			],
		},
		// 44. Key (Amber / OAuth Keys & Auth)
		{
			color: "#f59e0b",
			bgLight: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
			borderLight: "#fde68a",
			bgDark: "linear-gradient(135deg, #451a03 0%, #291002 100%)",
			borderDark: "#78350f",
			render: () => [
				h("circle", { key: "c", cx: "7.5", cy: "15.5", r: "5.5", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p", d: "m21 2-2 2m-1.5 1.5L19 7l-3 3-2-2-3 3", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 45. CreditCard (Indigo / Payments & Billing)
		{
			color: "#6366f1",
			bgLight: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
			borderLight: "#c7d2fe",
			bgDark: "linear-gradient(135deg, #1e1b4b 0%, #131131 100%)",
			borderDark: "#3730a3",
			render: () => [
				h("rect", { key: "r", width: "20", height: "14", x: "2", y: "5", rx: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("line", { key: "l", x1: "2", x2: "22", y1: "10", y2: "10", stroke: "currentColor", strokeWidth: 2 }),
			],
		},
		// 46. Coins (Yellow / Finance & Commercial)
		{
			color: "#eab308",
			bgLight: "linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)",
			borderLight: "#fef08a",
			bgDark: "linear-gradient(135deg, #422006 0%, #271304 100%)",
			borderDark: "#854d0e",
			render: () => [
				h("circle", { key: "c1", cx: "8", cy: "8", r: "6", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p1", d: "M18.09 10.37A6 6 0 1 1 10.34 18", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p2", d: "M7 6h1v4M17 14h.01", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 47. ShoppingCart (Orange / E-Commerce & Stores)
		{
			color: "#f97316",
			bgLight: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
			borderLight: "#fed7aa",
			bgDark: "linear-gradient(135deg, #431407 0%, #270b04 100%)",
			borderDark: "#c2410c",
			render: () => [
				h("circle", { key: "c1", cx: "8", cy: "21", r: "1", fill: "currentColor" }),
				h("circle", { key: "c2", cx: "19", cy: "21", r: "1", fill: "currentColor" }),
				h("path", { key: "p", d: "M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 48. TrendingUp (Emerald / Growth & Performance Benchmark)
		{
			color: "#10b981",
			bgLight: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
			borderLight: "#a7f3d0",
			bgDark: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)",
			borderDark: "#047857",
			render: () => [
				h("polyline", { key: "p1", points: "22 7 13.5 15.5 8.5 10.5 2 17", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("polyline", { key: "p2", points: "16 7 22 7 22 13", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 49. PieChart (Violet / Data Analytics & BI)
		{
			color: "#8b5cf6",
			bgLight: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
			borderLight: "#ddd6fe",
			bgDark: "linear-gradient(135deg, #2e1065 0%, #1c0a3d 100%)",
			borderDark: "#4c1d95",
			render: () => [
				h("path", { key: "p1", d: "M21.21 15.89A10 10 0 1 1 8 2.83", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p2", d: "M22 12A10 10 0 0 0 12 2v10z", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
			],
		},
		// 50. MessageSquare (Blue / Chat & Messaging)
		{
			color: "#3b82f6",
			bgLight: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
			borderLight: "#bfdbfe",
			bgDark: "linear-gradient(135deg, #1e3a8a 0%, #112240 100%)",
			borderDark: "#1d4ed8",
			render: () => [
				h("path", { key: "m", d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 51. MessagesSquare (Pink / Chatrooms & Group Discussions)
		{
			color: "#ec4899",
			bgLight: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)",
			borderLight: "#fbcfe8",
			bgDark: "linear-gradient(135deg, #831843 0%, #500724 100%)",
			borderDark: "#be185d",
			render: () => [
				h("path", { key: "p1", d: "M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v5Z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "p2", d: "M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 52. Mail (Sky / Email Newsletters)
		{
			color: "#0284c7",
			bgLight: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
			borderLight: "#bae6fd",
			bgDark: "linear-gradient(135deg, #0c4a6e 0%, #082f46 100%)",
			borderDark: "#0369a1",
			render: () => [
				h("rect", { key: "r", width: "20", height: "16", x: "2", y: "4", rx: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p", d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 53. Users (Indigo / Community & Team Members)
		{
			color: "#6366f1",
			bgLight: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
			borderLight: "#c7d2fe",
			bgDark: "linear-gradient(135deg, #1e1b4b 0%, #131131 100%)",
			borderDark: "#3730a3",
			render: () => [
				h("path", { key: "p1", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("circle", { key: "c1", cx: "9", cy: "7", r: "4", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p2", d: "M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
			],
		},
		// 54. Wrench (Sky / Diagnosis & Doctor Repair)
		{
			color: "#0284c7",
			bgLight: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
			borderLight: "#bae6fd",
			bgDark: "linear-gradient(135deg, #0c4a6e 0%, #082f46 100%)",
			borderDark: "#0369a1",
			render: () => [
				h("path", { key: "w", d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 55. Gauge (Amber / Speedometer & Latency)
		{
			color: "#f59e0b",
			bgLight: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
			borderLight: "#fde68a",
			bgDark: "linear-gradient(135deg, #451a03 0%, #291002 100%)",
			borderDark: "#78350f",
			render: () => [
				h("path", { key: "g1", d: "m12 14 4-4", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
				h("path", { key: "g2", d: "M3.34 19a10 10 0 1 1 17.32 0", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
			],
		},
		// 56. CheckCircle (Emerald / Quality QA & Compliance Standards)
		{
			color: "#10b981",
			bgLight: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
			borderLight: "#a7f3d0",
			bgDark: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)",
			borderDark: "#047857",
			render: () => [
				h("path", { key: "p1", d: "M22 11.08V12a10 10 0 1 1-5.93-9.14", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("polyline", { key: "p2", points: "22 4 12 14.01 9 11.01", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 57. Flame (Rose / Power Boost & Turbo)
		{
			color: "#f43f5e",
			bgLight: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)",
			borderLight: "#fecdd3",
			bgDark: "linear-gradient(135deg, #4c0519 0%, #2e030f 100%)",
			borderDark: "#9f1239",
			render: () => [
				h("path", { key: "f", d: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 58. Zap (Yellow / Superpowers & Speed)
		{
			color: "#eab308",
			bgLight: "linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)",
			borderLight: "#fef08a",
			bgDark: "linear-gradient(135deg, #422006 0%, #271304 100%)",
			borderDark: "#854d0e",
			render: () => [
				h("polygon", { key: "z", points: "13 2 3 14 12 14 11 22 21 10 12 10 13 2", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 59. Truck (Orange / Migration & Asset Transfer)
		{
			color: "#f97316",
			bgLight: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
			borderLight: "#fed7aa",
			bgDark: "linear-gradient(135deg, #431407 0%, #270b04 100%)",
			borderDark: "#c2410c",
			render: () => [
				h("path", { key: "p1", d: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("path", { key: "p2", d: "M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14v10Z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("circle", { key: "c1", cx: "17", cy: "18", r: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("circle", { key: "c2", cx: "7", cy: "18", r: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
			],
		},
		// 60. RefreshCw (Sky Blue / Sync & Auto-Update)
		{
			color: "#0ea5e9",
			bgLight: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
			borderLight: "#bae6fd",
			bgDark: "linear-gradient(135deg, #075985 0%, #032b42 100%)",
			borderDark: "#0284c7",
			render: () => [
				h("path", { key: "p1", d: "M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "p2", d: "M3 3v5h5", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "p3", d: "M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "p4", d: "M16 16h5v5", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 61. Workflow (Violet / Pipelines & Automation)
		{
			color: "#8b5cf6",
			bgLight: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
			borderLight: "#ddd6fe",
			bgDark: "linear-gradient(135deg, #2e1065 0%, #1c0a3d 100%)",
			borderDark: "#4c1d95",
			render: () => [
				h("rect", { key: "r1", width: "8", height: "8", x: "3", y: "3", rx: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("path", { key: "p", d: "M7 11v4a2 2 0 0 0 2 2h4", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
				h("rect", { key: "r2", width: "8", height: "8", x: "13", y: "13", rx: "2", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
			],
		},
		// 62. Clock (Slate / Cron & Scheduling)
		{
			color: "#64748b",
			bgLight: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
			borderLight: "#cbd5e1",
			bgDark: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
			borderDark: "#334155",
			render: () => [
				h("circle", { key: "c", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: 2, fill: "none" }),
				h("polyline", { key: "p", points: "12 6 12 12 16 14", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
		// 63. Package (Purple / Tools & Module Library)
		{
			color: "#a855f7",
			bgLight: "linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)",
			borderLight: "#e9d5ff",
			bgDark: "linear-gradient(135deg, #3b0764 0%, #240340 100%)",
			borderDark: "#6b21a8",
			render: () => [
				h("path", { key: "p1", d: "m7.5 4.27 9 5.15", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
				h("path", { key: "p2", d: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
				h("path", { key: "p3", d: "m3.3 7 8.7 5 8.7-5M12 22V12", stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
			],
		},
	];

	const BADGE_CACHE = new Map();
	function getPluginBadge(plugin) {
		const rawName = String(plugin?.name || "").toLowerCase();
		const rawDisp = String(plugin?.displayName || "").toLowerCase();
		const rawDesc = String(plugin?.description || "").toLowerCase();
		const author = String(typeof plugin?.author === "string" ? plugin.author : (plugin?.author && plugin.author.name) || "").toLowerCase();
		const cacheKey = `${rawName}::${rawDisp}::${author}`;

		if (BADGE_CACHE.has(cacheKey)) {
			return BADGE_CACHE.get(cacheKey);
		}

		// Clean common repository prefix
		const cleanName = rawName.replace(/^(dbs|ecc|claude|agent|tool|mcp|plugin|skill)[-_]+/i, "");
		const text = `${cleanName} ${rawDisp} ${rawDesc} ${author}`.toLowerCase();

		let badge = null;

		// 1. Video / Editing / Animation
		if (/\b(video|film|movie|clip|screen|record|obs|ffmpeg|render|capcut|premiere|vfx|motion|animation|reels|subtitle|caption)\b|视频|剪辑|影视|动画|录屏|特效|字幕/.test(text)) {
			if (text.includes("cut") || text.includes("scissors") || text.includes("剪")) badge = LUCIDE_BADGES[4]; // Scissors
			else if (text.includes("film") || text.includes("movie") || text.includes("影")) badge = LUCIDE_BADGES[3]; // Film
			else if (text.includes("wand") || text.includes("effect") || text.includes("特效")) badge = LUCIDE_BADGES[5]; // Wand
			else badge = LUCIDE_BADGES[2]; // Video
		}

		// 2. Audio / Voice / Music / Podcast
		else if (/\b(audio|voice|speech|tts|whisper|sound|music|podcast|mic|vocal|listen|track|song|acoustic|elevenlabs)\b|音频|语音|配音|音乐|播客|声音/.test(text)) {
			if (text.includes("music") || text.includes("song") || text.includes("曲") || text.includes("乐")) badge = LUCIDE_BADGES[9]; // Music
			else if (text.includes("headphone") || text.includes("listen") || text.includes("听")) badge = LUCIDE_BADGES[8]; // Headphones
			else if (text.includes("volume") || text.includes("speaker") || text.includes("声")) badge = LUCIDE_BADGES[10]; // Volume
			else badge = LUCIDE_BADGES[7]; // Mic
		}

		// 3. Testing / QA / Standards / Diagnosis / Wrench
		else if (/\b(diagnos|doctor|repair|fix|troubleshoot|healthcheck)\b|诊断|体检|排错|修复/.test(text)) badge = LUCIDE_BADGES[54]; // Wrench
		else if (/\b(benchmark|standard|answer|compliant|quality|assert|eval|grading|audit)\b|对标|标准|答案|基准|质检|评估/.test(text)) badge = LUCIDE_BADGES[56]; // CheckCircle
		else if (/\b(risk|vulnerabilit|guard|auth|safe|protect|firewall|exploit|penetrat|cve|owasp)\b|风控|安全|漏洞|防护|鉴权/.test(text)) badge = LUCIDE_BADGES[42]; // ShieldAlert
		else if (/\b(security|safe|verify|certified|cert)\b|认证|合规/.test(text)) badge = LUCIDE_BADGES[41]; // ShieldCheck

		// 4. Update / Sync / Bridge / Migration / Workflow / Hook
		else if (/\b(update|refresh|renew|upgrade)\b|更新|刷新|升级/.test(text)) badge = LUCIDE_BADGES[60]; // RefreshCw
		else if (/\b(migration|migrate|transfer|import|export|move|shift|relocat)\b|迁移|导入|导出|搬迁/.test(text)) badge = LUCIDE_BADGES[59]; // Truck
		else if (/\b(bridge|gateway|adapter|connect|router|tunnel)\b|桥接|网关|连接|适配/.test(text)) badge = LUCIDE_BADGES[39]; // Link
		else if (/\b(hook|interceptor|event|listener|signal)\b|钩子|拦截|触发器/.test(text)) badge = LUCIDE_BADGES[40]; // Anchor
		else if (/\b(workflow|pipeline|orchestrat|dag|automat|flow)\b|工作流|流水线|编排|自动化/.test(text)) badge = LUCIDE_BADGES[61]; // Workflow
		else if (/\b(schedule|cron|timer|clock|daily|interval)\b|定时|调度|周期|日历/.test(text)) badge = LUCIDE_BADGES[62]; // Clock

		// 5. Writing / Content / Copywriting / Typography / Knowledge
		else if (/\b(title|headline|xhs|typography|font)\b|标题|小红书|排版|字体|文案标题/.test(text)) badge = LUCIDE_BADGES[28]; // Type
		else if (/\b(content|copywriting|writer|article|essay|story|draft)\b|写作|文案|内容|文章|创作/.test(text)) badge = LUCIDE_BADGES[24]; // PenTool
		else if (/\b(knowledge|wiki|docs?|book|study|learn|manual|research)\b|知识|知识库|文档|百科|手册|研报/.test(text)) badge = LUCIDE_BADGES[26]; // BookOpen
		else if (/\b(news|newsletter|rss|feed|press|bulletin)\b|新闻|快讯|简报|早报/.test(text)) badge = LUCIDE_BADGES[29]; // Newspaper
		else if (/\b(social|share|wechat|weibo|twitter|discord|outreach)\b|微信|社交|分发|分享/.test(text)) badge = LUCIDE_BADGES[30]; // Share
		else if (/\b(blog|post|feather|author)\b|博客|帖子/.test(text)) badge = LUCIDE_BADGES[27]; // Feather
		else if (/\b(doc|file|summary|spec|resume)\b|总结|摘要|报告|文档/.test(text)) badge = LUCIDE_BADGES[25]; // FileText

		// 6. Communication / Chat / Message
		else if (/\b(chatroom|conversation|forum|discuss)\b|聊天室|群聊|讨论/.test(text)) badge = LUCIDE_BADGES[51]; // MessagesSquare
		else if (/\b(chat|message|dialog|talk|im|room)\b|聊天|对话|会话|留言/.test(text)) badge = LUCIDE_BADGES[50]; // MessageSquare
		else if (/\b(mail|email|inbox|smtp|sendgrid)\b|邮件|邮箱|信件/.test(text)) badge = LUCIDE_BADGES[52]; // Mail
		else if (/\b(users|team|member|community|group)\b|团队|社区|成员|用户/.test(text)) badge = LUCIDE_BADGES[53]; // Users

		// 7. Design / UI / UX / Graphics
		else if (/\b(palette|paint|art|color|theme)\b|画板|艺术|色彩|配色/.test(text)) badge = LUCIDE_BADGES[31]; // Palette
		else if (/\b(layout|dashboard|ui|ux|frontend|wireframe)\b|布局|仪表盘|界面|前端/.test(text)) badge = LUCIDE_BADGES[32]; // Layout
		else if (/\b(image|photo|midjourney|dalle|draw|canvas)\b|图像|图片|海报|插画|照片/.test(text)) badge = LUCIDE_BADGES[33]; // Image
		else if (/\b(eye|inspector|visual|preview|look)\b|检查|预览|视图/.test(text)) badge = LUCIDE_BADGES[34]; // Eye
		else if (/\b(layer|stack|hierarchy|structure)\b|图层|分层|结构|架构/.test(text)) badge = LUCIDE_BADGES[35]; // Layers

		// 8. Finance / Business / E-Commerce / Data
		else if (/\b(finance|money|cash|invoice|billing|accounting|ledger|coin|crypto|tax)\b|金融|财务|商业|变现|发票|账单|货币/.test(text)) badge = LUCIDE_BADGES[46]; // Coins
		else if (/\b(pay|stripe|payment|checkout|card)\b|支付|刷卡|结算/.test(text)) badge = LUCIDE_BADGES[45]; // CreditCard
		else if (/\b(shop|store|cart|commerce|product|catalog)\b|电商|商店|购物|商品/.test(text)) badge = LUCIDE_BADGES[47]; // ShoppingCart
		else if (/\b(growth|trend|metric|analytics|stats|bi)\b|增长|统计|分析|度量|行情/.test(text)) badge = LUCIDE_BADGES[48]; // TrendingUp
		else if (/\b(chart|report|pie|dashboard)\b|图表|报表/.test(text)) badge = LUCIDE_BADGES[49]; // PieChart

		// 9. Coding / Dev / Languages / Infrastructure
		else if (/\b(database|sql|postgres|mysql|sqlite|mongo|redis|prisma|orm|airtable|snowflake|db)\b|数据库|数据表|存储/.test(text)) badge = LUCIDE_BADGES[16]; // Database
		else if (/\b(server|host|backend|deploy|node|cluster)\b|服务器|后端|主机|集群/.test(text)) badge = LUCIDE_BADGES[17]; // Server
		else if (/\b(container|docker|k8s|kubernetes|pod)\b|容器|镜像/.test(text)) badge = LUCIDE_BADGES[18]; // Container
		else if (/\b(cpu|kernel|chip|processor|engine)\b|内核|处理器|核心|引擎/.test(text)) badge = LUCIDE_BADGES[14]; // Cpu
		else if (/\b(bug|debug|trace|error|profiler|leak)\b|调试|修复|报错|异常/.test(text)) badge = LUCIDE_BADGES[11]; // Bug
		else if (/\b(git|branch|pr|commit|repo)\b|仓库|分支|提交/.test(text)) badge = LUCIDE_BADGES[12]; // GitBranch
		else if (/\b(json|ast|parse|syntax|braces|yaml|toml)\b|解析|语法|树/.test(text)) badge = LUCIDE_BADGES[15]; // Braces
		else if (/\b(terminal|cli|shell|bash|cmd|console|command)\b|终端|控制台|命令行/.test(text)) badge = LUCIDE_BADGES[0]; // Terminal
		else if (/\b(code|coding|dev|lsp|sdk|compiler|typescript|javascript|python|rust|golang|java|cpp|html|css)\b|代码|编程|开发|脚本/.test(text)) badge = LUCIDE_BADGES[1]; // Code

		// 10. AI / LLM / Agents / Speed / Discovery
		else if (/\b(brain|neural|cognitive|deeplearning|mind)\b|大脑|神经|深度学习/.test(text)) badge = LUCIDE_BADGES[19]; // Brain
		else if (/\b(bot|agent|assistant|robot|automaton)\b|智能体|机器人|助手|助理/.test(text)) badge = LUCIDE_BADGES[20]; // Bot
		else if (/\b(sparkles|magic|generate|prompt|ai|llm|gpt|claude)\b|智能|生成|大模型|提示词/.test(text)) badge = LUCIDE_BADGES[21]; // Sparkles
		else if (/\b(vision|ocr|face|cv|detect)\b|视觉|识图|检测/.test(text)) badge = LUCIDE_BADGES[22]; // ScanFace
		else if (/\b(speed|fast|superpower|turbo|accelerat|boost|quick)\b|快|加速|极速|超能|快速/.test(text)) badge = LUCIDE_BADGES[58]; // Zap
		else if (/\b(flame|hot|power|fire|blazing)\b|火|强大|威力/.test(text)) badge = LUCIDE_BADGES[57]; // Flame
		else if (/\b(search|find|query|lookup|retriev|rag)\b|搜索|查找|检索|查询/.test(text)) badge = LUCIDE_BADGES[37]; // Search
		else if (/\b(explore|discover|compass|navigate|map)\b|探索|发现|指南|导航/.test(text)) badge = LUCIDE_BADGES[36]; // Compass
		else if (/\b(globe|web|internet|browser|crawl|scrape|http|net)\b|网页|网络|抓取|浏览器|互联网/.test(text)) badge = LUCIDE_BADGES[38]; // Globe
		else if (/\b(lock|crypto|encrypt|token|privacy|vault)\b|加密|隐私|保险库/.test(text)) badge = LUCIDE_BADGES[43]; // Lock
		else if (/\b(key|secret|passkey|oauth|access)\b|密钥|凭证|钥匙/.test(text)) badge = LUCIDE_BADGES[44]; // Key
		else if (/\b(package|module|bundle|lib|box|plugin)\b|插件|包|模块|工具箱/.test(text)) badge = LUCIDE_BADGES[63]; // Package

		if (!badge) {
			// 11. Deterministic FNV-1a Hash on clean name
			let hash = 2166136261;
			for (let i = 0; i < cleanName.length; i++) {
				hash ^= cleanName.charCodeAt(i);
				hash = Math.imul(hash, 16777619);
			}
			const idx = Math.abs(hash) % LUCIDE_BADGES.length;
			badge = LUCIDE_BADGES[idx];
		}

		BADGE_CACHE.set(cacheKey, badge);
		return badge;
	}

	const LOADED_AVATARS = new Set();
	function trackLoadedAvatar(url) {
		if (!url || url.startsWith("data:")) return;
		if (LOADED_AVATARS.size > 300) LOADED_AVATARS.clear();
		LOADED_AVATARS.add(url);
	}

	function PluginIcon({ plugin, isDark }) {
		const name = (plugin?.name || "").toLowerCase();
		const author = (typeof plugin?.author === "string" ? plugin.author : (plugin?.author && plugin.author.name) || "").trim().toLowerCase();
		const badge = getPluginBadge(plugin || {});

		// 1. Context7 official icon
		if (name.includes("context7")) {
			return h(Context7Icon, { isDark });
		}

		// 2. Brand or GitHub repo avatar with instant underlay placeholder (Check first!)
		const avatarUrl = useMemo(() => getGithubAvatarUrl(plugin), [plugin]);
		const isDataUri = avatarUrl && avatarUrl.startsWith("data:");
		const isPreloaded = avatarUrl && (isDataUri || LOADED_AVATARS.has(avatarUrl));
		const [imgFailed, setImgFailed] = useState(false);
		const [imgLoaded, setImgLoaded] = useState(isPreloaded);

		useEffect(() => {
			setImgFailed(false);
			setImgLoaded(avatarUrl ? (avatarUrl.startsWith("data:") || LOADED_AVATARS.has(avatarUrl)) : false);
		}, [avatarUrl]);

		if (avatarUrl && !imgFailed) {
			return h("div", {
				className: "cpm-card-icon",
				style: {
					position: "relative",
					overflow: "hidden",
				},
			},
				// Avatar image overlay
				h("img", {
					src: avatarUrl,
					alt: plugin.displayName || plugin.name,
					decoding: "async",
					loading: "lazy",
					style: {
						position: "absolute",
						inset: 0,
						width: "100%",
						height: "100%",
						objectFit: "cover",
						borderRadius: 9,
						opacity: imgLoaded ? 1 : 0,
						transition: "opacity 0.15s ease",
					},
					onLoad: () => {
						trackLoadedAvatar(avatarUrl);
						setImgLoaded(true);
					},
					onError: () => setImgFailed(true),
				})
			);
		}

		// 3. Anthropic official plugins (when no specific third-party brand was matched)
		const isAnthropic = (plugin && (!plugin.sourceId || plugin.sourceId === "anthropic")) && (
			author === "anthropic" ||
			author.includes("anthropic") ||
			(typeof plugin?.source === "string" && plugin.source.startsWith("./plugins/")) ||
			name.startsWith("claude-") ||
			name.startsWith("agent-sdk") ||
			name.startsWith("anthropic") ||
			name.startsWith("code-") ||
			name.startsWith("commit-") ||
			name.startsWith("feature-") ||
			name.startsWith("hookify") ||
			name.startsWith("pr-review") ||
			name.startsWith("skill-creator") ||
			name.startsWith("security-guidance") ||
			name.startsWith("session-report") ||
			name.startsWith("evals") ||
			name.startsWith("prompt-improver") ||
			name.includes("claude-code")
		);

		if (isAnthropic) {
			return h(AnthropicIcon, { isDark });
		}

		// 4. Universal 64-Theme Vector Icon Badge
		return h("div", {
			className: "cpm-card-icon",
			style: {
				color: badge.color,
				background: isDark ? badge.bgDark : badge.bgLight,
				borderColor: isDark ? badge.borderDark : badge.borderLight,
			},
		},
			h("svg", {
				width: 20,
				height: 20,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: badge.color,
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
			},
				badge.render(),
			),
		);
	}

	function PluginCard({
		plugin,
		installed,
		isDark,
		onMouseEnter,
		onMouseLeave,
		onClick,
		onManage,
		onInstall,
	}) {
		return h("div", {
			className: "cpm-card",
			onMouseEnter,
			onMouseLeave,
			onClick,
		},
			h(PluginIcon, { plugin, isDark }),
			h("div", { className: "cpm-card-body" },
				h("div", { className: "cpm-card-name" }, plugin.displayName || plugin.name),
				h("div", { className: "cpm-card-desc" }, plugin.description || (plugin.author ? `by ${plugin.author}` : "")),
			),
			installed
				? h("button", {
					className: "cpm-card-pill cpm-card-pill-installed",
					onClick: onManage,
				}, "管理")
				: h("button", {
					className: "cpm-card-pill",
					onClick: onInstall,
				}, "安装"),
		);
	}

	// ────────────────────────────── Modern Vector SVG Icons ──────────────────────────────
	const IconSearch = ({ size = 14, color = "var(--cpm-muted)" }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 1.8,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0 },
		},
			h("circle", { cx: 11, cy: 11, r: 7.5 }),
			h("path", { d: "M21 21l-4.5-4.5" }),
		);

	const IconRefresh = ({ size = 14, color = "currentColor" }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 1.8,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0 },
		},
			h("path", { d: "M21 3v5h-5" }),
			h("path", { d: "M21 8A9 9 0 1 0 20.8 13.5" }),
		);

	const IconPlus = ({ size = 13, color = "currentColor" }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 2.2,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0 },
		},
			h("line", { x1: 12, y1: 5, x2: 12, y2: 19 }),
			h("line", { x1: 5, y1: 12, x2: 19, y2: 12 }),
		);

	const IconGear = ({ size = 14, color = "currentColor" }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 1.8,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0 },
		},
			h("circle", { cx: 12, cy: 12, r: 3 }),
			h("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" }),
		);

	const IconClose = ({ size = 14, color = "currentColor" }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 2,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0 },
		},
			h("line", { x1: 18, y1: 6, x2: 6, y2: 18 }),
			h("line", { x1: 6, y1: 6, x2: 18, y2: 18 }),
		);

	const IconLink = ({ size = 14, color = "currentColor" }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 1.8,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0 },
		},
			h("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }),
			h("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }),
		);

	const IconArrow = ({ size = 11, color = "currentColor" }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 2.2,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0, display: "block" },
		},
			h("polyline", { points: "6 9 12 15 18 9" }),
		);

	const IconChevronDown = ({ size = 11, color = "currentColor", style }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 2.2,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0, display: "block", ...(style || {}) },
		},
			h("polyline", { points: "6 9 12 15 18 9" }),
		);

	const IconChevronUp = ({ size = 11, color = "currentColor", style }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 2.2,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0, display: "block", ...(style || {}) },
		},
			h("polyline", { points: "18 15 12 9 6 15" }),
		);

	const IconChevronLeft = ({ size = 14, color = "currentColor" }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 2.2,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0, marginRight: 2 },
		},
			h("polyline", { points: "15 18 9 12 15 6" }),
		);

	const IconMore = ({ size = 14, color = "currentColor" }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 2,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0 },
		},
			h("circle", { cx: 12, cy: 12, r: 1.3, fill: "currentColor" }),
			h("circle", { cx: 12, cy: 5, r: 1.3, fill: "currentColor" }),
			h("circle", { cx: 12, cy: 19, r: 1.3, fill: "currentColor" }),
		);

	const IconEye = ({ size = 14, color = "currentColor" }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 1.8,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0 },
		},
			h("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
			h("circle", { cx: 12, cy: 12, r: 3 }),
		);

	const IconEyeOff = ({ size = 14, color = "currentColor" }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 1.8,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0 },
		},
			h("path", { d: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" }),
			h("line", { x1: 1, y1: 1, x2: 23, y2: 23 }),
		);

	const IconCheck = ({ size = 13, color = "currentColor" }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 2.2,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0 },
		},
			h("polyline", { points: "20 6 9 17 4 12" }),
		);

	const IconSettings = ({ size = 14, color = "currentColor" }) =>
		h("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: color,
			strokeWidth: 1.8,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			style: { flexShrink: 0 },
		},
			h("path", { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" }),
			h("circle", { cx: 12, cy: 12, r: 3 }),
		);

	function CustomSelect({ value, options, onChange, openUp = false }) {
		const [open, setOpen] = useState(false);
		const ref = useRef(null);

		useEffect(() => {
			if (!open) return;
			const handleOutside = (e) => {
				if (ref.current && !ref.current.contains(e.target)) {
					setOpen(false);
				}
			};
			document.addEventListener("mousedown", handleOutside);
			return () => document.removeEventListener("mousedown", handleOutside);
		}, [open]);

		const activeOption = options.find((o) => o.value === value) || options[0];

		return h("div", { ref, className: "cpm-custom-select" + (open ? " is-open" : "") },
			h("button", {
				type: "button",
				className: "cpm-select-trigger" + (open ? " open" : ""),
				onClick: () => setOpen(!open),
			},
				h("span", null, activeOption?.label || ""),
				h("span", { className: "cpm-select-chevron" },
					h("svg", { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
						h("polyline", { points: "6 9 12 15 18 9" })
					),
				),
			),
			open && h("div", { className: "cpm-select-menu" },
				options.map((opt) => {
					const isSelected = opt.value === value;
					return h("div", {
						key: opt.value,
						className: "cpm-select-item" + (isSelected ? " selected" : ""),
						onClick: () => {
							onChange(opt.value);
							setOpen(false);
						},
					},
						h("span", null, opt.label),
						isSelected && h(IconCheck, { size: 14 }),
					);
				}),
			),
		);
	}

	function CustomTooltip({ text, rect, isDark }) {
		if (!text || !rect) return null;
		const tipWidth = Math.min(280, Math.max(60, text.length * 12 + 20));
		let left = rect.left + rect.width / 2 - tipWidth / 2;
		left = Math.max(8, Math.min(window.innerWidth - tipWidth - 8, left));
		let top = rect.top - 30;
		if (top < 8) {
			top = rect.bottom + 6;
		}

		return h("div", {
			className: "cpm-tooltip" + (isDark ? " cpm-dark" : ""),
			style: {
				position: "fixed",
				left,
				top,
				zIndex: 999999,
				pointerEvents: "none",
			},
		}, text);
	}

	let currentTabAnim = null;
	let currentTabTarget = null;
	function smoothScrollTabsTo(container, targetLeft, duration = 280, onUpdate) {
		if (!container) return;
		const startLeft = container.scrollLeft;
		const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
		const clampTarget = Math.max(0, Math.min(maxLeft, targetLeft));

		// If already at target, finish instantly and cleanly
		if (Math.abs(startLeft - clampTarget) < 0.5) {
			container.scrollLeft = clampTarget;
			if (currentTabAnim) {
				cancelAnimationFrame(currentTabAnim);
				currentTabAnim = null;
			}
			currentTabTarget = null;
			if (typeof onUpdate === "function") onUpdate();
			return;
		}

		// If an animation is already in progress to this exact target (within 6px tolerance for active font-weight expansion), do not interrupt or twitch!
		if (currentTabAnim && currentTabTarget !== null && Math.abs(currentTabTarget - clampTarget) < 6) {
			return;
		}

		if (currentTabAnim) {
			cancelAnimationFrame(currentTabAnim);
			currentTabAnim = null;
		}

		currentTabTarget = clampTarget;
		const startTime = performance.now();
		const distance = clampTarget - startLeft;
		const easeOut = (t) => 1 - Math.pow(1 - t, 3);

		function step(currentTime) {
			if (!container || (!container.parentElement && typeof document !== "undefined" && !document.body.contains(container))) {
				currentTabAnim = null;
				currentTabTarget = null;
				return;
			}
			const elapsed = currentTime - startTime;
			const progress = Math.min(1, elapsed / duration);
			const ease = easeOut(progress);
			container.scrollLeft = startLeft + distance * ease;
			if (typeof onUpdate === "function") onUpdate();
			if (progress < 1) {
				currentTabAnim = requestAnimationFrame(step);
			} else {
				container.scrollLeft = clampTarget;
				currentTabAnim = null;
				currentTabTarget = null;
				if (typeof onUpdate === "function") onUpdate();
			}
		}
		currentTabAnim = requestAnimationFrame(step);
	}

	let currentScrollTopAnim = null;
	function smoothScrollToTop(container, duration = 280, onUpdate) {
		if (!container) return;
		if (currentScrollTopAnim) {
			cancelAnimationFrame(currentScrollTopAnim);
			currentScrollTopAnim = null;
		}
		const startTop = container.scrollTop;
		if (startTop <= 0) {
			if (typeof onUpdate === "function") onUpdate();
			return;
		}
		const startTime = performance.now();
		const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

		function step(currentTime) {
			if (!container || !container.parentElement && typeof document !== "undefined" && !document.body.contains(container)) {
				currentScrollTopAnim = null;
				return;
			}
			const elapsed = currentTime - startTime;
			const progress = Math.min(1, elapsed / duration);
			const ease = easeOutCubic(progress);
			container.scrollTop = startTop * (1 - ease);
			if (typeof onUpdate === "function") onUpdate();
			if (progress < 1) {
				currentScrollTopAnim = requestAnimationFrame(step);
			} else {
				container.scrollTop = 0;
				currentScrollTopAnim = null;
				if (typeof onUpdate === "function") onUpdate();
			}
		}
		currentScrollTopAnim = requestAnimationFrame(step);
	}

	function compareSemver(v1, v2) {
		if (!v1 && !v2) return 0;
		if (!v1) return -1;
		if (!v2) return 1;
		const parse = (v) => String(v).replace(/^[v^~]/i, "").split(/[-+.]/).map((n) => parseInt(n, 10) || 0);
		const p1 = parse(v1);
		const p2 = parse(v2);
		const maxLen = Math.max(p1.length, p2.length, 3);
		for (let i = 0; i < maxLen; i++) {
			const num1 = p1[i] || 0;
			const num2 = p2[i] || 0;
			if (num1 > num2) return 1;
			if (num1 < num2) return -1;
		}
		return 0;
	}

	// ────────────────────────────── Persistent Session & Local Storage Store ──────────────────────────────
	const STORAGE_KEY_STATE = "cpm_cached_state_v1";
	const STORAGE_KEY_ROWS = "cpm_cached_rows_v1";

	function loadCachedState() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY_STATE);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed && Array.isArray(parsed.sources) && Array.isArray(parsed.plugins)) {
					return parsed;
				}
			}
		} catch {}
		return {
			sources: [{ id: "anthropic", name: "Anthropic", url: "https://github.com/anthropics/claude-plugins-official.git", builtin: true }],
			plugins: [],
		};
	}

	function loadCachedRows() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY_ROWS);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed && typeof parsed === "object") {
					return parsed;
				}
			}
		} catch {}
		return {};
	}

	const SESSION_STORE = {
		view: { type: "browse" },
		sourceViews: {},
		manageFor: null,
		prevView: null,
		query: "",
		filter: "all",
		sortBy: "default",
		activeSourceId: "anthropic",
		rows: loadCachedRows(),
		state: loadCachedState(),
		scrollTops: {},
		scrollTop: 0,
		// Per-source "installed-first" sort snapshots. Kept on SESSION_STORE
		// (module-level, not a component ref) so they survive the BrowseView
		// unmount that happens when the manage page opens — returning from
		// manage must keep both scroll position AND plugin ordering where they
		// were, including a plugin installed right before opening manage.
		installedSnapshots: {},
	};

	// ────────────────────────────── Root App ──────────────────────────────
	function MarketApp({ ctx }) {
		const rootRef = useRef(null);
		const getEffectiveTheme = useCallback(() => {
			return isDarkMode(ctx, rootRef.current);
		}, [ctx]);

		const [isDark, setIsDark] = useState(getEffectiveTheme);
		const [view, setViewRaw] = useState(() => SESSION_STORE.view);
		const [manageFor, setManageForRaw] = useState(() => SESSION_STORE.manageFor);
		const [prevView, setPrevViewRaw] = useState(() => SESSION_STORE.prevView);

		// Persistent browse state across views and sidebar tab switching
		const [query, setQueryRaw] = useState(() => SESSION_STORE.query);
		const [filter, setFilterRaw] = useState(() => SESSION_STORE.filter);
		const [sortBy, setSortByRaw] = useState(() => SESSION_STORE.sortBy);
		const [activeSourceId, setActiveSourceIdRaw] = useState(() => SESSION_STORE.activeSourceId);
		const [rows, setRowsRaw] = useState(() => SESSION_STORE.rows || loadCachedRows());
		const [state, setStateRaw] = useState(() => SESSION_STORE.state || loadCachedState());
		const scrollTopRef = useRef(SESSION_STORE.scrollTop);

		const setView = useCallback((v) => {
			SESSION_STORE.view = v;
			if (!SESSION_STORE.sourceViews) SESSION_STORE.sourceViews = {};
			const sId = (v && v.sourceId) || SESSION_STORE.activeSourceId;
			if (sId) {
				SESSION_STORE.sourceViews[sId] = v;
			}
			setViewRaw(v);
		}, []);

		const switchSource = useCallback((newSourceId, nextFilter) => {
			if (!newSourceId) return;
			if (!SESSION_STORE.sourceViews) SESSION_STORE.sourceViews = {};
			if (SESSION_STORE.activeSourceId && SESSION_STORE.view) {
				SESSION_STORE.sourceViews[SESSION_STORE.activeSourceId] = SESSION_STORE.view;
			}
			SESSION_STORE.activeSourceId = newSourceId;
			setActiveSourceIdRaw(newSourceId);
			if (nextFilter) {
				SESSION_STORE.filter = nextFilter;
				if (!SESSION_STORE.sourceFilters) SESSION_STORE.sourceFilters = {};
				SESSION_STORE.sourceFilters[newSourceId] = nextFilter;
				setFilterRaw(nextFilter);
			}
			const targetView = SESSION_STORE.sourceViews[newSourceId] || { type: "browse", sourceId: newSourceId };
			SESSION_STORE.view = targetView;
			setViewRaw(targetView);
		}, []);

		const setManageFor = useCallback((m) => {
			SESSION_STORE.manageFor = m;
			setManageForRaw(m);
		}, []);

		const setPrevView = useCallback((pv) => {
			SESSION_STORE.prevView = pv;
			setPrevViewRaw(pv);
		}, []);

		const setQuery = useCallback((q) => {
			SESSION_STORE.query = q;
			setQueryRaw(q);
		}, []);

		const setFilter = useCallback((f) => {
			SESSION_STORE.filter = f;
			SESSION_STORE.preferredFilter = f;
			if (!SESSION_STORE.sourceFilters) SESSION_STORE.sourceFilters = {};
			if (SESSION_STORE.activeSourceId) {
				SESSION_STORE.sourceFilters[SESSION_STORE.activeSourceId] = f;
			}
			setFilterRaw(f);
		}, []);

		const setSortBy = useCallback((s) => {
			SESSION_STORE.sortBy = s;
			setSortByRaw(s);
		}, []);

		const setActiveSourceId = useCallback((id, nextFilter) => {
			switchSource(id, nextFilter);
		}, [switchSource]);

		const setRows = useCallback((r) => {
			setRowsRaw((prev) => {
				const next = typeof r === "function" ? r(prev) : r;
				SESSION_STORE.rows = next || {};
				try {
					localStorage.setItem(STORAGE_KEY_ROWS, JSON.stringify(SESSION_STORE.rows));
				} catch {}
				return next;
			});
		}, []);

		const setState = useCallback((s) => {
			setStateRaw((prev) => {
				const next = typeof s === "function" ? s(prev) : s;
				SESSION_STORE.state = next || { sources: [], plugins: [] };
				try {
					localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(SESSION_STORE.state));
				} catch {}
				return next;
			});
		}, []);

		useEffect(() => {
			ensureCss();
			const update = () => setIsDark(getEffectiveTheme());
			update();
			const raf = requestAnimationFrame(update);

			if (ctx && typeof ctx.on === "function") {
				const off = ctx.on("theme/change", update);
				return () => {
					cancelAnimationFrame(raf);
					if (typeof off === "function") off();
				};
			}
			return () => cancelAnimationFrame(raf);
		}, [ctx, getEffectiveTheme]);

		useEffect(() => {
			const update = () => setIsDark(getEffectiveTheme());
			const observer = new MutationObserver(update);
			observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
			observer.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
			if (rootRef.current && rootRef.current.parentElement) {
				observer.observe(rootRef.current.parentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
			}
			return () => observer.disconnect();
		}, [getEffectiveTheme]);

		const [toast, setToast] = useState(null);
		const toastTimerRef = useRef(null);

		const showToast = useCallback((title, body, options = {}) => {
			if (toastTimerRef.current) {
				clearTimeout(toastTimerRef.current);
				toastTimerRef.current = null;
			}
			setToast({
				title,
				body,
				...options,
			});
			const duration = options.duration || 3200;
			toastTimerRef.current = setTimeout(() => {
				setToast(null);
			}, duration);
		}, []);

		const [activeTooltip, setActiveTooltip] = useState(null);
		const tipTimerRef = useRef(null);

		const handleRootMouseOver = useCallback((e) => {
			const target = e.target && e.target.closest && e.target.closest("[data-cpm-tip]");
			if (!target) {
				if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
				setActiveTooltip(null);
				return;
			}
			const text = target.getAttribute("data-cpm-tip");
			if (!text) {
				setActiveTooltip(null);
				return;
			}
			if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
			tipTimerRef.current = setTimeout(() => {
				const rect = target.getBoundingClientRect();
				setActiveTooltip({ text, rect });
			}, 100);
		}, []);

		const handleRootMouseOut = useCallback((e) => {
			const related = e.relatedTarget;
			if (related && related.closest && related.closest("[data-cpm-tip]")) {
				return;
			}
			if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
			setActiveTooltip(null);
		}, []);

		const refreshState = useCallback(async () => {
			try {
				const res = await api("/state");
				setState(res);
			} catch (e) {
				showToast("加载状态失败", e.message, { restart: false });
			}
		}, [showToast]);

		useEffect(() => {
			refreshState();
		}, [refreshState]);

		// Auto-refresh marketplace sources (pull latest catalog) in background on launch.
		// Keyed by the actual source-id set so a stale cached state (localStorage)
		// cannot lock the refresh out once the real sources load from the server.
		const autoRefreshedRef = useRef(null);
		useEffect(() => {
			if (!state.sources || state.sources.length === 0) return;
			const sourceKey = state.sources.map((s) => s.id).join(",");
			if (autoRefreshedRef.current === sourceKey) return;
			autoRefreshedRef.current = sourceKey;
			let isMounted = true;
			(async () => {
				for (const s of state.sources) {
					try {
						const res = await api("/market/refresh", {
							method: "POST",
							body: JSON.stringify({ sourceId: s.id }),
						});
						if (isMounted && res && Array.isArray(res.plugins)) {
							setRows((prev) => ({ ...(prev || {}), [s.id]: res.plugins }));
						}
					} catch {}
				}
			})();
			return () => {
				isMounted = false;
				if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
			};
		}, [state.sources]);

		const onInstalled = useCallback(() => {
			refreshState();
		}, [refreshState]);

		// The plugin panel itself is being closed (MarketApp unmounts). Reset
		// the scroll memory so a fresh open of the panel starts at the top —
		// the user explicitly wants panel close/reopen to reset scroll. This
		// does NOT run on the manage-page round trip (that only conditionally
		// swaps BrowseView/ManagePage inside the same MarketApp), so returning
		// from manage still restores the saved position.
		useEffect(() => {
			return () => {
				if (SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
				// Panel close also resets sort snapshots, so a fresh open
				// re-evaluates the "installed-first" default sort from the
				// current plugin list.
				if (SESSION_STORE.installedSnapshots) SESSION_STORE.installedSnapshots = {};
			};
		}, []);

		const openManage = useCallback((record, fromView) => {
			setManageFor(record ? record.name : null);
			setPrevView(fromView || view || { type: "browse" });
		}, [view, setManageFor, setPrevView]);

		const closeManage = useCallback(() => {
			setManageFor(null);
			if (prevView && prevView.type === "detail") {
				setView(prevView);
			} else {
				setView({ type: "browse", sourceId: activeSourceId });
			}
		}, [prevView, setManageFor, setView, activeSourceId]);

		return h("div", {
			ref: rootRef,
			className: "cpm-root" + (isDark ? " cpm-dark" : ""),
			onMouseOver: handleRootMouseOver,
			onMouseOut: handleRootMouseOut,
		},
			!manageFor && h(BrowseView, {
				view,
				setView,
				state,
				setState,
				refreshState,
				showToast,
				openManage,
				onInstalled,
				isDark,
				query,
				setQuery,
				filter,
				setFilter,
				sortBy,
				setSortBy,
				activeSourceId,
				setActiveSourceId,
				rows,
				setRows,
				scrollTopRef,
			}),
			manageFor && h(ManagePage, {
				record: state.plugins.find((p) => p.name === manageFor) || null,
				state,
				rows,
				refreshState,
				showToast,
				onBack: closeManage,
				onClose: closeManage,
			}),
			toast && h("div", {
				className: "cpm-toast",
			},
				h("div", { className: "cpm-toast-content" },
					h("div", { className: "cpm-toast-title" },
						toast.restarting && h("span", { className: "cpm-spin-ring", style: { marginRight: 8 } }),
						toast.title,
					),
					toast.body && h("div", { className: "cpm-toast-body" }, toast.body),
				),
			),
			activeTooltip && h(CustomTooltip, { text: activeTooltip.text, rect: activeTooltip.rect, isDark }),
		);
	}

	// ────────────────────────────── Smart Lightweight Markdown Renderer ──────────────────────────────
	// Conjunctions, prepositions, or binary antonyms commonly used with irregular slashes (e.g. "and /or", "either /or", "yes /no", "true /false")
	const NON_COMMAND_WORDS = new Set([
		"or", "and", "nor", "not", "but", "yet", "so",
		"no", "yes", "true", "false",
		"off", "on", "in", "out", "up", "down", "left", "right",
		"write", "read", "output", "input", "after", "before",
		"to", "of", "for", "with", "without", "vs", "v", "a", "an", "the", "is", "are", "be", "it", "if",
	]);

	// Preceding words that signal a binary/comparison pair (e.g. "and /or", "either /or", "yes /no", "input /output")
	const PAIR_PRECEDING_REGEX = /\b(and|either|or|yes|no|true|false|input|output|read|write|on|off|in|out|up|down|before|after|client|server|master|slave|parent|child|key|value|male|female|plus|minus|min|max|black|white|win|loss|start|stop|buy|sell|send|receive|encode|decode|lock|unlock|show|hide|enable|disable)\s*$/i;

	function isValidSlashCommand(token, precedingText) {
		if (!token || !token.startsWith("/")) return false;
		const rawBase = token.slice(1).trim().split(/\s+/)[0] || "";
		const baseLower = rawBase.toLowerCase();
		if (!baseLower) return false;

		// Require at least one letter in command name (allows "/10x-team", "/2fa", "/3d"; rejects pure numbers like "/123", "/2024")
		if (!/[a-zA-Z]/.test(baseLower)) {
			return false;
		}

		// Reject file paths or extensions (e.g. "/index.html", "/app.js")
		if (/\.(js|ts|json|html|css|yaml|yml|md|txt|sh|py|go|rs|c|h|png|jpg|svg|xml|bin|wasm)$/i.test(baseLower)) {
			return false;
		}

		// Reject multi-level directory paths (e.g. "/api/v1")
		if (token.slice(1).includes("/")) {
			return false;
		}

		// Reject binary pair expressions (e.g. "and /or", "either /or", "yes /no", "true /false")
		if (PAIR_PRECEDING_REGEX.test(precedingText)) {
			return false;
		}

		// Reject isolated common words unless placeholder arguments are present (e.g. "/or" is rejected, but "/or <mode>" is allowed)
		const hasArgs = /<[^>]+>|\[[^\]]+\]/.test(token);
		if (!hasArgs && NON_COMMAND_WORDS.has(baseLower)) {
			return false;
		}

		return true;
	}

	function parseInlineMarkdown(text) {
		if (!text) return [];
		const parts = [];
		// Match:
		// 1. links: [text](url) -> group 2, 3
		// 2. code: `...` -> group 4
		// 3. bold: **...** or __...__ -> group 5, 6
		// 4. italic: *...* or _..._ (word boundary safe) -> group 7, 8
		// 5. bare URLs: https://... -> group 9
		// 6. slash commands: e.g. /mind <type>, /pair <a> <b>, /10x-team, /minds -> group 10
		const regex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*[^*\s]|[^*\s])\*|(?<=\s|^)_([^_]+)_(?=\s|$|[.,;:!?])|(https?:\/\/[^\s<)]+)|(?<=^|[\s\(\[\"\'\`])(\/[a-zA-Z0-9][a-zA-Z0-9_-]*(?:(?:\s+<[^>\n]+>|\s+\[[^\]\n]+\])*))(?=$|[\s\)\]\"\'\`.,;:!?\u2014\u2013\-]))/g;
		let lastIdx = 0;
		let match;

		while ((match = regex.exec(text)) !== null) {
			if (match.index > lastIdx) {
				parts.push({ type: "text", val: text.slice(lastIdx, match.index) });
			}
			if (match[2] && match[3]) {
				parts.push({ type: "link", text: match[2], url: match[3] });
			} else if (match[4]) {
				parts.push({ type: "code", val: match[4] });
			} else if (match[5] || match[6]) {
				parts.push({ type: "bold", val: match[5] || match[6] });
			} else if (match[7] || match[8]) {
				parts.push({ type: "italic", val: match[7] || match[8] });
			} else if (match[9]) {
				parts.push({ type: "link", text: match[9], url: match[9] });
			} else if (match[10]) {
				const precedingSlice = text.slice(0, match.index);
				if (isValidSlashCommand(match[10], precedingSlice)) {
					parts.push({ type: "cmd", val: match[10] });
				} else {
					parts.push({ type: "text", val: match[10] });
				}
			}
			lastIdx = regex.lastIndex;
		}

		if (lastIdx < text.length) {
			parts.push({ type: "text", val: text.slice(lastIdx) });
		}

		return parts;
	}

	function renderInlineMarkdownNodes(text) {
		if (!text) return null;

		// Smart Key-Colon classification:
		// 1. Callouts: Note:, Warning:, Important:, Tip:, Example:, Usage:, Details:, Returns:, Requires:
		const calloutMatch = text.match(/^(Note|Warning|Caution|Important|Tip|Example|Usage|Details|Returns|Parameters|Requires):\s+(.*)$/i);
		if (calloutMatch) {
			return h(React.Fragment, null,
				h("strong", { className: "cpm-md-callout" }, `${calloutMatch[1]}:`),
				" ",
				renderInlineMarkdownNodes(calloutMatch[2]),
			);
		}

		// 2. Code Key-Colon (e.g. "submit_pending: Submit an existing..." or "`body`: The request body")
		const keyColonMatch = text.match(/^(`?)([a-zA-Z0-9_\-\.\/]+)(`?):\s+(.*)$/);
		if (keyColonMatch) {
			const keyName = keyColonMatch[2];
			const restPart = keyColonMatch[4];
			return h(React.Fragment, null,
				h("strong", { className: "cpm-md-key" }, `${keyName}:`),
				" ",
				renderInlineMarkdownNodes(restPart),
			);
		}

		const tokens = parseInlineMarkdown(text);
		return tokens.map((tok, i) => {
			if (tok.type === "code") {
				return h("code", { key: i, className: "cpm-md-code" }, tok.val);
			} else if (tok.type === "bold") {
				return h("strong", { key: i, className: "cpm-md-bold" }, tok.val);
			} else if (tok.type === "italic") {
				return h("em", { key: i, className: "cpm-md-italic" }, tok.val);
			} else if (tok.type === "cmd") {
				const cmdText = tok.val;
				const argParts = cmdText.split(/(\s+<[^>]+>|\s+\[[^\]]+\])/g).filter(Boolean);
				return h("span", { key: i, className: "cpm-md-cmd" },
					argParts.map((part, pIdx) => {
						if (/^(\s*<[^>]+>|\s*\[[^\]]+\])$/.test(part)) {
							return h("span", { key: pIdx, className: "cpm-md-cmd-arg" }, part);
						}
						return part;
					}),
				);
			} else if (tok.type === "link") {
				return h("a", {
					key: i,
					href: tok.url,
					className: "cpm-md-link",
					target: "_blank",
					rel: "noreferrer",
					onClick: (e) => e.stopPropagation(),
				}, tok.text);
			}
			return tok.val;
		});
	}

	function parseSmartBlocks(raw) {
		if (!raw) return [];
		const lines = raw.split(/\r?\n/);
		const blocks = [];
		let currentList = null;
		let currentParagraph = [];
		let currentCodeBlock = null;

		function flushParagraph() {
			if (currentParagraph.length > 0) {
				blocks.push({ type: "p", text: currentParagraph.join(" ") });
				currentParagraph = [];
			}
		}

		function flushList() {
			if (currentList) {
				blocks.push(currentList);
				currentList = null;
			}
		}

		const hrRegex = /^\s*([-*_]\s*){3,}$/;
		const bulletRegex = /^\s*([-*+•]|\d+[.)])\s+(.+)$/;
		const headingRegex = /^\s*(#{1,4})\s+(.+)$/;
		const quoteRegex = /^\s*>\s*(.+)$/;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			// 1. Fenced Code Block Handling (```lang ... ```)
			if (trimmed.startsWith("```")) {
				if (currentCodeBlock) {
					blocks.push(currentCodeBlock);
					currentCodeBlock = null;
				} else {
					flushParagraph();
					flushList();
					const lang = trimmed.slice(3).trim();
					currentCodeBlock = { type: "code", lang, code: "" };
				}
				continue;
			}
			if (currentCodeBlock) {
				currentCodeBlock.code += (currentCodeBlock.code ? "\n" : "") + line;
				continue;
			}

			// 2. Empty line
			if (!trimmed) {
				flushParagraph();
				flushList();
				continue;
			}

			// 3. Horizontal Rule
			if (hrRegex.test(trimmed)) {
				flushParagraph();
				flushList();
				blocks.push({ type: "hr" });
				continue;
			}

			// 4. Heading
			const headingMatch = line.match(headingRegex);
			if (headingMatch) {
				flushParagraph();
				flushList();
				blocks.push({
					type: "heading",
					level: headingMatch[1].length,
					text: headingMatch[2],
				});
				continue;
			}

			// 5. Blockquote
			const quoteMatch = line.match(quoteRegex);
			if (quoteMatch) {
				flushParagraph();
				flushList();
				blocks.push({
					type: "quote",
					text: quoteMatch[1],
				});
				continue;
			}

			// 6. Bullet / Ordered List Item
			const bulletMatch = line.match(bulletRegex);
			if (bulletMatch) {
				flushParagraph();
				const marker = bulletMatch[1];
				const itemText = bulletMatch[2];
				const isOrdered = /^\d+[.)]/.test(marker);

				if (!currentList || currentList.ordered !== isOrdered) {
					flushList();
					currentList = {
						type: "list",
						ordered: isOrdered,
						items: [],
					};
				}
				currentList.items.push(itemText);
				continue;
			}

			// 7. Indented List Continuation (2+ spaces under an active list)
			if (currentList && currentList.items.length > 0 && /^\s{2,}/.test(line)) {
				currentList.items[currentList.items.length - 1] += " " + trimmed;
				continue;
			}

			// 8. Normal paragraph text
			flushList();
			currentParagraph.push(trimmed);
		}

		if (currentCodeBlock) {
			blocks.push(currentCodeBlock);
		}
		flushParagraph();
		flushList();
		return blocks;
	}

	function SmartMarkdown({ text, className }) {
		if (!text) return null;
		const blocks = parseSmartBlocks(text);

		if (blocks.length === 0) return null;

		return h("div", { className: "cpm-smart-md" + (className ? ` ${className}` : "") },
			blocks.map((b, idx) => {
				if (b.type === "code") {
					return h("pre", { key: idx, className: "cpm-md-pre" },
						h("code", { className: b.lang ? `language-${b.lang}` : "" }, b.code),
					);
				}
				if (b.type === "quote") {
					return h("blockquote", { key: idx, className: "cpm-md-quote" }, renderInlineMarkdownNodes(b.text));
				}
				if (b.type === "hr") {
					return h("hr", { key: idx, className: "cpm-md-hr" });
				}
				if (b.type === "heading") {
					return h("div", { key: idx, className: `cpm-md-heading cpm-md-h${b.level}` }, renderInlineMarkdownNodes(b.text));
				}
				if (b.type === "list") {
					const Tag = b.ordered ? "ol" : "ul";
					return h(Tag, { key: idx, className: "cpm-md-list" + (b.ordered ? " is-ordered" : "") },
						b.items.map((item, itemIdx) => {
							return h("li", { key: itemIdx, className: "cpm-md-list-item" }, renderInlineMarkdownNodes(item));
						}),
					);
				}
				return h("p", { key: idx, className: "cpm-md-p" }, renderInlineMarkdownNodes(b.text));
			}),
		);
	}

	// ────────────────────────────── Floating Plugin Preview Popover ──────────────────────────────
	function PluginPreviewPopover({ preview, isDark, onMouseEnter, onMouseLeave, onClick }) {
		if (!preview || !preview.plugin || !preview.rect) return null;
		const p = preview.plugin;
		const rect = preview.rect;
		const gridRect = preview.gridRect;
		const descRef = useRef(null);
		const [descMaskClass, setDescMaskClass] = useState("");

		const updateDescMask = useCallback(() => {
			const el = descRef.current;
			if (!el) return;
			const { scrollTop, scrollHeight, clientHeight } = el;
			const maxScroll = scrollHeight - clientHeight;
			if (maxScroll <= 2) {
				setDescMaskClass("");
				return;
			}
			const canScrollUp = scrollTop > 2;
			const canScrollDown = scrollTop < maxScroll - 2;
			if (canScrollUp && canScrollDown) {
				setDescMaskClass(" mask-both");
			} else if (canScrollDown) {
				setDescMaskClass(" mask-bottom");
			} else if (canScrollUp) {
				setDescMaskClass(" mask-top");
			} else {
				setDescMaskClass("");
			}
		}, []);

		useEffect(() => {
			updateDescMask();
			const timer = setTimeout(updateDescMask, 40);
			return () => clearTimeout(timer);
		}, [updateDescMask, preview]);

		const popWidth = 360;
		const popHeight = 180;
		const margin = 10;
		const vpW = (typeof window !== "undefined" ? window.innerWidth : 1000) || 1000;
		const vpH = (typeof window !== "undefined" ? window.innerHeight : 800) || 800;

		let left = rect.right + margin;
		let top = rect.top - 6;

		if (left + popWidth + margin > vpW) {
			if (rect.left - popWidth - margin > margin) {
				left = rect.left - popWidth - margin;
			} else {
				left = Math.max(margin, Math.min(rect.left, vpW - popWidth - margin));
				if (rect.bottom + popHeight + margin < vpH) {
					top = rect.bottom + margin;
				} else {
					top = Math.max(margin, rect.top - popHeight - margin);
				}
			}
		}

		top = Math.max(margin, Math.min(top, vpH - popHeight - margin));

		const author = p.author ? (typeof p.author === "string" ? p.author : p.author.name) : null;
		const desc = p.description || "暂无详细功能描述";

		return h("div", {
			className: "cpm-preview-popover",
			style: { left: `${left}px`, top: `${top}px` },
			onMouseEnter,
			onMouseLeave,
			onClick,
		},
			h("div", { className: "cpm-preview-header" },
				h(PluginIcon, { plugin: p, isDark }),
				h("div", { className: "cpm-preview-header-info" },
					h("div", { className: "cpm-preview-title" }, p.displayName || p.name),
					h("div", { className: "cpm-preview-sub" },
						author && h("span", null, `by ${author}`),
						p.version && h("span", { className: "cpm-preview-tag" }, `v${p.version}`),
						p.category && h("span", { className: "cpm-preview-tag" }, p.category),
					),
				),
			),
			h("div", {
				ref: descRef,
				className: "cpm-preview-desc" + descMaskClass,
				onScroll: updateDescMask,
			}, h(SmartMarkdown, { text: desc })),
		);
	}

	// ────────────────────────────── Clearable Input Helper ──────────────────────────────
	// Renders a refined × button inside the input's right edge; shown only while
	// there is content. onMouseDown preventDefault keeps focus in the input after clicking.
	function ClearBtn({ value, onClear }) {
		if (!value) return null;
		return h("button", {
			type: "button",
			className: "cpm-clear-btn",
			"aria-label": "清空",
			onMouseDown: (e) => e.preventDefault(),
			onClick: onClear,
		},
			h("svg", {
				width: 10,
				height: 10,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2.5,
				strokeLinecap: "round",
				strokeLinejoin: "round",
			},
				h("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
				h("line", { x1: "6", y1: "6", x2: "18", y2: "18" }),
			),
		);
	}

	// ────────────────────────────── Browse & Detail Container ──────────────────────────────
	function BrowseView({
		view,
		setView,
		state,
		setState,
		refreshState,
		showToast,
		openManage,
		onInstalled,
		isDark,
		query,
		setQuery,
		filter,
		setFilter,
		sortBy,
		setSortBy,
		activeSourceId,
		setActiveSourceId,
		rows,
		setRows,
		scrollTopRef,
	}) {
		const [showFilter, setShowFilter] = useState(false);
		const [showSort, setShowSort] = useState(false);
		const [busy, setBusy] = useState(null);
		const [isRefreshing, setIsRefreshing] = useState(false);
		const [loadingSourceId, setLoadingSourceId] = useState(null);
		const [addDialog, setAddDialog] = useState(false);
		const [confirmRemoveSource, setConfirmRemoveSource] = useState(null);
		const [installFor, setInstallFor] = useState(null);
		const [hoveredPreview, setHoveredPreview] = useState(null);
		const hoverTimerRef = useRef(null);
		const leaveTimerRef = useRef(null);
		const gridRef = useRef(null);
		const detailContainerRef = useRef(null);
		const tabsRef = useRef(null);
		const tabRefs = useRef({});
		const [gridMaskClass, setGridMaskClass] = useState("");
		// Per-source snapshot of installed plugin names used by the default
		// "installed-first" sort. Lives on module-level SESSION_STORE, not a
		// component ref or state: it must survive the BrowseView unmount that
		// happens when the manage page opens, and it must NOT re-run against
		// live `state.plugins` on every re-render (which is what kept a
		// freshly installed plugin in its alphabetical slot after install).
		// A source's snapshot is built only on its first visit this session;
		// afterwards it is sticky until an explicit user re-sort (clicking the
		// current tab, picking a filter/sort menu item, or market refresh)
		// rebuilds it via `refreshInstalledSnapshot`.
		const installedSnapshots = SESSION_STORE.installedSnapshots || (SESSION_STORE.installedSnapshots = {});
		if (!installedSnapshots[activeSourceId]) {
			installedSnapshots[activeSourceId] = new Set(
				(state.plugins || []).filter((p) => p.sourceId === activeSourceId).map((p) => p.name)
			);
		}
		const sortInstalledSnapshot = installedSnapshots[activeSourceId] || new Set();

		// Bumped whenever the user explicitly re-selects a filter/sort menu
		// item (even when the value didn't change, e.g. picking "全部插件"
		// while already in "all"). Forces the `visible` memo to recompute so
		// the "installed-first" sort picks up plugins installed since the
		// snapshot was last refreshed.
		const [sortTick, setSortTick] = useState(0);

		// Explicitly rebuild the installed-snapshot for a source. Called when the
		// user explicitly re-sorts: clicking the current source's own tab,
		// picking a filter/sort menu item, or market refresh. This is the ONLY
		// writer that promotes plugins installed since the last visit into the
		// "installed-first" group (scroll-to-top and re-sort are bound — a
		// programmatic scroll-to-top re-sorts; manual wheel scrolling does not).
		const refreshInstalledSnapshot = useCallback((sourceId) => {
			const sid = sourceId || activeSourceId;
			if (!sid) return;
			const snapshots = SESSION_STORE.installedSnapshots || (SESSION_STORE.installedSnapshots = {});
			snapshots[sid] = new Set(
				(state.plugins || []).filter((p) => p.sourceId === sid).map((p) => p.name)
			);
		}, [activeSourceId, state.plugins]);

		// Detail View Data Fetching & LRU Cache
		const [detail, setDetail] = useState(null);
		const detailCacheRef = useRef({});
		const gridMaskRafRef = useRef(null);

		const prefetchDetail = useCallback((sourceId, pluginName) => {
			if (!sourceId || !pluginName) return;
			const cacheKey = `${sourceId}:${pluginName}`;
			if (!detailCacheRef.current[cacheKey]) {
				api("/plugins/" + encodeURIComponent(sourceId) + "/" + encodeURIComponent(pluginName))
					.then((body) => {
						if (body && body.plugin) {
							detailCacheRef.current[cacheKey] = body.plugin;
						}
					})
					.catch(() => {});
			}
		}, []);

		const updateGridMask = useCallback(() => {
			if (gridMaskRafRef.current) return;
			gridMaskRafRef.current = requestAnimationFrame(() => {
				gridMaskRafRef.current = null;
				const el = gridRef.current;
				if (!el) return;
				const { scrollTop, scrollHeight, clientHeight } = el;
				const maxScroll = scrollHeight - clientHeight;
				if (maxScroll <= 4) {
					setGridMaskClass("");
					return;
				}
				const canScrollDown = scrollTop < maxScroll - 4;
				setGridMaskClass(canScrollDown ? " mask-bottom" : "");
			});
		}, []);

		const scrollContentToTop = useCallback(() => {
			if (gridRef.current && gridRef.current.scrollTop > 0) {
				smoothScrollToTop(gridRef.current, 280, updateGridMask);
			}
			if (detailContainerRef.current && detailContainerRef.current.scrollTop > 0) {
				smoothScrollToTop(detailContainerRef.current, 280);
			}
		}, [updateGridMask]);

		useEffect(() => {
			updateGridMask();
			window.addEventListener("resize", updateGridMask);
			return () => {
				window.removeEventListener("resize", updateGridMask);
				if (gridMaskRafRef.current) cancelAnimationFrame(gridMaskRafRef.current);
			};
		}, [updateGridMask]);

		useEffect(() => {
			const timer = setTimeout(updateGridMask, 60);
			return () => clearTimeout(timer);
		}, [activeSourceId, rows, updateGridMask]);

		const isScrollingRef = useRef(false);
		const scrollTimerRef = useRef(null);
		const pendingHoverRef = useRef(null);

		const triggerPendingHover = useCallback(() => {
			if (!pendingHoverRef.current || !gridRef.current) return;
			const { plugin, el } = pendingHoverRef.current;
			if (el && document.body.contains(el)) {
				const rect = el.getBoundingClientRect();
				const gridRect = gridRef.current.getBoundingClientRect();
				if (rect.bottom >= gridRect.top + 8 && rect.top <= gridRect.bottom - 8) {
					setHoveredPreview({ plugin, rect, gridRect });
					prefetchDetail(plugin.sourceId || activeSourceId, plugin.name);
				}
			}
		}, [activeSourceId, prefetchDetail]);

		const handleCardMouseEnter = useCallback((p, el) => {
			pendingHoverRef.current = { plugin: p, el };
			if (leaveTimerRef.current) {
				clearTimeout(leaveTimerRef.current);
				leaveTimerRef.current = null;
			}
			if (hoverTimerRef.current) {
				clearTimeout(hoverTimerRef.current);
				hoverTimerRef.current = null;
			}
			if (isScrollingRef.current) {
				return;
			}
			hoverTimerRef.current = setTimeout(() => {
				if (isScrollingRef.current) return;
				if (pendingHoverRef.current && pendingHoverRef.current.plugin.id === p.id) {
					triggerPendingHover();
				}
			}, 240);
		}, [triggerPendingHover]);

		const handleCardMouseLeave = useCallback((p) => {
			if (pendingHoverRef.current && (!p || pendingHoverRef.current.plugin.id === p.id)) {
				pendingHoverRef.current = null;
			}
			if (hoverTimerRef.current) {
				clearTimeout(hoverTimerRef.current);
				hoverTimerRef.current = null;
			}
			leaveTimerRef.current = setTimeout(() => {
				setHoveredPreview(null);
			}, 140);
		}, []);

		const handlePopoverMouseEnter = useCallback(() => {
			if (leaveTimerRef.current) {
				clearTimeout(leaveTimerRef.current);
				leaveTimerRef.current = null;
			}
		}, []);

		const handlePopoverMouseLeave = useCallback(() => {
			leaveTimerRef.current = setTimeout(() => {
				setHoveredPreview(null);
			}, 140);
		}, []);

		const updateTabsMask = useCallback(() => {
			const el = tabsRef.current;
			if (!el) return;
			const { scrollLeft, scrollWidth, clientWidth } = el;
			const maxScroll = scrollWidth - clientWidth;
			if (maxScroll <= 2) {
				el.classList.remove("mask-left", "mask-right", "mask-both");
				return;
			}
			const canScrollLeft = scrollLeft > 2;
			const canScrollRight = scrollLeft < maxScroll - 2;

			if (canScrollLeft && canScrollRight) {
				if (!el.classList.contains("mask-both")) {
					el.classList.remove("mask-left", "mask-right");
					el.classList.add("mask-both");
				}
			} else if (canScrollRight) {
				if (!el.classList.contains("mask-right")) {
					el.classList.remove("mask-left", "mask-both");
					el.classList.add("mask-right");
				}
			} else if (canScrollLeft) {
				if (!el.classList.contains("mask-left")) {
					el.classList.remove("mask-right", "mask-both");
					el.classList.add("mask-left");
				}
			} else {
				el.classList.remove("mask-left", "mask-right", "mask-both");
			}
		}, []);

		// Native wheel listener for smooth horizontal tab scrolling with passive: false
		useEffect(() => {
			const el = tabsRef.current;
			if (!el) return;

			const handleWheel = (e) => {
				const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
				if (Math.abs(delta) < 0.1) return;

				const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
				if (maxLeft <= 0) return;

				e.preventDefault();
				e.stopPropagation();

				if (hoveredPreview) setHoveredPreview(null);
				if (currentTabAnim) {
					cancelAnimationFrame(currentTabAnim);
					currentTabAnim = null;
					currentTabTarget = null;
				}

				el.scrollLeft = Math.max(0, Math.min(maxLeft, el.scrollLeft + delta));
				updateTabsMask();
			};

			el.addEventListener("wheel", handleWheel, { passive: false });
			return () => {
				el.removeEventListener("wheel", handleWheel);
			};
		}, [hoveredPreview, updateTabsMask, state.sources]);

		useEffect(() => {
			setHoveredPreview(null);
		}, [activeSourceId, view?.type]);

		useEffect(() => {
			return () => {
				if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
				if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
				if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
			};
		}, []);

		useSafeLayoutEffect(() => {
			updateTabsMask();
			window.addEventListener("resize", updateTabsMask);
			return () => {
				window.removeEventListener("resize", updateTabsMask);
			};
		}, [updateTabsMask, state.sources, view?.type]);

		const prevSourceRef = useRef(activeSourceId);

		const scrollActiveTabIntoView = useCallback((tabId, animated = true) => {
			const container = tabsRef.current;
			const tabEl = tabRefs.current[tabId];
			if (!container || !tabEl) return;

			const tabLeft = tabEl.offsetLeft;
			const tabWidth = tabEl.offsetWidth;
			const tabRight = tabLeft + tabWidth;
			const currentScroll = (currentTabTarget !== null) ? currentTabTarget : container.scrollLeft;
			const containerWidth = container.clientWidth;

			let targetScroll = currentScroll;
			// 1. Rightward overflow: if tab is covered by right feathering mask (28px)
			if (tabRight > currentScroll + containerWidth - 28) {
				targetScroll = tabRight - containerWidth + 26;
			}
			// 2. Leftward overflow: if tab is covered by left feathering mask (26px safe distance)
			else if (tabLeft < currentScroll + 26) {
				targetScroll = Math.max(0, tabLeft - 26);
			}

			if (Math.abs(targetScroll - container.scrollLeft) > 1) {
				if (animated) {
					smoothScrollTabsTo(container, targetScroll, 280, updateTabsMask);
				} else {
					container.scrollLeft = targetScroll;
					updateTabsMask();
				}
			} else {
				updateTabsMask();
			}
		}, [updateTabsMask]);

		useSafeLayoutEffect(() => {
			if (view?.type === "browse" || !view?.type) {
				updateTabsMask();
			}
		}, [view?.type, updateTabsMask]);

		useEffect(() => {
			if (prevSourceRef.current !== activeSourceId) {
				prevSourceRef.current = activeSourceId;
				scrollActiveTabIntoView(activeSourceId, true);
			}
		}, [activeSourceId, scrollActiveTabIntoView]);

		// Restore the active tab into view synchronously after mount. A
		// `useLayoutEffect` runs in the same commit as the tab DOM (refs
		// are populated and offsetLeft/offsetWidth are accurate) but before
		// the first paint, so the user never sees the tabs at scrollLeft=0
		// (the fresh-mount default) before they jump to the active position.
		//
		// Reset the module-level `currentTabTarget` before each scroll: it
		// is the in-flight target for a smoothScrollTabsTo animation and
		// `scrollActiveTabIntoView` reads it as the baseline for the next
		// target. A stale value from an animation that was interrupted by
		// the BrowseView unmount would otherwise cause the new mount to
		// compute its target relative to the old (different) scrollLeft.
		//
		// The deps include `state.sources` (and its length) because both the
		// parent's `refreshState` and the manage page's own `refreshState`
		// (which fires on its own mount) can return a slightly different
		// sources list after BrowseView mounts, shifting every tab's
		// offsetLeft. The previous `[]`-deps fix only caught the first
		// paint — re-runs after the state update would land the user on
		// the wrong scroll position for that second paint.
		useSafeLayoutEffect(() => {
			currentTabTarget = null;
			scrollActiveTabIntoView(activeSourceId, false);
		}, [activeSourceId, state.sources, state.sources.length, scrollActiveTabIntoView]);

		// ────────────────────────────── Tab Long-Press Drag Reorder ──────────────────────────────
		const [dragState, setDragState] = useState(null);
		const dragLiveRef = useRef({
			active: false,
			isSnapping: false,
			sourceId: null,
			sourceName: "",
			fromIndex: -1,
			toIndex: -1,
			startX: 0,
			startY: 0,
			startScrollLeft: 0,
			lastClientX: 0,
			startOverlayX: 0,
			startOverlayY: 0,
			pointerOffsetX: 0,
			currentOverlayX: 0,
			currentOverlayY: 0,
			pointerId: null,
			baseSlots: [],
			draggedWidth: 0,
			draggedHeight: 0,
			slotSize: 0,
			scrollSpeed: 0,
			containerRect: null,
		});
		const longPressTimerRef = useRef(null);
		const autoScrollRafRef = useRef(null);
		const isLongPressTriggeredRef = useRef(false);
		const snapTimerRef = useRef(null);

		const stopAutoScroll = useCallback(() => {
			if (autoScrollRafRef.current) {
				cancelAnimationFrame(autoScrollRafRef.current);
				autoScrollRafRef.current = null;
			}
		}, []);

		const updateDragPosition = useCallback((clientX) => {
			if (!dragLiveRef.current.active || dragLiveRef.current.isSnapping) return;
			const container = tabsRef.current;
			if (!container) return;

			const { pointerOffsetX, startOverlayY, fromIndex, baseSlots, draggedWidth } = dragLiveRef.current;
			const overlayX = clientX - pointerOffsetX;
			dragLiveRef.current.currentOverlayX = overlayX;

			const cRect = container.getBoundingClientRect();
			const curScroll = container.scrollLeft;

			// Visual center of dragged tab in container scroll content coordinate
			const contentCenter = (overlayX + (draggedWidth / 2)) - cRect.left + curScroll;
			const numSlots = baseSlots.length;

			let newIdx = fromIndex;

			if (numSlots >= 3) {
				const firstMoveable = 1;
				const lastMoveable = numSlots - 1;

				const firstCenter = baseSlots[firstMoveable].offsetLeft + (baseSlots[firstMoveable].width / 2);
				const lastCenter = baseSlots[lastMoveable].offsetLeft + (baseSlots[lastMoveable].width / 2);

				if (contentCenter <= firstCenter) {
					newIdx = firstMoveable;
				} else if (contentCenter >= lastCenter) {
					newIdx = lastMoveable;
				} else {
					newIdx = firstMoveable;
					for (let i = firstMoveable; i < lastMoveable; i++) {
						const currentSlot = baseSlots[i];
						const nextSlot = baseSlots[i + 1];
						const midBoundary = (currentSlot.offsetLeft + (currentSlot.width / 2) + nextSlot.offsetLeft + (nextSlot.width / 2)) / 2;
						if (contentCenter > midBoundary) {
							newIdx = i + 1;
						}
					}
				}
			}

			newIdx = Math.max(1, Math.min(numSlots - 1, newIdx));

			dragLiveRef.current.toIndex = newIdx;
			setDragState((prev) => prev ? {
				...prev,
				toIndex: newIdx,
				overlayX,
				overlayY: startOverlayY,
			} : null);
		}, []);

		const startAutoScroll = useCallback(() => {
			if (autoScrollRafRef.current) return;
			const step = () => {
				const container = tabsRef.current;
				const speed = dragLiveRef.current.scrollSpeed;
				if (!container || !dragLiveRef.current.active || dragLiveRef.current.isSnapping || Math.abs(speed) < 0.1) {
					autoScrollRafRef.current = null;
					return;
				}
				container.scrollLeft += speed;
				updateTabsMask();

				updateDragPosition(dragLiveRef.current.lastClientX);

				autoScrollRafRef.current = requestAnimationFrame(step);
			};
			autoScrollRafRef.current = requestAnimationFrame(step);
		}, [updateTabsMask, updateDragPosition]);

		const cancelOrResetDrag = useCallback(() => {
			if (longPressTimerRef.current) {
				clearTimeout(longPressTimerRef.current);
				longPressTimerRef.current = null;
			}
			stopAutoScroll();
			if (snapTimerRef.current) {
				clearTimeout(snapTimerRef.current);
				snapTimerRef.current = null;
			}

			if (dragLiveRef.current.active) {
				const { pointerId, fromIndex, toIndex } = dragLiveRef.current;
				if (pointerId !== null) {
					try {
						const el = tabRefs.current[dragLiveRef.current.sourceId];
						if (el && typeof el.releasePointerCapture === "function") {
							el.releasePointerCapture(pointerId);
						}
					} catch {}
				}

				if (toIndex !== fromIndex && fromIndex >= 1 && toIndex >= 1) {
					const newSources = [...state.sources];
					const [moved] = newSources.splice(fromIndex, 1);
					newSources.splice(toIndex, 0, moved);
					setState((prev) => ({ ...prev, sources: newSources }));
					SESSION_STORE.state = { ...(SESSION_STORE.state || {}), sources: newSources };
					try {
						localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(SESSION_STORE.state));
					} catch {}
					api("/sources/reorder", {
						method: "POST",
						body: JSON.stringify({ sourceIds: newSources.map((item) => item.id) }),
					}).catch(() => {});
				}

				dragLiveRef.current.active = false;
				dragLiveRef.current.isSnapping = false;
				dragLiveRef.current.pointerId = null;
				dragLiveRef.current.startX = 0;
				dragLiveRef.current.startY = 0;
				isLongPressTriggeredRef.current = false;
				setDragState(null);
				updateTabsMask();
			}
		}, [state.sources, setState, stopAutoScroll, updateTabsMask]);

		const handleTabPointerDown = useCallback((e, s, idx) => {
			if (e.button !== 0) return;
			if (e.target && e.target.closest && e.target.closest(".cpm-tab-del-zone")) return;
			if (dragLiveRef.current.active || dragState) {
				cancelOrResetDrag();
			}
			if (s.builtin || idx === 0 || (s.id && s.id.toLowerCase() === "anthropic")) return;
			if (!state.sources || state.sources.length < 3) return;

			const pointerId = e.pointerId;
			const clientX = e.clientX;
			const clientY = e.clientY;
			const targetEl = e.currentTarget;

			isLongPressTriggeredRef.current = false;
			if (snapTimerRef.current) {
				clearTimeout(snapTimerRef.current);
				snapTimerRef.current = null;
			}

			// Immediately initialize start coordinates and reset active state for clean subsequent drags
			dragLiveRef.current.startX = clientX;
			dragLiveRef.current.startY = clientY;
			dragLiveRef.current.lastClientX = clientX;
			dragLiveRef.current.pointerId = pointerId;
			dragLiveRef.current.active = false;
			dragLiveRef.current.isSnapping = false;

			const container = tabsRef.current;
			const curScroll = container ? container.scrollLeft : 0;

			if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = setTimeout(() => {
				isLongPressTriggeredRef.current = true;
				if (targetEl && typeof targetEl.setPointerCapture === "function") {
					try { targetEl.setPointerCapture(pointerId); } catch {}
				}
				const cont = tabsRef.current;
				if (!cont) return;
				const cRect = cont.getBoundingClientRect();
				const tRect = targetEl.getBoundingClientRect();

				// Capture invariant base slots (offsetLeft / offsetWidth are immune to CSS transforms)
				const baseSlots = state.sources.map((item, mIdx) => {
					const el = tabRefs.current[item.id];
					if (!el) return { id: item.id, index: mIdx, offsetLeft: 0, width: 60, height: 30 };
					return {
						id: item.id,
						index: mIdx,
						offsetLeft: el.offsetLeft,
						width: el.offsetWidth,
						height: el.offsetHeight || 30,
					};
				});

				const draggedSlot = baseSlots[idx];
				if (!draggedSlot) return;

				const startOverlayX = tRect.left;
				const startOverlayY = tRect.top;
				const pointerOffsetX = clientX - startOverlayX;
				const draggedWidth = draggedSlot.width;
				const draggedHeight = draggedSlot.height;
				const slotSize = draggedWidth + 2;

				dragLiveRef.current = {
					active: true,
					isSnapping: false,
					sourceId: s.id,
					sourceName: s.name,
					fromIndex: idx,
					toIndex: idx,
					startX: clientX,
					startY: clientY,
					startScrollLeft: curScroll,
					lastClientX: clientX,
					startOverlayX,
					startOverlayY,
					pointerOffsetX,
					currentOverlayX: startOverlayX,
					currentOverlayY: startOverlayY,
					pointerId,
					baseSlots,
					draggedWidth,
					draggedHeight,
					slotSize,
					scrollSpeed: 0,
					containerRect: cRect,
				};

				setDragState({
					active: true,
					isSnapping: false,
					sourceId: s.id,
					sourceName: s.name,
					fromIndex: idx,
					toIndex: idx,
					overlayX: startOverlayX,
					overlayY: startOverlayY,
					width: draggedWidth,
					height: draggedHeight,
					snapTargetX: startOverlayX,
					snapTargetY: startOverlayY,
				});
			}, 200);
		}, [state.sources, cancelOrResetDrag, dragState]);

		const handleTabPointerMove = useCallback((e) => {
			if (longPressTimerRef.current && !dragLiveRef.current.active) {
				if (Math.hypot(e.clientX - dragLiveRef.current.startX, e.clientY - dragLiveRef.current.startY) > 8) {
					clearTimeout(longPressTimerRef.current);
					longPressTimerRef.current = null;
				}
				return;
			}
			if (!dragLiveRef.current.active || dragLiveRef.current.isSnapping) return;

			e.preventDefault();
			dragLiveRef.current.lastClientX = e.clientX;
			updateDragPosition(e.clientX);

			// Edge Auto-Scroll
			const cRect = dragLiveRef.current.containerRect;
			if (cRect) {
				if (e.clientX < cRect.left + 30) {
					dragLiveRef.current.scrollSpeed = -Math.min(10, Math.max(2, (cRect.left + 30 - e.clientX) * 0.3));
					startAutoScroll();
				} else if (e.clientX > cRect.right - 30) {
					dragLiveRef.current.scrollSpeed = Math.min(10, Math.max(2, (e.clientX - (cRect.right - 30)) * 0.3));
					startAutoScroll();
				} else {
					dragLiveRef.current.scrollSpeed = 0;
					stopAutoScroll();
				}
			}
		}, [startAutoScroll, stopAutoScroll, updateDragPosition]);

		const handleTabPointerUp = useCallback((e, s, idx) => {
			if (longPressTimerRef.current) {
				clearTimeout(longPressTimerRef.current);
				longPressTimerRef.current = null;
			}
			stopAutoScroll();

			const wasActive = dragLiveRef.current.active;
			const { fromIndex, toIndex, pointerId, baseSlots, draggedWidth } = dragLiveRef.current;

			if (e && e.currentTarget && typeof e.currentTarget.releasePointerCapture === "function" && pointerId !== null) {
				try { e.currentTarget.releasePointerCapture(pointerId); } catch {}
			}

			if (wasActive && !dragLiveRef.current.isSnapping) {
				dragLiveRef.current.isSnapping = true;
				const container = tabsRef.current;
				const cRect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
				const curScroll = container ? container.scrollLeft : 0;

				let snapX = dragLiveRef.current.currentOverlayX;
				let snapY = dragLiveRef.current.startOverlayY;

				if (baseSlots && baseSlots[toIndex]) {
					const targetSlot = baseSlots[toIndex];
					if (toIndex > fromIndex) {
						snapX = cRect.left + (targetSlot.offsetLeft - curScroll) + targetSlot.width - draggedWidth;
					} else {
						snapX = cRect.left + (targetSlot.offsetLeft - curScroll);
					}
				}

				setDragState((prev) => prev ? {
					...prev,
					isSnapping: true,
					snapTargetX: snapX,
					snapTargetY: snapY,
				} : null);

				snapTimerRef.current = setTimeout(() => {
					if (toIndex !== fromIndex && fromIndex >= 1 && toIndex >= 1) {
						const newSources = [...state.sources];
						const [moved] = newSources.splice(fromIndex, 1);
						newSources.splice(toIndex, 0, moved);
						setState((prev) => ({ ...prev, sources: newSources }));
						SESSION_STORE.state = { ...(SESSION_STORE.state || {}), sources: newSources };
						try {
							localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(SESSION_STORE.state));
						} catch {}
						api("/sources/reorder", {
							method: "POST",
							body: JSON.stringify({ sourceIds: newSources.map((item) => item.id) }),
						}).catch(() => {});
						showToast("标签排序已更新", `已将「${moved.name}」移至第 ${toIndex + 1} 位`, { restart: false });
					}
					dragLiveRef.current.active = false;
					dragLiveRef.current.isSnapping = false;
					dragLiveRef.current.pointerId = null;
					dragLiveRef.current.startX = 0;
					dragLiveRef.current.startY = 0;
					isLongPressTriggeredRef.current = false;
					setDragState(null);
					snapTimerRef.current = null;
					updateTabsMask();
				}, 190);
				return;
			}

			// Normal click action
			if (!isLongPressTriggeredRef.current && s) {
				const isBrowseView = !view || view.type === "browse";
				const sInstalledCount = (state.plugins || []).filter((p) => (p.sourceId || "").toLowerCase() === s.id.toLowerCase() || (p.id && p.id.startsWith(s.id + "/"))).length;
				if (s.id !== activeSourceId) {
					if (gridRef.current && isBrowseView) {
						if (!SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
						SESSION_STORE.scrollTops[activeSourceId] = gridRef.current.scrollTop;
					}
					if (!SESSION_STORE.sourceFilters) SESSION_STORE.sourceFilters = {};

					let targetFilter = filter;
					if (sInstalledCount === 0) {
						if (filter === "installed") {
							SESSION_STORE.preferredFilter = "installed";
						}
						targetFilter = "all";
					} else {
						targetFilter = SESSION_STORE.sourceFilters[s.id] || SESSION_STORE.preferredFilter || (filter === "installed" ? "installed" : "all");
					}
					setActiveSourceId(s.id, targetFilter);
				} else {
					// Clicking the current source's own tab: this is the
					// "scroll back to top" gesture. The scroll resets to top,
					// and in lockstep the default sort re-runs so a plugin
					// installed since the last refresh is promoted into the
					// "installed-first" group at the top. (Only programmatic
					// scroll-to-top re-sorts; manual wheel-scrolling never does.)
					scrollActiveTabIntoView(s.id, true);
					if (!SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
					SESSION_STORE.scrollTops[s.id] = 0;
					refreshInstalledSnapshot(s.id);
					setSortTick((t) => t + 1);
					scrollContentToTop();
				}
			}
		}, [state.sources, state.plugins, activeSourceId, view, filter, setActiveSourceId, scrollActiveTabIntoView, scrollContentToTop, setState, showToast, stopAutoScroll, updateTabsMask]);

		useEffect(() => {
			const handleWindowBlurOrCancel = () => {
				if (dragLiveRef.current.active) {
					cancelOrResetDrag();
				}
			};

			const handleGlobalPointerUp = (e) => {
				if (dragLiveRef.current.active && !dragLiveRef.current.isSnapping) {
					handleTabPointerUp(e, null, dragLiveRef.current.fromIndex);
				}
			};

			window.addEventListener("blur", handleWindowBlurOrCancel);
			window.addEventListener("pointerup", handleGlobalPointerUp);
			window.addEventListener("pointercancel", handleWindowBlurOrCancel);
			document.addEventListener("visibilitychange", handleWindowBlurOrCancel);

			return () => {
				window.removeEventListener("blur", handleWindowBlurOrCancel);
				window.removeEventListener("pointerup", handleGlobalPointerUp);
				window.removeEventListener("pointercancel", handleWindowBlurOrCancel);
				document.removeEventListener("visibilitychange", handleWindowBlurOrCancel);
				if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
				if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current);
			};
		}, [cancelOrResetDrag, handleTabPointerUp]);

		const cleanError = (err) => {
			if (!err) return "操作失败";
			let msg = String(err.message || err).replace(/^Error:\s*/i, "").trim();
			if (msg.length > 50) msg = msg.slice(0, 48) + "…";
			return msg;
		};

		const isBrowse = !view || view.type === "browse";

		// Per-source Scroll restoration and wheel scroll suppression
		const onGridWheel = useCallback(() => {
			if (hoverTimerRef.current) {
				clearTimeout(hoverTimerRef.current);
				hoverTimerRef.current = null;
			}
			if (leaveTimerRef.current) {
				clearTimeout(leaveTimerRef.current);
				leaveTimerRef.current = null;
			}
			isScrollingRef.current = true;
			if (hoveredPreview) setHoveredPreview(null);

			if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
			scrollTimerRef.current = setTimeout(() => {
				isScrollingRef.current = false;
				if (pendingHoverRef.current) {
					triggerPendingHover();
				}
			}, 180);
		}, [hoveredPreview, triggerPendingHover]);

		const onGridScroll = useCallback((e) => {
			if (hoverTimerRef.current) {
				clearTimeout(hoverTimerRef.current);
				hoverTimerRef.current = null;
			}
			isScrollingRef.current = true;
			if (hoveredPreview) setHoveredPreview(null);

			if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
			scrollTimerRef.current = setTimeout(() => {
				isScrollingRef.current = false;
				if (pendingHoverRef.current) {
					triggerPendingHover();
				}
			}, 180);

			updateGridMask();
			if (e && e.target && isBrowse) {
				const top = e.target.scrollTop;
				if (!SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
				SESSION_STORE.scrollTops[activeSourceId] = top;
			}
		}, [isBrowse, activeSourceId, hoveredPreview, updateGridMask, triggerPendingHover]);

		// Per-source scroll state.
		//
		// `pendingScrollTopRef` is the single source of truth for what the
		// grid should be scrolled to after the next commit:
		//   - { type: "restore" } — active source changed: back to the saved
		//     scrollTop for the source the user switched to.
		//   - { type: "reset" }  — filter/sort explicitly changed
		//     (全部插件/已安装/排序): back to 0. Deliberately does NOT zero
		//     the saved `scrollTops[...]` for the source, so a filter/sort
		//     change doesn't wipe the tab-switch memory.
		//   - null               — nothing pending: installs, detail view
		//     open/close, plain re-renders leave scroll alone.
		//
		// The change detection uses dedicated last-* refs, NOT the pending
		// value: after the apply-step clears pending back to null, a fresh
		// unrelated re-render (e.g. the refreshState that follows an install)
		// must NOT re-detect "filter changed". Only genuine user-driven
		// changes set a new pending intent.
		//
		// Ref-based, so the apply-step's dependency array stays stable (only
		// `isBrowse`, which flips once per mount). The restore therefore never
		// fires spuriously on unrelated re-renders and never gets clobbered by
		// onGridScroll overwriting the store with a stale value.
		const pendingScrollTopRef = useRef(null);
		const lastActiveSourceRef = useRef(activeSourceId);
		const lastFilterRef = useRef(filter);
		const lastSortByRef = useRef(sortBy);
		const prevIsBrowseRef = useRef(isBrowse);
		const firstBrowseRenderRef = useRef(true);

		if (lastActiveSourceRef.current !== activeSourceId) {
			lastActiveSourceRef.current = activeSourceId;
			pendingScrollTopRef.current = { type: "restore" };
		}
		if (filter !== lastFilterRef.current) {
			lastFilterRef.current = filter;
			// A tab switch can change the remembered filter for the newly
			// active source. That must NOT win over the restore intent that
			// was just set above — switching tabs should put you back where
			// you left that source, not at the top. So only set reset when
			// there is no restore already pending for this commit.
			if (pendingScrollTopRef.current?.type !== "restore") {
				pendingScrollTopRef.current = { type: "reset", filter, sortBy };
			}
		}
		if (sortBy !== lastSortByRef.current) {
			lastSortByRef.current = sortBy;
			if (pendingScrollTopRef.current?.type !== "restore") {
				pendingScrollTopRef.current = { type: "reset", filter, sortBy };
			}
		}
		// Returning from the detail view unmounts the grid (isBrowse flips to
		// false while the detail overlay shows). When coming back (false→true)
		// the grid is freshly mounted at scrollTop 0 — restore the position
		// that was saved right before the detail was opened.
		if (isBrowse && prevIsBrowseRef.current === false && pendingScrollTopRef.current?.type !== "restore") {
			pendingScrollTopRef.current = { type: "restore" };
		}
		prevIsBrowseRef.current = isBrowse;
		// BrowseView itself is unmounted while the manage page is open. When
		// it remounts (manage closed), there is no isBrowse flip — detect the
		// fresh mount and restore the position saved before manage opened.
		if (firstBrowseRenderRef.current && isBrowse && pendingScrollTopRef.current === null) {
			const saved = SESSION_STORE.scrollTops && SESSION_STORE.scrollTops[activeSourceId];
			if (typeof saved === "number") {
				pendingScrollTopRef.current = { type: "restore" };
			}
		}
		firstBrowseRenderRef.current = false;

		// `appliedScrollTopRef` records the position the layout effect just
		// applied (null = nothing pending). The rAF below re-asserts it once
		// after layout has fully settled, because the layout effect runs
		// synchronously after commit while the grid's content (installed
		// groups / market rows / late-loading avatars) may not be laid out
		// yet, and the browser clamps scrollTop when it exceeds the current
		// scrollHeight. Re-applying on the next frame makes the restore stick.
		//
		// NOTE: the apply layout effect deliberately depends on `isBrowse`
		// and `activeSourceId` — a tab switch changes activeSourceId, and
		// that MUST trigger the restore. The change-detection (last-* refs)
		// above runs during render and only sets pending for genuine changes,
		// so a spurious re-render (install-triggered refreshState) won't
		// fire this.
		const appliedScrollTopRef = useRef(null);
		useSafeLayoutEffect(() => {
			if (!isBrowse || !gridRef.current) return;
			const pending = pendingScrollTopRef.current;
			if (!pending) return;
			if (pending.type === "reset" && (pending.filter !== filter || pending.sortBy !== sortBy)) return;
			const target = pending.type === "restore"
				? ((SESSION_STORE.scrollTops && SESSION_STORE.scrollTops[activeSourceId]) || 0)
				: 0;
			// Capture sourceId so the follow-up rAF can re-validate against
			// this source's store value instead of a stale closure.
			appliedScrollTopRef.current = { sourceId: activeSourceId, target };
			gridRef.current.scrollTop = target;
			pendingScrollTopRef.current = null;
			updateGridMask();
		}, [isBrowse, activeSourceId, updateGridMask]);

		useEffect(() => {
			if (!isBrowse) return;
			const applied = appliedScrollTopRef.current;
			if (applied === null) return;
			const { sourceId, target } = applied;
			const raf = requestAnimationFrame(() => {
				appliedScrollTopRef.current = null;
				// Only re-assert if the store still wants this position. If the
				// user scrolled elsewhere (wheel) or programmatically moved the
				// scroll to top (clicked the current tab / picked a filter) this
				// source's stored value differs, so skip — otherwise this would
				// undo the user's explicit scroll-to-top with a stale restore.
				if (gridRef.current && target > 0 && gridRef.current.scrollTop !== target) {
					const still = SESSION_STORE.scrollTops && SESSION_STORE.scrollTops[sourceId];
					if (still === target) {
						gridRef.current.scrollTop = target;
						updateGridMask();
					}
				}
			});
			return () => cancelAnimationFrame(raf);
		}, [isBrowse, activeSourceId, updateGridMask]);

		useEffect(() => {
			const onDocClick = (e) => {
				if (!e.target.closest(".cpm-filter") && !e.target.closest(".cpm-sort") && !e.target.closest(".cpm-menu-pop")) {
					setShowFilter(false);
					setShowSort(false);
				}
			};
			if (showFilter || showSort) {
				document.addEventListener("mousedown", onDocClick);
				return () => document.removeEventListener("mousedown", onDocClick);
			}
		}, [showFilter, showSort]);

		const loadMarket = useCallback(async (sourceId, force = false) => {
			if (!force && rows && rows[sourceId]) {
				return;
			}
			setLoadingSourceId(sourceId);
			try {
				const body = await api("/market?sourceId=" + encodeURIComponent(sourceId));
				setRows((prev) => ({ ...(prev || {}), [sourceId]: body.plugins || [] }));
			} catch (e) {
				showToast("加载失败", e.message, { restart: false });
				setRows((prev) => ({ ...(prev || {}), [sourceId]: [] }));
			} finally {
				setLoadingSourceId(null);
			}
		}, [showToast, setRows, rows]);

		useEffect(() => {
			if (!rows || !rows[activeSourceId]) {
				loadMarket(activeSourceId);
			}
		}, [activeSourceId, loadMarket, rows]);

		const currentSourceInstalledNames = useMemo(() => new Set((state.plugins || []).filter((p) => p.sourceId === activeSourceId).map((p) => p.name)), [state.plugins, activeSourceId]);
		const installedNames = useMemo(() => new Set(state.plugins.map((p) => p.name)), [state.plugins]);
		const totalInstalledCount = state.plugins.length;
		const currentSourcePlugins = useMemo(() => (rows && rows[activeSourceId]) || [], [rows, activeSourceId]);
		const totalSourcePluginsCount = currentSourcePlugins.length;

		// Grouped installed plugins across all sources. The active source's
		// installed plugins pin to the top of the manage view (mirroring the
		// browse view, where the active source is also foregrounded); the
		// remaining sources keep their stored order in `state.sources`.
		const installedSourceGroups = useMemo(() => {
			if (filter !== "installed") return [];

			const orderedSources = state.sources || [];
			const activeFirstSources = activeSourceId
				? [
					...orderedSources.filter((s) => s && s.id === activeSourceId),
					...orderedSources.filter((s) => s && s.id !== activeSourceId),
				]
				: orderedSources;

			const groups = [];

			for (const src of activeFirstSources) {
				let srcInstalled = state.plugins.filter((p) => p.sourceId === src.id);
				if (srcInstalled.length === 0) continue; // If 0 installed, do NOT display this section!

				// Enrich each installed plugin record with market metadata if present
				srcInstalled = srcInstalled.map((p) => {
					const marketRow = (rows && rows[src.id]) ? rows[src.id].find((r) => r.name === p.name) : null;
					return marketRow ? { ...marketRow, ...p } : p;
				});

				// Search query filter
				if (query.trim()) {
					srcInstalled = srcInstalled
						.map((p) => ({ plugin: p, score: calcSearchScore(query, p) }))
						.filter((r) => r.score > 0)
						.sort((a, b) => b.score - a.score)
						.map((r) => r.plugin);
				}

				if (srcInstalled.length === 0) continue;

				// Sorting
				if (sortBy === "name-asc") {
					srcInstalled = [...srcInstalled].sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
				} else if (sortBy === "name-desc") {
					srcInstalled = [...srcInstalled].sort((a, b) => (b.displayName || b.name).localeCompare(a.displayName || a.name));
				}

				groups.push({
					source: src,
					plugins: srcInstalled,
				});
			}

			return groups;
		}, [filter, state.sources, state.plugins, activeSourceId, rows, query, sortBy]);

		useEffect(() => {
			if (!view || view.type !== "detail" || !view.plugin) {
				setDetail(null);
				return;
			}
			const cacheKey = `${view.sourceId}:${view.plugin.name}`;
			const cached = detailCacheRef.current[cacheKey];
			if (cached && ((cached.skills && cached.skills.length > 0) || (cached.detail && cached.detail.skills && cached.detail.skills.length > 0))) {
				setDetail(cached);
				return;
			}
			// Set initial detail immediately from view.plugin so there is 0ms delay / no blank loading screen
			setDetail(view.plugin);
			let alive = true;
			api("/plugins/" + encodeURIComponent(view.sourceId) + "/" + encodeURIComponent(view.plugin.name))
				.then((body) => {
					if (body && body.plugin) {
						const fetchedDetail = body.plugin.detail || body.plugin;
						const merged = {
							...view.plugin,
							...body.plugin,
							detail: fetchedDetail,
							skills: (fetchedDetail && Array.isArray(fetchedDetail.skills) && fetchedDetail.skills.length > 0)
								? fetchedDetail.skills
								: (view.plugin.detail?.skills || view.plugin.skills || []),
							agents: (fetchedDetail && Array.isArray(fetchedDetail.agents) && fetchedDetail.agents.length > 0)
								? fetchedDetail.agents
								: (view.plugin.detail?.agents || view.plugin.agents || []),
							connectors: (fetchedDetail && Array.isArray(fetchedDetail.connectors) && fetchedDetail.connectors.length > 0)
								? fetchedDetail.connectors
								: (view.plugin.detail?.connectors || view.plugin.connectors || []),
							hooks: (fetchedDetail && Array.isArray(fetchedDetail.hooks) && fetchedDetail.hooks.length > 0)
								? fetchedDetail.hooks
								: (view.plugin.detail?.hooks || view.plugin.hooks || []),
							prompts: (fetchedDetail && Array.isArray(fetchedDetail.prompts) && fetchedDetail.prompts.length > 0)
								? fetchedDetail.prompts
								: (view.plugin.detail?.prompts || view.plugin.prompts || []),
						};
						if (merged.skills.length > 0 || merged.agents.length > 0) {
							detailCacheRef.current[cacheKey] = merged;
						}
						if (alive) setDetail(merged);
					}
				})
				.catch(() => {
					if (alive) setDetail(view.plugin);
				});
			return () => { alive = false; };
		}, [view]);

		useEffect(() => {
			if (!installFor && !addDialog && !confirmRemoveSource) return;
			const onKey = (e) => {
				if (e.key === "Escape") {
					if (installFor) setInstallFor(null);
					if (addDialog) setAddDialog(false);
					if (confirmRemoveSource) setConfirmRemoveSource(null);
				}
			};
			window.addEventListener("keydown", onKey);
			return () => window.removeEventListener("keydown", onKey);
		}, [installFor, addDialog, confirmRemoveSource]);

		const removePlugin = async (pluginName) => {
			try {
				await api("/plugins/" + encodeURIComponent(pluginName), { method: "DELETE" });
				showToast("已卸载插件", "插件副本与技能注册已实时移除并生效。", { restart: false });
				setView({ type: "browse", sourceId: activeSourceId });
				await refreshState();
				onInstalled();
			} catch (e) {
				showToast("卸载失败", e.message, { restart: false });
			}
		};

		// Upgraded smart fuzzy search, filter, and sort
		const visible = useMemo(() => {
			let list = currentSourcePlugins;

			if (query.trim()) {
				const scored = list
					.map((p) => ({ plugin: p, score: calcSearchScore(query, p) }))
					.filter((r) => r.score > 0)
					.sort((a, b) => b.score - a.score);
				list = scored.map((r) => r.plugin);
			}

			if (sortBy === "name-asc") {
				list = [...list].sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
			} else if (sortBy === "name-desc") {
				list = [...list].sort((a, b) => (b.displayName || b.name).localeCompare(a.displayName || a.name));
			} else if (!query.trim()) {
				// Default sort: Installed plugins (snapshot) first, then strictly alphabetical A-Z
				list = [...list].sort((a, b) => {
					const instA = sortInstalledSnapshot.has(a.name) ? 1 : 0;
					const instB = sortInstalledSnapshot.has(b.name) ? 1 : 0;
					if (instB !== instA) return instB - instA;
					return (a.displayName || a.name).localeCompare(b.displayName || b.name);
				});
			}

			return list;
		}, [currentSourcePlugins, query, sortBy, sortInstalledSnapshot, sortTick]);

		const refresh = async () => {
			setIsRefreshing(true);
			if (detailCacheRef.current) detailCacheRef.current = {};
			try {
				const body = await api("/market/refresh", {
					method: "POST",
					body: JSON.stringify({ sourceId: activeSourceId }),
				});
				setRows((prev) => ({ ...(prev || {}), [activeSourceId]: body.plugins || [] }));
				// Market refresh is an explicit re-sort of the current source:
				// rebuild the snapshot so freshly-installed plugins land in the
				// "installed-first" group, and bump sortTick to recompute.
				refreshInstalledSnapshot(activeSourceId);
				setSortTick((t) => t + 1);
				showToast("已刷新", "市场清单已更新", { restart: false });
			} catch (e) {
				showToast("刷新失败", e.message, { restart: false });
			} finally {
				setIsRefreshing(false);
			}
		};

		const doInstall = async (convertAgents) => {
			try {
				const result = await api("/plugins/install", {
					method: "POST",
					body: JSON.stringify({
						sourceId: installFor.sourceId,
						pluginName: installFor.name,
						convertAgents,
					}),
				});
				const parts = [];
				if (result.skills && result.skills.length) parts.push(`${result.skills.length} 个技能`);
				if (result.subagents && result.subagents.length) parts.push(`${result.subagents.length} 个子代理`);
				else if (result.converted && result.converted.length) parts.push(`${result.converted.length} 个子代理`);
				if (result.connectors && result.connectors.length) parts.push(`${result.connectors.length} 个 MCP 服务`);
				const summary = parts.length ? `${parts.join("、")}已就绪。` : "插件已安装就绪。";
				showToast("安装完成", summary, { restart: false });
				setInstallFor(null);
				await refreshState();
				onInstalled();
			} catch (e) {
				showToast("安装失败", e.message, { restart: false });
			}
		};

		const currentDetailPlugin = detail || (view && view.type === "detail" ? view.plugin : null);

		return h("div", { className: "cpm-main" },
			// Top bar matching Claude official: Row 1 (Full width search) & Row 2 (Tabs on Left + Filter & Sort on Right)
			h("div", { className: "cpm-topbar" },
				h("div", { className: "cpm-topbar-row1" },
					h("div", { className: "cpm-search" },
						h(IconSearch),
						h("input", {
							placeholder: "Search plugins...",
							value: query,
							onChange: (e) => setQuery(e.target.value),
						}),
						h(ClearBtn, { value: query, onClear: () => setQuery("") }),
					),
				),
				h("div", { className: "cpm-topbar-row2" },
					h("div", {
						ref: tabsRef,
						className: "cpm-topbar-left" + (dragState?.active ? " is-dragging-mode" : ""),
						onScroll: updateTabsMask,
					},
						state.sources.map((s, idx) => {
							const isAnthropic = idx === 0 || s.builtin || (s.id && s.id.toLowerCase() === "anthropic");
							const isBeingDragged = dragState?.active && dragState.sourceId === s.id;
							let tabTransform = undefined;
							let tabClassExtra = "";

							if (isAnthropic) {
								tabTransform = undefined;
								tabClassExtra = "";
							} else if (dragState?.active) {
								if (isBeingDragged) {
									tabClassExtra = " is-placeholder";
								} else {
									const slotSize = dragLiveRef.current.slotSize || (dragLiveRef.current.draggedWidth ? dragLiveRef.current.draggedWidth + 2 : 60);
									if (dragState.fromIndex < dragState.toIndex) {
										if (idx > dragState.fromIndex && idx <= dragState.toIndex) {
											tabTransform = `translate3d(${-slotSize}px, 0, 0)`;
										} else {
											tabTransform = "translate3d(0, 0, 0)";
										}
									} else if (dragState.fromIndex > dragState.toIndex) {
										if (idx >= dragState.toIndex && idx < dragState.fromIndex) {
											tabTransform = `translate3d(${slotSize}px, 0, 0)`;
										} else {
											tabTransform = "translate3d(0, 0, 0)";
										}
									} else {
										tabTransform = "translate3d(0, 0, 0)";
									}
									tabClassExtra = " is-shifting";
								}
							}

							return h("button", {
								key: s.id,
								ref: (el) => { if (el) tabRefs.current[s.id] = el; },
								className: "cpm-tab" + (s.id === activeSourceId ? " active" : "") + tabClassExtra,
								style: tabTransform ? { transform: tabTransform } : undefined,
								onPointerDown: (e) => handleTabPointerDown(e, s, idx),
								onPointerMove: handleTabPointerMove,
								onPointerUp: (e) => handleTabPointerUp(e, s, idx),
								onPointerCancel: (e) => handleTabPointerUp(e, s, idx),
								onContextMenu: (e) => e.preventDefault(),
								onMouseDown: (e) => e.preventDefault(),
							},
								h("span", null, s.name),
								!s.builtin && h("span", {
									className: "cpm-tab-del-zone",
									onPointerDown: (e) => e.stopPropagation(),
									onClick: (e) => {
										e.stopPropagation();
										setConfirmRemoveSource(s);
									},
								},
									h("span", { className: "cpm-tab-close" },
										h("svg", {
											width: 8,
											height: 8,
											viewBox: "0 0 24 24",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: 2.8,
											strokeLinecap: "round",
											strokeLinejoin: "round",
										},
											h("line", { x1: 18, y1: 6, x2: 6, y2: 18 }),
											h("line", { x1: 6, y1: 6, x2: 18, y2: 18 }),
										),
									),
								),
							);
						}),
					),
					h("div", { className: "cpm-topbar-right" },
						h("button", { className: "cpm-icon-btn" + (isRefreshing ? " is-refreshing" : ""), onClick: refresh, disabled: isRefreshing }, h(IconRefresh)),
						h("div", { style: { position: "relative" } },
							h("button", { className: "cpm-filter" + (showFilter ? " open" : ""), onClick: () => { setShowFilter(!showFilter); setShowSort(false); } },
								h("span", null, filter === "installed" ? "已安装" : (filter === "all" ? "全部插件" : "Filter by")),
								h("span", { className: "cpm-filter-chevron" }, h(IconArrow)),
							),
							showFilter && h("div", { className: "cpm-menu-pop", style: { top: 34, right: 0, minWidth: 120 } },
								h("div", { className: "cpm-menu-item", onClick: () => {
									setFilter("all");
									setShowFilter(false);
									refreshInstalledSnapshot(activeSourceId);
									setSortTick((t) => t + 1);
									if (!SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
									SESSION_STORE.scrollTops[activeSourceId] = 0;
									scrollContentToTop();
								} }, `全部插件 (${totalSourcePluginsCount})`),
								h("div", { className: "cpm-menu-item", onClick: () => {
									setFilter("installed");
									setShowFilter(false);
									refreshInstalledSnapshot(activeSourceId);
									setSortTick((t) => t + 1);
									if (!SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
									SESSION_STORE.scrollTops[activeSourceId] = 0;
									scrollContentToTop();
								} }, `已安装 (${totalInstalledCount})`),
							),
						),
						h("div", { style: { position: "relative" } },
							h("button", { className: "cpm-sort" + (showSort ? " open" : ""), onClick: () => { setShowSort(!showSort); setShowFilter(false); } },
								h("span", null, sortBy === "name-asc" ? "名称 A-Z" : sortBy === "name-desc" ? "名称 Z-A" : "默认排序"),
								h("span", { className: "cpm-filter-chevron" }, h(IconArrow)),
							),
							showSort && h("div", { className: "cpm-menu-pop", style: { top: 34, right: 0, minWidth: 120 } },
								h("div", { className: "cpm-menu-item", onClick: () => {
									setSortBy("default");
									setShowSort(false);
									refreshInstalledSnapshot(activeSourceId);
									setSortTick((t) => t + 1);
									if (!SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
									SESSION_STORE.scrollTops[activeSourceId] = 0;
									scrollContentToTop();
								} }, "默认排序"),
								h("div", { className: "cpm-menu-item", onClick: () => {
									setSortBy("name-asc");
									setShowSort(false);
									refreshInstalledSnapshot(activeSourceId);
									setSortTick((t) => t + 1);
									if (!SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
									SESSION_STORE.scrollTops[activeSourceId] = 0;
									scrollContentToTop();
								} }, "名称 (A-Z)"),
								h("div", { className: "cpm-menu-item", onClick: () => {
									setSortBy("name-desc");
									setShowSort(false);
									refreshInstalledSnapshot(activeSourceId);
									setSortTick((t) => t + 1);
									if (!SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
									SESSION_STORE.scrollTops[activeSourceId] = 0;
									scrollContentToTop();
								} }, "名称 (Z-A)"),
							),
						),
						h("button", {
							className: "cpm-add-btn",
							onClick: () => setAddDialog(true),
						}, h(IconPlus)),
					),
				),
			),

			// Detail view — 0ms instant transition without intermediate loading screen
			view.type === "detail" && currentDetailPlugin && h(DetailView, {
				plugin: {
					...currentDetailPlugin,
					installed: installedNames.has(currentDetailPlugin.name),
					enabled: state.plugins.find((r) => r.name === currentDetailPlugin.name)?.enabled !== false,
				},
				pluginRecord: state.plugins.find((r) => r.name === currentDetailPlugin.name),
				containerRef: detailContainerRef,
				onBack: () => setView({ type: "browse", sourceId: activeSourceId }),
				onInstall: () => setInstallFor(currentDetailPlugin),
				onRemove: () => removePlugin(currentDetailPlugin.name),
				onManage: () => openManage(state.plugins.find((r) => r.name === currentDetailPlugin.name), { type: "detail", sourceId: activeSourceId, plugin: currentDetailPlugin }),
				onTogglePlugin: async (enabled) => {
					await api("/plugins/" + encodeURIComponent(currentDetailPlugin.name) + "/toggle", {
						method: "POST",
						body: JSON.stringify({ enabled }),
					});
					await refreshState();
				},
				showToast,
			}),

			// Browse View — Mode A: Grouped Installed across all sources (Selected active tab source displayed first)
			isBrowse && filter === "installed" && h("div", {
				ref: gridRef,
				onWheel: onGridWheel,
				onScroll: onGridScroll,
				className: "cpm-grid-container" + gridMaskClass,
			},
				installedSourceGroups.length === 0 && h("div", { className: "cpm-empty", style: { textAlign: "center", padding: "40px 16px" } }, query.trim() ? "未找到匹配的已安装插件" : "暂无已安装插件"),
				installedSourceGroups.map((grp, idx) => {
					return h("div", { key: grp.source.id, className: "cpm-installed-group" },
						h("div", { className: "cpm-installed-group-header" },
							h("div", { className: "cpm-installed-group-title-wrap" },
								h("span", { className: "cpm-installed-group-title" }, grp.source.name),
								h("span", { className: "cpm-badge" }, grp.plugins.length),
							),
							idx > 0 && h("div", { className: "cpm-installed-group-line" }),
						),
						h("div", { className: "cpm-grid-installed" },
							grp.plugins.map((p) => {
								return h(PluginCard, {
									key: p.id || `${grp.source.id}/${p.name}`,
									plugin: p,
									installed: true,
									isDark,
									onMouseEnter: (e) => handleCardMouseEnter(p, e.currentTarget),
									onMouseLeave: () => handleCardMouseLeave(p),
									onClick: () => {
										setHoveredPreview(null);
										if (gridRef.current) {
											if (!SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
											SESSION_STORE.scrollTops[activeSourceId] = gridRef.current.scrollTop;
										}
										setView({ type: "detail", sourceId: p.sourceId || grp.source.id, plugin: p });
									},
									onManage: (e) => {
										e.stopPropagation();
										setHoveredPreview(null);
										if (gridRef.current) {
											if (!SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
											SESSION_STORE.scrollTops[activeSourceId] = gridRef.current.scrollTop;
										}
										openManage(state.plugins.find((r) => r.name === p.name), { type: "browse" });
									},
									onInstall: (e) => {
										e.stopPropagation();
										setHoveredPreview(null);
										setInstallFor(p);
									},
								});
							}),
						),
					);
				}),
			),

			// Browse View — Mode B: Normal Source Browser Grid
			isBrowse && filter !== "installed" && h("div", {
				ref: gridRef,
				onWheel: onGridWheel,
				onScroll: onGridScroll,
				className: "cpm-grid" + gridMaskClass,
			},
				visible.length === 0 && h("div", { className: "cpm-empty", style: { gridColumn: "1 / -1", textAlign: "center", padding: "30px" } },
					loadingSourceId === activeSourceId ? "正在加载插件…" : (query.trim() ? "没有找到匹配的插件" : "该插件源暂无插件")
				),
				visible.map((p) => {
					const installed = currentSourceInstalledNames.has(p.name);
					return h(PluginCard, {
						key: p.id,
						plugin: p,
						installed,
						isDark,
						onMouseEnter: (e) => handleCardMouseEnter(p, e.currentTarget),
						onMouseLeave: () => handleCardMouseLeave(p),
						onClick: () => {
							setHoveredPreview(null);
							if (gridRef.current) {
								if (!SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
								SESSION_STORE.scrollTops[activeSourceId] = gridRef.current.scrollTop;
							}
							setView({ type: "detail", sourceId: activeSourceId, plugin: p });
						},
						onManage: (e) => {
							e.stopPropagation();
							setHoveredPreview(null);
							if (gridRef.current) {
								if (!SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
								SESSION_STORE.scrollTops[activeSourceId] = gridRef.current.scrollTop;
							}
							openManage(state.plugins.find((r) => r.name === p.name && (r.sourceId === activeSourceId || r.sourceId === p.sourceId)) || state.plugins.find((r) => r.name === p.name), { type: "browse" });
						},
						onInstall: (e) => {
							e.stopPropagation();
							setHoveredPreview(null);
							setInstallFor(p);
						},
					});
				}),
			),

			hoveredPreview && isBrowse && h(PluginPreviewPopover, {
				preview: hoveredPreview,
				isDark,
				installed: currentSourceInstalledNames.has(hoveredPreview.plugin.name),
				onMouseEnter: handlePopoverMouseEnter,
				onMouseLeave: handlePopoverMouseLeave,
				onClick: () => {
					const p = hoveredPreview.plugin;
					setHoveredPreview(null);
					if (gridRef.current) {
						if (!SESSION_STORE.scrollTops) SESSION_STORE.scrollTops = {};
						SESSION_STORE.scrollTops[activeSourceId] = gridRef.current.scrollTop;
					}
					setView({ type: "detail", sourceId: activeSourceId, plugin: p });
				},
			}),

			installFor && h(InstallDialog, {
				plugin: installFor,
				isDark,
				onCancel: () => setInstallFor(null),
				onConfirm: doInstall,
			}),

			addDialog && h(AddSourceDialog, {
				onCancel: () => setAddDialog(false),
				onAdded: async (newSourceId) => {
					setAddDialog(false);
					await refreshState();
					if (newSourceId) setActiveSourceId(newSourceId);
				},
				showToast,
			}),

			confirmRemoveSource && h("div", { className: "cpm-dialog", onClick: () => setConfirmRemoveSource(null) },
				h("div", { className: "cpm-dialog-box", onClick: (e) => e.stopPropagation() },
					h("div", { className: "cpm-dialog-title" }, `删除插件源「${confirmRemoveSource.name}」？`),
					h("div", { className: "cpm-field", style: { fontSize: 13, lineHeight: 1.6, color: "var(--cpm-muted)" } },
						"将从插件市场中移除该源及其分类标签。如需再次使用，可随时通过右上角「+」重新添加。",
					),
					h("div", { className: "cpm-dialog-actions" },
						h("button", {
							className: "cpm-btn cpm-btn-secondary",
							onClick: () => setConfirmRemoveSource(null),
						}, "取消"),
						h("button", {
							className: "cpm-btn cpm-btn-primary",
							style: { background: "#dc2626", borderColor: "#dc2626", color: "#fff" },
							disabled: !!busy,
							onClick: async () => {
								const toRemove = confirmRemoveSource;
								setConfirmRemoveSource(null);
								setBusy("正在删除插件源…");
								try {
									await api("/sources/" + encodeURIComponent(toRemove.id), { method: "DELETE" });
									showToast("插件源已删除", `已移除分类「${toRemove.name}」`, { restart: false });
									if (SESSION_STORE.sourceViews) delete SESSION_STORE.sourceViews[toRemove.id];
									if (SESSION_STORE.scrollTops) delete SESSION_STORE.scrollTops[toRemove.id];
									if (activeSourceId === toRemove.id) {
										setActiveSourceId("anthropic");
									}
									setRows((prev) => {
										const next = { ...(prev || {}) };
										delete next[toRemove.id];
										return next;
									});
									await refreshState();
								} catch (e) {
									showToast("删除失败", cleanError(e), { restart: false });
								} finally {
									setBusy(null);
								}
							},
						}, busy ? "删除中…" : "确认删除"),
					),
				),
			),

			// ────────────────────────────── Modern Floating Drag Overlay (Zero Container Clipping) ──────────────────────────────
			dragState?.active && h("div", {
				className: "cpm-tab-drag-overlay" + (isDark ? " cpm-dark" : ""),
				style: {
					left: dragState.isSnapping ? dragState.snapTargetX : dragState.overlayX,
					top: dragState.isSnapping ? dragState.snapTargetY : dragState.overlayY,
					width: dragState.width || "auto",
					height: dragState.height || 30,
					transform: dragState.isSnapping ? "translate3d(0, 0, 0) scale(1)" : "translate3d(0, -4px, 0) scale(1.08)",
					transition: dragState.isSnapping ? "left 0.18s cubic-bezier(0.2, 0, 0, 1), top 0.18s cubic-bezier(0.2, 0, 0, 1), transform 0.18s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.18s ease" : "none",
				},
			},
				h("span", null, dragState.sourceName)
			),
		);
	}

	// ────────────────────────────── Modern Install Dialog ──────────────────────────────
	function InstallDialog({ plugin, isDark, onCancel, onConfirm }) {
		const [busy, setBusy] = useState(false);
		return h("div", { className: "cpm-dialog", onClick: onCancel },
			h("div", { className: "cpm-dialog-box cpm-install-dialog", onClick: (e) => e.stopPropagation() },
				h("div", { className: "cpm-install-dialog-header" },
					h(PluginIcon, { plugin, isDark }),
					h("div", { className: "cpm-install-dialog-header-info" },
						h("div", { className: "cpm-install-dialog-title" }, `安装 ${plugin.displayName || plugin.name}`),
						h("div", { className: "cpm-install-dialog-sub" }, `by ${plugin.author || "Anthropic"}`),
					),
				),
				plugin.description && h("div", { className: "cpm-install-desc" }, plugin.description),
				h("div", { className: "cpm-dialog-actions", style: { marginTop: 18 } },
					h("button", { className: "cpm-btn cpm-btn-secondary", onClick: onCancel, disabled: busy }, "取消"),
					h("button", {
						className: "cpm-btn cpm-btn-primary",
						disabled: busy,
						onClick: async () => { setBusy(true); await onConfirm(); setBusy(false); },
					}, busy ? "正在安装…" : "确认安装"),
				),
			),
		);
	}

	// ────────────────────────────── Add Source Dialog (2-Step Naming) ──────────────────────────────
	function AddSourceDialog({ onCancel, onAdded, showToast }) {
		const [url, setUrl] = useState("");
		const [phase, setPhase] = useState("url");
		const [suggested, setSuggested] = useState("");
		const [mode, setMode] = useState("suggest");
		const [customName, setCustomName] = useState("");
		const [normalizedUrl, setNormalizedUrl] = useState("");
		const [repoLabel, setRepoLabel] = useState("");
		const [pluginCount, setPluginCount] = useState(0);
		const [busy, setBusy] = useState(false);
		const customInputRef = useRef(null);

		const extractRepoLabel = (raw) => {
			if (!raw) return "";
			let s = String(raw).trim().replace(/^['"]|['"]$/g, "");
			const sshMatch = s.match(/^git@[^:]+:([^/]+)\/(.+?)(\.git)?$/);
			if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;
			const httpMatch = s.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(\.git)?$/i);
			if (httpMatch) return `${httpMatch[1]}/${httpMatch[2]}`;
			const shortMatch = s.match(/^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+?)(\.git)?$/);
			if (shortMatch) return `${shortMatch[1]}/${shortMatch[2]}`;
			return s.replace(/^https?:\/\//i, "").replace(/\.git$/i, "");
		};

		const computeSmartSuggestedName = (rawInput, serverSuggested) => {
			const s = String(rawInput || "").trim().replace(/^['"]|['"]$/g, "");
			let owner = "";
			let repo = "";
			const sshMatch = s.match(/^git@[^:]+:([^/]+)\/(.+?)(\.git)?$/);
			if (sshMatch) {
				owner = sshMatch[1];
				repo = sshMatch[2];
			} else {
				const httpMatch = s.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(\.git)?$/i);
				if (httpMatch) {
					owner = httpMatch[1];
					repo = httpMatch[2];
				} else {
					const shortMatch = s.match(/^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+?)(\.git)?$/);
					if (shortMatch) {
						owner = shortMatch[1];
						repo = shortMatch[2];
					} else {
						repo = s.replace(/^https?:\/\//i, "").replace(/\.git$/i, "").split("/").pop() || "";
					}
				}
			}

			const ownerLower = (owner || "").toLowerCase();
			const repoLower = (repo || "").toLowerCase();

			if (repoLower === "claude-plugins-official" || ownerLower === "anthropics") return "Anthropic";
			if (repoLower === "claude-plugins-community") return "Community";

			const genericWords = new Set([
				"skills", "skill", "plugins", "plugin", "agents", "agent", "tools", "tool",
				"marketplace", "hub", "claude-skills", "claude-plugins", "claude-agents",
				"dsh-plugins", "extensions", "packages", "repo", "repository", "custom"
			]);

			// If server suggestion is valid and NOT a generic word, trust it
			if (serverSuggested && !genericWords.has(serverSuggested.toLowerCase())) {
				return serverSuggested;
			}

			// If repo name is generic (like "skills"), use capitalized owner (e.g. "Mattpocock")
			if (genericWords.has(repoLower) && owner) {
				return owner.charAt(0).toUpperCase() + owner.slice(1);
			}

			// Clean up repo name: strip prefixes (claude-, dsh-) and suffixes (-skill, -skills, -plugins, etc.)
			const simplified = repo
				.replace(/^(claude|dsh|anthropic)[-_]?(plugins?)?[-_]?/i, "")
				.replace(/[-_]?(plugins?|skills?|agents?|official|marketplace)$/i, "");

			const clean = simplified || repo;
			if (genericWords.has(clean.toLowerCase()) && owner) {
				return owner.charAt(0).toUpperCase() + owner.slice(1);
			}

			if (clean) {
				return clean.charAt(0).toUpperCase() + clean.slice(1);
			}
			return serverSuggested || "Custom";
		};

		const cleanError = (err) => {
			if (!err) return "操作失败";
			let msg = String(err.message || err).replace(/^Error:\s*/i, "").trim();
			if (msg.length > 50) msg = msg.slice(0, 48) + "…";
			return msg;
		};

		const ensure = async () => {
			const raw = url.trim();
			if (!raw) {
				showToast("请输入仓库地址", "支持格式：owner/repo 或 https://github.com/...", { restart: false });
				return;
			}
			setBusy(true);
			try {
				const body = await api("/sources/ensure", { method: "POST", body: JSON.stringify({ url: raw }) });
				const finalRepoLabel = body.repoLabel || extractRepoLabel(raw);
				const finalSuggested = computeSmartSuggestedName(raw, body.suggestedName);
				setRepoLabel(finalRepoLabel);
				setSuggested(finalSuggested);
				setCustomName(finalSuggested);
				setNormalizedUrl(body.normalizedUrl || raw);
				setPluginCount(body.pluginCount || 0);
				setPhase("name");
			} catch (e) {
				showToast("校验失败", cleanError(e), { restart: false });
			} finally {
				setBusy(false);
			}
		};

		const confirm = async () => {
			const name = mode === "custom" ? customName.trim() : suggested;
			if (!name) {
				showToast("名称不能为空", "请输入或选择分类标签名", { restart: false });
				return;
			}
			setBusy(true);
			try {
				const res = await api("/sources", {
					method: "POST",
					body: JSON.stringify({ url: normalizedUrl || url.trim(), name }),
				});
				const count = res.pluginCount !== undefined ? res.pluginCount : pluginCount;
				showToast("插件源已添加", `分类「${name}」已创建，成功导入 ${count} 个插件`, { restart: false });
				await onAdded(res.source?.id);
			} catch (e) {
				showToast("添加源失败", cleanError(e), { restart: false });
			} finally {
				setBusy(false);
			}
		};

		return h("div", { className: "cpm-dialog", onClick: onCancel },
			h("div", { className: "cpm-dialog-box cpm-source-dialog-box", onClick: (e) => e.stopPropagation() },
				phase === "url" && [
					h("div", { className: "cpm-dialog-title", key: "title" }, "添加插件源"),
					h("div", { className: "cpm-field", key: "f", style: { marginBottom: 0 } },
						h("label", { style: { marginBottom: 6, display: "block" } }, "Git 仓库地址"),
						h("div", { className: "cpm-input-wrap" },
							h("input", {
								className: "cpm-input",
								placeholder: "Select a repository",
								value: url,
								onChange: (e) => setUrl(e.target.value),
								onKeyDown: (e) => {
									if (e.key === "Enter" && !busy && url.trim()) ensure();
								},
								autoFocus: true,
							}),
							h(ClearBtn, { value: url, onClear: () => setUrl("") }),
						),
						h("div", {
							className: "cpm-smart-md",
							style: {
								color: "var(--cpm-muted)",
								fontSize: "11.5px",
								marginTop: 6,
								textAlign: "left",
								lineHeight: 1.3,
							},
						}, renderInlineMarkdownNodes("A GitHub `owner/repo` or a git repository URL")),
					),
					h("div", { className: "cpm-dialog-actions", key: "a", style: { marginTop: 0 } },
						h("button", { className: "cpm-btn cpm-btn-secondary", onClick: onCancel }, "取消"),
						h("button", { className: "cpm-btn cpm-btn-primary", disabled: busy || !url.trim(), onClick: ensure }, busy ? "正在拉取与解析…" : "下一步"),
					),
				],
				phase === "name" && [
					h("div", { className: "cpm-source-header", key: "header" },
						h("div", { className: "cpm-source-header-title" }, "命名插件源分类标签"),
						h("div", { className: "cpm-source-meta-row" },
							h("div", { className: "cpm-source-live-dot" }),
							h("span", { className: "cpm-source-repo-text" },
								h("svg", { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", style: { opacity: 0.75, flexShrink: 0 } },
									h("line", { x1: "6", y1: "3", x2: "6", y2: "15" }),
									h("circle", { cx: "18", cy: "6", r: "3" }),
									h("circle", { cx: "6", cy: "18", r: "3" }),
									h("path", { d: "M18 9a9 9 0 0 1-9 9" })
								),
								repoLabel || "Git Repository"
							),
							h("span", { className: "cpm-source-meta-sep" }, "·"),
							h("span", { className: "cpm-source-count-text" }, `${pluginCount} 个可用插件`)
						),
					),
					h("div", { className: "cpm-source-prompt-label", key: "prompt" }, "请选择或输入在顶部导航栏中的显示名称："),
					h("div", { className: "cpm-radio-group", key: "group" },
						h("div", {
							className: "cpm-radio-card" + (mode === "suggest" ? " is-selected" : ""),
							onClick: () => setMode("suggest")
						},
							h("div", { className: "cpm-custom-radio" + (mode === "suggest" ? " checked" : "") },
								h("div", { className: "cpm-custom-radio-inner" })
							),
							h("div", { className: "cpm-radio-card-content" },
								h("div", { className: "cpm-radio-card-header" },
									h("div", { className: "cpm-radio-card-title" }, "使用系统建议简化名"),
									h("span", { className: "cpm-radio-rec-badge" }, "RECOMMENDED")
								),
								h("div", { className: "cpm-radio-card-desc" },
									"分类标签名：",
									h("span", { className: "cpm-tag-preview" }, suggested)
								)
							)
						),
						h("div", {
							className: "cpm-radio-card" + (mode === "custom" ? " is-selected" : ""),
							onClick: () => { setMode("custom"); if (customInputRef.current) customInputRef.current.focus(); }
						},
							h("div", { className: "cpm-custom-radio" + (mode === "custom" ? " checked" : "") },
								h("div", { className: "cpm-custom-radio-inner" })
							),
							h("div", { className: "cpm-radio-card-content" },
								h("div", { className: "cpm-radio-card-header" },
									h("div", { className: "cpm-radio-card-title" }, "我自己命名")
								),
								h("div", { className: "cpm-radio-card-desc" }, "自定义简短易记的分类导航标签名："),
								h("div", { className: "cpm-input-wrap", },
									h("input", {
										ref: customInputRef,
										className: "cpm-input cpm-source-custom-input",
										value: customName,
										placeholder: "输入自定义标签名",
										onChange: (e) => { setCustomName(e.target.value); setMode("custom"); },
										onFocus: () => setMode("custom"),
										onClick: (e) => e.stopPropagation(),
										onKeyDown: (e) => {
											if (e.key === "Enter" && !busy && customName.trim()) confirm();
										}
									}),
									h(ClearBtn, { value: customName, onClear: () => setCustomName("") }),
								)
							)
						)
					),
					h("div", { className: "cpm-dialog-actions", key: "a" },
						h("button", { className: "cpm-btn cpm-btn-secondary", onClick: () => setPhase("url") }, "上一步"),
						h("button", { className: "cpm-btn cpm-btn-primary", disabled: busy || (mode === "custom" && !customName.trim()), onClick: confirm }, busy ? "正在保存…" : "确认添加"),
					),
				],
			),
		);
	}

	function calculateFourLineLimit(items, containerWidth = 620) {
		if (!items || !Array.isArray(items) || items.length === 0) return 0;
		const W = Math.max(300, (containerWidth && containerWidth > 100) ? containerWidth : 620);
		let line = 1;
		let currentLineWidth = 0;

		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (!item) continue;
			const text = typeof item === "string" ? item : (item.command || item.name || item.file || "");
			const safeText = String(text || "");
			const pillW = Math.max(42, Math.round(safeText.length * 6.2 + 26));

			if (currentLineWidth === 0) {
				currentLineWidth = pillW;
			} else if (currentLineWidth + 6 + pillW <= W) {
				currentLineWidth += 6 + pillW;
			} else {
				line++;
				if (line > 4) {
					// 4 lines reached. Check if we have >= 80px space on line 4 for "+N more"
					const spaceLeftOnLine4 = W - currentLineWidth;
					if (spaceLeftOnLine4 >= 80) {
						return Math.max(1, i);
					} else {
						return Math.max(1, i - 1);
					}
				}
				currentLineWidth = pillW;
			}
		}
		return items.length;
	}

	function ExpandableSection({ title, count, subtitle, items, renderPill, moreLabel = "more", collapseLabel = "收起" }) {
		const [expanded, setExpanded] = useState(false);
		const sectionRef = useRef(null);
		const pillsRef = useRef(null);
		const [containerWidth, setContainerWidth] = useState(620);

		useEffect(() => {
			if (sectionRef.current && sectionRef.current.clientWidth) {
				setContainerWidth(sectionRef.current.clientWidth);
			} else if (pillsRef.current && pillsRef.current.clientWidth) {
				setContainerWidth(pillsRef.current.clientWidth);
			}
			const handleResize = () => {
				if (sectionRef.current && sectionRef.current.clientWidth) {
					setContainerWidth(sectionRef.current.clientWidth);
				} else if (pillsRef.current && pillsRef.current.clientWidth) {
					setContainerWidth(pillsRef.current.clientWidth);
				}
			};
			window.addEventListener("resize", handleResize);
			return () => window.removeEventListener("resize", handleResize);
		}, []);

		const safeItems = Array.isArray(items) ? items : [];
		const total = safeItems.length;

		const limit = useMemo(() => calculateFourLineLimit(safeItems, containerWidth), [safeItems, containerWidth]);
		const isLong = limit < total;
		const displayItems = (expanded || !isLong) ? safeItems : safeItems.slice(0, limit);
		const remaining = total - displayItems.length;

		const handleHeaderCollapse = () => {
			setExpanded(false);
		};

		const handlePillCollapse = () => {
			setExpanded(false);
			if (sectionRef.current) {
				const rect = sectionRef.current.getBoundingClientRect();
				if (rect.top < 0) {
					sectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
				}
			}
		};

		if (total === 0) return null;

		return h("div", { ref: sectionRef, className: "cpm-section" },
			h("div", { className: "cpm-section-title" },
				title,
				h("span", { className: "cpm-badge" }, count !== undefined ? count : total),
				isLong && expanded && h("button", {
					type: "button",
					className: "cpm-section-collapse-btn",
					onClick: handleHeaderCollapse,
				},
					"收起全部",
					h(IconChevronUp, { size: 12, style: { marginLeft: 4 } }),
				),
			),
			subtitle && h("div", { className: "cpm-section-sub" }, subtitle),
			h("div", { ref: pillsRef, className: "cpm-pills" },
				displayItems.map((item, idx) => renderPill(item, idx)),
				isLong && !expanded && remaining > 0 && h("button", {
					type: "button",
					className: "cpm-pill cpm-pill-more",
					onClick: () => setExpanded(true),
				},
					`+${remaining} ${moreLabel}`,
					h(IconChevronDown, { size: 11, style: { marginLeft: 4 } }),
				),
				isLong && expanded && h("button", {
					type: "button",
					className: "cpm-pill cpm-pill-collapse",
					onClick: handlePillCollapse,
				},
					collapseLabel,
					h(IconChevronUp, { size: 11, style: { marginLeft: 4 } }),
				),
			),
		);
	}

	// ────────────────────────────── Detail View ──────────────────────────────
	function DetailView({ plugin, pluginRecord, onBack, onInstall, onRemove, onManage, onTogglePlugin, showToast, containerRef }) {
		const [busy, setBusy] = useState(false);
		const [confirmRemove, setConfirmRemove] = useState(false);
		const [toggling, setToggling] = useState(false);
		const localDetailRef = useRef(null);
		const detailRef = containerRef || localDetailRef;
		const [detailMaskClass, setDetailMaskClass] = useState(" mask-bottom");

		const updateDetailMask = useCallback(() => {
			const el = detailRef.current;
			if (!el) return;
			const { scrollTop, scrollHeight, clientHeight } = el;
			const maxScroll = scrollHeight - clientHeight;
			if (maxScroll <= 4) {
				setDetailMaskClass("");
				return;
			}
			const canScrollDown = scrollTop < maxScroll - 4;
			setDetailMaskClass(canScrollDown ? " mask-bottom" : "");
		}, []);

		useLayoutEffect(() => {
			if (detailRef.current) {
				detailRef.current.scrollTop = 0;
			}
			updateDetailMask();
		}, [plugin?.name, updateDetailMask]);

		useEffect(() => {
			const handleResize = () => updateDetailMask();
			window.addEventListener("resize", handleResize);
			return () => window.removeEventListener("resize", handleResize);
		}, [updateDetailMask]);

		if (!plugin) return null;

		const installed = !!plugin.installed;
		const isEnabled = (pluginRecord?.enabled !== false && plugin?.enabled !== false);
		const skills = (plugin.detail && Array.isArray(plugin.detail.skills) && plugin.detail.skills.length > 0)
			? plugin.detail.skills
			: (Array.isArray(plugin.skills) && plugin.skills.length > 0
				? plugin.skills
				: (pluginRecord && Array.isArray(pluginRecord.skills) ? pluginRecord.skills : []));
		const agents = (plugin.detail && Array.isArray(plugin.detail.agents) && plugin.detail.agents.length > 0)
			? plugin.detail.agents
			: (Array.isArray(plugin.agents) && plugin.agents.length > 0
				? plugin.agents
				: (pluginRecord && Array.isArray(pluginRecord.agents) ? pluginRecord.agents : []));
		const prompts = (plugin.detail && Array.isArray(plugin.detail.prompts) && plugin.detail.prompts.length > 0)
			? plugin.detail.prompts
			: (Array.isArray(plugin.prompts) && plugin.prompts.length > 0
				? plugin.prompts
				: (pluginRecord && Array.isArray(pluginRecord.prompts) ? pluginRecord.prompts : []));
		const connectors = (plugin.detail && Array.isArray(plugin.detail.connectors) && plugin.detail.connectors.length > 0)
			? plugin.detail.connectors
			: (Array.isArray(plugin.connectors) && plugin.connectors.length > 0
				? plugin.connectors
				: (pluginRecord && Array.isArray(pluginRecord.connectors) ? pluginRecord.connectors : []));
		const hooks = (plugin.detail && Array.isArray(plugin.detail.hooks) && plugin.detail.hooks.length > 0)
			? plugin.detail.hooks
			: (Array.isArray(plugin.hooks) && plugin.hooks.length > 0
				? plugin.hooks
				: (pluginRecord && Array.isArray(pluginRecord.hooks) ? pluginRecord.hooks : []));
		const lspServers = (plugin.detail && Array.isArray(plugin.detail.lspServers) && plugin.detail.lspServers.length > 0)
			? plugin.detail.lspServers
			: (Array.isArray(plugin.lspServers) && plugin.lspServers.length > 0
				? plugin.lspServers
				: (pluginRecord && Array.isArray(pluginRecord.lspServers) ? pluginRecord.lspServers : []));

		const handleToggle = async () => {
			if (toggling) return;
			const nextState = !isEnabled;
			setToggling(true);
			try {
				if (onTogglePlugin) {
					await onTogglePlugin(nextState);
				}
				if (showToast) {
					showToast(nextState ? "插件已启用" : "插件已禁用", `${plugin.displayName || plugin.name} 已${nextState ? "开启" : "暂停"}。`, { restart: false });
				}
			} catch (e) {
				if (showToast) showToast("操作失败", e.message, { restart: false });
			} finally {
				setToggling(false);
			}
		};

		return h(React.Fragment, null,
			h("div", {
				ref: detailRef,
				className: "cpm-detail" + detailMaskClass,
				onScroll: updateDetailMask,
			},
				h("button", { className: "cpm-back", onClick: onBack }, h(IconChevronLeft), "Back"),
				h("div", { className: "cpm-title-row" },
					h("div", { className: "cpm-title" }, plugin.displayName || plugin.name),
					plugin.homepage && h("button", {
						className: "cpm-icon-btn",
						style: { width: 32, height: 32, padding: 0 },
						onClick: () => {
							if (navigator.clipboard) navigator.clipboard.writeText(plugin.homepage);
						},
					}, h(IconLink)),
					!installed &&
						h("button", {
							className: "cpm-btn cpm-btn-primary",
							disabled: busy,
							onClick: async () => { setBusy(true); await onInstall(); setBusy(false); },
						}, busy ? "安装中…" : "Install"),
					installed && [
						h("button", {
							key: "r",
							className: "cpm-btn cpm-btn-danger",
							disabled: busy,
							onClick: () => setConfirmRemove(true),
						}, "Remove"),
						h("button", {
							key: "m",
							className: "cpm-btn cpm-btn-primary",
							onClick: onManage,
						}, "Manage"),
						h("button", {
							key: "t",
							className: "cpm-toggle" + (isEnabled ? " on" : ""),
							onClick: handleToggle,
							disabled: busy || toggling,
							style: {
								alignSelf: "center",
								marginLeft: 2,
								cursor: "pointer",
							},
						}),
					],
				),
				h("div", { className: "cpm-by" }, `by ${plugin.author || "Anthropic"}`),
				plugin.homepage && h("button", {
					className: "cpm-link",
					onClick: () => window.open(plugin.homepage, "_blank"),
				}, (() => {
					try {
						return `View on ${new URL(plugin.homepage).hostname} ↗`;
					} catch {
						return "View homepage ↗";
					}
				})()),
				h("div", { className: "cpm-desc" }, h(SmartMarkdown, { text: (plugin.detail && plugin.detail.description) || plugin.description || "" })),

				// Skills section
				h(ExpandableSection, {
					title: "Skills",
					count: skills.length,
					subtitle: "Specialized capabilities and slash commands that extend agent workflows.",
					items: skills,
					renderPill: (s) => {
						const name = typeof s === "string" ? s : (s.command || s.name || "");
						return h("span", { key: name, className: "cpm-pill" }, name);
					},
				}),

				// Agents section
				h(ExpandableSection, {
					title: "Agents",
					count: agents.length,
					subtitle: "Specialized AI assistants that can be invoked to handle specific types of tasks.",
					items: agents,
					renderPill: (a) => {
						const name = typeof a === "string" ? a : (a.name || a.file || "");
						return h("span", { key: name, className: "cpm-pill" }, name);
					},
				}),

				// Connectors section
				h(ExpandableSection, {
					title: "Connectors",
					count: connectors.length,
					subtitle: "External services and tools connected via the Model Context Protocol (MCP).",
					items: connectors,
					renderPill: (c) => {
						const name = typeof c === "string" ? c : (c.name || "");
						return h("span", { key: name, className: "cpm-pill" }, name);
					},
				}),

				// LSP Servers section
				h(ExpandableSection, {
					title: "LSP Servers",
					count: lspServers.length,
					subtitle: "Language servers providing code intelligence (go-to-definition, references, hover).",
					items: lspServers,
					renderPill: (ls) => {
						const name = typeof ls === "string" ? ls : (ls.name || "");
						return h("span", { key: name, className: "cpm-pill" }, name);
					},
				}),

				// Hooks section
				h(ExpandableSection, {
					title: "Hooks",
					count: hooks.length,
					subtitle: "Run shell commands automatically before or after specific events like tool calls or notifications.",
					items: hooks,
					renderPill: (hk, idx) => {
						const name = typeof hk === "string" ? hk : (hk.name || String(hk));
						return h("span", { key: `${name}-${idx}`, className: "cpm-pill" }, name);
					},
				}),

				// Prompts section
				h(ExpandableSection, {
					title: "Prompts",
					count: prompts.length,
					subtitle: "Reusable prompt templates and workflows for structured agent conversations.",
					items: prompts,
					renderPill: (p) => {
						const name = typeof p === "string" ? p : (p.name || p.file || "");
						return h("span", { key: name, className: "cpm-pill" }, name);
					},
				}),
			),

			confirmRemove && h("div", { className: "cpm-dialog", onClick: () => setConfirmRemove(false) },
				h("div", { className: "cpm-dialog-box", onClick: (e) => e.stopPropagation() },
					h("div", { className: "cpm-dialog-title" }, `卸载 ${plugin.displayName || plugin.name}？`),
					h("div", { className: "cpm-field", style: { color: "var(--cpm-muted)", fontSize: "13px", lineHeight: 1.5, marginBottom: "20px" } }, "将删除插件副本、技能与子代理注册及 MCP 配置。"),
					h("div", { className: "cpm-dialog-actions" },
						h("button", { className: "cpm-btn cpm-btn-secondary", onClick: () => setConfirmRemove(false) }, "取消"),
						h("button", {
							className: "cpm-btn cpm-btn-primary",
							style: { background: "#ef4444", borderColor: "#ef4444", color: "#ffffff" },
							disabled: busy,
							onClick: async () => {
								setConfirmRemove(false);
								setBusy(true);
								await onRemove();
								setBusy(false);
							},
						}, busy ? "卸载中…" : "卸载"),
					),
				),
			)
		);
	}

	// ────────────────────────── MCP Tool Popover ──────────────────────────
	const GLOBAL_MCP_TOOLS_CACHE = (() => {
		try {
			const raw = localStorage.getItem("cpm_mcp_tools_cache_v1");
			return raw ? JSON.parse(raw) : {};
		} catch {
			return {};
		}
	})();

	function saveMcpToolsCache(key, data) {
		GLOBAL_MCP_TOOLS_CACHE[key] = data;
		try {
			localStorage.setItem("cpm_mcp_tools_cache_v1", JSON.stringify(GLOBAL_MCP_TOOLS_CACHE));
		} catch {}
	}

	// ────────────────────────── Floating MCP Tool Detail Popover ──────────────────────────
	function McpToolPopover({ hovered, isDisabled: propIsDisabled, onToggle, onMouseEnter, onMouseLeave }) {
		if (!hovered || !hovered.tool || !hovered.rect) return null;
		const t = hovered.tool;
		const rect = hovered.rect;
		const tName = typeof t === "string" ? t : (t.name || "");
		const isDisabled = propIsDisabled !== undefined ? propIsDisabled : (hovered.isDisabled === true);
		const title = tName ? tName.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : (t.annotations?.title || "");
		const desc = t.description || "No description provided for this MCP tool.";
		const props = t.inputSchema?.properties ? Object.keys(t.inputSchema.properties) : [];
		const requiredProps = Array.isArray(t.inputSchema?.required) ? t.inputSchema.required : [];

		const bodyRef = useRef(null);
		const [bodyMaskClass, setBodyMaskClass] = useState("");

		const updateBodyMask = useCallback(() => {
			const el = bodyRef.current;
			if (!el) return;
			const { scrollTop, scrollHeight, clientHeight } = el;
			const maxScroll = scrollHeight - clientHeight;
			if (maxScroll <= 3) {
				setBodyMaskClass("");
				return;
			}
			const canScrollUp = scrollTop > 3;
			const canScrollDown = scrollTop < maxScroll - 3;
			if (canScrollUp && canScrollDown) {
				setBodyMaskClass(" mask-both");
			} else if (canScrollDown) {
				setBodyMaskClass(" mask-bottom");
			} else if (canScrollUp) {
				setBodyMaskClass(" mask-top");
			} else {
				setBodyMaskClass("");
			}
		}, []);

		useEffect(() => {
			updateBodyMask();
			const timer = setTimeout(updateBodyMask, 40);
			return () => clearTimeout(timer);
		}, [updateBodyMask, desc, props]);

		const popWidth = 340;
		const popHeight = 220;
		const gap = 4;
		const margin = 10;
		const vpW = (typeof window !== "undefined" ? window.innerWidth : 1000) || 1000;
		const vpH = (typeof window !== "undefined" ? window.innerHeight : 800) || 800;

		// Default: place on the RIGHT side of the hovered pill with a compact 4px gap
		let left = rect.right + gap;
		let top = rect.top - 4;
		let isFlipped = false;

		// Boundary check: if overflowing right, place to the LEFT of the pill
		if (left + popWidth + margin > vpW) {
			if (rect.left - popWidth - gap > margin) {
				left = rect.left - popWidth - gap;
				isFlipped = true;
			} else {
				left = Math.max(margin, Math.min(rect.left, vpW - popWidth - margin));
				if (rect.bottom + popHeight + margin < vpH) {
					top = rect.bottom + gap;
				} else {
					top = Math.max(margin, rect.top - popHeight - gap);
				}
			}
		}

		// Vertical boundary clamping: guarantee it is never clipped by screen/modal bottom
		top = Math.max(margin, Math.min(top, vpH - popHeight - margin));

		return h("div", {
			className: "cpm-mcp-tool-popover" + (isFlipped ? " is-flipped-left" : ""),
			style: {
				left: `${left}px`,
				top: `${top}px`,
			},
			onMouseEnter,
			onMouseLeave,
			onWheel: (e) => e.stopPropagation(),
		},
			// Sticky Top Header (outside scrolling area)
			h("div", { className: "cpm-mcp-tool-popover-header" },
				h("div", { className: "cpm-mcp-tool-popover-title" }, title),
				h("span", {
					className: "cpm-mcp-tool-popover-badge " + (isDisabled ? "is-disabled" : "is-enabled"),
					onClick: (e) => {
						if (onToggle) {
							e.stopPropagation();
							onToggle();
						}
					},
				}, isDisabled ? "已禁用" : "已启用"),
			),

			// Scrollable Body with Feathering Masks (No Scrollbar, All Params)
			h("div", {
				ref: bodyRef,
				className: "cpm-mcp-tool-popover-body" + bodyMaskClass,
				onScroll: updateBodyMask,
			},
				h(SmartMarkdown, { text: desc, className: "cpm-mcp-tool-popover-desc" }),
				props.length > 0 && h("div", { className: "cpm-mcp-tool-popover-params" },
					props.map((p) => {
						const isReq = requiredProps.includes(p);
						const pType = t.inputSchema?.properties?.[p]?.type || "any";
						return h("span", {
							key: p,
							className: "cpm-mcp-tool-popover-param-tag",
							style: isReq ? { background: "rgba(99, 102, 241, 0.15)", color: "#6366f1", fontWeight: 600 } : {},
						}, `${p}${isReq ? "*" : ""}: ${pType}`);
					}),
				),
			),
		);
	}

	// ────────────────────────────── Manage Page ──────────────────────────────
	function ManagePage({ record, state, rows, refreshState, showToast, onBack, onClose }) {
		const [tab, setTab] = useState("skills");
		const [searchOpen, setSearchOpen] = useState(false);
		const [tabQuery, setTabQuery] = useState("");
		const searchInputRef = useRef(null);
		const [menuOpen, setMenuOpen] = useState(false);
		const [busy, setBusy] = useState(false);
		const [updating, setUpdating] = useState(false);
		const [toggling, setToggling] = useState(false);
		const [togglingConn, setTogglingConn] = useState(null);
		const [confirmRemove, setConfirmRemove] = useState(false);
		const [authDialog, setAuthDialog] = useState(null);
		const [diagHover, setDiagHover] = useState(false);
		const [expandedConnectors, setExpandedConnectors] = useState({});
		const [connectorToolsData, setConnectorToolsData] = useState(() => {
			// Zero-latency instant seed from memory/localStorage cache
			const initial = {};
			if (record && Array.isArray(record.connectors)) {
				record.connectors.forEach((c) => {
					const cName = typeof c === "string" ? c : c.name;
					const key = `${record.name}::${cName}`;
					if (GLOBAL_MCP_TOOLS_CACHE[key]) {
						initial[cName] = {
							loading: false,
							error: null,
							tools: GLOBAL_MCP_TOOLS_CACHE[key].tools || [],
							disabledTools: GLOBAL_MCP_TOOLS_CACHE[key].disabledTools || [],
						};
					}
				});
			}
			return initial;
		});
		const [hoveredTool, setHoveredTool] = useState(null);
		const hoverTimerRef = useRef(null);
		const leaveTimerRef = useRef(null);

		const formatToolTitle = (rawName) => {
			if (!rawName) return "";
			return rawName.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
		};

		const loadConnectorTools = useCallback(async (connectorName) => {
			const key = `${record.name}::${connectorName}`;
			const cached = GLOBAL_MCP_TOOLS_CACHE[key];
			const hasCachedTools = Array.isArray(cached?.tools) && cached.tools.length > 0;

			// If we already have cached tools, never show a spinner (0ms display)
			if (!hasCachedTools) {
				setConnectorToolsData((prev) => ({
					...prev,
					[connectorName]: { ...(prev[connectorName] || {}), loading: true, error: null },
				}));
			}

			try {
				const res = await api(`/plugins/${encodeURIComponent(record.name)}/connectors/${encodeURIComponent(connectorName)}/tools`);
				const tools = Array.isArray(res.tools) ? res.tools : [];
				const disabledTools = Array.isArray(res.disabledTools) ? res.disabledTools : [];

				if (tools.length > 0) {
					saveMcpToolsCache(key, { tools, disabledTools });
				}

				setConnectorToolsData((prev) => ({
					...prev,
					[connectorName]: {
						loading: false,
						error: res.ok ? null : (res.message || "获取能力列表失败"),
						tools: tools.length > 0 ? tools : (prev[connectorName]?.tools || []),
						disabledTools,
					},
				}));
			} catch (e) {
				if (!hasCachedTools) {
					setConnectorToolsData((prev) => ({
						...prev,
						[connectorName]: {
							loading: false,
							error: e.message,
							tools: [],
							disabledTools: [],
						},
					}));
				}
			}
		}, [record?.name]);

		// Pre-fetch tools in background as soon as ManagePage opens for connected connectors
		useEffect(() => {
			if (record && Array.isArray(record.connectors)) {
				record.connectors.forEach((c) => {
					const cName = typeof c === "string" ? c : c.name;
					const isConnected = typeof c === "object" ? (c.connected === true) : false;
					if (isConnected) {
						loadConnectorTools(cName);
					}
				});
			}
		}, [record?.name, record?.connectors, loadConnectorTools]);

		const toggleExpandConnector = useCallback((connectorName) => {
			setExpandedConnectors((prev) => {
				const nextState = !prev[connectorName];
				const curr = connectorToolsData[connectorName];
				if (nextState && (!curr || !curr.tools || curr.tools.length === 0)) {
					loadConnectorTools(connectorName);
				}
				return { ...prev, [connectorName]: nextState };
			});
		}, [loadConnectorTools, connectorToolsData]);

		const toggleTool = useCallback(async (connectorName, toolName, forcedEnabled) => {
			const key = `${record.name}::${connectorName}`;
			const cached = GLOBAL_MCP_TOOLS_CACHE[key] || {};
			const currTools = connectorToolsData[connectorName]?.tools || cached.tools || [];
			const currDisabled = connectorToolsData[connectorName]?.disabledTools || cached.disabledTools || [];

			const isCurrentlyDisabled = currDisabled.includes(toolName);
			const willBeEnabled = typeof forcedEnabled === "boolean" ? forcedEnabled : isCurrentlyDisabled;

			const nextDisabled = willBeEnabled
				? currDisabled.filter((t) => t !== toolName)
				: Array.from(new Set([...currDisabled, toolName]));

			// Persist immediately in memory and localStorage cache
			saveMcpToolsCache(key, {
				tools: currTools,
				disabledTools: nextDisabled,
			});

			setConnectorToolsData((prev) => {
				const prevConn = prev[connectorName] || {};
				return {
					...prev,
					[connectorName]: {
						...prevConn,
						tools: prevConn.tools || currTools,
						disabledTools: nextDisabled,
					},
				};
			});

			try {
				const res = await api(`/plugins/${encodeURIComponent(record.name)}/connectors/${encodeURIComponent(connectorName)}/tools/toggle`, {
					method: "POST",
					body: JSON.stringify({ toolName, enabled: willBeEnabled }),
				});
				if (res && Array.isArray(res.disabledTools)) {
					saveMcpToolsCache(key, {
						tools: currTools,
						disabledTools: res.disabledTools,
					});
					setConnectorToolsData((prev) => ({
						...prev,
						[connectorName]: {
							...(prev[connectorName] || {}),
							disabledTools: res.disabledTools,
						},
					}));
				}
			} catch (e) {
				showToast("操作失败", e.message, { restart: false });
				loadConnectorTools(connectorName);
			}
		}, [record?.name, connectorToolsData, loadConnectorTools]);

		const [marketPlugin, setMarketPlugin] = useState(() => {
			if (!record) return null;
			const sourceRows = (rows && rows[record.sourceId]) || [];
			return sourceRows.find((p) => p.name === record.name) || null;
		});

		useEffect(() => {
			if (!record) return;
			let alive = true;
			const sourceRows = (rows && rows[record.sourceId]) || [];
			const found = sourceRows.find((p) => p.name === record.name);
			if (found) {
				setMarketPlugin(found);
			} else {
				api("/plugins/" + encodeURIComponent(record.sourceId) + "/" + encodeURIComponent(record.name))
					.then((res) => {
						if (alive && res && res.plugin) {
							setMarketPlugin(res.plugin);
						}
					})
					.catch(() => {});
			}
			return () => { alive = false; };
		}, [record?.name, record?.sourceId, rows]);

		const installedVersion = record ? (record.version || "1.0.0") : "1.0.0";
		const latestVersion = (marketPlugin && (marketPlugin.version || (marketPlugin.detail && marketPlugin.detail.version))) || null;
		const hasUpdate = !!(latestVersion && compareSemver(latestVersion, installedVersion) > 0);

		const manageRef = useRef(null);
		const [manageMaskClass, setManageMaskClass] = useState("");

		const updateManageMask = useCallback(() => {
			const el = manageRef.current;
			if (!el) return;
			const { scrollTop, scrollHeight, clientHeight } = el;
			const maxScroll = scrollHeight - clientHeight;
			if (maxScroll <= 4) {
				setManageMaskClass("");
				return;
			}
			const canScrollUp = scrollTop > 4;
			const canScrollDown = scrollTop < maxScroll - 4;
			if (canScrollUp && canScrollDown) {
				setManageMaskClass(" mask-both");
			} else if (canScrollDown) {
				setManageMaskClass(" mask-bottom");
			} else if (canScrollUp) {
				setManageMaskClass(" mask-top");
			} else {
				setManageMaskClass("");
			}
		}, []);

		useEffect(() => {
			updateManageMask();
			window.addEventListener("resize", updateManageMask);
			return () => window.removeEventListener("resize", updateManageMask);
		}, [updateManageMask]);

		useEffect(() => {
			if (record) {
				setTab("skills");
				setTabQuery("");
				setSearchOpen(false);
				setMenuOpen(false);
				if (manageRef.current) {
					manageRef.current.scrollTop = 0;
				}
				updateManageMask();
			}
		}, [record?.name, updateManageMask]);

		useEffect(() => {
			const timer = setTimeout(updateManageMask, 60);
			return () => clearTimeout(timer);
		}, [record, tab, tabQuery, updateManageMask]);

		useEffect(() => {
			if (searchOpen && searchInputRef.current) {
				searchInputRef.current.focus();
			}
		}, [searchOpen]);

		useEffect(() => {
			if (!record) onClose();
		}, [record, onClose]);

		useEffect(() => {
			refreshState();
		}, []);

		useEffect(() => {
			const onDocClick = (e) => {
				if (!e.target.closest(".cpm-menu")) {
					setMenuOpen(false);
				}
			};
			if (menuOpen) {
				document.addEventListener("mousedown", onDocClick);
				return () => document.removeEventListener("mousedown", onDocClick);
			}
		}, [menuOpen]);

		if (!record) return null;

		const source = state.sources.find((s) => s.id === record.sourceId);
		const skills = (Array.isArray(record.skills) && record.skills.length > 0)
			? record.skills
			: (marketPlugin?.detail?.skills && Array.isArray(marketPlugin.detail.skills) && marketPlugin.detail.skills.length > 0)
				? marketPlugin.detail.skills
				: (marketPlugin?.skills && Array.isArray(marketPlugin.skills) && marketPlugin.skills.length > 0)
					? marketPlugin.skills
					: (record.skills || []);
		const agents = (Array.isArray(record.agents) && record.agents.length > 0)
			? record.agents
			: (marketPlugin?.detail?.agents && Array.isArray(marketPlugin.detail.agents) && marketPlugin.detail.agents.length > 0)
				? marketPlugin.detail.agents
				: (marketPlugin?.agents && Array.isArray(marketPlugin.agents) && marketPlugin.agents.length > 0)
					? marketPlugin.agents
					: (record.agents || []);
		const prompts = (Array.isArray(record.prompts) && record.prompts.length > 0)
			? record.prompts
			: (marketPlugin?.detail?.prompts && Array.isArray(marketPlugin.detail.prompts) && marketPlugin.detail.prompts.length > 0)
				? marketPlugin.detail.prompts
				: (marketPlugin?.prompts && Array.isArray(marketPlugin.prompts) && marketPlugin.prompts.length > 0)
					? marketPlugin.prompts
					: (record.prompts || []);
		const connectors = (Array.isArray(record.connectors) && record.connectors.length > 0)
			? record.connectors
			: (marketPlugin?.detail?.connectors && Array.isArray(marketPlugin.detail.connectors) && marketPlugin.detail.connectors.length > 0)
				? marketPlugin.detail.connectors
				: (marketPlugin?.connectors && Array.isArray(marketPlugin.connectors) && marketPlugin.connectors.length > 0)
					? marketPlugin.connectors
					: (record.connectors || []);
		const hooks = (Array.isArray(record.hooks) && record.hooks.length > 0)
			? record.hooks
			: (marketPlugin?.detail?.hooks && Array.isArray(marketPlugin.detail.hooks) && marketPlugin.detail.hooks.length > 0)
				? marketPlugin.detail.hooks
				: (marketPlugin?.hooks && Array.isArray(marketPlugin.hooks) && marketPlugin.hooks.length > 0)
					? marketPlugin.hooks
					: (record.hooks || []);
		const lspServers = (Array.isArray(record.lspServers) && record.lspServers.length > 0)
			? record.lspServers
			: (marketPlugin?.detail?.lspServers && Array.isArray(marketPlugin.detail.lspServers) && marketPlugin.detail.lspServers.length > 0)
				? marketPlugin.detail.lspServers
				: (marketPlugin?.lspServers && Array.isArray(marketPlugin.lspServers) && marketPlugin.lspServers.length > 0)
					? marketPlugin.lspServers
					: (record.lspServers || []);

		const toggle = async () => {
			setToggling(true);
			try {
				await api(`/plugins/${record.name}/toggle`, {
					method: "POST",
					body: JSON.stringify({ enabled: !record.enabled }),
				});
				await refreshState();
				showToast(record.enabled ? "已禁用插件" : "已启用插件", "插件状态已实时更新并生效。", { restart: false });
			} catch (e) {
				showToast("操作失败", e.message, { restart: false });
			} finally {
				setToggling(false);
			}
		};

		const toggleConn = async (connectorName, currentConnected) => {
			setTogglingConn(connectorName);
			try {
				await api(`/plugins/${record.name}/connectors/${connectorName}/toggle`, {
					method: "POST",
					body: JSON.stringify({ enabled: !currentConnected }),
				});
				await refreshState();
				showToast(!currentConnected ? "已连接 Connector" : "已断开 Connector", `MCP 服务 ${connectorName} 配置已实时更新。`, { restart: false });
			} catch (e) {
				showToast("操作失败", e.message, { restart: false });
			} finally {
				setTogglingConn(null);
			}
		};

		const update = async () => {
			setUpdating(true);
			try {
				const result = await api(`/plugins/${record.name}/update`, { method: "POST" });
				await refreshState();
				showToast("更新完成", `${result.skills.length} 个技能已实时重新就绪并生效。`, { restart: false });
			} catch (e) {
				showToast("更新失败", e.message, { restart: false });
			} finally {
				setUpdating(false);
			}
		};

		const remove = async () => {
			setBusy(true);
			try {
				await api(`/plugins/${record.name}`, { method: "DELETE" });
				for (const k of Object.keys(GLOBAL_MCP_TOOLS_CACHE)) {
					if (k.startsWith(`${record.name}::`)) {
						delete GLOBAL_MCP_TOOLS_CACHE[k];
					}
				}
				try {
					localStorage.setItem("cpm_mcp_tools_cache_v1", JSON.stringify(GLOBAL_MCP_TOOLS_CACHE));
				} catch {}
				await refreshState();
				showToast("已卸载插件", "插件副本与技能注册已实时移除并生效。", { restart: false });
				onClose();
			} catch (e) {
				showToast("卸载失败", e.message, { restart: false });
			} finally {
				setBusy(false);
			}
		};

		const getArgsJsonError = (s) => {
			const raw = (s || "").trim();
			if (!raw) return null;
			try {
				const parsed = JSON.parse(raw);
				if (!Array.isArray(parsed)) return "Must be valid JSON.";
				return null;
			} catch {
				return "Must be valid JSON.";
			}
		};

		const availableTabs = [
			skills.length > 0 && "skills",
			agents.length > 0 && "agents",
			connectors.length > 0 && "connectors",
			hooks.length > 0 && "hooks",
			prompts.length > 0 && "prompts",
			lspServers.length > 0 && "lsp",
		].filter(Boolean);

		const activeTab = availableTabs.includes(tab) ? tab : (availableTabs[0] || "skills");

		const filterItems = (arr, extract) => {
			if (!tabQuery.trim()) return arr;
			const q = tabQuery.trim().toLowerCase();
			return arr.filter((item) => {
				const text = extract(item).toLowerCase();
				return text.includes(q) || q.split(/\s+/).every((word) => text.includes(word));
			});
		};

		const visibleSkills = filterItems(skills, (s) => typeof s === "string" ? s : `${s.name || ""} ${s.command || ""} ${s.description || ""}`);
		const visibleAgents = filterItems(agents, (a) => typeof a === "string" ? a : `${a.name || a.file || ""} ${a.description || ""}`);
		const visiblePrompts = filterItems(prompts, (p) => typeof p === "string" ? p : p.name || "");
		const visibleHooks = filterItems(hooks, (h) => typeof h === "string" ? h : `${h.name || h.event || ""} ${h.command || ""}`);
		const visibleLspServers = filterItems(lspServers, (ls) => typeof ls === "string" ? ls : `${ls.name || ""} ${ls.command || ""}`);
		const visibleConnectors = filterItems(connectors, (c) => {
			if (typeof c === "string") return c;
			return `${c.name || ""} ${c.type || ""} ${c.url || ""} ${c.command || ""} ${(c.args || []).join(" ")}`;
		});
		const openAuthDialog = (connectorName, connObj) => {
			const existingHeaders = (connObj && typeof connObj === "object" && connObj.headers) ? connObj.headers : {};
			const headerEntries = Object.entries(existingHeaders)
				.filter(([_, v]) => typeof v === "string" && !v.includes("${") && v.trim().length > 0)
				.map(([k, v], i) => ({
					_id: `h_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
					key: (k === "Authorization" || k === "authorization") ? "" : k,
					value: v != null ? String(v) : "",
					isSecret: true,
				}));

			const existingEnv = (connObj && typeof connObj === "object" && connObj.env) ? connObj.env : {};
			const envEntries = Object.entries(existingEnv)
				.filter(([_, v]) => typeof v === "string" && !v.includes("${") && v.trim().length > 0)
				.map(([k, v], i) => ({
					_id: `e_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
					key: k,
					value: v != null ? String(v) : "",
					isSecret: true,
				}));

			const isHttpOnly = !!(connObj && (connObj.url || connObj.type === "http" || connObj.type === "sse") && !connObj.command);
			const isStdioOnly = !!(connObj && (connObj.command || connObj.type === "stdio") && !connObj.url);
			const allowedTransports = isHttpOnly ? ["http"] : (isStdioOnly ? ["stdio"] : ["http", "stdio"]);
			const initialTransport = isHttpOnly ? "http" : (isStdioOnly ? "stdio" : ((connObj && connObj.type === "stdio") ? "stdio" : "http"));

			let rawArgs = "";
			if (connObj && connObj.args) {
				if (Array.isArray(connObj.args)) {
					rawArgs = connObj.args.length > 0 ? JSON.stringify(connObj.args) : "";
				} else {
					const s = String(connObj.args).trim();
					rawArgs = (s === "[]" || s === '[""]') ? "" : s;
				}
			}

			setAuthDialog({
				connectorName,
				transport: initialTransport,
				allowedTransports,
				url: (connObj && connObj.url) || (connectorName === "notion" ? "https://mcp.notion.com/mcp" : (connectorName === "github" ? "https://api.githubcopilot.com/mcp/" : "")),
				headersList: headerEntries,
				args: rawArgs,
				envList: envEntries,
				oauth: (connObj && connObj.oauth) || "none",
				testing: false,
				saving: false,
				status: "untested",
				statusMessage: "",
				lastResult: null,
			});
		};

		useEffect(() => {
			if (!authDialog && !confirmRemove) return;
			const onKey = (e) => {
				if (e.key === "Escape") {
					if (authDialog) setAuthDialog(null);
					if (confirmRemove) setConfirmRemove(false);
				}
			};
			window.addEventListener("keydown", onKey);
			return () => window.removeEventListener("keydown", onKey);
		}, [authDialog, confirmRemove]);

		return h(React.Fragment, null,
			h("div", {
				ref: manageRef,
				className: "cpm-manage" + manageMaskClass,
				onScroll: updateManageMask,
			},
				h("div", { className: "cpm-manage-head" },
					h("button", { className: "cpm-back", style: { padding: 0 }, onClick: onBack }, h(IconChevronLeft), "Back"),
				),

			h("div", { className: "cpm-title-row", style: { marginTop: 8 } },
				h("div", { className: "cpm-title" }, record.displayName || record.name),
				h("button", {
					className: "cpm-btn cpm-btn-secondary",
					disabled: updating || toggling || busy || !hasUpdate,
					"data-cpm-tip": updating ? "正在更新…" : (hasUpdate ? `可更新至 v${latestVersion}` : `当前已是最新版本 (v${installedVersion})`),
					onClick: hasUpdate && !updating ? update : undefined,
				}, updating ? "Updating…" : "Update"),
				h("button", {
					className: "cpm-toggle" + (record.enabled ? " on" : ""),
					onClick: toggling ? undefined : toggle,
					disabled: toggling || updating || busy,
				}),
				h("div", { className: "cpm-menu" },
					h("button", { className: "cpm-icon-btn", style: { width: 32, height: 32, padding: 0 }, onClick: () => setMenuOpen(!menuOpen) }, h(IconMore)),
					menuOpen && h("div", { className: "cpm-menu-pop" },
						h("div", {
							className: "cpm-menu-item danger",
							onClick: () => { setMenuOpen(false); setConfirmRemove(true); },
						}, "卸载插件"),
					),
				),
			),

			h("div", { className: "cpm-meta" },
				h("div", null,
					h("span", { className: "k" }, "Source"),
					h("span", { className: "v" },
						h("a", { href: source ? source.url : "#", target: "_blank", rel: "noreferrer" },
							`Marketplace (${source ? source.name : record.sourceId})`,
						),
					),
				),
				h("div", null,
					h("span", { className: "k" }, "Version"),
					h("span", { className: "v" }, record.version || "1.0.0"),
				),
				h("div", null,
					h("span", { className: "k" }, "Author"),
					h("span", { className: "v" }, record.author || "Anthropic"),
				),
			),

			record.description && h("div", { className: "cpm-section" },
				h("div", { className: "cpm-section-title" }, "Description"),
				h("div", { className: "cpm-desc", style: { marginTop: 6 } }, h(SmartMarkdown, { text: record.description })),
			),

			// Capability Tabs
			availableTabs.length > 0 && h("div", { className: "cpm-tabs" },
				skills.length > 0 && h("button", {
					className: "cpm-tab2" + (activeTab === "skills" ? " active" : ""),
					onClick: () => setTab("skills"),
				}, "Skills"),
				agents.length > 0 && h("button", {
					className: "cpm-tab2" + (activeTab === "agents" ? " active" : ""),
					onClick: () => setTab("agents"),
				}, "Agents"),
				connectors.length > 0 && h("button", {
					className: "cpm-tab2" + (activeTab === "connectors" ? " active" : ""),
					onClick: () => setTab("connectors"),
				}, "Connectors"),
				hooks.length > 0 && h("button", {
					className: "cpm-tab2" + (activeTab === "hooks" ? " active" : ""),
					onClick: () => setTab("hooks"),
				}, "Hooks"),
				prompts.length > 0 && h("button", {
					className: "cpm-tab2" + (activeTab === "prompts" ? " active" : ""),
					onClick: () => setTab("prompts"),
				}, "Prompts"),
				lspServers.length > 0 && h("button", {
					className: "cpm-tab2" + (activeTab === "lsp" ? " active" : ""),
					onClick: () => setTab("lsp"),
				}, "LSP Servers"),
				h("div", { className: "cpm-tabbar-search" },
					!searchOpen && h("button", {
						className: "cpm-tab-search-btn",
						onClick: () => setSearchOpen(true),
					}, h(IconSearch)),
					searchOpen && h("div", { className: "cpm-tab-search-box" },
						h("svg", {
							width: 14,
							height: 14,
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "var(--cpm-muted)",
							strokeWidth: 2,
							strokeLinecap: "round",
							strokeLinejoin: "round",
							style: { flexShrink: 0 },
						},
							h("circle", { cx: 11, cy: 11, r: 8 }),
							h("line", { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }),
						),
						h("input", {
							ref: searchInputRef,
							className: "cpm-tab-search-input",
							value: tabQuery,
							placeholder: activeTab === "skills" ? "Search skills" : (activeTab === "agents" ? "Search agents" : (activeTab === "connectors" ? "Search connectors" : (activeTab === "hooks" ? "Search hooks" : (activeTab === "lsp" ? "Search LSP servers" : "Search...")))),
							onChange: (e) => setTabQuery(e.target.value),
							onKeyDown: (e) => {
								if (e.key === "Escape") {
									if (tabQuery) setTabQuery("");
									else setSearchOpen(false);
								}
							},
							onBlur: () => {
								if (!tabQuery) setSearchOpen(false);
							},
						}),
						tabQuery && h("button", {
							className: "cpm-tab-search-clear",
							"aria-label": "清空",
							onMouseDown: (e) => e.preventDefault(),
							onClick: () => {
								setTabQuery("");
								if (searchInputRef.current) searchInputRef.current.focus();
							},
						},
							h("svg", {
								width: 10,
								height: 10,
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: 2.5,
								strokeLinecap: "round",
								strokeLinejoin: "round",
							},
								h("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
								h("line", { x1: "6", y1: "6", x2: "18", y2: "18" }),
							),
						),
					),
				),
			),

			availableTabs.length > 0 && h("div", { className: "cpm-hint" },
				activeTab === "skills" ? "用户快捷斜杠命令，可在对话中输入 / 唤起，或由主 Agent 自动执行。" :
				(activeTab === "agents" ? "任务级专业子代理（Subagents），在对话中主模型通过 subagent 工具按需自律委派调用，不污染全局斜杠命令与会话预设。" :
				(activeTab === "connectors" ? "Model Context Protocol (MCP) 上下文连接器，提供外部工具与数据接入。" :
				(activeTab === "hooks" ? "生命周期钩子，在会话事件与工具执行期间自动触发。" :
				(activeTab === "lsp" ? "语言服务器（LSP），为代码编辑提供跳转定义、查找引用、悬停等智能能力。" :
				"自定义提示词模板，可在对话中引用。"))))
			),

			availableTabs.length === 0 && h("div", { className: "cpm-empty", style: { padding: "40px 20px", textAlign: "center" } }, "该插件未提供任何技能、MCP 连接器或预设组件。"),

			activeTab === "skills" && h("div", { className: "cpm-skill-list" },
				visibleSkills.length === 0 && h("div", { className: "cpm-empty" }, tabQuery ? "未找到匹配的技能" : "没有可用技能"),
				visibleSkills.map((s) => {
					const cmd = typeof s === "string" ? (s.startsWith("/") ? s : `/${s}`) : (s.command || (s.name ? (s.name.startsWith("/") ? s.name : `/${s.name}`) : ""));
					let desc = typeof s === "string" ? "" : (s.description || "");
					if (desc === ">" || desc === "|" || desc === ">-" || desc === "|-") desc = "";
					return h("div", { key: cmd || s.name || "skill", className: "cpm-skill-item" },
						h("div", { className: "cpm-skill-name" }, cmd || s.name || "skill"),
						desc ? h("div", { className: "cpm-skill-desc" }, h(SmartMarkdown, { text: desc })) : null,
					);
				}),
			),

			activeTab === "agents" && h("div", { className: "cpm-skill-list" },
				visibleAgents.length === 0 && h("div", { className: "cpm-empty" }, tabQuery ? "未找到匹配的 agents" : "没有可用 agents"),
				visibleAgents.map((a) => {
					const aFile = typeof a === "string" ? a : a.file || a.name || String(a);
					const aDisplayName = typeof a === "object" && a.displayName ? a.displayName : (typeof a === "object" && a.name ? a.name : aFile.replace(/\.[^.]+$/, ""));
					let aDesc = typeof a === "object" && a.description ? a.description : "Autonomous sub-agent workflow";
					if (aDesc === ">" || aDesc === "|" || aDesc === ">-" || aDesc === "|-") aDesc = "Autonomous sub-agent workflow";
					const tools = typeof a === "object" && a.tools ? a.tools : null;
					const model = typeof a === "object" && a.model ? a.model : null;

					return h("div", { key: aFile, className: "cpm-skill-item" },
						h("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
							h("div", { className: "cpm-skill-name" }, aDisplayName),
							h("span", {
								style: {
									fontSize: 10.5,
									fontWeight: 600,
									padding: "2px 6px",
									borderRadius: 4,
									background: "rgba(168, 85, 247, 0.12)",
									color: "#a855f7",
									letterSpacing: "0.5px",
								},
							}, "SUBAGENT"),
							model && h("span", {
								style: {
									fontSize: 10.5,
									padding: "1px 5px",
									borderRadius: 3,
									background: "rgba(161, 161, 170, 0.12)",
									color: "var(--cpm-muted)",
								},
							}, model),
						),
						aDesc ? h("div", { className: "cpm-skill-desc", style: { marginTop: 4 } }, h(SmartMarkdown, { text: aDesc })) : null,
						tools && h("div", {
							style: {
								fontSize: 11.5,
								color: "var(--cpm-muted)",
								marginTop: 4,
								display: "flex",
								alignItems: "center",
								gap: 4,
							},
						},
							h("span", { style: { opacity: 0.7 } }, "Tools:"),
							h("code", { style: { fontSize: 11, background: "rgba(128,128,128,0.1)", padding: "1px 4px", borderRadius: 3 } }, tools),
						),
					);
				}),
			),

			activeTab === "hooks" && h("div", { className: "cpm-skill-list" },
				visibleHooks.length === 0 && h("div", { className: "cpm-empty" }, tabQuery ? "未找到匹配的 hooks" : "没有可用 hooks"),
				visibleHooks.map((hookItem) => {
					const hName = typeof hookItem === "string" ? hookItem : hookItem.name || hookItem.event || String(hookItem);
					const isConfigFile = hName.endsWith(".json") || hName.endsWith(".yaml") || hName.endsWith(".yml");
					const isScript = hName.endsWith(".sh") || hName.endsWith(".cmd") || hName.endsWith(".bat") || hName.endsWith(".js") || hName.endsWith(".py");
					const hookDesc = isConfigFile
						? "Lifecycle hook configuration manifest"
						: (isScript ? "Executable hook trigger script" : "Session event & lifecycle hook trigger");
					return h("div", { key: hName, className: "cpm-skill-item" },
						h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
							h("div", { className: "cpm-skill-name" }, hName),
							h("span", {
								style: {
									fontSize: 11,
									fontWeight: 600,
									padding: "2px 6px",
									borderRadius: 4,
									background: isConfigFile ? "rgba(99, 102, 241, 0.12)" : (isScript ? "rgba(245, 158, 11, 0.12)" : "rgba(16, 185, 129, 0.12)"),
									color: isConfigFile ? "#6366f1" : (isScript ? "#f59e0b" : "#10b981"),
								},
							}, isConfigFile ? "CONFIG" : (isScript ? "SCRIPT" : "EVENT")),
						),
						h("div", { className: "cpm-skill-desc", style: { marginTop: 4 } }, hookDesc),
					);
				}),
			),

			activeTab === "prompts" && h("div", { className: "cpm-skill-list" },
				visiblePrompts.length === 0 && h("div", { className: "cpm-empty" }, tabQuery ? "未找到匹配的 prompts" : "没有可用 prompts"),
				visiblePrompts.map((p) => {
					const pName = typeof p === "string" ? p : p.name || String(p);
					return h("div", { key: pName, className: "cpm-skill-item" },
						h("div", { className: "cpm-skill-name" }, pName),
						h("div", { className: "cpm-skill-desc" }, "Custom prompt template"),
					);
				}),
			),

			activeTab === "lsp" && h("div", { className: "cpm-skill-list" },
				visibleLspServers.length === 0 && h("div", { className: "cpm-empty" }, tabQuery ? "未找到匹配的 LSP servers" : "没有 LSP servers"),
				visibleLspServers.map((ls) => {
					const lsName = typeof ls === "string" ? ls : (ls.name || "");
					const cmd = typeof ls === "object" ? (ls.command || "") : "";
					const extToLang = typeof ls === "object" && ls.extensionToLanguage && typeof ls.extensionToLanguage === "object"
						? Object.keys(ls.extensionToLanguage)
						: [];
					const isActive = typeof ls === "object" ? (ls.active === true) : false;
					const missingCommand = typeof ls === "object" ? (ls.missingCommand === true) : false;
					return h("div", {
						key: lsName,
						className: "cpm-skill-item",
						style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" },
					},
						h("div", { style: { minWidth: 0, flex: 1 } },
							h("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
								h("div", { className: "cpm-skill-name" }, lsName),
								h("span", {
									style: {
										fontSize: 11,
										fontWeight: 600,
										padding: "2px 7px",
										borderRadius: 4,
										background: missingCommand ? "rgba(239, 68, 68, 0.12)" : (isActive ? "rgba(34, 197, 94, 0.12)" : "rgba(161, 161, 170, 0.12)"),
										color: missingCommand ? "#ef4444" : (isActive ? "#22c55e" : "var(--cpm-muted)"),
										whiteSpace: "nowrap",
									},
								}, missingCommand ? "● 未安装二进制文件" : (isActive ? "● 已激活" : "○ 未激活")),
							),
							missingCommand && h("div", {
								className: "cpm-skill-desc",
								style: { marginTop: 3, color: "#ef4444", opacity: 0.9 },
							}, `未找到命令 "${cmd || lsName}"，请安装该二进制文件后回到此页面，将自动激活。`),
							cmd && h("div", { className: "cpm-skill-desc" }, cmd),
							extToLang.length > 0 && h("div", { className: "cpm-skill-desc", style: { marginTop: 2, opacity: 0.7 } }, extToLang.join(", ")),
						),
					);
				}),
			),

			activeTab === "connectors" && h("div", { className: "cpm-skill-list" },
				visibleConnectors.length === 0 && h("div", { className: "cpm-empty" }, tabQuery ? "未找到匹配的 connectors" : "没有 connectors"),
				visibleConnectors.map((c) => {
					const cName = typeof c === "string" ? c : c.name;
					const needsAuth = typeof c === "object" ? (c.needsAuth === true) : false;
					const isAuthenticated = typeof c === "object" ? (c.authenticated === true) : true;
					const isConnected = typeof c === "object" ? (c.connected === true) : false;
					const transport = typeof c === "object" ? (c.type || (c.url ? "HTTP" : "stdio")) : "MCP";
					const endpoint = typeof c === "object" ? (c.url || (c.command ? `${c.command} ${(c.args || []).join(" ")}` : "")) : "";
					const isPendingVerify = needsAuth && !isAuthenticated;
					const isExpanded = !!expandedConnectors[cName];
					const toolsInfo = connectorToolsData[cName];
					const toolsList = toolsInfo?.tools || [];
					const disabledTools = toolsInfo?.disabledTools || [];
					const activeToolsCount = toolsList.filter((t) => !disabledTools.includes(typeof t === "string" ? t : t.name)).length;

					return h("div", {
						key: cName,
						className: "cpm-skill-item cpm-connector-item",
						style: { display: "flex", flexDirection: "column", alignItems: "stretch", padding: "12px 2px", gap: 0 },
					},
						h("div", {
							style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, width: "100%" },
						},
							h("div", { style: { minWidth: 0, flex: 1 } },
								h("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
									h("div", { className: "cpm-skill-name" }, cName),
									h(isPendingVerify ? "button" : "span", {
										className: isPendingVerify ? "cpm-status-btn" : "",
										style: {
											fontSize: 11.5,
											fontWeight: 600,
											padding: "2px 7px",
											borderRadius: 4,
											background: isConnected ? "rgba(37, 99, 235, 0.12)" : (isPendingVerify ? "rgba(245, 158, 11, 0.14)" : "rgba(161, 161, 170, 0.12)"),
											color: isConnected ? "#3b82f6" : (isPendingVerify ? "#f59e0b" : "var(--cpm-muted)"),
											border: isPendingVerify ? "1px solid rgba(245, 158, 11, 0.28)" : "none",
											cursor: isPendingVerify ? "pointer" : "default",
											display: "inline-flex",
											alignItems: "center",
											outline: "none",
											transition: "all 0.15s ease",
										},
										onClick: isPendingVerify ? () => openAuthDialog(cName, c) : undefined,
									}, isConnected ? "● 已连接" : (isPendingVerify ? "○ 待验证" : "○ 未连接")),

									// Figure 2: Dropdown Chevron + Tool count badge (Clean minimal arrow, tight spacing, no tooltip)
									isConnected && isAuthenticated && h("div", {
										style: {
											display: "inline-flex",
											alignItems: "center",
											gap: 4,
											cursor: "pointer",
											marginLeft: 2,
										},
										onClick: (e) => {
											e.stopPropagation();
											toggleExpandConnector(cName);
										},
									},
										h("button", {
											type: "button",
											className: "cpm-connector-collapse-btn" + (isExpanded ? " is-expanded" : ""),
										}, h(IconArrow, { size: 10 })),
										toolsList.length > 0 && h("span", {
											style: {
												fontSize: 11.5,
												fontWeight: 500,
												color: "var(--cpm-muted)",
												userSelect: "none",
											},
										}, `${activeToolsCount} tools enabled${disabledTools.length > 0 ? ` (${disabledTools.length} disabled)` : ""}`),
									),
								),
								h("div", { className: "cpm-skill-desc", style: { marginTop: 4 } },
									endpoint ? `${transport.toUpperCase()} · ${endpoint}` : "Model Context Protocol (MCP) 服务连接器",
								),
							),
							h("div", { style: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } },
								h("button", {
									className: "cpm-icon-btn",
									style: { width: 28, height: 28, padding: 0, borderRadius: 6 },
									onClick: () => openAuthDialog(cName, c),
								}, h(IconSettings, { size: 14 })),
								h("button", {
									className: "cpm-toggle" + (isConnected ? " on" : ""),
									disabled: togglingConn === cName || busy,
									onClick: () => {
										if (needsAuth && !isAuthenticated && !isConnected) {
											openAuthDialog(cName, c);
										} else {
											toggleConn(cName, isConnected);
										}
									},
								}),
							),
						),

						// Figure 1 & Figure 3: Expandable Capabilities Panel
						isConnected && isAuthenticated && isExpanded && h("div", {
							className: "cpm-mcp-tools-panel",
						},
							toolsInfo?.loading && h("div", {
								style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", color: "var(--cpm-muted)", fontSize: 12 },
							},
								h("span", { className: "cpm-spin-ring", style: { width: 13, height: 13, borderWidth: 1.5 } }),
								"正在启动本地 MCP 服务并解析工具列表（首次启动可能需要下载组件）…",
							),

							!toolsInfo?.loading && toolsInfo?.error && h("div", {
								style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, color: "#ef4444", fontSize: 12 },
							},
								h("span", null, `获取能力失败: ${toolsInfo.error}`),
								h("button", {
									type: "button",
									className: "cpm-btn-ghost",
									style: { height: 24, padding: "0 8px", fontSize: 11 },
									onClick: () => loadConnectorTools(cName),
								}, "重试"),
							),

							!toolsInfo?.loading && !toolsInfo?.error && toolsList.length === 0 && h("div", {
								style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, color: "var(--cpm-muted)", fontSize: 12, padding: "4px 0" },
							},
								h("span", null, "该 MCP 服务暂未暴露可用工具能力 (tools)"),
								h("button", {
									type: "button",
									className: "cpm-btn-ghost",
									style: { height: 24, padding: "0 8px", fontSize: 11 },
									onClick: () => loadConnectorTools(cName),
								}, "重新检测能力"),
							),

							!toolsInfo?.loading && !toolsInfo?.error && toolsList.length > 0 && h("div", { className: "cpm-mcp-tools-grid" },
								toolsList.map((t) => {
									const tName = typeof t === "string" ? t : t.name;
									const isDisabled = disabledTools.includes(tName);
									const toolKey = `${cName}::${tName}`;
									const isHovered = hoveredTool?.key === toolKey;
									const title = t.annotations?.title || formatToolTitle(tName);
									const desc = t.description || "No description provided for this MCP tool.";
									const props = t.inputSchema?.properties ? Object.keys(t.inputSchema.properties) : [];
									const requiredProps = Array.isArray(t.inputSchema?.required) ? t.inputSchema.required : [];

									return h("div", {
										key: tName,
										className: "cpm-mcp-tool-pill-wrap",
									},
										h("button", {
											type: "button",
											className: "cpm-mcp-tool-pill" + (isDisabled ? " is-disabled" : ""),
											onMouseEnter: (e) => {
												if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
												const rect = e.currentTarget.getBoundingClientRect();
												const nextHover = {
													connectorName: cName,
													tool: t,
													rect,
												};
												if (hoveredTool) {
													if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
													hoverTimerRef.current = setTimeout(() => {
														setHoveredTool(nextHover);
													}, 75);
												} else {
													setHoveredTool(nextHover);
												}
											},
											onMouseLeave: () => {
												if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
												leaveTimerRef.current = setTimeout(() => {
													setHoveredTool(null);
												}, 140);
											},
											onClick: (e) => {
												e.stopPropagation();
												toggleTool(cName, tName);
											},
										},
											h("span", { className: "cpm-mcp-tool-dot" }),
											tName,
										),
									);
								}),
							),
						),
					);
				}),
			),
			),

			authDialog && h("div", { className: "cpm-dialog", onClick: () => setAuthDialog(null) },
				h("div", { className: "cpm-mcp-modal", onClick: (e) => e.stopPropagation() },
					h("button", {
						className: "cpm-mcp-close-top",
						onClick: () => setAuthDialog(null),
					}, h(IconClose, { size: 14 })),

					h("div", { className: "cpm-mcp-body" },
						authDialog.transport === "http" && h("div", { className: "cpm-mcp-row cpm-mcp-row-top" },
							h("div", { className: "cpm-mcp-label" }, "Headers"),
							h("div", { className: "cpm-mcp-control" },
								h("div", { className: "cpm-mcp-card-box" },
									authDialog.headersList.map((hItem, idx) => {
										return h("div", { key: hItem._id || idx, className: "cpm-mcp-list-item" },
											h("input", {
												className: "cpm-mcp-input",
												style: { width: 140, flexShrink: 0 },
												placeholder: "Authorization",
												value: hItem.key,
												onChange: (e) => {
													const updated = [...authDialog.headersList];
													updated[idx] = { ...updated[idx], key: e.target.value };
													setAuthDialog({ ...authDialog, headersList: updated, status: "untested" });
												},
											}),
											h("div", { className: "cpm-mcp-pw-wrap" },
												h("input", {
													type: hItem.isSecret ? "password" : "text",
													className: "cpm-mcp-input",
													style: { paddingRight: 32 },
													placeholder: "Bearer ...",
													value: hItem.value,
													onChange: (e) => {
														const updated = [...authDialog.headersList];
														updated[idx] = { ...updated[idx], value: e.target.value };
														setAuthDialog({ ...authDialog, headersList: updated, status: "untested" });
													},
												}),
												h("button", {
													type: "button",
													className: "cpm-mcp-pw-btn",
													onClick: () => {
														const updated = [...authDialog.headersList];
														updated[idx] = { ...updated[idx], isSecret: !updated[idx].isSecret };
														setAuthDialog({ ...authDialog, headersList: updated });
													},
												}, hItem.isSecret ? h(IconEye, { size: 14 }) : h(IconEyeOff, { size: 14 })),
											),
											h("button", {
												type: "button",
												className: "cpm-mcp-del-btn",
												onClick: () => {
													const updated = authDialog.headersList.filter((_, i) => i !== idx);
													setAuthDialog({ ...authDialog, headersList: updated, status: "untested" });
												},
											}, h(IconClose, { size: 13 })),
										);
									}),
									h("button", {
										type: "button",
										className: "cpm-mcp-add-btn",
										onClick: () => {
											setAuthDialog({
												...authDialog,
												headersList: [...authDialog.headersList, { _id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, key: "", value: "", isSecret: true }],
											});
										},
									}, h(IconPlus, { size: 12 }), "Add"),
								),
							),
						),

						h("div", { className: "cpm-mcp-row" },
							h("div", { className: "cpm-mcp-label" }, "Transport"),
							h("div", { className: "cpm-mcp-control" },
								h(CustomSelect, {
									value: authDialog.transport,
									options: (authDialog.allowedTransports && authDialog.allowedTransports.length === 1)
										? (authDialog.allowedTransports[0] === "stdio" ? [{ label: "Local (stdio)", value: "stdio" }] : [{ label: "Streamable HTTP", value: "http" }])
										: [
											{ label: "Streamable HTTP", value: "http" },
											{ label: "Local (stdio)", value: "stdio" },
										],
									onChange: (val) => setAuthDialog({ ...authDialog, transport: val, status: "untested" }),
								}),
							),
						),

						authDialog.transport === "http" && h("div", { className: "cpm-mcp-row" },
							h("div", { className: "cpm-mcp-label" }, "URL"),
							h("div", { className: "cpm-mcp-control" },
								h("input", {
									className: "cpm-mcp-input",
									placeholder: "https://...",
									value: authDialog.url,
									onChange: (e) => setAuthDialog({ ...authDialog, url: e.target.value, status: "untested" }),
								}),
							),
						),

						authDialog.transport === "stdio" && (() => {
							const argsError = getArgsJsonError(authDialog.args);
							return h("div", { className: "cpm-mcp-row" },
								h("div", { className: "cpm-mcp-label" }, "Arguments"),
								h("div", { className: "cpm-mcp-control" },
									h("input", {
										className: "cpm-mcp-input" + (argsError ? " is-invalid" : ""),
										style: { fontFamily: (authDialog.args && authDialog.args.trim().length > 0) ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : "inherit" },
										placeholder: '["arg1", "arg2"]',
										value: authDialog.args,
										onChange: (e) => setAuthDialog({ ...authDialog, args: e.target.value, status: "untested" }),
									}),
									h("div", { className: "cpm-mcp-field-error-wrapper" + (argsError ? " is-visible" : "") },
										h("div", { className: "cpm-mcp-field-error-inner" },
											h("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0 } },
												h("circle", { cx: 12, cy: 12, r: 10 }),
												h("line", { x1: 12, y1: 8, x2: 12, y2: 12 }),
												h("line", { x1: 12, y1: 16, x2: 12.01, y2: 16 }),
											),
											h("span", null, argsError || "Must be valid JSON.")
										)
									)
								)
							);
						})(),

						authDialog.transport === "stdio" && h("div", { className: "cpm-mcp-row cpm-mcp-row-top" },
							h("div", { className: "cpm-mcp-label" }, "Environment variables"),
							h("div", { className: "cpm-mcp-control" },
								h("div", { className: "cpm-mcp-card-box" },
									authDialog.envList.map((eItem, idx) => {
										return h("div", { key: eItem._id || idx, className: "cpm-mcp-list-item" },
											h("input", {
												className: "cpm-mcp-input",
												style: { width: 140, flexShrink: 0 },
												placeholder: "KEY_NAME",
												value: eItem.key,
												onChange: (e) => {
													const updated = [...authDialog.envList];
													updated[idx] = { ...updated[idx], key: e.target.value };
													setAuthDialog({ ...authDialog, envList: updated, status: "untested" });
												},
											}),
											h("div", { className: "cpm-mcp-pw-wrap" },
												h("input", {
													type: eItem.isSecret ? "password" : "text",
													className: "cpm-mcp-input",
													style: { paddingRight: 32 },
													placeholder: "Value",
													value: eItem.value,
													onChange: (e) => {
														const updated = [...authDialog.envList];
														updated[idx] = { ...updated[idx], value: e.target.value };
														setAuthDialog({ ...authDialog, envList: updated, status: "untested" });
													},
												}),
												h("button", {
													type: "button",
													className: "cpm-mcp-pw-btn",
													onClick: () => {
														const updated = [...authDialog.envList];
														updated[idx] = { ...updated[idx], isSecret: !updated[idx].isSecret };
														setAuthDialog({ ...authDialog, envList: updated });
													},
												}, eItem.isSecret ? h(IconEye, { size: 14 }) : h(IconEyeOff, { size: 14 })),
											),
											h("button", {
												type: "button",
												className: "cpm-mcp-del-btn",
												onClick: () => {
													const updated = authDialog.envList.filter((_, i) => i !== idx);
													setAuthDialog({ ...authDialog, envList: updated, status: "untested" });
												},
											}, h(IconClose, { size: 13 })),
										);
									}),
									h("button", {
										type: "button",
										className: "cpm-mcp-add-btn",
										onClick: () => {
											setAuthDialog({
												...authDialog,
												envList: [...authDialog.envList, { _id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, key: "", value: "", isSecret: true }],
											});
										},
									}, h(IconPlus, { size: 12 }), "Add"),
								),
							),
						),

						authDialog.transport === "http" && h("div", { className: "cpm-mcp-row" },
							h("div", { className: "cpm-mcp-label" }, "OAuth"),
							h("div", { className: "cpm-mcp-control" },
								h(CustomSelect, {
									value: authDialog.oauth,
									options: [
										{ label: "None", value: "none" },
										{ label: "Auto-register (dynamic client registration)", value: "auto_register" },
										{ label: "Bring your own client", value: "custom" },
									],
									onChange: (val) => setAuthDialog({ ...authDialog, oauth: val, status: "untested" }),
								}),
							),
						),
					),

					h("div", { className: "cpm-mcp-footer" },
						h("div", {
							style: { display: "flex", alignItems: "center", minWidth: 0, flex: 1 },
						},
							h("div", {
								style: { position: "relative", display: "inline-flex", alignItems: "center" },
								onMouseEnter: () => setDiagHover(true),
								onMouseLeave: () => setDiagHover(false),
							},
								authDialog.status === "untested" && h("div", {
									className: "cpm-mcp-status-pill",
									style: { background: "rgba(161, 161, 170, 0.08)", color: "var(--cpm-muted)", cursor: "default" },
								},
									h("span", { style: { width: 5, height: 5, borderRadius: "50%", background: "currentColor", opacity: 0.6 } }),
									"Not tested"
								),

								authDialog.status === "testing" && h("div", {
									className: "cpm-mcp-status-pill",
									style: { background: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", cursor: "default" },
								},
									h("span", { className: "cpm-spin-ring", style: { width: 8, height: 8, borderWidth: 1.5 } }),
									"Testing..."
								),

								authDialog.status === "success" && h("div", {
									className: "cpm-mcp-status-pill",
									style: { background: "rgba(16, 185, 129, 0.12)", color: "#10b981", cursor: "default" },
								},
									h("span", { style: { width: 5, height: 5, borderRadius: "50%", background: "#10b981" } }),
									"Connected"
								),

								authDialog.status === "error" && h("div", {
									className: "cpm-mcp-status-pill",
									style: { background: "rgba(239, 68, 68, 0.12)", color: "#ef4444", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "default" },
								},
									h("span", { style: { width: 5, height: 5, borderRadius: "50%", background: "#ef4444", flexShrink: 0 } }),
									authDialog.statusMessage || "Connection failed"
								),

								diagHover && (authDialog.status === "success" || authDialog.status === "error") && h("div", { className: "cpm-mcp-diag-popover" },
									authDialog.status === "success" && h(React.Fragment, null,
										h("div", { className: "cpm-mcp-diag-header is-success" },
											h("span", null, `✓ Connected successfully · ${(authDialog.lastResult && authDialog.lastResult.duration != null) ? `${authDialog.lastResult.duration}ms` : "OK"}`),
											h("span", { style: { fontSize: 11, opacity: 0.8 } }, "200"),
										),
										h("div", { className: "cpm-mcp-diag-body" },
											h("div", { className: "cpm-mcp-diag-grid" },
												h("div", { className: "cpm-mcp-diag-item" },
													h("span", { className: "cpm-mcp-diag-k" }, "SERVER"),
													h("span", { className: "cpm-mcp-diag-v" }, authDialog.connectorName),
												),
												h("div", { className: "cpm-mcp-diag-item" },
													h("span", { className: "cpm-mcp-diag-k" }, "TRANSPORT"),
													h("span", { className: "cpm-mcp-diag-v" }, authDialog.transport === "stdio" ? "stdio" : "http"),
												),
												h("div", { className: "cpm-mcp-diag-endpoint" },
													authDialog.transport === "stdio"
														? `Local stdio: ${authDialog.args ? authDialog.args : "process active"}`
														: `HTTP ${authDialog.url || "endpoint"} → tools/list`
												),
											),
										),
									),

									authDialog.status === "error" && h(React.Fragment, null,
										h("div", { className: "cpm-mcp-diag-header is-error" },
											h("span", null, `✕ ${authDialog.lastResult?.status ? `Server returned ${authDialog.lastResult.status}` : "Connection failed"}`),
											authDialog.lastResult?.status && h("span", { style: { fontSize: 11, opacity: 0.8 } }, `${authDialog.lastResult.status}`),
										),
										h("div", { className: "cpm-mcp-diag-body" },
											h("div", { className: "cpm-mcp-diag-desc" }, authDialog.lastResult?.errorDetails || authDialog.statusMessage || "Error POSTing to endpoint"),
											h("div", { className: "cpm-mcp-diag-grid" },
												h("div", { className: "cpm-mcp-diag-item" },
													h("span", { className: "cpm-mcp-diag-k" }, "SERVER"),
													h("span", { className: "cpm-mcp-diag-v" }, authDialog.connectorName),
												),
												h("div", { className: "cpm-mcp-diag-item" },
													h("span", { className: "cpm-mcp-diag-k" }, "TRANSPORT"),
													h("span", { className: "cpm-mcp-diag-v" }, authDialog.transport === "stdio" ? "stdio" : "http"),
												),
												h("div", { className: "cpm-mcp-diag-endpoint" },
													h("div", { className: "cpm-mcp-diag-k", style: { marginBottom: 3 } }, "FAILED REQUEST"),
													authDialog.transport === "stdio"
														? `stdio command failed: ${authDialog.args || "default execution"}`
														: `POST ${authDialog.url || "endpoint"} → tools/list`
												),
											),
										),
									),
								),
							),
						),

						h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
							h("button", {
								className: "cpm-btn cpm-btn-secondary",
								disabled: authDialog.testing || authDialog.saving || (authDialog.transport === "stdio" && !!getArgsJsonError(authDialog.args)),
								onClick: async () => {
									const computedHeaders = {};
									for (const hItem of authDialog.headersList) {
										const v = (hItem.value || "").trim();
										if (!v) continue;
										const k = (hItem.key || "").trim() || "Authorization";
										computedHeaders[k] = v;
									}
									setAuthDialog((prev) => prev ? { ...prev, testing: true, status: "testing", statusMessage: "" } : null);
									try {
										const res = await api(`/plugins/${record.name}/connectors/${authDialog.connectorName}/verify`, {
											method: "POST",
											body: JSON.stringify({
												transport: authDialog.transport,
												url: authDialog.url,
												headers: computedHeaders,
												oauth: authDialog.oauth,
											}),
										});
										setAuthDialog((prev) => prev ? {
											...prev,
											testing: false,
											status: res.ok ? "success" : "error",
											statusMessage: res.message || (res.ok ? "验证成功" : "验证失败"),
											lastResult: res,
										} : null);
									} catch (err) {
										setAuthDialog((prev) => prev ? {
											...prev,
											testing: false,
											status: "error",
											statusMessage: err.message,
											lastResult: {
												ok: false,
												message: err.message,
												status: 500,
												server: prev.connectorName,
												transport: prev.transport,
												endpoint: prev.url,
												errorDetails: err.message,
											},
										} : null);
									}
								},
							}, authDialog.testing ? "测试中…" : (
								authDialog.transport === "stdio" ? "测试连接" : (
									(authDialog.oauth && authDialog.oauth !== "none") ? "Sign in & test" : (
										(authDialog.headersList && authDialog.headersList.some(h => (h.value || '').trim())) ? "验证并测试" : "测试连接"
									)
								)
							)),

							h("button", {
								className: "cpm-btn cpm-btn-primary",
								disabled: authDialog.saving || authDialog.testing || (authDialog.transport === "stdio" && !!getArgsJsonError(authDialog.args)),
								onClick: async () => {
									const computedHeaders = {};
									for (const hItem of authDialog.headersList) {
										const v = (hItem.value || "").trim();
										if (!v) continue;
										const k = (hItem.key || "").trim() || "Authorization";
										computedHeaders[k] = v;
									}
									setAuthDialog((prev) => prev ? { ...prev, saving: true } : null);
									try {
										let parsedArgs = [];
										if (authDialog.transport === "stdio" && authDialog.args.trim()) {
											try {
												const parsed = JSON.parse(authDialog.args);
												parsedArgs = Array.isArray(parsed) ? parsed : [String(parsed)];
											} catch {
												parsedArgs = [];
											}
										}
										const envMap = {};
										if (authDialog.transport === "stdio") {
											for (const eItem of authDialog.envList) {
												if (eItem.key.trim()) envMap[eItem.key.trim()] = eItem.value;
											}
										}
										await api(`/plugins/${record.name}/connectors/${authDialog.connectorName}/auth`, {
											method: "POST",
											body: JSON.stringify({
												transport: authDialog.transport,
												url: authDialog.url,
												headers: computedHeaders,
												oauth: authDialog.oauth,
												args: parsedArgs,
												env: envMap,
											}),
										});
										await refreshState();
										showToast("配置成功", `已成功保存 ${authDialog.connectorName} 认证信息并注册为可用 MCP 服务`, { restart: false });
										setAuthDialog(null);
									} catch (err) {
										showToast("保存失败", err.message);
										setAuthDialog((prev) => prev ? { ...prev, saving: false, status: "error", statusMessage: err.message } : null);
									}
								},
							}, authDialog.saving ? "保存中…" : "保存并启用"),
						),
					),
				),
			),

			confirmRemove && h("div", { className: "cpm-dialog", onClick: () => setConfirmRemove(false) },
				h("div", { className: "cpm-dialog-box", onClick: (e) => e.stopPropagation() },
					h("div", { className: "cpm-dialog-title" }, `卸载 ${record.displayName || record.name}？`),
					h("div", { className: "cpm-field", style: { color: "var(--cpm-muted)", fontSize: "13px", lineHeight: 1.5, marginBottom: "20px" } }, "将删除插件副本、技能与子代理注册及 MCP 配置。"),
					h("div", { className: "cpm-dialog-actions" },
						h("button", { className: "cpm-btn cpm-btn-secondary", onClick: () => setConfirmRemove(false) }, "取消"),
						h("button", { className: "cpm-btn cpm-btn-primary", style: { background: "#ef4444", borderColor: "#ef4444", color: "#ffffff" }, disabled: busy, onClick: remove }, busy ? "卸载中…" : "卸载"),
					),
				),
			),

			hoveredTool && (() => {
				const hoveredConnData = hoveredTool.connectorName ? connectorToolsData[hoveredTool.connectorName] : null;
				const toolName = typeof hoveredTool.tool === "string" ? hoveredTool.tool : hoveredTool.tool?.name;
				const isCurrentlyDisabled = hoveredConnData?.disabledTools?.includes(toolName) ?? false;
				return h(McpToolPopover, {
					hovered: hoveredTool,
					isDisabled: isCurrentlyDisabled,
					onToggle: () => toggleTool(hoveredTool.connectorName, toolName),
					onMouseEnter: () => {
						if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
						if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
					},
					onMouseLeave: () => {
						leaveTimerRef.current = setTimeout(() => {
							setHoveredTool(null);
						}, 140);
					},
				});
			})()
		);
	}

	class ErrorBoundary extends React.Component {
		constructor(props) {
			super(props);
			this.state = { hasError: false, error: null };
		}
		static getDerivedStateFromError(error) {
			return { hasError: true, error };
		}
		componentDidCatch(error, errorInfo) {
			console.error("UniversalPluginHub error caught by ErrorBoundary:", error, errorInfo);
		}
		render() {
			if (this.state.hasError) {
				return h("div", { style: { padding: 32, color: "#ef4444", fontSize: 13, fontFamily: "sans-serif" } },
					h("div", { style: { fontWeight: 600, fontSize: 15, marginBottom: 8 } }, "插件视图运行异常"),
					h("pre", { style: { background: "rgba(0,0,0,0.06)", padding: 12, borderRadius: 6, overflow: "auto", maxHeight: 300, whiteSpace: "pre-wrap", color: "#b91c1c" } },
						String(this.state.error?.stack || this.state.error?.message || this.state.error)
					),
					h("button", {
						className: "cpm-btn cpm-btn-primary",
						style: { marginTop: 12 },
						onClick: () => this.setState({ hasError: false, error: null })
					}, "重试恢复"),
				);
			}
			return this.props.children;
		}
	}

	// ────────────────────────────── Settings section entry ──────────────────────────────
	function Section({ ctx }) {
		return h(ErrorBoundary, null, h(MarketApp, { ctx }));
	}

	const name = "universal-plugin-hub";
	const inject = ["slots", "theme"];

	function apply(ctx) {
		ensureCss();
		ctx.slots.inject("settings.section", () => ctx.slots.register({
			name: "settings.section",
			id: "universal-plugin-hub",
			order: 50,
			label: () => "Agent 插件市场",
		}, () => h(Section, { ctx })));
	}

	exports.name = name;
	exports.inject = inject;
	exports.apply = apply;
	return module.exports;
}});
