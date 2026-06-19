'use strict';

const { EventEmitter } = require('events');

class BrowserEventStreamer {
  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
  }

  publish(type, payload = {}) {
    const event = {
      type,
      payload,
      createdAt: new Date().toISOString()
    };
    this.emitter.emit('event', event);
    return event;
  }

  attach(req, res, { store, userId = 'local-user' } = {}) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const send = (event) => {
      if (event.payload?.userId && event.payload.userId !== userId) return;
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    send({
      type: 'browser.connected',
      createdAt: new Date().toISOString(),
      payload: {
        userId,
        recentEvents: store?.listEvents?.({ userId, limit: 20 }) || []
      }
    });

    this.emitter.on('event', send);
    const keepAlive = setInterval(() => {
      res.write(`event: browser.ping\ndata: ${JSON.stringify({ createdAt: new Date().toISOString() })}\n\n`);
    }, 20_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      this.emitter.off('event', send);
    });
  }
}

module.exports = { BrowserEventStreamer };
