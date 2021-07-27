const assert = require('assert');

const TRANSPORTS = {

    async mongo(conf){
        const { MongoClient } = require('mongodb');
        const client = new MongoClient(conf.url, {
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 3000
        });
        await client.connect();
        const db = client.db(conf.db || 'Eavesdocker');
        const coll = db.collection(conf.collection || 'Log_Entries');
        let queue = [];
        const it = setInterval(async function(){
            queue.length > 0 && await coll.insertMany(queue);
            queue = [];
        }, 1500);
        return {
            close: async () => {
                clearInterval(it);
                queue.length > 0 && await coll.insertMany(queue);
                await client.close();
            },
            push: data => queue.push(data)
        }
    },

    async redispub(conf){
        const redis = require('nodecaf-redis');
        const client = await redis(conf);
        return {
            close: () => client.close(),
            push: data => client.publish(conf.channel, JSON.stringify(data))
        }
    },

    emit(){
        return {
            close: Function.prototype,
            push: msg => process.emit('eavesdocker', msg)
        }
    },

    email(conf){
        const nodemailer = require('nodemailer');

        const transporter = nodemailer.createTransport(conf);

        const defaultSubject = 'Important log entry';

        if(!conf.to)
            throw new Error('Recipient not defined');

        const htmlObject = function(obj){
            let body = '<ul>';

            for(const key in obj){
                body += '<li><b>' + key + ':</b> ';

                if(obj[key] instanceof Date)
                    body += obj[key].toISOString();
                else if(typeof obj[key] == 'object')
                    body += htmlObject(obj[key]);
                else
                    body += String(obj[key]);

                body += '</li>'
            }

            return body + '</ul>';
        }

        return {
            close: () => transporter.close(),
            push: data => transporter.sendMail({
                from: conf.from || 'Eavesdocker <eavesdocker@example.com>',
                to: conf.to,
                subject: conf.subject || data[conf.subjectField] || defaultSubject,
                text: JSON.stringify(data, null, 4),
                html: htmlObject(data),
            })
        };
    }

};

async function createTransport(name, spec){
    if(spec.type in TRANSPORTS){
        this.global.transports[name] = await TRANSPORTS[spec.type].call(this, spec);
        this.log.debug('Installed transport \'%s\' (%s)', name, spec.type);
        return true;
    }

    this.log.warn('Transport \'%s\' has unsupported type \'%s\'', name, spec.type);
}

module.exports = {

    createTransport,

    routeMessage(container, entry){
        this.global.lines++;

        let json;
        try{
            json = JSON.parse(entry);
            assert(typeof json == 'object');
        }
        catch(_err){
            json = { message: String(entry).replace(/\r?\n$/, ''), time: new Date() };
        }

        for(const task of container.tasks){
            const input = task.transform(container, json);
            for(const transport of task.transports)
                transport.push(input);
        }

        this.global.emitter.emit('log', {
            source: container,
            entry: json
        });
    },

    async createTransports(){
        for(const name in this.conf.eavesdocker.transports){
            const t = this.conf.eavesdocker.transports[name];
            await createTransport.call(this, name, t);
        }
    },

    async closeTransports(){
        for(const name in this.global.transports)
            await this.global.transports[name].close();
    }

}
