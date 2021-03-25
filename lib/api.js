
module.exports = function({ post }){

    post('/transport/:name/message', function({ transports, res, params, body }){

        res.notFound(!(params.name in transports));

        try{
            var json = typeof body == 'object' ? body : JSON.parse(body);
        }
        catch(err){
            json = { message: body };
        }

        let t = transports[params.name];
        t.push(t.json ? json : body);

        res.end();
    });

}
