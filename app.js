'use strict';

var Collector = require("Netflow");
var reloader = require('reloader');
var ip = require('./lib/ip');
var argv = require('optimist').argv;
var LRU = require("lru-cache");

var db = LRU({
    max: 500000,
    maxAge: 1000 * 600
});

var port = argv.p || 9996;


var app = new Collector(function (err) {
    if(err != null) {
        console.log("ERROR ERROR \n"+err);
    }
})
.on("listening",function() { console.log("listening", port); } )

.on("packet",function(nflow) {
    nflow.v5Flows.forEach(function(raw) {
        var netflow = ip.parsePacket(raw);
        if(netflow) {
            var key;

            key = netflow.ordered() + "_flags";
            var oldFlags = db.get(key);
            db.set(key, (oldFlags || 0) | netflow.rawFlags);

            key = netflow.unordered() + "_flow" ;
            var flow;
            if(netflow.sport > netflow.dport)
               flow = {src: netflow.srcEndpoint(), dst: netflow.dstEndpoint()};
            else
               flow = {src: netflow.dstEndpoint(), dst: netflow.srcEndpoint()};

            db.set(key, flow);

            var sFlags = db.get(flow.src + "_" + flow.dst + "_flags") || 0;
            var dFlags = db.get(flow.dst + "_" + flow.src + "_flags") || 0;

            var tcpFlow = new ip.TcpFlow(flow, sFlags, dFlags);

            var state = tcpFlow.state();
            console.log("got tcp netflow " + flow.src + " -> " + flow.dst + " (0x"+sFlags.toString(16)+" 0x"+dFlags.toString(16)+") state: " + state);
        } else {
//            console.log("unhandled ip packet", raw);
        }
    });
});

if(argv.d) {
    reloader({
        watchModules: true,
        onReload: function () {
            app.listen(port);
        }});
} else {
    app.listen(port);
}
