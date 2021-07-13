const { v4: uuidv4 } = require('uuid');
const { sanitizeContainer } = require('./transport');

module.exports = function({ post, get }){

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

    get('/containers', async function({ node, redis, cluster, swarm, containers, res, conf }){

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

    get('/live', function({ req, res, sseClients, log }){
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

}
