import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const { create, act } = require('react-test-renderer');

const clientSource = fs.readFileSync(new URL('../client/client.js', import.meta.url), 'utf8');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Load client.js as a module
function loadClientModule() {
  let capturedModule = null;
  const context = {
    window: {
      __ModuleLoader__: {
        load: ({ factory }) => {
          capturedModule = factory((name) => {
            if (name === 'react') return React;
            return {};
          });
        },
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      setTimeout: () => 1,
      clearTimeout: () => {},
    },
    document: {
      addEventListener: () => {},
      removeEventListener: () => {},
      head: { appendChild: () => {} },
      getElementById: () => null,
      createElement: () => ({ setAttribute() {}, textContent: '' }),
      documentElement: { classList: { contains: () => false } },
      body: { classList: { contains: () => false } },
    },
    navigator: { clipboard: { writeText: () => {} } },
    URL,
    Buffer,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: () => {},
    MutationObserver: class { observe() {} disconnect() {} },
  };

  vm.runInNewContext(clientSource, context);
  return capturedModule;
}

test('R1 & R2: Sidebar market icon is a black-and-white squircle without text and labeled Plugin Hub', () => {
  const mod = loadClientModule();
  assert.ok(mod && typeof mod.apply === 'function', 'Module must export apply');

  let registeredLabel = null;
  let RegisteredIconComponent = null;

  const mockCtx = {
    slots: {
      inject: (slotName, fn) => {
        if (slotName === 'sidebar.panellist') {
          fn();
        }
      },
      register: (descriptor, Component) => {
        if (descriptor.name === 'sidebar.panellist') {
          registeredLabel = typeof descriptor.label === 'function' ? descriptor.label() : descriptor.label;
          RegisteredIconComponent = Component;
        }
      },
    },
    on: () => () => {},
  };

  mod.apply(mockCtx);

  // Check R2: Label is renamed to "Plugin Hub"
  assert.equal(registeredLabel, 'Plugin Hub', 'Sidebar navigation item text must be "Plugin Hub"');

  // Check R1: SidebarIcon is squircle shopping bag without inner text
  assert.ok(RegisteredIconComponent, 'SidebarIcon component must be registered');
  let tree;
  act(() => {
    tree = create(React.createElement(RegisteredIconComponent, { size: 18 }));
  });
  const json = tree.toJSON();
  assert.equal(json.type, 'svg');
  assert.equal(json.props.width, 18);
  assert.equal(json.props.height, 18);

  // Verify no text elements exist inside the icon
  function hasTextElements(node) {
    if (!node) return false;
    if (typeof node === 'string') return node.trim().length > 0;
    if (node.type === 'text' || node.type === 'tspan') return true;
    if (Array.isArray(node.children)) {
      return node.children.some(hasTextElements);
    }
    return false;
  }
  assert.equal(hasTextElements(json), false, 'Sidebar icon must not contain any text');

  // One filled path: squircle body with the U cut out (evenodd), no strokes
  const paths = json.children.filter((c) => c && c.type === 'path');
  assert.equal(paths.length, 1, 'Sidebar icon is a single filled path (body + U cut-out)');
  assert.equal(json.props.fill, 'currentColor', 'Icon is filled with currentColor, not outlined');
  assert.equal(json.props.fillRule, 'evenodd', 'U is cut out of the body via evenodd');
  assert.equal(json.props.stroke, undefined, 'No stroke — the icon is solid');
  assert.equal(json.props['aria-hidden'], 'true', 'Decorative icon is hidden from assistive tech');

  const d = paths[0].props.d;
  assert.match(d, /C/, 'Squircle body is built from cubic Béziers for continuous curvature');
  // U bowl outer arc: rx > ry (wider than tall), and the arm thickness stays chunky.
  const outer = d.match(/A([\d.]+) ([\d.]+) 0 0 0 17/);
  assert.ok(outer, 'U bowl is an elliptical arc');
  const [rx, ry] = [Number(outer[1]), Number(outer[2])];
  assert.ok(rx > ry, `U is wider than tall (rx ${rx} > ry ${ry})`);
  assert.ok(rx / ry > 1.15 && rx / ry < 1.55, `U is a shallow bowl (rx/ry ${(rx / ry).toFixed(2)})`);
  assert.ok(rx > 5 && rx < 6, `U spans about 0.55 of the body side (rx ${rx})`);
  assert.match(d, /ZM[0-9]/, 'U subpath is closed before the cut-out starts');

  // The body's subpath starts and ends on the right edge midpoint (x=21.75, y=12):
  // the seam sits on a straight span, so no visible join.
  const subpaths = d.split('Z').filter(Boolean);
  assert.equal(subpaths.length, 2, 'Body and U subpaths');
  assert.match(subpaths[0], /^M21\.75 12C/, 'Body starts at the right edge midpoint');
  assert.match(subpaths[0], /21\.75 12$/, 'Body closes back onto the same point');
});

test('R3: Playwright brand icon is the vector masks SVG and matches across list, detail, and manage views', () => {
  const brandStart = clientSource.indexOf('const BRAND_ICONS = {');
  const brandEnd = clientSource.indexOf('function AnthropicIcon', brandStart);
  const context = { URL };
  vm.runInNewContext(clientSource.slice(brandStart, brandEnd) + '\nglobalThis.BRAND_ICONS = BRAND_ICONS; globalThis.getPluginIconCandidates = getPluginIconCandidates;', context);

  assert.ok(context.BRAND_ICONS.playwright && context.BRAND_ICONS.playwright.startsWith('data:image/svg+xml;base64,'), 'BRAND_ICONS.playwright must be a crisp vector SVG data URI');
  const candidates = context.getPluginIconCandidates({ name: 'playwright' }, false);
  assert.equal(candidates[0], context.BRAND_ICONS.playwright, 'getPluginIconCandidates for playwright returns BRAND_ICONS.playwright');
});

test('R3: DetailView displays matched icon (Playwright & 3D fallback) to the left of plugin title', () => {
  // Extract icon and DetailView definitions
  const iconStart = clientSource.indexOf('const BRAND_ICONS = {');
  const iconEnd = clientSource.indexOf('\tfunction PluginCard(');
  const detailStart = clientSource.indexOf('\tfunction DetailView(');
  const detailEnd = clientSource.indexOf('\n\tfunction saveMcpToolsCache(', detailStart);

  const context = {
    ...React,
    React,
    h: React.createElement,
    useDetailScrollMask: () => ({ detailRef: { current: null }, maskClass: '', updateMask: () => {} }),
    IconChevronLeft: () => React.createElement('span', null, '<'),
    IconLink: () => React.createElement('span', null, 'link'),
    ExpandableSection: ({ title, children }) => React.createElement('div', null, title, children),
    SkillSummaryPill: () => null,
    AgentSummaryPill: () => null,
    ConnectorSummaryPill: () => null,
    LspSummaryPill: () => null,
    HookSummaryPill: () => null,
    PromptSummaryPill: () => null,
    SmartMarkdown: ({ text }) => React.createElement('div', null, text),
    URL,
  };

  vm.runInNewContext(
    clientSource.slice(iconStart, iconEnd) + '\n' +
    clientSource.slice(detailStart, detailEnd) + '\n' +
    'globalThis.DetailView = DetailView; globalThis.PluginIcon = PluginIcon; globalThis.BRAND_ICONS = BRAND_ICONS;',
    context
  );

  // 1. DetailView with Playwright plugin
  let viewPw;
  act(() => {
    viewPw = create(React.createElement(context.DetailView, {
      plugin: { name: 'playwright', displayName: 'Playwright Testing' },
      isDark: false,
      onBack: () => {},
    }));
  });

  const pwJson = viewPw.toJSON();
  const pwRoot = Array.isArray(pwJson) ? pwJson[0] : pwJson;
  const pwTitleRow = pwRoot.children.find((c) => c && c.props && c.props.className === 'cpm-title-row');
  assert.ok(pwTitleRow, 'DetailView should render .cpm-title-row');

  // Verify .cpm-title-group exists as the first element in .cpm-title-row
  const pwTitleGroup = pwTitleRow.children[0];
  assert.equal(pwTitleGroup.props.className, 'cpm-title-group', 'First child of cpm-title-row must be cpm-title-group');

  // Inside .cpm-title-group, first child is PluginIcon (.cpm-card-icon), second child is .cpm-title
  const pwIconContainer = pwTitleGroup.children[0];
  assert.ok(pwIconContainer.props.className.includes('cpm-card-icon'), 'First element in title group is the plugin icon');
  const pwImg = pwIconContainer.children.find((c) => c && c.type === 'img');
  assert.equal(pwImg.props.src, context.BRAND_ICONS.playwright, 'Playwright icon in detail view matches BRAND_ICONS.playwright');

  const pwTitle = pwTitleGroup.children[1];
  assert.equal(pwTitle.props.className, 'cpm-title', 'Plugin title is to the right of the icon');
  assert.equal(pwTitle.children[0], 'Playwright Testing');

  // 2. DetailView with fallback plugin (without custom icon)
  let viewFallback;
  act(() => {
    viewFallback = create(React.createElement(context.DetailView, {
      plugin: { name: 'first-principles', displayName: 'First Principles' },
      isDark: false,
      onBack: () => {},
    }));
  });

  const fbJson = viewFallback.toJSON();
  const fbRoot = Array.isArray(fbJson) ? fbJson[0] : fbJson;
  const fbTitleRow = fbRoot.children.find((c) => c && c.props && c.props.className === 'cpm-title-row');
  const fbTitleGroup = fbTitleRow.children[0];
  const fbIconContainer = fbTitleGroup.children[0];
  assert.ok(fbIconContainer.props.className.includes('cpm-fallback-icon'), 'Fallback plugin uses fallback 3D icon');
  const fbImg = fbIconContainer.children.find((c) => c && c.type === 'img');
  assert.ok(fbImg.props.src.includes('compass_3d.png'), 'Fallback plugin in detail view uses 3D fluent icon');
});

test('R3: ManagePage displays matched icon (Playwright & 3D fallback) to the left of plugin title', () => {
  // Extract icon and ManagePage definitions
  const iconStart = clientSource.indexOf('const BRAND_ICONS = {');
  const iconEnd = clientSource.indexOf('\tfunction PluginCard(');
  const manageStart = clientSource.indexOf('\tfunction ManagePage(');
  const manageEnd = clientSource.indexOf('\n\t// ────────────────────────────── Main sidebar', manageStart);

  const context = {
    ...React,
    React,
    h: React.createElement,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    window: {
      addEventListener: () => {},
      removeEventListener: () => {},
      setTimeout: (fn) => setTimeout(fn, 0),
      clearTimeout: (id) => clearTimeout(id),
    },
    document: {
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    useHoverPreview: () => [null, () => {}, { suspend: () => {} }],
    GLOBAL_MCP_TOOLS_CACHE: {},
    saveMcpToolsCache: () => {},
    useOauthVerification: () => ({ pending: null, start: () => {}, cancel: () => {} }),
    compareSemver: () => 0,
    cleanMcpError: (e) => e.message,
    isRemoteTransport: () => false,
    IconChevronLeft: () => React.createElement('span', null, '<'),
    IconMore: () => React.createElement('span', null, '...'),
    IconRefresh: () => null,
    IconCheck: () => null,
    IconCross: () => null,
    IconLink: () => null,
    IconSliders: () => null,
    IconSearch: () => null,
    api: async () => ({}),
    URL,
  };

  vm.runInNewContext(
    clientSource.slice(iconStart, iconEnd) + '\n' +
    clientSource.slice(manageStart, manageEnd) + '\n' +
    'globalThis.ManagePage = ManagePage; globalThis.PluginIcon = PluginIcon; globalThis.BRAND_ICONS = BRAND_ICONS;',
    context
  );

  // 1. ManagePage with Playwright plugin
  let viewPw;
  act(() => {
    viewPw = create(React.createElement(context.ManagePage, {
      record: { name: 'playwright', displayName: 'Playwright Manager', sourceId: 'official' },
      state: { sources: [], plugins: [] },
      rows: {},
      refreshState: () => {},
      isDark: false,
      onBack: () => {},
      onClose: () => {},
    }));
  });

  const pwJson = viewPw.toJSON();
  const pwContainer = Array.isArray(pwJson) ? pwJson[0] : pwJson;
  const pwTitleRow = pwContainer.children.find((c) => c && c.props && c.props.className === 'cpm-title-row');
  assert.ok(pwTitleRow, 'ManagePage renders .cpm-title-row');

  // Verify .cpm-title-group exists as the first element in .cpm-title-row
  const pwTitleGroup = pwTitleRow.children[0];
  assert.equal(pwTitleGroup.props.className, 'cpm-title-group', 'First child of cpm-title-row must be cpm-title-group');
  const pwIconContainer = pwTitleGroup.children[0];
  assert.ok(pwIconContainer.props.className.includes('cpm-card-icon'), 'Icon displayed to the left of title');
  const pwImg = pwIconContainer.children.find((c) => c && c.type === 'img');
  assert.equal(pwImg.props.src, context.BRAND_ICONS.playwright, 'Playwright icon in manage view matches BRAND_ICONS.playwright');

  const pwTitle = pwTitleGroup.children[1];
  assert.equal(pwTitle.props.className, 'cpm-title');
  assert.equal(pwTitle.children[0], 'Playwright Manager');

  // 2. ManagePage with fallback plugin (without custom icon)
  let viewFallback;
  act(() => {
    viewFallback = create(React.createElement(context.ManagePage, {
      record: { name: 'research', displayName: 'Deep Research', sourceId: 'skills-local' },
      state: { sources: [], plugins: [] },
      rows: {},
      refreshState: () => {},
      isDark: false,
      onBack: () => {},
      onClose: () => {},
    }));
  });

  const fbJson = viewFallback.toJSON();
  const fbContainer = Array.isArray(fbJson) ? fbJson[0] : fbJson;
  const fbTitleRow = fbContainer.children.find((c) => c && c.props && c.props.className === 'cpm-title-row');
  const fbTitleGroup = fbTitleRow.children[0];
  const fbIconContainer = fbTitleGroup.children[0];
  assert.ok(fbIconContainer.props.className.includes('cpm-fallback-icon'), 'Fallback plugin in manage view uses 3D icon');
  const fbImg = fbIconContainer.children.find((c) => c && c.type === 'img');
  assert.ok(fbImg.props.src.includes('microscope_3d.png'), 'Fallback plugin in manage view uses 3D fluent icon');
});

test('CSS styling conformance for .cpm-title-group and typography', () => {
  assert.match(clientSource, /\.cpm-title-group\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*12px;/);
  assert.match(clientSource, /\.cpm-title-group\s+\.cpm-card-icon\s*\{[^}]*width:\s*38px;[^}]*height:\s*38px;/);
  assert.match(clientSource, /\.cpm-title\s*\{[^}]*letter-spacing:\s*-0\.015em;/);
  assert.match(clientSource, /\.cpm-title\s*\{[^}]*overflow-wrap:\s*break-word;/);
});

test('Edge cases: Theme resolution fallback, missing record handling, name-only plugins, and default icon size', () => {
  const mod = loadClientModule();
  let RegisteredIconComponent = null;
  const mockCtx = {
    slots: {
      inject: (slotName, fn) => { if (slotName === 'sidebar.panellist') fn(); },
      register: (descriptor, Component) => {
        if (descriptor.name === 'sidebar.panellist') RegisteredIconComponent = Component;
      },
    },
    on: () => () => {},
  };
  mod.apply(mockCtx);

  // 1. SidebarIcon defaults to size 18 when no props passed
  let defaultIconTree;
  act(() => {
    defaultIconTree = create(React.createElement(RegisteredIconComponent));
  });
  const defaultIconJson = defaultIconTree.toJSON();
  assert.equal(defaultIconJson.props.width, 18, 'Default sidebar icon width is 18');
  assert.equal(defaultIconJson.props.height, 18, 'Default sidebar icon height is 18');

  // 1b. Direct SidebarIcon call without any arguments does not throw and defaults to size 18
  const directCallIcon = RegisteredIconComponent();
  assert.equal(directCallIcon.props.width, 18, 'Direct SidebarIcon() invocation without arguments defaults width to 18');

  // Extract components for DetailView & ManagePage tests
  const themeStart = clientSource.indexOf('function isDarkMode(');
  const themeEnd = clientSource.indexOf('\n\t// ────────────────────────────── API', themeStart);
  const iconStart = clientSource.indexOf('const BRAND_ICONS = {');
  const iconEnd = clientSource.indexOf('\tfunction PluginCard(');
  const detailStart = clientSource.indexOf('\tfunction DetailView(');
  const detailEnd = clientSource.indexOf('\n\tfunction saveMcpToolsCache(', detailStart);
  const manageStart = clientSource.indexOf('\tfunction ManagePage(');
  const manageEnd = clientSource.indexOf('\n\t// ────────────────────────────── Main sidebar', manageStart);

  const context = {
    ...React,
    React,
    h: React.createElement,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    window: {
      addEventListener: () => {},
      removeEventListener: () => {},
      setTimeout: (fn) => setTimeout(fn, 0),
      clearTimeout: (id) => clearTimeout(id),
      getComputedStyle: () => ({ backgroundColor: 'transparent', color: 'transparent' }),
      matchMedia: (query) => ({ matches: query.includes('dark') }),
    },
    document: {
      addEventListener: () => {},
      removeEventListener: () => {},
      documentElement: { getAttribute: () => null, classList: { contains: () => false } },
      body: { getAttribute: () => null, classList: { contains: () => false } },
    },
    useDetailScrollMask: () => ({ detailRef: { current: null }, maskClass: '', updateMask: () => {} }),
    useHoverPreview: () => [null, () => {}, { suspend: () => {} }],
    GLOBAL_MCP_TOOLS_CACHE: {},
    saveMcpToolsCache: () => {},
    useOauthVerification: () => ({ pending: null, start: () => {}, cancel: () => {} }),
    compareSemver: () => 0,
    cleanMcpError: (e) => e.message,
    isRemoteTransport: () => false,
    IconChevronLeft: () => React.createElement('span', null, '<'),
    IconMore: () => React.createElement('span', null, '...'),
    IconLink: () => React.createElement('span', null, 'link'),
    ExpandableSection: ({ title, children }) => React.createElement('div', null, title, children),
    SkillSummaryPill: () => null,
    AgentSummaryPill: () => null,
    ConnectorSummaryPill: () => null,
    LspSummaryPill: () => null,
    HookSummaryPill: () => null,
    PromptSummaryPill: () => null,
    SmartMarkdown: ({ text }) => React.createElement('div', null, text),
    IconRefresh: () => null,
    IconCheck: () => null,
    IconCross: () => null,
    IconSliders: () => null,
    IconSearch: () => null,
    api: async () => ({}),
    URL,
  };

  vm.runInNewContext(
    clientSource.slice(themeStart, themeEnd) + '\n' +
    clientSource.slice(iconStart, iconEnd) + '\n' +
    clientSource.slice(detailStart, detailEnd) + '\n' +
    clientSource.slice(manageStart, manageEnd) + '\n' +
    'globalThis.isDarkMode = isDarkMode; globalThis.DetailView = DetailView; globalThis.ManagePage = ManagePage; globalThis.PluginIcon = PluginIcon;',
    context
  );

  // 1c. isDarkMode falls back to prefers-color-scheme media query when styles are transparent
  assert.equal(context.isDarkMode(), true, 'isDarkMode detects dark theme from prefers-color-scheme media query');

  // 2. DetailView with omitted isDark and fallback name
  let viewDetailOmitted;
  act(() => {
    viewDetailOmitted = create(React.createElement(context.DetailView, {
      plugin: { name: 'unnamed-plugin' },
      onBack: () => {},
    }));
  });
  const dtJson = viewDetailOmitted.toJSON();
  const dtRoot = Array.isArray(dtJson) ? dtJson[0] : dtJson;
  const dtTitleRow = dtRoot.children.find((c) => c && c.props && c.props.className === 'cpm-title-row');
  const dtTitleGroup = dtTitleRow.children[0];
  const dtTitle = dtTitleGroup.children[1];
  assert.equal(dtTitle.children[0], 'unnamed-plugin', 'Falls back to plugin.name when displayName is missing');

  // 3. DetailView with dark mode enabled
  let viewDetailDark;
  act(() => {
    viewDetailDark = create(React.createElement(context.DetailView, {
      plugin: { name: 'playwright', displayName: 'Playwright Dark' },
      isDark: true,
      onBack: () => {},
    }));
  });
  assert.ok(viewDetailDark.toJSON(), 'DetailView renders cleanly in dark theme');

  // 4. ManagePage with null record returns null
  let viewManageNull;
  act(() => {
    viewManageNull = create(React.createElement(context.ManagePage, {
      record: null,
      state: { sources: [], plugins: [] },
      rows: {},
      refreshState: () => {},
      onBack: () => {},
      onClose: () => {},
    }));
  });
  assert.equal(viewManageNull.toJSON(), null, 'ManagePage returns null safely when record is null');

  // 5. ManagePage with omitted isDark and missing displayName
  let viewManageOmitted;
  act(() => {
    viewManageOmitted = create(React.createElement(context.ManagePage, {
      record: { name: 'custom-tool', sourceId: 'official' },
      state: { sources: [], plugins: [] },
      rows: {},
      refreshState: () => {},
      onBack: () => {},
      onClose: () => {},
    }));
  });
  const mgJson = viewManageOmitted.toJSON();
  const mgContainer = Array.isArray(mgJson) ? mgJson[0] : mgJson;
  const mgTitleRow = mgContainer.children.find((c) => c && c.props && c.props.className === 'cpm-title-row');
  const mgTitleGroup = mgTitleRow.children[0];
  const mgTitle = mgTitleGroup.children[1];
  assert.equal(mgTitle.children[0], 'custom-tool', 'ManagePage falls back to record.name when displayName is missing');

  // 6. ManagePage preserves declared custom icons from marketPlugin even when record has undefined icons
  const customSvgUri = 'data:image/svg+xml;base64,PHN2Zz48Y2lyY2xlIHI9IjUiLz48L3N2Zz4=';
  let viewManageDeclared;
  act(() => {
    viewManageDeclared = create(React.createElement(context.ManagePage, {
      record: { name: 'market-custom', sourceId: 'custom-src', icons: undefined },
      state: { sources: [{ id: 'custom-src', name: 'Custom' }], plugins: [] },
      rows: {
        'custom-src': [
          { name: 'market-custom', displayName: 'Market Custom Plugin', icons: { light: [customSvgUri] } },
        ],
      },
      refreshState: () => {},
      isDark: false,
      onBack: () => {},
      onClose: () => {},
    }));
  });
  const mdJson = viewManageDeclared.toJSON();
  const mdContainer = Array.isArray(mdJson) ? mdJson[0] : mdJson;
  const mdTitleRow = mdContainer.children.find((c) => c && c.props && c.props.className === 'cpm-title-row');
  const mdTitleGroup = mdTitleRow.children[0];
  const mdIconContainer = mdTitleGroup.children[0];
  const mdImg = mdIconContainer.children.find((c) => c && c.type === 'img');
  assert.ok(mdImg, 'ManagePage renders img for declared market plugin icon');
  assert.equal(mdImg.props.src, customSvgUri, 'ManagePage preserves marketPlugin declared icons over undefined record.icons');
  const mdTitle = mdTitleGroup.children[1];
  assert.equal(mdTitle.children[0], 'Market Custom Plugin', 'ManagePage uses marketPlugin displayName when record displayName is omitted');
});

