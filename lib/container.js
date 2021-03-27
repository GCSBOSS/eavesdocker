const { routeMessage } = require('./transport');
const { matchTasks } = require('./task');

const os = require('os');

async function addContainer({ Id: id, Labels: labels }){

    if(id.substr(0, 12) == os.hostname())
        return;

    let c = await this.global.docker.call('/containers/' + id + '/json');
    c.stack = labels['com.docker.stack.namespace'] || labels['com.docker.compose.project'] || '';
    c.service = labels['com.docker.swarm.service.name'] || labels['com.docker.compose.service']  || '';
    c.service = c.service.replace(c.stack + '_', '');

    c.tasks = matchTasks.call(this, c, labels);
    if(c.tasks == 0)
        return;

    c.id = id;
    c.cid = '\'' + c.stack + '\' > ' + c.service + ' (' + id.substr(0, 8) + ')';
    // : id.substr(0, 32);

    try{
        c.stream = await this.global.docker.logs(id, routeMessage.bind(this, c));
        this.global.containers[id] = c;
        this.log.debug('Attached to %s with %s tasks', c.cid, c.tasks.length);
    }
    catch(err){
        // console.log(err);
        this.log.warn('Failed to attach to %s', c.cid);
    }
}

async function removeContainer(id){
    await new Promise(done => setTimeout(done, 1000));
    if(!this.global.containers[id])
        return;
    this.global.containers[id].stream.destroy();
    this.log.debug('Removed container %s', this.global.containers[id].cid);
    delete this.global.containers[id];
}

function parseEvent(data){
    let event = JSON.parse(data);
    let actionType = event.Action + ' ' + event.Type;
    if(actionType == 'start container')
        addContainer.call(this, { Labels: event.Actor.Attributes, Id: event.id });
    else if(actionType == 'die container')
        removeContainer.call(this, event.id);
}

function destroyLoggers(){
    for(let id in this.global.containers)
        this.global.containers[id].stream.destroy();
}

module.exports = { parseEvent, addContainer, destroyLoggers };
