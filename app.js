'use strict';

var monitoring = require('./monitoring');
var Collector = require("./lib/Netflow");
var reloader = require('reloader');
var ip = require('./lib/ip');
var argv = require('optimist').argv;
var LRU = require("lru-cache");
var fork = require('child_process').fork;

var zmq = require('zmq')
  , sock = zmq.socket('push');

sock.bindSync('tcp://127.0.0.1:3412');
console.log('Producer bound to port 3412');

var port = argv.p || 9996;
var mon_port = argv.m || port+1;

var uptime = new Date();

var nflowPacketCount = 0;
var pdus = 0;
var packetCount = 0;
var octetCount = 0;
var byProtoPackets = {};
var byProtoOctets = {};

var exporters = {};


var child;
function spawnSub() {
    child = fork('./sub');
    child.on('exit', function (code) {
        console.log('sub process is dead' + code);

        spawnSub();
    });
}
spawnSub();

process.on('SIGHUP', function () {
    console.log('Got SIGHUP, restarting worker');
    child.kill();
});

var app = new Collector(function (err) {
    if(err != null) {
        console.log("ERROR ERROR \n"+err);
    }
})
.on("listening",function() { console.log("listening", port); } )

.on("packet",function(nflow, rinfo) {
    nflowPacketCount++;
    pdus += nflow.v5Flows.length;

    if(pdus % 100 == 0)
        console.log("GOT PACKET:", packetCount, "PDU: ", pdus);

    var timestamp = nflow.header.unix_secs * 1000 + nflow.header.unix_nsecs / 1000000;

    var lastSequence = (exporters[rinfo.address] || {}).lastSequence || nflow.header.flow_sequence;
    var lostFrames = (exporters[rinfo.address] || {}).lostFrames || 0;
    var delta = nflow.header.flow_sequence - lastSequence - nflow.header.count;

    if(delta > 0)
        lostFrames += delta;

    exporters[rinfo.address] = { lastSequence: nflow.header.flow_sequence, lostFrames: lostFrames};

    sock.send(JSON.stringify({
        timestamp: timestamp,
        flows: nflow.v5Flows.filter(function(f) { return f.prot == 6})
    }));

    nflow.v5Flows.forEach(function(raw) {
        packetCount = packetCount + raw.dPkts;
        octetCount = octetCount + raw.dOctets;
        byProtoPackets[raw.prot] = raw.dPkts + (byProtoPackets[raw.prot] || 0);
        byProtoOctets[raw.prot] = raw.dOctets + (byProtoOctets[raw.prot] || 0);
    });
});

monitoring.app.get('/', function (req, res, next) {
    res.json({
        uptime: uptime,
        stats: {
            nflowPacketCount: packetCount,
            pdus: pdus,
            packetCount: packetCount,
            octetCount: octetCount,
            byProtoPackets: byProtoPackets,
            byProtoOctets: byProtoOctets,
        },
        exporters: exporters
    });
});


if(argv.d) {
    reloader({
        watchModules: true,
        onReload: function () {
            app.listen(port);
            monitoring.listen(mon_port);
        }});
} else {
    app.listen(port);
    monitoring.listen(mon_port);
}
