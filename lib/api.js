const { sanitizeContainer } = require('./transport');

module.exports = function({ post, get }){

    post('/transport/:name/message', function({ transports, res, params, body }){

        res.notFound(!(params.name in transports));

        let json;
        try{
            json = typeof body == 'object' ? body : JSON.parse(body);
        }
        catch(_err){
            json = { message: body };
        }

        const t = transports[params.name];
        t.push(t.json ? json : body);

        res.end();
    });

    get('/containers', async function({ containers, res }){
        const cs = containers;
        res.json(Object.values(cs).map(sanitizeContainer));
    });

}
