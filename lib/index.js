'use strict';

/**
 * Module dependencies.
 */

var integration = require('segmentio-integration');
var mapper = require('./mapper');
var Batch = require('batch');

/**
 * Expose `Klaviyo`
 */

var Klaviyo = module.exports = integration('Klaviyo')
  .endpoint('https://a.klaviyo.com/api')
  .ensure('settings.apiKey')
  .channels(['server'])
  .mapper(mapper)
  .retries(2);

/**
 * Identify.
 *
 * https://www.klaviyo.com/docs
 *
 * @param {Object} payload
 * @param {Object} settings
 * @param {Function} fn
 * @api public
 */

Klaviyo.prototype.identify = function(msg, fn) {
  var self = this;

  this
    .get('/identify')
    .query({ data: new Buffer(JSON.stringify(msg.peopleData)).toString('base64') })
    .end(function(err, res) {
      if (err) return fn(err);

      // 1 = success 0 = failure
      if (res.text !== '1') {
        err = self.error('bad response');
        return fn(err, res);
      }

      if (!msg.listData) return fn(null, res);

      // https://www.klaviyo.com/docs/api/lists
      // Add this person to a List
      self
        .post('/v1/list/' + msg.listId + '/members') // upsertion endpoint
        .type('form')
        .send(msg.listData)
        .end(fn);
    });
};

/**
 * Track.
 *
 * https://www.klaviyo.com/docs
 *
 * @param {Object} payload
 * @param {Object} settings
 * @param {Function} fn
 * @api private
 */

Klaviyo.prototype.track = request('/track');

/**
 * Completed Order.
 *
 * https://www.klaviyo.com/docs
 *
 * @param {Object} payload
 * @param {Object} settings
 * @param {Function} fn
 * @api private
 */

Klaviyo.prototype.completedOrder = function(track, fn) {
  var payload = mapper.completedOrder(track, this.settings);
  var batch = new Batch();
  var self = this;

  batch.throws(true);

  this
    .get('/track')
    .query({ data: new Buffer(JSON.stringify(payload.order)).toString('base64') })
    .end(function(err) {
      if (err) return fn(err);

      payload.products.forEach(function(product) {
        batch.push(function(done) {
          self
            .get('/track')
            .query({ data: new Buffer(JSON.stringify(product)).toString('base64') })
            .end(self.handle(done));
        });
      });

      batch.end(fn);
    });
};

/**
 * Check klaviyo's request.
 *
 * @param {Function} fn
 * @api private
 */

Klaviyo.prototype.check = function(fn) {
  var self = this;
  return this.handle(function(err, res) {
    if (err) return fn(err);
    if (res.text !== '1') err = self.error('bad response');
    return fn(err, res);
  });
};

/**
 * Create request for `path`.
 *
 * @param {String} path
 * @return {Function}
 * @api private
 */

function request(path) {
  return function(payload, fn) {
    payload = JSON.stringify(payload);
    payload = new Buffer(payload).toString('base64');
    return this
      .get(path)
      .query({ data: payload })
      .end(this.check(fn));
  };
}
