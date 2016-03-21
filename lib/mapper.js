
/**
 * Module dependencies.
 */

var extend = require('extend');
var time = require('unix-time');
var Track = require('segmentio-facade').Track;
var reject = require('reject');

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
  var opts = identify.options(this.name);
  var msg = {
    peopleData: {
      token: this.settings.apiKey,
      properties: traits(identify)
    }
  };

  // email, listId, and api_key all required
  if (opts.listId && identify.email() && this.settings.privateKey) {
    msg.listId = opts.listId;
    msg.listData = {
      email: identify.email(),
      api_key: this.settings.privateKey,
      confirm_optin: opts.confirmOptin != undefined ? opts.confirmOptin : this.settings.confirmOptin // default setting is true, can be overriden per event via options
    };
  }

  return msg;
};

/**
 * Map track.
 *
 * Klaviyo's special properties, apparently undocumented :(
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
 * Map Completed Order
 *
 * Docs: http://docs.klaviyo.com/article/60-ecommerce-integrating-a-custom-cart
 *
 * @param {Track} track
 * @return {Object} Returns an object with two properties: .order (Object) and .products (Object[]). Each individual object should be sent in its own call to Klaviyo's API.
 * @api private
 */

exports.completedOrder = function(track, settings){
  var products = track.products();
  var categories = formatCategories(products);
  var productNames = formatNames(products);
  var items = formatItems(products);
  var payloads = {};

  payloads.order = {
    token: settings.apiKey,
    event: 'Placed Order',
    time: time(track.timestamp())
  };

  payloads.order.customer_properties = {
    $id: track.userId() || track.sessionId()
  };

  payloads.order.properties = {
    $event_id: track.orderId(),
    $value: track.revenue(),
    Categories: categories,
    'Item Names': productNames,
    'Items': items
  };

  payloads.products = products.map(function(item){
    var product = new Track({ properties: item });
    var productPayload = {
      token: settings.apiKey,
      event: 'Ordered Product',
      time: time(track.timestamp())
    };
    productPayload.customer_properties = {
      $id: track.userId() || track.sessionId()
    };
    productPayload.properties = {
      $event_id: product.id() || track.orderId() + '_' + product.sku(),
      $value: product.price(),
      Name: product.name(),
      Quantity: product.quantity(),
      "Product Categories": [product.category()]
    };
    if (product.proxy('properties.productUrl')) productPayload.properties['Product URL'] = product.proxy('properties.productUrl');
    if (product.proxy('properties.imageUrl')) productPayload.properties['Image URL'] = product.proxy('properties.imageUrl');

    return productPayload;
  });

  return payloads;
}

/**
 * Format categories of products.
 *
 * @param {Array} products
 * @return {Array}
 * @api private
 */

function formatCategories(products){
  var categories = products.map(function(item){
    var product = new Track({ properties: item });
    return product.category();
  });
  return categories;
}

/**
 * Format names of products.
 *
 * @param {Array} products
 * @return {Array}
 * @api private
 */

function formatNames(products){
  var names = products.map(function(item){
    var product = new Track({ properties: item });
    return product.name();
  });
  return names;
}

/**
 * Format products array.
 *
 * @param {Array} products
 * @return {Array}
 * @api private
 */

function formatItems(products){
  var items = products.map(function(item){
    var product = new Track({ properties: item });
    var payload = {};
    payload.SKU = product.sku();
    payload.Name = product.name();
    payload.Quantity = product.quantity();
    payload['Item Price'] = product.price();
    payload['Row Total'] = product.price();
    payload.Categories = [product.category()];
    if (product.proxy('properties.productUrl')) payload['Product URL'] = product.proxy('properties.productUrl');
    if (product.proxy('properties.imageUrl')) payload['Image URL'] = product.proxy('properties.imageUrl');
    return payload;
  });
  return items;
}

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
 * https://www.klaviyo.com/docs/api/people
 * @param {Identify} identify
 * @return {Object}
 * @api private
 */

function traits(identify){
  var traits = identify.traits();
  // why are we extending and not removing duplicate traits here?
  return reject(extend(traits, {
    $id: identify.userId() || identify.sessionId(),
    $email: identify.email(),
    $first_name: identify.firstName(),
    $last_name: identify.lastName(),
    $phone_number: identify.phone(),
    $title: identify.proxy('traits.title') || identify.position(),
    $organization: identify.proxy('traits.organization'),
    $city: identify.city(),
    $region: identify.region() || identify.state(),
    $country: identify.country(),
    $timezone: identify.timezone(),
    $zip: identify.zip()
  }));
}
