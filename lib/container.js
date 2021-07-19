const { routeMessage } = require('./transport');
const { matchTasks } = require('./task');

const os = require('os');

function sanitizeContainer(c){
    return { id: c.id, stack: c.stack, service: c.service, number: c.number,
        node: c.node };
}

async function addContainer({ Id: id, Labels: labels }){

    if(id.substr(0, 12) == os.hostname())
        return;

    const c = { id };
    c.stack = labels['com.docker.stack.namespace'] || labels['com.docker.compose.project'] || '';
    c.service = labels['com.docker.swarm.service.name'] || labels['com.docker.compose.service']  || '';
    c.service = c.service.replace(c.stack + '_', '');
    c.node = this.global.node;

    c.number = (labels['com.docker.swarm.task.name'] ||
        labels['com.docker.compose.container-number'] || '1').replace(/.*?\./, '')
        .replace(/\..*$/, '');

    c.tasks = matchTasks.call(this, c);
    if(c.tasks == 0)
        return;

    c.cid = '\'' + c.stack + '\' > ' + c.service + ' (' + id.substr(0, 8) + ')';

    try{
        c.stream = await this.global.docker.logs(id, routeMessage.bind(this, c));
        this.global.containers[id] = c;

        this.global.emitter.emit('start', sanitizeContainer(c));

        this.log.debug('Attached to %s with %s tasks', c.cid, c.tasks.length);
    }
    catch(_err){
        // console.log(err);
        this.log.warn('Failed to attach to %s', c.cid);
    }
}

async function removeContainer(id){
    await new Promise(done => setTimeout(done, 1000));
    if(!this.global.containers[id])
        return;

    this.global.emitter.emit('die', { id });

    this.global.containers[id].stream.destroy();
    this.log.debug('Removed container %s', this.global.containers[id].cid);
    delete this.global.containers[id];
}

function parseEvent(data){
    const event = JSON.parse(data);
    const actionType = event.Action + ' ' + event.Type;
    if(actionType == 'start container')
        addContainer.call(this, { Labels: event.Actor.Attributes, Id: event.id });
    else if(actionType == 'die container')
        removeContainer.call(this, event.id);
}

function destroyLoggers(){
    for(const id in this.global.containers)
        this.global.containers[id].stream.destroy();
}

module.exports = { sanitizeContainer, parseEvent, addContainer, destroyLoggers };
