const Docker = require('dockerode');
const Nodecaf = require('nodecaf');

const { addContainer, parseEvent, destroyLoggers } = require('./container');
const { createTransports, closeTransports } = require('./transport');

module.exports = () => new Nodecaf({
    conf: __dirname + '/default.toml',

    async startup({ global, conf }){
        global.containers = {};
        global.transports = {};

        global.docker = new Docker(conf.docker);
        global.events = await global.docker.getEvents();
        global.events.setEncoding('utf8');
        global.events.on('data', parseEvent.bind(this));
        global.lines = 0;

        await createTransports.apply(this);
        for(let c of await global.docker.listContainers())
            await addContainer.apply(this, [ c ]);
    },

    async shutdown({ global }){
        global.events.off('data', parseEvent.bind(this));
        global.events.destroy();
        destroyLoggers.apply(this);
        await closeTransports.apply(this);

        // TODO remove after nodecaf upgrade
        global.containers = {};
        global.transports = {};
        global.lines = 0;
    }

});
