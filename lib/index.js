
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
 * Ensure for userId if anonymous fallback is false
 */

Klaviyo.ensure(function(msg, settings) {
  if (settings.sendAnonymous) return; // if true, proceed in all cases
  if (msg.userId()) return; // otherwise, only pass for msgs w/ userId
  return this.reject('userId is required if you disable sending anonymous data');
});

/**
 * Identify.
 *
 * https://www.klaviyo.com/docs
 *
 * @param {Object} data
 * @param {Object} settings
 * @param {Function} fn
 * @api public
 */

Klaviyo.prototype.identify = function(data, fn) {
  // add to list will also update existing members' traits,
  // so no need to use identify endpoint.
  // if they are not already members we need to "identify" to enrich profile
  // with traits
  var self = this;
  if (data.listId && data.email && data.apiKey) {
    return this._addToList(data, function(err, res) {
      if (err) return fn(err);
      if (res.body.already_member === false) return self._identify(data, fn);
      return fn(err, res);
    });
  }

  // if no list id, just identify (update properties for userid//email) with write key
  this._identify(data, fn);
};

/**
 * Add to List.
 *
 * https://www.klaviyo.com/docs
 *
 * @param {Object} data
 * @param {Object} settings
 * @param {Function} fn
 * @api public
 */

Klaviyo.prototype._addToList = function(data, fn) {
  this
    .post('/v1/list/' + data.listId + '/members') // upsertion endpoint
    .type('form')
    .send({
      email: data.email,
      api_key: data.apiKey,
      confirm_optin: data.confirmOptIn,
      properties: data.properties
    })
    .end(fn);
};

/**
 * /identify.
 *
 * https://www.klaviyo.com/docs
 *
 * @param {Object} data
 * @param {Object} settings
 * @param {Function} fn
 * @api public
 */

Klaviyo.prototype._identify = function(data, fn) {
  this
    .get('/identify')
    .query({
      data: encode({
        token: data.token,
        properties: data.properties
      })
    })
    .end(this.check(fn));
}

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

Klaviyo.prototype.track = function(payload, fn) {
  return this
    .get('/track')
    .query({ data: encode(payload) })
    .end(this.check(fn));
};

/**
 * Order Completed.
 *
 * https://www.klaviyo.com/docs
 *
 * @param {Object} payload
 * @param {Object} settings
 * @param {Function} fn
 * @api private
 */

Klaviyo.prototype.orderCompleted = function(track, fn) {
  var payload = mapper.orderCompleted(track, this.settings);
  var batch = new Batch();
  var self = this;

  batch.throws(true);

  this
    .get('/track')
    .query({ data: encode(payload.order) })
    .end(function(err){
      if (err) return fn(err);

      payload.products.forEach(function(product){
        batch.push(function(done){
          self
            .get('/track')
            .query({ data: encode(product) })
            .end(self.handle(done));
        });
      })

      batch.end(fn);
    });
};

/**
 * Check klaviyo's request.
 *
 * @param {Function} fn
 * @api private
 */

Klaviyo.prototype.check = function(fn){
  var self = this;
  return this.handle(function(err, res){
    if (err) return fn(err);
    if (res.text != '1') err = self.error('bad response');
    return fn(err, res);
  });
};

/**
 * Encode.
 *
 * @param {Object} data
 * @return {String} data
 */

function encode(data) {
  return new Buffer(JSON.stringify(data)).toString('base64');
}
