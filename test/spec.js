const Docker = require('dockerode');
const assert = require('assert');
const redis = require('nodecaf-redis');
const muhb = require('muhb');

process.env.NODE_ENV = 'testing';

const init = require('../lib/main');

const DOCKER_URL = process.env.DOCKER_URL || 'localhost'
const DEFAULT_CONF = { docker: { host: DOCKER_URL, port: 2375 } };
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const REDIS_CONF = {
    host: process.env.REDIS_HOST || 'localhost',
    type: 'redispub',
    port: 6379,
    channel: 'roorar'
};

const MC_HOST = 'http://' + (process.env.MC_HOST || 'localhost') + ':1080';
const SMTP_CONF = {
    host: process.env.MC_HOST || 'localhost',
    port: 1025,
    to: 'jubi@ju.ju',
    pool: true
};

let app, docker;

before(async function(){
    this.timeout(10e3);
    docker = new Docker(DEFAULT_CONF.docker);
    await docker.pull('mhart/alpine-node:slim-13');
    await docker.pull('hello-world');
    await docker.pull('alpine');
});

beforeEach(function(){
    app = init();
    app.setup(DEFAULT_CONF);
});

after(async function(){
    await docker.pruneContainers();
})

async function sleep(ms){
    await new Promise(done => setTimeout(done, ms));
}

const debugLabels = {
    'com.docker.compose.project': 'foobar',
    'com.docker.compose.service': 'bazbaz'
};

async function startBlab(){
    const container = await docker.createContainer({
        Image: 'mhart/alpine-node:slim-13',
        Tty: false,
        Init: true,
        Labels: debugLabels,
        Cmd: [ 'node', '-e', 'setInterval(() => console.log(Date.now()), 600)' ]
    });
    await container.start();
    return container;
}

async function startWaitForIt(){
    const container = await docker.createContainer({
        Image: 'mhart/alpine-node:slim-13',
        Tty: false,
        Init: true,
        Labels: debugLabels,
        Cmd: [ 'node', '-e', 'setTimeout(() => console.log(\'28234768\'), 2000);' +
            'setTimeout(Function.prototype, 10000)']
    });
    await container.start();
    return container;
}

describe('Startup', function(){

    it('Should boot just fine', async function(){
        await app.start();
        await app.stop();
    });

    it('Should fail when cannot connect to docker', async function(){
        this.timeout(2200);
        app.setup({ docker: { host: 'http://12.12.12.12' } });
        await assert.rejects(app.start());
    });

});

const debugConfig = { eavesdocker: { tasks: {
    foobar: { transport: { type: 'emit' }, stack: 'foobar' }
} } };


describe('Tasks', function(){

    it('Should not create tasks without a matching', async function(){
        await app.setup({ eavesdocker: { tasks: { foobar: { } } } });
        await app.start();
        assert(!app.global.tasks.foobar);
        await app.stop();
    });

    it('Should not create tasks without a \'transport\'', async function(){
        await app.setup({ eavesdocker: { tasks: { foobar: { services: [ 'foo' ] } } } });
        await app.start();
        assert(!app.global.tasks.foobar);
        await app.restart({ eavesdocker: { tasks: { foobar: {
            stack: 'foo',
            transport: { type: 'none' }
        } } } });
        assert(!app.global.tasks.foobar);
        await app.stop();
    });

    it('Should create defined tasks', async function(){
        await app.setup(debugConfig);
        await app.start();
        assert(app.global.tasks.foobar);
        await app.stop();
    });

    it('Should allow referencing globally defined transports', async function(){
        await app.setup({ eavesdocker: {
            transports: { ee: { type: 'emit' } },
            tasks: { foobar: { transport: 'ee', stack: 'foobar' } }
        } });
        await app.start();
        assert(app.global.tasks.foobar);
        await app.stop();
    });

});

describe('Containers & Tasks', function(){

    it('Should not attach containers that don\'t match any task', async function(){
        this.timeout(8000);
        await app.setup(debugConfig);
        await app.start();
        const [ , { id } ] = await docker.run('hello-world');
        await sleep(2000);
        assert(!(id in app.global.containers));
        await app.stop();
    });

    it('Should attach containers that match at least 1 task', async function(){
        this.timeout(5000);
        await app.setup(debugConfig);
        await app.start();
        const [ , { id } ] = await docker.run('hello-world', null, null, {
            Labels: debugLabels
        });
        await sleep(500);
        assert(id in app.global.containers);
        await app.stop();
    });

    it('Should attach containers that were running since before', async function(){
        this.timeout(5000);
        const c = await startBlab();
        await app.setup(debugConfig);
        await app.start();
        await sleep(500);
        assert(c.id in app.global.containers);
        await app.stop();
        await c.kill();
    });

    it('Should not fail when can\'t attach to some container', async function(){
        await app.setup(debugConfig);
        await app.start();
        const [ , { id } ] = await docker.run('hello-world', null, null, {
            Labels: debugLabels,
            HostConfig: {  LogConfig: { type: 'none' } }
        });
        await sleep(400);
        assert(!(id in app.global.containers));
        await app.stop();
    });

    it('Should forget containers after they die', async function(){
        this.timeout(8000);
        await app.setup(debugConfig);
        await app.start();
        const [ , { id } ] = await docker.run('hello-world', null, null, {
            Labels: debugLabels
        });
        await sleep(2000);
        assert(!(id in app.global.containers));
        await app.stop();
    });

});


describe('Transforms', function(){

    it('Should apply keys to log entry', function(done){
        this.timeout(8000);
        let c;
        const fn = async function(msg){
            assert.strictEqual(msg.test, 'foo');
            await app.stop();
            process.off('eavesdocker', fn);
            await c.kill();
            done();
        }
        process.on('eavesdocker', fn);

        (async function(){
            await app.setup({ eavesdocker: { tasks: {
                foobar: {
                    transport: { type: 'emit' },
                    services: [ 'bazbaz' ],
                    transform: [ { type: 'apply', data: { test: 'foo' } } ]
                }
            } } });
            await app.start();
            c = await startWaitForIt();
        })();
    });

    it('Should ensure given key is a datetime', function(done){
        this.timeout(8000);
        let c;
        const fn = async function(msg){
            assert(msg.foo instanceof Date);
            await app.stop();
            process.off('eavesdocker', fn);
            await c.kill();
            done();
        }
        process.on('eavesdocker', fn);

        (async function(){
            await app.setup({ eavesdocker: { tasks: {
                foobar: {
                    transport: { type: 'emit' },
                    services: [ 'bazbaz' ],
                    transform: [ { type: 'time', field: 'foo' } ]
                }
            } } });
            await app.start();
            c = await startWaitForIt();
        })();
    });

    it('Should add specified info to log entry', function(done){
        this.timeout(8000);
        let c;
        const fn = async function(msg){
            assert.strictEqual(msg.id, c.id);
            await app.stop();
            process.off('eavesdocker', fn);
            await c.kill();
            done();
        }
        process.on('eavesdocker', fn);

        (async function(){
            await app.setup({ eavesdocker: { tasks: {
                foobar: {
                    transport: { type: 'emit' },
                    services: [ 'bazbaz' ],
                    transform: [ { type: 'info', service: true, id: true } ]
                }
            } } });
            await app.start();
            c = await startWaitForIt();
        })();
    });

    it('Should wrap log entry in another object', function(done){
        this.timeout(8000);
        let c;
        const fn = async function(msg){
            assert(msg.final.message);
            await app.stop();
            await c.kill();
            process.off('eavesdocker', fn);
            done();
        }
        process.on('eavesdocker', fn);

        (async function(){
            await app.setup({ eavesdocker: { tasks: {
                foobar: {
                    transport: { type: 'emit' },
                    services: [ 'bazbaz' ],
                    transform: [ { type: 'envelope', key: 'final' } ]
                }
            } } });
            await app.start();
            c = await startWaitForIt();
        })();
    });

});

describe('Transports', function(){

    it('Should not fail on unknown transport names', async function(){
        await app.setup({ eavesdocker: {
            tasks: { foobar: { transport: 'none', stack: 'foobar' } }
        } });
        await app.start();
        assert(!app.global.tasks.foobar);
        await app.stop();
    });

    it('Should insert log entries through mongo transport', async function(){
        this.timeout(8000);
        await app.setup({ eavesdocker: { tasks: {
            foobar: {
                transport: { type: 'mongo', url: MONGO_URL },
                services: [ 'bazbaz' ]
            }
        } } });
        await app.start();
        const c = await startWaitForIt();
        await sleep(5000);
        await c.kill();
        await app.stop();

        const { MongoClient } = require('mongodb');
        const client = new MongoClient(MONGO_URL, { useUnifiedTopology: true });
        await client.connect();
        const db = client.db('Eavesdocker');
        const r = await db.collection('Log_Entries').find({});
        assert.strictEqual((await r.toArray())[0].message, '28234768');
        await db.dropDatabase();
        client.close();
    });

    it('Should publish log entries to redis channel', function(done){
        this.timeout(8000);
        let c;
        (async function(){
            await app.setup({ eavesdocker: { tasks: {
                foobar: { transport: REDIS_CONF, services: [ 'bazbaz' ] }
            } } });
            await app.start();

            const client = await redis(REDIS_CONF, 'roorar', async function(_c, data){
                assert.strictEqual(JSON.parse(data).message, '28234768');
                await sleep(5000);
                await c.kill();
                await app.stop();
                await client.close();
                done();
            });

            c = await startWaitForIt();
        })();

    });

    it('Should send an e-mail', async function(){
        this.timeout(8000);

        await muhb.delete(MC_HOST + '/messages');

        await app.setup({ eavesdocker: { tasks: {
            foobar: {
                transport: { type: 'email', ...SMTP_CONF },
                services: [ 'bazbaz' ]
            }
        } } });

        await app.start();
        const c = await startWaitForIt();
        await sleep(5000);
        await c.kill();
        await app.stop();

        const { body } = await muhb.get(MC_HOST + '/messages');
        const obj = JSON.parse(body);
        assert.strictEqual(obj.length, 1);
    });


});
