const http = require('http');
const { Transform } = require('stream');

const HEADER_LENGTH = 8;

class Demuxer extends Transform {

    _transform (chunk, enc, cb) {

        this.buffer = this.buffer
            ? Buffer.concat([this.buffer, chunk])
            : Buffer.from(chunk);

        if(this.buffer.length < HEADER_LENGTH)
            return setTimeout(cb, 0);

        let eol = HEADER_LENGTH + this.buffer.slice(0, HEADER_LENGTH).readUInt32BE(4);
        if(this.buffer.length < eol)
            return setTimeout(cb, 0);

        const line = this.buffer.slice(HEADER_LENGTH, eol);
        this.push(line, enc);
        this.buffer = this.buffer.slice(eol);
        return setTimeout(cb, 0);
    }
}

module.exports = conf => ({

    events(cb){
        return new Promise((resolve, reject) => {
            let req = http.request({ ...conf, path: '/events' }, res => {
                res.setEncoding('utf8');
                let body = '';

                if(res.statusCode > 299){
                    res.on('data', chunk => body += chunk.toString());
                    res.on('end', () => reject(new Error(JSON.parse(body).message)));
                    return;
                }

                resolve(res);
                res.on('data', cb);
            });
            req.on('error', reject);
            req.end();
        });
    },

    logs(id, cb){
        let path = '/containers/' + id + '/logs?follow=true&stdout=true&stderr=true&tail=0';
        return new Promise((resolve, reject) => {
            let req = http.request({ ...conf, path }, res => {
                let body = '';

                if(res.statusCode > 299){
                    res.setEncoding('utf8');
                    res.on('data', chunk => body += chunk.toString());
                    res.on('end', () => reject(new Error(JSON.parse(body).message)));
                    return;
                }

                let demuxer = new Demuxer();
                demuxer.setEncoding('utf8');
                demuxer.on('data', cb);
                res.pipe(demuxer);
                resolve(demuxer);
            });
            req.on('error', reject);
            req.end();
        });
    },

    call(path){
        return new Promise((resolve, reject) => {
            let req = http.request({ ...conf, path }, res => {
                let body = '';
                res.setEncoding('utf8');
                res.on('data', chunk => body += chunk.toString());
                res.on('end', () => res.statusCode > 299
                    ? reject(new Error(JSON.parse(body).message))
                    : resolve(JSON.parse(body)));
            });
            req.on('error', reject);
            req.end();
        });
    }

});
