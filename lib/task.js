
const { createTransport } = require('./transport');

const TRANSFORMS = {

    envelope(container, spec, input){
        return { [spec.key]: input };
    },

    info(container, spec, input){
        let obj = { ...input };
        if(spec.service)
            obj.service = container.service;
        if(spec.id)
            obj.id = container.id;

        return obj;
    },

    apply(container, spec, input){
        return { ...input, ...spec.data };
    }

};

module.exports = {

    async createTasks(){

        for(let name in this.conf.eavesdocker.tasks){
            let task = this.conf.eavesdocker.tasks[name];

            if(!task.stack && !task.services){
                this.log.warn('Task %s missing \'stack\' or \'services\' matchers', name);
                continue;
            }

            let stack = task.stack || '';
            if(task.services)
                var services = new RegExp('^(' + task.services.join('|') + ')$');

            let transports = [].concat(task.transport).filter(a => a);
            for(let i in transports)
                if(typeof transports[i] !== 'string')
                    transports[i] = await createTransport.call(this, name + i, transports[i])
                        ? name + i : false;

            transports = transports.map(tn => {
                tn && !(tn in this.global.transports) &&
                    this.log.warn('Task %s has undefined transport \'%s\'', name, tn);
                return this.global.transports[tn];
            }).filter(a => a);

            if(transports.length == 0){
                this.log.warn('Task %s has no \'transports\'', name);
                continue;
            }

            var transform = task.transform ? (container, input) => {
                for(let stage of task.transform)
                    input = TRANSFORMS[stage.type](container, stage, input);
                return input;
            } : (c, input) => input;

            this.global.tasks[name] = { transports, services, stack, transform };
        }
    },

    matchTasks(container){
        return Object.values(this.global.tasks).filter(t =>
            (!t.stack || t.stack == container.stack) &&
            (!t.services || t.services.test(container.service))
        );
    }

}
