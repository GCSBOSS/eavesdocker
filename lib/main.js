const Nodecaf = require('nodecaf');

const { addContainer, parseEvent, destroyLoggers } = require('./container');
const { createTransports, closeTransports } = require('./transport');
const { createTasks } = require('./task');
const docker = require('./docker');

module.exports = () => new Nodecaf({
    conf: __dirname + '/default.toml',

    async startup({ global, conf }){
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
        let containers = await global.docker.call('/containers/json');
        for(let c of containers)
            await addContainer.call(this, c);
    },

    async shutdown({ global }){
        global.events.off('data', parseEvent.bind(this));
        global.events.destroy();
        destroyLoggers.call(this);
        await closeTransports.call(this);
    }

});
