var dgram = require("dgram");
var events = require("events");
var sys = require('util');
var NetflowPacket = require("Netflow/lib/NetFlowPacket");

var Netflow = module.exports = function () {
    "use strict";
    var v9Templates = [],
        eventContext = this,
        it = 0;
    this.server = dgram.createSocket("udp4");
    events.EventEmitter.call(this);
    this.server.on("message", function (mesg, rinfo) {
        try {
            var newPacket = new NetflowPacket(mesg);
            if ((newPacket.header.version) === 9) {
                newPacket.v9Flowsets.forEach(function (v9Flowset) {
                    if (v9Flowset.flowset_id === 0) {
                        v9Flowset.templates.forEach(function (template) {
                            for (it = 0; it < v9Templates.length; it++) {
                                if (v9Templates[it].id === template.id) {
                                    v9Templates[it] = template;
                                    return;
                                }
                            }
                            v9Templates.push(template);
                        });
                    }
                });
            }
            this.emit.call(eventContext, "packet", newPacket, rinfo);
        } catch (err) {
            this.emit.call(eventContext, "error", err);
        }
    });
    this.server.on("listening", this.emit.bind(this, "listening"));
    this.listen = function (port) {
        this.server.bind(port);
    };
};
sys.inherits(Netflow, events.EventEmitter);
