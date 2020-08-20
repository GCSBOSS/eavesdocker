
const TRANSPORTS = {

    async mongo(conf){
        const { MongoClient } = require('mongodb');
        const client = new MongoClient(conf.url, {
            useUnifiedTopology: true
        });
        await client.connect();
        const db = client.db(conf.db || 'Eavesdocker');
        const coll = db.collection(conf.collection || 'Log_Entries');
        return {
            json: true,
            close: () => client.close(),
            push: data => coll.insertOne(data)
        }
    },

    debug(){
        return {
            close: Function.prototype,
            push: msg => this.log.info({ type: 'log' }, msg)
        }
    }

};

module.exports = {

    attachTransports(container, spec){
        container.transports = [];
        for(let t of spec.split(',')){
            t = t.trim();
            if(t in this.global.transports)
                container.transports.push(this.global.transports[t]);
            else
                this.log.warn('Found unknown transport \'%s\' on container labels', t);
        }
    },

    routeMessage(container, entry){
        this.global.lines++;

        try{
            var json = JSON.parse(entry);
        }
        catch(err){
            json = { message: entry };
        }

        if(container.transports)
            container.transports.forEach(t => t.push(t.json ? json : entry));
    },

    async createTransports(){
        for(let name in this.conf.transports){
            let t = this.conf.transports[name];
            if(t.type in TRANSPORTS){
                this.global.transports[name] =
                    await TRANSPORTS[t.type].apply(this, [ t ]);
                this.log.debug('Installed transport \'%s\' (%s)', name, t.type);
            }
            else
                this.log.warn('Transport \'%s\' has unsupported type \'%s\'', name, t.type);
        }
    },

    async closeTransports(){
        for(let name in this.global.transports)
            await this.global.transports[name].close();
    }

}
