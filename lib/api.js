const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;

const { sanitizeContainer } = require('./transport');

async function readFile(name, type, { res }){
    const data = await fs.readFile(__dirname + '/inspector/' + name, 'utf8');
    res.type(type).end(data);
}

module.exports = function({ post, get }){

    get('/', readFile.bind(null, 'page.html', 'text/html'));

    post('/transport/:name/message', function({ transports, res, params, body }){

        res.notFound(!(params.name in transports));

        let json;
        try{
            json = typeof body == 'object' ? body : JSON.parse(body);
        }
        catch(_err){
            json = { message: body };
        }

        const t = transports[params.name];
        t.push(t.json ? json : body);

        res.end();
    });

    get('/containers', async function({ cookies, node, redis, cluster, swarm, containers, res, conf }){
        const dash = conf.eavesdocker.dashboard || {};
        const secret = dash.secret || '';
        res.unauthorized(cookies.eavesdocker != secret);

        const cs = containers;

        Object.keys(cs).forEach(c => cs[c].node = node);

        if(conf.eavesdocker.swarm){
            const prefix = 'eavesdocker:' + cluster + ':';
            for(const nid in swarm){
                const all = await redis.hgetall(prefix + nid + ':containers');
                Object.keys(all).forEach(c => all[c].node = swarm[nid]);
                containers = { ...containers, all };
            }
        }

        res.json(Object.values(cs).map(sanitizeContainer));
    });

    post('/auth', function({ body, res, conf }){
        const dash = conf.eavesdocker.dashboard || {};
        const secret = dash.secret || '';
        res.unauthorized(body != secret);

        res.cookie('eavesdocker', secret, {
            maxAge: 60 * 60 * 24 * 7 * 1000,
            secure: true,
            httpOnly: true,
            sameSite: 'Strict'
        }).end();
    }),

    get('/live', function({ req, res, sseClients, log, cookies, conf }){
        const dash = conf.eavesdocker.dashboard || {};
        const secret = dash.secret || '';

        res.unauthorized(cookies.eavesdocker != secret);

        res.type('text/event-stream');
        res.set('Connection', 'keep-alive');
        res.set('Cache-Control', 'no-cache');

        res.write(`data: online\n\n`);

        const id = uuidv4();

        sseClients[id] = res;

        log.debug(`SSE Client ${id} is online`);

        req.on('close', () => {
            delete sseClients[id];

            log.debug(`SSE Client ${id} is gone`);
        });
    });

    get('/stylesheet.css', readFile.bind(null, 'stylesheet.css', 'text/css'));
    get('/scripts.js', readFile.bind(null, 'scripts.js', 'application/javascript'));
    get('/favicon.png', readFile.bind(null, 'favicon.png', 'image/png'));

}
