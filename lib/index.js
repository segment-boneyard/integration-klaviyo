
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
    .end(function(err, res){
      if (err) return fn(err);

      // 1 = success 0 = failure
      if (res.text != '1') {
        err = self.error('bad response');
        return fn(err, res);
      }

      if (!msg.listData) return fn(null, res);

      // https://www.klaviyo.com/docs/api/lists
      // Check if this person is in target list already
      self
        .get('/v1/list/' + msg.listId + '/members') // endpoint
        .query({ api_key: msg.listData.api_key, email: msg.listData.email })
        .end(function(err, res) {
          if (err) return fn(err);
          if (res.body.data.length === 0) {
            // user not in list. add.
            return self
              .post('/v1/list/' + msg.listId + '/members') // upsertion endpoint
              .type('form')
              .send(msg.listData)
              .end(fn);
          }
          // if no error, user already exists, bail
          return fn(err);
        });
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

Klaviyo.prototype.track = function(track, fn) {
  var self = this;
  this
    .get('/track')
    .query({ data: new Buffer(JSON.stringify(track)).toString('base64') })
    .end(this.handle(function(err, res){
      if (err) return fn(err);
      if (res.text != '1') err = self.error('bad response');
      return fn(err, res);
    }));
}

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
    .query({ data: new Buffer(JSON.stringify(payload.order)).toString('base64') })
    .end(function(err){
      if (err) return fn(err);

      payload.products.forEach(function(product){
        batch.push(function(done){
          self
            .get('/track')
            .query({ data: new Buffer(JSON.stringify(product)).toString('base64') })
            .end(self.handle(done));
        });
      })

      batch.end(fn);
    });
};
