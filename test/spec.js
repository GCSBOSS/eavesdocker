const Docker = require('dockerode');
const assert = require('assert');

process.env.NODE_ENV = 'testing';

const init = require('../lib/main');

const DOCKER_URL = process.env.DOCKER_URL || 'http://localhost'
const DEFAULT_CONF = { docker: { host: DOCKER_URL, port: 2375 } };
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';

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

async function sleep(ms){
    await new Promise(done => setTimeout(done, ms));
}

async function startBlab(){
    let container = await docker.createContainer({
        Image: 'mhart/alpine-node:slim-13',
        Tty: true,
        Init: true,
        Cmd: [ 'node', '-e', 'setInterval(() => console.log(Date.now()), 600)' ]
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

    it('Should not fail when transport has unsupported type', async function(){
        await app.setup({ transports: { bad: {} } });
        await app.start();
        await app.stop();
    });

});

describe('Docker', function(){

    it('Should read read log entries from previously alive containers', async function(){
        this.timeout(10000);
        let c = await startBlab();
        await app.start();
        await sleep(1000);
        assert(app.global.lines > 0);
        await app.stop();
        await c.kill();
    });

    it('Should read read log entries from newly started containers', async function(){
        await app.start();
        await docker.run('hello-world');
        await sleep(500);
        assert(app.global.lines > 0);
        await app.stop();
    });

});

describe('Transports', function(){

    it('Should not fail on unknown transport names', async function(){
        await app.setup({ transports: { tt: { type: 'debug' } } });
        await app.start();
        await docker.run('alpine', ['echo', 'say what foobar'], null,
            { Labels: { 'eavesdocker.transports': 'testTp,tt' } });
        await app.stop();
    });

    it('Should insert log entries through mongo transport', async function(){
        await app.setup({ transports: { testTp: { type: 'mongo', url: MONGO_URL } } });
        await app.start();
        await docker.run('alpine', ['echo', 'say what foobar'], null,
            { Labels: { 'eavesdocker.transports': 'testTp' } });
        await sleep(1000);
        await app.stop();

        const { MongoClient } = require('mongodb');
        const client = new MongoClient(MONGO_URL, { useUnifiedTopology: true });
        await client.connect();
        let db = client.db('Eavesdocker');
        let r = await db.collection('Log_Entries').find();
        assert.strictEqual((await r.toArray())[0].message, ' foobar\r\n');
        await db.dropDatabase();
        client.close();
    });

});
