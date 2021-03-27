const { routeMessage, attachTransports } = require('./transport');

const os = require('os');

async function addContainer({ Id: id, Labels: labels }){

    if(id.substr(0, 12) == os.hostname())
        return;

    let c = this.global.docker.getContainer(id);
    c.stack = labels['com.docker.stack.namespace'] || labels['com.docker.compose.project'] || '';
    c.service = labels['com.docker.swarm.service.name'] || labels['com.docker.compose.service']  || '';
    c.service = c.service.replace(c.stack + '_', '');
    
    if(labels['eavesdocker.transports'])
        attachTransports.apply(this, [ c, labels['eavesdocker.transports'] ]);

    c.cid = c.stack
        ? '\'' + c.stack + '\' > ' + c.service + ' (' + id.substr(0, 8) + ')'
        : id.substr(0, 32);

    try{
        c.logger = await c.logs({ timestamps: false, tail: 1, follow: true, stdout: true, stderr: true });
        c.logger.on('data', chunk =>
            routeMessage.apply(this, [ c, chunk.slice(8).toString('utf8') ]));

        this.global.containers[id] = c;
        this.log.debug('Added container %s', c.cid);
    }
    catch(err){
        // console.log(err);
        this.log.warn('Failed to attach to %s', c.cid);
    }
}

function removeContainer(id){
    if(!this.global.containers[id])
        return;
    this.global.containers[id].logger.destroy();
    this.log.debug('Removed container %s', this.global.containers[id].cid);
    delete this.global.containers[id];
}

function parseEvent(data){
    let event = JSON.parse(data);
    let actionType = event.Action + ' ' + event.Type;
    if(actionType == 'start container')
        addContainer.apply(this, [{ Labels: event.Actor.Attributes, Id: event.id }]);
    else if(actionType == 'die container')
        removeContainer.apply(this, [ event.id ]);
}

function destroyLoggers(){
    for(let id in this.global.containers)
        this.global.containers[id].logger.destroy();
}

module.exports = { parseEvent, addContainer, destroyLoggers };
