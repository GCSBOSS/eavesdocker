const { EventEmitter } = require('events');
const Nodecaf = require('nodecaf');
const redis = require('nodecaf-redis');

const { addContainer, parseEvent, destroyLoggers } = require('./container');
const { createTransports, closeTransports } = require('./transport');
const { createTasks } = require('./task');
const docker = require('./docker');

const api = require('./api');

async function connectToSwarm(global, conf, log){

    const info = await global.docker.call('/info');

    global.node = { name: info.Name, id: info.Swarm.NodeID };
    global.cluster = info.Swarm.Cluster ? info.Swarm.Cluster.ID : 'local';
    global.swarm = {};

    try{
        global.redis = await redis(conf.redis, 'eavesdocker:' + global.cluster, function(_c, msg){
            msg = JSON.parse(msg);

            if(msg.node.id == global.node.id)
                return;

            else if(msg.type == 'node-ping' && msg.node.id in global.swarm){
                clearTimeout(global.swarm[msg.node.id].tto);
                global.swarm[msg.node.id].tto = setTimeout(() =>
                    delete global.swarm[msg.node.id], 10e3);
            }
            else if(msg.type == 'node-ping')
                global.swarm[msg.node.id] = {
                    ...msg.node,
                    ttl: setTimeout(() => delete global.swarm[msg.node.id], 10e3)
                };
            else if(msg.type in { start: 1, die: 1, log: 1 })
                global.emitter.emit('swarm-' + msg.type, msg);

        });
    }
    catch(err){
        log.warn({ err });
        return setTimeout(() => connectToSwarm(global, conf, log), 3000);
    }

    const sendSwarmEvent = function(msg){
        const ev = `event: ${msg.type}\ndata: ${JSON.stringify({
            ...msg.data, node: msg.node })}\n\n`;
        Object.values(global.sseClients).forEach(res => res.write(ev));
    };

    global.emitter.on('swarm-log', sendSwarmEvent);
    global.emitter.on('swarm-start', sendSwarmEvent);
    global.emitter.on('swarm-die', sendSwarmEvent);

    const pub = function(type, data){
        global.redis.publish('eavesdocker:' + global.cluster,
            JSON.stringify({ data, node: global.node, type }));
    };

    global.pingger = setInterval(() => pub('node-ping'), 9e3);

    const containersKey = 'eavesdocker:' + global.cluster + ':' + global.node.id + ':containers';

    global.emitter.on('start', function(c){
        pub('start', c);
        global.redis.hset(containersKey, c.id, JSON.stringify(c));
    });

    global.emitter.on('die', function(id){
        pub('die', id);
        global.redis.hdel(containersKey, id);
    });

    global.emitter.on('log', data => pub('log', data));

    global.redis.del(containersKey);
}

module.exports = () => new Nodecaf({
    conf: __dirname + '/default.toml',
    api,
    async startup({ global, conf, log }){
        global.containers = {};
        global.transports = {};
        global.tasks = {};

        global.docker = docker(conf.docker);
        global.events = await global.docker.events(parseEvent.bind(this));
        global.lines = 0;

        conf.eavesdocker = conf.eavesdocker || {};
        conf.eavesdocker.transports = conf.eavesdocker.transports || [];

        await createTransports.call(this);
        await createTasks.call(this);

        global.emitter = new EventEmitter();

        global.sseClients = {};

        const sendEvent = function(type, data){
            const ev = `event: ${type}\ndata: ${JSON.stringify({ ...data, node: global.node })}\n\n`;
            Object.values(global.sseClients).forEach(res => res.write(ev));
        };

        global.emitter.on('start', sendEvent.bind(null, 'start'));
        global.emitter.on('die', sendEvent.bind(null, 'die'));
        global.emitter.on('log', sendEvent.bind(null, 'log'));

        if(conf.eavesdocker.swarm && conf.redis)
            await connectToSwarm(global, conf, log);

        const containers = await global.docker.call('/containers/json');
        for(const c of containers)
            await addContainer.call(this, c);
    },

    async shutdown({ global, conf }){
        if(conf.eavesdocker.swarm){
            clearInterval(global.pingger);
            await global.redis.close();
        }

        global.emitter.removeAllListeners();
        global.events.removeAllListeners();
        global.events.destroy();
        destroyLoggers.call(this);
        await closeTransports.call(this);
    }

});
