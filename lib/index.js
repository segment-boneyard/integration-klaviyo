
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
  // add to list. this call will also create or update new/existing users
  // basically a superset of the identify call
  if (data.listId && data.email && data.apiKey) {
    // check if the subscriber already exists and is suppressed
    // if suppressed, then a separate subscribe endpoint is needed
    data.profileId = this._getProfileId(data, fn);
    var consent = this._getProfile(data, fn);
    if (consent) {
      this._subscribeToList(data, fn);
    }
    // regardless of existing or suppressed status, always add to list the regular way
    return this._addToList(data, fn);
  }

  // otherwise just identify (update properties for userid//email) with write key
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
      properties: JSON.stringify(data.properties)
    })
    .end(fn);
};

/**
 * Subscribe to list.
 * This is needed in order for the profile to be un-suppressed if suppressed
 *
 * https://developers.klaviyo.com/en/v1-2/reference/subscribe
 *
 * @param {Object} data
 * @param {Function} fn
 * @api public
 */

Klaviyo.prototype._subscribeToList = function(data, fn) {
  this
    .post('/v2/list/' + data.listId + '/subscribe')
    .type('form')
    .send({
      email: data.email,
      api_key: data.apiKey,
      confirm_optin: data.confirmOptIn,
      properties: JSON.stringify(data.properties)
    })
    .end(fn);
};

/**
 * Find a profile
 *
 *  https://developers.klaviyo.com/en/v1-2/reference/get-profile-id
 *
 * @param {Object} data
 * @param {Function} fn
 * @api public
 */

Klaviyo.prototype._getProfileId = function(data, fn) {
  return this
    .post('/v2/people/search')
    .type('form')
    .send({
      email: data.email,
      api_key: data.apiKey
    })
    .end(fn);
};

/**
 * Get profile
 *
 *  https://developers.klaviyo.com/en/v1-2/reference/get-profile
 *
 * @param {Object} data
 * @param {Function} fn
 * @api public
 */

Klaviyo.prototype._getProfile = function(data, fn) {
  let profile = this
    .post('/v1/person/' + data.profileId)
    .type('form')
    .send({
      api_key: data.apiKey
    })
    .end(fn);

  return profile.data.$consent;
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
            .end(done);
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
  return function(err, res){
    if (err) return fn(err);
    if (res.text != '1') err = self.error('bad response');
    return fn(err, res);
  };
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
