const http = require('http');

const Cleanser = require('./cleanser');

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

                let cleanser = new Cleanser();
                res.pipe(cleanser);

                resolve(cleanser);
                res.on('data', chunk => cb(chunk.toString('utf8')));
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
