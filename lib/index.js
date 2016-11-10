
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

Klaviyo.prototype.identify = function(mapped, fn) {
  var self = this;

  if (!mapped.listId) {
    return this._identify(mapped.peopleData, fn)
  }

  var key = [this.settings.apiKey, mapped.peopleData.$id].join(':');
  this.lock(key, function() {
    self._addToList(mapped.listId, mapped.listData, function(err, res) {
      self.unlock(key, function() {
        if (err) return fn(err);
        self._identify(mapped.peopleData, fn)
      });
    });
  });
};

/**
 * Add to List.
 *
 * https://www.klaviyo.com/docs
 *
 * @param {Object} listData
 * @param {Object} settings
 * @param {Function} fn
 * @api public
 */

Klaviyo.prototype._addToList = function(id, data, fn) {
  this
    .post('/v1/list/' + id + '/members') // upsertion endpoint
    .type('form')
    .send(data)
    .end(fn);
};

/**
 * /identify.
 *
 * https://www.klaviyo.com/docs
 *
 * @param {Object} peopleData
 * @param {Object} settings
 * @param {Function} fn
 * @api public
 */

Klaviyo.prototype._identify = function(data, fn) {
  var self = this;
  this
    .get('/identify')
    .query({ data: encode(data) })
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
