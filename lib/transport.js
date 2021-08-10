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

    webhook(conf){
        const { Pool } = require('muhb');
        const pool = new Pool({ size: 100, timeout: 4000 });
        const headers = conf.headers || {};

        if(typeof headers != 'object')
            throw new Error('Headers config must be of type \'object\'');

        return {
            close: Function.prototype,
            push: data => pool.post(conf.url, {
                ...conf.headers,
                'Content-Type': 'application/json'
            }, data)
        }
    },

    emit(){
        return {
            close: Function.prototype,
            push: msg => process.emit('eavesdocker', msg)
        }
    },

    gitlab(conf){
        const { Pool } = require('muhb');
        const pool = new Pool({ size: 100, timeout: 4000 });

        const lp = conf.labelPrefix || '';
        const url = conf.url || 'https://gitlab.com';
        const path = url + '/api/v4/projects/' + encodeURIComponent(conf.project) + '/issues';
        const headers = { 'PRIVATE-TOKEN': conf.token };

        function markdownObject(obj){
            let data = '';
            for(const key in obj){
                data += ' '.repeat(this.indentation) + '- **' + key + ':** ';

                if(obj[key] instanceof Date)
                    data += obj[key].toISOString();
                if(typeof obj[key] == 'object'){
                    this.indentation += 2;
                    data += '\n' + markdownObject.call(this, obj[key]);
                    this.indentation -= 2;
                }
                else
                    data += String(obj[key]);

                data += '\n';
            }
            return data;
        }

        return {
            close: Function.prototype,
            push: async data => {

                const ctx = { indentation: 0 };

                const labels = [];
                for(const f of conf.labelFields || [])
                    if(typeof data[f] == 'string' && data[f].length < 32)
                        labels.push(lp + data[f]);

                const title =
                    (data.level ? data.level.toUpperCase() + ': ' : '') +
                    data.message || data.msg || 'Important Event'

                const { status } = await pool.post(path, headers, {
                    // assignee_id:
                    title, labels, created_at: new Date(),
                    description: markdownObject.call(ctx, data)
                });

                if(status > 299)
                    throw new Error('GitLab Responded with status ' + status);
            }
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
                Promise.resolve(transport.push(input)).catch(err =>
                    this.log.error({ err }));
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
