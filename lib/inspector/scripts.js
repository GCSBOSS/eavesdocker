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

function onEntry(listId, { data }){
    data = JSON.parse(data);

    if(data.source.service in currentLists[listId].excludeServices)
        return;

    entry = data.entry;

    if(typeof entry.message == 'string' && entry.message.charAt(0) == '{')
        entry = { ...entry, message: null, ...JSON.parse(entry.message) };

    data.source.label = data.source.service +
        (serviceCount[data.source.service] > 1 ? ' &bull; ' + data.source.number : '');

    data.source.index = activeContainers[data.source.id].index;
    currentLists[listId].events.push({ container: data.source, entry, id: randomId() });
    m.redraw();
}

function randomId() {
    const uint32 = window.crypto.getRandomValues(new Uint32Array(1))[0];
    return uint32.toString(32);
}

function deleteList(lst){
    if(!confirm('Are you sure about deleting the list: "' + lst.name + '"?'))
        return;
    // TODO NOT DELETING LISTENER ?
    eventSource.removeEventListener('entry', lst.cb);
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
    const cb = onEntry.bind(null, id);
    currentLists[id] = { id, name: 'Untitled', cb, events: [],
        excludeServices: {} };

    // TODO When this is loaded from file, populate 'historyServices' from 'excludeServices'
    eventSource.addEventListener('log', cb);
}

function toggleFilterService(lst, service){
    if(service in lst.excludeServices)
        delete lst.excludeServices[service];
    else
        lst.excludeServices[service] = 1;
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

function parsePair([ key, value ]){

    if(value === null || key == 'level')
        // value = m('code', 'null');
        return [];

    else if(typeof value == 'string'){

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

        // Remove ASCII colors
        else if(/\u001b\[.*?m/.test(value))
            value = value.replace(/\u001b\[.*?m/g, '');
    }

    return [ m('b', key.replace(/_/g, ' '), ':'), value ];
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

            return m('article.entry', {
                 'data-index': c.index,
                'hidden': globalFilters[c.id] !== 1
            }, [
                e.entry.level && m('label.level', e.entry.level),
                m('label.container', m.trust(c.label)),
                Object.entries(e.entry).map(e => m('p', parsePair(e)))
            ])

        }
    };
}

function LogList(){

    return {

        onupdate(vnode){
            if(vnode.attrs.list.id != freezeList)
                vnode.dom.lastElementChild.scrollTop = vnode.dom.lastElementChild.scrollHeight;
        },

        view(vnode){
            const lst = vnode.attrs.list;

            return m('article.list', { 'data-id': lst.id }, [
                m('header',
                    m('h4', { onclick(){
                        makeEditable.call(this, lst);
                    } }, lst.name),
                    m('span.count', lst.events.length),

                    m('button', { 'data-icon': 'tune',
                        'data-open': lst.settingsOpen,
                        title: 'Settings',
                        onclick: () => lst.settingsOpen = !lst.settingsOpen
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

                m('section.settings', {
                    'data-open': lst.settingsOpen
                }, [

                    m('header', [
                        m('button', { 'data-icon': 'filter_alt',
                            title: 'Filter List', 'data-open': lst.settingTab == 'service',
                            onclick: () => lst.settingTab = 'service'
                        })
                    ]),

                    lst.settingTab == 'service' &&

                        m('form.service', historyServices.size == 0
                            ? 'There are no services on record'
                            : [ ...historyServices ].map(s => m('label', {
                                'data-open': !(s in lst.excludeServices),
                                onclick: toggleFilterService.bind(null, lst, s)
                            }, s)))


                ]),

                m('section.entries', {
                    onmouseenter: () => freezeList = lst.id,
                    onmouseleave: () =>
                        freezeList = freezeList == lst.id ? null : freezeList
                }, lst.events.slice(-100).map(e =>
                    m(LogEntry, { entry: e, key: e.id })))
            ])
        }

    }

}

function viewMain(){

    return {

        async oninit(){
            activeContainers = {};

            const containers = await m.request('/containers');
            for(const c of containers){
                c.index = colorIndex;
                activeContainers[c.id] = c;
                globalFilters[c.id] = 1;
                globalFilterCount++;
                colorIndex = LAST_COLOR == colorIndex ? -1 : colorIndex;
                colorIndex++;

                historyServices.add(c.service);
                serviceCount[c.service] = serviceCount[c.service] || 0;
                serviceCount[c.service]++;
            }
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

            serviceCount[data.service] = serviceCount[data.service] || 0;
            serviceCount[data.service]++;

            if(globalFilterCount == Object.values(activeContainers).length){
                globalFilters[data.id] = 1;
                globalFilterCount++;
            }

            data.index = colorIndex;
            activeContainers[data.id] = data;
            colorIndex = LAST_COLOR == colorIndex ? -1 : colorIndex;
            colorIndex++;
            historyServices.add(data.service);

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
