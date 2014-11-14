
/**
 * Module dependencies.
 */

var extend = require('extend');
var time = require('unix-time');

/**
 * Map identify.
 *
 * https://www.klaviyo.com/docs#people-special
 *
 * @param {Identify} identify
 * @return {Object}
 * @api private
 */

exports.identify = function(identify){
  return {
    token: this.settings.apiKey,
    properties: traits(identify)
  };
};

/**
 * Map track.
 *
 * Klavioy's special properties, apparently undocumented :(
 *
 * @param {Track} track
 * @return {Object}
 * @api private
 */

exports.track = function(track){
  return {
    token: this.settings.apiKey,
    event: track.event(),
    properties: properties(track),
    time: time(track.timestamp()),
    customer_properties: {
      $id: track.userId() || track.sessionId(),
      $email: track.email()
    }
  };
};

/**
 * Format track properties.
 *
 * @param {Track} track
 * @return {Object}
 * @api private
 */

function properties(track){
  return extend(track.properties(), {
    value: track.revenue()
  });
}

/**
 * Format traits.
 *
 * @param {Identify} identify
 * @return {Object}
 * @api private
 */

function traits(identify){
  var traits = identify.traits();
  return extend(traits, {
    $id: identify.userId() || identify.sessionId(),
    $email: identify.email(),
    $first_name: identify.firstName(),
    $last_name: identify.lastName(),
    $phone_number: identify.phone(),
    $title: identify.proxy('traits.title'),
    $organization: identify.proxy('traits.organization'),
    $company: identify.proxy('traits.company')
  });
}
