const LAST_COLOR = 13;

let activeContainers = {};
let globalFilters = [];
let globalFilterCount = 0;
const serviceCount = {};
const currentLists = {};
const minLists = new Set();
const historyServices = new Set();
let colorIndex = 0;
let freezeList = null;
let eventSource;


function randomId() {
    const uint32 = window.crypto.getRandomValues(new Uint32Array(1))[0];
    return uint32.toString(32);
}

function deleteList(lst){
    if(!confirm('Are you sure about deleting the list: "' + lst.name + '"?'))
        return;

    delete currentLists[lst.id];
    minLists.delete(lst.id);
}

function minimizeList(lst){
    minLists.add(lst.id);
}

function maximizeList(lst){
    minLists.delete(lst.id);
}

function clearList(lst){
    lst.events = [];
}

function clearAll(){
    for(const lid in currentLists)
        currentLists[lid].events = [];
}

function createList(){
    const id = randomId();
    currentLists[id] = { id, name: 'Untitled', events: [],
        focusServices: new Set(), hideFields: {} };

    // TODO When this is loaded from file, populate 'historyServices' from 'excludeServices'
}

function toggleFocusService(lst, service){
    if(lst.focusServices.has(service))
        lst.focusServices.delete(service);
    else
        lst.focusServices.add(service);
}

function filterAllContainers(){
    if(globalFilterCount != 0){
        globalFilters = {};
        globalFilterCount = 0;
    }
    else for(const cid in activeContainers){
        globalFilterCount++;
        globalFilters[cid] = 1;
    }
}

function filterContainer(cid){
    if(globalFilters[cid] == 1){
        globalFilterCount--;
        globalFilters[cid] = 0;
    }
    else {
        globalFilterCount++;
        globalFilters[cid] = 1;
    }
}

function enterHideField(lst, ev){
    if(ev.key == 'Enter'){
        if(ev.target.value !== ''){
            lst.hideFields[ev.target.value] = 1;
            ev.target.value = '';
        }
    }
}

function makeEditable(lst){
    this.setAttribute('contenteditable', true);
    const cb = function(ev){
        if(ev.key == 'Enter'){
            this.blur();
            ev.preventDefault();
        }
    };
    this.addEventListener('keydown', cb);
    this.focus();
    this.addEventListener('blur', function(){
        this.removeAttribute('contenteditable');
        lst.name = this.innerText;
        this.scrollLeft = 0;
        this.removeEventListener('keydown', cb);
        m.redraw();
    }, { once: true });
}

function LogEntry(){

    return {

        oncreate(vnode){
            vnode.dom.animate([
                { opacity: 0 },
                { opacity: 1 }
            ], { duration: 1000, easing: 'ease' });
        },

        view(vnode){
            const e = vnode.attrs.entry;
            const c = e.container;
            const lst = vnode.attrs.list;

            let anyMatch = false;
            const q = vnode.attrs.search
                ? vnode.attrs.search.trim().replace(/\s+/, ' ').toUpperCase()
                : null;

            const keys = Object.entries(e.entry).map(([ key, value ]) => {


                if(value === null || key == 'level' || key in lst.hideFields)
                    return null;

                if(typeof value == 'number')
                    value = String(value);

                if(typeof value == 'string'){

                    // Parse ISO dates
                    if(value.length > 17 && value.length < 25 && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value))
                        value = m('span', { title: value }, new Intl.DateTimeFormat(undefined, {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "numeric",
                            second: "numeric",
                            year: "numeric"
                        }).format(new Date(value)));

                    else if(q) {
                        const vup = value.toUpperCase();
                        if(vup.includes(q)){
                            anyMatch = true;

                            const marked = [];
                            let lastEnd = 0;
                            vup.replaceAll(q, (match, idx) => {
                                marked.push(value.substr(lastEnd, idx - lastEnd));
                                lastEnd = idx + match.length;
                                marked.push(m('mark', value.substr(idx, match.length)));
                                return match;
                            });
                            marked.push(value.substr(lastEnd));
                            value = marked;
                        }
                    }

                }
                else if(typeof value == 'boolean')
                    value = m('code.bool', value ? 'true' : 'false');
                else if(typeof value == 'object')
                    value = m('pre.object', JSON.stringify(value, null, 4));

                return m('p', [
                    m('b', key.replace(/([A-Z])/g, ' $1').replace(/[_\-]/g, ' '), ':'),
                    value
                ]);
            });

            return m('article.entry', {
                'data-index': c.index,
                'data-miss': q && !anyMatch,
                'data-level': e.entry.level || null,
                'hidden': globalFilters[c.id] !== 1
            }, [
                e.entry.level && m('label.level', e.entry.level),
                m('label.container', m.trust(c.label)),
                ...keys
            ])

        }
    };
}

function ListSettings(){

    let activeTab = 'filter';

    return {

        view(vnode){
            const lst = vnode.attrs.list;

            return m('section.settings', { 'data-open': vnode.attrs.open }, [

                m('header', [
                    m('button', {
                        'data-open': activeTab == 'filter',
                        onclick: () => activeTab = 'filter'
                    }, 'Filters'),

                    m('button', {
                        'data-open': activeTab == 'display',
                        onclick: () => activeTab = 'display'
                    }, 'Display')
                ]),

                {

                    filter: m('fieldset.filter', [

                        m('label', 'Focus Services'),

                        historyServices.size == 0
                            ? m('p', 'There are no services on record')
                            : m('fieldset.focus', [
                                [ ...historyServices ].map(s => m('label.check', {
                                    'data-icon-pre': lst.focusServices.has(s)
                                        ? 'check_box'
                                        : 'check_box_outline_blank',
                                    onclick: toggleFocusService.bind(null, lst, s)
                                }, s))
                            ])
                    ]),

                    display: m('fieldset.display', [

                        m('label', 'Hide Fields'),
                        m('fieldset.fields', [
                            Object.keys(lst.hideFields).map(f => m('button', {
                                onclick: () => delete lst.hideFields[f]
                            }, f)),
                            m('input', { onkeyup: enterHideField.bind(null, lst),
                                type: 'text', placeholder: 'eg.: my_field' })
                        ])

                    ])

                }[activeTab]

            ]);

        }

    };

}

function LogList(){

    let settingsOpen = false;
    let searchOpen = false;
    let searchTerm = null;

    return {

        onupdate(vnode){
            if(vnode.attrs.list.id != freezeList)
                vnode.dom.lastElementChild.scrollTop = vnode.dom.lastElementChild.scrollHeight;
        },

        view(vnode){
            const lst = vnode.attrs.list;

            return m('article.list', { 'data-id': lst.id }, [
                m('label.search', { 'data-open': searchOpen, 'data-icon': 'search' },
                    m('input', { type: 'text', placeholder: 'Type here...',
                        oninput: ev => searchTerm = ev.target.value,
                        onkeyup: ev => {
                            if(ev.key == 'Escape'){
                                searchTerm = '';
                                searchOpen = false;
                            }
                        }
                    }),

                    m('button', {  'data-icon': 'close',
                        onclick(){
                            searchOpen = false;
                            this.previousElementSibling.value = '';
                            searchTerm = null;
                        }
                    })
                ),

                m('header',
                    m('h4', { onclick(){
                        makeEditable.call(this, lst);
                    } }, lst.name),
                    m('span.count', lst.events.length),

                    m('button', { 'data-icon': 'search',
                        title: 'Search',
                        onclick(){
                            this.parentNode.previousElementSibling.focus();
                            searchOpen = true;
                        }
                    }),

                    m('button', { 'data-icon': 'tune',
                        'data-open': settingsOpen,
                        title: 'Settings',
                        onclick: () => settingsOpen = !settingsOpen
                    }),

                    m('button', { 'data-icon': 'minimize',
                        title: 'Minimize List',
                        onclick: minimizeList.bind(null, lst)
                    }),

                    m('button', {
                        'data-icon': 'clear',
                        title: 'Clear Logs',
                        onclick: clearList.bind(null, lst)
                    }),

                    m('button.del', { 'data-icon': 'delete',
                        title: 'Delete List',
                        onclick: deleteList.bind(null, lst)
                    })
                ),

                m(ListSettings, { list: lst, open: settingsOpen }),

                m('section.entries', {
                    onmouseenter: () => freezeList = lst.id,
                    onmouseleave: () =>
                        freezeList = freezeList == lst.id ? null : freezeList
                }, lst.events.slice(-100).map(e =>
                    m(LogEntry, { list: lst, entry: e, key: e.id, search: searchTerm })))
            ])
        }

    }

}

function addContainer(c){
    serviceCount[c.service] = serviceCount[c.service] || 0;
    serviceCount[c.service]++;

    if(globalFilterCount == Object.values(activeContainers).length){
        globalFilters[c.id] = 1;
        globalFilterCount++;
    }

    c.index = colorIndex;
    activeContainers[c.id] = c;
    colorIndex = LAST_COLOR == colorIndex ? -1 : colorIndex;
    colorIndex++;
    historyServices.add(c.service);
}

function viewMain(){

    return {

        async oninit(){
            activeContainers = {};

            const containers = await m.request('/containers');
            for(const c of containers)
                addContainer(c);
        },

        view(){
            const showAll = globalFilterCount ==
                Object.values(activeContainers).length;

            return [
                m('section#toolbar', [

                    m('button', { 'data-icon-pre': 'add',
                        onclick: createList }, 'Create List'),

                    m('button', { 'data-icon-pre': 'clear',
                        onclick: clearAll }, 'Clear All Logs'),
                ]),

                m('section#containers', [

                    m('h2', {
                        'data-icon-pre': showAll ? 'check_box' : 'check_box_outline_blank',
                        onclick: filterAllContainers
                    }, 'Containers'),

                    Object.values(activeContainers).length == 0 &&
                        m('p', 'There are no active contaniers'),

                    Object.values(activeContainers).map(c => m('article.container', {
                        'data-icon-pre': globalFilters[c.id] == 1
                            ? 'check_box'
                            : 'check_box_outline_blank',
                        onclick: filterContainer.bind(null, c.id),
                        'data-index': c.index
                    }, [
                        m('h3', c.service + (serviceCount[c.service] > 1 ? ' (' + c.number + ')' : '')),
                        m('p', c.node ? c.node.name : c.id.substr(0, 12))
                    ]))
                ]),

                m('section#lists', Object.values(currentLists).length == 0
                    ? m('p.message', { onclick: createList },
                        'Create a List to Start Monitoring')
                    : [

                        minLists.size > 0 && m('article.list.min',
                            Array.from(minLists).map(lid => {

                                const lst = currentLists[lid];

                                return m('article', [
                                    m('h4', { onclick(){
                                        makeEditable.call(this, lst);
                                    } }, lst.name),
                                    m('span.count', lst.events.length),
                                    m('button', { 'data-icon': 'open_in_new',
                                        onclick: maximizeList.bind(null, lst) }),
                                    m('button.del', { 'data-icon': 'delete',
                                        onclick: deleteList.bind(null, lst) })
                                ])
                            })
                        ),

                        Object.values(currentLists)
                            .filter(lst => !minLists.has(lst.id))
                            .map(lst => m(LogList, { key: lst.id, list: lst }))
                    ]
                )

            ];

        }

    };

}

function connectToLive(){

    eventSource = new EventSource("/live", { withCredentials: true });

    eventSource.addEventListener('open', () => {

        eventSource.addEventListener('start', function({ data }){
            data = JSON.parse(data);
            addContainer(data);
            m.redraw();
        });

        eventSource.addEventListener('die', function({ data }){
            data = JSON.parse(data);

            serviceCount[activeContainers[data.id].service]--;

            if(globalFilters[data.id] == 1)
                globalFilterCount--;
            delete activeContainers[data.id];

            m.redraw();
        });

        eventSource.addEventListener('log', function({ data }){
            data = JSON.parse(data);

            if(!activeContainers[data.source.id])
                return;

            const lists = Object.values(currentLists).filter(l =>
                l.focusServices.size == 0 || l.focusServices.has(data.source.service));

            if(lists.length == 0)
                return;

            entry = data.entry;

            if(typeof entry.message == 'string' && entry.message.length > 2 && entry.message.charAt(0) == '{')
                entry = { ...entry, message: null, ...JSON.parse(entry.message) };

            data.source.label = data.source.service +
                (serviceCount[data.source.service] > 1 ? ' &bull; ' + data.source.number : '');

            data.source.index = activeContainers[data.source.id].index;

            const log = { container: data.source, entry, id: randomId() };

            lists.forEach(lst => lst.events.push(log));

            m.redraw();
        });

        const viewEl = document.getElementById('view');
        viewEl.setAttribute('data-name', 'main');
        m.mount(viewEl, viewMain);
    });

    eventSource.addEventListener('error', async () => {
        if(eventSource.readyState == 2){
            await fetch('/auth', {
                method: 'POST',
                body: prompt('Please, enter the Dashboard Secret')
            });
            connectToLive();
        }
    });
}

window.onbeforeunload = () => eventSource.close();

connectToLive();
