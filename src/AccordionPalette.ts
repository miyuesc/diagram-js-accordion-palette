import {
  isArray,
  isFunction,
  forEach
} from 'min-dash';
import {
  domify,
  query as domQuery,
  attr as domAttr,
  clear as domClear,
  classes as domClasses,
  delegate as domDelegate,
  event as domEvent
} from 'min-dom';

import Canvas from 'diagram-js/lib/core/Canvas'
import EventBus, { Event as DjsEvent } from "diagram-js/lib/core/EventBus";
import Translate from 'diagram-js/lib/i18n/translate/translate'
import { escapeCSS } from "diagram-js/lib/util/EscapeUtil";

export type PaletteEntry = {
  action: (event: Event, autoActivate: boolean) => any;
  className?: string;
  group?: string;
  html?: string;
  imageUrl?: string;
  separator?: boolean;
  title?: string;
};
export type PaletteEntries = Record<string, PaletteEntry>;
export type PaletteEntriesCallback = (entries: PaletteEntries) => PaletteEntries;
export interface PaletteProvider {
  getPaletteEntries: () => PaletteEntriesCallback | PaletteEntries;
}


type DelegateHtmlElement = HTMLElement & Event & {
  delegateTarget: HTMLElement | null
  target: HTMLElement | null
  originalEvent: Event
}

export type AccordionPaletteConfig = {
  accordion?: boolean
  showName?: boolean
  defaultOpenGroups?: string[]
}

type PaletteEventInstance = DjsEvent & {
  providers: PaletteProvider[]
  tool: string
}
type PaletteState = AccordionPaletteConfig & {
  open?: boolean
}

const ENTRY_SELECTOR = '.entry';

const PALETTE_PREFIX = 'djs-accordion-palette';
const PALETTE_SHOWN_CLS = 'shown';
const PALETTE_OPEN_CLS = 'open';

const DEFAULT_PRIORITY = 1000;

class AccordionPalette {
  static $inject: string[]
  static HTML_MARKUP: string =
    '<div class="djs-palette djs-accordion-palette">' +
    '<div class="djs-palette-entries"></div>' +
    '</div>'

  private _config: AccordionPaletteConfig;
  private _canvas: Canvas;
  private _eventBus: EventBus;
  private _translate: typeof Translate;

  private _diagramInitialized: boolean;
  private _container: HTMLElement;
  private _entries: PaletteEntries;
  private _toolsContainer: HTMLElement;
  private _activeTool: string;

  constructor(config: AccordionPaletteConfig, canvas: Canvas, eventBus: EventBus, translate: typeof Translate) {
    this._config = {
      ...(config || {})
    }
    this._canvas = canvas
    this._eventBus = eventBus
    this._translate = translate

    eventBus.on('tool-manager.update', (event: PaletteEventInstance) => {
      const tool = event.tool;
      this.updateToolHighlight(tool);
    });

    eventBus.on('i18n.changed', () => {
      this._update();
    });

    eventBus.on('diagram.init', () => {
      this._diagramInitialized = true;
      this._rebuild();
    });
  }

  registerProvider(priority: PaletteProvider | number, provider?: PaletteProvider) {
    if (!provider) {
      provider = priority as PaletteProvider;
      priority = DEFAULT_PRIORITY;
    }

    this._eventBus.on('palette.getProviders', priority as number, function(event: PaletteEventInstance) {
      event.providers.push(provider);
    });

    this._rebuild();
  };

  getEntries(): PaletteEntries {
    const providers = this._getProviders();
    return providers.reduce(addPaletteEntries, {});
  };

  _rebuild() {
    if (!this._diagramInitialized) {
      return;
    }

    const providers = this._getProviders();

    if (!providers.length) {
      return;
    }

    if (!this._container) {
      this._init();
    }

    this._update();
  };

  _init() {
    const self = this;
    const eventBus = this._eventBus;

    const parentContainer = this._getParentContainer();
    const container = this._container = domify(AccordionPalette.HTML_MARKUP);

    parentContainer.appendChild(container);
    domClasses(parentContainer).add(PALETTE_PREFIX + PALETTE_SHOWN_CLS);

    domEvent.bind(container, 'mousedown', function(event: Event) {
      event.stopPropagation();
    });
    domDelegate.bind(container, ENTRY_SELECTOR, 'click', function(event: DelegateHtmlElement) {
      self.trigger('click', event);
    });
    domDelegate.bind(container, ENTRY_SELECTOR, 'dragstart', function(event: DelegateHtmlElement) {
      self.trigger('dragstart', event);
    });

    domEvent.bind(container, 'mousewheel', function(event: Event) {
        event.stopPropagation();
        event.stopImmediatePropagation();
    });
    domEvent.bind(container, 'wheel', function(event: Event) {
        event.stopPropagation();
        event.stopImmediatePropagation();
    });

    eventBus.fire('palette.create', {
      container: container
    });
  };

  _getProviders() {
    const event: PaletteEventInstance = this._eventBus.createEvent({
      type: 'palette.getProviders',
      providers: []
    }) as PaletteEventInstance;

    this._eventBus.fire(event);

    return event.providers;
  };

  toggleState(state: PaletteState = {}) {
    const eventBus = this._eventBus;

    if ('showName' in state ) {
      this._config.showName = state.showName
    }
    if ('accordion' in state) {
      this._config.accordion = state.accordion
    }
    if ('defaultOpenGroups' in state) {
      this._config.defaultOpenGroups = state.defaultOpenGroups
    }

    if (this.isOpen()) {
      this.close()
      this._update()
    }

    eventBus.fire('palette.changed', {
      open: this.isOpen(),
      ...this._config
    });
  };

  _update() {
    const translate = this._translate

    const entriesContainer = domQuery<HTMLElement>('.djs-palette-entries', this._container);
    const entries = this._entries = this.getEntries();

    const isAccordion = !!this._config.accordion
    const showName = !!this._config.showName
    const defaultOpenGroups = this._config.defaultOpenGroups || []
    const defaultOpenMap = defaultOpenGroups.reduce((m, item) => (m[item] = true) && m, {})

    domClear(entriesContainer);

    if (isAccordion && defaultOpenGroups.length) {
      console.warn('If you use accordion mode and set multiple default expansion nodes, only the last node will be expanded.')
    }

    forEach(entries, function(entry, id) {
      if(entry.separator) {
        return;
      }
      const grouping = escapeCSS(isAccordion ? 'accordion-group' : entry.group || 'default');
      const groupName = escapeCSS(entry.group || 'default');

      // 1. 查找或者生成最外层 details 标签
      let detailsContainer = domQuery<HTMLElement>(`[data-group-details=${groupName}]`, entriesContainer);
      if (!detailsContainer) {
        detailsContainer = domify(`<details class="djs-accordion-group" name="${grouping}"></details>`);
        domAttr(detailsContainer, 'data-group-details', groupName);
        entriesContainer.appendChild(detailsContainer);

        const summaryContainer = domify(`<summary>${translate(entry.group || 'default')}</summary>`);
        detailsContainer.appendChild(summaryContainer);
      }
      if (defaultOpenMap[entry.group]) {
        domAttr(detailsContainer, 'open', 'true');
      }
      // 2. 生成 details 标签的内容主体
      let groupContainer = domQuery<HTMLElement>(`[data-group=${groupName}]`, detailsContainer);
      if (!groupContainer) {
        groupContainer = domify(`<div class="djs-palette-group"></div>`);
        domAttr(groupContainer, 'data-group', groupName)
        detailsContainer.appendChild(groupContainer);
      }
      // 3. 每一个具体按钮，区分显示名称与不显示名称的区别
      let html = entry.html || '<div class="entry" draggable="true"></div>';
      let entryEl = domify(html);
      let entryItemEl: HTMLElement;
      if (showName) {
        const control = domify(`<div class="djs-entry-item djs-entry-with-name"></div>`)
        groupContainer.appendChild(control);
        control.appendChild(entryEl);
        entryItemEl = control;
      } else {
        groupContainer.appendChild(entryEl);
        entryItemEl = entryEl;
      }
      domAttr(entryEl, 'data-action', id);
      if (!domClasses(entryEl).has('entry')) {
        addClasses(entryEl, 'entry')
      }
      // 4. 设置其他内容
      if (entry.title) {
        domAttr(entryItemEl, 'title', entry.title);
        if (showName) {
          const name = domify(`<div class="djs-entry-title">${entry.title}</div>`)
          entryItemEl.appendChild(name)
        }
      }
      if (entry.className) {
        addClasses(entryEl, entry.className);
      }

      if (entry.imageUrl) {
        const image = domify('<img class="djs-entry-img">');
        domAttr(image, 'src', entry.imageUrl);

        entryItemEl.appendChild(image);
      }
    });

    // open after update
    this.open();
  };

  trigger(action: string, event: DelegateHtmlElement, autoActivate?: boolean) {
    let entry: string;
    let originalEvent: Event;
    let button = event.delegateTarget || event.target;

    if (!button) {
      return event.preventDefault();
    }

    entry = domAttr(button, 'data-action');
    originalEvent = event.originalEvent || event;

    return this.triggerEntry(entry, action, originalEvent, autoActivate);
  };

  triggerEntry(entryId: string, action: string, event: Event, autoActivate?: boolean) {
    let entries = this._entries,
      entry,
      handler;

    entry = entries[entryId];

    // when user clicks on the palette and not on an action
    if (!entry) {
      return;
    }

    handler = entry.action;

    if (this._eventBus.fire('palette.trigger', { entry, event }) === false) {
      return;
    }

    // simple action (via callback function)
    if (isFunction(handler)) {
      if (action === 'click') {
        return handler(event, autoActivate);
      }
    } else {
      if (handler[action]) {
        return handler[action](event, autoActivate);
      }
    }

    // silence other actions
    event.preventDefault();
  };

  _needsCollapse(availableHeight: number, entries: PaletteEntries) {
    const margin = 20 + 10 + 20;
    const entriesHeight = Object.keys(entries).length * 46;

    return availableHeight < entriesHeight + margin;
  };

  close() {
    this._toggleVisible(false)
  };

  open() {
    this._toggleVisible(true)
  };

  toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  };

  _toggleVisible(state: boolean) {
    const eventBus = this._eventBus;
    const parent = this._getParentContainer()
    const container = this._container;

    const cls = domClasses(container)
    const parentCls = domClasses(parent);

    cls.toggle(PALETTE_OPEN_CLS, state);
    parentCls.toggle(PALETTE_PREFIX + PALETTE_OPEN_CLS, state);

    eventBus.fire('palette.changed', {
      open: this.isOpen()
    });
  }

  isActiveTool(tool: string) {
    return tool && this._activeTool === tool;
  };

  updateToolHighlight(name) {
    let entriesContainer: HTMLElement,
      toolsContainer: HTMLElement;

    if (!this._toolsContainer) {
      entriesContainer = domQuery<HTMLElement>('.djs-palette-entries', this._container);

      this._toolsContainer = domQuery<HTMLElement>('[data-group=tools]', entriesContainer);
    }

    toolsContainer = this._toolsContainer;

    forEach(toolsContainer.children, function(tool) {
      let actionName = tool.getAttribute('data-action');

      if (!actionName) {
        return;
      }

      let toolClasses = domClasses(tool);

      actionName = actionName.replace('-tool', '');

      if (toolClasses.contains('entry') && actionName === name) {
        toolClasses.add('highlighted-entry');
      } else {
        toolClasses.remove('highlighted-entry');
      }
    });
  };

  isOpen() {
    return domClasses(this._container).has(PALETTE_OPEN_CLS);
  };

  _getParentContainer() {
    return this._canvas.getContainer();
  };

}


function addClasses(element: HTMLElement, classNames: string | string[]) {
  const classes = domClasses(element);
  const actualClassNames = isArray(classNames) ? classNames : classNames.split(/\s+/g);

  actualClassNames.forEach((cls) => classes.add(cls));
}

function addPaletteEntries(entries: PaletteEntries, provider: PaletteProvider) {
  const entriesOrUpdater = provider.getPaletteEntries();
  if (isFunction(entriesOrUpdater)) {
    return entriesOrUpdater(entries);
  }
  forEach(entriesOrUpdater, function(entry, id: string) {
    entries[id] = entry;
  });
  return entries;
}

AccordionPalette.$inject = ['config.accordionPalette', 'canvas', 'eventBus', 'translate']

export default AccordionPalette
